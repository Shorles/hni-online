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
let GAME_RULES = {};
let ALL_SPELLS = {};

const MAX_PLAYERS = 4;
const MAX_NPCS = 5; 

try {
    const charactersData = fs.readFileSync('characters.json', 'utf8');
    const characters = JSON.parse(charactersData);
    PLAYABLE_CHARACTERS = characters.players || [];
    ALL_NPCS = characters.npcs || {}; 

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

// --- FUNÇÕES DE UTILIDADE PARA COMBATE ---
function rollD20() { return Math.floor(Math.random() * 20) + 1; }
function rollDice(diceString) {
    if (!diceString || typeof diceString !== 'string') return 0;
    
    // Suporte para bônus simples (ex: "1D6+1")
    let mainParts = diceString.split('+');
    let formula = mainParts[0];
    let bonus = mainParts[1] ? parseInt(mainParts[1], 10) : 0;

    const parts = formula.match(/(\d+)d(\d+)/i);
    if (!parts) return bonus; // Se for apenas um número, retorna como bônus
    
    const numDice = parseInt(parts[1], 10);
    const diceSides = parseInt(parts[2], 10);

    let total = 0;
    for (let i = 0; i < numDice; i++) {
        total += Math.floor(Math.random() * diceSides) + 1;
    }
    return total + bonus;
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

function createNewFighterState(data) {
    const fighter = {
        id: data.id,
        nome: data.name || data.tokenName,
        img: data.tokenImg || data.img,
        status: 'active',
        scale: data.scale !== undefined ? parseFloat(data.scale) : 1.0,
        isPlayer: !!data.isPlayer,
        defesa: 10,
        pa: 3,
        activeEffects: [],
    };

    if (fighter.isPlayer && data.finalAttributes) {
        const constituicao = data.finalAttributes.constituicao;
        const mente = data.finalAttributes.mente;
        
        fighter.hpMax = 20 + (constituicao * 5);
        fighter.mahouMax = 10 + (mente * 5);
        fighter.hp = data.hp !== undefined ? data.hp : fighter.hpMax;
        fighter.mahou = data.mahou !== undefined ? data.mahou : fighter.mahouMax;

        fighter.sheet = data;

    } else { // NPC
        if (data.customStats) {
            fighter.hpMax = data.customStats.hp || 10;
            fighter.hp = data.customStats.hp || 10;
            fighter.mahouMax = data.customStats.mahou || 10;
            fighter.mahou = data.customStats.mahou || 10;
            // Armazena todos os atributos
            fighter.attributes = {
                forca: data.customStats.forca || 0,
                agilidade: data.customStats.agilidade || 0,
                protecao: data.customStats.protecao || 0,
                constituicao: data.customStats.constituicao || 0,
                inteligencia: data.customStats.inteligencia || 0,
                mente: data.customStats.mente || 0,
            };
        } else {
            fighter.hpMax = 15;
            fighter.hp = 15;
            fighter.mahouMax = 10;
            fighter.mahou = 10;
            fighter.attributes = { forca: 1, agilidade: 1, protecao: 1, constituicao: 1, inteligencia: 1, mente: 1 };
        }

        fighter.isMultiPart = !!data.isMultiPart;
        if (fighter.isMultiPart && data.parts) {
            fighter.parts = data.parts.map(partData => ({ key: partData.key, name: partData.name, hpMax: 10, hp: 10, status: 'active' }));
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
    // ... (função sem alterações)
}

function logMessage(state, text, type = 'info') {
    // ... (função sem alterações)
}

function getFighter(state, key) {
    // ... (função sem alterações)
}

// --- FUNÇÕES DE CÁLCULO DE COMBATE ATUALIZADAS ---

function getFighterAttribute(fighter, attr) {
    let baseValue = 0;
    if (fighter.isPlayer) {
        baseValue = fighter.sheet.finalAttributes[attr] || 0;
    } else {
        baseValue = fighter.attributes[attr] || 0; 
    }
    // TODO: Adicionar lógica para buffs/debuffs
    return baseValue;
}

function calculateBTA(fighter, weaponKey = 'weapon1') {
    const agilidade = getFighterAttribute(fighter, 'agilidade');
    if (!fighter.isPlayer) return agilidade;

    const weaponType = fighter.sheet.equipment[weaponKey].type;
    const weaponData = GAME_RULES.weapons[weaponType];
    let bta = agilidade + (weaponData.bta || 0);
    // TODO: Adicionar penalidades (ex: arma 2H com 1 mão)
    return bta;
}

function calculateBTD(fighter, weaponKey = 'weapon1') {
    const forca = getFighterAttribute(fighter, 'forca');
    if (!fighter.isPlayer) return forca;

    const weaponType = fighter.sheet.equipment[weaponKey].type;
    const weaponData = GAME_RULES.weapons[weaponType];
    let btd = forca + (weaponData.btd || 0);
    return btd;
}

function checkGameOver(state) {
    // ... (função sem alterações)
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
    
    activeFighter.pa = 3;

    logMessage(state, `É a vez de ${activeFighter.nome}.`, 'turn');
}

function executeAttack(state, roomId, attackerKey, targetKey, weaponChoice, targetPartKey) {
    const attacker = getFighter(state, attackerKey);
    const target = getFighter(state, targetKey);
    if (!attacker || !target || attacker.status !== 'active' || target.status !== 'active') return;

    const paCost = (weaponChoice === 'dual') ? 2 : 2;
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

        let hit = false;
        if (hitRoll === 1) {
            logMessage(state, `Erro Crítico! ${attacker.nome} erra o ataque.`, 'miss');
        } else if (hitRoll === 20 || attackRoll >= target.defesa) {
            hit = true;
            const isCrit = hitRoll === 20;
            if(isCrit) logMessage(state, `Acerto Crítico!`, 'crit');

            const btd = calculateBTD(attacker, weaponKey);
            const damageRoll = rollDice(weaponData.damage);
            const critDamage = isCrit ? damageRoll : 0;
            let totalDamage = damageRoll + critDamage + btd;
            
            if (isDualAttack) totalDamage -= 1;

            const targetProtection = getFighterAttribute(target, 'protecao');
            const finalDamage = Math.max(1, totalDamage - targetProtection);
            
            let logText = `${attacker.nome} acerta ${target.nome} e causa ${finalDamage} de dano! (Dano: ${damageRoll}${isCrit ? `+${critDamage}(C)` : ''} + ${btd}(BTD) - ${targetProtection}(Prot))`;

            if (target.isMultiPart && targetPartKey) {
                // ... lógica multi-part
            } else {
                target.hp = Math.max(0, target.hp - finalDamage);
                logMessage(state, logText, 'hit');
                if (target.hp === 0) {
                    target.status = 'down';
                    logMessage(state, `${target.nome} foi derrotado!`, 'defeat');
                }
            }
        } else {
            logMessage(state, `${attacker.nome} erra o ataque!`, 'miss');
        }
        // RESTAURADO: Envia o evento para a animação
        io.to(roomId).emit('attackResolved', { attackerKey, targetKey, hit });
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
    
    // Pequeno delay para a animação acontecer antes do próximo turno
    setTimeout(() => {
        io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
    }, 1500);
}

// NOVO: Lógica para usar magia
function useSpell(state, roomId, attackerKey, targetKey, spellName) {
    const attacker = getFighter(state, attackerKey);
    const target = getFighter(state, targetKey);

    const allSpells = [...(ALL_SPELLS.grade1 || []), ...(ALL_SPELLS.grade2 || []), ...(ALL_SPELLS.grade3 || [])];
    const spell = allSpells.find(s => s.name === spellName);

    if (!attacker || !target || !spell || attacker.status !== 'active' || target.status !== 'active') return;

    if (attacker.mahou < spell.costMahou) {
        logMessage(state, `${attacker.nome} não tem Mahou suficiente para usar ${spellName}!`, 'miss');
        return;
    }
    attacker.mahou -= spell.costMahou;
    logMessage(state, `${attacker.nome} usa ${spellName} em ${target.nome}!`, 'info');

    // Lógica de Efeitos
    switch(spell.effectType) {
        case 'damage':
            const damage = rollDice(spell.effect.damageFormula);
            const finalDamage = Math.max(1, damage - getFighterAttribute(target, 'protecao'));
            target.hp = Math.max(0, target.hp - finalDamage);
            logMessage(state, `${spellName} causa ${finalDamage} de dano!`, 'hit');
            if(target.hp === 0) {
                 target.status = 'down';
                 logMessage(state, `${target.nome} foi derrotado!`, 'defeat');
            }
            break;
        // ... outras lógicas de efeito (buff, dot, etc) serão adicionadas aqui
    }

    checkGameOver(state);
    if (state.winner) {
        cachePlayerStats(games[roomId]);
    }

    // Atualiza o estado para todos
    setTimeout(() => {
        io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
    }, 1000);
}


function startBattle(state) {
    // ... (função sem alterações)
}

function getFullState(room) {
    // ... (função sem alterações)
}

io.on('connection', (socket) => {
    // ... (lógica de conexão e lobby sem alterações)
    
    socket.on('playerAction', (action) => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId] || !action || !action.type) return;
        
        const room = games[roomId];
        const lobbyState = room.gameModes.lobby;
        const isGm = socket.id === lobbyState.gmId;
        let activeState = room.gameModes[room.activeMode];
        let shouldUpdate = true;
        
        // ... (lógica de GM e playerFinalizesCharacter sem alterações)

        switch (room.activeMode) {
            case 'lobby':
                // ... (sem alterações)
                break;
            case 'adventure':
                const adventureState = activeState;
                if (!adventureState) break;
                // ... (cases gmMovesFighter, gmSetsNpcInSlot, flee sem alterações)

                switch (action.type) {
                    case 'gmStartBattle':
                        if (isGm && adventureState.phase === 'npc_setup' && action.npcs) {
                            adventureState.fighters.npcs = {};
                            adventureState.npcSlots.fill(null);
                            adventureState.customPositions = {};
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
                                    fighter.defesa = initiative;
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
                    // NOVO CASE PARA MAGIAS
                    case 'use_spell':
                        if (adventureState.phase === 'battle' && action.attackerKey === adventureState.activeCharacterKey) {
                            useSpell(adventureState, roomId, action.attackerKey, action.targetKey, action.spellName);
                            shouldUpdate = false;
                        }
                        break;
                    case 'end_turn':
                        if (adventureState.phase === 'battle' && action.actorKey === adventureState.activeCharacterKey) {
                            advanceTurn(adventureState);
                        }
                        break;
                }
                break;

            case 'theater':
                 // ... (lógica do modo teatro permanece a mesma)
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