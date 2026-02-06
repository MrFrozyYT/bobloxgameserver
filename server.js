const express = require('express');
const http = require('http');
const https = require('https'); // Added https for self-pinging
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: { origin: "*" },
    pingInterval: 2000, 
    pingTimeout: 5000
});

app.use(cors());

// Store players
let players = {}; 

app.get('/', (req, res) => {
    res.json({ 
        message: "Boblox Game Server Running", 
        players: Object.keys(players).length 
    });
});

io.on('connection', (socket) => {
    console.log(`Player Connected: ${socket.id}`);

    // Handle Join
    socket.on('join', (data) => {
        const newPlayer = {
            id: socket.id,
            name: data.name || "Guest",
            color: data.color || { r:0, g:0, b:255 },
            position: { x: 0, y: 5, z: 0 },
            rotation: 0
        };

        players[socket.id] = newPlayer;
        console.log(`${newPlayer.name} joined. Total: ${Object.keys(players).length}`);

        // 1. Send ALL players to the NEW guy
        socket.emit('init', { players: Object.values(players) });
        
        // 2. Send NEW guy to EVERYONE else
        socket.broadcast.emit('playerJoined', newPlayer);
    });

    // Handle Movement
    socket.on('move', (data) => {
        const p = players[socket.id];
        if (p) {
            p.position = data.position;
            p.rotation = data.rotation;
            
            // Broadcast to others
            socket.broadcast.emit('playerMoved', { 
                id: socket.id, 
                position: p.position, 
                rotation: p.rotation 
            });
        }
    });

    // Handle Chat
    socket.on('chat', (msg) => {
        const p = players[socket.id];
        if (p) {
            console.log(`[Chat] ${p.name}: ${msg}`);
            io.emit('chatMessage', {
                playerId: socket.id,
                playerName: p.name,
                message: msg
            });
        }
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
        if (players[socket.id]) {
            console.log(`Player Left: ${players[socket.id].name}`);
            delete players[socket.id];
            io.emit('playerLeft', socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Game Server running on port ${PORT}`);
    
    // --- KEEP ALIVE LOGIC ---
    // Pings the server every 10 minutes (600,000 ms) to prevent sleep
    const interval = 10 * 60 * 1000; 
    const url = process.env.RENDER_EXTERNAL_URL || 'https://bobloxserver.onrender.com';

    console.log(`Keep-Alive enabled. Pinging ${url} every 10 minutes.`);

    setInterval(() => {
        https.get(url, (res) => {
            console.log(`[Keep-Alive] Ping sent to ${url}. Status: ${res.statusCode}`);
        }).on('error', (e) => {
            console.error(`[Keep-Alive] Ping failed: ${e.message}`);
        });
    }, interval);
});
