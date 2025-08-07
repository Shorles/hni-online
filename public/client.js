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
    // --- MODIFICAÇÃO: Elemento para a barra de ordem de turno ---
    const turnOrderSidebar = document.getElementById('turn-order-sidebar');


    socket.on('availableFighters', ({ p1, playable }) => {
        ALL_FIGHTERS_DATA = p1 || {};
        PLAYABLE_CHARACTERS_DATA = playable || [];
    });

    function showScreen(screenToShow) { /* ... (sem alterações) */ }
    function handleActionClick(event) { /* ... (sem alterações) */ }
    function handleTargetClick(event) { /* ... (sem alterações) */ }
    function cancelTargeting() { /* ... (sem alterações) */ }
    function toggleCoordsMode() { /* ... (sem alterações) */ }
    function updateCoordsDisplay(event) { /* ... (sem alterações) */ }

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
        
        confirmBtn.addEventListener('click', onConfirmSelection);
        
        document.getElementById('start-adventure-btn').onclick = () => { /* ... (sem alterações) */ };
        document.getElementById('gm-confirm-party-btn').onclick = () => { /* ... (sem alterações) */ };
        document.getElementById('gm-start-battle-btn').onclick = () => { /* ... (sem alterações) */ };

        document.body.addEventListener('contextmenu', (e) => { /* ... (sem alterações) */ });
        document.body.addEventListener('keydown', (e) => {
            if (isTargeting && e.key === "Escape") { cancelTargeting(); }
            if (isGm && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                toggleCoordsMode();
            }
        });
        
        actionButtonsWrapper.addEventListener('click', handleActionClick);
    }

    function onConfirmSelection() { /* ... (sem alterações) */ }
    function renderPlayerCharacterSelection(unavailable = []) { /* ... (sem alterações) */ }

    socket.on('gameUpdate', (gameState) => {
        const oldPhase = currentGameState ? currentGameState.phase : null;
        currentGameState = gameState;
        
        // Esconde a UI de iniciativa por padrão
        document.getElementById('initiative-ui').classList.add('hidden');

        if (isGm) {
            if (gameState.mode === 'lobby') {
                showScreen(gmInitialLobby);
                updateGmLobbyUI(gameState);
            } else if (gameState.mode === 'adventure') {
                 switch (gameState.phase) {
                    case 'party_setup': /* ... (sem alterações) */ break;
                    case 'npc_setup': /* ... (sem alterações) */ break;
                    
                    // --- MODIFICAÇÃO: Nova fase de iniciativa ---
                    case 'initiative_roll':
                        showScreen(fightScreen);
                        updateUI(gameState); // Desenha os personagens
                        renderInitiativeUI(gameState); // Mostra os botões de rolar
                        break;
                    
                    case 'battle':
                    case 'gameover':
                        showScreen(fightScreen);
                        updateUI(gameState);
                        break;
                }
            }
        } else { // Player & Spectator
            if (gameState.mode === 'lobby') { /* ... (sem alterações) */ }
            else if (gameState.mode === 'adventure') {
                if (['party_setup', 'npc_setup'].includes(gameState.phase)) {
                    showScreen(playerWaitingScreen);
                    document.getElementById('player-waiting-message').innerText = "O Mestre está preparando a aventura...";
                } else if (gameState.phase === 'initiative_roll') {
                    showScreen(fightScreen);
                    updateUI(gameState);
                    renderInitiativeUI(gameState);
                } else {
                    showScreen(fightScreen);
                    updateUI(gameState);
                }
            }
        }
    });

    socket.on('roomCreated', (roomId) => { /* ... (sem alterações) */ });
    function copyToClipboard(text, element) { /* ... (sem alterações) */ }
    function updateGmLobbyUI(state) { /* ... (sem alterações) */ }
    function updateGmPartySetupScreen(state) { /* ... (sem alterações) */ }
    function renderNpcSelectionForGm() { /* ... (sem alterações) */ }
    
    // --- MODIFICAÇÃO: Nova função para renderizar a UI de iniciativa ---
    function renderInitiativeUI(state) {
        const initiativeUI = document.getElementById('initiative-ui');
        initiativeUI.classList.remove('hidden');
        
        const playerRollBtn = document.getElementById('player-roll-initiative-btn');
        const gmRollBtn = document.getElementById('gm-roll-initiative-btn');

        // Lógica para o botão do jogador
        if (myRole === 'player' && state.fighters.players[myPlayerKey] && !state.initiativeRolls[myPlayerKey]) {
            playerRollBtn.classList.remove('hidden');
            playerRollBtn.disabled = false;
            playerRollBtn.onclick = () => {
                playerRollBtn.disabled = true;
                socket.emit('playerAction', { type: 'roll_initiative' });
            };
        } else {
            playerRollBtn.classList.add('hidden');
        }

        // Lógica para o botão do GM
        if (isGm) {
            const npcsNeedToRoll = Object.values(state.fighters.npcs).some(npc => !state.initiativeRolls[npc.id]);
            if (npcsNeedToRoll) {
                gmRollBtn.classList.remove('hidden');
                gmRollBtn.disabled = false;
                gmRollBtn.onclick = () => {
                    gmRollBtn.disabled = true;
                    socket.emit('playerAction', { type: 'roll_initiative', isGmRoll: true });
                };
            } else {
                gmRollBtn.classList.add('hidden');
            }
        } else {
            gmRollBtn.classList.add('hidden');
        }
    }

    // --- MODIFICAÇÃO: Nova função para atualizar a barra de ordem de turno ---
    function updateTurnOrderUI(state) {
        turnOrderSidebar.innerHTML = ''; // Limpa a barra
        if (state.phase !== 'battle') {
            turnOrderSidebar.classList.add('hidden');
            return;
        }
        turnOrderSidebar.classList.remove('hidden');

        state.turnOrder.forEach((charId, index) => {
            const fighter = getFighter(state, charId);
            if (!fighter) return;

            const turnEntry = document.createElement('div');
            turnEntry.className = 'turn-order-entry';
            
            // Destaca o personagem ativo
            if (index === 0) {
                turnEntry.classList.add('active-in-turn-order');
            }

            turnEntry.innerHTML = `<img src="${fighter.img}" alt="${fighter.nome}">`;
            turnOrderSidebar.appendChild(turnEntry);
        });
    }

    function updateUI(state) {
        if (!state || !state.fighters) return;
        
        fightSceneCharacters.innerHTML = '';
        updateTurnOrderUI(state);

        const PLAYER_POSITIONS = [ /* ... (sem alterações) */ ];
        const NPC_POSITIONS = [ /* ... (sem alterações) */ ];
        
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
            const myTurn = myPlayerKey === state.activeCharacterKey;
            const canAct = myTurn && state.phase === 'battle';
            actionButtonsWrapper.innerHTML = `
                <button class="action-btn" data-action="attack" ${!canAct ? 'disabled' : ''}>Atacar</button>
                <button class="end-turn-btn" data-action="end_turn" ${!canAct ? 'disabled' : ''}>Passar Turno</button>
            `;
        }
    }
    
    function getFighter(state, key) {
        return state.fighters.players[key] || state.fighters.npcs[key];
    }

    // --- MODIFICAÇÃO: createFighterElement aplica as novas classes de derrota ---
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
        container.innerHTML = `
            <div class="health-bar-ingame">
                <div class="health-bar-ingame-fill" style="width: ${healthPercentage}%"></div>
                <span class="health-bar-ingame-text">${fighter.hp}/${fighter.hpMax}</span>
            </div>
            <img src="${fighter.img}" class="fighter-img-ingame">
            <div class="fighter-name-ingame">${fighter.nome}</div>
        `;
        
        // --- MODIFICAÇÃO: Espelhamento removido ---
        // if(type === 'npc'){ container.querySelector('.fighter-img-ingame').style.transform = 'scaleX(-1)'; }
        
        return container;
    }

    socket.on('assignRole', (data) => { /* ... (sem alterações) */ });
    
    // --- MODIFICAÇÃO: Animações usam as novas classes ---
    socket.on('triggerAttackAnimation', ({ attackerKey }) => { 
        const el = document.getElementById(attackerKey);
        if (el) { el.classList.add(`is-attacking-lunge`); setTimeout(() => el.classList.remove(`is-attacking-lunge`), 500); }
    });
    socket.on('triggerHitAnimation', ({ defenderKey }) => { 
        const el = document.getElementById(defenderKey);
        if (el) { el.classList.add('is-hit-flash'); setTimeout(() => el.classList.remove('is-hit-flash'), 500); }
    });
    
    socket.on('error', (err) => { /* ... (sem alterações) */ });
    
    initialize();
    
    function scaleGame() { /* ... (sem alterações) */ }
    window.addEventListener('resize', scaleGame);
    scaleGame();
});