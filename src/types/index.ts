// X3DH Pre-Key bundle published to Waku
export interface PreKeyBundle {
  identityKey: JsonWebKey; // ECDH public key (long-term)
  signedPreKey: JsonWebKey; // ECDH public key (medium-term)
  signedPreKeySig: string; // wallet signature over signedPreKey
  oneTimePreKeys: JsonWebKey[]; // ECDH public keys (ephemeral)
  address: string; // wallet address
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string; // derived from sorted pair of addresses
  senderAddress: string;
  type: 'text';
  content: string;
  timestamp: number;
}

export interface EncryptedPayload {
  iv: string; // base64
  ciphertext: string; // base64
}

// Contact: someone we've exchanged keys with
export interface Contact {
  address: string;
  identityKey: JsonWebKey; // their ECDH identity public key
  sharedKey: string; // base64 encoded AES shared key derived via X3DH
  addedAt: number;
}

// Message sent over Waku
export interface WireMessage {
  kind: 'chat' | 'x3dh-init';
  messageId: string;
  conversationId: string;
  payload: string; // encrypted JSON (base64)
  iv: string; // base64
  senderAddress: string;
  // X3DH initial message fields (only for kind: 'x3dh-init')
  ephemeralKey?: JsonWebKey; // sender's ephemeral public key
  usedOneTimeKeyIndex?: number; // which OPK was used
  timestamp: number;
}
