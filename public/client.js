// client.js

document.addEventListener('DOMContentLoaded', () => {
    // --- VARIÁVEIS DE ESTADO ---
    let myRole = null;
    let myPlayerKey = null;
    let isGm = false;
    let currentGameState = null;
    let oldGameState = null;
    let defeatAnimationPlayed = new Set();
    let currentRoomId = new URLSearchParams(window.location.search).get('room');
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
    let isDraggingMap = false;
    let lastDragX, lastDragY;

    // --- ELEMENTOS DO DOM ---
    const allScreens = document.querySelectorAll('.screen');
    const gmInitialLobby = document.getElementById('gm-initial-lobby');
    const playerWaitingScreen = document.getElementById('player-waiting-screen');
    const selectionScreen = document.getElementById('selection-screen');
    const fightScreen = document.getElementById('fight-screen');
    const gmPartySetupScreen = document.getElementById('gm-party-setup-screen');
    const gmNpcSetupScreen = document.getElementById('gm-npc-setup-screen');
    const theaterScreen = document.getElementById('theater-screen');
    const actionButtonsWrapper = document.getElementById('action-buttons-wrapper');
    const gameWrapper = document.getElementById('game-wrapper');
    const fightSceneCharacters = document.getElementById('fight-scene-characters');
    const theaterBackgroundViewport = document.getElementById('theater-background-viewport');
    const theaterBackgroundImage = document.getElementById('theater-background-image');
    const theaterTokenContainer = document.getElementById('theater-token-container');
    const theaterGmPanel = document.getElementById('theater-gm-panel');
    const theaterCharList = document.getElementById('theater-char-list');
    const theaterGlobalScale = document.getElementById('theater-global-scale');
    const theaterChangeScenarioBtn = document.getElementById('theater-change-scenario-btn');
    const theaterBackBtn = document.getElementById('theater-back-btn');
    const theaterPublishBtn = document.getElementById('theater-publish-btn');
    
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

    function showInfoModal(title, text) {
        const modal = document.getElementById('modal');
        const modalButton = document.getElementById('modal-button');
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-text').innerHTML = text;
        modal.classList.remove('hidden');
        modalButton.classList.remove('hidden');
        modalButton.onclick = () => modal.classList.add('hidden');
    }

    function copyToClipboard(text, element) {
        if(!element) return;
        navigator.clipboard.writeText(text).then(() => {
            const originalText = element.textContent || '🔗';
            element.textContent = 'Copiado!';
            setTimeout(() => { element.textContent = originalText; }, 2000);
        });
    }

    function cancelTargeting() {
        isTargeting = false;
        targetingAttackerKey = null;
        document.getElementById('targeting-indicator').classList.add('hidden');
        document.querySelectorAll('.char-container.is-targeting').forEach(el => el.classList.remove('is-targeting'));
    }

    // --- FUNÇÕES DE LÓGICA E RENDERIZAÇÃO ---

    function handleAdventureMode(gameState) {
        if (isGm) {
            switch (gameState.phase) {
                case 'party_setup': showScreen(gmPartySetupScreen); updateGmPartySetupScreen(gameState); break;
                case 'npc_setup': showScreen(gmNpcSetupScreen); if (!oldGameState || oldGameState.phase !== 'npc_setup') { stagedNpcs = []; renderNpcSelectionForGm(); } break;
                case 'initiative_roll': showScreen(fightScreen); updateUI(gameState); renderInitiativeUI(gameState); break;
                default: showScreen(fightScreen); updateUI(gameState);
            }
        } else {
            if (['party_setup', 'npc_setup'].includes(gameState.phase)) {
                showScreen(playerWaitingScreen);
                document.getElementById('player-waiting-message').innerText = "O Mestre está preparando a aventura...";
            } else if(gameState.phase === 'initiative_roll') {
                 showScreen(fightScreen); updateUI(gameState); renderInitiativeUI(gameState);
            } else {
                showScreen(fightScreen); updateUI(gameState);
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
                const charName = p.selectedCharacter ? p.selectedCharacter.nome : '<i>Selecionando...</i>';
                playerListEl.innerHTML += `<li>${p.role === 'player' ? 'Jogador' : 'Espectador'} - Personagem: ${charName}</li>`;
            });
        }
    }

    function renderPlayerCharacterSelection(unavailable = []) {
        const charListContainer = document.getElementById('character-list-container');
        const confirmBtn = document.getElementById('confirm-selection-btn');
        charListContainer.innerHTML = '';
        confirmBtn.disabled = true;
        ALL_CHARACTERS.players.forEach(data => {
            const card = document.createElement('div');
            card.className = 'char-card';
            card.dataset.name = data.name;
            card.dataset.img = data.img;
            card.innerHTML = `<img src="${data.img}" alt="${data.name}"><div class="char-name">${data.name}</div>`;
            if (unavailable.includes(data.name)) {
                card.classList.add('disabled');
                card.innerHTML += `<div class="char-unavailable-overlay">SELECIONADO</div>`;
            } else {
                card.addEventListener('click', () => {
                    if (card.classList.contains('disabled')) return;
                    document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    confirmBtn.disabled = false;
                });
            }
            charListContainer.appendChild(card);
        });
        confirmBtn.onclick = onConfirmSelection;
    }

    function onConfirmSelection() {
        const selectedCard = document.querySelector('.char-card.selected');
        if (!selectedCard) { alert('Por favor, selecione um personagem!'); return; }
        const playerData = { nome: selectedCard.dataset.name, img: selectedCard.dataset.img };
        socket.emit('playerAction', { type: 'playerSelectsCharacter', character: playerData });
        showScreen(playerWaitingScreen);
        document.getElementById('player-waiting-message').innerText = "Personagem enviado! Aguardando o Mestre...";
    }

    function updateGmPartySetupScreen(state) {
        const partyList = document.getElementById('gm-party-list');
        partyList.innerHTML = '';
        Object.values(state.fighters.players).forEach(player => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'party-member-card';
            playerDiv.dataset.id = player.id;
            playerDiv.innerHTML = `<img src="${player.img}" alt="${player.nome}"><h4>${player.nome}</h4><label>AGI: <input type="number" class="agi-input" value="2"></label><label>RES: <input type="number" class="res-input" value="3"></label>`;
            partyList.appendChild(playerDiv);
        });
        document.getElementById('gm-confirm-party-btn').onclick = () => {
            const playerStats = [];
            document.querySelectorAll('#gm-party-list .party-member-card').forEach(card => {
                playerStats.push({ id: card.dataset.id, agi: parseInt(card.querySelector('.agi-input').value, 10), res: parseInt(card.querySelector('.res-input').value, 10) });
            });
            socket.emit('playerAction', { type: 'gmConfirmParty', playerStats });
        };
    }

    function renderNpcSelectionForGm() {
        const npcArea = document.getElementById('npc-selection-area');
        npcArea.innerHTML = '';
        ALL_CHARACTERS.npcs.forEach(npcData => {
            const card = document.createElement('div');
            card.className = 'npc-card';
            card.innerHTML = `<img src="${npcData.img}" alt="${npcData.name}"><div class="char-name">${npcData.name}</div>`;
            card.addEventListener('click', () => {
                if (stagedNpcs.length < 4) {
                    stagedNpcs.push({ ...npcData, agi: 2, res: 3 });
                    renderNpcStagingArea();
                } else { alert("Você pode adicionar no máximo 4 inimigos."); }
            });
            npcArea.appendChild(card);
        });
        renderNpcStagingArea();
        document.getElementById('gm-start-battle-btn').onclick = () => {
            if (stagedNpcs.length === 0) { alert("Adicione pelo menos um inimigo para a batalha."); return; }
            socket.emit('playerAction', { type: 'gmStartBattle', npcs: stagedNpcs });
        };
    }

    function renderNpcStagingArea() {
        const stagingArea = document.getElementById('npc-staging-area');
        stagingArea.innerHTML = '';
        stagedNpcs.forEach((npc, index) => {
            const stagedDiv = document.createElement('div');
            stagedDiv.className = 'staged-npc';
            stagedDiv.innerHTML = `<img src="${npc.img}" alt="${npc.name}"><button class="remove-staged-npc" data-index="${index}">X</button>`;
            stagedDiv.querySelector('.remove-staged-npc').addEventListener('click', (e) => {
                stagedNpcs.splice(parseInt(e.target.dataset.index, 10), 1);
                renderNpcStagingArea();
            });
            stagingArea.appendChild(stagedDiv);
        });
    }

    function updateUI(state) { /* ...código sem alterações... */ }
    function createFighterElement(fighter, type, state, position) { /* ...código sem alterações... */ }
    function renderInitiativeUI(state) { /* ...código sem alterações... */ }
    function handleActionClick(event) { /* ...código sem alterações... */ }
    function handleTargetClick(event) { /* ...código sem alterações... */ }

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
        const allMinis = [
            ...(ALL_CHARACTERS.players || []),
            ...(ALL_CHARACTERS.npcs || []),
            ...(ALL_CHARACTERS.dynamic || [])
        ];
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
                const worldContainer = document.getElementById('theater-world-container');
                if (worldContainer) {
                    worldContainer.style.width = `${img.naturalWidth}px`;
                    worldContainer.style.height = `${img.naturalHeight}px`;
                }
                if (isGm && currentScenarioState && (currentScenarioState.scenarioWidth !== img.naturalWidth || currentScenarioState.scenarioHeight !== img.naturalHeight)) {
                    socket.emit('playerAction', { type: 'update_scenario_dims', width: img.naturalWidth, height: img.naturalHeight });
                }
                updateTheaterZoom();
            };
            img.src = `images/${dataToRender.scenario}`;
        }
        
        const theaterScreenEl = document.getElementById('theater-screen'); 
        const toggleGmPanelBtn = document.getElementById('toggle-gm-panel-btn');
        theaterGmPanel.classList.toggle('hidden', !isGm); 
        toggleGmPanelBtn.classList.toggle('hidden', !isGm);
        theaterBackBtn.classList.toggle('hidden', !isGm);
        theaterPublishBtn.classList.toggle('hidden', !isGm || !currentScenarioState?.isStaging);
        
        if (isGm && currentScenarioState) {
            theaterGlobalScale.value = currentScenarioState.globalTokenScale || 1.0;
        }

        if (!isGm) theaterScreenEl.classList.add('panel-hidden'); 
        
        theaterTokenContainer.innerHTML = '';
        const fragment = document.createDocumentFragment();
        const tokensToRender = dataToRender.tokens || {};
        const tokenOrderToRender = dataToRender.tokenOrder || [];

        tokenOrderToRender.forEach((tokenId, index) => {
            const tokenData = tokensToRender[tokenId];
            if (!tokenData) return;
            const tokenEl = document.createElement('img');
            tokenEl.id = tokenId;
            tokenEl.className = 'theater-token';
            tokenEl.src = tokenData.img;
            tokenEl.style.left = `${tokenData.x}px`;
            tokenEl.style.top = `${tokenData.y}px`;
            tokenEl.style.zIndex = index;
            tokenEl.dataset.scale = tokenData.scale || 1;
            tokenEl.dataset.flipped = String(!!tokenData.isFlipped);
            tokenEl.title = tokenData.charName;
            tokenEl.draggable = isGm;
            if (isGm) {
                if (selectedTokens.has(tokenId)) tokenEl.classList.add('selected');
            }
            fragment.appendChild(tokenEl);
        });
        theaterTokenContainer.appendChild(fragment);
        updateTheaterZoom();
    }
    
    function updateTheaterZoom() {
        const dataToRender = (isGm && currentGameState?.scenarioStates) ? currentGameState.scenarioStates[currentGameState.currentScenario] : currentGameState?.publicState;
        if (!dataToRender) return;

        const globalTokenScale = dataToRender.globalTokenScale || 1.0;
        const worldContainer = document.getElementById('theater-world-container');
        if (worldContainer) {
           worldContainer.style.transform = `scale(${currentScenarioScale})`;
        }
        
        document.querySelectorAll('.theater-token').forEach(token => {
            const baseScale = parseFloat(token.dataset.scale) || 1;
            const isFlipped = token.dataset.flipped === 'true';
            token.style.transform = `scale(${baseScale * globalTokenScale}) ${isFlipped ? 'scaleX(-1)' : ''}`;
        });
    }

    function setupTheaterEventListeners() {
        document.getElementById('toggle-gm-panel-btn').addEventListener('click', () => { 
            document.getElementById('theater-screen').classList.toggle('panel-hidden');
        });
    
        theaterBackgroundViewport.addEventListener('dragover', (e) => { e.preventDefault(); });
    
        const getGameScale = () => {
            const transform = window.getComputedStyle(gameWrapper).transform;
            return (transform === 'none') ? 1 : new DOMMatrix(transform).a; 
        };

        const screenToWorldCoords = (e) => {
            const gameScale = getGameScale();
            const viewportRect = theaterBackgroundViewport.getBoundingClientRect();
            return {
                worldX: (e.clientX - viewportRect.left) / gameScale / currentScenarioScale + theaterBackgroundViewport.scrollLeft / currentScenarioScale,
                worldY: (e.clientY - viewportRect.top) / gameScale / currentScenarioScale + theaterBackgroundViewport.scrollTop / currentScenarioScale
            };
        };

        theaterBackgroundViewport.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!isGm) return;
            try {
                const dataString = e.dataTransfer.getData('application/json');
                if (!dataString) return;
                const data = JSON.parse(dataString);
                const { worldX, worldY } = screenToWorldCoords(e);
                const tokenBaseWidth = 200; 
                const tokenScale = 1.0;
                socket.emit('playerAction', { 
                    type: 'updateToken', 
                    token: { 
                        id: `token-${uuidv4()}`, charName: data.charName, img: data.img, 
                        x: worldX - (tokenBaseWidth * tokenScale / 2), 
                        y: worldY - (tokenBaseWidth * tokenScale / 2), 
                        scale: tokenScale, isFlipped: false 
                    }
                });
            } catch (error) { console.error("Erro ao processar o drop:", error); }
        });
    
        theaterGlobalScale.addEventListener('input', () => {
             if(isGm) socket.emit('playerAction', { type: 'updateGlobalScale', scale: parseFloat(theaterGlobalScale.value) });
        });
        
        theaterPublishBtn.addEventListener('click', () => {
             if(isGm) socket.emit('playerAction', { type: 'publish_stage' });
        });

        theaterChangeScenarioBtn.onclick = () => {
            const modalHtml = `
                <div id="modal-tabs-container" style="display: flex; gap: 10px; margin-bottom: 15px; justify-content: center; flex-wrap: wrap;"></div>
                <div id="modal-scenarios-container" style="display: flex; flex-wrap: wrap; gap: 15px; justify-content: center; max-height: 400px; overflow-y: auto;"></div>`;
            showInfoModal("Mudar Cenário", modalHtml);
            document.getElementById('modal-button').classList.add('hidden'); // Oculta o botão OK padrão
            //... resto da lógica do modal...
            const tabsContainer = document.getElementById('modal-tabs-container');
            const scenariosContainer = document.getElementById('modal-scenarios-container');

            const renderCategory = (categoryName) => {
                scenariosContainer.innerHTML = '';
                const scenarios = ALL_SCENARIOS[categoryName] || [];
                scenarios.forEach(fileName => {
                    const fullPath = `mapas/${categoryName}/${fileName}`;
                    const card = document.createElement('div');
                    card.className = 'scenario-card';
                    card.innerHTML = `<img src="images/${fullPath}" alt="${fileName}"><div class="scenario-name">${fileName.split('.')[0]}</div>`;
                    card.onclick = () => {
                        socket.emit('playerAction', { type: 'changeScenario', scenario: fullPath });
                        document.getElementById('modal').classList.add('hidden');
                    };
                    scenariosContainer.appendChild(card);
                });
            };
            const categories = Object.keys(ALL_SCENARIOS);
            categories.forEach((categoryName, index) => {
                const btn = document.createElement('button');
                btn.className = 'category-tab-btn';
                btn.textContent = categoryName.replace(/_/g, ' ').toUpperCase();
                btn.onclick = (e) => {
                    tabsContainer.querySelectorAll('.category-tab-btn').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                    renderCategory(categoryName);
                };
                if (index === 0) btn.classList.add('active');
                tabsContainer.appendChild(btn);
            });
            if (categories.length > 0) renderCategory(categories[0]);
        };
    
        theaterBackgroundViewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomIntensity = 0.1;
            const delta = e.deltaY > 0 ? -zoomIntensity : zoomIntensity;
            const newScale = currentScenarioScale + delta;
            currentScenarioScale = Math.min(Math.max(newScale, 0.2), 5.0);
            updateTheaterZoom();
        }, { passive: false });
    }

    function initializeGlobalKeyListeners() { /* ...código sem alterações... */ }

    // --- INICIALIZAÇÃO E LISTENERS DE SOCKET ---
    
    socket.on('initialData', (data) => {
        ALL_CHARACTERS = data.characters || { players: [], npcs: [], dynamic: [] };
        ALL_SCENARIOS = data.scenarios || {};
    });
    
    socket.on('roomCreated', (roomId) => {
        currentRoomId = roomId;
        if (isGm) {
            const baseUrl = window.location.origin;
            const playerUrl = `${baseUrl}?room=${roomId}&role=player`;
            const spectatorUrl = `${baseUrl}?room=${roomId}&role=spectator`;
            const playerLinkEl = document.getElementById('gm-link-player');
            const spectatorLinkEl = document.getElementById('gm-link-spectator');
            if(playerLinkEl) playerLinkEl.textContent = playerUrl;
            if(spectatorLinkEl) spectatorLinkEl.textContent = spectatorUrl;
            playerLinkEl.onclick = () => copyToClipboard(playerUrl, playerLinkEl);
            spectatorLinkEl.onclick = () => copyToClipboard(spectatorUrl, spectatorLinkEl);
        }
    });
    
    socket.on('assignRole', (data) => {
        myRole = data.role;
        myPlayerKey = data.playerKey || null;
        isGm = !!data.isGm;
    });

    socket.on('playSound', (soundFile) => { new Audio(`sons/${soundFile}`).play(); });
    socket.on('error', (err) => { showInfoModal("Erro", err.message); setTimeout(() => window.location.href = window.location.origin, 3000); });

    socket.on('gameUpdate', (gameState) => {
        const justEnteredTheater = gameState.mode === 'theater' && (!currentGameState || currentGameState.mode !== 'theater');
        oldGameState = currentGameState;
        currentGameState = gameState;
        
        allScreens.forEach(s => s.classList.remove('active'));
        if (document.getElementById('initiative-ui')) document.getElementById('initiative-ui').classList.add('hidden');

        if (!gameState.mode || gameState.mode === 'lobby') {
            defeatAnimationPlayed.clear();
            stagedNpcs = [];
            if (isGm) {
                showScreen(gmInitialLobby);
                updateGmLobbyUI(gameState);
            } else {
                const myPlayerData = gameState.connectedPlayers[socket.id];
                if (myRole === 'player' && myPlayerData && !myPlayerData.selectedCharacter) {
                    showScreen(selectionScreen);
                    renderPlayerCharacterSelection(gameState.unavailableCharacters);
                } else {
                    showScreen(playerWaitingScreen);
                    let message = "Aguardando o Mestre iniciar o jogo...";
                    if (myRole === 'player' && myPlayerData?.selectedCharacter) message = "Personagem enviado! Aguardando o Mestre...";
                    else if (myRole === 'spectator') message = "Aguardando como espectador...";
                    document.getElementById('player-waiting-message').innerText = message;
                }
            }
        } else if (gameState.mode === 'adventure') {
            handleAdventureMode(gameState);
        } else if (gameState.mode === 'theater') {
            if (isGm && justEnteredTheater) {
                initializeTheaterMode();
            }
            showScreen(theaterScreen);
            renderTheaterMode(gameState);
        }
    });

    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoomId = urlParams.get('room');
        const urlRole = urlParams.get('role');

        if (urlRoomId && urlRole) {
            socket.emit('playerJoinsLobby', { roomId: urlRoomId, role: urlRole });
        } else {
            socket.emit('gmCreatesLobby');
        }

        document.body.addEventListener('contextmenu', (e) => { if (isTargeting) { e.preventDefault(); cancelTargeting(); } });
        document.body.addEventListener('keydown', (e) => {
            if (isTargeting && e.key === "Escape") { cancelTargeting(); }
        });
        
        document.getElementById('start-adventure-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsAdventure' }));
        document.getElementById('start-theater-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsTheater' }));
        document.getElementById('theater-back-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmGoesBackToLobby' }));
        
        window.addEventListener('resize', scaleGame);
        scaleGame();
        setupTheaterEventListeners();
        // initializeGlobalKeyListeners(); // O código desta função está ok, mas removo a chamada para simplificar
    }
    
    // Adicionando a biblioteca UUID para o cliente
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/uuid/8.3.2/uuid.min.js";
    script.onload = initialize;
    document.head.appendChild(script);
});