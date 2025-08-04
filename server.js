const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const LUTA_CHARACTERS_P1 = {};
try {
    const lutadoresData = fs.readFileSync('lutadores.json', 'utf8');
    const lutadoresNomes = lutadoresData
        .replace(/[\[\]]/g, '') 
        .split(',')             
        .map(name => name.replace(/"/g, '').trim()) 
        .filter(name => name); 
    lutadoresNomes.forEach(nome => {
        LUTA_CHARACTERS_P1[nome] = { agi: 1, res: 1 };
    });
    console.log('Lutadores P1 carregados com sucesso!');
} catch (error) {
    console.error('Erro ao carregar lutadores.json:', error);
}

const games = {};

const MOVES = {
    'Jab': { cost: 1, damage: 1, penalty: 0 }, 'Direto': { cost: 2, damage: 3, penalty: 1 },
    'Upper': { cost: 3, damage: 6, penalty: 2 }, 'Liver Blow': { cost: 3, damage: 3, penalty: 1 },
    'Clinch': { cost: 3, damage: 0, penalty: 0 }, 'Golpe Ilegal': { cost: 2, damage: 5, penalty: 0 },
    'Esquiva': { cost: 1, damage: 0, penalty: 0, reaction: true }
};
const SPECIAL_MOVES = {
    'Counter': { cost: 0, damage: 0, penalty: 0, reaction: true }, 'Flicker Jab': { cost: 3, damage: 1, penalty: 1 },
    'Smash': { cost: 2, damage: 8, penalty: 3 }, 'Bala': { cost: 1, damage: 2, penalty: 0 },
    'Gazelle Punch': { cost: 3, damage: 8, penalty: 2 }, 'Frog Punch': { cost: 4, damage: 7, penalty: 1 },
    'White Fang': { cost: 4, damage: 4, penalty: 1 }, 'OraOraOra': { displayName: 'Ora ora ora...', cost: 3, damage: 10, penalty: -1 } 
};
const ALL_MOVES = { ...MOVES, ...SPECIAL_MOVES };
const MOVE_SOUNDS = {
    'Jab': ['jab01.mp3', 'jab02.mp3', 'jab03.mp3'],'Direto': ['baseforte01.mp3', 'baseforte02.mp3'],
    'Liver Blow': ['baseforte01.mp3', 'baseforte02.mp3'],'Upper': ['baseforte01.mp3', 'baseforte02.mp3'],
    'Counter': ['especialforte01.mp3', 'especialforte02.mp3', 'especialforte03.mp3'],'Smash': ['especialforte01.mp3', 'especialforte02.mp3', 'especialforte03.mp3'],
    'Gazelle Punch': ['especialforte01.mp3', 'especialforte02.mp3', 'especialforte03.mp3'],'Frog Punch': ['especialforte01.mp3', 'especialforte02.mp3', 'especialforte03.mp3'],
    'White Fang': ['especialforte01.mp3', 'especialforte02.mp3', 'especialforte03.mp3'],'Flicker Jab': ['Flicker01.mp3', 'Flicker02.mp3', 'Flicker03.mp3'],
    'Bala': ['bala01.mp3', 'bala02.mp3'],'OraOraOra': 'OraOraOra.mp3',
    'Golpe Ilegal': ['especialforte01.mp3', 'especialforte02.mp3'],'Clinch': ['Esquiva.mp3'],
    'Esquiva': ['Esquiva.mp3']
};

function rollD(s, state) {
    if (state && typeof state.diceCheat === 'number') { return Math.min(state.diceCheat, s); }
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

function createNewLobbyState() {
    return {
        id: null, gmId: null, password: "abif13", players: {}, 
        gameState: null, selectedCharacters: []
    };
}
function createNewGameState() {
    return {
        fighters: {}, pendingP2Choice: null, winner: null, reason: null, moves: ALL_MOVES,
        currentRound: 1, currentTurn: 1, whoseTurn: null, didPlayer1GoFirst: false,
        phase: 'waiting', previousPhase: null, log: [{ text: "Aguardando oponente..." }],
        initiativeRolls: {}, knockdownInfo: null, doubleKnockdownInfo: null, decisionInfo: null,
        followUpState: null, scenario: 'Ringue.png', mode: null, hostId: null, gmId: null,
        playersReady: { player1: false, player2: false }, reactionState: null, diceCheat: null,
        illegalCheat: 'normal', theaterCache: null
    };
}
function createNewTheaterState(initialScenario) {
    const theaterState = {
        mode: 'theater', gmId: null, log: [{ text: "Modo Teatro iniciado."}], currentScenario: initialScenario,
        scenarioStates: {}, publicState: {}
    };
    theaterState.scenarioStates[initialScenario] = {
        scenario: initialScenario, scenarioWidth: null, scenarioHeight: null, tokens: {},
        tokenOrder: [], globalTokenScale: 1.0, isStaging: false,
    };
    theaterState.publicState = {
        scenario: initialScenario, tokens: {}, tokenOrder: [], globalTokenScale: 1.0
    };
    return theaterState;
}

function createNewFighterState(data) {
    const res = Math.max(1, parseInt(data.res, 10) || 1);
    const agi = parseInt(data.agi, 10) || 1;
    const hp = parseInt(data.hp, 10) || (res * 5);
    const pa = parseInt(data.pa, 10) || 3;
    return {
        nome: data.nome, img: data.img, agi: agi, res: res, originalRes: res, hpMax: res * 5,
        hp: hp, pa: pa, def: 0, hitsLanded: 0, knockdowns: 0, totalDamageTaken: 0,
        specialMoves: data.specialMoves || [], pointDeductions: 0, illegalMoveUses: 0,
        activeEffects: {}, defRoll: 0
    };
}

function logMessage(state, text, className = '') { if(state && state.log) { state.log.push({ text, className }); if (state.log.length > 50) state.log.shift(); } }

function filterVisibleTokens(currentScenarioState) {
    if (!currentScenarioState || !currentScenarioState.scenarioWidth || !currentScenarioState.scenarioHeight) {
        return {
            visibleTokens: currentScenarioState ? { ...currentScenarioState.tokens } : {},
            visibleTokenOrder: currentScenarioState ? [...currentScenarioState.tokenOrder] : []
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

// ... (as funções de combate como executeAttack, endTurn, etc. permanecem aqui) ...

function isActionValid(state, action) { /* ... */ }
function dispatchAction(room) { /* ... */ }

io.on('connection', (socket) => {
    
    socket.on('createLobby', ({ password }) => {
        const newLobby = createNewLobbyState();
        if (password !== newLobby.password) {
            socket.emit('passwordIncorrect');
            return;
        }
        const newRoomId = uuidv4().substring(0, 6);
        socket.join(newRoomId);
        socket.currentRoomId = newRoomId;
        
        newLobby.id = newRoomId;
        newLobby.gmId = socket.id;
        newLobby.players[socket.id] = { id: socket.id, role: 'gm' };
        games[newRoomId] = newLobby;

        socket.emit('lobbyCreated', { roomId: newRoomId });
        socket.emit('assignRole', { role: 'gm' });
        socket.emit('availableFighters', { p1: LUTA_CHARACTERS_P1 });
    });

    socket.on('joinLobby', ({ roomId }) => {
        const lobby = games[roomId];
        if (!lobby) {
            socket.emit('error', { message: 'Sala não encontrada.' });
            return;
        }
        socket.join(roomId);
        socket.currentRoomId = roomId;

        lobby.players[socket.id] = { id: socket.id, role: 'player' };
        
        if (lobby.gameState) {
            lobby.players[socket.id].role = 'spectator';
            socket.emit('assignRole', { role: 'spectator' });
            socket.emit('gameUpdate', lobby.gameState);
        } else {
            socket.emit('assignRole', { role: 'player' });
            socket.emit('lobbyJoined', { selectedCharacters: lobby.selectedCharacters });
        }
        io.to(lobby.gmId).emit('updateLobbyPlayers', lobby.players);
    });

    socket.on('selectPlayerCharacter', ({ characterName, characterImg }) => {
        const lobby = games[socket.currentRoomId];
        if (!lobby || lobby.selectedCharacters.includes(characterName)) {
            socket.emit('characterTaken', characterName);
            return;
        }
        
        lobby.selectedCharacters.push(characterName);
        const player = lobby.players[socket.id];
        player.character = { name: characterName, img: characterImg };
        
        socket.emit('characterConfirmed', player.character);
        io.to(lobby.id).emit('updateSelectedCharacters', lobby.selectedCharacters);
        io.to(lobby.gmId).emit('updateLobbyPlayers', lobby.players);
    });

    // --- CORREÇÃO 4: Lógica para desmarcar personagem ---
    socket.on('deselectPlayerCharacter', () => {
        const lobby = games[socket.currentRoomId];
        if (!lobby) return;

        const player = lobby.players[socket.id];
        if (player && player.character) {
            lobby.selectedCharacters = lobby.selectedCharacters.filter(name => name !== player.character.name);
            delete player.character;
            socket.emit('characterDeselected');
            io.to(lobby.id).emit('updateSelectedCharacters', lobby.selectedCharacters);
            io.to(lobby.gmId).emit('updateLobbyPlayers', lobby.players);
        }
    });

    socket.on('enterAsSpectator', () => {
        const lobby = games[socket.currentRoomId];
        if (!lobby) return;
        const player = lobby.players[socket.id];
        if (player) {
            player.role = 'spectator';
        }
        socket.emit('assignRole', { role: 'spectator' });
        io.to(lobby.gmId).emit('updateLobbyPlayers', lobby.players);
        if (lobby.gameState) {
            socket.emit('gameUpdate', lobby.gameState);
        }
    });

    socket.on('requestLobbyPlayersForMatch', () => {
        const lobby = games[socket.currentRoomId];
        if (lobby && socket.id === lobby.gmId) {
            socket.emit('showOpponentSelection', { players: lobby.players, mode: 'classic' });
        }
    });

    // --- CORREÇÃO 5: Mover lógica de início de jogo para `playerAction` ---
    socket.on('playerAction', (action) => {
        const lobby = games[socket.currentRoomId];
        if (!lobby) return;

        // Ações que podem ser executadas antes de um jogo começar
        if (socket.id === lobby.gmId) {
            switch (action.type) {
                case 'gm_select_mode':
                    if (action.mode === 'theater') {
                        Object.values(lobby.players).forEach(p => {
                            if (p.role === 'player') {
                                p.role = 'spectator';
                                io.to(p.id).emit('assignRole', { role: 'spectator' });
                            }
                        });
                        
                        if (!lobby.gameState || lobby.gameState.mode !== 'theater') {
                            lobby.gameState = createNewTheaterState(action.scenario);
                        }
                        lobby.gameState.gmId = lobby.gmId;
                        io.to(lobby.id).emit('gameUpdate', lobby.gameState);
                    }
                    return; // Interrompe para não cair na lógica de jogo abaixo

                case 'gm_start_classic_game':
                    const newGame = createNewGameState();
                    newGame.mode = 'classic';
                    newGame.gmId = lobby.gmId;
                    
                    newGame.fighters.player1 = createNewFighterState(action.player1Data);
                    const opponentPlayer = lobby.players[action.opponentId];
                    newGame.pendingP2Choice = opponentPlayer.character;
                    
                    lobby.gameState = newGame;
                    
                    Object.values(lobby.players).forEach(p => {
                        let newRole = 'spectator';
                        if (p.id === lobby.gmId) newRole = 'player1';
                        else if (p.id === action.opponentId) newRole = 'player2';
                        p.role = newRole;
                        io.to(p.id).emit('assignRole', { role: newRole });
                    });

                    newGame.phase = 'p2_stat_assignment';
                    io.to(lobby.id).emit('gameUpdate', newGame);
                    //dispatchAction({ state: newGame, id: lobby.id }); // A lógica de dispatch vai aqui
                    return;
            }
        }
        
        // Se um jogo já existe, passa a ação para a lógica de jogo
        if (lobby.gameState) {
            const state = lobby.gameState;
            action.gmSocketId = socket.id;
            // ... (Aqui entra o 'switch' da sua lógica de `playerAction` original, operando em `state`)
        }
    });
    
    socket.on('disconnect', () => {
        const lobby = games[socket.currentRoomId];
        if (!lobby) return;
        
        const disconnectedPlayer = lobby.players[socket.id];
        if (disconnectedPlayer) {
            if (disconnectedPlayer.role === 'gm') {
                io.to(lobby.id).emit('error', { message: 'O Mestre encerrou a sala.' });
                delete games[socket.currentRoomId];
                return;
            }

            if (disconnectedPlayer.character) {
                lobby.selectedCharacters = lobby.selectedCharacters.filter(name => name !== disconnectedPlayer.character.name);
                io.to(lobby.id).emit('updateSelectedCharacters', lobby.selectedCharacters);
            }
            
            delete lobby.players[socket.id];
            io.to(lobby.gmId).emit('updateLobbyPlayers', lobby.players);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));