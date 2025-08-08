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
    
    // Variáveis de Combate
    let isTargeting = false;
    let targetingAttackerKey = null;
    let coordsModeActive = false;


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

        document.body.addEventListener('contextmenu', (e) => { if (isTargeting) { e.preventDefault(); cancelTargeting(); } });
        document.body.addEventListener('keydown', (e) => {
            if (isTargeting && e.key === "Escape") { cancelTargeting(); }
            if (isGm && e.key.toLowerCase() === 'f') { e.preventDefault(); toggleCoordsMode(); }
        });
        
        actionButtonsWrapper.addEventListener('click', handleActionClick);
        document.getElementById('start-adventure-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsAdventure' }));
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
        
        allScreens.forEach(s => s.classList.remove('active'));
        document.getElementById('initiative-ui')?.classList.add('hidden');

        if (!gameState.mode || gameState.mode === 'lobby') {
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
            stagedNpcs = [];
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
            const baseUrl = window.location.origin;
            const playerUrl = `${baseUrl}?room=${roomId}&role=player`;
            const spectatorUrl = `${baseUrl}?room=${roomId}&role=spectator`;
            const playerLinkEl = document.getElementById('gm-link-player');
            const spectatorLinkEl = document.getElementById('gm-link-spectator');
            playerLinkEl.textContent = playerUrl;
            spectatorLinkEl.textContent = spectatorUrl;
            playerLinkEl.onclick = () => copyToClipboard(playerUrl, playerLinkEl);
            spectatorLinkEl.onclick = () => copyToClipboard(spectatorUrl, spectatorLinkEl);
        }
    });
    
    socket.on('assignRole', (data) => { myRole = data.role; myPlayerKey = data.playerKey || null; isGm = data.isGm || myRole === 'gm'; });
    socket.on('playSound', (soundFile) => { new Audio(`sons/${soundFile}`).play(); });
    socket.on('triggerAttackAnimation', ({ attackerKey }) => { triggerAnimation(attackerKey, 'attack'); });
    socket.on('triggerHitAnimation', ({ defenderKey }) => { triggerAnimation(defenderKey, 'hit'); });
    socket.on('error', (err) => { alert(err.message); window.location.reload(); });

    function showScreen(screenToShow) { allScreens.forEach(screen => screen.classList.toggle('active', screen === screenToShow)); }

    // --- LÓGICA DO MODO AVENTURA ---
    
    function handleAdventureMode(gameState) {
        if (isGm) {
            switch (gameState.phase) {
                case 'party_setup': showScreen(gmPartySetupScreen); updateGmPartySetupScreen(gameState); break;
                case 'npc_setup': showScreen(gmNpcSetupScreen); if (!oldGameState || oldGameState.phase !== 'npc_setup') { stagedNpcs = []; renderNpcSelectionForGm(); } break;
                default: showScreen(fightScreen); updateUI(gameState);
            }
        } else {
            if (['party_setup', 'npc_setup'].includes(gameState.phase)) {
                showScreen(playerWaitingScreen);
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
                playerListEl.innerHTML += `<li>Jogador Conectado - Personagem: ${charName}</li>`;
            });
        }
    }

    function renderPlayerCharacterSelection(unavailable = []) {
        const charListContainer = document.getElementById('character-list-container');
        const confirmBtn = document.getElementById('confirm-selection-btn');
        charListContainer.innerHTML = '';
        confirmBtn.disabled = false;
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
        document.getElementById('gm-start-battle-btn').onclick = () => {
            if (stagedNpcs.length === 0) { alert("Adicione pelo menos um inimigo para a batalha."); return; }
            socket.emit('playerAction', { type: 'gmStartBattle', npcs: stagedNpcs });
        };
    }

    function updateUI(state) {
        if (!state || !state.fighters) return;
        fightSceneCharacters.innerHTML = '';
        const PLAYER_POSITIONS = [ 
            { left: '150px', top: '500px', zIndex: 14 }, { left: '250px', top: '400px', zIndex: 13 }, 
            { left: '350px', top: '300px', zIndex: 12 }, { left: '450px', top: '200px', zIndex: 11 } 
        ];
        const NPC_POSITIONS = [ 
            { left: '1000px', top: '500px', zIndex: 14 }, { left: '900px',  top: '400px', zIndex: 13 }, 
            { left: '800px',  top: '300px', zIndex: 12 }, { left: '700px',  top: '200px', zIndex: 11 } 
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

        // ... (resto da lógica de updateUI permanece igual)
    }

    function createFighterElement(fighter, type, state, position) {
        // ... (código de createFighterElement permanece o mesmo)
        return container;
    }

    // --- LÓGICA DO MODO TEATRO ---

    function renderTheaterScreen(state) {
        // ... (código de renderTheaterScreen permanece o mesmo)
    }

    function renderTheaterSidebar(state) {
        // ... (código de renderTheaterSidebar permanece o mesmo)
    }
    
    // ... (todas as funções de arrastar e soltar do teatro permanecem as mesmas)

    // --- FUNÇÕES DE UTILIDADE E RESTO DO CÓDIGO ---
    
    function triggerAnimation(elementId, type) {
        setTimeout(() => {
            const el = document.getElementById(elementId);
            if (!el) return;
            let animationClass = '';
            if (type === 'attack') {
                const isPlayer = el.classList.contains('player-char-container');
                animationClass = isPlayer ? 'is-attacking-player' : 'is-attacking-npc';
            } else if (type === 'hit') {
                animationClass = 'is-hit-flash';
            }
            if (animationClass) {
                el.classList.add(animationClass);
                el.addEventListener('animationend', () => el.classList.remove(animationClass), { once: true });
            }
        }, 50);
    }
    
    function copyToClipboard(text, element) {
        if(!element) return;
        navigator.clipboard.writeText(text).then(() => {
            const originalText = element.textContent;
            element.textContent = 'Copiado!';
            setTimeout(() => { element.textContent = originalText; }, 2000);
        });
    }

    function scaleGame() {
        const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
        gameWrapper.style.transform = `scale(${scale})`;
        gameWrapper.style.left = `${(window.innerWidth - (1280 * scale)) / 2}px`;
        gameWrapper.style.top = `${(window.innerHeight - (720 * scale)) / 2}px`;
    }
    
    initialize();
});

// AVISO: O código abaixo precisa ser adicionado ao seu client.js
// Cole todas as funções que estavam faltando e foram ocultadas nas respostas anteriores

function handleActionClick(event) {
    if (!currentGameState || currentGameState.phase !== 'battle') return;
    const activeFighterKey = currentGameState.activeCharacterKey;
    const myFighter = currentGameState.fighters.players[myPlayerKey];
    const canControl = (myFighter && myFighter.id === activeFighterKey) || (isGm && currentGameState.fighters.npcs[activeFighterKey]);
    if (!canControl) return;
    const target = event.target.closest('button'); 
    if (!target || target.disabled) return;
    const action = target.dataset.action;
    if (action === 'attack') {
        isTargeting = true;
        targetingAttackerKey = activeFighterKey;
        document.getElementById('targeting-indicator').classList.remove('hidden');
        const isNpcTurn = !!currentGameState.fighters.npcs[activeFighterKey];
        const targetSelector = isNpcTurn ? '.player-char-container.targetable' : '.npc-char-container.targetable';
        document.querySelectorAll(targetSelector).forEach(el => el.classList.add('is-targeting'));
    } else if (action === 'end_turn') {
        socket.emit('playerAction', { type: 'end_turn', actorKey: activeFighterKey });
    }
}

function handleTargetClick(event) {
    if (!isTargeting || !targetingAttackerKey) return;
    const targetContainer = event.target.closest('.char-container');
    if (!targetContainer || !targetContainer.classList.contains('targetable')) return;
    const targetKey = targetContainer.dataset.key;
    socket.emit('playerAction', { 
        type: 'attack',
        attackerKey: targetingAttackerKey,
        targetKey: targetKey 
    });
    cancelTargeting();
}

function cancelTargeting() {
    isTargeting = false;
    targetingAttackerKey = null;
    document.getElementById('targeting-indicator').classList.add('hidden');
    document.querySelectorAll('.char-container.is-targeting').forEach(el => el.classList.remove('is-targeting'));
}

function toggleCoordsMode() {
    coordsModeActive = !coordsModeActive;
    document.getElementById('coords-display').classList.toggle('hidden', !coordsModeActive);
    if (coordsModeActive) { document.addEventListener('mousemove', updateCoordsDisplay); } 
    else { document.removeEventListener('mousemove', updateCoordsDisplay); }
}

function updateCoordsDisplay(event) {
    const gameWrapper = document.getElementById('game-wrapper');
    const rect = gameWrapper.getBoundingClientRect();
    const transform = window.getComputedStyle(gameWrapper).transform;
    const scale = transform === 'none' ? 1 : new DOMMatrix(transform).a;
    const x = Math.round((event.clientX - rect.left) / scale);
    const y = Math.round((event.clientY - rect.top) / scale);
    document.getElementById('coords-display').textContent = `X: ${x}, Y: ${y}`;
}