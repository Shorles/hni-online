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

    // --- ELEMENTOS DO DOM ---
    const allScreens = document.querySelectorAll('.screen');
    const gameWrapper = document.getElementById('game-wrapper');
    const fightSceneCharacters = document.getElementById('fight-scene-characters');
    const theaterBackgroundViewport = document.getElementById('theater-background-viewport');
    const theaterTokenContainer = document.getElementById('theater-token-container');
    const theaterCharList = document.getElementById('theater-char-list');
    
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
        // ... (código sem alterações)
    }

    function copyToClipboard(text, element) {
        // ... (código sem alterações)
    }

    function cancelTargeting() {
        // ... (código sem alterações)
    }

    // --- LÓGICA DO MODO AVENTURA ---

    function handleAdventureMode(gameState) {
        // ... (código sem alterações)
    }
    
    function updateGmLobbyUI(state) {
        // ... (código sem alterações)
    }

    function renderPlayerCharacterSelection(unavailable = []) {
        // ... (código sem alterações)
    }

    function onConfirmSelection() {
        // ... (código sem alterações)
    }

    function updateGmPartySetupScreen(state) {
        // ... (código sem alterações)
    }

    function renderNpcSelectionForGm() {
        // ... (código sem alterações)
    }

    function renderNpcStagingArea() {
        // ... (código sem alterações)
    }

    function updateUI(state) {
        if (!state || !state.fighters) return;
        gameWrapper.style.backgroundImage = `url('images/${state.scenario}')`;
        fightSceneCharacters.innerHTML = '';
        document.getElementById('round-info').textContent = `ROUND ${state.currentRound}`;
        document.getElementById('fight-log').innerHTML = state.log.map(entry => `<p class="log-${entry.type}">${entry.text}</p>`).join('');
        
        const PLAYER_POSITIONS = [ 
            { left: '150px', top: '500px' }, { left: '250px', top: '400px' }, 
            { left: '350px', top: '300px' }, { left: '450px', top: '200px' } 
        ];
        const NPC_POSITIONS = [ 
            { left: '1000px', top: '500px' }, { left: '900px',  top: '400px' }, 
            { left: '800px',  top: '300px' }, { left: '700px',  top: '200px' } 
        ];
        
        const allFighters = [...Object.values(state.fighters.players), ...Object.values(state.fighters.npcs)];
        const fighterPositions = {};
        Object.values(state.fighters.players).forEach((f, i) => fighterPositions[f.id] = PLAYER_POSITIONS[i]);
        Object.values(state.fighters.npcs).forEach((f, i) => fighterPositions[f.id] = NPC_POSITIONS[i]);

        allFighters.forEach(fighter => {
            const isPlayer = !!state.fighters.players[fighter.id];
            const el = createFighterElement(fighter, isPlayer ? 'player' : 'npc', state, fighterPositions[fighter.id]);
            fightSceneCharacters.appendChild(el);
        });

        // Atualiza botões de ação
        const activeFighter = state.phase === 'battle' ? getFighter(state, state.activeCharacterKey) : null;
        const canControl = (myRole === 'player' && state.activeCharacterKey === myPlayerKey) || (isGm && activeFighter && !!state.fighters.npcs[activeFighter.id]);
        actionButtonsWrapper.innerHTML = `
            <button class="action-btn" data-action="attack" ${!canControl ? 'disabled' : ''}>Atacar</button>
            <button class="end-turn-btn" data-action="end_turn" ${!canControl ? 'disabled' : ''}>Encerrar Turno</button>
        `;
    }
    
    function createFighterElement(fighter, type, state, position) {
        // ... (código sem alterações)
    }

    function renderInitiativeUI(state) {
        const initiativeUI = document.getElementById('initiative-ui');
        initiativeUI.classList.remove('hidden');
        const playerRollBtn = document.getElementById('player-roll-initiative-btn');
        const gmRollBtn = document.getElementById('gm-roll-initiative-btn');
        
        if (myRole === 'player' && state.fighters.players[myPlayerKey] && !state.initiativeRolls[myPlayerKey]) {
            playerRollBtn.classList.remove('hidden'); playerRollBtn.disabled = false;
            playerRollBtn.onclick = () => { playerRollBtn.disabled = true; socket.emit('playerAction', { type: 'roll_initiative' }); };
        } else {
            playerRollBtn.classList.add('hidden');
        }
        
        if (isGm) {
            const npcsNeedToRoll = Object.values(state.fighters.npcs).some(npc => !state.initiativeRolls[npc.id]);
            if (npcsNeedToRoll) {
                gmRollBtn.classList.remove('hidden'); gmRollBtn.disabled = false;
                gmRollBtn.onclick = () => { gmRollBtn.disabled = true; socket.emit('playerAction', { type: 'roll_initiative', isGmRoll: true }); };
            } else {
                gmRollBtn.classList.add('hidden');
            }
        } else {
            gmRollBtn.classList.add('hidden');
        }
    }


    function handleActionClick(event) {
        // ... (código sem alterações)
    }

    function handleTargetClick(event) {
        // ... (código sem alterações)
    }

    function getFighter(state, key) {
        return state.fighters.players[key] || state.fighters.npcs[key];
    }

    // --- LÓGICA DO MODO CENÁRIO ---

    function initializeTheaterMode() {
        // ... (código sem alterações)
    }

    function renderTheaterMode(state) {
        const currentScenarioState = state.scenarioStates?.[state.currentScenario];
        const dataToRender = isGm ? currentScenarioState : state.publicState;
        if (!dataToRender || !dataToRender.scenario) return;

        if (!theaterBackgroundImage.src.includes(dataToRender.scenario)) {
             // ... (código de troca de imagem sem alterações)
        }
        
        document.getElementById('theater-gm-panel').classList.toggle('hidden', !isGm);
        document.getElementById('toggle-gm-panel-btn').classList.toggle('hidden', !isGm);
        document.getElementById('theater-back-btn').classList.toggle('hidden', !isGm);
        document.getElementById('theater-publish-btn').classList.toggle('hidden', !isGm || !currentScenarioState?.isStaging);
        
        if (isGm && currentScenarioState) theaterGlobalScale.value = currentScenarioState.globalTokenScale || 1.0;
        
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
            tokenEl.dataset.scale = tokenData.scale || 1.0;
            tokenEl.dataset.flipped = String(!!tokenData.isFlipped);
            tokenEl.title = tokenData.charName;
            tokenEl.draggable = false; // Drag é manual
            if (isGm && selectedTokens.has(tokenId)) tokenEl.classList.add('selected');
            fragment.appendChild(tokenEl);
        });
        theaterTokenContainer.appendChild(fragment);
        updateTheaterZoom();
    }
    
    function updateTheaterZoom() {
        // ... (código sem alterações)
    }

    function setupTheaterEventListeners() {
        document.getElementById('toggle-gm-panel-btn').addEventListener('click', () => document.getElementById('theater-screen').classList.toggle('panel-hidden'));
        theaterBackgroundViewport.addEventListener('dragover', (e) => e.preventDefault());
        
        const getGameScale = () => (window.getComputedStyle(gameWrapper).transform === 'none') ? 1 : new DOMMatrix(window.getComputedStyle(gameWrapper).transform).a;
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
                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                const { worldX, worldY } = screenToWorldCoords(e);
                socket.emit('playerAction', { 
                    type: 'updateToken', 
                    token: { 
                        id: `token-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                        charName: data.charName, img: data.img, 
                        x: worldX - (100), y: worldY - (100), 
                        scale: 1.0, isFlipped: false 
                    }
                });
            } catch (error) { console.error("Drop error:", error); }
        });
        
        // CORREÇÃO: Lógica de arrastar tokens existentes e de seleção em grupo
        theaterBackgroundViewport.addEventListener('mousedown', (e) => {
            if (!isGm || e.button !== 0) return;
            isDragging = true;
            dragTarget = e.target.closest('.theater-token');

            if (dragTarget) { // Clicou em um token
                const tokenRect = dragTarget.getBoundingClientRect();
                const gameScale = getGameScale();
                dragOffsetX = (e.clientX - tokenRect.left) / gameScale / currentScenarioScale;
                dragOffsetY = (e.clientY - tokenRect.top) / gameScale / currentScenarioScale;
                if (!e.ctrlKey && !selectedTokens.has(dragTarget.id)) {
                    selectedTokens.clear();
                    selectedTokens.add(dragTarget.id);
                } else if (e.ctrlKey) {
                    if (selectedTokens.has(dragTarget.id)) selectedTokens.delete(dragTarget.id);
                    else selectedTokens.add(dragTarget.id);
                }
                renderTheaterMode(currentGameState);
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging || !dragTarget) return;
            const { worldX, worldY } = screenToWorldCoords(e);
            const newX = worldX - dragOffsetX;
            const newY = worldY - dragOffsetY;
            dragTarget.style.left = `${newX}px`;
            dragTarget.style.top = `${newY}px`;
        });

        window.addEventListener('mouseup', (e) => {
            if (!isDragging || !dragTarget) {
                isDragging = false;
                return;
            }
            isDragging = false;
            const { worldX, worldY } = screenToWorldCoords(e);
            socket.emit('playerAction', { 
                type: 'updateToken', 
                token: { id: dragTarget.id, x: worldX - dragOffsetX, y: worldY - dragOffsetY }
            });
            dragTarget = null;
        });

        // CORREÇÃO: Lógica de resize e flip
        theaterBackgroundViewport.addEventListener('wheel', (e) => {
            const token = e.target.closest('.theater-token');
            if (isGm && token) {
                e.preventDefault();
                const tokenData = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[token.id];
                if (!tokenData) return;
                const newScale = (tokenData.scale || 1.0) + (e.deltaY > 0 ? -0.1 : 0.1);
                socket.emit('playerAction', { type: 'updateToken', token: { id: token.id, scale: Math.max(0.1, newScale) }});
            }
        }, { passive: false });
    }

    function initializeGlobalKeyListeners() {
        window.addEventListener('keydown', (e) => {
            if (!isGm || !currentGameState || currentGameState.mode !== 'theater') return;

            if (e.key.toLowerCase() === 'f' && selectedTokens.size > 0) {
                selectedTokens.forEach(tokenId => {
                    const tokenData = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[tokenId];
                    if (tokenData) {
                        socket.emit('playerAction', { type: 'updateToken', token: { id: tokenId, isFlipped: !tokenData.isFlipped }});
                    }
                });
            }
            // A lógica de seleção em grupo (tecla G) é mais complexa e omitida por enquanto para focar nos outros bugs
        });
    }

    // --- INICIALIZAÇÃO E LISTENERS DE SOCKET ---
    
    socket.on('initialData', (data) => { /* ...código sem alterações... */ });
    socket.on('roomCreated', (roomId) => { /* ...código sem alterações... */ });
    socket.on('assignRole', (data) => { /* ...código sem alterações... */ });
    socket.on('characterHit', (data) => {
        const el = document.getElementById(data.targetKey);
        if (el) {
            el.classList.add('is-hit-flash');
            setTimeout(() => el.classList.remove('is-hit-flash'), 400);
        }
    });

    socket.on('gameUpdate', (gameState) => {
        const justEnteredTheater = gameState.mode === 'theater' && (!currentGameState || currentGameState.mode !== 'theater');
        oldGameState = currentGameState;
        currentGameState = gameState;
        
        if (!gameState.mode || gameState.mode === 'lobby') {
            showScreen(document.getElementById('gm-initial-lobby'));
            if(isGm) updateGmLobbyUI(gameState);
            else {
                const myPlayerData = gameState.connectedPlayers[socket.id];
                if (myRole === 'player' && myPlayerData && !myPlayerData.selectedCharacter) showScreen(document.getElementById('selection-screen'));
                else showScreen(document.getElementById('player-waiting-screen'));
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

        // ... (código dos event listeners sem alterações)
        setupTheaterEventListeners();
        initializeGlobalKeyListeners();
        window.addEventListener('resize', scaleGame);
        scaleGame();
    }
    
    initialize();
});