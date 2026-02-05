const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: { origin: "*" },
    pingInterval: 10000,
    pingTimeout: 5000
});

app.use(cors());

let players = new Map();

app.get('/', (req, res) => {
    res.json({ message: "Boblox Game Server Running", players: players.size });
});

io.on('connection', (socket) => {
    console.log(`Player Connected: ${socket.id}`);

    socket.on('join', (data) => {
        const player = {
            id: socket.id,
            name: data.name || "Guest",
            color: data.color || { r:0, g:0, b:255 },
            position: { x: 0, y: 5, z: 0 },
            rotation: 0
        };
        players.set(socket.id, player);
        
        // Send existing players to new guy
        socket.emit('42', ["init", { playerId: socket.id, players: Array.from(players.values()) }]);
        
        // Send new guy to everyone else
        socket.broadcast.emit('42', ["playerJoined", player]);
    });

    socket.on('move', (data) => {
        const p = players.get(socket.id);
        if (p) {
            p.position = data.position;
            p.rotation = data.rotation;
            socket.broadcast.emit('42', ["playerMoved", { id: socket.id, position: p.position, rotation: p.rotation }]);
        }
    });

    socket.on('chat', (msg) => {
        const p = players.get(socket.id);
        if(p) io.emit('42', ["chatMessage", { playerId: socket.id, playerName: p.name, message: msg }]);
    });

    socket.on('disconnect', () => {
        players.delete(socket.id);
        io.emit('42', ["playerLeft", socket.id]);
        console.log(`Player Left: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Game Server on ${PORT}`));
