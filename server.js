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
    const lutadoresNomes = lutadoresData
        .replace(/[\[\]]/g, '')
        .split(',')
        .map(name => name.replace(/"/g, '').trim())
        .filter(name => name);

    lutadoresNomes.forEach(nome => {
        LUTA_CHARACTERS[nome] = { agi: 2, res: 3 }; // Stats padrão para NPCs
    });
    console.log('Lutadores carregados com sucesso!');
} catch (error) {
    console.error('Erro ao carregar lutadores.json:', error);
}

const games = {};

// --- MODIFICAÇÃO: Regras de jogo drasticamente simplificadas
const ATTACK_MOVE = { damage: 5 };

function rollD6() {
    return Math.floor(Math.random() * 6) + 1;
}

function createNewLobbyState(gmId) {
    return {
        mode: 'lobby',
        phase: 'waiting_players',
        gmId: gmId,
        connectedPlayers: {},
        unavailableCharacters: [],
        log: [{ text: "Lobby criado. Aguardando jogadores..." }],
    };
}

function createNewGameState() {
    return {
        fighters: {
            players: {},
            npcs: {}
        },
        winner: null,
        reason: null,
        currentRound: 1,
        whoseTurn: 'players_turn',
        activeCharacterKey: null,
        turnOrder: [],
        turnIndex: -1,
        phase: 'party_setup',
        log: [{ text: "Aguardando jogadores formarem o grupo..." }],
        scenario: 'mapas/cenarios externos/externo (1).png', // Cenário medieval padrão
        mode: 'adventure',
        gmId: null,
    };
}

// --- MODIFICAÇÃO: Criação de lutador simplificada
function createNewFighterState(data) {
    const res = Math.max(1, parseInt(data.res, 10) || 1);
    const agi = parseInt(data.agi, 10) || 1;

    return {
        id: data.id,
        nome: data.nome,
        img: data.img,
        agi: agi,
        res: res,
        hpMax: res * 5,
        hp: res * 5,
        status: 'active' // 'active' ou 'down'
    };
}

function logMessage(state, text, className = '') {
    if (state && state.log) {
        state.log.push({ text, className });
        if (state.log.length > 50) state.log.shift();
    }
}

function getFighter(state, key) {
    return state.fighters.players[key] || state.fighters.npcs[key];
}

function checkGameOver(state) {
    const activePlayers = Object.values(state.fighters.players).filter(p => p.status === 'active');
    const activeNpcs = Object.values(state.fighters.npcs).filter(n => n.status === 'active');

    if (activeNpcs.length === 0 && Object.keys(state.fighters.npcs).length > 0) {
        state.phase = 'gameover';
        state.winner = 'players';
        state.reason = "Todos os inimigos foram derrotados! Vitória do grupo!";
        logMessage(state, state.reason, 'log-crit');
        return true;
    }

    if (activePlayers.length === 0 && Object.keys(state.fighters.players).length > 0) {
        state.phase = 'gameover';
        state.winner = 'npcs';
        state.reason = "Todos os aventureiros foram derrotados...";
        logMessage(state, state.reason, 'log-crit');
        return true;
    }

    return false;
}

// --- MODIFICAÇÃO: Lógica de ataque totalmente reescrita e simplificada
function executeAttack(state, attackerKey, defenderKey, io, roomId) {
    const attacker = getFighter(state, attackerKey);
    const defender = getFighter(state, defenderKey);

    if (!attacker || !defender || attacker.status !== 'active' || defender.status !== 'active') {
        return;
    }

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
            checkGameOver(state);
        }
    } else {
        logMessage(state, "Errou!", 'log-miss');
        io.to(roomId).emit('playSound', 'Esquiva.mp3');
    }
}

function advanceTurn(state, io, roomId) {
    if (state.phase !== 'battle') return;

    state.turnIndex++;

    if (state.turnIndex >= state.turnOrder.length) {
        state.turnIndex = 0;
        if (state.whoseTurn === 'players_turn') {
            state.whoseTurn = 'npcs_turn';
            state.turnOrder = Object.keys(state.fighters.npcs).filter(k => state.fighters.npcs[k].status === 'active');
            logMessage(state, `--- Vez dos Inimigos ---`, 'log-turn');
        } else {
            state.whoseTurn = 'players_turn';
            state.turnOrder = Object.keys(state.fighters.players).filter(k => state.fighters.players[k].status === 'active');
            state.currentRound++;
            logMessage(state, `--- ROUND ${state.currentRound} COMEÇA! ---`, 'log-turn');
        }
    }

    if (state.turnOrder.length === 0) {
        if (!checkGameOver(state)) {
            // Se um time foi todo derrotado, o outro time deveria ter vencido.
            // Se não, passa o turno para o outro time.
            state.turnIndex = -1;
            advanceTurn(state, io, roomId);
        }
        return;
    }

    state.activeCharacterKey = state.turnOrder[state.turnIndex];
    const newAttacker = getFighter(state, state.activeCharacterKey);
    logMessage(state, `É a vez de ${newAttacker.nome}.`, 'log-info');

    if (state.whoseTurn === 'npcs_turn' && state.phase === 'battle') {
        io.to(roomId).emit('gameUpdate', state);
        setTimeout(() => {
            const npc = getFighter(state, state.activeCharacterKey);
            const availablePlayers = Object.values(state.fighters.players).filter(p => p.status === 'active');
            
            if (npc && availablePlayers.length > 0) {
                const target = availablePlayers[Math.floor(Math.random() * availablePlayers.length)];
                executeAttack(state, npc.id, target.id, io, roomId);
            }
            if (state.phase === 'battle') {
                advanceTurn(state, io, roomId);
                io.to(roomId).emit('gameUpdate', state);
            }
        }, 2000);
    }
}

io.on('connection', (socket) => {
    // --- MODIFICAÇÃO: GM não precisa de senha, cria o lobby ao conectar
    socket.on('gmCreatesLobby', () => {
        const newRoomId = uuidv4().substring(0, 6);
        socket.join(newRoomId);
        socket.currentRoomId = newRoomId;
        const newState = createNewLobbyState(socket.id);

        games[newRoomId] = {
            id: newRoomId,
            players: [{ id: socket.id, role: 'gm' }],
            spectators: [],
            state: newState,
        };

        socket.emit('assignRole', { role: 'gm', isGm: true });
        socket.emit('roomCreated', newRoomId);
        io.to(socket.id).emit('gameUpdate', newState);
    });
    
    socket.emit('availableFighters', {
        p1: LUTA_CHARACTERS,
        playable: PLAYABLE_CHARACTERS.map(name => ({ name, img: `images/${name}.png` }))
    });

    socket.on('playerJoinsLobby', ({ roomId, role }) => {
        const room = games[roomId];
        if (!room) {
            socket.emit('error', { message: 'Sala não encontrada.' });
            return;
        }

        if (role === 'player' && Object.keys(room.state.connectedPlayers).length >= MAX_PLAYERS) {
            socket.emit('error', { message: 'O grupo de aventureiros já está cheio.' });
            return;
        }

        socket.join(roomId);
        socket.currentRoomId = roomId;

        if (room.players.find(p => p.id === socket.id) || room.spectators.includes(socket.id)) return;

        if (role === 'spectator') {
            room.spectators.push(socket.id);
        } else {
            room.players.push({ id: socket.id, role: 'player' });
            if (room.state.mode === 'lobby') {
                room.state.connectedPlayers[socket.id] = { id: socket.id, role: 'player', selectedCharacter: null };
            }
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
        const playerKey = socket.id;

        switch (action.type) {
            case 'playerSelectsCharacter': {
                if (state.mode !== 'lobby') return;
                const { character } = action;
                if (state.unavailableCharacters.includes(character.nome)) {
                    socket.emit('characterUnavailable', character.nome);
                    return;
                }
                state.unavailableCharacters.push(character.nome);
                state.connectedPlayers[socket.id].selectedCharacter = character;
                logMessage(state, `Jogador selecionou ${character.nome}.`);
                break;
            }
            case 'gmStartsAdventure': {
                let newState = createNewGameState();
                newState.gmId = state.gmId;
                newState.lobbyCache = state; // Guarda o estado do lobby

                // Cria o estado do lutador para cada jogador que já escolheu um personagem
                for (const sId in state.connectedPlayers) {
                    const playerData = state.connectedPlayers[sId];
                    if (playerData.selectedCharacter) {
                        newState.fighters.players[sId] = createNewFighterState({
                            id: sId,
                            nome: playerData.selectedCharacter.nome,
                            img: playerData.selectedCharacter.img,
                            // AGI e RES serão definidos pelo GM
                        });
                        io.to(sId).emit('assignRole', { role: 'player', playerKey: sId });
                    }
                }
                room.state = newState;
                break;
            }
            case 'gmConfirmParty': {
                if (state.phase !== 'party_setup') return;
                // Atualiza os stats dos jogadores definidos pelo GM
                action.playerStats.forEach(pStat => {
                    if (state.fighters.players[pStat.id]) {
                       const player = state.fighters.players[pStat.id];
                       player.agi = pStat.agi;
                       player.res = pStat.res;
                       player.hp = pStat.res * 5;
                       player.hpMax = pStat.res * 5;
                    }
                });

                state.phase = 'npc_setup';
                logMessage(state, `Grupo confirmado! GM está preparando os inimigos...`);
                break;
            }
            case 'gmStartBattle': {
                if (state.phase !== 'npc_setup') return;
                const { npcs } = action;

                npcs.forEach((npcConfig, index) => {
                    const npcId = `npc_${index}`;
                    state.fighters.npcs[npcId] = createNewFighterState({
                        id: npcId,
                        ...npcConfig
                    });
                });

                logMessage(state, `A BATALHA COMEÇA!`);
                state.phase = 'battle';
                
                // Inicia o primeiro turno
                state.whoseTurn = 'players_turn';
                state.turnOrder = Object.keys(state.fighters.players).filter(k => state.fighters.players[k].status === 'active');
                state.turnIndex = -1;
                advanceTurn(state, io, roomId);
                break;
            }
            case 'attack':
                if (playerKey !== state.activeCharacterKey) return;
                executeAttack(state, playerKey, action.targetKey, io, roomId);
                if (state.phase === 'battle') {
                    advanceTurn(state, io, roomId);
                }
                break;
            case 'end_turn':
                if (playerKey !== state.activeCharacterKey) return;
                advanceTurn(state, io, roomId);
                break;
        }
        io.to(roomId).emit('gameUpdate', room.state);
    });
    
    socket.on('disconnect', () => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId]) return;
        const room = games[roomId];
        let state = room.state;
        if (socket.id === state.gmId) { /* ... */ }

        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex > -1) {
             if (state.fighters && state.fighters.players && state.fighters.players[socket.id]) {
                const player = state.fighters.players[socket.id];
                player.status = 'down'; // Trata como derrotado
                player.hp = 0;
                logMessage(state, `${player.nome} desconectou e foi removido da batalha.`, 'log-crit');
                checkGameOver(state);
                if (state.activeCharacterKey === socket.id) {
                    advanceTurn(state, io, roomId);
                }
            }
            // ... (lógica de remoção do lobby)
        }
        io.to(roomId).emit('gameUpdate', room.state);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));