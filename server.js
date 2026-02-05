const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: { origin: "*" }, // Allow connections from anywhere (C# Client)
    pingInterval: 10000,
    pingTimeout: 5000
});

app.use(cors());

// Game State
let players = new Map();

// --- STATUS PAGE ---
app.get('/', (req, res) => {
    res.json({ 
        message: "Boblox Game Server Running", 
        activePlayers: players.size 
    });
});

// --- MULTIPLAYER LOGIC ---
io.on('connection', (socket) => {
    console.log(`Player Connected: ${socket.id}`);

    // 1. Handle Join
    socket.on('join', (data) => {
        const player = {
            id: socket.id,
            name: data.name || "Guest",
            color: data.color || { r:0, g:0, b:255 },
            position: { x: 0, y: 5, z: 0 },
            rotation: 0
        };
        players.set(socket.id, player);
        
        console.log(`${player.name} joined the game.`);

        // Tell new player about existing players
        socket.emit('42', ["init", { 
            playerId: socket.id, 
            players: Array.from(players.values()) 
        }]);
        
        // Tell everyone else about new player
        socket.broadcast.emit('42', ["playerJoined", player]);
    });

    // 2. Handle Movement
    socket.on('move', (data) => {
        const p = players.get(socket.id);
        if (p) {
            p.position = data.position;
            p.rotation = data.rotation;
            
            // Broadcast to others
            socket.broadcast.emit('42', ["playerMoved", { 
                id: socket.id, 
                position: p.position, 
                rotation: p.rotation 
            }]);
        }
    });

    // 3. Handle Chat
    socket.on('chat', (msg) => {
        const p = players.get(socket.id);
        if (p) {
            console.log(`Chat from ${p.name}: ${msg}`);
            io.emit('42', ["chatMessage", {
                playerId: socket.id,
                playerName: p.name,
                message: msg
            }]);
        }
    });

    // 4. Handle Disconnect
    socket.on('disconnect', () => {
        if (players.has(socket.id)) {
            console.log(`Player Left: ${socket.id}`);
            players.delete(socket.id);
            io.emit('42', ["playerLeft", socket.id]);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`GAME SERVER running on port ${PORT}`));
