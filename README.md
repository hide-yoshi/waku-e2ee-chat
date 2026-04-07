# Waku E2EE Chat

Serverless, end-to-end encrypted peer-to-peer 1-on-1 chat application. No backend, no signaling server. Uses Waku (libp2p) for P2P messaging, MetaMask for identity, and X3DH for key exchange.

## Features

- **E2EE** - X3DH key exchange + AES-256-GCM message encryption
- **P2P** - Waku Light Node (libp2p) for decentralized messaging
- **Wallet Auth** - EIP-1193 wallet (MetaMask etc.) for identity
- **1-on-1 Chat** - Add contacts by wallet address, encrypted messaging
- **Local History** - IndexedDB (Dexie.js) for message persistence
- **Reliable Delivery** - Automatic message re-sending over unreliable Waku network

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Vite + React + TypeScript |
| UI | Tailwind CSS (cyberpunk theme) |
| P2P | @waku/sdk (Light Node) |
| Wallet | wagmi + viem |
| Encryption | Web Crypto API (X3DH + AES-256-GCM) |
| Local DB | Dexie.js (IndexedDB) |

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` and connect your wallet.

### How to Chat

1. Both users open the app and connect wallets
2. Wait for "WAKU CONNECTED" status
3. User A enters User B's wallet address and clicks [add]
4. X3DH key exchange happens automatically
5. Once contact appears on both sides, select it and start chatting

## Architecture

```
Browser A  <--Waku Network (E2EE)-->  Browser B
    |                                      |
    |--- IndexedDB (local history)         |--- IndexedDB (local history)
    |--- MetaMask (identity/auth)          |--- MetaMask (identity/auth)
```

### Encryption Flow

1. Each device generates an ECDH key pair (P-256) derived from wallet signature
2. Pre-key bundles (identity key + signed pre-key + one-time pre-keys) published via Waku
3. Initiator fetches responder's pre-key bundle and performs X3DH
4. Shared secret derived, X3DH init message sent to responder's inbox
5. All chat messages encrypted with AES-256-GCM using the shared key

## Scripts

```bash
npm run dev      # Start dev server
npm run build    # Type check + production build
npm run lint     # ESLint
```

## License

MIT
