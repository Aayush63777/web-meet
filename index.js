const path       = require('path');
const express    = require('express');
const http       = require('http');
const socketio   = require('socket.io');
const helmet     = require('helmet');
const { RoomStore } = require('./server/roomStore');

const PORT            = process.env.PORT || 3000;
const MAX_PARTICIPANTS = Number(process.env.MAX_PARTICIPANTS || 200);

// ── Security constants ────────────────────────────────────────
// FIX #1  CORS: read allowed origin from env; never wildcard in production
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

// FIX #8  Username: hard-limit on server (client enforces maxlength="40" too)
const MAX_USERNAME_LEN = 40;

// FIX #6  Canvas: reject blobs larger than 5 MB (base64 of a 1080p canvas)
const MAX_CANVAS_BYTES = 5_000_000;

// FIX #5  Rate limiting: max emits per socket per window
const RATE_LIMIT_WINDOW_MS = 1000;   // 1 second
const RATE_LIMITS = {
  message:      10,   // 10 chat messages / sec
  draw:         60,   // 60 draw events / sec (≈ 60 fps)
  'join room':   5,
  'store canvas': 2,
  action:        5,
  'raise hand':  5,
};

// FIX #12  Room ID: only allow URL-safe alphanumeric + hyphen, 4–64 chars
const ROOM_ID_RE = /^[\w-]{4,64}$/;

// ── App setup ────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

// FIX #4  HTTP security headers via Helmet
app.use(helmet({
  contentSecurityPolicy:      false,   // tune CSP per-deployment if needed
  crossOriginEmbedderPolicy:  false,   // required for WebRTC getUserMedia
}));
// Express emits X-Powered-By by default; remove it to avoid fingerprinting
app.disable('x-powered-by');

// FIX #1  CORS for Socket.IO
const io = socketio(server, {
  cors: {
    origin:  CORS_ORIGIN,
    methods: ['GET', 'POST'],
  },
  pingInterval: 25000,
  pingTimeout:  60000,
});

const roomStore = new RoomStore({ maxParticipantsPerRoom: MAX_PARTICIPANTS });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ── REST routes ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// FIX #11  Strip socket IDs from the public room-info response
app.get('/api/rooms/:roomId', (req, res) => {
  try {
    const { roomId } = req.params;

    // FIX #12  Validate room ID format on server
    if (!roomId || !ROOM_ID_RE.test(roomId)) {
      return res.status(400).json({ error: 'Invalid room ID' });
    }

    const roomInfo = roomStore.getRoomInfo(roomId);
    if (!roomInfo) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Return only public-safe fields — no socketIds
    const safeInfo = {
      roomId:           roomInfo.roomId,
      participantCount: roomInfo.participantCount,
      participants:     roomInfo.participants.map(p => ({
        username: p.username,
        mic:      p.mic,
        video:    p.video,
      })),
    };
    res.status(200).json(safeInfo);
  } catch (err) {
    console.error('Error fetching room info:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Rate-limiter helper ───────────────────────────────────────
// FIX #5  Simple per-socket per-event sliding counter
function makeRateLimiter() {
  // Map<socketId, Map<event, { count, resetAt }>>
  const buckets = new Map();

  function allow(socketId, event) {
    const limit = RATE_LIMITS[event];
    if (!limit) return true;                // no rule → allow

    if (!buckets.has(socketId)) buckets.set(socketId, new Map());
    const evtMap = buckets.get(socketId);

    const now = Date.now();
    const bucket = evtMap.get(event) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

    if (now > bucket.resetAt) {
      bucket.count   = 0;
      bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
    }

    bucket.count++;
    evtMap.set(event, bucket);

    return bucket.count <= limit;
  }

  function remove(socketId) { buckets.delete(socketId); }

  return { allow, remove };
}

const rateLimiter = makeRateLimiter();

// ── Socket.IO event handlers ─────────────────────────────────
io.on('connect', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // ── join room ──────────────────────────────────────────────
  socket.on('join room', (roomId, username) => {
    if (!rateLimiter.allow(socket.id, 'join room')) return;

    try {
      // FIX #12  Validate room ID on server
      if (!roomId || !ROOM_ID_RE.test(String(roomId))) {
        socket.emit('join error', 'Invalid room ID');
        return;
      }
      if (!username) {
        socket.emit('join error', 'Username is required');
        return;
      }

      // FIX #8  Enforce username length server-side
      const safeUsername = String(username).trim().slice(0, MAX_USERNAME_LEN);
      if (!safeUsername) {
        socket.emit('join error', 'Username must not be empty');
        return;
      }

      socket.join(roomId);

      const roomInfo = roomStore.joinRoom({
        roomId,
        socketId: socket.id,
        username: safeUsername,
      });

      if (roomInfo.error) {
        socket.emit('join error', roomInfo.error);
        socket.leave(roomId);
        return;
      }

      const peers = roomInfo.participants
        .filter(p => p.socketId !== socket.id)
        .map(p => p.socketId);

      socket.to(roomId).emit(
        'message',
        `${safeUsername} joined the room.`,
        'System',
        new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      );

      io.to(socket.id).emit('join room', peers, roomInfo);
      io.to(roomId).emit('room update', roomInfo);
      io.to(roomId).emit('user count', roomInfo.participantCount);

      console.log(`${safeUsername} joined room ${roomId}`);
    } catch (err) {
      console.error('Error in join room:', err);
      socket.emit('join error', 'Failed to join room');
    }
  });

  // ── set capacity ───────────────────────────────────────────
  socket.on('set capacity', (limit) => {
    try {
      const parsed = Number(limit);
      if (!Number.isNaN(parsed) && parsed >= 2 && parsed <= 1000) {
        roomStore.maxParticipantsPerRoom = parsed;
        const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
        if (roomId) io.to(roomId).emit('capacity changed', parsed);
      }
    } catch (err) {
      console.error('Error setting capacity:', err);
    }
  });

  // ── raise hand ─────────────────────────────────────────────
  socket.on('raise hand', (raised) => {
    if (!rateLimiter.allow(socket.id, 'raise hand')) return;
    try {
      const roomId = roomStore.socketRooms.get(socket.id);
      if (!roomId) return;
      socket.to(roomId).emit('raise hand', socket.id, !!raised);
    } catch (err) {
      console.error('Error handling raise hand:', err);
    }
  });

  // ── action (mic/cam/screen/rec) ────────────────────────────
  socket.on('action', (action) => {
    if (!rateLimiter.allow(socket.id, 'action')) return;
    try {
      const validActions = [
        'mute', 'unmute', 'videoon', 'videooff',
        'screenon', 'screenoff', 'recstart', 'recstop',
      ];
      if (!validActions.includes(action)) return;

      const roomId = roomStore.socketRooms.get(socket.id);
      if (!roomId) return;

      if (action === 'mute')     roomStore.updateParticipantState(socket.id, { mic: 'off' });
      if (action === 'unmute')   roomStore.updateParticipantState(socket.id, { mic: 'on'  });
      if (action === 'videoon')  roomStore.updateParticipantState(socket.id, { video: 'on'  });
      if (action === 'videooff') roomStore.updateParticipantState(socket.id, { video: 'off' });

      socket.to(roomId).emit('action', action, socket.id);
      io.to(roomId).emit('room update', roomStore.getRoomInfo(roomId));
    } catch (err) {
      console.error('Error handling action:', err);
    }
  });

  // ── WebRTC signalling ──────────────────────────────────────
  socket.on('video-offer', (offer, targetSocketId) => {
    try {
      if (!offer || !targetSocketId) return;
      const roomId          = roomStore.socketRooms.get(socket.id);
      const participantName = roomStore.socketNames.get(socket.id);
      if (roomId && participantName) {
        const roomInfo   = roomStore.getRoomInfo(roomId);
        const senderInfo = roomInfo?.participants.find(p => p.socketId === socket.id);
        const videoState = senderInfo?.video || 'on';
        socket.to(targetSocketId).emit('video-offer', offer, socket.id, participantName, videoState);
      }
    } catch (err) {
      console.error('Error handling video-offer:', err);
    }
  });

  socket.on('video-answer', (answer, targetSocketId) => {
    try {
      if (!answer || !targetSocketId) return;
      socket.to(targetSocketId).emit('video-answer', answer, socket.id);
    } catch (err) {
      console.error('Error handling video-answer:', err);
    }
  });

  socket.on('new icecandidate', (candidate, targetSocketId) => {
    try {
      if (!candidate || !targetSocketId) return;
      socket.to(targetSocketId).emit('new icecandidate', candidate, socket.id);
    } catch (err) {
      console.error('Error handling ICE candidate:', err);
    }
  });

  // ── chat message ───────────────────────────────────────────
  socket.on('message', (message, roomId) => {
    if (!rateLimiter.allow(socket.id, 'message')) return;
    try {
      if (!message || !roomId) return;

      // FIX #12  Validate room ID before use
      if (!ROOM_ID_RE.test(String(roomId))) return;

      const username         = roomStore.socketNames.get(socket.id) || 'Unknown';
      const sanitizedMessage = String(message).slice(0, 1000).trim();
      if (!sanitizedMessage) return;

      io.to(roomId).emit(
        'message',
        sanitizedMessage,
        username,
        new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      );
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });

  // ── whiteboard ─────────────────────────────────────────────
  socket.on('getCanvas', () => {
    try {
      const roomId = roomStore.socketRooms.get(socket.id);
      if (roomId) {
        const board = roomStore.getBoard(roomId);
        if (board) socket.emit('getCanvas', board);
      }
    } catch (err) {
      console.error('Error getting canvas:', err);
    }
  });

  // FIX #7  Validate draw data before rebroadcasting
  socket.on('draw', (data) => {
    if (!rateLimiter.allow(socket.id, 'draw')) return;
    try {
      if (!data || typeof data !== 'object') return;

      const { x, y, prevX, prevY, color, size } = data;

      // All coordinates must be finite numbers
      if ([x, y, prevX, prevY].some(v => typeof v !== 'number' || !isFinite(v))) return;

      // FIX #7  Color: string, max 30 chars, only safe CSS color characters
      if (typeof color !== 'string' || color.length > 30 || !/^[#\w()%,.\s]+$/.test(color)) return;

      // FIX #7  Size: number, constrained range
      if (typeof size !== 'number' || size < 1 || size > 50) return;

      const roomId = roomStore.socketRooms.get(socket.id);
      if (roomId) {
        socket.to(roomId).emit('draw', { x, y, prevX, prevY, color, size });
      }
    } catch (err) {
      console.error('Error handling draw:', err);
    }
  });

  socket.on('clearBoard', () => {
    try {
      const roomId = roomStore.socketRooms.get(socket.id);
      if (roomId) {
        socket.to(roomId).emit('clearBoard');
        roomStore.setBoard(roomId, null);
      }
    } catch (err) {
      console.error('Error clearing board:', err);
    }
  });

  // FIX #6  Reject oversized canvas blobs
  socket.on('store canvas', (canvasUrl) => {
    if (!rateLimiter.allow(socket.id, 'store canvas')) return;
    try {
      if (typeof canvasUrl !== 'string') return;
      if (canvasUrl.length > MAX_CANVAS_BYTES) {
        console.warn(`store canvas rejected: ${canvasUrl.length} bytes from ${socket.id}`);
        return;
      }
      const roomId = roomStore.socketRooms.get(socket.id);
      if (roomId) roomStore.setBoard(roomId, canvasUrl);
    } catch (err) {
      console.error('Error storing canvas:', err);
    }
  });

  // ── disconnect ─────────────────────────────────────────────
  socket.on('disconnect', () => {
    try {
      const leavingName = roomStore.socketNames.get(socket.id) || 'A user';
      const roomId      = roomStore.leaveRoom(socket.id);
      rateLimiter.remove(socket.id);   // FIX #5  clean up rate-limit state
      if (!roomId) return;

      socket.to(roomId).emit(
        'message',
        `${leavingName} left the room.`,
        'System',
        new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      );
      socket.to(roomId).emit('remove peer', socket.id);

      const updatedRoom = roomStore.getRoomInfo(roomId);
      if (updatedRoom) {
        io.to(roomId).emit('room update', updatedRoom);
        io.to(roomId).emit('user count', updatedRoom.participantCount);
      }

      console.log(`${leavingName} disconnected from room ${roomId}`);
    } catch (err) {
      console.error('Error handling disconnect:', err);
    }
  });

  socket.on('error', (err) => {
    console.error(`Socket error for ${socket.id}:`, err);
  });
});

// ── Express error handler ────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Express error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║          🎥 QuickMeet Server Started          ║
║          Server running on port ${PORT}         ║
║          http://localhost:${PORT}                 ║
╚════════════════════════════════════════════════╝
  `);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM: closing HTTP server');
  server.close(() => { console.log('HTTP server closed'); process.exit(0); });
});

module.exports = app;
