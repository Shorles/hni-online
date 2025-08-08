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
    let ALL_SCENARIOS = [];
    let stagedNpcs = [];

    // Controles de UI
    let isTargeting = false;
    let targetingAttackerKey = null;
    let coordsModeActive = false;
    let selectedTheaterChar = null;
    let isDragging = false;
    let dragOffsetX, dragOffsetY;

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
    
    // --- FUNÇÕES DE LÓGICA E RENDERIZAÇÃO ---

    function showScreen(screenToShow) {
        allScreens.forEach(screen => screen.classList.toggle('active', screen === screenToShow));
    }

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

    function updateUI(state) {
        if (!state || !state.fighters) return;
        gameWrapper.style.backgroundImage = `url('images/${state.scenario}')`;
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
    }
    
    function createFighterElement(fighter, type, state, position) {
        const container = document.createElement('div');
        container.className = `char-container ${type}-char-container`;
        container.id = fighter.id;
        container.dataset.key = fighter.id;
        Object.assign(container.style, position);

        const oldFighterState = oldGameState ? (oldGameState.fighters.players[fighter.id] || oldGameState.fighters.npcs[fighter.id]) : null;
        const wasJustDefeated = oldFighterState && oldFighterState.status === 'active' && fighter.status === 'down';

        if (wasJustDefeated && !defeatAnimationPlayed.has(fighter.id)) {
            defeatAnimationPlayed.add(fighter.id);
            container.classList.add(type === 'player' ? 'animate-defeat-player' : 'animate-defeat-npc');
        } else if (fighter.status === 'down') {
             container.classList.add(type === 'player' ? 'player-defeated-final' : 'npc-defeated-final');
        }

        if (fighter.status === 'active') {
            if (state.activeCharacterKey === fighter.id) {
                container.classList.add('active-turn');
            }
            const activeFighter = state.fighters.players[state.activeCharacterKey] || state.fighters.npcs[state.activeCharacterKey];
            if (activeFighter) {
                const isActiveFighterPlayer = !!state.fighters.players[activeFighter.id];
                const isThisFighterPlayer = type === 'player';
                if (isActiveFighterPlayer !== isThisFighterPlayer) {
                    container.classList.add('targetable');
                }
            }
        }
        
        container.addEventListener('mouseenter', () => { if (isTargeting && container.classList.contains('targetable')) { container.classList.add('target-hover'); } });
        container.addEventListener('mouseleave', () => { container.classList.remove('target-hover'); });
        
        if(container.classList.contains('targetable')) {
             container.addEventListener('click', handleTargetClick);
        }

        const healthPercentage = (fighter.hp / fighter.hpMax) * 100;
        container.innerHTML = `<div class="health-bar-ingame"><div class="health-bar-ingame-fill" style="width: ${healthPercentage}%"></div><span class="health-bar-ingame-text">${fighter.hp}/${fighter.hpMax}</span></div><img src="${fighter.img}" class="fighter-img-ingame"><div class="fighter-name-ingame">${fighter.nome}</div>`;
        return container;
    }

    function renderInitiativeUI(state) {
        const initiativeUI = document.getElementById('initiative-ui');
        initiativeUI.classList.remove('hidden');
        const playerRollBtn = document.getElementById('player-roll-initiative-btn');
        const gmRollBtn = document.getElementById('gm-roll-initiative-btn');
        if (myRole === 'player' && state.fighters.players[myPlayerKey] && !state.initiativeRolls[myPlayerKey]) {
            playerRollBtn.classList.remove('hidden'); playerRollBtn.disabled = false;
            playerRollBtn.onclick = () => { playerRollBtn.disabled = true; socket.emit('playerAction', { type: 'roll_initiative' }); };
        } else { playerRollBtn.classList.add('hidden'); }
        if (isGm) {
            const npcsNeedToRoll = Object.values(state.fighters.npcs).some(npc => !state.initiativeRolls[npc.id]);
            if (npcsNeedToRoll) {
                gmRollBtn.classList.remove('hidden'); gmRollBtn.disabled = false;
                gmRollBtn.onclick = () => { gmRollBtn.disabled = true; socket.emit('playerAction', { type: 'roll_initiative', isGmRoll: true }); };
            } else { gmRollBtn.classList.add('hidden'); }
        } else { gmRollBtn.classList.add('hidden'); }
    }


    function handleActionClick(event) {
        if (!currentGameState || currentGameState.mode !== 'adventure' || currentGameState.phase !== 'battle') return;
        const activeFighterKey = currentGameState.activeCharacterKey;
        const myFighter = myPlayerKey ? currentGameState.fighters.players[myPlayerKey] : null;
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
        const scenarioList = document.getElementById('theater-scenario-list');
        charList.innerHTML = '';
        scenarioList.innerHTML = '';

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
        if (!isGm) return;
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
        renderTheaterScreen(currentGameState);
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

    function cancelTargeting() {
        isTargeting = false;
        targetingAttackerKey = null;
        document.getElementById('targeting-indicator').classList.add('hidden');
        document.querySelectorAll('.char-container.is-targeting').forEach(el => el.classList.remove('is-targeting'));
    }

    // --- FUNÇÕES DE UTILIDADE ---
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

    // --- INICIALIZAÇÃO E LISTENERS DE SOCKET ---
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
        scaleGame(); // Chama a função uma vez para ajustar a tela no carregamento
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
                    document.getElementById('player-waiting-message').innerText = "Aguardando o Mestre iniciar...";
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
    socket.on('error', (err) => { alert(err.message); window.location.reload(); });
    
    initialize(); // Ponto de entrada do script
});