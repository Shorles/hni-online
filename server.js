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
let ALL_SCENARIOS = [];
const MAX_PLAYERS = 4;

try {
    const charactersData = fs.readFileSync('characters.json', 'utf8');
    const characters = JSON.parse(charactersData);
    PLAYABLE_CHARACTERS = characters.players || [];
    const npcNames = characters.npcs || [];
    npcNames.forEach(nome => { ALL_NPCS[nome] = { agi: 2, res: 3 }; });

    // Carregar cenários
    const scenarioPath = 'public/images/mapas/cenarios externos/';
    ALL_SCENARIOS = fs.readdirSync(scenarioPath).filter(file => file.endsWith('.png') || file.endsWith('.jpg'));

} catch (error) { console.error('Erro ao carregar arquivos de configuração:', error); }

const games = {};
const ATTACK_MOVE = { damage: 5 };
function rollD6() { return Math.floor(Math.random() * 6) + 1; }

function createNewLobbyState(gmId) { return { mode: 'lobby', phase: 'waiting_players', gmId: gmId, connectedPlayers: {}, unavailableCharacters: [], log: [{ text: "Lobby criado. Aguardando jogadores..." }], }; }

function createNewAdventureState() {
    return {
        mode: 'adventure', fighters: { players: {}, npcs: {} }, winner: null, reason: null, currentRound: 1,
        activeCharacterKey: null, turnOrder: [], turnIndex: 0, initiativeRolls: {}, phase: 'party_setup',
        log: [{ text: "Aguardando jogadores formarem o grupo..." }], scenario: 'mapas/cenarios externos/externo (1).png',
        gmId: null,
    };
}

// NOVO ESTADO PARA O MODO TEATRO
function createNewTheaterState(gmId) {
    return {
        mode: 'theater',
        gmId: gmId,
        scenario: 'mapas/cenarios externos/externo (1).png',
        characters: {}, // Armazenará personagens na cena
    };
}


function createNewFighterState(data) {
    const res = Math.max(1, parseInt(data.res, 10) || 1);
    const agi = parseInt(data.agi, 10) || 1;
    return {
        id: data.id, nome: data.nome, img: data.img, agi: agi, res: res, hpMax: res * 5, hp: res * 5, status: 'active'
    };
}

function logMessage(state, text, className = '') { if (state && state.log) { state.log.push({ text, className }); if (state.log.length > 50) state.log.shift(); } }
function getFighter(state, key) { return state.fighters.players[key] || state.fighters.npcs[key]; }

function checkGameOver(state) {
    const activePlayers = Object.values(state.fighters.players).filter(p => p.status === 'active');
    const activeNpcs = Object.values(state.fighters.npcs).filter(n => n.status === 'active');
    if (activeNpcs.length === 0 && Object.keys(state.fighters.npcs).length > 0) {
        state.phase = 'gameover'; state.winner = 'players'; state.reason = "Todos os inimigos foram derrotados! Vitória do grupo!";
        logMessage(state, state.reason, 'log-crit'); return true;
    }
    if (activePlayers.length === 0 && Object.keys(state.fighters.players).length > 0) {
        state.phase = 'gameover'; state.winner = 'npcs'; state.reason = "Todos os aventureiros foram derrotados...";
        logMessage(state, state.reason, 'log-crit'); return true;
    }
    return false;
}

function executeAttack(state, attackerKey, defenderKey, io, roomId) {
    const attacker = getFighter(state, attackerKey);
    const defender = getFighter(state, defenderKey);
    if (!attacker || !defender || attacker.status !== 'active' || defender.status !== 'active') return;
    io.to(roomId).emit('triggerAttackAnimation', { attackerKey });
    const roll = rollD6();
    const attackValue = roll + attacker.agi;
    const defenseValue = defender.agi;
    logMessage(state, `${attacker.nome} ataca ${defender.nome}!`);
    logMessage(state, `Rolagem de Ataque: D6(${roll}) + ${attacker.agi} AGI = <span class="highlight-result">${attackValue}</span> (AGI do Alvo: ${defenseValue})`, 'log-info');
    if (attackValue >= defenseValue) {
        logMessage(state, "Acertou!", 'log-hit');
        io.to(roomId).emit('triggerHitAnimation', { defenderKey });
        io.to(roomId).emit('playSound', 'baseforte01.mp3');
        defender.hp = Math.max(0, defender.hp - ATTACK_MOVE.damage);
        logMessage(state, `${defender.nome} sofre ${ATTACK_MOVE.damage} de dano!`, 'log-hit');
        if (defender.hp <= 0) {
            defender.status = 'down';
            logMessage(state, `${defender.nome} foi derrotado!`, 'log-crit');
        }
    } else {
        logMessage(state, "Errou!", 'log-miss');
        io.to(roomId).emit('playSound', 'Esquiva.mp3');
    }
}

function advanceTurn(state, io, roomId) {
    state.turnOrder = state.turnOrder.filter(id => getFighter(state, id)?.status === 'active');
    if (checkGameOver(state)) { io.to(roomId).emit('gameUpdate', state); return; }
    if (state.turnOrder.length === 0) return;
    state.turnIndex++;
    if (state.turnIndex >= state.turnOrder.length) {
        state.turnIndex = 0;
        state.currentRound++;
        logMessage(state, `--- ROUND ${state.currentRound} COMEÇA! ---`, 'log-turn');
    }
    state.activeCharacterKey = state.turnOrder[state.turnIndex];
    const newAttacker = getFighter(state, state.activeCharacterKey);
    if (newAttacker) { logMessage(state, `É a vez de ${newAttacker.nome}.`, 'log-info'); }
}

io.on('connection', (socket) => {
    socket.on('gmCreatesLobby', () => {
        const newRoomId = uuidv4().substring(0, 6);
        socket.join(newRoomId);
        socket.currentRoomId = newRoomId;
        const newState = createNewLobbyState(socket.id);
        games[newRoomId] = { id: newRoomId, players: [{ id: socket.id, role: 'gm' }], spectators: [], state: newState };
        socket.emit('assignRole', { role: 'gm', isGm: true });
        socket.emit('roomCreated', newRoomId);
        io.to(socket.id).emit('gameUpdate', newState);
    });

    // Envia todas as informações necessárias de uma vez
    const fullCharacterList = {
        players: PLAYABLE_CHARACTERS.map(name => ({ name, img: `images/players/${name}.png` })),
        npcs: Object.keys(ALL_NPCS).map(name => ({ name, img: `images/lutadores/${name}.png` }))
    };
    socket.emit('initialData', { characters: fullCharacterList, scenarios: ALL_SCENARIOS });


    socket.on('playerJoinsLobby', ({ roomId, role }) => {
        const room = games[roomId];
        if (!room) { socket.emit('error', { message: 'Sala não encontrada.' }); return; }
        if (role === 'player' && room.state.mode !== 'theater' && Object.keys(room.state.connectedPlayers).length >= MAX_PLAYERS) { socket.emit('error', { message: 'O grupo de aventureiros já está cheio.' }); return; }
        socket.join(roomId);
        socket.currentRoomId = roomId;
        if (room.players.find(p => p.id === socket.id) || room.spectators.includes(socket.id)) return;

        if (room.state.mode === 'theater') {
            room.players.push({ id: socket.id, role: role });
        } else if (role === 'spectator') { 
            room.spectators.push(socket.id);
        } else {
            room.players.push({ id: socket.id, role: 'player' });
            if (room.state.mode === 'lobby') { room.state.connectedPlayers[socket.id] = { id: socket.id, role: 'player', selectedCharacter: null }; }
        }
        socket.emit('assignRole', { role });
        io.to(socket.id).emit('gameUpdate', room.state);
        logMessage(room.state, `Um ${role} entrou na sala.`);
        io.to(roomId).emit('gameUpdate', room.state);
    });

    socket.on('playerAction', (action) => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId] || !action || !action.type) return;
        const room = games[roomId];
        const state = room.state;
        const playerKey = socket.id;
        
        // Ações do GM que não dependem do modo
        if (action.type === 'gmStartsTheater') {
            room.state = createNewTheaterState(state.gmId);
        } else if (action.type === 'gmStartsAdventure') {
            let newState = createNewAdventureState();
            newState.gmId = state.gmId;
            newState.lobbyCache = state;
            for (const sId in state.connectedPlayers) {
                const playerData = state.connectedPlayers[sId];
                if (playerData.selectedCharacter) {
                    newState.fighters.players[sId] = createNewFighterState({ id: sId, nome: playerData.selectedCharacter.nome, img: playerData.selectedCharacter.img });
                    io.to(sId).emit('assignRole', { role: 'player', playerKey: sId });
                }
            }
            room.state = newState;
        }

        // Ações específicas do modo Aventura
        if (state.mode === 'adventure') {
            switch (action.type) {
                case 'playerSelectsCharacter':
                    if (state.phase === 'waiting_players') {
                        if (state.unavailableCharacters.includes(action.character.nome)) { socket.emit('characterUnavailable', action.character.nome); return; }
                        state.unavailableCharacters.push(action.character.nome);
                        state.connectedPlayers[socket.id].selectedCharacter = action.character;
                        logMessage(state, `Jogador selecionou ${action.character.nome}.`);
                    }
                    break;
                case 'gmConfirmParty':
                    if (state.phase === 'party_setup') {
                        action.playerStats.forEach(pStat => {
                            if (state.fighters.players[pStat.id]) {
                               const player = state.fighters.players[pStat.id];
                               player.agi = pStat.agi; player.res = pStat.res;
                               player.hp = pStat.res * 5; player.hpMax = pStat.res * 5;
                            }
                        });
                        state.phase = 'npc_setup';
                        logMessage(state, `Grupo confirmado! GM está preparando os inimigos...`);
                    }
                    break;
                case 'gmStartBattle':
                    if (state.phase === 'npc_setup') {
                        action.npcs.forEach((npcConfig, index) => {
                            const npcId = `npc_${uuidv4().substring(0, 4)}_${index}`; // ID único para permitir duplicatas
                            state.fighters.npcs[npcId] = createNewFighterState({ id: npcId, ...npcConfig });
                        });
                        logMessage(state, `Os combatentes estão prontos! Rolem a iniciativa!`, 'log-turn');
                        state.phase = 'initiative_roll';
                    }
                    break;
                case 'roll_initiative':
                    // ... (código de iniciativa permanece o mesmo)
                    break;
                case 'attack':
                    const attacker = getFighter(state, action.attackerKey);
                    if (action.attackerKey !== state.activeCharacterKey || !attacker) return;
                    executeAttack(state, action.attackerKey, action.targetKey, io, roomId);
                    advanceTurn(state, io, roomId);
                    break;
                case 'end_turn':
                    if (action.actorKey !== state.activeCharacterKey) return;
                    advanceTurn(state, io, roomId);
                    break;
            }
        } 
        // Ações específicas do modo Teatro
        else if (state.mode === 'theater') {
            const isGm = socket.id === state.gmId;
            if (!isGm) return; // Apenas o GM pode controlar o teatro

            switch (action.type) {
                case 'theaterAddCharacter': {
                    const { name, img, type } = action.characterData;
                    const charId = `char_${uuidv4().substring(0, 6)}`;
                    state.characters[charId] = {
                        id: charId, name, img, type,
                        x: 50, y: 50, scale: 1, zIndex: 10
                    };
                    break;
                }
                case 'theaterMoveCharacter': {
                    const { id, x, y } = action;
                    if (state.characters[id]) {
                        state.characters[id].x = x;
                        state.characters[id].y = y;
                    }
                    // Emite apenas para os outros, não para quem moveu
                    socket.to(roomId).emit('gameUpdate', room.state);
                    return; // Retorna para evitar a emissão global no final
                }
                case 'theaterUpdateCharacter': {
                     const { id, updates } = action;
                     if (state.characters[id]) {
                        Object.assign(state.characters[id], updates);
                     }
                    break;
                }
                case 'theaterRemoveCharacter': {
                    delete state.characters[action.id];
                    break;
                }
                case 'theaterChangeScenario': {
                    state.scenario = action.scenario;
                    break;
                }
            }
        }

        // Emissão global no final de cada ação
        if (state.phase !== 'gameover' || !games[roomId].gameOverSent) {
             io.to(roomId).emit('gameUpdate', room.state);
             if(state.phase === 'gameover') { games[roomId].gameOverSent = true; }
        }
    });
    socket.on('disconnect', () => { /* ... */ });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));