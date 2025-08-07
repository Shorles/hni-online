// client.js

document.addEventListener('DOMContentLoaded', () => {
    let myRole = null;
    let myPlayerKey = null;
    let isGm = false;
    let currentGameState = null;
    let currentRoomId = new URLSearchParams(window.location.search).get('room');
    const socket = io();

    let isTargeting = false;
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

    function showScreen(screenToShow) { /* ... (igual à BETA) ... */ }
    function handleActionClick(event) {
        if (!myPlayerKey || !currentGameState || currentGameState.phase !== 'battle') return;
        const myFighter = currentGameState.fighters.players[myPlayerKey];
        if (!myFighter || myFighter.id !== currentGameState.activeCharacterKey) return;
        const target = event.target.closest('button'); 
        if (!target || target.disabled) return;
        const action = target.dataset.action;
        if (action === 'attack') {
            isTargeting = true;
            document.getElementById('targeting-indicator').classList.remove('hidden');
            document.querySelectorAll('.npc-char-container.targetable').forEach(el => el.classList.add('is-targeting'));
        } else if (action === 'end_turn') {
            socket.emit('playerAction', { type: 'end_turn' });
        }
    }
    function handleTargetClick(event) {
        if (!isTargeting) return;
        const targetContainer = event.target.closest('.npc-char-container');
        if (!targetContainer || !targetContainer.classList.contains('targetable')) return;
        const targetKey = targetContainer.dataset.key;
        socket.emit('playerAction', { type: 'attack', targetKey: targetKey });
        cancelTargeting();
    }
    function cancelTargeting() { /* ... (igual à BETA) ... */ }
    function toggleCoordsMode() { /* ... (igual à BETA) ... */ }
    function updateCoordsDisplay(event) { /* ... (igual à BETA) ... */ }
    function initialize() { /* ... (igual à BETA) ... */ }
    function onConfirmSelection() { /* ... (igual à BETA) ... */ }
    function renderPlayerCharacterSelection(unavailable = []) { /* ... (igual à BETA) ... */ }

    socket.on('gameUpdate', (gameState) => {
        const oldPhase = currentGameState ? currentGameState.phase : null;
        currentGameState = gameState;
        
        document.getElementById('initiative-ui').classList.add('hidden');

        if (isGm) {
            if (gameState.mode === 'lobby') {
                showScreen(gmInitialLobby);
                updateGmLobbyUI(gameState);
            } else if (gameState.mode === 'adventure') {
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

    socket.on('roomCreated', (roomId) => { /* ... (igual à BETA) ... */ });
    function copyToClipboard(text, element) { /* ... (igual à BETA) ... */ }
    function updateGmLobbyUI(state) { /* ... (igual à BETA) ... */ }
    function updateGmPartySetupScreen(state) { /* ... (igual à BETA) ... */ }
    function renderNpcSelectionForGm() { /* ... (igual à BETA) ... */ }
    function renderInitiativeUI(state) { /* ... (igual à BETA) ... */ }
    function updateTurnOrderUI(state) { /* ... (igual à BETA) ... */ }

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
            if (el.classList.contains('targetable')) {
                el.addEventListener('click', handleTargetClick);
            }
        });

        if (state.phase === 'gameover') {
            roundInfoEl.innerHTML = `<span class="turn-highlight">FIM DE JOGO!</span><br>${state.reason}`;
        } else if (state.phase === 'initiative_roll') {
            roundInfoEl.innerHTML = `ROUND ${state.currentRound} - Iniciativa`;
        } else if (state.activeCharacterKey) {
            const activeFighter = getFighter(state, state.activeCharacterKey);
            if (activeFighter) {
                roundInfoEl.innerHTML = `ROUND ${state.currentRound} - Vez de: <span class="turn-highlight">${activeFighter.nome}</span>`;
            }
        }
        
        fightLog.innerHTML = state.log.map(msg => `<p class="${msg.className || ''}">${msg.text}</p>`).join('');
        fightLog.scrollTop = fightLog.scrollHeight;
        
        actionButtonsWrapper.innerHTML = '';
        if (myPlayerKey && state.fighters.players[myPlayerKey] && state.fighters.players[myPlayerKey].status === 'active') {
            const myFighter = state.fighters.players[myPlayerKey];
            const myTurn = myPlayerKey === state.activeCharacterKey;
            const canAct = myTurn && state.phase === 'battle';
            
            // --- MODIFICAÇÃO: Lógica para desabilitar o botão de ataque ---
            const hasActed = myFighter.hasActed;
            actionButtonsWrapper.innerHTML = `
                <button class="action-btn" data-action="attack" ${(!canAct || hasActed) ? 'disabled' : ''}>Atacar</button>
                <button class="end-turn-btn" data-action="end_turn" ${!canAct ? 'disabled' : ''}>Passar Turno</button>
            `;
        }
    }
    
    function getFighter(state, key) { /* ... (igual à BETA) ... */ }
    function createFighterElement(fighter, type, state, position) {
        const container = document.createElement('div');
        container.className = `${type}-char-container`;
        container.id = fighter.id;
        container.dataset.key = fighter.id;
        Object.assign(container.style, position);
        let statusClass = '';
        if (fighter.status === 'down') {
            statusClass = (type === 'player') ? 'defeated-player' : 'defeated-npc';
        } else if (state.activeCharacterKey === fighter.id) {
            statusClass = 'active-turn';
        }
        if (type === 'npc' && fighter.status === 'active') container.classList.add('targetable');
        if (statusClass) {
            container.classList.add(statusClass);
        }
        const healthPercentage = (fighter.hp / fighter.hpMax) * 100;
        container.innerHTML = `<div class="health-bar-ingame"><div class="health-bar-ingame-fill" style="width: ${healthPercentage}%"></div><span class="health-bar-ingame-text">${fighter.hp}/${fighter.hpMax}</span></div><img src="${fighter.img}" class="fighter-img-ingame"><div class="fighter-name-ingame">${fighter.nome}</div>`;
        return container;
    }

    socket.on('assignRole', (data) => { /* ... (igual à BETA) ... */ });

    // --- MODIFICAÇÃO: Animações usam classes específicas para direção ---
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
    
    socket.on('error', (err) => { /* ... (igual à BETA) ... */ });
    
    initialize();
    
    function scaleGame() { /* ... (igual à BETA) ... */ }
    window.addEventListener('resize', scaleGame);
    scaleGame();
});