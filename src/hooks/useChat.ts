import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, Room, WireMessage, Peer } from '../types';
import { PeerManager } from '../lib/peer';
import {
  generateGroupKey,
  exportKey,
  importGroupKey,
  encrypt,
  decrypt,
  wrapGroupKey,
  unwrapGroupKey,
} from '../lib/crypto';
import { db } from '../lib/db';
import { uploadFileEncrypted } from '../lib/ipfs';

interface UseChatOptions {
  address: string;
  keyPair: CryptoKeyPair;
  publicKeyJwk: JsonWebKey;
  signature: string;
}

export function useChat({ address, keyPair, publicKeyJwk, signature }: UseChatOptions) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
  const peerManagerRef = useRef<PeerManager | null>(null);
  const roomsRef = useRef<Room[]>([]);

  // Keep roomsRef in sync
  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  // Load rooms from DB on mount
  useEffect(() => {
    db.rooms.toArray().then(setRooms);
  }, []);

  // Load messages when room changes
  useEffect(() => {
    if (!currentRoomId) {
      setMessages([]);
      return;
    }
    db.messages
      .where('roomId')
      .equals(currentRoomId)
      .sortBy('timestamp')
      .then(setMessages);
  }, [currentRoomId]);

  const handleWireMessage = useCallback(
    async (msg: WireMessage) => {
      const room = roomsRef.current.find((r) => r.id === msg.roomId);
      if (!room) return;

      const groupKey = await importGroupKey(room.groupKey);

      if (msg.kind === 'chat' || msg.kind === 'file-meta') {
        const plaintext = await decrypt(groupKey, msg.iv, msg.payload);
        const parsed = JSON.parse(plaintext);
        const chatMsg: ChatMessage = {
          id: crypto.randomUUID(),
          roomId: msg.roomId,
          senderAddress: msg.senderAddress,
          type: msg.kind === 'chat' ? 'text' : 'file',
          content: parsed.content,
          fileName: parsed.fileName,
          fileSize: parsed.fileSize,
          fileCid: parsed.fileCid,
          timestamp: msg.timestamp,
        };

        await db.messages.add(chatMsg);
        if (msg.roomId === currentRoomId) {
          setMessages((prev) => [...prev, chatMsg]);
        }
      } else if (msg.kind === 'group-key') {
        // Received a wrapped group key from room creator
        const conn = peerManagerRef.current?.getConnection(msg.senderAddress);
        if (!conn?.sharedKey) return;
        const parsed = JSON.parse(msg.payload);
        const groupKey = await unwrapGroupKey(conn.sharedKey, parsed.iv, parsed.ciphertext);
        const groupKeyStr = await exportKey(groupKey);

        const newRoom: Room = {
          id: msg.roomId,
          name: parsed.roomName || msg.roomId.slice(0, 8),
          createdBy: msg.senderAddress,
          groupKey: groupKeyStr,
          members: parsed.members || [],
          createdAt: msg.timestamp,
        };
        await db.rooms.put(newRoom);
        setRooms((prev) => {
          const existing = prev.findIndex((r) => r.id === msg.roomId);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = newRoom;
            return updated;
          }
          return [...prev, newRoom];
        });
      }
    },
    [currentRoomId]
  );

  const initPeerManager = useCallback(() => {
    if (peerManagerRef.current) return peerManagerRef.current;

    const pm = new PeerManager(
      keyPair.privateKey,
      handleWireMessage,
      (addr) => setConnectedPeers((prev) => [...new Set([...prev, addr])]),
      (addr) => setConnectedPeers((prev) => prev.filter((a) => a !== addr))
    );
    peerManagerRef.current = pm;
    return pm;
  }, [keyPair.privateKey, handleWireMessage]);

  const createRoom = useCallback(
    async (name: string): Promise<Room> => {
      const groupKey = await generateGroupKey();
      const groupKeyStr = await exportKey(groupKey);
      const room: Room = {
        id: crypto.randomUUID(),
        name,
        createdBy: address,
        groupKey: groupKeyStr,
        members: [{ address, ecdhPublicKey: publicKeyJwk, signature }],
        createdAt: Date.now(),
      };
      await db.rooms.put(room);
      setRooms((prev) => [...prev, room]);
      return room;
    },
    [address, publicKeyJwk, signature]
  );

  const invitePeer = useCallback(
    async (roomId: string, peerAddress: string) => {
      const pm = peerManagerRef.current;
      if (!pm) return;

      const room = roomsRef.current.find((r) => r.id === roomId);
      if (!room) return;

      const conn = pm.getConnection(peerAddress);
      if (!conn?.sharedKey) return;

      const groupKey = await importGroupKey(room.groupKey);
      const wrapped = await wrapGroupKey(groupKey, conn.sharedKey);

      const wireMsg: WireMessage = {
        kind: 'group-key',
        roomId: room.id,
        payload: JSON.stringify({
          ...wrapped,
          roomName: room.name,
          members: room.members,
        }),
        iv: '',
        senderAddress: address,
        timestamp: Date.now(),
      };
      pm.send(peerAddress, wireMsg);

      // Add to members
      const newMember: Peer = {
        address: peerAddress,
        ecdhPublicKey: conn.ecdhPublicKey,
        signature: '',
      };
      const updatedRoom = {
        ...room,
        members: [...room.members, newMember],
      };
      await db.rooms.put(updatedRoom);
      setRooms((prev) => prev.map((r) => (r.id === roomId ? updatedRoom : r)));
    },
    [address]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!currentRoomId) return;
      const room = roomsRef.current.find((r) => r.id === currentRoomId);
      if (!room) return;

      const pm = peerManagerRef.current;
      if (!pm) return;

      const groupKey = await importGroupKey(room.groupKey);
      const plaintext = JSON.stringify({ content });
      const { iv, ciphertext } = await encrypt(groupKey, plaintext);

      const wireMsg: WireMessage = {
        kind: 'chat',
        roomId: currentRoomId,
        payload: ciphertext,
        iv,
        senderAddress: address,
        timestamp: Date.now(),
      };
      pm.broadcast(wireMsg);

      const chatMsg: ChatMessage = {
        id: crypto.randomUUID(),
        roomId: currentRoomId,
        senderAddress: address,
        type: 'text',
        content,
        timestamp: wireMsg.timestamp,
      };
      await db.messages.add(chatMsg);
      setMessages((prev) => [...prev, chatMsg]);
    },
    [currentRoomId, address]
  );

  const sendFile = useCallback(
    async (file: File) => {
      if (!currentRoomId) return;
      const room = roomsRef.current.find((r) => r.id === currentRoomId);
      if (!room) return;

      const pm = peerManagerRef.current;
      if (!pm) return;

      const groupKey = await importGroupKey(room.groupKey);
      const { cid, iv: fileIv } = await uploadFileEncrypted(file, groupKey);

      const meta = {
        content: `Sent file: ${file.name}`,
        fileName: file.name,
        fileSize: file.size,
        fileCid: cid,
        fileIv,
      };
      const plaintext = JSON.stringify(meta);
      const { iv, ciphertext } = await encrypt(groupKey, plaintext);

      const wireMsg: WireMessage = {
        kind: 'file-meta',
        roomId: currentRoomId,
        payload: ciphertext,
        iv,
        senderAddress: address,
        timestamp: Date.now(),
      };
      pm.broadcast(wireMsg);

      const chatMsg: ChatMessage = {
        id: crypto.randomUUID(),
        roomId: currentRoomId,
        senderAddress: address,
        type: 'file',
        content: meta.content,
        fileName: file.name,
        fileSize: file.size,
        fileCid: cid,
        timestamp: wireMsg.timestamp,
      };
      await db.messages.add(chatMsg);
      setMessages((prev) => [...prev, chatMsg]);
    },
    [currentRoomId, address]
  );

  return {
    rooms,
    currentRoomId,
    setCurrentRoomId,
    messages,
    connectedPeers,
    peerManager: peerManagerRef,
    initPeerManager,
    createRoom,
    invitePeer,
    sendMessage,
    sendFile,
  };
}
