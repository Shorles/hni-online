// client.js

document.addEventListener('DOMContentLoaded', () => {
    let myRole = null;
    let myPlayerKey = null;
    let isGm = false;
    let currentGameState = null;
    let currentRoomId = new URLSearchParams(window.location.search).get('room');
    const socket = io();

    let isTargeting = false;
    // --- MODIFICAÇÃO: Variável para controlar o modo de coordenadas
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
    // --- MODIFICAÇÃO: Elemento para mostrar as coordenadas
    const coordsDisplay = document.getElementById('coords-display');


    socket.on('availableFighters', ({ p1, playable }) => {
        ALL_FIGHTERS_DATA = p1 || {};
        PLAYABLE_CHARACTERS_DATA = playable || [];
    });

    function showScreen(screenToShow) {
        allScreens.forEach(screen => {
            screen.classList.toggle('active', screen === screenToShow);
        });
    }

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
    
    function cancelTargeting() {
        isTargeting = false;
        document.getElementById('targeting-indicator').classList.add('hidden');
        document.querySelectorAll('.npc-char-container.is-targeting').forEach(el => el.classList.remove('is-targeting'));
    }

    // --- MODIFICAÇÃO: Função para o modo de coordenadas
    function toggleCoordsMode() {
        coordsModeActive = !coordsModeActive;
        coordsDisplay.classList.toggle('hidden', !coordsModeActive);

        if (coordsModeActive) {
            document.addEventListener('mousemove', updateCoordsDisplay);
        } else {
            document.removeEventListener('mousemove', updateCoordsDisplay);
        }
    }

    function updateCoordsDisplay(event) {
        const gameWrapper = document.getElementById('game-wrapper');
        const rect = gameWrapper.getBoundingClientRect();
        
        // Calcula a escala atual do wrapper
        const transform = window.getComputedStyle(gameWrapper).transform;
        const scale = transform === 'none' ? 1 : new DOMMatrix(transform).a;

        // Calcula as coordenadas relativas ao wrapper, ajustando pela escala
        const x = Math.round((event.clientX - rect.left) / scale);
        const y = Math.round((event.clientY - rect.top) / scale);

        coordsDisplay.textContent = `X: ${x}, Y: ${y}`;
    }


    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        currentRoomId = urlParams.get('room');
        const roleFromUrl = urlParams.get('role');

        if (currentRoomId && roleFromUrl) {
            socket.emit('playerJoinsLobby', { roomId: currentRoomId, role: roleFromUrl });
            if (roleFromUrl === 'player') {
                showScreen(selectionScreen);
            } else {
                showScreen(playerWaitingScreen);
            }
        } else {
            socket.emit('gmCreatesLobby');
        }
        
        confirmBtn.addEventListener('click', onConfirmSelection);
        
        document.getElementById('start-adventure-btn').onclick = () => {
            socket.emit('playerAction', { type: 'gmStartsAdventure' });
        };
        
        document.getElementById('gm-confirm-party-btn').onclick = () => {
            // ... (código existente, permanece o mesmo)
        };

        document.getElementById('gm-start-battle-btn').onclick = () => {
            // ... (código existente, permanece o mesmo)
        };

        document.body.addEventListener('contextmenu', (e) => { if (isTargeting) { e.preventDefault(); cancelTargeting(); } });
        document.body.addEventListener('keydown', (e) => {
            if (isTargeting && e.key === "Escape") { cancelTargeting(); }
            // --- MODIFICAÇÃO: Atalho para o modo de coordenadas
            if (isGm && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                toggleCoordsMode();
            }
        });
        
        actionButtonsWrapper.addEventListener('click', handleActionClick);
    }

    function onConfirmSelection() {
       // ... (código existente, permanece o mesmo)
    }

    function renderPlayerCharacterSelection(unavailable = []) {
        // ... (código existente, permanece o mesmo)
    }

    socket.on('gameUpdate', (gameState) => {
        // ... (código existente, permanece o mesmo)
    });

    // --- CORREÇÃO: A lógica de criação de link foi movida para dentro do 'roomCreated'
    socket.on('roomCreated', (roomId) => {
        currentRoomId = roomId;
        if (isGm) {
            const baseUrl = window.location.origin;
            const playerUrl = `${baseUrl}?room=${roomId}&role=player`;
            const spectatorUrl = `${baseUrl}?room=${roomId}&role=spectator`;

            const playerLinkEl = document.getElementById('gm-link-player');
            const spectatorLinkEl = document.getElementById('gm-link-spectator');

            playerLinkEl.textContent = playerUrl;
            spectatorLinkEl.textContent = spectatorUrl;
            
            playerLinkEl.onclick = () => copyToClipboard(playerUrl, playerLinkEl);
            spectatorLinkEl.onclick = () => copyToClipboard(spectatorUrl, spectatorLinkEl);
            
            showScreen(gmInitialLobby);
        }
    });
    
    function copyToClipboard(text, element) {
        navigator.clipboard.writeText(text).then(() => {
            const originalText = element.textContent;
            element.textContent = 'Copiado!';
            setTimeout(() => { element.textContent = originalText; }, 2000);
        });
    }

    function updateGmLobbyUI(state) {
        // ... (código existente, permanece o mesmo)
    }
    
    function updateGmPartySetupScreen(state) {
        // ... (código existente, permanece o mesmo)
    }

    function renderNpcSelectionForGm() {
       // ... (código existente, permanece o mesmo)
    }

    function updateUI(state) {
       // ... (código existente, permanece o mesmo)
    }

    function createFighterElement(fighter, type, state, position) {
       // ... (código existente, permanece o mesmo)
    }

    socket.on('assignRole', (data) => {
        myRole = data.role;
        myPlayerKey = data.playerKey || null;
        isGm = data.isGm || myRole === 'gm';
    });

    socket.on('triggerAttackAnimation', ({ attackerKey }) => { 
        // ... (código existente, permanece o mesmo)
    });
    socket.on('triggerHitAnimation', ({ defenderKey }) => { 
        // ... (código existente, permanece o mesmo)
    });
    
    socket.on('error', (err) => { 
        // ... (código existente, permanece o mesmo)
     });
    
    initialize();
    
    function scaleGame() {
        // ... (código existente, permanece o mesmo)
    }
    window.addEventListener('resize', scaleGame);
    scaleGame();
});