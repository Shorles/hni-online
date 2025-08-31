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
// NOVO: Carrega as regras e magias dos arquivos JSON
let GAME_RULES = {};
let ALL_SPELLS = {};

const MAX_PLAYERS = 4;
const MAX_NPCS = 5; 

try {
    const charactersData = fs.readFileSync('characters.json', 'utf8');
    const characters = JSON.parse(charactersData);
    PLAYABLE_CHARACTERS = characters.players || [];
    ALL_NPCS = characters.npcs || {}; 

    // NOVO: Carregando regras e magias
    const rulesData = fs.readFileSync('public/rules.json', 'utf8');
    GAME_RULES = JSON.parse(rulesData);
    const spellsData = fs.readFileSync('public/spells.json', 'utf8');
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

// --- NOVAS FUNÇÕES DE UTILIDADE PARA COMBATE ---
function rollD20() { return Math.floor(Math.random() * 20) + 1; }
function rollDice(diceString) {
    if (!diceString || typeof diceString !== 'string') return 0;
    const parts = diceString.match(/(\d+)d(\d+)([+-]\d+)?/i);
    if (!parts) return 0;
    
    const numDice = parseInt(parts[1], 10);
    const diceSides = parseInt(parts[2], 10);
    const modifier = parts[3] ? parseInt(parts[3], 10) : 0;

    let total = 0;
    for (let i = 0; i < numDice; i++) {
        total += Math.floor(Math.random() * diceSides) + 1;
    }
    return total + modifier;
}

function createNewLobbyState(gmId) { return { mode: 'lobby', phase: 'waiting_players', gmId: gmId, connectedPlayers: {}, unavailableCharacters: [], log: [{ text: "Lobby criado. Aguardando jogadores..." }], }; }

function createNewAdventureState(gmId, connectedPlayers) {
    const adventureState = {
        mode: 'adventure', fighters: { players: {}, npcs: {} }, npcSlots: new Array(MAX_NPCS).fill(null), 
        customPositions: {},
        winner: null, reason: null, currentRound: 1,
        activeCharacterKey: null, turnOrder: [], turnIndex: 0, initiativeRolls: {}, 
        phase: 'npc_setup',
        scenario: 'mapas/cenarios externos/externo (1).png',
        gmId: gmId, log: [{ text: "Aguardando o Mestre preparar o encontro..." }],
        waitingPlayers: {} 
    };
    for (const sId in connectedPlayers) {
        const playerData = connectedPlayers[sId];
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

// MODIFICADO: Função reescrita para usar as regras do Almara e customização de NPCs
function createNewFighterState(data) {
    const fighter = {
        id: data.id,
        nome: data.name || data.tokenName,
        img: data.tokenImg || data.img,
        status: 'active',
        scale: data.scale !== undefined ? parseFloat(data.scale) : 1.0,
        isPlayer: !!data.isPlayer,
        defesa: 10, // Defesa base antes da iniciativa
        pa: 3,     // Pontos de Ação
        activeEffects: [],
    };

    if (fighter.isPlayer && data.finalAttributes) {
        // --- LÓGICA DO ALMARA RPG PARA JOGADORES ---
        const constituicao = data.finalAttributes.constituicao;
        const mente = data.finalAttributes.mente;
        
        fighter.hpMax = 20 + (constituicao * 5);
        fighter.mahouMax = 10 + (mente * 5);
        fighter.hp = data.hp !== undefined ? data.hp : fighter.hpMax;
        fighter.mahou = data.mahou !== undefined ? data.mahou : fighter.mahouMax;

        fighter.sheet = data; // Armazena a ficha completa

    } else {
        // --- LÓGICA PARA NPCS (com suporte a customização do GM) ---
        if (data.customStats) {
            // Usa os stats customizados pelo GM
            fighter.hpMax = data.customStats.hp || 10;
            fighter.hp = data.customStats.hp || 10;
            fighter.mahouMax = data.customStats.mahou || 10;
            fighter.mahou = data.customStats.mahou || 10;
            fighter.agilidade = data.customStats.agilidade || 0;
            fighter.protecao = data.customStats.protecao || 0;
            // BTA/BTD/BTM serão armazenados para uso direto
            fighter.customStats = data.customStats; 
        } else {
            // Fallback para NPCs não customizados (lógica antiga simplificada)
            fighter.agilidade = 2;
            fighter.protecao = 0;
            fighter.hpMax = 15;
            fighter.hp = 15;
            fighter.mahouMax = 10;
            fighter.mahou = 10;
        }

        fighter.isMultiPart = !!data.isMultiPart;
        if (fighter.isMultiPart && data.parts) {
            fighter.parts = data.parts.map(partData => {
                const partHpMax = 10; // Simplificado por enquanto
                return { key: partData.key, name: partData.name, hpMax: partHpMax, hp: partHpMax, status: 'active' };
            });
            fighter.hpMax = fighter.parts.reduce((sum, part) => sum + part.hpMax, 0);
            fighter.hp = fighter.hpMax;
        }
    }
     if (fighter.hp <= 0) {
        fighter.status = 'down';
     }

    return fighter;
}

function cachePlayerStats(room) {
    if (room.activeMode !== 'adventure' || !room.gameModes.adventure) return;
    const adventureState = room.gameModes.adventure;
    const lobbyState = room.gameModes.lobby;

    Object.values(adventureState.fighters.players).forEach(playerFighter => {
        const lobbyPlayer = lobbyState.connectedPlayers[playerFighter.id];
        if (lobbyPlayer && lobbyPlayer.characterSheet) {
            if (playerFighter.status !== 'fled') {
                 lobbyPlayer.characterSheet.hp = playerFighter.hp;
                 lobbyPlayer.characterSheet.mahou = playerFighter.mahou;
            } else {
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

// --- NOVAS FUNÇÕES DE CÁLCULO DE COMBATE ---

function getFighterAttribute(fighter, attr) {
    let baseValue = 0;
    if (fighter.isPlayer) {
        baseValue = fighter.sheet.finalAttributes[attr] || 0;
    } else {
        // Para NPCs, usamos um valor base ou customizado.
        baseValue = fighter[attr] || 0; 
    }
    // TODO: Adicionar lógica para aplicar efeitos de buffs/debuffs de `fighter.activeEffects`
    return baseValue;
}

function calculateBTA(fighter, weaponKey = 'weapon1') {
    if (fighter.customStats) return fighter.customStats.bta || 0; // NPC customizado

    const agilidade = getFighterAttribute(fighter, 'agilidade');
    const weaponType = fighter.sheet.equipment[weaponKey].type;
    const weaponData = GAME_RULES.weapons[weaponType];
    
    let bta = agilidade + (weaponData.bta || 0);

    // TODO: Adicionar penalidades (ex: arma 2H com 1 mão)
    return bta;
}

function calculateBTD(fighter, weaponKey = 'weapon1') {
    if (fighter.customStats) return fighter.customStats.btd || 0; // NPC customizado

    const forca = getFighterAttribute(fighter, 'forca');
    const weaponType = fighter.sheet.equipment[weaponKey].type;
    const weaponData = GAME_RULES.weapons[weaponType];
    
    let btd = forca + (weaponData.btd || 0);
    return btd;
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
        return;
    }
    
    let currentIndex = activeTurnOrder.indexOf(state.activeCharacterKey);
    let nextIndex = (currentIndex + 1) % activeTurnOrder.length;

    state.activeCharacterKey = activeTurnOrder[nextIndex];
    const activeFighter = getFighter(state, state.activeCharacterKey);
    
    // Reseta PA no início do turno
    activeFighter.pa = 3;

    logMessage(state, `É a vez de ${activeFighter.nome}.`, 'turn');
}

// MODIFICADO: Lógica de ataque completamente nova
function executeAttack(state, roomId, attackerKey, targetKey, weaponChoice, targetPartKey) {
    const attacker = getFighter(state, attackerKey);
    const target = getFighter(state, targetKey);
    if (!attacker || !target || attacker.status !== 'active' || target.status !== 'active') return;

    // Custo de PA
    const paCost = (weaponChoice === 'dual') ? 2 : 2; // Simplificado por enquanto
    if (attacker.pa < paCost) {
        logMessage(state, `${attacker.nome} não tem Pontos de Ação suficientes!`, 'miss');
        io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
        return;
    }
    attacker.pa -= paCost;

    const performSingleAttack = (weaponKey, isDualAttack) => {
        const hitRoll = rollD20();
        const bta = calculateBTA(attacker, weaponKey);
        const attackRoll = hitRoll + bta;
        const weaponType = attacker.isPlayer ? attacker.sheet.equipment[weaponKey].type : 'Desarmado';
        const weaponData = GAME_RULES.weapons[weaponType];
        
        logMessage(state, `${attacker.nome} ataca ${target.nome} com ${weaponType}. Rolagem: ${hitRoll} + ${bta} (BTA) = ${attackRoll} vs Defesa ${target.defesa}.`, 'info');

        if (hitRoll === 1) {
            logMessage(state, `Erro Crítico! ${attacker.nome} erra o ataque.`, 'miss');
            return { hit: false, damage: 0 };
        }
        if (hitRoll === 20 || attackRoll >= target.defesa) {
            const isCrit = hitRoll === 20;
            if(isCrit) logMessage(state, `Acerto Crítico!`, 'crit');

            const btd = calculateBTD(attacker, weaponKey);
            const damageRoll = rollDice(weaponData.damage);
            const critDamage = isCrit ? damageRoll : 0; // Dano extra do crítico é o valor do dado rolado novamente
            let totalDamage = damageRoll + critDamage + btd;
            
            if (isDualAttack) totalDamage -= 1; // Penalidade de dano de arma dupla

            const targetProtection = getFighterAttribute(target, 'protecao');
            const finalDamage = Math.max(1, totalDamage - targetProtection);
            
            let logText = `${attacker.nome} acerta ${target.nome} e causa ${finalDamage} de dano! (Dano: ${damageRoll}${isCrit ? `+${critDamage}(C)` : ''} + ${btd}(BTD) - ${targetProtection}(Prot))`;

            if (target.isMultiPart && targetPartKey) {
                const part = target.parts.find(p => p.key === targetPartKey);
                if (part && part.status === 'active') {
                    part.hp = Math.max(0, part.hp - finalDamage);
                    target.hp = Math.max(0, target.hp - finalDamage);
                    logMessage(state, logText.replace('acerta', `acerta a ${part.name} de`), 'hit');

                    if (part.hp === 0) {
                        part.status = 'down';
                        logMessage(state, `A ${part.name} de ${target.nome} foi destruída!`, 'defeat');
                        if (target.parts.every(p => p.status === 'down')) {
                            target.status = 'down';
                            logMessage(state, `${target.nome} foi derrotado!`, 'defeat');
                        }
                    }
                }
            } else {
                target.hp = Math.max(0, target.hp - finalDamage);
                logMessage(state, logText, 'hit');
                if (target.hp === 0) {
                    target.status = 'down';
                    logMessage(state, `${target.nome} foi derrotado!`, 'defeat');
                }
            }
            return { hit: true, damage: finalDamage };
        } else {
            logMessage(state, `${attacker.nome} erra o ataque!`, 'miss');
            return { hit: false, damage: 0 };
        }
    };
    
    if (weaponChoice === 'dual') {
        performSingleAttack('weapon1', true);
        performSingleAttack('weapon2', true);
    } else {
        performSingleAttack(weaponChoice, false);
    }

    checkGameOver(state);
    if (state.winner) {
        cachePlayerStats(games[roomId]);
    }

    // A atualização será enviada após o timeout para o próximo turno
    setTimeout(() => {
        if (!state.winner) {
            advanceTurn(state);
        }
        io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
    }, 1500);
}


function startBattle(state) {
    Object.values(state.fighters.players).forEach(p => {
        if (p.status !== 'down') p.status = 'active';
    });

    // MODIFICADO: Ordena pela iniciativa (maior primeiro) e usa agilidade como desempate
    state.turnOrder = Object.values(state.fighters.players).concat(Object.values(state.fighters.npcs))
        .filter(f => f.status === 'active')
        .sort((a, b) => {
            const rollA = state.initiativeRolls[a.id] || 0;
            const rollB = state.initiativeRolls[b.id] || 0;
            if (rollB !== rollA) return rollB - rollA;
            return getFighterAttribute(b, 'agilidade') - getFighterAttribute(a, 'agilidade');
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
                    case 'gmSetsNpcInSlot':
                        if (isGm && adventureState.phase === 'battle' && action.npcData && action.slotIndex !== undefined) {
                            const slotIndex = parseInt(action.slotIndex, 10);
                            if (slotIndex >= 0 && slotIndex < MAX_NPCS) {
                                const oldNpcId = adventureState.npcSlots[slotIndex];
                                if (oldNpcId) delete adventureState.fighters.npcs[oldNpcId];
                                
                                const newNpcId = `npc-${Date.now()}`;
                                const npcObj = ALL_NPCS[action.npcData.name] || {};
                                adventureState.fighters.npcs[newNpcId] = createNewFighterState({
                                    id: newNpcId, ...action.npcData, isMultiPart: npcObj.isMultiPart, parts: npcObj.parts
                                });
                                adventureState.npcSlots[slotIndex] = newNpcId;
                                if (!adventureState.turnOrder.includes(newNpcId)) adventureState.turnOrder.push(newNpcId);
                                logMessage(adventureState, `${action.npcData.name} entrou na batalha!`, 'info');
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
                                    if (!adventureState.winner) advanceTurn(adventureState);
                                    checkGameOver(adventureState);
                                    io.to(roomId).emit('gameUpdate', getFullState(room));
                                }, 1200); 
                            }
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
                                            ...npcData, scale: npcObj.scale || 1.0, isMultiPart: npcObj.isMultiPart, parts: npcObj.parts
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
                            const rollInitiativeFor = (fighter) => {
                                if (fighter && fighter.status === 'active' && !adventureState.initiativeRolls[fighter.id]) {
                                    const roll = rollD20();
                                    const agilidade = getFighterAttribute(fighter, 'agilidade');
                                    const initiative = roll + agilidade;
                                    adventureState.initiativeRolls[fighter.id] = initiative;
                                    fighter.defesa = initiative; // Regra: Iniciativa define a Defesa
                                    logMessage(adventureState, `${fighter.nome} rolou ${initiative} para iniciativa (Dado: ${roll} + Agi: ${agilidade}).`, 'info');
                                }
                            };

                            if (action.isGmRoll && isGm) {
                                Object.values(adventureState.fighters.npcs).forEach(rollInitiativeFor);
                            } else if (!action.isGmRoll && adventureState.fighters.players[socket.id]) {
                                rollInitiativeFor(getFighter(adventureState, socket.id));
                            }
                            
                            const allFighters = [...Object.values(adventureState.fighters.players), ...Object.values(adventureState.fighters.npcs)];
                            if (allFighters.filter(f => f.status === 'active').every(f => adventureState.initiativeRolls[f.id])) {
                                startBattle(adventureState);
                            }
                        }
                        break;
                    case 'attack':
                        if (adventureState.phase === 'battle' && action.attackerKey === adventureState.activeCharacterKey) {
                             const attacker = getFighter(adventureState, action.attackerKey);
                             const isNpcTurn = !!adventureState.fighters.npcs[attacker.id];
                             if ((isGm && isNpcTurn) || (!isNpcTurn && socket.id === action.attackerKey)) {
                                 executeAttack(adventureState, roomId, action.attackerKey, action.targetKey, action.weaponChoice, action.targetPartKey);
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
                     // ... (lógica do modo teatro permanece a mesma)
                 }
                break;
        }
        if (shouldUpdate) {
            io.to(roomId).emit('gameUpdate', getFullState(room));
        }
    });

    socket.on('disconnect', () => {
        // ... (lógica de disconnect permanece a mesma)
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));