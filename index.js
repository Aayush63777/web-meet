'use strict';

const path     = require('path');
const express  = require('express');
const http     = require('http');
const socketio = require('socket.io');
const helmet   = require('helmet');
const { RoomStore } = require('./server/roomStore');

const PORT             = process.env.PORT || 3000;
const MAX_PARTICIPANTS = Number(process.env.MAX_PARTICIPANTS || 200);
const CORS_ORIGIN      = process.env.CORS_ORIGIN || 'http://localhost:3000';
const MAX_USERNAME_LEN = 40;
const MAX_CANVAS_BYTES = 5_000_000;
const ROOM_ID_RE       = /^[\w-]{4,64}$/;

const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMITS = {
  message:        10,
  draw:           60,
  'join room':     5,
  'store canvas':  2,
  action:          5,
  'raise hand':    5,
  'host action':  10,
};

// ── App setup ────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

app.use(helmet({
  contentSecurityPolicy:     false,
  crossOriginEmbedderPolicy: false,
}));
app.disable('x-powered-by');

const io = socketio(server, {
  cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] },
  pingInterval: 25000,
  pingTimeout:  60000,
});

const roomStore = new RoomStore({ maxParticipantsPerRoom: MAX_PARTICIPANTS });

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma',  'no-cache');
      res.setHeader('Expires', '0');
    }
  },
}));
app.use(express.json());
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// ── REST routes ──────────────────────────────────────────────
app.get('/api/health', (_req, res) =>
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() })
);

app.get('/api/rooms/:roomId', (req, res) => {
  try {
    const { roomId } = req.params;
    if (!roomId || !ROOM_ID_RE.test(roomId))
      return res.status(400).json({ error: 'Invalid room ID' });

    const roomInfo = roomStore.getRoomInfo(roomId);
    if (!roomInfo)
      return res.status(404).json({ error: 'Room not found' });

    res.status(200).json({
      roomId:           roomInfo.roomId,
      participantCount: roomInfo.participantCount,
      participants:     roomInfo.participants.map(p => ({
        username: p.username,
        mic:      p.mic,
        video:    p.video,
        isHost:   p.isHost,
      })),
    });
  } catch (err) {
    console.error('Error fetching room info:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Rate-limiter ──────────────────────────────────────────────
function makeRateLimiter() {
  const buckets = new Map();
  function allow(socketId, event) {
    const limit = RATE_LIMITS[event];
    if (!limit) return true;
    if (!buckets.has(socketId)) buckets.set(socketId, new Map());
    const evtMap = buckets.get(socketId);
    const now    = Date.now();
    const bucket = evtMap.get(event) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    if (now > bucket.resetAt) { bucket.count = 0; bucket.resetAt = now + RATE_LIMIT_WINDOW_MS; }
    bucket.count++;
    evtMap.set(event, bucket);
    return bucket.count <= limit;
  }
  function remove(socketId) { buckets.delete(socketId); }
  return { allow, remove };
}
const rateLimiter = makeRateLimiter();

// ── Helpers ──────────────────────────────────────────────────
function ts() {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ── Socket.IO ─────────────────────────────────────────────────
io.on('connect', socket => {
  console.log(`User connected: ${socket.id}`);

  // ── join room ──────────────────────────────
  socket.on('join room', (roomId, username, password) => {
    if (!rateLimiter.allow(socket.id, 'join room')) return;
    try {
      if (!roomId || !ROOM_ID_RE.test(String(roomId))) {
        socket.emit('join error', 'Invalid room ID'); return;
      }
      if (!username) { socket.emit('join error', 'Username is required'); return; }

      const safeUsername = String(username).trim().slice(0, MAX_USERNAME_LEN);
      if (!safeUsername) { socket.emit('join error', 'Username must not be empty'); return; }

      socket.join(roomId);
      const roomInfo = roomStore.joinRoom({
        roomId, socketId: socket.id, username: safeUsername, password,
      });

      if (roomInfo.error) {
        socket.emit('join error', roomInfo.error);
        socket.leave(roomId);
        return;
      }

      const peers = roomInfo.participants
        .filter(p => p.socketId !== socket.id)
        .map(p => p.socketId);

      socket.to(roomId).emit('message', `${safeUsername} joined the room.`, 'System', ts());
      io.to(socket.id).emit('join room', peers, roomInfo);
      io.to(roomId).emit('room update', roomInfo);
      io.to(roomId).emit('user count', roomInfo.participantCount);
      // Tell this socket whether they are host
      socket.emit('host status', roomInfo.hostSocketId === socket.id);
      console.log(`${safeUsername} joined room ${roomId}`);
    } catch (err) {
      console.error('Error in join room:', err);
      socket.emit('join error', 'Failed to join room');
    }
  });

  // ── set capacity ───────────────────────────
  socket.on('set capacity', limit => {
    try {
      if (!roomStore.isHost(socket.id)) return; // host only
      const parsed = Number(limit);
      if (!isNaN(parsed) && parsed >= 2 && parsed <= 1000) {
        roomStore.maxParticipantsPerRoom = parsed;
        const roomId = roomStore.socketRooms.get(socket.id);
        if (roomId) io.to(roomId).emit('capacity changed', parsed);
      }
    } catch (err) { console.error('Error setting capacity:', err); }
  });

  // ── raise hand ─────────────────────────────
  socket.on('raise hand', raised => {
    if (!rateLimiter.allow(socket.id, 'raise hand')) return;
    try {
      const roomId = roomStore.socketRooms.get(socket.id);
      if (!roomId) return;
      socket.to(roomId).emit('raise hand', socket.id, !!raised);
    } catch (err) { console.error('Error handling raise hand:', err); }
  });

  // ── action ────────────────────────────────
  socket.on('action', action => {
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
    } catch (err) { console.error('Error handling action:', err); }
  });

  // ── HOST ACTIONS ────────────────────────────
  socket.on('host action', ({ action, targetId }) => {
    if (!rateLimiter.allow(socket.id, 'host action')) return;
    try {
      if (!roomStore.isHost(socket.id)) {
        socket.emit('host error', 'Only the host can perform this action.');
        return;
      }
      const roomId = roomStore.socketRooms.get(socket.id);
      if (!roomId) return;

      if (action === 'mute-participant' && targetId) {
        // Force-mute a specific participant
        roomStore.updateParticipantState(targetId, { mic: 'off' });
        io.to(targetId).emit('forced-mute');
        socket.to(roomId).emit('action', 'mute', targetId);
        io.to(roomId).emit('room update', roomStore.getRoomInfo(roomId));

      } else if (action === 'remove-participant' && targetId) {
        // Kick a participant
        const targetName = roomStore.socketNames.get(targetId) || 'Participant';
        io.to(targetId).emit('kicked', 'You have been removed from the meeting by the host.');
        io.to(roomId).emit('message', `${targetName} was removed by the host.`, 'System', ts());
        // Actual socket disconnect is handled by client on receiving 'kicked'

      } else if (action === 'mute-all') {
        // Mute everyone except host
        const roomInfo = roomStore.getRoomInfo(roomId);
        if (roomInfo) {
          roomInfo.participants.forEach(p => {
            if (p.socketId !== socket.id) {
              roomStore.updateParticipantState(p.socketId, { mic: 'off' });
              io.to(p.socketId).emit('forced-mute');
            }
          });
          io.to(roomId).emit('room update', roomStore.getRoomInfo(roomId));
          io.to(roomId).emit('message', 'All participants have been muted by the host.', 'System', ts());
        }

      } else if (action === 'end-meeting') {
        // End meeting for all
        io.to(roomId).emit('meeting-ended', 'The host has ended the meeting.');
      }
    } catch (err) { console.error('Error handling host action:', err); }
  });

  // ── WebRTC signalling ───────────────────────
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
    } catch (err) { console.error('Error handling video-offer:', err); }
  });

  socket.on('video-answer', (answer, targetSocketId) => {
    try {
      if (!answer || !targetSocketId) return;
      socket.to(targetSocketId).emit('video-answer', answer, socket.id);
    } catch (err) { console.error('Error handling video-answer:', err); }
  });

  socket.on('new icecandidate', (candidate, targetSocketId) => {
    try {
      if (!candidate || !targetSocketId) return;
      socket.to(targetSocketId).emit('new icecandidate', candidate, socket.id);
    } catch (err) { console.error('Error handling ICE candidate:', err); }
  });

  // ── chat ────────────────────────────────────
  socket.on('message', (message, roomId) => {
    if (!rateLimiter.allow(socket.id, 'message')) return;
    try {
      if (!message || !roomId) return;
      if (!ROOM_ID_RE.test(String(roomId))) return;
      const uname = roomStore.socketNames.get(socket.id) || 'Unknown';
      const msg   = String(message).slice(0, 1000).trim();
      if (!msg) return;
      io.to(roomId).emit('message', msg, uname, ts());
    } catch (err) { console.error('Error handling message:', err); }
  });

  // ── whiteboard ──────────────────────────────
  socket.on('getCanvas', () => {
    try {
      const roomId = roomStore.socketRooms.get(socket.id);
      if (roomId) {
        const board = roomStore.getBoard(roomId);
        if (board) socket.emit('getCanvas', board);
      }
    } catch (err) { console.error('Error getting canvas:', err); }
  });

  socket.on('draw', data => {
    if (!rateLimiter.allow(socket.id, 'draw')) return;
    try {
      if (!data || typeof data !== 'object') return;
      const { x, y, prevX, prevY, color, size } = data;
      if ([x, y, prevX, prevY].some(v => typeof v !== 'number' || !isFinite(v))) return;
      if (typeof color !== 'string' || color.length > 30 || !/^[#\w()%,.\s]+$/.test(color)) return;
      if (typeof size  !== 'number' || size < 1 || size > 50) return;
      const roomId = roomStore.socketRooms.get(socket.id);
      if (roomId) socket.to(roomId).emit('draw', { x, y, prevX, prevY, color, size });
    } catch (err) { console.error('Error handling draw:', err); }
  });

  socket.on('clearBoard', () => {
    try {
      const roomId = roomStore.socketRooms.get(socket.id);
      if (roomId) {
        socket.to(roomId).emit('clearBoard');
        roomStore.setBoard(roomId, null);
      }
    } catch (err) { console.error('Error clearing board:', err); }
  });

  // Relay whiteboard text events
  socket.on('draw-text', data => {
    try {
      if (!data || typeof data !== 'object') return;
      const { x, y, text, color, size } = data;
      if (typeof x !== 'number' || typeof y !== 'number') return;
      if (typeof text !== 'string' || text.length > 200) return;
      if (typeof color !== 'string' || color.length > 30) return;
      const roomId = roomStore.socketRooms.get(socket.id);
      if (roomId) socket.to(roomId).emit('draw-text', { x, y, text, color, size });
    } catch (err) { console.error('Error handling draw-text:', err); }
  });

  socket.on('store canvas', canvasUrl => {
    if (!rateLimiter.allow(socket.id, 'store canvas')) return;
    try {
      if (typeof canvasUrl !== 'string') return;
      if (canvasUrl.length > MAX_CANVAS_BYTES) return;
      const roomId = roomStore.socketRooms.get(socket.id);
      if (roomId) roomStore.setBoard(roomId, canvasUrl);
    } catch (err) { console.error('Error storing canvas:', err); }
  });

  // ── disconnect ──────────────────────────────
  socket.on('disconnect', () => {
    try {
      const leavingName = roomStore.socketNames.get(socket.id) || 'A user';
      const roomId      = roomStore.leaveRoom(socket.id);
      rateLimiter.remove(socket.id);
      if (!roomId) return;

      socket.to(roomId).emit('message', `${leavingName} left the room.`, 'System', ts());
      socket.to(roomId).emit('remove peer', socket.id);

      const updatedRoom = roomStore.getRoomInfo(roomId);
      if (updatedRoom) {
        io.to(roomId).emit('room update', updatedRoom);
        io.to(roomId).emit('user count', updatedRoom.participantCount);
        // Notify new host if changed
        if (updatedRoom.hostSocketId) {
          io.to(updatedRoom.hostSocketId).emit('host status', true);
        }
      }
      console.log(`${leavingName} disconnected from room ${roomId}`);
    } catch (err) { console.error('Error handling disconnect:', err); }
  });

  socket.on('error', err => console.error(`Socket error ${socket.id}:`, err));
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

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌  Port ${PORT} is already in use.\n    Kill it: npx kill-port ${PORT}\n    Or: PORT=3001 npm start\n`);
    process.exit(1);
  } else { throw err; }
});

process.on('SIGTERM', () => {
  console.log('SIGTERM: closing HTTP server');
  server.close(() => { console.log('Server closed'); process.exit(0); });
});

module.exports = app;
