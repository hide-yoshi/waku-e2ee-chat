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
      const msg = err instanceof Error ? err.message : 'CONNECTION_FAILED';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg relative overflow-hidden">
      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,240,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,240,255,1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative text-center space-y-10">
        <div className="space-y-4">
          <div className="text-[10px] tracking-[0.4em] uppercase text-neon-cyan/40">
            // encrypted · peer-to-peer · decentralized
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-neon-cyan glow-cyan" style={{ animation: 'flicker 4s infinite' }}>
            P2P_CHAT
          </h1>
          <div className="text-xs text-text-dim font-mono">
            <span className="text-neon-magenta/50">&gt;</span> e2ee mesh network protocol v0.1
          </div>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleConnect}
            disabled={loading}
            className="group relative px-10 py-3 text-sm uppercase tracking-[0.2em]
                       border border-neon-cyan/30 text-neon-cyan/80
                       hover:border-neon-cyan hover:text-neon-cyan hover:border-glow-cyan
                       disabled:opacity-30 transition-all duration-300
                       bg-neon-cyan/[0.03] hover:bg-neon-cyan/[0.08]"
          >
            <span className="relative z-10">
              {loading ? '[ connecting... ]' : '[ connect wallet ]'}
            </span>
          </button>

          <div className="text-[10px] text-text-dim">
            MetaMask · Brave · any EIP-1193
          </div>
        </div>

        {error && (
          <div className="text-xs text-neon-magenta/70 font-mono">
            <span className="text-neon-magenta glow-magenta">ERR:</span> {error}
          </div>
        )}
      </div>
    </div>
  );
}
