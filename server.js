// server.js

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

app.get('/favicon.ico', (req, res) => res.status(204).send());

let ALL_NPCS = {};
let PLAYABLE_CHARACTERS = [];
let DYNAMIC_CHARACTERS = [];
let ALL_SCENARIOS = {};
let GAME_RULES = {};
let ALL_SPELLS = {};
let ALL_WEAPON_IMAGES = {};

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
    
    const weaponImagesConfigData = fs.readFileSync('public/weaponImages.json', 'utf8');
    const weaponImagesConfig = JSON.parse(weaponImagesConfigData);
    const weaponImagesPath = 'public/images/armas/';

    if (fs.existsSync(weaponImagesPath)) {
        const weaponImageFiles = fs.readdirSync(weaponImagesPath).filter(file => file.endsWith('.png'));
        for (const weaponType in weaponImagesConfig) {
            const config = weaponImagesConfig[weaponType];
            ALL_WEAPON_IMAGES[weaponType] = { melee: [], ranged: [] };
            
            if (config.meleePrefix) {
                ALL_WEAPON_IMAGES[weaponType].melee = weaponImageFiles
                    .filter(file => file.startsWith(config.meleePrefix + ' ('))
                    .map(file => `/images/armas/${file}`);
            }
            if (config.rangedPrefix) {
                ALL_WEAPON_IMAGES[weaponType].ranged = weaponImageFiles
                    .filter(file => file.startsWith(config.rangedPrefix + ' ('))
                    .map(file => `/images/armas/${file}`);
            }
        }
    }


    const dynamicCharPath = 'public/images/personagens/';
    if (fs.existsSync(dynamicCharPath)) {
        const files = fs.readdirSync(dynamicCharPath).filter(file => file.startsWith('Personagem (') && (file.endsWith('.png') || file.endsWith('.jpg')));
        DYNAMIC_CHARACTERS = files.map(file => ({ name: file.split('.')[0], img: `/images/personagens/${file}` }));
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

// --- FUNÇÕES DE ESTADO DO JOGO ---

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

function filterPublicTheaterState(scenarioState) {
    const publicState = JSON.parse(JSON.stringify(scenarioState));
    
    for (const tokenId in publicState.tokens) {
        if (publicState.tokens[tokenId].isHidden) {
            delete publicState.tokens[tokenId];
        }
    }
    publicState.tokenOrder = publicState.tokenOrder.filter(tokenId => publicState.tokens[tokenId]);
    
    return publicState;
}


function createNewFighterState(data) {
    const fighter = {
        id: data.id || `npc-${uuidv4()}`,
        nome: data.name || data.tokenName,
        img: data.tokenImg || data.img,
        status: 'active',
        scale: data.scale !== undefined ? parseFloat(data.scale) : 1.0,
        isPlayer: !!data.isPlayer,
        pa: 3,
        hasTakenFirstTurn: false,
        activeEffects: [],
        cooldowns: {}
    };

    if (fighter.isPlayer && data.finalAttributes) {
        const constituicao = data.finalAttributes.constituicao || 0;
        const mente = data.finalAttributes.mente || 0;
        
        fighter.hpMax = 20 + (constituicao * 5);
        fighter.mahouMax = 10 + (mente * 5);
        fighter.hp = data.hp !== undefined ? data.hp : fighter.hpMax;
        fighter.mahou = data.mahou !== undefined ? data.mahou : fighter.mahouMax;

        fighter.sheet = data;

        fighter.level = data.level || 1;
        fighter.xp = data.xp || 0;
        fighter.xpNeeded = data.xpNeeded || 100;
        fighter.money = data.money !== undefined ? data.money : 200;

        fighter.inventory = data.inventory || {};
        fighter.ammunition = data.ammunition || {};

    } else { // NPC
        fighter.level = 1;
        fighter.sheet = {
            finalAttributes: {},
            equipment: data.equipment || { weapon1: {type: 'Desarmado', name: ''}, weapon2: {type: 'Desarmado', name: ''}, armor: 'Nenhuma', shield: 'Nenhum' },
            spells: data.spells || []
        };
        
        fighter.isMultiPart = !!data.isMultiPart;

        if (fighter.isMultiPart && data.parts) {
            fighter.parts = data.parts.map(partData => {
                const customPart = data.customStats?.parts?.find(p => p.key === partData.key);
                const partHp = customPart ? customPart.hp : 10;
                return { key: partData.key, name: partData.name, hpMax: partHp, hp: partHp, status: 'active' };
            });
            fighter.hpMax = fighter.parts.reduce((sum, part) => sum + part.hpMax, 0);
            fighter.hp = fighter.hpMax;
        } else if (data.customStats) {
            fighter.hpMax = data.customStats.hp;
            fighter.hp = data.customStats.hp;
        } else {
             fighter.hpMax = 15; fighter.hp = 15;
        }

        if (data.customStats) {
            fighter.mahouMax = data.customStats.mahou;
            fighter.mahou = data.customStats.mahou;
            fighter.sheet.finalAttributes = {
                forca: data.customStats.forca,
                agilidade: data.customStats.agilidade,
                protecao: data.customStats.protecao,
                constituicao: data.customStats.constituicao,
                inteligencia: data.customStats.inteligencia,
                mente: data.customStats.mente,
            };
        } else {
             fighter.mahouMax = 10; fighter.mahou = 10;
             fighter.sheet.finalAttributes = { forca: 1, agilidade: 1, protecao: 1, constituicao: 1, mente: 1 };
        }
    }
    
    recalculateFighterStats(fighter);

     if (fighter.hp <= 0) {
        fighter.status = 'down';
     }

    return fighter;
}

function recalculateFighterStats(fighter) {
    const esqBreakdown = calculateESQ(fighter);
    fighter.esquiva = esqBreakdown.value;
    fighter.esqBreakdown = esqBreakdown.details;

    const magicDefBreakdown = calculateMagicDefense(fighter);
    fighter.magicDefense = magicDefBreakdown.value;
    fighter.magicDefenseBreakdown = magicDefBreakdown.details;
}

function cachePlayerStats(room) {
    if (!room.gameModes.adventure) return;
    const adventureState = room.gameModes.adventure;
    const lobbyState = room.gameModes.lobby;

    Object.values(adventureState.fighters.players).forEach(playerFighter => {
        const lobbyPlayer = lobbyState.connectedPlayers[playerFighter.id];
        if (lobbyPlayer && lobbyPlayer.characterSheet) {
            if (playerFighter.status !== 'fled') {
                 lobbyPlayer.characterSheet.hp = playerFighter.hp;
                 lobbyPlayer.characterSheet.mahou = playerFighter.mahou;
                 lobbyPlayer.characterSheet.ammunition = playerFighter.ammunition;
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

function getFighterAttribute(fighter, attr) {
    if (!fighter || !fighter.sheet || !fighter.sheet.finalAttributes) return 0;
    
    let baseValue = fighter.sheet.finalAttributes[attr] || 0;
    
    if (fighter.activeEffects && fighter.activeEffects.length > 0) {
        const bonus = fighter.activeEffects
            .filter(effect => effect.attribute === attr && (effect.type === 'buff' || effect.type === 'debuff'))
            .reduce((sum, effect) => sum + effect.value, 0);
        baseValue += bonus;
    }
    
    return baseValue;
}

function getAttributeBreakdown(fighter, attr) {
    const details = {};
    let total = 0;
    if (fighter && fighter.sheet && fighter.sheet.finalAttributes) {
        const baseValue = fighter.sheet.finalAttributes[attr] || 0;
        details[`Base (${attr})`] = baseValue;
        total += baseValue;
    }
     if (fighter.activeEffects && fighter.activeEffects.length > 0) {
        fighter.activeEffects
            .filter(effect => effect.attribute === attr && (effect.type === 'buff' || effect.type === 'debuff'))
            .forEach(effect => {
                details[`Efeito (${effect.name})`] = effect.value;
                total += effect.value;
            });
    }
    return {value: total, details};
}

// --- FUNÇÕES DE DETALHAMENTO E CÁLCULO PARA O COMBATE ---

function calculateESQ(fighter) {
    const details = {};
    const agiBreakdown = getAttributeBreakdown(fighter, 'agilidade');
    let total = 10 + agiBreakdown.value;
    Object.assign(details, agiBreakdown.details);
    details['Base'] = 10;
    
    return { value: total, details };
}

function calculateMagicDefense(fighter) {
    const details = {};
    const intBreakdown = getAttributeBreakdown(fighter, 'inteligencia');
    let total = 10 + intBreakdown.value;
    Object.assign(details, intBreakdown.details);
    details['Base'] = 10;
    return { value: total, details };
}

function getBtaBreakdown(fighter) {
    const agiBreakdown = getAttributeBreakdown(fighter, 'agilidade');
    let total = agiBreakdown.value;
    const details = { ...agiBreakdown.details };

    const weapon1 = fighter.sheet.equipment.weapon1;
    const weapon2 = fighter.sheet.equipment.weapon2;
    const w1Data = GAME_RULES.weapons[weapon1.type] || { bta: 0 };
    const w2Data = GAME_RULES.weapons[weapon2.type] || { bta: 0 };

    let weaponBtaMod = w1Data.bta;
    if (weapon1.type !== 'Desarmado' && weapon2.type !== 'Desarmado') {
        weaponBtaMod = Math.min(w1Data.bta, w2Data.bta);
    }
    
    if (weaponBtaMod !== 0) {
        details[`Bônus de Arma`] = weaponBtaMod;
        total += weaponBtaMod;
    }

    const forca = getFighterAttribute(fighter, 'forca');
    if (forca >= 4) {
        const shield = fighter.sheet.equipment.shield;
        
        const w1Is2H = w1Data.hand === 2;
        const w2Is2H = w2Data.hand === 2;
        
        const isDualWielding = weapon1.type !== 'Desarmado' && weapon2.type !== 'Desarmado';
        const isShielding = shield !== 'Nenhum';

        if ((w1Is2H || w2Is2H) && (isDualWielding || isShielding)) {
            total -= 2;
            details['Penalidade 2 Mãos (1 Mão)'] = -2;
        }
    }
    
    return { value: total, details };
}


function getBtdBreakdown(fighter, weaponKey, isDualAttackPart = false) {
    const weapon = fighter.sheet.equipment[weaponKey];
    if (!weapon) return { value: 0, details: {} };
    
    const isRanged = !!weapon.isRanged;
    const attributeToUse = isRanged ? 'agilidade' : 'forca';

    const attrBreakdown = getAttributeBreakdown(fighter, attributeToUse);
    let total = attrBreakdown.value;
    const details = { ...attrBreakdown.details };
    details[`Atributo de Dano`] = `(${isRanged ? 'Agilidade' : 'Força'})`;
    
    const weaponData = GAME_RULES.weapons[weapon.type] || { btd: 0 };
    if (weaponData.btd !== 0) {
        details[`Bônus de Arma (${weapon.type})`] = weaponData.btd;
        total += weaponData.btd;
    }

    if (isDualAttackPart) {
        const forca = getFighterAttribute(fighter, 'forca');
        
        if (weaponData.hand === 2 && forca >= 4) {
            details['Ataque Duplo (2 Mãos)'] = -2;
            total -= 2;
        } else {
            details['Ataque Duplo (1 Mão)'] = -1;
            total -= 1;
        }
    }
    return { value: total, details };
}

function getBtmBreakdown(fighter) {
    const intBreakdown = getAttributeBreakdown(fighter, 'inteligencia');
    let total = intBreakdown.value;
    const details = intBreakdown.details;

    const weapon1Type = fighter.sheet.equipment.weapon1.type;
    const weaponData = GAME_RULES.weapons[weapon1Type];
    if (weaponData && weaponData.btm) {
        details[`Arma (${weapon1Type})`] = weaponData.btm;
        total += weaponData.btm;
    }
    return { value: total, details };
}

function getProtectionBreakdown(fighter) {
    const protBreakdown = getAttributeBreakdown(fighter, 'protecao');
    let total = protBreakdown.value;
    const details = protBreakdown.details;
    return { value: total, details };
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

function processActiveEffects(state, fighter, roomId) {
    let isStunned = false;
    if (!fighter || !fighter.activeEffects || fighter.activeEffects.length === 0) {
        return { isStunned };
    }

    const effectsToKeep = [];
    for (const effect of fighter.activeEffects) {
        
        switch (effect.type) {
            case 'dot':
                const procRoll = Math.random();
                if (procRoll < (effect.procChance || 1.0)) {
                    const damage = effect.damage || 0;
                    fighter.hp = Math.max(0, fighter.hp - damage);
                    logMessage(state, `${fighter.nome} sofre ${damage} de dano de ${effect.name}!`, 'hit');
                    io.to(roomId).emit('floatingTextTriggered', { targetId: fighter.id, text: `-${damage}`, type: 'damage-hp' });
                    if (effect.animation) {
                        io.to(roomId).emit('visualEffectTriggered', { casterId: fighter.id, targetId: fighter.id, animation: effect.animation });
                    }
                } else {
                    logMessage(state, `${fighter.nome} resistiu ao efeito de ${effect.name} neste turno.`, 'info');
                    io.to(roomId).emit('floatingTextTriggered', { targetId: fighter.id, text: `Resistiu`, type: 'status-resist' });
                }
                break;
            
            case 'status_effect':
                if (effect.status === 'stunned') {
                    isStunned = true;
                    logMessage(state, `${fighter.nome} está atordoado e perde o turno!`, 'miss');
                    io.to(roomId).emit('floatingTextTriggered', { targetId: fighter.id, text: 'Perdeu o Turno', type: 'status-fail' });
                }
                break;
        }

        effect.duration--;
        if (effect.duration > 0) {
            effectsToKeep.push(effect);
        } else {
            logMessage(state, `O efeito de ${effect.name} em ${fighter.nome} acabou.`, 'info');
        }
    }
    
    fighter.activeEffects = effectsToKeep;
    recalculateFighterStats(fighter);

    if (fighter.hp === 0 && fighter.status === 'active') {
        fighter.status = 'down';
        logMessage(state, `${fighter.nome} foi derrotado pelo dano contínuo!`, 'defeat');
    }
    
    return { isStunned };
}


function advanceTurn(state, roomId) {
    if (state.winner) return;

    state.turnOrder = state.turnOrder.filter(id => getFighter(state, id)?.status === 'active');
    if (state.turnOrder.length === 0) {
        checkGameOver(state);
        if (state.winner) {
            io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
        }
        return;
    }
    
    let currentIndex = state.turnOrder.indexOf(state.activeCharacterKey);
    let nextIndex = (currentIndex + 1) % state.turnOrder.length;

    if (nextIndex === 0 && currentIndex !== -1) {
        state.currentRound++;
        logMessage(state, `--- Começando o Round ${state.currentRound} ---`, 'round');
    }

    state.activeCharacterKey = state.turnOrder[nextIndex];
    const activeFighter = getFighter(state, state.activeCharacterKey);

    if (activeFighter.hasTakenFirstTurn) {
        activeFighter.pa += 3;
    } else {
        activeFighter.hasTakenFirstTurn = true;
    }
    
    Object.keys(activeFighter.cooldowns).forEach(spellName => {
        if (activeFighter.cooldowns[spellName] > 0) {
            activeFighter.cooldowns[spellName]--;
        }
    });

    logMessage(state, `É a vez de ${activeFighter.nome}.`, 'turn');
    
    const { isStunned } = processActiveEffects(state, activeFighter, roomId);
    checkGameOver(state);

    io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));

    if (state.winner) return;

    if (activeFighter.status !== 'active') {
        setTimeout(() => advanceTurn(state, roomId), 500);
        return;
    }
    
    if (isStunned) {
        setTimeout(() => {
            advanceTurn(state, roomId);
        }, 1500);
    }
}

function executeAttack(state, roomId, attackerKey, targetKey, weaponChoice, targetPartKey) {
    const attacker = getFighter(state, attackerKey);
    let target = getFighter(state, targetKey);
    if (!attacker || !target || attacker.status !== 'active' || target.status !== 'active') return;

    const paCost = weaponChoice === 'dual' ? 3 : 2;
    if (attacker.pa < paCost) {
        logMessage(state, `${attacker.nome} não tem Pontos de Ação suficientes!`, 'miss');
        io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
        return;
    }
    attacker.pa -= paCost;

    const performSingleAttack = (weaponKey, isDual = false) => {
        target = getFighter(state, targetKey);
        if (!target || target.status !== 'active') return null;

        const weapon = attacker.sheet.equipment[weaponKey];
        if (weapon.isRanged) {
            if (!attacker.ammunition || !attacker.ammunition[weaponKey] || attacker.ammunition[weaponKey] <= 0) {
                logMessage(state, `${attacker.nome} está sem munição para ${weapon.name}!`, 'miss');
                io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
                return null;
            }
            attacker.ammunition[weaponKey]--;
            logMessage(state, `${attacker.nome} usa 1 munição de ${weapon.name}. Restam: ${attacker.ammunition[weaponKey]}.`, 'info');
        }

        const hitRoll = rollD20();
        const btaBreakdown = getBtaBreakdown(attacker);
        const bta = btaBreakdown.value;
        const attackRoll = hitRoll + bta;
        const weaponType = weapon.type;
        const weaponData = GAME_RULES.weapons[weaponType];
        
        let debugInfo = { attackerName: attacker.nome, targetName: target.nome, weaponUsed: weaponType, isRanged: !!weapon.isRanged };

        logMessage(state, `${attacker.nome} ataca ${target.nome} com ${weapon.name || weaponType}. Rolagem: ${hitRoll} + ${bta} (BTA) = ${attackRoll} vs Esquiva ${target.esquiva}.`, 'info');
        Object.assign(debugInfo, { hitRoll, bta, btaBreakdown: btaBreakdown.details, attackRoll, targetEsquiva: target.esquiva, esqBreakdown: target.esqBreakdown });
        
        let hit = false;
        if (hitRoll === 1) {
            logMessage(state, `Erro Crítico! ${attacker.nome} erra o ataque.`, 'miss');
        } else if (hitRoll === 20 || attackRoll >= target.esquiva) {
            hit = true;
            const isCrit = hitRoll === 20;
            if(isCrit) logMessage(state, `Acerto Crítico!`, 'crit');

            const btdBreakdown = getBtdBreakdown(attacker, weaponKey, isDual);
            const btd = btdBreakdown.value;
            const damageRoll = rollDice(weaponData.damage);
            const critDamage = isCrit ? damageRoll : 0;
            let totalDamage = damageRoll + critDamage + btd;
            
            const protectionBreakdown = getProtectionBreakdown(target);
            const targetProtection = protectionBreakdown.value;
            const finalDamage = Math.max(1, totalDamage - targetProtection);
            
            io.to(roomId).emit('floatingTextTriggered', { targetId: target.id, text: `-${finalDamage}`, type: 'damage-hp' });
            
            if (target.isMultiPart && targetPartKey) {
                const part = target.parts.find(p => p.key === targetPartKey);
                if (part && part.status === 'active') {
                    part.hp = Math.max(0, part.hp - finalDamage);
                    logMessage(state, `A parte "${part.name}" de ${target.nome} recebe ${finalDamage} de dano!`, 'hit');
                    if (part.hp === 0) {
                        part.status = 'down';
                        logMessage(state, `A parte "${part.name}" foi destruída!`, 'defeat');
                    }
                    target.hp = target.parts.reduce((sum, p) => sum + p.hp, 0);
                }
            } else {
                target.hp = Math.max(0, target.hp - finalDamage);
                logMessage(state, `${attacker.nome} acerta ${target.nome} e causa ${finalDamage} de dano!`, 'hit');
            }

            if (target.hp === 0) {
                target.status = 'down';
                logMessage(state, `${target.nome} foi derrotado!`, 'defeat');
            }

            Object.assign(debugInfo, { hit: true, isCrit, damageFormula: weaponData.damage, damageRoll, critDamage, btd, btdBreakdown: btdBreakdown.details, totalDamage, targetProtection, protectionBreakdown: protectionBreakdown.details, finalDamage });
        } else {
            logMessage(state, `${attacker.nome} erra o ataque!`, 'miss');
             Object.assign(debugInfo, { hit: false });
        }
        return { hit, debugInfo };
    };
    
    if (weaponChoice === 'dual') {
        const result1 = performSingleAttack('weapon1', true);
        const result2 = performSingleAttack('weapon2', true);

        const combinedDebugInfo = {
            attackerName: attacker.nome,
            targetName: target.nome,
            isDual: true,
            attack1: result1 ? result1.debugInfo : null,
            attack2: result2 ? result2.debugInfo : null,
        };
        const anyHit = (result1 && result1.hit) || (result2 && result2.hit);
        io.to(roomId).emit('attackResolved', { attackerKey, targetKey, hit: anyHit, debugInfo: combinedDebugInfo, isDual: true });

    } else {
        const result = performSingleAttack(weaponChoice);
        if (result) {
            io.to(roomId).emit('attackResolved', { attackerKey, targetKey, hit: result.hit, debugInfo: result.debugInfo });
        }
    }

    checkGameOver(state);
    if (state.winner) {
        cachePlayerStats(games[roomId]);
    }
    
    setTimeout(() => io.to(roomId).emit('gameUpdate', getFullState(games[roomId])), 1500);
}

function useSpell(state, roomId, attackerKey, targetKey, spellName) {
    const attacker = getFighter(state, attackerKey);
    let target = getFighter(state, targetKey);

    const allSpells = [...(ALL_SPELLS.grade1 || []), ...(ALL_SPELLS.grade2 || []), ...(ALL_SPELLS.grade3 || [])];
    const spell = allSpells.find(s => s.name === spellName);

    if (!attacker || !target || !spell || attacker.status !== 'active' || (spell.targetType !== 'self' && target.status !== 'active')) return;
    
    const paCost = spell.costPA || 2;
    if (attacker.pa < paCost) {
        logMessage(state, `${attacker.nome} não tem Pontos de Ação suficientes para ${spellName}!`, 'miss');
        return io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
    }
    
    if (attacker.mahou < spell.costMahou) {
        logMessage(state, `${attacker.nome} não tem Mahou suficiente para usar ${spellName}!`, 'miss');
        return io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
    }

    if (attacker.cooldowns[spellName] > 0) {
        logMessage(state, `${spellName} está em resfriamento por mais ${attacker.cooldowns[spellName]} turno(s).`, 'miss');
        return io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
    }

    attacker.pa -= paCost;
    attacker.mahou -= spell.costMahou;
    if (spell.cooldown > 0) {
        attacker.cooldowns[spellName] = spell.cooldown + 1;
    }

    logMessage(state, `${attacker.nome} usa ${spellName} em ${target.nome}!`, 'info');
    if(spell.effect?.animation) {
        io.to(roomId).emit('visualEffectTriggered', { casterId: attacker.id, targetId: target.id, animation: spell.effect.animation });
    }
    
    const isPureMagic = spell.effect?.damageAttribute === 'inteligencia';

    if (spell.requiresHitRoll === false) {
        const debugInfo = { attackerName: attacker.nome, targetName: target.nome, spellName: spell.name, hit: true, autoHit: true };
        applySpellEffect(state, roomId, attacker, target, spell, debugInfo);
        io.to(roomId).emit('spellResolved', { debugInfo });
        setTimeout(() => io.to(roomId).emit('gameUpdate', getFullState(games[roomId])), 1000);
        return;
    }

    const hitRoll = rollD20();
    let attackBonus, attackBonusBreakdown, targetDefense, targetDefenseBreakdown;

    if (isPureMagic) {
        const btmData = getBtmBreakdown(attacker);
        attackBonus = btmData.value;
        attackBonusBreakdown = btmData.details;
        targetDefense = target.magicDefense;
        targetDefenseBreakdown = target.magicDefenseBreakdown;
    } else {
        const btaData = getBtaBreakdown(attacker);
        attackBonus = btaData.value;
        attackBonusBreakdown = btaData.details;
        targetDefense = target.esquiva;
        targetDefenseBreakdown = target.esqBreakdown;
    }
    
    const attackRoll = hitRoll + attackBonus;
    
    let debugInfo = { 
        attackerName: attacker.nome, targetName: target.nome, spellName: spell.name, 
        hitRoll, attackBonus, attackBonusBreakdown, attackRoll, targetDefense, targetDefenseBreakdown, isPureMagic
    };

    if (hitRoll === 1) {
        logMessage(state, `${attacker.nome} erra a magia ${spellName} (Erro Crítico)!`, 'miss');
        io.to(roomId).emit('spellResolved', { debugInfo: { ...debugInfo, hit: false, isCritFail: true } });
    } else if (hitRoll === 20 || attackRoll >= targetDefense) {
        const isCrit = hitRoll === 20;
        if(isCrit) logMessage(state, `Acerto Crítico com ${spellName}!`, 'crit');
        else logMessage(state, `${attacker.nome} acerta a magia ${spellName}!`, 'hit');
        
        debugInfo.isCrit = isCrit;
        applySpellEffect(state, roomId, attacker, target, spell, debugInfo);
    } else {
        logMessage(state, `${attacker.nome} erra a magia ${spellName}!`, 'miss');
        io.to(roomId).emit('spellResolved', { debugInfo: { ...debugInfo, hit: false } });
    }
    
    setTimeout(() => io.to(roomId).emit('gameUpdate', getFullState(games[roomId])), 1000);
}

function applySpellEffect(state, roomId, attacker, target, spell, debugInfo) {
    let effectModifier = 0;
    if (attacker.sheet.race === 'Tulku' && spell.element === 'luz') {
        effectModifier -= 1; logMessage(state, `A natureza Tulku de ${attacker.nome} enfraquece a magia de Luz!`, 'info');
    }
    if (attacker.sheet.race === 'Anjo' && spell.effect.type === 'healing') {
        effectModifier += 1; logMessage(state, `A natureza angelical de ${attacker.nome} fortalece a magia de cura!`, 'info');
    }
    if (attacker.sheet.race === 'Demônio' && spell.element === 'escuridao') {
        effectModifier += 1; logMessage(state, `O poder demoníaco de ${attacker.nome} fortalece a magia de Escuridão!`, 'info');
    }

    switch(spell.effect.type) {
        case 'direct_damage':
            const damageRoll = rollDice(spell.effect.damageFormula);
            let levelBonus = 0;
            if (spell.effect.damageBonus === 'level') {
                levelBonus = attacker.level;
            }
            
            const critDamage = debugInfo.isCrit ? damageRoll : 0;
            const btmBreakdown = getBtmBreakdown(attacker);
            const btm = btmBreakdown.value;
            const targetProtectionBreakdown = getProtectionBreakdown(target);
            const targetProtection = targetProtectionBreakdown.value;
            const totalDamage = damageRoll + levelBonus + critDamage + btm + effectModifier;
            const finalDamage = Math.max(1, totalDamage - targetProtection);
            
            target.hp = Math.max(0, target.hp - finalDamage);
            io.to(roomId).emit('floatingTextTriggered', { targetId: target.id, text: `-${finalDamage}`, type: 'damage-hp' });
            logMessage(state, `${spell.name} causa ${finalDamage} de dano!`, 'hit');
            if(target.hp === 0) {
                 target.status = 'down';
                 logMessage(state, `${target.nome} foi derrotado!`, 'defeat');
            }
            Object.assign(debugInfo, { hit: true, damageFormula: spell.effect.damageFormula, damageRoll, levelBonus, critDamage, btm, btmBreakdown: btmBreakdown.details, totalDamage, targetProtection, protectionBreakdown: targetProtectionBreakdown.details, finalDamage });
            io.to(roomId).emit('spellResolved', { debugInfo });
            break;
        
        case 'resource_damage':
            if (Math.random() > (spell.effect.resistChance || 0)) {
                let resourceDamage = rollDice(spell.effect.damageFormula);
                target.mahou = Math.max(0, target.mahou - resourceDamage);
                io.to(roomId).emit('floatingTextTriggered', { targetId: target.id, text: `-${resourceDamage}`, type: 'damage-mahou' });
                logMessage(state, `${spell.name} drena ${resourceDamage} de Mahou!`, 'hit');

                if (spell.name === 'Dreno de Energia') {
                    attacker.mahou = Math.min(attacker.mahouMax, attacker.mahou + 1);
                }

                Object.assign(debugInfo, { hit: true, damageFormula: spell.effect.damageFormula, damageRoll: resourceDamage, resourceDamage });
            } else {
                io.to(roomId).emit('floatingTextTriggered', { targetId: target.id, text: `Resistiu`, type: 'status-resist' });
                logMessage(state, `${target.nome} resistiu ao Dano de Energia!`, 'info');
                Object.assign(debugInfo, { hit: false });
            }
             io.to(roomId).emit('spellResolved', { debugInfo });
            break;
        
        case 'buff':
        case 'debuff':
            spell.effect.modifiers.forEach(mod => {
                target.activeEffects.push({
                    name: spell.name,
                    type: spell.effect.type,
                    duration: spell.effect.duration + 1,
                    attribute: mod.attribute,
                    value: mod.value
                });
                const sign = mod.value > 0 ? '+' : '';
                io.to(roomId).emit('floatingTextTriggered', { targetId: target.id, text: `${mod.attribute.toUpperCase()} ${sign}${mod.value}`, type: 'buff' });
            });
            recalculateFighterStats(target);
            break;

        case 'dot':
            target.activeEffects.push({
                name: spell.name,
                type: spell.effect.type,
                duration: spell.effect.duration + 1,
                ...spell.effect
            });
            break;

        case 'status_effect':
             if (Math.random() >= (spell.effect.resistChance || 0)) {
                 target.activeEffects.push({
                    name: spell.name,
                    type: spell.effect.type,
                    duration: spell.effect.duration + 1,
                    ...spell.effect
                });
            } else {
                io.to(roomId).emit('floatingTextTriggered', { targetId: target.id, text: `Resistiu`, type: 'status-resist' });
                logMessage(state, `${target.nome} resistiu a ${spell.name}!`, 'info');
            }
            break;
    }

    checkGameOver(state);
    if (state.winner) {
        cachePlayerStats(games[roomId]);
    }
}


function startBattle(state, roomId) {
    Object.values(state.fighters.players).forEach(p => {
        if (p.status !== 'down') p.status = 'active';
    });
    
    Object.values(state.fighters).forEach(team => {
        Object.values(team).forEach(fighter => {
            recalculateFighterStats(fighter);
        });
    });

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
    advanceTurn(state, roomId);
}

function getFullState(room) {
    if (!room) return null;
    const activeState = room.gameModes[room.activeMode];
    return { ...activeState, gmId: room.gameModes.lobby.gmId, connectedPlayers: room.gameModes.lobby.connectedPlayers };
}

io.on('connection', (socket) => {
    socket.emit('initialData', { 
        rules: GAME_RULES,
        spells: ALL_SPELLS,
        weaponImages: ALL_WEAPON_IMAGES,
        characters: { 
            players: PLAYABLE_CHARACTERS.map(name => ({ name, img: `/images/players/${name}.png` })), 
            npcs: Object.keys(ALL_NPCS).map(name => ({ 
                name, img: `/images/lutadores/${name}.png`, scale: ALL_NPCS[name].scale || 1.0,
                isMultiPart: !!ALL_NPCS[name].isMultiPart, parts: ALL_NPCS[name].parts || []
            })), 
            dynamic: DYNAMIC_CHARACTERS 
        }, 
        scenarios: ALL_SCENARIOS 
    });

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

    socket.on('playerJoinsLobby', ({ roomId }) => {
        if (!games[roomId]) { socket.emit('error', { message: 'Sala não encontrada.' }); return; }
        socket.join(roomId);
        socket.currentRoomId = roomId;
        const lobbyState = games[roomId].gameModes.lobby;
        const currentPlayers = Object.values(lobbyState.connectedPlayers).filter(p => p.role === 'player').length;
        const isFull = currentPlayers >= MAX_PLAYERS;
        socket.emit('promptForRole', { isFull: isFull });
        io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
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
                logMessage(lobbyState, "Mestre voltou para o lobby.");
                io.to(roomId).emit('gameUpdate', getFullState(room));
                return;
            }
            if (action.type === 'gmSwitchesMode') {
                 if (room.activeMode === 'adventure') {
                    cachePlayerStats(room);
                    room.adventureCache = JSON.parse(JSON.stringify(room.gameModes.adventure));
                    room.activeMode = 'theater';
                 } else if (room.activeMode === 'theater') {
                    if (room.adventureCache) {
                        socket.emit('promptForAdventureType');
                        shouldUpdate = false; 
                    } else {
                        room.activeMode = 'adventure';
                        if(!room.gameModes.adventure) {
                             room.gameModes.adventure = createNewAdventureState(lobbyState.gmId, lobbyState.connectedPlayers);
                        }
                    }
                 }

                 if (room.activeMode === 'theater' && !room.gameModes.theater) {
                    room.gameModes.theater = createNewTheaterState(lobbyState.gmId, 'cenarios externos/externo (1).png');
                 }
            }
            if (action.type === 'gmChoosesAdventureType') {
                if (action.choice === 'continue' && room.adventureCache) {
                    room.gameModes.adventure = room.adventureCache;
                    room.adventureCache = null; 
                } else { 
                    room.gameModes.adventure = createNewAdventureState(lobbyState.gmId, lobbyState.connectedPlayers);
                    room.adventureCache = null; 
                }
                room.activeMode = 'adventure';
                logMessage(room.gameModes.adventure, "Mestre iniciou o modo Aventura.");
            }
        }
        
        if (action.type === 'playerFinalizesCharacter') {
            const playerInfo = lobbyState.connectedPlayers[socket.id];
            if (playerInfo) {
                const characterData = action.characterData;
                const initialInventory = {};
                const equip = characterData.equipment;
                const ammunition = {};

                equip.weapon1.isRanged = action.isRanged.weapon1;
                equip.weapon1.img = action.weaponImages.weapon1;
                equip.weapon2.isRanged = action.isRanged.weapon2;
                equip.weapon2.img = action.weaponImages.weapon2;
        
                const addItemToInventory = (item, type, baseType, slotKey) => {
                    if (baseType !== 'Desarmado' && baseType !== 'Nenhuma' && baseType !== 'Nenhum') {
                        initialInventory[item.name] = {
                            type: type, name: item.name, baseType: baseType, quantity: 1,
                            img: item.img, isRanged: item.isRanged
                        };
                        if (item.isRanged) {
                            ammunition[slotKey] = 15;
                        }
                    }
                };
        
                addItemToInventory(equip.weapon1, 'weapon', equip.weapon1.type, 'weapon1');
                addItemToInventory(equip.weapon2, 'weapon', equip.weapon2.type, 'weapon2');
                addItemToInventory({ name: equip.armor, type: equip.armor }, 'armor', equip.armor, 'armor');
                addItemToInventory({ name: equip.shield, type: equip.shield }, 'shield', equip.shield, 'shield');
        
                characterData.inventory = initialInventory;
                characterData.ammunition = ammunition;
        
                playerInfo.characterSheet = characterData;
                playerInfo.characterName = characterData.name;
                playerInfo.characterFinalized = true;
                logMessage(lobbyState, `Jogador ${playerInfo.characterName} está pronto!`);
            }
        }

        if (action.type === 'playerLoadsCharacterIngame') {
            const playerInfo = lobbyState.connectedPlayers[socket.id];
            if (playerInfo && action.characterData) {
                const characterData = action.characterData;
                const initialInventory = {};
                const equip = characterData.equipment;
                const ammunition = {};

                const addItemToInventory = (item, type, baseType, slotKey) => {
                     if (baseType && baseType !== 'Desarmado' && baseType !== 'Nenhuma' && baseType !== 'Nenhum') {
                        initialInventory[item.name] = { type, name: item.name, baseType, quantity: 1, img: item.img, isRanged: item.isRanged };
                        if (item.isRanged) { ammunition[slotKey] = 15; }
                    }
                };
                
                // CORREÇÃO: Chamar a função para ambas as armas, sem a condição falha
                addItemToInventory(equip.weapon1, 'weapon', equip.weapon1.type, 'weapon1');
                addItemToInventory(equip.weapon2, 'weapon', equip.weapon2.type, 'weapon2');
                addItemToInventory({ name: equip.armor, type: 'armor' }, 'armor', equip.armor, 'armor');
                addItemToInventory({ name: equip.shield, type: 'shield' }, 'shield', equip.shield, 'shield');
                
                characterData.inventory = initialInventory;
                characterData.ammunition = ammunition;

                playerInfo.characterSheet = characterData;
                playerInfo.characterName = characterData.name;
                
                if (room.activeMode === 'adventure' && room.gameModes.adventure.fighters.players[socket.id]) {
                    const existingFighter = room.gameModes.adventure.fighters.players[socket.id];
                    const updatedFighter = createNewFighterState({ ...characterData, id: socket.id, isPlayer: true });
                    updatedFighter.pa = existingFighter.pa;
                    updatedFighter.status = existingFighter.status;
                    updatedFighter.activeEffects = existingFighter.activeEffects;
                    room.gameModes.adventure.fighters.players[socket.id] = updatedFighter;
                }

                logMessage(lobbyState, `Jogador ${playerInfo.characterName} carregou uma nova ficha.`);
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

                if (isGm) {
                    switch (action.type) {
                        case 'gmMovesFighter':
                            if (action.fighterId && action.position) {
                                adventureState.customPositions[action.fighterId] = action.position;
                                io.to(roomId).emit('fighterMoved', { fighterId: action.fighterId, position: action.position });
                                shouldUpdate = false;
                            }
                            break;
                        
                        case 'gmSetsNpcInSlot':
                            if (action.slotIndex !== undefined && action.npcData) {
                                const fullNpcData = ALL_NPCS[action.npcData.name] || {};
                                const newNpc = createNewFighterState({ ...action.npcData, ...fullNpcData, customStats: action.customStats, equipment: action.equipment, spells: action.spells });

                                const oldNpcId = adventureState.npcSlots[action.slotIndex];
                                if (oldNpcId) { delete adventureState.fighters.npcs[oldNpcId]; }
                                
                                adventureState.fighters.npcs[newNpc.id] = newNpc;
                                adventureState.npcSlots[action.slotIndex] = newNpc.id;

                                if (adventureState.phase === 'battle') {
                                    adventureState.turnOrder.push(newNpc.id);
                                }
                                logMessage(adventureState, `${newNpc.nome} foi adicionado à batalha!`);
                            }
                            break;
                        
                        case 'gmConfiguresLiveNpc':
                            const npc = adventureState.fighters.npcs[action.fighterId];
                            if (npc && action.stats && action.equipment) {
                                if(npc.isMultiPart) {
                                    npc.parts.forEach(part => {
                                        const updatedPart = action.stats.parts.find(p => p.key === part.key);
                                        if(updatedPart) {
                                            part.hpMax = updatedPart.hp;
                                            part.hp = updatedPart.hp;
                                        }
                                    });
                                    npc.hpMax = npc.parts.reduce((sum, p) => sum + p.hpMax, 0);
                                    npc.hp = npc.hpMax;
                                } else {
                                    npc.hpMax = action.stats.hp;
                                    npc.hp = action.stats.hp;
                                }
                                
                                npc.mahouMax = action.stats.mahou;
                                npc.mahou = action.stats.mahou;
                                npc.sheet.finalAttributes = { forca: action.stats.forca, agilidade: action.stats.agilidade, protecao: action.stats.protecao, constituicao: action.stats.constituicao, inteligencia: action.stats.inteligencia, mente: action.stats.mente };
                                npc.sheet.equipment = action.equipment;
                                npc.sheet.spells = action.spells || [];
                                recalculateFighterStats(npc);
                                logMessage(adventureState, `${npc.nome} foi reconfigurado pelo Mestre.`);
                            }
                            break;

                        case 'gmAppliesBuff':
                             const fighter = getFighter(adventureState, action.fighterId);
                             if (fighter && action.attribute && action.value !== undefined) {
                                 fighter.activeEffects = fighter.activeEffects.filter(effect => effect.attribute !== action.attribute);
                                 if (action.value !== 0) {
                                     fighter.activeEffects.push({ type:'buff', attribute: action.attribute, value: action.value });
                                 }
                                 recalculateFighterStats(fighter);
                                 logMessage(adventureState, `GM aplicou um buff de ${action.value > 0 ? '+' : ''}${action.value} em ${action.attribute} de ${fighter.nome}.`);
                             }
                             break;
                    }
                }

                switch (action.type) {
                    case 'gmStartBattle':
                        if (isGm && adventureState.phase === 'npc_setup' && action.npcs) {
                            adventureState.fighters.npcs = {};
                            adventureState.npcSlots.fill(null);
                            adventureState.customPositions = {};
                            action.npcs.forEach((npcData, index) => {
                                if (index < MAX_NPCS) {
                                    const npcObj = ALL_NPCS[npcData.name] || {};
                                    const newNpc = createNewFighterState({ ...npcData, scale: npcObj.scale || 1.0, isMultiPart: npcObj.isMultiPart, parts: npcObj.parts, customStats: npcData.customStats });
                                    adventureState.fighters.npcs[newNpc.id] = newNpc;
                                    adventureState.npcSlots[index] = newNpc.id;
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
                                startBattle(adventureState, roomId);
                            }
                        }
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
                             const actor = getFighter(adventureState, action.actorKey);
                             if(actor) {
                                 actor.status = 'fled';
                                 logMessage(adventureState, `${actor.nome} fugiu da batalha!`, 'info');
                                 io.to(roomId).emit('fleeResolved', { actorKey: action.actorKey });
                                 checkGameOver(adventureState);
                                 setTimeout(() => {
                                     advanceTurn(adventureState, roomId);
                                 }, 1200);
                                 shouldUpdate = false;
                             }
                         }
                        break;
                    case 'end_turn':
                        if (adventureState.phase === 'battle' && action.actorKey === adventureState.activeCharacterKey) {
                            advanceTurn(adventureState, roomId);
                            shouldUpdate = false;
                        }
                        break;
                    case 'changeEquipment':
                        const playerFighter = getFighter(adventureState, socket.id);
                        if (playerFighter) {
                             if (room.activeMode === 'adventure' && adventureState.activeCharacterKey === socket.id && playerFighter.pa >= 3) {
                                playerFighter.pa -= 3;
                                playerFighter.sheet.equipment = action.newEquipment;
                                recalculateFighterStats(playerFighter);
                                if (lobbyState.connectedPlayers[socket.id]) {
                                    lobbyState.connectedPlayers[socket.id].characterSheet.equipment = action.newEquipment;
                                }
                                logMessage(adventureState, `${playerFighter.nome} gasta 3 PA para trocar de equipamento.`, 'info');
                            } else if (room.activeMode !== 'adventure') {
                                playerFighter.sheet.equipment = action.newEquipment;
                                recalculateFighterStats(playerFighter);
                                logMessage(adventureState, `${playerFighter.nome} trocou de equipamento fora de combate.`);
                            } else {
                                shouldUpdate = false;
                            }
                        }
                        break;
                }
                break;

            case 'theater':
                 const theaterState = activeState;
                 if (action.type === 'changeEquipment') {
                    const playerLobbyInfo = lobbyState.connectedPlayers[socket.id];
                    if (playerLobbyInfo && playerLobbyInfo.characterSheet) {
                         playerLobbyInfo.characterSheet.equipment = action.newEquipment;
                         logMessage(theaterState, `${playerLobbyInfo.characterName} trocou de equipamento.`);
                    }
                 }
                 if (isGm && theaterState && theaterState.scenarioStates && theaterState.currentScenario) {
                     const currentScenarioState = theaterState.scenarioStates[theaterState.currentScenario];
                     if(currentScenarioState) {
                        switch (action.type) {
                            case 'update_scenario_dims':
                                if (action.width && action.height) {
                                    currentScenarioState.scenarioWidth = action.width;
                                    currentScenarioState.scenarioHeight = action.height;
                                    shouldUpdate = false;
                                }
                                break;
                            case 'changeScenario':
                                const newScenarioPath = `mapas/${action.scenario}`;
                                if (action.scenario && typeof action.scenario === 'string') {
                                    activeState.currentScenario = newScenarioPath;
                                    if (!activeState.scenarioStates[newScenarioPath]) {
                                        activeState.scenarioStates[newScenarioPath] = { 
                                            scenario: newScenarioPath, scenarioWidth: null, scenarioHeight: null, tokens: {}, 
                                            tokenOrder: [], globalTokenScale: 1.0, isStaging: true 
                                        };
                                    } else {
                                        activeState.scenarioStates[newScenarioPath].isStaging = true;
                                    }
                                    activeState.publicState = filterPublicTheaterState(currentScenarioState);
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
                                    currentScenarioState.tokens[tokenData.id] = { ...tokenData, isHidden: false };
                                    if (!currentScenarioState.tokenOrder.includes(tokenData.id)) {
                                        currentScenarioState.tokenOrder.push(tokenData.id);
                                    }
                                }
                                if (!currentScenarioState.isStaging) {
                                    activeState.publicState = filterPublicTheaterState(currentScenarioState);
                                }
                                break;
                            case 'updateTokenOrder':
                                if(action.order && Array.isArray(action.order)) {
                                    currentScenarioState.tokenOrder = action.order;
                                    if (!currentScenarioState.isStaging) {
                                        activeState.publicState = filterPublicTheaterState(currentScenarioState);
                                    }
                                }
                                break;
                            case 'updateGlobalScale':
                                currentScenarioState.globalTokenScale = action.scale;
                                if (!currentScenarioState.isStaging) {
                                    activeState.publicState = filterPublicTheaterState(currentScenarioState);
                                }
                                break;
                            case 'publish_stage':
                                if (currentScenarioState.isStaging) {
                                    currentScenarioState.isStaging = false;
                                    activeState.publicState = filterPublicTheaterState(currentScenarioState);
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