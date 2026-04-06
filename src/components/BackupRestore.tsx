import { useState } from 'react';
import { db } from '../lib/db';
import { uploadEncrypted, downloadDecrypted } from '../lib/ipfs';
import { importGroupKey } from '../lib/crypto';
import type { Room } from '../types';

interface Props {
  rooms: Room[];
  onClose: () => void;
}

export function BackupRestore({ rooms, onClose }: Props) {
  const [status, setStatus] = useState('');
  const [cidInput, setCidInput] = useState('');
  const [roomId, setRoomId] = useState(rooms[0]?.id || '');
  const [backupCid, setBackupCid] = useState<string | null>(null);

  const handleBackup = async () => {
    if (!roomId) return;
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;

    setStatus('Backing up...');
    try {
      const messages = await db.messages
        .where('roomId')
        .equals(roomId)
        .toArray();

      const backup = JSON.stringify({
        room: { id: room.id, name: room.name, members: room.members, createdAt: room.createdAt },
        messages,
        exportedAt: Date.now(),
      });

      const groupKey = await importGroupKey(room.groupKey);
      const cid = await uploadEncrypted(backup, groupKey);
      setBackupCid(cid);
      setStatus(`Backup complete! CID: ${cid}`);
    } catch (err) {
      setStatus(`Backup failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleRestore = async () => {
    if (!cidInput.trim() || !roomId) return;
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;

    setStatus('Restoring...');
    try {
      const groupKey = await importGroupKey(room.groupKey);
      const data = await downloadDecrypted(cidInput.trim(), groupKey);
      const backup = JSON.parse(data);

      // Import messages (skip duplicates)
      const existing = new Set(
        (await db.messages.where('roomId').equals(roomId).toArray()).map((m) => m.id)
      );
      const newMessages = backup.messages.filter(
        (m: { id: string }) => !existing.has(m.id)
      );
      if (newMessages.length > 0) {
        await db.messages.bulkAdd(newMessages);
      }
      setStatus(`Restored ${newMessages.length} new messages.`);
    } catch (err) {
      setStatus(`Restore failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg p-6 w-96 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">Backup / Restore</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            &times;
          </button>
        </div>

        <div>
          <label className="text-sm text-gray-400">Room</label>
          <select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="w-full mt-1 bg-gray-800 text-white px-3 py-2 rounded border border-gray-700"
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <button
            onClick={handleBackup}
            className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
          >
            Backup to IPFS
          </button>
          {backupCid && (
            <div className="flex gap-1">
              <input
                readOnly
                value={backupCid}
                className="flex-1 bg-gray-800 text-xs text-green-400 px-2 py-1 rounded font-mono"
              />
              <button
                onClick={() => navigator.clipboard.writeText(backupCid)}
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
              >
                Copy
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <input
            value={cidInput}
            onChange={(e) => setCidInput(e.target.value)}
            placeholder="Enter backup CID..."
            className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-700 text-sm font-mono"
          />
          <button
            onClick={handleRestore}
            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            Restore from IPFS
          </button>
        </div>

        {status && (
          <p className="text-sm text-gray-300 break-all">{status}</p>
        )}
      </div>
    </div>
  );
}
