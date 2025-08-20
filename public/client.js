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
    
    // CORREÇÃO DEFINITIVA: State machine para controlar o fluxo de inicialização
    let clientFlowState = 'initializing'; // 'initializing' -> 'choosing_role' -> 'active'
    let isDataInitialized = false;

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
    const theaterBackgroundViewport = document.getElementById('theater-background-viewport');
    const theaterWorldContainer = document.getElementById('theater-world-container');
    const theaterBackgroundImage = document.getElementById('theater-background-image');
    const theaterTokenContainer = document.getElementById('theater-token-container');
    const selectionBox = document.getElementById('selection-box');
    const theaterGlobalScale = document.getElementById('theater-global-scale');

    // --- FUNÇÕES DE UTILIDADE ---
    function scaleGame() { /* ... (Mantida) ... */ }
    function getGameScale() { /* ... (Mantida) ... */ }
    function showScreen(screenId) { /* ... (Mantida) ... */ }
    function showInfoModal(title, text, showButton = true) { /* ... (Mantida) ... */ }
    function showConfirmationModal(title, text, onConfirm, confirmText = 'Sim', cancelText = 'Não') { /* ... (Mantida) ... */ }
    function copyToClipboard(text, element) { /* ... (Mantida) ... */ }

    // --- FLUXO PRINCIPAL DE RENDERIZAÇÃO ---
    function renderGame(state) {
        if (clientFlowState !== 'active' || !isDataInitialized) {
            currentGameState = state; // Armazena o estado para renderizar depois
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

    function renderSpectatorView(state) {
        let screen = 'player-waiting-screen';
        document.getElementById('player-waiting-message').textContent = "Assistindo... Aguardando o Mestre iniciar.";
        switch(state.mode) {
            case 'adventure': screen = 'fight-screen'; /* renderFightUI(state); */ break;
            case 'theater': screen = 'theater-screen'; renderTheaterUI(state); break;
        }
        showScreen(screen);
    }

    function updateGmLobbyUI(state) {
        const inviteLinkEl = document.getElementById('gm-link-invite');
        if(myRoomId && (inviteLinkEl.textContent === 'Gerando...' || !inviteLinkEl.textContent.includes(myRoomId))) {
            const inviteUrl = `${window.location.origin}?room=${myRoomId}`;
            inviteLinkEl.textContent = inviteUrl;
            inviteLinkEl.onclick = () => copyToClipboard(inviteUrl, inviteLinkEl);
        }
        
        // ... (resto da função mantida)
    }
    
    // --- LÓGICA DE CRIAÇÃO DE PERSONAGEM (FICHA COMPLETA) ---
    function startNewCharacter() { /* ... (implementação mantida) ... */ }
    function renderTokenSelection() { /* ... (implementação mantida) ... */ }
    function confirmTokenSelection() { /* ... (implementação mantida) ... */ }
    function renderSheetCreationUI() { /* ... (implementação mantida) ... */ }
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
        
        if (clientFlowState === 'active') {
            renderGame(currentGameState);
        }
    });

    socket.on('assignRole', (data) => {
        myRole = data.role; 
        isGm = !!data.isGm; 
        myRoomId = data.roomId;
        clientFlowState = 'active';

        if (isDataInitialized) {
            renderGame(currentGameState);
        }
    });
    
    socket.on('gameUpdate', (gameState) => {
        currentGameState = gameState; // Sempre atualiza o estado mais recente
        if (clientFlowState === 'active') {
            renderGame(gameState);
        }
    });

    socket.on('roomCreated', (roomId) => { myRoomId = roomId; });
    
    socket.on('promptForRole', ({ isFull }) => {
        clientFlowState = 'choosing_role';
        showScreen('role-selection-screen');
        document.getElementById('join-as-player-btn').disabled = isFull;
        document.getElementById('room-full-message').classList.toggle('hidden', !isFull);
    });
    
    socket.on('promptForAdventureType', () => { /* ... */ });
    socket.on('error', (data) => showInfoModal('Erro', data.message));
    
    function initialize() {
        showScreen('loading-screen');
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoomId = urlParams.get('room');
        
        if (urlRoomId) socket.emit('playerJoinsLobby', { roomId: urlRoomId });
        else socket.emit('gmCreatesLobby');

        // Listeners de clique robustos e centralizados
        document.getElementById('join-as-player-btn').addEventListener('click', () => {
            showScreen('loading-screen');
            socket.emit('playerChoosesRole', { role: 'player' });
        });
        document.getElementById('join-as-spectator-btn').addEventListener('click', () => {
            showScreen('loading-screen');
            socket.emit('playerChoosesRole', { role: 'spectator' });
        });
        document.getElementById('new-char-btn').addEventListener('click', startNewCharacter);
        document.getElementById('load-char-btn').addEventListener('click', () => document.getElementById('load-char-input').click());
        document.getElementById('load-char-input').addEventListener('change', (e) => loadCharacterFromFile(e.target.files[0]));
        document.getElementById('confirm-token-btn').addEventListener('click', confirmTokenSelection);
        document.getElementById('finish-sheet-btn').addEventListener('click', finishSheetCreation);
        document.getElementById('start-adventure-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsAdventure' }));
        document.getElementById('start-theater-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsTheater' }));
        document.getElementById('back-to-lobby-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmGoesBackToLobby' }));
        document.getElementById('floating-switch-mode-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmSwitchesMode' }));
        document.getElementById('floating-invite-btn').addEventListener('click', () => {
             if (myRoomId) {
                const inviteUrl = `${window.location.origin}?room=${myRoomId}`;
                copyToClipboard(inviteUrl, document.getElementById('floating-invite-btn'));
            }
        });
        document.getElementById('gm-start-battle-btn').addEventListener('click', () => {
            if(stagedNpcs.length > 0) socket.emit('playerAction', { type: 'gmStartBattle', npcs: stagedNpcs });
        });
        
        document.getElementById('theater-change-scenario-btn').addEventListener('click', showScenarioSelectionModal);
        document.getElementById('theater-publish-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'publish_stage' }));
        document.getElementById('theater-lock-players-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'togglePlayerLock' }));
        theaterGlobalScale.addEventListener('change', (e) => {
             if (isGm) socket.emit('playerAction', {type: 'updateGlobalScale', scale: parseFloat(e.target.value)});
        });

        setupTheaterEventListeners();
        initializeGlobalKeyListeners();
        window.addEventListener('resize', scaleGame);
        scaleGame();
    }
    
    initialize();
});