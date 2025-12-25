const socket = io();

const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const startBtn = document.getElementById('start-btn');
const nextBtn = document.getElementById('next-btn');
const statusBadge = document.getElementById('status-badge');

// Chat Elements
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatBox = document.getElementById('chat-box');

let localStream;
let peerConnection;
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// 1. Initialize Media
async function initMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (err) {
        console.error('Media error:', err);
        addSystemMessage("Error: Could not access camera/mic.");
    }
}
initMedia();

// 2. Button Handlers
startBtn.addEventListener('click', () => {
    socket.emit('find-match');
    updateUI('searching');
});

nextBtn.addEventListener('click', () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    remoteVideo.srcObject = null;
    clearChat(); // Clear chat when switching
    socket.emit('find-match');
    updateUI('searching');
});

// 3. Chat Logic
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = chatInput.value.trim();
    if (msg) {
        // Show my message
        addMessage(msg, 'local');
        // Send to partner
        socket.emit('send-message', msg);
        // Clear input
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
    chatBox.scrollTop = chatBox.scrollHeight; // Auto scroll to bottom
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

// 4. Socket Events
socket.on('waiting', (msg) => {
    statusBadge.innerText = "Searching...";
    addSystemMessage(msg);
});

socket.on('match-found', async ({ role }) => {
    statusBadge.innerText = "Connected";
    statusBadge.style.background = "#2ed573"; // Green
    updateUI('connected');
    addSystemMessage("Stranger connected!");

    createPeerConnection();
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

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
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    remoteVideo.srcObject = null;
    updateUI('disconnected');
    addSystemMessage("Stranger disconnected.");
    statusBadge.innerText = "Disconnected";
    statusBadge.style.background = "#ff4757";
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

function updateUI(state) {
    if (state === 'searching') {
        startBtn.classList.add('hidden');
        nextBtn.classList.add('hidden');
        chatForm.classList.add('hidden');
    } else if (state === 'connected') {
        startBtn.classList.add('hidden');
        nextBtn.classList.remove('hidden');
        chatForm.classList.remove('hidden'); // Show chat input
        chatInput.focus();
    } else if (state === 'disconnected') {
        nextBtn.classList.remove('hidden');
        chatForm.classList.add('hidden');
    }
}
