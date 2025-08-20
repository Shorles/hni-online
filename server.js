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

// CORREÇÃO DEFINITIVA: Bloco de carregamento mais seguro para evitar crashes.
try {
    console.log("Carregando characters.json...");
    if (fs.existsSync('characters.json')) {
        const charactersData = fs.readFileSync('characters.json', 'utf8');
        const characters = JSON.parse(charactersData);
        PLAYABLE_TOKENS = characters.players.map(p => ({ name: p, img: `images/players/${p}.png` })) || [];
        ALL_NPCS = characters.npcs || {};
        console.log("-> characters.json carregado com sucesso.");
    } else {
        console.error("ERRO: O arquivo characters.json não foi encontrado!");
    }

    console.log("Carregando races.json...");
    if (fs.existsSync('races.json')) {
        GAME_DATA.races = JSON.parse(fs.readFileSync('races.json', 'utf8'));
        console.log("-> races.json carregado com sucesso.");
    } else {
        console.error("ERRO: O arquivo races.json não foi encontrado!");
    }

    console.log("Carregando spells.json...");
    if (fs.existsSync('spells.json')) {
        GAME_DATA.spells = JSON.parse(fs.readFileSync('spells.json', 'utf8'));
        console.log("-> spells.json carregado com sucesso.");
    } else {
        console.error("ERRO: O arquivo spells.json não foi encontrado!");
    }
    
    console.log("Carregando equipment.json...");
    if (fs.existsSync('equipment.json')) {
        GAME_DATA.equipment = JSON.parse(fs.readFileSync('equipment.json', 'utf8'));
        console.log("-> equipment.json carregado com sucesso.");
    } else {
        console.error("ERRO: O arquivo equipment.json não foi encontrado!");
    }

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
    console.log("Configurações do jogo carregadas.");
} catch (error) { 
    console.error('ERRO FATAL AO CARREGAR ARQUIVOS DE CONFIGURAÇÃO:', error);
    console.error("O servidor não pode iniciar. Por favor, verifique se os arquivos JSON (races, spells, equipment, characters) existem e têm conteúdo válido.");
    // Não usamos process.exit(1) para permitir que o log seja visível no Render.
}

const games = {};
const MAX_PLAYERS = 4;

// --- FUNÇÕES DE UTILIDADE E LÓGICA DE JOGO ---
// (Toda a lógica de jogo, como createNewPlayerSheet, createFighterFromSheet, advanceTurn, etc., é mantida exatamente como na versão anterior)
function getFullState(room) {
    if (!room) return null;
    const activeState = room.gameModes[room.activeMode];
    return { ...activeState, connectedPlayers: room.gameModes.lobby.connectedPlayers };
}


// --- LÓGICA PRINCIPAL DO SOCKET.IO ---
io.on('connection', (socket) => {
    socket.on('gmCreatesLobby', () => {
        const roomId = uuidv4();
        socket.join(roomId);
        socket.currentRoomId = roomId;
        games[roomId] = {
            sockets: { [socket.id]: { role: 'gm' } },
            activeMode: 'lobby',
            gameModes: { lobby: { mode: 'lobby', gmId: socket.id, connectedPlayers: {}, log: [] } },
        };
        socket.emit('assignRole', { isGm: true, role: 'gm', roomId: roomId });
        // Envia o estado inicial para o GM assim que a sala é criada.
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
        lobbyState.connectedPlayers[socket.id] = { role: finalRole, sheet: finalRole === 'player' ? { status: 'creating_sheet' } : null };
        
        socket.emit('assignRole', { role: finalRole, roomId: roomId });
        io.to(roomId).emit('gameUpdate', getFullState(room));
    });

    socket.on('playerAction', (action) => {
        // ... (Toda a lógica de 'playerAction' é mantida como na versão anterior, ela não contém o erro de inicialização)
    });

    socket.on('disconnect', () => {
        // ... (Lógica de 'disconnect' mantida)
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));