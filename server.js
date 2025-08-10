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
            ALL_SCENARIOS[category] = fs.readdirSync(path).filter(file => file.endsWith('.png') || file.endsWith('.jpg')).map(file => `${category}/${file}`);
        }
    });

} catch (error) { console.error('Erro ao carregar arquivos de configuração:', error); }

const games = {};
const ATTACK_MOVE = { damage: 5 };
function rollD6() { return Math.floor(Math.random() * 6) + 1; }

function createNewLobbyState(gmId) { return { mode: 'lobby', phase: 'waiting_players', gmId: gmId, connectedPlayers: {}, unavailableCharacters: [], log: [{ text: "Lobby criado. Aguardando jogadores..." }], }; }

function createNewAdventureState(gmId, lobbyCache) {
    return {
        mode: 'adventure', fighters: { players: {}, npcs: {} }, winner: null, reason: null, currentRound: 1,
        activeCharacterKey: null, turnOrder: [], turnIndex: 0, initiativeRolls: {}, phase: 'party_setup',
        scenario: 'mapas/cenarios externos/externo (1).png',
        gmId: gmId, lobbyCache: lobbyCache, log: [{ text: "Aguardando jogadores formarem o grupo..." }]
    };
}

function createNewTheaterState(gmId, initialScenario, lobbyCache) {
    const theaterState = {
        mode: 'theater', gmId: gmId, log: [{ text: "Modo Cenário iniciado."}],
        scenarioStates: {}, publicState: {}, lobbyCache: lobbyCache
    };
    const initialScenarioPath = `mapas/${initialScenario}`;
    theaterState.currentScenario = initialScenarioPath;
    theaterState.scenarioStates[initialScenarioPath] = {
        scenario: initialScenarioPath, scenarioWidth: null, scenarioHeight: null, tokens: {},
        tokenOrder: [], globalTokenScale: 1.0, isStaging: true,
    };
    theaterState.publicState = {
        scenario: initialScenarioPath, tokens: {}, tokenOrder: [], globalTokenScale: 1.0, isStaging: true,
    };
    return theaterState;
}

function createNewFighterState(data) {
    const res = Math.max(1, parseInt(data.res, 10) || 1);
    const agi = parseInt(data.agi, 10) || 1;
    return {
        id: data.id,
        nome: data.nome || data.name,
        img: data.img, agi: agi, res: res, hpMax: res * 5, hp: res * 5, status: 'active'
    };
}

function logMessage(state, text, type = 'info') {
    if (!state.log) state.log = [];
    state.log.unshift({ text, type, time: new Date().toLocaleTimeString() });
    if (state.log.length > 100) state.log.pop();
}

function getFighter(state, key) { return state.fighters.players[key] || state.fighters.npcs[key]; }

function checkGameOver(state) {
    const activePlayers = Object.values(state.fighters.players).filter(p => p.status === 'active');
    const activeNpcs = Object.values(state.fighters.npcs).filter(n => n.status === 'active');
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
    let nextIndex = state.turnIndex;
    let attempts = 0;
    do {
        nextIndex = (nextIndex + 1) % state.turnOrder.length;
        if (attempts++ > state.turnOrder.length * 2) {
             state.winner = 'draw'; state.reason = 'Ninguém pôde lutar.'; return;
        }
    } while (getFighter(state, state.turnOrder[nextIndex]).status !== 'active');
    
    if (nextIndex < state.turnIndex) {
        state.currentRound++;
        logMessage(state, `Iniciando Round ${state.currentRound}`, 'round');
    }
    state.turnIndex = nextIndex;
    state.activeCharacterKey = state.turnOrder[state.turnIndex];
    const activeFighter = getFighter(state, state.activeCharacterKey);
    logMessage(state, `É a vez de ${activeFighter.nome}.`, 'turn');
}

function executeAttack(state, roomId, attackerKey, targetKey) {
    const attacker = getFighter(state, attackerKey);
    const target = getFighter(state, targetKey);
    if (!attacker || !target || attacker.status !== 'active' || target.status !== 'active') return;
    
    const hit = true;
    let damageDealt = 0;
    if (hit) {
        damageDealt = ATTACK_MOVE.damage;
        target.hp = Math.max(0, target.hp - damageDealt);
        logMessage(state, `${attacker.nome} ataca ${target.nome} e causa ${damageDealt} de dano!`, 'hit');
        if (target.hp === 0) {
            target.status = 'down';
            logMessage(state, `${target.nome} foi derrotado!`, 'defeat');
        }
    } else {
        logMessage(state, `${attacker.nome} ataca ${target.nome}, mas erra!`, 'miss');
    }
    
    io.to(roomId).emit('attackResolved', { attackerKey, targetKey, hit, damage: damageDealt });

    setTimeout(() => {
        checkGameOver(state);
        if (!state.winner) { advanceTurn(state); }
        io.to(roomId).emit('gameUpdate', state);
    }, 1000);
}

function startBattle(state) {
    state.turnOrder = Object.values(state.fighters.players).concat(Object.values(state.fighters.npcs))
        .filter(f => f.status === 'active')
        .sort((a, b) => {
            const rollA = state.initiativeRolls[a.id] || 0;
            const rollB = state.initiativeRolls[b.id] || 0;
            if (rollB !== rollA) return rollB - rollA;
            return b.agi - a.agi;
        })
        .map(f => f.id);
    state.phase = 'battle';
    state.turnIndex = -1;
    state.currentRound = 1;
    logMessage(state, `--- A Batalha Começou! (Round ${state.currentRound}) ---`, 'round');
    advanceTurn(state);
}

io.on('connection', (socket) => {
    socket.on('gmCreatesLobby', () => {
        const roomId = uuidv4();
        socket.join(roomId);
        socket.currentRoomId = roomId;
        games[roomId] = { state: createNewLobbyState(socket.id), sockets: { [socket.id]: { role: 'gm' } } };
        socket.emit('assignRole', { isGm: true, role: 'gm' });
        socket.emit('roomCreated', roomId);
        io.to(roomId).emit('gameUpdate', games[roomId].state);
    });

    socket.emit('initialData', { characters: { players: PLAYABLE_CHARACTERS.map(name => ({ name, img: `images/players/${name}.png` })), npcs: Object.keys(ALL_NPCS).map(name => ({ name, img: `images/lutadores/${name}.png` })), dynamic: DYNAMIC_CHARACTERS }, scenarios: ALL_SCENARIOS });

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
        let state = room.state;
        const isGm = socket.id === state.gmId;
        let shouldUpdate = true;

        if (isGm && action.type === 'gmGoesBackToLobby') {
            if (state.lobbyCache) { room.state = state.lobbyCache; io.to(roomId).emit('gameUpdate', room.state); }
            return;
        }

        switch (state.mode) {
            case 'lobby':
                if (isGm) {
                    if (action.type === 'gmStartsAdventure') {
                        const lobbyCache = JSON.parse(JSON.stringify(state));
                        room.state = createNewAdventureState(state.gmId, lobbyCache);
                        for (const sId in state.connectedPlayers) {
                            const playerData = state.connectedPlayers[sId];
                            if (playerData.selectedCharacter && playerData.role === 'player') {
                                room.state.fighters.players[sId] = createNewFighterState({ id: sId, nome: playerData.selectedCharacter.nome, img: playerData.selectedCharacter.img, res: 3, agi: 2 });
                                io.to(sId).emit('assignRole', { role: 'player', playerKey: sId });
                            }
                        }
                    } else if (action.type === 'gmStartsTheater') {
                        const lobbyCache = JSON.parse(JSON.stringify(state));
                        room.state = createNewTheaterState(state.gmId, 'cenarios externos/externo (1).png', lobbyCache);
                    }
                }

                if (action.type === 'playerSelectsCharacter' && state.connectedPlayers[socket.id]) {
                    if (state.unavailableCharacters.includes(action.character.nome)) {
                        const mySelection = state.connectedPlayers[socket.id].selectedCharacter;
                        if (!mySelection || mySelection.nome !== action.character.nome) {
                            socket.emit('characterUnavailable', action.character.nome);
                            return;
                        }
                    }
                    const currentPlayer = state.connectedPlayers[socket.id];
                    if(currentPlayer.selectedCharacter){
                        state.unavailableCharacters = state.unavailableCharacters.filter(c => c !== currentPlayer.selectedCharacter.nome);
                    }
                    state.unavailableCharacters.push(action.character.nome);
                    currentPlayer.selectedCharacter = action.character;
                    logMessage(state, `Jogador selecionou ${action.character.nome}.`);
                }
                break;

            case 'adventure':
                // Nenhuma mudança no modo aventura
                break;

            case 'theater':
                 if (isGm) {
                     const currentScenarioState = state.scenarioStates[state.currentScenario];
                     if(currentScenarioState) {
                        switch (action.type) {
                            case 'changeScenario':
                                const newScenarioPath = `mapas/${action.scenario}`;
                                if (action.scenario && typeof action.scenario === 'string') {
                                    state.currentScenario = newScenarioPath;
                                    if (!state.scenarioStates[newScenarioPath]) {
                                        state.scenarioStates[newScenarioPath] = { 
                                            scenario: newScenarioPath, scenarioWidth: null, scenarioHeight: null, tokens: {}, 
                                            tokenOrder: [], globalTokenScale: 1.0, isStaging: true 
                                        };
                                    }
                                    logMessage(state, 'GM está preparando um novo cenário...');
                                }
                                break;
                            case 'updateToken':
                                const tokenData = action.token;
                                if (tokenData.remove && tokenData.ids) {
                                    tokenData.ids.forEach(id => { 
                                        delete currentScenarioState.tokens[id]; 
                                        currentScenarioState.tokenOrder = currentScenarioState.tokenOrder.filter(i => i !== id); 
                                    });
                                } else if (currentScenarioState.tokens[tokenData.id]) {
                                    Object.assign(currentScenarioState.tokens[tokenData.id], tokenData);
                                } else {
                                    currentScenarioState.tokens[tokenData.id] = tokenData;
                                    if (!currentScenarioState.tokenOrder.includes(tokenData.id)) {
                                        currentScenarioState.tokenOrder.push(tokenData.id);
                                    }
                                }
                                if (!currentScenarioState.isStaging) {
                                    state.publicState = JSON.parse(JSON.stringify(currentScenarioState));
                                    state.publicState.isStaging = false;
                                }
                                break;
                            case 'updateGlobalScale':
                                currentScenarioState.globalTokenScale = action.scale;
                                if (!currentScenarioState.isStaging) {
                                    state.publicState.globalTokenScale = action.scale;
                                }
                                break;
                            case 'publish_stage':
                                if (currentScenarioState.isStaging) {
                                    currentScenarioState.isStaging = false;
                                    state.publicState = JSON.parse(JSON.stringify(currentScenarioState));
                                    state.publicState.isStaging = false;
                                    logMessage(state, 'Cena publicada para os jogadores.');
                                }
                                break;
                            // NOVO: Handler para mudar a camada dos tokens
                            case 'changeTokenLayer':
                                const { tokenId, direction } = action;
                                const currentIndex = currentScenarioState.tokenOrder.indexOf(tokenId);
                                if (currentIndex === -1) break;

                                const newIndex = direction === 'up' ? Math.max(0, currentIndex - 1) : Math.min(currentScenarioState.tokenOrder.length - 1, currentIndex + 1);
                                
                                if (newIndex !== currentIndex) {
                                    const [item] = currentScenarioState.tokenOrder.splice(currentIndex, 1);
                                    currentScenarioState.tokenOrder.splice(newIndex, 0, item);
                                }

                                if (!currentScenarioState.isStaging) {
                                    state.publicState = JSON.parse(JSON.stringify(currentScenarioState));
                                    state.publicState.isStaging = false;
                                }
                                break;
                        }
                     }
                 }
                break;
        }

        if (shouldUpdate) {
            io.to(roomId).emit('gameUpdate', room.state);
        }
    });

    socket.on('disconnect', () => { /* Código de disconnect sem alterações */ });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));