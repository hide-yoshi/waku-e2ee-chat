import { createLightNode, type LightNode } from '@waku/sdk';
import { Protocols } from '@waku/interfaces';
import type { IEncoder, IDecoder, IDecodedMessage } from '@waku/interfaces';
import type { WireMessage, PreKeyBundle } from '../types';

const APP_NAME = 'p2p-e2ee-chat';
const APP_VERSION = '1';

function chatTopic(conversationId: string): string {
  return `/${APP_NAME}/${APP_VERSION}/chat-${conversationId}/proto`;
}

function keysTopic(address: string): string {
  return `/${APP_NAME}/${APP_VERSION}/keys-${address.toLowerCase()}/proto`;
}

function inboxTopic(address: string): string {
  return `/${APP_NAME}/${APP_VERSION}/inbox-${address.toLowerCase()}/proto`;
}

export type MessageHandler = (msg: WireMessage) => void;

export class WakuTransport {
  private node: LightNode | null = null;
  private codecs = new Map<string, { encoder: IEncoder; decoder: IDecoder<IDecodedMessage> }>();
  private readyPromise: Promise<void>;
  private _ready = false;

  constructor() {
    this.readyPromise = this.init();
  }

  private async init() {
    try {
      console.log('[waku] creating light node...');
      this.node = await createLightNode({ defaultBootstrap: true });
      await this.node.start();
      console.log('[waku] node started, waiting for remote peers...');
      // Wait for at least Filter + LightPush; Store is best-effort
      await this.node.waitForPeers(
        [Protocols.Filter, Protocols.LightPush],
        60_000
      );
      // Try to wait for Store separately, but don't fail if unavailable
      try {
        await this.node.waitForPeers([Protocols.Store], 10_000);
        console.log('[waku] store peer available');
      } catch {
        console.log('[waku] no store peer available (store queries will be skipped)');
      }
      this._ready = true;
      console.log('[waku] connected to remote peers');
    } catch (err) {
      console.error('[waku] init failed:', err);
    }
  }

  get ready(): Promise<void> {
    return this.readyPromise;
  }

  get isReady(): boolean {
    return this._ready;
  }

  private getOrCreateCodecs(topic: string): { encoder: IEncoder; decoder: IDecoder<IDecodedMessage> } {
    let c = this.codecs.get(topic);
    if (c) return c;
    if (!this.node) throw new Error('Node not initialized');
    const encoder = this.node.createEncoder({ contentTopic: topic });
    const decoder = this.node.createDecoder({ contentTopic: topic });
    c = { encoder, decoder };
    this.codecs.set(topic, c);
    return c;
  }

  // --- Publish / Subscribe ---

  async publish(topic: string, data: unknown): Promise<void> {
    if (!this.node?.lightPush) return;
    await this.readyPromise;
    const { encoder } = this.getOrCreateCodecs(topic);
    const payload = new TextEncoder().encode(JSON.stringify(data));
    try {
      await this.node.lightPush.send(encoder, { payload });
    } catch (err) {
      console.error('[waku] publish failed:', err);
    }
  }

  async subscribe(topic: string, handler: (data: unknown) => void): Promise<void> {
    if (!this.node?.filter) return;
    await this.readyPromise;
    const { decoder } = this.getOrCreateCodecs(topic);
    try {
      await this.node.filter.subscribe([decoder], (wakuMsg) => {
        console.log('[waku] filter received message on topic', topic);
        if (!wakuMsg.payload) return;
        try {
          const data = JSON.parse(new TextDecoder().decode(wakuMsg.payload));
          handler(data);
        } catch {}
      });
      console.log('[waku] subscribed to', topic);
    } catch (err) {
      console.error('[waku] subscribe failed:', err);
    }
  }

  async queryHistory<T = unknown>(topic: string): Promise<T[]> {
    if (!this.node?.store) return [];
    await this.readyPromise;
    const { decoder } = this.getOrCreateCodecs(topic);
    const results: T[] = [];
    try {
      for await (const page of this.node.store.queryGenerator([decoder])) {
        for (const promiseOrMsg of page) {
          const wakuMsg = await promiseOrMsg;
          if (!wakuMsg?.payload) continue;
          try {
            const data = JSON.parse(new TextDecoder().decode(wakuMsg.payload));
            results.push(data as T);
          } catch {}
        }
      }
    } catch (err) {
      console.error('[waku] store query failed:', err);
    }
    return results;
  }

  // --- High-level API ---

  async publishPreKeyBundle(bundle: PreKeyBundle): Promise<void> {
    const topic = keysTopic(bundle.address);
    await this.publish(topic, bundle);
    console.log('[waku] published pre-key bundle for', bundle.address);
  }

  async fetchPreKeyBundle(address: string, timeoutMs = 90000): Promise<PreKeyBundle | null> {
    const topic = keysTopic(address);

    // Try store first
    const bundles = await this.queryHistory<PreKeyBundle>(topic);
    if (bundles.length > 0) {
      return bundles.sort((a, b) => b.timestamp - a.timestamp)[0];
    }

    // Store unavailable or empty: subscribe and wait for the bundle via Filter
    console.log('[waku] pre-key bundle not in store, subscribing and waiting...');
    return new Promise<PreKeyBundle | null>((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      }, timeoutMs);

      this.subscribe(topic, (data) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(data as PreKeyBundle);
        }
      });
    });
  }

  async sendMessage(conversationId: string, msg: WireMessage): Promise<void> {
    const topic = chatTopic(conversationId);
    console.log('[waku] sendMessage to topic', topic, 'kind:', msg.kind);
    await this.publish(topic, msg);
  }

  async sendToInbox(address: string, msg: WireMessage): Promise<void> {
    const topic = inboxTopic(address);
    console.log('[waku] sendToInbox', address, 'topic', topic, 'kind:', msg.kind);
    await this.publish(topic, msg);
  }

  async subscribeToChat(conversationId: string, handler: MessageHandler): Promise<void> {
    const topic = chatTopic(conversationId);
    await this.subscribe(topic, (data) => handler(data as WireMessage));
  }

  async subscribeToInbox(address: string, handler: MessageHandler): Promise<void> {
    const topic = inboxTopic(address);
    await this.subscribe(topic, (data) => handler(data as WireMessage));
  }

  async fetchChatHistory(conversationId: string): Promise<WireMessage[]> {
    const topic = chatTopic(conversationId);
    return this.queryHistory<WireMessage>(topic);
  }

  async fetchInbox(address: string): Promise<WireMessage[]> {
    const topic = inboxTopic(address);
    return this.queryHistory<WireMessage>(topic);
  }

  async destroy(): Promise<void> {
    if (this.node) {
      await this.node.stop();
      this.node = null;
      this._ready = false;
    }
  }
}
