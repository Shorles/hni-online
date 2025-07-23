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
    'Jab': { cost: 1, damage: 1, penalty: 0 },
    'Direto': { cost: 2, damage: 3, penalty: 1 },
    'Upper': { cost: 3, damage: 6, penalty: 2 },
    'Liver Blow': { cost: 3, damage: 3, penalty: 1 },
    'Clinch': { cost: 3, damage: 0, penalty: 0 },
    'Golpe Ilegal': { cost: 2, damage: 5, penalty: 0 },
    'Esquiva': { cost: 1, damage: 0, penalty: 0, reaction: true }
};

const SPECIAL_MOVES = {
    'Counter': { cost: 0, damage: 0, penalty: 0, reaction: true },
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
    'OraOraOra': 'OraOraOra.mp3',
    'Golpe Ilegal': ['especialforte01.mp3', 'especialforte02.mp3'],
    'Clinch': ['Esquiva.mp3'],
    'Esquiva': ['Esquiva.mp3']
};

const rollD = (s) => Math.floor(Math.random() * s) + 1;

const ATTACK_DICE_OUTCOMES = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 6];
const rollAttackD6 = (state) => {
    if (state.diceCheat === 'crit') return 6;
    if (state.diceCheat === 'fumble') return 1;
    const randomIndex = Math.floor(Math.random() * ATTACK_DICE_OUTCOMES.length);
    return ATTACK_DICE_OUTCOMES[randomIndex];
};

function createNewGameState() {
    return {
        fighters: {}, pendingP2Choice: null, winner: null, reason: null,
        moves: ALL_MOVES, currentRound: 1, currentTurn: 1, whoseTurn: null, didPlayer1GoFirst: false,
        phase: 'waiting', previousPhase: null, log: [{ text: "Aguardando oponente..." }], initiativeRolls: {}, knockdownInfo: null,
        doubleKnockdownInfo: null,
        decisionInfo: null, followUpState: null, scenario: 'Ringue.png',
        mode: null,
        hostId: null,
        gmId: null,
        playersReady: { player1: false, player2: false },
        reactionState: null,
        diceCheat: null,
        illegalCheat: 'normal'
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
        specialMoves: data.specialMoves || [],
        pointDeductions: 0,
        illegalMoveUses: 0,
        activeEffects: {},
        defRoll: 0
    };
}

function logMessage(state, text, className = '') { state.log.push({ text, className }); if (state.log.length > 50) state.log.shift(); }


function executeAttack(state, attackerKey, defenderKey, moveName, io, roomId) {
    io.to(roomId).emit('triggerAttackAnimation', { attackerKey });
    const attacker = state.fighters[attackerKey];
    const defender = state.fighters[defenderKey];
    const move = state.moves[moveName];
    const displayName = move.displayName || moveName;

    let hit = false;
    let counterLanded = false;

    const triggerKnockdown = (downedPlayer) => {
        setTimeout(() => {
            handleKnockdown(state, downedPlayer, io, roomId);
            io.to(roomId).emit('gameUpdate', state);
            dispatchAction(games[roomId]);
        }, 3000);
    };

    const triggerDoubleKnockdown = () => {
        setTimeout(() => {
            handleDoubleKnockdown(state, io, roomId);
            io.to(roomId).emit('gameUpdate', state);
            dispatchAction(games[roomId]);
        }, 3000);
    };

    if (state.reactionState && state.reactionState.playerKey === defenderKey && state.reactionState.move === 'Counter') {
        const incomingAttackCost = move.cost;
        if (defender.pa >= incomingAttackCost) {
            defender.pa -= incomingAttackCost;
            logMessage(state, `${attacker.nome} ataca com <span class="log-move-name">${displayName}</span>, mas ${defender.nome} revela um <span class="log-move-name">Contra-Ataque</span>!`, 'log-crit');
            logMessage(state, `${defender.nome} gasta ${incomingAttackCost} PA para executar o Counter.`, 'log-info');
            const attackerRoll = rollAttackD6(state);
            const attackerValue = attackerRoll + attacker.agi - move.penalty;
            logMessage(state, `Ataque de ${attacker.nome}: D6(${attackerRoll}) + ${attacker.agi} AGI - ${move.penalty} Pen = <span class="highlight-result">${attackerValue}</span>`, 'log-info');
            const counterRoll = rollAttackD6(state);
            const counterValue = counterRoll + defender.agi - move.penalty; 
            logMessage(state, `Contra-Ataque de ${defender.nome}: D6(${counterRoll}) + ${defender.agi} AGI - ${move.penalty} Pen = <span class="highlight-result">${counterValue}</span>`, 'log-info');
            const damageToDeal = move.damage * 2;
            let soundToPlay = 'Critical.mp3';
            if (counterValue > attackerValue) {
                counterLanded = true;
                logMessage(state, `Sucesso! ${attacker.nome} recebe ${damageToDeal} de dano do seu próprio golpe!`, 'log-crit');
                const hpBeforeHit = attacker.hp;
                attacker.hp = Math.max(0, attacker.hp - damageToDeal);
                attacker.totalDamageTaken += hpBeforeHit - attacker.hp;
                io.to(roomId).emit('triggerHitAnimation', { defenderKey: attackerKey });
            } else if (attackerValue > counterValue) {
                logMessage(state, `Falhou! ${defender.nome} erra o tempo e recebe ${damageToDeal} de dano!`, 'log-crit');
                const hpBeforeHit = defender.hp;
                defender.hp = Math.max(0, defender.hp - damageToDeal);
                defender.totalDamageTaken += hpBeforeHit - defender.hp;
                io.to(roomId).emit('triggerHitAnimation', { defenderKey });
            } else {
                counterLanded = true;
                logMessage(state, `Empate! Ambos são atingidos no fogo cruzado e recebem ${damageToDeal} de dano!`, 'log-crit');
                let hpBeforeHit;
                hpBeforeHit = attacker.hp;
                attacker.hp = Math.max(0, attacker.hp - damageToDeal);
                attacker.totalDamageTaken += hpBeforeHit - attacker.hp;
                hpBeforeHit = defender.hp;
                defender.hp = Math.max(0, defender.hp - damageToDeal);
                defender.totalDamageTaken += hpBeforeHit - defender.hp;
                io.to(roomId).emit('triggerHitAnimation', { defenderKey: attackerKey });
                io.to(roomId).emit('triggerHitAnimation', { defenderKey: defenderKey });
            }
            if (soundToPlay) io.to(roomId).emit('playSound', soundToPlay);
            state.reactionState = null;
        } else {
            logMessage(state, `${defender.nome} tenta o Contra-Ataque, mas não tem ${incomingAttackCost} PA para interceptar o golpe!`, 'log-miss');
            state.reactionState = null;
        }
    }
    
    if (state.phase !== 'knockdown' && state.phase !== 'double_knockdown') {
        if (!counterLanded) {
            logMessage(state, `${attacker.nome} usa <span class="log-move-name">${displayName}</span>!`);
            const roll = rollAttackD6(state);
            let crit = false;
            let soundToPlay = null;
            const attackValue = roll + attacker.agi - move.penalty;
            logMessage(state, `Rolagem de Ataque: D6(${roll}) + ${attacker.agi} AGI - ${move.penalty} Pen = <span class="highlight-result">${attackValue}</span> (Defesa: ${defender.def})`, 'log-info');
            
            if (roll === 1) { logMessage(state, "Erro Crítico!", 'log-miss');
            } else if (roll === 6) { logMessage(state, "Acerto Crítico!", 'log-crit'); hit = true; crit = true;
            } else { if (attackValue >= defender.def) { logMessage(state, "Acertou!", 'log-hit'); hit = true; } else { logMessage(state, "Errou!", 'log-miss'); } }
            
            if (hit) {
                io.to(roomId).emit('triggerHitAnimation', { defenderKey });
                const sounds = MOVE_SOUNDS[moveName];
                if (crit) { soundToPlay = 'Critical.mp3';
                } else if (Array.isArray(sounds)) { soundToPlay = sounds[Math.floor(Math.random() * sounds.length)];
                } else if (sounds) { soundToPlay = sounds; }
                
                let damage = crit ? move.damage * 2 : move.damage;
                if (damage > 0) {
                    const hpBeforeHit = defender.hp;
                    defender.hp = Math.max(0, defender.hp - damage);
                    const actualDamageTaken = hpBeforeHit - defender.hp;
                    attacker.hitsLanded++;
                    defender.totalDamageTaken += actualDamageTaken;
                    logMessage(state, `${defender.nome} sofre ${actualDamageTaken} de dano!`, 'log-hit');
                }
                if (moveName === 'Liver Blow') { if (Math.random() < 0.3 && defender.pa > 0) { defender.pa--; logMessage(state, `O golpe no fígado faz ${defender.nome} perder 1 PA!`, 'log-crit'); }
                } else if (moveName === 'Clinch') { defender.pa = Math.max(0, defender.pa - 2); logMessage(state, `${attacker.nome} acerta o Clinch! ${defender.nome} perde 2 PA.`, 'log-hit');}
            } else { soundToPlay = 'Esquiva.mp3'; }
        
            const isActuallyIllegal = (state.illegalCheat === 'always' && move.damage > 0) || (state.illegalCheat === 'normal' && moveName === 'Golpe Ilegal');
            if (isActuallyIllegal) {
                attacker.illegalMoveUses++;
                if (attacker.pointDeductions > 0) {
                    const dqChance = Math.min(1, 0.1 * Math.pow(2, attacker.illegalMoveUses - 2));
                    if (Math.random() < dqChance) {
                        state.phase = 'gm_disqualification_ack';
                        state.winner = defenderKey;
                        state.reason = `${attacker.nome} foi desqualificado por uso repetido de golpes ilegais.`;
                        io.to(roomId).emit('showGameAlert', `INACREDITÁVEL!<br>${attacker.nome} foi desqualificado!`);
                        logMessage(state, `INACREDITÁVEL! ${state.reason}`, 'log-crit');
                        return { hit, counterLanded };
                    }
                }
                if (Math.random() < 0.5) {
                    attacker.pointDeductions++;
                    io.to(roomId).emit('showGameAlert', `O juíz viu o golpe ilegal!<br>${attacker.nome} perde 1 ponto!`);
                    logMessage(state, `O juíz viu o golpe ilegal! ${attacker.nome} perde 1 ponto na decisão!`, 'log-crit');
                }
            }
            if (soundToPlay) { io.to(roomId).emit('playSound', soundToPlay); }
        }
    }

    const p1Down = state.fighters.player1.hp <= 0;
    const p2Down = state.fighters.player2.hp <= 0;
    
    if (p1Down && p2Down && state.phase !== 'double_knockdown') {
        triggerDoubleKnockdown();
    } else if (p1Down && state.phase !== 'knockdown' && state.phase !== 'double_knockdown') {
        triggerKnockdown('player1');
    } else if (p2Down && state.phase !== 'knockdown' && state.phase !== 'double_knockdown') {
        triggerKnockdown('player2');
    }

    return { hit, counterLanded };
}

function handleDoubleKnockdown(state, io, roomId) {
    if (state.phase === 'double_knockdown' || state.phase === 'gameover') return;
    logMessage(state, `INACREDITÁVEL! AMBOS OS LUTADORES FORAM AO CHÃO!`, 'log-crit');
    
    const p1 = state.fighters.player1; const p2 = state.fighters.player2;
    const p1_tko = p1.res <= 1; const p2_tko = p2.res <= 1;

    p1.knockdowns++; p2.knockdowns++;

    if (p1_tko && p2_tko) {
        logMessage(state, `Nenhum dos dois consegue se levantar! O juíz encerra a luta!`, 'log-crit');
        state.phase = 'gameover'; state.winner = 'draw'; state.reason = "Ambos os lutadores foram nocauteados e não puderam continuar.<br><br>EMPATE";
        return;
    }

    state.phase = 'double_knockdown';
    state.doubleKnockdownInfo = {
        attempts: 0,
        getUpStatus: { player1: p1_tko ? 'fail_tko' : 'pending', player2: p2_tko ? 'fail_tko' : 'pending' },
        readyStatus: { player1: false, player2: false }
    };

    if (p1_tko) logMessage(state, `${p1.nome} não tem condições de continuar!`, 'log-crit');
    if (p2_tko) logMessage(state, `${p2.nome} não tem condições de continuar!`, 'log-crit');
}

function endTurn(state, io, roomId) {
    const lastPlayerKey = state.whoseTurn;
    const opponentKey = (lastPlayerKey === 'player1') ? 'player2' : 'player1';

    if (state.reactionState) {
        const reactionUserKey = state.reactionState.playerKey;
        if (reactionUserKey !== lastPlayerKey) {
            state.reactionState = null;
        }
    }

    if (state.fighters[lastPlayerKey]) {
        state.fighters[lastPlayerKey].pa += 3;
        logMessage(state, `${state.fighters[lastPlayerKey].nome} recupera 3 PA.`, 'log-info');
    }
    
    state.followUpState = null;
    state.whoseTurn = opponentKey;
    
    const lastPlayerWentFirst = (lastPlayerKey === 'player1' && state.didPlayer1GoFirst) || (lastPlayerKey === 'player2' && !state.didPlayer1GoFirst);
    
    if (lastPlayerWentFirst) { 
        state.phase = 'turn'; 
    } else { 
        Object.values(state.fighters).forEach(fighter => {
            if (fighter.activeEffects.esquiva && fighter.activeEffects.esquiva.duration > 0) {
                fighter.activeEffects.esquiva.duration--;
                if(fighter.activeEffects.esquiva.duration === 0) {
                    logMessage(state, `O efeito da Esquiva de ${fighter.nome} terminou.`, 'log-info');
                    delete fighter.activeEffects.esquiva;
                    fighter.def = fighter.defRoll + fighter.res;
                    logMessage(state, `Defesa de ${fighter.nome} voltou ao normal: ${fighter.def}.`, 'log-info');
                }
            }
        });
        processEndRound(state, io, roomId); 
    }
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

        state.fighters.player1.pa = 3;
        state.fighters.player2.pa = 3;
        logMessage(state, `Pontos de Ação de ambos os lutadores foram resetados para 3.`, 'log-info');

        Object.values(state.fighters).forEach(f => {
            if (f.activeEffects.esquiva) {
                delete f.activeEffects.esquiva;
                f.def = f.defRoll + f.res;
            }
        });
        logMessage(state, `Efeitos foram resetados para o novo round.`, 'log-info');
        logMessage(state, `--- FIM DO ROUND ${state.currentRound - 1} ---`, 'log-info');
        state.phase = 'initiative_p1';
    } else {
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
    const p1IllegalPenalty = p1.pointDeductions;
    const p2IllegalPenalty = p2.pointDeductions;
    p1Score -= p1IllegalPenalty;
    p2Score -= p2IllegalPenalty;
    state.decisionInfo = {
        p1: { name: p1.nome, knockdownPenalty: p1KnockdownPenalty, hitsPenalty: p1HitsPenalty, damagePenalty: p1DamagePenalty, illegalPenalty: p1IllegalPenalty, finalScore: p1Score },
        p2: { name: p2.nome, knockdownPenalty: p2KnockdownPenalty, hitsPenalty: p2HitsPenalty, damagePenalty: p2DamagePenalty, illegalPenalty: p2IllegalPenalty, finalScore: p2Score }
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
    const move = state.moves[action.move];
    if (type === 'toggle_pause' || type === 'apply_cheats' || type === 'toggle_dice_cheat' || type === 'toggle_illegal_cheat') { return isGm; }
    if (state.phase === 'paused') { return false; }
    if (state.phase === 'white_fang_follow_up') {
        if (playerKey !== state.followUpState.playerKey) return false;
        if (type === 'attack') {
            const fighter = state.fighters[playerKey];
            const moveData = state.moves[action.move];
            if (action.move === 'White Fang') return true;
            return fighter.pa >= moveData.cost;
        }
        return type === 'end_turn' || type === 'forfeit';
    }
    if (state.phase === 'turn' && move && move.reaction && playerKey !== state.whoseTurn) {
        if (state.reactionState) return false;
        const reactor = state.fighters[playerKey];
        return reactor.pa >= move.cost;
    }
    switch (state.phase) {
        case 'p1_special_moves_selection': return type === 'set_p1_special_moves' && playerKey === 'player1';
        case 'p2_stat_assignment': return type === 'set_p2_stats' && playerKey === 'player1';
        case 'initiative_p1': return type === 'roll_initiative' && playerKey === 'player1';
        case 'initiative_p2': return type === 'roll_initiative' && playerKey === 'player2';
        case 'defense_p1': return type === 'roll_defense' && playerKey === 'player1';
        case 'defense_p2': return type === 'roll_defense' && playerKey === 'player2';
        case 'turn': 
            if (playerKey !== state.whoseTurn) return false;
            return (type === 'attack' || type === 'end_turn' || type === 'forfeit');
        case 'double_knockdown':
            return type === 'request_get_up' && (playerKey === 'player1' || playerKey === 'player2');
        case 'knockdown': return type === 'request_get_up' && playerKey === state.knockdownInfo?.downedPlayer;
        case 'gm_decision_knockdown': return (type === 'resolve_knockdown_loss' || type === 'give_last_chance') && isGm;
        case 'gm_disqualification_ack': return type === 'confirm_disqualification' && isGm;
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
        case 'paused': return;
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
        case 'gm_disqualification_ack':
            if (state.gmId) {
                io.to(state.gmId).emit('showModal', {
                    modalType: 'disqualification',
                    title: "Desqualificação!",
                    text: state.reason,
                    btnText: "Avançar",
                    action: { type: 'confirm_disqualification' }
                });
            }
            return;
        case 'decision_table_wait':
            const info = state.decisionInfo;
            const tableHtml = `<p>A luta acabou e irá para decisão dos juízes.</p><table style="width:100%; margin-top:15px; border-collapse: collapse; text-align: left;"><thead><tr><th style="padding: 5px; border-bottom: 1px solid #fff;">Critério</th><th style="padding: 5px; border-bottom: 1px solid #fff;">${info.p1.name}</th><th style="padding: 5px; border-bottom: 1px solid #fff;">${info.p2.name}</th></tr></thead><tbody><tr><td style="padding: 5px;">Pontuação Inicial</td><td style="text-align:center;">10</td><td style="text-align:center;">10</td></tr><tr><td style="padding: 5px;">Pen. por Quedas</td><td style="text-align:center;">-${info.p1.knockdown