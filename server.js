const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const DEFAULT_FIGHTER_STATS = { agi: 1, res: 1 };
let LUTA_CHARACTERS = {};

try {
    const lutadoresData = fs.readFileSync('lutadores.json', 'utf8');
    const lutadoresNomes = lutadoresData
        .replace(/[\[\]]/g, '') 
        .split(',')             
        .map(name => name.replace(/"/g, '').trim()) 
        .filter(name => name); 

    lutadoresNomes.forEach(nome => {
        LUTA_CHARACTERS[nome] = { ...DEFAULT_FIGHTER_STATS };
    });
    console.log('Lutadores carregados com sucesso!');
} catch (error) {
    console.error('Erro ao carregar lutadores.json:', error);
}


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

function rollD(s, state) {
    if (state && typeof state.diceCheat === 'number') {
        return Math.min(state.diceCheat, s);
    }
    return Math.floor(Math.random() * s) + 1;
}

const ATTACK_DICE_OUTCOMES = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 6];
const rollAttackD6 = (state) => {
    if (state.diceCheat === 'crit') return 6;
    if (state.diceCheat === 'fumble') return 1;
    if (typeof state.diceCheat === 'number') return state.diceCheat;
    const randomIndex = Math.floor(Math.random() * ATTACK_DICE_OUTCOMES.length);
    return ATTACK_DICE_OUTCOMES[randomIndex];
};

function createNewLobbyState(gmId) {
    return {
        mode: 'lobby',
        phase: 'waiting_players',
        gmId: gmId,
        connectedPlayers: {}, // { socketId: { id, role, selectedCharacter } }
        unavailableCharacters: [],
        log: [{ text: "Lobby criado. Aguardando jogadores..." }],
    };
}

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
        illegalCheat: 'normal',
        lobbyCache: null, 
        theaterCache: null
    };
}

function createNewTheaterState(initialScenario) {
    const theaterState = {
        mode: 'theater',
        gmId: null,
        log: [{ text: "Modo Teatro iniciado."}],
        currentScenario: initialScenario,
        scenarioStates: {},
        publicState: {}
    };
    theaterState.scenarioStates[initialScenario] = {
        scenario: initialScenario,
        scenarioWidth: null,
        scenarioHeight: null,
        tokens: {},
        tokenOrder: [],
        globalTokenScale: 1.0,
        isStaging: false,
    };
    theaterState.publicState = {
        scenario: initialScenario,
        tokens: {},
        tokenOrder: [],
        globalTokenScale: 1.0
    };
    return theaterState;
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

function logMessage(state, text, className = '') { if(state && state.log) { state.log.push({ text, className }); if (state.log.length > 50) state.log.shift(); } }

function filterVisibleTokens(currentScenarioState) {
    if (!currentScenarioState.scenarioWidth || !currentScenarioState.scenarioHeight) {
        return {
            visibleTokens: { ...currentScenarioState.tokens },
            visibleTokenOrder: [...currentScenarioState.tokenOrder]
        };
    }

    const visibleTokenIds = new Set();
    const visibleTokens = {};

    for (const tokenId of currentScenarioState.tokenOrder) {
        const token = currentScenarioState.tokens[tokenId];
        if (!token) continue;
        
        const tokenCenterX = token.x + (200 * (token.scale || 1) / 2);
        const tokenCenterY = token.y + (200 * (token.scale || 1) / 2); 

        if (tokenCenterX >= 0 && tokenCenterX <= currentScenarioState.scenarioWidth &&
            tokenCenterY >= 0 && tokenCenterY <= currentScenarioState.scenarioHeight) {
            visibleTokenIds.add(tokenId);
            visibleTokens[tokenId] = token;
        }
    }

    const visibleTokenOrder = currentScenarioState.tokenOrder.filter(id => visibleTokenIds.has(id));
    
    return { visibleTokens, visibleTokenOrder };
}

function executeAttack(state, attackerKey, defenderKey, moveName, io, roomId) {
    let attackResult = { hit: false, counterLanded: false };

    io.to(roomId).emit('triggerAttackAnimation', { attackerKey });
    const attacker = state.fighters[attackerKey];
    const defender = state.fighters[defenderKey];
    const move = state.moves[moveName];
    const displayName = move.displayName || moveName;

    let counterProcessed = false;
    let illegalMoveLanded = false;
    const isActuallyIllegal = (state.illegalCheat === 'always' && move.damage > 0) || (state.illegalCheat === 'normal' && moveName === 'Golpe Ilegal');

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
        counterProcessed = true;
        attackResult.counterLanded = true;
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
                logMessage(state, `Sucesso! ${attacker.nome} recebe ${damageToDeal} de dano do seu próprio golpe!`, 'log-crit');
                const hpBeforeHit = attacker.hp;
                attacker.hp = Math.max(0, attacker.hp - damageToDeal);
                attacker.totalDamageTaken += hpBeforeHit - attacker.hp;
                io.to(roomId).emit('triggerHitAnimation', { defenderKey: attackerKey });
            } else if (attackerValue > counterValue) {
                logMessage(state, `Falhou! ${defender.nome} erra o tempo e recebe ${damageToDeal} de dano!`, 'log-crit');
                attackResult.hit = true; 
                attackResult.counterLanded = false; 
                const hpBeforeHit = defender.hp;
                defender.hp = Math.max(0, defender.hp - damageToDeal);
                defender.totalDamageTaken += hpBeforeHit - defender.hp;
                io.to(roomId).emit('triggerHitAnimation', { defenderKey });
                if (isActuallyIllegal) illegalMoveLanded = true;
            } else {
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
                if (isActuallyIllegal) illegalMoveLanded = true;
            }
            if (soundToPlay) io.to(roomId).emit('playSound', soundToPlay);
            state.reactionState = null;
        } else {
            logMessage(state, `${defender.nome} tenta o Contra-Ataque, mas não tem ${incomingAttackCost} PA para interceptar o golpe!`, 'log-miss');
            state.reactionState = null;
            counterProcessed = false; 
            attackResult.counterLanded = false;
        }
    }
    
    if (!counterProcessed && state.phase !== 'knockdown' && state.phase !== 'double_knockdown') {
        logMessage(state, `${attacker.nome} usa <span class="log-move-name">${displayName}</span>!`);
        const roll = rollAttackD6(state);
        let crit = false;
        let hit = false;
        let soundToPlay = null;
        const attackValue = roll + attacker.agi - move.penalty;
        logMessage(state, `Rolagem de Ataque: D6(${roll}) + ${attacker.agi} AGI - ${move.penalty} Pen = <span class="highlight-result">${attackValue}</span> (Defesa: ${defender.def})`, 'log-info');
        
        if (roll === 1) { logMessage(state, "Erro Crítico!", 'log-miss');
        } else if (roll === 6) { logMessage(state, "Acerto Crítico!", 'log-crit'); hit = true; crit = true;
        } else { if (attackValue >= defender.def) { logMessage(state, "Acertou!", 'log-hit'); hit = true; } else { logMessage(state, "Errou!", 'log-miss'); } }
        
        if (hit) {
            attackResult.hit = true;
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
            } else if (moveName === 'Clinch') { 
                const paToRemove = crit ? 4 : 2;
                defender.pa = Math.max(0, defender.pa - paToRemove); 
                logMessage(state, `${attacker.nome} acerta o Clinch! ${defender.nome} perde ${paToRemove} PA.`, 'log-hit');
            }
            if (isActuallyIllegal) illegalMoveLanded = true;
        } else { soundToPlay = 'Esquiva.mp3'; }
    
        if (soundToPlay) { io.to(roomId).emit('playSound', soundToPlay); }
    }

    if (illegalMoveLanded) {
        attacker.illegalMoveUses++;
        if (attacker.pointDeductions > 0) {
            const dqChance = Math.min(1, 0.1 * Math.pow(2, attacker.illegalMoveUses - 2));
            if (Math.random() < dqChance && state.illegalCheat !== 'never') {
                state.phase = 'gm_disqualification_ack';
                state.winner = defenderKey;
                state.reason = `${attacker.nome} foi desqualificado por uso repetido de golpes ilegais.`;
                io.to(roomId).emit('showGameAlert', `INACREDITÁVEL!<br>${attacker.nome} foi desqualificado!`);
                logMessage(state, `INACREDITÁVEL! ${state.reason}`, 'log-crit');
                return attackResult; 
            }
        }
        if (Math.random() < 0.5 && state.illegalCheat !== 'never') {
            attacker.pointDeductions++;
            io.to(roomId).emit('showGameAlert', `O juíz viu o golpe ilegal!<br>${attacker.nome} perde 1 ponto!`);
            logMessage(state, `O juíz viu o golpe ilegal! ${attacker.nome} perde 1 ponto na decisão!`, 'log-crit');
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
    
    return attackResult;
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

    if (!state) return false;

    // GM-only actions
    if (['gm_switch_mode', 'gmStartsMode', 'gmSelectsOpponent', 'gmSelectsArenaFighters', 'configure_and_start_arena', 'toggle_pause', 'apply_cheats', 'toggle_dice_cheat', 'toggle_illegal_cheat', 'toggle_force_dice'].includes(type)) {
        return isGm;
    }

    if (state.mode === 'lobby') {
        return ['playerSelectsCharacter'].includes(type);
    }

    if (state.mode === 'theater') {
        return (type === 'updateToken' || type === 'changeScenario' || type === 'changeTokenOrder' || type === 'publish_stage' || type === 'updateGlobalScale' || type === 'update_scenario_dims') && isGm;
    }

    const move = state.moves[action.move];

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
        case 'gm_classic_setup': return type === 'gm_confirm_p1_setup' && isGm;
        case 'opponent_selection': return type === 'gmSelectsOpponent' && isGm;
        case 'arena_opponent_selection': return type === 'gmSelectsArenaFighters' && isGm;
        case 'p1_special_moves_selection': return type === 'set_p1_special_moves' && playerKey === 'player1';
        case 'p2_stat_assignment': return type === 'set_p2_stats' && isGm; // Only GM sets P2 stats now
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
        case 'decision_table_wait': return (type === 'reveal_winner' && isGm);
        case 'arena_configuring': return type === 'configure_and_start_arena' && isGm;
        case 'gameover': return false;
        default: return false;
    }
}

function dispatchAction(room) {
    if (!room || !room.state) return;
    const { state, id: roomId } = room;
    io.to(roomId).emit('hideRollButtons');

    if (state.mode === 'lobby') {
        return;
    }

    if (state.mode === 'theater') return;

    switch (state.phase) {
        case 'paused': return;
        case 'opponent_selection':
            if (state.gmId) {
                io.to(state.gmId).emit('promptOpponentSelection', {
                    availablePlayers: Object.values(state.connectedPlayers).filter(p => p.role === 'player' && p.selectedCharacter)
                });
            }
            return;
        case 'arena_opponent_selection':
            if(state.gmId) {
                 io.to(state.gmId).emit('promptArenaOpponentSelection', {
                    availablePlayers: Object.values(state.connectedPlayers).filter(p => p.role === 'player' && p.selectedCharacter)
                });
            }
            return;
        case 'arena_configuring':
            if (state.gmId) {
                io.to(state.gmId).emit('promptArenaConfiguration', {
                    p1: state.fighters.player1,
                    p2: state.fighters.player2,
                    availableMoves: SPECIAL_MOVES
                });
            }
            return;
        case 'p1_special_moves_selection':
            const p1socketIdMoves = room.players.find(p => p.playerKey === 'player1').id;
            io.to(p1socketIdMoves).emit('promptSpecialMoves', { availableMoves: SPECIAL_MOVES });
            return;
        case 'p2_stat_assignment':
            const gmSocketId = state.gmId;
            io.to(gmSocketId).emit('promptP2StatsAndMoves', { p2data: state.pendingP2Choice, availableMoves: SPECIAL_MOVES });
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
            const tableHtml = `<p>A luta foi para a decisão dos juízes.</p><table style="width:100%; margin-top:15px; border-collapse: collapse; text-align: left;"><thead><tr><th style="padding: 5px; border-bottom: 1px solid #fff;">Critério</th><th style="padding: 5px; border-bottom: 1px solid #fff;">${info.p1.name}</th><th style="padding: 5px; border-bottom: 1px solid #fff;">${info.p2.name}</th></tr></thead><tbody><tr><td style="padding: 5px;">Pontuação Inicial</td><td style="text-align:center;">10</td><td style="text-align:center;">10</td></tr><tr><td style="padding: 5px;">Pen. por Quedas</td><td style="text-align:center;">-${info.p1.knockdownPenalty}</td><td style="text-align:center;">-${info.p2.knockdownPenalty}</td></tr><tr><td style="padding: 5px;">Pen. por Menos Acertos</td><td style="text-align:center;">-${info.p1.hitsPenalty}</td><td style="text-align:center;">-${info.p2.hitsPenalty}</td></tr><tr><td style="padding: 5px;">Pen. por Mais Dano Recebido</td><td style="text-align:center;">-${info.p1.damagePenalty}</td><td style="text-align:center;">-${info.p2.damagePenalty}</td></tr><tr><td style="padding: 5px; color: #dc3545;">Penalidades</td><td style="text-align:center;">-${info.p1.illegalPenalty}</td><td style="text-align:center;">-${info.p2.illegalPenalty}</td></tr></tbody><tfoot><tr><th style="padding: 5px; border-top: 1px solid #fff;">Pontuação Final</th><th style="padding: 5px; border-top: 1px solid #fff; text-align:center;">${info.p1.finalScore}</th><th style="padding: 5px; border-top: 1px solid #fff; text-align:center;">${info.p2.finalScore}</th></tr></tfoot></table>`;
            let decisionMakerKey = state.gmId;
            io.to(roomId).emit('showModal', {
                modalType: 'decision_table', title: "Pontuação dos Juízes", text: tableHtml,
                btnText: "Anunciar Vencedor", action: { type: 'reveal_winner' }, targetPlayerKey: decisionMakerKey
            });
            return;
        case 'double_knockdown':
            if (state.doubleKnockdownInfo) {
                io.to(roomId).emit('showModal', { 
                    modalType: 'double_knockdown', 
                    doubleKnockdownInfo: state.doubleKnockdownInfo, 
                    title: `QUEDA DUPLA!`, 
                    btnText: `Tentar Levantar`, 
                    action: { type: 'request_get_up' }
                });
            }
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
            else if (state.winner && state.fighters[state.winner]) { const winnerName = state.fighters[state.winner].nome; reason += `<br><br><strong style="color: #dc3545; font-size: 1.2em;">VITÓRIA DE ${winnerName.toUpperCase()}</strong>`; }
            else { reason = "Fim de Jogo"; }
            io.to(roomId).emit('showModal', { modalType: 'gameover', title: "Fim da Luta!", text: reason });
            return;
        default: io.to(roomId).emit('hideModal'); return;
    }
}
io.on('connection', (socket) => {
    socket.emit('availableFighters', {
        p1: LUTA_CHARACTERS
    });

    socket.on('gmCreatesLobby', () => {
        const newRoomId = uuidv4().substring(0, 6);
        socket.join(newRoomId);
        socket.currentRoomId = newRoomId;
        const newState = createNewLobbyState(socket.id);
        
        games[newRoomId] = {
            id: newRoomId,
            players: [{ id: socket.id, role: 'gm' }],
            spectators: [],
            state: newState
        };
        
        socket.emit('assignRole', { role: 'gm', isGm: true });
        socket.emit('roomCreated', newRoomId);
        io.to(socket.id).emit('gameUpdate', newState);
    });

    socket.on('playerJoinsLobby', ({ roomId, role }) => {
        const room = games[roomId];
        if (!room) {
            socket.emit('error', { message: 'Sala não encontrada.' });
            return;
        }
        socket.join(roomId);
        socket.currentRoomId = roomId;

        if (room.players.find(p => p.id === socket.id) || room.spectators.includes(socket.id)) return;

        if (role === 'spectator') {
            room.spectators.push(socket.id);
        } else {
             room.players.push({ id: socket.id, role: 'player' });
             room.state.connectedPlayers[socket.id] = { id: socket.id, role: 'player', selectedCharacter: null };
        }
       
        socket.emit('assignRole', { role });
        io.to(roomId).emit('gameUpdate', room.state);
        logMessage(room.state, `Um ${role} entrou na sala.`);
    });
    
    socket.on('spectateGame', (roomId) => { // Kept for backwards compatibility / direct spectate links
        const room = games[roomId];
        if (!room) { socket.emit('error', { message: 'Sala não encontrada.' }); return; }
        socket.join(roomId);
        room.spectators.push(socket.id);
        socket.currentRoomId = roomId;
        socket.emit('assignRole', { role: 'spectator' });
        socket.emit('gameUpdate', room.state);
        logMessage(room.state, 'Um espectador entrou na sala.');
        io.to(roomId).emit('gameUpdate', room.state);
    });

    socket.on('playerAction', (action) => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId] || !action || !action.type) return;
        
        const room = games[roomId];
        const state = room.state;
        action.gmSocketId = state.gmId; // Pass GM id for validation

        if (!isActionValid(state, action)) {
            console.log("Ação inválida recebida:", action, "no modo/fase:", state.mode, state.phase);
            return;
        }

        const moveName = action.move;
        const move = (state.moves && moveName) ? state.moves[moveName] : undefined;
        if (move && move.reaction) {
            action.type = moveName;
        }

        const playerKey = action.playerKey;
        switch (action.type) {
            case 'playerSelectsCharacter': {
                if(state.mode !== 'lobby') return;
                const { character } = action;
                if(state.unavailableCharacters.includes(character.nome)) {
                    socket.emit('characterUnavailable', character.nome);
                    return;
                }
                state.unavailableCharacters.push(character.nome);
                state.connectedPlayers[socket.id].selectedCharacter = character;
                logMessage(state, `Jogador selecionou ${character.nome}.`);
                break;
            }
            case 'gmStartsMode': {
                const { targetMode, scenario } = action;
                let newState;
                let lobbyStateCache = { ...state };
                
                if (targetMode === 'theater') {
                    newState = state.theaterCache || createNewTheaterState(scenario || 'mapas/cenarios externos/externo (1).png');
                    newState.gmId = state.gmId;
                    Object.keys(state.connectedPlayers).forEach(playerId => {
                        io.to(playerId).emit('assignRole', { role: 'spectator' });
                    });
                } else {
                    newState = createNewGameState();
                    newState.mode = targetMode;
                    newState.gmId = state.gmId;
                    newState.scenario = scenario || (targetMode === 'classic' ? 'Ringue.png' : 'Ringue2.png');
                    newState.connectedPlayers = state.connectedPlayers;
                    logMessage(newState, `GM iniciou o modo ${targetMode}.`);
                    
                    if(targetMode === 'classic') {
                        newState.phase = 'gm_classic_setup';
                    } else if (targetMode === 'arena') {
                        newState.hostId = state.gmId;
                        newState.phase = 'arena_opponent_selection';
                    }
                }
                newState.lobbyCache = lobbyStateCache;
                room.state = newState;
                break;
            }
            case 'gm_switch_mode': {
                const { targetMode } = action;
                let lobbyState = state.lobbyCache; 
                let currentTheaterState = state.mode === 'theater' ? state : null;
                let newState;

                if (targetMode === 'lobby') {
                    newState = lobbyState; 
                    Object.values(newState.connectedPlayers).forEach(p => {
                        io.to(p.id).emit('assignRole', { role: 'player' });
                    });
                     io.to(newState.gmId).emit('assignRole', { role: 'gm', isGm: true });
                } else {
                     let scenario = (targetMode === 'classic' ? 'Ringue.png' : (targetMode === 'arena' ? 'Ringue2.png' : 'mapas/cenarios externos/externo (1).png'));
                     if (targetMode === 'theater') {
                        newState = state.theaterCache || createNewTheaterState(scenario);
                        newState.gmId = state.gmId;
                        Object.keys(lobbyState.connectedPlayers).forEach(playerId => {
                            io.to(playerId).emit('assignRole', { role: 'spectator' });
                        });
                    } else {
                        newState = createNewGameState();
                        newState.mode = targetMode;
                        newState.gmId = state.gmId;
                        newState.scenario = scenario;
                        newState.connectedPlayers = lobbyState.connectedPlayers;
                        logMessage(newState, `GM trocou para o modo ${targetMode}.`);
                        
                        if(targetMode === 'classic') {
                            newState.phase = 'gm_classic_setup';
                        } else if (targetMode === 'arena') {
                            newState.hostId = state.gmId;
                            newState.phase = 'arena_opponent_selection';
                        }
                    }
                    newState.lobbyCache = lobbyState;
                }
                if (currentTheaterState) {
                    newState.theaterCache = currentTheaterState;
                }
                room.state = newState;
                break;
            }
            case 'gm_confirm_p1_setup':
                state.fighters.player1 = createNewFighterState(action.player1Data);
                logMessage(state, `GM definiu ${action.player1Data.nome} como Jogador 1.`);
                
                const gmAsPlayer = room.players.find(p => p.id === state.gmId);
                if(gmAsPlayer) gmAsPlayer.playerKey = 'player1';
                else room.players.push({id: state.gmId, role: 'gm', playerKey: 'player1'})
                
                io.to(socket.id).emit('assignRole', { role: 'gm', playerKey: 'player1', isGm: true });

                state.phase = 'opponent_selection';
                break;

            case 'gmSelectsArenaFighters': {
                const { p1_socketId, p2_socketId } = action;
                const p1Data = state.connectedPlayers[p1_socketId];
                const p2Data = state.connectedPlayers[p2_socketId];

                if (!p1Data || !p1Data.selectedCharacter || !p2Data || !p2Data.selectedCharacter) return;
                
                state.fighters.player1 = { nome: p1Data.selectedCharacter.nome, img: p1Data.selectedCharacter.img };
                state.fighters.player2 = { nome: p2Data.selectedCharacter.nome, img: p2Data.selectedCharacter.img };
                
                io.to(p1_socketId).emit('assignRole', { role: 'player', playerKey: 'player1' });
                io.to(p2_socketId).emit('assignRole', { role: 'player', playerKey: 'player2' });
                
                io.to(state.gmId).emit('assignRole', { role: 'spectator', isGm: true });
                
                Object.keys(state.connectedPlayers).forEach(id => {
                    if (id !== p1_socketId && id !== p2_socketId && id !== state.gmId) {
                         io.to(id).emit('assignRole', { role: 'spectator' });
                    }
                });

                logMessage(state, `GM selecionou ${p1Data.selectedCharacter.nome} vs ${p2Data.selectedCharacter.nome} para a Arena.`);
                state.phase = 'arena_configuring';
                break;
            }

            case 'gmSelectsOpponent': {
                const { opponentSocketId } = action;
                const opponentData = state.connectedPlayers[opponentSocketId];
                if (!opponentData || !opponentData.selectedCharacter) return;
                
                state.pendingP2Choice = opponentData.selectedCharacter;
                
                const opponentAsPlayer = room.players.find(p => p.id === opponentSocketId);
                if(opponentAsPlayer) opponentAsPlayer.playerKey = 'player2';
                
                Object.values(state.connectedPlayers).forEach(p => {
                    if (p.id !== state.gmId && p.id !== opponentSocketId) {
                        io.to(p.id).emit('assignRole', { role: 'spectator' });
                    }
                });

                logMessage(state, `GM selecionou ${opponentData.selectedCharacter.nome} como oponente.`);
                io.to(opponentSocketId).emit('assignRole', {role: 'player', playerKey: 'player2'});
                
                state.phase = 'p2_stat_assignment';
                break;
            }
            case 'update_scenario_dims': {
                const scenarioState = state.scenarioStates[state.currentScenario];
                if(scenarioState) {
                    scenarioState.scenarioWidth = action.width;
                    scenarioState.scenarioHeight = action.height;
                }
                break;
            }
            case 'updateGlobalScale': {
                const scenarioState = state.scenarioStates[state.currentScenario];
                if(scenarioState) {
                    scenarioState.globalTokenScale = action.scale;
                    if (!scenarioState.isStaging) {
                        const { visibleTokens, visibleTokenOrder } = filterVisibleTokens(scenarioState);
                        state.publicState.tokens = visibleTokens;
                        state.publicState.tokenOrder = visibleTokenOrder;
                        state.publicState.globalTokenScale = action.scale;
                    }
                }
                break;
            }
            case 'publish_stage': {
                const scenarioState = state.scenarioStates[state.currentScenario];
                if(scenarioState) {
                    state.publicState.scenario = scenarioState.scenario;
                    const { visibleTokens, visibleTokenOrder } = filterVisibleTokens(scenarioState);
                    state.publicState.tokens = visibleTokens;
                    state.publicState.tokenOrder = visibleTokenOrder;
                    state.publicState.globalTokenScale = scenarioState.globalTokenScale;
                    scenarioState.isStaging = false;
                    logMessage(state, 'GM publicou a nova cena para os espectadores.');
                }
                break;
            }
            case 'updateToken': {
                const scenarioState = state.scenarioStates[state.currentScenario];
                if(!scenarioState) break;

                if (action.token.remove) {
                    if (Array.isArray(action.token.ids)) {
                        action.token.ids.forEach(idToRemove => {
                            delete scenarioState.tokens[idToRemove];
                            scenarioState.tokenOrder = scenarioState.tokenOrder.filter(id => id !== idToRemove);
                        });
                    } else {
                        delete scenarioState.tokens[action.token.id];
                        scenarioState.tokenOrder = scenarioState.tokenOrder.filter(id => id !== action.token.id);
                    }
                } else if (action.token.updates) {
                     action.token.updates.forEach(update => {
                        if (scenarioState.tokens[update.id]) {
                            Object.assign(scenarioState.tokens[update.id], update);
                        }
                    });
                }
                else {
                    if (!scenarioState.tokens[action.token.id]) {
                        scenarioState.tokens[action.token.id] = { isFlipped: false };
                        scenarioState.tokenOrder.push(action.token.id);
                    }
                    Object.assign(scenarioState.tokens[action.token.id], action.token);
                }
                if (!scenarioState.isStaging) {
                    const { visibleTokens: vTokens, visibleTokenOrder: vOrder } = filterVisibleTokens(scenarioState);
                    state.publicState.tokens = vTokens;
                    state.publicState.tokenOrder = vOrder;
                }
                break;
            }
            case 'changeTokenOrder': {
                const scenarioState = state.scenarioStates[state.currentScenario];
                if(!scenarioState) break;
                const { tokenId, direction } = action;
                const order = scenarioState.tokenOrder;
                const currentIndex = order.indexOf(tokenId);
                if (currentIndex === -1) break;

                if (direction === 'forward' && currentIndex < order.length - 1) {
                    [order[currentIndex], order[currentIndex + 1]] = [order[currentIndex + 1], order[currentIndex]];
                } else if (direction === 'backward' && currentIndex > 0) {
                    [order[currentIndex], order[currentIndex - 1]] = [order[currentIndex - 1], order[currentIndex]];
                }
                if (!scenarioState.isStaging) {
                    const { visibleTokenOrder: vOrder } = filterVisibleTokens(scenarioState);
                    state.publicState.tokenOrder = vOrder;
                }
                break;
            }
            case 'changeScenario': {
                const newScenarioName = action.scenario;
                state.currentScenario = newScenarioName;
                if (!state.scenarioStates[newScenarioName]) {
                    state.scenarioStates[newScenarioName] = {
                        scenario: newScenarioName,
                        scenarioWidth: null,
                        scenarioHeight: null,
                        tokens: {},
                        tokenOrder: [],
                        globalTokenScale: 1.0,
                        isStaging: true,
                    };
                }
                logMessage(state, `GM mudou para o cenário: ${action.scenario}. Use 'Publicar' para mostrar aos espectadores.`);
                break;
            }

            // BATTLE MODE ACTIONS
            case 'toggle_force_dice':
                let currentForce = (typeof state.diceCheat === 'number') ? state.diceCheat : 0;
                if (currentForce === 0) {
                    state.diceCheat = 2;
                } else if (currentForce < 5) {
                    state.diceCheat++;
                } else {
                    state.diceCheat = null;
                }
                break;
            case 'toggle_dice_cheat':
                if (state.diceCheat === action.cheat) {
                    state.diceCheat = null;
                } else {
                    state.diceCheat = action.cheat;
                }
                break;
            case 'toggle_illegal_cheat':
                if (state.illegalCheat === 'normal') {
                    state.illegalCheat = 'always';
                } else if (state.illegalCheat === 'always') {
                    state.illegalCheat = 'never';
                } else {
                    state.illegalCheat = 'normal';
                }
                break;
            case 'Esquiva':
                 const esquivador = state.fighters[playerKey];
                 if(esquivador.pa >= move.cost) {
                    esquivador.pa -= move.cost;
                    esquivador.activeEffects.esquiva = { duration: 2 };
                    const currentDefRoll = esquivador.defRoll || 0;
                    const newBaseStat = esquivador.agi;
                    esquivador.def = currentDefRoll + newBaseStat;
                    state.reactionState = { playerKey, move: 'Esquiva' };
                    logMessage(state, `${esquivador.nome} usa <span class="log-move-name">Esquiva</span>! Sua defesa foi recalculada para <span class="highlight-total">${esquivador.def}</span>.`, 'log-info');
                    io.to(roomId).emit('playSound', MOVE_SOUNDS['Esquiva']);
                 }
                 break;
            case 'Counter':
                state.reactionState = { playerKey, move: 'Counter' };
                break;
            case 'confirm_disqualification':
                state.phase = 'gameover';
                break;
            case 'toggle_pause':
                if (state.phase === 'paused') {
                    state.phase = state.previousPhase || 'turn';
                } else {
                    if (state.phase === 'decision_table_wait' || state.phase === 'gameover') return;
                    state.previousPhase = state.phase;
                    state.phase = 'paused';
                }
                break;
            case 'apply_cheats':
                const { p1, p2 } = action.cheats;
                const p1f = state.fighters.player1;
                const p2f = state.fighters.player2;
                if (p1f) {
                    p1f.agi = parseInt(p1.agi, 10);
                    p1f.res = parseInt(p1.res, 10);
                    p1f.hp = parseInt(p1.hp, 10);
                    p1f.pa = parseInt(p1.pa, 10);
                    p1f.hpMax = p1f.res * 5;
                }
                if (p2f) {
                    p2f.agi = parseInt(p2.agi, 10);
                    p2f.res = parseInt(p2.res, 10);
                    p2f.hp = parseInt(p2.hp, 10);
                    p2f.pa = parseInt(p2.pa, 10);
                    p2f.hpMax = p2f.res * 5;
                }
                break;
            case 'give_last_chance':
                state.knockdownInfo.attempts = 3; 
                state.knockdownInfo.isLastChance = true; 
                state.phase = 'knockdown';
                break;
            case 'resolve_knockdown_loss':
                logMessage(state, `Não conseguiu! Fim da luta!`, 'log-crit');
                const finalCountReason = "9..... 10..... A contagem termina.<br><br>Vitória por Nocaute!";
                state.phase = 'gameover';
                state.winner = (state.knockdownInfo.downedPlayer === 'player1') ? 'player2' : 'player1';
                state.reason = finalCountReason;
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
                state.phase = 'opponent_selection';
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
                const attacker = state.fighters[playerKey];
                const defenderKey = (playerKey === 'player1') ? 'player2' : 'player1';
                let cost = move.cost;
                if (state.followUpState && state.followUpState.playerKey === playerKey && moveName === 'White Fang') {
                    cost = 0;
                }
                if (attacker.pa < cost) return;
                attacker.pa -= cost;
                
                if (moveName === 'White Fang') {
                    executeAttack(state, playerKey, defenderKey, moveName, io, roomId);
                    if (state.phase === 'gm_disqualification_ack') break;
                    if (state.followUpState) {
                        state.followUpState = null;
                        state.phase = 'turn';
                    } else {
                        state.followUpState = { playerKey, moveName };
                        state.phase = 'white_fang_follow_up';
                    }
                } else if (moveName === 'Flicker Jab') {
                    const executeFlicker = () => {
                        if (state.phase !== 'turn' && state.phase !== 'white_fang_follow_up') return;
                        const attackResult = executeAttack(state, playerKey, defenderKey, moveName, io, roomId);
                        io.to(roomId).emit('gameUpdate', room.state);
                        
                        if (attackResult.counterLanded || state.phase === 'gm_disqualification_ack' || state.phase === 'knockdown' || state.phase === 'double_knockdown') {
                            dispatchAction(room);
                            return;
                        }
                        if (state.fighters[defenderKey].hp <= 0) return;
                        if (attackResult.hit) {
                            setTimeout(executeFlicker, 700);
                        } else {
                            io.to(roomId).emit('gameUpdate', room.state);
                            dispatchAction(room);
                        }
                    };
                    executeFlicker();
                    return; 
                } else {
                     executeAttack(state, playerKey, defenderKey, moveName, io, roomId);
                     if (state.phase === 'white_fang_follow_up') {
                        state.followUpState = null;
                        state.phase = 'turn';
                     }
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
                const roll = rollD(6, state);
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
                const defRoll = rollD(3, state);
                io.to(roomId).emit('diceRoll', { playerKey, rollValue: defRoll, diceType: 'd3' });
                const fighter = state.fighters[playerKey];
                fighter.defRoll = defRoll;
                let baseStat = fighter.res;
                let statName = 'RES';
                if (fighter.activeEffects.esquiva && fighter.activeEffects.esquiva.duration > 0) {
                    baseStat = fighter.agi;
                    statName = 'AGI';
                    logMessage(state, `Esquiva está ativa para ${fighter.nome}!`, 'log-info')
                }
                fighter.def = defRoll + baseStat;
                logMessage(state, `${fighter.nome} definiu defesa: D3(${defRoll}) + ${statName}(${baseStat}) = <span class="highlight-total">${fighter.def}</span>`, 'log-info');
                if (playerKey === 'player1') { state.phase = 'defense_p2'; } 
                else { logMessage(state, `--- ROUND ${state.currentRound} COMEÇA! ---`, 'log-turn'); state.phase = 'turn'; }
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
                if (state.phase === 'knockdown') {
                    const knockdownInfo = state.knockdownInfo;
                    if (!knockdownInfo || knockdownInfo.downedPlayer !== playerKey) return;
                    knockdownInfo.attempts++;
                    let getUpRoll = rollD(6, state);
                    if (state.diceCheat === 'crit') getUpRoll = 6; else if (state.diceCheat === 'fumble') getUpRoll = 1;
                    io.to(roomId).emit('diceRoll', { playerKey, rollValue: getUpRoll, diceType: 'd6' });
                    const downedFighter = state.fighters[playerKey];
                    const totalRoll = getUpRoll + downedFighter.res;
                    knockdownInfo.lastRoll = totalRoll;
                    const logCalc = `D6(${getUpRoll}) + RES(${downedFighter.res}) = <span class="highlight-total">${totalRoll}</span> (Necessário 7)`;
                    
                    if (totalRoll >= 7) {
                        logMessage(state, `${downedFighter.nome} tenta se levantar... ${logCalc}. Ele se levantou!`, 'log-info');
                        io.to(roomId).emit('getUpSuccess', { downedPlayerName: downedFighter.nome, rollValue: totalRoll });
                        setTimeout(() => {
                            downedFighter.res--; const newHp = downedFighter.res * 5;
                            downedFighter.hp = newHp; downedFighter.hpMax = newHp;
                            state.phase = 'turn'; state.knockdownInfo = null;
                            io.to(roomId).emit('gameUpdate', room.state);
                            dispatchAction(room);
                        }, 3000);
                        return;
                    } else {
                        logMessage(state, `${downedFighter.nome} tenta se levantar... ${logCalc}. Falhou!`, 'log-miss');
                        if (knockdownInfo.attempts >= 4) {
                            if (knockdownInfo.isLastChance) {
                                logMessage(state, `Não conseguiu! Fim da luta!`, 'log-crit');
                                setTimeout(() => {
                                    state.phase = 'gameover'; state.winner = (playerKey === 'player1') ? 'player2' : 'player1';
                                    state.reason = "9..... 10..... A contagem termina.<br><br>Vitória por Nocaute!";
                                    io.to(roomId).emit('gameUpdate', room.state); dispatchAction(room);
                                }, 1000);
                                return;
                            } else { state.phase = 'gm_decision_knockdown'; }
                        }
                    }
                } else if (state.phase === 'double_knockdown') {
                    const dki = state.doubleKnockdownInfo;
                    if (!dki || dki.readyStatus[playerKey]) return;
                    
                    dki.readyStatus[playerKey] = true;

                    const bothReady = dki.readyStatus.player1 && dki.readyStatus.player2;
                    if (bothReady) {
                        dki.attempts++;
                        const results = {};
                        ['player1', 'player2'].forEach(pKey => {
                            if (dki.getUpStatus[pKey] === 'pending') {
                                const fighter = state.fighters[pKey];
                                const getUpRoll = rollD(6, state);
                                const totalRoll = getUpRoll + fighter.res;
                                const success = totalRoll >= 7;
                                results[pKey] = { roll: getUpRoll, total: totalRoll, success };
                                dki.getUpStatus[pKey] = success ? 'success' : 'fail';
                            }
                        });

                        io.to(roomId).emit('doubleKnockdownResults', results);

                        setTimeout(() => {
                            const p1Status = dki.getUpStatus.player1;
                            const p2Status = dki.getUpStatus.player2;
                            const isFinalAttempt = dki.attempts >= 4;
                            
                            const p1Up = p1Status === 'success';
                            const p2Up = p2Status === 'success';
                            
                            if (p1Up && p2Up) {
                                logMessage(state, `INCRÍVEL! Ambos se levantam e a luta continua!`, 'log-crit');
                                [state.fighters.player1, state.fighters.player2].forEach(f => { f.res--; const newHp = f.res * 5; f.hp = newHp; f.hpMax = newHp; });
                                state.phase = 'turn'; state.doubleKnockdownInfo = null;
                            } else if ( (p1Up && p2Status === 'fail_tko') || (p1Up && !p2Up && isFinalAttempt) ) {
                                state.phase = 'gameover'; state.winner = 'player1'; state.reason = `${state.fighters.player1.nome} se levantou, mas ${state.fighters.player2.nome} não! Vitória por Nocaute!`;
                            } else if ( (p2Up && p1Status === 'fail_tko') || (p2Up && !p1Up && isFinalAttempt) ) {
                                state.phase = 'gameover'; state.winner = 'player2'; state.reason = `${state.fighters.player2.nome} se levantou, mas ${state.fighters.player1.nome} não! Vitória por Nocaute!`;
                            } else if (isFinalAttempt) {
                                state.phase = 'gameover'; state.winner = 'draw'; state.reason = `Nenhum dos lutadores conseguiu se levantar. A luta termina em empate!`;
                            } else {
                                logMessage(state, `A contagem continua...`, 'log-miss');
                                dki.readyStatus = {
                                    player1: dki.getUpStatus.player1 === 'success' || dki.getUpStatus.player1 === 'fail_tko',
                                    player2: dki.getUpStatus.player2 === 'success' || dki.getUpStatus.player2 === 'fail_tko'
                                };
                                if (dki.getUpStatus.player1 === 'fail') dki.getUpStatus.player1 = 'pending';
                                if (dki.getUpStatus.player2 === 'fail') dki.getUpStatus.player2 = 'pending';
                            }
                            
                            io.to(roomId).emit('gameUpdate', room.state);
                            dispatchAction(room);
                        }, 3000);
                        return; 
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
        const state = room.state;

        if (socket.id === state.gmId) {
            io.to(roomId).emit('error', { message: 'O Mestre da Sala encerrou a sessão.' });
            delete games[roomId];
            return;
        }

        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex > -1) {
            const disconnectedPlayer = room.players.splice(playerIndex, 1)[0];
            
            if (state.mode === 'lobby' && state.connectedPlayers[socket.id]) {
                const playerInfo = state.connectedPlayers[socket.id];
                if (playerInfo.selectedCharacter) {
                    state.unavailableCharacters = state.unavailableCharacters.filter(char => char !== playerInfo.selectedCharacter.nome);
                }
                delete state.connectedPlayers[socket.id];
                logMessage(state, `Um jogador desconectou.`);
                io.to(roomId).emit('gameUpdate', state);
            } else if (state.mode && state.mode !== 'lobby' && state.phase !== 'gameover') {
                 const playerKey = disconnectedPlayer.playerKey;
                 if ((playerKey === 'player1' || playerKey === 'player2') && state.fighters[playerKey]) {
                     state.phase = 'gameover';
                     state.winner = playerKey === 'player1' ? 'player2' : 'player1';
                     state.reason = `Oponente (${state.fighters[playerKey].nome}) desconectou.`;
                     io.to(roomId).emit('gameUpdate', state);
                     dispatchAction(room);
                 }
            }
            return;
        }
        
        const spectatorIndex = room.spectators.indexOf(socket.id);
        if (spectatorIndex > -1) {
            room.spectators.splice(spectatorIndex, 1);
            if (room.state && room.state.log) {
                logMessage(room.state, 'Um espectador saiu.');
                io.to(roomId).emit('gameUpdate', room.state);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));