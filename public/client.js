// client.js

document.addEventListener('DOMContentLoaded', () => {
    let myRole = null;
    let myPlayerKey = null;
    let isGm = false;
    let currentGameState = null;
    let currentRoomId = new URLSearchParams(window.location.search).get('room');
    const socket = io();

    let isTargeting = false;
    // --- MODIFICAÇÃO: Guarda a chave do atacante durante a mira ---
    let targetingAttackerKey = null;

    let coordsModeActive = false;
    let ALL_FIGHTERS_DATA = {};
    let PLAYABLE_CHARACTERS_DATA = [];

    const allScreens = document.querySelectorAll('.screen');
    const gmInitialLobby = document.getElementById('gm-initial-lobby');
    const playerWaitingScreen = document.getElementById('player-waiting-screen');
    const selectionScreen = document.getElementById('selection-screen');
    const fightScreen = document.getElementById('fight-screen');
    const gmPartySetupScreen = document.getElementById('gm-party-setup-screen');
    const gmNpcSetupScreen = document.getElementById('gm-npc-setup-screen');
    
    const charListContainer = document.getElementById('character-list-container');
    const confirmBtn = document.getElementById('confirm-selection-btn');
    const roundInfoEl = document.getElementById('round-info');
    const fightLog = document.getElementById('fight-log');
    const actionButtonsWrapper = document.getElementById('action-buttons-wrapper');
    const fightSceneCharacters = document.getElementById('fight-scene-characters');
    const coordsDisplay = document.getElementById('coords-display');
    const turnOrderSidebar = document.getElementById('turn-order-sidebar');


    socket.on('availableFighters', ({ p1, playable }) => {
        ALL_FIGHTERS_DATA = p1 || {};
        PLAYABLE_CHARACTERS_DATA = playable || [];
    });

    function showScreen(screenToShow) { /* ... */ }

    // --- MODIFICAÇÃO: Função de clique de ação agora lida com o GM controlando NPCs ---
    function handleActionClick(event) {
        if (!currentGameState || currentGameState.phase !== 'battle') return;
        
        const activeFighterKey = currentGameState.activeCharacterKey;
        const myFighter = currentGameState.fighters.players[myPlayerKey];
        
        // Verifica se o clique é válido (ou é a vez do jogador, ou é a vez de um NPC e o usuário é o GM)
        const canControl = (myFighter && myFighter.id === activeFighterKey) || (isGm && currentGameState.fighters.npcs[activeFighterKey]);
        if (!canControl) return;

        const target = event.target.closest('button'); 
        if (!target || target.disabled) return;
        
        const action = target.dataset.action;
        
        if (action === 'attack') {
            isTargeting = true;
            targetingAttackerKey = activeFighterKey; // Guarda quem está atacando
            document.getElementById('targeting-indicator').classList.remove('hidden');
            // Destaca alvos corretos (jogadores se NPC ataca, NPCs se jogador ataca)
            const isNpcTurn = !!currentGameState.fighters.npcs[activeFighterKey];
            const targetSelector = isNpcTurn ? '.player-char-container.targetable' : '.npc-char-container.targetable';
            document.querySelectorAll(targetSelector).forEach(el => el.classList.add('is-targeting'));
        } else if (action === 'end_turn') {
            socket.emit('playerAction', { type: 'end_turn', actorKey: activeFighterKey });
        }
    }

    function handleTargetClick(event) {
        if (!isTargeting || !targetingAttackerKey) return;
        const targetContainer = event.target.closest('.char-container'); // Classe genérica
        if (!targetContainer || !targetContainer.classList.contains('targetable')) return;
        const targetKey = targetContainer.dataset.key;
        
        socket.emit('playerAction', { 
            type: 'attack',
            attackerKey: targetingAttackerKey,
            targetKey: targetKey 
        });
        cancelTargeting();
    }
    
    function cancelTargeting() {
        isTargeting = false;
        targetingAttackerKey = null; // Limpa o atacante
        document.getElementById('targeting-indicator').classList.add('hidden');
        document.querySelectorAll('.char-container.is-targeting').forEach(el => el.classList.remove('is-targeting'));
    }

    function toggleCoordsMode() { /* ... */ }
    function updateCoordsDisplay(event) { /* ... */ }
    function initialize() { /* ... */ }
    function onConfirmSelection() { /* ... */ }
    function renderPlayerCharacterSelection(unavailable = []) { /* ... */ }

    socket.on('gameUpdate', (gameState) => {
        const oldPhase = currentGameState ? currentGameState.phase : null;
        currentGameState = gameState;
        
        const initiativeUI = document.getElementById('initiative-ui');
        if (initiativeUI) initiativeUI.classList.add('hidden');

        if (isGm) { /* ... (lógica de telas do GM da BETA) ... */ }
        else { /* ... (lógica de telas do Player da BETA) ... */ }
    });

    socket.on('roomCreated', (roomId) => { /* ... (lógica da BETA, sem alterações) ... */ });
    
    function copyToClipboard(text, element) { /* ... */ }
    function updateGmLobbyUI(state) { /* ... */ }
    function updateGmPartySetupScreen(state) { /* ... */ }
    function renderNpcSelectionForGm() { /* ... */ }
    function renderInitiativeUI(state) { /* ... */ }
    function updateTurnOrderUI(state) { /* ... */ }

    function updateUI(state) {
        if (!state || !state.fighters) return;
        fightSceneCharacters.innerHTML = '';
        updateTurnOrderUI(state);
        const PLAYER_POSITIONS = [ { left: '200px', top: '500px', zIndex: 14 }, { left: '300px', top: '400px', zIndex: 13 }, { left: '400px', top: '300px', zIndex: 12 }, { left: '500px', top: '200px', zIndex: 11 } ];
        const NPC_POSITIONS = [ { left: '1000px', top: '500px', zIndex: 14 }, { left: '900px',  top: '400px', zIndex: 13 }, { left: '800px',  top: '300px', zIndex: 12 }, { left: '700px',  top: '200px', zIndex: 11 } ];
        
        Object.values(state.fighters.players).forEach((fighter, index) => {
            const pos = PLAYER_POSITIONS[index];
            const el = createFighterElement(fighter, 'player', state, pos);
            fightSceneCharacters.appendChild(el);
        });
        Object.values(state.fighters.npcs).forEach((fighter, index) => {
            const pos = NPC_POSITIONS[index];
            const el = createFighterElement(fighter, 'npc', state, pos);
            fightSceneCharacters.appendChild(el);
        });

        if (state.phase === 'gameover') {
            roundInfoEl.innerHTML = `<span class="turn-highlight">FIM DE JOGO!</span><br>${state.reason}`;
        } else if (state.phase === 'initiative_roll') {
            roundInfoEl.innerHTML = `ROUND ${state.currentRound} - Iniciativa`;
        } else if (state.activeCharacterKey) {
            const activeFighter = getFighter(state, state.activeCharacterKey);
            if (activeFighter) { roundInfoEl.innerHTML = `ROUND ${state.currentRound} - Vez de: <span class="turn-highlight">${activeFighter.nome}</span>`; }
        }
        
        fightLog.innerHTML = state.log.map(msg => `<p class="${msg.className || ''}">${msg.text}</p>`).join('');
        fightLog.scrollTop = fightLog.scrollHeight;
        
        actionButtonsWrapper.innerHTML = '';
        
        // --- MODIFICAÇÃO: Lógica para mostrar botões para o GM no turno do NPC ---
        const activeFighter = getFighter(state, state.activeCharacterKey);
        const isMyPlayerTurn = myPlayerKey === state.activeCharacterKey;
        const isMyGmNpcTurn = isGm && state.fighters.npcs[state.activeCharacterKey];

        if (activeFighter && (isMyPlayerTurn || isMyGmNpcTurn)) {
            const canAct = state.phase === 'battle';
            const hasActed = activeFighter.hasActed;
            actionButtonsWrapper.innerHTML = `
                <button class="action-btn" data-action="attack" ${(!canAct || hasActed) ? 'disabled' : ''}>Atacar</button>
                <button class="end-turn-btn" data-action="end_turn" ${!canAct ? 'disabled' : ''}>Passar Turno</button>
            `;
        }
    }
    
    function getFighter(state, key) { return state.fighters.players[key] || state.fighters.npcs[key]; }

    function createFighterElement(fighter, type, state, position) {
        const container = document.createElement('div');
        // Adiciona classe genérica para facilitar a seleção de alvos
        container.className = `char-container ${type}-char-container`;
        container.id = fighter.id;
        container.dataset.key = fighter.id;
        Object.assign(container.style, position);
        let statusClass = '';
        if (fighter.status === 'down') { statusClass = (type === 'player') ? 'defeated-player' : 'defeated-npc'; } 
        else if (state.activeCharacterKey === fighter.id) { statusClass = 'active-turn'; }
        
        // Define se o personagem é "alvejável"
        const activeFighter = getFighter(state, state.activeCharacterKey);
        if (activeFighter) {
            const isActiveFighterPlayer = !!state.fighters.players[activeFighter.id];
            const isThisFighterPlayer = type === 'player';
            // Se o ativo for jogador, os alvos são NPCs. Se o ativo for NPC, os alvos são jogadores.
            if (isActiveFighterPlayer !== isThisFighterPlayer && fighter.status === 'active') {
                container.classList.add('targetable');
            }
        }
        
        if (statusClass) { container.classList.add(statusClass); }
        
        // --- MODIFICAÇÃO: Adiciona eventos de mouse para o efeito de hover ---
        container.addEventListener('mouseenter', () => {
            if (isTargeting && container.classList.contains('targetable')) {
                container.classList.add('target-hover');
            }
        });
        container.addEventListener('mouseleave', () => {
            container.classList.remove('target-hover');
        });

        const healthPercentage = (fighter.hp / fighter.hpMax) * 100;
        container.innerHTML = `<div class="health-bar-ingame">...</div><img ...><div ...></div>`; // Conteúdo como na BETA
        return container;
    }

    socket.on('assignRole', (data) => { /* ... */ });

    // --- CORREÇÃO: Nome da classe de animação de ataque corrigido ---
    socket.on('triggerAttackAnimation', ({ attackerKey }) => { 
        const el = document.getElementById(attackerKey);
        if (el) { 
            const isPlayer = el.classList.contains('player-char-container');
            const animationClass = isPlayer ? 'is-attacking-player' : 'is-attacking-npc';
            el.classList.add(animationClass); 
            setTimeout(() => el.classList.remove(animationClass), 500);
        }
    });
    socket.on('triggerHitAnimation', ({ defenderKey }) => { 
        const el = document.getElementById(defenderKey);
        if (el) { el.classList.add('is-hit-flash'); setTimeout(() => el.classList.remove('is-hit-flash'), 500); }
    });
    
    socket.on('error', (err) => { /* ... */ });
    
    initialize();
    
    function scaleGame() { /* ... */ }
    window.addEventListener('resize', scaleGame);
    scaleGame();
});