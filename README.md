# 🎥 QuickMeet

QuickMeet is a real-time video conferencing platform built with **Node.js**, **Socket.IO**, and **WebRTC**. Host video calls, chat live, collaborate on a shared whiteboard, and write & run code together — all directly in the browser, without any signup.

> Inspired by Google Meet. Built from scratch.

---

## 🚀 Quick start

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
```

To test multi-user locally, open the same room URL in a second browser window or incognito tab.

---

## 📸 Screenshots

### Landing page
![Landing page](assets/screenshots/landing.png)

### Join overlay
![Join overlay](assets/screenshots/join-overlay.png)

### Meeting room
![Meeting room](assets/screenshots/meeting-room.png)

### Screen share source picker
![Screen share picker](assets/screenshots/share-picker.png)

### Active screen sharing
![Screen sharing](assets/screenshots/screen-sharing.png)

### Built-in Code IDE
![Code IDE](assets/screenshots/ide.png)

> **To add screenshots:** Take a screenshot of each view, save them in `assets/screenshots/` with the filenames above, then commit and push.

---

## ✨ What makes QuickMeet special

- **No signup required** — enter a name and join instantly. Optionally protect rooms with a password.
- **Real-time P2P video** via WebRTC — direct peer-to-peer media, server only handles signalling.
- **Built-in Code IDE** — write and run JavaScript, Python, C++, Java, HTML, and CSS inside the meeting. No other video conferencing app has this.
- **Collaborative Whiteboard** — draw, write text, undo/redo, adjust brush size, all synced live.
- **Host controls** — first joiner is host. Mute participants, remove them, or end the meeting for everyone.
- **Screen sharing** — share a window or full screen. A pre-picker prevents the infinite mirror loop caused by sharing the meeting tab itself.
- **Meeting recording** — record the full tab (all participants) or just your camera. Downloads as `.webm` with a timestamp filename.
- **Settings modal** — switch mic, camera, and speaker mid-call. Change video quality on the fly.
- **Active speaker detection** — blue ring highlights whoever is currently speaking.
- **Network quality indicator** — RTT-based signal strength shown in real time.
- **Security hardened** — Helmet headers, CORS restriction, rate limiting, sandboxed IDE, SRI hashes on CDN.

---

## 🎮 Features

### Video calling
- Full P2P mesh via WebRTC (offer / answer / ICE signalling over Socket.IO)
- Mic and camera toggles — red circle when off, matching Google Meet style
- Camera-off overlay shows participant initials with a deterministic colour
- Active speaker highlighted with a blue ring (AudioContext AnalyserNode, 200 ms poll)
- Pin / spotlight any participant tile
- Participant count badge, live meeting timer, room code chip (click to copy)

### Screen sharing
- Pre-picker modal — user chooses **A Window** or **Entire Screen** before the browser picker opens
- `selfBrowserSurface: 'exclude'` hides the current tab from Chrome's picker
- Post-pick guard aborts if a browser tab was somehow selected
- "You are presenting to everyone" banner with one-click Stop sharing
- Camera track saved and restored cleanly on stop — no permission prompt re-shown
- Remote participants see a desktop-icon badge on the presenter's tile

### Collaborative whiteboard
- Real-time drawing synced to all participants via Socket.IO
- 8 colour swatches, brush size slider, pen / eraser / text tools
- Undo (`Ctrl+Z`) and redo (`Ctrl+Y`) with 30-step history
- Canvas state persisted server-side — late joiners see the current board
- Whiteboard opens as an inline panel beside the video grid (65 / 35 split)

### Code IDE
| Language | Execution | stdin |
|---|---|---|
| JavaScript | Sandboxed iframe in browser (instant) | — |
| Python 3 | Judge0 CE — free, no API key needed | ✅ |
| C++ 17 | Judge0 CE | ✅ |
| Java 17 | Judge0 CE | ✅ |
| HTML | Live preview in new tab | — |
| CSS | Injected preview in new tab | — |

- Line numbers, cursor position (`Ln X, Col Y`)
- Tab key → 2 spaces, `Ctrl+Enter` to run
- Execution time shown in ms
- JS sandboxed with `sandbox="allow-scripts"` — user code cannot reach outer DOM or socket

### Meeting recording
- Source picker: **Entire tab** (all participants) or **Camera & mic only**
- Best codec auto-selected: `vp9+opus → vp8+opus → h264+opus → webm`
- 2.5 Mbps video, 128 kbps audio
- Live REC banner with elapsed timer and Stop button
- All participants notified with a "This call is being recorded" bar
- Auto-downloads as `QuickMeet_YYYY-MM-DD_HH-MM-SS.webm` with file size shown

### Host controls
- First joiner is automatically the host (HOST badge on their video tile)
- Mute any individual participant
- Mute all participants at once
- Remove a participant from the call
- End the meeting for everyone
- Configurable room capacity (2–1000)

### Chat & People panel
- Real-time group chat with sender name and timestamp
- Unread message badge (resets when Chat tab is opened)
- Emoji picker with 20 emoji
- People panel shows initials avatar, mic / camera status, and raised-hand indicator
- Host sees per-participant mute and remove buttons
- Invite link button copies the full room URL to clipboard

### Settings
- Microphone, camera, and speaker device selectors (live device enumeration)
- Video quality: Auto / HD 720p / SD 360p
- Host capacity control and end-meeting button in the same modal

### Security
- CORS restricted to `CORS_ORIGIN` env var — never `*` in production
- HTTP security headers via Helmet 8 (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `HSTS`, `X-DNS-Prefetch-Control`, `X-Powered-By` removed)
- Per-socket sliding-window rate limiting on all socket events
- Canvas blobs rejected if > 5 MB
- Draw event data validated before rebroadcast (finite coords, color charset, size 1–50)
- Username length enforced server-side (max 40 chars)
- Room ID validated with `/^[\w-]{4,64}$/` on both client and server
- Socket IDs never exposed via public REST API
- IDE runs in `sandbox="allow-scripts"` iframe — no DOM or socket access
- SRI integrity hash on Font Awesome CDN link
- All dependency versions pinned exactly (no `^` ranges)

---

## 🏗️ Project structure

```
web-meet/
├── index.js                  # Express + Socket.IO server, all event handlers
├── package.json              # Pinned dependencies
├── server/
│   └── roomStore.js          # In-memory room, participant, and whiteboard state
├── tests/
│   └── roomStore.test.js     # Unit tests (node --test)
├── public/
│   ├── index.html            # Landing page
│   ├── room.html             # Meeting room UI
│   ├── js/
│   │   ├── landing.js        # Landing page logic
│   │   └── room.js           # WebRTC, signalling, all features
│   └── css/
│       └── style.css         # Google Meet-style dark theme
├── assets/
│   └── screenshots/          # README screenshots (add your own here)
├── .env.example              # Environment variable template
├── Dockerfile                # Container build
└── vercel.json               # Vercel deployment config
```

---

## 🌐 Environment variables

Copy `.env.example` to `.env` before deploying:

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
| `V` | Camera on / off |
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

- The server is stateful (in-memory `RoomStore`) — run as a **single process**. Multiple workers will split room state across processes.
- WebRTC uses a P2P mesh. Works well for 2–4 participants; beyond that, consider adding a media server (mediasoup, LiveKit).
- Only Google STUN servers are configured. Behind strict corporate NAT, calls may fail without a TURN server.
- Set `CORS_ORIGIN` to your production domain before deploying — the default `http://localhost:3000` is for local development only.
- `http://localhost` shows Chrome's "Not secure" warning — this is normal for local HTTP and does not affect any functionality.

---

## 📄 License

MIT © 2026 [Aayush63777](https://github.com/Aayush63777)
