const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, 'public', filePath);
    
    const ext = path.extname(filePath);
    const contentTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json'
    };
    
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('File not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
        res.end(data);
    });
});

const wss = new WebSocket.Server({ server });

// Store all game rooms
const rooms = new Map();

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

wss.on('connection', (ws) => {
    console.log('New connection');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received:', data.type);
            
            switch (data.type) {
                case 'create-room':
                    handleCreateRoom(ws, data);
                    break;
                case 'join-room':
                    handleJoinRoom(ws, data);
                    break;
                case 'start-game':
                    handleStartGame(ws, data);
                    break;
                case 'next-round':
                    handleNextRound(ws, data);
                    break;
                case 'end-game':
                    handleEndGame(ws, data);
                    break;
                case 'signal':
                    handleSignal(ws, data);
                    break;
                case 'transfer-host':
                    handleTransferHost(ws, data);
                    break;
                case 'chat':
                    handleChat(ws, data);
                    break;
            }
        } catch (e) {
            console.error('Error parsing message:', e);
        }
    });
    
    ws.on('close', () => {
        handleDisconnect(ws);
    });
});

function handleCreateRoom(ws, data) {
    const roomCode = generateRoomCode();
    const room = {
        code: roomCode,
        host: ws,
        hostName: data.name,
        players: [],
        maxPlayers: data.maxPlayers || 4,
        gameStarted: false,
        currentWord: '',
        imposterIndex: -1
    };
    
    rooms.set(roomCode, room);
    ws.roomCode = roomCode;
    ws.isHost = true;
    ws.playerName = data.name;
    
    ws.send(JSON.stringify({
        type: 'room-created',
        roomCode: roomCode,
        maxPlayers: room.maxPlayers
    }));
    
    console.log(`Room created: ${roomCode}`);
}

function handleJoinRoom(ws, data) {
    const room = rooms.get(data.roomCode.toUpperCase());
    
    if (!room) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Room not found'
        }));
        return;
    }
    
    if (room.players.length >= room.maxPlayers) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Room is full'
        }));
        return;
    }
    
    if (room.gameStarted) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Game already in progress'
        }));
        return;
    }
    
    ws.roomCode = data.roomCode.toUpperCase();
    ws.isHost = false;
    ws.playerName = data.name;
    ws.playerId = room.players.length;
    
    room.players.push(ws);
    
    ws.send(JSON.stringify({
        type: 'joined-room',
        roomCode: room.code,
        playerId: ws.playerId,
        players: room.players.map(p => p.playerName),
        hostName: room.hostName,
        maxPlayers: room.maxPlayers
    }));
    
    // Notify host and other players
    const playerList = room.players.map(p => p.playerName);
    
    room.host.send(JSON.stringify({
        type: 'player-joined',
        playerName: data.name,
        players: playerList,
        playerCount: room.players.length,
        maxPlayers: room.maxPlayers
    }));
    
    room.players.forEach(p => {
        if (p !== ws) {
            p.send(JSON.stringify({
                type: 'player-joined',
                playerName: data.name,
                players: playerList,
                playerCount: room.players.length
            }));
        }
    });
    
    console.log(`${data.name} joined room ${room.code}`);
}

function handleStartGame(ws, data) {
    const room = rooms.get(ws.roomCode);
    
    if (!room || !ws.isHost) {
        return;
    }
    
    if (room.players.length < room.maxPlayers) {
        ws.send(JSON.stringify({
            type: 'error',
            message: `Need ${room.maxPlayers} players to start the game`
        }));
        return;
    }
    
    room.gameStarted = true;
    room.currentWord = data.word;
    room.imposterIndex = Math.floor(Math.random() * room.maxPlayers);
    
    console.log(`Game started in room ${room.code}. Word: ${data.word}, Imposter: Player ${room.imposterIndex + 1}`);
    
    // Notify host
    ws.send(JSON.stringify({
        type: 'game-started',
        word: data.word,
        imposterIndex: room.imposterIndex,
        players: room.players.map(p => p.playerName)
    }));
    
    // Notify players
    room.players.forEach((player, index) => {
        const isImposter = index === room.imposterIndex;
        player.send(JSON.stringify({
            type: 'game-started',
            isImposter: isImposter,
            word: isImposter ? null : data.word,
            players: room.players.map(p => p.playerName)
        }));
    });
}

function handleNextRound(ws, data) {
    const room = rooms.get(ws.roomCode);
    
    if (!room || !ws.isHost) {
        return;
    }
    
    room.currentWord = data.word;
    room.imposterIndex = Math.floor(Math.random() * room.maxPlayers);
    
    console.log(`New round in room ${room.code}. Word: ${data.word}, Imposter: Player ${room.imposterIndex + 1}`);
    
    // Notify host
    ws.send(JSON.stringify({
        type: 'new-round',
        word: data.word,
        imposterIndex: room.imposterIndex,
        players: room.players.map(p => p.playerName)
    }));
    
    // Notify players
    room.players.forEach((player, index) => {
        const isImposter = index === room.imposterIndex;
        player.send(JSON.stringify({
            type: 'new-round',
            isImposter: isImposter,
            word: isImposter ? null : data.word,
            players: room.players.map(p => p.playerName)
        }));
    });
}

function handleEndGame(ws, data) {
    const room = rooms.get(ws.roomCode);
    
    if (!room || !ws.isHost) {
        return;
    }
    
    room.gameStarted = false;
    
    // Notify all players
    room.players.forEach(player => {
        player.send(JSON.stringify({
            type: 'game-ended',
            revealedWord: room.currentWord,
            imposterName: room.players[room.imposterIndex]?.playerName
        }));
    });
    
    ws.send(JSON.stringify({
        type: 'game-ended'
    }));
}

function handleTransferHost(ws, data) {
    const room = rooms.get(ws.roomCode);
    
    if (!room || !ws.isHost) {
        return;
    }
    
    const newHostIndex = data.newHostIndex;
    if (newHostIndex < 0 || newHostIndex >= room.players.length) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid player selected'
        }));
        return;
    }
    
    const newHost = room.players[newHostIndex];
    const oldHostName = room.hostName;
    
    // Remove new host from players array
    room.players.splice(newHostIndex, 1);
    
    // Add old host to players array
    room.players.push(ws);
    ws.isHost = false;
    ws.playerId = room.players.length - 1;
    
    // Set new host
    newHost.isHost = true;
    room.host = newHost;
    room.hostName = newHost.playerName;
    
    // Update player IDs
    room.players.forEach((p, i) => {
        p.playerId = i;
    });
    
    const playerList = room.players.map(p => p.playerName);
    
    // Notify new host
    newHost.send(JSON.stringify({
        type: 'became-host',
        players: playerList,
        maxPlayers: room.maxPlayers
    }));
    
    // Notify old host (now a player)
    ws.send(JSON.stringify({
        type: 'became-player',
        players: playerList,
        hostName: room.hostName,
        maxPlayers: room.maxPlayers
    }));
    
    // Notify other players
    room.players.forEach(player => {
        if (player !== ws) {
            player.send(JSON.stringify({
                type: 'host-changed',
                newHostName: room.hostName,
                oldHostName: oldHostName,
                players: playerList
            }));
        }
    });
    
    console.log(`Host transferred from ${oldHostName} to ${room.hostName} in room ${room.code}`);
}

function handleSignal(ws, data) {
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    
    // Forward WebRTC signaling to the target
    const target = data.targetIsHost ? room.host : room.players[data.targetId];
    if (target) {
        target.send(JSON.stringify({
            type: 'signal',
            signal: data.signal,
            fromId: ws.playerId,
            fromName: ws.playerName,
            isFromHost: ws.isHost
        }));
    }
}

function handleChat(ws, data) {
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    
    const chatMessage = {
        type: 'chat',
        from: ws.playerName,
        message: data.message,
        isHost: ws.isHost
    };
    
    // Send to everyone in the room
    room.host.send(JSON.stringify(chatMessage));
    room.players.forEach(player => {
        player.send(JSON.stringify(chatMessage));
    });
}

function handleDisconnect(ws) {
    if (!ws.roomCode) return;
    
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    
    if (ws.isHost) {
        // Host disconnected, close the room
        room.players.forEach(player => {
            player.send(JSON.stringify({
                type: 'room-closed',
                message: 'Host has disconnected'
            }));
        });
        rooms.delete(ws.roomCode);
        console.log(`Room ${ws.roomCode} closed (host disconnected)`);
    } else {
        // Player disconnected
        const index = room.players.indexOf(ws);
        if (index > -1) {
            room.players.splice(index, 1);
            
            // Update player IDs
            room.players.forEach((p, i) => {
                p.playerId = i;
            });
            
            const playerList = room.players.map(p => p.playerName);
            
            room.host.send(JSON.stringify({
                type: 'player-left',
                playerName: ws.playerName,
                players: playerList,
                playerCount: room.players.length
            }));
            
            room.players.forEach(player => {
                player.send(JSON.stringify({
                    type: 'player-left',
                    playerName: ws.playerName,
                    players: playerList,
                    playerCount: room.players.length
                }));
            });
            
            console.log(`${ws.playerName} left room ${ws.roomCode}`);
        }
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
