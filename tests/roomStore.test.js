const test = require('node:test');
const assert = require('node:assert/strict');
const { RoomStore } = require('../server/roomStore');

test('joinRoom tracks participants and state', () => {
  const store = new RoomStore();
  const roomInfo = store.joinRoom({ roomId: 'room-1', socketId: 's1', username: 'Alice' });

  assert.equal(roomInfo.participantCount, 1);
  assert.equal(roomInfo.participants[0].username, 'Alice');
  assert.equal(roomInfo.participants[0].mic, 'on');
  assert.equal(roomInfo.participants[0].video, 'on');
});

test('updateParticipantState and leaveRoom keep room state in sync', () => {
  const store = new RoomStore();
  store.joinRoom({ roomId: 'room-2', socketId: 's2', username: 'Bob' });
  store.updateParticipantState('s2', { mic: 'off', video: 'off' });

  const updated = store.getRoomInfo('room-2');
  assert.equal(updated.participants[0].mic, 'off');
  assert.equal(updated.participants[0].video, 'off');

  const leftRoom = store.leaveRoom('s2');
  assert.equal(leftRoom, 'room-2');
  assert.equal(store.getRoomInfo('room-2'), null);
});
