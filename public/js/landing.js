const createButton = document.querySelector("#createroom");
const videoCont = document.querySelector('.video-self');
const codeCont = document.querySelector('#roomcode');
const passCont = document.querySelector('#roompassword');
const joinBut = document.querySelector('#joinroom');
const mic = document.querySelector('#mic');
const cam = document.querySelector('#webcam');

let micAllowed = true;
let camAllowed = true;
let mediaStream = null;

// Generate UUID v4 using crypto API
function generateRoomId() {
    return crypto.randomUUID();
}

// Get user media with error handling
async function getMediaStream(constraints) {
    try {
        return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
        console.error('Media access error:', error);
        if (error.name === 'NotAllowedError') {
            alert('Camera/Microphone access denied. Please enable permissions.');
        } else if (error.name === 'NotFoundError') {
            alert('No camera or microphone found.');
        } else {
            alert('Failed to access media devices.');
        }
        return null;
    }
}

// Initialize camera preview
async function initializeMediaPreview() {
    const stream = await getMediaStream({ video: true, audio: true });
    if (stream) {
        videoCont.srcObject = stream;
        mediaStream = stream;
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeMediaPreview();
});

// Handle create room
createButton.addEventListener('click', (e) => {
    e.preventDefault();
    createButton.disabled = true;
    const createroomtext = 'Creating Room...';
    let charIndex = 0;
    let isAdding = true;

    const animationInterval = setInterval(() => {
        if (isAdding) {
            if (charIndex < createroomtext.length) {
                createButton.textContent = createroomtext.substring(0, charIndex + 1);
                charIndex++;
            } else {
                isAdding = false;
            }
        } else {
            if (charIndex > 0) {
                createButton.textContent = createroomtext.substring(0, charIndex - 1);
                charIndex--;
            } else {
                isAdding = true;
            }
        }
    }, 100);

    // Stop animation and navigate
    setTimeout(() => {
        clearInterval(animationInterval);
        const roomId = generateRoomId();
        window.location.href = `/room.html?room=${encodeURIComponent(roomId)}`;
    }, 2000);
});

// Handle join room
joinBut.addEventListener('click', (e) => {
    e.preventDefault();
    const trimmedCode = codeCont.value.trim();

    if (!trimmedCode) {
        codeCont.classList.add('roomcode-error');
        codeCont.focus();
        return;
    }

    codeCont.classList.remove('roomcode-error');
    // Pass optional password as URL query param
    const password = passCont ? passCont.value.trim() : '';
    const url = `/room.html?room=${encodeURIComponent(trimmedCode)}` +
                (password ? `&pwd=${encodeURIComponent(password)}` : '');
    window.location.href = url;
});

// Remove error on input change
codeCont.addEventListener('input', () => {
    if (codeCont.value.trim() !== "") {
        codeCont.classList.remove('roomcode-error');
    }
});

// Handle camera toggle
cam.addEventListener('click', async () => {
    try {
        if (camAllowed) {
            // Disable camera
            const stream = await getMediaStream({ 
                video: false, 
                audio: micAllowed 
            });
            if (stream) {
                videoCont.srcObject = stream;
                mediaStream = stream;
                cam.classList.add('nodevice');
                cam.innerHTML = '<i class="fas fa-video-slash"></i>';
                camAllowed = false;
            }
        } else {
            // Enable camera
            const stream = await getMediaStream({ 
                video: true, 
                audio: micAllowed 
            });
            if (stream) {
                videoCont.srcObject = stream;
                mediaStream = stream;
                cam.classList.remove('nodevice');
                cam.innerHTML = '<i class="fas fa-video"></i>';
                camAllowed = true;
            }
        }
    } catch (error) {
        console.error('Camera toggle error:', error);
    }
});

// Handle microphone toggle
mic.addEventListener('click', async () => {
    try {
        if (micAllowed) {
            // Disable audio
            const stream = await getMediaStream({ 
                video: camAllowed, 
                audio: false 
            });
            if (stream) {
                videoCont.srcObject = stream;
                mediaStream = stream;
                mic.classList.add('nodevice');
                mic.innerHTML = '<i class="fas fa-microphone-slash"></i>';
                micAllowed = false;
            }
        } else {
            // Enable audio
            const stream = await getMediaStream({ 
                video: camAllowed, 
                audio: true 
            });
            if (stream) {
                videoCont.srcObject = stream;
                mediaStream = stream;
                mic.classList.remove('nodevice');
                mic.innerHTML = '<i class="fas fa-microphone"></i>';
                micAllowed = true;
            }
        }
    } catch (error) {
        console.error('Microphone toggle error:', error);
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
    }
});
