//  VERSÃO CORRIGIDA DO SERVER.JS

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const games = {};
const MOVES = {
    'Jab': { cost: 1, damage: 1, penalty: 0 }, 'Direto': { cost: 2, damage: 3, penalty: 1 },
    'Upper': { cost: 3, damage: 6, penalty: 2 }, 'Liver Blow': { cost: 2, damage: 4, penalty: 2 }
};

const rollD = (s) => Math.floor(Math.random() * s) + 1;
const rollAttackD6 = () => { const r = rollD(100); if (r <= 5) return 6; if (r <= 10) return 1; return rollD(4) + 1; };

function createNewGameState() {
    return {
        fighters: {
            player1: { nome: "Nathan", agi: 3, res: 2, originalRes: 2, hpMax: 10, hp: 10, pa: 3, def: 0, hitsLanded: 0, knockdowns: 0, totalDamageTaken: 0 },
            player2: { nome: "Ivan", agi: 2, res: 3, originalRes: 3, hpMax: 15, hp: 15, pa: 3, def: 0, hitsLanded: 0, knockdowns: 0, totalDamageTaken: 0 }
        },
        moves: MOVES, currentRound: 1, currentTurn: 1, whoseTurn: null, didPlayer1GoFirst: false,
        phase: 'waiting', log: [{ text: "Aguardando oponente..." }], initiativeRolls: {}, knockdownInfo: null,
    };
}
function logMessage(state, text, className = '') { state.log.push({ text, className }); if (state.log.length > 50) state.log.shift(); }

function executeAttack(state, attackerKey, defenderKey, moveName) {
    const attacker = state.fighters[attackerKey], defender = state.fighters[defenderKey], move = state.moves[moveName];
    const roll = rollAttackD6(); let hit = false, crit = false;
    const attackValue = roll + attacker.agi - move.penalty;
    logMessage(state, `${attacker.nome}: D6(${roll}) + ${attacker.agi} AGI - ${move.penalty} Pen = <span class="highlight-result">${attackValue}</span> (Defesa: ${defender.def})`, 'log-info');
    if (roll === 1) { logMessage(state, "Erro Crítico!", 'log-miss'); }
    else if (roll === 6) { logMessage(state, "Acerto Crítico!", 'log-crit'); hit = true; crit = true; }
    else { if (attackValue >= defender.def) { logMessage(state, "Acertou!", 'log-hit'); hit = true; } else { logMessage(state, "Errou!", 'log-miss'); } }
    if (hit) {
        let damage = crit ? move.damage * 2 : move.damage;
        defender.hp = Math.max(0, defender.hp - damage);
        attacker.hitsLanded++; defender.totalDamageTaken += damage;
        logMessage(state, `${defender.nome} sofre ${damage} de dano!`, 'log-hit');
    }
    return hit;
}

function endTurn(state) {
    const lastPlayerKey = state.whoseTurn;
    state.whoseTurn = (lastPlayerKey === 'player1') ? 'player2' : 'player1';
    const lastPlayerWentFirst = (lastPlayerKey === 'player1' && state.didPlayer1GoFirst) || (lastPlayerKey === 'player2' && !state.didPlayer1GoFirst);
    if (lastPlayerWentFirst) {
        state.phase = 'turn';
    } else {
        processEndRound(state);
    }
}

function processEndRound(state) {
    state.currentTurn++;
    if (state.currentTurn > 4) {
        state.currentRound++;
        if (state.currentRound > 4) {
            endFightByDecision(state); return;
        }
        state.currentTurn = 1;
        state.fighters.player1.pa = 3; state.fighters.player2.pa = 3;
        logMessage(state, `--- FIM DO ROUND ${state.currentRound - 1} ---`, 'log-info');
        state.phase = 'initiative_p1';
    } else {
        state.fighters.player1.pa += 3; state.fighters.player2.pa += 3;
        logMessage(state, `--- Fim da Rodada ${state.currentTurn - 1} ---`, 'log-turn');
        state.whoseTurn = state.didPlayer1GoFirst ? 'player1' : 'player2';
        state.phase = 'turn';
    }
}

function endFightByDecision(state) { state.phase = 'decision'; /*...*/ state.phase = 'gameover'; /*...*/ }

function handleKnockdown(state, downedPlayerKey) {
    state.phase = 'knockdown';
    const fighter = state.fighters[downedPlayerKey];
    fighter.knockdowns++;
    logMessage(state, `${fighter.nome} foi NOCAUTEADO!`, 'log-crit');
    if (fighter.res <= 1) {
        logMessage(state, `${fighter.nome} não consegue se levantar. Fim da luta!`, 'log-crit');
        state.phase = 'gameover';
        state.winner = (downedPlayerKey === 'player1') ? 'player2' : 'player1';
        return;
    }
    state.knockdownInfo = { downedPlayer: downedPlayerKey, attempts: 0 };
}

function dispatchActionModal(room) {
    const { state, id: roomId } = room;
    let modalPayload = null;
    let targetPlayerKey = null;

    switch (state.phase) {
        case 'initiative_p1':
            targetPlayerKey = 'player1';
            modalPayload = { title: `Iniciativa`, text: "Role sua iniciativa.", btnText: "Rolar D6", action: { type: 'roll_initiative', playerKey: 'player1' } };
            break;
        case 'initiative_p2':
            targetPlayerKey = 'player2';
            modalPayload = { title: `Iniciativa`, text: "Role sua iniciativa.", btnText: "Rolar D6", action: { type: 'roll_initiative', playerKey: 'player2' } };
            break;
        case 'defense_p1':
            targetPlayerKey = 'player1';
            modalPayload = { title: `Defesa`, text: "Role sua defesa.", btnText: "Rolar D3", action: { type: 'roll_defense', playerKey: 'player1' } };
            break;
        case 'defense_p2':
            targetPlayerKey = 'player2';
            modalPayload = { title: `Defesa`, text: "Role sua defesa.", btnText: "Rolar D3", action: { type: 'roll_defense', playerKey: 'player2' } };
            break;
        case 'knockdown':
            if (state.knockdownInfo) {
                targetPlayerKey = state.knockdownInfo.downedPlayer;
                modalPayload = {
                    title: `Você caiu!`, text: `Tentativas restantes: ${4 - state.knockdownInfo.attempts}`,
                    btnText: `Tentar Levantar`, action: { type: 'request_get_up', playerKey: targetPlayerKey }
                };
            }
            break;
        default:
            io.to(roomId).emit('hideModal');
            return;
    }

    if (modalPayload && targetPlayerKey) {
        io.to(roomId).emit('showModal', { ...modalPayload, targetPlayerKey });
    }
}

io.on('connection', (socket) => {
    socket.on('joinGame', (roomId) => {
        if (roomId && games[roomId] && games[roomId].players.length === 1) {
            socket.join(roomId);
            const room = games[roomId];
            room.players.push({ id: socket.id, playerKey: 'player2' });
            socket.currentRoomId = roomId;

            io.to(room.players[0].id).emit('assignPlayer', 'player1');
            io.to(room.players[1].id).emit('assignPlayer', 'player2');

            logMessage(room.state, `${room.state.fighters.player2.nome} entrou. Preparem-se!`, 'log-info');
            room.state.phase = 'initiative_p1';
            
            io.to(roomId).emit('gameUpdate', room.state);
            dispatchActionModal(room); 

        } else {
            const newRoomId = uuidv4().substring(0, 6);
            socket.join(newRoomId);
            socket.currentRoomId = newRoomId;
            games[newRoomId] = { id: newRoomId, players: [{ id: socket.id, playerKey: 'player1' }], state: createNewGameState() };
            
            socket.emit('assignPlayer', 'player1');
            socket.emit('roomCreated', newRoomId);
            io.to(newRoomId).emit('gameUpdate', games[newRoomId].state);
        }
    });

    socket.on('playerAction', (action) => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId]) return;
        
        const room = games[roomId];
        const state = room.state;
        const playerKey = action.playerKey;

        // Guarda de Validação Simplificada: A ação deve corresponder à fase atual
        const expectedPhase = `${action.type.split('_')[1]}_${playerKey}`;
        if ((action.type.startsWith('roll_') && state.phase !== expectedPhase)) {
            // Ação de rolagem fora de hora, ignora.
            return;
        }
        if ((action.type === 'attack' || action.type === 'end_turn') && (state.phase !== 'turn' || state.whoseTurn !== playerKey)) {
            // Ação de turno fora da vez/fase, ignora.
            return;
        }

        switch (action.type) {
            case 'roll_initiative':
                const roll = rollD(6);
                io.to(roomId).emit('diceRoll', { playerKey, rollValue: roll, diceType: 'd6' });
                state.initiativeRolls[playerKey] = roll + state.fighters[playerKey].agi;
                logMessage(state, `${state.fighters[playerKey].nome} rolou iniciativa: ${state.initiativeRolls[playerKey]}`, 'log-info');
                
                if (playerKey === 'player1') {
                    state.phase = 'initiative_p2';
                } else {
                    if (state.initiativeRolls.player1 >= state.initiativeRolls.player2) { state.whoseTurn = 'player1'; state.didPlayer1GoFirst = true; }
                    else { state.whoseTurn = 'player2'; state.didPlayer1GoFirst = false; }
                    logMessage(state, `${state.fighters[state.whoseTurn].nome} venceu a iniciativa!`, 'log-info');
                    state.phase = 'defense_p1';
                }
                break;

            case 'roll_defense':
                const defRoll = rollD(3);
                io.to(roomId).emit('diceRoll', { playerKey, rollValue: defRoll, diceType: 'd3' });
                state.fighters[playerKey].def = defRoll + state.fighters[playerKey].res;
                logMessage(state, `${state.fighters[playerKey].nome} definiu defesa: ${state.fighters[playerKey].def}`, 'log-info');

                if (playerKey === 'player1') {
                    state.phase = 'defense_p2';
                } else {
                    logMessage(state, `--- ROUND ${state.currentRound} COMEÇA! ---`, 'log-turn');
                    state.phase = 'turn';
                }
                break;

            case 'attack':
                const move = state.moves[action.move];
                if (state.fighters[playerKey].pa >= move.cost) {
                    state.fighters[playerKey].pa -= move.cost;
                    const defenderKey = (playerKey === 'player1') ? 'player2' : 'player1';
                    executeAttack(state, playerKey, defenderKey, action.move);
                    if (state.fighters[defenderKey].hp <= 0) handleKnockdown(state, defenderKey);
                }
                break;

            case 'end_turn':
                endTurn(state);
                break;

            case 'request_get_up':
                const info = state.knockdownInfo;
                if (!info || info.downedPlayer !== playerKey || state.phase !== 'knockdown') return;
                info.attempts++;
                const getUpRoll = rollD(6);
                io.to(roomId).emit('diceRoll', { playerKey, rollValue: getUpRoll, diceType: 'd6' });
                const totalRoll = getUpRoll + state.fighters[playerKey].res;
                logMessage(state, `${state.fighters[playerKey].nome} tenta se levantar: ${totalRoll}`, 'log-info');
                if (totalRoll >= 7) {
                    logMessage(state, `Ele se levantou!`, 'log-info');
                    state.fighters[playerKey].res--;
                    state.fighters[playerKey].hp = state.fighters[playerKey].res * 5;
                    state.phase = 'turn'; 
                    state.knockdownInfo = null;
                } else if (info.attempts >= 4) {
                    logMessage(state, `Não conseguiu! Fim da luta!`, 'log-crit');
                    state.phase = 'gameover';
                    state.winner = (playerKey === 'player1') ? 'player2' : 'player1';
                }
                break;
        }

        io.to(roomId).emit('gameUpdate', room.state);
        dispatchActionModal(room);
    });

    socket.on('disconnect', () => { /* ... */ });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));