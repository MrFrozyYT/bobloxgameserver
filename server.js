const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json({ limit: '50mb' })); 

let players = new Map();
let publishedGames = [
    { name: "Boblox Baseplate", creator: "Frozy's Studio", plays: 120, likes: 5, favorites: 2, id: "baseplate" }
];

// --- API ENDPOINTS ---

// 1. ROOT STATUS (Fixed "Cannot GET /")
app.get('/', (req, res) => {
    res.json({ 
        message: "Boblox Game Server Running", 
        players: players.size,
        uptime: process.uptime()
    });
});

// 2. Get All Games
app.get('/api/games', (req, res) => {
    res.json(publishedGames);
});

// 3. Publish Game
app.post('/api/publish', (req, res) => {
    const { name, creator, data } = req.body;
    const existing = publishedGames.find(g => g.name === name);
    if (existing) {
        existing.lastUpdated = new Date();
        existing.data = data;
    } else {
        publishedGames.push({
            name: name || "Untitled Game",
            creator: creator || "Unknown",
            plays: 0, likes: 0, favorites: 0,
            id: Date.now().toString(),
            data: data,
            date: new Date()
        });
    }
    res.json({ success: true, message: "Published!" });
});

// 4. Stats
app.get('/api/players', (req, res) => { res.json({ count: players.size }); });
app.get('/api/game/stats', (req, res) => {
    const g = publishedGames[0];
    res.json({ likes: g.likes, favorites: g.favorites, visits: g.plays });
});

// --- MULTIPLAYER ---
io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    socket.on('join', (data) => {
        const player = {
            id: socket.id,
            name: data.name || "Guest",
            color: data.color || { r:0, g:0, b:255 },
            position: { x: 0, y: 5, z: 0 },
            rotation: 0
        };
        players.set(socket.id, player);
        
        socket.emit('42', ["init", { playerId: socket.id, players: Array.from(players.values()) }]);
        socket.broadcast.emit('42', ["playerJoined", player]);
    });

    socket.on('move', (data) => {
        const p = players.get(socket.id);
        if(p) {
            p.position = data.position;
            p.rotation = data.rotation;
            socket.broadcast.emit('42', ["playerMoved", { id: socket.id, position: p.position, rotation: p.rotation }]);
        }
    });
    
    socket.on('chat', (msg) => {
        const p = players.get(socket.id);
        if(p) {
            io.emit('42', ["chatMessage", { playerId: socket.id, playerName: p.name, message: msg }]);
        }
    });

    socket.on('disconnect', () => {
        players.delete(socket.id);
        io.emit('42', ["playerLeft", socket.id]);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
