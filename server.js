const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const https = require('https'); // Required for the self-ping logic

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// --- GAME STATE ---
const players = new Map();
const chatMessages = [];

// --- ENDPOINTS ---

// Health check endpoint for Render.com
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        players: players.size,
        uptime: process.uptime()
    });
});

app.get('/', (req, res) => {
    res.json({ 
        message: 'Boblox Game Server Running',
        players: players.size 
    });
});

// --- SELF-PING LOGIC TO KEEP RENDER ALIVE ---
// Replace this with your actual Render URL once you deploy
const RENDER_EXTERNAL_URL = `https://your-app-name.onrender.com`; 

function keepAlive() {
    console.log("Sending self-ping to keep server awake...");
    https.get(`${RENDER_EXTERNAL_URL}/health`, (res) => {
        console.log(`Self-ping status: ${res.statusCode}`);
    }).on('error', (err) => {
        console.error(`Self-ping failed: ${err.message}`);
    });
}

// Ping every 10 minutes (600,000 milliseconds)
if (process.env.NODE_ENV === 'production') {
    setInterval(keepAlive, 600000);
}

// --- SOCKET.IO LOGIC ---
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on('join', (data) => {
        const player = {
            id: socket.id,
            name: data.name || `Player${Math.floor(Math.random() * 1000)}`,
            position: { x: 0, y: 10, z: 0 },
            rotation: 0,
            health: 100,
            color: data.color || { r: 255, g: 255, b: 0 }
        };

        players.set(socket.id, player);
        socket.emit('init', {
            playerId: socket.id,
            players: Array.from(players.values())
        });
        socket.broadcast.emit('playerJoined', player);
        console.log(`${player.name} joined the game`);
    });

    socket.on('move', (data) => {
        const player = players.get(socket.id);
        if (player) {
            player.position = data.position;
            player.rotation = data.rotation;
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                position: data.position,
                rotation: data.rotation
            });
        }
    });

    socket.on('chat', (message) => {
        const player = players.get(socket.id);
        if (player && message && message.trim().length > 0) {
            const chatMsg = {
                playerId: socket.id,
                playerName: player.name,
                message: message.trim(),
                timestamp: Date.now()
            };
            chatMessages.push(chatMsg);
            if (chatMessages.length > 100) chatMessages.shift();
            io.emit('chatMessage', chatMsg);
        }
    });

    socket.on('damage', (data) => {
        const player = players.get(socket.id);
        if (player) {
            player.health = Math.max(0, player.health - data.amount);
            io.emit('playerHealth', { id: socket.id, health: player.health });

            if (player.health <= 0) {
                setTimeout(() => {
                    player.health = 100;
                    player.position = { x: 0, y: 10, z: 0 };
                    io.emit('playerRespawn', {
                        id: socket.id,
                        position: player.position,
                        health: player.health
                    });
                }, 3000);
            }
        }
    });

    socket.on('disconnect', () => {
        const player = players.get(socket.id);
        if (player) {
            players.delete(socket.id);
            socket.broadcast.emit('playerLeft', socket.id);
        }
    });
});

// --- SERVER START ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎮 Boblox Game Server running on port ${PORT}`);
    
    // Start pinging immediately if production
    if (process.env.NODE_ENV === 'production') {
        keepAlive();
    }
});

process.on('SIGTERM', () => {
    server.close(() => {
        process.exit(0);
    });
});
