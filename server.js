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
        elements: {},
        attributes: { forca: 0, agilidade: 0, protecao: 0, constituicao: 0, inteligencia: 0, mente: 0 },
        equipment: { weapon1: null, weapon2: null, shield: null, armor: null },
        spells: [],
        status: 'creating_sheet' // 'selecting_token' -> 'filling_sheet' -> 'ready'
    };
}

function createFighterFromSheet(id, sheet) {
    const finalAttributes = { ...sheet.attributes };
    // Aplicar penalidades de equipamento
    if (sheet.equipment.shield) {
        finalAttributes.agilidade += GAME_DATA.equipment.shields[sheet.equipment.shield]?.penalty?.agilidade || 0;
    }
    if (sheet.equipment.armor) {
        finalAttributes.agilidade += GAME_DATA.equipment.armors[sheet.equipment.armor]?.penalty?.agilidade || 0;
    }

    const fighter = {
        id: id,
        nome: sheet.name,
        img: sheet.token.img,
        sheet: sheet, 
        
        hp: 20 + (finalAttributes.constituicao * 5),
        hpMax: 20 + (finalAttributes.constituicao * 5),
        mahou: 10 + (finalAttributes.mente * 5),
        mahouMax: 10 + (finalAttributes.mente * 5),
        
        status: 'active',
        pa: 3, 
        defense: 0, 
        initiativeRoll: undefined,

        bta: 0, btd: 0, btm: 0,
    };
    
    // Calcular Bônus Totais
    let bta = finalAttributes.agilidade;
    let btd = finalAttributes.forca;
    let btm = finalAttributes.inteligencia;

    [sheet.equipment.weapon1, sheet.equipment.weapon2].forEach(weaponName => {
        if(weaponName) {
            const weaponData = GAME_DATA.equipment.weapons[weaponName];
            if(weaponData) {
                bta += weaponData.bta || 0;
                btd += weaponData.btd || 0;
                btm += weaponData.btm || 0;
            }
        }
    });
    // Adicionar bônus de armaduras mágicas, etc. no futuro aqui.
    fighter.bta = bta;
    fighter.btd = btd;
    fighter.btm = btm;

    return fighter;
}

function createNewAdventureState(gmId, connectedPlayers) {
    const adventureState = {
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
        phase: 'npc_setup',
        scenario: 'mapas/cenarios externos/externo (1).png',
        gmId: gmId, 
        log: [{ text: "Aguardando o Mestre preparar o encontro..." }],
    };
    
    for (const sId in connectedPlayers) {
        const playerData = connectedPlayers[sId];
        if (playerData.role === 'player' && playerData.sheet && playerData.sheet.status === 'ready') {
            adventureState.fighters.players[sId] = createFighterFromSheet(sId, playerData.sheet);
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
        checkGameOver(state);
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
            Object.values(state.fighters.players).forEach(p => p.initiativeRoll = undefined);
            Object.values(state.fighters.npcs).forEach(n => n.initiativeRoll = undefined);
            return;
        }
    }
    
    state.activeCharacterKey = activeTurnOrder[state.turnIndex];
    const activeFighter = getFighter(state, state.activeCharacterKey);
    if(activeFighter){
        activeFighter.pa = Math.min((activeFighter.pa || 0) + 3, 9);
        logMessage(state, `É a vez de ${activeFighter.nome}. (PA: ${activeFighter.pa})`, 'turn');
    } else {
        advanceTurn(state); // Skip if fighter not found
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
        };
        socket.emit('assignRole', { isGm: true, role: 'gm', roomId: roomId });
        io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
    });

    socket.emit('initialData', {
        playableTokens: PLAYABLE_TOKENS,
        dynamicCharacters: DYNAMIC_CHARACTERS,
        npcs: ALL_NPCS,
        scenarios: ALL_SCENARIOS,
        gameData: GAME_DATA
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
            if (action.type === 'gmGoesBackToLobby') { room.activeMode = 'lobby'; }
            if (action.type === 'gmSwitchesMode') {
                room.activeMode = room.activeMode === 'adventure' ? 'theater' : 'adventure';
                if (room.activeMode === 'adventure' && !room.gameModes.adventure) {
                    room.gameModes.adventure = createNewAdventureState(lobbyState.gmId, lobbyState.connectedPlayers);
                } else if (room.activeMode === 'theater' && !room.gameModes.theater) {
                    room.gameModes.theater = createNewTheaterState(lobbyState.gmId, 'cenarios externos/externo (1).png');
                }
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
                
                switch (action.type) {
                    case 'gmStartBattle':
                        if (isGm && adventureState.phase === 'npc_setup' && action.npcs) {
                            adventureState.fighters.npcs = {};
                            action.npcs.forEach(npcData => {
                                const newNpcId = `npc-${uuidv4()}`;
                                adventureState.fighters.npcs[newNpcId] = {
                                    id: newNpcId,
                                    nome: npcData.name,
                                    img: `images/lutadores/${npcData.name}.png`,
                                    hp: npcData.hp, hpMax: npcData.hp,
                                    pa: 3, defense: 0, initiativeRoll: undefined,
                                    bta: npcData.bta, btd: npcData.btd, btm: npcData.btm,
                                    status: 'active'
                                };
                            });
                            startBattle(adventureState);
                        }
                        break;
                    
                    case 'roll_initiative':
                        if (adventureState.phase === 'initiative_roll') {
                            const fighter = getFighter(adventureState, socket.id);
                            if (fighter && fighter.initiativeRoll === undefined) {
                                const roll = rollD(20);
                                const agi = fighter.sheet ? fighter.sheet.attributes.agilidade : 0; // NPC agilidade
                                fighter.initiativeRoll = roll + agi;
                                fighter.defense = fighter.initiativeRoll;
                                logMessage(adventureState, `${fighter.nome} rolou ${fighter.initiativeRoll} para iniciativa e defesa.`);
                            }
                            
                            const allFighters = [...Object.values(adventureState.fighters.players), ...Object.values(adventureState.fighters.npcs)];
                            if (allFighters.filter(f=>f.status==='active').every(f => f.initiativeRoll !== undefined)) {
                                adventureState.turnOrder = allFighters
                                    .filter(f=>f.status==='active')
                                    .sort((a, b) => b.initiativeRoll - a.initiativeRoll)
                                    .map(f => f.id);
                                adventureState.phase = 'battle';
                                adventureState.turnIndex = -1;
                                advanceTurn(adventureState);
                            }
                        }
                        break;
                    case 'end_turn':
                         if (socket.id === adventureState.activeCharacterKey) {
                             advanceTurn(adventureState);
                         }
                         break;
                }
                break;

            case 'theater':
                 const theaterState = activeState;
                 if(!theaterState) break;
                 
                 if (isGm && action.type === 'togglePlayerLock') {
                     theaterState.playerControlsLocked = !theaterState.playerControlsLocked;
                     logMessage(theaterState, `Controles dos jogadores ${theaterState.playerControlsLocked ? 'BLOQUEADOS' : 'DESBLOQUEADOS'}.`);
                 }

                 if (action.type === 'playerMovesToken' && !theaterState.playerControlsLocked) {
                     const scenarioState = theaterState.scenarioStates[theaterState.currentScenario];
                     if (scenarioState && scenarioState.tokens[action.tokenId] && socket.id === scenarioState.tokens[action.tokenId].owner) {
                         Object.assign(scenarioState.tokens[action.tokenId], action.position);
                         if (!scenarioState.isStaging) {
                            Object.assign(theaterState.publicState.tokens[action.tokenId], action.position);
                         }
                         // Broadcast movement to others without a full state update for smoothness
                         io.to(roomId).except(socket.id).emit('tokenMoved', {tokenId: action.tokenId, position: action.position});
                     }
                 }
                // ... (outras lógicas do modo cenário, como adicionar tokens, mudar cenário, etc.)
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