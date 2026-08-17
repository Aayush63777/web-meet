// ─────────────────────────────────────────────
// socket MUST be first — everything below uses it
// ─────────────────────────────────────────────
const socket = io({
    reconnection:        true,
    reconnectionDelay:   1000,
    reconnectionDelayMax:5000,
    reconnectionAttempts:10,
});
// Raise EventEmitter listener limits on all Socket.IO internal objects.
// Called immediately AND on connect because engine is only available after connect.
function raiseSocketListenerLimits() {
    [socket, socket.io, socket.io?.engine, socket.io?.engine?.transport]
        .forEach(t => {
            if (t && typeof t.setMaxListeners === 'function') t.setMaxListeners(50);
            if (t && t.emitter && typeof t.emitter.setMaxListeners === 'function') t.emitter.setMaxListeners(50);
        });
}
raiseSocketListenerLimits();
socket.on('connect', () => {
    // Re-run after connect — engine.transport is now available
    raiseSocketListenerLimits();
    console.log('Socket connected:', socket.id);
});

// ── DOM ──────────────────────────────────────
const myvideo          = document.querySelector('#vd1');
const urlParams        = new URLSearchParams(window.location.search);
const roomid           = urlParams.get('room') || '';

// FIX #12  Validate room ID on client — same regex as server
// Allows alphanumeric, hyphens, underscores, 4–64 chars
if (!roomid || !/^[\w-]{4,64}$/.test(roomid)) {
    window.location.href = '/';
}
const chatRoom         = document.querySelector('.chat-cont');
const sendButton       = document.querySelector('.chat-send');
const messageField     = document.querySelector('.chat-input');
const videoContainer   = document.querySelector('#vcont');
const attendeeList     = document.querySelector('#attendee-list');
const capacityInfo     = document.querySelector('#capacity-info');
const capacityInput    = document.querySelector('#capacity-input');
const capacityApplyBtn = document.querySelector('#capacity-apply');
const overlayContainer = document.querySelector('#overlay');
const continueButt     = document.querySelector('.continue-name');
const nameField        = document.querySelector('#name-field');
const videoButt        = document.querySelector('.novideo');
const audioButt        = document.querySelector('.audio');
const cutCall          = document.querySelector('.cutcall');
const screenShareButt  = document.querySelector('.screenshare');
const whiteboardButt   = document.querySelector('.board-icon');
const raiseHandButt    = document.querySelector('.raise-hand');
const recordBtn        = document.querySelector('.record-btn');
const emojiBtn         = document.querySelector('.emoji-btn');
const mobileMenuBtn    = document.querySelector('.mobile-menu-btn');
const mobileSheet      = document.querySelector('#mobile-sheet');
const mobileSheetClose = document.querySelector('#mobile-sheet-close');
const reconnectBanner  = document.querySelector('#reconnect-banner');
const roomCodeChip     = document.querySelector('.roomcode-chip');
const meetingStatus    = document.querySelector('.meeting-status');
const mymuteicon       = document.querySelector('#mymuteicon');
const myvideooff       = document.querySelector('#myvideooff');
const chatTab          = document.querySelector('.chats');
const peopleTab        = document.querySelector('.attendies');
const chatPanel        = document.querySelector('.chat-cont-wrap');
const peoplePanel      = document.querySelector('.attendee-list-panel');
const unreadBadge      = document.querySelector('.unread-badge');

// ── Whiteboard ───────────────────────────────
const whiteboardCont = document.querySelector('#whiteboard-cont');
const canvas         = document.querySelector('#whiteboard');
const ctx            = canvas.getContext('2d');

// ── State ────────────────────────────────────
let username           = '';
let boardVisible       = false;
let videoAllowed       = true;
let audioAllowed       = true;
let screenshareEnabled = false;
let handRaised         = false;
let isRecording        = false;
let mediaRecorder      = null;
let recordedChunks     = [];
let isDrawing          = false;
let lastX = 0, lastY  = 0;
let drawColor          = 'black';
let drawSize           = 3;
let mystream           = null;
let canvasSaveTimer    = null;   // throttle for toDataURL
let pinnedSid          = null;   // currently pinned participant
let unreadCount        = 0;
let chatVisible        = true;

let micInfo        = {};
let videoInfo      = {};
let handInfo       = {};          // sid → boolean
let cName          = {};
let audioTrackSent = {};
let videoTrackSent = {};
let connections    = {};

// ── Config ───────────────────────────────────
const configuration    = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};
const mediaConstraints = { video: true, audio: true };

// ═══════════════════════════════════════════════
// UTILITY HELPERS
// ═══════════════════════════════════════════════
function fitCanvas() {
    canvas.style.width  = '100%';
    canvas.style.height = '100%';
    canvas.width        = canvas.offsetWidth;
    canvas.height       = canvas.offsetHeight;
}

function updateMeetingStatus(roomInfo) {
    const count = roomInfo?.participantCount ?? 0;
    if (meetingStatus) meetingStatus.textContent = count;
    if (roomCodeChip)  roomCodeChip.textContent  = roomid;
    const toolbarCode = document.querySelector('#toolbar-roomcode');
    if (toolbarCode) toolbarCode.textContent = roomid;
}

// renderAttendees is defined later (extended version with host controls)
// This stub is replaced by the full implementation below
function _renderAttendeesStub(participants = []) {}

function createVideoElement(sid, uname, micState, vidState) {
    const box = document.createElement('div');
    box.id = sid;
    box.classList.add('video-box');

    const vid = document.createElement('video');
    vid.id          = `video${sid}`;
    vid.classList.add('video-frame');
    vid.autoplay    = true;
    vid.playsinline = true;

    // name tag
    const tag = document.createElement('div');
    tag.classList.add('nametag');
    tag.textContent = uname || '';

    // mute indicator
    const muteEl = document.createElement('div');
    muteEl.classList.add('mute-icon');
    muteEl.id = `mute${sid}`;
    muteEl.innerHTML = '<i class="fas fa-microphone-slash"></i>';
    muteEl.style.visibility = micState === 'on' ? 'hidden' : 'visible';

    // video-off overlay — same structure as local tile
    const vidOffEl = document.createElement('div');
    vidOffEl.classList.add('video-off');
    vidOffEl.id = `vidoff${sid}`;
    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('video-avatar');
    const initials = (uname || 'P').slice(0, 2).toUpperCase();
    avatarDiv.textContent = initials;
    const colors = ['#4285f4','#ea4335','#34a853','#fbbc04','#9b59b6','#fa7b17','#e91e63','#00bcd4'];
    avatarDiv.style.background = colors[(uname || '').charCodeAt(0) % colors.length];
    const camLabel = document.createElement('span');
    camLabel.classList.add('cam-off-label');
    camLabel.textContent = 'Camera off';
    vidOffEl.appendChild(avatarDiv);
    vidOffEl.appendChild(camLabel);
    vidOffEl.style.visibility = vidState === 'on' ? 'hidden' : 'visible';

    // raised hand badge
    const handEl = document.createElement('div');
    handEl.classList.add('hand-badge');
    handEl.id = `hand${sid}`;
    handEl.textContent = '✋';
    handEl.style.display = handInfo[sid] ? 'flex' : 'none';

    // pin button
    const pinBtn = document.createElement('button');
    pinBtn.classList.add('pin-btn');
    pinBtn.innerHTML = '<i class="fas fa-thumbtack"></i>';
    pinBtn.title = 'Pin participant';
    pinBtn.addEventListener('click', () => togglePin(sid));

    box.appendChild(vid);
    box.appendChild(tag);
    box.appendChild(muteEl);
    box.appendChild(vidOffEl);
    box.appendChild(handEl);
    box.appendChild(pinBtn);

    return { container: box, video: vid };
}

function handleMediaError(err) {
    console.error('Media error:', err.name, err.message);
    if (err.name === 'NotFoundError') {
        showToast('No camera or microphone found.', 'error');
    } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showToast('Camera/microphone permission denied.', 'error');
    } else {
        console.warn('Media unavailable:', err.message);
    }
}

// ═══════════════════════════════════════════════
// TOAST NOTIFICATION (Google Meet-style)
// ═══════════════════════════════════════════════
function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-show'); }, 10);
    setTimeout(() => {
        toast.classList.remove('toast-show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ═══════════════════════════════════════════════
// PIN / SPOTLIGHT
// ═══════════════════════════════════════════════
function togglePin(sid) {
    if (pinnedSid === sid) {
        // unpin
        pinnedSid = null;
        videoContainer.classList.remove('has-pinned');
        document.querySelectorAll('.video-box').forEach(b => {
            b.classList.remove('pinned', 'unpinned');
        });
    } else {
        pinnedSid = sid;
        videoContainer.classList.add('has-pinned');
        document.querySelectorAll('.video-box').forEach(b => {
            if (b.id === sid) {
                b.classList.add('pinned');
                b.classList.remove('unpinned');
            } else {
                b.classList.add('unpinned');
                b.classList.remove('pinned');
            }
        });
        showToast(`Pinned ${cName[sid] || 'participant'}`);
    }
}

// ═══════════════════════════════════════════════
// TAB SWITCHING (Chat ↔ People)
// ═══════════════════════════════════════════════
function switchTab(tab) {
    if (!chatTab || !peopleTab) return;
    if (tab === 'chat') {
        chatPanel?.classList.remove('hidden');
        peoplePanel?.classList.add('hidden');
        chatTab.classList.add('active-tab');
        peopleTab.classList.remove('active-tab');
        // reset unread count when chat is viewed
        unreadCount = 0;
        if (unreadBadge) { unreadBadge.textContent = ''; unreadBadge.style.display = 'none'; }
        chatVisible = true;
    } else {
        chatPanel?.classList.add('hidden');
        peoplePanel?.classList.remove('hidden');
        peopleTab.classList.add('active-tab');
        chatTab.classList.remove('active-tab');
        chatVisible = false;
    }
}

if (chatTab)    chatTab.addEventListener('click',    () => switchTab('chat'));
if (peopleTab)  peopleTab.addEventListener('click',  () => switchTab('people'));

// ═══════════════════════════════════════════════
// SOCKET: connection status
// ═══════════════════════════════════════════════
socket.on('disconnect', () => {
    showToast('Disconnected from server. Reconnecting…', 'error');
});
socket.on('connect_error', err => {
    console.error('Socket connection error:', err.message);
});

// ── Whiteboard initialise ────────────────────
// starts hidden (no wb-visible class)
fitCanvas();
window.addEventListener('resize', fitCanvas);

socket.on('getCanvas', url => {
    if (!url) return;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = url;
});
socket.on('clearBoard', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});
socket.on('draw', data => {
    if (!data || typeof data !== 'object') return;
    ctx.strokeStyle = data.color || 'black';
    ctx.lineWidth   = data.size  || 3;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(data.prevX, data.prevY);
    ctx.lineTo(data.x,     data.y);
    ctx.stroke();
    ctx.closePath();
});

// ── throttled canvas save (max once per 600ms) ──
function scheduleSaveCanvas() {
    if (canvasSaveTimer) return;
    canvasSaveTimer = setTimeout(() => {
        socket.emit('store canvas', canvas.toDataURL());
        canvasSaveTimer = null;
    }, 600);
}

// ── mouse drawing ──
function startDraw(x, y) { lastX = x; lastY = y; isDrawing = true; }
function moveDraw(x, y) {
    if (!isDrawing) return;
    ctx.strokeStyle = drawColor; ctx.lineWidth = drawSize;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(x, y);
    ctx.stroke(); ctx.closePath();
    socket.emit('draw', { x, y, prevX: lastX, prevY: lastY, color: drawColor, size: drawSize });
    lastX = x; lastY = y;
    scheduleSaveCanvas();
}
function stopDraw() { isDrawing = false; }

canvas.addEventListener('mousedown', e => {
    // Use window.startDraw so whiteboard undo/redo patching works
    (window.startDraw || startDraw)(e.offsetX, e.offsetY);
});
canvas.addEventListener('mousemove', e => moveDraw(e.offsetX, e.offsetY));
window.addEventListener('mouseup',   () => stopDraw());

// ── touch drawing ──
function getTouchPos(e) {
    const r = canvas.getBoundingClientRect();
    const t = e.touches[0];
    return { x: t.clientX - r.left, y: t.clientY - r.top };
}
canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const p = getTouchPos(e);
    (window.startDraw || startDraw)(p.x, p.y);
}, { passive: false });
canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const p = getTouchPos(e);
    moveDraw(p.x, p.y);
}, { passive: false });
canvas.addEventListener('touchend', e => { e.preventDefault(); stopDraw(); }, { passive: false });

// called from HTML onclick — also marks the swatch as selected
function setColor(c) {
    drawColor = c;
    drawSize  = Number(document.getElementById('wb-size')?.value || 3);
    // Mark matching swatch selected
    document.querySelectorAll('.wb-swatch').forEach(sw => {
        const attr = sw.getAttribute('onclick') || '';
        const m    = attr.match(/setColor\('([^']+)'\)/);
        if (m) {
            sw.dataset.color = m[1];
            sw.classList.toggle('selected', m[1] === c);
        }
    });
    // Switch to pen tool
    if (typeof window.setWbTool === 'function') window.setWbTool('pen');
}
function setEraser() {
    if (typeof window.setWbTool === 'function') {
        window.setWbTool('eraser');
    } else {
        drawColor = 'white';
        drawSize  = 14;
    }
}
function clearBoard() {
    if (!window.confirm('Clear the board? This cannot be undone.')) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    socket.emit('clearBoard');
    socket.emit('store canvas', canvas.toDataURL());
}
function CopyClassText() {
    // grab from toolbar roomcode first, then topbar chip
    const text = document.querySelector('#toolbar-roomcode')?.textContent?.trim()
              || document.querySelector('.roomcode-chip')?.textContent?.trim()
              || roomid;
    navigator.clipboard.writeText(text).then(() => {
        // flash all copy buttons
        document.querySelectorAll('.copycode-button, .chip-copy-btn').forEach(btn => {
            const orig = btn.innerHTML;
            btn.innerHTML = '✓';
            setTimeout(() => { btn.innerHTML = orig; }, 2000);
        });
        showToast('Room code copied!');
    }).catch(() => { showToast('Could not copy room code.', 'error'); });
}

// ═══════════════════════════════════════════════
// CAPACITY CONTROLS
// ═══════════════════════════════════════════════
updateMeetingStatus({ participantCount: 0 });
if (mymuteicon) mymuteicon.style.visibility = 'hidden';
if (myvideooff) myvideooff.style.visibility = 'hidden';

if (capacityApplyBtn && capacityInput) {
    capacityApplyBtn.addEventListener('click', () => {
        const v = parseInt(capacityInput.value, 10);
        if (!isNaN(v) && v >= 2 && v <= 1000) {
            socket.emit('set capacity', v);
            if (capacityInfo) capacityInfo.textContent = `Max ${v}`;
            showToast(`Room capacity set to ${v}`);
        }
    });
}

// BUG FIX: listen for capacity changes from server
socket.on('capacity changed', limit => {
    if (capacityInfo) capacityInfo.textContent = `Max ${limit}`;
    if (capacityInput) capacityInput.value = limit;
    showToast(`Room capacity updated to ${limit}`);
});

// ═══════════════════════════════════════════════
// JOIN ROOM – continue button
// ═══════════════════════════════════════════════
continueButt.addEventListener('click', () => {
    const name = nameField.value.trim();
    if (!name) { nameField.focus(); return; }

    username = name;
    overlayContainer.style.display    = 'none';
    overlayContainer.style.visibility = 'hidden';

    const mynameEl = document.querySelector('#myname');
    if (mynameEl) mynameEl.textContent = `${username} (You)`;

    const avatarEl = document.querySelector('#my-avatar');
    if (avatarEl) {
        avatarEl.textContent = username.slice(0, 2).toUpperCase();
        const colors = ['#4285f4','#ea4335','#34a853','#fbbc04','#9b59b6','#fa7b17','#e91e63','#00bcd4'];
        avatarEl.style.background = colors[username.charCodeAt(0) % colors.length];
    }

    // Read optional password from URL (?pwd=) OR from the overlay input field
    const roomPasswordField = document.querySelector('#room-password');
    const urlPwd = urlParams.get('pwd') || '';
    const overlayPwd = roomPasswordField ? roomPasswordField.value.trim() : '';
    const roomPassword = overlayPwd || urlPwd || null;
    socket.emit('join room', roomid, username, roomPassword || null);
});

nameField.addEventListener('keypress', e => {
    if (e.key === 'Enter') continueButt.click();
});

socket.on('join error', msg => {
    console.error('Join error:', msg);
    // BUG FIX: restore overlay with display:'flex' for proper centering
    overlayContainer.style.display    = 'flex';
    overlayContainer.style.visibility = 'visible';
    continueButt.disabled    = false;
    continueButt.textContent = 'Join Meeting';
    showToast(`Could not join: ${msg}`, 'error');
});

// ═══════════════════════════════════════════════
// USER COUNT
// ═══════════════════════════════════════════════
socket.on('user count', count => {
    updateMeetingStatus({ participantCount: count });
    if (videoContainer) {
        // Preserve has-pinned class — only toggle grid vs single
        if (count > 1) {
            videoContainer.classList.add('video-cont');
            videoContainer.classList.remove('video-cont-single');
        } else {
            videoContainer.classList.add('video-cont-single');
            videoContainer.classList.remove('video-cont');
        }
    }
});

// ═══════════════════════════════════════════════
// WebRTC HELPERS
// ═══════════════════════════════════════════════
function reportError(err) { console.error('RTC error:', err); }

async function startCall() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        myvideo.srcObject = stream;
        myvideo.muted     = true;
        mystream          = stream;

        // populate track maps for existing connections
        stream.getTracks().forEach(track => {
            Object.keys(connections).forEach(sid => {
                connections[sid].addTrack(track, stream);
                if (track.kind === 'audio') audioTrackSent[sid] = track;
                if (track.kind === 'video') videoTrackSent[sid] = track;
            });
        });
    } catch (err) {
        handleMediaError(err);
    }
}

function buildPeerConnection(sid) {
    // Close and clean up any existing connection for this sid first
    // to prevent MaxListenersExceeded from leaked RTCPeerConnection handlers
    if (connections[sid]) {
        try { connections[sid].close(); } catch (_) {}
        delete connections[sid];
    }

    const pc = new RTCPeerConnection(configuration);
    connections[sid] = pc;

    pc.onicecandidate = e => {
        if (e.candidate) socket.emit('new icecandidate', e.candidate, sid);
    };

    pc.ontrack = e => {
        if (document.getElementById(sid)) return;
        const { container, video } = createVideoElement(
            sid, cName[sid] || 'Participant',
            micInfo[sid] || 'on', videoInfo[sid] || 'on'
        );
        video.srcObject = e.streams[0];
        videoContainer.appendChild(container);
    };

    pc.onremovetrack = () => { document.getElementById(sid)?.remove(); };

    return pc;
}

// ═══════════════════════════════════════════════
// server → 'join room'
// ═══════════════════════════════════════════════
socket.on('join room', async (peerList, roomInfo) => {
    updateMeetingStatus(roomInfo);
    socket.emit('getCanvas');

    if (roomInfo?.participants) {
        renderAttendees(roomInfo.participants);
        roomInfo.participants.forEach(p => {
            if (p.socketId === socket.id) return;
            cName[p.socketId]     = p.username;
            micInfo[p.socketId]   = p.mic;
            videoInfo[p.socketId] = p.video;
        });
    }

    if (peerList && peerList.length > 0) {
        peerList.forEach(sid => {
            const pc = buildPeerConnection(sid);
            pc.onnegotiationneeded = async () => {
                try {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    socket.emit('video-offer', pc.localDescription, sid);
                } catch (err) { reportError(err); }
            };
        });
        await startCall();
    } else {
        try {
            const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
            myvideo.srcObject = stream;
            myvideo.muted     = true;
            mystream          = stream;
        } catch (err) { handleMediaError(err); }
    }
});

// ═══════════════════════════════════════════════
// server → 'video-offer'
// ═══════════════════════════════════════════════
socket.on('video-offer', async (offer, sid, remoteName, remoteVideoState) => {
    cName[sid]     = remoteName;
    micInfo[sid]   = 'on';
    videoInfo[sid] = typeof remoteVideoState === 'string' ? remoteVideoState : 'on';

    const pc = buildPeerConnection(sid);
    // attach onnegotiationneeded BEFORE setRemoteDescription
    pc.onnegotiationneeded = async () => {
        // Only create offer if we are in 'stable' state to avoid glare
        if (pc.signalingState !== 'stable') return;
        try {
            const newOffer = await pc.createOffer();
            await pc.setLocalDescription(newOffer);
            socket.emit('video-offer', pc.localDescription, sid);
        } catch (err) { reportError(err); }
    };

    try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);

        // BUG FIX: update mystream so mic/cam toggles work for answering peer
        if (!mystream) {
            myvideo.srcObject = stream;
            myvideo.muted     = true;
            mystream          = stream;
        }

        stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);
            if (track.kind === 'audio') {
                audioTrackSent[sid] = track;
                if (!audioAllowed) track.enabled = false;
            }
            if (track.kind === 'video') {
                videoTrackSent[sid] = track;
                if (!videoAllowed) track.enabled = false;
            }
        });

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('video-answer', pc.localDescription, sid);
    } catch (err) { handleMediaError(err); }
});

// ═══════════════════════════════════════════════
// server → 'video-answer'
// ═══════════════════════════════════════════════
socket.on('video-answer', async (answer, sid) => {
    try {
        const pc = connections[sid];
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) { reportError(err); }
});

// ═══════════════════════════════════════════════
// server → 'new icecandidate'
// ═══════════════════════════════════════════════
socket.on('new icecandidate', async (candidate, sid) => {
    try {
        const pc = connections[sid];
        if (!pc) return;
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) { reportError(err); }
});

// ═══════════════════════════════════════════════
// server → 'room update'
// ═══════════════════════════════════════════════
socket.on('room update', roomInfo => {
    updateMeetingStatus(roomInfo);
    if (roomInfo?.participants) renderAttendees(roomInfo.participants);
});

// ═══════════════════════════════════════════════
// server → 'remove peer'
// ═══════════════════════════════════════════════
socket.on('remove peer', sid => {
    document.getElementById(sid)?.remove();
    if (connections[sid]) { connections[sid].close(); delete connections[sid]; }
    delete cName[sid]; delete micInfo[sid]; delete videoInfo[sid]; delete handInfo[sid];
    if (pinnedSid === sid) togglePin(sid); // unpin if they left
});

// ═══════════════════════════════════════════════
// server → 'action' (remote mic/video)
// ═══════════════════════════════════════════════
socket.on('action', (action, sid) => {
    if (action === 'mute') {
        document.querySelector(`#mute${sid}`)?.style.setProperty('visibility', 'visible');
        micInfo[sid] = 'off';
    } else if (action === 'unmute') {
        document.querySelector(`#mute${sid}`)?.style.setProperty('visibility', 'hidden');
        micInfo[sid] = 'on';
    } else if (action === 'videooff') {
        document.querySelector(`#vidoff${sid}`)?.style.setProperty('visibility', 'visible');
        videoInfo[sid] = 'off';
    } else if (action === 'videoon') {
        document.querySelector(`#vidoff${sid}`)?.style.setProperty('visibility', 'hidden');
        videoInfo[sid] = 'on';
    } else if (action === 'screenon') {
        // Show screen-share badge on that participant's video tile
        const box = document.getElementById(sid);
        if (box) {
            let badge = box.querySelector('.screen-share-badge');
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'screen-share-badge';
                badge.innerHTML = '<i class="fas fa-desktop"></i>';
                badge.title = `${cName[sid] || 'Participant'} is presenting`;
                box.appendChild(badge);
            }
            badge.style.display = 'flex';
        }
        showToast(`${cName[sid] || 'A participant'} started presenting`);
    } else if (action === 'screenoff') {
        // Remove screen-share badge
        const box = document.getElementById(sid);
        if (box) {
            const badge = box.querySelector('.screen-share-badge');
            if (badge) badge.style.display = 'none';
        }
        showToast(`${cName[sid] || 'A participant'} stopped presenting`);
    } else if (action === 'recstart') {
        // Show "call is being recorded" notice to everyone else
        const who = cName[sid] || 'A participant';
        showToast(`⚫ ${who} started recording this call`);
        // Show persistent recording notice bar for non-recorders
        let bar = document.getElementById('remote-rec-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'remote-rec-bar';
            bar.innerHTML = `<i class="fas fa-record-vinyl"></i> This call is being recorded`;
            document.body.appendChild(bar);
        }
        bar.classList.add('remote-rec-visible');
    } else if (action === 'recstop') {
        const bar = document.getElementById('remote-rec-bar');
        if (bar) bar.classList.remove('remote-rec-visible');
        showToast('Recording stopped');
    }
});

// ═══════════════════════════════════════════════
// RAISE HAND
// ═══════════════════════════════════════════════
if (raiseHandButt) {
    raiseHandButt.addEventListener('click', () => {
        handRaised = !handRaised;
        socket.emit('raise hand', handRaised);

        // Google Meet style: icon changes, button colour changes, label stays fixed
        const icon = raiseHandButt.querySelector('i');
        if (icon) {
            // Keep Font Awesome — just swap the icon
            icon.className = handRaised ? 'fas fa-hand-paper' : 'fas fa-hand-paper';
        }

        if (handRaised) {
            setButtonActive(raiseHandButt);
            raiseHandButt.classList.add('hand-active');
            raiseHandButt.classList.remove('btn-off');
            showToast('You raised your hand ✋');
        } else {
            setButtonInactive(raiseHandButt);
            raiseHandButt.classList.remove('hand-active');
        }
    });
}

socket.on('raise hand', (sid, raised) => {
    handInfo[sid] = raised;
    const badge = document.querySelector(`#hand${sid}`);
    if (badge) badge.style.display = raised ? 'flex' : 'none';
    if (raised && cName[sid]) showToast(`${cName[sid]} raised their hand ✋`);
    // Rebuild full participant list including self
    const allParticipants = [
        { socketId: socket.id, username, mic: audioAllowed ? 'on' : 'off', video: videoAllowed ? 'on' : 'off' },
        ...Object.keys(cName).map(s => ({
            socketId: s, username: cName[s],
            mic: micInfo[s] || 'on', video: videoInfo[s] || 'on'
        }))
    ];
    renderAttendees(allParticipants);
});

// ═══════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════
sendButton.addEventListener('click', () => {
    const msg = messageField.value.trim();
    if (!msg) return;
    messageField.value = '';
    socket.emit('message', msg, roomid);
});
messageField.addEventListener('keypress', e => {
    if (e.key === 'Enter') sendButton.click();
});

socket.on('message', (msg, sender, time) => {
    // unread badge when user is on People tab
    if (!chatVisible) {
        unreadCount++;
        if (unreadBadge) {
            unreadBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            unreadBadge.style.display = 'inline-flex';
        }
    }

    const wrap = document.createElement('div');
    wrap.className = 'message';

    const isSystem = sender === 'System';
    if (isSystem) {
        wrap.classList.add('message-system');
        wrap.textContent = msg;
    } else {
        const isSelf = sender === username;
        if (isSelf) wrap.classList.add('message-self');

        const info = document.createElement('div');
        info.className = 'info';

        const uname = document.createElement('div');
        uname.className = 'username';
        uname.textContent = isSelf ? 'You' : sender;

        const ts = document.createElement('div');
        ts.className = 'time';
        ts.textContent = time;

        const body = document.createElement('div');
        body.className = 'content';
        body.textContent = msg;   // XSS-safe

        info.appendChild(uname);
        info.appendChild(ts);
        wrap.appendChild(info);
        wrap.appendChild(body);
    }

    chatRoom.appendChild(wrap);
    chatRoom.scrollTop = chatRoom.scrollHeight;
});

// ═══════════════════════════════════════════════
// UNIFIED BUTTON TOGGLE HELPER
// Google Meet style: ONLY icon + class change.
// Label text NEVER changes — stays fixed width.
// ═══════════════════════════════════════════════
function setButtonOn(btn, iconClass) {
    btn.classList.remove('btn-off');
    btn.classList.add('btn-on');
    const i = btn.querySelector('i');
    if (i && iconClass) i.className = iconClass;
}
function setButtonOff(btn, iconClass) {
    btn.classList.remove('btn-on');
    btn.classList.add('btn-off');
    const i = btn.querySelector('i');
    if (i && iconClass) i.className = iconClass;
}
function setButtonActive(btn) {
    btn.classList.add('btn-active');
    btn.classList.remove('btn-off');
}
function setButtonInactive(btn) {
    btn.classList.remove('btn-active');
}

// ═══════════════════════════════════════════════
// MIC TOGGLE
// ═══════════════════════════════════════════════
audioButt.addEventListener('click', () => {
    audioAllowed = !audioAllowed;
    Object.values(audioTrackSent).forEach(t => { t.enabled = audioAllowed; });
    if (mystream) mystream.getAudioTracks().forEach(t => { t.enabled = audioAllowed; });

    const icon  = audioButt.querySelector('i');
    if (icon)  icon.className = audioAllowed ? 'fas fa-microphone' : 'fas fa-microphone-slash';
    audioButt.classList.toggle('btn-off', !audioAllowed);
    if (mymuteicon) mymuteicon.style.visibility = audioAllowed ? 'hidden' : 'visible';
    socket.emit('action', audioAllowed ? 'unmute' : 'mute');
    showToast(audioAllowed ? 'Microphone on' : 'Microphone off');
});
// ═════════════════════════════════════��═════════
// CAMERA TOGGLE
// ═══════════════════════════════════════════════
videoButt.addEventListener('click', () => {
    videoAllowed = !videoAllowed;
    Object.values(videoTrackSent).forEach(t => { t.enabled = videoAllowed; });
    if (mystream) mystream.getVideoTracks().forEach(t => { t.enabled = videoAllowed; });

    const icon  = videoButt.querySelector('i');
    if (icon)  icon.className = videoAllowed ? 'fas fa-video' : 'fas fa-video-slash';
    videoButt.classList.toggle('btn-off', !videoAllowed);
    if (myvideooff) myvideooff.style.visibility = videoAllowed ? 'hidden' : 'visible';
    socket.emit('action', videoAllowed ? 'videoon' : 'videooff');
    showToast(videoAllowed ? 'Camera on' : 'Camera off');
});

// ═══════════════════════════════════════════════
// SCREEN SHARE  — Professional implementation
// ═══════════════════════════════════════════════
let savedCameraTrack = null;   // original camera track saved before sharing
let screenStopHandled = false; // prevents double-stop from ended + click

// ── Presenting banner ────────────────────────
const presentingBanner = (() => {
    const el = document.createElement('div');
    el.id = 'presenting-banner';
    el.innerHTML = `
        <div class="present-inner">
            <i class="fas fa-desktop"></i>
            <span>You are presenting to everyone</span>
            <button id="stop-present-btn">
                <i class="fas fa-stop-circle"></i> Stop sharing
            </button>
        </div>`;
    document.body.appendChild(el);
    el.querySelector('#stop-present-btn').addEventListener('click', () => {
        if (screenshareEnabled) screenShareButt.click();
    });
    return el;
})();

function showPresentingBanner(show) {
    presentingBanner.classList.toggle('banner-visible', show);
}

// ── Replace video track on all active peer connections ──
async function replaceVideoTrackOnPeers(newTrack) {
    const promises = Object.values(connections).map(async pc => {
        // Only replace on connections that are in a usable state
        if (pc.connectionState === 'closed') return;
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) await sender.replaceTrack(newTrack);
    });
    await Promise.all(promises);
    Object.keys(connections).forEach(sid => { videoTrackSent[sid] = newTrack; });
}

// ── Main screen share toggle ──
screenShareButt.addEventListener('click', async () => {
    try {
        if (!screenshareEnabled) {
            // ── START ──────────────────────────────────
            // Show guidance toast BEFORE opening picker
            // so user knows not to select "This Tab" (causes mirror loop)
            showToast('Select a window or screen — not "This Tab"');

            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    displaySurface: 'window',   // default to window, not tab
                    frameRate: { ideal: 30, max: 30 },
                    width:     { ideal: 1920 },
                    height:    { ideal: 1080 },
                },
                audio: true,
                // Chrome 112+: hide THIS tab from picker completely
                // This is the definitive fix for the infinite mirror problem.
                selfBrowserSurface: 'exclude',
            });

            const screenVideoTrack = screenStream.getVideoTracks()[0];
            if (!screenVideoTrack) return;   // user cancelled

            // Guard: if user picked "This Tab" despite the warning,
            // the displaySurface setting will be 'browser'. Warn and stop.
            const settings = screenVideoTrack.getSettings();
            if (settings.displaySurface === 'browser') {
                screenVideoTrack.stop();
                screenStream.getTracks().forEach(t => t.stop());
                showToast('⚠️ Please share a Window or Screen, not this Tab — it causes a mirror loop.', 'error');
                return;
            }

            // Save current camera track for clean restore later
            savedCameraTrack = mystream
                ? (mystream.getVideoTracks()[0] || null)
                : null;

            // Replace video track on all peers
            await replaceVideoTrackOnPeers(screenVideoTrack);

            // Replace audio with screen audio if captured
            const screenAudioTrack = screenStream.getAudioTracks()[0] || null;
            if (screenAudioTrack) {
                const audioPeers = Object.values(connections).map(async pc => {
                    if (pc.connectionState === 'closed') return;
                    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
                    if (sender) await sender.replaceTrack(screenAudioTrack);
                });
                await Promise.all(audioPeers);
            }

            // Update local preview — swap video track without stopping audio
            if (mystream) {
                mystream.getVideoTracks().forEach(t => {
                    if (t !== screenVideoTrack) mystream.removeTrack(t);
                });
                if (!mystream.getVideoTracks().includes(screenVideoTrack)) {
                    mystream.addTrack(screenVideoTrack);
                }
            }
            myvideo.srcObject = mystream || screenStream;

            screenshareEnabled = true;
            screenStopHandled  = false;

            // Handle browser's native "Stop sharing" button (ESC / Chrome bar)
            screenVideoTrack.addEventListener('ended', () => {
                if (screenshareEnabled && !screenStopHandled) {
                    screenStopHandled = true;
                    screenShareButt.click();
                }
            });

            socket.emit('action', 'screenon');
            const icon = screenShareButt.querySelector('i');
            if (icon) icon.className = 'fas fa-stop-circle';
            setButtonActive(screenShareButt);
            showPresentingBanner(true);
            document.getElementById('my-video-box')?.classList.add('is-presenting');
            const myNametag = document.getElementById('myname');
            if (myNametag && !myNametag.querySelector('.presenting-label')) {
                const lbl = document.createElement('span');
                lbl.className = 'presenting-label';
                lbl.innerHTML = '<i class="fas fa-desktop"></i> Presenting';
                myNametag.appendChild(lbl);
            }
            document.body.classList.add('is-presenting');
            showToast('You are now presenting your screen');

        } else {
            // ── STOP ───────────────────────────────────
            screenshareEnabled = false;
            screenStopHandled  = true;   // block the 'ended' handler

            // Stop the screen video track
            if (mystream) {
                mystream.getVideoTracks().forEach(t => t.stop());
            }

            // Restore camera — use saved track if still alive, else get new one
            let restoreTrack = (savedCameraTrack && savedCameraTrack.readyState === 'live')
                ? savedCameraTrack
                : null;

            if (!restoreTrack) {
                try {
                    const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                    restoreTrack = camStream.getVideoTracks()[0] || null;
                } catch (camErr) {
                    console.warn('Camera restore failed:', camErr.message);
                }
            }

            if (restoreTrack) {
                restoreTrack.enabled = videoAllowed;
                await replaceVideoTrackOnPeers(restoreTrack);
                if (mystream) {
                    mystream.getVideoTracks().forEach(t => mystream.removeTrack(t));
                    mystream.addTrack(restoreTrack);
                }
                myvideo.srcObject = mystream || new MediaStream([restoreTrack]);
            }

            // Restore mic audio on all peers
            const micTrack = mystream ? mystream.getAudioTracks()[0] : null;
            if (micTrack) {
                const audioRestore = Object.values(connections).map(async pc => {
                    if (pc.connectionState === 'closed') return;
                    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
                    if (sender) await sender.replaceTrack(micTrack);
                });
                await Promise.all(audioRestore);
            }

            savedCameraTrack = null;
            socket.emit('action', 'screenoff');
            const icon = screenShareButt.querySelector('i');
            if (icon) icon.className = 'fas fa-desktop';
            setButtonInactive(screenShareButt);
            showPresentingBanner(false);
            document.getElementById('my-video-box')?.classList.remove('is-presenting');
            document.getElementById('myname')?.querySelector('.presenting-label')?.remove();
            document.body.classList.remove('is-presenting');
            showToast('You stopped presenting');
        }
    } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'AbortError') return;
        showToast('Screen share error: ' + err.message, 'error');
        console.error('Screen share error:', err);
    }
});

// ═══════════════════════════════════════════════
// RECORDING — Professional implementation
//
// Strategy:
//   1. Ask user HOW they want to record via a modal:
//      a) "This tab"  — captures full browser tab (all videos + audio)
//      b) "Camera only" — records own camera + mic only
//   2. Show live recording banner with elapsed timer
//   3. Notify all participants via socket ('recstart'/'recstop')
//   4. Auto-save on stop with formatted filename
//   5. Handle all errors gracefully
// ═══════════════════════════════════════════════

// ── Recording state ──────────────────────────────
let recTimer          = null;   // setInterval handle
let recStartTime      = 0;      // Date.now() when recording started
let recStream         = null;   // the stream being recorded

// ── Recording banner (injected once into DOM) ────
const recBanner = (() => {
    const el = document.createElement('div');
    el.id = 'rec-banner';
    el.innerHTML = `
        <div class="rec-inner">
            <span class="rec-dot"></span>
            <span class="rec-label">REC</span>
            <span class="rec-timer" id="rec-timer">00:00</span>
            <button id="stop-rec-btn">
                <i class="fas fa-stop"></i> Stop recording
            </button>
        </div>`;
    document.body.appendChild(el);
    el.querySelector('#stop-rec-btn').addEventListener('click', () => {
        if (isRecording) recordBtn?.click();
    });
    return el;
})();

// ── Recording source picker modal ─────────────────
const recModal = (() => {
    const el = document.createElement('div');
    el.id = 'rec-modal';
    el.innerHTML = `
        <div class="rec-modal-box">
            <div class="rec-modal-header">
                <i class="fas fa-record-vinyl"></i>
                <h3>Start recording</h3>
            </div>
            <p class="rec-modal-sub">Choose what to record</p>
            <div class="rec-modal-options">
                <button class="rec-opt-btn" id="rec-opt-tab">
                    <i class="fas fa-tv"></i>
                    <span>Entire tab</span>
                    <small>All video tiles + audio</small>
                </button>
                <button class="rec-opt-btn" id="rec-opt-cam">
                    <i class="fas fa-user-circle"></i>
                    <span>Camera &amp; mic only</span>
                    <small>Your video and audio</small>
                </button>
            </div>
            <button class="rec-modal-cancel" id="rec-modal-cancel">Cancel</button>
        </div>`;
    document.body.appendChild(el);
    return el;
})();

function showRecModal() {
    return new Promise((resolve) => {
        recModal.classList.add('rec-modal-visible');
        recModal.querySelector('#rec-opt-tab').onclick    = () => { closeRecModal(); resolve('tab');    };
        recModal.querySelector('#rec-opt-cam').onclick    = () => { closeRecModal(); resolve('cam');    };
        recModal.querySelector('#rec-modal-cancel').onclick = () => { closeRecModal(); resolve(null); };
        recModal.onclick = (e) => { if (e.target === recModal) { closeRecModal(); resolve(null); } };
    });
}

function closeRecModal() {
    recModal.classList.remove('rec-modal-visible');
}

function showRecBanner(show) {
    recBanner.classList.toggle('rec-banner-visible', show);
    document.body.classList.toggle('is-recording', show);
}

function updateRecTimer() {
    const elapsed = Math.floor((Date.now() - recStartTime) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    const el = document.getElementById('rec-timer');
    if (el) el.textContent = `${mm}:${ss}`;
}

function formatRecFilename() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `QuickMeet_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.webm`;
}

// ── Best supported MIME type ──────────────────────
function getBestMimeType() {
    const types = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=h264,opus',
        'video/webm',
    ];
    return types.find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';
}

// ── Main record button handler ────────────────────
if (recordBtn) {
    recordBtn.addEventListener('click', async () => {

        // ── STOP recording ────────────────────────
        if (isRecording) {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
            // recStream tracks stopped after onstop fires
            isRecording = false;
            clearInterval(recTimer);
            recTimer = null;
            showRecBanner(false);
            const icon = recordBtn.querySelector('i');
            if (icon) icon.className = 'fas fa-record-vinyl';
            recordBtn.classList.remove('btn-recording');
            socket.emit('action', 'recstop');
            return;
        }

        // ── ASK user what to record ───────────────
        const choice = await showRecModal();
        if (!choice) return;   // user cancelled

        try {
            let captureStream;

            if (choice === 'tab') {
                // Capture entire browser tab including all peer video tiles.
                // Do NOT set selfBrowserSurface or preferCurrentTab —
                // those force the current tab to be captured, causing an
                // infinite mirror loop when the meeting page itself is selected.
                captureStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        displaySurface: 'browser',
                        frameRate:      { ideal: 30 },
                        width:          { ideal: 1920 },
                        height:         { ideal: 1080 },
                    },
                    audio: true,
                });

            } else {
                // Camera + mic only — use existing stream if possible
                if (mystream && mystream.active) {
                    // Clone so stopping recorder doesn't kill live stream
                    captureStream = mystream.clone();
                } else {
                    captureStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
                }
            }

            const mimeType     = getBestMimeType();
            recordedChunks     = [];
            recStream          = captureStream;

            mediaRecorder = new MediaRecorder(captureStream, {
                mimeType,
                videoBitsPerSecond: 2_500_000,  // 2.5 Mbps — good quality
                audioBitsPerSecond:   128_000,  // 128 kbps audio
            });

            mediaRecorder.ondataavailable = e => {
                if (e.data && e.data.size > 0) recordedChunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                // Stop all tracks on the capture stream
                recStream?.getTracks().forEach(t => t.stop());
                recStream = null;

                if (recordedChunks.length === 0) {
                    showToast('Recording was empty — nothing saved.', 'error');
                    return;
                }

                const blob     = new Blob(recordedChunks, { type: mimeType });
                const url      = URL.createObjectURL(blob);
                const sizeMB   = (blob.size / 1_048_576).toFixed(1);
                const filename = formatRecFilename();

                const a    = document.createElement('a');
                a.href     = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 10_000);

                showToast(`Recording saved — ${sizeMB} MB`);
            };

            mediaRecorder.onerror = (e) => {
                showToast('Recording error: ' + e.error?.message, 'error');
                console.error('MediaRecorder error:', e);
            };

            // If user stops tab-capture via browser UI (ESC / stop button)
            captureStream.getVideoTracks().forEach(t => {
                t.addEventListener('ended', () => {
                    if (isRecording) recordBtn?.click();
                });
            });

            mediaRecorder.start(1000);  // collect chunk every 1s
            isRecording    = true;
            recStartTime   = Date.now();

            // Start timer
            updateRecTimer();
            recTimer = setInterval(updateRecTimer, 1000);

            showRecBanner(true);
            const icon = recordBtn.querySelector('i');
            if (icon) icon.className = 'fas fa-stop-circle';
            recordBtn.classList.add('btn-recording');
            socket.emit('action', 'recstart');
            showToast(choice === 'tab'
                ? 'Recording tab — all participants captured'
                : 'Recording your camera & mic');

        } catch (err) {
            if (err.name === 'NotAllowedError' || err.name === 'AbortError') return;
            showToast('Could not start recording: ' + err.message, 'error');
            console.error('Recording error:', err);
        }
    });
}

// ═══════════════════════════════════════════════
// PANEL MANAGER — mutual exclusion
// Only one overlay/panel can be open at a time.
// Opening any panel automatically closes all others.
// ═══════════════════════════════════════════════
const PanelManager = {
    // Close whiteboard if open
    closeBoard() {
        if (boardVisible) {
            boardVisible = false;
            whiteboardCont.classList.remove('wb-visible');
            whiteboardButt.classList.remove('btn-active');
        }
    },
    // Close IDE if open (calls into the IDE IIFE via a custom event)
    closeIDE() {
        const idePanel = document.querySelector('#ide-panel');
        const ideBtn   = document.querySelector('.ide-btn');
        if (idePanel && !idePanel.classList.contains('hidden')) {
            idePanel.classList.add('hidden');
            ideBtn?.classList.remove('btn-active');
            // signal the IIFE to sync its internal state
            idePanel.dispatchEvent(new CustomEvent('force-close'));
        }
    }
};
function toggleBoard() {
    if (!boardVisible) {
        // Opening board — close IDE first
        PanelManager.closeIDE();
    }
    boardVisible = !boardVisible;
    whiteboardCont.classList.toggle('wb-visible', boardVisible);
    whiteboardButt.classList.toggle('btn-active', boardVisible);
    if (boardVisible) { fitCanvas(); showToast('Whiteboard opened'); }
    else { showToast('Whiteboard closed'); }
}
whiteboardButt.addEventListener('click', toggleBoard);

// ═══════════════════════════════════════════════
// ONLINE IDE — Professional with stdin support
// ═══════════════════════════════════════════════
(function () {

    // ── DOM refs ──
    const idePanel     = document.querySelector('#ide-panel');
    const ideBtn       = document.querySelector('.ide-btn');
    const ideClose     = document.querySelector('#ide-close');
    const ideRun       = document.querySelector('#ide-run');
    const ideReset     = document.querySelector('#ide-reset');
    const ideClear     = document.querySelector('#ide-clear');
    const ideEditor    = document.querySelector('#ide-editor');
    const ideOutput    = document.querySelector('#ide-output');
    const ideStatus    = document.querySelector('#ide-status');
    const ideExecTime  = document.querySelector('#ide-exec-time');
    const ideStdin     = document.querySelector('#ide-stdin');
    const ideStdinWrap = document.querySelector('#ide-stdin-wrap');
    const ideLineNums  = document.querySelector('#ide-line-nums');
    const ideCursorPos = document.querySelector('#ide-cursor-pos');
    const ideFileName  = document.querySelector('#ide-file-name');
    const ideLangBar   = document.querySelector('#ide-lang-bar');
    const ideLangBadge = document.querySelector('#lang-badge');
    const ideLangDesc  = document.querySelector('#lang-desc');
    const ideLangTabs  = document.querySelector('#ide-lang-tabs');

    let ideVisible  = false;
    let currentLang = 'javascript';

    // ── Language configuration ──────────────────
    const LANG_CONFIG = {
        javascript: {
            id:         null,        // runs locally
            label:      'JavaScript',
            badge:      'JS',
            badgeColor: '#f7df1e',
            textColor:  '#000',
            desc:       'Runs in browser sandbox — instant execution, no network',
            fileName:   'main.js',
            stdin:      false,
            placeholder:'// JavaScript\nconsole.log("Hello, World!");\n',
            theme:      '#1a1a2e',
            accentColor:'#f7df1e',
        },
        python: {
            id:         71,
            label:      'Python 3',
            badge:      'PY',
            badgeColor: '#3572A5',
            textColor:  '#fff',
            desc:       'Python 3.8 — supports input(), numpy, math, etc.',
            fileName:   'main.py',
            stdin:      true,
            placeholder:'# Python\nname = input("Enter your name: ")\nprint(f"Hello, {name}!")\n',
            theme:      '#0d1b2a',
            accentColor:'#4da6ff',
        },
        cpp: {
            id:         54,
            label:      'C++ 17',
            badge:      'C++',
            badgeColor: '#f34b7d',
            textColor:  '#fff',
            desc:       'GCC C++ 17 — full STL support',
            fileName:   'main.cpp',
            stdin:      true,
            placeholder:'#include <iostream>\nusing namespace std;\n\nint main() {\n    string name;\n    cout << "Enter name: ";\n    cin >> name;\n    cout << "Hello, " << name << "!" << endl;\n    return 0;\n}\n',
            theme:      '#1a0a2e',
            accentColor:'#f34b7d',
        },
        java: {
            id:         62,
            label:      'Java 17',
            badge:      'JAVA',
            badgeColor: '#b07219',
            textColor:  '#fff',
            desc:       'OpenJDK 17 — class must be named Main',
            fileName:   'Main.java',
            stdin:      true,
            placeholder:'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        System.out.print("Enter name: ");\n        String name = sc.nextLine();\n        System.out.println("Hello, " + name + "!");\n    }\n}\n',
            theme:      '#1a1500',
            accentColor:'#e8a000',
        },
        html: {
            id:         null,        // preview in new tab
            label:      'HTML',
            badge:      'HTML',
            badgeColor: '#e34c26',
            textColor:  '#fff',
            desc:       'Opens live preview in a new browser tab',
            fileName:   'index.html',
            stdin:      false,
            placeholder:'<!DOCTYPE html>\n<html>\n<head>\n  <title>Preview</title>\n  <style>\n    body { font-family: sans-serif; background: #0d1117; color: #f0f6ff; padding: 40px; }\n    h1 { color: #4ecca3; }\n  </style>\n</head>\n<body>\n  <h1>Hello, World!</h1>\n  <p>Edit this HTML and click Run to preview.</p>\n</body>\n</html>\n',
            theme:      '#1a0e00',
            accentColor:'#e34c26',
        },
        css: {
            id:         null,
            label:      'CSS',
            badge:      'CSS',
            badgeColor: '#563d7c',
            textColor:  '#fff',
            desc:       'Injects CSS into a preview page and opens in new tab',
            fileName:   'style.css',
            stdin:      false,
            placeholder:'/* CSS Preview */\nbody {\n  background: linear-gradient(135deg, #0d1117, #1a2340);\n  font-family: Inter, sans-serif;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  height: 100vh;\n  margin: 0;\n}\n\nh1 {\n  color: #4ecca3;\n  font-size: 3rem;\n}\n',
            theme:      '#0e0a1a',
            accentColor:'#9b59b6',
        },
    };

    // ── Apply language theme ─────────────────────
    function applyLangTheme(lang) {
        const cfg = LANG_CONFIG[lang];
        if (!cfg) return;

        // update editor background accent
        if (idePanel) {
            idePanel.style.setProperty('--ide-accent', cfg.accentColor);
        }
        if (ideEditor) {
            ideEditor.style.background = cfg.theme;
        }

        // language bar
        if (ideLangBadge) {
            ideLangBadge.textContent   = cfg.label;
            ideLangBadge.style.background   = cfg.badgeColor;
            ideLangBadge.style.color        = cfg.textColor;
        }
        if (ideLangDesc) ideLangDesc.textContent = cfg.desc;

        // file name
        if (ideFileName) ideFileName.textContent = cfg.fileName;

        // show/hide stdin based on language
        if (ideStdinWrap) {
            ideStdinWrap.style.display = cfg.stdin ? 'flex' : 'none';
        }

        // update active tab
        document.querySelectorAll('.ide-lang-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === lang);
        });
    }

    // ── Language tab click ───────────────────────
    ideLangTabs?.addEventListener('click', e => {
        const tab = e.target.closest('.ide-lang-tab');
        if (!tab) return;
        const lang = tab.dataset.lang;
        if (!lang || lang === currentLang) return;
        currentLang = lang;
        applyLangTheme(lang);
        // load starter if editor is empty
        if (ideEditor && ideEditor.value.trim() === '') {
            ideEditor.value = LANG_CONFIG[lang].placeholder;
            updateLineNumbers();
        }
        ideEditor?.focus();
        showToast(`Switched to ${LANG_CONFIG[lang].label}`);
    });

    // ── Toggle IDE panel ─────────────────────────
    function toggleIDE() {
        ideVisible = !ideVisible;
        idePanel?.classList.toggle('hidden', !ideVisible);
        ideBtn?.classList.toggle('btn-active', ideVisible);
        if (ideVisible) {
            // Opening IDE — close Board first
            PanelManager.closeBoard();
            applyLangTheme(currentLang);
            if (ideEditor && ideEditor.value.trim() === '') {
                ideEditor.value = LANG_CONFIG[currentLang].placeholder;
                updateLineNumbers();
            }
            setTimeout(() => ideEditor?.focus(), 60);
            showToast('IDE opened');
        }
    }
    ideBtn?.addEventListener('click', toggleIDE);
    ideClose?.addEventListener('click', () => { if (ideVisible) toggleIDE(); });

    // Listen for force-close from PanelManager.closeIDE()
    idePanel?.addEventListener('force-close', () => { ideVisible = false; });

    // ── Reset to template ────────────────────────
    ideReset?.addEventListener('click', () => {
        if (!ideEditor) return;
        ideEditor.value = LANG_CONFIG[currentLang].placeholder;
        updateLineNumbers();
        ideEditor.focus();
    });

    // ── Clear output ─────────────────────────────
    ideClear?.addEventListener('click', () => {
        if (ideOutput) ideOutput.innerHTML = '<span class="ide-output-hint">Press Run to execute your code</span>';
        if (ideStatus) { ideStatus.textContent = ''; ideStatus.className = 'ide-output-status'; }
        if (ideExecTime) ideExecTime.textContent = '';
    });

    // ── Line numbers + cursor position ───────────
    function updateLineNumbers() {
        if (!ideEditor || !ideLineNums) return;
        const lines = ideEditor.value.split('\n').length;
        ideLineNums.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
        ideLineNums.scrollTop = ideEditor.scrollTop;
    }

    function updateCursor() {
        if (!ideEditor || !ideCursorPos) return;
        const text = ideEditor.value.substring(0, ideEditor.selectionStart);
        const lines = text.split('\n');
        const ln  = lines.length;
        const col = lines[lines.length - 1].length + 1;
        ideCursorPos.textContent = `Ln ${ln}, Col ${col}`;
    }

    if (ideEditor) {
        ideEditor.addEventListener('input',  updateLineNumbers);
        ideEditor.addEventListener('click',  updateCursor);
        ideEditor.addEventListener('keyup',  updateCursor);
        ideEditor.addEventListener('scroll', () => {
            if (ideLineNums) ideLineNums.scrollTop = ideEditor.scrollTop;
        });
        // Tab → 2 spaces
        ideEditor.addEventListener('keydown', e => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const s = ideEditor.selectionStart, end = ideEditor.selectionEnd;
                ideEditor.value = ideEditor.value.substring(0, s) + '  ' + ideEditor.value.substring(end);
                ideEditor.selectionStart = ideEditor.selectionEnd = s + 2;
                updateLineNumbers();
            }
            // Ctrl+Enter → run
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                ideRun?.click();
            }
        });
    }

    // ── Helpers for output display ───────────────
    function setOutput(text, isErr) {
        if (!ideOutput) return;
        ideOutput.innerHTML = '';
        const pre = document.createElement('pre');
        pre.className = isErr ? 'ide-out-err' : 'ide-out-ok';
        pre.textContent = text || '(no output)';
        ideOutput.appendChild(pre);
    }

    function setStatus(label, type) {
        if (!ideStatus) return;
        ideStatus.textContent = label;
        ideStatus.className   = `ide-output-status ide-status-${type}`;
    }

    // ── RUN ──────────────────────────────────────
    ideRun?.addEventListener('click', async () => {
        const code  = ideEditor?.value?.trim();
        const stdin = ideStdin?.value || '';
        const lang  = currentLang;
        const cfg   = LANG_CONFIG[lang];

        if (!code) { setOutput('No code to run.', false); return; }

        // Disable run button while executing
        if (ideRun) { ideRun.disabled = true; ideRun.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Running…</span>'; }
        if (ideOutput) ideOutput.innerHTML = '<span class="ide-output-hint ide-running"><i class="fas fa-spinner fa-spin"></i> Executing…</span>';
        setStatus('Running…', 'run');
        if (ideExecTime) ideExecTime.textContent = '';

        const t0 = Date.now();

        try {
            // ── JavaScript: run locally in sandboxed iframe ──
            if (lang === 'javascript') {
                const logs = [];
                // FIX #2: sandbox="allow-scripts" blocks window.parent access and
                // same-origin privileges — code cannot reach the outer DOM or socket.
                const sb = document.createElement('iframe');
                sb.style.display = 'none';
                sb.setAttribute('sandbox', 'allow-scripts');
                document.body.appendChild(sb);
                // Post the code into the sandboxed iframe via a blob URL
                // and receive output via postMessage.
                const result = await new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        ac.abort();
                        resolve({ logs: ['Error: execution timed out (5s)'] });
                    }, 5000);
                    // Use AbortController so the listener is always cleaned up —
                    // prevents MaxListenersExceededWarning on rapid Run clicks
                    const ac = new AbortController();
                    window.addEventListener('message', function handler(evt) {
                        if (evt.source !== sb.contentWindow) return;
                        clearTimeout(timeout);
                        ac.abort();
                        resolve(evt.data);
                    }, { signal: ac.signal });
                    const runCode = `
                        const _logs = [];
                        const _console = {
                            log:   (...a) => _logs.push(a.map(String).join(' ')),
                            error: (...a) => _logs.push('ERROR: ' + a.map(String).join(' ')),
                            warn:  (...a) => _logs.push('WARN:  '  + a.map(String).join(' ')),
                            info:  (...a) => _logs.push(a.map(String).join(' ')),
                        };
                        (function(console){
                            try { ${code} }
                            catch(e){ _logs.push('\\nRuntime Error: ' + e.message); }
                        })(_console);
                        parent.postMessage({ logs: _logs }, '*');
                    `;
                    const blob = new Blob([runCode], { type: 'text/javascript' });
                    const blobUrl = URL.createObjectURL(blob);
                    sb.src = 'about:blank';
                    sb.onload = () => {
                        const script = sb.contentDocument.createElement('script');
                        script.src = blobUrl;
                        sb.contentDocument.body.appendChild(script);
                        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
                    };
                });
                document.body.removeChild(sb);
                logs.push(...(result.logs || []));
                const elapsed = Date.now() - t0;
                setOutput(logs.join('\n') || '(no output)');
                setStatus('✓ Done', 'ok');
                if (ideExecTime) ideExecTime.textContent = `${elapsed}ms`;
            }

            // ── HTML: live preview tab ──
            else if (lang === 'html') {
                const blob = new Blob([code], { type: 'text/html' });
                const url  = URL.createObjectURL(blob);
                window.open(url, '_blank');
                setOutput('HTML preview opened in new tab.');
                setStatus('✓ Opened', 'ok');
                setTimeout(() => URL.revokeObjectURL(url), 60000);
            }

            // ── CSS: inject into preview page ──
            else if (lang === 'css') {
                const html = `<!DOCTYPE html><html><head><style>${code}</style></head><body><h1>CSS Preview</h1><p>Your styles have been applied.</p></body></html>`;
                const blob = new Blob([html], { type: 'text/html' });
                const url  = URL.createObjectURL(blob);
                window.open(url, '_blank');
                setOutput('CSS preview opened in new tab.');
                setStatus('✓ Opened', 'ok');
                setTimeout(() => URL.revokeObjectURL(url), 60000);
            }

            // ── Python / C++ / Java: Judge0 CE (free, no key) ──
            else {
                const JUDGE0  = 'https://ce.judge0.com';
                const langId  = cfg.id;

                // Submit
                const submitRes = await fetch(
                    `${JUDGE0}/submissions?base64_encoded=false`,
                    {
                        method:  'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body:    JSON.stringify({
                            source_code:  code,
                            language_id:  langId,
                            stdin:        stdin,   // ← stdin passed here
                        }),
                    }
                );
                if (!submitRes.ok) throw new Error(`Submission failed (HTTP ${submitRes.status})`);
                const { token } = await submitRes.json();
                if (!token) throw new Error('No execution token returned');

                // Poll until done (status.id >= 3)
                let result = null;
                for (let i = 0; i < 24; i++) {
                    await new Promise(r => setTimeout(r, 500));
                    const pollRes = await fetch(
                        `${JUDGE0}/submissions/${token}?base64_encoded=false&fields=stdout,stderr,compile_output,status,time,memory`
                    );
                    result = await pollRes.json();
                    if (result.status && result.status.id >= 3) break;
                }

                const elapsed = Date.now() - t0;
                const isErr   = !!(result.stderr || result.compile_output);
                const out     = result.stdout
                             || (result.compile_output ? `Compile Error:\n${result.compile_output}` : null)
                             || (result.stderr         ? `Runtime Error:\n${result.stderr}`         : null)
                             || '(no output)';

                setOutput(out, isErr);
                setStatus(isErr ? '✗ Error' : '✓ Done', isErr ? 'err' : 'ok');

                // show server exec time if available
                const serverTime = result.time ? `${parseFloat(result.time) * 1000 | 0}ms` : `~${elapsed}ms`;
                if (ideExecTime) ideExecTime.textContent = serverTime;
            }

        } catch (err) {
            setOutput(`Network / execution error:\n${err.message}\n\nMake sure you are online.\nFree Judge0 CE (ce.judge0.com) is used — no API key needed.`, true);
            setStatus('✗ Error', 'err');
        } finally {
            if (ideRun) { ideRun.disabled = false; ideRun.innerHTML = '<i class="fas fa-play"></i><span>Run</span>'; }
        }
    });

    // ── init ─────────────────────────────────────
    applyLangTheme(currentLang);

})(); // end IDE IIFE

// ═══════════════════════════════════════════════
// LEAVE CALL
// ═══════════════════════════════════════════════
cutCall.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (mystream) mystream.getTracks().forEach(t => t.stop());
    Object.values(connections).forEach(pc => pc.close());
    window.location.href = '/';
});

// ═══════════════════════════════════════════════
// ACTIVE SPEAKER DETECTION
// Uses AudioContext AnalyserNode on each peer's
// MediaStream to detect volume. Highlights the
// loudest speaker with a blue ring every 200ms.
// ═══════════════════════════════════════════════
(function initActiveSpeaker() {
    const analysers  = {};   // sid → { analyser, dataArray }
    let   audioCtx   = null;
    let   lastSpeaker = null;

    function getAudioCtx() {
        if (!audioCtx || audioCtx.state === 'closed') {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioCtx;
    }

    // Called when a new remote stream is received
    window.attachSpeakerAnalyser = function(sid, stream) {
        try {
            const ctx      = getAudioCtx();
            const source   = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.5;
            source.connect(analyser);
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            analysers[sid] = { analyser, dataArray };
        } catch (e) {
            console.warn('Speaker analyser setup failed:', e.message);
        }
    };

    window.detachSpeakerAnalyser = function(sid) {
        delete analysers[sid];
    };

    // Poll every 200ms
    setInterval(() => {
        let maxVol = 30;   // threshold — only detect if above this
        let speakerSid = null;

        Object.entries(analysers).forEach(([sid, { analyser, dataArray }]) => {
            analyser.getByteFrequencyData(dataArray);
            const vol = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            if (vol > maxVol) { maxVol = vol; speakerSid = sid; }
        });

        // Clear old speaker ring
        if (lastSpeaker !== speakerSid) {
            if (lastSpeaker) {
                const el = document.getElementById(lastSpeaker) || document.getElementById('my-video-box');
                el?.classList.remove('speaking');
            }
        }
        // Add ring to current speaker
        if (speakerSid) {
            document.getElementById(speakerSid)?.classList.add('speaking');
        }
        lastSpeaker = speakerSid;
    }, 200);
})();

// Attach analyser when remote video starts playing
document.addEventListener('play', e => {
    if (!e.target.classList.contains('video-frame')) return;
    const box = e.target.closest('.video-box');
    if (!box || box.id === 'my-video-box') return;
    const stream = e.target.srcObject;
    if (stream) window.attachSpeakerAnalyser(box.id, stream);
}, true);

// ═══════════════════════════════════════════════
// HOST STATUS & CONTROLS
// ═══════════════════════════════════════════════
let isHost = false;

socket.on('host status', (hostFlag) => {
    isHost = hostFlag;
    const hostSettingsSection = document.getElementById('host-settings-section');
    const hostControls        = document.getElementById('host-controls');
    if (hostSettingsSection) hostSettingsSection.style.display = hostFlag ? 'block' : 'none';
    if (hostControls) hostControls.classList.toggle('hidden', !hostFlag);
    if (hostFlag) {
        showToast('You are the host ⭐', 'host');
        // Add Host badge to local tile
        const myBox = document.getElementById('my-video-box');
        if (myBox && !myBox.querySelector('.host-badge')) {
            const badge = document.createElement('div');
            badge.className = 'host-badge';
            badge.textContent = 'Host';
            myBox.appendChild(badge);
        }
    }
});

// Handle being kicked by host
socket.on('kicked', msg => {
    showToast(msg, 'error');
    setTimeout(() => {
        if (mystream) mystream.getTracks().forEach(t => t.stop());
        Object.values(connections).forEach(pc => pc.close());
        window.location.href = '/';
    }, 2000);
});

// Handle meeting ended by host
socket.on('meeting-ended', msg => {
    showToast(msg, 'error');
    setTimeout(() => {
        if (mystream) mystream.getTracks().forEach(t => t.stop());
        Object.values(connections).forEach(pc => pc.close());
        window.location.href = '/';
    }, 2500);
});

// Handle being force-muted by host
socket.on('forced-mute', () => {
    if (audioAllowed) audioButt.click();  // simulate mic click to mute
    showToast('You were muted by the host');
});

// Mute-all button
const muteAllBtn = document.getElementById('btn-mute-all');
muteAllBtn?.addEventListener('click', () => {
    if (!isHost) return;
    socket.emit('host action', { action: 'mute-all' });
});

// End meeting button (in settings)
const endMeetingBtn = document.getElementById('end-meeting-btn');
endMeetingBtn?.addEventListener('click', () => {
    if (!isHost) return;
    if (confirm('End the meeting for everyone?')) {
        socket.emit('host action', { action: 'end-meeting' });
    }
});

// ── renderAttendees extended to show host badge + host action buttons ──
// Override the existing renderAttendees to add host features
function renderAttendees(participants = []) {
    if (!attendeeList) return;
    attendeeList.innerHTML = '';
    if (!participants.length) {
        attendeeList.innerHTML = '<div class="attendee-empty">No participants yet</div>';
        return;
    }
    const frag = document.createDocumentFragment();
    participants.forEach(p => {
        const item = document.createElement('div');
        item.className = 'attendee-item';

        const avatar = document.createElement('div');
        avatar.className = 'attendee-avatar';
        const initials = (p.username || 'P').slice(0, 2).toUpperCase();
        avatar.textContent = initials;
        const colors = ['#4285f4','#ea4335','#34a853','#fbbc04','#9b59b6','#fa7b17','#e91e63','#00bcd4'];
        avatar.style.background = colors[(p.username || '').charCodeAt(0) % colors.length];

        const nameWrap = document.createElement('div');
        nameWrap.className = 'attendee-info';

        const nameEl = document.createElement('div');
        nameEl.className = 'attendee-name';
        const isSelf = p.socketId === socket.id;
        nameEl.textContent = (p.username || 'Participant') + (isSelf ? ' (You)' : '');

        // Host badge
        if (p.isHost) {
            const hbadge = document.createElement('span');
            hbadge.className = 'host-badge';
            hbadge.style.cssText = 'position:static;display:inline-block;margin-left:6px;font-size:0.6rem;padding:1px 6px;border-radius:3px;';
            hbadge.textContent = 'Host';
            nameEl.appendChild(hbadge);
        }

        nameWrap.appendChild(nameEl);

        const stateEl = document.createElement('div');
        stateEl.className = 'attendee-state';

        const mic = document.createElement('span');
        mic.className = `status-pill ${p.mic === 'on' ? 'status-on' : 'status-off'}`;
        mic.innerHTML = p.mic === 'on' ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';

        const cam = document.createElement('span');
        cam.className = `status-pill ${p.video === 'on' ? 'status-on' : 'status-off'}`;
        cam.innerHTML = p.video === 'on' ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';

        if (handInfo[p.socketId]) {
            const hand = document.createElement('span');
            hand.className = 'status-pill status-hand';
            hand.textContent = '✋';
            stateEl.appendChild(hand);
        }
        stateEl.appendChild(mic);
        stateEl.appendChild(cam);

        // Host action buttons (only shown to host, not for self)
        if (isHost && !isSelf) {
            const actions = document.createElement('div');
            actions.className = 'attendee-actions';

            const muteBtn = document.createElement('button');
            muteBtn.className = 'attendee-action-btn';
            muteBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
            muteBtn.title = 'Mute';
            muteBtn.addEventListener('click', () => {
                socket.emit('host action', { action: 'mute-participant', targetId: p.socketId });
            });

            const removeBtn = document.createElement('button');
            removeBtn.className = 'attendee-action-btn danger';
            removeBtn.innerHTML = '<i class="fas fa-user-slash"></i>';
            removeBtn.title = 'Remove from call';
            removeBtn.addEventListener('click', () => {
                if (confirm(`Remove ${p.username} from the meeting?`)) {
                    socket.emit('host action', { action: 'remove-participant', targetId: p.socketId });
                }
            });

            actions.appendChild(muteBtn);
            actions.appendChild(removeBtn);
            stateEl.appendChild(actions);
        }

        item.appendChild(avatar);
        item.appendChild(nameWrap);
        item.appendChild(stateEl);
        frag.appendChild(item);
    });
    attendeeList.appendChild(frag);
};
// (renderAttendees is defined above — no further patching needed)

// ═══════════════════════════════════════════════
// SETTINGS MODAL — Device selector + host settings
// ═══════════════════════════════════════════════
(function initSettings() {
    const settingsBtn   = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const settingsClose = document.getElementById('settings-close');
    const selMic        = document.getElementById('sel-mic');
    const selSpeaker    = document.getElementById('sel-speaker');
    const selCam        = document.getElementById('sel-cam');
    const selQuality    = document.getElementById('sel-quality');

    if (!settingsBtn || !settingsModal) return;

    async function loadDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            [selMic, selSpeaker, selCam].forEach(el => { if (el) el.innerHTML = ''; });

            devices.forEach(d => {
                const opt = document.createElement('option');
                opt.value       = d.deviceId;
                opt.textContent = d.label || `${d.kind} ${d.deviceId.slice(0,4)}`;
                if (d.kind === 'audioinput'  && selMic)     selMic.appendChild(opt);
                if (d.kind === 'audiooutput' && selSpeaker) selSpeaker.appendChild(opt.cloneNode(true));
                if (d.kind === 'videoinput'  && selCam)     selCam.appendChild(opt.cloneNode(true));
            });
        } catch (e) { console.warn('Device enumeration failed:', e.message); }
    }

    settingsBtn.addEventListener('click', async () => {
        await loadDevices();
        settingsModal.classList.remove('hidden');
    });
    settingsClose?.addEventListener('click', () => settingsModal.classList.add('hidden'));
    settingsModal.addEventListener('click', e => {
        if (e.target === settingsModal) settingsModal.classList.add('hidden');
    });

    // Apply camera/mic change
    selCam?.addEventListener('change', async () => {
        try {
            const constraints = {
                video: { deviceId: { exact: selCam.value } },
                audio: selMic?.value ? { deviceId: { exact: selMic.value } } : true,
            };
            const newStream = await navigator.mediaDevices.getUserMedia(constraints);
            const newVideoTrack = newStream.getVideoTracks()[0];
            const newAudioTrack = newStream.getAudioTracks()[0];
            if (mystream) {
                mystream.getVideoTracks().forEach(t => { t.stop(); mystream.removeTrack(t); });
                mystream.getAudioTracks().forEach(t => { t.stop(); mystream.removeTrack(t); });
                if (newVideoTrack) mystream.addTrack(newVideoTrack);
                if (newAudioTrack) mystream.addTrack(newAudioTrack);
            }
            myvideo.srcObject = mystream;
            await replaceVideoTrackOnPeers(newVideoTrack);
            showToast('Camera changed');
        } catch (e) { showToast('Could not switch camera: ' + e.message, 'error'); }
    });

    selMic?.addEventListener('change', () => {
        showToast('Microphone change will apply on next call');
    });

    // Speaker output (Chrome only)
    selSpeaker?.addEventListener('change', () => {
        document.querySelectorAll('video').forEach(v => {
            if (v.setSinkId) v.setSinkId(selSpeaker.value).catch(() => {});
        });
    });

    // Quality selector
    selQuality?.addEventListener('change', () => {
        const q = selQuality.value;
        const constraints = q === 'hd'
            ? { width: 1280, height: 720 }
            : q === 'sd'
            ? { width: 640,  height: 360 }
            : { width: { ideal: 1280 }, height: { ideal: 720 } };

        if (mystream) {
            mystream.getVideoTracks().forEach(t => {
                t.applyConstraints({ video: constraints }).catch(() => {});
            });
        }
        showToast(`Video quality: ${q.toUpperCase()}`);
    });
})();

// ═══════════════════════════════════════════════
// INVITE LINK BUTTON
// ═══════════════════════════════════════════════
document.getElementById('invite-link-btn')?.addEventListener('click', () => {
    const url = `${location.origin}/room.html?room=${encodeURIComponent(roomid)}`;
    navigator.clipboard.writeText(url)
        .then(() => showToast('Invite link copied!'))
        .catch(() => showToast('Could not copy link', 'error'));
});

// ═══════════════════════════════════════════════
// WHITEBOARD — Brush size, Undo/Redo, Text tool
// ═══════════════════════════════════════════════
(function initWhiteboardExtras() {
    const wbSizeSlider = document.getElementById('wb-size');
    const wbUndoStack  = [];   // stores ImageData snapshots
    const wbRedoStack  = [];
    const MAX_HISTORY  = 30;
    let   wbTool       = 'pen'; // 'pen' | 'eraser' | 'text'
    let   wbTextActive = false;

    // Sync size slider
    wbSizeSlider?.addEventListener('input', () => {
        drawSize = Number(wbSizeSlider.value);
        if (wbTool === 'eraser') drawSize = drawSize * 3;
    });

    // Tool buttons
    window.setWbTool = function(tool) {
        wbTool = tool;
        document.querySelectorAll('#wb-pen, #wb-text, #wb-eraser').forEach(b => b.classList.remove('wb-active'));
        const activeBtn = { pen: '#wb-pen', text: '#wb-text', eraser: '#wb-eraser' }[tool];
        document.querySelector(activeBtn)?.classList.add('wb-active');

        if (tool === 'eraser') {
            drawColor = 'white';
            drawSize  = Math.max(10, Number(wbSizeSlider?.value || 14) * 3);
        } else if (tool === 'pen') {
            // Get selected swatch color — fallback to current drawColor
            const selectedSwatch = document.querySelector('.wb-swatch.selected');
            if (selectedSwatch?.dataset.color) drawColor = selectedSwatch.dataset.color;
            drawSize = Number(wbSizeSlider?.value || 3);
        } else if (tool === 'text') {
            canvas.style.cursor = 'text';
        }

        if (tool !== 'text') canvas.style.cursor = 'crosshair';
    };

    // Text tool click handler
    canvas.addEventListener('click', e => {
        if (wbTool !== 'text') return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const input = document.createElement('input');
        input.type  = 'text';
        input.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY - 20}px;
            background:transparent;border:none;border-bottom:2px solid ${drawColor};
            color:${drawColor};font-size:16px;outline:none;z-index:9999;min-width:80px;`;
        document.body.appendChild(input);
        input.focus();
        wbTextActive = true;

        input.addEventListener('blur', () => {
            if (input.value.trim()) {
                ctx.fillStyle = drawColor;
                ctx.font = `${drawSize * 5 + 10}px 'Google Sans', sans-serif`;
                ctx.fillText(input.value, x, y);
                socket.emit('draw-text', { x, y, text: input.value, color: drawColor, size: drawSize });
                scheduleSaveCanvas();
            }
            input.remove();
            wbTextActive = false;
        });
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') { input.value = ''; input.blur(); }
        });
    });

    // Save snapshot before each stroke for undo
    const origStartDraw = window.startDraw;
    window.startDraw = function(x, y) {
        // Save canvas state before drawing
        wbUndoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        if (wbUndoStack.length > MAX_HISTORY) wbUndoStack.shift();
        wbRedoStack.length = 0;  // clear redo on new stroke
        origStartDraw.call(this, x, y);
    };

    // Undo
    window.wbUndo = function() {
        if (!wbUndoStack.length) return;
        wbRedoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        ctx.putImageData(wbUndoStack.pop(), 0, 0);
        scheduleSaveCanvas();
    };

    // Redo
    window.wbRedo = function() {
        if (!wbRedoStack.length) return;
        wbUndoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        ctx.putImageData(wbRedoStack.pop(), 0, 0);
        scheduleSaveCanvas();
    };

    // Color swatch click — mark selected and switch to pen
    document.querySelectorAll('.wb-swatch').forEach(sw => {
        // Store color in dataset for later retrieval
        const style = sw.style.background || sw.className;
        sw.addEventListener('click', () => {
            document.querySelectorAll('.wb-swatch').forEach(s => s.classList.remove('selected'));
            sw.classList.add('selected');
            // Get color from the onclick attribute or style
            const onclickAttr = sw.getAttribute('onclick') || '';
            const colorMatch  = onclickAttr.match(/setColor\('([^']+)'\)/);
            if (colorMatch) {
                drawColor = colorMatch[1];
                sw.dataset.color = colorMatch[1];
            }
            wbTool = 'pen';
            drawSize = Number(wbSizeSlider?.value || 3);
            canvas.style.cursor = 'crosshair';
            document.querySelector('#wb-pen')?.classList.add('wb-active');
            document.querySelector('#wb-eraser')?.classList.remove('wb-active');
            document.querySelector('#wb-text')?.classList.remove('wb-active');
        });
    });

    // Select black swatch by default
    const blackSwatch = document.querySelector('.wb-swatch.black');
    if (blackSwatch) {
        blackSwatch.classList.add('selected');
        blackSwatch.dataset.color = 'black';
    }

    // Keyboard shortcuts for undo/redo
    document.addEventListener('keydown', e => {
        if (!boardVisible) return;
        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); window.wbUndo(); }
        if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
            e.preventDefault(); window.wbRedo();
        }
    });

    // Receive text from remote
    socket.on('draw-text', data => {
        if (!data) return;
        ctx.fillStyle = data.color || 'black';
        ctx.font = `${(data.size || 3) * 5 + 10}px 'Google Sans', sans-serif`;
        ctx.fillText(data.text, data.x, data.y);
    });
})();

// ═══════════════════════════════════════════════
// EMOJI REACTIONS IN CHAT
// ═══════════════════════════════════════════════
(function initEmojiPicker() {
    const pickerBtn  = document.getElementById('emoji-picker-btn');
    const emojiPopup = document.getElementById('emoji-popup');
    const chatInput  = document.querySelector('.chat-input');
    if (!pickerBtn || !emojiPopup || !chatInput) return;

    const emojis = ['😀','😂','👍','❤️','🎉','🔥','👏','🤔','😮','😢','🙏','💡',
                    '✅','🚀','💯','🎯','🤝','👋','😎','🙌'];

    // Build emoji spans
    emojiPopup.innerHTML = '';
    emojis.forEach(em => {
        const span = document.createElement('span');
        span.textContent = em;
        span.style.cssText = 'cursor:pointer;padding:2px;display:inline-block;';
        span.addEventListener('click', () => {
            chatInput.value += em;
            chatInput.focus();
            emojiPopup.classList.add('hidden');
        });
        emojiPopup.appendChild(span);
    });

    pickerBtn.addEventListener('click', e => {
        e.stopPropagation();
        emojiPopup.classList.toggle('hidden');
    });

    document.addEventListener('click', e => {
        if (!emojiPopup.contains(e.target) && e.target !== pickerBtn) {
            emojiPopup.classList.add('hidden');
        }
    });
})();

// ═══════════════════════════════════════════════
// NETWORK QUALITY INDICATOR
// Measures RTCPeerConnection round-trip time every
// 4 seconds and updates the signal icon color.
// ═══════════════════════════════════════════════
(function initNetworkQuality() {
    const netEl   = document.getElementById('net-quality');
    const netIcon = document.getElementById('net-icon');
    if (!netEl) return;

    async function checkQuality() {
        const pcs = Object.values(connections);
        if (!pcs.length) { netEl.className = 'net-quality'; return; }

        let totalRtt = 0, count = 0;
        for (const pc of pcs) {
            try {
                const stats = await pc.getStats();
                stats.forEach(report => {
                    if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.currentRoundTripTime != null) {
                        totalRtt += report.currentRoundTripTime * 1000; // ms
                        count++;
                    }
                });
            } catch (_) {}
        }

        if (!count) return;
        const avgRtt = totalRtt / count;
        netEl.className = 'net-quality';

        if (avgRtt < 100) {
            netEl.classList.add('good');
            netEl.title = `Network: Good (${avgRtt.toFixed(0)}ms)`;
        } else if (avgRtt < 300) {
            netEl.classList.add('fair');
            netEl.title = `Network: Fair (${avgRtt.toFixed(0)}ms)`;
        } else {
            netEl.classList.add('poor');
            netEl.title = `Network: Poor (${avgRtt.toFixed(0)}ms)`;
        }
    }

    setInterval(checkQuality, 4000);
})();
