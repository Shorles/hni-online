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

    // Dados do Jogo
    let ALL_CHARACTERS = { players: [], npcs: [], dynamic: [] };
    let ALL_SCENARIOS = {};
    let stagedNpcs = [];

    // Controles de UI
    let isTargeting = false;
    let targetingAttackerKey = null;

    // Variáveis do Modo Cenário
    let currentScenarioScale = 1.0;
    let isGroupSelectMode = false;
    let selectedTokens = new Set();
    let isDragging = false;
    let dragTarget = null;
    let dragOffsetX, dragOffsetY;
    let isSelectingBox = false;
    let selectionBoxStartX, selectionBoxStartY;

    // --- ELEMENTOS DO DOM ---
    const allScreens = document.querySelectorAll('.screen');
    const gameWrapper = document.getElementById('game-wrapper');
    const fightSceneCharacters = document.getElementById('fight-scene-characters');
    const actionButtonsWrapper = document.getElementById('action-buttons-wrapper');
    const theaterBackgroundViewport = document.getElementById('theater-background-viewport');
    const theaterBackgroundImage = document.getElementById('theater-background-image');
    const theaterTokenContainer = document.getElementById('theater-token-container');
    const theaterCharList = document.getElementById('theater-char-list');
    const theaterGlobalScale = document.getElementById('theater-global-scale');
    const selectionBox = document.getElementById('selection-box');

    // --- FUNÇÕES DE UTILIDADE ---
    function scaleGame() {
        const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
        gameWrapper.style.transform = `scale(${scale})`;
        gameWrapper.style.left = `${(window.innerWidth - (1280 * scale)) / 2}px`;
        gameWrapper.style.top = `${(window.innerHeight - (720 * scale)) / 2}px`;
    }

    function showScreen(screenToShow) {
        allScreens.forEach(screen => screen.classList.toggle('active', screen === screenToShow));
    }
    // ... (outras funções de utilidade sem alterações)

    // --- LÓGICA DO MODO AVENTURA ---
    function handleAdventureMode(gameState) {
        // ... (código existente sem alterações)
    }
    function updateUI(state) {
        // ... (código existente sem alterações)
    }
    // ... (todas as outras funções do Modo Aventura)

    // --- LÓGICA DO MODO CENÁRIO ---
    function initializeTheaterMode() {
        theaterCharList.innerHTML = '';
        const createMini = (name, imgPath) => {
            const mini = document.createElement('div');
            mini.className = 'theater-char-mini';
            mini.style.backgroundImage = `url("${imgPath}")`;
            mini.title = name;
            mini.draggable = true;
            mini.addEventListener('dragstart', (e) => {
                if (!isGm) return;
                e.dataTransfer.setData('application/json', JSON.stringify({ charName: name, img: imgPath }));
            });
            theaterCharList.appendChild(mini);
        };
        const allMinis = [...(ALL_CHARACTERS.players || []), ...(ALL_CHARACTERS.npcs || []), ...(ALL_CHARACTERS.dynamic || [])];
        allMinis.forEach(char => createMini(char.name, char.img));
    }

    function renderTheaterMode(state) {
        const currentScenarioState = state.scenarioStates?.[state.currentScenario];
        const dataToRender = isGm ? currentScenarioState : state.publicState;
        if (!dataToRender || !dataToRender.scenario) return;

        if (!theaterBackgroundImage.src.includes(dataToRender.scenario)) {
            const img = new Image();
            img.onload = () => {
                theaterBackgroundImage.src = img.src;
                document.getElementById('theater-world-container').style.width = `${img.naturalWidth}px`;
                document.getElementById('theater-world-container').style.height = `${img.naturalHeight}px`;
                if (isGm) socket.emit('playerAction', { type: 'update_scenario_dims', width: img.naturalWidth, height: img.naturalHeight });
                updateTheaterZoom();
            };
            img.src = `images/${dataToRender.scenario}`;
        }
        
        document.getElementById('theater-gm-panel').classList.toggle('hidden', !isGm);
        document.getElementById('toggle-gm-panel-btn').classList.toggle('hidden', !isGm);
        document.getElementById('theater-back-btn').classList.toggle('hidden', !isGm);
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
            tokenEl.dataset.scale = tokenData.scale || 1.0;
            tokenEl.dataset.flipped = String(!!tokenData.isFlipped);
            tokenEl.title = tokenData.charName;
            if (isGm && selectedTokens.has(tokenId)) tokenEl.classList.add('selected');
            fragment.appendChild(tokenEl);
        });
        theaterTokenContainer.appendChild(fragment);
        updateTheaterZoom();
    }
    
    function updateTheaterZoom() {
        const dataToRender = (isGm && currentGameState?.scenarioStates) ? currentGameState.scenarioStates[currentGameState.currentScenario] : currentGameState?.publicState;
        if (!dataToRender) return;
        const globalTokenScale = dataToRender.globalTokenScale || 1.0;
        document.getElementById('theater-world-container').style.transform = `scale(${currentScenarioScale})`;
        document.querySelectorAll('.theater-token').forEach(token => {
            const baseScale = parseFloat(token.dataset.scale) || 1;
            const isFlipped = token.dataset.flipped === 'true';
            token.style.transform = `scale(${baseScale * globalTokenScale}) ${isFlipped ? 'scaleX(-1)' : ''}`;
        });
    }

    function setupTheaterEventListeners() {
        const getGameScale = () => (window.getComputedStyle(gameWrapper).transform === 'none') ? 1 : new DOMMatrix(window.getComputedStyle(gameWrapper).transform).a;
        const screenToWorldCoords = (e) => {
            const gameScale = getGameScale();
            const viewportRect = theaterBackgroundViewport.getBoundingClientRect();
            return {
                worldX: (e.clientX - viewportRect.left) / gameScale / currentScenarioScale + theaterBackgroundViewport.scrollLeft / currentScenarioScale,
                worldY: (e.clientY - viewportRect.top) / gameScale / currentScenarioScale + theaterBackgroundViewport.scrollTop / currentScenarioScale
            };
        };

        theaterBackgroundViewport.addEventListener('mousedown', (e) => {
            if (!isGm || e.button !== 0) return;
            dragTarget = e.target.closest('.theater-token');
            if (dragTarget) { // Clicou em um token existente
                isDragging = true;
                const tokenRect = dragTarget.getBoundingClientRect();
                const gameScale = getGameScale();
                dragOffsetX = (e.clientX - tokenRect.left) / gameScale / currentScenarioScale;
                dragOffsetY = (e.clientY - tokenRect.top) / gameScale / currentScenarioScale;
                if (!e.ctrlKey && !selectedTokens.has(dragTarget.id)) {
                    selectedTokens.clear();
                    selectedTokens.add(dragTarget.id);
                } else if (e.ctrlKey) {
                    selectedTokens.has(dragTarget.id) ? selectedTokens.delete(dragTarget.id) : selectedTokens.add(dragTarget.id);
                }
                renderTheaterMode(currentGameState);
            } else if (isGroupSelectMode) { // Clicou no fundo em modo de seleção
                isSelectingBox = true;
                const { worldX, worldY } = screenToWorldCoords(e);
                selectionBoxStartX = worldX;
                selectionBoxStartY = worldY;
                selectionBox.style.left = `${selectionBoxStartX}px`;
                selectionBox.style.top = `${selectionBoxStartY}px`;
                selectionBox.style.width = '0px';
                selectionBox.style.height = '0px';
                selectionBox.classList.remove('hidden');
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!isGm) return;
            const { worldX, worldY } = screenToWorldCoords(e);
            if (isDragging && dragTarget) {
                dragTarget.style.left = `${worldX - dragOffsetX}px`;
                dragTarget.style.top = `${worldY - dragOffsetY}px`;
            } else if (isSelectingBox) {
                const width = Math.abs(worldX - selectionBoxStartX);
                const height = Math.abs(worldY - selectionBoxStartY);
                const left = Math.min(worldX, selectionBoxStartX);
                const top = Math.min(worldY, selectionBoxStartY);
                selectionBox.style.left = `${left}px`;
                selectionBox.style.top = `${top}px`;
                selectionBox.style.width = `${width}px`;
                selectionBox.style.height = `${height}px`;
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (!isGm) return;
            if (isDragging && dragTarget) {
                const { worldX, worldY } = screenToWorldCoords(e);
                socket.emit('playerAction', { type: 'updateToken', token: { id: dragTarget.id, x: worldX - dragOffsetX, y: worldY - dragOffsetY } });
            } else if (isSelectingBox) {
                selectionBox.classList.add('hidden');
                selectedTokens.clear();
                const boxRect = selectionBox.getBoundingClientRect();
                document.querySelectorAll('.theater-token').forEach(token => {
                    const tokenRect = token.getBoundingClientRect();
                    if (boxRect.left < tokenRect.right && boxRect.right > tokenRect.left && boxRect.top < tokenRect.bottom && boxRect.bottom > tokenRect.top) {
                        selectedTokens.add(token.id);
                    }
                });
                renderTheaterMode(currentGameState);
            }
            isDragging = false;
            isSelectingBox = false;
            dragTarget = null;
        });

        theaterBackgroundViewport.addEventListener('drop', (e) => {
            e.preventDefault(); if (!isGm) return;
            try {
                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                const { worldX, worldY } = screenToWorldCoords(e);
                socket.emit('playerAction', { type: 'updateToken', token: { id: `token-${Date.now()}`, charName: data.charName, img: data.img, x: worldX - 100, y: worldY - 100, scale: 1.0, isFlipped: false }});
            } catch (error) { console.error("Drop error:", error); }
        });

        theaterBackgroundViewport.addEventListener('wheel', (e) => {
            const token = e.target.closest('.theater-token');
            if (isGm && token && token.matches(':hover')) {
                e.preventDefault();
                const tokenData = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[token.id];
                const newScale = (tokenData.scale || 1.0) + (e.deltaY > 0 ? -0.1 : 0.1);
                socket.emit('playerAction', { type: 'updateToken', token: { id: token.id, scale: Math.max(0.1, newScale) }});
            }
        }, { passive: false });
    }

    function initializeGlobalKeyListeners() {
        window.addEventListener('keydown', (e) => {
            if (!isGm || !currentGameState || currentGameState.mode !== 'theater') return;
            const focusedEl = document.activeElement;
            if (focusedEl.tagName === 'INPUT' || focusedEl.tagName === 'TEXTAREA') return;

            if (e.key.toLowerCase() === 'g') {
                e.preventDefault();
                isGroupSelectMode = !isGroupSelectMode;
                theaterBackgroundViewport.classList.toggle('group-select-mode', isGroupSelectMode);
                if (!isGroupSelectMode) {
                    selectedTokens.clear();
                    renderTheaterMode(currentGameState);
                }
            }

            if (selectedTokens.size > 0) {
                if (e.key.toLowerCase() === 'f') {
                    selectedTokens.forEach(tokenId => {
                        const tokenData = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[tokenId];
                        if (tokenData) socket.emit('playerAction', { type: 'updateToken', token: { id: tokenId, isFlipped: !tokenData.isFlipped } });
                    });
                } else if (e.key === 'Delete') {
                    socket.emit('playerAction', { type: 'updateToken', token: { remove: true, ids: Array.from(selectedTokens) } });
                    selectedTokens.clear();
                }
            }
        });
    }

    // --- INICIALIZAÇÃO E LISTENERS DE SOCKET ---
    socket.on('initialData', (data) => {
        ALL_CHARACTERS = data.characters || { players: [], npcs: [], dynamic: [] };
        ALL_SCENARIOS = data.scenarios || {};
    });

    socket.on('roomCreated', (roomId) => {
        if (isGm) {
            const baseUrl = window.location.origin;
            document.getElementById('gm-link-player').textContent = `${baseUrl}?room=${roomId}&role=player`;
            document.getElementById('gm-link-spectator').textContent = `${baseUrl}?room=${roomId}&role=spectator`;
        }
    });

    socket.on('assignRole', (data) => {
        myRole = data.role;
        myPlayerKey = data.playerKey || null;
        isGm = !!data.isGm;
    });

    socket.on('gameUpdate', (gameState) => {
        const justEnteredTheater = gameState.mode === 'theater' && (!currentGameState || currentGameState.mode !== 'theater');
        oldGameState = currentGameState;
        currentGameState = gameState;
        
        // Lógica de roteamento de tela totalmente refeita e corrigida
        if (!gameState.mode || gameState.mode === 'lobby') {
            if (isGm) {
                showScreen(document.getElementById('gm-initial-lobby'));
                updateGmLobbyUI(gameState);
            } else {
                const myPlayerData = gameState.connectedPlayers[socket.id];
                if (myRole === 'player' && myPlayerData && !myPlayerData.selectedCharacter) {
                    showScreen(document.getElementById('selection-screen'));
                    renderPlayerCharacterSelection(gameState.unavailableCharacters);
                } else {
                    showScreen(document.getElementById('player-waiting-screen'));
                    const msgEl = document.getElementById('player-waiting-message');
                    if (myRole === 'player' && myPlayerData?.selectedCharacter) msgEl.innerText = "Personagem enviado! Aguardando o Mestre...";
                    else if (myRole === 'spectator') msgEl.innerText = "Aguardando como espectador...";
                    else msgEl.innerText = "Aguardando o Mestre iniciar o jogo...";
                }
            }
        } else if (gameState.mode === 'adventure') {
            handleAdventureMode(gameState);
        } else if (gameState.mode === 'theater') {
            if (isGm && justEnteredTheater) initializeTheaterMode();
            showScreen(document.getElementById('theater-screen'));
            renderTheaterMode(gameState);
        }
    });

    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoomId = urlParams.get('room');
        const urlRole = urlParams.get('role');

        showScreen(document.getElementById('loading-screen')); // Tela inicial padrão

        if (urlRoomId && urlRole) {
            socket.emit('playerJoinsLobby', { roomId: urlRoomId, role: urlRole });
        } else {
            socket.emit('gmCreatesLobby');
        }

        document.getElementById('start-adventure-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsAdventure' }));
        document.getElementById('start-theater-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsTheater' }));
        document.getElementById('theater-back-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmGoesBackToLobby' }));
        actionButtonsWrapper.addEventListener('click', handleActionClick);
        
        setupTheaterEventListeners();
        initializeGlobalKeyListeners();
        window.addEventListener('resize', scaleGame);
        scaleGame();
    }
    
    initialize();
});