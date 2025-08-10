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

function createNewAdventureState(gmId, connectedPlayers) {
    const adventureState = {
        mode: 'adventure', fighters: { players: {}, npcs: {} }, winner: null, reason: null, currentRound: 1,
        activeCharacterKey: null, turnOrder: [], turnIndex: 0, initiativeRolls: {}, phase: 'party_setup',
        scenario: 'mapas/cenarios externos/externo (1).png',
        gmId: gmId, log: [{ text: "Aguardando jogadores formarem o grupo..." }]
    };
    // Preenche os jogadores que já selecionaram personagens
    for (const sId in connectedPlayers) {
        const playerData = connectedPlayers[sId];
        if (playerData.selectedCharacter && playerData.role === 'player') {
            adventureState.fighters.players[sId] = createNewFighterState({ id: sId, nome: playerData.selectedCharacter.nome, img: playerData.selectedCharacter.img, res: 3, agi: 2 });
            io.to(sId).emit('assignRole', { role: 'player', playerKey: sId });
        }
    }
    return adventureState;
}

function createNewTheaterState(gmId, initialScenario) {
    const theaterState = {
        mode: 'theater', gmId: gmId, log: [{ text: "Modo Cenário iniciado."}],
        scenarioStates: {}, publicState: {}
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

function getFighter(state, key) {
    return state.fighters.players[key] || state.fighters.npcs[key];
}

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
        if (!state.winner) {
            advanceTurn(state);
        }
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
        }).map(f => f.id);
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
        // Alteração: Nova estrutura de estado para o jogo
        games[roomId] = {
            sockets: { [socket.id]: { role: 'gm' } },
            activeMode: 'lobby',
            gameModes: {
                lobby: createNewLobbyState(socket.id),
                adventure: null,
                theater: null
            }
        };
        socket.emit('assignRole', { isGm: true, role: 'gm' });
        socket.emit('roomCreated', roomId);
        io.to(roomId).emit('gameUpdate', games[roomId].gameModes.lobby);
    });

    socket.emit('initialData', { characters: { players: PLAYABLE_CHARACTERS.map(name => ({ name, img: `images/players/${name}.png` })), npcs: Object.keys(ALL_NPCS).map(name => ({ name, img: `images/lutadores/${name}.png` })), dynamic: DYNAMIC_CHARACTERS }, scenarios: ALL_SCENARIOS });

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
        let finalRole = role;
        const lobbyState = room.gameModes.lobby;
        const currentPlayers = Object.values(lobbyState.connectedPlayers).filter(p => p.role === 'player').length;
        if (finalRole === 'player' && currentPlayers >= MAX_PLAYERS) {
            finalRole = 'spectator';
        }
        room.sockets[socket.id] = { role: finalRole };
        lobbyState.connectedPlayers[socket.id] = { role: finalRole, selectedCharacter: null };
        logMessage(lobbyState, `Um ${finalRole} conectou-se.`);
        socket.emit('assignRole', { role: finalRole });
        io.to(roomId).emit('gameUpdate', room.gameModes[room.activeMode]);
    });

    socket.on('playerAction', (action) => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId] || !action || !action.type) return;
        
        const room = games[roomId];
        const isGm = socket.id === room.gameModes.lobby.gmId;
        let activeState = room.gameModes[room.activeMode];
        let shouldUpdate = true;

        // Ações que independem do modo de jogo
        if (isGm) {
            if (action.type === 'gmGoesBackToLobby') {
                room.activeMode = 'lobby';
                io.to(roomId).emit('gameUpdate', room.gameModes.lobby);
                return;
            }
            if (action.type === 'gmSwitchesMode') {
                const targetMode = room.activeMode === 'adventure' ? 'theater' : 'adventure';
                if (!room.gameModes[targetMode]) {
                     if (targetMode === 'adventure') {
                        room.gameModes.adventure = createNewAdventureState(room.gameModes.lobby.gmId, room.gameModes.lobby.connectedPlayers);
                     } else {
                        room.gameModes.theater = createNewTheaterState(room.gameModes.lobby.gmId, 'cenarios externos/externo (1).png');
                     }
                }
                room.activeMode = targetMode;
                io.to(roomId).emit('gameUpdate', room.gameModes[targetMode]);
                return;
            }
        }
        
        switch (room.activeMode) {
            case 'lobby':
                if (isGm) {
                    if (action.type === 'gmStartsAdventure') {
                        if (!room.gameModes.adventure) {
                            room.gameModes.adventure = createNewAdventureState(activeState.gmId, activeState.connectedPlayers);
                        }
                        room.activeMode = 'adventure';
                        activeState = room.gameModes.adventure;
                    } else if (action.type === 'gmStartsTheater') {
                         if (!room.gameModes.theater) {
                            room.gameModes.theater = createNewTheaterState(activeState.gmId, 'cenarios externos/externo (1).png');
                        }
                        room.activeMode = 'theater';
                        activeState = room.gameModes.theater;
                    }
                }
                if (action.type === 'playerSelectsCharacter' && activeState.connectedPlayers[socket.id]) {
                    if (activeState.unavailableCharacters.includes(action.character.nome)) {
                        const mySelection = activeState.connectedPlayers[socket.id].selectedCharacter;
                        if (!mySelection || mySelection.nome !== action.character.nome) {
                            socket.emit('characterUnavailable', action.character.nome);
                            return;
                        }
                    }
                    const currentPlayer = activeState.connectedPlayers[socket.id];
                    if(currentPlayer.selectedCharacter){
                        activeState.unavailableCharacters = activeState.unavailableCharacters.filter(c => c !== currentPlayer.selectedCharacter.nome);
                    }
                    activeState.unavailableCharacters.push(action.character.nome);
                    currentPlayer.selectedCharacter = action.character;
                    logMessage(activeState, `Jogador selecionou ${action.character.nome}.`);
                }
                break;

            case 'adventure':
                const actor = action.actorKey ? getFighter(activeState, action.actorKey) : null;
                const canControl = actor && ((isGm && activeState.fighters.npcs[actor.id]) || (socket.id === actor.id));
                switch (action.type) {
                    case 'gmConfirmParty':
                        if (isGm && activeState.phase === 'party_setup' && action.playerStats) {
                            action.playerStats.forEach(stats => {
                                if (activeState.fighters.players[stats.id]) {
                                    const res = Math.max(1, stats.res);
                                    Object.assign(activeState.fighters.players[stats.id], {
                                        agi: stats.agi, res: res, hpMax: res * 5, hp: res * 5
                                    });
                                }
                            });
                            activeState.phase = 'npc_setup';
                            logMessage(activeState, 'GM confirmou o grupo. Prepare o encontro!');
                        }
                        break;
                    case 'gmStartBattle':
                        if (isGm && activeState.phase === 'npc_setup' && action.npcs) {
                             if (action.npcs.length === 0) { shouldUpdate = false; break; }
                            action.npcs.forEach((npcData, i) => {
                                const npcId = `npc-${i}-${Date.now()}`;
                                activeState.fighters.npcs[npcId] = createNewFighterState({ ...npcData, id: npcId });
                            });
                            activeState.phase = 'initiative_roll';
                            logMessage(activeState, 'Inimigos em posição! Rolem as iniciativas!');
                        }
                        break;
                    case 'roll_initiative':
                        if (activeState.phase === 'initiative_roll') {
                            if (action.isGmRoll && isGm) {
                                Object.values(activeState.fighters.npcs).forEach(npc => {
                                    if (npc.status === 'active' && !activeState.initiativeRolls[npc.id]) {
                                        activeState.initiativeRolls[npc.id] = rollD6();
                                    }
                                });
                            } else if (!action.isGmRoll && activeState.fighters.players[socket.id] && !activeState.initiativeRolls[socket.id]) {
                                activeState.initiativeRolls[socket.id] = rollD6();
                            }
                            const activeFighters = [...Object.values(activeState.fighters.players), ...Object.values(activeState.fighters.npcs)].filter(f => f.status === 'active');
                            if (activeFighters.every(f => activeState.initiativeRolls[f.id])) {
                                startBattle(activeState);
                            }
                        }
                        break;
                    case 'attack':
                        if (activeState.phase === 'battle' && action.attackerKey === activeState.activeCharacterKey) {
                             const attacker = getFighter(activeState, action.attackerKey);
                             const isNpcTurn = !!activeState.fighters.npcs[attacker.id];
                             if ((isGm && isNpcTurn) || (!isNpcTurn && socket.id === action.attackerKey)) {
                                 executeAttack(activeState, roomId, action.attackerKey, action.targetKey);
                                 shouldUpdate = false; 
                             }
                        }
                        break;
                    case 'end_turn':
                        if (activeState.phase === 'battle' && action.actorKey === activeState.activeCharacterKey && canControl) {
                            advanceTurn(activeState);
                        }
                        break;
                }
                break;

            case 'theater':
                 if (isGm) {
                     const currentScenarioState = activeState.scenarioStates[activeState.currentScenario];
                     if(currentScenarioState) {
                        switch (action.type) {
                            case 'changeScenario':
                                const newScenarioPath = `mapas/${action.scenario}`;
                                if (action.scenario && typeof action.scenario === 'string') {
                                    activeState.currentScenario = newScenarioPath;
                                    if (!activeState.scenarioStates[newScenarioPath]) {
                                        activeState.scenarioStates[newScenarioPath] = { 
                                            scenario: newScenarioPath, scenarioWidth: null, scenarioHeight: null, tokens: {}, 
                                            tokenOrder: [], globalTokenScale: 1.0, isStaging: true 
                                        };
                                    }
                                    logMessage(activeState, 'GM está preparando um novo cenário...');
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
                                    activeState.publicState = JSON.parse(JSON.stringify(currentScenarioState));
                                    activeState.publicState.isStaging = false;
                                }
                                break;
                            case 'updateTokenOrder':
                                if(action.order && Array.isArray(action.order)) {
                                    currentScenarioState.tokenOrder = action.order;
                                    if (!currentScenarioState.isStaging) {
                                        activeState.publicState.tokenOrder = action.order;
                                    }
                                }
                                break;
                            case 'updateGlobalScale':
                                currentScenarioState.globalTokenScale = action.scale;
                                if (!currentScenarioState.isStaging) {
                                    activeState.publicState.globalTokenScale = action.scale;
                                }
                                break;
                            case 'publish_stage':
                                if (currentScenarioState.isStaging) {
                                    currentScenarioState.isStaging = false;
                                    activeState.publicState = JSON.parse(JSON.stringify(currentScenarioState));
                                    activeState.publicState.isStaging = false;
                                    logMessage(activeState, 'Cena publicada para os jogadores.');
                                }
                                break;
                        }
                     }
                 }
                break;
        }
        if (shouldUpdate) {
            io.to(roomId).emit('gameUpdate', activeState);
        }
    });

    socket.on('disconnect', () => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId]) return;

        const room = games[roomId];
        const lobbyState = room.gameModes.lobby;
        if (!lobbyState || !lobbyState.connectedPlayers) {
            console.error(`Estado de lobby inválido no disconnect para a sala: ${roomId}`);
            return;
        }
        
        const playerInfo = lobbyState.connectedPlayers[socket.id];
        if (playerInfo) {
            logMessage(lobbyState, `Um ${playerInfo.role} desconectou.`);
            if (playerInfo.selectedCharacter) {
                lobbyState.unavailableCharacters = lobbyState.unavailableCharacters.filter(c => c !== playerInfo.selectedCharacter.nome);
            }
        }
        
        delete room.sockets[socket.id];
        delete lobbyState.connectedPlayers[socket.id];

        const adventureState = room.gameModes.adventure;
        if (adventureState && adventureState.fighters.players[socket.id]) {
            adventureState.fighters.players[socket.id].status = 'disconnected';
            logMessage(adventureState, `${adventureState.fighters.players[socket.id].nome} foi desconectado.`);
            checkGameOver(adventureState);
        }

        io.to(roomId).emit('gameUpdate', room.gameModes[room.activeMode]);
        
        if (Object.keys(room.sockets).length === 0) {
            delete games[roomId];
            console.log(`Sala ${roomId} vazia e removida.`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));