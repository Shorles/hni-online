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

let ALL_NPCS = {};
let PLAYABLE_CHARACTERS = [];
let DYNAMIC_CHARACTERS = [];
let ALL_SCENARIOS = {};
const MAX_PLAYERS = 4;

try {
    const charactersData = fs.readFileSync('characters.json', 'utf8');
    const characters = JSON.parse(charactersData);
    PLAYABLE_CHARACTERS = characters.players || [];
    const npcNames = characters.npcs || [];
    npcNames.forEach(nome => { ALL_NPCS[nome] = { agi: 2, res: 3 }; });

    const dynamicCharPath = 'public/images/personagens/';
    if (fs.existsSync(dynamicCharPath)) {
        const files = fs.readdirSync(dynamicCharPath).filter(file => file.startsWith('Personagem (') && (file.endsWith('.png') || file.endsWith('.jpg')));
        DYNAMIC_CHARACTERS = files.map(file => ({ name: file.split('.')[0], img: `images/personagens/${file}` }));
    }

    const scenarioCategories = ["cenarios externos", "cenarios internos", "cenas", "fichas", "objetos", "outros"];
    scenarioCategories.forEach(category => {
        const path = `public/images/mapas/${category}/`;
        if (fs.existsSync(path)) {
            ALL_SCENARIOS[category] = fs.readdirSync(path).filter(file => file.endsWith('.png') || file.endsWith('.jpg'));
        }
    });

} catch (error) { console.error('Erro ao carregar arquivos de configuração:', error); }

const games = {};
const ATTACK_MOVE = { damage: 5 };
function rollD6() { return Math.floor(Math.random() * 6) + 1; }

function createNewLobbyState(gmId) { return { mode: 'lobby', phase: 'waiting_players', gmId: gmId, connectedPlayers: {}, unavailableCharacters: [], log: [{ text: "Lobby criado. Aguardando jogadores..." }], }; }

function createNewAdventureState() {
    return {
        mode: 'adventure', fighters: { players: {}, npcs: {} }, winner: null, reason: null, currentRound: 1,
        activeCharacterKey: null, turnOrder: [], turnIndex: 0, initiativeRolls: {}, phase: 'party_setup',
        scenario: 'mapas/cenarios externos/externo (1).png',
        gmId: null, lobbyCache: null
    };
}

function createNewTheaterState(gmId, initialScenario) {
    const theaterState = {
        mode: 'theater', gmId: gmId, log: [{ text: "Modo Cenário iniciado."}], currentScenario: initialScenario,
        scenarioStates: {}, publicState: {}, lobbyCache: null
    };
    theaterState.scenarioStates[initialScenario] = {
        scenario: initialScenario, scenarioWidth: null, scenarioHeight: null, tokens: {},
        tokenOrder: [], globalTokenScale: 1.0, isStaging: true,
    };
    theaterState.publicState = {
        scenario: initialScenario, tokens: {}, tokenOrder: [], globalTokenScale: 1.0
    };
    return theaterState;
}

function createNewFighterState(data) {
    const res = Math.max(1, parseInt(data.res, 10) || 1);
    const agi = parseInt(data.agi, 10) || 1;
    return {
        id: data.id,
        nome: data.nome || data.name, // CORREÇÃO: Aceita 'name' ou 'nome'
        img: data.img, agi: agi, res: res, hpMax: res * 5, hp: res * 5, status: 'active'
    };
}

function logMessage(state, text, type = 'info') {
    if (state && state.log) {
        state.log.unshift({ text, type, time: new Date().toLocaleTimeString() });
        if (state.log.length > 100) state.log.pop();
    }
}

// --- Funções de Lógica de Jogo (Modo Aventura) ---
function getFighter(state, key) {
    return state.fighters.players[key] || state.fighters.npcs[key];
}

function checkGameOver(state) {
    const activePlayers = Object.values(state.fighters.players).filter(p => p.status === 'active');
    const activeNpcs = Object.values(state.fighters.npcs).filter(n => n.status === 'active');
    if (activePlayers.length === 0) {
        state.winner = 'npcs'; state.reason = 'Todos os jogadores foram derrotados.';
        logMessage(state, 'Fim da batalha! Os inimigos venceram.', 'game_over');
    } else if (activeNpcs.length === 0) {
        state.winner = 'players'; state.reason = 'Todos os inimigos foram derrotados.';
        logMessage(state, 'Fim da batalha! Os jogadores venceram!', 'game_over');
    }
}

function advanceTurn(state) {
    let nextIndex = state.turnIndex;
    let attempts = 0;
    do {
        nextIndex = (nextIndex + 1) % state.turnOrder.length;
        if (attempts++ > state.turnOrder.length * 2) {
             state.winner = 'draw'; state.reason = 'Ninguém pôde lutar.'; return;
        }
    } while (getFighter(state, state.turnOrder[nextIndex]).status !== 'active');
    
    if (nextIndex < state.turnIndex) {
        state.currentRound++;
        logMessage(state, `Iniciando Round ${state.currentRound}`, 'round');
    }
    state.turnIndex = nextIndex;

    state.activeCharacterKey = state.turnOrder[state.turnIndex];
    const activeFighter = getFighter(state, state.activeCharacterKey);
    logMessage(state, `É a vez de ${activeFighter.nome}.`, 'turn');
}

function executeAttack(state, roomId, attackerKey, targetKey) {
    const attacker = getFighter(state, attackerKey);
    const target = getFighter(state, targetKey);
    if (!attacker || !target || attacker.status !== 'active' || target.status !== 'active') return;
    
    const hit = true;
    if (hit) {
        const damage = ATTACK_MOVE.damage;
        target.hp = Math.max(0, target.hp - damage);
        logMessage(state, `${attacker.nome} ataca ${target.nome} e causa ${damage} de dano!`, 'hit');
        io.to(roomId).emit('characterHit', { targetKey: target.id });

        if (target.hp === 0) {
            target.status = 'down';
            logMessage(state, `${target.nome} foi derrotado!`, 'defeat');
            checkGameOver(state);
        }
    } else {
        logMessage(state, `${attacker.nome} ataca ${target.nome}, mas erra!`, 'miss');
    }
    
    if (!state.winner) {
        advanceTurn(state);
    }
}

function startBattle(state) {
    state.turnOrder = Object.values(state.fighters.players).concat(Object.values(state.fighters.npcs))
        .filter(f => f.status === 'active')
        .sort((a, b) => {
            const rollA = state.initiativeRolls[a.id] || 0;
            const rollB = state.initiativeRolls[b.id] || 0;
            if (rollB !== rollA) return rollB - rollA;
            return b.agi - a.agi;
        })
        .map(f => f.id);
    
    state.phase = 'battle';
    state.turnIndex = -1;
    state.currentRound = 1;
    logMessage(state, `--- A Batalha Começou! (Round ${state.currentRound}) ---`, 'round');
    advanceTurn(state);
}

// --- Conexão Socket.IO ---
io.on('connection', (socket) => {
    socket.on('gmCreatesLobby', () => { /* ...código sem alterações... */ });
    socket.emit('initialData', { /* ...código sem alterações... */ });
    socket.on('playerJoinsLobby', ({ roomId, role }) => { /* ...código sem alterações... */ });

    socket.on('playerAction', (action) => {
        const roomId = socket.currentRoomId;
        if (!roomId || !games[roomId] || !action || !action.type) return;
        const room = games[roomId];
        let state = room.state;
        const isGm = socket.id === state.gmId;

        if (isGm) { /* ...código de transição de modo sem alterações... */ }
        
        switch (state.mode) {
            case 'lobby': /* ...código sem alterações... */ break;
            case 'adventure':
                if (isGm) {
                    switch (action.type) {
                        case 'gmConfirmParty': /* ...código sem alterações... */ break;
                        case 'gmStartBattle':
                            if (state.phase === 'npc_setup' && action.npcs && action.npcs.length > 0) {
                                action.npcs.forEach(npcData => {
                                    const npcId = `npc-${uuidv4()}`;
                                    state.fighters.npcs[npcId] = createNewFighterState({ ...npcData, id: npcId });
                                });
                                state.phase = 'initiative_roll';
                                logMessage(state, 'Inimigos prontos! Aguardando todos rolarem iniciativa.');
                            }
                            break;
                    }
                }
                switch(action.type) {
                    case 'roll_initiative':
                        if (state.phase === 'initiative_roll') {
                           if (action.isGmRoll && isGm) {
                                Object.values(state.fighters.npcs).forEach(npc => {
                                    if (!state.initiativeRolls[npc.id]) {
                                        const roll = rollD6() + npc.agi;
                                        state.initiativeRolls[npc.id] = roll;
                                        logMessage(state, `(GM) ${npc.nome} rolou ${roll} de iniciativa.`);
                                    }
                                });
                           } else if (!isGm) {
                                const fighter = getFighter(state, socket.id);
                                if (fighter && !state.initiativeRolls[socket.id]) {
                                   const roll = rollD6() + fighter.agi;
                                   state.initiativeRolls[socket.id] = roll;
                                   logMessage(state, `${fighter.nome} rolou ${roll} de iniciativa.`);
                                }
                           }
                           
                           const allFighters = [...Object.values(state.fighters.players), ...Object.values(state.fighters.npcs)];
                           const allRolled = allFighters.every(f => state.initiativeRolls[f.id]);
                           if (allRolled) {
                               startBattle(state);
                           }
                        }
                        break;
                    case 'attack':
                         if (state.phase === 'battle' && action.attackerKey === state.activeCharacterKey) {
                            executeAttack(state, roomId, action.attackerKey, action.targetKey);
                         }
                        break;
                    case 'end_turn':
                        if (state.phase === 'battle' && action.actorKey === state.activeCharacterKey && !state.winner) {
                            advanceTurn(state);
                        }
                        break;
                }
                break;
            case 'theater':
                 if (isGm) { /* ...código do modo cenário sem alterações... */ }
                break;
        }

        io.to(roomId).emit('gameUpdate', room.state);
    });

    socket.on('disconnect', () => { /* ...código sem alterações... */ });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));