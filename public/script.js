const socket = io();

// UI Elements
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const statusBadge = document.getElementById('status-badge');

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

// --- MEDIA FUNCTIONS ---
async function startMedia() {
    try {
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
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
}

// --- BUTTON LISTENERS ---
startBtn.addEventListener('click', async () => {
    await startMedia();
    socket.emit('find-match');
    updateUI('searching');
});

nextBtn.addEventListener('click', () => {
    resetConnection();
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
    addSystemMessage("Stranger left. Click Next.");
});

function createPeerConnection() {
    if (peerConnection) return;
    peerConnection = new RTCPeerConnection(rtcConfig);
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) socket.emit('ice-candidate', event.candidate);
    };
    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };
}

// --- UI MANAGER ---
function updateUI(state) {
    if (state === 'idle') {
        startBtn.parentElement.classList.remove('hidden'); // Ensure parent is visible
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

