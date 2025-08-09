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
    let isSelectingBox = false;
    let selectionBoxStartX, selectionBoxStartY;

    // --- ELEMENTOS DO DOM ---
    const allScreens = document.querySelectorAll('.screen');
    const gameWrapper = document.getElementById('game-wrapper');
    const fightSceneCharacters = document.getElementById('fight-scene-characters');
    const actionButtonsWrapper = document.getElementById('action-buttons-wrapper');
    const theaterBackgroundViewport = document.getElementById('theater-background-viewport');
    const theaterBackgroundImage = document.getElementById('theater-background-image');
    const theaterTokenContainer = document.getElementById('theater-token-container');
    const theaterCharList = document.getElementById('theater-char-list');
    const theaterGlobalScale = document.getElementById('theater-global-scale');
    const selectionBox = document.getElementById('selection-box');

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
        if (!element) return;
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

    function getFighter(state, key) {
        if (!state || !state.fighters) return null;
        return state.fighters.players[key] || state.fighters.npcs[key];
    }
    
    // --- LÓGICA DO MODO AVENTURA ---
    function handleAdventureMode(gameState) {
        const fightScreen = document.getElementById('fight-screen');
        if (isGm) {
            switch (gameState.phase) {
                case 'party_setup': showScreen(document.getElementById('gm-party-setup-screen')); updateGmPartySetupScreen(gameState); break;
                case 'npc_setup': showScreen(document.getElementById('gm-npc-setup-screen')); if (!oldGameState || oldGameState.phase !== 'npc_setup') { stagedNpcs = []; renderNpcSelectionForGm(); } break;
                case 'initiative_roll': showScreen(fightScreen); updateUI(gameState); renderInitiativeUI(gameState); break;
                default: showScreen(fightScreen); updateUI(gameState);
            }
        } else {
            if (['party_setup', 'npc_setup'].includes(gameState.phase)) {
                showScreen(document.getElementById('player-waiting-screen'));
                document.getElementById('player-waiting-message').innerText = "O Mestre está preparando a aventura...";
            } else {
                showScreen(fightScreen); 
                updateUI(gameState);
                if (gameState.phase === 'initiative_roll') {
                    renderInitiativeUI(gameState);
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
        (ALL_CHARACTERS.players || []).forEach(data => {
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
        showScreen(document.getElementById('player-waiting-screen'));
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
        (ALL_CHARACTERS.npcs || []).forEach(npcData => {
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
        document.getElementById('round-info').textContent = `ROUND ${state.currentRound}`;
        document.getElementById('fight-log').innerHTML = (state.log || []).map(entry => `<p class="log-${entry.type || 'info'}">${entry.text}</p>`).join('');
        
        const PLAYER_POSITIONS = [ { left: '150px', top: '500px' }, { left: '250px', top: '400px' }, { left: '350px', top: '300px' }, { left: '450px', top: '200px' } ];
        const NPC_POSITIONS = [ { left: '1000px', top: '500px' }, { left: '900px',  top: '400px' }, { left: '800px',  top: '300px' }, { left: '700px',  top: '200px' } ];
        
        const allFighters = [...Object.values(state.fighters.players), ...Object.values(state.fighters.npcs)];
        const fighterPositions = {};
        Object.values(state.fighters.players).forEach((f, i) => fighterPositions[f.id] = PLAYER_POSITIONS[i]);
        Object.values(state.fighters.npcs).forEach((f, i) => fighterPositions[f.id] = NPC_POSITIONS[i]);

        allFighters.forEach(fighter => {
            const isPlayer = !!state.fighters.players[fighter.id];
            const el = createFighterElement(fighter, isPlayer ? 'player' : 'npc', state, fighterPositions[fighter.id]);
            fightSceneCharacters.appendChild(el);
        });

        const activeFighter = state.phase === 'battle' ? getFighter(state, state.activeCharacterKey) : null;
        const canControl = (myRole === 'player' && state.activeCharacterKey === myPlayerKey) || (isGm && activeFighter && !!state.fighters.npcs[activeFighter.id]);
        actionButtonsWrapper.innerHTML = `
            <button class="action-btn" data-action="attack" ${!canControl || state.winner ? 'disabled' : ''}>Atacar</button>
            <button class="end-turn-btn" data-action="end_turn" ${!canControl || state.winner ? 'disabled' : ''}>Encerrar Turno</button>
        `;
    }
    
    function createFighterElement(fighter, type, state, position) {
        const container = document.createElement('div');
        container.className = `char-container ${type}-char-container`;
        container.id = fighter.id;
        container.dataset.key = fighter.id;
        Object.assign(container.style, position);

        const oldFighterState = oldGameState ? (getFighter(oldGameState, fighter.id)) : null;
        const wasJustDefeated = oldFighterState && oldFighterState.status === 'active' && fighter.status === 'down';

        if (wasJustDefeated && !defeatAnimationPlayed.has(fighter.id)) {
            defeatAnimationPlayed.add(fighter.id);
            container.classList.add(type === 'player' ? 'animate-defeat-player' : 'animate-defeat-npc');
        } else if (fighter.status === 'down') {
             container.classList.add(type === 'player' ? 'player-defeated-final' : 'npc-defeated-final');
        }

        if (fighter.status === 'active') {
            if (state.activeCharacterKey === fighter.id) container.classList.add('active-turn');
            const activeFighter = getFighter(state, state.activeCharacterKey);
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
        if (!currentGameState || currentGameState.mode !== 'adventure' || currentGameState.phase !== 'battle') return;
        const activeFighterKey = currentGameState.activeCharacterKey;
        const myFighter = myPlayerKey ? getFighter(currentGameState, myPlayerKey) : null;
        const activeFighterData = getFighter(currentGameState, activeFighterKey);
        const canControl = (myFighter && myFighter.id === activeFighterKey) || (isGm && activeFighterData && !!currentGameState.fighters.npcs[activeFighterKey]);
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
        socket.emit('playerAction', { type: 'attack', attackerKey: targetingAttackerKey, targetKey: targetKey });
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
        const allMinis = [...(ALL_CHARACTERS.players || []), ...(ALL_CHARACTERS.npcs || []), ...(ALL_CHARACTERS.dynamic || [])];
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
                document.getElementById('theater-world-container').style.width = `${img.naturalWidth}px`;
                document.getElementById('theater-world-container').style.height = `${img.naturalHeight}px`;
                if (isGm) socket.emit('playerAction', { type: 'update_scenario_dims', width: img.naturalWidth, height: img.naturalHeight });
                updateTheaterZoom();
            };
            img.src = `images/${dataToRender.scenario}`;
        }
        
        document.getElementById('theater-gm-panel').classList.toggle('hidden', !isGm);
        document.getElementById('toggle-gm-panel-btn').classList.toggle('hidden', !isGm);
        document.getElementById('theater-back-btn').classList.toggle('hidden', !isGm);
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
            if (isGm && selectedTokens.has(tokenId)) tokenEl.classList.add('selected');
            fragment.appendChild(tokenEl);
        });
        theaterTokenContainer.appendChild(fragment);
        updateTheaterZoom();
    }
    
    function updateTheaterZoom() {
        const dataToRender = (isGm && currentGameState?.scenarioStates) ? currentGameState.scenarioStates[currentGameState.currentScenario] : currentGameState?.publicState;
        if (!dataToRender) return;
        const globalTokenScale = dataToRender.globalTokenScale || 1.0;
        document.getElementById('theater-world-container').style.transform = `scale(${currentScenarioScale})`;
        document.querySelectorAll('.theater-token').forEach(token => {
            const baseScale = parseFloat(token.dataset.scale) || 1;
            const isFlipped = token.dataset.flipped === 'true';
            token.style.transform = `scale(${baseScale * globalTokenScale}) ${isFlipped ? 'scaleX(-1)' : ''}`;
        });
    }

    function setupTheaterEventListeners() {
        const getGameScale = () => (window.getComputedStyle(gameWrapper).transform === 'none') ? 1 : new DOMMatrix(window.getComputedStyle(gameWrapper).transform).a;
        const screenToWorldCoords = (e) => {
            const gameScale = getGameScale();
            const viewportRect = theaterBackgroundViewport.getBoundingClientRect();
            return {
                worldX: (e.clientX - viewportRect.left) / gameScale / currentScenarioScale + theaterBackgroundViewport.scrollLeft / currentScenarioScale,
                worldY: (e.clientY - viewportRect.top) / gameScale / currentScenarioScale + theaterBackgroundViewport.scrollTop / currentScenarioScale
            };
        };

        theaterBackgroundViewport.addEventListener('mousedown', (e) => {
            if (!isGm || e.button !== 0) return;
            dragTarget = e.target.closest('.theater-token');
            if (dragTarget) {
                isDragging = true;
                const tokenRect = dragTarget.getBoundingClientRect();
                const gameScale = getGameScale();
                dragOffsetX = (e.clientX - tokenRect.left) / gameScale / currentScenarioScale;
                dragOffsetY = (e.clientY - tokenRect.top) / gameScale / currentScenarioScale;
                if (!e.ctrlKey && !selectedTokens.has(dragTarget.id)) {
                    selectedTokens.clear();
                    document.querySelectorAll('.theater-token.selected').forEach(t => t.classList.remove('selected'));
                    selectedTokens.add(dragTarget.id);
                    dragTarget.classList.add('selected');
                } else if (e.ctrlKey) {
                    if (selectedTokens.has(dragTarget.id)) {
                        selectedTokens.delete(dragTarget.id);
                        dragTarget.classList.remove('selected');
                    } else {
                        selectedTokens.add(dragTarget.id);
                        dragTarget.classList.add('selected');
                    }
                }
            } else if (isGroupSelectMode) {
                isSelectingBox = true;
                const { worldX, worldY } = screenToWorldCoords(e);
                selectionBoxStartX = worldX;
                selectionBoxStartY = worldY;
                Object.assign(selectionBox.style, { left: `${worldX}px`, top: `${worldY}px`, width: '0px', height: '0px' });
                selectionBox.classList.remove('hidden');
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!isGm) return;
            const { worldX, worldY } = screenToWorldCoords(e);
            if (isDragging && dragTarget) {
                dragTarget.style.left = `${worldX - dragOffsetX}px`;
                dragTarget.style.top = `${worldY - dragOffsetY}px`;
            } else if (isSelectingBox) {
                const left = Math.min(worldX, selectionBoxStartX);
                const top = Math.min(worldY, selectionBoxStartY);
                const width = Math.abs(worldX - selectionBoxStartX);
                const height = Math.abs(worldY - selectionBoxStartY);
                Object.assign(selectionBox.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (!isGm) return;
            if (isDragging && dragTarget) {
                const { worldX, worldY } = screenToWorldCoords(e);
                socket.emit('playerAction', { type: 'updateToken', token: { id: dragTarget.id, x: worldX - dragOffsetX, y: worldY - dragOffsetY } });
            } else if (isSelectingBox) {
                selectionBox.classList.add('hidden');
                if (!e.ctrlKey) selectedTokens.clear();
                const boxRect = selectionBox.getBoundingClientRect();
                document.querySelectorAll('.theater-token').forEach(token => {
                    const tokenRect = token.getBoundingClientRect();
                    if (boxRect.left < tokenRect.right && boxRect.right > tokenRect.left && boxRect.top < tokenRect.bottom && boxRect.bottom > tokenRect.top) {
                        selectedTokens.add(token.id);
                    }
                });
                renderTheaterMode(currentGameState);
            }
            isDragging = false;
            isSelectingBox = false;
            dragTarget = null;
        });

        theaterBackgroundViewport.addEventListener('drop', (e) => {
            e.preventDefault(); if (!isGm) return;
            try {
                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                const { worldX, worldY } = screenToWorldCoords(e);
                socket.emit('playerAction', { type: 'updateToken', token: { id: `token-${Date.now()}`, charName: data.charName, img: data.img, x: worldX - 100, y: worldY - 100, scale: 1.0, isFlipped: false }});
            } catch (error) { console.error("Drop error:", error); }
        });

        theaterBackgroundViewport.addEventListener('wheel', (e) => {
            const token = e.target.closest('.theater-token');
            if (isGm && token && token.matches(':hover')) {
                e.preventDefault();
                const tokenData = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[token.id];
                if (tokenData) {
                    const newScale = (tokenData.scale || 1.0) + (e.deltaY > 0 ? -0.1 : 0.1);
                    socket.emit('playerAction', { type: 'updateToken', token: { id: token.id, scale: Math.max(0.1, newScale) }});
                }
            }
        }, { passive: false });
    }

    function initializeGlobalKeyListeners() {
        window.addEventListener('keydown', (e) => {
            if (!isGm || !currentGameState || currentGameState.mode !== 'theater') return;
            const focusedEl = document.activeElement;
            if (focusedEl.tagName === 'INPUT' || focusedEl.tagName === 'TEXTAREA') return;

            if (e.key.toLowerCase() === 'g') {
                e.preventDefault();
                isGroupSelectMode = !isGroupSelectMode;
                theaterBackgroundViewport.classList.toggle('group-select-mode', isGroupSelectMode);
                if (!isGroupSelectMode) {
                    selectedTokens.clear();
                    renderTheaterMode(currentGameState);
                }
            }

            if (selectedTokens.size > 0) {
                if (e.key.toLowerCase() === 'f') {
                    selectedTokens.forEach(tokenId => {
                        const tokenData = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[tokenId];
                        if (tokenData) socket.emit('playerAction', { type: 'updateToken', token: { id: tokenId, isFlipped: !tokenData.isFlipped } });
                    });
                } else if (e.key === 'Delete') {
                    socket.emit('playerAction', { type: 'updateToken', token: { remove: true, ids: Array.from(selectedTokens) } });
                    selectedTokens.clear();
                }
            }
        });
    }

    // --- INICIALIZAÇÃO E LISTENERS DE SOCKET ---
    socket.on('initialData', (data) => {
        ALL_CHARACTERS = data.characters || { players: [], npcs: [], dynamic: [] };
        ALL_SCENARIOS = data.scenarios || {};
    });

    socket.on('roomCreated', (roomId) => {
        if (isGm) {
            const baseUrl = window.location.origin;
            const playerLinkEl = document.getElementById('gm-link-player');
            const spectatorLinkEl = document.getElementById('gm-link-spectator');
            const playerUrl = `${baseUrl}?room=${roomId}&role=player`;
            const spectatorUrl = `${baseUrl}?room=${roomId}&role=spectator`;
            if (playerLinkEl) {
                 playerLinkEl.textContent = playerUrl;
                 playerLinkEl.onclick = () => copyToClipboard(playerUrl, playerLinkEl);
            }
            if (spectatorLinkEl) {
                spectatorLinkEl.textContent = spectatorUrl;
                spectatorLinkEl.onclick = () => copyToClipboard(spectatorUrl, spectatorLinkEl);
            }
        }
    });

    socket.on('assignRole', (data) => {
        myRole = data.role;
        myPlayerKey = data.playerKey || null;
        isGm = !!data.isGm;
    });

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
        
        if (!gameState || !gameState.mode) {
            showScreen(document.getElementById('loading-screen'));
            return;
        }

        switch(gameState.mode) {
            case 'lobby':
                defeatAnimationPlayed.clear();
                stagedNpcs = [];
                const iAmTheGm = (socket.id === gameState.gmId);
                if (iAmTheGm) {
                    showScreen(document.getElementById('gm-initial-lobby'));
                    updateGmLobbyUI(gameState);
                } else {
                    const myPlayerData = gameState.connectedPlayers?.[socket.id];
                    if (myPlayerData?.role === 'player' && !myPlayerData.selectedCharacter) {
                        showScreen(document.getElementById('selection-screen'));
                        renderPlayerCharacterSelection(gameState.unavailableCharacters);
                    } else {
                        showScreen(document.getElementById('player-waiting-screen'));
                        const msgEl = document.getElementById('player-waiting-message');
                        if(msgEl) {
                            if (myPlayerData?.role === 'player' && myPlayerData?.selectedCharacter) msgEl.innerText = "Personagem enviado! Aguardando o Mestre...";
                            else if (myPlayerData?.role === 'spectator') msgEl.innerText = "Aguardando como espectador...";
                            else msgEl.innerText = "Aguardando o Mestre iniciar o jogo...";
                        }
                    }
                }
                break;
            case 'adventure':
                handleAdventureMode(gameState);
                break;
            case 'theater':
                if (isGm && justEnteredTheater) initializeTheaterMode();
                showScreen(document.getElementById('theater-screen'));
                renderTheaterMode(gameState);
                break;
            default:
                showScreen(document.getElementById('loading-screen'));
        }
    });

    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoomId = urlParams.get('room');
        const urlRole = urlParams.get('role');

        showScreen(document.getElementById('loading-screen')); 

        if (urlRoomId && urlRole) {
            socket.emit('playerJoinsLobby', { roomId: urlRoomId, role: urlRole });
        } else {
            socket.emit('gmCreatesLobby');
        }

        document.getElementById('start-adventure-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsAdventure' }));
        document.getElementById('start-theater-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsTheater' }));
        document.getElementById('theater-back-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmGoesBackToLobby' }));
        actionButtonsWrapper.addEventListener('click', handleActionClick);
        
        setupTheaterEventListeners();
        initializeGlobalKeyListeners();
        window.addEventListener('resize', scaleGame);
        scaleGame();
    }
    
    initialize();
});