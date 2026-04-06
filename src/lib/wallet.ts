import { createConfig, http, connect, signMessage, getAccount, disconnect } from '@wagmi/core';
import { mainnet } from 'viem/chains';
import { injected } from '@wagmi/connectors';
import { exportPublicKey, deriveECDHKeyPairFromSeed } from './crypto';

export const wagmiConfig = createConfig({
  chains: [mainnet],
  connectors: [injected()],
  transports: { [mainnet.id]: http() },
});

export async function connectWallet(): Promise<string> {
  const result = await connect(wagmiConfig, { connector: injected() });
  return result.accounts[0];
}

export function getConnectedAddress(): string | undefined {
  const account = getAccount(wagmiConfig);
  return account.address?.toLowerCase();
}

export async function disconnectWallet(): Promise<void> {
  await disconnect(wagmiConfig);
}

// Sign a message with the wallet
export async function walletSign(message: string): Promise<string> {
  return signMessage(wagmiConfig, { message });
}

// Sign the ECDH public key with the wallet to prove ownership
export async function signECDHKey(ecdhPublicKey: JsonWebKey): Promise<string> {
  const message = `E2EE Chat ECDH Public Key:\n${JSON.stringify(ecdhPublicKey)}`;
  return walletSign(message);
}

// Derive a deterministic Identity Key from the wallet signature.
// Same wallet → same signature → same key pair on any device.
async function deriveIdentityKeyFromWallet(): Promise<CryptoKeyPair> {
  const IDENTITY_MESSAGE = 'E2EE Chat Identity Key Derivation v1';
  const signature = await walletSign(IDENTITY_MESSAGE);

  // Hash the signature to get 32 bytes of deterministic entropy
  const sigBytes = new TextEncoder().encode(signature);
  const hash = await crypto.subtle.digest('SHA-256', sigBytes);
  const seed = new Uint8Array(hash);

  return deriveECDHKeyPairFromSeed(seed);
}

// Create signed identity: derive deterministic key pair from wallet, then sign the public key
export async function createSignedIdentity() {
  const keyPair = await deriveIdentityKeyFromWallet();
  const publicKeyJwk = await exportPublicKey(keyPair.publicKey);
  const signature = await signECDHKey(publicKeyJwk);
  const address = getConnectedAddress()!;

  return {
    keyPair,
    publicKeyJwk,
    signature,
    address,
  };
}
