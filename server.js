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

// --- CARREGAMENTO CENTRALIZADO DE DADOS DO JOGO ---
let ALL_NPCS = {};
let PLAYABLE_TOKENS = [];
let DYNAMIC_CHARACTERS = [];
let ALL_SCENARIOS = {};
let GAME_DATA = { races: {}, spells: {}, equipment: {} };

try {
    const charactersData = fs.readFileSync('characters.json', 'utf8');
    const characters = JSON.parse(charactersData);
    PLAYABLE_TOKENS = characters.players.map(p => ({ name: p, img: `images/players/${p}.png` })) || [];
    ALL_NPCS = characters.npcs || {}; 

    GAME_DATA.races = JSON.parse(fs.readFileSync('races.json', 'utf8'));
    GAME_DATA.spells = JSON.parse(fs.readFileSync('spells.json', 'utf8'));
    GAME_DATA.equipment = JSON.parse(fs.readFileSync('equipment.json', 'utf8'));

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

} catch (error) { console.error('Erro fatal ao carregar arquivos de configuração:', error); process.exit(1); }

const games = {};
const MAX_PLAYERS = 4;

// --- FUNÇÕES DE UTILIDADE ---
function logMessage(state, text, type = 'info') {
    if (!state.log) state.log = [];
    state.log.unshift({ text, type, time: new Date().toLocaleTimeString() });
    if (state.log.length > 100) state.log.pop();
}

function getFighter(state, key) {
    if (!key || !state || !state.fighters) return null;
    return state.fighters.players[key] || state.fighters.npcs[key];
}

function rollD(sides) { return Math.floor(Math.random() * sides) + 1; }

// --- LÓGICA DE CRIAÇÃO DE ESTADO ---

function createNewLobbyState(gmId) { 
    return { 
        mode: 'lobby', 
        phase: 'waiting_players', 
        gmId: gmId, 
        connectedPlayers: {}, 
        log: [{ text: "Lobby criado. Aguardando jogadores..." }], 
    }; 
}

function createNewPlayerSheet() {
    return {
        name: "Aventureiro",
        class: "",
        race: null,
        token: null,
        level: 1,
        xp: 0,
        money: 200,
        elements: {}, // { "Fogo": 1, "Água": 1 }
        attributes: { forca: 0, agilidade: 0, protecao: 0, constituicao: 0, inteligencia: 0, mente: 0 },
        equipment: { weapon1: null, weapon2: null, shield: null, armor: null },
        spells: [], // Magias aprendidas
        status: 'creating_sheet' // 'selecting_token' -> 'filling_sheet' -> 'ready'
    };
}

function calculateFighterStats(sheet) {
    const finalAttributes = { ...sheet.attributes };
    // Aplicar penalidades de equipamento
    if (sheet.equipment.shield) {
        finalAttributes.agilidade += GAME_DATA.equipment.shields[sheet.equipment.shield]?.penalty?.agilidade || 0;
    }
    if (sheet.equipment.armor) {
        finalAttributes.agilidade += GAME_DATA.equipment.armors[sheet.equipment.armor]?.penalty?.agilidade || 0;
    }

    // Calcular Bônus Totais
    let bta = finalAttributes.agilidade;
    let btd = finalAttributes.forca;
    let btm = finalAttributes.inteligencia;

    [sheet.equipment.weapon1, sheet.equipment.weapon2].forEach(weaponName => {
        if(weaponName && GAME_DATA.equipment.weapons[weaponName]) {
            const weaponData = GAME_DATA.equipment.weapons[weaponName];
            bta += weaponData.bta || 0;
            btd += weaponData.btd || 0;
            btm += weaponData.btm || 0;
        }
    });
    // TODO: Adicionar bônus de armaduras mágicas, etc. no futuro aqui.

    return {
        hp: 20 + (finalAttributes.constituicao * 5),
        hpMax: 20 + (finalAttributes.constituicao * 5),
        mahou: 10 + (finalAttributes.mente * 5),
        mahouMax: 10 + (finalAttributes.mente * 5),
        bta, btd, btm,
        finalAttributes // Atributos já com penalidades de equipamento
    };
}


function createFighterFromSheet(id, sheet) {
    const calculatedStats = calculateFighterStats(sheet);

    const fighter = {
        id: id,
        nome: sheet.name,
        img: sheet.token.img,
        sheet: sheet, 
        
        hp: calculatedStats.hp,
        hpMax: calculatedStats.hpMax,
        mahou: calculatedStats.mahou,
        mahouMax: calculatedStats.mahouMax,
        
        status: 'active',
        pa: 3, 
        defense: 0, 
        initiativeRoll: undefined,

        bta: calculatedStats.bta, 
        btd: calculatedStats.btd, 
        btm: calculatedStats.btm,
        // Mantém os atributos base da ficha E os atributos finais para cálculos.
        attributes: calculatedStats.finalAttributes 
    };
    return fighter;
}

function createNewAdventureState(gmId, connectedPlayers, useCachedState = false, cachedState = null) {
    let adventureState;
    if (useCachedState && cachedState) {
        adventureState = JSON.parse(JSON.stringify(cachedState)); // Deep copy do estado cacheado
        adventureState.mode = 'adventure';
        // Re-definir gmId e log
        adventureState.gmId = gmId;
        logMessage(adventureState, "Aventura anterior continuada.", 'info');
    } else {
        adventureState = {
            mode: 'adventure', 
            fighters: { players: {}, npcs: {} }, 
            customPositions: {},
            winner: null, 
            reason: null, 
            currentRound: 1,
            currentCycle: 1,
            activeCharacterKey: null, 
            turnOrder: [], 
            turnIndex: 0, 
            phase: 'npc_setup', // Começa na fase de setup de NPC
            scenario: 'mapas/cenarios externos/externo (1).png',
            gmId: gmId, 
            log: [{ text: "Aguardando o Mestre preparar o encontro..." }],
        };
    }
    
    // Atualiza ou adiciona jogadores conectados prontos
    for (const sId in connectedPlayers) {
        const playerData = connectedPlayers[sId];
        if (playerData.role === 'player' && playerData.sheet && playerData.sheet.status === 'ready') {
            // Se o jogador já existe no estado (cacheado), atualiza a sheet e stats derivados
            if (adventureState.fighters.players[sId]) {
                const existingFighter = adventureState.fighters.players[sId];
                existingFighter.sheet = playerData.sheet;
                const calculatedStats = calculateFighterStats(playerData.sheet);
                Object.assign(existingFighter, {
                    hp: calculatedStats.hp, hpMax: calculatedStats.hpMax,
                    mahou: calculatedStats.mahou, mahouMax: calculatedStats.mahouMax,
                    bta: calculatedStats.bta, btd: calculatedStats.btd, btm: calculatedStats.btm,
                    attributes: calculatedStats.finalAttributes,
                    status: existingFighter.status === 'disconnected' ? 'active' : existingFighter.status // Reativa se estava desconectado
                });
                logMessage(adventureState, `${existingFighter.nome} reconectou-se.`, 'info');
            } else {
                // Adiciona novo jogador
                adventureState.fighters.players[sId] = createFighterFromSheet(sId, playerData.sheet);
                logMessage(adventureState, `${playerData.sheet.name} juntou-se à aventura.`, 'info');
            }
            io.to(sId).emit('assignRole', { role: 'player', playerKey: sId });
        }
    }
    return adventureState;
}

function createNewTheaterState(gmId, initialScenario) {
    const theaterState = {
        mode: 'theater', gmId: gmId, log: [{ text: "Modo Cenário iniciado."}],
        scenarioStates: {}, publicState: {},
        playerControlsLocked: false,
    };
    const initialScenarioPath = `mapas/${initialScenario}`;
    theaterState.currentScenario = initialScenarioPath;
    if (!theaterState.scenarioStates[initialScenarioPath]) {
        theaterState.scenarioStates[initialScenarioPath] = {
            scenario: initialScenarioPath, tokens: {},
            tokenOrder: [], globalTokenScale: 1.0, isStaging: true,
        };
    }
    theaterState.publicState = JSON.parse(JSON.stringify(theaterState.scenarioStates[initialScenarioPath]));

    return theaterState;
}


// --- LÓGICA DE COMBATE ---
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

    let activeTurnOrder = state.turnOrder.filter(id => getFighter(state, id)?.status === 'active');
    if (activeTurnOrder.length === 0) {
        checkGameOver(state); // Checa se a batalha terminou por falta de combatentes
        if (!state.winner) { // Se não houver vencedor, mas a ordem estiver vazia, é um empate ou erro.
            logMessage(state, "Nenhum combatente ativo restante. Batalha encerrada.", 'info');
            state.winner = 'draw';
        }
        return;
    }

    state.turnIndex++;
    
    if (state.turnIndex >= activeTurnOrder.length) {
        state.turnIndex = 0;
        state.currentRound++;
        logMessage(state, `--- Fim da Rodada ${state.currentRound - 1}. Iniciando Rodada ${state.currentRound} ---`, 'round');

        if ((state.currentRound - 1) > 0 && (state.currentRound - 1) % 3 === 0) {
            state.phase = 'initiative_roll';
            state.currentCycle++;
            logMessage(state, `--- NOVO CICLO (${state.currentCycle})! Rolem as iniciativas! ---`, 'round');
            state.turnOrder = [];
            state.activeCharacterKey = null;
            // Limpa as iniciativas e defesas para o novo ciclo
            Object.values(state.fighters.players).forEach(p => { p.initiativeRoll = undefined; p.defense = 0; });
            Object.values(state.fighters.npcs).forEach(n => { n.initiativeRoll = undefined; n.defense = 0; });
            return; // Espera pelas novas rolagens de iniciativa
        }
    }
    
    state.activeCharacterKey = activeTurnOrder[state.turnIndex];
    const activeFighter = getFighter(state, state.activeCharacterKey);
    if(activeFighter && activeFighter.status === 'active'){
        activeFighter.pa = Math.min((activeFighter.pa || 0) + 3, 9); // Restaura 3 PA, até um máximo de 9
        logMessage(state, `É a vez de ${activeFighter.nome}. (PA: ${activeFighter.pa})`, 'turn');
    } else {
        // Se o próximo personagem na ordem não estiver ativo, pula para o próximo
        advanceTurn(state); 
    }
}

function startBattle(state) {
    state.phase = 'initiative_roll';
    state.currentRound = 1;
    state.currentCycle = 1;
    logMessage(state, `--- A Batalha Começou! Rolem as iniciativas! ---`, 'round');
}

// --- FUNÇÃO PRINCIPAL DE CONEXÃO ---

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
            adventureCache: null // NOVO: Cache para retomar aventura
        };
        socket.emit('assignRole', { isGm: true, role: 'gm', roomId: roomId });
        // O `gameUpdate` final no GM é quem realmente fará o link aparecer
        io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
    });

    socket.emit('initialData', {
        playableTokens: PLAYABLE_TOKENS,
        dynamicCharacters: DYNAMIC_CHARACTERS,
        npcs: ALL_NPCS, // Renomeado para 'allNpcs' para evitar conflito com 'npcs' do GAME_DATA
        scenarios: ALL_SCENARIOS,
        gameData: GAME_DATA
    });

    socket.on('playerJoinsLobby', ({ roomId }) => {
        if (!games[roomId]) { socket.emit('error', { message: 'Sala não encontrada.' }); return; }
        socket.join(roomId);
        socket.currentRoomId = roomId; // Garante que o socket tenha o roomId
        const lobbyState = games[roomId].gameModes.lobby;
        const currentPlayers = Object.values(lobbyState.connectedPlayers).filter(p => p.role === 'player').length;
        const isFull = currentPlayers >= MAX_PLAYERS;
        socket.emit('promptForRole', { isFull: isFull });
    });
    
    socket.on('playerChoosesRole', ({ role }) => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId]) return;
        const room = games[roomId];
        const lobbyState = room.gameModes.lobby;
        const currentPlayers = Object.values(lobbyState.connectedPlayers).filter(p => p.role === 'player').length;
        
        let finalRole = (role === 'player' && currentPlayers >= MAX_PLAYERS) ? 'spectator' : role;
        
        room.sockets[socket.id] = { role: finalRole };
        lobbyState.connectedPlayers[socket.id] = { role: finalRole, sheet: finalRole === 'player' ? createNewPlayerSheet() : null };
        
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
                    room.adventureCache = JSON.parse(JSON.stringify(room.gameModes.adventure)); // Cacheia o estado atual da aventura
                }
                room.activeMode = 'lobby'; 
            }
            if (action.type === 'gmSwitchesMode') {
                if (room.activeMode === 'adventure') {
                    room.adventureCache = JSON.parse(JSON.stringify(room.gameModes.adventure));
                    if (!room.gameModes.theater) { // Cria o teatro se não existir
                        room.gameModes.theater = createNewTheaterState(lobbyState.gmId, 'cenarios externos/externo (1).png');
                    }
                    room.activeMode = 'theater';
                } else { // Vem do theater para adventure
                    if (room.adventureCache) {
                        socket.emit('promptForAdventureType'); // Pergunta se quer continuar ou nova
                        shouldUpdate = false; // Não atualiza ainda, espera a resposta do GM
                    } else {
                        room.gameModes.adventure = createNewAdventureState(lobbyState.gmId, lobbyState.connectedPlayers);
                        room.activeMode = 'adventure';
                    }
                }
            }
            // NOVO: Ação para GM escolher tipo de aventura
            if (action.type === 'gmChoosesAdventureType') {
                room.gameModes.adventure = createNewAdventureState(lobbyState.gmId, lobbyState.connectedPlayers, action.choice === 'continue', room.adventureCache);
                room.adventureCache = null; // Limpa o cache após usar
                room.activeMode = 'adventure';
            }
        }
        
        if (action.type === 'playerSubmitsSheet') {
            const playerInfo = lobbyState.connectedPlayers[socket.id];
            if (playerInfo && playerInfo.role === 'player') {
                playerInfo.sheet = action.sheet;
                logMessage(lobbyState, `${playerInfo.sheet.name} está pronto.`);
            }
        }

        switch (room.activeMode) {
            case 'lobby':
                if (isGm) {
                    if (action.type === 'gmStartsAdventure') {
                        if (room.adventureCache) {
                            socket.emit('promptForAdventureType');
                            shouldUpdate = false;
                        } else {
                            room.gameModes.adventure = createNewAdventureState(activeState.gmId, activeState.connectedPlayers);
                            room.activeMode = 'adventure';
                        }
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
                
                switch (action.type) {
                    case 'gmStartBattle':
                        if (isGm && adventureState.phase === 'npc_setup' && action.npcs) {
                            adventureState.fighters.npcs = {}; // Limpa NPCs antigos
                            action.npcs.forEach(npcData => {
                                const newNpcId = `npc-${uuidv4()}`;
                                adventureState.fighters.npcs[newNpcId] = {
                                    id: newNpcId,
                                    nome: npcData.name,
                                    img: `images/lutadores/${npcData.name}.png`, // Imagem do NPC
                                    hp: npcData.hp, hpMax: npcData.hp,
                                    mahou: npcData.mahou || 0, mahouMax: npcData.mahou || 0, // NPCs podem ter mahou
                                    pa: 3, defense: 0, initiativeRoll: undefined,
                                    bta: npcData.bta, btd: npcData.btd, btm: npcData.btm,
                                    status: 'active',
                                    spells: npcData.spells || [], // Magias para NPCs
                                    isNPC: true // Flag para identificar
                                };
                            });
                            startBattle(adventureState);
                        }
                        break;
                    
                    case 'roll_initiative':
                        if (adventureState.phase === 'initiative_roll') {
                            const fighter = getFighter(adventureState, socket.id);
                            if (fighter && fighter.status === 'active' && fighter.initiativeRoll === undefined) {
                                const roll = rollD(20);
                                // A agilidade do NPC está no fighter.attributes.agilidade (se tiver)
                                // A agilidade do Player está em fighter.sheet.attributes.agilidade (se tiver)
                                const agi = fighter.isNPC ? fighter.attributes?.agilidade || 0 : fighter.sheet.attributes.agilidade;
                                fighter.initiativeRoll = roll + agi;
                                fighter.defense = fighter.initiativeRoll;
                                logMessage(adventureState, `${fighter.nome} rolou ${roll} + ${agi} = ${fighter.initiativeRoll} para iniciativa e defesa.`);
                            }
                            
                            const allActiveFighters = [...Object.values(adventureState.fighters.players), ...Object.values(adventureState.fighters.npcs)].filter(f=>f.status==='active');
                            if (allActiveFighters.every(f => f.initiativeRoll !== undefined)) {
                                adventureState.turnOrder = allActiveFighters
                                    .sort((a, b) => {
                                        if (b.initiativeRoll !== a.initiativeRoll) return b.initiativeRoll - a.initiativeRoll;
                                        // Em caso de empate, jogador tem vantagem sobre NPC, depois Agilidade
                                        const aIsPlayer = !!adventureState.fighters.players[a.id];
                                        const bIsPlayer = !!adventureState.fighters.players[b.id];
                                        if (aIsPlayer && !bIsPlayer) return -1;
                                        if (!aIsPlayer && bIsPlayer) return 1;
                                        const aAgi = a.isNPC ? a.attributes?.agilidade || 0 : a.sheet.attributes.agilidade;
                                        const bAgi = b.isNPC ? b.attributes?.agilidade || 0 : b.sheet.attributes.agilidade;
                                        return bAgi - aAgi;
                                    })
                                    .map(f => f.id);
                                adventureState.phase = 'battle';
                                adventureState.turnIndex = -1; // Reset para advanceTurn começar do 0
                                advanceTurn(adventureState);
                            }
                        }
                        break;
                    case 'end_turn':
                         const activeFighter = getFighter(adventureState, adventureState.activeCharacterKey);
                         const canEndTurn = (isGm && activeFighter?.isNPC) || (socket.id === adventureState.activeCharacterKey && !activeFighter?.isNPC);
                         if (canEndTurn) {
                             advanceTurn(adventureState);
                         }
                         break;
                    // TODO: Implementar ações de ataque, magia, defesa
                }
                break;

            case 'theater':
                 const theaterState = activeState;
                 if(!theaterState) break;
                 
                 if (isGm && action.type === 'togglePlayerLock') {
                     theaterState.playerControlsLocked = !theaterState.playerControlsLocked;
                     logMessage(theaterState, `Controles dos jogadores ${theaterState.playerControlsLocked ? 'BLOQUEADOS' : 'DESBLOQUEADOS'}.`);
                 }
                 // NOVO: GM pode adicionar tokens ao cenário (personagens ou objetos)
                 if (isGm && action.type === 'addToken') {
                    const tokenData = action.token;
                    const scenarioState = theaterState.scenarioStates[theaterState.currentScenario];
                    const newTokenId = `token-${uuidv4()}`;
                    scenarioState.tokens[newTokenId] = {
                        id: newTokenId,
                        img: tokenData.img,
                        charName: tokenData.name,
                        x: tokenData.x,
                        y: tokenData.y,
                        scale: tokenData.scale || 1.0,
                        isFlipped: false,
                        owner: tokenData.owner // Guarda o ID do socket se for um player token
                    };
                    scenarioState.tokenOrder.push(newTokenId);
                    if (!scenarioState.isStaging) {
                        theaterState.publicState = JSON.parse(JSON.stringify(scenarioState));
                    }
                    logMessage(theaterState, `${tokenData.name} adicionado ao cenário.`);
                 }
                 // NOVO: GM pode atualizar tokens
                 if (isGm && action.type === 'updateToken') {
                    const tokenData = action.token;
                    const scenarioState = theaterState.scenarioStates[theaterState.currentScenario];
                    if (tokenData.remove && tokenData.ids) {
                        tokenData.ids.forEach(id => { 
                            delete scenarioState.tokens[id]; 
                            scenarioState.tokenOrder = scenarioState.tokenOrder.filter(i => i !== id); 
                        });
                        logMessage(theaterState, `Tokens removidos.`);
                    } else if (scenarioState.tokens[tokenData.id]) {
                        Object.assign(scenarioState.tokens[tokenData.id], tokenData);
                    }
                    if (!scenarioState.isStaging) {
                        theaterState.publicState = JSON.parse(JSON.stringify(scenarioState));
                    }
                 }
                 // NOVO: GM pode mudar ordem dos tokens
                 if (isGm && action.type === 'updateTokenOrder') {
                    const scenarioState = theaterState.scenarioStates[theaterState.currentScenario];
                    if(action.order && Array.isArray(action.order)) {
                        scenarioState.tokenOrder = action.order;
                        if (!scenarioState.isStaging) {
                            theaterState.publicState.tokenOrder = action.order;
                        }
                    }
                 }
                 // NOVO: GM pode mudar escala global
                 if (isGm && action.type === 'updateGlobalScale') {
                    const scenarioState = theaterState.scenarioStates[theaterState.currentScenario];
                    scenarioState.globalTokenScale = action.scale;
                    if (!scenarioState.isStaging) {
                        theaterState.publicState.globalTokenScale = action.scale;
                    }
                 }
                 // NOVO: GM pode mudar cenário
                 if (isGm && action.type === 'changeScenario') {
                    const newScenarioPath = `mapas/${action.scenario}`;
                    theaterState.currentScenario = newScenarioPath;
                    if (!theaterState.scenarioStates[newScenarioPath]) {
                        theaterState.scenarioStates[newScenarioPath] = { 
                            scenario: newScenarioPath, tokens: {}, 
                            tokenOrder: [], globalTokenScale: 1.0, isStaging: true 
                        };
                    }
                    theaterState.publicState = JSON.parse(JSON.stringify(theaterState.scenarioStates[newScenarioPath])); // Publica de imediato
                    logMessage(theaterState, 'GM está preparando um novo cenário...');
                 }
                 // NOVO: GM pode publicar o stage
                 if (isGm && action.type === 'publish_stage') {
                    const scenarioState = theaterState.scenarioStates[theaterState.currentScenario];
                    if (scenarioState.isStaging) {
                        scenarioState.isStaging = false;
                        theaterState.publicState = JSON.parse(JSON.stringify(scenarioState));
                        logMessage(theaterState, 'Cena publicada para os jogadores.');
                    }
                 }


                 // NOVO: Ação para player mover token
                 if (action.type === 'playerMovesToken' && !theaterState.playerControlsLocked) {
                     const scenarioState = theaterState.scenarioStates[theaterState.currentScenario];
                     // Apenas permite mover se o token tiver um "owner" e for o próprio jogador
                     if (scenarioState && scenarioState.tokens[action.tokenId] && socket.id === scenarioState.tokens[action.tokenId].owner) {
                         Object.assign(scenarioState.tokens[action.tokenId], action.position);
                         if (!scenarioState.isStaging) { // Se não estiver em staging, publica imediatamente
                            Object.assign(theaterState.publicState.tokens[action.tokenId], action.position);
                         }
                     }
                 }
                // NOVO: Ação para player rolar teste de atributo no modo cenário
                if (action.type === 'rollAttributeTest') {
                    const playerFighter = getFighter(adventureState, socket.id);
                    if (playerFighter && !theaterState.playerControlsLocked) {
                        const roll = rollD(20);
                        const attributeValue = playerFighter.attributes[action.attribute];
                        const total = roll + attributeValue;
                        logMessage(theaterState, `${playerFighter.nome} rolou um Teste de ${action.attribute.toUpperCase()}: ${roll} + ${attributeValue} = ${total}.`, 'test_roll');
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

        const playerInfo = lobbyState.connectedPlayers[socket.id];
        if (playerInfo) {
            const name = playerInfo.sheet?.name || `um ${playerInfo.role}`;
            logMessage(lobbyState, `${name} desconectou.`);
        }
        delete room.sockets[socket.id];
        delete lobbyState.connectedPlayers[socket.id];
        
        const adventureState = room.gameModes.adventure;
        if (adventureState && adventureState.fighters.players[socket.id]) {
            const disconnectedFighter = adventureState.fighters.players[socket.id];
            disconnectedFighter.status = 'disconnected';
            logMessage(adventureState, `${disconnectedFighter.nome} foi desconectado.`);
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