import { useState } from 'react';
import type { Room } from '../types';

interface Props {
  address: string;
  rooms: Room[];
  currentRoomId: string | null;
  connectedPeers: string[];
  onSelectRoom: (id: string) => void;
  onCreateRoom: (name: string) => void;
  onOpenConnect: () => void;
  onOpenInvite: () => void;
  onOpenBackup: () => void;
}

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function Sidebar({
  address,
  rooms,
  currentRoomId,
  connectedPeers,
  onSelectRoom,
  onCreateRoom,
  onOpenConnect,
  onOpenInvite,
  onOpenBackup,
}: Props) {
  const [newRoomName, setNewRoomName] = useState('');
  const [showNewRoom, setShowNewRoom] = useState(false);

  const handleCreate = () => {
    if (newRoomName.trim()) {
      onCreateRoom(newRoomName.trim());
      setNewRoomName('');
      setShowNewRoom(false);
    }
  };

  return (
    <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="text-xs text-gray-500">Connected as</div>
        <div className="text-sm font-mono text-indigo-400">{shortenAddress(address)}</div>
      </div>

      {/* Peers */}
      <div className="px-4 py-2 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Peers ({connectedPeers.length})
          </span>
          <button
            onClick={onOpenConnect}
            className="text-xs text-indigo-400 hover:text-indigo-300"
          >
            + Connect
          </button>
        </div>
        {connectedPeers.map((p) => (
          <div key={p} className="text-xs font-mono text-green-400 mt-1">
            {shortenAddress(p)}
          </div>
        ))}
      </div>

      {/* Rooms */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Rooms</span>
            <button
              onClick={() => setShowNewRoom(!showNewRoom)}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              + New
            </button>
          </div>

          {showNewRoom && (
            <div className="flex gap-1 mb-2">
              <input
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="Room name"
                className="flex-1 bg-gray-800 text-sm text-white px-2 py-1 rounded border border-gray-700"
              />
              <button
                onClick={handleCreate}
                className="px-2 py-1 text-xs bg-indigo-600 rounded hover:bg-indigo-700"
              >
                OK
              </button>
            </div>
          )}

          {rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => onSelectRoom(room.id)}
              className={`w-full text-left px-3 py-2 rounded text-sm mb-1 transition-colors ${
                currentRoomId === room.id
                  ? 'bg-indigo-600/20 text-indigo-300'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              {room.name}
              <span className="text-xs text-gray-500 ml-1">
                ({room.members.length})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-gray-800 space-y-2">
        {currentRoomId && (
          <button
            onClick={onOpenInvite}
            className="w-full px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded transition-colors"
          >
            Invite to Room
          </button>
        )}
        <button
          onClick={onOpenBackup}
          className="w-full px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded transition-colors"
        >
          Backup / Restore
        </button>
      </div>
    </div>
  );
}
