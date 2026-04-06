import { useState } from 'react';
import { connectWallet, createSignedIdentity } from '../lib/wallet';

interface Props {
  onConnected: (identity: {
    address: string;
    keyPair: CryptoKeyPair;
    publicKeyJwk: JsonWebKey;
    signature: string;
  }) => void;
}

export function WalletConnect({ onConnected }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      await connectWallet();
      const identity = await createSignedIdentity();
      onConnected(identity);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold">P2P E2EE Chat</h1>
        <p className="text-gray-400 max-w-md">
          Serverless, end-to-end encrypted group chat.
          Connect your wallet to get started.
        </p>
        <button
          onClick={handleConnect}
          disabled={loading}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg font-medium transition-colors"
        >
          {loading ? 'Connecting...' : 'Connect Wallet'}
        </button>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
    </div>
  );
}
