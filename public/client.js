// client.js

document.addEventListener('DOMContentLoaded', () => {
    let myRole = null;
    let myPlayerKey = null;
    let isGm = false;
    let currentGameState = null;
    let oldGameState = null;
    let defeatAnimationPlayed = new Set();
    let currentRoomId = new URLSearchParams(window.location.search).get('room');
    const socket = io();

    // Armazenamento de dados iniciais
    let ALL_CHARACTERS = { players: [], npcs: [] };
    let ALL_SCENARIOS = [];
    let stagedNpcs = []; // Para a nova seleção de NPCs

    // Variáveis do Modo Teatro
    let selectedTheaterChar = null;
    let isDragging = false;
    let dragOffsetX, dragOffsetY;

    // Elementos da UI
    const allScreens = document.querySelectorAll('.screen');
    const gmInitialLobby = document.getElementById('gm-initial-lobby');
    const playerWaitingScreen = document.getElementById('player-waiting-screen');
    const selectionScreen = document.getElementById('selection-screen');
    const fightScreen = document.getElementById('fight-screen');
    const gmPartySetupScreen = document.getElementById('gm-party-setup-screen');
    const gmNpcSetupScreen = document.getElementById('gm-npc-setup-screen');
    const theaterScreen = document.getElementById('theater-screen');
    
    const fightSceneCharacters = document.getElementById('fight-scene-characters');
    const actionButtonsWrapper = document.getElementById('action-buttons-wrapper');
    const gameWrapper = document.getElementById('game-wrapper');

    // --- LÓGICA DE INICIALIZAÇÃO E SOCKETS ---

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

        // Handlers de eventos globais
        document.body.addEventListener('contextmenu', (e) => { if (isTargeting) { e.preventDefault(); cancelTargeting(); } });
        document.body.addEventListener('keydown', (e) => {
            if (isTargeting && e.key === "Escape") { cancelTargeting(); }
            if (isGm && e.key.toLowerCase() === 'f') { e.preventDefault(); toggleCoordsMode(); }
        });
        actionButtonsWrapper.addEventListener('click', handleActionClick);
        document.getElementById('start-theater-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsTheater' }));
        document.getElementById('theater-character-controls').addEventListener('click', handleTheaterControlClick);

        window.addEventListener('resize', scaleGame);
        scaleGame();
    }

    socket.on('initialData', (data) => {
        ALL_CHARACTERS = data.characters || { players: [], npcs: [] };
        ALL_SCENARIOS = data.scenarios || [];
    });

    socket.on('gameUpdate', (gameState) => {
        oldGameState = currentGameState;
        currentGameState = gameState;
        
        // Esconde todas as telas e paineis específicos por padrão
        allScreens.forEach(s => s.classList.remove('active'));
        document.getElementById('initiative-ui')?.classList.add('hidden');

        if (gameState.mode === 'lobby') {
            if (isGm) { showScreen(gmInitialLobby); updateGmLobbyUI(gameState); }
            else {
                const myPlayerData = gameState.connectedPlayers[socket.id];
                if (myRole === 'player' && myPlayerData && !myPlayerData.selectedCharacter) {
                    showScreen(selectionScreen); renderPlayerCharacterSelection(gameState.unavailableCharacters);
                } else {
                    showScreen(playerWaitingScreen);
                }
            }
            defeatAnimationPlayed.clear();
        } else if (gameState.mode === 'adventure') {
            handleAdventureMode(gameState);
        } else if (gameState.mode === 'theater') {
            showScreen(theaterScreen);
            renderTheaterScreen(gameState);
        }
    });
    
    socket.on('roomCreated', (roomId) => {
        currentRoomId = roomId;
        if(isGm) {
            // ... (código de roomCreated do GM permanece o mesmo)
        }
    });
    
    socket.on('assignRole', (data) => { myRole = data.role; myPlayerKey = data.playerKey || null; isGm = data.isGm || myRole === 'gm'; });
    socket.on('playSound', (soundFile) => { new Audio(`sons/${soundFile}`).play(); });
    // ... outros listeners de socket permanecem os mesmos

    function showScreen(screenToShow) { allScreens.forEach(screen => screen.classList.toggle('active', screen === screenToShow)); }

    // --- LÓGICA DO MODO AVENTURA ---
    
    function handleAdventureMode(gameState) {
        if (isGm) {
            switch (gameState.phase) {
                case 'party_setup': showScreen(gmPartySetupScreen); updateGmPartySetupScreen(gameState); break;
                case 'npc_setup': showScreen(gmNpcSetupScreen); renderNpcSelectionForGm(); break;
                default: showScreen(fightScreen); updateUI(gameState);
            }
        } else { // Player
            if (['party_setup', 'npc_setup'].includes(gameState.phase)) {
                showScreen(playerWaitingScreen);
            } else {
                showScreen(fightScreen); updateUI(gameState);
            }
        }
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
                } else {
                    alert("Você pode adicionar no máximo 4 inimigos.");
                }
            });
            npcArea.appendChild(card);
        });
        renderNpcStagingArea(); // Renderiza a área de preparação (vazia no início)
    }

    function renderNpcStagingArea() {
        const stagingArea = document.getElementById('npc-staging-area');
        stagingArea.innerHTML = '';
        stagedNpcs.forEach((npc, index) => {
            const stagedDiv = document.createElement('div');
            stagedDiv.className = 'staged-npc';
            stagedDiv.innerHTML = `<img src="${npc.img}" alt="${npc.name}"><button class="remove-staged-npc" data-index="${index}">X</button>`;
            stagedDiv.querySelector('.remove-staged-npc').addEventListener('click', (e) => {
                const iToRemove = parseInt(e.target.dataset.index, 10);
                stagedNpcs.splice(iToRemove, 1);
                renderNpcStagingArea();
            });
            stagingArea.appendChild(stagedDiv);
        });
    }

    document.getElementById('gm-start-battle-btn').onclick = () => {
        if (stagedNpcs.length === 0) {
            alert("Adicione pelo menos um inimigo para a batalha.");
            return;
        }
        socket.emit('playerAction', { type: 'gmStartBattle', npcs: stagedNpcs });
    };

    // ... (todas as outras funções de UI, combate, etc. permanecem as mesmas)

    // --- LÓGICA DO MODO TEATRO ---

    function renderTheaterScreen(state) {
        gameWrapper.style.backgroundImage = `url('images/${state.scenario}')`;
        const scene = document.getElementById('theater-main-scene');
        scene.innerHTML = '';

        Object.values(state.characters).forEach(char => {
            const el = document.createElement('img');
            el.src = char.img;
            el.className = 'theater-character';
            el.id = char.id;
            el.style.left = `${char.x}px`;
            el.style.top = `${char.y}px`;
            el.style.transform = `scale(${char.scale})`;
            el.style.zIndex = char.zIndex;

            if (selectedTheaterChar === char.id) {
                el.classList.add('selected');
            }

            el.addEventListener('mousedown', (e) => onDragStart(e, char.id));
            scene.appendChild(el);
        });

        if (isGm) {
            renderTheaterSidebar(state);
        }
    }

    function renderTheaterSidebar(state) {
        const charList = document.getElementById('theater-character-list');
        charList.innerHTML = '';
        const allChars = [...ALL_CHARACTERS.players, ...ALL_CHARACTERS.npcs];
        allChars.forEach(charData => {
            const item = document.createElement('div');
            item.className = 'theater-list-item';
            item.innerHTML = `<img src="${charData.img}" alt="${charData.name}"><div class="name">${charData.name}</div>`;
            item.addEventListener('click', () => {
                socket.emit('playerAction', { type: 'theaterAddCharacter', characterData: charData });
            });
            charList.appendChild(item);
        });
        
        const scenarioList = document.getElementById('theater-scenario-list');
        scenarioList.innerHTML = '';
        ALL_SCENARIOS.forEach(scen => {
             const item = document.createElement('div');
             item.className = 'theater-list-item';
             item.innerHTML = `<img src="images/mapas/cenarios externos/${scen}" alt="${scen}"><div class="name">${scen.split('.')[0]}</div>`;
             item.addEventListener('click', () => {
                 socket.emit('playerAction', { type: 'theaterChangeScenario', scenario: `mapas/cenarios externos/${scen}` });
             });
             scenarioList.appendChild(item);
        });
    }
    
    function onDragStart(e, charId) {
        e.preventDefault();
        selectedTheaterChar = charId;
        isDragging = true;
        const el = document.getElementById(charId);
        el.classList.add('dragging');
        document.getElementById('theater-character-controls').classList.remove('hidden');

        const rect = el.getBoundingClientRect();
        const wrapperRect = gameWrapper.getBoundingClientRect();
        const scale = new DOMMatrix(window.getComputedStyle(gameWrapper).transform).a;
        dragOffsetX = (e.clientX - rect.left) / scale;
        dragOffsetY = (e.clientY - rect.top) / scale;

        document.onmousemove = onDragMove;
        document.onmouseup = onDragEnd;
        
        // Emite uma atualização para redesenhar e mostrar a seleção
        socket.emit('playerAction', {type: 'theaterNoOp'}); // Ação vazia só para forçar redraw
    }
    
    function onDragMove(e) {
        if (!isDragging) return;
        const el = document.getElementById(selectedTheaterChar);
        const wrapperRect = gameWrapper.getBoundingClientRect();
        const scale = new DOMMatrix(window.getComputedStyle(gameWrapper).transform).a;
        
        const x = (e.clientX - wrapperRect.left) / scale - dragOffsetX;
        const y = (e.clientY - wrapperRect.top) / scale - dragOffsetY;

        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        
        // Para economizar emissões, só emitimos no final do drag
    }
    
    function onDragEnd(e) {
        isDragging = false;
        const el = document.getElementById(selectedTheaterChar);
        if (!el) return;
        el.classList.remove('dragging');
        document.onmousemove = null;
        document.onmouseup = null;
        
        socket.emit('playerAction', {
            type: 'theaterMoveCharacter',
            id: selectedTheaterChar,
            x: parseInt(el.style.left, 10),
            y: parseInt(el.style.top, 10)
        });
    }

    function handleTheaterControlClick(e) {
        const control = e.target.dataset.control;
        if (!control || !selectedTheaterChar) return;
        
        const charState = currentGameState.characters[selectedTheaterChar];
        if (!charState) return;
        
        let updates = {};
        switch(control) {
            case 'remove':
                socket.emit('playerAction', { type: 'theaterRemoveCharacter', id: selectedTheaterChar });
                selectedTheaterChar = null;
                document.getElementById('theater-character-controls').classList.add('hidden');
                return;
            case 'scale-up': updates.scale = (charState.scale || 1) * 1.1; break;
            case 'scale-down': updates.scale = (charState.scale || 1) * 0.9; break;
            case 'bring-front': updates.zIndex = (charState.zIndex || 10) + 1; break;
            case 'send-back': updates.zIndex = (charState.zIndex || 10) - 1; break;
        }
        
        socket.emit('playerAction', { type: 'theaterUpdateCharacter', id: selectedTheaterChar, updates });
    }

    // --- FUNÇÕES DE UTILIDADE E RESTO DO CÓDIGO ---
    // (Todas as funções de renderPlayerCharacterSelection, updateUI, createFighterElement, etc. permanecem aqui, inalteradas)
    
    initialize();

    // Restante do código (funções de escala, etc.) permanece inalterado.
    function scaleGame() { /*...*/ }
    // ...
});