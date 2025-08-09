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
    let localWorldScale = 1.0; // CORRIGIDO: Zoom local para o modo cenário
    let isGroupSelectMode = false;
    let selectedTokens = new Set();
    let isDragging = false;
    let dragTarget = null;
    let dragOffsets = new Map(); // Para mover múltiplos tokens

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
    const selectionBox = document.getElementById('selection-box');
    const initiativeUI = document.getElementById('initiative-ui');


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
                case 'initiative_roll': showScreen(fightScreen); updateAdventureUI(gameState); renderInitiativeUI(gameState); break;
                case 'battle':
                default: showScreen(fightScreen); initiativeUI.classList.add('hidden'); updateAdventureUI(gameState);
            }
        } else {
            if (['party_setup', 'npc_setup'].includes(gameState.phase)) {
                showScreen(document.getElementById('player-waiting-screen'));
                document.getElementById('player-waiting-message').innerText = "O Mestre está preparando a aventura...";
            } else {
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
        document.getElementById('player-waiting-message').innerText = "Personagem enviado! Aguardando o Mestre...";
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
        const NPC_POSITIONS = [ { left: '1000px', top: '500px' }, { left: '900px',  top: '400px' }, { left: '800px',  top: '300px' }, { left: '700px',  top: '200px' } ];
        
        const allFighters = [...Object.values(state.fighters.players), ...Object.values(state.fighters.npcs)];
        const fighterPositions = {};
        Object.values(state.fighters.players).forEach((f, i) => fighterPositions[f.id] = PLAYER_POSITIONS[i]);
        Object.values(state.fighters.npcs).forEach((f, i) => fighterPositions[f.id] = NPC_POSITIONS[i]);

        allFighters.forEach(fighter => {
            if(fighter.status === 'disconnected') return;
            const isPlayer = !!state.fighters.players[fighter.id];
            const el = createFighterElement(fighter, isPlayer ? 'player' : 'npc', state, fighterPositions[fighter.id]);
            fightSceneCharacters.appendChild(el);
        });
        
        renderActionButtons(state);
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

        const endTurnBtn = document.createElement('button');
        endTurnBtn.className = 'end-turn-btn';
        endTurnBtn.textContent = 'Encerrar Turno';
        endTurnBtn.disabled = !canControl;
        endTurnBtn.addEventListener('click', () => {
            socket.emit('playerAction', { type: 'end_turn', actorKey: state.activeCharacterKey });
        });

        actionButtonsWrapper.appendChild(attackBtn);
        actionButtonsWrapper.appendChild(endTurnBtn);
    }

    function renderInitiativeUI(state) {
        initiativeUI.classList.remove('hidden');
        const playerRollBtn = document.getElementById('player-roll-initiative-btn');
        const gmRollBtn = document.getElementById('gm-roll-initiative-btn');
        
        playerRollBtn.classList.add('hidden');
        gmRollBtn.classList.add('hidden');

        if (myRole === 'player' && state.fighters.players[myPlayerKey] && !state.initiativeRolls[myPlayerKey]) {
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
        const currentScenarioState = state.scenarioStates?.[state.currentScenario];
        const dataToRender = isGm ? currentScenarioState : state.publicState;
        if (!dataToRender || !dataToRender.scenario) return;

        const scenarioUrl = `images/${dataToRender.scenario}`;
        if (theaterBackgroundImage.src.split('/').pop() !== scenarioUrl.split('/').pop()) {
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
            
            const globalTokenScale = dataToRender.globalTokenScale || 1.0;
            const baseScale = parseFloat(tokenEl.dataset.scale) || 1;
            const isFlipped = tokenEl.dataset.flipped === 'true';
            tokenEl.style.transform = `scale(${baseScale * globalTokenScale}) ${isFlipped ? 'scaleX(-1)' : ''}`;
            
            if (isGm && selectedTokens.has(tokenId)) tokenEl.classList.add('selected');
            fragment.appendChild(tokenEl);
        });
        theaterTokenContainer.appendChild(fragment);
    }
    
    function setupTheaterEventListeners() {
        const getGameScale = () => (window.getComputedStyle(gameWrapper).transform === 'none') ? 1 : new DOMMatrix(window.getComputedStyle(gameWrapper).transform).a;
        const screenToWorldCoords = (e) => {
            const gameScale = getGameScale();
            const viewportRect = theaterBackgroundViewport.getBoundingClientRect();
            const scrollLeft = theaterBackgroundViewport.scrollLeft;
            const scrollTop = theaterBackgroundViewport.scrollTop;

            return {
                worldX: (e.clientX - viewportRect.left) / (gameScale * localWorldScale) + scrollLeft / localWorldScale,
                worldY: (e.clientY - viewportRect.top) / (gameScale * localWorldScale) + scrollTop / localWorldScale
            };
        };

        theaterBackgroundViewport.addEventListener('mousedown', (e) => {
            if (!isGm || e.button !== 0) return;
            
            const tokenElement = e.target.closest('.theater-token');
            if (tokenElement) {
                isDragging = true;
                dragTarget = tokenElement;

                if (!e.ctrlKey && !selectedTokens.has(dragTarget.id)) {
                    selectedTokens.clear();
                    document.querySelectorAll('.theater-token.selected').forEach(t => t.classList.remove('selected'));
                }
                
                if (e.ctrlKey) {
                    if (selectedTokens.has(dragTarget.id)) selectedTokens.delete(dragTarget.id);
                    else selectedTokens.add(dragTarget.id);
                } else {
                    selectedTokens.add(dragTarget.id);
                }

                renderTheaterMode(currentGameState);

                const { worldX, worldY } = screenToWorldCoords(e);
                dragOffsets.clear();
                selectedTokens.forEach(id => {
                    const tokenData = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[id];
                    if(tokenData) {
                        dragOffsets.set(id, { x: worldX - tokenData.x, y: worldY - tokenData.y });
                    }
                });
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!isGm || !isDragging) return;
            e.preventDefault();
            const { worldX, worldY } = screenToWorldCoords(e);
            dragOffsets.forEach((offset, id) => {
                const tokenEl = document.getElementById(id);
                if (tokenEl) {
                    tokenEl.style.left = `${worldX - offset.x}px`;
                    tokenEl.style.top = `${worldY - offset.y}px`;
                }
            });
        });

        window.addEventListener('mouseup', (e) => {
            if (!isGm || !isDragging) return;
            isDragging = false;
            const { worldX, worldY } = screenToWorldCoords(e);
            dragOffsets.forEach((offset, id) => {
                socket.emit('playerAction', { type: 'updateToken', token: { id: id, x: worldX - offset.x, y: worldY - offset.y } });
            });
        });

        theaterBackgroundViewport.addEventListener('drop', (e) => {
            e.preventDefault(); 
            if (!isGm) return;
            try {
                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                const { worldX, worldY } = screenToWorldCoords(e);
                const tokenWidth = 200; // base width
                socket.emit('playerAction', { type: 'updateToken', token: { id: `token-${Date.now()}`, charName: data.charName, img: data.img, x: worldX - tokenWidth / 2, y: worldY - tokenWidth / 2, scale: 1.0, isFlipped: false }});
            } catch (error) { console.error("Drop error:", error); }
        });

        theaterBackgroundViewport.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        // Event listener para o Zoom do Cenário
        theaterBackgroundViewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            const zoomIntensity = 0.1;
            const scroll = e.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;
            const newScale = Math.max(0.2, Math.min(localWorldScale * scroll, 5));

            const rect = theaterBackgroundViewport.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const mousePointTo = {
                x: (mouseX + theaterBackgroundViewport.scrollLeft) / localWorldScale,
                y: (mouseY + theaterBackgroundViewport.scrollTop) / localWorldScale,
            };

            localWorldScale = newScale;
            theaterWorldContainer.style.transform = `scale(${localWorldScale})`;
            
            theaterBackgroundViewport.scrollLeft = mousePointTo.x * localWorldScale - mouseX;
            theaterBackgroundViewport.scrollTop = mousePointTo.y * localWorldScale - mouseY;

        }, { passive: false });
    }

    function initializeGlobalKeyListeners() {
        window.addEventListener('keydown', (e) => {
            if (!currentGameState) return;

            if (currentGameState.mode === 'adventure' && isTargeting && e.key === 'Escape'){
                cancelTargeting();
                return;
            }

            if (currentGameState.mode !== 'theater' || !isGm) return;
            
            const focusedEl = document.activeElement;
            if (focusedEl.tagName === 'INPUT' || focusedEl.tagName === 'TEXTAREA') return;
            
            if (e.key.toLowerCase() === 'f' && selectedTokens.size > 0) {
                e.preventDefault();
                selectedTokens.forEach(tokenId => {
                    const tokenData = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[tokenId];
                    if (tokenData) socket.emit('playerAction', { type: 'updateToken', token: { id: tokenId, isFlipped: !tokenData.isFlipped } });
                });
            } else if (e.key === 'Delete' && selectedTokens.size > 0) {
                e.preventDefault();
                socket.emit('playerAction', { type: 'updateToken', token: { remove: true, ids: Array.from(selectedTokens) } });
                selectedTokens.clear();
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
            if (playerLinkEl) { playerLinkEl.textContent = playerUrl; playerLinkEl.onclick = () => copyToClipboard(playerUrl, playerLinkEl); }
            if (spectatorLinkEl) { spectatorLinkEl.textContent = spectatorUrl; spectatorLinkEl.onclick = () => copyToClipboard(spectatorUrl, spectatorLinkEl); }
        }
    });

    socket.on('assignRole', (data) => {
        myRole = data.role;
        myPlayerKey = data.playerKey || null;
        isGm = !!data.isGm;
    });

    // NOVO: Listener para animações de ataque
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
            targetEl.classList.add('is-hit-flash');
            setTimeout(() => targetEl.classList.remove('is-hit-flash'), 400);
        }
    });


    socket.on('error', (data) => {
        showInfoModal('Erro', data.message);
    });

    socket.on('gameUpdate', (gameState) => {
        const justEnteredTheater = gameState.mode === 'theater' && (!currentGameState || currentGameState.mode !== 'theater');
        oldGameState = currentGameState;
        currentGameState = gameState;
        
        if (!gameState || !gameState.mode) {
            showScreen(document.getElementById('loading-screen'));
            return;
        }

        // CORRIGIDO: Gerencia o background do jogo
        if (gameState.mode === 'adventure' && gameState.scenario) {
             gameWrapper.style.backgroundImage = `url('images/${gameState.scenario}')`;
        } else {
             gameWrapper.style.backgroundImage = `url('images/mapas/cenarios externos/externo (1).png')`;
        }


        switch(gameState.mode) {
            case 'lobby':
                defeatAnimationPlayed.clear();
                stagedNpcs = [];
                if (socket.id === gameState.gmId) {
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
                if (justEnteredTheater) initializeTheaterMode();
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
        
        setupTheaterEventListeners();
        initializeGlobalKeyListeners();
        window.addEventListener('resize', scaleGame);
        scaleGame();
    }
    
    initialize();
});