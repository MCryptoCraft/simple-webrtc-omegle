const socket = io();

const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const startBtn = document.getElementById('start-btn');
const nextBtn = document.getElementById('next-btn');
const statusText = document.getElementById('status-text');

let localStream;
let peerConnection;
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }, // Free public STUN server
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// 1. Get User Media (Camera/Mic)
async function initMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        startBtn.disabled = false;
    } catch (err) {
        console.error('Error accessing media:', err);
        statusText.innerText = 'Error: Could not access camera/microphone.';
        startBtn.disabled = true;
    }
}

// Initialize media on load
initMedia();

// 2. Button Event Listeners
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
    socket.emit('find-match'); // Automatically find next
    updateUI('searching');
});

// 3. Socket Events
socket.on('waiting', (msg) => {
    statusText.innerText = msg;
});

socket.on('match-found', async ({ role }) => {
    statusText.innerText = 'Connected! Say Hello.';
    updateUI('connected');
    
    createPeerConnection();

    // Add local tracks to the connection
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    if (role === 'initiator') {
        // Initiator creates the offer
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('offer', offer);
        } catch (err) {
            console.error('Error creating offer:', err);
        }
    }
});

socket.on('offer', async (offer) => {
    if (!peerConnection) createPeerConnection(); // Should exist, but safety check

    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', answer);
    } catch (err) {
        console.error('Error handling offer:', err);
    }
});

socket.on('answer', async (answer) => {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
        console.error('Error handling answer:', err);
    }
});

socket.on('ice-candidate', async (candidate) => {
    try {
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    } catch (err) {
        console.error('Error adding ICE candidate:', err);
    }
});

socket.on('peer-disconnected', () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    remoteVideo.srcObject = null;
    statusText.innerText = 'Stranger disconnected. Click Next.';
    updateUI('disconnected');
});

// 4. WebRTC Functions
function createPeerConnection() {
    if (peerConnection) return;

    peerConnection = new RTCPeerConnection(rtcConfig);

    // Handle ICE candidates (network paths)
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', event.candidate);
        }
    };

    // Handle incoming video stream
    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };
}

// 5. UI Helper
function updateUI(state) {
    if (state === 'searching') {
        startBtn.classList.add('hidden');
        nextBtn.classList.add('hidden');
        statusText.innerText = 'Searching for a stranger...';
    } else if (state === 'connected') {
        startBtn.classList.add('hidden');
        nextBtn.classList.remove('hidden');
    } else if (state === 'disconnected') {
        nextBtn.classList.remove('hidden');
        // startBtn is kept hidden to encourage "Next" flow
    }
}