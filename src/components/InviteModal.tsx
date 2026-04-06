import type { Room } from '../types';

interface Props {
  room: Room;
  connectedPeers: string[];
  onInvite: (peerAddress: string) => void;
  onClose: () => void;
}

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function InviteModal({ room, connectedPeers, onInvite, onClose }: Props) {
  const memberAddresses = new Set(room.members.map((m) => m.address));
  const invitable = connectedPeers.filter((p) => !memberAddresses.has(p));

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg p-6 w-96 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">Invite to {room.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            &times;
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-gray-400">
            Current members: {room.members.length}
          </p>

          {invitable.length === 0 ? (
            <p className="text-sm text-gray-500">
              No connected peers available to invite. Connect to a peer first.
            </p>
          ) : (
            invitable.map((peer) => (
              <div
                key={peer}
                className="flex items-center justify-between bg-gray-800 rounded px-3 py-2"
              >
                <span className="text-sm font-mono text-gray-300">
                  {shortenAddress(peer)}
                </span>
                <button
                  onClick={() => onInvite(peer)}
                  className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
                >
                  Invite
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
