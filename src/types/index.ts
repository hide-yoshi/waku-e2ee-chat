export interface Peer {
  address: string;
  ecdhPublicKey: JsonWebKey;
  signature: string; // wallet signature over ECDH public key
  displayName?: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderAddress: string;
  type: 'text' | 'file';
  content: string; // text content or file metadata JSON
  fileName?: string;
  fileSize?: number;
  fileCid?: string; // IPFS CID for file data
  timestamp: number;
}

export interface EncryptedPayload {
  iv: string; // base64
  ciphertext: string; // base64
}

export interface Room {
  id: string;
  name: string;
  createdBy: string;
  groupKey: string; // base64 encoded AES key
  members: Peer[];
  createdAt: number;
}

export interface SignalData {
  type: 'offer' | 'answer';
  sdp: string;
  senderAddress: string;
  ecdhPublicKey: JsonWebKey;
  signature: string;
  roomId: string;
}

export interface PeerConnection {
  address: string;
  peer: import('simple-peer').Instance;
  ecdhPublicKey: JsonWebKey;
  sharedKey?: CryptoKey;
}

export interface WireMessage {
  kind: 'chat' | 'file-meta' | 'file-chunk' | 'group-key' | 'peer-list' | 'sync-request' | 'sync-response';
  roomId: string;
  payload: string; // encrypted JSON
  iv: string;
  senderAddress: string;
  timestamp: number;
}
