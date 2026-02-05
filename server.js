const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Allow big game files

// --- STORAGE ---
// In a real app, use a database (MongoDB). For now, we keep it in memory.
let players = new Map();
let publishedGames = [
    { name: "Boblox Baseplate", creator: "Frozy's Studio", plays: 120, id: "baseplate", likes: 5, favorites: 2 }
];

// --- API ENDPOINTS ---

// 1. Get All Games (For the website to list them)
app.get('/api/games', (req, res) => {
    res.json(publishedGames);
});

// 2. Publish Game (For C# Client)
app.post('/api/publish', (req, res) => {
    const { name, creator, data } = req.body;
    
    // Check if game exists to update it, or create new
    const existing = publishedGames.find(g => g.name === name);
    if (existing) {
        existing.lastUpdated = new Date();
        existing.data = data; // Update the save file
        console.log(`Game Updated: ${name}`);
    } else {
        publishedGames.push({
            name: name || "Untitled Game",
            creator: creator || "Unknown",
            plays: 0,
            likes: 0,
            favorites: 0,
            id: Date.now().toString(),
            data: data, // The string of parts/scripts
            date: new Date()
        });
        console.log(`New Game Published: ${name}`);
    }
    
    res.json({ success: true, message: "Game Published Successfully!" });
});

// 3. Stats Endpoints (For website counters)
app.get('/api/players', (req, res) => {
    res.json({ count: players.size });
});

app.get('/api/game/stats', (req, res) => {
    // Just returning dummy stats for the "Featured" game
    const g = publishedGames[0];
    res.json({ likes: g.likes, favorites: g.favorites, visits: g.plays });
});

// --- MULTIPLAYER LOGIC ---
io.on('connection', (socket) => {
    console.log(`Socket Connected: ${socket.id}`);

    socket.on('join', (data) => {
        // Create the player data from what the C# client sent
        const player = {
            id: socket.id,
            name: data.name || "Guest",
            color: data.color || { r:0, g:0, b:255 },
            position: { x: 0, y: 5, z: 0 },
            rotation: 0
        };
        players.set(socket.id, player);
        
        console.log(`${player.name} joined!`);

        // 1. Send INIT to the new player (tell them about existing players)
        // We convert the Map values to an Array
        socket.emit('42', ["init", { 
            playerId: socket.id, 
            players: Array.from(players.values()) 
        }]);
        
        // 2. Send PLAYERJOINED to everyone else (tell them about the new player)
        socket.broadcast.emit('42', ["playerJoined", player]);
    });

    socket.on('move', (data) => {
        const p = players.get(socket.id);
        if(p) {
            p.position = data.position;
            p.rotation = data.rotation;
            
            // Broadcast move to everyone else
            socket.broadcast.emit('42', ["playerMoved", { 
                id: socket.id, 
                position: p.position, 
                rotation: p.rotation 
            }]);
        }
    });
    
    socket.on('chat', (msg) => {
        const p = players.get(socket.id);
        if(p) {
            io.emit('42', ["chatMessage", {
                playerId: socket.id,
                playerName: p.name,
                message: msg
            }]);
        }
    });

    socket.on('disconnect', () => {
        players.delete(socket.id);
        io.emit('42', ["playerLeft", socket.id]);
        console.log(`Socket Disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
