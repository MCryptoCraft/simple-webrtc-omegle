const socket = io();

// UI Elements
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const statusBadge = document.getElementById('status-badge');

// Overlays
const remoteOverlay = document.getElementById('remote-overlay');
const localOverlay = document.getElementById('local-overlay');
const remoteStatusText = document.getElementById('remote-status-text');

const startBtn = document.getElementById('start-btn');
const nextBtn = document.getElementById('next-btn');
const stopBtn = document.getElementById('stop-btn');
const activeControls = document.getElementById('active-controls');

const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatBox = document.getElementById('chat-box');

// WebRTC State
let localStream;
let peerConnection;
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// --- HELPER: Control Overlays ---
function setVideoState(type, state) {
    // type: 'local' or 'remote'
    // state: 'playing', 'waiting', 'stopped'
    
    const overlay = type === 'local' ? localOverlay : remoteOverlay;
    
    if (state === 'playing') {
        overlay.classList.remove('visible');
    } else if (state === 'waiting') {
        overlay.classList.add('visible');
        if (type === 'remote') {
            overlay.innerHTML = '<div class="spinner"></div><span>Searching...</span>';
        }
    } else if (state === 'stopped') {
        overlay.classList.add('visible');
        overlay.innerHTML = '<div class="icon">⏹</div><span>Stopped</span>';
    }
}

// --- MEDIA FUNCTIONS ---
async function startMedia() {
    try {
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            setVideoState('local', 'playing');
        }
    } catch (err) {
        console.error("Media Error:", err);
        addSystemMessage("Error: Please allow camera access.");
    }
}

function stopMedia() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    setVideoState('local', 'stopped');
    setVideoState('remote', 'stopped');
}

// --- BUTTON LISTENERS ---
startBtn.addEventListener('click', async () => {
    await startMedia();
    socket.emit('find-match');
    updateUI('searching');
    setVideoState('remote', 'waiting'); // Show spinner immediately
});

nextBtn.addEventListener('click', () => {
    // 1. Clear remote video immediately
    resetConnection();
    remoteVideo.srcObject = null;
    
    // 2. Show spinner overlay
    setVideoState('remote', 'waiting');
    
    // 3. Logic
    clearChat();
    socket.emit('find-match');
    updateUI('searching');
});

stopBtn.addEventListener('click', () => {
    stopCall();
});

// Auto-stop on minimize
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'hidden' && localStream) {
        stopCall();
    }
});

function stopCall() {
    resetConnection();
    stopMedia();
    socket.emit('disconnect-manual');
    updateUI('idle');
    statusBadge.innerText = "Idle";
    statusBadge.style.background = "#333";
}

function resetConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
}

// --- CHAT LOGIC ---
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = chatInput.value.trim();
    if (msg) {
        addMessage(msg, 'local');
        socket.emit('send-message', msg);
        chatInput.value = '';
    }
});

socket.on('receive-message', (msg) => {
    addMessage(msg, 'remote');
});

function addMessage(text, type) {
    const div = document.createElement('div');
    div.classList.add('msg', type);
    div.innerText = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function addSystemMessage(text) {
    const div = document.createElement('div');
    div.classList.add('system-msg');
    div.innerText = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function clearChat() {
    chatBox.innerHTML = '<div class="system-msg">New stranger found. Say hi!</div>';
}

// --- SOCKET EVENTS ---
socket.on('waiting', (msg) => {
    statusBadge.innerText = "Searching...";
    statusBadge.style.background = "#f1c40f";
    statusBadge.style.color = "black";
    setVideoState('remote', 'waiting'); // Ensure spinner is showing
    addSystemMessage(msg);
});

socket.on('match-found', async ({ role }) => {
    statusBadge.innerText = "Connected";
    statusBadge.style.background = "#2ecc71";
    statusBadge.style.color = "white";
    updateUI('connected');
    addSystemMessage("Stranger connected!");

    createPeerConnection();
    if(localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    if (role === 'initiator') {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', offer);
    }
});

socket.on('offer', async (offer) => {
    if (!peerConnection) createPeerConnection();
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', answer);
});

socket.on('answer', async (answer) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('ice-candidate', async (candidate) => {
    if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
});

socket.on('peer-disconnected', () => {
    resetConnection();
    remoteVideo.srcObject = null;
    statusBadge.innerText = "Stranger Left";
    statusBadge.style.background = "#e74c3c";
    
    // Show stopped state for remote
    setVideoState('remote', 'stopped');
    
    addSystemMessage("Stranger left. Click Next.");
});

function createPeerConnection() {
    if (peerConnection) return;
    peerConnection = new RTCPeerConnection(rtcConfig);
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) socket.emit('ice-candidate', event.candidate);
    };
    peerConnection.ontrack = (event) => {
        // HIDE the overlay when video actually arrives
        remoteVideo.srcObject = event.streams[0];
        setVideoState('remote', 'playing');
    };
}

// --- UI MANAGER ---
function updateUI(state) {
    if (state === 'idle') {
        startBtn.parentElement.classList.remove('hidden');
        startBtn.classList.remove('hidden');
        activeControls.classList.add('hidden');
        chatForm.classList.add('hidden');
    } else if (state === 'searching') {
        startBtn.classList.add('hidden');
        activeControls.classList.add('hidden');
        chatForm.classList.add('hidden');
    } else if (state === 'connected') {
        startBtn.classList.add('hidden');
        activeControls.classList.remove('hidden');
        chatForm.classList.remove('hidden');
    }
}

// Force UI reset on load
updateUI('idle');
setVideoState('local', 'stopped');
setVideoState('remote', 'stopped');

