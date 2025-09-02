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
    
    let mainParts = diceString.split('+');
    let formula = mainParts[0];
    let bonus = mainParts[1] ? parseInt(mainParts[1], 10) : 0;

    const parts = formula.match(/(\d+)d(\d+)/i);
    if (!parts) return bonus;
    
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
        }
    }
    return adventureState;
}

function createNewTheaterState(gmId, initialScenario) {
    // ... (função sem alterações)
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
            fighter.hpMax = data.customStats.hp;
            fighter.hp = data.customStats.hp;
            fighter.mahouMax = data.customStats.mahou;
            fighter.mahou = data.customStats.mahou;
            fighter.attributes = {
                forca: data.customStats.forca,
                agilidade: data.customStats.agilidade,
                protecao: data.customStats.protecao,
                constituicao: data.customStats.constituicao,
                inteligencia: data.customStats.inteligencia,
                mente: data.customStats.mente,
            };
        } else { // Fallback
            fighter.hpMax = 15; fighter.hp = 15;
            fighter.mahouMax = 10; fighter.mahou = 10;
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

function getFighterAttribute(fighter, attr) {
    let baseValue = 0;
    if (fighter.isPlayer) {
        baseValue = fighter.sheet.finalAttributes[attr] || 0;
    } else {
        baseValue = fighter.attributes[attr] || 0; 
    }
    return baseValue;
}

function calculateBTA(fighter, weaponKey = 'weapon1') {
    const agilidade = getFighterAttribute(fighter, 'agilidade');
    if (!fighter.isPlayer) return agilidade;

    const weaponType = fighter.sheet.equipment[weaponKey].type;
    const weaponData = GAME_RULES.weapons[weaponType];
    let bta = agilidade + (weaponData.bta || 0);
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

// NOVO: Função para processar efeitos no início do turno
function processActiveEffects(fighter, state) {
    if (!fighter.activeEffects || fighter.activeEffects.length === 0) {
        return;
    }

    const remainingEffects = [];
    fighter.activeEffects.forEach(effect => {
        if (effect.effectType === 'dot') {
            if (Math.random() <= effect.procChance) {
                fighter.hp = Math.max(0, fighter.hp - effect.damage);
                logMessage(state, `${fighter.nome} sofre ${effect.damage} de dano de ${effect.name}!`, 'hit');
                if (fighter.hp === 0) {
                    fighter.status = 'down';
                    logMessage(state, `${fighter.nome} foi derrotado pelo efeito!`, 'defeat');
                }
            } else {
                logMessage(state, `${fighter.nome} resistiu ao dano de ${effect.name} neste turno!`, 'miss');
            }
        }

        effect.duration--;
        if (effect.duration > 0) {
            remainingEffects.push(effect);
        } else {
            logMessage(state, `O efeito de ${effect.name} acabou para ${fighter.nome}.`, 'info');
        }
    });
    fighter.activeEffects = remainingEffects;
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
    
    // MODIFICADO: PA agora é cumulativo
    activeFighter.pa += 3;

    // NOVO: Processa efeitos no início do turno
    processActiveEffects(activeFighter, state);

    logMessage(state, `É a vez de ${activeFighter.nome}.`, 'turn');
}

function executeAttack(state, roomId, attackerKey, targetKey, weaponChoice, targetPartKey) {
    const attacker = getFighter(state, attackerKey);
    let target = getFighter(state, targetKey);
    if (!attacker || !target || attacker.status !== 'active' || target.status !== 'active') return;

    const paCost = 2;
    if (attacker.pa < paCost) {
        logMessage(state, `${attacker.nome} não tem Pontos de Ação suficientes!`, 'miss');
        io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
        return;
    }
    attacker.pa -= paCost;

    const performSingleAttack = (weaponKey, isDualAttack) => {
        target = getFighter(state, targetKey);
        if (!target || target.status !== 'active') return;

        const hitRoll = rollD20();
        const bta = calculateBTA(attacker, weaponKey);
        const attackRoll = hitRoll + bta;
        const weaponType = attacker.isPlayer ? attacker.sheet.equipment[weaponKey].type : 'Desarmado';
        const weaponData = GAME_RULES.weapons[weaponType];
        
        logMessage(state, `${attacker.nome} ataca ${target.nome}. Rolagem: ${hitRoll} + ${bta} (BTA) = ${attackRoll} vs Defesa ${target.defesa}.`, 'info');

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

            logMessage(state, `Cálculo do Dano Bruto: [${damageRoll} (Dado)${isCrit ? ` + ${critDamage} (Crítico)` : ''}] + ${btd} (BTD) = ${totalDamage} de dano.`, 'info');

            const targetProtection = getFighterAttribute(target, 'protecao');
            const finalDamage = Math.max(1, totalDamage - targetProtection);
            
            logMessage(state, `Dano Final: ${totalDamage} (Bruto) - ${targetProtection} (Proteção) = ${finalDamage} de dano.`, 'hit');
            
            target.hp = Math.max(0, target.hp - finalDamage);
            if (target.hp === 0) {
                target.status = 'down';
                logMessage(state, `${target.nome} foi derrotado!`, 'defeat');
            }
        } else {
            logMessage(state, `${attacker.nome} erra o ataque!`, 'miss');
        }
        io.to(roomId).emit('attackResolved', { attackerKey, targetKey, hit });
    };
    
    const updateDelay = weaponChoice === 'dual' ? 1600 : 800;
    
    if (weaponChoice === 'dual') {
        performSingleAttack('weapon1', true);
        setTimeout(() => {
            performSingleAttack('weapon2', true);
        }, 800);
    } else {
        performSingleAttack(weaponChoice, false);
    }

    setTimeout(() => {
        checkGameOver(state);
        if (state.winner) {
            cachePlayerStats(games[roomId]);
        }
        io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
    }, updateDelay);
}


function useSpell(state, roomId, attackerKey, targetKey, spellName) {
    const attacker = getFighter(state, attackerKey);
    const target = getFighter(state, targetKey);

    const allSpells = [...(ALL_SPELLS.grade1 || []), ...(ALL_SPELLS.grade2 || []), ...(ALL_SPELLS.grade3 || [])];
    const spell = allSpells.find(s => s.name === spellName);

    if (!attacker || !target || !spell || attacker.status !== 'active' || target.status !== 'active') return;

    if (attacker.mahou < spell.costMahou) {
        logMessage(state, `${attacker.nome} não tem Mahou suficiente para usar ${spellName}!`, 'miss');
        io.to(roomId).emit('gameUpdate', getFullState(games[roomId])); return;
    }
    if (attacker.pa < spell.costPA) {
        logMessage(state, `${attacker.nome} não tem Pontos de Ação suficientes para ${spellName}!`, 'miss');
        io.to(roomId).emit('gameUpdate', getFullState(games[roomId])); return;
    }
    attacker.mahou -= spell.costMahou;
    attacker.pa -= spell.costPA;

    logMessage(state, `${attacker.nome} usa ${spellName} em ${target.nome}!`, 'info');
    io.to(roomId).emit('attackResolved', { attackerKey, targetKey, hit: true });

    switch(spell.effectType) {
        case 'damage':
            // Lógica existente de dano direto
            break;
        case 'dot': // Dano por turno, como Afogamento
            const newEffect = {
                name: spell.name,
                duration: spell.effect.duration,
                effectType: 'dot',
                damage: spell.effect.damage,
                procChance: spell.effect.procChance
            };
            target.activeEffects.push(newEffect);
            logMessage(state, `${target.nome} está sob o efeito de ${spell.name}!`, 'info');
            break;
    }

    setTimeout(() => {
        checkGameOver(state);
        if (state.winner) {
            cachePlayerStats(games[roomId]);
        }
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
        
        if (action.type === 'gmGoesBackToLobby' && isGm) {
            // ... (lógica sem alterações)
        }
        
        if (action.type === 'playerFinalizesCharacter') {
            // ... (lógica sem alterações)
        }

        switch (room.activeMode) {
            case 'lobby':
                // ... (lógica sem alterações)
                break;

            case 'adventure':
                const adventureState = activeState;
                if (!adventureState) break;
                switch (action.type) {
                    case 'gmStartBattle':
                        // ... (lógica sem alterações)
                        break;
                    case 'roll_initiative':
                        // ... (lógica sem alterações)
                        break;
                    case 'attack':
                        if (adventureState.phase === 'battle' && action.attackerKey === adventureState.activeCharacterKey) {
                             executeAttack(adventureState, roomId, action.attackerKey, action.targetKey, action.weaponChoice, action.targetPartKey);
                             shouldUpdate = false; 
                        }
                        break;
                    case 'use_spell':
                        if (adventureState.phase === 'battle' && action.attackerKey === adventureState.activeCharacterKey) {
                            useSpell(adventureState, roomId, action.attackerKey, action.targetKey, action.spellName);
                            shouldUpdate = false;
                        }
                        break;
                    case 'flee':
                        if (adventureState.phase === 'battle' && action.actorKey === adventureState.activeCharacterKey) {
                            const fighter = getFighter(adventureState, action.actorKey);
                            if (fighter) {
                                if (fighter.pa < 3) {
                                    logMessage(adventureState, `${fighter.nome} não tem PA suficiente para fugir!`, 'miss');
                                } else {
                                    fighter.pa -= 3;
                                    fighter.status = 'fled';
                                    logMessage(adventureState, `${fighter.nome} fugiu da batalha!`, 'miss');
                                    io.to(roomId).emit('fleeResolved', { actorKey: action.actorKey });
                                    shouldUpdate = false; 
                                    setTimeout(() => {
                                        checkGameOver(adventureState);
                                        if (!adventureState.winner) advanceTurn(adventureState);
                                        io.to(roomId).emit('gameUpdate', getFullState(room));
                                    }, 1200);
                                }
                            }
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
                 // ... (lógica do modo teatro sem alterações)
                break;
        }
        if (shouldUpdate) {
            io.to(roomId).emit('gameUpdate', getFullState(room));
        }
    });

    socket.on('disconnect', () => {
        // ... (lógica sem alterações)
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));