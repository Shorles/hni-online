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
let ALL_PLAYER_IMAGES = [];
let DYNAMIC_CHARACTERS = [];
let ALL_SCENARIOS = {};
let GAME_RULES = {};
let ALL_SPELLS = {};
let ALL_WEAPON_IMAGES = {};
let ALL_ITEMS = {}; 
let ALL_SUMMONS = {};

const MAX_PLAYERS = 4;
const MAX_NPCS = 5; 

// Tabela de Níveis e Recompensas
const LEVEL_UP_TABLE = {
    2: { xp: 100, rewards: { attrPoints: 2, spellGrade: 1, spellCount: 1 } },
    3: { xp: 250, rewards: { attrPoints: 2, elemPoints: 1, spellGrade: 1, spellCount: 1 } },
    4: { xp: 500, rewards: { attrPoints: 2, spellGrade: 2, spellCount: 1 } },
    5: { xp: 1000, rewards: { attrPoints: 2, elemPoints: 1, spellGrade: 1, spellCount: 1 } },
    6: { xp: 2000, rewards: { attrPoints: 2, elemPoints: 1, spellGrade: 2, spellCount: 1 } },
    7: { xp: 4000, rewards: { attrPoints: 2, spellGrade: 3, spellCount: 1 } }
};


// Função para ordenação natural (Ex: 1, 2, ..., 10)
function naturalSort(a, b) {
    const re = /(\d+)/g;
    const ax = a.match(re) || [];
    const bx = b.match(re) || [];

    for (let i = 0; i < Math.min(ax.length, bx.length); i++) {
        const an = parseInt(ax[i], 10);
        const bn = parseInt(bx[i], 10);
        if (an !== bn) {
            return an - bn;
        }
    }
    return a.localeCompare(b);
}


try {
    const charactersData = fs.readFileSync('characters.json', 'utf8');
    const characters = JSON.parse(charactersData);
    ALL_NPCS = characters.npcs || {}; 

    const playerImagesPath = 'public/images/players/';
    if (fs.existsSync(playerImagesPath)) {
        const allPlayerFiles = fs.readdirSync(playerImagesPath).filter(file => file.endsWith('.png') || file.endsWith('.jpg'));
        
        ALL_PLAYER_IMAGES = allPlayerFiles
            .filter(file => file.toLowerCase().startsWith('player ('))
            .map(file => `/images/players/${file}`);

        PLAYABLE_CHARACTERS = allPlayerFiles
            .filter(file => !file.toLowerCase().startsWith('player ('))
            .map(file => {
                const name = file.replace(/\d*\.png/i, '').replace(/\d*\.jpg/i, '');
                return { name, img: `/images/players/${file}` };
            });
    }

    const rulesData = fs.readFileSync('public/rules.json', 'utf8');
    GAME_RULES = JSON.parse(rulesData);
    const spellsData = fs.readFileSync('public/spells.json', 'utf8');
    ALL_SPELLS = JSON.parse(spellsData);
    const itemsData = fs.readFileSync('public/items.json', 'utf8'); 
    ALL_ITEMS = JSON.parse(itemsData);
    const summonsData = fs.readFileSync('public/summons.json', 'utf8');
    ALL_SUMMONS = JSON.parse(summonsData);
    
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
            const files = fs.readdirSync(path)
                .filter(file => file.endsWith('.png') || file.endsWith('.jpg'))
                .sort(naturalSort); // Aplica a ordenação natural
            ALL_SCENARIOS[category] = files.map(file => `${category}/${file}`);
        }
    });

} catch (error) { console.error('Erro ao carregar arquivos de configuração:', error); }

const games = {};

// --- FUNÇÕES DE UTILIDADE PARA COMBATE ---
function rollD20() { return Math.floor(Math.random() * 20) + 1; }
function rollDice(diceString) {
    if (!diceString || typeof diceString !== 'string') return 0;
    
    let match = diceString.toString().match(/(\d+)d(\d+)(\+\d+)?/i);
    if (match) {
        const numDice = parseInt(match[1], 10);
        const diceSides = parseInt(match[2], 10);
        const bonus = match[3] ? parseInt(match[3], 10) : 0;

        let total = 0;
        for (let i = 0; i < numDice; i++) {
            total += Math.floor(Math.random() * diceSides) + 1;
        }
        return total + bonus;
    }
    
    let mainParts = diceString.split('+');
    let formula = mainParts[0];
    let bonusLegacy = mainParts[1] ? parseInt(mainParts[1], 10) : 0;

    const parts = formula.match(/(\d+)d(\d+)/i);
    if (!parts) return parseInt(diceString) || bonusLegacy;
    
    const numDiceLegacy = parseInt(parts[1], 10);
    const diceSidesLegacy = parseInt(parts[2], 10);

    let totalLegacy = 0;
    for (let i = 0; i < numDiceLegacy; i++) {
        totalLegacy += Math.floor(Math.random() * diceSidesLegacy) + 1;
    }
    return totalLegacy + bonusLegacy;
}


// --- FUNÇÕES DE ESTADO DO JOGO ---

function createNewLobbyState(gmId) { return { mode: 'lobby', phase: 'waiting_players', gmId: gmId, connectedPlayers: {}, unavailableCharacters: [], log: [{ text: "Lobby criado. Aguardando jogadores..." }], }; }

function createNewAdventureState(gmId, connectedPlayers) {
    const adventureState = {
        mode: 'adventure', fighters: { players: {}, npcs: {}, summons: {} }, npcSlots: new Array(MAX_NPCS).fill(null), 
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
                sheetData: playerData.characterSheet,
            });
            adventureState.fighters.players[sId] = newFighter;
        }
    }
    return adventureState;
}

function createNewTheaterState(gmId, initialScenario) {
    const theaterState = {
        mode: 'theater', gmId: gmId, log: [{ text: "Modo Cenário iniciado."}],
        scenarioStates: {}, publicState: {},
        shop: { gmItems: {}, playerItems: [], isOpen: false }
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
    const isSummon = !!data.isSummon;
    const sourceData = (data.isPlayer || isSummon) ? data.sheetData : data;

    const fighter = {
        id: data.id || `npc-${uuidv4()}`,
        nome: sourceData.name || sourceData.tokenName,
        img: sourceData.tokenImg || sourceData.img,
        status: 'active',
        scale: data.customStats?.scale || sourceData.scale || 1.0,
        isPlayer: !!data.isPlayer,
        isSummon: isSummon,
        ownerId: data.ownerId || null,
        duration: data.duration || null,
        pa: 3,
        hasTakenFirstTurn: false,
        activeEffects: [],
        cooldowns: {},
        marks: {}
    };

    if (fighter.isPlayer && sourceData.finalAttributes) {
        fighter.sheet = sourceData;
        
        fighter.level = sourceData.level || 1;
        fighter.xp = sourceData.xp || 0;
        fighter.xpNeeded = sourceData.xpNeeded || LEVEL_UP_TABLE[2]?.xp || 100;
        
        fighter.sheet.unallocatedAttrPoints = fighter.sheet.unallocatedAttrPoints || 0;
        fighter.sheet.unallocatedElemPoints = fighter.sheet.unallocatedElemPoints || 0;
        fighter.sheet.spellChoicesAvailable = fighter.sheet.spellChoicesAvailable || [];

        const constituicao = fighter.sheet.finalAttributes.constituicao || 0;
        const mente = fighter.sheet.finalAttributes.mente || 0;
        
        fighter.hpMax = 20 + (constituicao * 5);
        fighter.mahouMax = 10 + (mente * 5);
        fighter.hp = sourceData.hp !== undefined ? sourceData.hp : fighter.hpMax;
        fighter.mahou = sourceData.mahou !== undefined ? sourceData.mahou : fighter.mahouMax;

        fighter.money = sourceData.money !== undefined ? sourceData.money : 200;
        fighter.inventory = sourceData.inventory || {};
        fighter.ammunition = sourceData.ammunition || {};

    } else if (isSummon) {
        const summonData = sourceData;
        fighter.level = 1;
        fighter.sheet = {
            baseAttributes: {},
            finalAttributes: summonData.attributes,
            equipment: { weapon1: {type: 'Desarmado'}, weapon2: {type: 'Desarmado'}, armor: 'Nenhuma', shield: 'Nenhum' },
            spells: summonData.spells || []
        };
        fighter.hpMax = summonData.attributes.hp;
        fighter.hp = summonData.attributes.hp;
        fighter.mahouMax = summonData.attributes.mahou;
        fighter.mahou = summonData.attributes.mahou;
        fighter.specialEffect = summonData.specialEffect || null;
    }
    else { // NPC
        fighter.level = 1;
        fighter.xpReward = data.xpReward !== undefined ? data.xpReward : 30;
        fighter.moneyReward = data.moneyReward !== undefined ? data.moneyReward : 0;
        
        fighter.sheet = {
            baseAttributes: {}, // NPCs use finalAttributes directly
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
            fighter.xpReward = data.customStats.xpReward;
            fighter.moneyReward = data.customStats.moneyReward;
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
    if (fighter.isPlayer) {
        const constituicao = getAttributeBreakdown(fighter, 'constituicao').value;
        const mente = getAttributeBreakdown(fighter, 'mente').value;
        const oldHpMax = fighter.hpMax;
        const oldMahouMax = fighter.mahouMax;

        fighter.hpMax = 20 + (constituicao * 5);
        fighter.mahouMax = 10 + (mente * 5);

        // Aumenta HP/Mahou atual na mesma proporção do aumento máximo
        if (fighter.hpMax > oldHpMax) fighter.hp += (fighter.hpMax - oldHpMax);
        if (fighter.mahouMax > oldMahouMax) fighter.mahou += (fighter.mahouMax - oldMahouMax);

        // Garante que não ultrapasse o novo máximo
        fighter.hp = Math.min(fighter.hp, fighter.hpMax);
        fighter.mahou = Math.min(fighter.mahou, fighter.mahouMax);
    }

    const esqBreakdown = calculateESQ(fighter);
    fighter.esquiva = esqBreakdown.value;
    fighter.esqBreakdown = esqBreakdown.details;

    const magicDefBreakdown = calculateMagicDefense(fighter);
    fighter.magicDefense = magicDefBreakdown.value;
    fighter.magicDefenseBreakdown = magicDefBreakdown.details;
}

function checkForLevelUp(playerInfo, socket, roomId) {
    let leveledUp = false;
    const sheet = playerInfo.characterSheet;
    const room = games[roomId];

    while (sheet.xp >= sheet.xpNeeded && LEVEL_UP_TABLE[sheet.level + 1]) {
        leveledUp = true;
        sheet.level++;
        const levelData = LEVEL_UP_TABLE[sheet.level];
        
        sheet.unallocatedAttrPoints = (sheet.unallocatedAttrPoints || 0) + (levelData.rewards.attrPoints || 0);
        sheet.unallocatedElemPoints = (sheet.unallocatedElemPoints || 0) + (levelData.rewards.elemPoints || 0);

        if (levelData.rewards.spellCount > 0) {
            if (!sheet.spellChoicesAvailable) sheet.spellChoicesAvailable = [];
            for (let i = 0; i < levelData.rewards.spellCount; i++) {
                sheet.spellChoicesAvailable.push({ grade: levelData.rewards.spellGrade });
            }
        }
        
        logMessage(room.gameModes.lobby, `${sheet.name} alcançou o Nível ${sheet.level}!`, 'info');

        sheet.xpNeeded = LEVEL_UP_TABLE[sheet.level + 1] ? LEVEL_UP_TABLE[sheet.level + 1].xp : sheet.xpNeeded;

        // Sincroniza com o estado da aventura, se existir
        if (room.activeMode === 'adventure' && room.gameModes.adventure.fighters.players[socket.id]) {
            const adventureFighter = room.gameModes.adventure.fighters.players[socket.id];
            adventureFighter.level = sheet.level;
            adventureFighter.xpNeeded = sheet.xpNeeded;
        }
    }

    if (leveledUp) {
        io.to(roomId).emit('floatingTextTriggered', { targetId: socket.id, text: `LEVEL UP!`, type: 'level-up' });
    }
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
    return state.fighters.players[key] || state.fighters.npcs[key] || state.fighters.summons[key];
}

function getAttributeBreakdown(fighter, attr) {
    const details = {};
    let total = 0;

    if (fighter && fighter.sheet) {
        // Para players, summons, etc., usamos finalAttributes.
        const baseAttributes = fighter.sheet.finalAttributes;
        const baseValue = baseAttributes[attr] || 0;
        details[`Base (${attr})`] = baseValue;
        total += baseValue;
    }

    if (fighter && fighter.activeEffects && fighter.activeEffects.length > 0) {
        fighter.activeEffects.forEach(effect => {
            if (effect.modifiers) {
                effect.modifiers.forEach(mod => {
                    if (mod.attribute === attr) {
                        details[`Efeito (${effect.name})`] = mod.value;
                        total += mod.value;
                    }
                });
            } 
            else if (effect.attribute === attr && (effect.type === 'buff' || effect.type === 'debuff')) {
                details[`Efeito (${effect.name})`] = effect.value;
                total += effect.value;
            }
        });
    }

    return { value: total, details };
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

function getBtaBreakdown(fighter, weaponKey = null) {
    const agiBreakdown = getAttributeBreakdown(fighter, 'agilidade');
    let total = agiBreakdown.value;
    const details = { ...agiBreakdown.details };

    const weapon1 = fighter.sheet.equipment.weapon1;
    const weapon2 = fighter.sheet.equipment.weapon2;
    const w1Data = GAME_RULES.weapons[weapon1.type] || { bta: 0 };
    const w2Data = GAME_RULES.weapons[weapon2.type] || { bta: 0 };

    let weaponBtaMod = 0;

    if (weaponKey) {
        const weaponForAttack = fighter.sheet.equipment[weaponKey];
        const weaponDataForAttack = GAME_RULES.weapons[weaponForAttack.type] || { bta: 0 };
        weaponBtaMod = weaponDataForAttack.bta;
    } else {
        weaponBtaMod = w1Data.bta;
        if (weapon1.type !== 'Desarmado' && weapon2.type !== 'Desarmado') {
            weaponBtaMod = Math.min(w1Data.bta, w2Data.bta);
        }
    }
    
    if (weaponBtaMod !== 0) {
        details[`Bônus de Arma`] = weaponBtaMod;
        total += weaponBtaMod;
    }
    
    // BTA buff from effects
    fighter.activeEffects.forEach(effect => {
        if (effect.type === 'bta_buff' || effect.type === 'bta_debuff') {
            total += effect.value;
            details[`Efeito (${effect.name})`] = effect.value;
        }
    });


    const forca = getAttributeBreakdown(fighter, 'forca').value;
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
    
    // BTD buff from effects
    fighter.activeEffects.forEach(effect => {
        if (effect.type === 'btd_buff') {
            total += effect.value;
            details[`Efeito (${effect.name})`] = effect.value;
        }
    });

    if (isDualAttackPart) {
        const forca = getAttributeBreakdown(fighter, 'forca').value;
        
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

    const armor = fighter.sheet.equipment.armor;
    const shield = fighter.sheet.equipment.shield;
    const armorData = GAME_RULES.armors[armor] || { protection: 0 };
    const shieldData = GAME_RULES.shields[shield] || { protection_bonus: 0 };
    
    if (armorData.protection > 0) {
        details[`Armadura (${armor})`] = armorData.protection;
        total += armorData.protection;
    }
    if (shieldData.protection_bonus > 0) {
        details[`Escudo (${shield})`] = shieldData.protection_bonus;
        total += shieldData.protection_bonus;
    }

    return { value: total, details };
}

function distributeNpcRewards(state, defeatedNpc, roomId) {
    const xpReward = defeatedNpc.xpReward || 0;
    const moneyReward = defeatedNpc.moneyReward || 0;

    if (xpReward === 0 && moneyReward === 0) return;

    const eligiblePlayers = Object.values(state.fighters.players).filter(p => p.status === 'active' || p.status === 'fled');

    if (eligiblePlayers.length === 0) return;

    const xpShare = Math.ceil(xpReward / eligiblePlayers.length);
    const moneyShare = Math.floor(moneyReward / eligiblePlayers.length);

    logMessage(state, `${defeatedNpc.nome} foi derrotado! Distribuindo ${xpShare} XP e ${moneyShare} moedas para ${eligiblePlayers.length} jogador(es).`, 'info');

    const room = games[roomId];
    const lobbyState = room.gameModes.lobby;

    eligiblePlayers.forEach(player => {
        const playerInfo = lobbyState.connectedPlayers[player.id];
        if (playerInfo && playerInfo.characterSheet) {
            playerInfo.characterSheet.xp += xpShare;
            playerInfo.characterSheet.money += moneyShare;
            
            const adventureFighter = state.fighters.players[player.id];
            if(adventureFighter) {
                adventureFighter.xp = playerInfo.characterSheet.xp;
                adventureFighter.money = playerInfo.characterSheet.money;
            }
            
            const playerSocket = io.sockets.sockets.get(player.id);
            if(playerSocket) {
                checkForLevelUp(playerInfo, playerSocket, roomId);
            }
        }
        
        logMessage(state, `${player.nome} recebe ${xpShare} XP e ${moneyShare} moedas.`, 'info');
    });
}


function checkGameOver(state) {
    const activePlayers = Object.values(state.fighters.players).filter(p => p.status === 'active');
    const activeNpcs = Object.values(state.fighters.npcs).filter(n => n.status === 'active');
    const activeSummons = Object.values(state.fighters.summons).filter(s => s.status === 'active');

    if (activePlayers.length === 0 && activeSummons.length === 0) {
        state.winner = 'npcs'; state.reason = 'Todos os jogadores e invocações foram derrotados ou fugiram.';
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
                    const damage = rollDice(effect.damage.toString()) || 0;
                    fighter.hp = Math.max(0, fighter.hp - damage);
                    logMessage(state, `${fighter.nome} sofre ${damage} de dano de ${effect.name}!`, 'hit');
                    io.to(roomId).emit('floatingTextTriggered', { targetId: fighter.id, text: `-${damage}`, type: 'damage-hp' });
                    if (effect.animationOnCast) {
                        io.to(roomId).emit('visualEffectTriggered', { casterId: fighter.id, targetId: fighter.id, animation: effect.animationOnCast });
                    }
                } else {
                    logMessage(state, `${fighter.nome} resistiu ao efeito de ${effect.name} neste turno.`, 'info');
                    io.to(roomId).emit('floatingTextTriggered', { targetId: fighter.id, text: `Resistiu`, type: 'status-resist' });
                }
                break;
            
            case 'hot':
                 const healAmount = rollDice(effect.heal);
                 const healedAmount = Math.min(fighter.hpMax - fighter.hp, healAmount);
                 if (healedAmount > 0) {
                     fighter.hp += healedAmount;
                     logMessage(state, `${fighter.nome} é curado por ${effect.name} e recupera ${healedAmount} de HP.`, 'info');
                     io.to(roomId).emit('floatingTextTriggered', { targetId: fighter.id, text: `+${healedAmount} HP`, type: 'heal-hp' });
                 }
                break;

            case 'status_effect':
                if (effect.status === 'stunned') {
                    isStunned = true;
                    logMessage(state, `${fighter.nome} está atordoado e perde o turno!`, 'miss');
                    io.to(roomId).emit('floatingTextTriggered', { targetId: fighter.id, text: 'Perdeu o Turno', type: 'status-fail' });
                }
                if (effect.status === 'banished') {
                    fighter.status = 'banished';
                    fighter.turnOrderSnapshot = state.turnOrder;
                    state.turnOrder = state.turnOrder.filter(id => id !== fighter.id);
                    logMessage(state, `${fighter.nome} foi banido temporariamente do combate!`);
                }
                break;
        }

        effect.duration--;
        if (effect.duration > 0) {
            effectsToKeep.push(effect);
        } else {
            if(effect.status === 'banished'){
                fighter.status = 'active';
                state.turnOrder = fighter.turnOrderSnapshot;
                delete fighter.turnOrderSnapshot;
                logMessage(state, `${fighter.nome} retornou para a batalha!`);
            }
            logMessage(state, `O efeito de ${effect.name} em ${fighter.nome} acabou.`, 'info');
        }
    }
    
    fighter.activeEffects = effectsToKeep;
    recalculateFighterStats(fighter);

    if (fighter.hp <= 0 && fighter.status === 'active') {
        fighter.status = 'down';
        logMessage(state, `${fighter.nome} foi derrotado pelo dano contínuo!`, 'defeat');
        if (!fighter.isPlayer && !fighter.isSummon) {
            distributeNpcRewards(state, fighter, roomId);
        } else if (fighter.isSummon) {
             // Não remover a invocação aqui para permitir a animação de morte
        }
    }
    
    return { isStunned };
}


function advanceTurn(state, roomId) {
    if (state.winner) return;

    const previousActiveKey = state.activeCharacterKey;
    const turnOrderSnapshot = [...state.turnOrder]; 

    state.turnOrder = state.turnOrder.filter(id => {
        const f = getFighter(state, id);
        return f && (f.status === 'active' || (f.status === 'down' && !f.hasTakenFirstTurn));
    });

    if (state.turnOrder.length === 0) {
        checkGameOver(state);
        if (state.winner) {
            io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
        }
        return;
    }
    
    let nextTurnId = null;
    const oldIndex = previousActiveKey ? turnOrderSnapshot.indexOf(previousActiveKey) : -1;

    if (oldIndex !== -1) {
        for (let i = 1; i <= turnOrderSnapshot.length; i++) {
            const candidateIndex = (oldIndex + i) % turnOrderSnapshot.length;
            const candidateId = turnOrderSnapshot[candidateIndex];
            if (state.turnOrder.includes(candidateId)) {
                nextTurnId = candidateId;
                break;
            }
        }
    }

    if (!nextTurnId && state.turnOrder.length > 0) {
        nextTurnId = state.turnOrder[0];
    }

    if (!nextTurnId) {
        checkGameOver(state);
         if (state.winner) {
            io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
        }
        return;
    }

    const newIndexInSnapshot = turnOrderSnapshot.indexOf(nextTurnId);
    if (oldIndex !== -1 && newIndexInSnapshot <= oldIndex) {
        state.currentRound++;
        logMessage(state, `--- Começando o Round ${state.currentRound} ---`, 'round');
    }

    state.activeCharacterKey = nextTurnId;
    const activeFighter = getFighter(state, state.activeCharacterKey);
    
    if (activeFighter.isSummon) {
        activeFighter.duration--;
        if (activeFighter.duration <= 0) {
            logMessage(state, `A invocação ${activeFighter.nome} desapareceu!`, 'info');
            activeFighter.status = 'down'; 
            checkGameOver(state);
            io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
            setTimeout(() => advanceTurn(state, roomId), 1500); 
            return;
        }
    }

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

function handleSummon(state, roomId, action) {
    const { summonerId, spell, choice } = action;

    const summoner = getFighter(state, summonerId);
    if (!summoner) {
        console.error(`[ERROR] Summoner with ID ${summonerId} not found.`);
        return;
    }

    // Dispara o efeito visual ANTES de criar a invocação
    io.to(roomId).emit('visualEffectTriggered', {
        casterId: summonerId,
        targetId: summonerId, // Efeito acontece no próprio invocador
        animation: 'self_summon'
    });

    // Atraso de 1 segundo para a aparição da criatura
    setTimeout(() => {
        let summonDataPool;
        if (spell.effect.type === 'summon') {
            summonDataPool = ALL_SUMMONS[`tier${spell.effect.tier}`];
        } else { // summon_elemental
            summonDataPool = ALL_SUMMONS.elementals;
        }

        const summonBaseData = summonDataPool[choice];
        if (!summonBaseData) {
            console.error(`[ERROR] Summon data for "${choice}" not found.`);
            logMessage(state, `Erro: Dados da invocação ${choice} não encontrados.`, 'miss');
            return;
        }

        const summonId = `summon-${uuidv4()}`;
        const newSummon = createNewFighterState({
            id: summonId,
            isSummon: true,
            ownerId: summonerId,
            duration: spell.effect.duration,
            sheetData: {
                name: choice,
                img: ALL_NPCS[choice] ? `/images/lutadores/${choice}.png` : '/images/lutadores/default.png',
                ...summonBaseData
            }
        });

        state.fighters.summons[summonId] = newSummon;

        const summonerIndex = state.turnOrder.indexOf(summonerId);
        if (summonerIndex !== -1) {
            state.turnOrder.splice(summonerIndex + 1, 0, summonId);
        } else {
            state.turnOrder.push(summonId);
        }

        logMessage(state, `${summoner.nome} invocou ${choice}!`, 'info');
        io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
        console.log(`[DEBUG] Creature ${choice} (${summonId}) summoned by ${summonerId}.`);

    }, 1000); // 1000ms = 1 segundo de atraso
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

        const spellShields = target.activeEffects.filter(e => e.type === 'spell_shield');
        for (const shield of spellShields) {
            if (Math.random() < shield.chance) {
                logMessage(state, `${target.nome} anulou o ataque com ${shield.name}!`, 'miss');
                io.to(roomId).emit('floatingTextTriggered', { targetId: target.id, text: `Anulou`, type: 'status-resist' });
                return { hit: false, debugInfo: { attackerName: attacker.nome, targetName: target.nome, weaponUsed: 'N/A', hit: false, reason: `${shield.name} ativado` } };
            }
        }
        
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
        const btaBreakdown = getBtaBreakdown(attacker, weaponKey);
        const bta = btaBreakdown.value;
        const attackRoll = hitRoll + bta;
        const weaponType = weapon.type;
        const weaponData = GAME_RULES.weapons[weaponType];
        
        let debugInfo = { attackerName: attacker.nome, targetName: target.nome, weaponUsed: weaponType, isRanged: !!weapon.isRanged, finalDamageBreakdown: {} };

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

            // Lifesteal
            const lifestealEffects = attacker.activeEffects.filter(e => e.type === 'lifesteal_buff');
            lifestealEffects.forEach(effect => {
                const healedAmount = Math.floor(totalDamage * effect.percentage);
                if (healedAmount > 0) {
                    attacker.hp = Math.min(attacker.hpMax, attacker.hp + healedAmount);
                    logMessage(state, `${attacker.nome} recupera ${healedAmount} HP com ${effect.name}.`, 'info');
                    io.to(roomId).emit('floatingTextTriggered', { targetId: attacker.id, text: `+${healedAmount} HP`, type: 'heal-hp' });
                }
            });


            const weaponBuffInfo = { total: 0, rolls: {}, breakdown: {} };
            const weaponBuffs = attacker.activeEffects.filter(e => e.type === 'weapon_buff');
            if (weaponBuffs.length > 0) {
                weaponBuffs.forEach(buff => {
                    const buffDamageRoll = rollDice(buff.damageFormula);
                    weaponBuffInfo.total += buffDamageRoll;
                    weaponBuffInfo.rolls[buff.name] = buffDamageRoll;
                    weaponBuffInfo.breakdown[`Rolagem de Dano (${buff.name} - ${buff.damageFormula})`] = buffDamageRoll;
                    logMessage(state, `+${buffDamageRoll} de dano de ${buff.name}!`, 'hit');
                     if (buff.animationOnHit) {
                        io.to(roomId).emit('visualEffectTriggered', { casterId: attacker.id, targetId: target.id, animation: buff.animationOnHit });
                    }
                });
                totalDamage += weaponBuffInfo.total;
            }

            const protectionBreakdown = getProtectionBreakdown(target);
            const targetProtection = protectionBreakdown.value;
            let finalDamage = Math.max(1, totalDamage - targetProtection);

            const finalDamageBuffs = attacker.activeEffects.filter(e => e.type === 'final_damage_buff' || e.type === 'damage_multiplier_buff');
            if (finalDamageBuffs.length > 0) {
                finalDamageBuffs.forEach(buff => {
                    if(buff.type === 'final_damage_buff'){
                        finalDamage += buff.value;
                        debugInfo.finalDamageBreakdown[`Efeito (${buff.name})`] = buff.value;
                        logMessage(state, `+${buff.value} de dano final de ${buff.name}!`, 'hit');
                    } else if (buff.type === 'damage_multiplier_buff') {
                        const multipliedDamage = finalDamage * buff.multiplier;
                        debugInfo.finalDamageBreakdown[`Multiplicador (${buff.name})`] = `x${buff.multiplier}`;
                        logMessage(state, `Dano multiplicado por ${buff.multiplier}x por ${buff.name}! Dano final: ${multipliedDamage}`, 'crit');
                        finalDamage = multipliedDamage;
                    }
                });
            }

            if (target.marks && target.marks.igneous_curse > 0) {
                const markBonus = target.marks.igneous_curse;
                finalDamage += markBonus;
                debugInfo.finalDamageBreakdown[`Marca Ígnea Sombria`] = `+${markBonus}`;
                logMessage(state, `${target.nome} sofre +${markBonus} de dano extra da Marca Ígnea Sombria!`, 'crit');
            }

            let damageNegated = false;
            // Efeitos que acontecem quando o alvo é atingido (Reflexão, Espinhos)
            const onHitEffects = target.activeEffects.filter(e => e.type === 'reflect_damage_buff' || e.onHitReceived?.type === 'reflect_damage');
            onHitEffects.forEach(effect => {
                if (effect.type === 'reflect_damage_buff') {
                    const reflectedDamage = Math.floor(finalDamage * (effect.percentage || 1.0));
                    if (reflectedDamage > 0) {
                        attacker.hp = Math.max(0, attacker.hp - reflectedDamage);
                        logMessage(state, `${attacker.nome} sofreu ${reflectedDamage} de dano refletido por ${effect.name} de ${target.nome}!`, 'hit');
                        io.to(roomId).emit('floatingTextTriggered', { targetId: attacker.id, text: `-${reflectedDamage}`, type: 'damage-hp' });
                        if (effect.percentage >= 1.0) {
                            damageNegated = true;
                        }
                    }
                } else if (effect.onHitReceived?.type === 'reflect_damage') {
                    const thornDamage = rollDice(effect.onHitReceived.damage);
                    if (thornDamage > 0) {
                        attacker.hp = Math.max(0, attacker.hp - thornDamage);
                        logMessage(state, `${attacker.nome} sofreu ${thornDamage} de dano de espinhos de ${effect.name}!`, 'hit');
                        io.to(roomId).emit('floatingTextTriggered', { targetId: attacker.id, text: `-${thornDamage}`, type: 'damage-hp' });
                    }
                }
            });

            if (damageNegated) {
                 logMessage(state, `O dano em ${target.nome} foi completamente anulado pela reflexão!`, 'info');
                 io.to(roomId).emit('floatingTextTriggered', { targetId: target.id, text: `Refletido!`, type: 'status-resist' });
                 finalDamage = 0;
            }

            if (finalDamage > 0) {
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
            }

            // Aplicar efeitos secundários que dependem do acerto
            const onHitBuffs = attacker.activeEffects.filter(e => e.type === 'weapon_buff' && e.onHitEffect);
            onHitBuffs.forEach(buff => {
                if (Math.random() < (buff.onHitEffect.chance || 1.0)) {
                    const tempSpell = { name: buff.name, effect: buff.onHitEffect };
                    applySpellEffect(state, roomId, attacker, target, tempSpell, {});
                    logMessage(state, `Efeito secundário de ${buff.name} ativado em ${target.nome}!`, 'info');
                }
            });
            
            // Efeito especial de Invocação
            if (attacker.isSummon && attacker.specialEffect && attacker.specialEffect.type === 'on_basic_attack') {
                if (Math.random() < attacker.specialEffect.chance) {
                    const owner = getFighter(state, attacker.ownerId);
                    const effectTarget = attacker.specialEffect.effect.target === 'owner' ? owner : target;
                    if(effectTarget) {
                        const tempSpell = { name: attacker.specialEffect.effect.name, effect: attacker.specialEffect.effect };
                        applySpellEffect(state, roomId, attacker, effectTarget, tempSpell, {});
                        logMessage(state, `Efeito especial de ${attacker.nome} (${attacker.specialEffect.effect.name}) ativado!`, 'info');
                    }
                }
            }


            if (target.hp <= 0 && target.status === 'active') {
                target.status = 'down';
                logMessage(state, `${target.nome} foi derrotado!`, 'defeat');
                if (!target.isPlayer && !target.isSummon) {
                    distributeNpcRewards(state, target, roomId);
                } else if (target.isSummon) {
                    // Não remover a invocação aqui para permitir a animação de morte
                } else if (target.isPlayer) {
                    // Remove invocações do jogador derrotado
                    Object.keys(state.fighters.summons).forEach(summonId => {
                        if(state.fighters.summons[summonId].ownerId === target.id) {
                            logMessage(state, `Com a queda de seu mestre, ${state.fighters.summons[summonId].nome} desaparece!`, 'info');
                            state.fighters.summons[summonId].status = 'down'; // Alterado para acionar animação
                        }
                    });
                }
            }

            Object.assign(debugInfo, { hit: true, isCrit, damageFormula: weaponData.damage, damageRoll, critDamage, btd, btdBreakdown: btdBreakdown.details, weaponBuffInfo, totalDamage, targetProtection, protectionBreakdown: protectionBreakdown.details, finalDamage });
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
    let primaryTarget = getFighter(state, targetKey);

    const allSpells = [
        ...(ALL_SPELLS.grade1 || []), ...(ALL_SPELLS.grade2 || []), ...(ALL_SPELLS.grade3 || []),
        ...(ALL_SPELLS.advanced_grade1 || []), ...(ALL_SPELLS.advanced_grade2 || []), ...(ALL_SPELLS.advanced_grade3 || []),
        ...(ALL_SPELLS.grade_combined || [])
    ];
    const spell = allSpells.find(s => s.name === spellName);

    if (!attacker || !spell || attacker.status !== 'active') return;
    
    const paCost = spell.costPA || 1;
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

    // Lógica de Invocação - Verificação
    if (spell.effect.type === 'summon' || spell.effect.type === 'summon_elemental') {
        const existingSummon = Object.values(state.fighters.summons).find(s => s.ownerId === attackerKey && s.status === 'active');
        if (existingSummon) {
            logMessage(state, `${attacker.nome} já possui uma criatura em campo e não pode invocar outra.`, 'miss');
            return io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
        }
    }


    attacker.pa -= paCost;
    attacker.mahou -= spell.costMahou;
    if (spell.cooldown > 0) {
        attacker.cooldowns[spellName] = spell.cooldown + 1;
    }

    // Lógica de Invocação - Execução
    if (spell.effect.type === 'summon' || spell.effect.type === 'summon_elemental') {
        logMessage(state, `${attacker.nome} inicia um ritual de invocação!`, 'info');
        if (spell.effect.type === 'summon') { // Requer escolha
            const summonPool = ALL_SUMMONS[`tier${spell.effect.tier}`];
            const choices = Object.keys(summonPool).map(name => {
                const img = ALL_NPCS[name] ? `/images/lutadores/${name}.png` : '/images/lutadores/default.png';
                return { name, img };
            });
            const socket = io.sockets.sockets.get(attackerKey);
            if (socket) {
                console.log(`[DEBUG] Enviando promptForSummon para ${attacker.nome}`);
                socket.emit('promptForSummon', { tier: spell.effect.tier, choices, spell });
            }
        } else { // Invocação direta
            handleSummon(state, roomId, {
                summonerId: attackerKey,
                spell,
                choice: spell.effect.summonName
            });
        }
        shouldUpdate = false; // A atualização virá do handleSummon
        io.to(roomId).emit('gameUpdate', getFullState(games[roomId])); // Atualiza para gastar PA/Mahou
        return;
    }


    const targets = [];
    switch (spell.targetType) {
        case 'self':
            targets.push(attacker);
            break;
        case 'all_allies':
            if (attacker.isPlayer || attacker.isSummon) {
                targets.push(...Object.values(state.fighters.players).filter(p => p.status === 'active'));
                targets.push(...Object.values(state.fighters.summons).filter(s => s.status === 'active'));
            } else {
                targets.push(...Object.values(state.fighters.npcs).filter(n => n.status === 'active'));
            }
            break;
        case 'all_enemies':
            if (attacker.isPlayer || attacker.isSummon) {
                targets.push(...Object.values(state.fighters.npcs).filter(n => n.status === 'active'));
            } else {
                targets.push(...Object.values(state.fighters.players).filter(p => p.status === 'active'));
                targets.push(...Object.values(state.fighters.summons).filter(s => s.status === 'active'));
            }
            break;
        case 'adjacent_enemy':
            if (primaryTarget) {
                 targets.push(primaryTarget);
                 const primaryTargetIndex = state.npcSlots.indexOf(targetKey);
                 if (primaryTargetIndex !== -1) {
                    if (primaryTargetIndex > 0 && primaryTargetIndex < 4) { // Pega o da esquerda, exceto se for o primeiro ou o quinto
                        const leftNpc = getFighter(state, state.npcSlots[primaryTargetIndex - 1]);
                        if(leftNpc && leftNpc.status === 'active') targets.push(leftNpc);
                    }
                    if (primaryTargetIndex < 3) { // Pega o da direita, exceto se for o último dos 4 ou o quinto
                        const rightNpc = getFighter(state, state.npcSlots[primaryTargetIndex + 1]);
                        if(rightNpc && rightNpc.status === 'active') targets.push(rightNpc);
                    }
                 }
            }
            break;
        default: // single_enemy, single_ally, single_target
            if (primaryTarget && primaryTarget.status === 'active') {
                targets.push(primaryTarget);
            }
            break;
    }

    if (targets.length === 0) {
        logMessage(state, `${attacker.nome} usa ${spellName}, mas não há alvos válidos.`, 'miss');
        io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
        return;
    }

    logMessage(state, `${attacker.nome} usa ${spellName}!`, 'info');
    if (spell.effect?.animationOnCast) {
        io.to(roomId).emit('visualEffectTriggered', { 
            casterId: attacker.id, 
            targetId: primaryTarget?.id || attacker.id,
            animation: spell.effect.animationOnCast 
        });
    }

    const debugReports = [];
    targets.forEach(target => {
        const isMagicalCalculation = spell.effect?.calculation === 'magical';

        if (spell.requiresHitRoll === false) {
            const debugInfo = { attackerName: attacker.nome, targetName: target.nome, spellName: spell.name, hit: true, autoHit: true };
            applySpellEffect(state, roomId, attacker, target, spell, debugInfo);
            debugReports.push(debugInfo);
            return;
        }

        const hitRoll = rollD20();
        let attackBonus, attackBonusBreakdown, targetDefense, targetDefenseBreakdown;

        if (isMagicalCalculation) {
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
            hitRoll, attackBonus, attackBonusBreakdown, attackRoll, targetDefense, targetDefenseBreakdown, isMagicalCalculation
        };

        if (hitRoll === 1) {
            logMessage(state, `${attacker.nome} erra a magia ${spellName} em ${target.nome} (Erro Crítico)!`, 'miss');
            Object.assign(debugInfo, { hit: false, isCritFail: true });
        } else if (hitRoll === 20 || attackRoll >= targetDefense) {
            const isCrit = hitRoll === 20;
            if(isCrit) logMessage(state, `Acerto Crítico com ${spellName} em ${target.nome}!`, 'crit');
            else logMessage(state, `${attacker.nome} acerta a magia ${spellName} em ${target.nome}!`, 'hit');
            
            debugInfo.isCrit = isCrit;
            applySpellEffect(state, roomId, attacker, target, spell, debugInfo);
        } else {
            logMessage(state, `${attacker.nome} erra a magia ${spellName} em ${target.nome}!`, 'miss');
            Object.assign(debugInfo, { hit: false });
        }
        debugReports.push(debugInfo);
    });
    
    io.to(roomId).emit('spellResolved', { debugReports });
    setTimeout(() => io.to(roomId).emit('gameUpdate', getFullState(games[roomId])), 1000);
}

function applySpellEffect(state, roomId, attacker, target, spell, debugInfo) {
    let effectModifier = 0;
    if (attacker.sheet.race === 'Tulku' && spell.element === 'luz') {
        effectModifier -= 1; logMessage(state, `A natureza Tulku de ${attacker.nome} enfraquece a magia de Luz!`, 'info');
    }
    if (attacker.sheet.race === 'Anjo' && spell.effect.type === 'heal') {
        effectModifier += 1; logMessage(state, `A natureza angelical de ${attacker.nome} fortalece a magia de cura!`, 'info');
    }
    if (attacker.sheet.race === 'Demônio' && spell.element === 'escuridao') {
        effectModifier += 1; logMessage(state, `O poder demoníaco de ${attacker.nome} fortalece a magia de Escuridão!`, 'info');
    }

    if (target.sheet.race === 'Demônio' && (spell.effect.type === 'heal' || spell.effect.type === 'hot')) {
        effectModifier -= 1;
    }

    const applySubEffect = (effect, currentTarget) => {
        switch (effect.type) {
            case 'buff':
            case 'debuff':
            case 'final_damage_buff':
            case 'damage_multiplier_buff':
            case 'btd_buff':
            case 'bta_buff':
            case 'bta_debuff':
            case 'lifesteal_buff':
            case 'reflect_damage_buff':
            case 'spell_shield':
                const newEffect = { name: spell.name, ...effect, duration: effect.duration + 1 };
                currentTarget.activeEffects.push(newEffect);
                recalculateFighterStats(currentTarget);
                break;
            case 'heal':
                let subHealAmount = rollDice(effect.formula);
                if (effect.bonusAttribute) {
                    subHealAmount += getAttributeBreakdown(attacker, effect.bonusAttribute).value;
                }
                const subHealedAmount = Math.min(currentTarget.hpMax - currentTarget.hp, subHealAmount);
                if (subHealedAmount > 0) {
                    currentTarget.hp += subHealedAmount;
                    io.to(roomId).emit('floatingTextTriggered', { targetId: currentTarget.id, text: `+${subHealedAmount} HP`, type: 'heal-hp' });
                }
                break;
            case 'resource_heal':
                if (effect.resource === 'pa') {
                    currentTarget.pa += effect.amount;
                }
                break;
        }
    };

    switch(spell.effect.type) {
        case 'direct_damage':
            let damageRoll = rollDice(spell.effect.damageFormula);
            let levelBonus = 0;
            if (spell.effect.damageBonus === 'level') {
                levelBonus = attacker.level;
            }
            
            const critDamage = debugInfo.isCrit ? damageRoll : 0;
            
            let damageBonus, damageBonusBreakdown;
            if (spell.effect.calculation === 'magical') {
                const btmData = getBtmBreakdown(attacker);
                damageBonus = btmData.value;
                damageBonusBreakdown = btmData.details;
            } else { // Physical spell
                const btdData = getBtdBreakdown(attacker, 'weapon1'); // Assume weapon1 for calculation base
                damageBonus = btdData.value;
                damageBonusBreakdown = btdData.details;
            }

            const targetProtectionBreakdown = getProtectionBreakdown(target);
            const targetProtection = targetProtectionBreakdown.value;
            const totalDamage = damageRoll + levelBonus + critDamage + damageBonus + effectModifier;
            const finalDamage = Math.max(1, totalDamage - targetProtection);
            
            target.hp = Math.max(0, target.hp - finalDamage);
            io.to(roomId).emit('floatingTextTriggered', { targetId: target.id, text: `-${finalDamage}`, type: 'damage-hp' });
            logMessage(state, `${spell.name} causa ${finalDamage} de dano em ${target.nome}!`, 'hit');

            if (spell.effect.secondaryEffect) {
                if (Math.random() < (spell.effect.secondaryEffect.chance || 1.0)) {
                    applySpellEffect(state, roomId, attacker, target, { name: spell.name, effect: spell.effect.secondaryEffect }, {});
                    logMessage(state, `Efeito secundário de ${spell.name} ativado em ${target.nome}!`, 'info');
                }
            }
            if (spell.effect.selfEffect) {
                 applySpellEffect(state, roomId, attacker, attacker, { name: spell.name, effect: spell.effect.selfEffect }, {});
            }

            if(target.hp <= 0 && target.status === 'active') {
                 target.status = 'down';
                 logMessage(state, `${target.nome} foi derrotado!`, 'defeat');
                if (!target.isPlayer && !target.isSummon) {
                    distributeNpcRewards(state, target, roomId);
                } else if (target.isSummon) {
                    // Não remover a invocação aqui para permitir a animação de morte
                }
            }
            Object.assign(debugInfo, { hit: true, damageFormula: spell.effect.damageFormula, damageRoll, levelBonus, critDamage, damageBonus, damageBonusBreakdown, totalDamage, targetProtection, protectionBreakdown: targetProtectionBreakdown.details, finalDamage });
            break;
        
        case 'heal':
            let healAmount = rollDice(spell.effect.formula);
            if (spell.effect.bonusAttribute) {
                healAmount += getAttributeBreakdown(attacker, spell.effect.bonusAttribute).value;
            }
            healAmount += effectModifier;
            healAmount = Math.max(0, healAmount);

            const healedAmount = Math.min(target.hpMax - target.hp, healAmount);
            if (healedAmount > 0) {
                target.hp += healedAmount;
                logMessage(state, `${target.nome} é curado por ${spell.name} e recupera ${healedAmount} de HP.`, 'info');
                io.to(roomId).emit('floatingTextTriggered', { targetId: target.id, text: `+${healedAmount} HP`, type: 'heal-hp' });
            }
            Object.assign(debugInfo, { hit: true, healedAmount });
            break;
        
        case 'hot':
            target.activeEffects.push({
                name: spell.name,
                type: 'hot',
                duration: spell.effect.duration + 1,
                heal: spell.effect.heal,
                bonusAttribute: spell.effect.bonusAttribute,
                casterId: attacker.id
            });
            break;

        case 'resource_damage':
            if (Math.random() > (spell.effect.resistChance || 0)) {
                let resourceDamage = rollDice(spell.effect.damageFormula);
                target.mahou = Math.max(0, target.mahou - resourceDamage);
                io.to(roomId).emit('floatingTextTriggered', { targetId: target.id, text: `-${resourceDamage}`, type: 'damage-mahou' });
                logMessage(state, `${spell.name} drena ${resourceDamage} de Mahou de ${target.nome}!`, 'hit');

                if (spell.name === 'Dreno de Energia' || spell.effect.selfEffect?.type === 'resource_heal_per_target') {
                    const healAmount = spell.effect.selfEffect?.amount || 1;
                    attacker.mahou = Math.min(attacker.mahouMax, attacker.mahou + healAmount);
                }

                Object.assign(debugInfo, { hit: true, damageFormula: spell.effect.damageFormula, damageRoll: resourceDamage, resourceDamage });
            } else {
                io.to(roomId).emit('floatingTextTriggered', { targetId: target.id, text: `Resistiu`, type: 'status-resist' });
                logMessage(state, `${target.nome} resistiu ao Dano de Energia!`, 'info');
                Object.assign(debugInfo, { hit: false });
            }
            break;
        
        case 'buff':
        case 'debuff':
        case 'final_damage_buff':
        case 'damage_multiplier_buff':
        case 'btd_buff':
        case 'bta_buff':
        case 'bta_debuff':
        case 'lifesteal_buff':
        case 'reflect_damage_buff':
        case 'spell_shield':
            const newEffect = {
                name: spell.name,
                type: spell.effect.type,
                duration: spell.effect.duration + 1,
                ...spell.effect
            };
            target.activeEffects.push(newEffect);
            recalculateFighterStats(target);
            break;

        case 'random_debuff':
            if (Math.random() < (spell.effect.chance || 1.0)) {
                const attributes = spell.effect.attributes;
                const randomAttr = attributes[Math.floor(Math.random() * attributes.length)];
                target.activeEffects.push({
                    name: spell.name,
                    type: 'debuff',
                    duration: spell.effect.duration + 1,
                    modifiers: [{ attribute: randomAttr, value: spell.effect.value }]
                });
                logMessage(state, `${target.nome} teve seu atributo ${randomAttr} reduzido por ${spell.name}!`, 'info');
                recalculateFighterStats(target);
            } else {
                 logMessage(state, `${target.nome} resistiu a ${spell.name}!`, 'info');
            }
            break;

        case 'stacking_debuff':
            for (let i = 1; i <= spell.effect.duration; i++) {
                target.activeEffects.push({
                    name: `${spell.name} (Turno ${i})`,
                    type: 'debuff',
                    duration: i + 1,
                    modifiers: [{ attribute: spell.effect.attribute, value: spell.effect.value * i }]
                });
            }
            recalculateFighterStats(target);
            break;
            
        case 'multi_effect':
            if (Math.random() < (spell.effect.chance || 1.0)) {
                spell.effect.effects.forEach(subEffect => {
                    const subTarget = subEffect.target === 'self' ? attacker : target;
                    applySubEffect(subEffect, subTarget);
                });
            } else {
                 logMessage(state, `${target.nome} resistiu ao efeito de ${spell.name}.`, 'miss');
            }
            break;


        case 'weapon_buff':
            attacker.activeEffects.push({
                name: spell.name,
                type: 'weapon_buff',
                duration: spell.effect.duration + 1,
                damageFormula: spell.effect.damageFormula,
                animationOnHit: spell.effect.animationOnHit,
                onHitEffect: spell.effect.onHitEffect, 
                onCrit: spell.effect.onCrit
            });
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
        
        case 'apply_mark':
            if (!target.marks[spell.effect.markType]) {
                target.marks[spell.effect.markType] = 0;
            }
            target.marks[spell.effect.markType]++;
            logMessage(state, `${target.nome} recebe uma ${spell.effect.markType}! (Total: ${target.marks[spell.effect.markType]})`, 'info');
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
            return getAttributeBreakdown(b, 'agilidade').value - getAttributeBreakdown(a, 'agilidade').value;
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

function createInventoryFromEquipment(equipment, addStartingItems = false) {
    const inventory = {};
    const ammunition = {};
    const newEquipment = JSON.parse(JSON.stringify(equipment));

    const addItem = (item, type, slotKey) => {
        const baseType = item.type;
        if (!baseType || ['Desarmado', 'Nenhuma', 'Nenhum'].includes(baseType)) {
            return;
        }
    
        let finalName = item.name;
        if (inventory[finalName]) {
            let count = 2;
            let potentialName = `${item.name.replace(/ \(\d+\)$/, '')} (${count})`; // Remove old count if exists
            while (inventory[potentialName]) {
                count++;
                potentialName = `${item.name.replace(/ \(\d+\)$/, '')} (${count})`;
            }
            finalName = potentialName;
            item.name = finalName; // Atualiza o nome no objeto de equipamento também.
        }
    
        inventory[finalName] = { type, name: finalName, baseType, quantity: 1, img: item.img, isRanged: item.isRanged };
    
        if (item.isRanged && slotKey) {
            ammunition[slotKey] = 15;
        }
    };

    addItem(newEquipment.weapon1, 'weapon', 'weapon1');
    addItem(newEquipment.weapon2, 'weapon', 'weapon2');

    if (newEquipment.armor && newEquipment.armor !== 'Nenhuma') {
        addItem({ name: newEquipment.armor, type: 'armor' }, 'armor', null);
    }
    if (newEquipment.shield && newEquipment.shield !== 'Nenhum') {
        addItem({ name: newEquipment.shield, type: 'shield' }, 'shield', null);
    }

    if (addStartingItems) {
        const hpPotion = "Poção de HP menor";
        const mahouPotion = "Poção de Mahou menor";
        if (ALL_ITEMS[hpPotion]) {
            inventory[hpPotion] = { name: hpPotion, type: 'potion', quantity: 1, ...ALL_ITEMS[hpPotion] };
        }
        if (ALL_ITEMS[mahouPotion]) {
            inventory[mahouPotion] = { name: mahouPotion, type: 'potion', quantity: 1, ...ALL_ITEMS[mahouPotion] };
        }
    }

    return { inventory, ammunition, updatedEquipment: newEquipment };
}


io.on('connection', (socket) => {
    socket.emit('initialData', { 
        rules: GAME_RULES,
        spells: ALL_SPELLS,
        weaponImages: ALL_WEAPON_IMAGES,
        items: ALL_ITEMS, 
        summons: ALL_SUMMONS,
        playerImages: ALL_PLAYER_IMAGES,
        characters: { 
            players: PLAYABLE_CHARACTERS,
            npcs: Object.keys(ALL_NPCS).map(name => ({ 
                name, img: `/images/lutadores/${name}.png`, 
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
            socketId: socket.id, // Adiciona o socketId para referência
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

                    const adventureState = room.gameModes.adventure;
                    for (const playerId in adventureState.fighters.players) {
                        const adventureFighter = adventureState.fighters.players[playerId];
                        const lobbyPlayer = lobbyState.connectedPlayers[playerId];

                        if (adventureFighter && lobbyPlayer && lobbyPlayer.characterSheet) {
                            adventureFighter.sheet = lobbyPlayer.characterSheet;
                            
                            adventureFighter.money = lobbyPlayer.characterSheet.money;
                            adventureFighter.inventory = lobbyPlayer.characterSheet.inventory;
                            adventureFighter.ammunition = lobbyPlayer.characterSheet.ammunition;
                            
                            recalculateFighterStats(adventureFighter);
                        }
                    }
                    logMessage(adventureState, "Continuando a aventura com as fichas dos jogadores atualizadas.");

                } else { 
                    room.gameModes.adventure = createNewAdventureState(lobbyState.gmId, lobbyState.connectedPlayers);
                    room.adventureCache = null; 
                    logMessage(room.gameModes.adventure, "Mestre iniciou uma nova batalha.");
                }
                room.activeMode = 'adventure';
            }
        }
        
        if (action.type === 'playerFinalizesCharacter') {
            const playerInfo = lobbyState.connectedPlayers[socket.id];
            if (playerInfo) {
                const characterData = action.characterData;
                characterData.equipment.weapon1.isRanged = action.isRanged.weapon1;
                characterData.equipment.weapon1.img = action.weaponImages.weapon1;
                characterData.equipment.weapon2.isRanged = action.isRanged.weapon2;
                characterData.equipment.weapon2.img = action.weaponImages.weapon2;
                
                const { inventory, ammunition, updatedEquipment } = createInventoryFromEquipment(characterData.equipment, true); 
                characterData.inventory = inventory;
                characterData.ammunition = ammunition;
                characterData.equipment = updatedEquipment;
        
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

                if (!characterData.inventory) {
                    const { inventory, ammunition, updatedEquipment } = createInventoryFromEquipment(characterData.equipment, true);
                    characterData.inventory = inventory;
                    characterData.ammunition = ammunition;
                    characterData.equipment = updatedEquipment;
                }
                
                playerInfo.characterSheet = characterData;
                playerInfo.characterName = characterData.name;
                
                if (room.activeMode === 'adventure' && room.gameModes.adventure.fighters.players[socket.id]) {
                    const existingFighter = room.gameModes.adventure.fighters.players[socket.id];
                    const updatedFighter = createNewFighterState({ 
                        id: socket.id, 
                        isPlayer: true,
                        sheetData: characterData
                    });
                    updatedFighter.pa = existingFighter.pa;
                    updatedFighter.status = existingFighter.status;
                    updatedFighter.activeEffects = existingFighter.activeEffects;
                    room.gameModes.adventure.fighters.players[socket.id] = updatedFighter;
                }

                logMessage(lobbyState, `Jogador ${playerInfo.characterName} carregou uma nova ficha.`);
            }
        }
        
        if (action.type === 'playerDistributesPoints') {
            const playerInfo = lobbyState.connectedPlayers[socket.id];
            if (playerInfo && playerInfo.characterSheet) {
                const sheet = playerInfo.characterSheet;
                const data = action.data;

                // Validação de segurança
                if (data.attrPointsSpent > sheet.unallocatedAttrPoints || data.elemPointsSpent > sheet.unallocatedElemPoints) {
                    return; // Tentativa de gastar mais pontos do que o disponível
                }
                
                sheet.unallocatedAttrPoints -= data.attrPointsSpent;
                sheet.unallocatedElemPoints -= data.elemPointsSpent;
                
                // Atualiza atributos base
                for (const attr in data.newBaseAttributes) {
                    sheet.baseAttributes[attr] = data.newBaseAttributes[attr];
                }
                // Atualiza elementos base
                for (const elem in data.newBaseElements) {
                    sheet.elements[elem] = data.newBaseElements[elem];
                }
                
                // Adiciona novas magias
                if (data.newSpells && Array.isArray(data.newSpells)) {
                    data.newSpells.forEach(spellChoice => {
                        if (!sheet.spells.includes(spellChoice.spellName)) {
                            sheet.spells.push(spellChoice.spellName);
                            // Remove a escolha disponível
                            const choiceIndex = sheet.spellChoicesAvailable.findIndex(c => c.grade === spellChoice.grade);
                            if (choiceIndex > -1) {
                                sheet.spellChoicesAvailable.splice(choiceIndex, 1);
                            }
                        }
                    });
                }
                
                // Recalcula atributos finais
                 const raceData = GAME_RULES.races[sheet.race];
                 sheet.finalAttributes = { ...sheet.baseAttributes };
                 if (raceData && raceData.bon) Object.keys(raceData.bon).forEach(attr => { if(attr !== 'escolha') sheet.finalAttributes[attr] += raceData.bon[attr]; });
                 if (raceData && raceData.pen) Object.keys(raceData.pen).forEach(attr => sheet.finalAttributes[attr] += raceData.pen[attr]);
                
                // Atualiza o fighter se estiver em batalha
                if(room.activeMode === 'adventure' && activeState.fighters.players[socket.id]) {
                    const fighter = activeState.fighters.players[socket.id];
                    fighter.sheet = sheet; // Sincroniza a ficha
                    recalculateFighterStats(fighter); // Recalcula HP/Mahou/etc.
                }

                logMessage(lobbyState, `${sheet.name} distribuiu seus pontos de nível.`, 'info');
            }
        }


        if (action.type === 'discardItem') {
            const playerInfo = lobbyState.connectedPlayers[socket.id];
            if (playerInfo && playerInfo.characterSheet.inventory[action.itemName]) {
                delete playerInfo.characterSheet.inventory[action.itemName];
                logMessage(activeState, `${playerInfo.characterName} descartou ${action.itemName}.`);
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
                            const npc = getFighter(adventureState, action.fighterId);
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

                                npc.xpReward = action.stats.xpReward;
                                npc.moneyReward = action.stats.moneyReward;
                                if (action.stats.scale !== undefined) {
                                    npc.scale = parseFloat(action.stats.scale);
                                }

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
                            adventureState.fighters.summons = {};
                            adventureState.npcSlots.fill(null);
                            adventureState.customPositions = {};
                            action.npcs.forEach((npcData, index) => {
                                if (index < MAX_NPCS) {
                                    const npcObj = ALL_NPCS[npcData.name] || {};
                                    const newNpc = createNewFighterState({ 
                                        ...npcData, 
                                        isMultiPart: npcObj.isMultiPart, 
                                        parts: npcObj.parts, 
                                        customStats: npcData.customStats,
                                        xpReward: npcData.customStats.xpReward,
                                        moneyReward: npcData.customStats.moneyReward
                                    });
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
                                    const agilidade = getAttributeBreakdown(fighter, 'agilidade').value;
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
                    case 'playerSummonsCreature':
                        if (adventureState.phase === 'battle' && action.summonerId === adventureState.activeCharacterKey) {
                            handleSummon(adventureState, roomId, action);
                            shouldUpdate = false;
                        }
                        break;
                    case 'dismiss_summon':
                        const summon = getFighter(adventureState, action.summonKey);
                        if (summon && summon.isSummon && summon.ownerId === socket.id && adventureState.activeCharacterKey === action.summonKey) {
                            logMessage(adventureState, `${summon.nome} foi dispensado por seu mestre.`, 'info');
                            summon.status = 'down';
                            checkGameOver(adventureState);
                            io.to(roomId).emit('gameUpdate', getFullState(room));
                            setTimeout(() => advanceTurn(adventureState, roomId), 1500);
                            shouldUpdate = false;
                        }
                        break;
                    case 'useItem': 
                        if (adventureState.phase === 'battle' && action.actorKey === adventureState.activeCharacterKey) {
                            const actor = getFighter(adventureState, action.actorKey);
                            const itemData = ALL_ITEMS[action.itemName];
                            if (actor && actor.sheet.inventory[action.itemName] && itemData && itemData.isUsable) {
                                if(actor.pa >= itemData.costPA) {
                                    actor.pa -= itemData.costPA;
                                    
                                    const itemInInventory = actor.sheet.inventory[action.itemName];
                                    itemInInventory.quantity--;
                                    if (itemInInventory.quantity <= 0) {
                                        delete actor.sheet.inventory[action.itemName];
                                    }

                                    let healedHp = 0;
                                    let healedMahou = 0;

                                    if(itemData.effect.type === 'heal_hp' || itemData.effect.type === 'heal_total'){
                                        const hpAmount = rollDice(itemData.effect.hp_formula || itemData.effect.formula);
                                        healedHp = Math.min(actor.hpMax - actor.hp, hpAmount);
                                        actor.hp += healedHp;
                                        io.to(roomId).emit('floatingTextTriggered', { targetId: actor.id, text: `+${healedHp} HP`, type: 'heal-hp' });
                                    }
                                     if(itemData.effect.type === 'heal_mahou' || itemData.effect.type === 'heal_total'){
                                        const mahouAmount = rollDice(itemData.effect.mahou_formula || itemData.effect.formula);
                                        healedMahou = Math.min(actor.mahouMax - actor.mahou, mahouAmount);
                                        actor.mahou += healedMahou;
                                        io.to(roomId).emit('floatingTextTriggered', { targetId: actor.id, text: `+${healedMahou} Mahou`, type: 'heal-mahou' });
                                    }

                                    logMessage(adventureState, `${actor.nome} usou ${action.itemName} e recuperou ${healedHp > 0 ? `${healedHp} HP` : ''}${healedHp > 0 && healedMahou > 0 ? ' e ' : ''}${healedMahou > 0 ? `${healedMahou} Mahou` : ''}.`, 'info');
                                } else {
                                    logMessage(adventureState, `${actor.nome} não tem PA suficiente para usar ${action.itemName}.`, 'miss');
                                }
                            }
                        }
                        break;
                    case 'flee':
                         if (adventureState.phase === 'battle' && action.actorKey === adventureState.activeCharacterKey) {
                             const actor = getFighter(adventureState, action.actorKey);
                             if(actor) {
                                 actor.status = 'fled';
                                 logMessage(adventureState, `${actor.nome} fugiu da batalha!`, 'info');
                                 io.to(roomId).emit('fleeResolved', { actorKey: action.actorKey });
                                 // Remove invocações do jogador que fugiu
                                 Object.keys(adventureState.fighters.summons).forEach(summonId => {
                                     if(adventureState.fighters.summons[summonId].ownerId === actor.id) {
                                         logMessage(adventureState, `Com a fuga de seu mestre, ${adventureState.fighters.summons[summonId].nome} desaparece!`, 'info');
                                         adventureState.fighters.summons[summonId].status = 'down'; // Alterado para acionar animação
                                     }
                                 });
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
                 if (action.type === 'useUtilitySpell') {
                    const casterInfo = lobbyState.connectedPlayers[action.casterId];
                    const targetInfo = lobbyState.connectedPlayers[action.targetId];
                    const allSpells = [...(ALL_SPELLS.grade1 || []), ...(ALL_SPELLS.grade2 || []), ...(ALL_SPELLS.grade3 || []), ...(ALL_SPELLS.advanced_grade1 || []), ...(ALL_SPELLS.advanced_grade2 || []), ...(ALL_SPELLS.advanced_grade3 || []), ...(ALL_SPELLS.grade_combined || [])];
                    const spell = allSpells.find(s => s.name === action.spellName);

                    if (casterInfo && targetInfo && spell && casterInfo.characterSheet.mahou >= spell.costMahou) {
                        casterInfo.characterSheet.mahou -= spell.costMahou;
                        
                        let effectText = null;
                        let element = spell.element;

                        if (spell.effect.type === 'heal') {
                            let healAmount = rollDice(spell.effect.formula);
                            if (spell.effect.bonusAttribute) {
                                healAmount += casterInfo.characterSheet.finalAttributes[spell.effect.bonusAttribute] || 0;
                            }
                            
                            const targetSheet = targetInfo.characterSheet;
                            const constituicao = targetSheet.finalAttributes.constituicao || 0;
                            const hpMax = 20 + (constituicao * 5);
                            const actualHealed = Math.min(hpMax - (targetSheet.hp || hpMax), healAmount);
                            targetSheet.hp = (targetSheet.hp || hpMax) + actualHealed;
                            effectText = `+${actualHealed} HP`;
                        }
                        
                        io.to(roomId).emit('globalAnnounceEffect', {
                            casterName: casterInfo.characterName,
                            targetName: targetInfo.characterName,
                            spellName: spell.name,
                            effectText: effectText,
                            costText: `-${spell.costMahou} Mahou`,
                            element: spell.element
                        });

                        logMessage(theaterState, `${casterInfo.characterName} usou ${action.spellName} em ${targetInfo.characterName}.`);
                    }
                 }
                 if (action.type === 'useItem') { 
                    const actorSheet = lobbyState.connectedPlayers[socket.id]?.characterSheet;
                    const itemData = ALL_ITEMS[action.itemName];
                    if (actorSheet && actorSheet.inventory[action.itemName] && itemData && itemData.isUsable) {
                        const itemInInventory = actorSheet.inventory[action.itemName];
                        itemInInventory.quantity--;
                        if (itemInInventory.quantity <= 0) {
                            delete actorSheet.inventory[action.itemName];
                        }
                        
                        let healedHp = 0;
                        let healedMahou = 0;
                        const constituicao = actorSheet.finalAttributes.constituicao || 0;
                        const mente = actorSheet.finalAttributes.mente || 0;
                        const hpMax = 20 + (constituicao * 5);
                        const mahouMax = 10 + (mente * 5);

                        if(itemData.effect.type === 'heal_hp' || itemData.effect.type === 'heal_total'){
                            const hpAmount = rollDice(itemData.effect.hp_formula || itemData.effect.formula);
                            healedHp = Math.min(hpMax - (actorSheet.hp || hpMax), hpAmount);
                            actorSheet.hp = (actorSheet.hp || hpMax) + healedHp;
                        }
                         if(itemData.effect.type === 'heal_mahou' || itemData.effect.type === 'heal_total'){
                            const mahouAmount = rollDice(itemData.effect.mahou_formula || itemData.effect.formula);
                            healedMahou = Math.min(mahouMax - (actorSheet.mahou || mahouMax), mahouAmount);
                            actorSheet.mahou = (actorSheet.mahou || mahouMax) + healedMahou;
                        }
                        logMessage(theaterState, `${actorSheet.name} usou ${action.itemName} fora de combate.`, 'info');
                    }
                 }
                 if (isGm) {
                     switch(action.type) {
                        case 'gmUpdatesShop':
                            if (theaterState.shop && action.items) {
                                theaterState.shop.gmItems = action.items;
                                shouldUpdate = false; 
                            }
                            break;
                        case 'gmPublishesShop':
                            if (theaterState.shop) {
                                theaterState.shop.playerItems = Object.values(action.items);
                                theaterState.shop.isOpen = true;
                                logMessage(theaterState, 'O Mestre abriu a loja.');
                            }
                            break;
                        case 'gmClosesShop':
                            if (theaterState.shop) {
                                theaterState.shop.isOpen = false;
                                logMessage(theaterState, 'O Mestre fechou a loja.');
                            }
                            break;
                        case 'gmAwardsRewards':
                            if (action.awards && Array.isArray(action.awards)) {
                                action.awards.forEach(award => {
                                    const { playerId, xp, money, hp, mahou } = award;
                                    const playerInfo = lobbyState.connectedPlayers[playerId];
                                    if (playerInfo && playerInfo.characterSheet) {
                                        const sheet = playerInfo.characterSheet;
                                        const finalXp = parseInt(xp, 10) || 0;
                                        const finalMoney = parseInt(money, 10) || 0;
                                        const finalHp = parseInt(hp, 10) || 0;
                                        const finalMahou = parseInt(mahou, 10) || 0;
                                        
                                        sheet.xp += finalXp;
                                        sheet.money += finalMoney;

                                        const consti = sheet.finalAttributes.constituicao || 0;
                                        const mente = sheet.finalAttributes.mente || 0;
                                        const hpMax = 20 + (consti * 5);
                                        const mahouMax = 10 + (mente * 5);

                                        sheet.hp = Math.max(0, Math.min(hpMax, (sheet.hp || hpMax) + finalHp));
                                        sheet.mahou = Math.max(0, Math.min(mahouMax, (sheet.mahou || mahouMax) + finalMahou));

                                        if(room.activeMode === 'adventure' && room.gameModes.adventure.fighters.players[playerId]){
                                            const adventureFighter = room.gameModes.adventure.fighters.players[playerId];
                                            adventureFighter.xp = sheet.xp;
                                            adventureFighter.money = sheet.money;
                                            adventureFighter.hp = sheet.hp;
                                            adventureFighter.mahou = sheet.mahou;
                                        }

                                        let logParts = [];
                                        if (finalXp !== 0) logParts.push(`${finalXp} XP`);
                                        if (finalMoney !== 0) logParts.push(`${finalMoney} moedas`);
                                        if (finalHp !== 0) logParts.push(`${finalHp > 0 ? '+' : ''}${finalHp} HP`);
                                        if (finalMahou !== 0) logParts.push(`${finalMahou > 0 ? '+' : ''}${finalMahou} Mahou`);

                                        if (logParts.length > 0) {
                                            logMessage(theaterState, `GM concedeu ${logParts.join(', ')} para ${playerInfo.characterName}.`, 'info');
                                        }
                                        const playerSocket = io.sockets.sockets.get(playerId);
                                        if(playerSocket) {
                                            checkForLevelUp(playerInfo, playerSocket, roomId);
                                        }
                                    }
                                });
                            }
                            break;
                     }
                 }
                 if (action.type === 'playerBuysItem') {
                    const playerInfo = lobbyState.connectedPlayers[socket.id];
                    const shopItem = theaterState.shop.gmItems[action.itemId];

                    if (playerInfo && playerInfo.characterSheet && shopItem && shopItem.quantity > 0) {
                        const isFreeItem = shopItem.price === 0;
                        const quantityToTake = isFreeItem ? 1 : action.quantity;
                        const totalCost = isFreeItem ? 0 : shopItem.price * quantityToTake;
                        

                        if (playerInfo.characterSheet.money >= totalCost && quantityToTake <= shopItem.quantity) {
                            
                            playerInfo.characterSheet.money -= totalCost;
                            
                            if (isFreeItem) {
                                shopItem.quantity = 0; // Remove all stock for free items
                            } else {
                                shopItem.quantity -= quantityToTake;
                            }

                            const playerInv = playerInfo.characterSheet.inventory;
                            const itemData = shopItem.itemData;
                            const newItem = {
                                ...itemData,
                                name: itemData.name,
                                baseType: itemData.baseType || itemData.name,
                                quantity: quantityToTake
                            };

                            if (!newItem.img) {
                                 if (newItem.type === 'armor' && newItem.name !== 'Nenhuma') {
                                    const armorImgName = newItem.name === 'Mediana' ? 'Armadura Mediana' : `Armadura ${newItem.name}`;
                                    newItem.img = `/images/armas/${armorImgName}.png`.replace(/ /g, '%20');
                                } else if (newItem.type === 'shield' && newItem.name !== 'Nenhum') {
                                     const shieldImgName = newItem.name === 'Médio' ? 'Escudo Medio' : `Escudo ${newItem.name}`;
                                     newItem.img = `/images/armas/${shieldImgName}.png`.replace(/ /g, '%20');
                                }
                            }
                            
                            if (playerInv[newItem.name]) {
                                playerInv[newItem.name].quantity += quantityToTake;
                            } else {
                                playerInv[newItem.name] = newItem;
                            }

                            if (shopItem.quantity <= 0) {
                                delete theaterState.shop.gmItems[action.itemId];
                            }
                            
                            theaterState.shop.playerItems = Object.values(theaterState.shop.gmItems);
                            
                            logMessage(theaterState, `${playerInfo.characterName} ${isFreeItem ? 'pegou' : 'comprou'} ${quantityToTake}x ${shopItem.name}.`);
                        }
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
             // Remove invocações do jogador desconectado
            Object.keys(adventureState.fighters.summons).forEach(summonId => {
                if(adventureState.fighters.summons[summonId].ownerId === socket.id) {
                    logMessage(adventureState, `Com a desconexão de seu mestre, ${adventureState.fighters.summons[summonId].nome} desaparece!`, 'info');
                    adventureState.fighters.summons[summonId].status = 'down'; // Alterado para acionar animação
                }
            });
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