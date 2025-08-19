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

let ALL_NPCS = {}, PLAYABLE_CHARACTERS = [], DYNAMIC_CHARACTERS = [], ALL_SCENARIOS = {}, ALL_SPELLS = {};
const MAX_PLAYERS = 4, MAX_NPCS = 5; 

try {
    const charactersData = fs.readFileSync('characters.json', 'utf8');
    const characters = JSON.parse(charactersData);
    PLAYABLE_CHARACTERS = characters.players || [];
    ALL_NPCS = characters.npcs || {}; 
    ALL_SPELLS = JSON.parse(fs.readFileSync('spells.json', 'utf8'));
    const dynamicCharPath = 'public/images/personagens/';
    if (fs.existsSync(dynamicCharPath)) {
        DYNAMIC_CHARACTERS = fs.readdirSync(dynamicCharPath).filter(f => f.startsWith('Personagem (') && (f.endsWith('.png') || f.endsWith('.jpg'))).map(f => ({ name: f.split('.')[0], img: `images/personagens/${f}` }));
    }
    ["cenarios externos", "cenarios internos", "cenas", "fichas", "objetos", "outros"].forEach(category => {
        const path = `public/images/mapas/${category}/`;
        if (fs.existsSync(path)) {
            ALL_SCENARIOS[category] = fs.readdirSync(path).filter(f => f.endsWith('.png') || f.endsWith('.jpg')).map(file => `${category}/${file}`);
        }
    });
} catch (error) { console.error('Erro ao carregar arquivos de configuração:', error); }

const games = {};

function createNewLobbyState(gmId) { 
    return { 
        mode: 'lobby', phase: 'waiting_players', gmId: gmId, 
        connectedPlayers: {}, log: [{ text: "Lobby criado." }], 
    }; 
}

function createNewAdventureState(lobbyState) {
    const adventureState = {
        mode: 'adventure', fighters: { players: {}, npcs: {} }, npcSlots: new Array(MAX_NPCS).fill(null),
        customPositions: {}, winner: null, reason: null, currentRound: 1, turnInRound: 0,
        activeCharacterKey: null, turnOrder: [], initiativeRolls: {}, 
        phase: 'npc_setup',
        scenario: 'mapas/cenarios externos/externo (1).png',
        gmId: lobbyState.gmId, log: [{ text: "Mestre, prepare o encontro!" }],
    };
    for (const sId in lobbyState.connectedPlayers) {
        const playerData = lobbyState.connectedPlayers[sId];
        if (playerData.role === 'player' && playerData.characterSheet) {
            adventureState.fighters.players[sId] = { id: sId, ...playerData.characterSheet, status: 'active' };
        }
    }
    return adventureState;
}

function createNewTheaterState(gmId) {
    const initialScenarioPath = 'mapas/cenarios externos/externo (1).png';
    return {
        mode: 'theater', gmId: gmId, log: [{ text: "Modo Cenário iniciado."}],
        currentScenario: initialScenarioPath,
        scenarioStates: { [initialScenarioPath]: { scenario: initialScenarioPath, tokens: {}, tokenOrder: [], globalTokenScale: 1.0, isStaging: true, } },
        publicState: { scenario: initialScenarioPath, tokens: {}, tokenOrder: [], globalTokenScale: 1.0, }
    };
}

function createNewFighterState(data) {
    const attributes = data.attributes || { forca: 0, agilidade: 0, protecao: 0, constituicao: 0, inteligencia: 0, mente: 0 };
    const hpMax = 20 + (attributes.constituicao * 5);
    const mahouMax = 10 + (attributes.mente * 5);
    return {
        id: data.id, nome: data.nome || data.name, img: data.img,
        attributes: attributes, spells: data.spells || [],
        hp: hpMax, hpMax: hpMax, mahou: mahouMax, mahouMax: mahouMax,
        pa: 0, status: 'active',
    };
}

function logMessage(state, text, type = 'info') {
    if (!state.log) state.log = [];
    state.log.unshift({ text, type });
}

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
            gameModes: { lobby: createNewLobbyState(socket.id), adventure: null, theater: null },
        };
        socket.emit('assignRole', { isGm: true, role: 'gm', roomId: roomId });
        socket.emit('roomCreated', roomId);
        io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
    });

    socket.emit('initialData', { 
        characters: { 
            players: PLAYABLE_CHARACTERS.map(name => ({ name, img: `images/players/${name}.png` })),
            npcs: Object.keys(ALL_NPCS).map(name => ({ name, img: `images/lutadores/${name}.png` })),
            dynamic: DYNAMIC_CHARACTERS 
        }, 
        spells: ALL_SPELLS, 
        scenarios: ALL_SCENARIOS 
    });
    
    socket.on('playerJoinsLobby', ({ roomId }) => {
        if (!games[roomId]) { return socket.emit('error', { message: 'Sala não encontrada.' }); }
        socket.join(roomId);
        socket.currentRoomId = roomId;
        const lobbyState = games[roomId].gameModes.lobby;
        const currentPlayers = Object.values(lobbyState.connectedPlayers).filter(p => p.role === 'player').length;
        socket.emit('promptForRole', { isFull: currentPlayers >= MAX_PLAYERS });
    });
    
    socket.on('playerChoosesRole', ({ role }) => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId]) return;
        const room = games[roomId];
        const lobbyState = room.gameModes.lobby;
        const currentPlayers = Object.values(lobbyState.connectedPlayers).filter(p => p.role === 'player').length;
        let finalRole = (role === 'player' && currentPlayers >= MAX_PLAYERS) ? 'spectator' : role;
        
        room.sockets[socket.id] = { role: finalRole };
        lobbyState.connectedPlayers[socket.id] = { role: finalRole, characterSheet: null, status: 'Conectado' };
        logMessage(lobbyState, `Um ${finalRole} conectou-se.`);
        socket.emit('assignRole', { role: finalRole, roomId: roomId });
        io.to(roomId).emit('gameUpdate', getFullState(room));
    });

    socket.on('playerSubmitsCharacterSheet', (sheet) => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId]) return;
        const room = games[roomId];
        room.gameModes.lobby.connectedPlayers[socket.id].characterSheet = sheet;
        room.gameModes.lobby.connectedPlayers[socket.id].status = 'Pronto';
        logMessage(room.gameModes.lobby, `${sheet.nome} está pronto.`);
        io.to(roomId).emit('gameUpdate', getFullState(room));
    });

    socket.on('playerAction', (action) => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId] || !action || !action.type) return;
        
        const room = games[roomId];
        const lobbyState = room.gameModes.lobby;
        const isGm = socket.id === lobbyState.gmId;
        let activeState = room.gameModes[room.activeMode];
        let shouldUpdate = true;
        
        if (isGm) {
            switch(action.type) {
                case 'gmStartsAdventure':
                    room.gameModes.adventure = createNewAdventureState(lobbyState);
                    room.activeMode = 'adventure';
                    break;
                case 'gmStartsTheater':
                    if (!room.gameModes.theater) room.gameModes.theater = createNewTheaterState(lobbyState.gmId);
                    room.activeMode = 'theater';
                    break;
                case 'gmGoesBackToLobby':
                    room.activeMode = 'lobby';
                    break;
                case 'gmStartBattle':
                    if (activeState.phase === 'npc_setup' && action.npcs) {
                        activeState.fighters.npcs = {};
                        activeState.npcSlots.fill(null);
                        action.npcs.forEach(npcData => {
                            if (npcData) {
                                const newNpc = createNewFighterState(npcData);
                                activeState.fighters.npcs[newNpc.id] = newNpc;
                                if (npcData.slotIndex !== undefined) activeState.npcSlots[npcData.slotIndex] = newNpc.id;
                            }
                        });
                        activeState.phase = 'initiative_roll';
                        logMessage(activeState, 'Inimigos em posição! Rolem as iniciativas!');
                    }
                    break;
            }
        }
        
        if (room.activeMode === 'adventure') {
            const adventureState = activeState;
            // A lógica de batalha será adicionada aqui futuramente
        }
        
        if (shouldUpdate) io.to(roomId).emit('gameUpdate', getFullState(room));
    });

    socket.on('disconnect', () => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId]) return;
        delete games[roomId].sockets[socket.id];
        delete games[roomId].gameModes.lobby.connectedPlayers[socket.id];
        io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
        if (Object.keys(games[roomId].sockets).length === 0) delete games[roomId];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));