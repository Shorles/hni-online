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

// NOVO: Adicionado 'slot' para manter a posição fixa
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
    // Adiciona a propriedade slot apenas se for um NPC
    if (slot !== null) {
        fighter.slot = slot;
    }
    return fighter;
}

function cachePlayerStats(room) {
    if (room.activeMode !== 'adventure' || !room.gameModes.adventure) return;
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
    // CORREÇÃO: Filtra apenas os IDs de personagens ativos na turnOrder
    const activeTurnOrder = state.turnOrder.filter(id => getFighter(state, id)?.status === 'active');
    if (activeTurnOrder.length === 0) {
        checkGameOver(state);
        return;
    }
    
    let currentTurnIndexInActive = activeTurnOrder.indexOf(state.activeCharacterKey);
    let nextIndexInActive = (currentTurnIndexInActive + 1) % activeTurnOrder.length;
    
    if (nextIndexInActive < currentTurnIndexInActive && currentTurnIndexInActive !== -1) {
        state.currentRound++;
        logMessage(state, `Iniciando Round ${state.currentRound}`, 'round');
    }
    
    state.activeCharacterKey = activeTurnOrder[nextIndexInActive];
    state.turnIndex = state.turnOrder.indexOf(state.activeCharacterKey); // Atualiza o turnIndex principal
    
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
        .filter(f => f.status === 'active')
        .sort((a, b) => {
            const rollA = state.initiativeRolls[a.id] || 0;
            const rollB = state.initiativeRolls[b.id] || 0;
            if (rollB !== rollA) return rollB - rollA;
            return b.agi - a.agi;
        }).map(f => f.id);
    state.phase = 'battle';
    state.turnIndex = -1; // -1 para que o primeiro advanceTurn comece do primeiro jogador (índice 0)
    state.activeCharacterKey = null; // Nenhum personagem começa ativo
    state.currentRound = 1;
    logMessage(state, `--- A Batalha Começou! (Round ${state.currentRound}) ---`, 'round');
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
        let activeState = room.gameModes[room.activeMode];
        let shouldUpdate = true;
        
        if (isGm) {
            if (action.type === 'gmGoesBackToLobby') {
                if (room.activeMode === 'adventure' && room.gameModes.adventure) { // CORREÇÃO: Garante que a aventura existe
                    cachePlayerStats(room); 
                    room.adventureCache = JSON.parse(JSON.stringify(room.gameModes.adventure));
                }
                room.activeMode = 'lobby';
                io.to(roomId).emit('gameUpdate', getFullState(room));
                return;
            }
            // CORREÇÃO: Lógica de gmSwitchesMode e gmChoosesAdventureType revisada
            if (action.type === 'gmSwitchesMode') {
                if (room.activeMode === 'adventure') {
                    if (room.gameModes.adventure) {
                        cachePlayerStats(room);
                        room.adventureCache = JSON.parse(JSON.stringify(room.gameModes.adventure));
                    }
                    if (!room.gameModes.theater) {
                        room.gameModes.theater = createNewTheaterState(lobbyState.gmId, 'cenarios externos/externo (1).png');
                    }
                    room.activeMode = 'theater';
                } else if (room.activeMode === 'theater') {
                    if (room.adventureCache) {
                        socket.emit('promptForAdventureType');
                        shouldUpdate = false;
                    } else {
                        room.gameModes.adventure = createNewAdventureState(lobbyState.gmId, lobbyState.connectedPlayers);
                        room.activeMode = 'adventure';
                    }
                }
            }
            if (action.type === 'gmChoosesAdventureType') {
                if (action.choice === 'continue' && room.adventureCache) {
                    room.gameModes.adventure = room.adventureCache;
                } else {
                    room.adventureCache = null; // Limpa o cache se começar uma nova
                    room.gameModes.adventure = createNewAdventureState(lobbyState.gmId, lobbyState.connectedPlayers);
                }
                room.activeMode = 'adventure';
            }
        }
        
        if (action.type === 'playerSelectsCharacter') {
            const playerInfo = lobbyState.connectedPlayers[socket.id];
            if (!playerInfo) return;
            if (lobbyState.unavailableCharacters.includes(action.character.nome)) {
                 const mySelection = playerInfo.selectedCharacter;
                 if (!mySelection || mySelection.nome !== action.character.nome) {
                     socket.emit('characterUnavailable', action.character.nome);
                     return;
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

        switch (room.activeMode) {
            case 'lobby':
                if (isGm) {
                    if (action.type === 'gmStartsAdventure') {
                        if(room.adventureCache) room.adventureCache = null;
                        room.gameModes.adventure = createNewAdventureState(activeState.gmId, activeState.connectedPlayers);
                        room.activeMode = 'adventure';
                    } else if (action.type === 'gmStartsTheater') {
                         if (!room.gameModes.theater) {
                            room.gameModes.theater = createNewTheaterState(activeState.gmId, 'cenarios externos/externo (1).png');
                        }
                        room.activeMode = 'theater';
                    }
                }
                break;

            case 'adventure':
                const adventureState = activeState;
                if (!adventureState) break;
                const actor = action.actorKey ? getFighter(adventureState, action.actorKey) : null;
                const canControl = actor && ((isGm && adventureState.fighters.npcs[actor.id]) || (socket.id === actor.id));
                
                switch (action.type) {
                    case 'gmDecidesOnAdmission':
                        if (isGm && action.playerId && adventureState.waitingPlayers[action.playerId]) {
                            const character = adventureState.waitingPlayers[action.playerId];
                            if (action.admitted) {
                                const newPlayerId = action.playerId;
                                
                                io.to(newPlayerId).emit('assignRole', { role: 'player', playerKey: newPlayerId, roomId: roomId });
                                adventureState.fighters.players[newPlayerId] = createNewFighterState({id: newPlayerId, ...character});
                                
                                if (adventureState.phase === 'battle') {
                                    adventureState.turnOrder.push(newPlayerId);
                                } 
                                
                                logMessage(adventureState, `${character.nome} entrou na batalha!`);
                                delete adventureState.waitingPlayers[action.playerId];
                            } else {
                                delete adventureState.waitingPlayers[action.playerId]; // Remove da lista de espera
                                logMessage(adventureState, `O Mestre decidiu que ${character.nome} aguardará.`);
                            }
                        }
                        break;
                    case 'gmConfirmParty':
                        if (isGm && adventureState.phase === 'party_setup' && action.playerStats) {
                            action.playerStats.forEach(stats => {
                                if (adventureState.fighters.players[stats.id]) {
                                    const res = Math.max(1, stats.res);
                                    Object.assign(adventureState.fighters.players[stats.id], {
                                        agi: stats.agi, res: res, hpMax: res * 5, hp: res * 5
                                    });
                                }
                            });
                            cachePlayerStats(room);
                            adventureState.phase = 'npc_setup';
                            logMessage(adventureState, 'GM confirmou o grupo. Prepare o encontro!');
                        }
                        break;
                    case 'gmStartBattle':
                        if (isGm && adventureState.phase === 'npc_setup' && action.npcs) {
                             if (action.npcs.length === 0) { shouldUpdate = false; break; }
                             // CORREÇÃO: Atribui slots fixos aos NPCs
                            action.npcs.forEach((npcData, i) => {
                                const npcObj = ALL_NPCS[npcData.name] || {};
                                adventureState.fighters.npcs[npcData.id] = createNewFighterState({ 
                                    ...npcData, 
                                    id: npcData.id, 
                                    scale: npcObj.scale || 1.0 
                                }, i); // 'i' se torna o 'slot'
                            });
                            adventureState.phase = 'initiative_roll';
                            logMessage(adventureState, 'Inimigos em posição! Rolem as iniciativas!');
                        }
                        break;
                    // CORREÇÃO: Lógica para adicionar monstro em um slot específico
                    case 'gmAddMonster':
                        if(isGm && adventureState.phase === 'battle' && action.npc && action.slot !== undefined) {
                            const occupiedSlots = Object.values(adventureState.fighters.npcs).filter(n => n.status === 'active').map(n => n.slot);
                            if (!occupiedSlots.includes(action.slot)) {
                                const npcData = action.npc;
                                const npcId = `npc-${Date.now()}`;
                                const npcObj = ALL_NPCS[npcData.name] || {};
                                adventureState.fighters.npcs[npcId] = createNewFighterState({
                                    ...npcData,
                                    id: npcId,
                                    scale: npcObj.scale || 1.0
                                }, action.slot); // Usa o slot fornecido
                                adventureState.turnOrder.push(npcId);
                                logMessage(adventureState, `${npcData.name} foi adicionado à batalha no slot ${action.slot + 1}!`);
                            }
                        }
                        break;
                    case 'roll_initiative':
                        if (adventureState.phase === 'initiative_roll') {
                            if (action.isGmRoll && isGm) {
                                Object.values(adventureState.fighters.npcs).forEach(npc => {
                                    if (npc.status === 'active' && !adventureState.initiativeRolls[npc.id]) {
                                        adventureState.initiativeRolls[npc.id] = rollD6();
                                    }
                                });
                            } else if (!action.isGmRoll && adventureState.fighters.players[socket.id] && !adventureState.initiativeRolls[socket.id]) {
                                adventureState.initiativeRolls[socket.id] = rollD6();
                            }
                            const activeFighters = [...Object.values(adventureState.fighters.players), ...Object.values(adventureState.fighters.npcs)].filter(f => f.status === 'active');
                            if (activeFighters.every(f => adventureState.initiativeRolls[f.id])) {
                                startBattle(adventureState);
                            }
                        }
                        break;
                    case 'attack':
                        if (adventureState.phase === 'battle' && action.attackerKey === adventureState.activeCharacterKey) {
                             const attacker = getFighter(adventureState, action.attackerKey);
                             const isNpcTurn = !!adventureState.fighters.npcs[attacker.id];
                             if ((isGm && isNpcTurn) || (!isNpcTurn && socket.id === action.attackerKey)) {
                                 executeAttack(adventureState, roomId, action.attackerKey, action.targetKey);
                                 shouldUpdate = false; 
                             }
                        }
                        break;
                    case 'flee':
                        if (adventureState.phase === 'battle' && action.actorKey === adventureState.activeCharacterKey && canControl) {
                            const fighter = getFighter(adventureState, action.actorKey);
                            if (fighter) {
                                fighter.status = 'fled';
                                logMessage(adventureState, `${fighter.nome} fugiu da batalha!`);
                                // Não remove mais da turnOrder, o advanceTurn vai ignorá-lo
                                checkGameOver(adventureState);
                                if (!adventureState.winner) {
                                    advanceTurn(adventureState);
                                }
                            }
                        }
                        break;
                    case 'end_turn':
                        if (adventureState.phase === 'battle' && action.actorKey === adventureState.activeCharacterKey && canControl) {
                            advanceTurn(adventureState);
                        }
                        break;
                }
                break;

            case 'theater':
                 if (isGm && activeState && activeState.scenarioStates && activeState.currentScenario) {
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