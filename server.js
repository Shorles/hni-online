// server.js

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// --- CARREGAMENTO CENTRALIZADO DE DADOS DO JOGO ---
let ALL_NPCS = {};
let PLAYABLE_TOKENS = [];
let DYNAMIC_CHARACTERS = [];
let ALL_SCENARIOS = {};
let GAME_DATA = { races: {}, spells: {}, equipment: {} };

try {
    const charactersData = fs.readFileSync('characters.json', 'utf8');
    const characters = JSON.parse(charactersData);
    PLAYABLE_TOKENS = characters.players.map(p => ({ name: p, img: `images/players/${p}.png` })) || [];
    ALL_NPCS = characters.npcs || {}; 

    GAME_DATA.races = JSON.parse(fs.readFileSync('races.json', 'utf8'));
    GAME_DATA.spells = JSON.parse(fs.readFileSync('spells.json', 'utf8'));
    GAME_DATA.equipment = JSON.parse(fs.readFileSync('equipment.json', 'utf8'));

    const dynamicCharPath = 'public/images/personagens/';
    if (fs.existsSync(dynamicCharPath)) {
        const files = fs.readdirSync(dynamicCharPath).filter(file => file.startsWith('Personagem (') && (file.endsWith('.png') || file.endsWith('.jpg')));
        DYNAMIC_CHARACTERS = files.map(file => ({ name: file.split('.')[0], img: `images/personagens/${file}` }));
    }

    const scenarioCategories = ["cenarios externos", "cenarios internos", "cenas", "fichas", "objetos", "outros"];
    scenarioCategories.forEach(category => {
        const path = `public/images/mapas/${category}/`;
        if (fs.existsSync(path)) {
            ALL_SCENARIOS[category] = fs.readdirSync(path).filter(file => file.endsWith('.png') || file.endsWith('.jpg')).map(file => `${category}/${file}`);
        }
    });

} catch (error) { console.error('Erro fatal ao carregar arquivos de configuração:', error); process.exit(1); }

const games = {};
const MAX_PLAYERS = 4;

// --- FUNÇÕES DE UTILIDADE ---
function logMessage(state, text, type = 'info') { /* ... (Mantida) ... */ }
function getFighter(state, key) { /* ... (Mantida) ... */ }
function rollD(sides) { return Math.floor(Math.random() * sides) + 1; }

// --- LÓGICA DE CRIAÇÃO DE ESTADO ---
function createNewLobbyState(gmId) { /* ... (Mantida) ... */ }
function createNewPlayerSheet() { /* ... (Mantida) ... */ }
function calculateFighterStats(sheet) { /* ... (Mantida) ... */ }
function createFighterFromSheet(id, sheet) { /* ... (Mantida) ... */ }
function createNewAdventureState(gmId, connectedPlayers, useCachedState = false, cachedState = null) { /* ... (Mantida) ... */ }
function createNewTheaterState(gmId, initialScenario) { /* ... (Mantida) ... */ }

// --- LÓGICA DE COMBATE ---
function checkGameOver(state) { /* ... (Mantida) ... */ }
function advanceTurn(state) { /* ... (Mantida) ... */ }
function startBattle(state) { /* ... (Mantida) ... */ }

// --- FUNÇÃO PRINCIPAL DE CONEXÃO ---
function getFullState(room) {
    if (!room) return null;
    const activeState = room.gameModes[room.activeMode];
    return { ...activeState, connectedPlayers: room.gameModes.lobby.connectedPlayers };
}

io.on('connection', (socket) => {
    socket.on('gmCreatesLobby', () => {
        const roomId = uuidv4();
        socket.join(roomId);
        socket.currentRoomId = roomId;
        games[roomId] = {
            sockets: { [socket.id]: { role: 'gm' } },
            activeMode: 'lobby',
            gameModes: {
                lobby: createNewLobbyState(socket.id),
                adventure: null,
                theater: null
            },
            adventureCache: null
        };
        socket.emit('assignRole', { isGm: true, role: 'gm', roomId: roomId });
        // CORREÇÃO DEFINITIVA: Envia o estado inicial para o GM assim que a sala é criada.
        socket.emit('gameUpdate', getFullState(games[roomId]));
    });

    socket.emit('initialData', {
        playableTokens: PLAYABLE_TOKENS,
        dynamicCharacters: DYNAMIC_CHARACTERS,
        npcs: ALL_NPCS,
        scenarios: ALL_SCENARIOS,
        gameData: GAME_DATA
    });

    socket.on('playerJoinsLobby', ({ roomId }) => {
        if (!games[roomId]) { socket.emit('error', { message: 'Sala não encontrada.' }); return; }
        socket.join(roomId);
        socket.currentRoomId = roomId;
        const lobbyState = games[roomId].gameModes.lobby;
        const currentPlayers = Object.values(lobbyState.connectedPlayers).filter(p => p.role === 'player').length;
        const isFull = currentPlayers >= MAX_PLAYERS;
        socket.emit('promptForRole', { isFull: isFull });
    });
    
    socket.on('playerChoosesRole', ({ role }) => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId]) return;
        const room = games[roomId];
        const lobbyState = room.gameModes.lobby;
        const currentPlayers = Object.values(lobbyState.connectedPlayers).filter(p => p.role === 'player').length;
        
        let finalRole = (role === 'player' && currentPlayers >= MAX_PLAYERS) ? 'spectator' : role;
        
        room.sockets[socket.id] = { role: finalRole };
        lobbyState.connectedPlayers[socket.id] = { role: finalRole, sheet: finalRole === 'player' ? createNewPlayerSheet() : null };
        
        logMessage(lobbyState, `Um ${finalRole} conectou-se.`);
        socket.emit('assignRole', { role: finalRole, roomId: roomId });
        io.to(roomId).emit('gameUpdate', getFullState(room));
    });

    socket.on('playerAction', (action) => {
        // ... (Toda a lógica de 'playerAction' é mantida como na versão anterior)
    });

    socket.on('disconnect', () => {
        // ... (Lógica de 'disconnect' mantida)
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));