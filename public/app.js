// Game State
let ws = null;
let playerName = '';
let roomCode = '';
let isHost = false;
let players = [];
let maxPlayers = 4;

// DOM Elements
const screens = {
    mainMenu: document.getElementById('main-menu'),
    joinScreen: document.getElementById('join-screen'),
    hostLobby: document.getElementById('host-lobby'),
    playerLobby: document.getElementById('player-lobby'),
    hostGame: document.getElementById('host-game'),
    playerGame: document.getElementById('player-game'),
    revealScreen: document.getElementById('reveal-screen')
};

// Show a specific screen
function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    screens[screenName].classList.add('active');
}

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification show ${type}`;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Connect to WebSocket server
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('Connected to server');
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
    };
    
    ws.onclose = () => {
        console.log('Disconnected from server');
        showNotification('Disconnected from server', 'error');
        showScreen('mainMenu');
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        showNotification('Connection error', 'error');
    };
}

// Handle messages from server
function handleServerMessage(data) {
    console.log('Received:', data.type, data);
    
    switch (data.type) {
        case 'room-created':
            handleRoomCreated(data);
            break;
        case 'joined-room':
            handleJoinedRoom(data);
            break;
        case 'player-joined':
            handlePlayerJoined(data);
            break;
        case 'player-left':
            handlePlayerLeft(data);
            break;
        case 'game-started':
            handleGameStarted(data);
            break;
        case 'new-round':
            handleNewRound(data);
            break;
        case 'game-ended':
            handleGameEnded(data);
            break;
        case 'chat':
            handleChatMessage(data);
            break;
        case 'room-closed':
            handleRoomClosed(data);
            break;
        case 'became-host':
            handleBecameHost(data);
            break;
        case 'became-player':
            handleBecamePlayer(data);
            break;
        case 'host-changed':
            handleHostChanged(data);
            break;
        case 'error':
            showNotification(data.message, 'error');
            break;
    }
}

// Handle room created
function handleRoomCreated(data) {
    roomCode = data.roomCode;
    isHost = true;
    maxPlayers = data.maxPlayers;
    
    document.getElementById('display-room-code').textContent = roomCode;
    document.getElementById('host-max-players').textContent = maxPlayers;
    updateHostPlayerList([]);
    
    showScreen('hostLobby');
    showNotification('Room created! Share the code with players.');
}

// Handle joined room
function handleJoinedRoom(data) {
    roomCode = data.roomCode;
    isHost = false;
    players = data.players;
    maxPlayers = data.maxPlayers;
    
    document.getElementById('player-room-code').textContent = roomCode;
    document.getElementById('lobby-host-name').textContent = data.hostName;
    document.getElementById('player-max-players').textContent = maxPlayers;
    updatePlayerList(data.players);
    
    showScreen('playerLobby');
    showNotification('Joined the room!');
}

// Handle player joined
function handlePlayerJoined(data) {
    players = data.players;
    if (data.maxPlayers) maxPlayers = data.maxPlayers;
    
    if (isHost) {
        updateHostPlayerList(data.players);
        document.getElementById('start-game-btn').disabled = data.playerCount < maxPlayers;
    } else {
        updatePlayerList(data.players);
    }
    
    showNotification(`${data.playerName} joined the game`);
}

// Handle player left
function handlePlayerLeft(data) {
    players = data.players;
    
    if (isHost) {
        updateHostPlayerList(data.players);
        document.getElementById('start-game-btn').disabled = data.playerCount < maxPlayers;
    } else {
        updatePlayerList(data.players);
    }
    
    showNotification(`${data.playerName} left the game`, 'error');
}

// Handle game started
function handleGameStarted(data) {
    players = data.players;
    
    if (isHost) {
        document.getElementById('host-secret-word').textContent = data.word;
        document.getElementById('host-imposter-name').textContent = data.players[data.imposterIndex];
        updateHostGamePlayers(data.players, data.imposterIndex);
        updateTransferHostDropdown(data.players);
        clearChat('host-chat-messages');
        showScreen('hostGame');
    } else {
        updatePlayerRole(data.isImposter, data.word);
        updatePlayerGamePlayers(data.players);
        clearChat('player-chat-messages');
        showScreen('playerGame');
    }
}

// Handle new round
function handleNewRound(data) {
    players = data.players;
    
    if (isHost) {
        document.getElementById('host-secret-word').textContent = data.word;
        document.getElementById('host-imposter-name').textContent = data.players[data.imposterIndex];
        updateHostGamePlayers(data.players, data.imposterIndex);
        updateTransferHostDropdown(data.players);
        document.getElementById('next-word-input').value = '';
        clearChat('host-chat-messages');
        showScreen('hostGame');
    } else {
        updatePlayerRole(data.isImposter, data.word);
        updatePlayerGamePlayers(data.players);
        clearChat('player-chat-messages');
        showScreen('playerGame');
    }
    
    showNotification('New round started!');
}

// Handle game ended
function handleGameEnded(data) {
    if (!isHost) {
        document.getElementById('revealed-word').textContent = data.revealedWord;
        document.getElementById('revealed-imposter').textContent = data.imposterName;
        showScreen('revealScreen');
    }
}

// Handle became host (after transfer)
function handleBecameHost(data) {
    isHost = true;
    players = data.players;
    maxPlayers = data.maxPlayers;
    
    showNotification('You are now the host!', 'success');
    showScreen('hostLobby');
    
    document.getElementById('host-max-players').textContent = maxPlayers;
    updateHostPlayerList(data.players);
    document.getElementById('start-game-btn').disabled = data.players.length < maxPlayers;
}

// Handle became player (after transfer)
function handleBecamePlayer(data) {
    isHost = false;
    players = data.players;
    maxPlayers = data.maxPlayers;
    
    document.getElementById('player-room-code').textContent = roomCode;
    document.getElementById('lobby-host-name').textContent = data.hostName;
    document.getElementById('player-max-players').textContent = maxPlayers;
    updatePlayerList(data.players);
    
    showNotification('Host has been transferred. You are now a player.');
    showScreen('playerLobby');
}

// Handle host changed (for other players)
function handleHostChanged(data) {
    players = data.players;
    document.getElementById('lobby-host-name').textContent = data.newHostName;
    updatePlayerList(data.players);
    showNotification(`${data.newHostName} is now the host`);
}

// Handle chat message
function handleChatMessage(data) {
    const chatContainer = isHost ? 'host-chat-messages' : 'player-chat-messages';
    addChatMessage(chatContainer, data.from, data.message, data.isHost);
}

// Handle room closed
function handleRoomClosed(data) {
    showNotification(data.message, 'error');
    showScreen('mainMenu');
}

// Update player lists
function updateHostPlayerList(playerNames) {
    const list = document.getElementById('host-player-list');
    document.getElementById('host-player-count').textContent = playerNames.length;
    
    list.innerHTML = '';
    for (let i = 0; i < maxPlayers; i++) {
        const li = document.createElement('li');
        if (playerNames[i]) {
            li.textContent = playerNames[i];
        } else {
            li.textContent = 'Waiting...';
            li.classList.add('empty');
        }
        list.appendChild(li);
    }
}

function updatePlayerList(playerNames) {
    const list = document.getElementById('player-list');
    document.getElementById('player-count').textContent = playerNames.length;
    
    list.innerHTML = '';
    for (let i = 0; i < maxPlayers; i++) {
        const li = document.createElement('li');
        if (playerNames[i]) {
            li.textContent = playerNames[i];
        } else {
            li.textContent = 'Waiting...';
            li.classList.add('empty');
        }
        list.appendChild(li);
    }
}

function updateHostGamePlayers(playerNames, imposterIndex) {
    const list = document.getElementById('host-game-players');
    list.innerHTML = '';
    
    playerNames.forEach((name, index) => {
        const li = document.createElement('li');
        if (index === imposterIndex) {
            li.classList.add('imposter-reveal');
            li.innerHTML = `${name} <span class="badge">Impostor</span>`;
        } else {
            li.textContent = name;
        }
        list.appendChild(li);
    });
}

function updatePlayerGamePlayers(playerNames) {
    const list = document.getElementById('player-game-players');
    list.innerHTML = '';
    
    playerNames.forEach(name => {
        const li = document.createElement('li');
        li.textContent = name;
        list.appendChild(li);
    });
}

function updateTransferHostDropdown(playerNames) {
    const select = document.getElementById('transfer-host-select');
    select.innerHTML = '';
    
    playerNames.forEach((name, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = name;
        select.appendChild(option);
    });
}

function updatePlayerRole(isImposter, word) {
    const roleDisplay = document.getElementById('player-role');
    roleDisplay.className = 'role-display ' + (isImposter ? 'imposter' : 'innocent');
    
    if (isImposter) {
        roleDisplay.innerHTML = `
            <h3>You are the Impostor</h3>
            <p class="imposter-text">You don't know the word. Try to blend in with the others!</p>
        `;
    } else {
        roleDisplay.innerHTML = `
            <h3>You Know the Word</h3>
            <p style="color: var(--text-secondary); margin-bottom: 8px;">The secret word is:</p>
            <p class="word-reveal">${word}</p>
        `;
    }
}

// Chat functions
function clearChat(containerId) {
    document.getElementById(containerId).innerHTML = '';
}

function addChatMessage(containerId, sender, message, isSenderHost) {
    const container = document.getElementById(containerId);
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    msgDiv.innerHTML = `
        <span class="sender ${isSenderHost ? 'host' : ''}">${sender}${isSenderHost ? ' (Host)' : ''}:</span>
        <p class="text">${escapeHtml(message)}</p>
    `;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sendChat(inputId) {
    const input = document.getElementById(inputId);
    const message = input.value.trim();
    
    if (message && ws) {
        ws.send(JSON.stringify({
            type: 'chat',
            message: message
        }));
        input.value = '';
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
    
    // Main Menu
    document.getElementById('host-btn').addEventListener('click', () => {
        playerName = document.getElementById('player-name').value;
        if (!playerName) {
            showNotification('Please select your name', 'error');
            return;
        }
        
        const selectedMaxPlayers = parseInt(document.getElementById('player-count-select').value);
        
        ws.send(JSON.stringify({
            type: 'create-room',
            name: playerName,
            maxPlayers: selectedMaxPlayers
        }));
    });
    
    document.getElementById('join-btn').addEventListener('click', () => {
        playerName = document.getElementById('player-name').value;
        if (!playerName) {
            showNotification('Please select your name', 'error');
            return;
        }
        showScreen('joinScreen');
    });
    
    // Join Screen
    document.getElementById('submit-join-btn').addEventListener('click', () => {
        const code = document.getElementById('room-code-input').value.trim().toUpperCase();
        if (!code) {
            showNotification('Please enter a room code', 'error');
            return;
        }
        
        ws.send(JSON.stringify({
            type: 'join-room',
            roomCode: code,
            name: playerName
        }));
    });
    
    document.getElementById('back-to-menu-btn').addEventListener('click', () => {
        showScreen('mainMenu');
    });
    
    // Host Lobby
    document.getElementById('copy-code-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(roomCode).then(() => {
            showNotification('Room code copied!');
        });
    });
    
    document.getElementById('start-game-btn').addEventListener('click', () => {
        const word = document.getElementById('word-input').value.trim();
        if (!word) {
            showNotification('Please enter a secret word', 'error');
            return;
        }
        
        ws.send(JSON.stringify({
            type: 'start-game',
            word: word
        }));
    });
    
    document.getElementById('host-leave-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to close the room?')) {
            ws.close();
            showScreen('mainMenu');
            connectWebSocket();
        }
    });
    
    // Player Lobby
    document.getElementById('player-leave-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to leave?')) {
            ws.close();
            showScreen('mainMenu');
            connectWebSocket();
        }
    });
    
    // Host Game
    document.getElementById('next-round-btn').addEventListener('click', () => {
        const word = document.getElementById('next-word-input').value.trim();
        if (!word) {
            showNotification('Please enter a word for the next round', 'error');
            return;
        }
        
        ws.send(JSON.stringify({
            type: 'next-round',
            word: word
        }));
    });
    
    document.getElementById('transfer-host-btn').addEventListener('click', () => {
        const select = document.getElementById('transfer-host-select');
        const newHostIndex = parseInt(select.value);
        
        if (confirm(`Transfer host to ${select.options[select.selectedIndex].text}?`)) {
            ws.send(JSON.stringify({
                type: 'transfer-host',
                newHostIndex: newHostIndex
            }));
        }
    });
    
    document.getElementById('reveal-btn').addEventListener('click', () => {
        ws.send(JSON.stringify({
            type: 'end-game'
        }));
        showNotification('Round ended - word and imposter revealed to players');
    });
    
    document.getElementById('end-game-btn').addEventListener('click', () => {
        if (confirm('End the game and return to lobby?')) {
            ws.close();
            showScreen('mainMenu');
            connectWebSocket();
        }
    });
    
    // Chat
    document.getElementById('host-send-chat').addEventListener('click', () => sendChat('host-chat-input'));
    document.getElementById('player-send-chat').addEventListener('click', () => sendChat('player-chat-input'));
    
    document.getElementById('host-chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChat('host-chat-input');
    });
    
    document.getElementById('player-chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChat('player-chat-input');
    });
    
    // Room code input auto-uppercase
    document.getElementById('room-code-input').addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
    });
});
