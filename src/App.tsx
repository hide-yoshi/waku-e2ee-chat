import { useState, useCallback } from 'react';
import { WalletConnect } from './components/WalletConnect';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { ConnectPeerModal } from './components/ConnectPeerModal';
import { InviteModal } from './components/InviteModal';
import { BackupRestore } from './components/BackupRestore';
import { useChat } from './hooks/useChat';

interface Identity {
  address: string;
  keyPair: CryptoKeyPair;
  publicKeyJwk: JsonWebKey;
  signature: string;
}

function ChatApp({ identity }: { identity: Identity }) {
  const {
    rooms,
    currentRoomId,
    setCurrentRoomId,
    messages,
    connectedPeers,
    peerManager,
    initPeerManager,
    createRoom,
    invitePeer,
    sendMessage,
    sendFile,
  } = useChat(identity);

  const [showConnect, setShowConnect] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showBackup, setShowBackup] = useState(false);

  const currentRoom = rooms.find((r) => r.id === currentRoomId);

  const handleOpenConnect = useCallback(() => {
    initPeerManager();
    setShowConnect(true);
  }, [initPeerManager]);

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      <Sidebar
        address={identity.address}
        rooms={rooms}
        currentRoomId={currentRoomId}
        connectedPeers={connectedPeers}
        onSelectRoom={setCurrentRoomId}
        onCreateRoom={(name) => createRoom(name)}
        onOpenConnect={handleOpenConnect}
        onOpenInvite={() => setShowInvite(true)}
        onOpenBackup={() => setShowBackup(true)}
      />

      <div className="flex-1 flex flex-col">
        {currentRoom ? (
          <ChatView
            messages={messages}
            currentAddress={identity.address}
            roomName={currentRoom.name}
            groupKeyStr={currentRoom.groupKey}
            onSendMessage={sendMessage}
            onSendFile={sendFile}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center space-y-2">
              <p className="text-lg">Select or create a room to start chatting</p>
              <p className="text-sm">Connect to peers first, then create a room and invite them</p>
            </div>
          </div>
        )}
      </div>

      {showConnect && peerManager.current && (
        <ConnectPeerModal
          peerManager={peerManager.current}
          address={identity.address}
          publicKeyJwk={identity.publicKeyJwk}
          signature={identity.signature}
          onClose={() => setShowConnect(false)}
          onConnected={() => {}}
        />
      )}

      {showInvite && currentRoom && (
        <InviteModal
          room={currentRoom}
          connectedPeers={connectedPeers}
          onInvite={(addr) => {
            invitePeer(currentRoom.id, addr);
            setShowInvite(false);
          }}
          onClose={() => setShowInvite(false)}
        />
      )}

      {showBackup && (
        <BackupRestore
          rooms={rooms}
          onClose={() => setShowBackup(false)}
        />
      )}
    </div>
  );
}

function App() {
  const [identity, setIdentity] = useState<Identity | null>(null);

  if (!identity) {
    return <WalletConnect onConnected={setIdentity} />;
  }

  return <ChatApp identity={identity} />;
}

export default App;
