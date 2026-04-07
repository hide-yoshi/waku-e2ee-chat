# CLAUDE.md

## Project Overview

P2P E2EE chat app. Fully serverless - no backend, no signaling server. Uses Waku Light Node for P2P messaging, wallet for identity, and X3DH for forward-secret key exchange.

## Commands

- `npm run dev` - Start dev server (port 5173)
- `npm run build` - Type check (`tsc -b`) + Vite production build
- `npm run lint` - ESLint
- `npx tsx e2e-waku.ts` - E2E test (requires dev server running)

## Project Structure

```
src/
├── types/index.ts         # Shared type definitions
├── lib/
│   ├── crypto.ts          # ECDH P-256 + AES-256-GCM, X3DH key exchange (Web Crypto API)
│   ├── wallet.ts          # wagmi wallet connection + ECDH key signing
│   ├── waku.ts            # WakuTransport - single global content topic, envelope-based routing, Filter/LightPush
│   └── db.ts              # Dexie.js schema (IndexedDB)
├── hooks/
│   └── useChat.ts         # Core chat logic (contacts, messages, X3DH handshake, reliable delivery with re-send)
├── components/
│   ├── WalletConnect.tsx   # Wallet connection screen
│   ├── Sidebar.tsx         # Contact list, add contact, status
│   └── ChatView.tsx        # Message display + input
├── App.tsx                 # Main app (auth gate + chat layout)
├── main.tsx                # Entry point (no StrictMode - Waku compat)
└── index.css               # Tailwind + cyberpunk theme
```

Test files:
- `e2e-waku.ts` - Playwright E2E test (two peers, X3DH + message exchange)

## Key Design Decisions

- **No StrictMode** in main.tsx - Waku connections break with double-render
- **Waku Light Node** for P2P messaging (no backend/signaling server)
- **Single global content topic** - multiple topics caused messages to land on different shards/relays and get dropped. All messages go through one topic, with envelope-based client-side routing (type: prekey/inbox/chat)
- **X3DH key exchange** - Extended Triple Diffie-Hellman for forward secrecy. Pre-key bundles published via Waku
- **Reliable delivery via re-send** - Waku Filter drops messages intermittently. All outgoing messages (x3dh-init, chat) are queued and re-sent every 5s until peer responds
- **Wallet = identity** - no separate auth system. ECDH identity key derived deterministically from wallet signature
- **Periodic Filter re-subscription** (30s) to recover from silent subscription drops

## Crypto

- Key exchange: X3DH (Extended Triple Diffie-Hellman) with ECDH P-256
- Message encryption: AES-256-GCM
- Key derivation: Web Crypto `deriveKey`
- All via native Web Crypto API (no external crypto libs)
