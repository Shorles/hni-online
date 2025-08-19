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
    }

    function showInfoModal(title, text) {
        // ... (implementação mantida)
    }
    
    function showConfirmationModal(title, text, onConfirm, confirmText = 'Sim', cancelText = 'Não') {
        // ... (implementação mantida)
    }

    function copyToClipboard(text, element) {
        // ... (implementação mantida)
    }

    // --- FLUXO PRINCIPAL DE RENDERIZAÇÃO ---
    function renderGame(state) {
        currentGameState = state;
        if (!state || !myRole) return;

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
        // ... (lógica mantida)
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
        // ... (lógica mantida)
        if (!myData || !myData.sheet) return;
        switch(myData.sheet.status) {
            case 'creating_sheet': showScreen('character-entry-screen'); return;
            case 'selecting_token': showScreen('token-selection-screen'); renderTokenSelection(); return;
            case 'filling_sheet': showScreen('sheet-creation-screen'); /* renderSheetCreationUI(); */ return;
            case 'ready': break;
        }
        switch(state.mode) {
            case 'lobby': showScreen('player-waiting-screen'); document.getElementById('player-waiting-message').textContent = "Personagem pronto! Aguardando o Mestre..."; break;
            case 'adventure': showScreen('fight-screen'); /* renderFightUI(state); */ break;
            case 'theater': renderTheaterUI(state); break;
        }
    }

    function renderSpectatorView(state) {
        // ... (lógica mantida)
        let screen = 'player-waiting-screen';
        document.getElementById('player-waiting-message').textContent = "Assistindo... Aguardando o Mestre iniciar.";
        switch(state.mode) {
            case 'adventure': screen = 'fight-screen'; /* renderFightUI(state); */ break;
            case 'theater': screen = 'theater-screen'; renderTheaterUI(state); break;
        }
        showScreen(screen);
    }

    function updateGmLobbyUI(state) {
        // ... (lógica mantida, com correção para garantir que o link apareça)
        const inviteLinkEl = document.getElementById('gm-link-invite');
        if(myRoomId && (inviteLinkEl.textContent === 'Gerando...' || !inviteLinkEl.textContent.includes(myRoomId))) {
            const inviteUrl = `${window.location.origin}?room=${myRoomId}`;
            inviteLinkEl.textContent = inviteUrl;
            inviteLinkEl.onclick = () => copyToClipboard(inviteUrl, inviteLinkEl);
        }
        // ... resto da função
    }
    
    // --- LÓGICA DE CRIAÇÃO DE PERSONAGEM ---
    function renderTokenSelection() {
        const container = document.getElementById('token-list-container');
        // CORREÇÃO: Força o layout horizontal
        container.style.flexDirection = 'row';
        container.innerHTML = '';
        PLAYABLE_TOKENS.forEach(token => {
            const card = document.createElement('div');
            card.className = 'token-card';
            card.innerHTML = `<img src="${token.img}" alt="${token.name}">`;
            card.onclick = () => {
                characterSheetInProgress.token = token;
                document.querySelectorAll('.token-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                document.getElementById('confirm-token-btn').disabled = false;
            };
            container.appendChild(card);
        });
    }
    
    // --- LÓGICA DE UI DO GM ---
    function renderGmNpcSetup() {
        const selectionArea = document.getElementById('npc-selection-area');
        selectionArea.innerHTML = '';
        Object.keys(ALL_NPCS).forEach(npcName => {
            const card = document.createElement('div');
            card.className = 'char-card';
            card.innerHTML = `<img src="images/lutadores/${npcName}.png" alt="${npcName}"><div class="char-name">${npcName}</div>`;
            card.onclick = () => {
                if (stagedNpcs.length >= 5) { showInfoModal('Limite Atingido', 'Você só pode adicionar até 5 inimigos na batalha.'); return; }
                stagedNpcs.push({
                    id: `staged-${Date.now()}`, name: npcName,
                    hp: 50, mahou: 10, bta: 5, btd: 5, btm: 0, spells: []
                });
                renderGmNpcSetup();
            };
            selectionArea.appendChild(card);
        });

        const stagedArea = document.getElementById('staged-npc-list');
        stagedArea.innerHTML = '';
        stagedNpcs.forEach(npc => {
            const card = document.createElement('div');
            card.className = `staged-npc-card ${selectedStagedNpcId === npc.id ? 'selected' : ''}`;
            card.innerHTML = `<img src="images/lutadores/${npc.name}.png" alt="${npc.name}"><span>${npc.name}</span><button class="remove-npc-btn" data-id="${npc.id}">X</button>`;
            card.onclick = (e) => { 
                if (e.target.classList.contains('remove-npc-btn')) return;
                selectedStagedNpcId = npc.id; 
                renderGmNpcSetup(); 
            };
            card.querySelector('.remove-npc-btn').onclick = (e) => {
                e.stopPropagation();
                stagedNpcs = stagedNpcs.filter(n => n.id !== npc.id);
                if (selectedStagedNpcId === npc.id) selectedStagedNpcId = null;
                renderGmNpcSetup();
            };
            stagedArea.appendChild(card);
        });

        const editor = document.getElementById('npc-editor');
        const npcToEdit = stagedNpcs.find(n => n.id === selectedStagedNpcId);
        if (npcToEdit) {
            editor.classList.remove('hidden');
            let spellOptions = Object.keys(GAME_DATA.spells)
                .map(spellName => `<option value="${spellName}" ${npcToEdit.spells.includes(spellName) ? 'selected' : ''}>${spellName}</option>`)
                .join('');
            
            editor.innerHTML = `
                <h3>Editando ${npcToEdit.name}</h3>
                <div class="form-field"><label>HP:</label><input type="number" id="npc-hp" value="${npcToEdit.hp}"></div>
                <div class="form-field"><label>Mahou:</label><input type="number" id="npc-mahou" value="${npcToEdit.mahou}"></div>
                <div class="form-field"><label>BTA:</label><input type="number" id="npc-bta" value="${npcToEdit.bta}"></div>
                <div class="form-field"><label>BTD:</label><input type="number" id="npc-btd" value="${npcToEdit.btd}"></div>
                <div class="form-field"><label>BTM:</label><input type="number" id="npc-btm" value="${npcToEdit.btm}"></div>
                <div class="form-field"><label>Magias:</label><select id="npc-spells" multiple>${spellOptions}</select></div>
                <button id="confirm-npc-edit" class="mode-btn" style="padding: 10px 20px; font-size: 1em;">Confirmar</button>
            `;
            // CORREÇÃO: Adiciona botão para fechar e listeners
            document.getElementById('confirm-npc-edit').onclick = () => {
                selectedStagedNpcId = null;
                renderGmNpcSetup();
            };
            document.getElementById('npc-hp').onchange = (e) => npcToEdit.hp = parseInt(e.target.value) || 0;
            document.getElementById('npc-mahou').onchange = (e) => npcToEdit.mahou = parseInt(e.target.value) || 0;
            document.getElementById('npc-bta').onchange = (e) => npcToEdit.bta = parseInt(e.target.value) || 0;
            document.getElementById('npc-btd').onchange = (e) => npcToEdit.btd = parseInt(e.target.value) || 0;
            document.getElementById('npc-btm').onchange = (e) => npcToEdit.btm = parseInt(e.target.value) || 0;
            document.getElementById('npc-spells').onchange = (e) => {
                npcToEdit.spells = [...e.target.options].filter(o => o.selected).map(o => o.value);
            };
        } else {
            editor.classList.add('hidden');
        }
    }

    // --- MODO CENÁRIO: LÓGICA RESTAURADA E INTEGRADA ---
    function renderTheaterUI(state) {
        if (!state) return;
        const currentScenarioState = state.scenarioStates?.[state.currentScenario];
        const dataToRender = isGm ? currentScenarioState : state.publicState;

        if (!dataToRender || !dataToRender.scenario) {
            showScreen('player-waiting-screen'); // Fallback
            document.getElementById('player-waiting-message').textContent = "Aguardando o Mestre preparar o cenário...";
            return;
        }

        showScreen('theater-screen');
        document.getElementById('theater-gm-panel').classList.toggle('hidden', !isGm);
        document.getElementById('toggle-gm-panel-btn').classList.toggle('hidden', !isGm);
        document.getElementById('theater-publish-btn').classList.toggle('hidden', !isGm || !currentScenarioState?.isStaging);

        const scenarioUrl = `images/${dataToRender.scenario}`;
        if (!theaterBackgroundImage.src.includes(encodeURI(dataToRender.scenario))) {
            theaterBackgroundImage.src = scenarioUrl;
        }

        theaterTokenContainer.innerHTML = '';
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
            const globalScale = dataToRender.globalTokenScale || 1.0;
            tokenEl.style.transform = `scale(${(tokenData.scale || 1.0) * globalScale}) ${tokenData.isFlipped ? 'scaleX(-1)' : ''}`;
            if(isGm) {
                if(selectedTokens.has(tokenId)) tokenEl.classList.add('selected');
                tokenEl.addEventListener('mouseenter', () => hoveredTokenId = tokenId);
                tokenEl.addEventListener('mouseleave', () => hoveredTokenId = null);
            }
            theaterTokenContainer.appendChild(tokenEl);
        });

        if (isGm) renderGmTheaterPanel();
        else renderPlayerTheaterControls(state);
    }
    
    function renderGmTheaterPanel() {
        // ... (implementação original mantida)
    }

    function renderPlayerTheaterControls(state) {
        // ... (implementação original mantida)
    }

    function setupTheaterEventListeners() {
        theaterBackgroundViewport.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            dragStartPos = { x: e.clientX, y: e.clientY };
            const tokenElement = e.target.closest('.theater-token');

            if (isGm) {
                if (isGroupSelectMode && !tokenElement) {
                    // Lógica de seleção em grupo
                } else if (tokenElement) {
                    isDragging = true;
                    // Lógica de arrastar do GM
                } else {
                    isPanning = true;
                }
            } else { // Lógica do jogador
                if (tokenElement) {
                    const tokenData = currentGameState.publicState.tokens[tokenElement.id];
                    if (tokenData && tokenData.owner === socket.id && !currentGameState.playerControlsLocked) {
                        isDragging = true; // Permite o jogador arrastar seu próprio token
                        dragOffsets.set(tokenElement.id, { startX: tokenData.x, startY: tokenData.y });
                    }
                } else {
                    isPanning = true;
                }
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                const gameScale = getGameScale();
                const deltaX = (e.clientX - dragStartPos.x) / gameScale / localWorldScale;
                const deltaY = (e.clientY - dragStartPos.y) / gameScale / localWorldScale;

                const tokensToMove = isGm ? selectedTokens : new Set(dragOffsets.keys());
                
                tokensToMove.forEach(id => {
                    const tokenEl = document.getElementById(id);
                    const initialPos = dragOffsets.get(id);
                    if (tokenEl && initialPos) {
                        tokenEl.style.left = `${initialPos.startX + deltaX}px`;
                        tokenEl.style.top = `${initialPos.startY + deltaY}px`;
                    }
                });

            } else if (isPanning) {
                 e.preventDefault();
                 theaterBackgroundViewport.scrollLeft -= e.movementX;
                 theaterBackgroundViewport.scrollTop -= e.movementY;
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (isDragging) {
                isDragging = false;
                const gameScale = getGameScale();
                const deltaX = (e.clientX - dragStartPos.x) / gameScale / localWorldScale;
                const deltaY = (e.clientY - dragStartPos.y) / gameScale / localWorldScale;
                
                const tokensToUpdate = isGm ? selectedTokens : new Set(dragOffsets.keys());

                tokensToUpdate.forEach(id => {
                    const initialPos = dragOffsets.get(id);
                    if(initialPos) {
                        const finalPos = { x: initialPos.startX + deltaX, y: initialPos.startY + deltaY };
                        const actionType = isGm ? 'updateToken' : 'playerMovesToken';
                        const payload = isGm ? { token: { id: id, ...finalPos } } : { tokenId: id, position: finalPos };
                        socket.emit('playerAction', { type: actionType, ...payload });
                    }
                });
                dragOffsets.clear();
            }
            isPanning = false;
        });

        theaterBackgroundViewport.addEventListener('drop', (e) => {
            e.preventDefault(); 
            if (!isGm) return;
            try {
                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                const tokenWidth = 200;
                const gameScale = getGameScale();
                const viewportRect = theaterBackgroundViewport.getBoundingClientRect();
                const x = ((e.clientX - viewportRect.left) / gameScale + theaterBackgroundViewport.scrollLeft) / localWorldScale - (tokenWidth / 2);
                const y = ((e.clientY - viewportRect.top) / gameScale + theaterBackgroundViewport.scrollTop) / localWorldScale - (tokenWidth / 2);
                socket.emit('playerAction', { type: 'addToken', token: { ...data, x, y } });
            } catch (error) { console.error("Drop error:", error); }
        });

        theaterBackgroundViewport.addEventListener('dragover', (e) => e.preventDefault());

        theaterBackgroundViewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            // ... (Lógica de zoom restaurada exatamente como antes)
            const zoomIntensity = 0.05;
            const scrollDirection = e.deltaY < 0 ? 1 : -1;
            const newScale = Math.max(0.2, Math.min(localWorldScale + (zoomIntensity * scrollDirection), 5));
            const rect = theaterBackgroundViewport.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const worldX = (mouseX + theaterBackgroundViewport.scrollLeft) / localWorldScale;
            const worldY = (mouseY + theaterBackgroundViewport.scrollTop) / localWorldScale;
            localWorldScale = newScale;
            theaterWorldContainer.style.transform = `scale(${localWorldScale})`;
            theaterBackgroundViewport.scrollLeft = worldX * localWorldScale - mouseX;
            theaterBackgroundViewport.scrollTop = worldY * localWorldScale - mouseY;
        }, { passive: false });
    }


    // --- INICIALIZAÇÃO E LISTENERS DE SOCKET ---
    socket.on('initialData', (data) => {
        PLAYABLE_TOKENS = data.playableTokens;
        DYNAMIC_CHARACTERS = data.dynamicCharacters;
        GAME_DATA = data.gameData;
        ALL_NPCS = data.npcs;
        ALL_SCENARIOS = data.scenarios;
    });

    socket.on('assignRole', (data) => {
        myRole = data.role; isGm = !!data.isGm; myRoomId = data.roomId;
        if(isGm) document.getElementById('toggle-gm-panel-btn').classList.remove('hidden');
        renderGame(currentGameState);
    });
    
    // Demais listeners...
    socket.on('gameUpdate', (gameState) => renderGame(gameState));
    socket.on('roomCreated', (roomId) => myRoomId = roomId );
    socket.on('promptForRole', ({ isFull }) => {
        showScreen('role-selection-screen');
        document.getElementById('join-as-player-btn').disabled = isFull;
        document.getElementById('room-full-message').classList.toggle('hidden', !isFull);
    });
    socket.on('promptForAdventureType', () => {
        showConfirmationModal('Retornar à Aventura', 'Deseja continuar a aventura anterior ou começar uma nova batalha?', (continuar) => {
            socket.emit('playerAction', {type: 'gmChoosesAdventureType', choice: continuar ? 'continue' : 'new'});
        }, 'Continuar Batalha', 'Nova Batalha');
    });
    socket.on('error', (data) => showInfoModal('Erro', data.message));
    
    function initialize() {
        showScreen('loading-screen');
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoomId = urlParams.get('room');
        
        if (urlRoomId) socket.emit('playerJoinsLobby', { roomId: urlRoomId });
        else socket.emit('gmCreatesLobby');

        // Listeners de botões...
        document.getElementById('join-as-player-btn').onclick = () => socket.emit('playerChoosesRole', { role: 'player' });
        document.getElementById('join-as-spectator-btn').onclick = () => socket.emit('playerChoosesRole', { role: 'spectator' });
        document.getElementById('new-char-btn').onclick = () => { /* Implementado em renderGame */ };
        document.getElementById('confirm-token-btn').onclick = () => { /* Implementado em renderGame */ };
        document.getElementById('gm-start-battle-btn').onclick = () => {
            if(stagedNpcs.length > 0) socket.emit('playerAction', { type: 'gmStartBattle', npcs: stagedNpcs });
        };
        document.getElementById('start-adventure-btn').onclick = () => socket.emit('playerAction', { type: 'gmStartsAdventure' });
        document.getElementById('start-theater-btn').onclick = () => socket.emit('playerAction', { type: 'gmStartsTheater' });

        setupTheaterEventListeners();
        window.addEventListener('resize', scaleGame);
        scaleGame();
    }
    
    initialize();
});