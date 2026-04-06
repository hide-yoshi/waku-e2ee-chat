import { p256 } from '@noble/curves/nist.js';

const ECDH_PARAMS: EcKeyGenParams = { name: 'ECDH', namedCurve: 'P-256' };
const AES_PARAMS = { name: 'AES-GCM', length: 256 } as const;

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// --- Key generation ---

export async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ECDH_PARAMS, true, ['deriveKey', 'deriveBits']);
}

// Derive a deterministic ECDH key pair from a seed (e.g. wallet signature hash).
// Uses the seed as the private key scalar `d` for P-256.
// The seed must be 32 bytes of high-entropy data.
export async function deriveECDHKeyPairFromSeed(seed: Uint8Array): Promise<CryptoKeyPair> {
  // Use @noble/curves to compute the public point from seed as private scalar
  const pubBytes = p256.getPublicKey(seed, false); // uncompressed: 0x04 || x(32) || y(32)
  const xBytes = pubBytes.slice(1, 33);
  const yBytes = pubBytes.slice(33, 65);

  const d = bytesToUrlBase64(seed);
  const x = bytesToUrlBase64(xBytes);
  const y = bytesToUrlBase64(yBytes);

  const privateKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d, x, y, ext: true },
    ECDH_PARAMS,
    true,
    ['deriveKey', 'deriveBits']
  );

  const publicKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, ext: true },
    ECDH_PARAMS,
    true,
    []
  );

  return { privateKey, publicKey };
}

function bytesToUrlBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}


export async function exportPublicKey(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key);
}

export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, ECDH_PARAMS, true, []);
}

export async function exportPrivateKey(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key);
}

export async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, ECDH_PARAMS, true, ['deriveKey', 'deriveBits']);
}

// --- ECDH shared key derivation ---

export async function deriveSharedKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    AES_PARAMS,
    true,
    ['encrypt', 'decrypt']
  );
}

// --- AES-GCM encryption ---

export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return toBase64(raw);
}

export async function importAESKey(b64: string): Promise<CryptoKey> {
  const raw = fromBase64(b64);
  return crypto.subtle.importKey('raw', raw, AES_PARAMS, true, ['encrypt', 'decrypt']);
}

export async function encrypt(
  key: CryptoKey,
  plaintext: string
): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  return { iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}

export async function decrypt(
  key: CryptoKey,
  iv: string,
  ciphertext: string
): Promise<string> {
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    key,
    fromBase64(ciphertext)
  );
  return new TextDecoder().decode(plainBuf);
}

// --- X3DH ---

// Perform X3DH as initiator (Alice):
// Derives a shared key from Alice's identity key, ephemeral key,
// and Bob's identity key + signed pre-key + (optional) one-time pre-key
export async function x3dhInitiate(
  aliceIdentityPrivate: CryptoKey,
  aliceEphemeralPrivate: CryptoKey,
  bobIdentityPublic: CryptoKey,
  bobSignedPreKeyPublic: CryptoKey,
  bobOneTimePreKeyPublic?: CryptoKey
): Promise<CryptoKey> {
  // DH1: Alice IK × Bob SPK
  const dh1 = await deriveRawShared(aliceIdentityPrivate, bobSignedPreKeyPublic);
  // DH2: Alice EK × Bob IK
  const dh2 = await deriveRawShared(aliceEphemeralPrivate, bobIdentityPublic);
  // DH3: Alice EK × Bob SPK
  const dh3 = await deriveRawShared(aliceEphemeralPrivate, bobSignedPreKeyPublic);

  let combined: Uint8Array;
  if (bobOneTimePreKeyPublic) {
    // DH4: Alice EK × Bob OPK
    const dh4 = await deriveRawShared(aliceEphemeralPrivate, bobOneTimePreKeyPublic);
    combined = concatBytes(dh1, dh2, dh3, dh4);
  } else {
    combined = concatBytes(dh1, dh2, dh3);
  }

  return kdf(combined);
}

// Perform X3DH as responder (Bob):
// Derives the same shared key from the other direction
export async function x3dhRespond(
  bobIdentityPrivate: CryptoKey,
  bobSignedPreKeyPrivate: CryptoKey,
  aliceIdentityPublic: CryptoKey,
  aliceEphemeralPublic: CryptoKey,
  bobOneTimePreKeyPrivate?: CryptoKey
): Promise<CryptoKey> {
  // DH1: Bob SPK × Alice IK
  const dh1 = await deriveRawShared(bobSignedPreKeyPrivate, aliceIdentityPublic);
  // DH2: Bob IK × Alice EK
  const dh2 = await deriveRawShared(bobIdentityPrivate, aliceEphemeralPublic);
  // DH3: Bob SPK × Alice EK
  const dh3 = await deriveRawShared(bobSignedPreKeyPrivate, aliceEphemeralPublic);

  let combined: Uint8Array;
  if (bobOneTimePreKeyPrivate) {
    // DH4: Bob OPK × Alice EK
    const dh4 = await deriveRawShared(bobOneTimePreKeyPrivate, aliceEphemeralPublic);
    combined = concatBytes(dh1, dh2, dh3, dh4);
  } else {
    combined = concatBytes(dh1, dh2, dh3);
  }

  return kdf(combined);
}

// Raw ECDH: derive raw shared secret bytes (not an AES key)
async function deriveRawShared(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<Uint8Array> {
  const bits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256
  );
  return new Uint8Array(bits);
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

// HKDF to derive AES key from concatenated DH outputs
async function kdf(input: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    input.buffer as ArrayBuffer,
    'HKDF',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('x3dh-p2p-e2ee-chat'),
      info: new TextEncoder().encode('x3dh-shared-key'),
    },
    keyMaterial,
    AES_PARAMS,
    true,
    ['encrypt', 'decrypt']
  );
}

// Helper to get conversation ID from two addresses (deterministic)
export function getConversationId(a: string, b: string): string {
  return [a.toLowerCase(), b.toLowerCase()].sort().join(':');
}

export { toBase64, fromBase64 };
