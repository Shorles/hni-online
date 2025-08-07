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

function createNewLobbyState(gmId) { /* ... (sem alterações) */ }

// --- MODIFICAÇÃO: Adicionadas propriedades para a iniciativa ---
function createNewGameState() {
    return {
        fighters: {
            players: {},
            npcs: {}
        },
        winner: null,
        reason: null,
        currentRound: 1,
        whoseTurn: null, // Agora será definido pela ordem de iniciativa
        activeCharacterKey: null,
        turnOrder: [], // Ordem de iniciativa para o round atual
        turnIndex: -1,
        initiativeRolls: {}, // Para armazenar as rolagens de cada um
        phase: 'party_setup',
        log: [{ text: "Aguardando jogadores formarem o grupo..." }],
        scenario: 'mapas/cenarios externos/externo (1).png',
        mode: 'adventure',
        gmId: null,
    };
}

function createNewFighterState(data) { /* ... (sem alterações) */ }
function logMessage(state, text, className = '') { /* ... (sem alterações) */ }
function getFighter(state, key) { /* ... (sem alterações) */ }
function checkGameOver(state) { /* ... (sem alterações) */ }
function executeAttack(state, attackerKey, defenderKey, io, roomId) { /* ... (sem alterações) */ }

// --- MODIFICAÇÃO: advanceTurn agora usa a ordem de iniciativa pré-calculada ---
function advanceTurn(state, io, roomId) {
    if (state.phase !== 'battle') return;

    // Remove o personagem que acabou de jogar da frente da fila
    if (state.turnIndex >= 0) {
        state.turnOrder.shift();
    }

    // Se a fila acabou, o round termina
    if (state.turnOrder.length === 0) {
        state.currentRound++;
        state.phase = 'initiative_roll'; // Começa uma nova rodada de iniciativa
        state.initiativeRolls = {};
        state.activeCharacterKey = null;
        logMessage(state, `--- FIM DO ROUND ${state.currentRound - 1} ---`, 'log-turn');
        logMessage(state, `ROUND ${state.currentRound}! Rolem a iniciativa!`, 'log-turn');
        return;
    }

    // Pega o próximo da fila
    state.activeCharacterKey = state.turnOrder[0];
    const newAttacker = getFighter(state, state.activeCharacterKey);
    logMessage(state, `É a vez de ${newAttacker.nome}.`, 'log-info');

    // Automação do turno do NPC
    if (state.fighters.npcs[state.activeCharacterKey]) {
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
    socket.on('gmCreatesLobby', () => { /* ... (sem alterações) */ });
    socket.emit('availableFighters', { /* ... (sem alterações) */ });
    socket.on('playerJoinsLobby', ({ roomId, role }) => { /* ... (sem alterações) */ });

    socket.on('playerAction', (action) => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId] || !action || !action.type) return;

        const room = games[roomId];
        const state = room.state;
        const playerKey = socket.id;

        switch (action.type) {
            case 'playerSelectsCharacter': { /* ... (sem alterações) */ }
            case 'gmStartsAdventure': { /* ... (sem alterações) */ }
            case 'gmConfirmParty': { /* ... (sem alterações) */ }

            // --- MODIFICAÇÃO: gmStartBattle agora leva para a fase de iniciativa ---
            case 'gmStartBattle': {
                if (state.phase !== 'npc_setup') return;
                const { npcs } = action;
                npcs.forEach((npcConfig, index) => {
                    const npcId = `npc_${index}`;
                    state.fighters.npcs[npcId] = createNewFighterState({ id: npcId, ...npcConfig });
                });

                logMessage(state, `Os combatentes estão prontos! Rolem a iniciativa!`, 'log-turn');
                state.phase = 'initiative_roll';
                break;
            }

            // --- MODIFICAÇÃO: Nova ação para rolar iniciativa ---
            case 'roll_initiative': {
                if (state.phase !== 'initiative_roll') return;

                const charactersToRoll = action.isGmRoll ? Object.values(state.fighters.npcs) : [getFighter(state, playerKey)];
                
                charactersToRoll.forEach(char => {
                    if (char && !state.initiativeRolls[char.id]) {
                        const roll = rollD6();
                        state.initiativeRolls[char.id] = char.agi + roll;
                        logMessage(state, `${char.nome} rolou iniciativa: ${state.initiativeRolls[char.id]} (AGI ${char.agi} + D6 ${roll})`, 'log-info');
                    }
                });

                // Verifica se todos já rolaram
                const allFighters = [...Object.values(state.fighters.players), ...Object.values(state.fighters.npcs)];
                const allRolled = allFighters.every(f => f.status !== 'active' || state.initiativeRolls[f.id] !== undefined);

                if (allRolled) {
                    // Determina a ordem de turno com desempate
                    const sortedFighters = allFighters
                        .filter(f => f.status === 'active')
                        .sort((a, b) => {
                            const rollA = state.initiativeRolls[a.id];
                            const rollB = state.initiativeRolls[b.id];

                            // Critério 1: Maior rolagem vence
                            if (rollA !== rollB) return rollB - rollA;

                            // Critério 2: Desempate por camada (z-index)
                            // Camadas: P1/N1=14, P2/N2=13, P3/N3=12, P4/N4=11
                            // Maior z-index tem prioridade
                            const getLayer = (fighterId) => {
                                const isPlayer = !!state.fighters.players[fighterId];
                                const list = Object.keys(isPlayer ? state.fighters.players : state.fighters.npcs);
                                const index = list.indexOf(fighterId);
                                return 14 - index;
                            };
                            const layerA = getLayer(a.id);
                            const layerB = getLayer(b.id);
                            if (layerA !== layerB) return layerB - layerA;

                            // Critério 3: Desempate entre P vs N na mesma camada
                            const isPlayerA = !!state.fighters.players[a.id];
                            const isPlayerB = !!state.fighters.players[b.id];
                            if (isPlayerA && !isPlayerB) return -1; // Jogador tem prioridade
                            if (!isPlayerA && isPlayerB) return 1;

                            return 0; // Se tudo for igual
                        });
                    
                    state.turnOrder = sortedFighters.map(f => f.id);
                    logMessage(state, "Ordem de turno definida!", "log-crit");
                    state.phase = 'battle';
                    state.turnIndex = -1;
                    advanceTurn(state, io, roomId);
                }
                break;
            }
            
            case 'attack': { /* ... (sem alterações) */ }
            case 'end_turn': { /* ... (sem alterações) */ }
        }
        io.to(roomId).emit('gameUpdate', room.state);
    });
    
    socket.on('disconnect', () => { /* ... (sem alterações) */ });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));