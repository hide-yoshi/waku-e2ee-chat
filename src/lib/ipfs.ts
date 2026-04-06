import { createHelia } from 'helia';
import { unixfs } from '@helia/unixfs';
import type { Helia } from 'helia';
import type { UnixFS } from '@helia/unixfs';
import { encrypt, decrypt, fromBase64, toBase64 } from './crypto';
import type { CID } from 'multiformats/cid';

let heliaNode: Helia | null = null;
let fs: UnixFS | null = null;

export async function getHelia(): Promise<{ helia: Helia; fs: UnixFS }> {
  if (!heliaNode) {
    heliaNode = await createHelia();
    fs = unixfs(heliaNode);
  }
  return { helia: heliaNode, fs: fs! };
}

export async function uploadEncrypted(
  data: string,
  groupKey: CryptoKey
): Promise<string> {
  const { fs } = await getHelia();
  const { iv, ciphertext } = await encrypt(groupKey, data);
  const payload = JSON.stringify({ iv, ciphertext });
  const bytes = new TextEncoder().encode(payload);
  const cid = await fs.addBytes(bytes);
  return cid.toString();
}

export async function downloadDecrypted(
  cidStr: string,
  groupKey: CryptoKey
): Promise<string> {
  const { fs } = await getHelia();
  // Parse CID
  const { CID: CIDClass } = await import('multiformats/cid');
  const cid: CID = CIDClass.parse(cidStr);

  const chunks: Uint8Array[] = [];
  for await (const chunk of fs.cat(cid)) {
    chunks.push(chunk);
  }
  const allBytes = new Uint8Array(
    chunks.reduce((acc, c) => acc + c.length, 0)
  );
  let offset = 0;
  for (const chunk of chunks) {
    allBytes.set(chunk, offset);
    offset += chunk.length;
  }

  const payload = JSON.parse(new TextDecoder().decode(allBytes));
  return decrypt(groupKey, payload.iv, payload.ciphertext);
}

export async function uploadFileEncrypted(
  file: File,
  groupKey: CryptoKey
): Promise<{ cid: string; iv: string }> {
  const { fs } = await getHelia();
  const data = await file.arrayBuffer();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    groupKey,
    data
  );
  const cid = await fs.addBytes(new Uint8Array(ciphertext));
  return { cid: cid.toString(), iv: toBase64(iv.buffer) };
}

export async function downloadFileDecrypted(
  cidStr: string,
  iv: string,
  groupKey: CryptoKey
): Promise<ArrayBuffer> {
  const { fs } = await getHelia();
  const { CID: CIDClass } = await import('multiformats/cid');
  const cid: CID = CIDClass.parse(cidStr);

  const chunks: Uint8Array[] = [];
  for await (const chunk of fs.cat(cid)) {
    chunks.push(chunk);
  }
  const allBytes = new Uint8Array(
    chunks.reduce((acc, c) => acc + c.length, 0)
  );
  let offset = 0;
  for (const chunk of chunks) {
    allBytes.set(chunk, offset);
    offset += chunk.length;
  }

  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    groupKey,
    allBytes.buffer
  );
}

export async function stopHelia() {
  if (heliaNode) {
    await heliaNode.stop();
    heliaNode = null;
    fs = null;
  }
}
