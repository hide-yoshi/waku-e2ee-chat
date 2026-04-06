import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, Contact, WireMessage, PreKeyBundle } from '../types';
import { WakuTransport } from '../lib/waku';
import {
  generateECDHKeyPair,
  exportPublicKey,
  importPublicKey,
  exportKey,
  importAESKey,
  encrypt,
  decrypt,
  x3dhInitiate,
  x3dhRespond,
  getConversationId,
} from '../lib/crypto';
import { signECDHKey } from '../lib/wallet';
import { db } from '../lib/db';

interface Identity {
  address: string;
  keyPair: CryptoKeyPair;
  publicKeyJwk: JsonWebKey;
  signature: string;
}

interface KeyBundle {
  identityKeyPair: CryptoKeyPair;
  signedPreKeyPair: CryptoKeyPair;
  oneTimePreKeyPairs: CryptoKeyPair[];
}

export function useChat(identity: Identity) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [currentContact, setCurrentContact] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [wakuReady, setWakuReady] = useState(false);

  const wakuRef = useRef<WakuTransport | null>(null);
  const keyBundleRef = useRef<KeyBundle | null>(null);
  const currentContactRef = useRef<string | null>(null);
  const seenMessages = useRef(new Set<string>());

  useEffect(() => {
    currentContactRef.current = currentContact;
  }, [currentContact]);

  // Load contacts from DB
  useEffect(() => {
    db.contacts.toArray().then(setContacts);
  }, []);

  // Load messages when switching conversation
  useEffect(() => {
    if (!currentContact) {
      setMessages([]);
      return;
    }
    const convId = getConversationId(identity.address, currentContact);
    db.messages
      .where('conversationId')
      .equals(convId)
      .sortBy('timestamp')
      .then(setMessages);
  }, [currentContact, identity.address]);

  const isNewMessage = useCallback((messageId: string): boolean => {
    if (seenMessages.current.has(messageId)) return false;
    seenMessages.current.add(messageId);
    if (seenMessages.current.size > 1000) {
      const arr = Array.from(seenMessages.current);
      seenMessages.current = new Set(arr.slice(arr.length - 500));
    }
    return true;
  }, []);

  // Handle incoming wire messages
  const handleMessage = useCallback(
    async (msg: WireMessage) => {
      if (msg.senderAddress === identity.address) return;
      if (msg.messageId && !isNewMessage(msg.messageId)) return;

      if (msg.kind === 'x3dh-init') {
        // X3DH initial message: derive shared key and save contact
        await handleX3DHInit(msg);
      } else if (msg.kind === 'chat') {
        await handleChatMessage(msg);
      }
    },
    [identity.address, isNewMessage]
  );

  async function handleX3DHInit(msg: WireMessage) {
    if (!keyBundleRef.current || !msg.ephemeralKey) return;

    const kb = keyBundleRef.current;
    const aliceEphemeralPublic = await importPublicKey(msg.ephemeralKey);
    const aliceIdentityPublic = await importPublicKey(
      JSON.parse(msg.payload) // payload contains alice's identity public key for x3dh-init
    );

    let opkPrivate: CryptoKey | undefined;
    if (msg.usedOneTimeKeyIndex !== undefined && kb.oneTimePreKeyPairs[msg.usedOneTimeKeyIndex]) {
      opkPrivate = kb.oneTimePreKeyPairs[msg.usedOneTimeKeyIndex].privateKey;
    }

    const sharedKey = await x3dhRespond(
      kb.identityKeyPair.privateKey,
      kb.signedPreKeyPair.privateKey,
      aliceIdentityPublic,
      aliceEphemeralPublic,
      opkPrivate
    );

    const sharedKeyStr = await exportKey(sharedKey);
    const identityKeyJwk = await exportPublicKey(aliceIdentityPublic);

    const contact: Contact = {
      address: msg.senderAddress,
      identityKey: identityKeyJwk,
      sharedKey: sharedKeyStr,
      addedAt: Date.now(),
    };

    await db.contacts.put(contact);
    setContacts((prev) => {
      const exists = prev.findIndex((c) => c.address === msg.senderAddress);
      if (exists >= 0) {
        const updated = [...prev];
        updated[exists] = contact;
        return updated;
      }
      return [...prev, contact];
    });

    // Now decrypt the actual message content if present

    // Subscribe to conversation
    const convId = getConversationId(identity.address, msg.senderAddress);
    wakuRef.current?.subscribeToChat(convId, handleMessage);
  }

  async function handleChatMessage(msg: WireMessage) {
    const contact = await db.contacts.get(msg.senderAddress);
    if (!contact) return;

    const sharedKey = await importAESKey(contact.sharedKey);
    const plaintext = await decrypt(sharedKey, msg.iv, msg.payload);
    const parsed = JSON.parse(plaintext);

    const chatMsg: ChatMessage = {
      id: msg.messageId,
      conversationId: msg.conversationId,
      senderAddress: msg.senderAddress,
      type: 'text',
      content: parsed.content,
      timestamp: msg.timestamp,
    };

    const existing = await db.messages.get(chatMsg.id);
    if (!existing) {
      await db.messages.add(chatMsg);
    }

    if (currentContactRef.current === msg.senderAddress) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === chatMsg.id)) return prev;
        return [...prev, chatMsg].sort((a, b) => a.timestamp - b.timestamp);
      });
    }
  }

  // Initialize Waku + generate X3DH key bundle
  useEffect(() => {
    let cancelled = false;

    async function setup() {
      // Generate X3DH key bundle
      const identityKeyPair = { publicKey: identity.keyPair.publicKey, privateKey: identity.keyPair.privateKey };
      const signedPreKeyPair = await generateECDHKeyPair();
      const oneTimePreKeyPairs: CryptoKeyPair[] = [];
      for (let i = 0; i < 5; i++) {
        oneTimePreKeyPairs.push(await generateECDHKeyPair());
      }

      keyBundleRef.current = { identityKeyPair, signedPreKeyPair, oneTimePreKeyPairs };

      // Build pre-key bundle to publish
      const spkJwk = await exportPublicKey(signedPreKeyPair.publicKey);
      const spkSig = await signECDHKey(spkJwk);
      const opkJwks: JsonWebKey[] = [];
      for (const kp of oneTimePreKeyPairs) {
        opkJwks.push(await exportPublicKey(kp.publicKey));
      }

      const bundle: PreKeyBundle = {
        identityKey: identity.publicKeyJwk,
        signedPreKey: spkJwk,
        signedPreKeySig: spkSig,
        oneTimePreKeys: opkJwks,
        address: identity.address,
        timestamp: Date.now(),
      };

      // Init Waku
      const waku = new WakuTransport();
      wakuRef.current = waku;
      await waku.ready;

      if (cancelled) return;
      setWakuReady(true);

      // Publish pre-key bundle (and re-publish periodically for Filter-based discovery)
      await waku.publishPreKeyBundle(bundle);
      const republishInterval = setInterval(() => {
        if (!cancelled) {
          waku.publishPreKeyBundle({ ...bundle, timestamp: Date.now() });
        }
      }, 10_000);

      // Subscribe to inbox for incoming X3DH init messages
      await waku.subscribeToInbox(identity.address, handleMessage);

      // Check inbox for missed messages
      const inboxMsgs = await waku.fetchInbox(identity.address);
      for (const msg of inboxMsgs) {
        await handleMessage(msg);
      }

      // Subscribe to existing contact conversations
      const savedContacts = await db.contacts.toArray();
      for (const contact of savedContacts) {
        const convId = getConversationId(identity.address, contact.address);
        await waku.subscribeToChat(convId, handleMessage);

        // Fetch missed chat messages
        const history = await waku.fetchChatHistory(convId);
        for (const msg of history) {
          await handleMessage(msg);
        }
      }
    }

    let republishInterval: ReturnType<typeof setInterval> | undefined;
    setup().then(() => {
      // republishInterval is set inside setup, but we capture it for cleanup
    });
    return () => {
      cancelled = true;
      wakuRef.current?.destroy();
    };
  }, [identity, handleMessage]);

  // Add contact by address: fetch their pre-key bundle, perform X3DH
  const addContact = useCallback(
    async (peerAddress: string): Promise<boolean> => {
      const waku = wakuRef.current;
      if (!waku || !keyBundleRef.current) return false;

      // Check if already a contact
      const existing = await db.contacts.get(peerAddress);
      if (existing) return true;

      // Fetch their pre-key bundle from Waku Store
      const bundle = await waku.fetchPreKeyBundle(peerAddress);
      if (!bundle) return false;

      // Perform X3DH as initiator
      const ephemeralKeyPair = await generateECDHKeyPair();
      const bobIK = await importPublicKey(bundle.identityKey);
      const bobSPK = await importPublicKey(bundle.signedPreKey);

      let bobOPK: CryptoKey | undefined;
      let opkIndex: number | undefined;
      if (bundle.oneTimePreKeys.length > 0) {
        opkIndex = 0;
        bobOPK = await importPublicKey(bundle.oneTimePreKeys[0]);
      }

      const sharedKey = await x3dhInitiate(
        keyBundleRef.current.identityKeyPair.privateKey,
        ephemeralKeyPair.privateKey,
        bobIK,
        bobSPK,
        bobOPK
      );

      const sharedKeyStr = await exportKey(sharedKey);
      const ephemeralKeyJwk = await exportPublicKey(ephemeralKeyPair.publicKey);

      // Save contact
      const contact: Contact = {
        address: peerAddress,
        identityKey: bundle.identityKey,
        sharedKey: sharedKeyStr,
        addedAt: Date.now(),
      };
      await db.contacts.put(contact);
      setContacts((prev) => [...prev, contact]);

      // Send X3DH init message to their inbox so they can derive the same shared key
      const convId = getConversationId(identity.address, peerAddress);
      const initMsg: WireMessage = {
        kind: 'x3dh-init',
        messageId: crypto.randomUUID(),
        conversationId: convId,
        payload: JSON.stringify(identity.publicKeyJwk), // our identity public key
        iv: '',
        senderAddress: identity.address,
        ephemeralKey: ephemeralKeyJwk,
        usedOneTimeKeyIndex: opkIndex,
        timestamp: Date.now(),
      };
      await waku.sendToInbox(peerAddress, initMsg);

      // Subscribe to conversation
      await waku.subscribeToChat(convId, handleMessage);

      return true;
    },
    [identity, handleMessage]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!currentContact) return;
      const waku = wakuRef.current;
      if (!waku) return;

      const contact = await db.contacts.get(currentContact);
      if (!contact) return;

      const sharedKey = await importAESKey(contact.sharedKey);
      const plaintext = JSON.stringify({ content });
      const { iv, ciphertext } = await encrypt(sharedKey, plaintext);

      const convId = getConversationId(identity.address, currentContact);
      const messageId = crypto.randomUUID();

      const wireMsg: WireMessage = {
        kind: 'chat',
        messageId,
        conversationId: convId,
        payload: ciphertext,
        iv,
        senderAddress: identity.address,
        timestamp: Date.now(),
      };

      seenMessages.current.add(messageId);
      await waku.sendMessage(convId, wireMsg);

      const chatMsg: ChatMessage = {
        id: messageId,
        conversationId: convId,
        senderAddress: identity.address,
        type: 'text',
        content,
        timestamp: wireMsg.timestamp,
      };
      await db.messages.add(chatMsg);
      setMessages((prev) => [...prev, chatMsg]);
    },
    [currentContact, identity.address]
  );

  return {
    contacts,
    currentContact,
    setCurrentContact,
    messages,
    wakuReady,
    addContact,
    sendMessage,
  };
}
