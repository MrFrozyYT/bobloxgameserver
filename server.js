const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

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

// Game state
const players = new Map();
const chatMessages = [];

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

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Player joins
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
        
        // Send current players to new player
        socket.emit('init', {
            playerId: socket.id,
            players: Array.from(players.values())
        });

        // Notify others about new player
        socket.broadcast.emit('playerJoined', player);
        
        console.log(`${player.name} joined the game`);
    });

    // Player position update
    socket.on('move', (data) => {
        const player = players.get(socket.id);
        if (player) {
            player.position = data.position;
            player.rotation = data.rotation;
            
            // Broadcast to other players
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                position: data.position,
                rotation: data.rotation
            });
        }
    });

    // Chat message
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
            
            // Keep only last 100 messages
            if (chatMessages.length > 100) {
                chatMessages.shift();
            }
            
            // Broadcast to all players
            io.emit('chatMessage', chatMsg);
            
            console.log(`[CHAT] ${player.name}: ${message}`);
        }
    });

    // Player takes damage
    socket.on('damage', (data) => {
        const player = players.get(socket.id);
        if (player) {
            player.health = Math.max(0, player.health - data.amount);
            
            io.emit('playerHealth', {
                id: socket.id,
                health: player.health
            });

            if (player.health <= 0) {
                console.log(`${player.name} died`);
                // Respawn after 3 seconds
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

    // Player disconnects
    socket.on('disconnect', () => {
        const player = players.get(socket.id);
        if (player) {
            console.log(`${player.name} disconnected`);
            players.delete(socket.id);
            
            // Notify others
            socket.broadcast.emit('playerLeft', socket.id);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎮 Boblox Game Server running on port ${PORT}`);
    console.log(`📡 WebSocket server ready`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
