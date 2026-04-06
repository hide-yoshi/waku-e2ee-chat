import { useState, useCallback } from 'react';
import { QRSignaling } from './QRSignaling';
import type { PeerManager } from '../lib/peer';
import type { SignalData } from '../types';

interface Props {
  peerManager: PeerManager;
  address: string;
  publicKeyJwk: JsonWebKey;
  signature: string;
  onClose: () => void;
  onConnected: () => void;
}

export function ConnectPeerModal({
  peerManager,
  address,
  publicKeyJwk,
  signature,
  onClose,
  onConnected,
}: Props) {
  const [mode, setMode] = useState<'choose' | 'offer' | 'answer'>('choose');
  const [localSignal, setLocalSignal] = useState<SignalData | null>(null);
  const [status, setStatus] = useState('');

  const handleCreateOffer = useCallback(async () => {
    setMode('offer');
    setStatus('Creating offer... (waiting for peer address from answer)');
    // We create a temporary offer. The peer address will come from the answer.
    const tempId = `pending-${Date.now()}`;
    try {
      const sdpData = await peerManager.createOffer(tempId, publicKeyJwk);
      const signal: SignalData = {
        type: 'offer',
        sdp: JSON.stringify(sdpData),
        senderAddress: address,
        ecdhPublicKey: publicKeyJwk,
        signature,
        roomId: '',
      };
      setLocalSignal(signal);
      setStatus('Share the QR code or signal data with your peer.');
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }, [peerManager, address, publicKeyJwk, signature]);

  const handleReceiveSignal = useCallback(
    async (signal: SignalData) => {
      if (mode === 'choose' || mode === 'answer') {
        // We received an offer, create an answer
        setMode('answer');
        setStatus('Creating answer...');
        try {
          const offerSdp = JSON.parse(signal.sdp);
          const answerSdp = await peerManager.createAnswer(
            signal.senderAddress,
            signal.ecdhPublicKey,
            offerSdp
          );
          const answerSignal: SignalData = {
            type: 'answer',
            sdp: JSON.stringify(answerSdp),
            senderAddress: address,
            ecdhPublicKey: publicKeyJwk,
            signature,
            roomId: signal.roomId,
          };
          setLocalSignal(answerSignal);
          setStatus('Connected! Send the answer back to complete the handshake.');
          onConnected();
        } catch (err) {
          setStatus(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
        }
      } else if (mode === 'offer') {
        // We sent an offer, received an answer
        setStatus('Accepting answer...');
        try {
          const answerSdp = JSON.parse(signal.sdp);
          // Destroy the temp connection and create a real one
          peerManager.destroy(`pending-${Date.now()}`);
          // Signal the answer to the pending peer
          // Find the pending connection
          const pendingAddr = Array.from(
            peerManager.getConnectedPeers()
          ).find((a) => a.startsWith('pending-'));
          if (pendingAddr) {
            peerManager.destroy(pendingAddr);
          }
          // Create new connection with proper address
          await peerManager.createOffer(signal.senderAddress, signal.ecdhPublicKey);
          // Actually, we need to accept the answer on existing connection
          peerManager.acceptSignal(signal.senderAddress, answerSdp);
          setStatus('Connected!');
          onConnected();
        } catch (err) {
          setStatus(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
        }
      }
    },
    [mode, peerManager, address, publicKeyJwk, signature, onConnected]
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg p-6 w-[480px] max-h-[90vh] overflow-y-auto space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">Connect to Peer</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">
            &times;
          </button>
        </div>

        {mode === 'choose' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-400">
              Choose how to connect:
            </p>
            <button
              onClick={handleCreateOffer}
              className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
            >
              Create Invite (I go first)
            </button>
            <button
              onClick={() => setMode('answer')}
              className="w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Join (I have an invite)
            </button>
          </div>
        )}

        {(mode === 'offer' || mode === 'answer') && (
          <QRSignaling
            localSignal={localSignal}
            onSignalReceived={handleReceiveSignal}
            mode={mode === 'offer' ? 'offering' : 'answering'}
          />
        )}

        {status && (
          <p className="text-sm text-gray-300">{status}</p>
        )}
      </div>
    </div>
  );
}
