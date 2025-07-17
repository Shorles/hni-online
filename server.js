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
    'Counter': { displayName: 'Contra-Ataque', cost: 3 },
    'Flicker Jab': { cost: 3, damage: 1, penalty: 1 },
    'Smash': { cost: 2, damage: 8, penalty: 3 },
    'Bala': { cost: 1, damage: 2, penalty: 0 },
    'Gazelle Punch': { cost: 3, damage: 8, penalty: 2 },
    'Frog Punch': { cost: 4, damage: 7, penalty: 1 },
    'White Fang': { cost: 4, damage: 4, penalty: 1 },
    'OraOraOra': { displayName: 'Ora ora ora...', cost: 3, damage: 10, penalty: -1 } 
};
const ALL_MOVES = { ...MOVES, ...SPECIAL_MOVES };

const MOVE_SOUNDS = {
    'Jab': ['jab01.mp3', 'jab02.mp3', 'jab03.mp3'],
    'Direto': ['baseforte01.mp3', 'baseforte02.mp3'],
    'Liver Blow': ['baseforte01.mp3', 'baseforte02.mp3'],
    'Upper': ['baseforte01.mp3', 'baseforte02.mp3'],
    'Counter': ['especialforte01.mp3', 'especialforte02.mp3', 'especialforte03.mp3'],
    'Smash': ['especialforte01.mp3', 'especialforte02.mp3', 'especialforte03.mp3'],
    'Gazelle Punch': ['especialforte01.mp3', 'especialforte02.mp3', 'especialforte03.mp3'],
    'Frog Punch': ['especialforte01.mp3', 'especialforte02.mp3', 'especialforte03.mp3'],
    'White Fang': ['especialforte01.mp3', 'especialforte02.mp3', 'especialforte03.mp3'],
    'Flicker Jab': ['Flicker01.mp3', 'Flicker02.mp3', 'Flicker03.mp3'],
    'Bala': ['bala01.mp3', 'bala02.mp3'],
    'OraOraOra': 'OraOraOra.mp3'
};

const rollD = (s) => Math.floor(Math.random() * s) + 1;

const ATTACK_DICE_OUTCOMES = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 6];
const rollAttackD6 = () => {
    const randomIndex = Math.floor(Math.random() * ATTACK_DICE_OUTCOMES.length);
    return ATTACK_DICE_OUTCOMES[randomIndex];
};

function createNewGameState() {
    return {
        fighters: {}, pendingP2Choice: null, winner: null, reason: null,
        moves: ALL_MOVES, currentRound: 1, currentTurn: 1, whoseTurn: null, didPlayer1GoFirst: false,
        phase: 'waiting', previousPhase: null, log: [{ text: "Aguardando oponente..." }], initiativeRolls: {}, knockdownInfo: null,
        decisionInfo: null, followUpState: null, scenario: 'Ringue.png',
        mode: null,
        hostId: null,
        gmId: null,
        playersReady: { player1: false, player2: false },
        counterStance: null
    };
}

function createNewFighterState(data) {
    const res = Math.max(1, parseInt(data.res, 10) || 1);
    const agi = parseInt(data.agi, 10) || 1;
    const hp = parseInt(data.hp, 10) || (res * 5);
    const pa = parseInt(data.pa, 10) || 3;

    return {
        nome: data.nome, img: data.img, agi: agi, res: res, originalRes: res,
        hpMax: res * 5, hp: hp, pa: pa, def: 0, hitsLanded: 0, knockdowns: 0, totalDamageTaken: 0,
        specialMoves: data.specialMoves || []
    };
}

function logMessage(state, text, className = '') { state.log.push({ text, className }); if (state.log.length > 50) state.log.shift(); }

function resolveCounterAttack(state, attackerKey, countererKey, move, moveName, io, roomId) {
    const attacker = state.fighters[attackerKey];
    const counterer = state.fighters[countererKey];
    const moveDisplayName = move.displayName || moveName;

    io.to(roomId).emit('triggerAttackAnimation', { attackerKey });
    logMessage(state, `${attacker.nome} ataca com <span class="log-move-name">${moveDisplayName}</span>... mas ${counterer.nome} estava pronto!`, 'log-crit');
    logMessage(state, `Disputa de Contra-Ataque!`, 'log-info');

    const attackerRoll = rollAttackD6();
    const attackerAttackValue = attackerRoll + attacker.agi - (move.penalty || 0);
    logMessage(state, `Rolagem de ${attacker.nome}: D6(${attackerRoll}) + ${attacker.agi} AGI - ${move.penalty || 0} Pen = <span class="highlight-result">${attackerAttackValue}</span>`, 'log-info');

    const countererRoll = rollAttackD6();
    const countererAttackValue = countererRoll + counterer.agi;
    logMessage(state, `Rolagem de ${counterer.nome}: D6(${countererRoll}) + ${counterer.agi} AGI = <span class="highlight-result">${countererAttackValue}</span>`, 'log-info');

    const damage = move.damage * 2;
    let soundToPlay = 'Critical.mp3';

    if (countererAttackValue > attackerAttackValue) {
        logMessage(state, `Contra-ataque PERFEITO! ${attacker.nome} recebe o próprio golpe em dobro!`, 'log-crit');
        io.to(roomId).emit('triggerHitAnimation', { defenderKey: attackerKey });
        const hpBeforeHit = attacker.hp;
        attacker.hp = Math.max(0, attacker.hp - damage);
        attacker.totalDamageTaken += hpBeforeHit - attacker.hp;
        logMessage(state, `${attacker.nome} sofre ${hpBeforeHit - attacker.hp} de dano!`, 'log-hit');
        if (attacker.hp <= 0) handleKnockdown(state, attackerKey, io, roomId);
    } else if (attackerAttackValue > countererAttackValue) {
        logMessage(state, `O ataque de ${attacker.nome} superou a tentativa de contra! ${counterer.nome} recebe dano dobrado!`, 'log-crit');
        io.to(roomId).emit('triggerHitAnimation', { defenderKey: countererKey });
        const hpBeforeHit = counterer.hp;
        counterer.hp = Math.max(0, counterer.hp - damage);
        counterer.totalDamageTaken += hpBeforeHit - counterer.hp;
        attacker.hitsLanded++;
        logMessage(state, `${counterer.nome} sofre ${hpBeforeHit - counterer.hp} de dano!`, 'log-hit');
        if (counterer.hp <= 0) handleKnockdown(state, countererKey, io, roomId);
    } else {
        logMessage(state, `COLISÃO BRUTAL! Ambos são atingidos com o dano dobrado!`, 'log-crit');
        io.to(roomId).emit('triggerHitAnimation', { defenderKey: attackerKey });
        io.to(roomId).emit('triggerHitAnimation', { defenderKey: countererKey });

        const hpBeforeHitAttacker = attacker.hp;
        attacker.hp = Math.max(0, attacker.hp - damage);
        attacker.totalDamageTaken += hpBeforeHitAttacker - attacker.hp;
        logMessage(state, `${attacker.nome} sofre ${hpBeforeHitAttacker - attacker.hp} de dano!`, 'log-hit');

        const hpBeforeHitCounterer = counterer.hp;
        counterer.hp = Math.max(0, counterer.hp - damage);
        counterer.totalDamageTaken += hpBeforeHitCounterer - counterer.hp;
        logMessage(state, `${counterer.nome} sofre ${hpBeforeHitCounterer - counterer.hp} de dano!`, 'log-hit');

        if (attacker.hp <= 0) handleKnockdown(state, attackerKey, io, roomId);
        if (counterer.hp <= 0 && state.phase !== 'knockdown') handleKnockdown(state, countererKey, io, roomId);
    }
    
    if (soundToPlay) io.to(roomId).emit('playSound', soundToPlay);
    state.counterStance = null;
}

function executeAttack(state, attackerKey, defenderKey, moveName, io, roomId) {
    io.to(roomId).emit('triggerAttackAnimation', { attackerKey });
    const attacker = state.fighters[attackerKey];
    const defender = state.fighters[defenderKey];
    const move = state.moves[moveName];
    
    const displayName = move.displayName || moveName;
    logMessage(state, `${attacker.nome} usa <span class="log-move-name">${displayName}</span>!`);
    
    const roll = rollAttackD6();
    let hit = false;
    let crit = false;
    let soundToPlay = null;
    
    const attackValue = roll + attacker.agi - move.penalty;
    logMessage(state, `Rolagem de Ataque: D6(${roll}) + ${attacker.agi} AGI - ${move.penalty} Pen = <span class="highlight-result">${attackValue}</span> (Defesa: ${defender.def})`, 'log-info');
    
    if (roll === 1) {
        logMessage(state, "Erro Crítico!", 'log-miss');
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
        }
    }
    
    if (hit) {
        io.to(roomId).emit('triggerHitAnimation', { defenderKey });
        
        if (crit) { 
            soundToPlay = 'Critical.mp3';
        } else {
            const sounds = MOVE_SOUNDS[moveName];
            if (Array.isArray(sounds)) {
                soundToPlay = sounds[Math.floor(Math.random() * sounds.length)];
            } else if (sounds) {
                soundToPlay = sounds;
            }
        }
        
        let damage = crit ? move.damage * 2 : move.damage;
        const hpBeforeHit = defender.hp;
        defender.hp = Math.max(0, defender.hp - damage);
        const actualDamageTaken = hpBeforeHit - defender.hp;
        
        attacker.hitsLanded++;
        defender.totalDamageTaken += actualDamageTaken;
        logMessage(state, `${defender.nome} sofre ${actualDamageTaken} de dano!`, 'log-hit');
    } else { // Se o golpe errou
        soundToPlay = 'Esquiva.mp3';
    }
    
    if (soundToPlay) {
        io.to(roomId).emit('playSound', soundToPlay);
    }
    
    return hit;
}

function endTurn(state, io, roomId) {
    const lastPlayerKey = state.whoseTurn;
    state.followUpState = null;
    state.counterStance = null;
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
    if (state.phase === 'knockdown' || state.phase === 'gameover') return;
    state.phase = 'knockdown';
    const fighter = state.fighters[downedPlayerKey];
    fighter.knockdowns++;
    logMessage(state, `${fighter.nome} foi NOCAUTEADO!`, 'log-crit');
    
    if (fighter.res <= 1) {
        logMessage(state, `${fighter.nome} não consegue se levantar. O juíz interrompe a luta!`, 'log-crit');
        const instantKoReason = "O juíz interrompe a luta.<br><br>Vitória por Nocaute!";
        setTimeout(() => {
            state.phase = 'gameover';
            state.winner = (downedPlayerKey === 'player1') ? 'player2' : 'player1';
            state.reason = instantKoReason;
            io.to(roomId).emit('gameUpdate', state);
            dispatchAction({ state, id: roomId });
        }, 1000);
        return;
    }

    state.knockdownInfo = { downedPlayer: downedPlayerKey, attempts: 0, lastRoll: null, isLastChance: false };
}

function isActionValid(state, action) {
    const { type, playerKey, gmSocketId } = action;
    const isGm = gmSocketId === state.gmId;

    if (type === 'toggle_pause' || type === 'apply_cheats') {
        return isGm;
    }

    if (state.phase === 'paused') {
        return false;
    }

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
        case 'turn':
            if (type === 'prepare_counter') {
                return playerKey !== state.whoseTurn;
            }
            return (type === 'attack' || type === 'end_turn' || type === 'forfeit') && playerKey === state.whoseTurn;
        case 'knockdown': return type === 'request_get_up' && playerKey === state.knockdownInfo?.downedPlayer;
        case 'gm_decision_knockdown': return (type === 'resolve_knockdown_loss' || type === 'give_last_chance') && isGm;
        case 'decision_table_wait': return (type === 'reveal_winner' && (playerKey === 'player1' || playerKey === 'host'));
        case 'arena_configuring': return type === 'configure_and_start_arena' && playerKey === 'host';
        case 'gameover': return false;
        default: return false;
    }
}

function dispatchAction(room) {
    if (!room) return;
    const { state, id: roomId } = room;
    io.to(roomId).emit('hideRollButtons');
    switch (state.phase) {
        case 'paused':
            return;
        case 'p1_special_moves_selection':
            const p1socketIdMoves = room.players.find(p => p.playerKey === 'player1');
            if (p1socketIdMoves) { // <-- Guarda de segurança
                io.to(p1socketIdMoves.id).emit('promptSpecialMoves', { availableMoves: SPECIAL_MOVES });
            }
            return;
        case 'p2_stat_assignment':
            const p1socketIdStats = room.players.find(p => p.playerKey === 'player1');
            if (p1socketIdStats) { // <-- Guarda de segurança
                io.to(p1socketIdStats.id).emit('promptP2StatsAndMoves', { p2data: state.pendingP2Choice, availableMoves: SPECIAL_MOVES });
            }
            return;
        case 'initiative_p1': io.to(roomId).emit('promptRoll', { targetPlayerKey: 'player1', text: 'Rolar Iniciativa (D6)', action: { type: 'roll_initiative', playerKey: 'player1' }}); return;
        case 'initiative_p2': io.to(roomId).emit('promptRoll', { targetPlayerKey: 'player2', text: 'Rolar Iniciativa (D6)', action: { type: 'roll_initiative', playerKey: 'player2' }}); return;
        case 'defense_p1': io.to(roomId).emit('promptRoll', { targetPlayerKey: 'player1', text: 'Rolar Defesa (D3)', action: { type: 'roll_defense', playerKey: 'player1' }}); return;
        case 'defense_p2': io.to(roomId).emit('promptRoll', { targetPlayerKey: 'player2', text: 'Rolar Defesa (D3)', action: { type: 'roll_defense', playerKey: 'player2' }}); return;
        case 'gm_decision_knockdown':
            if (state.gmId) {
                io.to(state.gmId).emit('showModal', {
                    modalType: 'gm_knockdown_decision',
                    title: 'Intervenção Divina',
                    text: `${state.fighters[state.knockdownInfo.downedPlayer].nome} falhou na última tentativa. O que fazer?`,
                    knockdownInfo: state.knockdownInfo
                });
            }
            return;
        case 'decision_table_wait':
            const info = state.decisionInfo;
            const tableHtml = `<p>A luta acabou e irá para decisão dos juízes.</p><table style="width:100%; margin-top:15px; border-collapse: collapse; text-align: left;"><thead><tr><th style="padding: 5px; border-bottom: 1px solid #fff;">Critério</th><th style="padding: 5px; border-bottom: 1px solid #fff;">${info.p1.name}</th><th style="padding: 5px; border-bottom: 1px solid #fff;">${info.p2.name}</th></tr></thead><tbody><tr><td style="padding: 5px;">Pontuação Inicial</td><td style="text-align:center;">10</td><td style="text-align:center;">10</td></tr><tr><td style="padding: 5px;">Pen. por Quedas</td><td style="text-align:center;">-${info.p1.knockdownPenalty}</td><td style="text-align:center;">-${info.p2.knockdownPenalty}</td></tr><tr><td style="padding: 5px;">Pen. por Menos Acertos</td><td style="text-align:center;">-${info.p1.hitsPenalty}</td><td style="text-align:center;">-${info.p2.hitsPenalty}</td></tr><tr><td style="padding: 5px;">Pen. por Mais Dano Recebido</td><td style="text-align:center;">-${info.p1.damagePenalty}</td><td style="text-align:center;">-${info.p2.damagePenalty}</td></tr></tbody><tfoot><tr><th style="padding: 5px; border-top: 1px solid #fff;">Pontuação Final</th><th style="padding: 5px; border-top: 1px solid #fff; text-align:center;">${info.p1.finalScore}</th><th style="padding: 5px; border-top: 1px solid #fff; text-align:center;">${info.p2.finalScore}</th></tr></tfoot></table>`;
            let decisionMakerKey = state.mode === 'arena' ? 'host' : 'player1';
            io.to(roomId).emit('showModal', {
                modalType: 'decision_table', title: "Pontuação dos Juízes", text: tableHtml,
                btnText: "Anunciar Vencedor", action: { type: 'reveal_winner', playerKey: decisionMakerKey }, targetPlayerKey: decisionMakerKey
            });
            return;
        case 'knockdown':
            if (state.knockdownInfo) {
                const targetPlayerKey = state.knockdownInfo.downedPlayer;
                const modalPayload = { modalType: 'knockdown', knockdownInfo: state.knockdownInfo, title: `Você caiu!`, text: ``, btnText: `Tentar Levantar`, action: { type: 'request_get_up', playerKey: targetPlayerKey } };
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
    // --- MODO CLÁSSICO ---
    socket.on('createGame', ({player1Data, scenario}) => {
        const newRoomId = uuidv4().substring(0, 6);
        socket.join(newRoomId);
        socket.currentRoomId = newRoomId;
        const newState = createNewGameState();
        newState.mode = 'classic';
        newState.scenario = scenario;
        newState.gmId = socket.id;
        newState.fighters.player1 = createNewFighterState(player1Data);
        newState.phase = 'p1_special_moves_selection';
        games[newRoomId] = { id: newRoomId, hostId: null, players: [{ id: socket.id, playerKey: 'player1' }], spectators: [], state: newState };
        socket.emit('assignPlayer', {playerKey: 'player1', isGm: true});
        io.to(socket.id).emit('gameUpdate', newState);
        dispatchAction(games[newRoomId]);
    });

    socket.on('joinGame', ({ roomId, player2Data }) => {
        const room = games[roomId];
        if (!room || room.players.length !== 1 || room.state.mode !== 'classic') { socket.emit('error', { message: 'Sala não encontrada, cheia, ou não é uma sala de modo clássico.' }); return; }
        socket.join(roomId);
        room.players.push({ id: socket.id, playerKey: 'player2' });
        socket.currentRoomId = roomId;
        socket.emit('assignPlayer', {playerKey: 'player2', isGm: false});
        const state = room.state;
        state.pendingP2Choice = player2Data;
        logMessage(state, `${player2Data.nome} entrou. Aguardando P1 definir atributos e golpes...`);
        state.phase = 'p2_stat_assignment';
        io.to(roomId).emit('gameUpdate', state);
        dispatchAction(room);
    });

    // --- MODO ARENA ---
    socket.on('createArenaGame', ({ scenario }) => {
        const newRoomId = uuidv4().substring(0, 6);
        socket.join(newRoomId);
        socket.currentRoomId = newRoomId;
        const newState = createNewGameState();
        newState.scenario = scenario;
        newState.mode = 'arena';
        newState.hostId = socket.id;
        newState.gmId = socket.id;
        newState.phase = 'arena_lobby';
        logMessage(newState, "Lobby da Arena criado. Aguardando jogadores...");
        games[newRoomId] = { id: newRoomId, hostId: socket.id, players: [], spectators: [], state: newState };
        socket.emit('assignPlayer', {playerKey: 'host', isGm: true});
        socket.emit('arenaRoomCreated', newRoomId);
        io.to(socket.id).emit('gameUpdate', newState);
    });
    
    socket.on('joinArenaGame', ({ roomId, playerKey }) => {
        const room = games[roomId];
        if (!room || room.state.mode !== 'arena') { socket.emit('error', { message: 'Sala de arena não encontrada.' }); return; }
        if (room.players.find(p => p.playerKey === playerKey)) { socket.emit('error', { message: `O lugar do ${playerKey} já está ocupado.`}); return; }
        
        socket.join(roomId);
        room.players.push({ id: socket.id, playerKey });
        socket.currentRoomId = roomId;
        socket.emit('assignPlayer', {playerKey: playerKey, isGm: false});
        io.to(roomId).emit('gameUpdate', room.state);
        io.to(room.hostId).emit('updateArenaLobby', { playerKey, status: 'connected' });
    });

    socket.on('selectArenaCharacter', ({ character }) => {
        const roomId = socket.currentRoomId;
        const room = games[roomId];
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        room.state.fighters[player.playerKey] = { nome: character.nome, img: character.img };
        room.state.playersReady[player.playerKey] = true;
        io.to(room.hostId).emit('updateArenaLobby', { playerKey: player.playerKey, status: 'character_selected', character });

        if (room.state.playersReady.player1 && room.state.playersReady.player2) {
            room.state.phase = 'arena_configuring';
            io.to(room.hostId).emit('promptArenaConfiguration', {
                p1: room.state.fighters.player1,
                p2: room.state.fighters.player2,
                availableMoves: SPECIAL_MOVES
            });
        }
    });

    // --- GERAL ---
    socket.on('spectateGame', (roomId) => {
        const room = games[roomId];
        if (!room) { socket.emit('error', { message: 'Sala não encontrada.' }); return; }
        socket.join(roomId);
        room.spectators.push(socket.id);
        socket.currentRoomId = roomId;
        socket.emit('assignPlayer', {playerKey: 'spectator', isGm: false});
        socket.emit('gameUpdate', room.state);
        logMessage(room.state, 'Um espectador entrou na sala.');
        io.to(roomId).emit('gameUpdate', room.state);
    });

    socket.on('playerAction', (action) => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId] || !action || !action.type) return;
        
        const room = games[roomId];
        const state = room.state;
        
        action.gmSocketId = socket.id;

        if (!isActionValid(state, action)) {
            return;
        }
        
        const playerKey = action.playerKey;

        switch (action.type) {
            case 'toggle_pause':
                if (state.phase === 'paused') {
                    state.phase = state.previousPhase || 'turn';
                    logMessage(state, 'Jogo reativado pelo GM.', 'log-info');
                } else {
                    if (state.phase === 'decision_table_wait' || state.phase === 'gameover') return;
                    state.previousPhase = state.phase;
                    state.phase = 'paused';
                    logMessage(state, 'Jogo pausado pelo GM.', 'log-info');
                }
                break;

            case 'apply_cheats':
                const { p1, p2 } = action.cheats;
                const p1f = state.fighters.player1;
                const p2f = state.fighters.player2;

                p1f.agi = parseInt(p1.agi, 10);
                p1f.res = parseInt(p1.res, 10);
                p1f.hp = parseInt(p1.hp, 10);
                p1f.pa = parseInt(p1.pa, 10);
                p1f.hpMax = p1f.res * 5;

                p2f.agi = parseInt(p2.agi, 10);
                p2f.res = parseInt(p2.res, 10);
                p2f.hp = parseInt(p2.hp, 10);
                p2f.pa = parseInt(p2.pa, 10);
                p2f.hpMax = p2f.res * 5;
                logMessage(state, 'O GM alterou os atributos dos lutadores!', 'log-crit');
                break;
            
            case 'give_last_chance':
                state.knockdownInfo.attempts = 3; 
                state.knockdownInfo.isLastChance = true; 
                state.phase = 'knockdown';
                logMessage(state, `O GM deu uma última chance para ${state.fighters[state.knockdownInfo.downedPlayer].nome}!`, 'log-crit');
                break;
            
            case 'resolve_knockdown_loss':
                logMessage(state, `Não conseguiu! Fim da luta!`, 'log-crit');
                const finalCountReason = "9..... 10..... A contagem termina.<br><br>Vitória por Nocaute!";
                state.phase = 'gameover';
                state.winner = (state.knockdownInfo.downedPlayer === 'player1') ? 'player2' : 'player1';
                state.reason = finalCountReason;
                break;

            case 'prepare_counter':
                const counterPlayer = state.fighters[playerKey];
                const counterMove = state.moves['Counter'];
                if (counterPlayer.pa < counterMove.cost) return;
                
                counterPlayer.pa -= counterMove.cost;
                state.counterStance = { playerKey: playerKey };
                logMessage(state, `${counterPlayer.nome} assume uma postura de contra-ataque!`, 'log-info');
                break;

            case 'configure_and_start_arena':
                state.fighters.player1 = createNewFighterState({ ...state.fighters.player1, ...action.p1_config });
                state.fighters.player2 = createNewFighterState({ ...state.fighters.player2, ...action.p2_config });
                logMessage(state, `Anfitrião configurou a batalha! Preparem-se!`);
                state.phase = 'initiative_p1';
                break;

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

                if (state.counterStance && state.counterStance.playerKey === defenderKey) {
                    resolveCounterAttack(state, playerKey, defenderKey, move, moveName, io, roomId);
                    break;
                }

                let cost = move.cost;
                if (state.followUpState && state.followUpState.playerKey === playerKey && moveName === 'White Fang') {
                    cost = 0;
                }
                if (attacker.pa < cost) return;
                attacker.pa -= cost;

                if (moveName === 'Flicker Jab') {
                    const executeFlicker = () => {
                        if (state.phase !== 'turn' && state.phase !== 'white_fang_follow_up') return;
                        
                        const hit = executeAttack(state, playerKey, defenderKey, moveName, io, roomId);
                        io.to(roomId).emit('gameUpdate', room.state);

                        if (state.fighters[defenderKey].hp <= 0) {
                            handleKnockdown(state, defenderKey, io, roomId);
                            io.to(roomId).emit('gameUpdate', room.state);
                            dispatchAction(room);
                            return;
                        }
                        if (hit) {
                            setTimeout(executeFlicker, 700);
                        } else {
                            io.to(roomId).emit('gameUpdate', room.state);
                            dispatchAction(room);
                        }
                    };
                    executeFlicker();
                    return;
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
                io.to(roomId).emit('playSound', 'dice1.mp3');
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
                io.to(roomId).emit('playSound', 'dice1.mp3');
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
                
                if (totalRoll >= 7) {
                    const fighter = state.fighters[playerKey];
                    logMessage(state, `${state.fighters[playerKey].nome} tenta se levantar... Rolagem: ${totalRoll}. Ele se levantou!`, 'log-info');
                    io.to(roomId).emit('getUpSuccess', { downedPlayerName: fighter.nome, rollValue: totalRoll });
                    
                    setTimeout(() => {
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

                } else {
                    logMessage(state, `${state.fighters[playerKey].nome} tenta se levantar... Rolagem: ${totalRoll}. Falhou!`, 'log-miss');
                    
                    const maxAttempts = 4;
                    if (knockdownInfo.attempts >= maxAttempts) {
                        if (knockdownInfo.isLastChance) {
                            logMessage(state, `Não conseguiu! Fim da luta!`, 'log-crit');
                            const finalKoReason = "9..... 10..... A contagem termina.<br><br>Vitória por Nocaute!";
                            setTimeout(() => {
                                state.phase = 'gameover';
                                state.winner = (playerKey === 'player1') ? 'player2' : 'player1';
                                state.reason = finalKoReason;
                                io.to(roomId).emit('gameUpdate', room.state);
                                dispatchAction(room);
                            }, 1000);
                            return;
                        } else {
                            state.phase = 'gm_decision_knockdown';
                        }
                    }
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
        
        if (socket.id === room.hostId) {
            io.to(roomId).emit('opponentDisconnected', { message: 'O Anfitrião encerrou a partida.' });
            delete games[roomId];
            return;
        }

        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex > -1) {
            const playerKey = room.players[playerIndex].playerKey;
            
            if (room.state.mode === 'arena') {
                io.to(roomId).emit('opponentDisconnected', { message: `O Jogador ${playerKey === 'player1' ? 1 : 2} se desconectou.`});
                delete games[roomId];
                return;
            }
            
            if (room.state.mode === 'classic') {
                io.to(roomId).emit('opponentDisconnected', { message: 'O oponente se desconectou.' });
                delete games[roomId];
                return;
            }
        } 
        
        const spectatorIndex = room.spectators.indexOf(socket.id);
        if (spectatorIndex > -1) {
            room.spectators.splice(spectatorIndex, 1);
            if (room.state) {
                logMessage(room.state, 'Um espectador saiu.');
                io.to(roomId).emit('gameUpdate', room.state);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));