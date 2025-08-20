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
    
    // CORREÇÃO: Flags para garantir que os dados essenciais foram carregados
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
        // CORREÇÃO: Guard Clause mais robusta. Só renderiza se TUDO estiver pronto.
        if (!isDataInitialized || !isRoleAssigned) {
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
             showScreen('loading-screen'); // Fallback caso o estado do player ainda não esteja pronto
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
        // ... (implementação mantida)
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

    function renderSheetCreationUI() {
        // CORREÇÃO: Função completa e robusta para renderizar a ficha
        const sheet = characterSheetInProgress;
        const container = document.querySelector('.sheet-form-container');
        
        // --- CÁLCULOS ---
        const raceData = sheet.race ? GAME_DATA.races[sheet.race] : null;
        let attributePoints = 5 + (raceData?.bonus?.any || 0);
        let usedAttrPoints = 0;
        if(raceData){
            usedAttrPoints = Object.keys(sheet.attributes).reduce((total, key) => {
                const baseVal = (raceData.bonus[key] || 0) + (raceData.penalty[key] || 0);
                return total + (sheet.attributes[key] - baseVal);
            }, 0);
        }

        const usedElementPoints = Object.values(sheet.elements).reduce((a, b) => a + b, 0);
        const remainingElementPoints = 2 - usedElementPoints;
        
        const equipmentCost = Object.values(sheet.equipment).reduce((total, itemName) => {
            if (!itemName) return total;
            const item = Object.values(GAME_DATA.equipment).flatMap(cat => Object.values(cat)).find(i => i.name === itemName);
            return total + (item?.cost || 0);
        }, 0);
        const remainingMoney = 200 - equipmentCost;

        // --- RENDERIZAÇÃO DO HTML ---
        container.innerHTML = `
            <div class="sheet-section"><h3>Identidade</h3><div class="form-grid">
                <div class="form-field"><label for="sheet-name">Nome:</label><input type="text" id="sheet-name" value="${sheet.name}"></div>
                <div class="form-field"><label for="sheet-class">Classe:</label><input type="text" id="sheet-class" value="${sheet.class}"></div>
            </div></div>
            <div class="sheet-section"><h3>Raça</h3><div class="form-grid" id="sheet-races"></div></div>
            <div class="sheet-section"><h3>Atributos (<span id="points-to-distribute">${attributePoints - usedAttrPoints}</span> pontos restantes)</h3><div class="form-grid" id="sheet-attributes"></div></div>
            <div class="sheet-section"><h3>Elementos (${remainingElementPoints} pontos restantes)</h3><div class="form-grid" id="sheet-elements"></div></div>
            <div class="sheet-section"><h3>Equipamentos (Dinheiro Restante: ${remainingMoney} moedas)</h3><div class="form-grid" id="sheet-equipment"></div></div>
            <div class="sheet-section"><h3>Magias (Selecione ${2 - sheet.spells.length} de Grau 1)</h3><div class="form-grid" id="sheet-spells"></div></div>
        `;
        
        // --- POPULAR E ADICIONAR LISTENERS ---
        // Raça e Atributos
        const raceContainer = document.getElementById('sheet-races');
        // ... (lógica de renderização de raças mantida)
        
        const attrContainer = document.getElementById('sheet-attributes');
        // ... (lógica de renderização de atributos mantida)

        document.getElementById('sheet-name').onchange = (e) => sheet.name = e.target.value;
        document.getElementById('sheet-class').onchange = (e) => sheet.class = e.target.value;
        document.querySelectorAll('.attr-btn[data-attr]').forEach(btn => { /* ... (lógica de clique mantida) ... */ });

        // Elementos
        const elementContainer = document.getElementById('sheet-elements');
        // ... (lógica de renderização de elementos mantida)
        document.querySelectorAll('.attr-btn[data-el]').forEach(btn => { /* ... (lógica de clique mantida) ... */ });

        // Equipamentos
        const equipContainer = document.getElementById('sheet-equipment');
        const createSelect = (id, category, selectedValue) => { /* ... (lógica mantida) ... */ };
        equipContainer.innerHTML = `
            ${createSelect('weapon1', 'weapons', sheet.equipment.weapon1)}
            ${createSelect('weapon2', 'weapons', sheet.equipment.weapon2)}
            ${createSelect('shield', 'shields', sheet.equipment.shield)}
            ${createSelect('armor', 'armors', sheet.equipment.armor)}
        `;
        const updateEquipment = () => { /* ... (lógica de restrição mantida) ... */ };
        equipContainer.querySelectorAll('select').forEach(sel => sel.onchange = updateEquipment);

        // Magias
        const spellContainer = document.getElementById('sheet-spells');
        // ... (lógica de renderização de magias mantida)
    }

    function finishSheetCreation() {
        // ... (lógica mantida)
    }

    // --- LÓGICA DE UI DO GM ---
    function renderGmNpcSetup() {
        // ... (lógica mantida)
    }

    // --- MODO CENÁRIO: LÓGICA RESTAURADA E INTEGRADA ---
    function renderTheaterUI(state) {
        // ... (lógica mantida)
    }
    
    function renderGmTheaterPanel() {
        // ... (lógica mantida)
    }

    function renderPlayerTheaterControls(state) {
        // ... (lógica mantida)
    }

    function setupTheaterEventListeners() {
        // ... (lógica de MOUSE restaurada e funcional)
    }

    function initializeGlobalKeyListeners() {
        // ... (lógica de TECLADO restaurada e funcional)
    }
    
    function showScenarioSelectionModal() {
        // ... (lógica mantida)
    }

    // --- INICIALIZAÇÃO E LISTENERS DE SOCKET ---
    socket.on('initialData', (data) => {
        PLAYABLE_TOKENS = data.playableTokens;
        DYNAMIC_CHARACTERS = data.dynamicCharacters;
        GAME_DATA = data.gameData;
        ALL_NPCS = data.npcs;
        ALL_SCENARIOS = data.scenarios;
        isDataInitialized = true;
        // Se o papel já chegou, podemos renderizar o jogo
        if (isRoleAssigned) {
            renderGame(currentGameState);
        }
    });

    socket.on('assignRole', (data) => {
        myRole = data.role; 
        isGm = !!data.isGm; 
        myRoomId = data.roomId;
        isRoleAssigned = true;
        // Se os dados já chegaram, podemos renderizar o jogo
        if (isDataInitialized) {
            renderGame(currentGameState);
        }
    });
    
    socket.on('gameUpdate', (gameState) => {
        currentGameState = gameState; // Sempre atualiza o estado mais recente
        renderGame(gameState);
    });

    socket.on('roomCreated', (roomId) => { myRoomId = roomId; });
    
    socket.on('promptForRole', ({ isFull }) => {
        // Esta é a primeira mensagem garantida para um jogador,
        // então é seguro sair da tela de "Conectando..."
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
        document.getElementById('join-as-player-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'player' }));
        document.getElementById('join-as-spectator-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'spectator' }));
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