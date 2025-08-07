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
    const lutadoresNomes = lutadoresData.replace(/[\[\]]/g, '').split(',').map(name => name.replace(/"/g, '').trim()).filter(name => name);
    lutadoresNomes.forEach(nome => { LUTA_CHARACTERS[nome] = { agi: 2, res: 3 }; });
} catch (error) { console.error('Erro ao carregar lutadores.json:', error); }

const games = {};
const ATTACK_MOVE = { damage: 5 };
function rollD6() { return Math.floor(Math.random() * 6) + 1; }

function createNewLobbyState(gmId) { /* ... */ }
function createNewGameState() {
    return {
        fighters: { players: {}, npcs: {} }, winner: null, reason: null, currentRound: 1, whoseTurn: null,
        activeCharacterKey: null, turnOrder: [], turnIndex: -1, initiativeRolls: {}, phase: 'party_setup',
        log: [{ text: "Aguardando jogadores formarem o grupo..." }], scenario: 'mapas/cenarios externos/externo (1).png',
        mode: 'adventure', gmId: null,
    };
}

function createNewFighterState(data) {
    const res = Math.max(1, parseInt(data.res, 10) || 1);
    const agi = parseInt(data.agi, 10) || 1;
    return {
        id: data.id, nome: data.nome, img: data.img, agi: agi, res: res, hpMax: res * 5, hp: res * 5,
        status: 'active', hasActed: false 
    };
}

function logMessage(state, text, className = '') { /* ... */ }
function getFighter(state, key) { return state.fighters.players[key] || state.fighters.npcs[key]; }
function checkGameOver(state) { /* ... */ }
function executeAttack(state, attackerKey, defenderKey, io, roomId) { /* ... */ }

// --- MODIFICAÇÃO: advanceTurn agora move o personagem para o final da fila (looping) ---
function advanceTurn(state, io, roomId) {
    if (state.phase !== 'battle') return;

    // Se a ordem de turno estiver vazia (fim do round), começa nova iniciativa
    if (state.turnOrder.length === 0) {
        state.currentRound++;
        state.phase = 'initiative_roll';
        state.initiativeRolls = {};
        state.activeCharacterKey = null;
        Object.values(state.fighters.players).concat(Object.values(state.fighters.npcs)).forEach(f => f.hasActed = false);
        logMessage(state, `--- FIM DO ROUND ${state.currentRound - 1} ---`, 'log-turn');
        logMessage(state, `ROUND ${state.currentRound}! Rolem a iniciativa!`, 'log-turn');
        return;
    }

    // Move o personagem que acabou de agir para o final da fila
    const lastPlayer = state.turnOrder.shift();
    state.turnOrder.push(lastPlayer);
    
    // Filtra personagens derrotados para garantir que não joguem
    state.turnOrder = state.turnOrder.filter(id => getFighter(state, id).status === 'active');
    
    if (checkGameOver(state)) return; // Se o jogo acabou, para aqui

    // Pega o próximo da fila
    state.activeCharacterKey = state.turnOrder[0];
    const newAttacker = getFighter(state, state.activeCharacterKey);
    logMessage(state, `É a vez de ${newAttacker.nome}.`, 'log-info');
    
    // --- MODIFICAÇÃO: Removemos o ataque automático do NPC ---
    // Agora o servidor simplesmente aguarda a ação do GM.
}

io.on('connection', (socket) => {
    socket.on('gmCreatesLobby', () => { /* ... */ });
    socket.emit('availableFighters', { /* ... */ });
    socket.on('playerJoinsLobby', ({ roomId, role }) => { /* ... */ });

    socket.on('playerAction', (action) => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId] || !action || !action.type) return;
        const room = games[roomId];
        const state = room.state;
        const playerKey = socket.id; // Chave para jogadores

        switch (action.type) {
            case 'playerSelectsCharacter': { /* ... */ break; }
            case 'gmStartsAdventure': { /* ... */ break; }
            case 'gmConfirmParty': { /* ... */ break; }
            case 'gmStartBattle': { /* ... */ break; }
            case 'roll_initiative': { /* ... */ break; }
            
            // --- MODIFICAÇÃO: Ação de ataque agora pode ser feita pelo GM para NPCs ---
            case 'attack':
                const isGmAction = isGm && state.fighters.npcs[action.attackerKey];
                const isPlayerAction = playerKey === action.attackerKey;

                // Validação de quem pode atacar
                if (!isPlayerAction && !isGmAction) return;

                const attacker = getFighter(state, action.attackerKey);
                if (action.attackerKey !== state.activeCharacterKey || (attacker && attacker.hasActed)) return;
                
                executeAttack(state, action.attackerKey, action.targetKey, io, roomId);
                if (attacker) {
                    attacker.hasActed = true;
                }
                break;

            case 'end_turn':
                const actorKey = action.actorKey; // Quem está passando o turno (pode ser um NPC via GM)
                if (actorKey !== state.activeCharacterKey) return;
                advanceTurn(state, io, roomId);
                break;
        }
        io.to(roomId).emit('gameUpdate', room.state);
    });
    
    socket.on('disconnect', () => { /* ... */ });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));