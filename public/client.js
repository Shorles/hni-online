// client.js

document.addEventListener('DOMContentLoaded', () => {
    // --- CONSTANTES DE REGRAS DO JOGO (ALMARA RPG) ---
    const GAME_RULES = {
        races: {
            "Anjo": { bon: {}, pen: { forca: -1 }, text: "Não podem usar elemento Escuridão. Obrigatoriamente começam com 1 ponto em Luz. Recebem +1 em magias de cura." },
            "Demônio": { bon: {}, pen: {}, text: "Não podem usar elemento Luz. Obrigatoriamente começam com 1 ponto em Escuridão. Recebem +1 em dano de magias de Escuridão. Cura recebida é reduzida em 1." },
            "Elfo": { bon: { agilidade: 2 }, pen: { forca: -1 }, text: "Enxergam no escuro (exceto escuridão mágica)." },
            "Anão": { bon: { constituicao: 1 }, pen: {}, text: "Enxergam no escuro (exceto escuridão mágica)." },
            "Goblin": { bon: { mente: 1 }, pen: { constituicao: -1 }, text: "Não podem utilizar armas do tipo Gigante e Colossal." },
            "Orc": { bon: { forca: 2 }, pen: { inteligencia: -1 }, text: "Podem comer quase qualquer coisa sem adoecerem." },
            "Humano": { bon: { escolha: 1 }, pen: {}, text: "Recebem +1 ponto de atributo básico para distribuir." },
            "Kairou": { bon: {}, pen: {}, text: "Respiram debaixo d'água. Devem umedecer a pele a cada dia. +1 em todos os atributos se lutarem na água." },
            "Centauro": { bon: {}, pen: { agilidade: -1 }, text: "Não podem entrar em locais apertados ou subir escadas de mão. +3 em testes de velocidade/salto." },
            "Halfling": { bon: { agilidade: 1, inteligencia: 1 }, pen: { forca: -1, constituicao: -1 }, text: "Não podem usar armas Gigante/Colossal. Enxergam no escuro." },
            "Tritão": { bon: { forca: 2 }, pen: { inteligencia: -2 }, text: "Respiram debaixo d'água. Devem umedecer a pele a cada 5 dias." },
            "Meio-Elfo": { bon: { agilidade: 1 }, pen: {}, text: "Enxergam no escuro (exceto escuridão mágica)." },
            "Meio-Orc": { bon: { forca: 1 }, pen: {}, text: "Nenhuma característica única." },
            "Auslender": { bon: { inteligencia: 2, agilidade: 1 }, pen: { forca: -1, protecao: -1 }, text: "Não precisam de testes para usar artefatos tecnológicos." },
            "Tulku": { bon: { inteligencia: 1, mente: 1 }, pen: {}, text: "Recebem -1 para usar magias de Luz. Enxergam no escuro." },
        },
        weapons: {
            "Desarmado": { cost: 0, damage: "1D4", hand: 1, bta: 0, btd: 0, ambi_bta_mod: 0, ambi_btd_mod: 0 },
            "1 Mão Mínima": { cost: 60, damage: "1D6", hand: 1, bta: 4, btd: -1, ambi_bta_mod: 0, ambi_btd_mod: -1 },
            "1 Mão Leve": { cost: 80, damage: "1D6", hand: 1, bta: 3, btd: 0, ambi_bta_mod: 0, ambi_btd_mod: -1 },
            "1 Mão Mediana": { cost: 100, damage: "1D6", hand: 1, bta: 1, btd: 1, ambi_bta_mod: 0, ambi_btd_mod: -1 },
            "Cetro": { cost: 80, damage: "1D4", hand: 1, bta: 1, btd: 0, btm: 1, ambi_bta_mod: 0, ambi_btd_mod: -1 },
            "2 Mãos Pesada": { cost: 120, damage: "1D10", hand: 2, bta: 2, btd: 0, one_hand_bta_mod: -2, ambi_btd_mod: -2 },
            "2 Mãos Gigante": { cost: 140, damage: "1D10", hand: 2, bta: 1, btd: 1, one_hand_bta_mod: -2, ambi_btd_mod: -2 },
            "2 Mãos Colossal": { cost: 160, damage: "1D10", hand: 2, bta: -1, btd: 2, one_hand_bta_mod: -2, ambi_btd_mod: -2 },
            "Cajado": { cost: 140, damage: "1D6", hand: 2, bta: 1, btd: 0, btm: 2, one_hand_bta_mod: -2 },
        },
        armors: {
            "Nenhuma": { cost: 0, protection: 0, agility_pen: 0 },
            "Leve": { cost: 80, protection: 1, agility_pen: 0 },
            "Mediana": { cost: 100, protection: 2, agility_pen: -1 },
            "Pesada": { cost: 120, protection: 3, agility_pen: -2 },
        },
        shields: {
            "Nenhum": { cost: 0, defense: 0, agility_pen: 0, req_forca: 0 },
            "Pequeno": { cost: 80, defense: 2, agility_pen: -1, req_forca: 1 },
            "Médio": { cost: 100, defense: 4, agility_pen: -2, req_forca: 2 },
            "Grande": { cost: 120, defense: 6, agility_pen: -3, req_forca: 3 },
        },
        advancedElements: {
            fogo: "Chama Azul", agua: "Gelo", terra: "Metal", 
            vento: "Raio", luz: "Cura", escuridao: "Gravidade"
        },
        spells: {
            grade1: [
                { name: "Estalo de Fogo", element: "fogo", desc: "Cria uma pequena chama para acender objetos. (Fora de combate)" },
                { name: "Baforada Dracônica", element: "fogo", desc: "Causa 1D4 + nível de dano em área." },
                { name: "Afogamento", element: "agua", desc: "Causa 2 de dano por 3 turnos (80% chance)." },
                { name: "Geração de Água", element: "agua", desc: "Cria água potável. (Fora de combate)" },
                { name: "Golpe Rochoso", element: "terra", desc: "+3 Força, -2 Agilidade por 3 turnos." },
                { name: "Elevação", element: "terra", desc: "Eleva um pedaço de terra/rocha. (Fora de combate)" },
                { name: "Aceleração", element: "vento", desc: "+3 Agilidade por 3 turnos." },
                { name: "Tubo de Aceleração", element: "vento", desc: "Dispara algo/alguém a distância. (Fora de combate)" },
                { name: "Iluminar", element: "luz", desc: "Cria um globo de luz por 1 hora. (Fora de combate)" },
                { name: "Flash", element: "luz", desc: "Cega alvos por 1 turno (15% chance de resistir)." },
                { name: "Desfazer Ilusão Mínima", element: "escuridao", desc: "Dissolve ilusões de grau 1. (Fora de combate)" },
                { name: "Dano de Energia", element: "escuridao", desc: "Causa 1D6+1 de dano no Mahou/Ki do alvo." },
            ]
        }
    };
    let tempCharacterSheet = {};

    // --- VARIÁVEIS DE ESTADO ---
    let myRole = null, myPlayerKey = null, isGm = false;
    let currentGameState = null, oldGameState = null;
    let defeatAnimationPlayed = new Set();
    const socket = io();
    let myRoomId = null; 
    let coordsModeActive = false;
    let clientFlowState = 'initializing';
    const gameStateQueue = [];
    let ALL_CHARACTERS = { players: [], npcs: [], dynamic: [] };
    let ALL_SCENARIOS = {};
    let stagedNpcSlots = new Array(5).fill(null);
    let selectedSlotIndex = null;
    const MAX_NPCS = 5;
    let isTargeting = false;
    let targetingAttackerKey = null;
    let isFreeMoveModeActive = false;
    let customFighterPositions = {};
    let draggedFighter = { element: null, offsetX: 0, offsetY: 0 };
    let localWorldScale = 1.0;
    let selectedTokens = new Set();
    let hoveredTokenId = null;
    let isDragging = false;
    let isPanning = false;
    let dragStartPos = { x: 0, y: 0 };
    let dragOffsets = new Map();
    let isGroupSelectMode = false;
    let isSelectingBox = false;
    let selectionBoxStartPos = { x: 0, y: 0 };

    // --- ELEMENTOS DO DOM ---
    const allScreens = document.querySelectorAll('.screen');
    const gameWrapper = document.getElementById('game-wrapper');
    const fightSceneCharacters = document.getElementById('fight-scene-characters');
    const actionButtonsWrapper = document.getElementById('action-buttons-wrapper');
    const theaterBackgroundViewport = document.getElementById('theater-background-viewport');
    const theaterBackgroundImage = document.getElementById('theater-background-image');
    const theaterTokenContainer = document.getElementById('theater-token-container');
    const theaterWorldContainer = document.getElementById('theater-world-container');
    const theaterCharList = document.getElementById('theater-char-list');
    const theaterGlobalScale = document.getElementById('theater-global-scale');
    const initiativeUI = document.getElementById('initiative-ui');
    const modal = document.getElementById('modal');
    const selectionBox = document.getElementById('selection-box');
    const turnOrderSidebar = document.getElementById('turn-order-sidebar');
    const floatingButtonsContainer = document.getElementById('floating-buttons-container');
    const floatingInviteBtn = document.getElementById('floating-invite-btn');
    const floatingSwitchModeBtn = document.getElementById('floating-switch-mode-btn');
    const floatingHelpBtn = document.getElementById('floating-help-btn');
    const waitingPlayersSidebar = document.getElementById('waiting-players-sidebar');
    const backToLobbyBtn = document.getElementById('back-to-lobby-btn');
    const coordsDisplay = document.getElementById('coords-display');

    // --- FUNÇÕES DE UTILIDADE ---
    function scaleGame() { setTimeout(() => { const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720); gameWrapper.style.transform = `scale(${scale})`; gameWrapper.style.left = `${(window.innerWidth - 1280 * scale) / 2}px`; gameWrapper.style.top = `${(window.innerHeight - 720 * scale) / 2}px`; }, 10); }
    function showScreen(screenToShow) { allScreens.forEach(screen => screen.classList.toggle('active', screen === screenToShow)); }
    function showInfoModal(title, text, showButton = true) { const modalContent = document.getElementById('modal-content'); document.getElementById('modal-title').innerText = title; document.getElementById('modal-text').innerHTML = text; const oldButtons = modalContent.querySelector('.modal-button-container'); if (oldButtons) oldButtons.remove(); document.getElementById('modal-button').classList.toggle('hidden', !showButton); modal.classList.remove('hidden'); document.getElementById('modal-button').onclick = () => modal.classList.add('hidden'); }
    function showConfirmationModal(title, text, onConfirm, confirmText = 'Sim', cancelText = 'Não') { const modalContent = document.getElementById('modal-content'), modalText = document.getElementById('modal-text'); document.getElementById('modal-title').innerText = title; modalText.innerHTML = `<p>${text}</p>`; const oldButtons = modalContent.querySelector('.modal-button-container'); if (oldButtons) oldButtons.remove(); const buttonContainer = document.createElement('div'); buttonContainer.className = 'modal-button-container'; const confirmBtn = document.createElement('button'); confirmBtn.textContent = confirmText; confirmBtn.onclick = () => { onConfirm(true); modal.classList.add('hidden'); }; const cancelBtn = document.createElement('button'); cancelBtn.textContent = cancelText; cancelBtn.onclick = () => { onConfirm(false); modal.classList.add('hidden'); }; buttonContainer.appendChild(confirmBtn); buttonContainer.appendChild(cancelBtn); modalContent.appendChild(buttonContainer); document.getElementById('modal-button').classList.add('hidden'); modal.classList.remove('hidden'); }
    function getGameScale() { return (window.getComputedStyle(gameWrapper).transform === 'none') ? 1 : new DOMMatrix(window.getComputedStyle(gameWrapper).transform).a; }
    function copyToClipboard(text, element) { if (!element) return; navigator.clipboard.writeText(text).then(() => { const originalHTML = element.innerHTML; const isButton = element.tagName === 'BUTTON'; element.innerHTML = 'Copiado!'; if (isButton) element.style.fontSize = '14px'; setTimeout(() => { element.innerHTML = originalHTML; if (isButton) element.style.fontSize = '24px'; }, 2000); }); }
    function cancelTargeting() { isTargeting = false; targetingAttackerKey = null; document.getElementById('targeting-indicator').classList.add('hidden'); }
    function getFighter(state, key) { if (!state || !state.fighters || !key) return null; return state.fighters.players[key] || state.fighters.npcs[key]; }

    // --- LÓGICA DE JOGO PRINCIPAL ---
    function handleAdventureMode(gameState) { /* ... (código existente mantido) ... */ }
    function updateGmLobbyUI(state) { /* ... (código existente mantido) ... */ }

    function renderPlayerTokenSelection() {
        const charListContainer = document.getElementById('character-list-container');
        const confirmBtn = document.getElementById('confirm-selection-btn');
        charListContainer.innerHTML = '';
        confirmBtn.disabled = true;
        let myCurrentSelection = tempCharacterSheet.tokenImg;

        (ALL_CHARACTERS.players || []).forEach(data => {
            const card = document.createElement('div');
            card.className = 'char-card';
            card.dataset.name = data.name;
            card.dataset.img = data.img;
            card.innerHTML = `<img src="${data.img}" alt="${data.name}"><div class="char-name">${data.name}</div>`;
            if (myCurrentSelection === data.img) {
                card.classList.add('selected');
                confirmBtn.disabled = false;
            }
            card.addEventListener('click', () => {
                document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                confirmBtn.disabled = false;
            });
            charListContainer.appendChild(card);
        });
        
        // CORREÇÃO APLICADA AQUI
        confirmBtn.onclick = () => {
            const selectedCard = document.querySelector('.char-card.selected');
            if (selectedCard) {
                tempCharacterSheet.tokenName = selectedCard.dataset.name;
                tempCharacterSheet.tokenImg = selectedCard.dataset.img;
                initializeCharacterSheet();
                showScreen(document.getElementById('character-sheet-screen'));
            }
        };
    }

    // --- FUNÇÕES DA FICHA DE PERSONAGEM ---
    function initializeCharacterSheet() { /* ... (código existente mantido, igual à versão anterior) ... */ }
    function renderSpellSelection(playerElements) { /* ... (código existente mantido, igual à versão anterior) ... */ }
    function updateCharacterSheet(event) { /* ... (código existente mantido, igual à versão anterior) ... */ }
    function handleSaveCharacter() { /* ... (código existente mantido) ... */ }
    function handleLoadCharacter(event) { /* ... (código existente mantido) ... */ }
    function handleConfirmCharacter() { /* ... (código existente mantido) ... */ }
    
    // ... (o restante do código, de `renderGame` em diante, é restaurado à versão funcional)
    function renderGame(gameState) {
        scaleGame(); 
        oldGameState = currentGameState;
        currentGameState = gameState;

        if (!gameState || !gameState.mode || !gameState.connectedPlayers) {
            showScreen(document.getElementById('loading-screen'));
            return;
        }
        
        const myPlayerData = gameState.connectedPlayers?.[socket.id];
        
        if (myRole === 'player' && myPlayerData && !myPlayerData.characterFinalized) {
            // Este bloco evita que o `renderGame` interfira no fluxo de criação
            return;
        }
        
        if (gameState.mode === 'adventure' && gameState.scenario) gameWrapper.style.backgroundImage = `url('images/${gameState.scenario}')`;
        else if (gameState.mode === 'lobby') gameWrapper.style.backgroundImage = `url('images/mapas/cenarios externos/externo (1).png')`;
        else gameWrapper.style.backgroundImage = 'none';

        floatingButtonsContainer.classList.add('hidden');
        document.getElementById('back-to-lobby-btn').classList.add('hidden');
        if (isGm && (gameState.mode === 'adventure' || gameState.mode === 'theater')) {
            floatingButtonsContainer.classList.remove('hidden');
            document.getElementById('back-to-lobby-btn').classList.remove('hidden');
            const switchBtn = document.getElementById('floating-switch-mode-btn');
            if (gameState.mode === 'adventure') {
                switchBtn.innerHTML = '🎭';
                switchBtn.title = 'Mudar para Modo Cenário';
            } else {
                switchBtn.innerHTML = '⚔️';
                switchBtn.title = 'Mudar para Modo Aventura';
            }
        }

        switch(gameState.mode) {
            case 'lobby':
                defeatAnimationPlayed.clear();
                stagedNpcSlots.fill(null);
                selectedSlotIndex = null;
                if (isGm) {
                    showScreen(document.getElementById('gm-initial-lobby'));
                    updateGmLobbyUI(gameState);
                } else {
                    showScreen(document.getElementById('player-waiting-screen'));
                    document.getElementById('player-waiting-message').innerText = "Aguardando o Mestre iniciar o jogo...";
                }
                break;
            case 'adventure':
                handleAdventureMode(gameState);
                break;
            case 'theater':
                if (!oldGameState || oldGameState.mode !== 'theater') initializeTheaterMode();
                showScreen(document.getElementById('theater-screen'));
                renderTheaterMode(gameState);
                break;
            default:
                showScreen(document.getElementById('loading-screen'));
        }
    }

    // --- INICIALIZAÇÃO E LISTENERS DE SOCKET ---
    socket.on('initialData', (data) => { ALL_CHARACTERS = data.characters || { players: [], npcs: [], dynamic: [] }; ALL_SCENARIOS = data.scenarios || {}; });
    socket.on('gameUpdate', (gameState) => { if (clientFlowState !== 'choosing_role') renderGame(gameState); });
    socket.on('fighterMoved', ({ fighterId, position }) => { customFighterPositions[fighterId] = position; const fighterEl = document.getElementById(fighterId); if (fighterEl) { fighterEl.style.left = position.left; fighterEl.style.top = position.top; } });
    socket.on('roomCreated', (roomId) => {
        myRoomId = roomId;
        if (isGm) {
            const inviteLinkEl = document.getElementById('gm-link-invite');
            const inviteUrl = `${window.location.origin}?room=${roomId}`;
            if (inviteLinkEl) { 
                inviteLinkEl.textContent = inviteUrl; 
                inviteLinkEl.onclick = () => copyToClipboard(inviteUrl, inviteLinkEl); 
            }
        }
    });
    socket.on('promptForRole', ({ isFull }) => {
        clientFlowState = 'choosing_role';
        const roleSelectionScreen = document.getElementById('role-selection-screen');
        const joinAsPlayerBtn = document.getElementById('join-as-player-btn');
        const roomFullMessage = document.getElementById('room-full-message');
        if (isFull) {
            joinAsPlayerBtn.disabled = true;
            roomFullMessage.textContent = 'A sala de jogadores está cheia. Você pode entrar como espectador.';
            roomFullMessage.classList.remove('hidden');
        } else {
            joinAsPlayerBtn.disabled = false;
            roomFullMessage.classList.add('hidden');
        }
        showScreen(roleSelectionScreen);
    });
    socket.on('assignRole', (data) => {
        myRole = data.role; myPlayerKey = data.playerKey || null; isGm = !!data.isGm; myRoomId = data.roomId;
        clientFlowState = 'in_game';
        if (myRole === 'player') {
            showScreen(document.getElementById('player-initial-choice-screen'));
        }
    });
    socket.on('gmPromptToAdmit', ({ playerId, character }) => { if (isGm) showConfirmationModal('Novo Jogador', `${character.nome} deseja entrar na batalha. Permitir?`, (admitted) => socket.emit('playerAction', { type: 'gmDecidesOnAdmission', playerId, admitted })); });
    socket.on('promptForAdventureType', () => { if (isGm) showConfirmationModal('Retornar à Aventura', 'Deseja continuar a aventura anterior ou começar uma nova batalha?', (continuar) => socket.emit('playerAction', { type: 'gmChoosesAdventureType', choice: continuar ? 'continue' : 'new' }), 'Continuar Batalha', 'Nova Batalha'); });
    socket.on('attackResolved', ({ attackerKey, targetKey, hit }) => { /* ... */ });
    socket.on('fleeResolved', ({ actorKey }) => { /* ... */ });
    socket.on('error', (data) => showInfoModal('Erro', data.message));
    
    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoomId = urlParams.get('room');
        
        showScreen(document.getElementById('loading-screen')); 

        if (urlRoomId) socket.emit('playerJoinsLobby', { roomId: urlRoomId });
        else socket.emit('gmCreatesLobby');

        document.getElementById('join-as-player-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'player' }));
        document.getElementById('join-as-spectator-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'spectator' }));
        document.getElementById('new-char-btn').addEventListener('click', () => {
            renderPlayerTokenSelection();
            showScreen(document.getElementById('selection-screen'));
        });
        document.getElementById('load-char-btn').addEventListener('click', () => document.getElementById('load-char-input').click());
        document.getElementById('load-char-input').addEventListener('change', handleLoadCharacter);

        document.querySelectorAll('#character-sheet-screen input, #character-sheet-screen select').forEach(el => {
            el.addEventListener('change', (e) => updateCharacterSheet(e));
            el.addEventListener('input', (e) => updateCharacterSheet(e));
        });
        document.getElementById('sheet-save-btn').addEventListener('click', handleSaveCharacter);
        document.getElementById('sheet-confirm-btn').addEventListener('click', handleConfirmCharacter);

        document.getElementById('start-adventure-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsAdventure' }));
        document.getElementById('start-theater-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsTheater' }));
        backToLobbyBtn.addEventListener('click', () => socket.emit('playerAction', { type: 'gmGoesBackToLobby' }));
        document.getElementById('theater-change-scenario-btn').addEventListener('click', showScenarioSelectionModal);
        document.getElementById('theater-publish-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'publish_stage' }));
        
        floatingSwitchModeBtn.addEventListener('click', () => socket.emit('playerAction', { type: 'gmSwitchesMode' }));
        floatingInviteBtn.addEventListener('click', () => {
             if (myRoomId) {
                const inviteUrl = `${window.location.origin}?room=${myRoomId}`;
                copyToClipboard(inviteUrl, floatingInviteBtn);
            }
        });
        
        if (floatingHelpBtn) floatingHelpBtn.addEventListener('click', showHelpModal);

        setupTheaterEventListeners();
        initializeGlobalKeyListeners();
        window.addEventListener('resize', scaleGame);
        scaleGame();
    }
    
    initialize();
});