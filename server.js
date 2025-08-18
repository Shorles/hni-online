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

// --- CARREGAMENTO DE DADOS DO JOGO ---
let ALL_NPCS = {};
let PLAYABLE_CHARACTERS = [];
let DYNAMIC_CHARACTERS = [];
let ALL_SCENARIOS = {};
let ALL_SPELLS = {};
const MAX_PLAYERS = 4;
const MAX_NPCS = 5; 

try {
    const charactersData = fs.readFileSync('characters.json', 'utf8');
    const characters = JSON.parse(charactersData);
    PLAYABLE_CHARACTERS = characters.players || [];
    ALL_NPCS = characters.npcs || {}; 

    const spellsData = fs.readFileSync('spells.json', 'utf8');
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

// Funções de utilidade e estado do jogo (sem alterações)...
function rollDice(diceExpression) { if (!diceExpression || typeof diceExpression !== 'string') return 0; let total = 0; const parts = diceExpression.split('+'); const dicePart = parts[0]; const bonus = parts.length > 1 ? parseInt(parts[1], 10) : 0; const [numDice, numSides] = dicePart.toLowerCase().split('d').map(n => parseInt(n, 10)); for (let i = 0; i < numDice; i++) { total += Math.floor(Math.random() * numSides) + 1; } return total + bonus; }
function obfuscateData(data) { return Buffer.from(JSON.stringify(data)).toString('base64'); }
function deobfuscateData(data) { try { return JSON.parse(Buffer.from(data, 'base64').toString('utf8')); } catch (error) { return null; } }
function createNewLobbyState(gmId) { return { mode: 'lobby', phase: 'waiting_players', gmId: gmId, connectedPlayers: {}, log: [{ text: "Lobby criado." }], }; }
function createNewAdventureState(lobbyState) { const adventureState = { mode: 'adventure', fighters: { players: {}, npcs: {} }, npcSlots: new Array(MAX_NPCS).fill(null), customPositions: {}, winner: null, reason: null, currentRound: 1, turnInRound: 0, activeCharacterKey: null, turnOrder: [], initiativeRolls: {}, phase: 'npc_setup', scenario: 'mapas/cenarios externos/externo (1).png', gmId: lobbyState.gmId, log: [{ text: "Mestre, prepare o encontro!" }], }; for (const sId in lobbyState.connectedPlayers) { const playerData = lobbyState.connectedPlayers[sId]; if (playerData.role === 'player' && playerData.characterSheet) { adventureState.fighters.players[sId] = { id: sId, ...playerData.characterSheet, status: 'active' }; } } return adventureState; }
function createNewTheaterState(gmId) { const initialScenarioPath = 'mapas/cenarios externos/externo (1).png'; return { mode: 'theater', gmId: gmId, log: [{ text: "Modo Cenário iniciado."}], currentScenario: initialScenarioPath, scenarioStates: { [initialScenarioPath]: { scenario: initialScenarioPath, tokens: {}, tokenOrder: [], globalTokenScale: 1.0, isStaging: true, } }, publicState: { scenario: initialScenarioPath, tokens: {}, tokenOrder: [], globalTokenScale: 1.0, } }; }
function createNewFighterState(data) { const attributes = data.attributes || { forca: 0, agilidade: 0, protecao: 0, constituicao: 0, inteligencia: 0, mente: 0 }; const hpMax = 20 + (attributes.constituicao * 5); const mahouMax = 10 + (attributes.mente * 5); return { id: data.id, nome: data.nome || data.name, img: data.img, attributes: attributes, spells: data.spells || [], hp: hpMax, hpMax: hpMax, mahou: mahouMax, mahouMax: mahouMax, pa: 0, status: 'active', }; }
function logMessage(state, text, type = 'info') { if (!state.log) state.log = []; state.log.unshift({ text, type }); }
function getFighter(state, key) { if (!key) return null; return state.fighters.players[key] || state.fighters.npcs[key]; }
function startBattle(state) { state.turnOrder = Object.keys(state.initiativeRolls).sort((a, b) => { const rollA = state.initiativeRolls[a].total; const rollB = state.initiativeRolls[b].total; if (rollA === rollB) { const isAPlayer = !!state.fighters.players[a]; const isBPlayer = !!state.fighters.players[b]; if (isAPlayer && !isBPlayer) return -1; if (!isAPlayer && isBPlayer) return 1; } return rollB - rollA; }); state.phase = 'battle'; Object.values(state.fighters.players).forEach(p => p.pa = 0); Object.values(state.fighters.npcs).forEach(n => n.pa = 0); state.activeCharacterKey = state.turnOrder[0]; const firstFighter = getFighter(state, state.activeCharacterKey); firstFighter.pa = 3; logMessage(state, `--- A Batalha Começou! ---`, 'round'); logMessage(state, `É a vez de ${firstFighter.nome}.`, 'turn'); }
function getFullState(room) { if (!room) return null; const activeState = room.gameModes[room.activeMode]; return { ...activeState, connectedPlayers: room.gameModes.lobby.connectedPlayers }; }

// --- SOCKET.IO ---
io.on('connection', (socket) => {
    
    socket.on('gmCreatesLobby', () => {
        const roomId = uuidv4();
        socket.join(roomId);
        socket.currentRoomId = roomId;
        games[roomId] = {
            sockets: { [socket.id]: { role: 'gm' } },
            activeMode: 'lobby',
            gameModes: { lobby: createNewLobbyState(socket.id), adventure: null, theater: null },
        };
        socket.emit('assignRole', { isGm: true, role: 'gm', roomId: roomId });
        socket.emit('roomCreated', roomId);
        io.to(roomId).emit('gameUpdate', getFullState(games[roomId]));
    });

    // CORRIGIDO: Garante que todos os tipos de personagens sejam enviados
    socket.emit('initialData', { 
        characters: { 
            players: PLAYABLE_CHARACTERS.map(name => ({ name, img: `images/players/${name}.png` })),
            npcs: Object.keys(ALL_NPCS).map(name => ({ name, img: `images/lutadores/${name}.png` })),
            dynamic: DYNAMIC_CHARACTERS 
        }, 
        spells: ALL_SPELLS, 
        scenarios: ALL_SCENARIOS 
    });

    // O resto dos handlers do servidor (sem alterações)...
    socket.on('playerJoinsLobby', ({ roomId }) => { if (!games[roomId]) { return socket.emit('error', { message: 'Sala não encontrada.' }); } socket.join(roomId); socket.currentRoomId = roomId; const lobbyState = games[roomId].gameModes.lobby; const currentPlayers = Object.values(lobbyState.connectedPlayers).filter(p => p.role === 'player').length; socket.emit('promptForRole', { isFull: currentPlayers >= MAX_PLAYERS }); });
    socket.on('playerChoosesRole', ({ role }) => { const roomId = socket.currentRoomId; if (!roomId || !games[roomId]) return; const room = games[roomId]; const lobbyState = room.gameModes.lobby; const currentPlayers = Object.values(lobbyState.connectedPlayers).filter(p => p.role === 'player').length; let finalRole = (role === 'player' && currentPlayers >= MAX_PLAYERS) ? 'spectator' : role; room.sockets[socket.id] = { role: finalRole }; lobbyState.connectedPlayers[socket.id] = { role: finalRole, characterSheet: null, status: 'Conectado' }; logMessage(lobbyState, `Um ${finalRole} conectou-se.`); socket.emit('assignRole', { role: finalRole, roomId: roomId }); io.to(roomId).emit('gameUpdate', getFullState(room)); });
    socket.on('playerSubmitsCharacterSheet', (sheet) => { const roomId = socket.currentRoomId; if (!roomId || !games[roomId]) return; const room = games[roomId]; room.gameModes.lobby.connectedPlayers[socket.id].characterSheet = sheet; room.gameModes.lobby.connectedPlayers[socket.id].status = 'Pronto'; logMessage(room.gameModes.lobby, `${sheet.nome} está pronto.`); io.to(roomId).emit('gameUpdate', getFullState(room)); });
    socket.on('playerAction', (action) => { const roomId = socket.currentRoomId; if (!roomId || !games[roomId]) return; const room = games[roomId]; const lobbyState = room.gameModes.lobby; const isGm = socket.id === lobbyState.gmId; let activeState = room.gameModes[room.activeMode]; let shouldUpdate = true; if (isGm) { switch(action.type) { case 'gmStartsAdventure': room.gameModes.adventure = createNewAdventureState(lobbyState); room.activeMode = 'adventure'; break; case 'gmStartsTheater': if (!room.gameModes.theater) room.gameModes.theater = createNewTheaterState(lobbyState.gmId); room.activeMode = 'theater'; break; case 'gmGoesBackToLobby': room.activeMode = 'lobby'; break; case 'gmStartBattle': if (activeState.phase === 'npc_setup' && action.npcs) { activeState.fighters.npcs = {}; activeState.npcSlots.fill(null); action.npcs.forEach(npcData => { if (npcData) { const newNpc = createNewFighterState(npcData); activeState.fighters.npcs[newNpc.id] = newNpc; if (npcData.slotIndex !== undefined) activeState.npcSlots[npcData.slotIndex] = newNpc.id; } }); activeState.phase = 'initiative_roll'; logMessage(activeState, 'Inimigos em posição! Rolem as iniciativas!'); } break; } } if (room.activeMode === 'adventure') { const adventureState = activeState; } if (shouldUpdate) io.to(roomId).emit('gameUpdate', getFullState(room)); });
    socket.on('disconnect', () => { const roomId = socket.currentRoomId; if (!roomId || !games[roomId]) return; delete games[roomId].sockets[socket.id]; delete games[roomId].gameModes.lobby.connectedPlayers[socket.id]; io.to(roomId).emit('gameUpdate', getFullState(games[roomId])); if (Object.keys(games[roomId].sockets).length === 0) delete games[roomId]; });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));