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
    let clientFlowState = 'initializing';
    const gameStateQueue = [];
    let ALL_CHARACTERS = { players: [], npcs: [], dynamic: [] };
    let ALL_SCENARIOS = {};
    let stagedNpcSlots = new Array(5).fill(null);
    let selectedSlotIndex = null;
    const MAX_NPCS = 5;
    let isTargeting = false;
    let targetingAction = null; // NOVO: Armazena a ação (ataque, magia)
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
                    renderNpcStagingArea(); // Sempre renderiza para refletir mudanças
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
                    stagedNpcSlots[targetSlot] = { ...npcData, id: `npc-staged-${Date.now()}-${targetSlot}` };
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
            const finalNpcs = stagedNpcSlots
                .map((npc, index) => npc ? { ...npc, slotIndex: index } : null)
                .filter(npc => npc !== null);

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
                slot.addEventListener('click', () => showNpcConfigModal(i)); // MODIFICADO: Abre modal de config
                
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

    // NOVO: Modal para configurar stats do NPC
    function showNpcConfigModal(slotIndex) {
        const npcData = stagedNpcSlots[slotIndex];
        if (!npcData) return;

        const currentStats = npcData.customStats || { hp: 10, mahou: 10, bta: 1, btd: 1, btm: 1, agilidade: 2, protecao: 0 };

        let content = `<div class="npc-config-grid">
            <label>HP:</label><input type="number" id="npc-cfg-hp" value="${currentStats.hp}">
            <label>Mahou:</label><input type="number" id="npc-cfg-mahou" value="${currentStats.mahou}">
            <label>BTA:</label><input type="number" id="npc-cfg-bta" value="${currentStats.bta}">
            <label>BTD:</label><input type="number" id="npc-cfg-btd" value="${currentStats.btd}">
            <label>BTM:</label><input type="number" id="npc-cfg-btm" value="${currentStats.btm}">
            <label>Agilidade:</label><input type="number" id="npc-cfg-agilidade" value="${currentStats.agilidade}">
            <label>Proteção:</label><input type="number" id="npc-cfg-protecao" value="${currentStats.protecao}">
        </div>`;
        
        showCustomModal(`Configurar ${npcData.name}`, content, [
            { text: 'Confirmar', closes: true, onClick: () => {
                const customStats = {
                    hp: parseInt(document.getElementById('npc-cfg-hp').value, 10) || 10,
                    mahou: parseInt(document.getElementById('npc-cfg-mahou').value, 10) || 10,
                    bta: parseInt(document.getElementById('npc-cfg-bta').value, 10) || 0,
                    btd: parseInt(document.getElementById('npc-cfg-btd').value, 10) || 0,
                    btm: parseInt(document.getElementById('npc-cfg-btm').value, 10) || 0,
                    agilidade: parseInt(document.getElementById('npc-cfg-agilidade').value, 10) || 0,
                    protecao: parseInt(document.getElementById('npc-cfg-protecao').value, 10) || 0,
                };
                stagedNpcSlots[slotIndex].customStats = customStats;
            }},
            { text: 'Cancelar', closes: true, className: 'btn-danger' }
        ]);
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
                </div>
                <div class="mahou-bar-ingame" title="Mahou: ${fighter.mahou}/${fighter.mahouMax}">
                    <div class="mahou-bar-ingame-fill" style="width: ${mahouPercentage}%"></div>
                </div>
            `;
        }
    
        container.innerHTML = `${healthBarHtml}<img src="${fighter.img}" class="fighter-img-ingame"><div class="fighter-name-ingame">${fighter.nome}</div>`;
        return container;
    }
    
    // MODIFICADO: Lógica de botões de ação redesenhada
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
        
        // Botão de Ataque
        actionButtonsWrapper.appendChild(createButton('Atacar', startAttackSequence, !canControl));

        // Botões de Magia
        if (myRole === 'player' && state.activeCharacterKey === myPlayerKey && activeFighter.sheet && activeFighter.sheet.spells) {
            activeFighter.sheet.spells.forEach(spellName => {
                const spell = [...(ALL_SPELLS.grade1 || []), ...(ALL_SPELLS.grade2 || [])].find(s => s.name === spellName);
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

    // NOVO: Inicia a sequência de ataque
    function startAttackSequence() {
        const attacker = getFighter(currentGameState, currentGameState.activeCharacterKey);
        if (!attacker || !attacker.isPlayer) { // Ataque de NPC é simplificado
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
    
    // NOVO: Inicia a sequência de magia
    function startSpellSequence(spell) {
        // TODO: Adicionar lógica para magias de área ou que não precisam de alvo
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
    
    // ... (funções de cheat, draggable e help permanecem as mesmas) ...
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
        const content = `<div style="text-align: left; font-size: 1.2em; line-height: 1.8;"><p><b>C:</b> Abrir menu de Cheats (GM).</p><p><b>T:</b> Mostrar/Ocultar coordenadas do mouse.</p><p><b>J:</b> Ativar/Desativar modo de arrastar personagens (GM).</p></div>`;
        showInfoModal("Atalhos do Teclado", content);
    }
    // ... (funções do modo teatro permanecem as mesmas) ...
    
    // --- LÓGICA DA FICHA DE PERSONAGEM (ALMARA RPG) ---
    // MODIFICADO: Usa o objeto GAME_RULES carregado
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
        // ... (esta função permanece praticamente a mesma, pois já era bem robusta) ...
        // A única mudança implícita é que GAME_RULES e ALL_SPELLS agora são os objetos carregados
        // ...
        const availableSpells = (ALL_SPELLS.grade1 || []).filter(s => availableElements.includes(s.element));
        // ... resto da função
    }

    // ... (funções handleSave/Load/Confirm Character permanecem as mesmas) ...
    
    function renderGame(gameState) {
        scaleGame(); 
        oldGameState = currentGameState;
        currentGameState = gameState;
        if (!gameState || !gameState.mode || !gameState.connectedPlayers) {
            showScreen(document.getElementById('loading-screen'));
            return;
        }
        if (gameState.mode === 'adventure' && gameState.customPositions) customFighterPositions = gameState.customPositions;
        
        const myPlayerData = gameState.connectedPlayers?.[socket.id];
        if (myRole === 'player' && myPlayerData && !myPlayerData.characterFinalized) return; 
        
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
                    showScreen(document.getElementById('player-waiting-screen'));
                    document.getElementById('player-waiting-message').innerText = "Aguardando o Mestre iniciar o jogo...";
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

    // --- INICIALIZAÇÃO E LISTENERS DE SOCKET ---
    socket.on('initialData', (data) => {
        ALL_CHARACTERS = data.characters || { players: [], npcs: [], dynamic: [] };
        ALL_SCENARIOS = data.scenarios || {};
    });
    // ... (outros listeners de socket permanecem os mesmos) ...
    
    // MODIFICADO: Função de inicialização agora é assíncrona para carregar regras
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

        // ... (todos os addEventListener permanecem os mesmos) ...
        document.getElementById('join-as-player-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'player' }));
        // ... etc
        
        setupTheaterEventListeners();
        initializeGlobalKeyListeners();
        window.addEventListener('resize', scaleGame);
        scaleGame();
    }
    
    initialize();
});