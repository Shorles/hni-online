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
const MAX_NPCS = 5;

try {
    const charactersData = fs.readFileSync('characters.json', 'utf8');
    const characters = JSON.parse(charactersData);
    PLAYABLE_CHARACTERS = characters.players || [];
    ALL_NPCS = characters.npcs || {}; 

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
        gmId: gmId, log: [{ text: "Aguardando jogadores formarem o grupo..." }],
        waitingPlayers: {} 
    };
    for (const sId in connectedPlayers) {
        const playerData = connectedPlayers[sId];
        if (playerData.selectedCharacter && playerData.role === 'player') {
            const fighterData = { 
                id: sId, 
                nome: playerData.selectedCharacter.nome, 
                img: playerData.selectedCharacter.img, 
            };
            if (playerData.persistentStats) {
                Object.assign(fighterData, playerData.persistentStats);
            } else {
                 Object.assign(fighterData, { res: 3, agi: 2 });
            }
            adventureState.fighters.players[sId] = createNewFighterState(fighterData);
            const finalFighter = adventureState.fighters.players[sId];
            if (playerData.persistentStats && playerData.persistentStats.hp !== undefined) {
                 finalFighter.hp = playerData.persistentStats.hp;
            }
            if (finalFighter.hp <= 0) {
                 finalFighter.status = 'down';
            }
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

function createNewFighterState(data, slot = null) {
    const agi = data.agi !== undefined ? parseInt(data.agi, 10) : 2; 
    const res = data.res !== undefined ? parseInt(data.res, 10) : 3; 
    const scale = data.scale !== undefined ? parseFloat(data.scale) : 1.0;
    const hpMax = res * 5;
    const hp = data.hp !== undefined ? data.hp : hpMax;
    const status = hp <= 0 ? 'down' : 'active';

    const fighter = {
        id: data.id,
        nome: data.nome || data.name,
        img: data.img,
        agi: agi,
        res: res,
        hpMax: hpMax, 
        hp: hp,
        status: status,
        scale: scale,
    };
    if (slot !== null) {
        fighter.slot = slot;
    }
    return fighter;
}

function cachePlayerStats(room) {
    if (!room.gameModes.adventure) return;
    const adventureState = room.gameModes.adventure;
    const lobbyState = room.gameModes.lobby;

    Object.values(adventureState.fighters.players).forEach(playerFighter => {
        if (lobbyState.connectedPlayers[playerFighter.id]) {
            lobbyState.connectedPlayers[playerFighter.id].persistentStats = {
                hp: playerFighter.hp,
                hpMax: playerFighter.hpMax,
                res: playerFighter.res,
                agi: playerFighter.agi
            };
        }
    });
}

function logMessage(state, text, type = 'info') {
    if (!state.log) state.log = [];
    state.log.unshift({ text, type, time: new Date().toLocaleTimeString() });
    if (state.log.length > 100) state.log.pop();
}

function getFighter(state, key) {
    if (!state || !state.fighters) return null;
    return state.fighters.players[key] || state.fighters.npcs[key];
}

function checkGameOver(state) {
    const activePlayers = Object.values(state.fighters.players).filter(p => p.status === 'active');
    const activeNpcs = Object.values(state.fighters.npcs).filter(n => n.status === 'active');
    if (activePlayers.length === 0) {
        state.winner = 'npcs'; state.reason = 'Todos os jogadores foram derrotados ou fugiram.';
        logMessage(state, 'Fim da batalha! Os inimigos venceram.', 'game_over');
    } else if (activeNpcs.length === 0) {
        state.winner = 'players'; state.reason = 'Todos os inimigos foram derrotados.';
        logMessage(state, 'Fim da batalha! Os jogadores venceram!', 'game_over');
    }
}

function advanceTurn(state) {
    if (state.winner) return;

    const fullTurnOrder = state.turnOrder;
    let activeFightersInOrder = fullTurnOrder.filter(id => {
        const f = getFighter(state, id);
        return f && f.status === 'active';
    });

    if (activeFightersInOrder.length === 0) {
        checkGameOver(state);
        return;
    }

    let currentTurnIndexInFilteredList = activeFightersInOrder.indexOf(state.activeCharacterKey);

    if (currentTurnIndexInFilteredList === -1) {
        state.currentRound++;
        logMessage(state, `Iniciando Round ${state.currentRound}`, 'round');
    }
    
    let nextTurnIndexInFilteredList = (currentTurnIndexInFilteredList + 1) % activeFightersInOrder.length;
    
    if (nextTurnIndexInFilteredList <= currentTurnIndexInFilteredList && currentTurnIndexInFilteredList !== -1) {
         state.currentRound++;
         logMessage(state, `Iniciando Round ${state.currentRound}`, 'round');
    }

    const nextFighterId = activeFightersInOrder[nextTurnIndexInFilteredList];
    const nextFighter = getFighter(state, nextFighterId);
    state.activeCharacterKey = nextFighterId;
    state.turnIndex = fullTurnOrder.indexOf(nextFighterId);
    logMessage(state, `É a vez de ${nextFighter.nome}.`, 'turn');
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
            checkGameOver(state);
            if (state.winner) {
                 cachePlayerStats(games[roomId]);
            }
        }
    } else {
        logMessage(state, `${attacker.nome} ataca ${target.nome}, mas erra!`, 'miss');
    }
    io.to(roomId).emit('attackResolved', { attackerKey, targetKey, hit, damage: damageDealt });
    setTimeout(() => {
        if (!state.winner) {
            advanceTurn(state);
        }
        io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
    }, 1000);
}

function startBattle(state) {
    state.turnOrder = Object.values(state.fighters.players).concat(Object.values(state.fighters.npcs))
        .sort((a, b) => {
            const rollA = state.initiativeRolls[a.id] || 0;
            const rollB = state.initiativeRolls[b.id] || 0;
            if (rollB !== rollA) return rollB - rollA;
            return b.agi - a.agi;
        }).map(f => f.id);
    
    state.phase = 'battle';
    state.turnIndex = -1; 
    state.activeCharacterKey = null;
    state.currentRound = 0;
    logMessage(state, `--- A Batalha Começou! ---`, 'round');
    advanceTurn(state);
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
            gameModes: {
                lobby: createNewLobbyState(socket.id),
                adventure: null,
                theater: null
            },
            adventureCache: null
        };
        socket.emit('assignRole', { isGm: true, role: 'gm', roomId: roomId });
        socket.emit('roomCreated', roomId);
        io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
    });

    socket.emit('initialData', { 
        characters: { 
            players: PLAYABLE_CHARACTERS.map(name => ({ name, img: `images/players/${name}.png` })), 
            npcs: Object.keys(ALL_NPCS).map(name => ({ 
                name, 
                img: `images/lutadores/${name}.png`, 
                scale: ALL_NPCS[name].scale || 1.0
            })), 
            dynamic: DYNAMIC_CHARACTERS 
        }, 
        scenarios: ALL_SCENARIOS 
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
        let finalRole = role;
        const lobbyState = room.gameModes.lobby;
        const currentPlayers = Object.values(lobbyState.connectedPlayers).filter(p => p.role === 'player').length;
        if (finalRole === 'player' && currentPlayers >= MAX_PLAYERS) {
            finalRole = 'spectator';
        }
        room.sockets[socket.id] = { role: finalRole };
        lobbyState.connectedPlayers[socket.id] = { role: finalRole, selectedCharacter: null, persistentStats: null };
        logMessage(lobbyState, `Um ${finalRole} conectou-se.`);
        socket.emit('assignRole', { role: finalRole, roomId: roomId });
        io.to(roomId).emit('gameUpdate', getFullState(room));
    });

    socket.on('playerAction', (action) => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId] || !action || !action.type) return;
        
        const room = games[roomId];
        const lobbyState = room.gameModes.lobby;
        const isGm = socket.id === lobbyState.gmId;
        let shouldUpdate = true;
        
        // --- START: MODIFIED SECTION ---
        // First, handle GM "meta" actions that change the game's flow or active mode.
        if (isGm) {
            switch (action.type) {
                case 'gmGoesBackToLobby':
                    if (room.activeMode === 'adventure' && room.gameModes.adventure) {
                        cachePlayerStats(room);
                        room.adventureCache = JSON.parse(JSON.stringify(room.gameModes.adventure));
                        room.gameModes.adventure = null;
                    }
                    room.activeMode = 'lobby';
                    io.to(roomId).emit('gameUpdate', getFullState(room));
                    return; // Exit: Action is fully handled.

                case 'gmSwitchesMode':
                    if (room.activeMode === 'adventure') {
                        if (room.gameModes.adventure) {
                            cachePlayerStats(room);
                            room.adventureCache = JSON.parse(JSON.stringify(room.gameModes.adventure));
                            room.gameModes.adventure = null;
                        }
                        if (!room.gameModes.theater) {
                            room.gameModes.theater = createNewTheaterState(lobbyState.gmId, 'cenarios externos/externo (1).png');
                        }
                        room.activeMode = 'theater';
                    } else if (room.activeMode === 'theater') {
                        if (room.adventureCache) {
                            socket.emit('promptForAdventureType');
                            return; // Exit: Wait for GM's next action.
                        } else {
                            room.gameModes.adventure = createNewAdventureState(lobbyState.gmId, lobbyState.connectedPlayers);
                            room.activeMode = 'adventure';
                        }
                    }
                    io.to(roomId).emit('gameUpdate', getFullState(room));
                    return; // Exit: Action is fully handled.

                case 'gmChoosesAdventureType':
                    if (action.choice === 'continue' && room.adventureCache) {
                        room.gameModes.adventure = room.adventureCache;
                    } else {
                        room.gameModes.adventure = createNewAdventureState(lobbyState.gmId, lobbyState.connectedPlayers);
                        room.gameModes.adventure.phase = 'npc_setup';
                        logMessage(room.gameModes.adventure, 'Iniciando um novo encontro com o grupo existente.');
                    }
                    room.adventureCache = null;
                    room.activeMode = 'adventure';
                    io.to(roomId).emit('gameUpdate', getFullState(room));
                    return; // Exit: Action is fully handled.
            }
        }
        // --- END: MODIFIED SECTION ---

        if (action.type === 'playerSelectsCharacter') {
            const playerInfo = lobbyState.connectedPlayers[socket.id];
            if (!playerInfo) { return; }
            if (lobbyState.unavailableCharacters.includes(action.character.nome)) {
                 const mySelection = playerInfo.selectedCharacter;
                 if (!mySelection || mySelection.nome !== action.character.nome) {
                     socket.emit('characterUnavailable', action.character.nome);
                     shouldUpdate = false;
                 }
            }
            if(playerInfo.selectedCharacter){
                lobbyState.unavailableCharacters = lobbyState.unavailableCharacters.filter(c => c !== playerInfo.selectedCharacter.nome);
            }
            lobbyState.unavailableCharacters.push(action.character.nome);
            playerInfo.selectedCharacter = action.character;
            logMessage(lobbyState, `Jogador selecionou ${action.character.nome}.`);
            
            if(room.activeMode === 'adventure' && room.gameModes.adventure) {
                room.gameModes.adventure.waitingPlayers[socket.id] = { ...action.character };
                io.to(lobbyState.gmId).emit('gmPromptToAdmit', { playerId: socket.id, character: action.character });
            }
        }

        const activeState = room.gameModes[room.activeMode];

        if (activeState) {
            switch (activeState.mode) {
                case 'lobby':
                    if (isGm && action.type === 'gmStartsAdventure') {
                        room.adventureCache = null;
                        room.gameModes.adventure = createNewAdventureState(activeState.gmId, activeState.connectedPlayers);
                        room.activeMode = 'adventure';
                    } else if (isGm && action.type === 'gmStartsTheater') {
                         if (!room.gameModes.theater) {
                            room.gameModes.theater = createNewTheaterState(activeState.gmId, 'cenarios externos/externo (1).png');
                        }
                        room.activeMode = 'theater';
                    }
                    break;

                case 'adventure':
                    const actor = action.actorKey ? getFighter(activeState, action.actorKey) : null;
                    const canControl = actor && ((isGm && activeState.fighters.npcs[actor.id]) || (socket.id === actor.id));
                    
                    switch (action.type) {
                        case 'gmDecidesOnAdmission':
                            if (isGm && action.playerId && activeState.waitingPlayers[action.playerId]) {
                                const character = activeState.waitingPlayers[action.playerId];
                                if (action.admitted) {
                                    const newPlayerId = action.playerId;
                                    io.to(newPlayerId).emit('assignRole', { role: 'player', playerKey: newPlayerId, roomId: roomId });
                                    activeState.fighters.players[newPlayerId] = createNewFighterState({id: newPlayerId, ...character});
                                    if (activeState.phase === 'battle') {
                                        activeState.turnOrder.push(newPlayerId);
                                    } 
                                    logMessage(activeState, `${character.nome} entrou na batalha!`);
                                    delete activeState.waitingPlayers[action.playerId];
                                } else {
                                    delete activeState.waitingPlayers[action.playerId];
                                    logMessage(activeState, `O Mestre decidiu que ${character.nome} aguardará.`);
                                }
                            }
                            break;
                        case 'gmConfirmParty':
                            if (isGm && activeState.phase === 'party_setup' && action.playerStats) {
                                action.playerStats.forEach(stats => {
                                    if (activeState.fighters.players[stats.id]) {
                                        const res = Math.max(1, stats.res);
                                        Object.assign(activeState.fighters.players[stats.id], {
                                            agi: stats.agi, res: res, hpMax: res * 5, hp: res * 5, status: 'active'
                                        });
                                    }
                                });
                                cachePlayerStats(room);
                                activeState.phase = 'npc_setup';
                                logMessage(activeState, 'GM confirmou o grupo. Prepare o encontro!');
                            }
                            break;
                        case 'gmStartBattle':
                            if (isGm && activeState.phase === 'npc_setup' && action.npcs) {
                                 if (action.npcs.length === 0) { shouldUpdate = false; break; }
                                activeState.fighters.npcs = {};
                                action.npcs.forEach((npcData, i) => {
                                    const npcObj = ALL_NPCS[npcData.name] || {};
                                    activeState.fighters.npcs[npcData.id] = createNewFighterState({ 
                                        ...npcData, 
                                        id: npcData.id, 
                                        scale: npcObj.scale || 1.0 
                                    }, i);
                                });
                                activeState.phase = 'initiative_roll';
                                activeState.initiativeRolls = {};
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
                                const allFighters = [...Object.values(activeState.fighters.players), ...Object.values(activeState.fighters.npcs)];
                                if (allFighters.every(f => activeState.initiativeRolls[f.id] || f.status !== 'active')) {
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
                     if (isGm && activeState.scenarioStates && activeState.currentScenario) {
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
        }
        
        if (shouldUpdate) {
            io.to(roomId).emit('gameUpdate', getFullState(room));
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
        if (adventureState) {
            if (adventureState.fighters.players[socket.id]) {
                adventureState.fighters.players[socket.id].status = 'disconnected';
                logMessage(adventureState, `${adventureState.fighters.players[socket.id].nome} foi desconectado.`);
                checkGameOver(adventureState);
            }
            if (adventureState.waitingPlayers[socket.id]) {
                delete adventureState.waitingPlayers[socket.id];
            }
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