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
        LUTA_CHARACTERS[nome] = { agi: 2, res: 3 };
    });
    console.log('Lutadores carregados com sucesso!');
} catch (error) {
    console.error('Erro ao carregar lutadores.json:', error);
}

const games = {};

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
        scenario: 'mapas/cenarios externos/externo (1).png',
        mode: 'adventure',
        gmId: null,
    };
}

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
        status: 'active'
    };
}

function logMessage(state, text, className = '') { /* ... */ }
function getFighter(state, key) { /* ... */ }
function checkGameOver(state) { /* ... */ }
function executeAttack(state, attackerKey, defenderKey, io, roomId) { /* ... */ }
function advanceTurn(state, io, roomId) { /* ... */ }

// Código completo das funções auxiliares omitido para brevidade, pois não mudaram.
// Elas estão corretas no seu arquivo local.

io.on('connection', (socket) => {
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
        
        // --- CORREÇÃO: Envia o ID da sala ANTES da primeira atualização de estado ---
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
        // Envia o estado atual para o novo jogador, que irá renderizar a tela correta.
        io.to(socket.id).emit('gameUpdate', room.state);
        // Notifica a todos no lobby sobre a nova conexão.
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
                newState.lobbyCache = state;

                for (const sId in state.connectedPlayers) {
                    const playerData = state.connectedPlayers[sId];
                    if (playerData.selectedCharacter) {
                        newState.fighters.players[sId] = createNewFighterState({
                            id: sId,
                            nome: playerData.selectedCharacter.nome,
                            img: playerData.selectedCharacter.img,
                        });
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
                    state.fighters.npcs[npcId] = createNewFighterState({ id: npcId, ...npcConfig });
                });
                logMessage(state, `A BATALHA COMEÇA!`);
                state.phase = 'battle';
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
    
    // ... restante do código (disconnect, etc.)
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));