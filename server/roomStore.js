class RoomStore {
  constructor({ maxParticipantsPerRoom = 200 } = {}) {
    this.maxParticipantsPerRoom = maxParticipantsPerRoom;
    this.rooms = new Map();
    this.socketRooms = new Map();
    this.socketNames = new Map();
    this.participants = new Map();
    this.roomBoard = new Map();
  }

  validateInput(roomId, socketId, username) {
    if (!roomId || typeof roomId !== 'string') {
      throw new Error('Invalid room ID');
    }
    if (!socketId || typeof socketId !== 'string') {
      throw new Error('Invalid socket ID');
    }
    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      throw new Error('Invalid username');
    }
    return true;
  }

  createRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        participants: [],
        createdAt: new Date(),
      });
    }
    return this.rooms.get(roomId);
  }

  joinRoom({ roomId, socketId, username }) {
    try {
      this.validateInput(roomId, socketId, username);

      const room = this.createRoom(roomId);
      const existingParticipant = room.participants.find((p) => p.socketId === socketId);

      if (room.participants.length >= this.maxParticipantsPerRoom && !existingParticipant) {
        return {
          error: `Room is full. Maximum ${this.maxParticipantsPerRoom} participants allowed.`,
          roomId,
          participantCount: room.participants.length,
          participants: this.getParticipantsInfo(roomId),
        };
      }

      if (!existingParticipant) {
        const participant = {
          socketId,
          username: username.trim(),
          mic: 'on',
          video: 'on',
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

  updateParticipantState(socketId, { mic, video }) {
    try {
      const roomId = this.socketRooms.get(socketId);
      if (!roomId) return null;

      const room = this.rooms.get(roomId);
      if (!room) return null;

      const participant = room.participants.find((p) => p.socketId === socketId);
      if (!participant) return null;

      if (mic !== undefined && ['on', 'off'].includes(mic)) {
        participant.mic = mic;
      }
      if (video !== undefined && ['on', 'off'].includes(video)) {
        participant.video = video;
      }

      this.participants.set(socketId, participant);
      return this.getRoomInfo(roomId);
    } catch (error) {
      console.error('Error updating participant state:', error);
      return null;
    }
  }

  getParticipantsInfo(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    return room.participants.map((participant) => ({
      socketId: participant.socketId,
      username: participant.username,
      mic: participant.mic,
      video: participant.video,
    }));
  }

  setBoard(roomId, url) {
    if (!roomId || !url) return null;
    this.roomBoard.set(roomId, url);
    return url;
  }

  getBoard(roomId) {
    return this.roomBoard.get(roomId) || null;
  }

  getRoomInfo(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    return {
      roomId,
      participantCount: room.participants.length,
      participants: this.getParticipantsInfo(roomId),
    };
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  leaveRoom(socketId) {
    try {
      const roomId = this.socketRooms.get(socketId);
      if (!roomId) return null;

      const room = this.rooms.get(roomId);
      if (room) {
        room.participants = room.participants.filter(
          (participant) => participant.socketId !== socketId
        );
        
        if (room.participants.length === 0) {
          this.rooms.delete(roomId);
          this.roomBoard.delete(roomId);
        }
      }

      this.socketRooms.delete(socketId);
      this.socketNames.delete(socketId);
      this.participants.delete(socketId);

      return roomId;
    } catch (error) {
      console.error('Error leaving room:', error);
      return null;
    }
  }

  getRoomsCount() {
    return this.rooms.size;
  }

  getParticipantsCount(roomId) {
    const room = this.rooms.get(roomId);
    return room ? room.participants.length : 0;
  }
}

module.exports = {
  RoomStore,
};
