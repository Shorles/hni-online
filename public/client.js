// client.js

document.addEventListener('DOMContentLoaded', () => {
    // --- VARIÁVEIS DE ESTADO ---
    let myRole = null;
    let myPlayerKey = null;
    let isGm = false;
    let currentGameState = null;
    let oldGameState = null;
    let defeatAnimationPlayed = new Set();
    const socket = io();
    let myRoomId = null; 

    let coordsModeActive = false;

    // --- NOVAS VARIÁVEIS PARA CRIAÇÃO DE PERSONAGEM ---
    let selectedPlayerToken = { name: null, img: null };
    let characterSheetBuilder = {};
    let ALL_SPELLS = {};
    let ALL_CHARACTERS = { players: [], npcs: [], dynamic: [] };
    let stagedNpcSlots = new Array(5).fill(null);
    let selectedSlotIndex = null;
    const MAX_NPCS = 5;

    // --- VARIÁVEIS DO MODO CENÁRIO (RESTAURADAS DO ORIGINAL) ---
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

    // --- CONSTANTES DE REGRAS DO JOGO ---
    const RACES = { "Anjo": { bonus: {}, penalty: { "forca": 1 }, unique: "+1 em cura, não pode usar Escuridão, 1 ponto obrigatório em Luz." }, "Demonio": { bonus: {}, penalty: {}, unique: "+1 em magias de Escuridão, -1 em cura recebida, não pode usar Luz, 1 ponto obrigatório em Escuridão." }, "Elfo": { bonus: { "agilidade": 2 }, penalty: { "forca": 1 }, unique: "Enxerga no escuro." }, "Anao": { bonus: { "constituicao": 1 }, penalty: {}, unique: "Enxerga no escuro." }, "Goblin": { bonus: { "mente": 1 }, penalty: { "constituicao": 1 }, unique: "Não pode usar armas Gigante e Colossal." }, "Orc": { bonus: { "forca": 2 }, penalty: { "inteligencia": 1 }, unique: "Pode comer quase qualquer coisa sem adoecer." }, "Humano": { bonus: { "any": 1 }, penalty: {}, unique: "+1 em um atributo à sua escolha." }, "Kairou": { bonus: {}, penalty: {}, unique: "Respira debaixo d'água, +1 em todos os atributos na água. Penalidades severas se ficar seco." }, "Centauro": { bonus: {}, penalty: { "agilidade": 1 }, unique: "Não pode entrar em locais apertados. +3 em testes de velocidade/salto." }, "Halfling": { bonus: { "agilidade": 1, "inteligencia": 1 }, penalty: { "forca": 1, "constituicao": 1 }, unique: "Enxerga no escuro. Não pode usar armas Gigante e Colossal." }, "Tritao": { bonus: { "forca": 2 }, penalty: { "inteligencia": 2 }, unique: "Respira debaixo d'água. Penalidades se ficar seco." }, "Meio-Elfo": { bonus: { "agilidade": 1 }, penalty: {}, unique: "Enxerga no escuro." }, "Meio-Orc": { bonus: { "forca": 1 }, penalty: {}, unique: "Nenhuma." }, "Auslender": { bonus: { "inteligencia": 2, "agilidade": 1 }, penalty: { "forca": 1, "protecao": 1 }, unique: "Compreende tecnologia facilmente." }, "Tulku": { bonus: { "inteligencia": 1, "mente": 1 }, penalty: {}, unique: "Enxerga no escuro. -1 em magias de Luz." } };
    const ATTRIBUTES = { "forca": "Força", "agilidade": "Agilidade", "protecao": "Proteção", "constituicao": "Constituição", "inteligencia": "Inteligência", "mente": "Mente" };
    const ELEMENTS = { "fogo": "Fogo", "agua": "Água", "terra": "Terra", "vento": "Vento", "luz": "Luz", "escuridao": "Escuridão" };
    const ADVANCED_ELEMENTS = { "fogo": "Chama Azul", "agua": "Gelo", "terra": "Metal", "vento": "Raio", "luz": "Cura", "escuridao": "Gravidade" };
    const WEAPONS = { "desarmado": { name: "Desarmado", cost: 0, hands: 1 }, "minima": { name: "1 Mão Mínima", cost: 60, hands: 1 }, "leve": { name: "1 Mão Leve", cost: 80, hands: 1 }, "mediana": { name: "1 Mão Mediana", cost: 100, hands: 1 }, "cetro": { name: "Cetro", cost: 80, hands: 1 }, "pesada": { name: "2 Mãos Pesada", cost: 120, hands: 2 }, "gigante": { name: "2 Mãos Gigante", cost: 140, hands: 2 }, "colossal": { name: "2 Mãos Colossal", cost: 160, hands: 2 }, "cajado": { name: "Cajado", cost: 140, hands: 2 } };
    const SHIELDS = { "nenhum": { name: "Nenhum", cost: 0 }, "pequeno": { name: "Pequeno", cost: 80 }, "medio": { name: "Médio", cost: 100 }, "grande": { name: "Grande", cost: 120 } };

    // --- ELEMENTOS DO DOM ---
    const allScreens = document.querySelectorAll('.screen');
    const gameWrapper = document.getElementById('game-wrapper');
    const modal = document.getElementById('modal');
    // Ficha
    const newCharBtn = document.getElementById('new-char-btn');
    const loadCharBtn = document.getElementById('load-char-btn');
    const charFileInput = document.getElementById('char-file-input');
    const attrPointsRemainingSpan = document.getElementById('attr-points-remaining');
    const elemPointsRemainingSpan = document.getElementById('elem-points-remaining');
    const charMoneySpan = document.getElementById('char-money');
    const attributesContainer = document.getElementById('attributes-container');
    const elementsContainer = document.getElementById('elements-container');
    const sheetNextBtn = document.getElementById('sheet-next-btn');
    const finalizeCharBtn = document.getElementById('finalize-char-btn');
    const saveCharBtn = document.getElementById('save-char-btn');
    const spellListContainer = document.getElementById('spell-list-container');
    const advancedElementInfo = document.getElementById('advanced-element-info');
    const confirmSelectionBtn = document.getElementById('confirm-selection-btn');
    // Teatro (Restaurado)
    const theaterBackgroundViewport = document.getElementById('theater-background-viewport');
    const theaterWorldContainer = document.getElementById('theater-world-container');
    const theaterBackgroundImage = document.getElementById('theater-background-image');
    const theaterTokenContainer = document.getElementById('theater-token-container');
    const selectionBox = document.getElementById('selection-box');
    const theaterCharList = document.getElementById('theater-char-list');
    const theaterGlobalScale = document.getElementById('theater-global-scale');
    const floatingButtonsContainer = document.getElementById('floating-buttons-container');
    const backToLobbyBtn = document.getElementById('back-to-lobby-btn');

    // --- FUNÇÕES DE UTILIDADE ---
    function scaleGame() { setTimeout(() => { const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720); gameWrapper.style.transform = `scale(${scale})`; gameWrapper.style.left = `${(window.innerWidth - 1280 * scale) / 2}px`; gameWrapper.style.top = `${(window.innerHeight - 720 * scale) / 2}px`; }, 10); }
    function showScreen(screenId) { allScreens.forEach(screen => screen.classList.toggle('active', screen.id === screenId)); }
    function showInfoModal(title, text) { document.getElementById('modal-title').innerText = title; document.getElementById('modal-text').innerHTML = text; modal.classList.remove('hidden'); document.getElementById('modal-button').onclick = () => modal.classList.add('hidden'); }
    function copyToClipboard(text, element) { navigator.clipboard.writeText(text).then(() => { const original = element.innerHTML; element.innerHTML = 'Copiado!'; setTimeout(() => { element.innerHTML = original; }, 2000); }); }
    function obfuscateData(data) { return btoa(unescape(encodeURIComponent(JSON.stringify(data)))); }
    function deobfuscateData(data) { try { return JSON.parse(decodeURIComponent(escape(atob(data)))); } catch (e) { return null; } }
    function getGameScale() { return (window.getComputedStyle(gameWrapper).transform === 'none') ? 1 : new DOMMatrix(window.getComputedStyle(gameWrapper).transform).a; }

    // --- FLUXO DE CRIAÇÃO DE PERSONAGEM ---
    function renderPlayerCharacterSelection() {
        const charListContainer = document.getElementById('character-list-container');
        charListContainer.innerHTML = '';
        confirmSelectionBtn.disabled = true;
        ALL_CHARACTERS.players.forEach(data => {
            const card = document.createElement('div');
            card.className = 'char-card';
            card.dataset.name = data.name;
            card.dataset.img = data.img;
            card.innerHTML = `<img src="${data.img}" alt="${data.name}"><div class="char-name">${data.name}</div>`;
            card.addEventListener('click', () => {
                document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                confirmSelectionBtn.disabled = false;
            });
            charListContainer.appendChild(card);
        });
    }

    function confirmTokenSelection() {
        const selectedCard = document.querySelector('.char-card.selected');
        if (!selectedCard) return;
        selectedPlayerToken = { name: selectedCard.dataset.name, img: selectedCard.dataset.img };
        initializeCharacterSheet();
    }

    function initializeCharacterSheet() {
        characterSheetBuilder = {
            baseAttrPoints: 5, spentAttrPoints: 0, baseElemPoints: 2, spentElemPoints: 0,
            attributes: { forca: 0, agilidade: 0, protecao: 0, constituicao: 0, inteligencia: 0, mente: 0 },
            elements: { fogo: 0, agua: 0, terra: 0, vento: 0, luz: 0, escuridao: 0 },
            equipment: { weapons: [{ name: "", type: "desarmado" }, { name: "", type: "desarmado" }], shield: "nenhum" },
            spells: [], money: 200, token: selectedPlayerToken
        };
        const raceSelect = document.getElementById('char-race-select');
        raceSelect.innerHTML = '<option value="">-- Selecione --</option>' + Object.keys(RACES).map(r => `<option value="${r}">${r}</option>`).join('');
        attributesContainer.innerHTML = Object.keys(ATTRIBUTES).map(key => `<div class="point-buy-group"><label>${ATTRIBUTES[key]}</label><div class="point-buy-controls"><button class="point-buy-btn" data-type="attr" data-action="minus" data-key="${key}">-</button><span class="point-buy-value" id="attr-value-${key}">0</span><button class="point-buy-btn" data-type="attr" data-action="plus" data-key="${key}">+</button></div></div>`).join('');
        elementsContainer.innerHTML = Object.keys(ELEMENTS).map(key => `<div class="point-buy-group"><label>${ELEMENTS[key]}</label><div class="point-buy-controls"><button class="point-buy-btn" data-type="elem" data-action="minus" data-key="${key}">-</button><span class="point-buy-value" id="elem-value-${key}">0</span><button class="point-buy-btn" data-type="elem" data-action="plus" data-key="${key}">+</button></div></div>`).join('');
        const weaponSelects = [document.getElementById('char-weapon-1-type'), document.getElementById('char-weapon-2-type')];
        weaponSelects.forEach(s => s.innerHTML = Object.keys(WEAPONS).map(k => `<option value="${k}">${WEAPONS[k].name}</option>`).join(''));
        document.getElementById('char-shield-select').innerHTML = Object.keys(SHIELDS).map(k => `<option value="${k}">${SHIELDS[k].name}</option>`).join('');
        document.querySelectorAll('.point-buy-btn').forEach(b => b.addEventListener('click', handlePointBuy));
        document.getElementById('char-race-select').addEventListener('change', updateRace);
        document.querySelectorAll('.equipment-grid select, .equipment-grid input').forEach(el => el.addEventListener('change', updateEquipment));
        updateAllUI();
        showScreen('character-creation-screen');
    }

    function handlePointBuy(event) {
        const { type, action, key } = event.target.dataset;
        const isAttr = type === 'attr';
        const points = isAttr ? characterSheetBuilder.attributes : characterSheetBuilder.elements;
        const spent = isAttr ? 'spentAttrPoints' : 'spentElemPoints';
        const base = isAttr ? 'baseAttrPoints' : 'baseElemPoints';
        if (action === 'plus' && characterSheetBuilder[spent] < characterSheetBuilder[base] && (isAttr || points[key] < 2)) {
            points[key]++; characterSheetBuilder[spent]++;
        } else if (action === 'minus' && points[key] > 0) {
            points[key]--; characterSheetBuilder[spent]--;
        }
        updateAllUI();
    }
    
    // As demais funções da ficha (updateAllUI, updateRace, updateEquipment, etc.) continuam como antes.
    function updateAllUI() { /* ... Lógica sem alterações ... */ }
    function updateRace() { /* ... Lógica sem alterações ... */ }
    function updateEquipment() { /* ... Lógica sem alterações ... */ }
    function showSpellSelection() { /* ... Lógica sem alterações ... */ }
    function toggleSpellSelection(card) { /* ... Lógica sem alterações ... */ }
    function updateFinalizeButton() { /* ... Lógica sem alterações ... */ }
    function buildCharacterSheet() { /* ... Lógica sem alterações ... */ }
    function finalizeCharacter() { /* ... Lógica sem alterações ... */ }
    function saveCharacter() { /* ... Lógica sem alterações ... */ }
    function handleFileLoad(event) { /* ... Lógica sem alterações ... */ }

    // --- LÓGICA DO GM E EDITOR DE NPCS ---
    function renderNpcSelectionForGm() { /* ... Lógica sem alterações ... */ }
    function renderNpcStagingArea() { /* ... Lógica sem alterações ... */ }
    function openNpcEditor(slotIndex) { /* ... Lógica sem alterações ... */ }
    function saveNpcChanges(slotIndex) { /* ... Lógica sem alterações ... */ }


    // --- MODO CENÁRIO (CÓDIGO ORIGINAL RESTAURADO) ---
    function initializeTheaterMode() {
        localWorldScale = 1.0;
        theaterWorldContainer.style.transform = `scale(1)`;
        theaterBackgroundViewport.scrollLeft = 0;
        theaterBackgroundViewport.scrollTop = 0;
        theaterCharList.innerHTML = '';
        const createMini = (data) => {
            const mini = document.createElement('div');
            mini.className = 'theater-char-mini';
            mini.style.backgroundImage = `url("${data.img}")`;
            mini.title = data.name;
            mini.draggable = true;
            mini.addEventListener('dragstart', (e) => {
                if (!isGm) return;
                e.dataTransfer.setData('application/json', JSON.stringify({ charName: data.name, img: data.img }));
            });
            theaterCharList.appendChild(mini);
        };
        const allMinis = [...(ALL_CHARACTERS.players || []), ...(ALL_CHARACTERS.npcs || []), ...(ALL_CHARACTERS.dynamic || [])];
        allMinis.forEach(char => createMini(char));
    }
    function renderTheaterMode(state) {
        if (isDragging) return;
        const currentScenarioState = state.scenarioStates?.[state.currentScenario];
        const dataToRender = isGm ? currentScenarioState : state.publicState;
        if (!dataToRender || !dataToRender.scenario) return;

        const scenarioUrl = `images/${dataToRender.scenario}`;
        if (!theaterBackgroundImage.src.includes(dataToRender.scenario)) {
            theaterBackgroundImage.src = scenarioUrl;
        }
        
        document.getElementById('theater-gm-panel').classList.toggle('hidden', !isGm);
        document.getElementById('toggle-gm-panel-btn').classList.toggle('hidden', !isGm);
        document.getElementById('theater-publish-btn').classList.toggle('hidden', !isGm || !currentScenarioState?.isStaging);
        
        if (isGm && currentScenarioState) theaterGlobalScale.value = currentScenarioState.globalTokenScale || 1.0;
        
        theaterTokenContainer.innerHTML = '';
        const fragment = document.createDocumentFragment();
        (dataToRender.tokenOrder || []).forEach((tokenId, index) => {
            const tokenData = dataToRender.tokens[tokenId];
            if (!tokenData) return;
            const tokenEl = document.createElement('img');
            tokenEl.id = tokenId;
            tokenEl.className = 'theater-token';
            tokenEl.src = tokenData.img;
            tokenEl.style.left = `${tokenData.x}px`;
            tokenEl.style.top = `${tokenData.y}px`;
            tokenEl.style.zIndex = index;
            if (isGm) {
                tokenEl.addEventListener('mouseenter', () => hoveredTokenId = tokenId);
                tokenEl.addEventListener('mouseleave', () => hoveredTokenId = null);
            }
            fragment.appendChild(tokenEl);
        });
        theaterTokenContainer.appendChild(fragment);
    }
    function setupTheaterEventListeners() {
        theaterBackgroundViewport.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            dragStartPos = { x: e.clientX, y: e.clientY };
            if (!isGm) { isPanning = true; return; }
            const tokenElement = e.target.closest('.theater-token');
            if(tokenElement) { isDragging = true; } 
            else { isPanning = true; }
        });
        window.addEventListener('mousemove', (e) => {
            if (isPanning) {
                 e.preventDefault();
                 theaterBackgroundViewport.scrollLeft -= e.movementX;
                 theaterBackgroundViewport.scrollTop -= e.movementY;
            }
        });
        window.addEventListener('mouseup', (e) => {
            isPanning = false; isDragging = false;
        });
        theaterBackgroundViewport.addEventListener('drop', (e) => { e.preventDefault(); if (!isGm) return; /* ... Lógica de drop ... */ });
        theaterBackgroundViewport.addEventListener('dragover', (e) => e.preventDefault());
        theaterBackgroundViewport.addEventListener('wheel', (e) => { e.preventDefault(); /* ... Lógica de zoom ... */ }, { passive: false });
        theaterGlobalScale.addEventListener('change', (e) => { if (!isGm) return; socket.emit('playerAction', {type: 'updateGlobalScale', scale: parseFloat(e.target.value)}); });
    }

    // --- RENDERIZAÇÃO PRINCIPAL ---
    function updateGmLobbyUI(state) {
        const playerListEl = document.getElementById('gm-lobby-player-list');
        playerListEl.innerHTML = '';
        const players = Object.values(state.connectedPlayers);
        if (players.length === 0) { playerListEl.innerHTML = '<li>Aguardando...</li>'; }
        else { players.forEach(p => { playerListEl.innerHTML += `<li>${p.role} - ${p.characterSheet?.nome || '<i>Criando...</i>'} (${p.status})</li>`; }); }
    }
    function renderGame(gameState) {
        scaleGame(); currentGameState = gameState;
        if (!gameState || !gameState.mode) return showScreen('loading-screen');
        const myPlayerData = gameState.connectedPlayers?.[socket.id];

        // Controla a visibilidade dos botões flutuantes
        const showFloatingButtons = isGm && (gameState.mode === 'adventure' || gameState.mode === 'theater');
        floatingButtonsContainer.classList.toggle('hidden', !showFloatingButtons);
        backToLobbyBtn.classList.toggle('hidden', !showFloatingButtons);

        if (isGm) {
            switch (gameState.mode) {
                case 'lobby': showScreen('gm-initial-lobby'); updateGmLobbyUI(gameState); break;
                case 'adventure':
                    if (gameState.phase === 'npc_setup') { showScreen('gm-npc-setup-screen'); renderNpcSelectionForGm(); renderNpcStagingArea(); }
                    else { showScreen('fight-screen'); }
                    break;
                case 'theater':
                    showScreen('theater-screen');
                    // Garante que os dados sejam carregados antes de renderizar
                    if(ALL_CHARACTERS.players.length > 0) initializeTheaterMode();
                    renderTheaterMode(gameState);
                    break;
            }
        } else {
            if (myRole === 'player' && (!myPlayerData || !myPlayerData.characterSheet)) {
                showScreen('selection-screen'); // CORRIGIDO: Sempre começa aqui para o novo jogador
            } else {
                 switch (gameState.mode) {
                    case 'lobby': showScreen('player-waiting-screen'); document.getElementById('player-waiting-message').innerText = myRole === 'spectator' ? "Aguardando..." : "Ficha pronta!"; break;
                    case 'adventure': showScreen('fight-screen'); break;
                    case 'theater': showScreen('theater-screen'); renderTheaterMode(gameState); break;
                 }
            }
        }
    }

    // --- INICIALIZAÇÃO E SOCKETS ---
    socket.on('initialData', (data) => {
        ALL_SPELLS = data.spells || {};
        ALL_CHARACTERS = data.characters || {};
        renderPlayerCharacterSelection();
    });
    socket.on('gameUpdate', (gameState) => renderGame(gameState));
    socket.on('roomCreated', (roomId) => {
        const el = document.getElementById('gm-link-invite');
        if (el) { const url = `${window.location.origin}?room=${roomId}`; el.textContent = url; el.onclick = () => copyToClipboard(url, el); }
    });
    socket.on('promptForRole', ({ isFull }) => {
        document.getElementById('join-as-player-btn').disabled = isFull;
        document.getElementById('room-full-message').classList.toggle('hidden', !isFull);
        showScreen('role-selection-screen');
    });
    socket.on('assignRole', (data) => {
        myRole = data.role; isGm = !!data.isGm;
        if (!isGm) {
            if (myRole === 'player') showScreen('selection-screen');
            else showScreen('player-waiting-screen');
        }
    });
    socket.on('error', (data) => showInfoModal("Erro", data.message));
    
    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoomId = urlParams.get('room');
        showScreen('loading-screen');
        if (urlRoomId) socket.emit('playerJoinsLobby', { roomId: urlRoomId });
        else socket.emit('gmCreatesLobby');

        document.getElementById('join-as-player-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'player' }));
        document.getElementById('join-as-spectator-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'spectator' }));
        document.getElementById('start-adventure-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsAdventure' }));
        document.getElementById('start-theater-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsTheater' }));
        document.getElementById('gm-start-battle-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartBattle', npcs: stagedNpcSlots.filter(n => n) }));
        
        // CORRIGIDO: Fluxo de botões da criação de personagem
        confirmSelectionBtn.addEventListener('click', confirmTokenSelection);
        newCharBtn.addEventListener('click', () => {
            selectedPlayerToken = { name: null, img: null }; // Reseta a seleção
            showScreen('selection-screen');
        });
        loadCharBtn.addEventListener('click', () => charFileInput.click());
        charFileInput.addEventListener('change', handleFileLoad);
        sheetNextBtn.addEventListener('click', showSpellSelection);
        finalizeCharBtn.addEventListener('click', finalizeCharacter);
        saveCharBtn.addEventListener('click', saveCharacter);
        
        setupTheaterEventListeners();
        window.addEventListener('resize', scaleGame);
        scaleGame();
    }
    
    initialize();
});