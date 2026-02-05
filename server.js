const express = require('express');
const http = require('http');
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

// Store players in an Object for easy lookup
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
        // Create player object
        const newPlayer = {
            id: socket.id,
            name: data.name || "Guest",
            color: data.color || { r:0, g:0, b:255 },
            position: { x: 0, y: 5, z: 0 },
            rotation: 0
        };

        // Add to global list
        players[socket.id] = newPlayer;
        
        console.log(`${newPlayer.name} joined. Total: ${Object.keys(players).length}`);

        // 1. Send ALL EXISTING PLAYERS to the NEW player ("init")
        // Convert object to array
        const playerList = Object.values(players);
        socket.emit('42', ["init", { players: playerList }]);
        
        // 2. Send NEW PLAYER to EVERYONE ELSE ("playerJoined")
        socket.broadcast.emit('42', ["playerJoined", newPlayer]);
    });

    // Handle Movement
    socket.on('move', (data) => {
        const p = players[socket.id];
        if (p) {
            // Update server state
            p.position = data.position;
            p.rotation = data.rotation;
            
            // Broadcast to others (excluding sender)
            socket.broadcast.emit('42', ["playerMoved", { 
                id: socket.id, 
                position: p.position, 
                rotation: p.rotation 
            }]);
        }
    });

    // Handle Chat
    socket.on('chat', (msg) => {
        const p = players[socket.id];
        if (p) {
            console.log(`[Chat] ${p.name}: ${msg}`);
            io.emit('42', ["chatMessage", {
                playerId: socket.id,
                playerName: p.name,
                message: msg
            }]);
        }
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
        if (players[socket.id]) {
            console.log(`Player Left: ${players[socket.id].name}`);
            delete players[socket.id];
            
            // Tell everyone to remove this player
            io.emit('42', ["playerLeft", socket.id]);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Game Server running on port ${PORT}`));
