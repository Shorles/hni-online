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

let LUTA_CHARACTERS = {};
const PLAYABLE_CHARACTERS = ['Ryu', 'Yobu', 'Nathan', 'Okami'];
const MAX_PLAYERS = 4;

try {
    const lutadoresData = fs.readFileSync('lutadores.json', 'utf8');
    const lutadoresNomes = lutadoresData.replace(/[\[\]]/g, '').split(',').map(name => name.replace(/"/g, '').trim()).filter(name => name);
    lutadoresNomes.forEach(nome => { LUTA_CHARACTERS[nome] = { agi: 2, res: 3 }; });
} catch (error) { console.error('Erro ao carregar lutadores.json:', error); }

const games = {};
const ATTACK_MOVE = { damage: 5 };
function rollD6() { return Math.floor(Math.random() * 6) + 1; }

function createNewLobbyState(gmId) { return { mode: 'lobby', phase: 'waiting_players', gmId: gmId, connectedPlayers: {}, unavailableCharacters: [], log: [{ text: "Lobby criado. Aguardando jogadores..." }], }; }

function createNewGameState() {
    return {
        fighters: { players: {}, npcs: {} }, winner: null, reason: null, currentRound: 1, whoseTurn: null,
        activeCharacterKey: null, turnOrder: [], turnIndex: -1, initiativeRolls: {}, phase: 'party_setup',
        log: [{ text: "Aguardando jogadores formarem o grupo..." }], scenario: 'mapas/cenarios externos/externo (1).png',
        mode: 'adventure', gmId: null,
    };
}

function createNewFighterState(data) {
    const res = Math.max(1, parseInt(data.res, 10) || 1);
    const agi = parseInt(data.agi, 10) || 1;
    return {
        id: data.id, nome: data.nome, img: data.img, agi: agi, res: res, hpMax: res * 5, hp: res * 5,
        status: 'active', hasActed: false 
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
    if (state.phase !== 'battle') return;
    const lastPlayerId = state.turnOrder.shift();
    if (getFighter(state, lastPlayerId) && getFighter(state, lastPlayerId).status === 'active') {
        state.turnOrder.push(lastPlayerId);
    }
    state.turnOrder = state.turnOrder.filter(id => getFighter(state, id) && getFighter(state, id).status === 'active');
    if (checkGameOver(state)) { io.to(roomId).emit('gameUpdate', state); return; }
    if (state.turnOrder.length === 0) { return; }
    const allHaveActed = state.turnOrder.every(id => getFighter(state, id).hasActed);
    if (allHaveActed) {
        state.currentRound++;
        state.turnOrder.forEach(id => getFighter(state, id).hasActed = false);
        logMessage(state, `--- ROUND ${state.currentRound} COMEÇA! ---`, 'log-turn');
    }
    state.activeCharacterKey = state.turnOrder[0];
    const newAttacker = getFighter(state, state.activeCharacterKey);
    logMessage(state, `É a vez de ${newAttacker.nome}.`, 'log-info');
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
    socket.emit('availableFighters', { p1: LUTA_CHARACTERS, playable: PLAYABLE_CHARACTERS.map(name => ({ name, img: `images/${name}.png` })) });
    socket.on('playerJoinsLobby', ({ roomId, role }) => {
        const room = games[roomId];
        if (!room) { socket.emit('error', { message: 'Sala não encontrada.' }); return; }
        if (role === 'player' && Object.keys(room.state.connectedPlayers).length >= MAX_PLAYERS) { socket.emit('error', { message: 'O grupo de aventureiros já está cheio.' }); return; }
        socket.join(roomId);
        socket.currentRoomId = roomId;
        if (room.players.find(p => p.id === socket.id) || room.spectators.includes(socket.id)) return;
        if (role === 'spectator') { room.spectators.push(socket.id); } 
        else {
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
        switch (action.type) {
            case 'playerSelectsCharacter': {
                if (state.mode !== 'lobby') return;
                const { character } = action;
                if (state.unavailableCharacters.includes(character.nome)) { socket.emit('characterUnavailable', character.nome); return; }
                state.unavailableCharacters.push(character.nome);
                state.connectedPlayers[socket.id].selectedCharacter = character;
                logMessage(state, `Jogador selecionou ${character.nome}.`);
                break;
            }
            case 'gmStartsAdventure': {
                let newState = createNewGameState();
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
                break;
            }
            case 'gmConfirmParty': {
                if (state.phase !== 'party_setup') return;
                action.playerStats.forEach(pStat => {
                    if (state.fighters.players[pStat.id]) {
                       const player = state.fighters.players[pStat.id];
                       player.agi = pStat.agi; player.res = pStat.res;
                       player.hp = pStat.res * 5; player.hpMax = pStat.res * 5;
                    }
                });
                state.phase = 'npc_setup';
                logMessage(state, `Grupo confirmado! GM está preparando os inimigos...`);
                break;
            }
            case 'gmStartBattle': {
                if (state.phase !== 'npc_setup') return;
                const { npcs } = action;
                npcs.forEach((npcConfig, index) => { const npcId = `npc_${index}`; state.fighters.npcs[npcId] = createNewFighterState({ id: npcId, ...npcConfig }); });
                logMessage(state, `Os combatentes estão prontos! Rolem a iniciativa!`, 'log-turn');
                state.phase = 'initiative_roll';
                break;
            }
            case 'roll_initiative': {
                if (state.phase !== 'initiative_roll') return;
                const charactersToRoll = action.isGmRoll ? Object.values(state.fighters.npcs) : [getFighter(state, playerKey)];
                charactersToRoll.forEach(char => {
                    if (char && !state.initiativeRolls[char.id]) {
                        const roll = rollD6(); state.initiativeRolls[char.id] = char.agi + roll;
                        logMessage(state, `${char.nome} rolou iniciativa: ${state.initiativeRolls[char.id]} (AGI ${char.agi} + D6 ${roll})`, 'log-info');
                    }
                });
                const allFighters = [...Object.values(state.fighters.players), ...Object.values(state.fighters.npcs)];
                const allRolled = allFighters.every(f => f.status !== 'active' || state.initiativeRolls[f.id] !== undefined);
                if (allRolled) {
                    const sortedFighters = allFighters.filter(f => f.status === 'active').sort((a, b) => {
                            const rollA = state.initiativeRolls[a.id]; const rollB = state.initiativeRolls[b.id];
                            if (rollA !== rollB) return rollB - rollA;
                            const getLayer = (fighterId) => {
                                const isPlayer = !!state.fighters.players[fighterId];
                                const list = Object.keys(isPlayer ? state.fighters.players : state.fighters.npcs);
                                const index = list.indexOf(fighterId); return 14 - index;
                            };
                            const layerA = getLayer(a.id); const layerB = getLayer(b.id);
                            if (layerA !== layerB) return layerB - layerA;
                            const isPlayerA = !!state.fighters.players[a.id];
                            if (isPlayerA) return -1; return 1;
                        });
                    state.turnOrder = sortedFighters.map(f => f.id);
                    logMessage(state, "Ordem de turno definida!", "log-crit");
                    state.phase = 'battle';
                    state.turnIndex = -1;
                    advanceTurn(state, io, roomId);
                }
                break;
            }
            case 'attack':
                const isGm = socket.id === state.gmId;
                const attackerKey = action.attackerKey;
                const isGmAction = isGm && state.fighters.npcs[attackerKey];
                const isPlayerAction = playerKey === attackerKey;
                if (!isPlayerAction && !isGmAction) return;
                const attacker = getFighter(state, attackerKey);
                if (attackerKey !== state.activeCharacterKey || (attacker && attacker.hasActed)) return;
                
                executeAttack(state, attackerKey, action.targetKey, io, roomId);
                if (attacker) { attacker.hasActed = true; }

                // AJUSTE CRÍTICO: Avança o turno automaticamente após o ataque.
                // Usamos um pequeno delay para dar tempo das animações começarem no cliente.
                setTimeout(() => {
                    advanceTurn(state, io, roomId);
                    io.to(roomId).emit('gameUpdate', room.state);
                }, 700); // 700ms de delay
                return; // Impede a emissão dupla do gameUpdate no final do switch.

            case 'end_turn':
                const actorKey = action.actorKey;
                if (actorKey !== state.activeCharacterKey) return;
                advanceTurn(state, io, roomId);
                break;
        }
        io.to(roomId).emit('gameUpdate', room.state);
    });
    socket.on('disconnect', () => { /* ... */ });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));