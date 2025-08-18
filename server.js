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

// --- CARREGAMENTO DE DADOS DO JOGO ---
let ALL_NPCS = {};
let PLAYABLE_CHARACTERS = [];
let DYNAMIC_CHARACTERS = [];
let ALL_SCENARIOS = {};
let ALL_SPELLS = {};
const MAX_PLAYERS = 4;
const MAX_NPCS = 5; 

try {
    const charactersData = fs.readFileSync('characters.json', 'utf8');
    const characters = JSON.parse(charactersData);
    PLAYABLE_CHARACTERS = characters.players || [];
    ALL_NPCS = characters.npcs || {}; 

    const spellsData = fs.readFileSync('spells.json', 'utf8');
    ALL_SPELLS = JSON.parse(spellsData);

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

} catch (error) { console.error('Erro ao carregar arquivos de configuração:', error); }

const games = {};

// --- FUNÇÕES DE UTILIDADE DO RPG ---
function rollDice(diceExpression) {
    if (!diceExpression || typeof diceExpression !== 'string') return 0;
    
    let total = 0;
    const parts = diceExpression.split('+');
    const dicePart = parts[0];
    const bonus = parts[1] ? parseInt(parts[1], 10) : 0;

    const [numDice, numSides] = dicePart.toLowerCase().split('d').map(n => parseInt(n, 10));

    for (let i = 0; i < numDice; i++) {
        total += Math.floor(Math.random() * numSides) + 1;
    }

    return total + bonus;
}
function obfuscateData(data) {
    const jsonString = JSON.stringify(data);
    return Buffer.from(jsonString).toString('base64');
}
function deobfuscateData(data) {
    try {
        const jsonString = Buffer.from(data, 'base64').toString('utf8');
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Erro ao decodificar dados do personagem:", error);
        return null;
    }
}

// --- LÓGICA DE ESTADO DO JOGO ---
function createNewLobbyState(gmId) { 
    return { 
        mode: 'lobby', 
        phase: 'waiting_players', 
        gmId: gmId, 
        connectedPlayers: {}, 
        log: [{ text: "Lobby criado. Aguardando jogadores..." }], 
    }; 
}
function createNewAdventureState(lobbyState) {
    const adventureState = {
        mode: 'adventure', fighters: { players: {}, npcs: {} }, npcSlots: new Array(MAX_NPCS).fill(null),
        customPositions: {}, winner: null, reason: null, currentRound: 1, turnInRound: 0,
        activeCharacterKey: null, turnOrder: [], initiativeRolls: {}, phase: 'initiative_roll',
        scenario: 'mapas/cenarios externos/externo (1).png',
        gmId: lobbyState.gmId, log: [{ text: "Aventura iniciada. Rolem as iniciativas!" }],
        waitingPlayers: {}
    };
    for (const sId in lobbyState.connectedPlayers) {
        const playerData = lobbyState.connectedPlayers[sId];
        if (playerData.role === 'player' && playerData.characterSheet) {
            adventureState.fighters.players[sId] = { id: sId, ...playerData.characterSheet };
        }
    }
    return adventureState;
}

// Lógica de Teatro (sem alterações)
function createNewTheaterState(gmId) {
    const initialScenarioPath = 'mapas/cenarios externos/externo (1).png';
    return {
        mode: 'theater', gmId: gmId, log: [{ text: "Modo Cenário iniciado."}],
        currentScenario: initialScenarioPath,
        scenarioStates: {
            [initialScenarioPath]: {
                scenario: initialScenarioPath, tokens: {}, tokenOrder: [], globalTokenScale: 1.0, isStaging: true,
            }
        },
        publicState: {
            scenario: initialScenarioPath, tokens: {}, tokenOrder: [], globalTokenScale: 1.0,
        }
    };
}


function logMessage(state, text, type = 'info') {
    if (!state.log) state.log = [];
    state.log.unshift({ text, type, time: new Date().toLocaleTimeString() });
    if (state.log.length > 100) state.log.pop();
}
function getFighter(state, key) {
    if (!key) return null;
    return state.fighters.players[key] || state.fighters.npcs[key];
}
function checkGameOver(state) {
    const activePlayers = Object.values(state.fighters.players).filter(p => p.hp > 0 && p.status !== 'fled');
    const activeNpcs = Object.values(state.fighters.npcs).filter(n => n.hp > 0);
    if (activePlayers.length === 0) {
        state.winner = 'npcs'; state.reason = 'Todos os jogadores foram derrotados.';
        logMessage(state, 'Fim da batalha! Os inimigos venceram.', 'game_over');
    } else if (activeNpcs.length === 0) {
        state.winner = 'players'; state.reason = 'Todos os inimigos foram derrotados.';
        logMessage(state, 'Fim da batalha! Os jogadores venceram!', 'game_over');
    }
}
function advanceTurn(state) {
    if (state.winner) return;
    state.turnInRound++;
    if (state.turnInRound >= state.turnOrder.length * 3) {
        state.phase = 'initiative_roll';
        state.initiativeRolls = {};
        state.turnInRound = 0;
        state.currentRound = 1;
        logMessage(state, `--- FIM DO CICLO! Rolem novamente a iniciativa! ---`, 'round');
        return;
    }
    const currentIndex = state.turnOrder.indexOf(state.activeCharacterKey);
    let nextIndex = (currentIndex + 1) % state.turnOrder.length;
    if (nextIndex === 0) {
        state.currentRound++;
        logMessage(state, `--- Round ${state.currentRound} ---`, 'round');
    }
    const previousFighter = getFighter(state, state.activeCharacterKey);
    if(previousFighter) previousFighter.pa += 3;

    state.activeCharacterKey = state.turnOrder[nextIndex];
    const activeFighter = getFighter(state, state.activeCharacterKey);
    logMessage(state, `É a vez de ${activeFighter.nome}. (PA: ${activeFighter.pa})`, 'turn');
}
function startBattle(state) {
    state.turnOrder = Object.keys(state.initiativeRolls).sort((a, b) => {
        const rollA = state.initiativeRolls[a].total;
        const rollB = state.initiativeRolls[b].total;
        if (rollA === rollB) {
            const isAPlayer = !!state.fighters.players[a];
            const isBPlayer = !!state.fighters.players[b];
            if (isAPlayer && !isBPlayer) return -1;
            if (!isAPlayer && isBPlayer) return 1;
        }
        return rollB - rollA;
    });
    state.phase = 'battle';
    state.activeCharacterKey = state.turnOrder[0];
    Object.values(state.fighters.players).forEach(p => p.pa = 0);
    Object.values(state.fighters.npcs).forEach(n => n.pa = 0);
    const firstFighter = getFighter(state, state.activeCharacterKey);
    firstFighter.pa = 3;
    logMessage(state, `--- A Batalha Começou! (Round ${state.currentRound}) ---`, 'round');
    logMessage(state, `Ordem: ${state.turnOrder.map(id => getFighter(state, id).nome).join(', ')}`, 'info');
    logMessage(state, `É a vez de ${firstFighter.nome}. (PA: ${firstFighter.pa})`, 'turn');
}

function getFullState(room) {
    if (!room) return null;
    const activeState = room.gameModes[room.activeMode];
    return { ...activeState, connectedPlayers: room.gameModes.lobby.connectedPlayers };
}

// --- SOCKET.IO ---
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
            npcs: Object.keys(ALL_NPCS).map(name => ({ name, img: `images/lutadores/${name}.png`, scale: ALL_NPCS[name].scale || 1.0 })), 
            dynamic: DYNAMIC_CHARACTERS 
        }, 
        spells: ALL_SPELLS,
        scenarios: ALL_SCENARIOS 
    });

    // CORRIGIDO: Fluxo de entrada do jogador
    socket.on('playerJoinsLobby', ({ roomId }) => {
        if (!games[roomId]) { socket.emit('error', { message: 'Sala não encontrada.' }); return; }
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
        let finalRole = role;
        const lobbyState = room.gameModes.lobby;
        const currentPlayers = Object.values(lobbyState.connectedPlayers).filter(p => p.role === 'player').length;
        if (finalRole === 'player' && currentPlayers >= MAX_PLAYERS) finalRole = 'spectator';
        
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
        logMessage(room.gameModes.lobby, `${sheet.nome} está pronto para a aventura.`);
        io.to(roomId).emit('gameUpdate', getFullState(room));
    });

    socket.on('playerRequestsSave', () => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId]) return;
        const characterSheet = games[roomId].gameModes.lobby.connectedPlayers[socket.id]?.characterSheet;
        if (characterSheet) {
            socket.emit('characterDataForSave', obfuscateData(characterSheet));
        }
    });

    socket.on('playerLoadsCharacter', (fileContent) => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId]) return;
        const room = games[roomId];
        const characterSheet = deobfuscateData(fileContent);
        if (characterSheet) {
            room.gameModes.lobby.connectedPlayers[socket.id].characterSheet = characterSheet;
            room.gameModes.lobby.connectedPlayers[socket.id].status = 'Pronto';
            logMessage(room.gameModes.lobby, `${characterSheet.nome} carregou sua ficha e está pronto.`);
            socket.emit('loadCharacterSuccess');
            io.to(roomId).emit('gameUpdate', getFullState(room));
        } else {
            socket.emit('error', { message: 'Arquivo de personagem inválido ou corrompido.' });
        }
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
                // CORRIGIDO: Lógica para iniciar modo cenário e voltar ao lobby
                case 'gmStartsTheater':
                    if (!room.gameModes.theater) {
                        room.gameModes.theater = createNewTheaterState(lobbyState.gmId);
                    }
                    room.activeMode = 'theater';
                    break;
                case 'gmGoesBackToLobby':
                    room.activeMode = 'lobby';
                    break;
            }
        }

        if (room.activeMode === 'adventure') {
            const adventureState = activeState;
            if (!adventureState) return;
            // Lógica de batalha continua aqui...
        }
        
        if (shouldUpdate) {
            io.to(roomId).emit('gameUpdate', getFullState(room));
        }
    });

    socket.on('disconnect', () => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId]) return;
        const room = games[roomId];
        delete room.sockets[socket.id];
        if (room.gameModes.lobby.connectedPlayers[socket.id]) {
            delete room.gameModes.lobby.connectedPlayers[socket.id];
        }
        io.to(roomId).emit('gameUpdate', getFullState(room));
        if (Object.keys(room.sockets).length === 0) {
            delete games[roomId];
            console.log(`Sala ${roomId} vazia e removida.`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));