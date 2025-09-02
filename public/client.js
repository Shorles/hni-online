// client.js

document.addEventListener('DOMContentLoaded', () => {
    // --- VARIÁVEIS DE REGRAS DO JOGO (CARREGADAS DE JSON) ---
    let GAME_RULES = {};
    let ALL_SPELLS = {};
    let tempCharacterSheet = {};

    // --- VARIÁVEIS DE ESTADO ---
    let myRole = null, myPlayerKey = null, isGm = false;
    let currentGameState = null, oldGameState = null;
    let defeatAnimationPlayed = new Set();
    const socket = io();
    let myRoomId = null; 
    let coordsModeActive = false;
    let clientFlowState = 'initializing'; // CONTROLA O FLUXO PARA EVITAR BUGS
    let ALL_CHARACTERS = { players: [], npcs: [], dynamic: [] };
    let ALL_SCENARIOS = {};
    let stagedNpcSlots = new Array(5).fill(null);
    let selectedSlotIndex = null;
    const MAX_NPCS = 5;
    let isTargeting = false;
    let targetingAction = null;
    let isFreeMoveModeActive = false;
    let customFighterPositions = {};
    let draggedFighter = { element: null, offsetX: 0, offsetY: 0 };
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
    let isGmDebugModeActive = false;

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
    const floatingHelpBtn = document.getElementById('floating-help-btn');
    const waitingPlayersSidebar = document.getElementById('waiting-players-sidebar');
    const backToLobbyBtn = document.getElementById('back-to-lobby-btn');
    const coordsDisplay = document.getElementById('coords-display');

    // --- FUNÇÕES DE UTILIDADE ---
    function scaleGame() {
        setTimeout(() => {
            const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
            gameWrapper.style.transform = `scale(${scale})`;
            gameWrapper.style.left = `${(window.innerWidth - (1280 * scale)) / 2}px`;
            gameWrapper.style.top = `${(window.innerHeight - (720 * scale)) / 2}px`;
        }, 10);
    }
    function showScreen(screenToShow) {
        allScreens.forEach(screen => screen.classList.toggle('active', screen === screenToShow));
    }
    function showInfoModal(title, text, showButton = true) {
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-text').innerHTML = text;
        const oldButtons = document.getElementById('modal-content').querySelector('.modal-button-container');
        if (oldButtons) oldButtons.remove();

        const modalButton = document.getElementById('modal-button');
        modalButton.classList.toggle('hidden', !showButton);
        modal.classList.remove('hidden');
        modalButton.onclick = () => modal.classList.add('hidden');
    }
    function showCustomModal(title, contentHtml, buttons) {
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-text').innerHTML = contentHtml;
        document.getElementById('modal-button').classList.add('hidden');
        
        const oldButtons = document.getElementById('modal-content').querySelector('.modal-button-container');
        if (oldButtons) oldButtons.remove();

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'modal-button-container';

        buttons.forEach(btnInfo => {
            const button = document.createElement('button');
            button.textContent = btnInfo.text;
            button.className = btnInfo.className || '';
            button.onclick = () => {
                if (btnInfo.onClick) btnInfo.onClick();
                if (btnInfo.closes) modal.classList.add('hidden');
            };
            buttonContainer.appendChild(button);
        });
        
        document.getElementById('modal-content').appendChild(buttonContainer);
        modal.classList.remove('hidden');
    }
    function getGameScale() { return (window.getComputedStyle(gameWrapper).transform === 'none') ? 1 : new DOMMatrix(window.getComputedStyle(gameWrapper).transform).a; }
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
        targetingAction = null;
        document.getElementById('targeting-indicator').classList.add('hidden');
    }
    function getFighter(state, key) {
        if (!state || !state.fighters || !key) return null;
        return state.fighters.players[key] || state.fighters.npcs[key];
    }

    // =================================================================
    // ================= FUNÇÃO PRINCIPAL DE RENDERIZAÇÃO ==============
    // =================================================================
    function renderGame(gameState) {
        oldGameState = currentGameState;
        currentGameState = gameState;

        if (!gameState || !gameState.mode || !gameState.connectedPlayers) {
            showScreen(document.getElementById('loading-screen'));
            return;
        }

        scaleGame(); 

        if (gameState.mode === 'adventure' && gameState.customPositions) customFighterPositions = gameState.customPositions;
        
        const myPlayerData = gameState.connectedPlayers?.[socket.id];
        if (myRole === 'player' && myPlayerData && !myPlayerData.characterFinalized) {
             const currentScreen = document.querySelector('.screen.active');
             if (currentScreen.id !== 'character-sheet-screen' && currentScreen.id !== 'player-initial-choice-screen' && currentScreen.id !== 'selection-screen') {
                 showScreen(document.getElementById('player-waiting-screen'));
             }
             return;
        }
        
        if (gameState.mode === 'adventure' && gameState.scenario) gameWrapper.style.backgroundImage = `url('images/${gameState.scenario}')`;
        else if (gameState.mode === 'lobby') gameWrapper.style.backgroundImage = `url('images/mapas/cenarios externos/externo (1).png')`;
        else gameWrapper.style.backgroundImage = 'none';

        document.getElementById('turn-order-sidebar').classList.add('hidden');
        floatingButtonsContainer.classList.add('hidden');
        document.getElementById('waiting-players-sidebar').classList.add('hidden');
        document.getElementById('back-to-lobby-btn').classList.add('hidden');

        if (isGm && (gameState.mode === 'adventure' || gameState.mode === 'theater')) {
            floatingButtonsContainer.classList.remove('hidden');
            document.getElementById('back-to-lobby-btn').classList.remove('hidden');
            const switchBtn = document.getElementById('floating-switch-mode-btn');
            if (gameState.mode === 'adventure') {
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
                stagedNpcSlots.fill(null);
                selectedSlotIndex = null;
                if (isGm) {
                    showScreen(document.getElementById('gm-initial-lobby'));
                    updateGmLobbyUI(gameState);
                } else {
                    const myPlayer = gameState.connectedPlayers[socket.id];
                    if (myPlayer && myPlayer.characterFinalized) {
                        showScreen(document.getElementById('player-waiting-screen'));
                        document.getElementById('player-waiting-message').innerText = "Aguardando o Mestre iniciar o jogo...";
                    }
                }
                break;
            case 'adventure':
                handleAdventureMode(gameState);
                break;
            case 'theater':
                if (!oldGameState || oldGameState.mode !== 'theater') initializeTheaterMode();
                showScreen(document.getElementById('theater-screen'));
                renderTheaterMode(gameState);
                break;
            default:
                showScreen(document.getElementById('loading-screen'));
        }
    }
    
    // --- LÓGICA DO MODO AVENTURA ---
    function handleAdventureMode(gameState) {
        const fightScreen = document.getElementById('fight-screen');
        if (isGm) {
            switch (gameState.phase) {
                case 'npc_setup': 
                    showScreen(document.getElementById('gm-npc-setup-screen')); 
                    if (!oldGameState || oldGameState.phase !== 'npc_setup') {
                        stagedNpcSlots.fill(null);
                        selectedSlotIndex = null;
                        customFighterPositions = {};
                        renderNpcSelectionForGm(); 
                    } 
                    renderNpcStagingArea();
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
            const amIInTheFight = !!getFighter(gameState, myPlayerKey);
            if (myRole === 'player' && !amIInTheFight) {
                showScreen(document.getElementById('player-waiting-screen'));
                document.getElementById('player-waiting-message').innerText = "Aguardando o Mestre...";
            }
            else if (['npc_setup'].includes(gameState.phase)) {
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
                const charName = p.characterName || '<i>Criando ficha...</i>';
                playerListEl.innerHTML += `<li>${p.role === 'player' ? 'Jogador' : 'Espectador'} - Personagem: ${charName}</li>`;
            });
        }
    }

    function renderPlayerTokenSelection() {
        const charListContainer = document.getElementById('character-list-container');
        const confirmBtn = document.getElementById('confirm-selection-btn');
        charListContainer.innerHTML = '';
        confirmBtn.disabled = true;
        let myCurrentSelection = tempCharacterSheet.tokenImg;

        (ALL_CHARACTERS.players || []).forEach(data => {
            const card = document.createElement('div');
            card.className = 'char-card';
            card.dataset.name = data.name;
            card.dataset.img = data.img;
            card.innerHTML = `<img src="${data.img}" alt="${data.name}"><div class="char-name">${data.name}</div>`;
            if (myCurrentSelection === data.img) {
                card.classList.add('selected');
                confirmBtn.disabled = false;
            }
            card.addEventListener('click', () => {
                document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                confirmBtn.disabled = false;
            });
            charListContainer.appendChild(card);
        });
        confirmBtn.onclick = () => {
            const selectedCard = document.querySelector('.char-card.selected');
            if (selectedCard) {
                tempCharacterSheet.tokenName = selectedCard.dataset.name;
                tempCharacterSheet.tokenImg = selectedCard.dataset.img;
                initializeCharacterSheet();
                showScreen(document.getElementById('character-sheet-screen'));
            }
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
                let targetSlot = selectedSlotIndex;
                if (targetSlot === null) {
                    targetSlot = stagedNpcSlots.findIndex(slot => slot === null);
                }

                if (targetSlot !== -1 && targetSlot !== null) {
                    stagedNpcSlots[targetSlot] = { 
                        ...npcData, 
                        id: `npc-staged-${Date.now()}-${targetSlot}`,
                        customStats: { hp: 10, mahou: 10, forca: 1, agilidade: 1, protecao: 1, constituicao: 1, inteligencia: 1, mente: 1 },
                        equipment: { weapon1: {type: 'Desarmado'}, weapon2: {type: 'Desarmado'}, armor: 'Nenhuma', shield: 'Nenhum' },
                        elements: { fogo: 0, agua: 0, terra: 0, vento: 0, luz: 0, escuridao: 0 },
                        spells: []
                    };
                    selectedSlotIndex = null;
                    renderNpcStagingArea();
                } else if (stagedNpcSlots.every(slot => slot !== null)) {
                     showInfoModal("Aviso", "Todos os slots estão cheios. Remova um inimigo para adicionar outro.");
                } else {
                     showInfoModal("Aviso", "Primeiro, clique em um slot vago abaixo para posicionar o inimigo.");
                }
            });
            npcArea.appendChild(card);
        });

        renderNpcStagingArea();

        document.getElementById('gm-start-battle-btn').onclick = () => {
            const finalNpcs = stagedNpcSlots.filter(npc => npc !== null);

            if (finalNpcs.length === 0) {
                showInfoModal("Aviso", "Adicione pelo menos um inimigo para a batalha.");
                return;
            }
            socket.emit('playerAction', { type: 'gmStartBattle', npcs: finalNpcs });
        };
    }

    function renderNpcStagingArea() {
        const stagingArea = document.getElementById('npc-staging-area');
        stagingArea.innerHTML = '';
        for (let i = 0; i < MAX_NPCS; i++) {
            const slot = document.createElement('div');
            slot.className = 'npc-slot';
            const npc = stagedNpcSlots[i];

            if (npc) {
                slot.innerHTML = `<img src="${npc.img}" alt="${npc.name}"><button class="remove-staged-npc" data-index="${i}">X</button>`;
                slot.title = `Clique para configurar ${npc.name}`;
                slot.addEventListener('click', () => showNpcConfigModal(i));
                
                slot.querySelector('.remove-staged-npc').addEventListener('click', (e) => {
                    e.stopPropagation();
                    stagedNpcSlots[i] = null;
                    if (selectedSlotIndex === i) selectedSlotIndex = null;
                    renderNpcStagingArea();
                });
            } else {
                slot.classList.add('empty-slot');
                slot.innerHTML = `<span>Slot ${i + 1}</span>`;
                slot.dataset.index = i;
                slot.title = 'Clique para selecionar este slot';
                slot.addEventListener('click', (e) => {
                    const index = parseInt(e.currentTarget.dataset.index, 10);
                    selectedSlotIndex = (selectedSlotIndex === index) ? null : index;
                    renderNpcStagingArea();
                });
            }

            if (selectedSlotIndex === i) {
                slot.classList.add('selected-slot');
            }
            stagingArea.appendChild(slot);
        }
    }

    function showNpcConfigModal(slotIndex) {
        const npcData = stagedNpcSlots[slotIndex];
        if (!npcData) return;

        const weaponOptions = Object.keys(GAME_RULES.weapons).map(w => `<option value="${w}">${w}</option>`).join('');
        const armorOptions = Object.keys(GAME_RULES.armors).map(a => `<option value="${a}">${a}</option>`).join('');
        const shieldOptions = Object.keys(GAME_RULES.shields).map(s => `<option value="${s}">${s}</option>`).join('');
        const allSpells = [...(ALL_SPELLS.grade1 || []), ...(ALL_SPELLS.grade2 || []), ...(ALL_SPELLS.grade3 || [])];

        const current = {
            stats: npcData.customStats || { hp: 10, mahou: 10, forca: 1, agilidade: 1, protecao: 1, constituicao: 1, inteligencia: 1, mente: 1 },
            equip: npcData.equipment || { weapon1: { type: 'Desarmado' }, weapon2: { type: 'Desarmado' }, armor: 'Nenhuma', shield: 'Nenhum' },
            elements: npcData.elements || { fogo: 0, agua: 0, terra: 0, vento: 0, luz: 0, escuridao: 0 },
            spells: npcData.spells || []
        };
        
        let content = `<div class="npc-config-container">
            <div class="npc-config-col">
                <h4>Atributos Principais</h4>
                <div class="npc-config-grid">
                    <label>HP:</label><input type="number" id="npc-cfg-hp" value="${current.stats.hp}">
                    <label>Mahou:</label><input type="number" id="npc-cfg-mahou" value="${current.stats.mahou}">
                    <label>Força:</label><input type="number" id="npc-cfg-forca" value="${current.stats.forca}">
                    <label>Agilidade:</label><input type="number" id="npc-cfg-agilidade" value="${current.stats.agilidade}">
                    <label>Proteção:</label><input type="number" id="npc-cfg-protecao" value="${current.stats.protecao}">
                    <label>Constituição:</label><input type="number" id="npc-cfg-constituicao" value="${current.stats.constituicao}">
                    <label>Inteligência:</label><input type="number" id="npc-cfg-inteligencia" value="${current.stats.inteligencia}">
                    <label>Mente:</label><input type="number" id="npc-cfg-mente" value="${current.stats.mente}">
                </div>
                <h4>Elementos</h4>
                 <div class="npc-config-grid elements">
                    <label>Fogo:</label><input type="number" id="npc-cfg-fogo" value="${current.elements.fogo}">
                    <label>Água:</label><input type="number" id="npc-cfg-agua" value="${current.elements.agua}">
                    <label>Terra:</label><input type="number" id="npc-cfg-terra" value="${current.elements.terra}">
                    <label>Vento:</label><input type="number" id="npc-cfg-vento" value="${current.elements.vento}">
                    <label>Luz:</label><input type="number" id="npc-cfg-luz" value="${current.elements.luz}">
                    <label>Escuridão:</label><input type="number" id="npc-cfg-escuridao" value="${current.elements.escuridao}">
                </div>
            </div>
            <div class="npc-config-col">
                <h4>Equipamentos</h4>
                <div class="npc-config-equip">
                    <label>Arma 1:</label><select id="npc-cfg-weapon1">${weaponOptions}</select>
                    <label>Arma 2:</label><select id="npc-cfg-weapon2">${weaponOptions}</select>
                    <label>Armadura:</label><select id="npc-cfg-armor">${armorOptions}</select>
                    <label>Escudo:</label><select id="npc-cfg-shield">${shieldOptions}</select>
                </div>
                <h4>Magias</h4>
                <div class="npc-config-spells">
                    ${allSpells.map(spell => `
                        <div class="spell-checkbox">
                           <input type="checkbox" id="npc-spell-${spell.name.replace(/\s+/g, '-')}" value="${spell.name}" ${current.spells.includes(spell.name) ? 'checked' : ''}>
                           <label for="npc-spell-${spell.name.replace(/\s+/g, '-')}">${spell.name}</label>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>`;
        
        showCustomModal(`Configurar ${npcData.name}`, content, [
            { text: 'Confirmar', closes: true, onClick: () => {
                stagedNpcSlots[slotIndex].customStats = {
                    hp: parseInt(document.getElementById('npc-cfg-hp').value, 10),
                    mahou: parseInt(document.getElementById('npc-cfg-mahou').value, 10),
                    forca: parseInt(document.getElementById('npc-cfg-forca').value, 10),
                    agilidade: parseInt(document.getElementById('npc-cfg-agilidade').value, 10),
                    protecao: parseInt(document.getElementById('npc-cfg-protecao').value, 10),
                    constituicao: parseInt(document.getElementById('npc-cfg-constituicao').value, 10),
                    inteligencia: parseInt(document.getElementById('npc-cfg-inteligencia').value, 10),
                    mente: parseInt(document.getElementById('npc-cfg-mente').value, 10),
                };
                 stagedNpcSlots[slotIndex].equipment = {
                    weapon1: { type: document.getElementById('npc-cfg-weapon1').value },
                    weapon2: { type: document.getElementById('npc-cfg-weapon2').value },
                    armor: document.getElementById('npc-cfg-armor').value,
                    shield: document.getElementById('npc-cfg-shield').value,
                };
                stagedNpcSlots[slotIndex].elements = {
                    fogo: parseInt(document.getElementById('npc-cfg-fogo').value, 10),
                    agua: parseInt(document.getElementById('npc-cfg-agua').value, 10),
                    terra: parseInt(document.getElementById('npc-cfg-terra').value, 10),
                    vento: parseInt(document.getElementById('npc-cfg-vento').value, 10),
                    luz: parseInt(document.getElementById('npc-cfg-luz').value, 10),
                    escuridao: parseInt(document.getElementById('npc-cfg-escuridao').value, 10),
                };
                const selectedSpells = [];
                document.querySelectorAll('.npc-config-spells input[type="checkbox"]:checked').forEach(cb => {
                    selectedSpells.push(cb.value);
                });
                stagedNpcSlots[slotIndex].spells = selectedSpells;
            }},
            { text: 'Cancelar', closes: true, className: 'btn-danger' }
        ]);

        // Set current equipment values
        document.getElementById('npc-cfg-weapon1').value = current.equip.weapon1.type;
        document.getElementById('npc-cfg-weapon2').value = current.equip.weapon2.type;
        document.getElementById('npc-cfg-armor').value = current.equip.armor;
        document.getElementById('npc-cfg-shield').value = current.equip.shield;
    }

    function updateAdventureUI(state) {
        if (!state || !state.fighters) return;
        
        fightSceneCharacters.innerHTML = '';
        document.getElementById('round-info').textContent = `ROUND ${state.currentRound}`;
        document.getElementById('fight-log').innerHTML = (state.log || []).map(entry => `<p class="log-${entry.type || 'info'}">${entry.text}</p>`).join('');
        
        const PLAYER_POSITIONS = [ { left: '150px', top: '500px' }, { left: '250px', top: '400px' }, { left: '350px', top: '300px' }, { left: '450px', top: '200px' } ];
        const NPC_POSITIONS = [ { left: '1000px', top: '500px' }, { left: '900px',  top: '400px' }, { left: '800px',  top: '300px' }, { left: '700px',  top: '200px' }, { left: '950px', top: '350px' } ];
        
        Object.keys(state.fighters.players).forEach((key, index) => {
            const player = state.fighters.players[key];
             if (player.status === 'fled') return;
             const position = state.customPositions[player.id] || PLAYER_POSITIONS[index];
             const el = createFighterElement(player, 'player', state, position);
             if (el) fightSceneCharacters.appendChild(el);
        });

        (state.npcSlots || []).forEach((npcId, index) => {
            const npc = getFighter(state, npcId);
            if (npc && npc.status !== 'fled') {
                const position = state.customPositions[npc.id] || NPC_POSITIONS[index];
                const el = createFighterElement(npc, 'npc', state, position);
                if (el) fightSceneCharacters.appendChild(el);
            }
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
        
        if (position) {
            Object.assign(container.style, position);
            container.style.zIndex = parseInt(position.top, 10);
        }
        container.style.setProperty('--character-scale', characterScale);
        
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
    
        let paHtml = '<div class="pa-dots-container">';
        for (let i = 0; i < (fighter.pa || 0); i++) {
            paHtml += '<div class="pa-dot"></div>';
        }
        paHtml += '</div>';

        let healthBarHtml = '';
        if (fighter.isMultiPart && fighter.parts) {
            healthBarHtml = '<div class="multi-health-bar-container">';
            fighter.parts.forEach(part => {
                const partHealthPercentage = (part.hp / part.hpMax) * 100;
                const isDefeated = part.status === 'down' ? 'defeated' : '';
                healthBarHtml += `
                    <div class="health-bar-ingame-part ${isDefeated}" title="${part.name}: ${part.hp}/${part.hpMax}">
                        <div class="health-bar-ingame-part-fill" style="width: ${partHealthPercentage}%"></div>
                    </div>
                `;
            });
            healthBarHtml += '</div>';
        } else {
            const healthPercentage = fighter.hpMax > 0 ? (fighter.hp / fighter.hpMax) * 100 : 0;
            const mahouPercentage = fighter.mahouMax > 0 ? (fighter.mahou / fighter.mahouMax) * 100 : 0;
            healthBarHtml = `
                <div class="health-bar-ingame" title="HP: ${fighter.hp}/${fighter.hpMax}">
                    <div class="health-bar-ingame-fill" style="width: ${healthPercentage}%"></div>
                    <span class="health-bar-ingame-text">${fighter.hp}/${fighter.hpMax}</span>
                </div>
                <div class="mahou-bar-ingame" title="Mahou: ${fighter.mahou}/${fighter.mahouMax}">
                    <div class="mahou-bar-ingame-fill" style="width: ${mahouPercentage}%"></div>
                    <span class="mahou-bar-ingame-text">${fighter.mahou}/${fighter.mahouMax}</span>
                </div>
            `;
        }
    
        container.innerHTML = `${paHtml}${healthBarHtml}<img src="${fighter.img}" class="fighter-img-ingame"><div class="fighter-name-ingame">${fighter.nome}</div>`;
        return container;
    }
    
    function renderActionButtons(state) {
        actionButtonsWrapper.innerHTML = '';
        if(state.phase !== 'battle' || !!state.winner) return;
        const activeFighter = getFighter(state, state.activeCharacterKey);
        if (!activeFighter) return;

        const isNpcTurn = !!state.fighters.npcs[activeFighter.id];
        const canControl = (myRole === 'player' && state.activeCharacterKey === myPlayerKey) || (isGm && isNpcTurn);
        
        const createButton = (text, onClick, disabled = false, className = 'action-btn') => {
            const btn = document.createElement('button');
            btn.className = className;
            btn.textContent = text;
            btn.disabled = disabled;
            btn.onclick = onClick;
            return btn;
        };
        
        actionButtonsWrapper.appendChild(createButton('Atacar', startAttackSequence, !canControl));

        const fighterSpells = activeFighter.sheet?.spells || [];
        if (fighterSpells.length > 0) {
            fighterSpells.forEach(spellName => {
                const allSpells = [...(ALL_SPELLS.grade1 || []), ...(ALL_SPELLS.grade2 || []), ...(ALL_SPELLS.grade3 || [])];
                const spell = allSpells.find(s => s.name === spellName);
                if (spell && spell.inCombat) {
                    const spellBtn = createButton(spell.name, () => startSpellSequence(spell), !canControl, 'action-btn spell-btn');
                    spellBtn.title = `${spell.description} (Custo: ${spell.costMahou} Mahou)`;
                    actionButtonsWrapper.appendChild(spellBtn);
                }
            });
        }
        
        actionButtonsWrapper.appendChild(createButton('Fugir', () => socket.emit('playerAction', { type: 'flee', actorKey: state.activeCharacterKey }), !canControl, 'action-btn flee-btn'));
        actionButtonsWrapper.appendChild(createButton('Encerrar Turno', () => socket.emit('playerAction', { type: 'end_turn', actorKey: state.activeCharacterKey }), !canControl, 'end-turn-btn'));
    }

    function startAttackSequence() {
        const attacker = getFighter(currentGameState, currentGameState.activeCharacterKey);
        if (!attacker) return;

        if (!attacker.isPlayer) { // Logic for NPCs
             targetingAction = { type: 'attack', attackerKey: attacker.id, weaponChoice: 'weapon1' };
             isTargeting = true;
             document.getElementById('targeting-indicator').classList.remove('hidden');
             return;
        }

        const weapon1 = attacker.sheet.equipment.weapon1.type;
        const weapon2 = attacker.sheet.equipment.weapon2.type;
        const isDualWielding = weapon1 !== 'Desarmado' && weapon2 !== 'Desarmado';
        
        if (isDualWielding) {
            showCustomModal('Escolha seu Ataque', 'Você está empunhando duas armas.', [
                { text: `Atacar com ${weapon1}`, closes: true, onClick: () => {
                    targetingAction = { type: 'attack', attackerKey: attacker.id, weaponChoice: 'weapon1' };
                    isTargeting = true;
                    document.getElementById('targeting-indicator').classList.remove('hidden');
                }},
                { text: `Atacar com ${weapon2}`, closes: true, onClick: () => {
                    targetingAction = { type: 'attack', attackerKey: attacker.id, weaponChoice: 'weapon2' };
                    isTargeting = true;
                    document.getElementById('targeting-indicator').classList.remove('hidden');
                }},
                { text: 'Ataque Duplo', closes: true, onClick: () => {
                    targetingAction = { type: 'attack', attackerKey: attacker.id, weaponChoice: 'dual' };
                    isTargeting = true;
                    document.getElementById('targeting-indicator').classList.remove('hidden');
                }}
            ]);
        } else {
             targetingAction = { type: 'attack', attackerKey: attacker.id, weaponChoice: 'weapon1' };
             isTargeting = true;
             document.getElementById('targeting-indicator').classList.remove('hidden');
        }
    }
    
    function startSpellSequence(spell) {
        targetingAction = { type: 'use_spell', attackerKey: currentGameState.activeCharacterKey, spellName: spell.name };
        isTargeting = true;
        document.getElementById('targeting-indicator').classList.remove('hidden');
    }

    function renderInitiativeUI(state) {
        initiativeUI.classList.remove('hidden');
        const playerRollBtn = document.getElementById('player-roll-initiative-btn');
        const gmRollBtn = document.getElementById('gm-roll-initiative-btn');
        playerRollBtn.classList.add('hidden');
        gmRollBtn.classList.add('hidden');
        const myFighter = getFighter(state, myPlayerKey);
        if (myRole === 'player' && myFighter && myFighter.status === 'active' && !state.initiativeRolls[myPlayerKey]) {
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
        
        const activeIndex = orderedFighters.findIndex(f => f.id === state.activeCharacterKey);
        const sortedVisibleFighters = activeIndex === -1 ? orderedFighters : orderedFighters.slice(activeIndex).concat(orderedFighters.slice(0, activeIndex));

        sortedVisibleFighters.forEach((fighter, index) => {
            const card = document.createElement('div');
            card.className = 'turn-order-card';
            if (index === 0) card.classList.add('active-turn-indicator');
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

    function showPartSelectionModal(targetFighter) {
        let modalContentHtml = '<div class="target-part-selection">';
        targetFighter.parts.forEach(part => {
            const isDisabled = part.status === 'down';
            modalContentHtml += `<button class="target-part-btn" data-part-key="${part.key}" ${isDisabled ? 'disabled' : ''}>${part.name} (${part.hp}/${part.hpMax})</button>`;
        });
        modalContentHtml += '</div>';
        showInfoModal(`Selecione qual parte de ${targetFighter.nome} atacar:`, modalContentHtml, false);
        document.querySelectorAll('.target-part-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const partKey = e.currentTarget.dataset.partKey;
                actionButtonsWrapper.querySelectorAll('button').forEach(b => b.disabled = true);
                socket.emit('playerAction', { 
                    ...targetingAction,
                    targetKey: targetFighter.id,
                    targetPartKey: partKey
                });
                cancelTargeting();
                modal.classList.add('hidden');
            });
        });
    }

    function handleTargetClick(event) {
        if (isFreeMoveModeActive || !isTargeting || !targetingAction) return;
        const targetContainer = event.target.closest('.char-container.targetable');
        if (!targetContainer) return;
        const targetKey = targetContainer.dataset.key;
        const targetFighter = getFighter(currentGameState, targetKey);
        
        if (targetFighter && targetFighter.isMultiPart) {
            showPartSelectionModal(targetFighter);
        } else {
            actionButtonsWrapper.querySelectorAll('button').forEach(b => b.disabled = true);
            socket.emit('playerAction', { ...targetingAction, targetKey: targetKey });
            cancelTargeting();
        }
    }
    
    function showCheatModal() {
        let content = `<div class="cheat-menu"><button id="cheat-add-npc-btn" class="mode-btn">Adicionar Inimigo em Slot</button></div>`;
        showInfoModal('Cheats', content, false);
        document.getElementById('cheat-add-npc-btn').addEventListener('click', handleCheatAddNpc);
    }
    
    function handleCheatAddNpc() {
        if (!currentGameState || !currentGameState.npcSlots) return;
        const { npcSlots } = currentGameState;
        let content = `<p>Selecione o slot para adicionar/substituir:</p><div class="npc-selection-container">`;
        let hasAvailableSlots = false;
        for (let i = 0; i < MAX_NPCS; i++) {
            const npcId = npcSlots[i];
            const npc = getFighter(currentGameState, npcId);
            if (!npc || npc.status === 'down' || npc.status === 'fled') {
                hasAvailableSlots = true;
                content += `<div class="npc-card cheat-npc-slot" data-slot-index="${i}">${npc ? `<img src="${npc.img}" style="filter: grayscale(100%);">` : ''}<div class="char-name">${npc ? `${npc.nome} (Vago)` : `Slot Vazio ${i + 1}`}</div></div>`;
            } else {
                 content += `<div class="npc-card disabled"><img src="${npc.img}"><div class="char-name">${npc.nome} (Ocupado)</div></div>`;
            }
        }
        content += `</div>`;
        if (!hasAvailableSlots) {
             showInfoModal('Erro', 'Todos os slots de inimigos estão ocupados por combatentes ativos.');
             return;
        }
        showInfoModal('Selecionar Slot', content, false);
        document.querySelectorAll('.cheat-npc-slot').forEach(card => {
            card.addEventListener('click', (e) => {
                const slotIndex = e.currentTarget.dataset.slotIndex;
                if (slotIndex !== undefined) selectNpcForSlot(slotIndex);
            });
        });
    }

    function selectNpcForSlot(slotIndex) {
        let content = `<p>Selecione o novo inimigo para o Slot ${parseInt(slotIndex, 10) + 1}:</p><div class="npc-selection-container" style="max-height: 300px;">`;
        (ALL_CHARACTERS.npcs || []).forEach(npcData => {
            content += `<div class="npc-card cheat-npc-card" data-name="${npcData.name}" data-img="${npcData.img}" data-scale="${npcData.scale || 1.0}"><img src="${npcData.img}" alt="${npcData.name}"><div class="char-name">${npcData.name}</div></div>`;
        });
        content += `</div>`;
        showInfoModal('Selecionar Novo Inimigo', content, false);
        document.querySelectorAll('.cheat-npc-card').forEach(card => {
            card.addEventListener('click', () => {
                const newNpcData = { name: card.dataset.name, img: card.dataset.img, scale: parseFloat(card.dataset.scale) };
                socket.emit('playerAction', { type: 'gmSetsNpcInSlot', slotIndex, npcData: newNpcData });
                modal.classList.add('hidden');
            });
        });
    }

    function makeFightersDraggable(isDraggable) {
        document.querySelectorAll('#fight-screen .char-container').forEach(fighter => {
            if (isDraggable) fighter.addEventListener('mousedown', onFighterMouseDown);
            else fighter.removeEventListener('mousedown', onFighterMouseDown);
        });
        document.body.classList.toggle('is-draggable', isDraggable);
    }
    function onFighterMouseDown(e) {
        if (!isFreeMoveModeActive || e.button !== 0) return;
        draggedFighter.element = e.currentTarget;
        const rect = draggedFighter.element.getBoundingClientRect(), gameScale = getGameScale();
        draggedFighter.offsetX = (e.clientX - rect.left) / gameScale;
        draggedFighter.offsetY = (e.clientY - rect.top) / gameScale;
        window.addEventListener('mousemove', onFighterMouseMove);
        window.addEventListener('mouseup', onFighterMouseUp);
    }
    function onFighterMouseMove(e) {
        if (!draggedFighter.element) return;
        e.preventDefault();
        const gameWrapperRect = gameWrapper.getBoundingClientRect(), gameScale = getGameScale();
        const x = (e.clientX - gameWrapperRect.left) / gameScale - draggedFighter.offsetX;
        const y = (e.clientY - gameWrapperRect.top) / gameScale - draggedFighter.offsetY;
        draggedFighter.element.style.left = `${x}px`;
        draggedFighter.element.style.top = `${y}px`;
    }
    function onFighterMouseUp() {
        if (draggedFighter.element) {
            socket.emit('playerAction', { type: 'gmMovesFighter', fighterId: draggedFighter.element.id, position: { left: draggedFighter.element.style.left, top: draggedFighter.element.style.top } });
        }
        draggedFighter.element = null;
        window.removeEventListener('mousemove', onFighterMouseMove);
        window.removeEventListener('mouseup', onFighterMouseUp);
    }
    function showHelpModal() {
        const content = `<div style="text-align: left; font-size: 1.2em; line-height: 1.8;"><p><b>C:</b> Abrir menu de Cheats (GM).</p><p><b>M:</b> Ativar/Desativar modo de depuração de combate (GM).</p><p><b>T:</b> Mostrar/Ocultar coordenadas do mouse.</p><p><b>J:</b> Ativar/Desativar modo de arrastar personagens (GM).</p></div>`;
        showInfoModal("Atalhos do Teclado", content);
    }
    
    // --- LÓGICA DO MODO CENÁRIO (RESTAURADA À VERSÃO ORIGINAL) ---
    function initializeTheaterMode() {
        localWorldScale = 1.0;
        theaterWorldContainer.style.transform = "scale(1)";
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
                if (isGm) e.dataTransfer.setData('application/json', JSON.stringify({ charName: data.name, img: data.img }));
            });
            theaterCharList.appendChild(mini);
        };
        [...(ALL_CHARACTERS.players || []), ...(ALL_CHARACTERS.npcs || []), ...(ALL_CHARACTERS.dynamic || [])].forEach(createMini);
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
        const viewport = theaterBackgroundViewport;
        viewport.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            dragStartPos = { x: e.clientX, y: e.clientY };
            if (isGm) {
                const tokenElement = e.target.closest('.theater-token');
                if (isGroupSelectMode && !tokenElement) {
                    isSelectingBox = true;
                    selectionBoxStartPos = { x: e.clientX, y: e.clientY };
                    const gameScale = getGameScale(), viewportRect = viewport.getBoundingClientRect();
                    const startX = (e.clientX - viewportRect.left) / gameScale, startY = (e.clientY - viewportRect.top) / gameScale;
                    Object.assign(selectionBox.style, { left: `${startX}px`, top: `${startY}px`, width: '0px', height: '0px' });
                    selectionBox.classList.remove('hidden');
                    return;
                }
                if (tokenElement) {
                    isDragging = true;
                    if (!e.ctrlKey && !selectedTokens.has(tokenElement.id)) selectedTokens.clear();
                    if (e.ctrlKey) {
                        selectedTokens.has(tokenElement.id) ? selectedTokens.delete(tokenElement.id) : selectedTokens.add(tokenElement.id);
                    } else {
                        selectedTokens.add(tokenElement.id);
                    }
                    dragOffsets.clear();
                    selectedTokens.forEach(id => {
                        const tokenData = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[id];
                        if (tokenData) dragOffsets.set(id, { startX: tokenData.x, startY: tokenData.y });
                    });
                    renderTheaterMode(currentGameState);
                } else if (!isGroupSelectMode) {
                    if (selectedTokens.size > 0) selectedTokens.clear();
                    renderTheaterMode(currentGameState);
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
                const gameScale = getGameScale(), viewportRect = viewport.getBoundingClientRect();
                const currentX = (e.clientX - viewportRect.left) / gameScale, currentY = (e.clientY - viewportRect.top) / gameScale;
                const startX = (selectionBoxStartPos.x - viewportRect.left) / gameScale, startY = (selectionBoxStartPos.y - viewportRect.top) / gameScale;
                Object.assign(selectionBox.style, { left: `${Math.min(currentX, startX)}px`, top: `${Math.min(currentY, startY)}px`, width: `${Math.abs(currentX - startX)}px`, height: `${Math.abs(currentY - startY)}px` });
            } else if (isPanning) {
                e.preventDefault();
                viewport.scrollLeft -= e.movementX;
                viewport.scrollTop -= e.movementY;
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
                    if (initialPos) socket.emit('playerAction', { type: 'updateToken', token: { id, x: initialPos.startX + deltaX, y: initialPos.startY + deltaY } });
                });
            } else if (isGm && isSelectingBox) {
                const boxRect = selectionBox.getBoundingClientRect();
                isSelectingBox = false;
                selectionBox.classList.add('hidden');
                if (!e.ctrlKey) selectedTokens.clear();
                document.querySelectorAll('.theater-token').forEach(token => {
                    const tokenRect = token.getBoundingClientRect();
                    if (boxRect.left < tokenRect.right && boxRect.right > tokenRect.left && boxRect.top < tokenRect.bottom && boxRect.bottom > tokenRect.top) {
                        e.ctrlKey && selectedTokens.has(token.id) ? selectedTokens.delete(token.id) : selectedTokens.add(token.id);
                    }
                });
                renderTheaterMode(currentGameState);
            }
            isPanning = false;
        });
        viewport.addEventListener('drop', (e) => {
            e.preventDefault(); 
            if (!isGm) return;
            try {
                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                const tokenWidth = 200, gameScale = getGameScale(), viewportRect = viewport.getBoundingClientRect();
                const finalX = ((e.clientX - viewportRect.left) / gameScale + viewport.scrollLeft) / localWorldScale - (tokenWidth / 2);
                const finalY = ((e.clientY - viewportRect.top) / gameScale + viewport.scrollTop) / localWorldScale - (tokenWidth / 2);
                socket.emit('playerAction', { type: 'updateToken', token: { id: `token-${Date.now()}`, charName: data.charName, img: data.img, x: finalX, y: finalY, scale: 1.0, isFlipped: false }});
            } catch (error) { console.error("Drop error:", error); }
        });
        viewport.addEventListener('dragover', (e) => e.preventDefault());
        viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (isGm && hoveredTokenId && selectedTokens.has(hoveredTokenId)) {
                const tokenData = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[hoveredTokenId];
                if (tokenData) {
                    const newScale = (tokenData.scale || 1.0) + (e.deltaY > 0 ? -0.1 : 0.1);
                    selectedTokens.forEach(id => socket.emit('playerAction', { type: 'updateToken', token: { id, scale: Math.max(0.1, newScale) }}));
                }
            } else {
                const zoomIntensity = 0.05, scrollDirection = e.deltaY < 0 ? 1 : -1;
                const newScale = Math.max(0.2, Math.min(localWorldScale + (zoomIntensity * scrollDirection), 5));
                const rect = viewport.getBoundingClientRect();
                const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
                const worldX = (mouseX + viewport.scrollLeft) / localWorldScale, worldY = (mouseY + viewport.scrollTop) / localWorldScale;
                localWorldScale = newScale;
                theaterWorldContainer.style.transform = `scale(${localWorldScale})`;
                viewport.scrollLeft = worldX * localWorldScale - mouseX;
                viewport.scrollTop = worldY * localWorldScale - mouseY;
            }
        }, { passive: false });
        
        theaterGlobalScale.addEventListener('input', (e) => {
             if (isGm) socket.emit('playerAction', {type: 'updateGlobalScale', scale: parseFloat(e.target.value)});
        });
    }
    
    function initializeGlobalKeyListeners() {
        window.addEventListener('keydown', (e) => {
            if (!currentGameState) return;
            if (currentGameState.mode === 'adventure' && isTargeting && e.key === 'Escape') {
                cancelTargeting();
                return;
            }

            const focusedEl = document.activeElement;
            if (focusedEl.tagName === 'INPUT' || focusedEl.tagName === 'TEXTAREA') {
                return;
            }
            
            if (e.key.toLowerCase() === 'c' && isGm && currentGameState.mode === 'adventure') {
                e.preventDefault();
                showCheatModal();
            }

            if (e.key.toLowerCase() === 'm' && isGm) {
                e.preventDefault();
                isGmDebugModeActive = !isGmDebugModeActive;
                showInfoModal("Modo Depuração", `Modo de depuração de combate ${isGmDebugModeActive ? 'ATIVADO' : 'DESATIVADO'}.`);
            }

            if (e.key.toLowerCase() === 't') {
                e.preventDefault();
                coordsModeActive = !coordsModeActive;
                coordsDisplay.classList.toggle('hidden', !coordsModeActive);
            }
            
            if (isGm && currentGameState.mode === 'adventure' && e.key.toLowerCase() === 'j') {
                e.preventDefault();
                isFreeMoveModeActive = !isFreeMoveModeActive;
                makeFightersDraggable(isFreeMoveModeActive);
                showInfoModal("Modo de Movimento", `Modo de movimento livre ${isFreeMoveModeActive ? 'ATIVADO' : 'DESATIVADO'}.`);
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
                if (tokenData) socket.emit('playerAction', { type: 'updateToken', token: { id: targetId, isFlipped: !tokenData.isFlipped } });
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
            const gameWrapperRect = gameWrapper.getBoundingClientRect();
            const gameScale = getGameScale();
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            const gameX = Math.round((mouseX - gameWrapperRect.left) / gameScale);
            const gameY = Math.round((mouseY - gameWrapperRect.top) / gameScale);
            coordsDisplay.innerHTML = `X: ${gameX}<br>Y: ${gameY}`;
        });
    }
    
    function showScenarioSelectionModal(){let e='<div class="category-tabs">';const t=Object.keys(ALL_SCENARIOS);t.forEach((t,o)=>{e+=`<button class="category-tab-btn ${0===o?"active":""}" data-category="${t}">${t.replace(/_/g," ")}</button>`}),e+="</div>",t.forEach((t,o)=>{e+=`<div class="scenarios-grid ${0===o?"active":""}" id="grid-${t}">`,ALL_SCENARIOS[t].forEach(t=>{const o=t.split("/").pop().replace(".png","").replace(".jpg","");e+=`<div class="scenario-card" data-path="${t}"><img src="images/mapas/${t}" alt="${o}"><div class="scenario-name">${o}</div></div>`}),e+="</div>"}),showInfoModal("Mudar Cenário",e,!1),document.querySelectorAll(".category-tab-btn").forEach(e=>{e.addEventListener("click",()=>{document.querySelectorAll(".category-tab-btn, .scenarios-grid").forEach(e=>e.classList.remove("active")),e.classList.add("active"),document.getElementById(`grid-${e.dataset.category}`).classList.add("active")})}),document.querySelectorAll(".scenario-card").forEach(e=>{e.addEventListener("click",()=>{const t=e.dataset.path;socket.emit("playerAction",{type:"changeScenario",scenario:t}),modal.classList.add("hidden")})})}
    
    // --- LÓGICA DA FICHA DE PERSONAGEM (ALMARA RPG) ---
    function initializeCharacterSheet() {
        tempCharacterSheet.spells = []; 

        const raceSelect = document.getElementById('sheet-race-select');
        raceSelect.innerHTML = Object.keys(GAME_RULES.races).map(race => `<option value="${race}">${race}</option>`).join('');

        const weapon1Select = document.getElementById('sheet-weapon1-type');
        const weapon2Select = document.getElementById('sheet-weapon2-type');
        const weaponOptions = Object.keys(GAME_RULES.weapons).map(w => `<option value="${w}">${w}</option>`).join('');
        weapon1Select.innerHTML = weaponOptions;
        weapon2Select.innerHTML = weaponOptions;

        document.getElementById('sheet-armor-type').innerHTML = Object.keys(GAME_RULES.armors).map(a => `<option value="${a}">${a}</option>`).join('');
        document.getElementById('sheet-shield-type').innerHTML = Object.keys(GAME_RULES.shields).map(s => `<option value="${s}">${s}</option>`).join('');

        document.querySelectorAll('.arrow-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const wrapper = e.target.closest('.number-input-wrapper');
                const input = wrapper.querySelector('input');
                let value = parseInt(input.value, 10);
                if (e.target.classList.contains('up-arrow')) {
                    value++;
                } else {
                    value--;
                }
                const min = input.min !== '' ? parseInt(input.min, 10) : -Infinity;
                const max = input.max !== '' ? parseInt(input.max, 10) : Infinity;
                input.value = Math.max(min, Math.min(max, value));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
        });
        
        updateCharacterSheet();
    }
    
    function updateCharacterSheet(event = null) {
        if (!GAME_RULES.races) return; 
        let isValid = true;
        let infoText = '';
        
        document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
        
        const selectedRace = document.getElementById('sheet-race-select').value;
        const raceData = GAME_RULES.races[selectedRace];
        const baseAttributes = {
            forca: parseInt(document.getElementById('sheet-base-attr-forca').value) || 0, agilidade: parseInt(document.getElementById('sheet-base-attr-agilidade').value) || 0,
            protecao: parseInt(document.getElementById('sheet-base-attr-protecao').value) || 0, constituicao: parseInt(document.getElementById('sheet-base-attr-constituicao').value) || 0,
            inteligencia: parseInt(document.getElementById('sheet-base-attr-inteligencia').value) || 0, mente: parseInt(document.getElementById('sheet-base-attr-mente').value) || 0,
        };
        const elements = {
            fogo: parseInt(document.getElementById('sheet-elem-fogo').value) || 0, agua: parseInt(document.getElementById('sheet-elem-agua').value) || 0,
            terra: parseInt(document.getElementById('sheet-elem-terra').value) || 0, vento: parseInt(document.getElementById('sheet-elem-vento').value) || 0,
            luz: parseInt(document.getElementById('sheet-elem-luz').value) || 0, escuridao: parseInt(document.getElementById('sheet-elem-escuridao').value) || 0,
        };
        
        let weapon1Type = document.getElementById('sheet-weapon1-type').value;
        let weapon2Type = document.getElementById('sheet-weapon2-type').value;
        let armorType = document.getElementById('sheet-armor-type').value;
        let shieldType = document.getElementById('sheet-shield-type').value;

        let maxAttrPoints = 5 + (raceData.bon.escolha || 0);
        const totalAttrPoints = Object.values(baseAttributes).reduce((sum, val) => sum + val, 0);
        const attrPointsRemaining = maxAttrPoints - totalAttrPoints;
        document.getElementById('sheet-points-attr-remaining').textContent = attrPointsRemaining;
        if (attrPointsRemaining < 0) { document.getElementById('attr-error-message').textContent = `Pontos excedidos!`; isValid = false; }
        
        const totalElemPoints = Object.values(elements).reduce((sum, val) => sum + val, 0);
        const elemPointsRemaining = 2 - totalElemPoints;
        document.getElementById('sheet-points-elem-remaining').textContent = elemPointsRemaining;
        if (elemPointsRemaining < 0) { document.getElementById('elem-error-message').textContent = `Pontos excedidos!`; isValid = false; }

        let finalAttributes = { ...baseAttributes };
        if (raceData.bon) Object.keys(raceData.bon).forEach(attr => { if(attr !== 'escolha') finalAttributes[attr] += raceData.bon[attr]; });
        if (raceData.pen) Object.keys(raceData.pen).forEach(attr => finalAttributes[attr] += raceData.pen[attr]);

        let weapon1Data = GAME_RULES.weapons[weapon1Type];
        let weapon2Data = GAME_RULES.weapons[weapon2Type];
        let armorData = GAME_RULES.armors[armorType];
        let shieldData = GAME_RULES.shields[shieldType];
        
        let cost = weapon1Data.cost + weapon2Data.cost + armorData.cost + shieldData.cost;
        if (cost > 200 && event && event.target) {
            alert("Dinheiro insuficiente!");
            const changedElement = event.target;
            if (changedElement.id.includes('weapon')) { changedElement.value = "Desarmado"; }
            else if (changedElement.id.includes('armor')) { changedElement.value = "Nenhuma"; }
            else if (changedElement.id.includes('shield')) { changedElement.value = "Nenhum"; }
            return updateCharacterSheet();
        }
        
        const weapon1Is2H = weapon1Data.hand === 2;
        
        if (weapon1Is2H) {
            if (finalAttributes.forca < 4) {
                infoText += 'Arma de 2 mãos requer ambas as mãos. É preciso 4 de Força para usá-la com uma mão. ';
                if (weapon2Type !== 'Desarmado') { document.getElementById('sheet-weapon2-type').value = 'Desarmado'; return updateCharacterSheet(); }
                if (shieldType !== 'Nenhum') { document.getElementById('sheet-shield-type').value = 'Nenhum'; return updateCharacterSheet(); }
            } else {
                infoText += 'Você usa uma arma de 2 mãos com uma mão (-2 no acerto). ';
            }
        }
        
        if (weapon2Type !== 'Desarmado' && shieldType !== 'Nenhum') {
             infoText += 'Não é possível usar uma segunda arma com um escudo. ';
             document.getElementById('sheet-shield-type').value = 'Nenhum';
             return updateCharacterSheet();
        }
        
        document.getElementById('sheet-weapon2-type').disabled = (weapon1Is2H && finalAttributes.forca < 4) || shieldType !== 'Nenhum';
        document.getElementById('sheet-shield-type').disabled = (weapon1Is2H && finalAttributes.forca < 4) || weapon2Type !== 'Desarmado';

        finalAttributes.protecao += armorData.protection;
        finalAttributes.agilidade -= armorData.agility_pen;
        finalAttributes.agilidade -= shieldData.agility_pen;
        
        if (shieldData.req_forca > finalAttributes.forca) { infoText += `Força insuficiente para ${shieldType}. `; isValid = false; }
        if ((selectedRace === 'Goblin' || selectedRace === 'Halfling') && (weapon1Type.includes('Gigante') || weapon1Type.includes('Colossal'))) {
             infoText += `${selectedRace} não pode usar armas Gigantes/Colossais. `; isValid = false;
        }

        let bta = finalAttributes.agilidade;
        let btd = finalAttributes.forca;
        let btm = finalAttributes.inteligencia;

        bta += weapon1Data.bta || 0;
        btd += weapon1Data.btd || 0;
        btm += weapon1Data.btm || 0;

        if(weapon1Is2H && finalAttributes.forca >= 4) bta += weapon1Data.one_hand_bta_mod || 0;
        if (weapon1Type !== 'Desarmado' && weapon2Type !== 'Desarmado') btd -= 1;
        
        document.getElementById('sheet-money-copper').textContent = 200 - cost;
        document.getElementById('sheet-bta').textContent = bta >= 0 ? `+${bta}` : bta;
        document.getElementById('sheet-btd').textContent = btd >= 0 ? `+${btd}` : btd;
        document.getElementById('sheet-btm').textContent = btm >= 0 ? `+${btm}` : btm;
        
        const hpMax = 20 + (finalAttributes.constituicao * 5);
        const mahouMax = 10 + (finalAttributes.mente * 5);
        document.getElementById('sheet-hp-max').textContent = hpMax;
        document.getElementById('sheet-hp-current').textContent = hpMax;
        document.getElementById('sheet-mahou-max').textContent = mahouMax;
        document.getElementById('sheet-mahou-current').textContent = mahouMax;
        
        Object.keys(finalAttributes).forEach(attr => { document.getElementById(`sheet-final-attr-${attr}`).textContent = finalAttributes[attr]; });
        document.getElementById('race-info-box').textContent = raceData.text;
        document.getElementById('equipment-info-text').textContent = infoText;
        
        Object.keys(elements).forEach(elem => {
            const display = document.getElementById(`advanced-${elem}`);
            display.textContent = elements[elem] >= 2 ? GAME_RULES.advancedElements[elem] : '';
        });
        
        const spellGrid = document.getElementById('spell-selection-grid');
        spellGrid.innerHTML = '';
        const availableElements = Object.keys(elements).filter(e => elements[e] > 0);
        const allSpells = [...(ALL_SPELLS.grade1 || []), ...(ALL_SPELLS.grade2 || []), ...(ALL_SPELLS.grade3 || [])];
        const availableSpells = allSpells.filter(s => availableElements.includes(s.element));
        
        availableSpells.forEach(spell => {
            const card = document.createElement('div');
            card.className = 'spell-card';
            card.dataset.spellName = spell.name;
            const spellType = spell.inCombat ? '(Combate)' : '(Utilitário)';
            card.innerHTML = `<h4>${spell.name} <small>${spellType}</small></h4><p>${spell.description}</p>`;
            if (tempCharacterSheet.spells.includes(spell.name)) {
                card.classList.add('selected');
            }
            card.addEventListener('click', () => {
                if (tempCharacterSheet.spells.includes(spell.name)) {
                    tempCharacterSheet.spells = tempCharacterSheet.spells.filter(s => s !== spell.name);
                } else {
                    if (tempCharacterSheet.spells.length < 2) {
                        tempCharacterSheet.spells.push(spell.name);
                    }
                }
                updateCharacterSheet();
            });
            spellGrid.appendChild(card);
        });
        
        document.getElementById('sheet-spells-selected-count').textContent = tempCharacterSheet.spells.length;
        if(tempCharacterSheet.spells.length !== 2) {
            document.getElementById('spell-error-message').textContent = 'Selecione 2 magias.';
            isValid = false;
        }

        document.getElementById('sheet-confirm-btn').disabled = !isValid;
    }

    function handleSaveCharacter() {
        const finalAttributes = {};
        const finalAttrElements = document.querySelectorAll('.final-attributes .attr-item');
        finalAttrElements.forEach(item => {
            const label = item.querySelector('label').textContent.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const value = parseInt(item.querySelector('span').textContent, 10);
            finalAttributes[label] = value;
        });

        const sheetData = {
            name: document.getElementById('sheet-name').value,
            class: document.getElementById('sheet-class').value,
            race: document.getElementById('sheet-race-select').value,
            tokenName: tempCharacterSheet.tokenName,
            tokenImg: tempCharacterSheet.tokenImg,
            baseAttributes: {
                forca: parseInt(document.getElementById('sheet-base-attr-forca').value) || 0,
                agilidade: parseInt(document.getElementById('sheet-base-attr-agilidade').value) || 0,
                protecao: parseInt(document.getElementById('sheet-base-attr-protecao').value) || 0,
                constituicao: parseInt(document.getElementById('sheet-base-attr-constituicao').value) || 0,
                inteligencia: parseInt(document.getElementById('sheet-base-attr-inteligencia').value) || 0,
                mente: parseInt(document.getElementById('sheet-base-attr-mente').value) || 0,
            },
            finalAttributes: finalAttributes,
            elements: {
                fogo: parseInt(document.getElementById('sheet-elem-fogo').value) || 0,
                agua: parseInt(document.getElementById('sheet-elem-agua').value) || 0,
                terra: parseInt(document.getElementById('sheet-elem-terra').value) || 0,
                vento: parseInt(document.getElementById('sheet-elem-vento').value) || 0,
                luz: parseInt(document.getElementById('sheet-elem-luz').value) || 0,
                escuridao: parseInt(document.getElementById('sheet-elem-escuridao').value) || 0,
            },
            equipment: {
                weapon1: { name: document.getElementById('sheet-weapon1-name').value, type: document.getElementById('sheet-weapon1-type').value },
                weapon2: { name: document.getElementById('sheet-weapon2-name').value, type: document.getElementById('sheet-weapon2-type').value },
                armor: document.getElementById('sheet-armor-type').value,
                shield: document.getElementById('sheet-shield-type').value
            },
            spells: tempCharacterSheet.spells,
        };

        const dataStr = JSON.stringify(sheetData, null, 2);
        const dataBase64 = btoa(dataStr);
        const a = document.createElement("a");
        a.href = "data:text/plain;charset=utf-8," + encodeURIComponent(dataBase64);
        a.download = `${sheetData.name || 'personagem'}_almara.txt`;
        a.click();
    }
    
    function handleLoadCharacter(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const decodedData = atob(e.target.result);
                const sheetData = JSON.parse(decodedData);
                
                tempCharacterSheet.tokenName = sheetData.tokenName;
                tempCharacterSheet.tokenImg = sheetData.tokenImg;
                tempCharacterSheet.spells = sheetData.spells || [];
                
                initializeCharacterSheet();

                document.getElementById('sheet-name').value = sheetData.name || '';
                document.getElementById('sheet-class').value = sheetData.class || '';
                document.getElementById('sheet-race-select').value = sheetData.race || 'Humano';

                Object.keys(sheetData.baseAttributes).forEach(attr => {
                    document.getElementById(`sheet-base-attr-${attr}`).value = sheetData.baseAttributes[attr] || 0;
                });
                Object.keys(sheetData.elements).forEach(elem => {
                    document.getElementById(`sheet-elem-${elem}`).value = sheetData.elements[elem] || 0;
                });
                
                document.getElementById('sheet-weapon1-name').value = sheetData.equipment.weapon1.name || '';
                document.getElementById('sheet-weapon1-type').value = sheetData.equipment.weapon1.type || 'Desarmado';
                document.getElementById('sheet-weapon2-name').value = sheetData.equipment.weapon2.name || '';
                document.getElementById('sheet-weapon2-type').value = sheetData.equipment.weapon2.type || 'Desarmado';
                document.getElementById('sheet-armor-type').value = sheetData.equipment.armor || 'Nenhuma';
                document.getElementById('sheet-shield-type').value = sheetData.equipment.shield || 'Nenhum';
                
                updateCharacterSheet();
                showScreen(document.getElementById('character-sheet-screen'));

            } catch (error) {
                showInfoModal('Erro', 'Não foi possível carregar o arquivo. Formato inválido.');
                console.error('Erro ao carregar personagem:', error);
            }
        };
        reader.readAsText(file);
    }

    function handleConfirmCharacter() {
        const finalAttributes = {};
        const finalAttrElements = document.querySelectorAll('.final-attributes .attr-item');
        finalAttrElements.forEach(item => {
            const label = item.querySelector('label').textContent.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const value = parseInt(item.querySelector('span').textContent, 10);
            finalAttributes[label] = value;
        });

        const finalSheet = {
             name: document.getElementById('sheet-name').value,
             class: document.getElementById('sheet-class').value,
             race: document.getElementById('sheet-race-select').value,
             tokenName: tempCharacterSheet.tokenName,
             tokenImg: tempCharacterSheet.tokenImg,
             baseAttributes: {
                forca: parseInt(document.getElementById('sheet-base-attr-forca').value) || 0,
                agilidade: parseInt(document.getElementById('sheet-base-attr-agilidade').value) || 0,
                protecao: parseInt(document.getElementById('sheet-base-attr-protecao').value) || 0,
                constituicao: parseInt(document.getElementById('sheet-base-attr-constituicao').value) || 0,
                inteligencia: parseInt(document.getElementById('sheet-base-attr-inteligencia').value) || 0,
                mente: parseInt(document.getElementById('sheet-base-attr-mente').value) || 0,
             },
             finalAttributes: finalAttributes,
             elements: {
                fogo: parseInt(document.getElementById('sheet-elem-fogo').value) || 0,
                agua: parseInt(document.getElementById('sheet-elem-agua').value) || 0,
                terra: parseInt(document.getElementById('sheet-elem-terra').value) || 0,
                vento: parseInt(document.getElementById('sheet-elem-vento').value) || 0,
                luz: parseInt(document.getElementById('sheet-elem-luz').value) || 0,
                escuridao: parseInt(document.getElementById('sheet-elem-escuridao').value) || 0,
             },
             equipment: {
                weapon1: { name: document.getElementById('sheet-weapon1-name').value, type: document.getElementById('sheet-weapon1-type').value },
                weapon2: { name: document.getElementById('sheet-weapon2-name').value, type: document.getElementById('sheet-weapon2-type').value },
                armor: document.getElementById('sheet-armor-type').value,
                shield: document.getElementById('sheet-shield-type').value
             },
             spells: tempCharacterSheet.spells,
        };
        socket.emit('playerAction', { type: 'playerFinalizesCharacter', characterData: finalSheet });
        showScreen(document.getElementById('player-waiting-screen'));
        document.getElementById('player-waiting-message').innerText = "Personagem enviado! Aguardando o Mestre...";
    }
    
    // --- INICIALIZAÇÃO E LISTENERS DE SOCKET ---
    socket.on('initialData', (data) => {
        ALL_CHARACTERS = data.characters || { players: [], npcs: [], dynamic: [] };
        ALL_SCENARIOS = data.scenarios || {};
    });

    socket.on('gameUpdate', (gameState) => { 
        if (clientFlowState === 'initializing') return; // BUGFIX: Ignora updates até o papel ser definido
        renderGame(gameState); 
    });

    socket.on('fighterMoved', ({ fighterId, position }) => {
        customFighterPositions[fighterId] = position;
        const fighterEl = document.getElementById(fighterId);
        if (fighterEl) {
            fighterEl.style.left = position.left;
            fighterEl.style.top = position.top;
        }
    });
    socket.on('roomCreated', (roomId) => {
        myRoomId = roomId;
        const inviteLinkEl = document.getElementById('gm-link-invite');
        const inviteUrl = `${window.location.origin}?room=${roomId}`;
        if (inviteLinkEl) { 
            inviteLinkEl.textContent = inviteUrl; 
            inviteLinkEl.onclick = () => copyToClipboard(inviteUrl, inviteLinkEl); 
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
        myRole = data.role; myPlayerKey = data.playerKey || socket.id; isGm = !!data.isGm; myRoomId = data.roomId;
        clientFlowState = 'in_game'; // BUGFIX: Libera o processamento de 'gameUpdate'
        if (myRole === 'player') showScreen(document.getElementById('player-initial-choice-screen'));

        // Se houver um estado de jogo em cache, renderiza agora
        if (currentGameState) {
            renderGame(currentGameState);
        }
    });
    socket.on('promptForAdventureType', () => { if (isGm) showCustomModal('Retornar à Aventura', 'Deseja continuar a aventura anterior ou começar uma nova batalha?', [{text: 'Continuar Batalha', closes: true, onClick: () => socket.emit('playerAction', { type: 'gmChoosesAdventureType', choice: 'continue' })}, {text: 'Nova Batalha', closes: true, onClick: () => socket.emit('playerAction', { type: 'gmChoosesAdventureType', choice: 'new' })}]); });
    socket.on('attackResolved', (data) => {
        const { attackerKey, targetKey, hit, debugInfo } = data;
        const attackerEl = document.getElementById(attackerKey);
        if (attackerEl) {
            const isPlayer = attackerEl.classList.contains('player-char-container');
            const originalLeft = attackerEl.style.left;
            attackerEl.style.left = `${parseFloat(originalLeft) + (isPlayer ? 200 : -200)}px`;
            setTimeout(() => { attackerEl.style.left = originalLeft; }, 500);
        }
        const targetEl = document.getElementById(targetKey);
        if (targetEl && hit) {
            const img = targetEl.querySelector('.fighter-img-ingame');
            if (img) {
                img.classList.add('is-hit-flash');
                setTimeout(() => img.classList.remove('is-hit-flash'), 400);
            }
        }
        
        if (isGm && isGmDebugModeActive && debugInfo) {
            const formatBreakdown = (breakdown) => {
                if (!breakdown) return '';
                return Object.entries(breakdown)
                    .map(([key, value]) => `<div class="breakdown-item"><span>${key}:</span> <span>${value >= 0 ? '+' : ''}${value}</span></div>`)
                    .join('');
            };

            let contentHtml = `<div class="debug-info-grid">
                <h4>Cálculo de Acerto (Atacante: ${debugInfo.attackerName})</h4>
                <div class="grid-row"><span>Rolagem D20:</span> <span>${debugInfo.hitRoll}</span></div>
                <div class="grid-row"><span>BTA do Atacante:</span> <span>${debugInfo.bta >= 0 ? '+' : ''}${debugInfo.bta}</span></div>
                <div class="debug-breakdown">${formatBreakdown(debugInfo.btaBreakdown)}</div>
                <div class="grid-row result"><span>Resultado Final:</span> <span class="debug-result">${debugInfo.attackRoll}</span></div>
                <div class="grid-row"><span>vs Defesa do Alvo (${debugInfo.targetName}):</span> <span>${debugInfo.targetDefense}</span></div>
                <hr>
                <h4>Cálculo de Dano</h4>
                <div class="grid-row"><span>Resultado do Ataque:</span> <span class="debug-result">${debugInfo.hit ? 'ACERTOU' : 'ERROU'}</span></div>`;

            if (debugInfo.hit) {
                contentHtml += `
                    <div class="grid-row"><span>Rolagem de Dano (${debugInfo.damageFormula}):</span> <span>${debugInfo.damageRoll}</span></div>
                    ${debugInfo.isCrit ? `<div class="grid-row"><span>Dano Crítico (Dobro dos Dados):</span> <span>+${debugInfo.critDamage}</span></div>` : ''}
                    <div class="grid-row"><span>BTD do Atacante:</span> <span>${debugInfo.btd >= 0 ? '+' : ''}${debugInfo.btd}</span></div>
                    <div class="debug-breakdown">${formatBreakdown(debugInfo.btdBreakdown)}</div>
                    <div class="grid-row"><span>Dano Bruto Total:</span> <span>${debugInfo.totalDamage}</span></div>
                    <div class="grid-row"><span>vs Proteção do Alvo:</span> <span>-${debugInfo.targetProtection}</span></div>
                    <div class="debug-breakdown">${formatBreakdown(debugInfo.protectionBreakdown)}</div>
                    <hr>
                    <div class="final-damage-row"><span>DANO FINAL:</span> <span class="debug-final-damage">${debugInfo.finalDamage}</span></div>`;
            }

            contentHtml += `</div>`;

            showCustomModal(`Relatório de Combate: ${debugInfo.attackerName} vs ${debugInfo.targetName}`, contentHtml, [
                { text: 'Fechar', closes: true }
            ]);
        }
    });
    socket.on('fleeResolved', ({ actorKey }) => {
        const actorEl = document.getElementById(actorKey);
        if (actorEl) actorEl.classList.add(actorEl.classList.contains('player-char-container') ? 'is-fleeing-player' : 'is-fleeing-npc');
    });
    socket.on('error', (data) => showInfoModal('Erro', data.message));
    
    async function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoomId = urlParams.get('room');
        
        showScreen(document.getElementById('loading-screen')); 

        try {
            const [rulesRes, spellsRes] = await Promise.all([
                fetch('rules.json'),
                fetch('spells.json')
            ]);
            if (!rulesRes.ok || !spellsRes.ok) throw new Error('Network response was not ok.');
            GAME_RULES = await rulesRes.json();
            ALL_SPELLS = await spellsRes.json();
        } catch (error) {
            console.error('Falha ao carregar arquivos de regras:', error);
            showInfoModal("Erro Crítico", "Não foi possível carregar os arquivos de regras do jogo. A página será recarregada.", false);
            setTimeout(() => window.location.reload(), 4000);
            return;
        }

        if (urlRoomId) {
            socket.emit('playerJoinsLobby', { roomId: urlRoomId });
        } else {
            socket.emit('gmCreatesLobby');
        }

        document.getElementById('join-as-player-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'player' }));
        document.getElementById('join-as-spectator-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'spectator' }));
        document.getElementById('new-char-btn').addEventListener('click', () => {
            showScreen(document.getElementById('selection-screen'));
            renderPlayerTokenSelection();
        });
        document.getElementById('load-char-btn').addEventListener('click', () => document.getElementById('load-char-input').click());
        document.getElementById('load-char-input').addEventListener('change', handleLoadCharacter);

        document.querySelectorAll('#character-sheet-screen input, #character-sheet-screen select').forEach(el => {
            el.addEventListener('change', (e) => updateCharacterSheet(e));
            el.addEventListener('input', (e) => updateCharacterSheet(e));
        });
        document.getElementById('sheet-save-btn').addEventListener('click', handleSaveCharacter);
        document.getElementById('sheet-confirm-btn').addEventListener('click', handleConfirmCharacter);

        document.getElementById('start-adventure-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsAdventure' }));
        document.getElementById('start-theater-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsTheater' }));
        backToLobbyBtn.addEventListener('click', () => socket.emit('playerAction', { type: 'gmGoesBackToLobby' }));
        document.getElementById('theater-change-scenario-btn').addEventListener('click', showScenarioSelectionModal);
        document.getElementById('theater-publish-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'publish_stage' }));
        
        floatingSwitchModeBtn.addEventListener('click', () => socket.emit('playerAction', { type: 'gmSwitchesMode' }));
        floatingInviteBtn.addEventListener('click', () => {
             if (myRoomId) {
                const inviteUrl = `${window.location.origin}?room=${myRoomId}`;
                copyToClipboard(inviteUrl, floatingInviteBtn);
            }
        });
        
        if (floatingHelpBtn) floatingHelpBtn.addEventListener('click', showHelpModal);

        setupTheaterEventListeners();
        initializeGlobalKeyListeners();
        window.addEventListener('resize', scaleGame);
        scaleGame();
    }
    
    initialize();
});