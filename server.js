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
try {
    const lutadoresData = fs.readFileSync('lutadores.json', 'utf8');
    const lutadoresNomes = lutadoresData
        .replace(/[\[\]]/g, '') 
        .split(',')             
        .map(name => name.replace(/"/g, '').trim()) 
        .filter(name => name); 

    lutadoresNomes.forEach(nome => {
        LUTA_CHARACTERS[nome] = { agi: 1, res: 1 };
    });
    console.log('Inimigos (lutadores.json) carregados com sucesso!');
} catch (error) {
    console.error('Erro ao carregar lutadores.json:', error);
}


const games = {};

const MOVES = {
    'Jab': { name: "Ataque Rápido", cost: 1, damage: 2, penalty: 0 },
    'Direto': { name: "Golpe Forte", cost: 2, damage: 4, penalty: 1 },
    'Upper': { name: "Golpe Esmagador", cost: 3, damage: 7, penalty: 2 },
    'Liver Blow': { name: "Golpe Perfurante", cost: 3, damage: 4, penalty: 1, effect: 'bleed' },
    'Clinch': { name: "Atordoar", cost: 3, damage: 0, penalty: 0, effect: 'stun' },
    'Golpe Ilegal': { name: "Magia Proibida", cost: 2, damage: 6, penalty: 0 },
    'Esquiva': { name: "Postura Defensiva", cost: 2, damage: 0, penalty: 0, effect: 'def_up', self: true }
};

const SPECIAL_MOVES = {
    'Counter': { name: "Ripostar", cost: 3, damage: 0, penalty: 0, reaction: true },
    'Flicker Jab': { name: "Saraivada de Golpes", cost: 4, damage: 1, penalty: 1, hits: 4 },
    'Smash': { name: "Executar", cost: 4, damage: 10, penalty: 3 },
    'Bala': { name: "Flecha Perfurante", cost: 2, damage: 5, penalty: 0 },
    'Gazelle Punch': { name: "Investida Selvagem", cost: 4, damage: 9, penalty: 2 },
    'Frog Punch': { name: "Salto Sombrio", cost: 4, damage: 7, penalty: 1 },
    'White Fang': { name: "Lâmina Dupla", cost: 4, damage: 5, penalty: 1, hits: 2 },
    'OraOraOra': { name: 'Fúria do Bárbaro', displayName: 'Fúria do Bárbaro', cost: 5, damage: 12, penalty: -1 } 
};
const ALL_MOVES = { ...MOVES, ...SPECIAL_MOVES };

function createNewLobbyState(gmId) {
    return {
        mode: 'lobby',
        phase: 'waiting_players',
        gmId: gmId,
        connectedPlayers: {},
        unavailableCharacters: [],
        log: [{ text: "Lobby criado. Aguardando jogadores..." }],
        availableEnemies: LUTA_CHARACTERS
    };
}

function createNewGameState() {
    return {
        mode: null,
        phase: 'setup',
        gmId: null,
        log: [{ text: "Aguardando início da batalha..." }],
        scenario: 'Ringue3.png',
        
        combatants: {
            party: {},
            enemies: {}
        },
        turnOrder: [],
        turnIndex: 0,
        whoseTurn: null,
        initiativeRolls: {},
        
        winner: null,
        reason: null,
        lobbyCache: null
    };
}

function createNewFighterState(data) {
    const res = Math.max(1, parseInt(data.res, 10) || 2);
    const agi = parseInt(data.agi, 10) || 2;
    const hp = parseInt(data.hp, 10) || (res * 6);
    const pa = parseInt(data.pa, 10) || 4;

    return {
        id: data.id,
        nome: data.nome,
        img: data.img,
        agi: agi,
        res: res,
        hpMax: hp,
        hp: hp,
        paMax: pa,
        pa: pa,
        def: res,
        specialMoves: data.specialMoves || [],
        isPlayer: data.isPlayer || false
    };
}

function logMessage(state, text, className = '') { if(state && state.log) { state.log.push({ text, className }); if (state.log.length > 50) state.log.shift(); } }

function checkWinCondition(state) {
    const partyAlive = Object.values(state.combatants.party).some(p => p.hp > 0);
    const enemiesAlive = Object.values(state.combatants.enemies).some(e => e.hp > 0);

    if (!partyAlive) {
        state.winner = 'Inimigos';
        state.reason = 'O grupo de heróis foi derrotado.';
        state.phase = 'gameover';
    } else if (!enemiesAlive) {
        state.winner = 'Heróis';
        state.reason = 'Todos os inimigos foram derrotados!';
        state.phase = 'gameover';
    }
}

function executeAttack(state, attackerId, targetId, moveName) {
    const attacker = state.combatants.party[attackerId] || state.combatants.enemies[attackerId];
    const target = state.combatants.party[targetId] || state.combatants.enemies[targetId];
    const move = ALL_MOVES[moveName];
    const moveDisplayName = move.name || moveName;

    if (!attacker || !target || !move || attacker.pa < move.cost) {
        return;
    }

    attacker.pa -= move.cost;
    logMessage(state, `${attacker.nome} usa <span class="log-move-name">${moveDisplayName}</span> em ${target.nome}!`);
    
    const roll = Math.floor(Math.random() * 6) + 1;
    const attackValue = roll + attacker.agi - (move.penalty || 0);
    logMessage(state, `Rolagem de Ataque: D6(${roll}) + AGI(${attacker.agi}) - Pen(${move.penalty || 0}) = <span class="highlight-result">${attackValue}</span> (Defesa do Alvo: ${target.def})`, 'log-info');

    if (roll === 1) {
        logMessage(state, "Erro Crítico! O ataque falha drasticamente.", 'log-miss');
    } else if (roll === 6 || attackValue >= target.def) {
        const isCrit = roll === 6;
        if(isCrit) logMessage(state, "Acerto Crítico!", 'log-crit');
        else logMessage(state, "Acertou!", 'log-hit');

        const damage = isCrit ? move.damage * 2 : move.damage;
        target.hp = Math.max(0, target.hp - damage);
        logMessage(state, `${target.nome} sofre ${damage} de dano! (${target.hp}/${target.hpMax} HP restantes)`, 'log-hit');
        
        if (target.hp <= 0) {
            logMessage(state, `${target.nome} foi derrotado!`, 'log-crit');
        }
    } else {
        logMessage(state, "O ataque errou!", 'log-miss');
    }

    checkWinCondition(state);
}

function processNewRound(state) {
    logMessage(state, `--- NOVO ROUND ---`, 'log-turn');
    Object.values(state.combatants.party).forEach(c => c.pa = c.paMax);
    Object.values(state.combatants.enemies).forEach(c => c.pa = c.paMax);
    logMessage(state, "Todos os combatentes recuperaram seus Pontos de Ação!", 'log-info');
}

function endTurn(state) {
    let nextTurnIndex = state.turnIndex;
    let nextCombatant = null;

    for (let i = 0; i < state.turnOrder.length; i++) {
        nextTurnIndex = (nextTurnIndex + 1);

        if(nextTurnIndex >= state.turnOrder.length) {
            nextTurnIndex = 0;
            processNewRound(state);
        }

        const nextCombatantId = state.turnOrder[nextTurnIndex];
        const potentialCombatant = state.combatants.party[nextCombatantId] || state.combatants.enemies[nextCombatantId];
        
        if (potentialCombatant && potentialCombatant.hp > 0) {
            nextCombatant = potentialCombatant;
            break;
        }
    }

    if (nextCombatant) {
        state.turnIndex = nextTurnIndex;
        state.whoseTurn = nextCombatant.id;
        logMessage(state, `É a vez de <span class="turn-highlight">${nextCombatant.nome}</span>.`, 'log-turn');
    } else {
        checkWinCondition(state);
    }
}

// Função auxiliar para verificar se todos rolaram e iniciar a batalha
function checkAllInitiativesRolled(state) {
    const allCombatants = [...Object.values(state.combatants.party), ...Object.values(state.combatants.enemies)];
    const allHaveRolled = allCombatants.every(c => state.initiativeRolls[c.id] !== undefined);

    if (allHaveRolled) {
        state.turnOrder = allCombatants
            .map(c => c.id)
            .sort((a, b) => state.initiativeRolls[b] - state.initiativeRolls[a]);
        
        state.turnIndex = 0;
        state.whoseTurn = state.turnOrder[0];
        state.phase = 'turn';
        const firstUp = state.combatants.party[state.whoseTurn] || state.combatants.enemies[state.whoseTurn];
        logMessage(state, `Ordem de Batalha definida! ${firstUp.nome} começa!`, 'log-turn');
    }
}

io.on('connection', (socket) => {
    
    socket.on('gmCreatesLobby', () => {
        const newRoomId = uuidv4().substring(0, 6);
        socket.join(newRoomId);
        socket.currentRoomId = newRoomId;
        
        games[newRoomId] = {
            id: newRoomId,
            players: [{ id: socket.id, role: 'gm' }],
            spectators: [],
            state: createNewLobbyState(socket.id)
        };
        
        socket.emit('assignRole', { role: 'gm', isGm: true });
        socket.emit('roomCreated', newRoomId);
        io.to(socket.id).emit('gameUpdate', games[newRoomId].state);
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
    
    socket.on('playerAction', (action) => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId] || !action || !action.type) return;
        
        const room = games[roomId];
        const state = room.state;
        action.gmSocketId = room.players.find(p=>p.role === 'gm')?.id;

        if (action.type.startsWith('gm_') && socket.id !== action.gmSocketId) return;

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
            
            case 'gm_start_battle': {
                const newBattleState = createNewGameState();
                newBattleState.mode = 'classic_rpg';
                newBattleState.gmId = action.gmSocketId;
                newBattleState.lobbyCache = { ...state };

                action.selectedPlayers.forEach(socketId => {
                    const playerData = state.connectedPlayers[socketId];
                    if (playerData && playerData.selectedCharacter) {
                        const fighterData = {
                            ...playerData.selectedCharacter,
                            id: socketId,
                            agi: 2, res: 2,
                            isPlayer: true
                        };
                        newBattleState.combatants.party[socketId] = createNewFighterState(fighterData);
                    }
                });
                
                let enemyCount = {};
                action.selectedEnemies.forEach(enemyName => {
                    enemyCount[enemyName] = (enemyCount[enemyName] || 0) + 1;
                    const enemyTemplate = LUTA_CHARACTERS[enemyName];
                    const uniqueId = `enemy_${enemyName.replace(/\s/g, '')}_${enemyCount[enemyName]}`;
                    
                    const enemyData = {
                        id: uniqueId,
                        nome: `${enemyName} ${enemyCount[enemyName]}`,
                        img: `images/lutadores/${enemyName}.png`,
                        agi: enemyTemplate.agi,
                        res: enemyTemplate.res,
                        isPlayer: false
                    };
                    newBattleState.combatants.enemies[uniqueId] = createNewFighterState(enemyData);
                });

                newBattleState.phase = 'initiative_roll';
                logMessage(newBattleState, "Batalha iniciada! Rolem a iniciativa!");
                room.state = newBattleState;
                break;
            }
            
            case 'roll_initiative': {
                if (state.phase !== 'initiative_roll') return;
                const combatant = state.combatants.party[action.combatantId];
                if (!combatant || state.initiativeRolls[action.combatantId] !== undefined) return;
                
                const roll = Math.floor(Math.random() * 20) + 1;
                state.initiativeRolls[action.combatantId] = roll + combatant.agi;
                logMessage(state, `${combatant.nome} rolou iniciativa: D20(${roll}) + AGI(${combatant.agi}) = ${state.initiativeRolls[action.combatantId]}`);

                checkAllInitiativesRolled(state);
                break;
            }

            // <<< CORREÇÃO: Nova ação para o GM rolar a iniciativa dos inimigos
            case 'gm_roll_enemies_initiative': {
                if (state.phase !== 'initiative_roll') return;
                let rolledSomething = false;
                Object.values(state.combatants.enemies).forEach(enemy => {
                    if(state.initiativeRolls[enemy.id] === undefined) {
                        const roll = Math.floor(Math.random() * 20) + 1;
                        state.initiativeRolls[enemy.id] = roll + enemy.agi;
                        logMessage(state, `${enemy.nome} rolou iniciativa: D20(${roll}) + AGI(${enemy.agi}) = ${state.initiativeRolls[enemy.id]}`);
                        rolledSomething = true;
                    }
                });
                if (rolledSomething) {
                    checkAllInitiativesRolled(state);
                }
                break;
            }

            case 'attack': {
                if (state.phase !== 'turn' || socket.id !== state.whoseTurn) return;
                executeAttack(state, action.attackerId, action.targetId, action.move);
                if(state.phase === 'turn') {
                    endTurn(state);
                }
                break;
            }
            
            case 'end_turn': {
                if (state.phase !== 'turn' || socket.id !== state.whoseTurn) return;
                endTurn(state);
                break;
            }
        }
        io.to(roomId).emit('gameUpdate', room.state);
    });

    socket.on('disconnect', () => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId]) return;
        const room = games[roomId];
        let state = room.state;

        if (socket.id === state.gmId) {
            io.to(roomId).emit('error', { message: 'O Mestre da Sala encerrou a sessão.' });
            delete games[roomId];
            return;
        }

        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex > -1) {
            room.players.splice(playerIndex, 1);
            
            const lobbyState = state.mode === 'lobby' ? state : state.lobbyCache;
            if (lobbyState && lobbyState.connectedPlayers && lobbyState.connectedPlayers[socket.id]) {
                const playerInfo = lobbyState.connectedPlayers[socket.id];
                const playerName = playerInfo.selectedCharacter ? playerInfo.selectedCharacter.nome : 'Um jogador';
                
                if (playerInfo.selectedCharacter) {
                    lobbyState.unavailableCharacters = lobbyState.unavailableCharacters.filter(char => char !== playerInfo.selectedCharacter.nome);
                }
                delete lobbyState.connectedPlayers[socket.id];
                logMessage(lobbyState, `${playerName} desconectou-se do lobby.`);
            }

            if (state.mode === 'classic_rpg' && state.combatants.party[socket.id]) {
                 state.combatants.party[socket.id].hp = 0;
                 logMessage(state, `${state.combatants.party[socket.id].nome} desconectou e foi removido da batalha.`, 'log-crit');
                 checkWinCondition(state);
                 if(state.whoseTurn === socket.id) {
                     endTurn(state);
                 }
            }
            
            io.to(roomId).emit('gameUpdate', room.state);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));