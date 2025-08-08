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
    
    // Variáveis do Modo Cenário
    let currentScenarioScale = 1.0;
    let isGroupSelectMode = false;
    let selectedTokens = new Set();

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
    
    // --- FUNÇÕES DE UTILIDADE (DEFINIDAS PRIMEIRO) ---
    
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
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-text').innerHTML = text;
        modal.classList.remove('hidden');
        document.getElementById('modal-button').onclick = () => modal.classList.add('hidden');
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
            if (state.activeCharacterKey === fighter.id) container.classList.add('active-turn');
            const activeFighter = state.fighters.players[state.activeCharacterKey] || state.fighters.npcs[state.activeCharacterKey];
            if (activeFighter) {
                const isActiveFighterPlayer = !!state.fighters.players[activeFighter.id];
                const isThisFighterPlayer = type === 'player';
                if (isActiveFighterPlayer !== isThisFighterPlayer) container.classList.add('targetable');
            }
        }
        
        container.addEventListener('mouseenter', () => { if (isTargeting && container.classList.contains('targetable')) container.classList.add('target-hover'); });
        container.addEventListener('mouseleave', () => container.classList.remove('target-hover'));
        if(container.classList.contains('targetable')) container.addEventListener('click', handleTargetClick);

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
        const toggleGmPanelBtn = document.getElementById('toggle-gm-panel-btn');
        const theaterScreenEl = document.getElementById('theater-screen');
        const selectionBox = document.getElementById('selection-box');
        
        toggleGmPanelBtn.addEventListener('click', () => { 
            theaterScreenEl.classList.toggle('panel-hidden');
        });
    
        theaterBackgroundViewport.addEventListener('dragover', (e) => { e.preventDefault(); });
    
        const getGameScale = () => {
            const transform = window.getComputedStyle(gameWrapper).transform;
            if (transform === 'none') return 1;
            return new DOMMatrix(transform).a; 
        };

        const screenToWorldCoords = (e) => {
            const gameScale = getGameScale();
            const viewportRect = theaterBackgroundViewport.getBoundingClientRect();
            const mouseXOnViewport = e.clientX - viewportRect.left;
            const mouseYOnViewport = e.clientY - viewportRect.top;
            const worldX = (mouseXOnViewport / gameScale + theaterBackgroundViewport.scrollLeft) / currentScenarioScale;
            const worldY = (mouseYOnViewport / gameScale + theaterBackgroundViewport.scrollTop) / currentScenarioScale;
            return { worldX, worldY };
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
                const newToken = { 
                    id: `token-${Date.now()}`, 
                    charName: data.charName, 
                    img: data.img, 
                    x: worldX - (tokenBaseWidth * tokenScale / 2), 
                    y: worldY - (tokenBaseWidth * tokenScale / 2), 
                    scale: tokenScale, 
                    isFlipped: false 
                };
                socket.emit('playerAction', { type: 'updateToken', token: newToken });
            } catch (error) { console.error("Erro ao processar o drop:", error); }
        });
    
        theaterGlobalScale.addEventListener('input', () => {
             if(isGm) {
                socket.emit('playerAction', { type: 'updateGlobalScale', scale: parseFloat(theaterGlobalScale.value) });
            }
        });
        
        theaterPublishBtn.addEventListener('click', () => {
             socket.emit('playerAction', { type: 'publish_stage' });
        });

        theaterChangeScenarioBtn.onclick = () => {
            const modalHtml = `
                <div id="modal-tabs-container" style="display: flex; gap: 10px; margin-bottom: 15px; justify-content: center; flex-wrap: wrap;"></div>
                <div id="modal-scenarios-container" style="display: flex; flex-wrap: wrap; gap: 15px; justify-content: center; max-height: 400px; overflow-y: auto;"></div>
            `;
            showInfoModal("Mudar Cenário", modalHtml);

            const tabsContainer = document.getElementById('modal-tabs-container');
            const scenariosContainer = document.getElementById('modal-scenarios-container');

            const renderCategory = (categoryName) => {
                scenariosContainer.innerHTML = '';
                const scenarios = ALL_SCENARIOS[categoryName] || [];
                scenarios.forEach(fileName => {
                    const fullPath = `mapas/${categoryName}/${fileName}`;
                    const card = document.createElement('div');
                    card.className = 'scenario-card';
                    card.style.width = '200px';
                    card.innerHTML = `<img src="images/${fullPath}" alt="${fileName}"><div class="scenario-name" style="font-size: 1.1em; padding: 5px;">${fileName.split('.')[0]}</div>`;
                    card.onclick = () => {
                        socket.emit('playerAction', { type: 'changeScenario', scenario: fullPath });
                        document.getElementById('modal').classList.add('hidden');
                    };
                    scenariosContainer.appendChild(card);
                });
            };
            Object.keys(ALL_SCENARIOS).forEach((categoryName, index) => {
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
            renderCategory(Object.keys(ALL_SCENARIOS)[0]);
        };
    
        theaterBackgroundViewport.addEventListener('mousedown', (e) => { /* ... Lógica de arrastar ... */ });
        theaterBackgroundViewport.addEventListener('wheel', (e) => { /* ... Lógica de zoom ... */ }, { passive: false });
    }

    function initializeGlobalKeyListeners() {
        window.addEventListener('keydown', (e) => {
            if (!isGm || !currentGameState || currentGameState.mode !== 'theater') return;
            if (e.key.toLowerCase() === 'g') { isGroupSelectMode = !isGroupSelectMode; theaterBackgroundViewport.classList.toggle('group-select-mode', isGroupSelectMode); if (!isGroupSelectMode) { selectedTokens.clear(); document.querySelectorAll('.theater-token.selected').forEach(t => t.classList.remove('selected')); } }
            if (e.key.toLowerCase() === 'o') { const hoveredToken = document.querySelector(".theater-token:hover"); if (hoveredToken) socket.emit('playerAction', { type: 'updateToken', token: { id: hoveredToken.id, scale: 1.0 }}); }
            const currentSelectedTokens = document.querySelectorAll('.theater-token.selected');
            if (currentSelectedTokens.length > 0) {
                 if (e.key === 'Delete') { const idsToRemove = Array.from(selectedTokens); socket.emit('playerAction', { type: 'updateToken', token: { remove: true, ids: idsToRemove }}); selectedTokens.clear(); }
                 else if (e.key.toLowerCase() === 'f') { currentSelectedTokens.forEach(token => { const currentTokenState = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[token.id]; if (currentTokenState) socket.emit('playerAction', { type: 'updateToken', token: { id: token.id, isFlipped: !currentTokenState.isFlipped }}); }); }
                 else if (e.key === 'ArrowDown') { currentSelectedTokens.forEach(token => socket.emit('playerAction', { type: 'changeTokenOrder', tokenId: token.id, direction: 'forward' })); }
                 else if (e.key === 'ArrowUp') { currentSelectedTokens.forEach(token => socket.emit('playerAction', { type: 'changeTokenOrder', tokenId: token.id, direction: 'backward' })); }
            }
        });
    }

    // --- INICIALIZAÇÃO E LISTENERS DE SOCKET ---
    
    socket.on('initialData', (data) => {
        ALL_CHARACTERS = data.characters || { players: [], npcs: [] };
        ALL_SCENARIOS = data.scenarios || {};
        if (isGm && currentGameState && currentGameState.mode === 'theater') {
            initializeTheaterMode();
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

    socket.on('gameUpdate', (gameState) => {
        oldGameState = currentGameState;
        currentGameState = gameState;
        
        allScreens.forEach(s => s.classList.remove('active'));
        document.getElementById('initiative-ui')?.classList.add('hidden');

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
                    if (myRole === 'player' && myPlayerData && myPlayerData.selectedCharacter) {
                        message = "Personagem enviado! Aguardando o Mestre...";
                    } else if (myRole === 'spectator') {
                        message = "Aguardando como espectador...";
                    }
                    document.getElementById('player-waiting-message').innerText = message;
                }
            }
        } else if (gameState.mode === 'adventure') {
            handleAdventureMode(gameState);
        } else if (gameState.mode === 'theater') {
            showScreen(theaterScreen);
            renderTheaterMode(gameState);
        }
    });

    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        currentRoomId = urlParams.get('room');
        const roleFromUrl = urlParams.get('role');

        if (currentRoomId && roleFromUrl) {
            socket.emit('playerJoinsLobby', { roomId: currentRoomId, role: roleFromUrl });
            if (roleFromUrl === 'player') {
                showScreen(selectionScreen); // Mostra a seleção para o jogador
            } else {
                showScreen(playerWaitingScreen); // Mostra espera para espectador
            }
        } else {
            socket.emit('gmCreatesLobby');
        }

        document.body.addEventListener('contextmenu', (e) => { if (isTargeting) { e.preventDefault(); cancelTargeting(); } });
        document.body.addEventListener('keydown', (e) => {
            if (isTargeting && e.key === "Escape") { cancelTargeting(); }
        });
        
        actionButtonsWrapper.addEventListener('click', handleActionClick);
        document.getElementById('start-adventure-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsAdventure' }));
        document.getElementById('start-theater-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsTheater' }));
        theaterBackBtn.addEventListener('click', () => socket.emit('playerAction', { type: 'gmGoesBackToLobby' }));
        
        window.addEventListener('resize', scaleGame);
        scaleGame();
        setupTheaterEventListeners();
        initializeGlobalKeyListeners();
    }
    
    initialize();
});