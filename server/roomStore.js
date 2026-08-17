'use strict';

class RoomStore {
  constructor({ maxParticipantsPerRoom = 200 } = {}) {
    this.maxParticipantsPerRoom = maxParticipantsPerRoom;
    this.rooms        = new Map(); // roomId → room object
    this.socketRooms  = new Map(); // socketId → roomId
    this.socketNames  = new Map(); // socketId → username
    this.participants = new Map(); // socketId → participant
    this.roomBoard    = new Map(); // roomId → canvasDataUrl
    this.roomPasswords = new Map(); // roomId → hashed/plain password (optional)
  }

  // ── Validation ──────────────────────────────
  validateInput(roomId, socketId, username) {
    if (!roomId || typeof roomId !== 'string')       throw new Error('Invalid room ID');
    if (!socketId || typeof socketId !== 'string')   throw new Error('Invalid socket ID');
    if (!username || typeof username !== 'string' || !username.trim()) throw new Error('Invalid username');
    return true;
  }

  // ── Room creation ────────────────────────────
  createRoom(roomId, password = null) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id:           roomId,
        participants: [],
        hostSocketId: null,     // first joiner is host
        createdAt:    new Date(),
        password:     password ? String(password).slice(0, 100) : null,
      });
    }
    return this.rooms.get(roomId);
  }

  // ── Join room ────────────────────────────────
  joinRoom({ roomId, socketId, username, password = null }) {
    try {
      this.validateInput(roomId, socketId, username);

      // If room exists and has a password, validate it
      if (this.rooms.has(roomId)) {
        const existingRoom = this.rooms.get(roomId);
        if (existingRoom.password !== null) {
          const provided = password ? String(password).trim() : '';
          if (provided !== existingRoom.password) {
            return { error: 'Incorrect room password.' };
          }
        }
      }

      const room = this.createRoom(roomId, password);
      const existingParticipant = room.participants.find(p => p.socketId === socketId);

      if (room.participants.length >= this.maxParticipantsPerRoom && !existingParticipant) {
        return {
          error: `Room is full. Maximum ${this.maxParticipantsPerRoom} participants allowed.`,
          roomId,
          participantCount: room.participants.length,
          participants: this.getParticipantsInfo(roomId),
        };
      }

      if (!existingParticipant) {
        // First joiner becomes host
        const isHost = room.participants.length === 0;
        if (isHost) room.hostSocketId = socketId;

        const participant = {
          socketId,
          username: username.trim(),
          mic:      'on',
          video:    'on',
          isHost,
          joinedAt: new Date(),
        };
        room.participants.push(participant);
        this.participants.set(socketId, participant);
      }

      this.socketRooms.set(socketId, roomId);
      this.socketNames.set(socketId, username.trim());

      return this.getRoomInfo(roomId);
    } catch (error) {
      return { error: error.message };
    }
  }

  // ── Promote new host when old host leaves ────
  promoteNextHost(roomId) {
    const room = this.rooms.get(roomId);
    if (!room || room.participants.length === 0) return null;

    const nextHost = room.participants[0];
    nextHost.isHost      = true;
    room.hostSocketId    = nextHost.socketId;
    this.participants.set(nextHost.socketId, nextHost);
    return nextHost.socketId;
  }

  // ── Participant state ────────────────────────
  updateParticipantState(socketId, { mic, video } = {}) {
    try {
      const roomId = this.socketRooms.get(socketId);
      if (!roomId) return null;

      const room = this.rooms.get(roomId);
      if (!room) return null;

      const participant = room.participants.find(p => p.socketId === socketId);
      if (!participant) return null;

      if (mic   !== undefined && ['on', 'off'].includes(mic))   participant.mic   = mic;
      if (video !== undefined && ['on', 'off'].includes(video)) participant.video = video;

      this.participants.set(socketId, participant);
      return this.getRoomInfo(roomId);
    } catch (err) {
      console.error('Error updating participant state:', err);
      return null;
    }
  }

  // ── Check host ───────────────────────────────
  isHost(socketId) {
    const roomId = this.socketRooms.get(socketId);
    if (!roomId) return false;
    const room = this.rooms.get(roomId);
    return room ? room.hostSocketId === socketId : false;
  }

  // ── Whiteboard ───────────────────────────────
  setBoard(roomId, url) {
    if (!roomId) return null;
    if (!url) { this.roomBoard.delete(roomId); return null; }
    this.roomBoard.set(roomId, url);
    return url;
  }

  getBoard(roomId) {
    return this.roomBoard.get(roomId) || null;
  }

  // ── Info helpers ─────────────────────────────
  getParticipantsInfo(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return room.participants.map(p => ({
      socketId: p.socketId,
      username: p.username,
      mic:      p.mic,
      video:    p.video,
      isHost:   p.isHost || false,
    }));
  }

  getRoomInfo(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return {
      roomId,
      participantCount: room.participants.length,
      participants:     this.getParticipantsInfo(roomId),
      hostSocketId:     room.hostSocketId,
    };
  }

  getRoom(roomId)             { return this.rooms.get(roomId) || null; }
  getRoomsCount()             { return this.rooms.size; }
  getParticipantsCount(roomId){ const r = this.rooms.get(roomId); return r ? r.participants.length : 0; }

  // ── Leave room ───────────────────────────────
  leaveRoom(socketId) {
    try {
      const roomId = this.socketRooms.get(socketId);
      if (!roomId) return null;

      const room = this.rooms.get(roomId);
      if (room) {
        const wasHost = room.hostSocketId === socketId;
        room.participants = room.participants.filter(p => p.socketId !== socketId);

        if (room.participants.length === 0) {
          this.rooms.delete(roomId);
          this.roomBoard.delete(roomId);
          this.roomPasswords.delete(roomId);
        } else if (wasHost) {
          // Transfer host to next participant
          this.promoteNextHost(roomId);
        }
      }

      this.socketRooms.delete(socketId);
      this.socketNames.delete(socketId);
      this.participants.delete(socketId);

      return roomId;
    } catch (err) {
      console.error('Error leaving room:', err);
      return null;
    }
  }
}

module.exports = { RoomStore };
