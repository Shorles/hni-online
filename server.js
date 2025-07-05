// VERSÃO CORRIGIDA E ROBUSTA - BUG DA INICIATIVA RESOLVIDO

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
        fighters: {}, pendingP2Choice: null, winner: null,
        moves: MOVES, currentRound: 1, currentTurn: 1, whoseTurn: null, didPlayer1GoFirst: false,
        phase: 'waiting', log: [{ text: "Aguardando oponente..." }], initiativeRolls: {}, knockdownInfo: null,
    };
}

function logMessage(state, text, className = '') { state.log.push({ text, className }); if (state.log.length > 50) state.log.shift(); }

function executeAttack(state, attackerKey, defenderKey, moveName, io, roomId) {
    io.to(roomId).emit('triggerAttackAnimation', { attackerKey });
    const attacker = state.fighters[attackerKey], defender = state.fighters[defenderKey], move = state.moves[moveName];
    logMessage(state, `${attacker.nome} usa <span class="log-move-name">${moveName}</span>!`);
    const roll = rollAttackD6(); let hit = false, crit = false;
    const attackValue = roll + attacker.agi - move.penalty;
    logMessage(state, `Rolagem de Ataque: D6(${roll}) + ${attacker.agi} AGI - ${move.penalty} Pen = <span class="highlight-result">${attackValue}</span> (Defesa: ${defender.def})`, 'log-info');
    if (roll === 1) { logMessage(state, "Erro Crítico!", 'log-miss'); io.to(roomId).emit('playSound', 'miss');
    } else if (roll === 6) { logMessage(state, "Acerto Crítico!", 'log-crit'); hit = true; crit = true; 
    } else { if (attackValue >= defender.def) { logMessage(state, "Acertou!", 'log-hit'); hit = true; } else { logMessage(state, "Errou!", 'log-miss'); io.to(roomId).emit('playSound', 'miss'); } }
    if (hit) {
        io.to(roomId).emit('triggerHitAnimation', { defenderKey });
        if (crit) { io.to(roomId).emit('playSound', 'critical'); } else { switch (moveName) { case 'Jab': io.to(roomId).emit('playSound', 'jab'); break; default: io.to(roomId).emit('playSound', 'strong'); break; } }
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
    if (lastPlayerWentFirst) { state.phase = 'turn'; } else { processEndRound(state); }
}

function processEndRound(state) {
    state.currentTurn++;
    if (state.currentTurn > 4) {
        state.currentRound++;
        if (state.currentRound > 4) { endFightByDecision(state); return; }
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
    state.knockdownInfo = { downedPlayer: downedPlayerKey, attempts: 0, lastRoll: null };
}

function isActionValid(state, action) {
    const { type, playerKey } = action;
    switch (state.phase) {
        case 'p2_stat_assignment': return type === 'set_p2_stats' && playerKey === 'player1';
        case 'initiative_p1': return type === 'roll_initiative' && playerKey === 'player1';
        case 'initiative_p2': return type === 'roll_initiative' && playerKey === 'player2';
        case 'defense_p1': return type === 'roll_defense' && playerKey === 'player1';
        case 'defense_p2': return type === 'roll_defense' && playerKey === 'player2';
        case 'turn': return (type === 'attack' || type === 'end_turn' || type === 'forfeit') && playerKey === state.whoseTurn;
        case 'knockdown': return type === 'request_get_up' && playerKey === state.knockdownInfo?.downedPlayer;
        case 'gameover': return false;
        default: return false;
    }
}

function dispatchAction(room) {
    if (!room) return;
    const { state, id: roomId } = room;
    let modalPayload = null;
    let targetPlayerKey = null;
    io.to(roomId).emit('hideRollButtons');
    switch (state.phase) {
        case 'initiative_p1': io.to(roomId).emit('promptRoll', { targetPlayerKey: 'player1', text: 'Rolar Iniciativa (D6)', action: { type: 'roll_initiative', playerKey: 'player1' }}); return;
        case 'initiative_p2': io.to(roomId).emit('promptRoll', { targetPlayerKey: 'player2', text: 'Rolar Iniciativa (D6)', action: { type: 'roll_initiative', playerKey: 'player2' }}); return;
        case 'defense_p1': io.to(roomId).emit('promptRoll', { targetPlayerKey: 'player1', text: 'Rolar Defesa (D3)', action: { type: 'roll_defense', playerKey: 'player1' }}); return;
        case 'defense_p2': io.to(roomId).emit('promptRoll', { targetPlayerKey: 'player2', text: 'Rolar Defesa (D3)', action: { type: 'roll_defense', playerKey: 'player2' }}); return;
        case 'knockdown':
            if (state.knockdownInfo) {
                targetPlayerKey = state.knockdownInfo.downedPlayer;
                modalPayload = { modalType: 'knockdown', knockdownInfo: state.knockdownInfo, title: `Você caiu!`, text: `Tentativas restantes: ${4 - state.knockdownInfo.attempts}`, btnText: `Tentar Levantar`, action: { type: 'request_get_up', playerKey: targetPlayerKey } };
            }
            break;
        case 'gameover':
            const winner = state.fighters[state.winner];
            const reason = state.reason || `VITÓRIA DE ${winner.nome.toUpperCase()}`;
            io.to(roomId).emit('showModal', { modalType: 'gameover', title: "Fim da Luta!", text: reason});
            return;
        default: io.to(roomId).emit('hideModal'); return;
    }
    if (modalPayload) io.to(roomId).emit('showModal', { ...modalPayload, targetPlayerKey });
}

io.on('connection', (socket) => {
    socket.on('createGame', (player1Data) => { /* ... (sem alterações) ... */ });
    socket.on('joinGame', ({ roomId, player2Data }) => { /* ... (sem alterações) ... */ });
    socket.on('spectateGame', (roomId) => { /* ... (sem alterações) ... */ });

    socket.on('playerAction', (action) => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId] || !action || !action.playerKey) return;
        const room = games[roomId];
        const state = room.state;
        if (!isActionValid(state, action)) { console.log(`Ação inválida REJEITADA: `, action, `na fase: ${state.phase}`); return; }
        const playerKey = action.playerKey;

        switch (action.type) {
            case 'forfeit':
                const winnerKey = playerKey === 'player1' ? 'player2' : 'player1';
                state.winner = winnerKey;
                state.phase = 'gameover';
                const loserName = state.fighters[playerKey].nome;
                const winnerName = state.fighters[winnerKey].nome;
                state.reason = `${loserName} jogou a toalha. Vitória de ${winnerName}!`;
                logMessage(state, state.reason, 'log-crit');
                break;
            // ... (outros cases sem alterações) ...
            case 'request_get_up':
                const info = state.knockdownInfo;
                if (!info || info.downedPlayer !== playerKey) return;
                
                info.attempts++;
                const getUpRoll = rollD(6);
                io.to(roomId).emit('diceRoll', { playerKey, rollValue: getUpRoll, diceType: 'd6' });
                const totalRoll = getUpRoll + state.fighters[playerKey].res;
                info.lastRoll = totalRoll;
                logMessage(state, `${state.fighters[playerKey].nome} tenta se levantar... Rolagem: ${totalRoll}`, 'log-info');
                
                if (totalRoll >= 7) {
                    const fighter = state.fighters[playerKey];
                    // >>> Envia mensagem de sucesso e aguarda 3s
                    io.to(roomId).emit('getUpSuccess', { 
                        downedPlayerName: fighter.nome,
                        rollValue: totalRoll 
                    });
                    setTimeout(() => {
                        logMessage(state, `Ele se levantou!`, 'log-info');
                        fighter.res--;
                        const newHp = fighter.res * 5;
                        fighter.hp = newHp;
                        fighter.hpMax = newHp;
                        state.phase = 'turn'; 
                        state.knockdownInfo = null;
                        io.to(roomId).emit('gameUpdate', room.state);
                        dispatchAction(room);
                    }, 3000);
                    return; // Retorna para não enviar o update imediato
                } else if (info.attempts >= 4) {
                    logMessage(state, `Não conseguiu! Fim da luta!`, 'log-crit');
                    state.phase = 'gameover';
                    state.winner = (playerKey === 'player1') ? 'player2' : 'player1';
                }
                break;
            // ... (outros cases sem alterações) ...
        }

        io.to(roomId).emit('gameUpdate', room.state);
        dispatchAction(room);
    });

    socket.on('disconnect', () => { /* ... (sem alterações) ... */ });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));