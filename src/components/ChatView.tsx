import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../types';
import { downloadFileDecrypted } from '../lib/ipfs';
import { importGroupKey } from '../lib/crypto';

interface Props {
  messages: ChatMessage[];
  currentAddress: string;
  roomName: string;
  groupKeyStr: string;
  onSendMessage: (text: string) => void;
  onSendFile: (file: File) => void;
}

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChatView({ messages, currentAddress, roomName, groupKeyStr, onSendMessage, onSendFile }: Props) {
  const [input, setInput] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSendFile(file);
      e.target.value = '';
    }
  };

  const handleDownload = async (msg: ChatMessage) => {
    if (!msg.fileCid) return;
    setDownloading(msg.id);
    try {
      // Parse fileIv from the message content metadata
      // For now, download the encrypted file
      const groupKey = await importGroupKey(groupKeyStr);
      // We need the IV - it should be stored. For simplicity,
      // we store it in the content as JSON for file messages
      const data = await downloadFileDecrypted(msg.fileCid, '', groupKey);
      const blob = new Blob([data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = msg.fileName || 'download';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-950 h-full">
      {/* Room header */}
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-lg font-medium text-white">{roomName}</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => {
          const isMine = msg.senderAddress === currentAddress;
          return (
            <div
              key={msg.id}
              className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] rounded-lg px-3 py-2 ${
                  isMine
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-200'
                }`}
              >
                {!isMine && (
                  <div className="text-xs text-gray-400 font-mono mb-1">
                    {shortenAddress(msg.senderAddress)}
                  </div>
                )}
                {msg.type === 'file' ? (
                  <div className="space-y-1">
                    <div className="text-sm">{msg.content}</div>
                    {msg.fileName && (
                      <button
                        onClick={() => handleDownload(msg)}
                        disabled={downloading === msg.id}
                        className={`text-xs px-2 py-1 rounded ${
                          isMine
                            ? 'bg-indigo-700 hover:bg-indigo-800'
                            : 'bg-gray-700 hover:bg-gray-600'
                        }`}
                      >
                        {downloading === msg.id ? 'Downloading...' : `Download ${msg.fileName} (${formatFileSize(msg.fileSize || 0)})`}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                )}
                <div className={`text-xs mt-1 ${isMine ? 'text-indigo-200' : 'text-gray-500'}`}>
                  {formatTime(msg.timestamp)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 transition-colors"
            title="Send file"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Type a message..."
            className="flex-1 bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-indigo-500 focus:outline-none"
          />
          <button
            onClick={handleSend}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
