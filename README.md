# 🎥 QuickMeet

QuickMeet is a real-time video conferencing platform built with **Node.js**, **Socket.IO**, and **WebRTC**. Host video calls, chat live, collaborate on a shared whiteboard, write and run code together — all directly in the browser, without signups.

> Inspired by Google Meet. Built from scratch.

---

## 🚀 Try it now

```
git clone https://github.com/Aayush63777/web-meet.git
cd web-meet
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.  
To test multi-user, open a second browser window or profile and join the same room code.

---

## 📸 Screenshots

### Landing page
![Landing page](https://raw.githubusercontent.com/Aayush63777/web-meet/main/public/css/meet.png)

| Join overlay | Share source picker |
|---|---|
| ![Join overlay](https://raw.githubusercontent.com/Aayush63777/web-meet/main/public/css/meet%202.png) | ![Share picker](https://raw.githubusercontent.com/Aayush63777/web-meet/main/public/css/meet%202.png) |

---

## ✨ What makes QuickMeet special

- **No signup required** — just enter a name and join. Optionally protect rooms with a password.
- **Real-time P2P video** via WebRTC — direct peer-to-peer media, server only handles signalling.
- **Built-in Code IDE** — write and run JavaScript, Python, C++, Java, HTML, and CSS inside the meeting. No other video app has this.
- **Collaborative Whiteboard** — draw, write text, undo/redo, adjust brush size, all synced live.
- **Host controls** — the first person to join is the host. Mute participants, remove them, or end the meeting for everyone.
- **Screen sharing** — share a window or entire screen. A pre-picker prevents the infinite mirror loop caused by sharing the meeting tab itself.
- **Meeting recording** — record the entire tab (all participants) or just your own camera. Downloads as a `.webm` file with a timestamp filename.
- **Settings modal** — switch microphone, camera, and speaker mid-call. Change video quality on the fly.
- **Active speaker detection** — blue ring highlights whoever is speaking.
- **Network quality indicator** — RTT-based signal strength shown in real time.
- **Security hardened** — CORS restricted, Helmet headers, rate limiting, input validation, sandboxed IDE execution, SRI hashes on CDN assets.

---

## 📸 Feature screenshots

### Google Meet–style dark UI
![Meeting room](https://raw.githubusercontent.com/Aayush63777/web-meet/main/public/css/meet.png)

### Share source picker — prevents mirror loop
Clicking **Present** shows this modal before the native browser picker opens.  
Only "A Window" or "Entire Screen" are offered — tab sharing is blocked by design.

![Share picker](https://raw.githubusercontent.com/Aayush63777/web-meet/main/public/css/meet%202.png)

### Built-in Code IDE
Six languages, live execution, stdin support, line numbers, Ctrl+Enter to run.

![IDE](https://raw.githubusercontent.com/Aayush63777/web-meet/main/public/css/meet%202.png)

---

## 🎮 Features

### Video calling
- Full P2P mesh via WebRTC (offer / answer / ICE signalling)
- Camera and mic toggles — red circle when off (Google Meet style)
- Camera-off overlay shows participant initials with a deterministic colour
- Active speaker highlighted with a blue ring (AudioContext AnalyserNode)
- Pin/spotlight any participant tile
- Participant count badge, meeting timer, room code chip

### Screen sharing
- Pre-picker modal — user chooses "A Window" or "Entire Screen"
- `selfBrowserSurface: 'exclude'` hides the current tab from Chrome's picker
- Post-pick guard stops sharing if a browser tab was somehow selected
- "You are presenting to everyone" banner with one-click Stop
- Camera track saved and restored cleanly on stop — no permission re-prompt
- Remote participants see a desktop badge on the presenter's tile

### Collaborative whiteboard
- Real-time drawing synced to all participants via Socket.IO
- 8 colour swatches, brush size slider, pen / eraser / text tools
- Undo (Ctrl+Z) and redo (Ctrl+Y) with 30-step history
- Canvas state persisted — late joiners see the current board
- Whiteboard opens beside the video grid (65 / 35 split)

### Code IDE
| Language | Execution | stdin |
|---|---|---|
| JavaScript | Browser sandboxed iframe (instant) | — |
| Python 3 | Judge0 CE (free, no key needed) | ✅ |
| C++ 17 | Judge0 CE | ✅ |
| Java 17 | Judge0 CE | ✅ |
| HTML | Live preview in new tab | — |
| CSS | Injected preview in new tab | — |

- Line numbers, cursor position display
- Tab → 2 spaces, Ctrl+Enter to run
- Execution time shown in ms
- Sandboxed JS — cannot reach outer DOM or socket

### Meeting recording
- Source picker: "Entire tab" (all participants) or "Camera & mic only"
- Best codec auto-selected: `vp9+opus → vp8+opus → h264+opus → webm`
- 2.5 Mbps video, 128 kbps audio
- Live REC banner with elapsed timer and Stop button
- All participants notified via "This call is being recorded" bar
- Auto-downloads as `QuickMeet_YYYY-MM-DD_HH-MM-SS.webm`

### Host controls
- First joiner automatically becomes host (HOST badge on their tile)
- Mute any participant individually
- Mute all participants at once
- Remove a participant from the call
- End the meeting for everyone
- Configurable room capacity (2–1000)

### Chat & People
- Real-time group chat with sender name and timestamp
- Unread message badge (resets on viewing Chat tab)
- Emoji picker (20 emoji)
- People panel shows avatar initials, mic/camera status, raised-hand indicator
- Host sees mute and remove buttons per participant
- Invite link button copies the full join URL to clipboard

### Settings
- Microphone, camera, and speaker device selectors
- Video quality: Auto / HD (720p) / SD (360p)
- Host capacity and end-meeting controls in the same modal

### Security
- CORS restricted to `CORS_ORIGIN` env var
- HTTP security headers via Helmet 8 (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `HSTS`, `X-Powered-By` removed)
- Per-socket rate limiting on all socket events (sliding window)
- Canvas blobs rejected if > 5 MB
- Draw event data validated before rebroadcast (finite coords, color regex, size range)
- Username length enforced server-side (40 chars)
- Room ID validated with `/^[\w-]{4,64}$/` on both client and server
- Socket IDs never exposed via public API
- IDE runs in `sandbox="allow-scripts"` iframe — user code cannot reach outer DOM
- SRI integrity hash on Font Awesome CDN
- All dependency versions pinned exactly

---

## 🏗️ Project structure

```
web-meet/
├── index.js                # Express + Socket.IO server, all event handlers
├── package.json            # Pinned dependencies
├── server/
│   └── roomStore.js        # In-memory room, participant, and whiteboard state
├── tests/
│   └── roomStore.test.js   # Unit tests (node --test)
├── public/
│   ├── index.html          # Landing page
│   ├── room.html           # Meeting room UI
│   ├── js/
│   │   ├── landing.js      # Landing page logic
│   │   └── room.js         # WebRTC, signalling, all features (~2 300 lines)
│   └── css/
│       └── style.css       # Google Meet–style dark theme (~1 800 lines)
├── .env.example            # Environment variable template
├── Dockerfile              # Container build
└── vercel.json             # Vercel deployment config
```

---

## ⚙️ Quick start

**Requirements:** Node.js ≥ 14, npm ≥ 6

```bash
# 1. Clone
git clone https://github.com/Aayush63777/web-meet.git
cd web-meet

# 2. Install
npm install

# 3. Start
npm start
# → http://localhost:3000

# Development (auto-restart)
npm run dev
```

To test multi-user locally, open the same room URL in a second browser window or an incognito tab.

---

## 🌐 Environment variables

Copy `.env.example` to `.env` and set values before deploying:

```env
PORT=3000
CORS_ORIGIN=https://your-domain.com
MAX_PARTICIPANTS=200
SESSION_SECRET=   # generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 🔑 Keyboard shortcuts

| Key | Action |
|-----|--------|
| `M` | Mute / unmute mic |
| `V` | Turn camera on / off |
| `S` | Start / stop screen share |
| `H` | Raise / lower hand |
| `W` | Open / close whiteboard |
| `I` | Open / close Code IDE |
| `R` | Start / stop recording |
| `L` | Leave call |
| `Ctrl+Enter` | Run code in IDE |
| `Ctrl+Z` | Undo whiteboard stroke |
| `Ctrl+Y` | Redo whiteboard stroke |

---

## 🧪 Tests

```bash
npm test
```

Runs the built-in `node --test` suite against `server/roomStore.js`.

---

## 🔍 Development notes

- The server is stateful (in-memory `RoomStore`) — run as a **single process**. Multiple workers will split room state.
- WebRTC uses a P2P mesh topology. It works well for 2–4 participants; beyond that consider adding a media server (mediasoup, LiveKit).
- Only Google STUN servers are configured. Behind strict NAT, calls may fail without a TURN server.
- The `CORS_ORIGIN` default is `http://localhost:3000`. Set it to your production domain before deploying.
- `http://localhost` always shows Chrome's "Not secure" warning — this is normal for local HTTP development and does not affect functionality.

---

## 📄 License

MIT © 2026 [Aayush63777](https://github.com/Aayush63777)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software, to use, copy, modify, merge, publish, distribute, and sublicense it, subject to the conditions of the MIT License.
