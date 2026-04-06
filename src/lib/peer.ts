import SimplePeer from 'simple-peer';
import type { Instance } from 'simple-peer';
import type { PeerConnection, WireMessage } from '../types';
import { deriveSharedKey, importPublicKey } from './crypto';

type MessageHandler = (msg: WireMessage) => void;
type PeerEventHandler = (address: string) => void;

export class PeerManager {
  private connections: Map<string, PeerConnection> = new Map();
  private privateKey: CryptoKey;
  private onMessage: MessageHandler;
  private onPeerConnected: PeerEventHandler;
  private onPeerDisconnected: PeerEventHandler;

  constructor(
    privateKey: CryptoKey,
    onMessage: MessageHandler,
    onPeerConnected: PeerEventHandler,
    onPeerDisconnected: PeerEventHandler
  ) {
    this.privateKey = privateKey;
    this.onMessage = onMessage;
    this.onPeerConnected = onPeerConnected;
    this.onPeerDisconnected = onPeerDisconnected;
  }

  createOffer(address: string, ecdhPublicKey: JsonWebKey): Promise<SimplePeer.SignalData> {
    return this.createPeer(address, ecdhPublicKey, true);
  }

  createAnswer(address: string, ecdhPublicKey: JsonWebKey, offer: SimplePeer.SignalData): Promise<SimplePeer.SignalData> {
    return this.createPeer(address, ecdhPublicKey, false, offer);
  }

  private createPeer(
    address: string,
    ecdhPublicKey: JsonWebKey,
    initiator: boolean,
    offer?: SimplePeer.SignalData
  ): Promise<SimplePeer.SignalData> {
    return new Promise((resolve, reject) => {
      const peer = new SimplePeer({
        initiator,
        trickle: false,
      });

      const conn: PeerConnection = { address, peer, ecdhPublicKey };
      this.connections.set(address, conn);

      peer.on('signal', (data: SimplePeer.SignalData) => {
        resolve(data);
      });

      peer.on('connect', async () => {
        try {
          const importedKey = await importPublicKey(ecdhPublicKey);
          conn.sharedKey = await deriveSharedKey(this.privateKey, importedKey);
          this.onPeerConnected(address);
        } catch (err) {
          console.error('Failed to derive shared key:', err);
        }
      });

      peer.on('data', (raw: Uint8Array) => {
        try {
          const msg: WireMessage = JSON.parse(new TextDecoder().decode(raw));
          this.onMessage(msg);
        } catch (err) {
          console.error('Failed to parse message:', err);
        }
      });

      peer.on('close', () => {
        this.connections.delete(address);
        this.onPeerDisconnected(address);
      });

      peer.on('error', (err: Error) => {
        console.error(`Peer error (${address}):`, err);
        this.connections.delete(address);
        this.onPeerDisconnected(address);
        reject(err);
      });

      if (offer) {
        peer.signal(offer);
      }
    });
  }

  acceptSignal(address: string, signal: SimplePeer.SignalData) {
    const conn = this.connections.get(address);
    if (conn) {
      conn.peer.signal(signal);
    }
  }

  send(address: string, msg: WireMessage) {
    const conn = this.connections.get(address);
    if (conn?.peer.connected) {
      conn.peer.send(JSON.stringify(msg));
    }
  }

  broadcast(msg: WireMessage) {
    for (const conn of this.connections.values()) {
      if (conn.peer.connected) {
        conn.peer.send(JSON.stringify(msg));
      }
    }
  }

  getConnection(address: string): PeerConnection | undefined {
    return this.connections.get(address);
  }

  getConnectedPeers(): string[] {
    return Array.from(this.connections.entries())
      .filter(([_, conn]) => conn.peer.connected)
      .map(([addr]) => addr);
  }

  getPeer(address: string): Instance | undefined {
    return this.connections.get(address)?.peer;
  }

  destroyAll() {
    for (const conn of this.connections.values()) {
      conn.peer.destroy();
    }
    this.connections.clear();
  }

  destroy(address: string) {
    const conn = this.connections.get(address);
    if (conn) {
      conn.peer.destroy();
      this.connections.delete(address);
    }
  }
}
