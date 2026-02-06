const express = require('express');
const http = require('http');
const https = require('https');
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

// --- STORE ACTIVE ROCKETS ---
let rockets = {};
let nextRocketId = 0;

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
            rotation: 0,
            tool: false,      // Tool equipped state
            isJumping: false  // Animation state
        };
        
        players[socket.id] = newPlayer;
        console.log(`${newPlayer.name} joined. Total: ${Object.keys(players).length}`);
        
        // 1. Send ALL players to the NEW guy
        socket.emit('init', { 
            players: Object.values(players),
            rockets: Object.values(rockets) // Send existing rockets too!
        });
        
        // 2. Send NEW guy to EVERYONE else
        socket.broadcast.emit('playerJoined', newPlayer);
    });
    
    // Handle Movement (NOW WITH TOOL AND ANIMATION)
    socket.on('move', (data) => {
        const p = players[socket.id];
        if (p) {
            p.position = data.position;
            p.rotation = data.rotation;
            
            // --- UPDATE TOOL STATE ---
            if (data.tool !== undefined) p.tool = data.tool;
            
            // --- UPDATE ANIMATION STATE ---
            if (data.isJumping !== undefined) p.isJumping = data.isJumping;
            
            // Broadcast to others
            socket.broadcast.emit('playerMoved', { 
                id: socket.id, 
                position: p.position, 
                rotation: p.rotation,
                tool: p.tool,           // Send tool state
                isJumping: p.isJumping  // Send animation state
            });
        }
    });
    
    // --- NEW: ROCKET FIRING ---
    socket.on('fireRocket', (data) => {
        const rocketId = nextRocketId++;
        const rocket = {
            id: rocketId,
            ownerId: socket.id,
            position: data.position,
            velocity: data.velocity,
            createdAt: Date.now()
        };
        
        rockets[rocketId] = rocket;
        
        // Tell EVERYONE about this rocket
        io.emit('rocketSpawned', rocket);
        
        console.log(`Rocket ${rocketId} fired by ${socket.id}`);
    });
    
    // --- NEW: ROCKET HIT ---
    socket.on('rocketHit', (rocketId) => {
        if (rockets[rocketId]) {
            // Tell everyone this rocket exploded
            io.emit('rocketExploded', {
                id: rocketId,
                position: rockets[rocketId].position
            });
            
            delete rockets[rocketId];
            console.log(`Rocket ${rocketId} exploded`);
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

// Clean up old rockets every 10 seconds
setInterval(() => {
    const now = Date.now();
    for (let id in rockets) {
        if (now - rockets[id].createdAt > 30000) { // 30 seconds
            delete rockets[id];
        }
    }
}, 10000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Game Server running on port ${PORT}`);
    
    // --- KEEP ALIVE LOGIC ---
    const interval = 10 * 60 * 1000; 
    const url = process.env.RENDER_EXTERNAL_URL || 'https://bobloxgameserver.onrender.com';
    console.log(`Keep-Alive enabled. Pinging ${url} every 10 minutes.`);
    
    setInterval(() => {
        https.get(url, (res) => {
            console.log(`[Keep-Alive] Ping sent to ${url}. Status: ${res.statusCode}`);
        }).on('error', (e) => {
            console.error(`[Keep-Alive] Ping failed: ${e.message}`);
        });
    }, interval);
});
