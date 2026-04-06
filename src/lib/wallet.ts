import { createConfig, http, connect, signMessage, getAccount, disconnect } from '@wagmi/core';
import { mainnet } from 'viem/chains';
import { injected } from '@wagmi/connectors';
import { exportPublicKey, generateECDHKeyPair } from './crypto';

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

// Sign the ECDH public key with the wallet to prove ownership
export async function signECDHKey(ecdhPublicKey: JsonWebKey): Promise<string> {
  const message = `E2EE Chat ECDH Public Key:\n${JSON.stringify(ecdhPublicKey)}`;
  const signature = await signMessage(wagmiConfig, { message });
  return signature;
}

// Create the message that was signed (for verification)
export function getSignMessage(ecdhPublicKey: JsonWebKey): string {
  return `E2EE Chat ECDH Public Key:\n${JSON.stringify(ecdhPublicKey)}`;
}

// Generate ECDH key pair and sign the public key with wallet
export async function createSignedIdentity() {
  const keyPair = await generateECDHKeyPair();
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
