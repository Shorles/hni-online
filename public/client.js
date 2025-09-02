// client.js

document.addEventListener('DOMContentLoaded', () => {
    // --- VARIÁVEIS DE REGRAS DO JOGO (CARREGADAS DE JSON) ---
    let GAME_RULES = {};
    let ALL_SPELLS = {};
    let tempCharacterSheet = {};

    // --- VARIÁVEIS DE ESTADO ---
    let myRole = null, myPlayerKey = null, isGm = false;
    let currentGameState = null, oldGameState = null;
    let defeatAnimationPlayed = new Set();
    const socket = io();
    let myRoomId = null; 
    let coordsModeActive = false;
    let clientFlowState = 'initializing';
    let ALL_CHARACTERS = { players: [], npcs: [], dynamic: [] };
    let ALL_SCENARIOS = {};
    let stagedNpcSlots = new Array(5).fill(null);
    let selectedSlotIndex = null;
    const MAX_NPCS = 5;
    let isTargeting = false;
    let targetingAction = null;
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
    function scaleGame() {
        setTimeout(() => {
            const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
            gameWrapper.style.transform = `scale(${scale})`;
            gameWrapper.style.left = `${(window.innerWidth - (1280 * scale)) / 2}px`;
            gameWrapper.style.top = `${(window.innerHeight - (720 * scale)) / 2}px`;
        }, 10);
    }
    function showScreen(screenToShow) {
        allScreens.forEach(screen => screen.classList.toggle('active', screen === screenToShow));
    }
    function showInfoModal(title, text, showButton = true) {
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-text').innerHTML = text;
        const oldButtons = document.getElementById('modal-content').querySelector('.modal-button-container');
        if (oldButtons) oldButtons.remove();

        const modalButton = document.getElementById('modal-button');
        modalButton.classList.toggle('hidden', !showButton);
        modal.classList.remove('hidden');
        modalButton.onclick = () => modal.classList.add('hidden');
    }
    function showCustomModal(title, contentHtml, buttons) {
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-text').innerHTML = contentHtml;
        document.getElementById('modal-button').classList.add('hidden');
        
        const oldButtons = document.getElementById('modal-content').querySelector('.modal-button-container');
        if (oldButtons) oldButtons.remove();

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'modal-button-container';

        buttons.forEach(btnInfo => {
            const button = document.createElement('button');
            button.textContent = btnInfo.text;
            button.className = btnInfo.className || '';
            button.onclick = () => {
                if (btnInfo.onClick) btnInfo.onClick();
                if (btnInfo.closes) modal.classList.add('hidden');
            };
            buttonContainer.appendChild(button);
        });
        
        document.getElementById('modal-content').appendChild(buttonContainer);
        modal.classList.remove('hidden');
    }
    function getGameScale() { return (window.getComputedStyle(gameWrapper).transform === 'none') ? 1 : new DOMMatrix(window.getComputedStyle(gameWrapper).transform).a; }
    function copyToClipboard(text, element) {
        if (!element) return;
        navigator.clipboard.writeText(text).then(() => {
            const originalHTML = element.innerHTML;
            const isButton = element.tagName === 'BUTTON';
            element.innerHTML = 'Copiado!';
            if (isButton) element.style.fontSize = '14px';
            setTimeout(() => {
                element.innerHTML = originalHTML;
                if (isButton) element.style.fontSize = '24px';
            }, 2000);
        });
    }
    function cancelTargeting() {
        isTargeting = false;
        targetingAction = null;
        document.getElementById('targeting-indicator').classList.add('hidden');
    }
    function getFighter(state, key) {
        if (!state || !state.fighters || !key) return null;
        return state.fighters.players[key] || state.fighters.npcs[key];
    }

    // =================================================================
    // ================= FUNÇÃO PRINCIPAL DE RENDERIZAÇÃO ==============
    // =================================================================
    function renderGame(gameState) {
        oldGameState = currentGameState;
        currentGameState = gameState;

        if (!gameState || !gameState.mode || !gameState.connectedPlayers) {
            showScreen(document.getElementById('loading-screen'));
            return;
        }

        scaleGame(); 

        if (gameState.mode === 'adventure' && gameState.customPositions) customFighterPositions = gameState.customPositions;
        
        const myPlayerData = gameState.connectedPlayers?.[socket.id];
        if (myRole === 'player' && myPlayerData && !myPlayerData.characterFinalized) {
             const currentScreen = document.querySelector('.screen.active');
             if (currentScreen.id !== 'character-sheet-screen' && currentScreen.id !== 'player-initial-choice-screen' && currentScreen.id !== 'selection-screen') {
                 showScreen(document.getElementById('player-waiting-screen'));
             }
             return;
        }
        
        if (gameState.mode === 'adventure' && gameState.scenario) gameWrapper.style.backgroundImage = `url('images/${gameState.scenario}')`;
        else if (gameState.mode === 'lobby') gameWrapper.style.backgroundImage = `url('images/mapas/cenarios externos/externo (1).png')`;
        else gameWrapper.style.backgroundImage = 'none';

        document.getElementById('turn-order-sidebar').classList.add('hidden');
        floatingButtonsContainer.classList.add('hidden');
        document.getElementById('waiting-players-sidebar').classList.add('hidden');
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
                    const myPlayer = gameState.connectedPlayers[socket.id];
                    if (myPlayer && myPlayer.characterFinalized) {
                        showScreen(document.getElementById('player-waiting-screen'));
                        document.getElementById('player-waiting-message').innerText = "Aguardando o Mestre iniciar o jogo...";
                    }
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
    
    // --- LÓGICA DO MODO AVENTURA ---
    function handleAdventureMode(gameState) {
        const fightScreen = document.getElementById('fight-screen');

        if (isGm) {
            switch (gameState.phase) {
                case 'npc_setup': 
                    showScreen(document.getElementById('gm-npc-setup-screen')); 
                    if (!oldGameState || oldGameState.phase !== 'npc_setup') {
                        stagedNpcSlots.fill(null);
                        selectedSlotIndex = null;
                        customFighterPositions = {};
                        renderNpcSelectionForGm(); 
                    } 
                    renderNpcStagingArea();
                    break;
                case 'initiative_roll': 
                case 'battle':
                default: 
                    showScreen(fightScreen); 
                    updateAdventureUI(gameState);
                    if (gameState.phase === 'initiative_roll') {
                        renderInitiativeUI(gameState);
                    } else {
                        initiativeUI.classList.add('hidden');
                    }
            }
        } else {
            const amIInTheFight = !!getFighter(gameState, myPlayerKey);
            if (myRole === 'player' && !amIInTheFight) {
                showScreen(document.getElementById('player-waiting-screen'));
                document.getElementById('player-waiting-message').innerText = "Aguardando o Mestre...";
            }
            else if (['npc_setup'].includes(gameState.phase)) {
                showScreen(document.getElementById('player-waiting-screen'));
                document.getElementById('player-waiting-message').innerText = "O Mestre está preparando a aventura...";
            } 
            else {
                showScreen(fightScreen); 
                updateAdventureUI(gameState);
                if (gameState.phase === 'initiative_roll') {
                    renderInitiativeUI(gameState);
                } else {
                    initiativeUI.classList.add('hidden');
                }
            }
        }
    }
    
    function updateGmLobbyUI(state) {
        const playerListEl = document.getElementById('gm-lobby-player-list');
        if (!playerListEl || !state || !state.connectedPlayers) return;
        playerListEl.innerHTML = '';
        const connectedPlayers = Object.values(state.connectedPlayers);
        if (connectedPlayers.length === 0) { playerListEl.innerHTML = '<li>Aguardando jogadores...</li>'; } 
        else {
            connectedPlayers.forEach(p => {
                const charName = p.characterName || '<i>Criando ficha...</i>';
                playerListEl.innerHTML += `<li>${p.role === 'player' ? 'Jogador' : 'Espectador'} - Personagem: ${charName}</li>`;
            });
        }
    }

    function renderPlayerTokenSelection() {
        // ... (código sem alterações)
    }
    
    function renderNpcSelectionForGm() {
        // ... (código sem alterações)
    }

    function renderNpcStagingArea() {
        // ... (código sem alterações)
    }

    function showNpcConfigModal(slotIndex) {
        // ... (código sem alterações)
    }

    function updateAdventureUI(state) {
        // ... (código sem alterações)
    }
    
    function createFighterElement(fighter, type, state, position) {
        // ... (código sem alterações)
    }
    
    function renderActionButtons(state) {
        // ... (código sem alterações)
    }

    function startAttackSequence() {
        // ... (código sem alterações)
    }
    
    function startSpellSequence(spell) {
        // ... (código sem alterações)
    }

    function renderInitiativeUI(state) {
        // ... (código sem alterações)
    }

    function renderTurnOrderUI(state) {
        // ... (código sem alterações)
    }

    function renderWaitingPlayers(state) {
        // ... (código sem alterações)
    }

    function showPartSelectionModal(targetFighter) {
        // ... (código sem alterações)
    }

    function handleTargetClick(event) {
        // ... (código sem alterações)
    }
    
    function showCheatModal() {
        // ... (código sem alterações)
    }
    
    function handleCheatAddNpc() {
        // ... (código sem alterações)
    }

    function selectNpcForSlot(slotIndex) {
        // ... (código sem alterações)
    }

    function makeFightersDraggable(isDraggable) {
        // ... (código sem alterações)
    }
    function onFighterMouseDown(e) {
        // ... (código sem alterações)
    }
    function onFighterMouseMove(e) {
        // ... (código sem alterações)
    }
    function onFighterMouseUp() {
        // ... (código sem alterações)
    }
    function showHelpModal() {
        // ... (código sem alterações)
    }
    
    // --- LÓGICA DO MODO CENÁRIO (RESTAURADA À VERSÃO ORIGINAL) ---
    function initializeTheaterMode() {
        localWorldScale = 1.0;
        theaterWorldContainer.style.transform = "scale(1)";
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
                if (isGm) e.dataTransfer.setData('application/json', JSON.stringify({ charName: data.name, img: data.img }));
            });
            theaterCharList.appendChild(mini);
        };
        [...(ALL_CHARACTERS.players || []), ...(ALL_CHARACTERS.npcs || []), ...(ALL_CHARACTERS.dynamic || [])].forEach(createMini);
    }

    function renderTheaterMode(state) {
        if (isDragging) return;
        const currentScenarioState = state.scenarioStates?.[state.currentScenario];
        const dataToRender = isGm ? currentScenarioState : state.publicState;
        if (!dataToRender || !dataToRender.scenario) return;

        const scenarioUrl = `images/${dataToRender.scenario}`;
        if (!theaterBackgroundImage.src.includes(dataToRender.scenario)) {
            const img = new Image();
            img.onload = () => {
                theaterBackgroundImage.src = img.src;
                theaterWorldContainer.style.width = `${img.naturalWidth}px`;
                theaterWorldContainer.style.height = `${img.naturalHeight}px`;
                if (isGm) socket.emit('playerAction', { type: 'update_scenario_dims', width: img.naturalWidth, height: img.naturalHeight });
            };
            img.src = scenarioUrl;
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
            tokenEl.dataset.scale = tokenData.scale || 1.0;
            tokenEl.dataset.flipped = String(!!tokenData.isFlipped);
            tokenEl.title = tokenData.charName;
            
            const globalTokenScale = dataToRender.globalTokenScale || 1.0;
            const baseScale = parseFloat(tokenEl.dataset.scale);
            const isFlipped = tokenEl.dataset.flipped === 'true';
            tokenEl.style.transform = `scale(${baseScale * globalTokenScale}) ${isFlipped ? 'scaleX(-1)' : ''}`;
            
            if (isGm) {
                if (selectedTokens.has(tokenId)) tokenEl.classList.add('selected');
                tokenEl.addEventListener('mouseenter', () => hoveredTokenId = tokenId);
                tokenEl.addEventListener('mouseleave', () => hoveredTokenId = null);
            }
            fragment.appendChild(tokenEl);
        });
        theaterTokenContainer.appendChild(fragment);
    }
    
    function setupTheaterEventListeners() {
        const viewport = theaterBackgroundViewport;
        viewport.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            dragStartPos = { x: e.clientX, y: e.clientY };
            if (isGm) {
                const tokenElement = e.target.closest('.theater-token');
                if (isGroupSelectMode && !tokenElement) {
                    isSelectingBox = true;
                    selectionBoxStartPos = { x: e.clientX, y: e.clientY };
                    const gameScale = getGameScale(), viewportRect = viewport.getBoundingClientRect();
                    const startX = (e.clientX - viewportRect.left) / gameScale, startY = (e.clientY - viewportRect.top) / gameScale;
                    Object.assign(selectionBox.style, { left: `${startX}px`, top: `${startY}px`, width: '0px', height: '0px' });
                    selectionBox.classList.remove('hidden');
                    return;
                }
                if (tokenElement) {
                    isDragging = true;
                    if (!e.ctrlKey && !selectedTokens.has(tokenElement.id)) selectedTokens.clear();
                    if (e.ctrlKey) {
                        selectedTokens.has(tokenElement.id) ? selectedTokens.delete(tokenElement.id) : selectedTokens.add(tokenElement.id);
                    } else {
                        selectedTokens.add(tokenElement.id);
                    }
                    dragOffsets.clear();
                    selectedTokens.forEach(id => {
                        const tokenData = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[id];
                        if (tokenData) dragOffsets.set(id, { startX: tokenData.x, startY: tokenData.y });
                    });
                    renderTheaterMode(currentGameState);
                } else if (!isGroupSelectMode) {
                    if (selectedTokens.size > 0) selectedTokens.clear();
                    renderTheaterMode(currentGameState);
                    isPanning = true;
                }
            } else {
                isPanning = true;
            }
        });
        window.addEventListener('mousemove', (e) => {
            if (isGm && isDragging) {
                e.preventDefault();
                requestAnimationFrame(() => {
                    const gameScale = getGameScale();
                    const deltaX = (e.clientX - dragStartPos.x) / gameScale / localWorldScale;
                    const deltaY = (e.clientY - dragStartPos.y) / gameScale / localWorldScale;
                    selectedTokens.forEach(id => {
                        const tokenEl = document.getElementById(id);
                        const initialPos = dragOffsets.get(id);
                        if (tokenEl && initialPos) {
                            tokenEl.style.left = `${initialPos.startX + deltaX}px`;
                            tokenEl.style.top = `${initialPos.startY + deltaY}px`;
                        }
                    });
                });
            } else if (isGm && isSelectingBox) {
                e.preventDefault();
                const gameScale = getGameScale(), viewportRect = viewport.getBoundingClientRect();
                const currentX = (e.clientX - viewportRect.left) / gameScale, currentY = (e.clientY - viewportRect.top) / gameScale;
                const startX = (selectionBoxStartPos.x - viewportRect.left) / gameScale, startY = (selectionBoxStartPos.y - viewportRect.top) / gameScale;
                Object.assign(selectionBox.style, { left: `${Math.min(currentX, startX)}px`, top: `${Math.min(currentY, startY)}px`, width: `${Math.abs(currentX - startX)}px`, height: `${Math.abs(currentY - startY)}px` });
            } else if (isPanning) {
                e.preventDefault();
                viewport.scrollLeft -= e.movementX;
                viewport.scrollTop -= e.movementY;
            }
        });
        window.addEventListener('mouseup', (e) => {
            if (isGm && isDragging) {
                isDragging = false;
                const gameScale = getGameScale();
                const deltaX = (e.clientX - dragStartPos.x) / gameScale / localWorldScale;
                const deltaY = (e.clientY - dragStartPos.y) / gameScale / localWorldScale;
                selectedTokens.forEach(id => {
                    const initialPos = dragOffsets.get(id);
                    if (initialPos) socket.emit('playerAction', { type: 'updateToken', token: { id, x: initialPos.startX + deltaX, y: initialPos.startY + deltaY } });
                });
            } else if (isGm && isSelectingBox) {
                const boxRect = selectionBox.getBoundingClientRect();
                isSelectingBox = false;
                selectionBox.classList.add('hidden');
                if (!e.ctrlKey) selectedTokens.clear();
                document.querySelectorAll('.theater-token').forEach(token => {
                    const tokenRect = token.getBoundingClientRect();
                    if (boxRect.left < tokenRect.right && boxRect.right > tokenRect.left && boxRect.top < tokenRect.bottom && boxRect.bottom > tokenRect.top) {
                        e.ctrlKey && selectedTokens.has(token.id) ? selectedTokens.delete(token.id) : selectedTokens.add(token.id);
                    }
                });
                renderTheaterMode(currentGameState);
            }
            isPanning = false;
        });
        viewport.addEventListener('drop', (e) => {
            e.preventDefault(); 
            if (!isGm) return;
            try {
                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                const tokenWidth = 200, gameScale = getGameScale(), viewportRect = viewport.getBoundingClientRect();
                const finalX = ((e.clientX - viewportRect.left) / gameScale + viewport.scrollLeft) / localWorldScale - (tokenWidth / 2);
                const finalY = ((e.clientY - viewportRect.top) / gameScale + viewport.scrollTop) / localWorldScale - (tokenWidth / 2);
                socket.emit('playerAction', { type: 'updateToken', token: { id: `token-${Date.now()}`, charName: data.charName, img: data.img, x: finalX, y: finalY, scale: 1.0, isFlipped: false }});
            } catch (error) { console.error("Drop error:", error); }
        });
        viewport.addEventListener('dragover', (e) => e.preventDefault());
        viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (isGm && hoveredTokenId && selectedTokens.has(hoveredTokenId)) {
                const tokenData = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[hoveredTokenId];
                if (tokenData) {
                    const newScale = (tokenData.scale || 1.0) + (e.deltaY > 0 ? -0.1 : 0.1);
                    selectedTokens.forEach(id => socket.emit('playerAction', { type: 'updateToken', token: { id, scale: Math.max(0.1, newScale) }}));
                }
            } else {
                const zoomIntensity = 0.05, scrollDirection = e.deltaY < 0 ? 1 : -1;
                const newScale = Math.max(0.2, Math.min(localWorldScale + (zoomIntensity * scrollDirection), 5));
                const rect = viewport.getBoundingClientRect();
                const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
                const worldX = (mouseX + viewport.scrollLeft) / localWorldScale, worldY = (mouseY + viewport.scrollTop) / localWorldScale;
                localWorldScale = newScale;
                theaterWorldContainer.style.transform = `scale(${localWorldScale})`;
                viewport.scrollLeft = worldX * localWorldScale - mouseX;
                viewport.scrollTop = worldY * localWorldScale - mouseY;
            }
        }, { passive: false });
        
        theaterGlobalScale.addEventListener('input', (e) => {
             if (isGm) socket.emit('playerAction', {type: 'updateGlobalScale', scale: parseFloat(e.target.value)});
        });
    }
    
    function initializeGlobalKeyListeners() {
        // ... (código restaurado, sem alterações)
    }
    
    function showScenarioSelectionModal(){
        // ... (código sem alterações)
    }
    
    // --- LÓGICA DA FICHA DE PERSONAGEM (ALMARA RPG) ---
    function initializeCharacterSheet() {
        // ... (código sem alterações)
    }
    
    function updateCharacterSheet(event = null) {
        // ... (código sem alterações)
    }

    function handleSaveCharacter() {
        // ... (código sem alterações)
    }
    
    function handleLoadCharacter(event) {
        // ... (código sem alterações)
    }

    function handleConfirmCharacter() {
        // ... (código sem alterações)
    }
    
    // --- INICIALIZAÇÃO E LISTENERS DE SOCKET ---
    socket.on('initialData', (data) => {
        ALL_CHARACTERS = data.characters || { players: [], npcs: [], dynamic: [] };
        ALL_SCENARIOS = data.scenarios || {};
    });

    socket.on('gameUpdate', (gameState) => { 
        if (clientFlowState === 'initializing') {
            currentGameState = gameState; // Guarda o estado para quando o cliente estiver pronto
            return; 
        }
        renderGame(gameState); 
    });

    socket.on('fighterMoved', ({ fighterId, position }) => {
        customFighterPositions[fighterId] = position;
        const fighterEl = document.getElementById(fighterId);
        if (fighterEl) {
            fighterEl.style.left = position.left;
            fighterEl.style.top = position.top;
        }
    });
    socket.on('roomCreated', (roomId) => {
        myRoomId = roomId;
        const inviteLinkEl = document.getElementById('gm-link-invite');
        const inviteUrl = `${window.location.origin}?room=${roomId}`;
        if (inviteLinkEl) { 
            inviteLinkEl.textContent = inviteUrl; 
            inviteLinkEl.onclick = () => copyToClipboard(inviteUrl, inviteLinkEl); 
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
        myRole = data.role; myPlayerKey = data.playerKey || socket.id; isGm = !!data.isGm;
        clientFlowState = 'in_game';
        if (myRole === 'player') showScreen(document.getElementById('player-initial-choice-screen'));

        // Agora que o papel está definido, processa o estado do jogo que pode ter chegado antes
        if (currentGameState) {
            renderGame(currentGameState);
        }
    });
    socket.on('promptForAdventureType', () => { if (isGm) showCustomModal('Retornar à Aventura', 'Deseja continuar a aventura anterior ou começar uma nova batalha?', [{text: 'Continuar Batalha', closes: true, onClick: () => socket.emit('playerAction', { type: 'gmChoosesAdventureType', choice: 'continue' })}, {text: 'Nova Batalha', closes: true, onClick: () => socket.emit('playerAction', { type: 'gmChoosesAdventureType', choice: 'new' })}]); });
    socket.on('attackResolved', ({ attackerKey, targetKey, hit }) => {
        const attackerEl = document.getElementById(attackerKey);
        if (attackerEl) {
            const isPlayer = attackerEl.classList.contains('player-char-container');
            const originalLeft = attackerEl.style.left;
            attackerEl.style.left = `${parseFloat(originalLeft) + (isPlayer ? 200 : -200)}px`;
            setTimeout(() => { attackerEl.style.left = originalLeft; }, 500);
        }
        const targetEl = document.getElementById(targetKey);
        if (targetEl && hit) {
            const img = targetEl.querySelector('.fighter-img-ingame');
            if (img) {
                img.classList.add('is-hit-flash');
                setTimeout(() => img.classList.remove('is-hit-flash'), 400);
            }
        }
    });
    socket.on('fleeResolved', ({ actorKey }) => {
        const actorEl = document.getElementById(actorKey);
        if (actorEl) actorEl.classList.add(actorEl.classList.contains('player-char-container') ? 'is-fleeing-player' : 'is-fleeing-npc');
    });
    socket.on('error', (data) => showInfoModal('Erro', data.message));
    
    async function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoomId = urlParams.get('room');
        
        showScreen(document.getElementById('loading-screen')); 

        try {
            const [rulesRes, spellsRes] = await Promise.all([
                fetch('rules.json'),
                fetch('spells.json')
            ]);
            if (!rulesRes.ok || !spellsRes.ok) throw new Error('Network response was not ok.');
            GAME_RULES = await rulesRes.json();
            ALL_SPELLS = await spellsRes.json();
        } catch (error) {
            console.error('Falha ao carregar arquivos de regras:', error);
            showInfoModal("Erro Crítico", "Não foi possível carregar os arquivos de regras do jogo. A página será recarregada.", false);
            setTimeout(() => window.location.reload(), 4000);
            return;
        }

        if (urlRoomId) {
            socket.emit('playerJoinsLobby', { roomId: urlRoomId });
        } else {
            socket.emit('gmCreatesLobby');
        }

        document.getElementById('join-as-player-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'player' }));
        document.getElementById('join-as-spectator-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'spectator' }));
        document.getElementById('new-char-btn').addEventListener('click', () => {
            showScreen(document.getElementById('selection-screen'));
            renderPlayerTokenSelection();
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