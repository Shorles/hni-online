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
let DYNAMIC_CHARACTERS = [];
let ALL_SCENARIOS = {};
const MAX_PLAYERS = 4;

try {
    const charactersData = fs.readFileSync('characters.json', 'utf8');
    const characters = JSON.parse(charactersData);
    PLAYABLE_CHARACTERS = characters.players || [];
    const npcNames = characters.npcs || [];
    npcNames.forEach(nome => { ALL_NPCS[nome] = { agi: 2, res: 3 }; });

    const dynamicCharPath = 'public/images/personagens/';
    if (fs.existsSync(dynamicCharPath)) {
        const files = fs.readdirSync(dynamicCharPath).filter(file => file.startsWith('Personagem (') && (file.endsWith('.png') || file.endsWith('.jpg')));
        DYNAMIC_CHARACTERS = files.map(file => ({ name: file.split('.')[0], img: `images/personagens/${file}` }));
    }

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

function createNewTheaterState(gmId, initialScenario) {
    const theaterState = {
        mode: 'theater', gmId: gmId, log: [{ text: "Modo Cenário iniciado."}], currentScenario: initialScenario,
        scenarioStates: {}, publicState: {}, lobbyCache: null
    };
    theaterState.scenarioStates[initialScenario] = {
        scenario: initialScenario, scenarioWidth: null, scenarioHeight: null, tokens: {},
        tokenOrder: [], globalTokenScale: 1.0, isStaging: true,
    };
    theaterState.publicState = {
        scenario: initialScenario, tokens: {}, tokenOrder: [], globalTokenScale: 1.0
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

function logMessage(state, text, type = 'info') {
    if (state && state.log) {
        state.log.unshift({ text, type, time: new Date().toLocaleTimeString() });
        if (state.log.length > 100) state.log.pop();
    }
}

io.on('connection', (socket) => {
    socket.on('gmCreatesLobby', () => {
        const roomId = uuidv4();
        socket.join(roomId);
        socket.currentRoomId = roomId;
        games[roomId] = {
            state: createNewLobbyState(socket.id),
            sockets: { [socket.id]: { role: 'gm' } }
        };
        // CORREÇÃO: Envia o 'assignRole' ANTES de 'roomCreated' para evitar race condition no cliente.
        socket.emit('assignRole', { isGm: true, role: 'gm' });
        socket.emit('roomCreated', roomId);
        io.to(roomId).emit('gameUpdate', games[roomId].state);
    });

    const fullCharacterList = {
        players: PLAYABLE_CHARACTERS.map(name => ({ name, img: `images/players/${name}.png` })),
        npcs: Object.keys(ALL_NPCS).map(name => ({ name, img: `images/lutadores/${name}.png` })),
        dynamic: DYNAMIC_CHARACTERS
    };
    socket.emit('initialData', { characters: fullCharacterList, scenarios: ALL_SCENARIOS });

    socket.on('playerJoinsLobby', ({ roomId, role }) => {
        if (!games[roomId]) { socket.emit('error', { message: 'Sala não encontrada.' }); return; }
        if (Object.values(games[roomId].state.connectedPlayers).filter(p => p.role === 'player').length >= MAX_PLAYERS && role === 'player') {
             socket.emit('error', { message: 'A sala está cheia.' }); return;
        }
        socket.join(roomId);
        socket.currentRoomId = roomId;
        games[roomId].sockets[socket.id] = { role: role };
        games[roomId].state.connectedPlayers[socket.id] = { role: role, selectedCharacter: null };
        logMessage(games[roomId].state, `Um ${role} conectou-se.`);
        socket.emit('assignRole', { role: role });
        io.to(roomId).emit('gameUpdate', games[roomId].state);
    });

    socket.on('playerAction', (action) => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId] || !action || !action.type) return;
        const room = games[roomId];
        const state = room.state;
        const isGm = socket.id === state.gmId;

        // --- Ações Globais / de Transição de Modo (Apenas GM) ---
        if (isGm) {
            if (action.type === 'gmStartsTheater') {
                const lobbyCache = { ...state };
                room.state = createNewTheaterState(state.gmId, 'mapas/cenarios externos/externo (1).png');
                room.state.lobbyCache = lobbyCache;
                io.to(roomId).emit('gameUpdate', room.state); return;
            }
            if (action.type === 'gmStartsAdventure') {
                const lobbyCache = { ...state };
                let newState = createNewAdventureState();
                newState.gmId = state.gmId;
                newState.lobbyCache = lobbyCache;
                for (const sId in state.connectedPlayers) {
                    const playerData = state.connectedPlayers[sId];
                    if (playerData.selectedCharacter && playerData.role === 'player') {
                        newState.fighters.players[sId] = createNewFighterState({ id: sId, nome: playerData.selectedCharacter.nome, img: playerData.selectedCharacter.img, res: 3, agi: 2 });
                        io.to(sId).emit('assignRole', { role: 'player', playerKey: sId });
                    }
                }
                room.state = newState;
                io.to(roomId).emit('gameUpdate', room.state); return;
            }
            if (action.type === 'gmGoesBackToLobby') {
                if (state.lobbyCache) room.state = state.lobbyCache;
                io.to(roomId).emit('gameUpdate', room.state); return;
            }
        }

        // --- Ações Específicas de Cada Modo ---
        switch (state.mode) {
            case 'lobby':
                if (action.type === 'playerSelectsCharacter') {
                    if (state.phase === 'waiting_players' && state.connectedPlayers[socket.id]) {
                        if (state.unavailableCharacters.includes(action.character.nome)) { socket.emit('characterUnavailable', action.character.nome); return; }
                        state.unavailableCharacters.push(action.character.nome);
                        state.connectedPlayers[socket.id].selectedCharacter = action.character;
                        logMessage(state, `Jogador selecionou ${action.character.nome}.`);
                    }
                }
                break;
            case 'adventure':
                if (isGm && action.type === 'gmConfirmParty' && state.phase === 'party_setup') {
                    action.playerStats.forEach(pStat => {
                        if (state.fighters.players[pStat.id]) {
                           const player = state.fighters.players[pStat.id];
                           player.agi = parseInt(pStat.agi, 10) || 1;
                           player.res = Math.max(1, parseInt(pStat.res, 10) || 1);
                           player.hpMax = player.res * 5; player.hp = player.hpMax;
                        }
                    });
                    state.phase = 'npc_setup';
                    logMessage(state, `Grupo confirmado! GM está preparando os inimigos...`);
                }
                break;
            case 'theater':
                if (isGm) {
                    const currentScenarioState = state.scenarioStates[state.currentScenario];
                    if (!currentScenarioState) break;
                    
                    switch (action.type) {
                        case 'changeScenario':
                            if (action.scenario && typeof action.scenario === 'string') {
                                state.currentScenario = action.scenario;
                                if (!state.scenarioStates[action.scenario]) {
                                    state.scenarioStates[action.scenario] = {
                                        scenario: action.scenario, scenarioWidth: null, scenarioHeight: null, tokens: {},
                                        tokenOrder: [], globalTokenScale: currentScenarioState.globalTokenScale || 1.0, isStaging: true,
                                    };
                                }
                            }
                            break;
                        case 'update_scenario_dims':
                            currentScenarioState.scenarioWidth = action.width;
                            currentScenarioState.scenarioHeight = action.height;
                            break;
                        case 'updateToken':
                            currentScenarioState.isStaging = true;
                            const tokenData = action.token;
                            if (tokenData.remove && tokenData.ids) {
                                tokenData.ids.forEach(idToRemove => {
                                    delete currentScenarioState.tokens[idToRemove];
                                    const index = currentScenarioState.tokenOrder.indexOf(idToRemove);
                                    if (index > -1) currentScenarioState.tokenOrder.splice(index, 1);
                                });
                            } else if (currentScenarioState.tokens[tokenData.id]) {
                                Object.assign(currentScenarioState.tokens[tokenData.id], tokenData);
                            } else {
                                currentScenarioState.tokens[tokenData.id] = tokenData;
                                if (!currentScenarioState.tokenOrder.includes(tokenData.id)) {
                                    currentScenarioState.tokenOrder.push(tokenData.id);
                                }
                            }
                            break;
                        case 'changeTokenOrder':
                            const { tokenId, direction } = action;
                            const currentIndex = currentScenarioState.tokenOrder.indexOf(tokenId);
                            if (currentIndex > -1) {
                                currentScenarioState.isStaging = true;
                                currentScenarioState.tokenOrder.splice(currentIndex, 1);
                                let newIndex = currentIndex;
                                if (direction === 'forward' && newIndex < currentScenarioState.tokenOrder.length) newIndex++;
                                else if (direction === 'backward' && newIndex > 0) newIndex--;
                                else if (direction === 'toFront') newIndex = currentScenarioState.tokenOrder.length;
                                else if (direction === 'toBack') newIndex = 0;
                                currentScenarioState.tokenOrder.splice(newIndex, 0, tokenId);
                            }
                            break;
                        case 'updateGlobalScale':
                            currentScenarioState.isStaging = true;
                            currentScenarioState.globalTokenScale = action.scale;
                            break;
                        case 'publish_stage':
                            state.publicState = JSON.parse(JSON.stringify(currentScenarioState));
                            state.publicState.isStaging = false;
                            currentScenarioState.isStaging = false;
                            logMessage(state, 'Cena publicada para os jogadores.');
                            break;
                    }
                }
                break;
        }

        io.to(roomId).emit('gameUpdate', room.state);
    });

    socket.on('disconnect', () => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId]) return;
        const room = games[roomId];
        const state = room.state;
        if (socket.id === state.gmId) {
            io.to(roomId).emit('error', { message: 'O Mestre da sala se desconectou. O jogo foi encerrado.' });
            delete games[roomId];
            return;
        }
        if (state && state.connectedPlayers && state.connectedPlayers[socket.id]) {
            const playerInfo = state.connectedPlayers[socket.id];
            if (playerInfo.selectedCharacter) {
                state.unavailableCharacters = state.unavailableCharacters.filter(c => c !== playerInfo.selectedCharacter.nome);
            }
            logMessage(state, `Um ${playerInfo.role} desconectou.`);
            delete state.connectedPlayers[socket.id];
        }
        if (state && state.fighters && state.fighters.players[socket.id]) {
             delete state.fighters.players[socket.id];
        }
        if (room.sockets) delete room.sockets[socket.id];
        if (Object.keys(room.sockets || {}).length === 0) {
            delete games[roomId];
        } else {
            io.to(roomId).emit('gameUpdate', state);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));