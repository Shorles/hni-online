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
} catch (error) {
    console.error('Erro ao carregar lutadores.json:', error);
}

const games = {};
const ATTACK_MOVE = { damage: 5 };
function rollD6() { return Math.floor(Math.random() * 6) + 1; }

function createNewLobbyState(gmId) { /* ... (igual à versão BETA) ... */ }
function createNewGameState() {
    return {
        fighters: { players: {}, npcs: {} },
        winner: null, reason: null, currentRound: 1, whoseTurn: null,
        activeCharacterKey: null, turnOrder: [], turnIndex: -1,
        initiativeRolls: {}, phase: 'party_setup',
        log: [{ text: "Aguardando jogadores formarem o grupo..." }],
        scenario: 'mapas/cenarios externos/externo (1).png',
        mode: 'adventure', gmId: null,
    };
}

// --- MODIFICAÇÃO: Adicionada a propriedade `hasActed` ---
function createNewFighterState(data) {
    const res = Math.max(1, parseInt(data.res, 10) || 1);
    const agi = parseInt(data.agi, 10) || 1;
    return {
        id: data.id, nome: data.nome, img: data.img,
        agi: agi, res: res, hpMax: res * 5, hp: res * 5,
        status: 'active',
        hasActed: false // Novo: Controla se o personagem já agiu no turno
    };
}

function logMessage(state, text, className = '') { /* ... */ }
function getFighter(state, key) { /* ... */ }
function checkGameOver(state) { /* ... */ }
function executeAttack(state, attackerKey, defenderKey, io, roomId) { /* ... */ }

function advanceTurn(state, io, roomId) {
    if (state.phase !== 'battle') return;
    state.turnOrder.shift();

    if (state.turnOrder.length === 0) {
        state.currentRound++;
        state.phase = 'initiative_roll';
        state.initiativeRolls = {};
        state.activeCharacterKey = null;
        Object.values(state.fighters.players).concat(Object.values(state.fighters.npcs)).forEach(f => f.hasActed = false); // Reseta para o novo round
        logMessage(state, `--- FIM DO ROUND ${state.currentRound - 1} ---`, 'log-turn');
        logMessage(state, `ROUND ${state.currentRound}! Rolem a iniciativa!`, 'log-turn');
        return;
    }

    state.activeCharacterKey = state.turnOrder[0];
    const newAttacker = getFighter(state, state.activeCharacterKey);
    logMessage(state, `É a vez de ${newAttacker.nome}.`, 'log-info');

    if (state.fighters.npcs[state.activeCharacterKey]) {
        io.to(roomId).emit('gameUpdate', state);
        setTimeout(() => {
            const npc = getFighter(state, state.activeCharacterKey);
            const availablePlayers = Object.values(state.fighters.players).filter(p => p.status === 'active');
            if (npc && availablePlayers.length > 0 && !npc.hasActed) {
                const target = availablePlayers[Math.floor(Math.random() * availablePlayers.length)];
                executeAttack(state, npc.id, target.id, io, roomId);
                npc.hasActed = true; // NPC marca que agiu
            }
            if (state.phase === 'battle') {
                advanceTurn(state, io, roomId);
                io.to(roomId).emit('gameUpdate', state);
            }
        }, 2000);
    }
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
        const playerKey = socket.id;

        switch (action.type) {
            case 'playerSelectsCharacter': { /* ... */ break; }
            case 'gmStartsAdventure': { /* ... */ break; }
            case 'gmConfirmParty': { /* ... */ break; }
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
            case 'roll_initiative': { /* ... (igual à versão BETA) ... */ break; }
            
            // --- MODIFICAÇÃO: Lógica de ataque e passar turno corrigida ---
            case 'attack':
                const attacker = getFighter(state, playerKey);
                // Só permite o ataque se for a vez do jogador E ele ainda não tiver agido
                if (playerKey !== state.activeCharacterKey || (attacker && attacker.hasActed)) return;
                
                executeAttack(state, playerKey, action.targetKey, io, roomId);
                if (attacker) {
                    attacker.hasActed = true; // Marca que o jogador já agiu
                }
                // NÃO avança o turno aqui. O jogador deve clicar em "Passar Turno".
                break;

            case 'end_turn':
                // Só avança o turno se for a vez do jogador
                if (playerKey !== state.activeCharacterKey) return;
                advanceTurn(state, io, roomId);
                break;
        }
        io.to(roomId).emit('gameUpdate', room.state);
    });
    
    socket.on('disconnect', () => { /* ... */ });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));