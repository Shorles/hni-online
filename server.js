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
let PLAYABLE_CHARACTERS = [];
const MAX_PLAYERS = 4;

try {
    const charactersData = fs.readFileSync('characters.json', 'utf8');
    const characters = JSON.parse(charactersData);
    PLAYABLE_CHARACTERS = characters.players || [];
    const npcNames = characters.npcs || [];
    npcNames.forEach(nome => { LUTA_CHARACTERS[nome] = { agi: 2, res: 3 }; });
} catch (error) { console.error('Erro ao carregar characters.json:', error); }

const games = {};
const ATTACK_MOVE = { damage: 5 };
function rollD6() { return Math.floor(Math.random() * 6) + 1; }

function createNewLobbyState(gmId) { return { mode: 'lobby', phase: 'waiting_players', gmId: gmId, connectedPlayers: {}, unavailableCharacters: [], log: [{ text: "Lobby criado. Aguardando jogadores..." }], }; }

function createNewGameState() {
    return {
        fighters: { players: {}, npcs: {} }, winner: null, reason: null, currentRound: 1,
        activeCharacterKey: null, turnOrder: [], turnIndex: 0, // Inicia no índice 0
        initiativeRolls: {}, phase: 'party_setup',
        log: [{ text: "Aguardando jogadores formarem o grupo..." }], scenario: 'mapas/cenarios externos/externo (1).png',
        mode: 'adventure', gmId: null,
    };
}

function createNewFighterState(data) {
    const res = Math.max(1, parseInt(data.res, 10) || 1);
    const agi = parseInt(data.agi, 10) || 1;
    return {
        id: data.id, nome: data.nome, img: data.img, agi: agi, res: res, hpMax: res * 5, hp: res * 5,
        status: 'active' // A flag 'hasActed' foi removida, não é mais necessária
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

// Lógica de avanço de turno completamente refatorada para ser mais simples e robusta
function advanceTurn(state, io, roomId) {
    // 1. Remove personagens derrotados da ordem de turno para evitar que tenham um turno
    state.turnOrder = state.turnOrder.filter(id => getFighter(state, id)?.status === 'active');
    
    // 2. Checa se o jogo acabou após remover os derrotados
    if (checkGameOver(state)) {
        io.to(roomId).emit('gameUpdate', state);
        return;
    }

    // Se não houver ninguém na ordem, não faz nada
    if (state.turnOrder.length === 0) return;

    // 3. Incrementa o índice do turno
    state.turnIndex++;

    // 4. Se o índice passar do fim da lista, começa um novo round
    if (state.turnIndex >= state.turnOrder.length) {
        state.turnIndex = 0;
        state.currentRound++;
        logMessage(state, `--- ROUND ${state.currentRound} COMEÇA! ---`, 'log-turn');
    }

    // 5. Define o personagem ativo
    state.activeCharacterKey = state.turnOrder[state.turnIndex];
    const newAttacker = getFighter(state, state.activeCharacterKey);
    if (newAttacker) {
        logMessage(state, `É a vez de ${newAttacker.nome}.`, 'log-info');
    }
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

    socket.emit('availableFighters', { 
        p1: LUTA_CHARACTERS,
        playable: PLAYABLE_CHARACTERS.map(name => ({ name, img: `images/players/${name}.png` })) 
    });

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
                            return Math.random() - 0.5; // Desempate aleatório simples
                        });
                    state.turnOrder = sortedFighters.map(f => f.id);
                    logMessage(state, "Ordem de turno definida!", "log-crit");
                    state.phase = 'battle';
                    state.turnIndex = 0; // Começa no primeiro jogador da lista
                    state.activeCharacterKey = state.turnOrder[0]; // Define o primeiro a jogar
                    logMessage(state, `É a vez de ${getFighter(state, state.activeCharacterKey).nome}.`, 'log-info');
                }
                break;
            }
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
        if (state.phase !== 'gameover' || !games[roomId].gameOverSent) {
             io.to(roomId).emit('gameUpdate', room.state);
             if(state.phase === 'gameover') {
                 games[roomId].gameOverSent = true;
             }
        }
    });
    socket.on('disconnect', () => { /* ... */ });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));