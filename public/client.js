// client.js

document.addEventListener('DOMContentLoaded', () => {
    let myRole = null;
    let myPlayerKey = null;
    let isGm = false;
    let currentGameState = null;
    let currentRoomId = new URLSearchParams(window.location.search).get('room');
    const socket = io();

    let isTargeting = false;
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

    function showScreen(screenToShow) { allScreens.forEach(screen => screen.classList.toggle('active', screen === screenToShow)); }

    function handleActionClick(event) {
        if (!currentGameState || currentGameState.phase !== 'battle') return;
        const activeFighterKey = currentGameState.activeCharacterKey;
        const myFighter = currentGameState.fighters.players[myPlayerKey];
        const canControl = (myFighter && myFighter.id === activeFighterKey) || (isGm && currentGameState.fighters.npcs[activeFighterKey]);
        if (!canControl) return;
        const target = event.target.closest('button'); 
        if (!target || target.disabled) return;
        const action = target.dataset.action;
        if (action === 'attack') {
            isTargeting = true;
            targetingAttackerKey = activeFighterKey;
            document.getElementById('targeting-indicator').classList.remove('hidden');
            // CORREÇÃO: Destaca alvos corretos (jogadores se NPC ataca, NPCs se jogador ataca)
            const isNpcTurn = !!currentGameState.fighters.npcs[activeFighterKey];
            const targetSelector = isNpcTurn ? '.player-char-container.targetable' : '.npc-char-container.targetable';
            document.querySelectorAll(targetSelector).forEach(el => el.classList.add('is-targeting'));
        } else if (action === 'end_turn') {
            socket.emit('playerAction', { type: 'end_turn', actorKey: activeFighterKey });
        }
    }

    function handleTargetClick(event) {
        if (!isTargeting || !targetingAttackerKey) return;
        // CORREÇÃO: Usa uma classe genérica para encontrar o alvo
        const targetContainer = event.target.closest('.char-container');
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
        targetingAttackerKey = null;
        document.getElementById('targeting-indicator').classList.add('hidden');
        document.querySelectorAll('.char-container.is-targeting').forEach(el => el.classList.remove('is-targeting'));
    }

    function toggleCoordsMode() { /* ... */ }
    function updateCoordsDisplay(event) { /* ... */ }

    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        currentRoomId = urlParams.get('room');
        const roleFromUrl = urlParams.get('role');
        if (currentRoomId && roleFromUrl) {
            socket.emit('playerJoinsLobby', { roomId: currentRoomId, role: roleFromUrl });
            showScreen(playerWaitingScreen); 
        } else {
            socket.emit('gmCreatesLobby');
        }
        document.body.addEventListener('contextmenu', (e) => { if (isTargeting) { e.preventDefault(); cancelTargeting(); } });
        document.body.addEventListener('keydown', (e) => {
            if (isTargeting && e.key === "Escape") { cancelTargeting(); }
            if (isGm && e.key.toLowerCase() === 'f') { e.preventDefault(); toggleCoordsMode(); }
        });
        actionButtonsWrapper.addEventListener('click', handleActionClick);
    }

    function onConfirmSelection() { /* ... */ }
    function renderPlayerCharacterSelection(unavailable = []) { /* ... */ }

    socket.on('gameUpdate', (gameState) => {
        const oldPhase = currentGameState ? currentGameState.phase : null;
        currentGameState = gameState;
        const initiativeUI = document.getElementById('initiative-ui');
        if(initiativeUI) initiativeUI.classList.add('hidden');

        if (isGm) {
            if (gameState.mode === 'lobby') { showScreen(gmInitialLobby); updateGmLobbyUI(gameState); }
            else if (gameState.mode === 'adventure') {
                 switch (gameState.phase) {
                    case 'party_setup': showScreen(gmPartySetupScreen); updateGmPartySetupScreen(gameState); break;
                    case 'npc_setup': showScreen(gmNpcSetupScreen); if (oldPhase !== 'npc_setup') renderNpcSelectionForGm(); break;
                    case 'initiative_roll': showScreen(fightScreen); updateUI(gameState); renderInitiativeUI(gameState); break;
                    case 'battle': case 'gameover': showScreen(fightScreen); updateUI(gameState); break;
                }
            }
        } else { 
            if (gameState.mode === 'lobby') {
                const myPlayerData = gameState.connectedPlayers[socket.id];
                if (myRole === 'player' && myPlayerData && !myPlayerData.selectedCharacter) {
                    showScreen(selectionScreen); renderPlayerCharacterSelection(gameState.unavailableCharacters);
                } else {
                    showScreen(playerWaitingScreen); document.getElementById('player-waiting-message').innerText = "Aguardando o Mestre iniciar...";
                }
            } else if (gameState.mode === 'adventure') {
                if (['party_setup', 'npc_setup'].includes(gameState.phase)) {
                    showScreen(playerWaitingScreen); document.getElementById('player-waiting-message').innerText = "O Mestre está preparando a aventura...";
                } else if (gameState.phase === 'initiative_roll') {
                    showScreen(fightScreen); updateUI(gameState); renderInitiativeUI(gameState);
                } else {
                    showScreen(fightScreen); updateUI(gameState);
                }
            }
        }
    });

    socket.on('roomCreated', (roomId) => { /* ... */ });
    
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
        const activeFighter = getFighter(state, state.activeCharacterKey);
        const isMyPlayerTurn = myPlayerKey === state.activeCharacterKey;
        const isMyGmNpcTurn = isGm && state.fighters.npcs[state.activeCharacterKey];
        if (activeFighter && (isMyPlayerTurn || isMyGmNpcTurn)) {
            const canAct = state.phase === 'battle';
            const hasActed = activeFighter.hasActed;
            actionButtonsWrapper.innerHTML = `<button class="action-btn" data-action="attack" ${(!canAct || hasActed) ? 'disabled' : ''}>Atacar</button><button class="end-turn-btn" data-action="end_turn" ${!canAct ? 'disabled' : ''}>Passar Turno</button>`;
        }
    }
    
    function getFighter(state, key) { return state.fighters.players[key] || state.fighters.npcs[key]; }

    function createFighterElement(fighter, type, state, position) {
        const container = document.createElement('div');
        container.className = `char-container ${type}-char-container`;
        container.id = fighter.id;
        container.dataset.key = fighter.id;
        Object.assign(container.style, position);
        let statusClass = '';
        if (fighter.status === 'down') { statusClass = (type === 'player') ? 'defeated-player' : 'defeated-npc'; } 
        else if (state.activeCharacterKey === fighter.id) { statusClass = 'active-turn'; }
        
        const activeFighter = getFighter(state, state.activeCharacterKey);
        if (activeFighter) {
            const isActiveFighterPlayer = !!state.fighters.players[activeFighter.id];
            const isThisFighterPlayer = type === 'player';
            if (isActiveFighterPlayer !== isThisFighterPlayer && fighter.status === 'active') { container.classList.add('targetable'); }
        }
        
        if (statusClass) { container.classList.add(statusClass); }
        
        container.addEventListener('mouseenter', () => { if (isTargeting && container.classList.contains('targetable')) { container.classList.add('target-hover'); } });
        container.addEventListener('mouseleave', () => { container.classList.remove('target-hover'); });
        
        // CORREÇÃO: Adicionado listener de clique aqui para o ataque do GM
        if(container.classList.contains('targetable')) {
             container.addEventListener('click', handleTargetClick);
        }

        const healthPercentage = (fighter.hp / fighter.hpMax) * 100;
        container.innerHTML = `<div class="health-bar-ingame">...</div><img ...>...`; // Conteúdo como na BETA
        return container;
    }

    socket.on('assignRole', (data) => { /* ... */ });

    // CORREÇÃO: Usando a classe de animação correta
    socket.on('triggerAttackAnimation', ({ attackerKey }) => { 
        const el = document.getElementById(attackerKey);
        if (el) { 
            const isPlayer = el.classList.contains('player-char-container');
            // A classe 'is-attacking-lunge' já existe e faz o movimento genérico
            el.classList.add(isPlayer ? 'is-attacking-player' : 'is-attacking-npc'); 
            setTimeout(() => el.classList.remove(isPlayer ? 'is-attacking-player' : 'is-attacking-npc'), 500);
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