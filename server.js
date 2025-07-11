// VERSÃO FINAL CONSOLIDADA

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
const SPECIAL_MOVES = {
    'Counter': { cost: 3, damage: 7, penalty: 1 },         // Corrigido
    'Flicker Jab': { cost: 3, damage: 1, penalty: 1 },     // Corrigido
    'Smash': { cost: 2, damage: 8, penalty: 3 },
    'Bala': { cost: 1, damage: 2, penalty: 0 },
    'Gazelle Punch': { cost: 3, damage: 8, penalty: 2 },
    'Frog Punch': { cost: 4, damage: 7, penalty: 1 },
    'White Fang': { cost: 4, damage: 4, penalty: 1 }
};
const ALL_MOVES = { ...MOVES, ...SPECIAL_MOVES };

const rollD = (s) => Math.floor(Math.random() * s) + 1;
const rollAttackD6 = () => { const r = rollD(100); if (r <= 5) return 6; if (r <= 10) return 1; return rollD(4) + 1; };

function createNewGameState() {
    return {
        fighters: {}, pendingP2Choice: null, winner: null, reason: null,
        moves: ALL_MOVES, currentRound: 1, currentTurn: 1, whoseTurn: null, didPlayer1GoFirst: false,
        phase: 'waiting', log: [{ text: "Aguardando oponente..." }], initiativeRolls: {}, knockdownInfo: null,
        decisionInfo: null, followUpState: null
    };
}

function createNewFighterState(data) {
    const res = Math.max(1, parseInt(data.res, 10));
    const hp = res * 5;
    return {
        nome: data.nome, img: data.img, agi: parseInt(data.agi, 10), res: res, originalRes: res,
        hpMax: hp, hp: hp, pa: 3, def: 0, hitsLanded: 0, knockdowns: 0, totalDamageTaken: 0,
        specialMoves: data.specialMoves || []
    };
}

function logMessage(state, text, className = '') { state.log.push({ text, className }); if (state.log.length > 50) state.log.shift(); }

function executeAttack(state, attackerKey, defenderKey, moveName, io, roomId) {
    io.to(roomId).emit('triggerAttackAnimation', { attackerKey });
    const attacker = state.fighters[attackerKey];
    const defender = state.fighters[defenderKey];
    const move = state.moves[moveName];
    
    logMessage(state, `${attacker.nome} usa <span class="log-move-name">${moveName}</span>!`);
    const roll = rollAttackD6();
    let hit = false;
    let crit = false;
    
    const attackValue = roll + attacker.agi - move.penalty;
    logMessage(state, `Rolagem de Ataque: D6(${roll}) + ${attacker.agi} AGI - ${move.penalty} Pen = <span class="highlight-result">${attackValue}</span> (Defesa: ${defender.def})`, 'log-info');
    
    if (roll === 1) {
        logMessage(state, "Erro Crítico!", 'log-miss');
        io.to(roomId).emit('playSound', 'miss');
    } else if (roll === 6) {
        logMessage(state, "Acerto Crítico!", 'log-crit');
        hit = true;
        crit = true;
    } else {
        if (attackValue >= defender.def) {
            logMessage(state, "Acertou!", 'log-hit');
            hit = true;
        } else {
            logMessage(state, "Errou!", 'log-miss');
            io.to(roomId).emit('playSound', 'miss');
        }
    }
    
    if (hit) {
        io.to(roomId).emit('triggerHitAnimation', { defenderKey });
        if (crit) { io.to(roomId).emit('playSound', 'critical'); } else { io.to(roomId).emit('playSound', 'strong'); }
        
        let damage = crit ? move.damage * 2 : move.damage;
        const hpBeforeHit = defender.hp;
        defender.hp = Math.max(0, defender.hp - damage);
        const actualDamageTaken = hpBeforeHit - defender.hp;
        
        attacker.hitsLanded++;
        defender.totalDamageTaken += actualDamageTaken;
        logMessage(state, `${defender.nome} sofre ${actualDamageTaken} de dano!`, 'log-hit');
    } else {
        // Regra especial do Counter
        if (moveName === 'Counter') {
            logMessage(state, `${attacker.nome} erra o contra-ataque e se desequilibra, sofrendo 3 de dano!`, 'log-crit');
            const hpBeforeSelfHit = attacker.hp;
            attacker.hp = Math.max(0, attacker.hp - 3);
            const actualSelfDamage = hpBeforeSelfHit - attacker.hp;
            attacker.totalDamageTaken += actualSelfDamage; // Contabiliza dano para decisão
            if (attacker.hp <= 0) {
                // Atraso para o fluxo do jogo fazer sentido
                setTimeout(() => handleKnockdown(state, attackerKey, io, roomId), 500);
            }
        }
    }
    return hit;
}

function endTurn(state, io, roomId) {
    const lastPlayerKey = state.whoseTurn;
    state.followUpState = null; // Limpa o estado de follow-up ao fim do turno
    state.whoseTurn = (lastPlayerKey === 'player1') ? 'player2' : 'player1';
    const lastPlayerWentFirst = (lastPlayerKey === 'player1' && state.didPlayer1GoFirst) || (lastPlayerKey === 'player2' && !state.didPlayer1GoFirst);
    if (lastPlayerWentFirst) { state.phase = 'turn'; } else { processEndRound(state, io, roomId); }
}

function processEndRound(state, io, roomId) {
    state.currentTurn++;
    if (state.currentTurn > 4) {
        state.currentRound++;
        if (state.currentRound > 4) {
            calculateDecisionScores(state);
            state.phase = 'decision_table_wait';
            logMessage(state, `A luta foi para a decisão.`, 'log-info');
            return;
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

function calculateDecisionScores(state) {
    const p1 = state.fighters.player1;
    const p2 = state.fighters.player2;
    let p1Score = 10, p2Score = 10;
    const p1KnockdownPenalty = p1.knockdowns, p2KnockdownPenalty = p2.knockdowns;
    p1Score -= p1KnockdownPenalty; p2Score -= p2KnockdownPenalty;
    let p1HitsPenalty = 0, p2HitsPenalty = 0;
    if (p1.hitsLanded < p2.hitsLanded) { p1HitsPenalty = 1; p1Score -= 1; }
    else if (p2.hitsLanded < p1.hitsLanded) { p2HitsPenalty = 1; p2Score -= 1; }
    let p1DamagePenalty = 0, p2DamagePenalty = 0;
    if (p1.totalDamageTaken > p2.totalDamageTaken) { p1DamagePenalty = 1; p1Score -= 1; }
    else if (p2.totalDamageTaken > p1.totalDamageTaken) { p2DamagePenalty = 1; p2Score -= 1; }
    state.decisionInfo = {
        p1: { name: p1.nome, knockdownPenalty: p1KnockdownPenalty, hitsPenalty: p1HitsPenalty, damagePenalty: p1DamagePenalty, finalScore: p1Score },
        p2: { name: p2.nome, knockdownPenalty: p2KnockdownPenalty, hitsPenalty: p2HitsPenalty, damagePenalty: p2DamagePenalty, finalScore: p2Score }
    };
}

function handleKnockdown(state, downedPlayerKey, io, roomId) {
    if (state.phase === 'knockdown' || state.phase === 'gameover') return; // Previne double knockdown/KO
    state.phase = 'knockdown';
    const fighter = state.fighters[downedPlayerKey];
    fighter.knockdowns++;
    logMessage(state, `${fighter.nome} foi NOCAUTEADO!`, 'log-crit');
    if (fighter.res <= 1) {
        logMessage(state, `${fighter.nome} não consegue se levantar. Fim da luta!`, 'log-crit');
        setTimeout(() => {
            state.phase = 'gameover';
            state.winner = (downedPlayerKey === 'player1') ? 'player2' : 'player1';
            state.reason = `Vitória por Nocaute!`;
            io.to(roomId).emit('gameUpdate', state);
            dispatchAction({ state, id: roomId });
        }, 1000);
        return;
    }
    state.knockdownInfo = { downedPlayer: downedPlayerKey, attempts: 0, lastRoll: null };
}

function isActionValid(state, action) {
    const { type, playerKey } = action;
    if (state.phase === 'white_fang_follow_up') {
        if (playerKey !== state.followUpState.playerKey) return false;
        return (action.type === 'attack' && action.move === 'White Fang') || type === 'end_turn' || type === 'forfeit';
    }
    switch (state.phase) {
        case 'p1_special_moves_selection': return type === 'set_p1_special_moves' && playerKey === 'player1';
        case 'p2_stat_assignment': return type === 'set_p2_stats' && playerKey === 'player1';
        case 'initiative_p1': return type === 'roll_initiative' && playerKey === 'player1';
        case 'initiative_p2': return type === 'roll_initiative' && playerKey === 'player2';
        case 'defense_p1': return type === 'roll_defense' && playerKey === 'player1';
        case 'defense_p2': return type === 'roll_defense' && playerKey === 'player2';
        case 'turn': return (type === 'attack' || type === 'end_turn' || type === 'forfeit') && playerKey === state.whoseTurn;
        case 'knockdown': return type === 'request_get_up' && playerKey === state.knockdownInfo?.downedPlayer;
        case 'decision_table_wait': return type === 'reveal_winner' && playerKey === 'player1';
        case 'gameover': return false;
        default: return false;
    }
}

function dispatchAction(room) {
    if (!room) return;
    const { state, id: roomId } = room;
    io.to(roomId).emit('hideRollButtons');
    switch (state.phase) {
        case 'p1_special_moves_selection':
            const p1socketIdMoves = room.players.find(p => p.playerKey === 'player1').id;
            io.to(p1socketIdMoves).emit('promptSpecialMoves', { availableMoves: SPECIAL_MOVES });
            return;
        case 'p2_stat_assignment':
            const p1socketIdStats = room.players.find(p => p.playerKey === 'player1').id;
            io.to(p1socketIdStats).emit('promptP2StatsAndMoves', { p2data: state.pendingP2Choice, availableMoves: SPECIAL_MOVES });
            return;
        case 'initiative_p1': io.to(roomId).emit('promptRoll', { targetPlayerKey: 'player1', text: 'Rolar Iniciativa (D6)', action: { type: 'roll_initiative', playerKey: 'player1' }}); return;
        case 'initiative_p2': io.to(roomId).emit('promptRoll', { targetPlayerKey: 'player2', text: 'Rolar Iniciativa (D6)', action: { type: 'roll_initiative', playerKey: 'player2' }}); return;
        case 'defense_p1': io.to(roomId).emit('promptRoll', { targetPlayerKey: 'player1', text: 'Rolar Defesa (D3)', action: { type: 'roll_defense', playerKey: 'player1' }}); return;
        case 'defense_p2': io.to(roomId).emit('promptRoll', { targetPlayerKey: 'player2', text: 'Rolar Defesa (D3)', action: { type: 'roll_defense', playerKey: 'player2' }}); return;
        case 'decision_table_wait':
            const info = state.decisionInfo;
            const tableHtml = `<p>A luta acabou e irá para decisão dos juízes.</p><table style="width:100%; margin-top:15px; border-collapse: collapse; text-align: left;"><thead><tr><th style="padding: 5px; border-bottom: 1px solid #fff;">Critério</th><th style="padding: 5px; border-bottom: 1px solid #fff;">${info.p1.name}</th><th style="padding: 5px; border-bottom: 1px solid #fff;">${info.p2.name}</th></tr></thead><tbody><tr><td style="padding: 5px;">Pontuação Inicial</td><td style="text-align:center;">10</td><td style="text-align:center;">10</td></tr><tr><td style="padding: 5px;">Pen. por Quedas</td><td style="text-align:center;">-${info.p1.knockdownPenalty}</td><td style="text-align:center;">-${info.p2.knockdownPenalty}</td></tr><tr><td style="padding: 5px;">Pen. por Menos Acertos</td><td style="text-align:center;">-${info.p1.hitsPenalty}</td><td style="text-align:center;">-${info.p2.hitsPenalty}</td></tr><tr><td style="padding: 5px;">Pen. por Mais Dano</td><td style="text-align:center;">-${info.p1.damagePenalty}</td><td style="text-align:center;">-${info.p2.damagePenalty}</td></tr></tbody><tfoot><tr><th style="padding: 5px; border-top: 1px solid #fff;">Pontuação Final</th><th style="padding: 5px; border-top: 1px solid #fff; text-align:center;">${info.p1.finalScore}</th><th style="padding: 5px; border-top: 1px solid #fff; text-align:center;">${info.p2.finalScore}</th></tr></tfoot></table>`;
            io.to(roomId).emit('showModal', {
                modalType: 'decision_table', title: "Pontuação dos Juízes", text: tableHtml,
                btnText: "Anunciar Vencedor", action: { type: 'reveal_winner', playerKey: 'player1' }, targetPlayerKey: 'player1'
            });
            return;
        case 'knockdown':
            if (state.knockdownInfo) {
                const targetPlayerKey = state.knockdownInfo.downedPlayer;
                const modalPayload = { modalType: 'knockdown', knockdownInfo: state.knockdownInfo, title: `Você caiu!`, text: `Tentativas restantes: ${4 - state.knockdownInfo.attempts}`, btnText: `Tentar Levantar`, action: { type: 'request_get_up', playerKey: targetPlayerKey } };
                io.to(roomId).emit('showModal', { ...modalPayload, targetPlayerKey });
            }
            return;
        case 'gameover':
            let reason = state.reason || '';
            if (state.winner === 'draw') { reason += `<br><br><strong style="color: #ffeb3b; font-size: 1.2em;">EMPATE</strong>`; } 
            else if (state.winner) { const winnerName = state.fighters[state.winner].nome; reason += `<br><br><strong style="color: #dc3545; font-size: 1.2em;">VITÓRIA DE ${winnerName.toUpperCase()}</strong>`; }
            else { reason = "Fim de Jogo"; }
            io.to(roomId).emit('showModal', { modalType: 'gameover', title: "Fim da Luta!", text: reason });
            return;
        default: io.to(roomId).emit('hideModal'); return;
    }
}

io.on('connection', (socket) => {
    socket.on('createGame', (player1Data) => {
        const newRoomId = uuidv4().substring(0, 6);
        socket.join(newRoomId);
        socket.currentRoomId = newRoomId;
        const newState = createNewGameState();
        newState.fighters.player1 = createNewFighterState(player1Data);
        newState.phase = 'p1_special_moves_selection';
        games[newRoomId] = { id: newRoomId, players: [{ id: socket.id, playerKey: 'player1' }], spectators: [], state: newState };
        socket.emit('assignPlayer', 'player1');
        io.to(socket.id).emit('gameUpdate', newState);
        dispatchAction(games[newRoomId]);
    });

    socket.on('joinGame', ({ roomId, player2Data }) => {
        const room = games[roomId];
        if (!room || room.players.length !== 1) { socket.emit('error', { message: 'Sala não encontrada ou já está cheia.' }); return; }
        socket.join(roomId);
        room.players.push({ id: socket.id, playerKey: 'player2' });
        socket.currentRoomId = roomId;
        socket.emit('assignPlayer', 'player2');
        const state = room.state;
        state.pendingP2Choice = player2Data;
        logMessage(state, `${player2Data.nome} entrou. Aguardando P1 definir atributos e golpes...`);
        state.phase = 'p2_stat_assignment';
        io.to(roomId).emit('gameUpdate', state);
        dispatchAction(room);
    });

    socket.on('spectateGame', (roomId) => {
        const room = games[roomId];
        if (!room) { socket.emit('error', { message: 'Sala não encontrada.' }); return; }
        socket.join(roomId);
        room.spectators.push(socket.id);
        socket.currentRoomId = roomId;
        socket.emit('assignPlayer', 'spectator');
        socket.emit('gameUpdate', room.state);
        logMessage(room.state, 'Um espectador entrou na sala.');
        io.to(roomId).emit('gameUpdate', room.state);
    });

    socket.on('playerAction', (action) => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId] || !action || !action.playerKey) return;
        const room = games[roomId];
        const state = room.state;
        if (!isActionValid(state, action)) { console.log(`Ação inválida REJEITADA: `, action, `na fase: ${state.phase}`); return; }
        
        const playerKey = action.playerKey;

        switch (action.type) {
            case 'set_p1_special_moves':
                state.fighters.player1.specialMoves = action.moves;
                logMessage(state, `${state.fighters.player1.nome} definiu seus golpes especiais.`);
                state.phase = 'waiting';
                socket.emit('roomCreated', roomId);
                break;
            
            case 'set_p2_stats':
                const p2Data = state.pendingP2Choice;
                const p2Stats = action.stats;
                state.fighters.player2 = createNewFighterState({
                    ...p2Data,
                    agi: p2Stats.agi,
                    res: p2Stats.res,
                    specialMoves: action.moves
                });
                delete state.pendingP2Choice;
                logMessage(state, `${state.fighters.player2.nome} teve seus atributos e golpes definidos. Preparem-se!`);
                state.phase = 'initiative_p1';
                break;

            case 'attack':
                const moveName = action.move;
                const move = state.moves[moveName];
                const attacker = state.fighters[playerKey];
                const defenderKey = (playerKey === 'player1') ? 'player2' : 'player1';

                let cost = move.cost;
                if (state.followUpState && state.followUpState.playerKey === playerKey && moveName === 'White Fang') {
                    cost = 0;
                }
                if (attacker.pa < cost) return;
                attacker.pa -= cost;

                if (moveName === 'Flicker Jab') {
                    const executeFlicker = () => {
                        // Verifica se o jogo acabou entre os jabs
                        if (state.phase === 'gameover' || state.phase === 'knockdown') return;
                        
                        const hit = executeAttack(state, playerKey, defenderKey, moveName, io, roomId);
                        io.to(roomId).emit('gameUpdate', room.state);

                        if (hit && state.fighters[defenderKey].hp > 0) {
                            setTimeout(executeFlicker, 700);
                        } else {
                            // Se errou ou o oponente caiu, atualiza o estado geral.
                            io.to(roomId).emit('gameUpdate', room.state);
                            dispatchAction(room);
                        }
                    };
                    executeFlicker();
                    return; // Retorna para não chamar o dispatchAction globalmente
                }
                
                executeAttack(state, playerKey, defenderKey, moveName, io, roomId);

                if (moveName === 'White Fang') {
                    if (state.followUpState) {
                        state.followUpState = null;
                        state.phase = 'turn';
                    } else {
                        state.followUpState = { playerKey, moveName };
                        state.phase = 'white_fang_follow_up';
                    }
                }
                
                if (state.fighters[defenderKey].hp <= 0 && state.phase !== 'knockdown') {
                    handleKnockdown(state, defenderKey, io, roomId);
                }
                break;
            case 'forfeit':
                const winnerKey = playerKey === 'player1' ? 'player2' : 'player1';
                state.winner = winnerKey;
                state.phase = 'gameover';
                state.reason = `${state.fighters[playerKey].nome} jogou a toalha.`;
                logMessage(state, state.reason, 'log-crit');
                break;
            case 'roll_initiative':
                io.to(roomId).emit('playSound', 'dice');
                const roll = rollD(6);
                io.to(roomId).emit('diceRoll', { playerKey, rollValue: roll, diceType: 'd6' });
                const agi = state.fighters[playerKey].agi;
                state.initiativeRolls[playerKey] = roll + agi;
                logMessage(state, `${state.fighters[playerKey].nome} rolou iniciativa: D6(${roll}) + AGI(${agi}) = <span class="highlight-total">${state.initiativeRolls[playerKey]}</span>`, 'log-info');
                if (playerKey === 'player1') { state.phase = 'initiative_p2'; } else {
                    if (state.initiativeRolls.player1 === state.initiativeRolls.player2) {
                        logMessage(state, "EMPATE na iniciativa! Rolando novamente...", 'log-info');
                        state.initiativeRolls = {};
                        state.phase = 'initiative_p1';
                    } else {
                        if (state.initiativeRolls.player1 > state.initiativeRolls.player2) { state.whoseTurn = 'player1'; state.didPlayer1GoFirst = true; } else { state.whoseTurn = 'player2'; state.didPlayer1GoFirst = false; }
                        logMessage(state, `${state.fighters[state.whoseTurn].nome} venceu a iniciativa!`, 'log-info');
                        state.phase = 'defense_p1';
                    }
                }
                break;
            case 'roll_defense':
                io.to(roomId).emit('playSound', 'dice');
                const defRoll = rollD(3);
                io.to(roomId).emit('diceRoll', { playerKey, rollValue: defRoll, diceType: 'd3' });
                const res_def = state.fighters[playerKey].res;
                state.fighters[playerKey].def = defRoll + res_def;
                logMessage(state, `${state.fighters[playerKey].nome} definiu defesa: D3(${defRoll}) + RES(${res_def}) = <span class="highlight-total">${state.fighters[playerKey].def}</span>`, 'log-info');
                if (playerKey === 'player1') { state.phase = 'defense_p2'; } else { logMessage(state, `--- ROUND ${state.currentRound} COMEÇA! ---`, 'log-turn'); state.phase = 'turn'; }
                break;
            case 'end_turn':
                endTurn(state, io, roomId);
                break;
            case 'reveal_winner':
                const p1FinalScore = state.decisionInfo.p1.finalScore;
                const p2FinalScore = state.decisionInfo.p2.finalScore;
                if (p1FinalScore > p2FinalScore) {
                    state.winner = 'player1';
                    state.reason = `Vitória por Decisão (${p1FinalScore} a ${p2FinalScore})`;
                } else if (p2FinalScore > p1FinalScore) {
                    state.winner = 'player2';
                    state.reason = `Vitória por Decisão (${p2FinalScore} a ${p1FinalScore})`;
                } else {
                    state.winner = 'draw';
                    state.reason = `Empate por Decisão (${p1FinalScore} a ${p2FinalScore})`;
                }
                state.phase = 'gameover';
                break;
            case 'request_get_up':
                const knockdownInfo = state.knockdownInfo;
                if (!knockdownInfo || knockdownInfo.downedPlayer !== playerKey) return;
                
                knockdownInfo.attempts++;
                const getUpRoll = rollD(6);
                io.to(roomId).emit('diceRoll', { playerKey, rollValue: getUpRoll, diceType: 'd6' });
                const totalRoll = getUpRoll + state.fighters[playerKey].res;
                knockdownInfo.lastRoll = totalRoll;
                logMessage(state, `${state.fighters[playerKey].nome} tenta se levantar... Rolagem: ${totalRoll}`, 'log-info');
                
                if (totalRoll >= 7) {
                    const fighter = state.fighters[playerKey];
                    io.to(roomId).emit('getUpSuccess', { downedPlayerName: fighter.nome, rollValue: totalRoll });
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
                    return;
                } else if (knockdownInfo.attempts >= 4) {
                    logMessage(state, `Não conseguiu! Fim da luta!`, 'log-crit');
                    setTimeout(() => {
                        state.phase = 'gameover';
                        state.winner = (playerKey === 'player1') ? 'player2' : 'player1';
                        state.reason = `Vitória por Nocaute!`;
                        io.to(roomId).emit('gameUpdate', room.state);
                        dispatchAction(room);
                    }, 1000);
                    return;
                }
                break;
        }
        
        io.to(roomId).emit('gameUpdate', room.state);
        dispatchAction(room);
    });

    socket.on('disconnect', () => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId]) return;
        const room = games[roomId];
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex > -1) { io.to(roomId).emit('opponentDisconnected'); delete games[roomId]; } else {
            const spectatorIndex = room.spectators.indexOf(socket.id);
            if (spectatorIndex > -1) {
                room.spectators.splice(spectatorIndex, 1);
                logMessage(room.state, 'Um espectador saiu.');
                io.to(roomId).emit('gameUpdate', room.state);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));