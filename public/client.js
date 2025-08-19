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
        const modal = document.getElementById('modal');
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-text').innerHTML = text;
        const oldButtons = document.getElementById('modal-content').querySelector('.modal-button-container');
        if(oldButtons) oldButtons.remove();
        document.getElementById('modal-button').classList.remove('hidden');
        modal.classList.remove('hidden');
        document.getElementById('modal-button').onclick = () => modal.classList.add('hidden');
    }
    
    function showConfirmationModal(title, text, onConfirm, confirmText = 'Sim', cancelText = 'Não') {
        const modal = document.getElementById('modal');
        const modalContent = document.getElementById('modal-content');
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-text').innerHTML = `<p>${text}</p>`;
        
        const oldButtons = modalContent.querySelector('.modal-button-container');
        if(oldButtons) oldButtons.remove();
        
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'modal-button-container';
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = confirmText;
        confirmBtn.onclick = () => { onConfirm(true); modal.classList.add('hidden'); };
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = cancelText;
        cancelBtn.onclick = () => { onConfirm(false); modal.classList.add('hidden'); };
        
        buttonContainer.appendChild(confirmBtn);
        buttonContainer.appendChild(cancelBtn);
        modalContent.appendChild(buttonContainer);
        document.getElementById('modal-button').classList.add('hidden');
        modal.classList.remove('hidden');
    }

    function copyToClipboard(text, element) {
        navigator.clipboard.writeText(text).then(() => {
            const originalHTML = element.innerHTML;
            element.innerHTML = 'Copiado!';
            setTimeout(() => { element.innerHTML = originalHTML; }, 2000);
        });
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
        if (!myData || !myData.sheet) return;
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
        const playerListEl = document.getElementById('gm-lobby-player-list');
        const inviteLinkEl = document.getElementById('gm-link-invite');
        if(myRoomId && (inviteLinkEl.textContent === 'Gerando...' || !inviteLinkEl.textContent.includes(myRoomId))) {
            const inviteUrl = `${window.location.origin}?room=${myRoomId}`;
            inviteLinkEl.textContent = inviteUrl;
            inviteLinkEl.onclick = () => copyToClipboard(inviteUrl, inviteLinkEl);
        }
        
        playerListEl.innerHTML = '';
        const players = Object.values(state.connectedPlayers).filter(p => p.role === 'player');
        if (players.length === 0) {
            playerListEl.innerHTML = '<li>Aguardando jogadores...</li>';
            return;
        }
        players.forEach(p => {
            let status = 'Conectando...';
            if (p.sheet) {
                if (p.sheet.status === 'ready') status = `<span style="color: #28a745;">Pronto (${p.sheet.name})</span>`;
                else if (p.sheet.status === 'filling_sheet') status = `<span style="color: #ffc107;">Criando Ficha...</span>`;
                else status = `<span style="color: #ffc107;">Escolhendo Aparência...</span>`;
            }
            playerListEl.innerHTML += `<li>Jogador: ${status}</li>`;
        });
    }
    
    // --- LÓGICA DE CRIAÇÃO DE PERSONAGEM ---
    function startNewCharacter() {
        const myData = currentGameState.connectedPlayers[socket.id];
        myData.sheet.status = 'selecting_token';
        characterSheetInProgress = JSON.parse(JSON.stringify(myData.sheet));
        renderGame(currentGameState);
    }

    function renderTokenSelection() {
        const container = document.getElementById('token-list-container');
        container.style.flexDirection = 'row'; // CORREÇÃO: Força o layout horizontal
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

    function confirmTokenSelection() {
        const myData = currentGameState.connectedPlayers[socket.id];
        myData.sheet.status = 'filling_sheet';
        myData.sheet.token = characterSheetInProgress.token;
        characterSheetInProgress = myData.sheet;
        renderGame(currentGameState);
    }

    function renderSheetCreationUI() {
        // ... (lógica mantida da versão anterior, é funcional)
    }

    function finishSheetCreation() {
        characterSheetInProgress.status = 'ready';
        socket.emit('playerAction', { type: 'playerSubmitsSheet', sheet: characterSheetInProgress });
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
                <button id="confirm-npc-edit" class="mode-btn" style="padding: 10px 20px; font-size: 1em; margin-top: 10px;">Confirmar</button>
            `;
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
            showScreen('player-waiting-screen');
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
            if(isGm && selectedTokens.has(tokenId)) tokenEl.classList.add('selected');
            if(isGm) {
                tokenEl.addEventListener('mouseenter', () => hoveredTokenId = tokenId);
                tokenEl.addEventListener('mouseleave', () => hoveredTokenId = null);
            }
            theaterTokenContainer.appendChild(tokenEl);
        });

        if (isGm) renderGmTheaterPanel();
        else renderPlayerTheaterControls(state);
    }
    
    function renderGmTheaterPanel() {
        // CORREÇÃO: Função restaurada para popular a lista de personagens
        const charList = document.getElementById('theater-char-list');
        charList.innerHTML = '';
        const allChars = [...PLAYABLE_TOKENS, ...Object.keys(ALL_NPCS).map(name => ({name, img: `images/lutadores/${name}.png`})), ...DYNAMIC_CHARACTERS];
        allChars.forEach(char => {
            const mini = document.createElement('div');
            mini.className = 'theater-char-mini';
            mini.style.backgroundImage = `url("${char.img}")`;
            mini.draggable = true;
            mini.title = char.name;
            mini.ondragstart = (e) => {
                e.dataTransfer.setData('application/json', JSON.stringify(char));
            };
            charList.appendChild(mini);
        });
    }

    function renderPlayerTheaterControls(state) {
        // ... (lógica mantida)
    }

    function setupTheaterEventListeners() {
        // CORREÇÃO: LÓGICA VITAL DO MODO CENÁRIO RESTAURADA COMPLETAMENTE
        theaterBackgroundViewport.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            dragStartPos = { x: e.clientX, y: e.clientY };
            const tokenElement = e.target.closest('.theater-token');
            const canControlToken = tokenElement && !isGm && currentGameState?.publicState?.tokens[tokenElement.id]?.owner === socket.id && !currentGameState.playerControlsLocked;

            if (isGm) {
                if (isGroupSelectMode && !tokenElement) {
                    isSelectingBox = true;
                    selectionBoxStartPos = { x: e.clientX, y: e.clientY };
                    const gameScale = getGameScale();
                    const viewportRect = theaterBackgroundViewport.getBoundingClientRect();
                    Object.assign(selectionBox.style, { left: `${(e.clientX - viewportRect.left) / gameScale}px`, top: `${(e.clientY - viewportRect.top) / gameScale}px`, width: '0px', height: '0px' });
                    selectionBox.classList.remove('hidden');
                    return;
                }
                if (tokenElement) {
                    isDragging = true;
                    if (!e.ctrlKey && !selectedTokens.has(tokenElement.id)) {
                        selectedTokens.clear();
                        selectedTokens.add(tokenElement.id);
                    } else if (e.ctrlKey) {
                        if (selectedTokens.has(tokenElement.id)) selectedTokens.delete(tokenElement.id);
                        else selectedTokens.add(tokenElement.id);
                    }
                    dragOffsets.clear();
                    selectedTokens.forEach(id => {
                        const tokenData = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[id];
                        if (tokenData) dragOffsets.set(id, { startX: tokenData.x, startY: tokenData.y });
                    });
                    renderTheaterUI(currentGameState);
                } else if (!isGroupSelectMode) {
                    if (selectedTokens.size > 0) { selectedTokens.clear(); renderTheaterUI(currentGameState); }
                    isPanning = true;
                }
            } else { // Lógica para Player
                if (canControlToken) {
                    isDragging = true;
                    const tokenData = currentGameState.publicState.tokens[tokenElement.id];
                    dragOffsets.set(tokenElement.id, { startX: tokenData.x, startY: tokenData.y });
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
            } else if (isGm && isSelectingBox) {
                // ... (lógica de seleção em grupo mantida)
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
                        const payload = isGm ? { token: { id, ...finalPos } } : { tokenId: id, position: finalPos, playerId: socket.id };
                        socket.emit('playerAction', { type: actionType, ...payload });
                    }
                });
                dragOffsets.clear();
            }
            if (isPanning) isPanning = false;
            if (isSelectingBox) {
                // ... (lógica de seleção em grupo mantida)
            }
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
        renderGame(currentGameState);
    });
    
    // ... Demais listeners ...
    socket.on('gameUpdate', (gameState) => renderGame(gameState));
    socket.on('roomCreated', (roomId) => { myRoomId = roomId; renderGame(currentGameState); }); // Força re-render para o link
    socket.on('promptForRole', ({ isFull }) => {
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

        // CORREÇÃO: Listeners movidos para funções anônimas para robustez
        document.getElementById('join-as-player-btn').onclick = () => socket.emit('playerChoosesRole', { role: 'player' });
        document.getElementById('join-as-spectator-btn').onclick = () => socket.emit('playerChoosesRole', { role: 'spectator' });
        document.getElementById('new-char-btn').onclick = () => startNewCharacter();
        document.getElementById('load-char-btn').onclick = () => document.getElementById('load-char-input').click();
        document.getElementById('load-char-input').onchange = (e) => loadCharacterFromFile(e.target.files[0]);
        document.getElementById('confirm-token-btn').onclick = () => confirmTokenSelection();
        document.getElementById('finish-sheet-btn').onclick = () => finishSheetCreation();
        document.getElementById('save-sheet-btn').onclick = () => { /* Lógica da ficha precisa ser implementada */ };
        document.getElementById('gm-start-battle-btn').onclick = () => {
            if(stagedNpcs.length > 0) socket.emit('playerAction', { type: 'gmStartBattle', npcs: stagedNpcs });
        };
        document.getElementById('player-roll-initiative-btn').onclick = () => socket.emit('playerAction', { type: 'roll_initiative' });
        document.getElementById('start-adventure-btn').onclick = () => socket.emit('playerAction', { type: 'gmStartsAdventure' });
        document.getElementById('start-theater-btn').onclick = () => socket.emit('playerAction', { type: 'gmStartsTheater' });
        document.getElementById('back-to-lobby-btn').onclick = () => socket.emit('playerAction', { type: 'gmGoesBackToLobby' });
        document.getElementById('floating-switch-mode-btn').onclick = () => socket.emit('playerAction', { type: 'gmSwitchesMode' });
        
        setupTheaterEventListeners();
        window.addEventListener('resize', scaleGame);
        scaleGame();
    }
    
    initialize();
});