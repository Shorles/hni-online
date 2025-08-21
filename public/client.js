// client.js

document.addEventListener('DOMContentLoaded', () => {
    // --- CONSTANTES DE REGRAS DO JOGO (ALMARA RPG) ---
    const GAME_RULES = {
        races: {
            "Anjo": { bon: {}, pen: { forca: -1 }, text: "Não podem usar elemento Escuridão. Obrigatoriamente começam com 1 ponto em Luz. Recebem +1 em magias de cura." },
            "Demônio": { bon: {}, pen: {}, text: "Não podem usar elemento Luz. Obrigatoriamente começam com 1 ponto em Escuridão. Recebem +1 em dano de magias de Escuridão. Cura recebida é reduzida em 1." },
            "Elfo": { bon: { agilidade: 2 }, pen: { forca: -1 }, text: "Enxergam no escuro (exceto escuridão mágica)." },
            "Anão": { bon: { constituicao: 1 }, pen: {}, text: "Enxergam no escuro (exceto escuridão mágica)." },
            "Goblin": { bon: { mente: 1 }, pen: { constituicao: -1 }, text: "Não podem utilizar armas do tipo Gigante e Colossal." },
            "Orc": { bon: { forca: 2 }, pen: { inteligencia: -1 }, text: "Podem comer quase qualquer coisa sem adoecerem." },
            "Humano": { bon: { escolha: 1 }, pen: {}, text: "Recebem +1 em um atributo à sua escolha." }, // Lógica especial será necessária
            "Kairou": { bon: {}, pen: {}, text: "Respiram debaixo d'água. Devem umedecer a pele a cada dia. +1 em todos os atributos se lutarem na água." },
            "Centauro": { bon: {}, pen: { agilidade: -1 }, text: "Não podem entrar em locais apertados ou subir escadas de mão. +3 em testes de velocidade/salto." },
            "Halfling": { bon: { agilidade: 1, inteligencia: 1 }, pen: { forca: -1, constituicao: -1 }, text: "Não podem usar armas Gigante/Colossal. Enxergam no escuro." },
            "Tritão": { bon: { forca: 2 }, pen: { inteligencia: -2 }, text: "Respiram debaixo d'água. Devem umedecer a pele a cada 5 dias." },
            "Meio-Elfo": { bon: { agilidade: 1 }, pen: {}, text: "Enxergam no escuro (exceto escuridão mágica)." },
            "Meio-Orc": { bon: { forca: 1 }, pen: {}, text: "Nenhuma característica única." },
            "Auslender": { bon: { inteligencia: 2, agilidade: 1 }, pen: { forca: -1, protecao: -1 }, text: "Não precisam de testes para usar artefatos tecnológicos." },
            "Tulku": { bon: { inteligencia: 1, mente: 1 }, pen: {}, text: "Recebem -1 para usar magias de Luz. Enxergam no escuro." },
        },
        weapons: {
            "Desarmado": { cost: 0, damage: "1D4", hand: 1, bta: 0, btd: 0, ambi_bta_mod: 0, ambi_btd_mod: 0 },
            "1 Mão Mínima": { cost: 60, damage: "1D6", hand: 1, bta: 4, btd: -1, ambi_bta_mod: 0, ambi_btd_mod: -1 },
            "1 Mão Leve": { cost: 80, damage: "1D6", hand: 1, bta: 3, btd: 0, ambi_bta_mod: 0, ambi_btd_mod: -1 },
            "1 Mão Mediana": { cost: 100, damage: "1D6", hand: 1, bta: 1, btd: 1, ambi_bta_mod: 0, ambi_btd_mod: -1 },
            "Cetro": { cost: 80, damage: "1D4", hand: 1, bta: 1, btd: 0, btm: 1, ambi_bta_mod: 0, ambi_btd_mod: -1 },
            "2 Mãos Pesada": { cost: 120, damage: "1D10", hand: 2, bta: 2, btd: 0, one_hand_bta_mod: -2, ambi_btd_mod: -2 },
            "2 Mãos Gigante": { cost: 140, damage: "1D10", hand: 2, bta: 1, btd: 1, one_hand_bta_mod: -2, ambi_btd_mod: -2 },
            "2 Mãos Colossal": { cost: 160, damage: "1D10", hand: 2, bta: -1, btd: 2, one_hand_bta_mod: -2, ambi_btd_mod: -2 },
            "Cajado": { cost: 140, damage: "1D6", hand: 2, bta: 1, btd: 0, btm: 2, one_hand_bta_mod: -1 /* Diferente da regra excel, mas mais consistente */ },
        },
        armors: {
            "Nenhuma": { cost: 0, protection: 0, agility_pen: 0 },
            "Leve": { cost: 80, protection: 1, agility_pen: 0 },
            "Mediana": { cost: 100, protection: 2, agility_pen: -1 },
            "Pesada": { cost: 120, protection: 3, agility_pen: -2 },
        },
        shields: {
            "Nenhum": { cost: 0, defense: 0, agility_pen: 0, req_forca: 0 },
            "Pequeno": { cost: 80, defense: 2, agility_pen: -1, req_forca: 1 },
            "Médio": { cost: 100, defense: 4, agility_pen: -2, req_forca: 2 },
            "Grande": { cost: 120, defense: 6, agility_pen: -3, req_forca: 3 },
        }
    };
    let tempCharacterSheet = {}; // Objeto para construir a ficha do personagem

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
    let stagedNpcSlots = new Array(5).fill(null);
    let selectedSlotIndex = null;
    const MAX_NPCS = 5;

    // Controles de UI
    let isTargeting = false;
    let targetingAttackerKey = null;
    let isFreeMoveModeActive = false;
    let customFighterPositions = {};
    let draggedFighter = { element: null, offsetX: 0, offsetY: 0 };

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
        if (!state || !state.fighters || !key) return null;
        return state.fighters.players[key] || state.fighters.npcs[key];
    }
    
    // --- LÓGICA DO MODO AVENTURA ---
    function handleAdventureMode(gameState) {
        // Esta função será adaptada futuramente para usar as novas regras
        const fightScreen = document.getElementById('fight-screen');
        if (isGm) {
             if (gameState.phase === 'party_setup') {
                showScreen(document.getElementById('gm-party-setup-screen')); 
                updateGmPartySetupScreen(gameState); // Lógica antiga mantida por enquanto
             } else if (gameState.phase === 'npc_setup') {
                showScreen(document.getElementById('gm-npc-setup-screen')); 
                if (!oldGameState || oldGameState.phase !== 'npc_setup') {
                    stagedNpcSlots.fill(null);
                    selectedSlotIndex = null;
                    customFighterPositions = {};
                    renderNpcSelectionForGm(); 
                } 
            } else {
                showScreen(fightScreen); 
                updateAdventureUI(gameState);
                if (gameState.phase === 'initiative_roll') renderInitiativeUI(gameState);
                else initiativeUI.classList.add('hidden');
            }
        } else {
            // Lógica do jogador para entrar em batalha/esperar
             const amIInTheFight = !!getFighter(gameState, myPlayerKey);

            if (myRole === 'player' && !amIInTheFight) {
                showScreen(document.getElementById('player-waiting-screen'));
                document.getElementById('player-waiting-message').innerText = "Aguardando o Mestre...";
            } else if (['party_setup', 'npc_setup'].includes(gameState.phase)) {
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

    function renderPlayerTokenSelection(unavailable = []) {
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

    function updateGmPartySetupScreen(state) {
        // Lógica antiga, será substituída.
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
                let targetSlot = selectedSlotIndex;
                if (targetSlot === null) {
                    targetSlot = stagedNpcSlots.findIndex(slot => slot === null);
                }

                if (targetSlot !== -1 && targetSlot !== null) {
                    stagedNpcSlots[targetSlot] = { ...npcData, id: `npc-${Date.now()}-${targetSlot}` };
                    selectedSlotIndex = null;
                    renderNpcStagingArea();
                } else if (stagedNpcSlots.every(slot => slot !== null)) {
                     alert("Todos os slots estão cheios. Remova um inimigo para adicionar outro.");
                } else {
                     alert("Primeiro, clique em um slot vago abaixo para posicionar o inimigo.");
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
                alert("Adicione pelo menos um inimigo para a batalha.");
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
                slot.querySelector('.remove-staged-npc').addEventListener('click', (e) => {
                    e.stopPropagation();
                    const index = parseInt(e.target.dataset.index, 10);
                    stagedNpcSlots[index] = null;
                    if (selectedSlotIndex === index) selectedSlotIndex = null;
                    renderNpcStagingArea();
                });
            } else {
                slot.classList.add('empty-slot');
                slot.innerHTML = `<span>Slot ${i + 1}</span>`;
                slot.dataset.index = i;
                slot.addEventListener('click', (e) => {
                    const index = parseInt(e.currentTarget.dataset.index, 10);
                    if (selectedSlotIndex === index) {
                         selectedSlotIndex = null; // deselect
                    } else {
                        selectedSlotIndex = index;
                    }
                    renderNpcStagingArea();
                });
            }

            if (selectedSlotIndex === i) {
                slot.classList.add('selected-slot');
            }
            stagingArea.appendChild(slot);
        }
    }

    function updateAdventureUI(state) {
        if (!state || !state.fighters) return;
        
        fightSceneCharacters.innerHTML = '';
        document.getElementById('round-info').textContent = `ROUND ${state.currentRound}`;
        document.getElementById('fight-log').innerHTML = (state.log || []).map(entry => `<p class="log-${entry.type || 'info'}">${entry.text}</p>`).join('');
        
        const PLAYER_POSITIONS = [ { left: '150px', top: '500px' }, { left: '250px', top: '400px' }, { left: '350px', top: '300px' }, { left: '450px', top: '200px' } ];
        const NPC_POSITIONS = [ { left: '1000px', top: '500px' }, { left: '900px',  top: '400px' }, { left: '800px',  top: '300px' }, { left: '700px',  top: '200px' }, { left: '950px', top: '350px' } ];
        
        const playerKeys = Object.keys(state.fighters.players);
        playerKeys.forEach((key, index) => {
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
            const healthPercentage = (fighter.hp / fighter.hpMax) * 100;
            healthBarHtml = `
                <div class="health-bar-ingame">
                    <div class="health-bar-ingame-fill" style="width: ${healthPercentage}%"></div>
                    <span class="health-bar-ingame-text">${fighter.hp}/${fighter.hpMax}</span>
                </div>
            `;
        }
    
        container.innerHTML = `${healthBarHtml}<img src="${fighter.img}" class="fighter-img-ingame"><div class="fighter-name-ingame">${fighter.nome}</div>`;
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
        fleeBtn.className = 'action-btn flee-btn';
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
            if (index === 0) {
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

    function showPartSelectionModal(attackerKey, targetFighter) {
        let modalContentHtml = '<div class="target-part-selection">';
    
        targetFighter.parts.forEach(part => {
            const isDisabled = part.status === 'down';
            modalContentHtml += `
                <button class="target-part-btn" data-part-key="${part.key}" ${isDisabled ? 'disabled' : ''}>
                    ${part.name} (${part.hp}/${part.hpMax})
                </button>
            `;
        });
    
        modalContentHtml += '</div>';
    
        showInfoModal(`Selecione qual parte de ${targetFighter.nome} atacar:`, modalContentHtml, false);
    
        document.querySelectorAll('.target-part-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const partKey = e.currentTarget.dataset.partKey;
                actionButtonsWrapper.querySelectorAll('button').forEach(b => b.disabled = true);
                socket.emit('playerAction', { 
                    type: 'attack', 
                    attackerKey: attackerKey, 
                    targetKey: targetFighter.id,
                    targetPartKey: partKey
                });
                cancelTargeting();
                modal.classList.add('hidden');
            });
        });
    }

    function handleTargetClick(event) {
        if (isFreeMoveModeActive) return;
        if (!isTargeting || !targetingAttackerKey) return;
        
        const targetContainer = event.target.closest('.char-container.targetable');
        if (!targetContainer) return;
    
        const targetKey = targetContainer.dataset.key;
        const targetFighter = getFighter(currentGameState, targetKey);
    
        if (targetFighter && targetFighter.isMultiPart) {
            showPartSelectionModal(targetingAttackerKey, targetFighter);
        } else {
            actionButtonsWrapper.querySelectorAll('button').forEach(b => b.disabled = true);
            socket.emit('playerAction', { type: 'attack', attackerKey: targetingAttackerKey, targetKey: targetKey });
            cancelTargeting();
        }
    }
    
    // --- CHEAT FUNCTIONS ---
    function showCheatModal() {
        let content = `<div class="cheat-menu">
            <button id="cheat-add-npc-btn" class="mode-btn">Adicionar Inimigo em Slot</button>
        </div>`;
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
                content += `<div class="npc-card cheat-npc-slot" data-slot-index="${i}">
                               ${npc ? `<img src="${npc.img}" style="filter: grayscale(100%);">` : ''}
                               <div class="char-name">${npc ? `${npc.nome} (Vago)` : `Slot Vazio ${i + 1}`}</div>
                           </div>`;
            } else {
                 content += `<div class="npc-card disabled">
                               <img src="${npc.img}">
                               <div class="char-name">${npc.nome} (Ocupado)</div>
                           </div>`;
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
                if (slotIndex !== undefined) {
                    selectNpcForSlot(slotIndex);
                }
            });
        });
    }

    function selectNpcForSlot(slotIndex) {
        let content = `<p>Selecione o novo inimigo para o Slot ${parseInt(slotIndex, 10) + 1}:</p>
                       <div class="npc-selection-container" style="max-height: 300px;">`;
        
        (ALL_CHARACTERS.npcs || []).forEach(npcData => {
            content += `<div class="npc-card cheat-npc-card" data-name="${npcData.name}" data-img="${npcData.img}" data-scale="${npcData.scale || 1.0}">
                           <img src="${npcData.img}" alt="${npcData.name}">
                           <div class="char-name">${npcData.name}</div>
                       </div>`;
        });
        content += `</div>`;
    
        showInfoModal('Selecionar Novo Inimigo', content, false);
        
        document.querySelectorAll('.cheat-npc-card').forEach(card => {
            card.addEventListener('click', () => {
                const newNpcData = {
                    name: card.dataset.name,
                    img: card.dataset.img,
                    scale: parseFloat(card.dataset.scale)
                };
                socket.emit('playerAction', { type: 'gmSetsNpcInSlot', slotIndex, npcData: newNpcData });
                modal.classList.add('hidden');
            });
        });
    }

    // --- POSICIONAMENTO LIVRE (GM) ---
    function makeFightersDraggable(isDraggable) {
        const fighters = document.querySelectorAll('#fight-screen .char-container');
        fighters.forEach(fighter => {
            if (isDraggable) {
                fighter.addEventListener('mousedown', onFighterMouseDown);
            } else {
                fighter.removeEventListener('mousedown', onFighterMouseDown);
            }
        });
        document.body.classList.toggle('is-draggable', isDraggable);
    }

    function onFighterMouseDown(e) {
        if (!isFreeMoveModeActive || e.button !== 0) return;
        draggedFighter.element = e.currentTarget;
        const rect = draggedFighter.element.getBoundingClientRect();
        const gameScale = getGameScale();
        draggedFighter.offsetX = (e.clientX - rect.left) / gameScale;
        draggedFighter.offsetY = (e.clientY - rect.top) / gameScale;
        window.addEventListener('mousemove', onFighterMouseMove);
        window.addEventListener('mouseup', onFighterMouseUp);
    }

    function onFighterMouseMove(e) {
        if (!draggedFighter.element) return;
        e.preventDefault();
        const gameWrapperRect = gameWrapper.getBoundingClientRect();
        const gameScale = getGameScale();
        const x = (e.clientX - gameWrapperRect.left) / gameScale - draggedFighter.offsetX;
        const y = (e.clientY - gameWrapperRect.top) / gameScale - draggedFighter.offsetY;
        draggedFighter.element.style.left = `${x}px`;
        draggedFighter.element.style.top = `${y}px`;
    }

    function onFighterMouseUp() {
        if (draggedFighter.element) {
            const fighterId = draggedFighter.element.id;
            const newPosition = {
                left: draggedFighter.element.style.left,
                top: draggedFighter.element.style.top
            };
            socket.emit('playerAction', { type: 'gmMovesFighter', fighterId: fighterId, position: newPosition });
        }
        draggedFighter.element = null;
        window.removeEventListener('mousemove', onFighterMouseMove);
        window.removeEventListener('mouseup', onFighterMouseUp);
    }
    
    function showHelpModal() {
        const content = `
            <div style="text-align: left; font-size: 1.2em; line-height: 1.8;">
                <p><b>C:</b> Abrir menu de Cheats (GM).</p>
                <p><b>T:</b> Mostrar/Ocultar coordenadas do mouse.</p>
                <p><b>J:</b> Ativar/Desativar modo de arrastar personagens (GM).</p>
            </div>
        `;
        showInfoModal("Atalhos do Teclado", content);
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
            if (currentGameState.mode === 'adventure' && isTargeting && e.key === 'Escape'){ cancelTargeting(); return; }
            
            const focusedEl = document.activeElement;
            if (focusedEl.tagName === 'INPUT' || focusedEl.tagName === 'TEXTAREA') return;
            
            if (e.key.toLowerCase() === 'c' && isGm && currentGameState.mode === 'adventure') {
                e.preventDefault();
                showCheatModal();
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
            const gameWrapperRect = gameWrapper.getBoundingClientRect();
            const gameScale = getGameScale();
            const mouseX = e.clientX;
            const mouseY = e.clientY;

            const gameX = Math.round((mouseX - gameWrapperRect.left) / gameScale);
            const gameY = Math.round((mouseY - gameWrapperRect.top) / gameScale);
            
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

    // --- LÓGICA DA FICHA DE PERSONAGEM (NOVO) ---
    function initializeCharacterSheet() {
        tempCharacterSheet = {
            name: '',
            class: '',
            race: 'Humano',
            tokenName: tempCharacterSheet.tokenName,
            tokenImg: tempCharacterSheet.tokenImg,
            baseAttributes: { forca: 0, agilidade: 0, protecao: 0, constituicao: 0, inteligencia: 0, mente: 0 },
            elements: { fogo: 0, agua: 0, terra: 0, vento: 0, luz: 0, escuridao: 0 },
            equipment: {
                weapon1: { name: '', type: 'Desarmado' },
                weapon2: { name: '', type: 'Desarmado' },
                armor: 'Nenhuma',
                shield: 'Nenhum'
            },
            money: 200,
        };

        // Popular selects
        const raceSelect = document.getElementById('sheet-race-select');
        raceSelect.innerHTML = Object.keys(GAME_RULES.races).map(r => `<option value="${r}">${r}</option>`).join('');

        const weaponSelects = [document.getElementById('sheet-weapon1-type'), document.getElementById('sheet-weapon2-type')];
        weaponSelects.forEach(sel => sel.innerHTML = Object.keys(GAME_RULES.weapons).map(w => `<option value="${w}">${w}</option>`).join(''));
        
        document.getElementById('sheet-armor-type').innerHTML = Object.keys(GAME_RULES.armors).map(a => `<option value="${a}">${a}</option>`).join('');
        document.getElementById('sheet-shield-type').innerHTML = Object.keys(GAME_RULES.shields).map(s => `<option value="${s}">${s}</option>`).join('');
        
        // Resetar campos
        document.getElementById('sheet-name').value = '';
        document.getElementById('sheet-class').value = '';
        document.querySelectorAll('.attributes-grid input').forEach(input => input.value = 0);

        updateCharacterSheet(); // Chamar para calcular os valores iniciais
    }

    function updateCharacterSheet() {
        const sheet = {}; // Objeto temporário para cálculos
        let infoText = "";
        
        // 1. Ler todos os inputs do jogador
        sheet.race = document.getElementById('sheet-race-select').value;
        sheet.baseAttributes = {
            forca: parseInt(document.getElementById('sheet-base-attr-forca').value) || 0,
            agilidade: parseInt(document.getElementById('sheet-base-attr-agilidade').value) || 0,
            protecao: parseInt(document.getElementById('sheet-base-attr-protecao').value) || 0,
            constituicao: parseInt(document.getElementById('sheet-base-attr-constituicao').value) || 0,
            inteligencia: parseInt(document.getElementById('sheet-base-attr-inteligencia').value) || 0,
            mente: parseInt(document.getElementById('sheet-base-attr-mente').value) || 0,
        };
        sheet.elements = {
            fogo: parseInt(document.getElementById('sheet-elem-fogo').value) || 0,
            agua: parseInt(document.getElementById('sheet-elem-agua').value) || 0,
            terra: parseInt(document.getElementById('sheet-elem-terra').value) || 0,
            vento: parseInt(document.getElementById('sheet-elem-vento').value) || 0,
            luz: parseInt(document.getElementById('sheet-elem-luz').value) || 0,
            escuridao: parseInt(document.getElementById('sheet-elem-escuridao').value) || 0,
        };
        sheet.equipment = {
            weapon1: GAME_RULES.weapons[document.getElementById('sheet-weapon1-type').value],
            weapon2: GAME_RULES.weapons[document.getElementById('sheet-weapon2-type').value],
            armor: GAME_RULES.armors[document.getElementById('sheet-armor-type').value],
            shield: GAME_RULES.shields[document.getElementById('sheet-shield-type').value]
        };
        
        // 2. Validar pontos
        const totalAttrPoints = Object.values(sheet.baseAttributes).reduce((a, b) => a + b, 0);
        const remainingAttrPoints = 5 - totalAttrPoints;
        document.getElementById('sheet-points-attr-remaining').textContent = remainingAttrPoints;
        if (remainingAttrPoints < 0) infoText += "Você gastou pontos de atributo a mais! ";

        const totalElemPoints = Object.values(sheet.elements).reduce((a, b) => a + b, 0);
        const remainingElemPoints = 2 - totalElemPoints;
        document.getElementById('sheet-points-elem-remaining').textContent = remainingElemPoints;
        if (remainingElemPoints < 0) infoText += "Você gastou pontos de elemento a mais! ";

        // 3. Calcular atributos finais (com bônus/penalidades)
        const raceData = GAME_RULES.races[sheet.race];
        sheet.finalAttributes = { ...sheet.baseAttributes };
        for (const attr in raceData.bon) { if (attr !== 'escolha') sheet.finalAttributes[attr] += raceData.bon[attr]; }
        for (const attr in raceData.pen) { sheet.finalAttributes[attr] += raceData.pen[attr]; }
        // Penalidades de equipamento
        sheet.finalAttributes.agilidade += sheet.equipment.armor.agility_pen;
        sheet.finalAttributes.agilidade += sheet.equipment.shield.agility_pen;

        // 4. Calcular HP e Mahou
        sheet.hpMax = 20 + (sheet.finalAttributes.constituicao * 5);
        sheet.mahouMax = 10 + (sheet.finalAttributes.mente * 5);

        // 5. Lógica e custo de equipamentos
        let totalCost = sheet.equipment.weapon1.cost + sheet.equipment.weapon2.cost + sheet.equipment.armor.cost + sheet.equipment.shield.cost;
        let money = 200 - totalCost;
        if (money < 0) infoText += `Dinheiro insuficiente! Custo: ${totalCost}, Você tem: 200. `;
        
        const w1type = document.getElementById('sheet-weapon1-type').value;
        const w2type = document.getElementById('sheet-weapon2-type').value;
        const shieldtype = document.getElementById('sheet-shield-type').value;
        const w1Data = GAME_RULES.weapons[w1type];
        const w2Data = GAME_RULES.weapons[w2type];
        const shieldData = GAME_RULES.shields[shieldtype];

        // Regras de bloqueio de slots
        const w2Select = document.getElementById('sheet-weapon2-type');
        const shieldSelect = document.getElementById('sheet-shield-type');

        if (w1Data.hand === 2 || shieldtype !== 'Nenhum') {
            w2Select.disabled = true;
            if (w2Select.value !== 'Desarmado') w2Select.value = 'Desarmado';
        } else {
            w2Select.disabled = false;
        }

        if (w1Data.hand === 2 || w2type !== 'Desarmado') {
            shieldSelect.disabled = true;
            if (shieldSelect.value !== 'Nenhum') shieldSelect.value = 'Nenhum';
        } else {
            shieldSelect.disabled = false;
        }
        
        // Requisito de força para escudo
        if (sheet.finalAttributes.forca < shieldData.req_forca) {
             infoText += `Você precisa de ${shieldData.req_forca} de Força para usar um Escudo ${shieldtype}. `;
        }
        // Regra de 2 mãos com 1 mão
        let isW1OneHanded2H = w1Data.hand === 2 && sheet.finalAttributes.forca >= 4;
        let isW2OneHanded2H = w2Data.hand === 2 && sheet.finalAttributes.forca >= 4;
        if(w1Data.hand === 2 && w2Data.hand === 2 && sheet.finalAttributes.forca < 4) {
             infoText += `Você precisa de 4 de Força para usar duas armas de 2 mãos. `;
        }


        // 6. Calcular BTA, BTD, BTM
        const isAmbidextrous = w1type !== 'Desarmado' && w2type !== 'Desarmado';
        
        let bta = sheet.finalAttributes.agilidade;
        let btd = sheet.finalAttributes.forca;
        let btm = sheet.finalAttributes.inteligencia;

        // Arma 1
        bta += isAmbidextrous ? (w1Data.bta + (w1Data.ambi_bta_mod || 0)) : w1Data.bta;
        btd += isAmbidextrous ? (w1Data.btd + (w1Data.ambi_btd_mod || 0)) : w1Data.btd;
        btm += w1Data.btm || 0;
        if(isW1OneHanded2H && !isAmbidextrous) bta += w1Data.one_hand_bta_mod || 0;

        // Arma 2 (só contribui para BTM se for a única arma mágica)
        if(isAmbidextrous) {
            btm += (w2Data.btm || 0) > (w1Data.btm || 0) ? (w2Data.btm || 0) : 0;
        } else {
             btm += w2Data.btm || 0;
        }
        
        // Penalidades de Armadura e Escudo
        bta += sheet.equipment.armor.agility_pen;
        bta += sheet.equipment.shield.agility_pen;
        
        // 7. Renderizar tudo na UI
        document.getElementById('sheet-final-attr-forca').textContent = sheet.finalAttributes.forca;
        document.getElementById('sheet-final-attr-agilidade').textContent = sheet.finalAttributes.agilidade;
        document.getElementById('sheet-final-attr-protecao').textContent = sheet.finalAttributes.protecao;
        document.getElementById('sheet-final-attr-constituicao').textContent = sheet.finalAttributes.constituicao;
        document.getElementById('sheet-final-attr-inteligencia').textContent = sheet.finalAttributes.inteligencia;
        document.getElementById('sheet-final-attr-mente').textContent = sheet.finalAttributes.mente;
        
        document.getElementById('sheet-hp-max').textContent = sheet.hpMax;
        document.getElementById('sheet-hp-current').textContent = sheet.hpMax;
        document.getElementById('sheet-mahou-max').textContent = sheet.mahouMax;
        document.getElementById('sheet-mahou-current').textContent = sheet.mahouMax;

        document.getElementById('race-info-box').textContent = raceData.text;
        document.getElementById('equipment-info-text').textContent = infoText || 'Tudo certo com seus equipamentos.';
        document.getElementById('sheet-money-copper').textContent = Math.max(0, money);

        document.getElementById('sheet-bta').textContent = (bta >= 0 ? '+' : '') + bta;
        document.getElementById('sheet-btd').textContent = (btd >= 0 ? '+' : '') + btd;
        document.getElementById('sheet-btm').textContent = (btm >= 0 ? '+' : '') + btm;
    }

    function handleSaveCharacter() {
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
                
                // Preencher a ficha
                tempCharacterSheet.tokenName = sheetData.tokenName;
                tempCharacterSheet.tokenImg = sheetData.tokenImg;
                
                initializeCharacterSheet(); // Reseta e popula selects

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
        // Coletar dados finais da ficha para enviar ao servidor
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
        };
        socket.emit('playerAction', { type: 'playerFinalizesCharacter', characterData: finalSheet });
        showScreen(document.getElementById('player-waiting-screen'));
        document.getElementById('player-waiting-message').innerText = "Personagem enviado! Aguardando o Mestre...";
    }
    
    function renderGame(gameState) {
        scaleGame(); 
        
        const justEnteredTheater = gameState.mode === 'theater' && (!currentGameState || currentGameState.mode !== 'theater');
        oldGameState = currentGameState;
        currentGameState = gameState;

        if (!gameState || !gameState.mode || !gameState.connectedPlayers) {
            showScreen(document.getElementById('loading-screen'));
            return;
        }

        if(gameState.mode === 'adventure' && gameState.customPositions){
            customFighterPositions = gameState.customPositions;
        }

        const myPlayerData = gameState.connectedPlayers?.[socket.id];
        
        // Lógica de fluxo de tela do jogador
        if (myRole === 'player' && !myPlayerData.characterFinalized) {
            // Se o jogador ainda não finalizou a ficha, mantenha-o no fluxo de criação
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
        if (clientFlowState === 'choosing_role') return;
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

        if (myRole === 'player') {
             // Inicia o novo fluxo de criação de personagem
            showScreen(document.getElementById('player-initial-choice-screen'));
        }
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
            const originalLeft = attackerEl.style.left;
            const lungeAmount = isPlayer ? 200 : -200;
            
            attackerEl.style.left = `${parseFloat(originalLeft) + lungeAmount}px`;
            
            setTimeout(() => {
                attackerEl.style.left = originalLeft;
            }, 500);
        }

        if (targetEl && hit) {
            const img = targetEl.querySelector('.fighter-img-ingame');
            if (img) {
                img.classList.add('is-hit-flash');
                setTimeout(() => img.classList.remove('is-hit-flash'), 400);
            }
        }
    });
    
    socket.on('fleeResolved', ({ actorKey }) => {
        const actorEl = document.getElementById(actorKey);
        if (actorEl) {
            const isPlayer = actorEl.classList.contains('player-char-container');
            actorEl.classList.add(isPlayer ? 'is-fleeing-player' : 'is-fleeing-npc');
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

        // Lógica de escolha de papel
        document.getElementById('join-as-player-btn').addEventListener('click', () => {
            socket.emit('playerChoosesRole', { role: 'player' });
            // Não muda de tela aqui, espera a resposta do servidor com 'assignRole'
        });
        document.getElementById('join-as-spectator-btn').addEventListener('click', () => {
            socket.emit('playerChoosesRole', { role: 'spectator' });
            showScreen(document.getElementById('loading-screen'));
        });

        // Lógica do novo fluxo de criação
        document.getElementById('new-char-btn').addEventListener('click', () => {
            showScreen(document.getElementById('selection-screen'));
            renderPlayerTokenSelection();
        });
        document.getElementById('load-char-btn').addEventListener('click', () => {
            document.getElementById('load-char-input').click();
        });
        document.getElementById('load-char-input').addEventListener('change', handleLoadCharacter);

        // Lógica da ficha
        document.querySelectorAll('#character-sheet-screen input, #character-sheet-screen select').forEach(el => {
            el.addEventListener('change', updateCharacterSheet);
            el.addEventListener('input', updateCharacterSheet);
        });
        document.getElementById('sheet-save-btn').addEventListener('click', handleSaveCharacter);
        document.getElementById('sheet-confirm-btn').addEventListener('click', handleConfirmCharacter);

        // Botões do GM
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
        
        if (floatingHelpBtn) {
            floatingHelpBtn.addEventListener('click', showHelpModal);
        }

        setupTheaterEventListeners();
        initializeGlobalKeyListeners();
        window.addEventListener('resize', scaleGame);
        scaleGame();
    }
    
    initialize();
});