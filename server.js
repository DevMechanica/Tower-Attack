import { Server } from 'socket.io'; // Socket.IO
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Serve static files from the CURRENT directory
app.use(express.static(__dirname));

const PORT = process.env.PORT || 8080;
const SERVER_ID = Math.random().toString(36).substring(2, 7).toUpperCase();

// Socket.IO Setup
// We use a high timeout and ping interval for stability on GAE
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for simplicity
        methods: ["GET", "POST"]
    },
    transports: ['polling', 'websocket'], // Allow polling fallback!
    pingTimeout: 60000,
    pingInterval: 25000
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[${SERVER_ID}] Server started on port ${PORT}`);
});

// Store waiting players
const waitingPlayers = [];

io.on('connection', (socket) => {
    // Socket.IO automatically assigns IDs, but we can use our own if needed
    // socket.id is consistent
    const ip = socket.handshake.address;
    console.log(`[${SERVER_ID}] New Client Connected: ${socket.id} (IP: ${ip})`);

    // Add extra property for partner tracking
    socket.partner = null;

    // Handle Matchmaking
    let matched = false;

    // Look for an opponent in the queue
    // Note: In Socket.IO 'waitingPlayers' stores socket objects just like ws
    while (waitingPlayers.length > 0) {
        const potentialOpponent = waitingPlayers.shift();

        // Check if opponent is still connected
        if (potentialOpponent.connected) {
            // MATCH FOUND
            console.log(`[${SERVER_ID}] Match found! ${potentialOpponent.id} vs ${socket.id}`);

            const p1 = potentialOpponent;
            const p2 = socket;

            // Notify P1 (Defender)
            p1.emit('message', JSON.stringify({ type: 'ASSIGN_ROLE', role: 'defender', opponentId: p2.id }));

            // Notify P2 (Attacker)
            p2.emit('message', JSON.stringify({ type: 'ASSIGN_ROLE', role: 'attacker', opponentId: p1.id }));

            // Store partners
            p1.partner = p2;
            p2.partner = p1;

            matched = true;
            break;
        } else {
            console.log(`[${SERVER_ID}] Pruning disconnected player from queue: ${potentialOpponent.id}`);
        }
    }

    if (!matched) {
        // No match found, add to queue
        console.log(`[${SERVER_ID}] Player ${socket.id} added to waiting queue.`);
        waitingPlayers.push(socket);
        // Use 'message' event for consistency with client logic expecting JSON strings
        socket.emit('message', JSON.stringify({ type: 'WAITING_FOR_OPPONENT' }));
    }

    socket.on('message', (message) => {
        try {
            // Socket.IO usually sends objects, but our client sends JSON strings
            // We just forward it to the partner
            if (socket.partner && socket.partner.connected) {
                socket.partner.emit('message', message);
            }
        } catch (e) {
            console.error(`[${SERVER_ID}] Error handling message from ${socket.id}:`, e);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[${SERVER_ID}] Client Disconnected: ${socket.id}`);

        // Remove from waiting queue if present
        const index = waitingPlayers.indexOf(socket);
        if (index > -1) {
            waitingPlayers.splice(index, 1);
            console.log(`[${SERVER_ID}] Removed ${socket.id} from waiting queue.`);
        }

        // Notify partner
        if (socket.partner) {
            if (socket.partner.connected) {
                console.log(`[${SERVER_ID}] Notifying partner of disconnect.`);
                socket.partner.emit('message', JSON.stringify({ type: 'OPPONENT_DISCONNECTED' }));
            }
            socket.partner.partner = null;
            socket.partner = null;
        }
    });
});
