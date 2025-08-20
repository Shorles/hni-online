// client.js

document.addEventListener('DOMContentLoaded', () => {
    // --- VARIÁVEIS DE ESTADO GLOBAIS ---
    let myRole = null;
    let myPlayerKey = null;
    let isGm = false;
    let currentGameState = null;
    const socket = io();
    let myRoomId = null;

    // --- DADOS DO JOGO (CARREGADOS DO SERVIDOR) ---
    let PLAYABLE_TOKENS = [];
    let DYNAMIC_CHARACTERS = [];
    let ALL_NPCS = {};
    let ALL_SCENARIOS = {};
    let GAME_DATA = {};
    
    let isDataInitialized = false;
    let isRoleAssigned = false;

    // --- ESTADO LOCAL DO CLIENTE ---
    let characterSheetInProgress = {};
    let stagedNpcs = [];
    let selectedStagedNpcId = null;

    // --- ESTADO DO MODO CENÁRIO ---
    let localWorldScale = 1.0;
    let selectedTokens = new Set();
    let isPanning = false;
    let isDragging = false;
    let isGroupSelectMode = false;
    let isSelectingBox = false;
    let dragStartPos = { x: 0, y: 0 };
    let selectionBoxStartPos = { x: 0, y: 0 };
    let dragOffsets = new Map();
    let hoveredTokenId = null;

    // --- ELEMENTOS DO DOM ---
    const allScreens = document.querySelectorAll('.screen');
    const gameWrapper = document.getElementById('game-wrapper');
    // ... (outros elementos do DOM)

    // --- FUNÇÕES DE UTILIDADE ---
    function scaleGame() {
        setTimeout(() => {
            const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
            gameWrapper.style.transform = `scale(${scale})`;
            gameWrapper.style.left = `${(window.innerWidth - (1280 * scale)) / 2}px`;
            gameWrapper.style.top = `${(window.innerHeight - (720 * scale)) / 2}px`;
        }, 10);
    }
    
    function getGameScale() {
        const transform = window.getComputedStyle(gameWrapper).transform;
        if (transform === 'none') return 1;
        return new DOMMatrix(transform).a;
    }

    function showScreen(screenId) {
        allScreens.forEach(screen => screen.classList.toggle('active', screen.id === screenId));
        // CORREÇÃO DEFINITIVA: Reatribui os listeners toda vez que uma tela é mostrada
        setupEventListeners(screenId);
    }

    function showInfoModal(title, text, showButton = true) { /* ... (Mantida) ... */ }
    function showConfirmationModal(title, text, onConfirm, confirmText = 'Sim', cancelText = 'Não') { /* ... (Mantida) ... */ }
    function copyToClipboard(text, element) { /* ... (Mantida) ... */ }

    // --- FLUXO PRINCIPAL DE RENDERIZAÇÃO ---
    function renderGame(state) {
        if (!isDataInitialized || !isRoleAssigned) {
            currentGameState = state;
            return;
        }

        currentGameState = state;
        if (!state) return;

        const myPlayerData = state.connectedPlayers?.[socket.id];

        const isPlayerReady = myPlayerData?.sheet?.status === 'ready';
        document.getElementById('player-sheet-button').classList.toggle('hidden', !isPlayerReady);
        document.getElementById('floating-buttons-container').classList.toggle('hidden', !isGm);
        document.getElementById('back-to-lobby-btn').classList.toggle('hidden', !isGm || state.mode === 'lobby');

        if (isGm) renderGmView(state);
        else if (myRole === 'player') renderPlayerView(state, myPlayerData);
        else renderSpectatorView(state);
    }

    // --- RENDERIZAÇÃO DAS VISÕES ---
    function renderGmView(state) {
        switch (state.mode) {
            case 'lobby': showScreen('gm-initial-lobby'); updateGmLobbyUI(state); break;
            case 'adventure':
                if (state.phase === 'npc_setup') { showScreen('gm-npc-setup-screen'); renderGmNpcSetup(); } 
                else { showScreen('fight-screen'); /* renderFightUI(state); */ }
                break;
            case 'theater': renderTheaterUI(state); break;
        }
    }

    function renderPlayerView(state, myData) {
        if (!myData || !myData.sheet) {
             showScreen('loading-screen');
             return;
        };
        switch(myData.sheet.status) {
            case 'creating_sheet': showScreen('character-entry-screen'); return;
            case 'selecting_token': showScreen('token-selection-screen'); renderTokenSelection(); return;
            case 'filling_sheet': showScreen('sheet-creation-screen'); renderSheetCreationUI(); return;
            case 'ready': break;
        }
        switch(state.mode) {
            case 'lobby': showScreen('player-waiting-screen'); document.getElementById('player-waiting-message').textContent = "Personagem pronto! Aguardando o Mestre..."; break;
            case 'adventure': showScreen('fight-screen'); /* renderFightUI(state); */ break;
            case 'theater': renderTheaterUI(state); break;
        }
    }

    function renderSpectatorView(state) { /* ... (Mantida) ... */ }

    function updateGmLobbyUI(state) {
        // ... (resto da função mantida)
    }
    
    // --- LÓGICA DE CRIAÇÃO DE PERSONAGEM (FICHA COMPLETA) ---
    function startNewCharacter() {
        if (!currentGameState) return;
        const myData = currentGameState.connectedPlayers[socket.id];
        if (!myData) return;
        myData.sheet.status = 'selecting_token';
        characterSheetInProgress = JSON.parse(JSON.stringify(myData.sheet));
        renderGame(currentGameState);
    }

    function renderTokenSelection() { /* ... (implementação mantida) ... */ }
    function confirmTokenSelection() { /* ... (implementação mantida) ... */ }
    function renderSheetCreationUI() { /* ... (implementação mantida e funcional) ... */ }
    function finishSheetCreation() { /* ... (implementação mantida) ... */ }

    // --- LÓGICA DE UI DO GM ---
    function renderGmNpcSetup() { /* ... (implementação mantida) ... */ }

    // --- MODO CENÁRIO: LÓGICA RESTAURADA E INTEGRADA ---
    function renderTheaterUI(state) { /* ... (implementação mantida) ... */ }
    function renderGmTheaterPanel() { /* ... (implementação mantida) ... */ }
    function renderPlayerTheaterControls(state) { /* ... (implementação mantida) ... */ }
    function setupTheaterEventListeners() { /* ... (implementação mantida) ... */ }
    function initializeGlobalKeyListeners() { /* ... (implementação mantida) ... */ }
    function showScenarioSelectionModal() { /* ... (implementação mantida) ... */ }

    // --- INICIALIZAÇÃO E LISTENERS DE SOCKET ---
    socket.on('initialData', (data) => {
        PLAYABLE_TOKENS = data.playableTokens;
        DYNAMIC_CHARACTERS = data.dynamicCharacters;
        GAME_DATA = data.gameData;
        ALL_NPCS = data.npcs;
        ALL_SCENARIOS = data.scenarios;
        isDataInitialized = true;
        
        if (isRoleAssigned) {
            renderGame(currentGameState);
        }
    });

    socket.on('assignRole', (data) => {
        myRole = data.role; 
        isGm = !!data.isGm; 
        myRoomId = data.roomId;
        isRoleAssigned = true;
        
        if (isDataInitialized) {
            renderGame(currentGameState);
        }
    });
    
    socket.on('gameUpdate', (gameState) => {
        currentGameState = gameState;
        renderGame(gameState);
    });

    socket.on('roomCreated', (roomId) => { 
        myRoomId = roomId; 
        myRole = 'gm';
        isGm = true;
        isRoleAssigned = true;
        renderGame(currentGameState);
    });
    
    socket.on('promptForRole', ({ isFull }) => {
        showScreen('role-selection-screen');
        document.getElementById('join-as-player-btn').disabled = isFull;
        document.getElementById('room-full-message').classList.toggle('hidden', !isFull);
    });
    
    socket.on('promptForAdventureType', () => { /* ... */ });
    socket.on('error', (data) => showInfoModal('Erro', data.message));
    
    // CORREÇÃO DEFINITIVA: Centraliza e reatribui listeners de botões
    function setupEventListeners(activeScreenId) {
        // Remove listeners antigos para evitar duplicação (boa prática)
        const oldWrapper = document.getElementById('game-wrapper');
        const newWrapper = oldWrapper.cloneNode(true);
        oldWrapper.parentNode.replaceChild(newWrapper, oldWrapper);

        // Listeners que devem funcionar em qualquer tela
        document.getElementById('floating-switch-mode-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmSwitchesMode' }));
        document.getElementById('floating-invite-btn').addEventListener('click', () => {
             if (myRoomId) {
                const inviteUrl = `${window.location.origin}?room=${myRoomId}`;
                copyToClipboard(inviteUrl, document.getElementById('floating-invite-btn'));
            }
        });
        document.getElementById('back-to-lobby-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmGoesBackToLobby' }));


        // Listeners específicos da tela ativa
        switch(activeScreenId) {
            case 'gm-initial-lobby':
                document.getElementById('start-adventure-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsAdventure' }));
                document.getElementById('start-theater-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsTheater' }));
                const inviteLinkEl = document.getElementById('gm-link-invite');
                if (myRoomId) {
                    const inviteUrl = `${window.location.origin}?room=${myRoomId}`;
                    inviteLinkEl.textContent = inviteUrl;
                    inviteLinkEl.onclick = () => copyToClipboard(inviteUrl, inviteLinkEl);
                }
                break;
            case 'role-selection-screen':
                document.getElementById('join-as-player-btn').addEventListener('click', () => { showScreen('loading-screen'); socket.emit('playerChoosesRole', { role: 'player' }); });
                document.getElementById('join-as-spectator-btn').addEventListener('click', () => { showScreen('loading-screen'); socket.emit('playerChoosesRole', { role: 'spectator' }); });
                break;
            case 'character-entry-screen':
                document.getElementById('new-char-btn').addEventListener('click', startNewCharacter);
                document.getElementById('load-char-btn').addEventListener('click', () => document.getElementById('load-char-input').click());
                document.getElementById('load-char-input').addEventListener('change', (e) => loadCharacterFromFile(e.target.files[0]));
                break;
            case 'token-selection-screen':
                document.getElementById('confirm-token-btn').addEventListener('click', confirmTokenSelection);
                break;
            case 'sheet-creation-screen':
                document.getElementById('finish-sheet-btn').addEventListener('click', finishSheetCreation);
                // O listener de salvar precisa ser implementado com a lógica de coletar dados da ficha
                break;
        }
    }

    function initialize() {
        showScreen('loading-screen');
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoomId = urlParams.get('room');
        
        if (urlRoomId) {
            socket.emit('playerJoinsLobby', { roomId: urlRoomId });
        } else {
            socket.emit('gmCreatesLobby');
        }

        setupTheaterEventListeners();
        initializeGlobalKeyListeners();
        window.addEventListener('resize', scaleGame);
        scaleGame();
    }
    
    initialize();
});