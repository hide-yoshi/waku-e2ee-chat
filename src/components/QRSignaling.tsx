import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useEffect, useRef } from 'react';
import type { SignalData } from '../types';

interface Props {
  onSignalReceived: (signal: SignalData) => void;
  localSignal: SignalData | null;
  mode: 'idle' | 'offering' | 'answering';
}

export function QRSignaling({ onSignalReceived, localSignal, mode }: Props) {
  const [showScanner, setShowScanner] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const scannerDivRef = useRef<HTMLDivElement>(null);

  const signalStr = localSignal ? JSON.stringify(localSignal) : '';
  // QR codes have data limits; for large SDP, fall back to copy-paste
  const canShowQR = signalStr.length < 2953;

  useEffect(() => {
    if (showScanner && scannerDivRef.current) {
      const scanner = new Html5QrcodeScanner(
        'qr-reader',
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );
      scannerRef.current = scanner;

      scanner.render(
        (text) => {
          try {
            const signal: SignalData = JSON.parse(text);
            onSignalReceived(signal);
            scanner.clear();
            setShowScanner(false);
          } catch {
            console.error('Invalid QR data');
          }
        },
        () => {}
      );

      return () => {
        scanner.clear().catch(() => {});
      };
    }
  }, [showScanner, onSignalReceived]);

  const handleManualSubmit = () => {
    try {
      const signal: SignalData = JSON.parse(manualInput);
      onSignalReceived(signal);
      setManualInput('');
    } catch {
      alert('Invalid signal data');
    }
  };

  return (
    <div className="space-y-4">
      {localSignal && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-300">
            {mode === 'offering' ? 'Share this with your peer:' : 'Send this answer back:'}
          </h3>
          {canShowQR ? (
            <div className="flex justify-center bg-white p-4 rounded-lg w-fit mx-auto">
              <QRCodeSVG value={signalStr} size={200} />
            </div>
          ) : (
            <p className="text-xs text-yellow-400">SDP too large for QR. Use copy-paste below.</p>
          )}
          <div className="relative">
            <textarea
              readOnly
              value={signalStr}
              className="w-full h-24 bg-gray-800 text-xs text-gray-300 p-2 rounded border border-gray-700 font-mono"
            />
            <button
              onClick={() => navigator.clipboard.writeText(signalStr)}
              className="absolute top-1 right-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-300">Receive peer signal:</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setShowScanner(!showScanner)}
            className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            {showScanner ? 'Close Scanner' : 'Scan QR'}
          </button>
        </div>

        {showScanner && (
          <div ref={scannerDivRef} className="mt-2">
            <div id="qr-reader" />
          </div>
        )}

        <div className="flex gap-2">
          <textarea
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Paste signal data here..."
            className="flex-1 h-20 bg-gray-800 text-xs text-gray-300 p-2 rounded border border-gray-700 font-mono"
          />
          <button
            onClick={handleManualSubmit}
            className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 rounded self-end transition-colors"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
