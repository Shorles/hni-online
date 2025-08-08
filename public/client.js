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
    let ALL_CHARACTERS = { players: [], npcs: [] };
    let ALL_SCENARIOS = {};
    let stagedNpcs = [];

    // Controles de UI
    let isTargeting = false;
    let targetingAttackerKey = null;
    let coordsModeActive = false;
    
    // Variáveis do Modo Cenário (do jogo antigo)
    let currentScenarioScale = 1.0;
    let isGroupSelectMode = false;
    let selectedTokens = new Set();
    let isDraggingScenario = false;

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
    const copyTheaterSpectatorLinkBtn = document.getElementById('copy-theater-spectator-link');
    const theaterBackBtn = document.getElementById('theater-back-btn');
    const theaterPublishBtn = document.getElementById('theater-publish-btn');
    
    // --- FUNÇÕES DE LÓGICA E RENDERIZAÇÃO ---

    function showScreen(screenToShow) {
        allScreens.forEach(screen => screen.classList.toggle('active', screen === screenToShow));
    }

    // Lógica principal de roteamento de tela
    socket.on('gameUpdate', (gameState) => {
        oldGameState = currentGameState;
        currentGameState = gameState;
        
        allScreens.forEach(s => s.classList.remove('active'));
        
        if (!gameState.mode || gameState.mode === 'lobby') {
            if (isGm) { showScreen(gmInitialLobby); updateGmLobbyUI(gameState); }
            else {
                const myPlayerData = gameState.connectedPlayers[socket.id];
                if (myRole === 'player' && myPlayerData && !myPlayerData.selectedCharacter) {
                    showScreen(selectionScreen); renderPlayerCharacterSelection(gameState.unavailableCharacters);
                } else {
                    showScreen(playerWaitingScreen);
                    document.getElementById('player-waiting-message').innerText = "Aguardando o Mestre iniciar o jogo...";
                }
            }
            defeatAnimationPlayed.clear(); stagedNpcs = [];
        } else if (gameState.mode === 'adventure') {
            handleAdventureMode(gameState);
        } else if (gameState.mode === 'theater') {
            showScreen(theaterScreen);
            renderTheaterMode(gameState);
        }
    });

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
    
    // --- LÓGICA DO MODO CENÁRIO (DO JOGO ANTIGO) ---
    
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

        ALL_CHARACTERS.players.forEach(char => createMini(char.name, char.img));
        ALL_CHARACTERS.npcs.forEach(char => createMini(char.name, char.img));
    }

    function renderTheaterMode(state) {
        const currentScenarioState = state.scenarioStates?.[state.currentScenario];
        const dataToRender = isGm ? currentScenarioState : state.publicState;
        
        if (!dataToRender || !dataToRender.scenario) return;

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
        
        const theaterScreenEl = document.getElementById('theater-screen'); 
        const toggleGmPanelBtn = document.getElementById('toggle-gm-panel-btn');
        theaterGmPanel.classList.toggle('hidden', !isGm); 
        toggleGmPanelBtn.classList.toggle('hidden', !isGm);
        theaterBackBtn.classList.toggle('hidden', !isGm);
        theaterPublishBtn.classList.toggle('hidden', !isGm || !state.scenarioStates?.[state.currentScenario]?.isStaging);

        if (isGm && currentScenarioState) {
            theaterGlobalScale.value = currentScenarioState.globalTokenScale || 1.0;
        }

        if (!isGm) { 
            theaterScreenEl.classList.add('panel-hidden'); 
        }
        
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
            
            const scale = tokenData.scale || 1;
            const isFlipped = tokenData.isFlipped;
            tokenEl.dataset.scale = scale;
            tokenEl.dataset.flipped = String(isFlipped);
            tokenEl.title = tokenData.charName;
            tokenEl.draggable = false;
            
            if (isGm) {
                if (selectedTokens.has(tokenId)) tokenEl.classList.add('selected');
                const gmData = state.scenarioStates?.[state.currentScenario];
                if (gmData) {
                    const tokenCenterX = tokenData.x + (200 * scale / 2);
                    const tokenCenterY = tokenData.y + (200 * scale / 2);
                    if (gmData.scenarioWidth && (tokenCenterX < 0 || tokenCenterX > gmData.scenarioWidth || tokenCenterY < 0 || tokenCenterY > gmData.scenarioHeight)) {
                        tokenEl.classList.add('off-stage');
                    }
                }
            }
            fragment.appendChild(tokenEl);
        });
        theaterTokenContainer.appendChild(fragment);
        
        updateTheaterZoom();
    }
    
    function updateTheaterZoom() {
        const scenarioState = currentGameState?.scenarioStates?.[currentGameState.currentScenario];
        const publicScenarioState = currentGameState?.publicState;
        const dataToRender = (myRole !== 'gm' && publicScenarioState) ? publicScenarioState : scenarioState;
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
        // ... (todo o bloco de `setupTheaterEventListeners` do seu jogo original)
    }

    // --- INICIALIZAÇÃO E LISTENERS ---
    
    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        currentRoomId = urlParams.get('room');
        const roleFromUrl = urlParams.get('role');

        if (currentRoomId && roleFromUrl) {
            socket.emit('playerJoinsLobby', { roomId: currentRoomId, role: roleFromUrl });
            showScreen(playerWaitingScreen);
        } else {
            socket.emit('gmCreatesLobby');
        }

        // Listeners de botões
        document.getElementById('start-adventure-btn').onclick = () => socket.emit('playerAction', { type: 'gmStartsAdventure' });
        document.getElementById('start-theater-btn').onclick = () => socket.emit('playerAction', { type: 'gmStartsTheater' });
        theaterBackBtn.onclick = () => socket.emit('playerAction', { type: 'gmGoesBackToLobby' });

        // Outros listeners
        // ... (código existente)
        
        scaleGame();
        window.addEventListener('resize', scaleGame);
        setupTheaterEventListeners(); // Chama a função de setup do teatro
    }
    
    socket.on('initialData', (data) => {
        ALL_CHARACTERS = data.characters || { players: [], npcs: [] };
        ALL_SCENARIOS = data.scenarios || {};
        if (isGm && currentGameState && currentGameState.mode === 'theater') {
            initializeTheaterMode();
        }
    });
    
    // ... (o resto do código, como `socket.on('roomCreated')`, `updateUI`, `createFighterElement`, `scaleGame`, etc., permanece o mesmo)

    initialize();
});