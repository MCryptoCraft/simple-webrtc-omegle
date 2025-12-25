const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let waitingQueue = [];
let activePeers = {}; // socketId -> partnerSocketId

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('find-match', () => {
        handleDisconnect(socket); // Clean up any old sessions

        if (waitingQueue.length > 0) {
            const partnerId = waitingQueue.shift();
            const partnerSocket = io.sockets.sockets.get(partnerId);
            
            if (partnerSocket) {
                activePeers[socket.id] = partnerId;
                activePeers[partnerId] = socket.id;

                socket.emit('match-found', { role: 'initiator', partnerId });
                partnerSocket.emit('match-found', { role: 'receiver', partnerId: socket.id });
            } else {
                waitingQueue.push(socket.id);
            }
        } else {
            waitingQueue.push(socket.id);
            socket.emit('waiting', 'Searching for someone...');
        }
    });

    // --- NEW: Handle Text Chat ---
    socket.on('send-message', (msg) => {
        const partnerId = activePeers[socket.id];
        if (partnerId) {
            io.to(partnerId).emit('receive-message', msg);
        }
    });
    // -----------------------------

    // WebRTC Signaling
    socket.on('offer', (payload) => {
        const partnerId = activePeers[socket.id];
        if (partnerId) io.to(partnerId).emit('offer', payload);
    });

    socket.on('answer', (payload) => {
        const partnerId = activePeers[socket.id];
        if (partnerId) io.to(partnerId).emit('answer', payload);
    });

    socket.on('ice-candidate', (payload) => {
        const partnerId = activePeers[socket.id];
        if (partnerId) io.to(partnerId).emit('ice-candidate', payload);
    });

    socket.on('disconnect', () => {
        handleDisconnect(socket);
    });

    function handleDisconnect(socket) {
        waitingQueue = waitingQueue.filter(id => id !== socket.id);
        const partnerId = activePeers[socket.id];
        if (partnerId) {
            const partnerSocket = io.sockets.sockets.get(partnerId);
            if (partnerSocket) {
                partnerSocket.emit('peer-disconnected');
            }
            delete activePeers[partnerId];
            delete activePeers[socket.id];
        }
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

