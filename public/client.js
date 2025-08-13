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
    let myRoomId = null; 

    let coordsModeActive = false;
    let clientFlowState = 'initializing';
    const gameStateQueue = [];

    // Dados do Jogo
    let ALL_CHARACTERS = { players: [], npcs: [], dynamic: [] };
    let ALL_SCENARIOS = {};
    let stagedNpcs = [];

    // Controles de UI
    let isTargeting = false;
    let targetingAttackerKey = null;

    // Variáveis do Modo Cenário
    let localWorldScale = 1.0;
    let selectedTokens = new Set();
    let hoveredTokenId = null;
    let isDragging = false;
    let isPanning = false;
    let dragStartPos = { x: 0, y: 0 };
    let dragOffsets = new Map();
    let isGroupSelectMode = false;
    let isSelectingBox = false;
    let selectionBoxStartPos = { x: 0, y: 0 };

    // --- ELEMENTOS DO DOM ---
    const allScreens = document.querySelectorAll('.screen');
    const gameWrapper = document.getElementById('game-wrapper');
    const fightSceneCharacters = document.getElementById('fight-scene-characters');
    const actionButtonsWrapper = document.getElementById('action-buttons-wrapper');
    const theaterBackgroundViewport = document.getElementById('theater-background-viewport');
    const theaterBackgroundImage = document.getElementById('theater-background-image');
    const theaterTokenContainer = document.getElementById('theater-token-container');
    const theaterWorldContainer = document.getElementById('theater-world-container');
    const theaterCharList = document.getElementById('theater-char-list');
    const theaterGlobalScale = document.getElementById('theater-global-scale');
    const initiativeUI = document.getElementById('initiative-ui');
    const modal = document.getElementById('modal');
    const selectionBox = document.getElementById('selection-box');
    const turnOrderSidebar = document.getElementById('turn-order-sidebar');
    const floatingButtonsContainer = document.getElementById('floating-buttons-container');
    const floatingInviteBtn = document.getElementById('floating-invite-btn');
    const floatingSwitchModeBtn = document.getElementById('floating-switch-mode-btn');
    const waitingPlayersSidebar = document.getElementById('waiting-players-sidebar');
    const backToLobbyBtn = document.getElementById('back-to-lobby-btn');
    const coordsDisplay = document.getElementById('coords-display');
    const cheatModal = document.getElementById('cheat-modal');
    const cheatModalCloseBtn = document.getElementById('cheat-modal-close-btn');

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

    function showInfoModal(title, text, showButton = true) {
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-text').innerHTML = text;
        const oldButtons = document.getElementById('modal-content').querySelector('.modal-button-container');
        if(oldButtons) oldButtons.remove();
        document.getElementById('modal-button').classList.toggle('hidden', !showButton);
        modal.classList.remove('hidden');
        document.getElementById('modal-button').onclick = () => modal.classList.add('hidden');
    }
    
    function showConfirmationModal(title, text, onConfirm, confirmText = 'Sim', cancelText = 'Não') {
        const modalContent = document.getElementById('modal-content');
        const modalText = document.getElementById('modal-text');
        document.getElementById('modal-title').innerText = title;
        modalText.innerHTML = `<p>${text}</p>`;
        const oldButtons = modalContent.querySelector('.modal-button-container');
        if(oldButtons) oldButtons.remove();
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'modal-button-container';
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = confirmText;
        confirmBtn.onclick = () => {
            onConfirm(true);
            modal.classList.add('hidden');
        };
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = cancelText;
        cancelBtn.onclick = () => {
            onConfirm(false);
            modal.classList.add('hidden');
        };
        buttonContainer.appendChild(confirmBtn);
        buttonContainer.appendChild(cancelBtn);
        modalContent.appendChild(buttonContainer);
        document.getElementById('modal-button').classList.add('hidden');
        modal.classList.remove('hidden');
    }

    function getGameScale() {
        return (window.getComputedStyle(gameWrapper).transform === 'none') ? 1 : new DOMMatrix(window.getComputedStyle(gameWrapper).transform).a;
    }

    function copyToClipboard(text, element) {
        if (!element) return;
        navigator.clipboard.writeText(text).then(() => {
            const originalHTML = element.innerHTML;
            const isButton = element.tagName === 'BUTTON';
            element.innerHTML = 'Copiado!';
            if (isButton) element.style.fontSize = '14px';
            setTimeout(() => { 
                element.innerHTML = originalHTML; 
                if (isButton) element.style.fontSize = '24px';
            }, 2000);
        });
    }

    function cancelTargeting() {
        isTargeting = false;
        targetingAttackerKey = null;
        document.getElementById('targeting-indicator').classList.add('hidden');
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
                case 'party_setup': 
                    showScreen(document.getElementById('gm-party-setup-screen')); 
                    updateGmPartySetupScreen(gameState); 
                    break;
                case 'npc_setup': 
                    showScreen(document.getElementById('gm-npc-setup-screen')); 
                    if (!oldGameState || oldGameState.phase !== 'npc_setup' || !oldGameState.fighters.npcs || Object.keys(oldGameState.fighters.npcs).length === 0) {
                        stagedNpcs = []; 
                        renderNpcSelectionForGm(); 
                    } 
                    break;
                case 'initiative_roll': 
                case 'battle':
                default: 
                    showScreen(fightScreen); 
                    updateAdventureUI(gameState);
                    if (gameState.phase === 'initiative_roll') {
                        renderInitiativeUI(gameState);
                    } else {
                        initiativeUI.classList.add('hidden');
                    }
            }
        } else {
            const myPlayerData = gameState.connectedPlayers?.[socket.id];
            const amIInTheFight = !!getFighter(gameState, myPlayerKey);

            if (myPlayerData?.role === 'player' && myPlayerData.selectedCharacter && !amIInTheFight) {
                showScreen(document.getElementById('player-waiting-screen'));
                document.getElementById('player-waiting-message').innerText = "Aguardando permissão do Mestre para entrar na batalha...";
            }
            else if (['party_setup', 'npc_setup'].includes(gameState.phase)) {
                showScreen(document.getElementById('player-waiting-screen'));
                document.getElementById('player-waiting-message').innerText = "O Mestre está preparando a aventura...";
            } 
            else {
                showScreen(fightScreen); 
                updateAdventureUI(gameState);
                if (gameState.phase === 'initiative_roll') {
                    renderInitiativeUI(gameState);
                } else {
                    initiativeUI.classList.add('hidden');
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
        let myCurrentSelection = currentGameState?.connectedPlayers?.[socket.id]?.selectedCharacter?.nome;
        (ALL_CHARACTERS.players || []).forEach(data => {
            const card = document.createElement('div');
            card.className = 'char-card';
            card.dataset.name = data.name;
            card.dataset.img = data.img;
            card.innerHTML = `<img src="${data.img}" alt="${data.name}"><div class="char-name">${data.name}</div>`;
            const isUnavailable = unavailable.includes(data.name);
            const isMySelection = myCurrentSelection === data.name;
            if (isMySelection) {
                card.classList.add('selected');
                confirmBtn.disabled = false;
            } else if (isUnavailable) {
                card.classList.add('disabled');
                card.innerHTML += `<div class="char-unavailable-overlay">SELECIONADO</div>`;
            }
            if (!isUnavailable || isMySelection) {
                card.addEventListener('click', () => {
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
        if (currentGameState && currentGameState.mode !== 'lobby') {
             document.getElementById('player-waiting-message').innerText = "Aguardando permissão do Mestre para entrar na batalha...";
        } else {
             document.getElementById('player-waiting-message').innerText = "Personagem enviado! Aguardando o Mestre...";
        }
    }

    function updateGmPartySetupScreen(state) {
        const partyList = document.getElementById('gm-party-list');
        partyList.innerHTML = '';
        if(!state.fighters || !state.fighters.players) return;
        Object.values(state.fighters.players).forEach(player => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'party-member-card';
            playerDiv.dataset.id = player.id;
            playerDiv.innerHTML = `<img src="${player.img}" alt="${player.nome}"><h4>${player.nome}</h4><label>AGI: <input type="number" class="agi-input" value="${player.agi || 2}"></label><label>RES: <input type="number" class="res-input" value="${player.res || 3}"></label>`;
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
                if (stagedNpcs.length < 5) {
                    stagedNpcs.push({ ...npcData, id: `npc-${Date.now()}` }); 
                    renderNpcStagingArea();
                } else { alert("Você pode adicionar no máximo 5 inimigos."); }
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
                e.stopPropagation();
                stagedNpcs.splice(parseInt(e.target.dataset.index, 10), 1);
                renderNpcStagingArea();
            });
            stagingArea.appendChild(stagedDiv);
        });
    }

    function updateAdventureUI(state) {
        if (!state || !state.fighters) return;
        
        fightSceneCharacters.innerHTML = '';
        document.getElementById('round-info').textContent = `ROUND ${state.currentRound}`;
        document.getElementById('fight-log').innerHTML = (state.log || []).map(entry => `<p class="log-${entry.type || 'info'}">${entry.text}</p>`).join('');
        
        const PLAYER_POSITIONS = [ { left: '150px', top: '500px' }, { left: '250px', top: '400px' }, { left: '350px', top: '300px' }, { left: '450px', top: '200px' } ];
        const NPC_POSITIONS = [ 
            { left: '1000px', top: '500px' }, 
            { left: '900px',  top: '400px' }, 
            { left: '800px',  top: '300px' }, 
            { left: '700px',  top: '200px' }, 
            { left: '1000px', top: '350px' }
        ];
        
        const allFighters = [...Object.values(state.fighters.players), ...Object.values(state.fighters.npcs)];
        const fighterPositions = {};
        
        Object.values(state.fighters.players).forEach((f, i) => {
             if (i < PLAYER_POSITIONS.length) fighterPositions[f.id] = PLAYER_POSITIONS[i];
        });

        // CORREÇÃO: Posiciona os NPCs com base no seu `slot` fixo
        Object.values(state.fighters.npcs).forEach(npc => {
            if (npc.slot !== undefined && npc.slot < NPC_POSITIONS.length) {
                fighterPositions[npc.id] = NPC_POSITIONS[npc.slot];
            }
        });

        allFighters.forEach(fighter => {
            if(fighter.status === 'disconnected') return;
            if (!fighterPositions[fighter.id]) return; // Não renderiza se não houver posição

            const isPlayer = !!state.fighters.players[fighter.id];
            const el = createFighterElement(fighter, isPlayer ? 'player' : 'npc', state, fighterPositions[fighter.id]);
            fightSceneCharacters.appendChild(el);
        });
        
        renderActionButtons(state);
        renderTurnOrderUI(state);
        renderWaitingPlayers(state);
    }
    
    function createFighterElement(fighter, type, state, position) {
        const container = document.createElement('div');
        container.className = `char-container ${type}-char-container`;
        container.id = fighter.id;
        container.dataset.key = fighter.id;

        const characterScale = fighter.scale || 1.0;
        
        Object.assign(container.style, position);
        container.style.setProperty('--character-scale', characterScale);
        container.style.transform = `scale(${characterScale})`;
        container.style.zIndex = parseInt(position.top, 10);
        
        const oldFighterState = oldGameState ? (getFighter(oldGameState, fighter.id)) : null;
        const wasJustDefeated = oldFighterState && oldFighterState.status === 'active' && fighter.status === 'down';
        const wasJustFled = oldFighterState && oldFighterState.status === 'active' && fighter.status === 'fled';
        
        if (wasJustDefeated && !defeatAnimationPlayed.has(fighter.id)) {
            defeatAnimationPlayed.add(fighter.id);
            container.classList.add(type === 'player' ? 'animate-defeat-player' : 'animate-defeat-npc');
        } else if (fighter.status === 'down') {
             container.classList.add(type === 'player' ? 'player-defeated-final' : 'npc-defeated-final');
        } else if (wasJustFled) {
             container.classList.add(type === 'player' ? 'is-fleeing-player' : 'is-fleeing-npc');
        } else if (fighter.status === 'fled') {
             container.classList.add('fled-final');
        }

        if (fighter.status === 'active') {
            if (state.activeCharacterKey === fighter.id) container.classList.add('active-turn');
            const activeFighter = getFighter(state, state.activeCharacterKey);
            if (activeFighter && activeFighter.status === 'active') {
                const isActiveFighterPlayer = !!state.fighters.players[activeFighter.id];
                const isThisFighterPlayer = type === 'player';
                if (isActiveFighterPlayer !== isThisFighterPlayer) {
                    container.classList.add('targetable');
                }
            }
        }
        if(container.classList.contains('targetable')) {
            container.addEventListener('click', handleTargetClick);
        }
        const healthPercentage = (fighter.hp / fighter.hpMax) * 100;
        container.innerHTML = `<div class="health-bar-ingame"><div class="health-bar-ingame-fill" style="width: ${healthPercentage}%"></div><span class="health-bar-ingame-text">${fighter.hp}/${fighter.hpMax}</span></div><img src="${fighter.img}" class="fighter-img-ingame"><div class="fighter-name-ingame">${fighter.nome}</div>`;
        return container;
    }
    
    function renderActionButtons(state) {
        actionButtonsWrapper.innerHTML = '';
        if(state.phase !== 'battle' || !!state.winner) return;
        const activeFighter = getFighter(state, state.activeCharacterKey);
        if (!activeFighter) return;
        const isNpcTurn = !!state.fighters.npcs[activeFighter.id];
        const canControl = (myRole === 'player' && state.activeCharacterKey === myPlayerKey) || (isGm && isNpcTurn);
        
        const attackBtn = document.createElement('button');
        attackBtn.className = 'action-btn';
        attackBtn.textContent = 'Atacar';
        attackBtn.disabled = !canControl;
        attackBtn.addEventListener('click', () => {
            isTargeting = true;
            targetingAttackerKey = state.activeCharacterKey;
            document.getElementById('targeting-indicator').classList.remove('hidden');
        });

        const fleeBtn = document.createElement('button');
        fleeBtn.className = 'flee-btn';
        fleeBtn.textContent = 'Fugir';
        fleeBtn.disabled = !canControl;
        fleeBtn.addEventListener('click', () => {
            socket.emit('playerAction', { type: 'flee', actorKey: state.activeCharacterKey });
        });
        
        const endTurnBtn = document.createElement('button');
        endTurnBtn.className = 'end-turn-btn';
        endTurnBtn.textContent = 'Encerrar Turno';
        endTurnBtn.disabled = !canControl;
        endTurnBtn.addEventListener('click', () => {
            socket.emit('playerAction', { type: 'end_turn', actorKey: state.activeCharacterKey });
        });

        actionButtonsWrapper.appendChild(attackBtn);
        actionButtonsWrapper.appendChild(fleeBtn);
        actionButtonsWrapper.appendChild(endTurnBtn);
    }

    function renderInitiativeUI(state) {
        initiativeUI.classList.remove('hidden');
        const playerRollBtn = document.getElementById('player-roll-initiative-btn');
        const gmRollBtn = document.getElementById('gm-roll-initiative-btn');
        playerRollBtn.classList.add('hidden');
        gmRollBtn.classList.add('hidden');
        if (myRole === 'player' && getFighter(state, myPlayerKey) && !state.initiativeRolls[myPlayerKey]) {
            playerRollBtn.classList.remove('hidden'); 
            playerRollBtn.disabled = false;
            playerRollBtn.onclick = () => { playerRollBtn.disabled = true; socket.emit('playerAction', { type: 'roll_initiative' }); };
        }
        if (isGm) {
            const npcsNeedToRoll = Object.values(state.fighters.npcs).some(npc => npc.status === 'active' && !state.initiativeRolls[npc.id]);
            if (npcsNeedToRoll) {
                gmRollBtn.classList.remove('hidden'); 
                gmRollBtn.disabled = false;
                gmRollBtn.onclick = () => { gmRollBtn.disabled = true; socket.emit('playerAction', { type: 'roll_initiative', isGmRoll: true }); };
            }
        }
    }

    function renderTurnOrderUI(state) {
        if (state.phase !== 'battle' && state.phase !== 'initiative_roll') {
            turnOrderSidebar.classList.add('hidden');
            return;
        }
        turnOrderSidebar.innerHTML = '';
        turnOrderSidebar.classList.remove('hidden');
        const orderedFighters = state.turnOrder
            .map(id => getFighter(state, id))
            .filter(f => f && f.status === 'active'); 
        orderedFighters.forEach((fighter, index) => {
            const card = document.createElement('div');
            card.className = 'turn-order-card';
            if (fighter.id === state.activeCharacterKey) {
                card.classList.add('active-turn-indicator');
            }
            const img = document.createElement('img');
            img.src = fighter.img;
            img.alt = fighter.nome;
            img.title = fighter.nome;
            card.appendChild(img);
            turnOrderSidebar.appendChild(card);
        });
    }

    function renderWaitingPlayers(state) {
        waitingPlayersSidebar.innerHTML = '';
        const waiting = state.waitingPlayers || {};
        if (Object.keys(waiting).length === 0) {
            waitingPlayersSidebar.classList.add('hidden');
            return;
        }
        waitingPlayersSidebar.classList.remove('hidden');
        for (const playerId in waiting) {
            const character = waiting[playerId];
            const card = document.createElement('div');
            card.className = 'waiting-player-card';
            card.innerHTML = `<img src="${character.img}" alt="${character.nome}"><p>${character.nome}</p>`;
            if (isGm) {
                card.classList.add('gm-clickable');
                card.title = `Clique para admitir ${character.nome} na batalha`;
                card.onclick = () => {
                    socket.emit('playerAction', { type: 'gmDecidesOnAdmission', playerId, admitted: true });
                };
            }
            waitingPlayersSidebar.appendChild(card);
        }
    }

    function handleTargetClick(event) {
        if (!isTargeting || !targetingAttackerKey) return;
        const targetContainer = event.target.closest('.char-container.targetable');
        if (!targetContainer) return;
        actionButtonsWrapper.querySelectorAll('button').forEach(b => b.disabled = true);
        const targetKey = targetContainer.dataset.key;
        socket.emit('playerAction', { type: 'attack', attackerKey: targetingAttackerKey, targetKey: targetKey });
        cancelTargeting();
    }
    
    // --- LÓGICA DO MODO CENÁRIO ---
    function initializeTheaterMode() {
        localWorldScale = 1.0;
        theaterWorldContainer.style.transform = `scale(1)`;
        theaterBackgroundViewport.scrollLeft = 0;
        theaterBackgroundViewport.scrollTop = 0;
        theaterCharList.innerHTML = '';
        const createMini = (data) => {
            const mini = document.createElement('div');
            mini.className = 'theater-char-mini';
            mini.style.backgroundImage = `url("${data.img}")`;
            mini.title = data.name;
            mini.draggable = true;
            mini.addEventListener('dragstart', (e) => {
                if (!isGm) return;
                e.dataTransfer.setData('application/json', JSON.stringify({ charName: data.name, img: data.img }));
            });
            theaterCharList.appendChild(mini);
        };
        const allMinis = [...(ALL_CHARACTERS.players || []), ...(ALL_CHARACTERS.npcs || []), ...(ALL_CHARACTERS.dynamic || [])];
        allMinis.forEach(char => createMini(char));
    }

    function renderTheaterMode(state) {
        if (isDragging) return;
        const currentScenarioState = state.scenarioStates?.[state.currentScenario];
        const dataToRender = isGm ? currentScenarioState : state.publicState;
        if (!dataToRender || !dataToRender.scenario) return;

        const scenarioUrl = `images/${dataToRender.scenario}`;
        if (!theaterBackgroundImage.src.includes(dataToRender.scenario)) {
            const img = new Image();
            img.onload = () => {
                theaterBackgroundImage.src = img.src;
                theaterWorldContainer.style.width = `${img.naturalWidth}px`;
                theaterWorldContainer.style.height = `${img.naturalHeight}px`;
                if (isGm) socket.emit('playerAction', { type: 'update_scenario_dims', width: img.naturalWidth, height: img.naturalHeight });
            };
            img.src = scenarioUrl;
        }
        
        document.getElementById('theater-gm-panel').classList.toggle('hidden', !isGm);
        document.getElementById('toggle-gm-panel-btn').classList.toggle('hidden', !isGm);
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
            
            const globalTokenScale = dataToRender.globalTokenScale || 1.0;
            const baseScale = parseFloat(tokenEl.dataset.scale);
            const isFlipped = tokenEl.dataset.flipped === 'true';
            tokenEl.style.transform = `scale(${baseScale * globalTokenScale}) ${isFlipped ? 'scaleX(-1)' : ''}`;
            
            if (isGm) {
                if (selectedTokens.has(tokenId)) tokenEl.classList.add('selected');
                tokenEl.addEventListener('mouseenter', () => hoveredTokenId = tokenId);
                tokenEl.addEventListener('mouseleave', () => hoveredTokenId = null);
            }
            fragment.appendChild(tokenEl);
        });
        theaterTokenContainer.appendChild(fragment);
    }
    
    function setupTheaterEventListeners() {
        theaterBackgroundViewport.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            dragStartPos = { x: e.clientX, y: e.clientY };

            if (isGm) {
                const tokenElement = e.target.closest('.theater-token');
                if (isGroupSelectMode && !tokenElement) {
                    isSelectingBox = true;
                    selectionBoxStartPos = { x: e.clientX, y: e.clientY };
                    const gameScale = getGameScale();
                    const viewportRect = theaterBackgroundViewport.getBoundingClientRect();
                    const startX = (e.clientX - viewportRect.left) / gameScale;
                    const startY = (e.clientY - viewportRect.top) / gameScale;
                    Object.assign(selectionBox.style, { left: `${startX}px`, top: `${startY}px`, width: '0px', height: '0px' });
                    selectionBox.classList.remove('hidden');
                    return;
                }

                if (tokenElement) {
                    isDragging = true;
                    if (!e.ctrlKey && !selectedTokens.has(tokenElement.id)) {
                        selectedTokens.clear();
                        selectedTokens.add(tokenElement.id);
                    } else if (e.ctrlKey) {
                        if (selectedTokens.has(tokenElement.id)) {
                            selectedTokens.delete(tokenElement.id);
                        } else {
                            selectedTokens.add(tokenElement.id);
                        }
                    }
                    dragOffsets.clear();
                    selectedTokens.forEach(id => {
                        const tokenData = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[id];
                        if (tokenData) {
                           dragOffsets.set(id, { startX: tokenData.x, startY: tokenData.y });
                        }
                    });
                    renderTheaterMode(currentGameState);
                } else if (!isGroupSelectMode) {
                    if (selectedTokens.size > 0) {
                        selectedTokens.clear();
                        renderTheaterMode(currentGameState);
                    }
                    isPanning = true;
                }
            } else {
                isPanning = true;
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (isGm && isDragging) {
                e.preventDefault();
                requestAnimationFrame(() => {
                    const gameScale = getGameScale();
                    const deltaX = (e.clientX - dragStartPos.x) / gameScale / localWorldScale;
                    const deltaY = (e.clientY - dragStartPos.y) / gameScale / localWorldScale;
                    selectedTokens.forEach(id => {
                        const tokenEl = document.getElementById(id);
                        const initialPos = dragOffsets.get(id);
                        if (tokenEl && initialPos) {
                            tokenEl.style.left = `${initialPos.startX + deltaX}px`;
                            tokenEl.style.top = `${initialPos.startY + deltaY}px`;
                        }
                    });
                });
            } else if (isGm && isSelectingBox) {
                e.preventDefault();
                const gameScale = getGameScale();
                const viewportRect = theaterBackgroundViewport.getBoundingClientRect();
                const currentX = (e.clientX - viewportRect.left) / gameScale;
                const currentY = (e.clientY - viewportRect.top) / gameScale;
                const startX = (selectionBoxStartPos.x - viewportRect.left) / gameScale;
                const startY = (selectionBoxStartPos.y - viewportRect.top) / gameScale;
                const left = Math.min(currentX, startX);
                const top = Math.min(currentY, startY);
                const width = Math.abs(currentX - startX);
                const height = Math.abs(currentY - startY);
                Object.assign(selectionBox.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
            } else if (isPanning) {
                 e.preventDefault();
                 theaterBackgroundViewport.scrollLeft -= e.movementX;
                 theaterBackgroundViewport.scrollTop -= e.movementY;
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (isGm && isDragging) {
                isDragging = false;
                const gameScale = getGameScale();
                const deltaX = (e.clientX - dragStartPos.x) / gameScale / localWorldScale;
                const deltaY = (e.clientY - dragStartPos.y) / gameScale / localWorldScale;
                selectedTokens.forEach(id => {
                    const initialPos = dragOffsets.get(id);
                    if(initialPos) {
                        const finalX = initialPos.startX + deltaX;
                        const finalY = initialPos.startY + deltaY;
                        socket.emit('playerAction', { type: 'updateToken', token: { id: id, x: finalX, y: finalY } });
                    }
                });
            } else if (isGm && isSelectingBox) {
                const boxRect = selectionBox.getBoundingClientRect();
                isSelectingBox = false;
                selectionBox.classList.add('hidden');
                if (!e.ctrlKey) {
                    selectedTokens.clear();
                }
                document.querySelectorAll('.theater-token').forEach(token => {
                    const tokenRect = token.getBoundingClientRect();
                    if (boxRect.left < tokenRect.right && boxRect.right > tokenRect.left && boxRect.top < tokenRect.bottom && boxRect.bottom > tokenRect.top) {
                         if (e.ctrlKey && selectedTokens.has(token.id)) {
                             selectedTokens.delete(token.id);
                         } else {
                             selectedTokens.add(token.id);
                         }
                    }
                });
                renderTheaterMode(currentGameState);
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
                const finalX = ((e.clientX - viewportRect.left) / gameScale + theaterBackgroundViewport.scrollLeft) / localWorldScale - (tokenWidth / 2);
                const finalY = ((e.clientY - viewportRect.top) / gameScale + theaterBackgroundViewport.scrollTop) / localWorldScale - (tokenWidth / 2);
                socket.emit('playerAction', { type: 'updateToken', token: { id: `token-${Date.now()}`, charName: data.charName, img: data.img, x: finalX, y: finalY, scale: 1.0, isFlipped: false }});
            } catch (error) { console.error("Drop error:", error); }
        });

        theaterBackgroundViewport.addEventListener('dragover', (e) => e.preventDefault());

        theaterBackgroundViewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (isGm && hoveredTokenId && selectedTokens.has(hoveredTokenId)) {
                const tokenData = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[hoveredTokenId];
                if (tokenData) {
                    const newScale = (tokenData.scale || 1.0) + (e.deltaY > 0 ? -0.1 : 0.1);
                    selectedTokens.forEach(id => {
                        socket.emit('playerAction', { type: 'updateToken', token: { id: id, scale: Math.max(0.1, newScale) }});
                    });
                }
            } else {
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
                const newScrollLeft = worldX * localWorldScale - mouseX;
                const newScrollTop = worldY * localWorldScale - mouseY;
                theaterBackgroundViewport.scrollLeft = newScrollLeft;
                theaterBackgroundViewport.scrollTop = newScrollTop;
            }
        }, { passive: false });

        theaterGlobalScale.addEventListener('change', (e) => {
             if (!isGm) return;
             socket.emit('playerAction', {type: 'updateGlobalScale', scale: parseFloat(e.target.value)});
        });
    }

    function initializeGlobalKeyListeners() {
        window.addEventListener('keydown', (e) => {
            if (!currentGameState) return;

            if (cheatModal.classList.contains('active') && (e.key.toLowerCase() === 'c' || e.key === 'Escape')) {
                e.preventDefault();
                cheatModal.classList.remove('active');
                return;
            }
            
            if (currentGameState.mode === 'adventure' && isTargeting && e.key === 'Escape'){ cancelTargeting(); return; }
            
            const focusedEl = document.activeElement;
            if (focusedEl.tagName === 'INPUT' || focusedEl.tagName === 'TEXTAREA') return;

            if (e.key.toLowerCase() === 't') {
                e.preventDefault();
                coordsModeActive = !coordsModeActive;
                coordsDisplay.classList.toggle('hidden', !coordsModeActive);
            }

            // CORREÇÃO: Chama a nova função do modal de cheat
            if (isGm && currentGameState.mode === 'adventure' && e.key.toLowerCase() === 'c') {
                e.preventDefault();
                showCheatSlotSelection();
            }

            if (currentGameState.mode !== 'theater' || !isGm) return;
            
            if(e.key.toLowerCase() === 'g') {
                e.preventDefault();
                isGroupSelectMode = !isGroupSelectMode;
                theaterBackgroundViewport.classList.toggle('group-select-mode', isGroupSelectMode);
                if (!isGroupSelectMode) {
                    isSelectingBox = false;
                    selectionBox.classList.add('hidden');
                }
            }

            const targetId = hoveredTokenId || (selectedTokens.size === 1 ? selectedTokens.values().next().value : null);
            if (e.key.toLowerCase() === 'f' && targetId) {
                e.preventDefault();
                const tokenData = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[targetId];
                if(tokenData) socket.emit('playerAction', { type: 'updateToken', token: { id: targetId, isFlipped: !tokenData.isFlipped } });
            } else if (e.key.toLowerCase() === 'o' && targetId) {
                e.preventDefault();
                socket.emit('playerAction', { type: 'updateToken', token: { id: targetId, scale: 1.0 } });
            } else if (e.key === 'Delete' && selectedTokens.size > 0) {
                e.preventDefault();
                socket.emit('playerAction', { type: 'updateToken', token: { remove: true, ids: Array.from(selectedTokens) } });
                selectedTokens.clear();
            } else if (selectedTokens.size === 1 && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault();
                const tokenId = selectedTokens.values().next().value;
                const currentOrder = [...currentGameState.scenarioStates[currentGameState.currentScenario].tokenOrder];
                const currentIndex = currentOrder.indexOf(tokenId);
                
                if (e.key === 'ArrowUp' && currentIndex < currentOrder.length - 1) {
                    [currentOrder[currentIndex], currentOrder[currentIndex + 1]] = [currentOrder[currentIndex + 1], currentOrder[currentIndex]];
                    socket.emit('playerAction', { type: 'updateTokenOrder', order: currentOrder });
                } else if (e.key === 'ArrowDown' && currentIndex > 0) {
                    [currentOrder[currentIndex], currentOrder[currentIndex - 1]] = [currentOrder[currentIndex - 1], currentOrder[currentIndex]];
                    socket.emit('playerAction', { type: 'updateTokenOrder', order: currentOrder });
                }
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!coordsModeActive) return;

            const gameScale = getGameScale();
            const rect = gameWrapper.getBoundingClientRect();
            
            const mouseX = e.clientX;
            const mouseY = e.clientY;

            const gameX = Math.round((mouseX - rect.left) / gameScale);
            const gameY = Math.round((mouseY - rect.top) / gameScale);

            coordsDisplay.style.left = `${gameX + 15}px`;
            coordsDisplay.style.top = `${gameY + 15}px`;

            coordsDisplay.innerHTML = `X: ${gameX}<br>Y: ${gameY}`;
        });
    }

    function showScenarioSelectionModal() {
        let content = '<div class="category-tabs">';
        const categories = Object.keys(ALL_SCENARIOS);
        categories.forEach((cat, index) => {
            content += `<button class="category-tab-btn ${index === 0 ? 'active' : ''}" data-category="${cat}">${cat.replace(/_/g, ' ')}</button>`;
        });
        content += '</div>';
        categories.forEach((cat, index) => {
            content += `<div class="scenarios-grid ${index === 0 ? 'active' : ''}" id="grid-${cat}">`;
            ALL_SCENARIOS[cat].forEach(scenarioPath => {
                const scenarioName = scenarioPath.split('/').pop().replace('.png','').replace('.jpg','');
                content += `<div class="scenario-card" data-path="${scenarioPath}"><img src="images/mapas/${scenarioPath}" alt="${scenarioName}"><div class="scenario-name">${scenarioName}</div></div>`;
            });
            content += '</div>';
        });
        showInfoModal('Mudar Cenário', content, false);
        document.querySelectorAll('.category-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.category-tab-btn, .scenarios-grid').forEach(el => el.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(`grid-${btn.dataset.category}`).classList.add('active');
            });
        });
        document.querySelectorAll('.scenario-card').forEach(card => {
            card.addEventListener('click', () => {
                const scenario = card.dataset.path;
                socket.emit('playerAction', { type: 'changeScenario', scenario: scenario });
                modal.classList.add('hidden');
            });
        });
    }
    
    // NOVO: Função para mostrar a lista de NPCs para um slot específico
    function showNpcListForCheatModal(slot) {
        const modalText = document.getElementById('modal-text');
        modalText.innerHTML = `
            <h4>Adicionar Inimigo (Slot ${slot + 1})</h4>
            <p>Clique em um inimigo para adicioná-lo.</p>
            <div id="cheat-add-npc-list" class="cheat-npc-list"></div>
        `;
        const listEl = document.getElementById('cheat-add-npc-list');

        (ALL_CHARACTERS.npcs || []).forEach(npcData => {
            const card = document.createElement('div');
            card.className = 'cheat-npc-card';
            card.innerHTML = `<img src="${npcData.img}" alt="${npcData.name}"><p>${npcData.name}</p>`;
            card.addEventListener('click', () => {
                socket.emit('playerAction', { type: 'gmAddMonster', npc: npcData, slot: slot });
                cheatModal.classList.remove('active');
            });
            listEl.appendChild(card);
        });
    }

    // NOVO: Função principal do modal de cheat, que agora mostra a seleção de slots
    function showCheatSlotSelection() {
        const modalText = document.getElementById('modal-text');
        modalText.innerHTML = '';
        
        if (!currentGameState || !currentGameState.fighters || !currentGameState.fighters.npcs) {
            modalText.innerHTML = '<p>Não foi possível carregar o estado do jogo.</p>';
            cheatModal.classList.add('active');
            return;
        }

        const MAX_NPC_SLOTS = 5;
        // Um slot está ocupado se houver qualquer NPC (vivo, morto ou fugido) nele.
        const occupiedSlots = Object.values(currentGameState.fighters.npcs).map(n => n.slot);
        const availableSlots = [];
        for (let i = 0; i < MAX_NPC_SLOTS; i++) {
            if (!occupiedSlots.includes(i)) {
                availableSlots.push(i);
            }
        }

        if (availableSlots.length === 0) {
            modalText.innerHTML = `
                <h4>Adicionar Inimigo à Batalha</h4>
                <p>A batalha já está com o número máximo de inimigos (5). Nenhum slot está vago.</p>
            `;
        } else {
            modalText.innerHTML = `
                <h4>Adicionar Inimigo à Batalha</h4>
                <p>Escolha um slot vago para adicionar o novo inimigo:</p>
                <div id="cheat-slot-selection" class="cheat-slot-selection"></div>
            `;
            const slotContainer = document.getElementById('cheat-slot-selection');
            availableSlots.forEach(slot => {
                const btn = document.createElement('button');
                btn.className = 'slot-selection-btn';
                btn.textContent = `Slot ${slot + 1}`;
                btn.onclick = () => {
                    showNpcListForCheatModal(slot);
                };
                slotContainer.appendChild(btn);
            });
        }
        cheatModal.classList.add('active');
    }


    function renderGame(gameState) {
        const justEnteredTheater = gameState.mode === 'theater' && (!currentGameState || currentGameState.mode !== 'theater');
        oldGameState = currentGameState;
        currentGameState = gameState;

        if (!gameState || !gameState.mode || !gameState.connectedPlayers) {
            showScreen(document.getElementById('loading-screen'));
            return;
        }

        const myPlayerData = gameState.connectedPlayers?.[socket.id];
        
        if (myRole === 'player' && (!myPlayerData || !myPlayerData.selectedCharacter)) {
            showScreen(document.getElementById('selection-screen'));
            const unavailable = Object.values(gameState.connectedPlayers).filter(p => p.selectedCharacter).map(p => p.selectedCharacter.nome);
            renderPlayerCharacterSelection(unavailable);
            return; 
        }
        
        if (gameState.mode === 'adventure' && gameState.scenario) {
             gameWrapper.style.backgroundImage = `url('images/${gameState.scenario}')`;
        } else if (gameState.mode === 'lobby') {
             gameWrapper.style.backgroundImage = `url('images/mapas/cenarios externos/externo (1).png')`;
        } else {
            gameWrapper.style.backgroundImage = 'none';
        }

        turnOrderSidebar.classList.add('hidden');
        floatingButtonsContainer.classList.add('hidden');
        waitingPlayersSidebar.classList.add('hidden');
        backToLobbyBtn.classList.add('hidden');

        if (isGm && (gameState.mode === 'adventure' || gameState.mode === 'theater')) {
            floatingButtonsContainer.classList.remove('hidden');
            backToLobbyBtn.classList.remove('hidden');
            const switchBtn = document.getElementById('floating-switch-mode-btn');
            if(gameState.mode === 'adventure') {
                switchBtn.innerHTML = '🎭';
                switchBtn.title = 'Mudar para Modo Cenário';
            } else {
                switchBtn.innerHTML = '⚔️';
                switchBtn.title = 'Mudar para Modo Aventura';
            }
        }

        switch(gameState.mode) {
            case 'lobby':
                defeatAnimationPlayed.clear();
                stagedNpcs = [];
                if (isGm) {
                    showScreen(document.getElementById('gm-initial-lobby'));
                    updateGmLobbyUI(gameState);
                } else {
                    showScreen(document.getElementById('player-waiting-screen'));
                    const msgEl = document.getElementById('player-waiting-message');
                    if(msgEl) {
                        if (myPlayerData?.role === 'player' && myPlayerData.selectedCharacter) msgEl.innerText = "Personagem enviado! Aguardando o Mestre...";
                        else if (myPlayerData?.role === 'spectator') msgEl.innerText = "Aguardando como espectador...";
                        else msgEl.innerText = "Aguardando o Mestre iniciar o jogo...";
                    }
                }
                break;
            case 'adventure':
                handleAdventureMode(gameState);
                break;
            case 'theater':
                if (justEnteredTheater) initializeTheaterMode();
                showScreen(document.getElementById('theater-screen'));
                renderTheaterMode(gameState);
                break;
            default:
                showScreen(document.getElementById('loading-screen'));
        }
    }


    // --- INICIALIZAÇÃO E LISTENERS DE SOCKET ---
    socket.on('initialData', (data) => {
        ALL_CHARACTERS = data.characters || { players: [], npcs: [], dynamic: [] };
        ALL_SCENARIOS = data.scenarios || {};
        
        while(gameStateQueue.length > 0) {
            const state = gameStateQueue.shift();
            renderGame(state);
        }
    });

    socket.on('gameUpdate', (gameState) => {
        if (clientFlowState === 'choosing_role') {
            return;
        }
        renderGame(gameState);
    });

    socket.on('roomCreated', (roomId) => {
        myRoomId = roomId;
        if (isGm) {
            const baseUrl = window.location.origin;
            const inviteLinkEl = document.getElementById('gm-link-invite');
            const inviteUrl = `${baseUrl}?room=${roomId}`;
            if (inviteLinkEl) { 
                inviteLinkEl.textContent = inviteUrl; 
                inviteLinkEl.onclick = () => copyToClipboard(inviteUrl, inviteLinkEl); 
            }
        }
    });

    socket.on('promptForRole', ({ isFull }) => {
        clientFlowState = 'choosing_role';
        const roleSelectionScreen = document.getElementById('role-selection-screen');
        const joinAsPlayerBtn = document.getElementById('join-as-player-btn');
        const roomFullMessage = document.getElementById('room-full-message');
        if (isFull) {
            joinAsPlayerBtn.disabled = true;
            roomFullMessage.textContent = 'A sala de jogadores está cheia. Você pode entrar como espectador.';
            roomFullMessage.classList.remove('hidden');
        } else {
            joinAsPlayerBtn.disabled = false;
            roomFullMessage.classList.add('hidden');
        }
        showScreen(roleSelectionScreen);
    });

    socket.on('assignRole', (data) => {
        myRole = data.role;
        myPlayerKey = data.playerKey || null;
        isGm = !!data.isGm;
        myRoomId = data.roomId;
        clientFlowState = 'in_game';
    });

    socket.on('gmPromptToAdmit', ({ playerId, character }) => {
        if (!isGm) return;
        showConfirmationModal('Novo Jogador', `${character.nome} deseja entrar na batalha. Permitir?`, (admitted) => {
            socket.emit('playerAction', { type: 'gmDecidesOnAdmission', playerId, admitted });
        });
    });
    
    socket.on('promptForAdventureType', () => {
        if (!isGm) return;
        showConfirmationModal(
            'Retornar à Aventura',
            'Deseja continuar a aventura anterior ou começar uma nova batalha?',
            (continuar) => {
                const choice = continuar ? 'continue' : 'new';
                socket.emit('playerAction', { type: 'gmChoosesAdventureType', choice });
            },
            'Continuar Batalha',
            'Nova Batalha'
        );
    });

    socket.on('attackResolved', ({ attackerKey, targetKey, hit }) => {
        const attackerEl = document.getElementById(attackerKey);
        const targetEl = document.getElementById(targetKey);
        if (attackerEl) {
            const isPlayer = attackerEl.classList.contains('player-char-container');
            const animClass = isPlayer ? 'is-attacking-player' : 'is-attacking-npc';
            attackerEl.classList.add(animClass);
            setTimeout(() => attackerEl.classList.remove(animClass), 500);
        }
        if (targetEl && hit) {
            const img = targetEl.querySelector('.fighter-img-ingame');
            if (img) {
                img.classList.add('is-hit-flash');
                setTimeout(() => img.classList.remove('is-hit-flash'), 400);
            }
        }
    });
    socket.on('error', (data) => showInfoModal('Erro', data.message));
    

    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoomId = urlParams.get('room');
        
        showScreen(document.getElementById('loading-screen')); 

        if (urlRoomId) {
            socket.emit('playerJoinsLobby', { roomId: urlRoomId });
        } else {
            socket.emit('gmCreatesLobby');
        }

        document.getElementById('join-as-player-btn').addEventListener('click', () => {
            socket.emit('playerChoosesRole', { role: 'player' });
            showScreen(document.getElementById('loading-screen'));
        });
        document.getElementById('join-as-spectator-btn').addEventListener('click', () => {
            socket.emit('playerChoosesRole', { role: 'spectator' });
            showScreen(document.getElementById('loading-screen'));
        });

        document.getElementById('start-adventure-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsAdventure' }));
        document.getElementById('start-theater-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsTheater' }));
        backToLobbyBtn.addEventListener('click', () => socket.emit('playerAction', { type: 'gmGoesBackToLobby' }));
        document.getElementById('theater-change-scenario-btn').addEventListener('click', showScenarioSelectionModal);
        document.getElementById('theater-publish-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'publish_stage' }));
        
        floatingSwitchModeBtn.addEventListener('click', () => {
            socket.emit('playerAction', { type: 'gmSwitchesMode' });
        });

        floatingInviteBtn.addEventListener('click', () => {
             if (myRoomId) {
                const inviteUrl = `${window.location.origin}?room=${myRoomId}`;
                copyToClipboard(inviteUrl, floatingInviteBtn);
            }
        });
        
        cheatModalCloseBtn.addEventListener('click', () => {
            cheatModal.classList.remove('active');
        });

        setupTheaterEventListeners();
        initializeGlobalKeyListeners();
        window.addEventListener('resize', scaleGame);
        scaleGame();
    }
    
    initialize();
});