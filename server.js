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

// MODIFICADO: Função ajustada para usar a nova ficha de personagem
function createNewAdventureState(gmId, connectedPlayers) {
    const adventureState = {
        mode: 'adventure', fighters: { players: {}, npcs: {} }, npcSlots: new Array(MAX_NPCS).fill(null), 
        customPositions: {},
        winner: null, reason: null, currentRound: 1,
        activeCharacterKey: null, turnOrder: [], turnIndex: 0, initiativeRolls: {}, 
        phase: 'npc_setup', // Pula a fase 'party_setup' que se tornou obsoleta para players
        scenario: 'mapas/cenarios externos/externo (1).png',
        gmId: gmId, log: [{ text: "Aguardando o Mestre preparar o encontro..." }],
        waitingPlayers: {} 
    };
    for (const sId in connectedPlayers) {
        const playerData = connectedPlayers[sId];
        // NOVO: Verifica se o personagem foi finalizado antes de adicioná-lo
        if (playerData.characterFinalized && playerData.role === 'player') {
            const newFighter = createNewFighterState({ 
                id: sId, 
                isPlayer: true,
                ...playerData.characterSheet,
            });
            adventureState.fighters.players[sId] = newFighter;
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

// MODIFICADO: Função completamente reescrita para usar as regras do Almara RPG para players e manter a lógica antiga para NPCs
function createNewFighterState(data) {
    const fighter = {
        id: data.id,
        nome: data.name || data.tokenName,
        img: data.tokenImg || data.img,
        status: 'active',
        scale: data.scale !== undefined ? parseFloat(data.scale) : 1.0,
        isPlayer: !!data.isPlayer
    };

    if (fighter.isPlayer && data.baseAttributes) {
        // --- LÓGICA DO ALMARA RPG PARA JOGADORES ---
        // TODO: Futuramente, calcular os atributos finais aqui no servidor para segurança. Por enquanto, confiamos no cliente.
        const constituicao = data.finalAttributes ? data.finalAttributes.constituicao : data.baseAttributes.constituicao;
        const mente = data.finalAttributes ? data.finalAttributes.mente : data.baseAttributes.mente;
        
        fighter.hpMax = 20 + (constituicao * 5);
        fighter.mahouMax = 10 + (mente * 5);

        // Se o personagem já tem HP/Mahou de uma batalha anterior, usa esses valores.
        fighter.hp = data.hp !== undefined ? data.hp : fighter.hpMax;
        fighter.mahou = data.mahou !== undefined ? data.mahou : fighter.mahouMax;

        fighter.agilidade = data.finalAttributes ? data.finalAttributes.agilidade : data.baseAttributes.agilidade;
        fighter.protecao = data.finalAttributes ? data.finalAttributes.protecao : data.baseAttributes.protecao;
        fighter.sheet = data; // Armazena a ficha completa no combatente

    } else {
        // --- LÓGICA ANTIGA/SIMPLIFICADA PARA NPCS ---
        const agi = data.agi !== undefined ? parseInt(data.agi, 10) : 2;
        fighter.agi = agi; // Mantendo 'agi' para compatibilidade com a iniciativa antiga
        fighter.agilidade = agi; // Usando o novo nome de atributo
        fighter.protecao = data.protecao || 0; // NPCs precisam de proteção para a nova fórmula de dano

        fighter.isMultiPart = !!data.isMultiPart;
        fighter.parts = [];

        if (fighter.isMultiPart && data.parts) {
            fighter.parts = data.parts.map(partData => {
                const partRes = partData.res !== undefined ? parseInt(partData.res, 10) : 1;
                const partHpMax = partRes * 5;
                return {
                    key: partData.key, name: partData.name, res: partRes,
                    hpMax: partHpMax, hp: partHpMax, status: 'active'
                };
            });
            fighter.hpMax = fighter.parts.reduce((sum, part) => sum + part.hpMax, 0);
            fighter.hp = fighter.hpMax;
        } else {
            const res = data.res !== undefined ? parseInt(data.res, 10) : 3;
            fighter.res = res;
            fighter.hpMax = res * 5;
            fighter.hp = data.hp !== undefined ? data.hp : fighter.hpMax;
        }
    }
     if (fighter.hp <= 0) {
        fighter.status = 'down';
     }

    return fighter;
}

// MODIFICADO: Salva o HP e Mahou de volta na ficha do jogador no lobby
function cachePlayerStats(room) {
    if (room.activeMode !== 'adventure' || !room.gameModes.adventure) return;
    const adventureState = room.gameModes.adventure;
    const lobbyState = room.gameModes.lobby;

    Object.values(adventureState.fighters.players).forEach(playerFighter => {
        const lobbyPlayer = lobbyState.connectedPlayers[playerFighter.id];
        if (lobbyPlayer && lobbyPlayer.characterSheet) {
            if (playerFighter.status !== 'fled') {
                 // Salva o HP e Mahou atuais na ficha do lobby
                 lobbyPlayer.characterSheet.hp = playerFighter.hp;
                 lobbyPlayer.characterSheet.mahou = playerFighter.mahou;
            } else {
                // Se fugiu, reseta para o máximo na próxima batalha
                delete lobbyPlayer.characterSheet.hp;
                delete lobbyPlayer.characterSheet.mahou;
            }
        }
    });
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
    const activeTurnOrder = state.turnOrder.filter(id => getFighter(state, id)?.status === 'active');

    if (activeTurnOrder.length === 0) {
        checkGameOver(state);
        if (!state.winner) {
            state.winner = 'draw';
            state.reason = 'Nenhum combatente ativo restante.';
            logMessage(state, 'Fim da batalha! Nenhum combatente ativo restante.', 'game_over');
        }
        return;
    }
    
    let currentIndex = activeTurnOrder.indexOf(state.activeCharacterKey);
    let nextIndex = (currentIndex + 1) % activeTurnOrder.length;

    state.activeCharacterKey = activeTurnOrder[nextIndex];
    const activeFighter = getFighter(state, state.activeCharacterKey);
    logMessage(state, `É a vez de ${activeFighter.nome}.`, 'turn');
}

function executeAttack(state, roomId, attackerKey, targetKey, targetPartKey) {
    const attacker = getFighter(state, attackerKey);
    const target = getFighter(state, targetKey);
    if (!attacker || !target || attacker.status !== 'active' || target.status !== 'active') return;
    
    const hit = true;
    let damageDealt = 0;
    
    if (hit) {
        damageDealt = ATTACK_MOVE.damage;
        
        if (target.isMultiPart && targetPartKey) {
            const part = target.parts.find(p => p.key === targetPartKey);
            if (part && part.status === 'active') {
                part.hp = Math.max(0, part.hp - damageDealt);
                target.hp = Math.max(0, target.hp - damageDealt);
                logMessage(state, `${attacker.nome} ataca a ${part.name} de ${target.nome} e causa ${damageDealt} de dano!`, 'hit');

                if (part.hp === 0) {
                    part.status = 'down';
                    logMessage(state, `A ${part.name} de ${target.nome} foi destruída!`, 'defeat');
                    const allPartsDown = target.parts.every(p => p.status === 'down');
                    if (allPartsDown) {
                        target.status = 'down';
                        logMessage(state, `${target.nome} foi derrotado!`, 'defeat');
                    }
                }
            } else {
                 logMessage(state, `${attacker.nome} ataca uma parte já destruída de ${target.nome}!`, 'miss');
                 damageDealt = 0;
            }
        } else {
            target.hp = Math.max(0, target.hp - damageDealt);
            logMessage(state, `${attacker.nome} ataca ${target.nome} e causa ${damageDealt} de dano!`, 'hit');
            if (target.hp === 0) {
                target.status = 'down';
                logMessage(state, `${target.nome} foi derrotado!`, 'defeat');
            }
        }

        checkGameOver(state);
        if (state.winner) {
             cachePlayerStats(games[roomId]);
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
    Object.values(state.fighters.players).forEach(p => {
        if (p.status !== 'down') p.status = 'active';
    });

    state.turnOrder = Object.values(state.fighters.players).concat(Object.values(state.fighters.npcs))
        .filter(f => f.status === 'active')
        .sort((a, b) => {
            const rollA = state.initiativeRolls[a.id] || 0;
            const rollB = state.initiativeRolls[b.id] || 0;
            if (rollB !== rollA) return rollB - rollA;
            // MODIFICADO: Usa 'agilidade' como critério de desempate
            return b.agilidade - a.agilidade;
        }).map(f => f.id);
    state.phase = 'battle';
    state.activeCharacterKey = null;
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
                name, img: `images/lutadores/${name}.png`, scale: ALL_NPCS[name].scale || 1.0,
                isMultiPart: !!ALL_NPCS[name].isMultiPart, parts: ALL_NPCS[name].parts || []
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
        // NOVO: Estrutura de dados do jogador para o Almara RPG
        lobbyState.connectedPlayers[socket.id] = { 
            role: finalRole, 
            characterName: null, 
            characterSheet: null,
            characterFinalized: false 
        };
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
                if (room.activeMode === 'adventure') {
                    cachePlayerStats(room); 
                    room.adventureCache = JSON.parse(JSON.stringify(room.gameModes.adventure));
                }
                room.activeMode = 'lobby';
                io.to(roomId).emit('gameUpdate', getFullState(room));
                return;
            }
            if (action.type === 'gmSwitchesMode') {
                const targetMode = room.activeMode === 'adventure' ? 'theater' : 'adventure';
                
                if (room.activeMode === 'adventure') {
                    cachePlayerStats(room); 
                    room.adventureCache = JSON.parse(JSON.stringify(room.gameModes.adventure));
                }

                if (targetMode === 'adventure') {
                    if (room.adventureCache) {
                        socket.emit('promptForAdventureType');
                        shouldUpdate = false; 
                    } else {
                        room.gameModes.adventure = createNewAdventureState(lobbyState.gmId, lobbyState.connectedPlayers);
                        room.activeMode = 'adventure';
                    }
                } else { 
                     if (!room.gameModes.theater) {
                        room.gameModes.theater = createNewTheaterState(lobbyState.gmId, 'cenarios externos/externo (1).png');
                     }
                     room.activeMode = 'theater';
                }
            }
            if (action.type === 'gmChoosesAdventureType') {
                if (action.choice === 'continue' && room.adventureCache) {
                    room.gameModes.adventure = room.adventureCache;
                    room.adventureCache = null; 
                } else { // 'new'
                    const newAdventure = createNewAdventureState(lobbyState.gmId, lobbyState.connectedPlayers);
                    logMessage(newAdventure, 'Iniciando um novo encontro com o grupo existente.');
                    room.gameModes.adventure = newAdventure;
                }
                room.activeMode = 'adventure';
            }
        }
        
        // NOVO: Lógica para receber a ficha finalizada do jogador
        if (action.type === 'playerFinalizesCharacter') {
            const playerInfo = lobbyState.connectedPlayers[socket.id];
            if (playerInfo) {
                playerInfo.characterSheet = action.characterData;
                playerInfo.characterName = action.characterData.name;
                playerInfo.characterFinalized = true;
                logMessage(lobbyState, `Jogador ${playerInfo.characterName} está pronto!`);
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
                    case 'gmMovesFighter':
                        if (isGm && action.fighterId && action.position) {
                            adventureState.customPositions[action.fighterId] = action.position;
                            io.to(roomId).emit('fighterMoved', { fighterId: action.fighterId, position: action.position });
                            shouldUpdate = false;
                        }
                        break;
                    case 'gmSetsNpcInSlot':
                        if (isGm && adventureState.phase === 'battle' && action.npcData && action.slotIndex !== undefined) {
                            const slotIndex = parseInt(action.slotIndex, 10);
                            if (slotIndex >= 0 && slotIndex < MAX_NPCS) {
                                const oldNpcId = adventureState.npcSlots[slotIndex];
                                if (oldNpcId) {
                                    delete adventureState.fighters.npcs[oldNpcId];
                                }
                                
                                const newNpcId = `npc-${Date.now()}`;
                                const npcObj = ALL_NPCS[action.npcData.name] || {};
                                adventureState.fighters.npcs[newNpcId] = createNewFighterState({
                                    id: newNpcId,
                                    ...action.npcData,
                                    isMultiPart: npcObj.isMultiPart,
                                    parts: npcObj.parts
                                });
                                adventureState.npcSlots[slotIndex] = newNpcId;

                                if (!adventureState.turnOrder.includes(newNpcId)) {
                                     adventureState.turnOrder.push(newNpcId);
                                }
                                logMessage(adventureState, `${action.npcData.name} entrou na batalha no slot ${slotIndex + 1}!`, 'info');
                                checkGameOver(adventureState);
                            }
                        }
                        break;
                    case 'flee':
                        if (adventureState.phase === 'battle' && action.actorKey === adventureState.activeCharacterKey && canControl) {
                            const fighter = getFighter(adventureState, action.actorKey);
                            if (fighter) {
                                fighter.status = 'fled';
                                logMessage(adventureState, `${fighter.nome} fugiu da batalha!`, 'miss');
                                
                                io.to(roomId).emit('fleeResolved', { actorKey: action.actorKey });
                                shouldUpdate = false; 
                                
                                setTimeout(() => {
                                    if (!adventureState.winner) {
                                        advanceTurn(adventureState);
                                    }
                                    checkGameOver(adventureState);
                                    io.to(roomId).emit('gameUpdate', getFullState(room));
                                }, 1200); 
                            }
                        }
                        break;
                    // Lógica de admissão mantida para jogadores que entram no meio da batalha (a ser revisada)
                    case 'gmDecidesOnAdmission':
                        if (isGm && action.playerId && adventureState.waitingPlayers[action.playerId]) {
                            const character = adventureState.waitingPlayers[action.playerId];
                            if (action.admitted) {
                                const newPlayerId = action.playerId;
                                io.to(newPlayerId).emit('assignRole', { role: 'player', playerKey: newPlayerId, roomId: roomId });
                                // Esta parte precisará ser adaptada para usar a ficha completa
                                adventureState.fighters.players[newPlayerId] = createNewFighterState({id: newPlayerId, ...character});
                                if (adventureState.phase === 'battle') {
                                    adventureState.turnOrder.push(newPlayerId);
                                } 
                                logMessage(adventureState, `${character.nome} entrou na batalha!`);
                                delete adventureState.waitingPlayers[action.playerId];
                            } else {
                                logMessage(adventureState, `O Mestre decidiu que ${character.nome} aguardará.`);
                            }
                        }
                        break;
                    // Lógica obsoleta para players, mas pode ser usada para NPCs no futuro.
                    case 'gmConfirmParty':
                        if (isGm && adventureState.phase === 'party_setup' && action.playerStats) {
                            // Este bloco não será mais executado para players normais.
                        }
                        break;
                    case 'gmStartBattle':
                        if (isGm && adventureState.phase === 'npc_setup' && action.npcs) {
                            adventureState.fighters.npcs = {};
                            adventureState.npcSlots.fill(null);
                            adventureState.customPositions = {};
                            if (action.npcs.length > 0) {
                                action.npcs.forEach(npcWithSlot => {
                                    const { slotIndex, ...npcData } = npcWithSlot;
                                    if (slotIndex >= 0 && slotIndex < MAX_NPCS) {
                                        const npcObj = ALL_NPCS[npcData.name] || {};
                                        const newNpc = createNewFighterState({ 
                                            ...npcData, 
                                            scale: npcObj.scale || 1.0,
                                            isMultiPart: npcObj.isMultiPart,
                                            parts: npcObj.parts
                                        });
                                        adventureState.fighters.npcs[newNpc.id] = newNpc;
                                        adventureState.npcSlots[slotIndex] = newNpc.id;
                                    }
                                });
                            }
                            adventureState.phase = 'initiative_roll';
                            logMessage(adventureState, 'Inimigos em posição! Rolem as iniciativas!');
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
                            } else if (!action.isGmRoll && adventureState.fighters.players[socket.id]) {
                                const myFighter = getFighter(adventureState, socket.id);
                                if (myFighter && myFighter.status === 'active') {
                                    adventureState.initiativeRolls[socket.id] = rollD6();
                                }
                            }
                            const fightersToRollFor = [...Object.values(adventureState.fighters.players), ...Object.values(adventureState.fighters.npcs)]
                                .filter(f => f.status === 'active');

                            if (fightersToRollFor.every(f => adventureState.initiativeRolls[f.id])) {
                                startBattle(adventureState);
                            }
                        }
                        break;
                    case 'attack':
                        if (adventureState.phase === 'battle' && action.attackerKey === adventureState.activeCharacterKey) {
                             const attacker = getFighter(adventureState, action.attackerKey);
                             const isNpcTurn = !!adventureState.fighters.npcs[attacker.id];
                             if ((isGm && isNpcTurn) || (!isNpcTurn && socket.id === action.attackerKey)) {
                                 executeAttack(adventureState, roomId, action.attackerKey, action.targetKey, action.targetPartKey);
                                 shouldUpdate = false; 
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
        }
        delete room.sockets[socket.id];
        delete lobbyState.connectedPlayers[socket.id];
        const adventureState = room.gameModes.adventure;
        if (adventureState && adventureState.fighters.players[socket.id]) {
            adventureState.fighters.players[socket.id].status = 'disconnected';
            logMessage(adventureState, `${adventureState.fighters.players[socket.id].nome} foi desconectado.`);
            checkGameOver(adventureState);
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