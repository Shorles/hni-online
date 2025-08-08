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

let ALL_NPCS = {};
let PLAYABLE_CHARACTERS = [];
let ALL_SCENARIOS = {}; // Alterado para objeto
const MAX_PLAYERS = 4;

try {
    const charactersData = fs.readFileSync('characters.json', 'utf8');
    const characters = JSON.parse(charactersData);
    PLAYABLE_CHARACTERS = characters.players || [];
    const npcNames = characters.npcs || [];
    npcNames.forEach(nome => { ALL_NPCS[nome] = { agi: 2, res: 3 }; });

    // Carregar cenários do jogo de boxe original
    const scenarioCategories = ["cenarios externos", "cenarios internos", "cenas", "fichas", "objetos", "outros"];
    scenarioCategories.forEach(category => {
        const path = `public/images/mapas/${category}/`;
        if (fs.existsSync(path)) {
            ALL_SCENARIOS[category] = fs.readdirSync(path).filter(file => file.endsWith('.png') || file.endsWith('.jpg'));
        }
    });

} catch (error) { console.error('Erro ao carregar arquivos de configuração:', error); }

const games = {};
const ATTACK_MOVE = { damage: 5 };
function rollD6() { return Math.floor(Math.random() * 6) + 1; }

function createNewLobbyState(gmId) { return { mode: 'lobby', phase: 'waiting_players', gmId: gmId, connectedPlayers: {}, unavailableCharacters: [], log: [{ text: "Lobby criado. Aguardando jogadores..." }], }; }

function createNewAdventureState() {
    return {
        mode: 'adventure', fighters: { players: {}, npcs: {} }, winner: null, reason: null, currentRound: 1,
        activeCharacterKey: null, turnOrder: [], turnIndex: 0, initiativeRolls: {}, phase: 'party_setup',
        log: [{ text: "Aguardando jogadores formarem o grupo..." }], scenario: 'mapas/cenarios externos/externo (1).png',
        gmId: null, lobbyCache: null
    };
}

// LÓGICA DO MODO CENÁRIO (DO JOGO ANTIGO)
function createNewTheaterState(gmId, initialScenario) {
    const theaterState = {
        mode: 'theater',
        gmId: gmId,
        log: [{ text: "Modo Cenário iniciado."}],
        currentScenario: initialScenario,
        scenarioStates: {},
        publicState: {},
        lobbyCache: null
    };
    theaterState.scenarioStates[initialScenario] = {
        scenario: initialScenario,
        scenarioWidth: null,
        scenarioHeight: null,
        tokens: {},
        tokenOrder: [],
        globalTokenScale: 1.0,
        isStaging: false,
    };
    theaterState.publicState = {
        scenario: initialScenario,
        tokens: {},
        tokenOrder: [],
        globalTokenScale: 1.0
    };
    return theaterState;
}


function createNewFighterState(data) {
    const res = Math.max(1, parseInt(data.res, 10) || 1);
    const agi = parseInt(data.agi, 10) || 1;
    return {
        id: data.id, nome: data.nome, img: data.img, agi: agi, res: res, hpMax: res * 5, hp: res * 5, status: 'active'
    };
}

function logMessage(state, text, className = '') { if (state && state.log) { state.log.push({ text, className }); if (state.log.length > 50) state.log.shift(); } }
function getFighter(state, key) { return state.fighters.players[key] || state.fighters.npcs[key]; }

function checkGameOver(state) {
    // ... (código existente sem alterações)
}

function executeAttack(state, attackerKey, defenderKey, io, roomId) {
    // ... (código existente sem alterações)
}

function advanceTurn(state, io, roomId) {
    // ... (código existente sem alterações)
}

function filterVisibleTokens(currentScenarioState) {
    if (!currentScenarioState.scenarioWidth || !currentScenarioState.scenarioHeight) {
        return {
            visibleTokens: { ...currentScenarioState.tokens },
            visibleTokenOrder: [...currentScenarioState.tokenOrder]
        };
    }
    const visibleTokenIds = new Set();
    const visibleTokens = {};
    for (const tokenId of currentScenarioState.tokenOrder) {
        const token = currentScenarioState.tokens[tokenId];
        if (!token) continue;
        const tokenCenterX = token.x + (200 * (token.scale || 1) / 2);
        const tokenCenterY = token.y + (200 * (token.scale || 1) / 2);
        if (tokenCenterX >= 0 && tokenCenterX <= currentScenarioState.scenarioWidth &&
            tokenCenterY >= 0 && tokenCenterY <= currentScenarioState.scenarioHeight) {
            visibleTokenIds.add(tokenId);
            visibleTokens[tokenId] = token;
        }
    }
    const visibleTokenOrder = currentScenarioState.tokenOrder.filter(id => visibleTokenIds.has(id));
    return { visibleTokens, visibleTokenOrder };
}


io.on('connection', (socket) => {
    socket.on('gmCreatesLobby', () => {
        const newRoomId = uuidv4().substring(0, 6);
        socket.join(newRoomId);
        socket.currentRoomId = newRoomId;
        const newState = createNewLobbyState(socket.id);
        games[newRoomId] = { id: newRoomId, players: [{ id: socket.id, role: 'gm' }], spectators: [], state: newState };
        socket.emit('assignRole', { role: 'gm', isGm: true });
        socket.emit('roomCreated', newRoomId);
        io.to(socket.id).emit('gameUpdate', newState);
    });

    const fullCharacterList = {
        players: PLAYABLE_CHARACTERS.map(name => ({ name, img: `images/players/${name}.png` })),
        npcs: Object.keys(ALL_NPCS).map(name => ({ name, img: `images/lutadores/${name}.png` }))
    };
    socket.emit('initialData', { characters: fullCharacterList, scenarios: ALL_SCENARIOS });


    socket.on('playerJoinsLobby', ({ roomId, role }) => {
        const room = games[roomId];
        if (!room) { socket.emit('error', { message: 'Sala não encontrada.' }); return; }
        if (role === 'player' && room.state.mode !== 'theater' && Object.keys(room.state.connectedPlayers).length >= MAX_PLAYERS) { socket.emit('error', { message: 'O grupo de aventureiros já está cheio.' }); return; }
        socket.join(roomId);
        socket.currentRoomId = roomId;
        if (room.players.find(p => p.id === socket.id) || room.spectators.includes(socket.id)) return;
        
        if (role === 'spectator') { room.spectators.push(socket.id); } 
        else {
            room.players.push({ id: socket.id, role: 'player' });
            if (room.state.mode === 'lobby') {
                room.state.connectedPlayers[socket.id] = { id: socket.id, role: 'player', selectedCharacter: null };
            }
        }
        socket.emit('assignRole', { role });
        io.to(socket.id).emit('gameUpdate', room.state);
        logMessage(room.state, `Um ${role} entrou na sala.`);
        io.to(roomId).emit('gameUpdate', room.state);
    });

    socket.on('playerAction', (action) => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId] || !action || !action.type) return;
        const room = games[roomId];
        const state = room.state;
        
        // Ações que mudam o modo de jogo
        if (action.type === 'gmStartsTheater') {
            const lobbyCache = { ...state };
            room.state = createNewTheaterState(state.gmId, 'mapas/cenarios externos/externo (1).png');
            room.state.lobbyCache = lobbyCache;
        } else if (action.type === 'gmStartsAdventure') {
            const lobbyCache = { ...state };
            let newState = createNewAdventureState();
            newState.gmId = state.gmId;
            newState.lobbyCache = lobbyCache;
            for (const sId in state.connectedPlayers) {
                const playerData = state.connectedPlayers[sId];
                if (playerData.selectedCharacter) {
                    newState.fighters.players[sId] = createNewFighterState({ id: sId, nome: playerData.selectedCharacter.nome, img: playerData.selectedCharacter.img });
                    io.to(sId).emit('assignRole', { role: 'player', playerKey: sId });
                }
            }
            room.state = newState;
        } else if (action.type === 'gmGoesBackToLobby') {
            if (state.lobbyCache) {
                room.state = state.lobbyCache;
            }
        }
        
        if (state.mode === 'lobby') {
            if (action.type === 'playerSelectsCharacter') {
                if (state.phase === 'waiting_players') {
                    if (state.unavailableCharacters.includes(action.character.nome)) { socket.emit('characterUnavailable', action.character.nome); return; }
                    state.unavailableCharacters.push(action.character.nome);
                    state.connectedPlayers[socket.id].selectedCharacter = action.character;
                    logMessage(state, `Jogador selecionou ${action.character.nome}.`);
                }
            }
        } else if (state.mode === 'adventure') {
            // ... (código do modo aventura sem alterações)
        } else if (state.mode === 'theater') {
            const isGm = socket.id === state.gmId;
            if (!isGm) return;
            const scenarioState = state.scenarioStates[state.currentScenario];
            if(!scenarioState) return;

            switch (action.type) {
                case 'updateToken':
                    // ... (código de updateToken do jogo antigo)
                    break;
                case 'changeTokenOrder':
                    // ... (código de changeTokenOrder do jogo antigo)
                    break;
                case 'changeScenario':
                    // ... (código de changeScenario do jogo antigo)
                    break;
                case 'updateGlobalScale':
                    // ... (código de updateGlobalScale do jogo antigo)
                    break;
                 case 'update_scenario_dims':
                    // ... (código de update_scenario_dims do jogo antigo)
                    break;
                 case 'publish_stage':
                    // ... (código de publish_stage do jogo antigo)
                    break;
            }
            if (action.type === 'updateToken' && action.token.updates) {
                socket.to(roomId).emit('gameUpdate', room.state);
                return;
            }
        }

        io.to(roomId).emit('gameUpdate', room.state);
    });

    socket.on('disconnect', () => { /* ... (código existente sem alterações) */ });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));