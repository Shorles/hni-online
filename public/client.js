// client.js

document.addEventListener('DOMContentLoaded', () => {
    // --- VARIÁVEIS DE REGRAS DO JOGO (CARREGADAS DE JSON) ---
    let GAME_RULES = {};
    let ALL_SPELLS = {};
    let ALL_WEAPON_IMAGES = {};
    let ALL_ITEMS = {}; 
    let ALL_PLAYER_IMAGES = [];
    let ALL_SUMMONS = {};
    let LEVEL_UP_TABLE = {};

    // --- VARIÁVEIS DE ESTADO ---
    let myRole = null, myPlayerKey = null, isGm = false;
    let currentGameState = null, oldGameState = null;
    let defeatAnimationPlayed = new Set();
    const socket = io();
    let myRoomId = null; 
    let coordsModeActive = false;
    let clientFlowState = 'initializing';
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
    let originalEquipmentState = null;
    let stagedCharacterSheet = {}; 
    let shopStagedItems = {}; 
    let isShopOpen = false;
    let stagedLevelUpChanges = {};
    let isRacePreviewFixed = false;
    let characterSheetCheatActive = false;
    
    // --- ELEMENTOS DO DOM ---
    const allScreens = document.querySelectorAll('.screen');
    const gameWrapper = document.getElementById('game-wrapper');
    const fightScreen = document.getElementById('fight-screen');
    const fightSceneCharacters = document.getElementById('fight-scene-characters');
    const actionButtonsWrapper = document.getElementById('action-buttons-wrapper');
    const theaterBackgroundViewport = document.getElementById('theater-background-viewport');
    const theaterBackgroundImage = document.getElementById('theater-background-image');
    const theaterTokenContainer = document.getElementById('theater-token-container');
    const theaterWorldContainer = document.getElementById('theater-world-container');
    const theaterCharList = document.getElementById('theater-char-list');
    const theaterGlobalScale = document.getElementById('theater-global-scale');
    const theaterSkillCheckButtons = document.getElementById('theater-skill-check-buttons');
    const initiativeUI = document.getElementById('initiative-ui');
    const modal = document.getElementById('modal');
    const shopModal = document.getElementById('shop-modal'); 
    const weaponImageModal = document.getElementById('weapon-image-modal');
    const selectionBox = document.getElementById('selection-box');
    const turnOrderSidebar = document.getElementById('turn-order-sidebar');
    const floatingButtonsContainer = document.getElementById('floating-buttons-container');
    const floatingInviteBtn = document.getElementById('floating-invite-btn');
    const floatingSwitchModeBtn = document.getElementById('floating-switch-mode-btn');
    const floatingHelpBtn = document.getElementById('floating-help-btn');
    const waitingPlayersSidebar = document.getElementById('waiting-players-sidebar');
    const backToLobbyBtn = document.getElementById('back-to-lobby-btn');
    const coordsDisplay = document.getElementById('coords-display');
    const playerInfoWidget = document.getElementById('player-info-widget');
    const ingameSheetModal = document.getElementById('ingame-sheet-modal');
    const racePreviewModal = document.getElementById('race-preview-modal');

    // =============================================================
    // =========== DECLARAÇÃO DE TODAS AS FUNÇÕES ==================
    // =============================================================

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
    function showCustomModal(title, contentHtml, buttons, modalClass = '') {
        const modalContent = document.getElementById('modal-content');
        modalContent.className = 'modal-content'; // Reset class
        if(modalClass) modalContent.classList.add(modalClass);

        document.getElementById('modal-title').innerHTML = title;
        document.getElementById('modal-text').innerHTML = contentHtml;
        document.getElementById('modal-button').classList.add('hidden');
        
        const oldButtons = modalContent.querySelector('.modal-button-container');
        if (oldButtons) oldButtons.remove();

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'modal-button-container';

        buttons.forEach(btnInfo => {
            const button = document.createElement('button');
            button.textContent = btnInfo.text;
            button.className = btnInfo.className || '';
            if (btnInfo.className === 'disabled-btn') {
                button.disabled = true;
            }
            button.onclick = () => {
                if(button.disabled) return;
                if (btnInfo.onClick) btnInfo.onClick();
                if (btnInfo.closes) modal.classList.add('hidden');
            };
            buttonContainer.appendChild(button);
        });
        
        modalContent.appendChild(buttonContainer);
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
        document.querySelectorAll('.char-container.target-highlight').forEach(el => el.classList.remove('target-highlight'));
        updateTargetableStatus();
    }
    function getFighter(state, key) {
        if (!state || !key) return null;
    
        const playerLobbyData = state.connectedPlayers?.[key];
        const lobbySheet = playerLobbyData?.characterSheet;
        const fighterInBattle = state.fighters?.players[key] || state.fighters?.npcs[key] || state.fighters?.summons[key];
    
        if (fighterInBattle) {
            // Unifica a ficha do lobby com a ficha da batalha para ter os dados mais recentes
            const finalSheet = fighterInBattle.isPlayer ? { ...fighterInBattle.sheet, ...lobbySheet } : fighterInBattle.sheet;
            return { ...fighterInBattle, sheet: finalSheet };
        }
    
        if (lobbySheet) {
            const constituicao = lobbySheet.finalAttributes?.constituicao || 0;
            const mente = lobbySheet.finalAttributes?.mente || 0;
            const hpMax = 20 + (constituicao * 5);
            const mahouMax = 10 + (mente * 5);
    
            return {
                id: key,
                nome: lobbySheet.name,
                img: lobbySheet.tokenImg,
                isPlayer: true,
                sheet: lobbySheet,
                hp: lobbySheet.hp !== undefined ? lobbySheet.hp : hpMax,
                hpMax: hpMax,
                mahou: lobbySheet.mahou !== undefined ? lobbySheet.mahou : mahouMax,
                mahouMax: mahouMax,
                money: lobbySheet.money,
                inventory: lobbySheet.inventory,
                ammunition: lobbySheet.ammunition,
                ...lobbySheet
            };
        }
    
        return null;
    }
    
    // --- LÓGICA DA FICHA/INVENTÁRIO EM JOGO ---
    function showItemContextMenu(item) {
        if (ingameSheetModal.classList.contains('gm-view-mode')) {
            const itemDetails = ALL_ITEMS[item.name] || {};
            const effectiveDetails = { ...itemDetails, img: item.img || itemDetails.img, description: itemDetails.description || `Tipo: ${item.type}` };
            let content = `
                <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 10px;">
                    <div class="inventory-slot item" style="background-image: url('${effectiveDetails.img}'); margin: 0; flex-shrink: 0;"></div>
                    <div>
                        <h4 style="margin: 0 0 5px 0;">${item.name}</h4>
                        <p style="margin: 0; color: #ccc;">${effectiveDetails.description}</p>
                    </div>
                </div>`;
            showCustomModal(item.name, content, [{ text: 'OK', closes: true }]);
            return;
        }

        const itemDetails = ALL_ITEMS[item.name] || {};
        const effectiveDetails = {
            ...itemDetails,
            img: item.img || itemDetails.img,
            description: itemDetails.description || `Tipo: ${item.type}`,
            isUsable: itemDetails.isUsable || false
        };
    
        let content = `
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 10px;">
                <div class="inventory-slot item" style="background-image: url('${effectiveDetails.img}'); margin: 0; flex-shrink: 0;"></div>
                <div>
                    <h4 style="margin: 0 0 5px 0;">${item.name}</h4>
                    <p style="margin: 0; color: #ccc;">${effectiveDetails.description}</p>
                </div>
            </div>`;
    
        const buttons = [];
    
        if (effectiveDetails.isUsable) {
            const costPA = effectiveDetails.costPA || 3;
            buttons.push({
                text: `Usar`,
                closes: false,
                onClick: () => {
                    const myFighter = getFighter(currentGameState, myPlayerKey);
                    if (!myFighter) return;
    
                    if (currentGameState.mode === 'adventure') {
                        if (currentGameState.activeCharacterKey !== myPlayerKey) {
                            showInfoModal("Ação Bloqueada", "Você só pode usar itens no seu turno.");
                            return;
                        }
                        if (myFighter.pa < costPA) {
                            showInfoModal("PA Insuficiente", `Você precisa de ${costPA} PA para usar este item, mas só tem ${myFighter.pa}.`);
                            return;
                        }
                        showCustomModal(
                            "Confirmar Uso de Item",
                            `Usar <strong>${item.name}</strong> custará ${costPA} Pontos de Ação. Deseja continuar?`,
                            [
                                { text: 'Sim, Confirmar', closes: true, onClick: () => {
                                    socket.emit('playerAction', { type: 'useItem', actorKey: myPlayerKey, itemName: item.name });
                                    document.getElementById('ingame-sheet-modal').classList.add('hidden');
                                }},
                                { text: 'Cancelar', closes: true, className: 'btn-danger' }
                            ]
                        );
                    } else {
                        socket.emit('playerAction', { type: 'useItem', actorKey: myPlayerKey, itemName: item.name });
                        modal.classList.add('hidden');
                        document.getElementById('ingame-sheet-modal').classList.add('hidden');
                    }
                }
            });
        }
        
        buttons.push({
            text: 'Descartar',
            closes: false, 
            className: 'btn-danger',
            onClick: () => {
                showCustomModal('Confirmar Descarte', `Você tem certeza que deseja descartar <strong>${item.name}</strong>? Esta ação não pode ser desfeita.`, [
                    {
                        text: 'Sim, Descartar',
                        closes: true,
                        className: 'btn-danger',
                        onClick: () => {
                             socket.emit('playerAction', { type: 'discardItem', itemName: item.name });
                             const fighter = getFighter(currentGameState, myPlayerKey);
                             if(fighter && fighter.sheet.inventory[item.name]) {
                                delete fighter.sheet.inventory[item.name];
                                renderIngameInventory(fighter);
                             }
                        }
                    },
                    { text: 'Não', closes: true, className: 'btn-secondary' }
                ]);
            }
        });
    
        buttons.push({ text: 'Cancelar', closes: true, className: 'btn-secondary' });
        
        showCustomModal(item.name, content, buttons);
    }
    
    function renderIngameInventory(fighter, isGmView = false) {
        if (!fighter || !fighter.sheet) return;
    
        const inventory = fighter.inventory || {};
        const inventoryGrid = document.getElementById('inventory-grid');
        inventoryGrid.innerHTML = '';
        const MAX_SLOTS = 24;
    
        const weapon1 = document.getElementById('ingame-sheet-weapon1-type').value;
        const weapon2 = document.getElementById('ingame-sheet-weapon2-type').value;
        const armor = document.getElementById('ingame-sheet-armor-type').value;
        const shield = document.getElementById('ingame-sheet-shield-type').value;
        const equippedItemNames = [weapon1, weapon2, armor, shield];
    
        const itemsToDisplay = Object.values(inventory).filter(item => !equippedItemNames.includes(item.name));
    
        const isAdventureMode = currentGameState.mode === 'adventure';
        const isMyTurn = isAdventureMode && currentGameState.activeCharacterKey === myPlayerKey;
        const canInteract = !isGmView && (!isAdventureMode || isMyTurn);
    
        itemsToDisplay.forEach(item => {
            const slot = document.createElement('div');
            slot.className = 'inventory-slot';
            
            const itemDetails = ALL_ITEMS[item.name];
            slot.title = `${item.name}\n${itemDetails ? itemDetails.description : `Tipo: ${item.type || 'Equipamento'}`}`;
            
            const imgPath = item.img || (itemDetails ? itemDetails.img : null);
            if (imgPath) {
                slot.style.backgroundImage = `url("${imgPath}")`;
            } else {
                 slot.style.backgroundImage = 'none';
            }
    
            if (item.quantity > 1) {
                slot.innerHTML = `<span class="item-quantity">${item.quantity}</span>`;
            }
            
            if (canInteract) {
                slot.classList.add('item');
                slot.addEventListener('click', () => showItemContextMenu(item));
            } else {
                slot.style.cursor = 'not-allowed';
            }
    
            inventoryGrid.appendChild(slot);
        });
    
        const filledSlots = itemsToDisplay.length;
        for (let i = 0; i < MAX_SLOTS - filledSlots; i++) {
            const emptySlot = document.createElement('div');
            emptySlot.className = 'inventory-slot';
            inventoryGrid.appendChild(emptySlot);
        }
    }

    function toggleIngameSheet() {
        const modal = document.getElementById('ingame-sheet-modal');
        if (!modal || !currentGameState) return;
    
        const isHidden = modal.classList.contains('hidden');
        if (isHidden) {
            const myFighterData = getFighter(currentGameState, myPlayerKey);
            if (!myFighterData) return;
            originalEquipmentState = JSON.parse(JSON.stringify(myFighterData.sheet.equipment));
            populateIngameSheet(myFighterData);
            modal.classList.remove('hidden');
        } else {
            if (!ingameSheetModal.classList.contains('gm-view-mode')) {
                handleEquipmentChangeConfirmation();
            }
            handlePointDistributionConfirmation();
        }
    }
    
    function populateIngameSheet(fighter, isGmView = false) {
        if (!fighter || !fighter.sheet) return;

        ingameSheetModal.classList.toggle('gm-view-mode', isGmView);
        document.getElementById('gm-edit-inventory-btn').classList.toggle('hidden', !isGmView);
    
        const isAdventureMode = currentGameState.mode === 'adventure';
        const isMyTurn = isAdventureMode && currentGameState.activeCharacterKey === myPlayerKey;
        const canEditEquipment = !isGmView && (!isAdventureMode || isMyTurn);
        
        const loadBtn = document.getElementById('ingame-sheet-load-btn');
        loadBtn.disabled = isAdventureMode;
        loadBtn.title = isAdventureMode ? 'Não é possível carregar um personagem durante o combate.' : 'Carregar Ficha';

        document.getElementById('ingame-sheet-name').textContent = fighter.sheet.name || fighter.nome;
        const tokenImg = fighter.sheet.tokenImg;
        document.getElementById('ingame-sheet-token').style.backgroundImage = tokenImg ? `url("${tokenImg}")` : 'none';
        
        document.getElementById('ingame-sheet-hp-current').textContent = fighter.hp;
        document.getElementById('ingame-sheet-hp-max').textContent = fighter.hpMax;
        document.getElementById('ingame-sheet-mahou-current').textContent = fighter.mahou;
        document.getElementById('ingame-sheet-mahou-max').textContent = fighter.mahouMax;
        document.getElementById('ingame-sheet-level').textContent = fighter.level || 1;
        document.getElementById('ingame-sheet-xp').textContent = fighter.xp || 0;
        document.getElementById('ingame-sheet-xp-needed').textContent = fighter.xpNeeded || 100;
        document.getElementById('ingame-sheet-money').textContent = fighter.money !== undefined ? fighter.money : 0;
    
        const equipment = fighter.sheet.equipment;
        
        const weapon1Select = document.getElementById('ingame-sheet-weapon1-type');
        const weapon2Select = document.getElementById('ingame-sheet-weapon2-type');
        const armorSelect = document.getElementById('ingame-sheet-armor-type');
        const shieldSelect = document.getElementById('ingame-sheet-shield-type');
    
        const allEquipmentSelectors = [weapon1Select, weapon2Select, armorSelect, shieldSelect];
        allEquipmentSelectors.forEach(sel => sel.onchange = null);

        weapon1Select.disabled = !canEditEquipment;
        weapon2Select.disabled = !canEditEquipment;
        armorSelect.disabled = !canEditEquipment;
        shieldSelect.disabled = !canEditEquipment;
    
        const updateAllEquipment = (eventSource) => {
            const inventory = fighter.inventory || {};
            const forca = (fighter.sheet.finalAttributes || {}).forca || 0;
            let infoText = '';

            const checkAndHandleRequirement = (itemName, itemType, itemSelect, defaultOption) => {
                const item = inventory[itemName] || {};
                const itemBaseType = item.baseType || itemName;
                const ruleSet = GAME_RULES[item.type === 'weapon' ? 'weapons' : item.type + 's'] || {};
                const itemData = ruleSet[itemBaseType] || {};
                
                if (itemData.req_forca && forca < itemData.req_forca) {
                    if (itemSelect.value !== defaultOption) {
                        showInfoModal("Requisito não atendido", `Você precisa de ${itemData.req_forca} de Força para usar ${itemName}.`);
                        itemSelect.value = defaultOption;
                        return true;
                    }
                }
                return false;
            };

            if (checkAndHandleRequirement(weapon1Select.value, 'weapons', weapon1Select, 'Desarmado')) return updateAllEquipment(null);
            if (checkAndHandleRequirement(weapon2Select.value, 'weapons', weapon2Select, 'Desarmado')) return updateAllEquipment(null);
            if (checkAndHandleRequirement(shieldSelect.value, 'shields', shieldSelect, 'Nenhum')) return updateAllEquipment(null);

            
            let selectedW1 = weapon1Select.value;
            let weapon1Item = inventory[selectedW1] || {};
            let weapon1BaseType = weapon1Item.baseType || (selectedW1 === 'Desarmado' ? 'Desarmado' : null);
            let weapon1Data = GAME_RULES.weapons[weapon1BaseType] || {};
            
            let selectedW2 = weapon2Select.value;
            let weapon2Item = inventory[selectedW2] || {};
            let weapon2BaseType = weapon2Item.baseType || (selectedW2 === 'Desarmado' ? 'Desarmado' : null);
            let weapon2Data = GAME_RULES.weapons[weapon2BaseType] || {};

            const canWield2HInOneHand = forca >= 4;
            let changed = false;

            if (weapon1Data.hand === 2 && !canWield2HInOneHand) {
                if (weapon2Select.value !== 'Desarmado') { weapon2Select.value = 'Desarmado'; changed = true; }
                if (shieldSelect.value !== 'Nenhum') { shieldSelect.value = 'Nenhum'; changed = true; }
            }
            if (weapon2Data.hand === 2 && !canWield2HInOneHand) {
                if (weapon1Select.value !== 'Desarmado') { weapon1Select.value = 'Desarmado'; changed = true; }
                if (shieldSelect.value !== 'Nenhum') { shieldSelect.value = 'Nenhum'; changed = true; }
            }
            
            if (weapon2Select.value !== 'Desarmado' && shieldSelect.value !== 'Nenhum') {
                shieldSelect.value = 'Nenhum';
                changed = true;
            }

            if (shieldSelect.value !== 'Nenhum' && weapon2Select.value !== 'Desarmado') {
                 weapon2Select.value = 'Desarmado';
                 changed = true;
            }

            if (weapon1Select.value !== 'Desarmado' && weapon1Select.value === weapon2Select.value) {
                if (eventSource === weapon1Select) {
                    weapon2Select.value = 'Desarmado';
                } else {
                    weapon1Select.value = 'Desarmado';
                }
                changed = true;
            }

            if (changed) {
                updateAllEquipment(null); 
                return;
            }

            const finalW1 = weapon1Select.value;
            const finalW2 = weapon2Select.value;
            const finalShield = shieldSelect.value;
            const finalW1Item = inventory[finalW1] || {};
            const finalW1BaseType = finalW1Item.baseType || (finalW1 === 'Desarmado' ? 'Desarmado' : null);
            const finalW1Data = GAME_RULES.weapons[finalW1BaseType] || {};

            weapon2Select.disabled = !canEditEquipment || (finalW1Data.hand === 2 && !canWield2HInOneHand) || finalShield !== 'Nenhum';
            shieldSelect.disabled = !canEditEquipment || finalW2 !== 'Desarmado' || (finalW1Data.hand === 2 && !canWield2HInOneHand);

            document.getElementById('ingame-sheet-weapon1-image').style.backgroundImage = finalW1Item.img ? `url("${finalW1Item.img}")` : 'none';
            document.getElementById('ingame-sheet-weapon2-image').style.backgroundImage = (inventory[finalW2] || {}).img ? `url("${(inventory[finalW2] || {}).img}")` : 'none';
            document.getElementById('ingame-equipment-info-text').textContent = infoText;
            renderIngameInventory(fighter, isGmView);
        };
        
        const populateAllSelects = () => {
            const inventory = fighter.inventory || {};
            const forca = (fighter.sheet.finalAttributes || {}).forca || 0;
            
            const populate = (selectEl, itemType, nullOption) => {
                selectEl.innerHTML = '';
                const items = Object.values(inventory).filter(item => item.type === itemType);
    
                const noneOpt = document.createElement('option');
                noneOpt.value = nullOption;
                noneOpt.textContent = nullOption;
                selectEl.appendChild(noneOpt);
    
                items.forEach(item => {
                    const opt = document.createElement('option');
                    opt.value = item.name;
                    opt.textContent = (item.name === item.baseType || !item.baseType) ? item.name : `${item.name} (${item.baseType})`;
                    
                    const ruleDataKey = item.baseType || item.name;
                    const ruleSet = GAME_RULES[item.type === 'weapon' ? 'weapons' : item.type + 's'] || {};
                    const ruleData = ruleSet[ruleDataKey];

                    if (ruleData && ruleData.req_forca && forca < ruleData.req_forca) {
                        opt.disabled = true;
                        opt.textContent += ` (Força ${ruleData.req_forca} necessária)`;
                    }

                    selectEl.appendChild(opt);
                });
            };
            populate(weapon1Select, 'weapon', 'Desarmado');
            populate(weapon2Select, 'weapon', 'Desarmado');
            populate(armorSelect, 'armor', 'Nenhuma');
            populate(shieldSelect, 'shield', 'Nenhum');
        };
        
        populateAllSelects();
        
        weapon1Select.value = equipment.weapon1?.name || 'Desarmado';
        weapon2Select.value = equipment.weapon2?.name || 'Desarmado';
        armorSelect.value = equipment.armor || 'Nenhuma';
        shieldSelect.value = equipment.shield || 'Nenhum';
        
        allEquipmentSelectors.forEach(sel => {
            sel.onchange = (event) => updateAllEquipment(event.target);
        });

        updateAllEquipment(null);
    
        const attributesGrid = document.getElementById('ingame-sheet-attributes');
        attributesGrid.innerHTML = '';
        attributesGrid.classList.remove('is-distributing');
        const finalAttributes = fighter.sheet.finalAttributes || {};
        const baseAttributes = fighter.sheet.baseAttributes || {};
        for (const attr in finalAttributes) {
            const capitalized = attr.charAt(0).toUpperCase() + attr.slice(1).replace('cao', 'ção');
            attributesGrid.innerHTML += `
                <div class="attr-item point-distribution-grid" data-attr-container="${attr}">
                    <label>${capitalized}</label>
                    <span data-attr-span="${attr}">${finalAttributes[attr]}</span>
                    <div class="number-input-wrapper hidden" data-attr-wrapper="${attr}">
                        <button class="arrow-btn down-arrow" disabled>-</button>
                        <input type="number" data-attr="${attr}" value="${baseAttributes[attr]}" readonly>
                        <button class="arrow-btn up-arrow">+</button>
                    </div>
                </div>`;
        }
    
        const elementsGrid = document.getElementById('ingame-sheet-elements');
        elementsGrid.innerHTML = '';
        elementsGrid.classList.remove('is-distributing');
        const allElements = ['fogo', 'agua', 'terra', 'vento', 'luz', 'escuridao'];
        const elements = fighter.sheet.elements || {};
        allElements.forEach(elem => {
            const capitalized = elem.charAt(0).toUpperCase() + elem.slice(1).replace('ao', 'ão');
            const elemValue = elements[elem] || 0;
            elementsGrid.innerHTML += `
                <div class="attr-item point-distribution-grid" data-elem-container="${elem}">
                    <label>${capitalized}</label>
                    <span data-elem-span="${elem}">${elemValue}</span>
                     <div class="number-input-wrapper hidden" data-elem-wrapper="${elem}">
                        <button class="arrow-btn down-arrow" disabled>-</button>
                        <input type="number" data-elem="${elem}" value="${elemValue}" readonly>
                        <button class="arrow-btn up-arrow">+</button>
                    </div>
                </div>`;
        });
        
        const spellsGrid = document.getElementById('ingame-sheet-spells-grid');
        spellsGrid.innerHTML = '';
        const spells = fighter.sheet.spells || [];
        const allSpells = [...(ALL_SPELLS.grade1 || []), ...(ALL_SPELLS.grade2 || []), ...(ALL_SPELLS.grade3 || []), ...(ALL_SPELLS.advanced_grade1 || []), ...(ALL_SPELLS.advanced_grade2 || []), ...(ALL_SPELLS.advanced_grade3 || []), ...(ALL_SPELLS.grade_combined || [])];
        
        if (spells.length > 0) {
            spells.forEach(spellName => {
                const spellData = allSpells.find(s => s.name === spellName);
                if(spellData) {
                    const card = document.createElement('div');
                    card.className = 'spell-card ingame-spell';
                    
                    const isUsableOutside = (spellData.inCombat === false || spellData.usableOutsideCombat === true);
                    if (isUsableOutside && !isGmView) {
                        card.classList.add('usable-outside-combat');
                        card.addEventListener('click', () => handleUtilitySpellClick(spellData));
                    }
                    card.dataset.spellName = spellData.name;
                    const spellType = spellData.inCombat ? '(Combate)' : '(Utilitário)';

                    let elementHtml;
                    if (spellData.combinedElementName) {
                        const colors = getElementColors(spellData.combinedElementName, spellData.requiredElements);
                        elementHtml = `<span class="spell-element" style="background-image: ${colors};">${spellData.combinedElementName}</span>`;
                    } else {
                        const elementName = spellData.isAdvanced ? GAME_RULES.advancedElements[spellData.element] : spellData.element;
                        const color = getElementColors(elementName);
                        const capitalizedElement = elementName.charAt(0).toUpperCase() + elementName.slice(1);
                        elementHtml = `<span class="spell-element" style="background-image: ${color};">${capitalizedElement}</span>`;
                    }

                    card.innerHTML = `
                        <div class="spell-card-header">
                            <h4>${spellData.name} <small>${spellType}</small></h4>
                            <div class="spell-details">
                                ${elementHtml}
                                <span class="spell-cost">${spellData.costMahou} Mahou</span>
                            </div>
                        </div>
                        <p>${spellData.description}</p>`;
                    spellsGrid.appendChild(card);
                }
            });
        } else {
            spellsGrid.innerHTML = `<p style="color: #888; text-align: center; grid-column: 1 / -1;">Nenhuma magia conhecida.</p>`;
        }
        
        const ammoContainer = document.getElementById('ingame-sheet-ammunition');
        const ammoList = document.getElementById('ingame-sheet-ammo-list');
        ammoList.innerHTML = '';
        const ammunition = fighter.ammunition;
        let hasRangedWeapon = false;
        
        ['weapon1', 'weapon2'].forEach(slot => {
            if (fighter.sheet.equipment[slot] && fighter.sheet.equipment[slot].isRanged) {
                hasRangedWeapon = true;
            }
        });

        ammoList.innerHTML = `<div class="ammo-item"><span>Munição:</span><span>${ammunition || 0}</span></div>`;
        ammoContainer.classList.toggle('hidden', !hasRangedWeapon);
        
        renderLevelUpDistribution(fighter);
    }
    
    function handleUtilitySpellClick(spell) {
        if (ingameSheetModal.classList.contains('gm-view-mode')) return;

        if (spell.targetType === 'utility' || spell.targetType === 'self') {
            socket.emit('playerAction', {
                type: 'useUtilitySpell',
                casterId: myPlayerKey,
                targetId: myPlayerKey,
                spellName: spell.name
            });
            ingameSheetModal.classList.add('hidden');
            return;
        }

        if (spell.targetType === 'single_ally' || spell.targetType === 'single_ally_down') {
            let content = `<p>Selecione o alvo para <strong>${spell.name}</strong>:</p><div class="utility-spell-target-list">`;
            Object.keys(currentGameState.connectedPlayers).forEach(playerId => {
                const player = currentGameState.connectedPlayers[playerId];
                if(player.role === 'player' && player.characterSheet) {
                     content += `<button class="utility-spell-target-btn" data-player-id="${playerId}">
                        <div class="utility-spell-token" style="background-image: url('${player.characterSheet.tokenImg}')"></div>
                        <span>${player.characterName}</span>
                    </button>`;
                }
            });
            content += `</div>`;
    
            showCustomModal(`Usar ${spell.name}`, content, [
                { text: 'Cancelar', closes: true, className: 'btn-danger'}
            ]);
    
            document.querySelectorAll('.utility-spell-target-btn').forEach(btn => {
                btn.onclick = () => {
                    const targetId = btn.dataset.playerId;
                    socket.emit('playerAction', {
                        type: 'useUtilitySpell',
                        casterId: myPlayerKey,
                        targetId: targetId,
                        spellName: spell.name
                    });
                     modal.classList.add('hidden');
                     ingameSheetModal.classList.add('hidden');
                };
            });
        }
    }

    function handleEquipmentChangeConfirmation() {
        const myFighter = getFighter(currentGameState, myPlayerKey);
        if (!myFighter) return;
        
        const inventory = myFighter.inventory || {};
        
        const getFullItem = (itemName, itemType) => {
            if (itemName === 'Desarmado' || itemName === 'Nenhuma' || itemName === 'Nenhum') {
                return { name: itemName, type: itemName, img: null, isRanged: false };
            }
            const item = inventory[itemName];
            if (!item) return { name: itemName, type: itemType, img: null, isRanged: false }; // Fallback
            return { name: item.name, type: item.baseType, img: item.img, isRanged: item.isRanged };
        };

        const newEquipment = {
            weapon1: getFullItem(document.getElementById('ingame-sheet-weapon1-type').value, 'weapon'),
            weapon2: getFullItem(document.getElementById('ingame-sheet-weapon2-type').value, 'weapon'),
            armor: document.getElementById('ingame-sheet-armor-type').value,
            shield: document.getElementById('ingame-sheet-shield-type').value,
        };

        const hasChanged = JSON.stringify(originalEquipmentState) !== JSON.stringify(newEquipment);
    
        if (!hasChanged) {
            return;
        }
    
        if (currentGameState.mode === 'adventure') {
            if (myFighter.pa < 3) {
                showInfoModal("Ação Bloqueada", "Você não tem 3 Pontos de Ação (PA) para trocar de equipamento. Suas alterações não foram salvas.");
                return;
            }
    
            showCustomModal(
                "Confirmar Mudança de Equipamento",
                "Trocar de equipamento durante o combate custará 3 Pontos de Ação. Deseja continuar?",
                [
                    { text: 'Sim, Gastar 3 PA', closes: true, onClick: () => {
                        socket.emit('playerAction', { type: 'changeEquipment', newEquipment });
                    }},
                    { text: 'Não, Cancelar', closes: true }
                ]
            );
        } else {
            socket.emit('playerAction', { type: 'changeEquipment', newEquipment });
        }
    }
    
    function handlePointDistributionConfirmation() {
        if (ingameSheetModal.classList.contains('gm-view-mode')) {
            ingameSheetModal.classList.add('hidden');
            return;
        }
        
        const myFighter = getFighter(currentGameState, myPlayerKey);
        if (!myFighter || !myFighter.sheet) {
            ingameSheetModal.classList.add('hidden');
            return;
        }

        if (Object.keys(stagedLevelUpChanges).length === 0) {
            ingameSheetModal.classList.add('hidden');
            return;
        }
        
        const { unallocatedAttrPoints, unallocatedElemPoints, spellChoicesAvailable } = myFighter.sheet;

        if (stagedLevelUpChanges.attrPointsSpent < unallocatedAttrPoints || 
            stagedLevelUpChanges.elemPointsSpent < unallocatedElemPoints || 
            stagedLevelUpChanges.newSpells.length < (spellChoicesAvailable || []).length) 
        {
            showCustomModal(
                "Confirmar Distribuição",
                "Você não distribuiu todos os seus pontos/magias. Deseja confirmar mesmo assim? (Você poderá distribuí-los mais tarde)",
                [
                    { text: 'Sim, Confirmar', closes: true, onClick: sendPointDistribution },
                    { text: 'Não, Voltar', closes: true }
                ]
            );
        } else {
            sendPointDistribution();
        }
    }

    function sendPointDistribution() {
        socket.emit('playerAction', {
            type: 'playerDistributesPoints',
            data: stagedLevelUpChanges
        });
        stagedLevelUpChanges = {};
        ingameSheetModal.classList.add('hidden');
    }

    // --- LÓGICA DE LEVEL UP (CLIENT-SIDE) ---
    function renderLevelUpDistribution(fighter) {
        const sheet = fighter.sheet;
        const attrDistHeader = document.getElementById('ingame-attribute-points-dist-header');
        const elemDistHeader = document.getElementById('ingame-element-points-dist-header');
        const spellContainer = document.getElementById('ingame-spell-choices-dist');
        const confirmBtn = document.getElementById('ingame-confirm-points-btn');
        const attributesGrid = document.getElementById('ingame-sheet-attributes');
        const elementsGrid = document.getElementById('ingame-sheet-elements');

        // Reset state
        stagedLevelUpChanges = {
            attrPointsSpent: 0,
            elemPointsSpent: 0,
            newBaseAttributes: { ...sheet.baseAttributes },
            newBaseElements: { ...sheet.elements },
            newSpells: []
        };
        
        attrDistHeader.classList.add('hidden');
        elemDistHeader.classList.add('hidden');
        spellContainer.classList.add('hidden');
        confirmBtn.classList.add('hidden');
        spellContainer.innerHTML = '';
        document.querySelectorAll('[data-attr-wrapper], [data-elem-wrapper]').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('[data-attr-span], [data-elem-span]').forEach(el => el.classList.remove('hidden'));

        let hasPointsToDistribute = false;

        const renderSpellsForLevelUp = () => {
            spellContainer.innerHTML = '';
            if (sheet.spellChoicesAvailable && sheet.spellChoicesAvailable.length > 0) {
                hasPointsToDistribute = true;
                spellContainer.classList.remove('hidden');
                
                sheet.spellChoicesAvailable.forEach((choice, index) => {
                    const choiceContainer = document.createElement('div');
                    choiceContainer.className = 'levelup-spell-selection-container';
                    choiceContainer.innerHTML = `<h4>Escolha 1 Magia (Grau ${choice.grade})</h4>`;
                    
                    const spellGrid = document.createElement('div');
                    spellGrid.className = 'levelup-spell-grid';

                    const spellPool = [...(ALL_SPELLS[`grade${choice.grade}`] || []), ...(ALL_SPELLS[`advanced_grade${choice.grade}`] || []), ...(ALL_SPELLS.grade_combined || [])];
                    const availableElements = Object.keys(stagedLevelUpChanges.newBaseElements).filter(e => stagedLevelUpChanges.newBaseElements[e] > 0);
                    
                    const availableSpells = spellPool.filter(spell => {
                        if (sheet.spells.includes(spell.name)) return false;
                        if (spell.requiredElements) {
                            return spell.requiredElements.every(reqElem => availableElements.includes(reqElem));
                        }
                        if (spell.isAdvanced) return stagedLevelUpChanges.newBaseElements[spell.element] === 2;
                        return availableElements.includes(spell.element);
                    });

                    availableSpells.forEach(spell => {
                        const card = document.createElement('div');
                        card.className = 'spell-card';
                        card.dataset.spellName = spell.name;
                        card.dataset.spellGrade = choice.grade;
                        const spellType = spell.inCombat ? '(Combate)' : '(Utilitário)';

                        let elementHtml;
                        if (spell.combinedElementName) {
                            const colors = getElementColors(spell.combinedElementName, spell.requiredElements);
                            elementHtml = `<span class="spell-element" style="background-image: ${colors};">${spell.combinedElementName}</span>`;
                        } else {
                            const elementName = spell.isAdvanced ? GAME_RULES.advancedElements[spell.element] : spell.element;
                            const color = getElementColors(elementName);
                            const capitalizedElement = elementName.charAt(0).toUpperCase() + elementName.slice(1);
                            elementHtml = `<span class="spell-element" style="background-image: ${color};">${capitalizedElement}</span>`;
                        }

                        card.innerHTML = `
                            <div class="spell-card-header">
                                <h4>${spell.name} <small>${spellType}</small></h4>
                                <div class="spell-details">
                                    ${elementHtml}
                                    <span class="spell-cost">${spell.costMahou} Mahou</span>
                                </div>
                            </div>
                            <p>${spell.description}</p>`;
                        
                        card.addEventListener('click', () => {
                            spellGrid.querySelectorAll('.spell-card.selected').forEach(c => c.classList.remove('selected'));
                            card.classList.add('selected');
                            stagedLevelUpChanges.newSpells = stagedLevelUpChanges.newSpells.filter(s => s.choiceIndex !== index);
                            stagedLevelUpChanges.newSpells.push({ choiceIndex: index, spellName: spell.name, grade: choice.grade });
                        });
                        spellGrid.appendChild(card);
                    });
                    
                    choiceContainer.appendChild(spellGrid);
                    spellContainer.appendChild(choiceContainer);
                });
            } else {
                spellContainer.classList.add('hidden');
            }
            confirmBtn.classList.toggle('hidden', !hasPointsToDistribute);
        };
        
        // Attribute points
        if (sheet.unallocatedAttrPoints > 0) {
            hasPointsToDistribute = true;
            attributesGrid.classList.add('is-distributing');
            attrDistHeader.classList.remove('hidden');
            let remainingAttr = sheet.unallocatedAttrPoints;
            document.getElementById('ingame-attr-points-avail').textContent = remainingAttr;

            document.querySelectorAll('[data-attr-container]').forEach(container => {
                const wrapper = container.querySelector('[data-attr-wrapper]');
                const span = container.querySelector('[data-attr-span]');
                wrapper.classList.remove('hidden');
                span.classList.add('hidden');

                const attrName = wrapper.dataset.attrWrapper;
                const input = wrapper.querySelector('input');
                const upBtn = wrapper.querySelector('.up-arrow');
                const downBtn = wrapper.querySelector('.down-arrow');
                const baseValue = sheet.baseAttributes[attrName] || 0;
                
                upBtn.onclick = null;
                downBtn.onclick = null;
                input.value = baseValue; 

                const updateAttrButtons = () => {
                    upBtn.disabled = remainingAttr <= 0;
                    downBtn.disabled = parseInt(input.value) <= baseValue;
                };

                upBtn.onclick = () => {
                    if (remainingAttr > 0) {
                        remainingAttr--;
                        stagedLevelUpChanges.newBaseAttributes[attrName]++;
                        input.value = stagedLevelUpChanges.newBaseAttributes[attrName];
                        stagedLevelUpChanges.attrPointsSpent++;
                        document.getElementById('ingame-attr-points-avail').textContent = remainingAttr;
                        updateAttrButtons();
                    }
                };

                downBtn.onclick = () => {
                    if (parseInt(input.value, 10) > baseValue) {
                        remainingAttr++;
                        stagedLevelUpChanges.newBaseAttributes[attrName]--;
                        input.value = stagedLevelUpChanges.newBaseAttributes[attrName];
                        stagedLevelUpChanges.attrPointsSpent--;
                        document.getElementById('ingame-attr-points-avail').textContent = remainingAttr;
                        updateAttrButtons();
                    }
                };
                updateAttrButtons();
            });
        }

        // Element points
        if (sheet.unallocatedElemPoints > 0) {
            hasPointsToDistribute = true;
            elementsGrid.classList.add('is-distributing');
            elemDistHeader.classList.remove('hidden');
            let remainingElem = sheet.unallocatedElemPoints;
            document.getElementById('ingame-elem-points-avail').textContent = remainingElem;

            document.querySelectorAll('[data-elem-container]').forEach(container => {
                const wrapper = container.querySelector('[data-elem-wrapper]');
                const span = container.querySelector('[data-elem-span]');
                wrapper.classList.remove('hidden');
                span.classList.add('hidden');
                
                const elemName = wrapper.dataset.elemWrapper;
                const input = wrapper.querySelector('input');
                const upBtn = wrapper.querySelector('.up-arrow');
                const downBtn = wrapper.querySelector('.down-arrow');
                const baseValue = sheet.elements[elemName] || 0;
                
                upBtn.onclick = null;
                downBtn.onclick = null;
                input.value = baseValue;

                const updateElemButtons = () => {
                    upBtn.disabled = remainingElem <= 0 || parseInt(input.value) >= 2;
                    downBtn.disabled = parseInt(input.value) <= baseValue;
                };

                upBtn.onclick = () => {
                    if (remainingElem > 0 && parseInt(input.value) < 2) {
                        remainingElem--;
                        stagedLevelUpChanges.newBaseElements[elemName]++;
                        input.value = stagedLevelUpChanges.newBaseElements[elemName];
                        stagedLevelUpChanges.elemPointsSpent++;
                        document.getElementById('ingame-elem-points-avail').textContent = remainingElem;
                        updateElemButtons();
                        renderSpellsForLevelUp();
                    }
                };
                 downBtn.onclick = () => {
                    if (parseInt(input.value, 10) > baseValue) {
                        remainingElem++;
                        stagedLevelUpChanges.newBaseElements[elemName]--;
                        input.value = stagedLevelUpChanges.newBaseElements[elemName];
                        stagedLevelUpChanges.elemPointsSpent--;
                        document.getElementById('ingame-elem-points-avail').textContent = remainingElem;
                        updateElemButtons();
                        renderSpellsForLevelUp();
                    }
                };
                updateElemButtons();
            });
        }
        
        renderSpellsForLevelUp();
        
        confirmBtn.onclick = handlePointDistributionConfirmation;
    }
    
    function showGmAwardModal() {
        if (!isGm || !currentGameState) return;

        const players = Object.values(currentGameState.connectedPlayers).filter(p => p.role === 'player' && p.characterFinalized);
        if (players.length === 0) {
            showInfoModal("Aviso", "Não há jogadores na sala para conceder recompensas.");
            return;
        }

        let playerListHtml = players.map(player => `
            <div class="gm-award-player-item">
                <div class="token gm-player-token" style="background-image: url('${player.characterSheet.tokenImg}')" data-player-id="${player.socketId}" title="Ver/Editar Ficha de ${player.characterName}"></div>
                <span class="name">${player.characterName}</span>
                <input type="number" class="award-xp-input" placeholder="XP" data-player-id="${player.socketId}">
                <input type="number" class="award-money-input" placeholder="Moedas" data-player-id="${player.socketId}">
                <input type="number" class="award-hp-input" placeholder="HP" data-player-id="${player.socketId}">
                <input type="number" class="award-mahou-input" placeholder="Mahou" data-player-id="${player.socketId}">
            </div>
        `).join('');

        const content = `
            <div class="gm-award-modal-content">
                <div class="gm-award-player-list">${playerListHtml}</div>
                <div class="gm-award-all-container">
                    <div>
                        <label for="award-all-xp">Conceder para Todos (XP):</label>
                        <input type="number" id="award-all-xp" placeholder="XP para todos">
                    </div>
                    <div>
                         <label for="award-all-money">Conceder para Todos (Moedas):</label>
                        <input type="number" id="award-all-money" placeholder="Moedas para todos">
                    </div>
                     <div>
                        <label for="award-all-hp">Ajustar para Todos (HP):</label>
                        <input type="number" id="award-all-hp" placeholder="+/- HP para todos">
                    </div>
                    <div>
                        <label for="award-all-mahou">Ajustar para Todos (Mahou):</label>
                        <input type="number" id="award-all-mahou" placeholder="+/- Mahou para todos">
                    </div>
                </div>
            </div>`;
            
        showCustomModal("Conceder Recompensas", content, [
            { text: 'Confirmar', closes: true, onClick: () => {
                const awards = [];
                const allXp = parseInt(document.getElementById('award-all-xp').value) || 0;
                const allMoney = parseInt(document.getElementById('award-all-money').value) || 0;
                const allHp = parseInt(document.getElementById('award-all-hp').value) || 0;
                const allMahou = parseInt(document.getElementById('award-all-mahou').value) || 0;

                document.querySelectorAll('.gm-award-player-item').forEach(item => {
                    const playerId = item.querySelector('.award-xp-input').dataset.playerId;
                    const individualXp = parseInt(item.querySelector('.award-xp-input').value) || 0;
                    const individualMoney = parseInt(item.querySelector('.award-money-input').value) || 0;
                    const individualHp = parseInt(item.querySelector('.award-hp-input').value) || 0;
                    const individualMahou = parseInt(item.querySelector('.award-mahou-input').value) || 0;

                    const totalXp = individualXp + allXp;
                    const totalMoney = individualMoney + allMoney;
                    const totalHp = individualHp + allHp;
                    const totalMahou = individualMahou + allMahou;

                    if (totalXp !== 0 || totalMoney !== 0 || totalHp !== 0 || totalMahou !== 0) {
                        awards.push({ playerId, xp: totalXp, money: totalMoney, hp: totalHp, mahou: totalMahou });
                    }
                });

                if (awards.length > 0) {
                    socket.emit('playerAction', { type: 'gmAwardsRewards', awards });
                }
            }},
            { text: 'Cancelar', closes: true }
        ]);

        document.querySelectorAll('.gm-player-token').forEach(tokenEl => {
            tokenEl.addEventListener('click', (e) => {
                const playerId = e.currentTarget.dataset.playerId;
                modal.classList.add('hidden');
                showGmPlayerSheetView(playerId);
            });
        });
    }


    // --- NOVA FUNÇÃO: GM VISUALIZA E EDITA A FICHA DO JOGADOR ---
    function showGmPlayerSheetView(playerId) {
        const playerFighter = getFighter(currentGameState, playerId);
        if (!playerFighter) return;

        populateIngameSheet(playerFighter, true);

        const sheetModal = document.getElementById('ingame-sheet-modal');

        const editBtn = document.getElementById('gm-edit-inventory-btn');
        editBtn.classList.remove('hidden');
        editBtn.onclick = () => {
            sheetModal.classList.add('hidden');
            showGmInventoryEditor(playerFighter);
        };

        sheetModal.classList.remove('hidden');
    }

    function showGmInventoryEditor(player) {
        let stagedInventory = JSON.parse(JSON.stringify(player.inventory || {}));
        let stagedAmmunition = player.ammunition || 0;
    
        const buildItemCatalogHtml = () => {
            const nonItems = ['Desarmado', 'Nenhuma', 'Nenhum'];
            
            const allGameItems = {
                'Armas': [], 'Armaduras': [], 'Escudos': [], 'Itens': []
            };

            Object.entries(ALL_WEAPON_IMAGES)
                .filter(([key]) => key !== 'customProjectiles' && key !== 'Desarmado')
                .forEach(([key, cat]) => {
                    const weaponData = GAME_RULES.weapons[key] || {};
                    const melee = (cat.melee || []).map(imgPath => ({ name: imgPath.split('/').pop().split('.')[0], img: imgPath, type: 'weapon', baseType: key, isRanged: false, ...weaponData }));
                    const ranged = (cat.ranged || []).map(imgPath => ({ name: imgPath.split('/').pop().split('.')[0], img: imgPath, type: 'weapon', baseType: key, isRanged: true, ...weaponData }));
                    allGameItems['Armas'].push(...melee, ...ranged);
                });
            
            allGameItems['Armaduras'] = Object.entries(GAME_RULES.armors).filter(([name]) => name !== 'Nenhuma').map(([name, data]) => ({ name, type: 'armor', baseType: name, ...data }));
            allGameItems['Escudos'] = Object.entries(GAME_RULES.shields).filter(([name]) => name !== 'Nenhum').map(([name, data]) => ({ name, type: 'shield', baseType: name, ...data }));
            allGameItems['Itens'] = Object.entries(ALL_ITEMS).map(([name, data]) => ({ name, type: data.isAmmunition ? 'ammunition' : 'item', baseType: name, ...data }));

            let catalogHtml = '<div class="shop-tabs">';
            Object.keys(allGameItems).forEach((cat, i) => {
                const categorySlug = cat.replace(/\s+/g, '-');
                catalogHtml += `<button class="shop-tab-btn ${i === 0 ? 'active' : ''}" data-category="${categorySlug}">${cat}</button>`;
            });
            catalogHtml += '</div><div class="shop-item-grids-container">';
    
            Object.entries(allGameItems).forEach(([category, items], i) => {
                const categorySlug = category.replace(/\s+/g, '-');
                catalogHtml += `<div class="gm-inventory-grid shop-item-grid ${i === 0 ? 'active' : ''}" id="catalog-grid-${categorySlug}">`;
                const uniqueItems = Array.from(new Map(items.map(item => [item.name, item])).values());
                
                uniqueItems.filter(item => !nonItems.includes(item.name)).forEach(item => {
                    let imgPath = item.img;
                     if (!imgPath) {
                        if (item.type === 'armor') imgPath = `/images/armas/${item.name === 'Mediana' ? 'Armadura Mediana' : `Armadura ${item.name}`}.png`.replace(/ /g, '%20');
                        else if (item.type === 'shield') imgPath = `/images/armas/${item.name === 'Médio' ? 'Escudo Medio' : `Escudo ${item.name}`}.png`.replace(/ /g, '%20');
                    }
                     const handInfo = item.type === 'weapon' && item.hand ? `<div class="shop-item-hand">${item.hand} Mão${item.hand > 1 ? 's' : ''}</div>` : '';
                    catalogHtml += `
                        <div class="gm-inv-item-card" data-item-json='${JSON.stringify(item)}' title="Adicionar ${item.name}">
                            ${handInfo}
                            <img src="${imgPath || ''}" alt="${item.name}" onerror="this.style.display='none'">
                            <div class="item-name">${item.name}</div>
                        </div>`;
                });
                catalogHtml += '</div>';
            });
            catalogHtml += '</div>';
            return catalogHtml;
        };
    
        const content = `
            <div class="gm-inventory-layout">
                <div class="inventory-panel">
                    <h4>Inventário de ${player.nome}</h4>
                    <div class="gm-inventory-grid" id="gm-player-inventory-grid"></div>
                    <div class="gm-inventory-ammo-control">
                        <label for="gm-ammo-input">Munição:</label>
                        <input type="number" id="gm-ammo-input" class="quantity-input" value="${stagedAmmunition}" min="0">
                    </div>
                </div>
                <div class="item-catalog-panel">
                    <h4>Catálogo de Itens</h4>
                    <input type="text" id="gm-inventory-search" class="inventory-search" placeholder="Buscar item...">
                    <div id="gm-item-catalog-container">
                        ${buildItemCatalogHtml()}
                    </div>
                </div>
            </div>`;
    
        showCustomModal(`Editar Inventário de ${player.nome}`, content, [
            { text: 'Confirmar Alterações', closes: true, onClick: () => {
                 socket.emit('playerAction', {
                    type: 'gmUpdatesPlayerInventory',
                    playerId: player.id,
                    newInventory: stagedInventory,
                    newAmmunition: parseInt(document.getElementById('gm-ammo-input').value, 10)
                });
            }},
            { text: 'Cancelar', closes: true, className: 'btn-danger' }
        ], 'gm-inventory-editor-modal');
    
        const renderPlayerInventory = () => {
            const grid = document.getElementById('gm-player-inventory-grid');
            grid.innerHTML = '';
            Object.values(stagedInventory).forEach(item => {
                const card = document.createElement('div');
                card.className = 'gm-inv-item-card';
                card.innerHTML = `
                    <button class="remove-staged-npc remove-item-btn" title="Remover Item">X</button>
                    <img src="${item.img || ''}" alt="${item.name}" onerror="this.style.display='none'">
                    <div class="item-name">${item.name}</div>
                    <div class="item-controls">
                        <button class="arrow-btn down-arrow quantity-btn">-</button>
                        <input type="number" class="quantity-input" value="${item.quantity}" min="1">
                        <button class="arrow-btn up-arrow quantity-btn">+</button>
                    </div>`;
                
                card.querySelector('.remove-item-btn').onclick = () => {
                    delete stagedInventory[item.name];
                    renderPlayerInventory();
                };
                card.querySelector('.down-arrow').onclick = () => {
                    if (stagedInventory[item.name].quantity > 1) {
                        stagedInventory[item.name].quantity--;
                        renderPlayerInventory();
                    }
                };
                card.querySelector('.up-arrow').onclick = () => {
                    stagedInventory[item.name].quantity++;
                    renderPlayerInventory();
                };
                card.querySelector('.quantity-input').onchange = (e) => {
                     stagedInventory[item.name].quantity = Math.max(1, parseInt(e.target.value, 10) || 1);
                     renderPlayerInventory();
                };
                grid.appendChild(card);
            });
        };
    
        renderPlayerInventory();
        
        const catalogContainer = document.getElementById('gm-item-catalog-container');
        catalogContainer.querySelectorAll('.shop-tab-btn').forEach(btn => {
            btn.onclick = () => {
                catalogContainer.querySelectorAll('.shop-tab-btn, .shop-item-grid').forEach(el => el.classList.remove('active'));
                btn.classList.add('active');
                const categorySlug = btn.dataset.category;
                const activeGrid = catalogContainer.querySelector(`#catalog-grid-${categorySlug}`);
                if (activeGrid) {
                    activeGrid.classList.add('active');
                }
                document.getElementById('gm-inventory-search').dispatchEvent(new Event('input'));
            };
        });
    
        catalogContainer.querySelectorAll('.gm-inv-item-card').forEach(card => {
            card.onclick = () => {
                const itemData = JSON.parse(card.dataset.itemJson);
                const itemName = itemData.name;
                
                if (itemData.isAmmunition) {
                     stagedAmmunition++;
                     document.getElementById('gm-ammo-input').value = stagedAmmunition;
                     return;
                }

                if (!stagedInventory[itemName]) {
                    stagedInventory[itemName] = { ...itemData, quantity: 1 };
                } else {
                    stagedInventory[itemName].quantity++;
                }
                renderPlayerInventory();
            };
        });
        
        document.getElementById('gm-inventory-search').oninput = (e) => {
            const searchTerm = e.target.value.toLowerCase();
            catalogContainer.querySelectorAll('.shop-item-grid').forEach(grid => {
                grid.querySelectorAll('.gm-inv-item-card').forEach(card => {
                    const itemName = JSON.parse(card.dataset.itemJson).name.toLowerCase();
                    card.style.display = itemName.includes(searchTerm) ? '' : 'flex';
                });
            });
        };
    }

    // =============================================================
    // =========== INÍCIO DA EXECUÇÃO DO SCRIPT ===================
    // =============================================================
    
    // --- LÓGICA DE INICIALIZAÇÃO E LISTENERS DE SOCKET ---
    socket.on('initialData', (data) => {
        GAME_RULES = data.rules;
        ALL_SPELLS = data.spells;
        ALL_WEAPON_IMAGES = data.weaponImages;
        ALL_ITEMS = data.items || {};
        ALL_SUMMONS = data.summons || {};
        ALL_CHARACTERS = data.characters || { players: [], npcs: [], dynamic: [] };
        ALL_SCENARIOS = data.scenarios || {};
        ALL_PLAYER_IMAGES = data.playerImages || [];
        LEVEL_UP_TABLE = data.levelUpTable || {};
    
        preloadProjectileImages();

        const urlParams = new URLSearchParams(window.location.search);
        const urlRoomId = urlParams.get('room');

        if (urlRoomId) {
            socket.emit('playerJoinsLobby', { roomId: urlRoomId });
        } else {
            socket.emit('gmCreatesLobby');
        }

        scaleGame();
    });

    socket.on('levelUpNotification', () => {
        console.log("Level Up! Abra a ficha para distribuir os pontos.");
    });
    
    socket.on('gameUpdate', (gameState) => { 
        if (clientFlowState === 'initializing') {
            currentGameState = gameState;
            return;
        }

        const oldFighter = oldGameState ? getFighter(oldGameState, myPlayerKey) : null;
        
        renderGame(gameState); 
        
        const newFighter = getFighter(gameState, myPlayerKey);
        const ingameSheetModal = document.getElementById('ingame-sheet-modal');
        if (!ingameSheetModal.classList.contains('hidden') && !ingameSheetModal.classList.contains('gm-view-mode')) {
            if (newFighter && oldFighter) {
                const oldInv = JSON.stringify(oldFighter.inventory);
                const newInv = JSON.stringify(newFighter.inventory);
                const oldAmmo = oldFighter.ammunition;
                const newAmmo = newFighter.ammunition;

                if (oldInv !== newInv || oldAmmo !== newAmmo) {
                     const currentOriginalEquipment = originalEquipmentState ? JSON.parse(JSON.stringify(originalEquipmentState)) : JSON.parse(JSON.stringify(newFighter.sheet.equipment));
                     populateIngameSheet(newFighter, false);
                     originalEquipmentState = currentOriginalEquipment;
                }
            }
        }
    });

    socket.on('globalAnnounceEffect', (data) => {
        const announcement = document.createElement('div');
        announcement.className = 'global-effect-announcement';
        
        const hexColor = getElementHexColor(data.element);
        announcement.style.setProperty('--element-color', hexColor);

        let html = `<div class="announcement-main">${data.casterName} usou ${data.spellName}`;
        if (data.targetName) {
            html += ` em ${data.targetName}`;
        }
        html += `</div>`;
        
        if (data.costText) {
            html += `<div class="announcement-sub cost">${data.costText}</div>`;
        }
        if (data.effectText) {
            html += `<div class="announcement-sub effect">${data.effectText}</div>`;
        }

        announcement.innerHTML = html;
        gameWrapper.appendChild(announcement);

        setTimeout(() => {
            announcement.remove();
        }, 4000);
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
        clientFlowState = 'in_game';
        if (myRole === 'player') showScreen(document.getElementById('player-initial-choice-screen'));

        if (currentGameState) {
            renderGame(currentGameState);
        }
    });
    socket.on('promptForAdventureType', () => { if (isGm) showCustomModal('Retornar à Aventura', 'Deseja continuar a aventura anterior ou começar uma nova batalha?', [{text: 'Continuar Batalha', closes: true, onClick: () => socket.emit('playerAction', { type: 'gmChoosesAdventureType', choice: 'continue' })}, {text: 'Nova Batalha', closes: true, onClick: () => socket.emit('playerAction', { type: 'gmChoosesAdventureType', choice: 'new' })}]); });
    
    socket.on('visualEffectTriggered', ({ casterId, targetId, animation }) => {
        const casterEl = document.getElementById(casterId);
        let targetEl = document.getElementById(targetId);
        if (!casterEl) return;
    
        const effectEl = document.createElement('div');
        const gameWrapperRect = gameWrapper.getBoundingClientRect();
        const gameScale = getGameScale();
        
        const casterRect = casterEl.getBoundingClientRect();
        let targetRect = targetEl ? targetEl.getBoundingClientRect() : casterRect;

        if (animation === 'self_summon') {
            const summonerIsPlayer = casterEl.classList.contains('player-char-container');
            const summonPosX = (casterRect.left - gameWrapperRect.left) / gameScale + (summonerIsPlayer ? 80 : -80);
            const summonPosY = (casterRect.top - gameWrapperRect.top) / gameScale + 50;
            
            targetRect = { 
                left: summonPosX * gameScale + gameWrapperRect.left, 
                top: summonPosY * gameScale + gameWrapperRect.top, 
                width: 0, 
                height: 0 
            };
        }
    
        const startX = (casterRect.left + casterRect.width / 2 - gameWrapperRect.left) / gameScale;
        const startY = (casterRect.top + casterRect.height / 2 - gameWrapperRect.top) / gameScale;
        const endX = (targetRect.left + targetRect.width / 2 - gameWrapperRect.left) / gameScale;
        const endY = (targetRect.top + targetRect.height / 2 - gameWrapperRect.top) / gameScale;
    
        if (animation.startsWith('projectile')) {
            effectEl.style.setProperty('--start-x', `${startX}px`);
            effectEl.style.setProperty('--start-y', `${startY}px`);
            effectEl.style.setProperty('--end-x', `${endX}px`);
            effectEl.style.setProperty('--end-y', `${endY}px`);
        } else {
            let effectX = (animation.startsWith('self')) ? startX : endX;
            let effectY = (animation.startsWith('self')) ? startY : endY;
            if (animation === 'self_summon') {
                 effectX = endX;
                 effectY = endY;
            }
            effectEl.style.setProperty('--start-x', `${effectX}px`);
            effectEl.style.setProperty('--start-y', `${effectY}px`);
        }
    
        effectEl.className = `visual-effect ${animation}`;
        fightScreen.appendChild(effectEl);
    
        setTimeout(() => {
            effectEl.remove();
        }, 1200);
    });

    socket.on('floatingTextTriggered', ({ targetId, text, type }) => {
        const targetEl = document.getElementById(targetId);
        if (!targetEl) return;
    
        const textsForDelay = fightScreen.querySelectorAll(`.floating-text[data-target-id="${targetId}"]`).length;
    
        const textEl = document.createElement('div');
        textEl.className = `floating-text ${type}`;
        textEl.textContent = text;
        textEl.dataset.targetId = targetId;
        
        setTimeout(() => {
            const currentExistingTexts = fightScreen.querySelectorAll(`.floating-text[data-target-id="${targetId}"]`).length;
            
            fightScreen.appendChild(textEl);
            
            const rect = targetEl.getBoundingClientRect();
            const gameWrapperRect = gameWrapper.getBoundingClientRect();
            const gameScale = getGameScale();
            
            const x = (rect.left + rect.width / 2 - gameWrapperRect.left) / gameScale;
            const y = (rect.top - gameWrapperRect.top) / gameScale;
        
            const yOffset = currentExistingTexts * -30;
            textEl.style.left = `${x}px`;
            textEl.style.top = `${y}px`;
            textEl.style.setProperty('--y-offset', `${yOffset}px`);

            const duration = type === 'level-up' ? 3000 : 2000;
            setTimeout(() => {
                textEl.remove();
            }, duration);
        }, textsForDelay * 100);
    });

    socket.on('attackResolved', ({ attackerKey, targetKey, hit, debugInfo, isDual, isSecondHit, animationType, projectileInfo }) => {
        const attackerEl = document.getElementById(attackerKey);
        const targetEl = document.getElementById(targetKey);
        
        const handleHitFlash = (didHit) => {
            if (targetEl && didHit) {
                const img = targetEl.querySelector('.fighter-img-ingame');
                if (img) {
                    img.classList.add('is-hit-flash');
                    setTimeout(() => img.classList.remove('is-hit-flash'), 400);
                }
            }
        };

        if (animationType === 'projectile' && attackerEl && targetEl && projectileInfo) {
            const effectEl = document.createElement('div');
            effectEl.className = `visual-effect projectile projectile_${projectileInfo.name}`;
            effectEl.style.setProperty('--projectile-scale', projectileInfo.scale || 1.0);
            
            if (attackerEl.classList.contains('npc-char-container')) {
                effectEl.classList.add('is-npc');
            }
            
            const gameWrapperRect = gameWrapper.getBoundingClientRect();
            const gameScale = getGameScale();
            const casterRect = attackerEl.getBoundingClientRect();
            const targetRect = targetEl.getBoundingClientRect();

            const startX = (casterRect.left + casterRect.width / 2 - gameWrapperRect.left) / gameScale;
            const startY = (casterRect.top + casterRect.height / 2 - gameWrapperRect.top) / gameScale - 40;
            const endX = (targetRect.left + targetRect.width / 2 - gameWrapperRect.left) / gameScale;
            const endY = (targetRect.top + targetRect.height / 2 - gameWrapperRect.top) / gameScale - 40;

            effectEl.style.setProperty('--start-x', `${startX}px`);
            effectEl.style.setProperty('--start-y', `${startY}px`);
            effectEl.style.setProperty('--end-x', `${endX}px`);
            effectEl.style.setProperty('--end-y', `${endY}px`);
            
            fightScreen.appendChild(effectEl);

            setTimeout(() => {
                handleHitFlash(hit);
                effectEl.remove();
            }, 500);

        } else if (animationType === 'melee') {
            const playMeleeAnimation = () => {
                if (attackerEl) {
                    const isPlayer = attackerEl.classList.contains('player-char-container');
                    const isSummon = attackerEl.classList.contains('summon-char-container');
                    let animationClass = isPlayer ? 'attack-player' : (isSummon ? 'attack-summon' : 'attack-npc');
                    attackerEl.classList.add(animationClass);
                    setTimeout(() => { attackerEl.classList.remove(animationClass); }, 500);
                }
                handleHitFlash(hit);
            };

             if (isDual) {
                if (!isSecondHit) {
                    playMeleeAnimation();
                } else {
                    setTimeout(playMeleeAnimation, 600);
                }
            } else {
                playMeleeAnimation();
            }
        }
        
        if (isGm && isGmDebugModeActive && debugInfo) {
            const formatBreakdown = (breakdown) => {
                if (!breakdown) return '';
                return Object.entries(breakdown)
                    .map(([key, value]) => `<div class="breakdown-item"><span>${key}:</span> <span>${value >= 0 ? '+' : ''}${value}</span></div>`)
                    .join('');
            };

            const buildAttackReport = (attackData) => {
                if (!attackData) return '<p>Ataque não ocorreu (alvo derrotado).</p>';
                
                let weaponBuffHtml = '';
                if (attackData.weaponBuffInfo && attackData.weaponBuffInfo.total > 0) {
                     weaponBuffHtml = formatBreakdown(attackData.weaponBuffInfo.breakdown);
                }

                let finalDamageHtml = '';
                if(attackData.finalDamageBreakdown && Object.keys(attackData.finalDamageBreakdown).length > 0) {
                    finalDamageHtml = `<h5>Bônus de Dano Final:</h5><div class="debug-breakdown">${formatBreakdown(attackData.finalDamageBreakdown)}</div>`;
                }

                let report = `<h4>Cálculo de Acerto (Arma: ${attackData.weaponUsed})</h4>
                    <div class="grid-row"><span>Rolagem D20:</span> <span>${attackData.hitRoll}</span></div>
                    <div class="grid-row"><span>BTA do Atacante:</span> <span>${attackData.bta >= 0 ? '+' : ''}${attackData.bta}</span></div>
                    <div class="debug-breakdown">${formatBreakdown(attackData.btaBreakdown)}</div>
                    <div class="grid-row result"><span>Resultado Final:</span> <span class="debug-result">${attackData.attackRoll}</span></div>
                    <div class="grid-row"><span>vs Esquiva do Alvo:</span> <span class="debug-result">${attackData.targetEsquiva}</span></div>
                    <div class="debug-breakdown">${formatBreakdown(attackData.esqBreakdown)}</div>
                    <hr>
                    <h4>Cálculo de Dano (${attackData.isRanged ? 'Agilidade' : 'Força'})</h4>
                    <div class="grid-row"><span>Resultado do Ataque:</span> <span class="debug-result">${attackData.hit ? 'ACERTOU' : 'ERROU'}</span></div>`;
                if (attackData.hit) {
                    report += `
                        <div class="grid-row"><span>Rolagem de Dano (${attackData.damageFormula}):</span> <span>${attackData.damageRoll}</span></div>
                        ${attackData.isCrit ? `<div class="grid-row"><span>Dano Crítico (Dobro dos Dados):</span> <span>+${attackData.critDamage}</span></div>` : ''}
                        <div class="grid-row"><span>BTD do Atacante:</span> <span>${attackData.btd >= 0 ? '+' : ''}${attackData.btd}</span></div>
                        <div class="debug-breakdown">${formatBreakdown(attackData.btdBreakdown)}</div>
                        ${weaponBuffHtml ? `<h5>Dano Adicional de Buffs:</h5><div class="debug-breakdown">${weaponBuffHtml}</div>` : ''}
                        <div class="grid-row"><span>Dano Bruto Total:</span> <span>${attackData.totalDamage}</span></div>
                        <div class="grid-row"><span>vs Proteção do Alvo:</span> <span>-${attackData.targetProtection}</span></div>
                        <div class="debug-breakdown">${formatBreakdown(attackData.protectionBreakdown)}</div>
                        ${finalDamageHtml}
                        <hr>
                        <div class="final-damage-row"><span>DANO FINAL:</span> <span class="debug-final-damage">${attackData.finalDamage}</span></div>`;
                }
                return report;
            };

            let contentHtml = '<div class="debug-info-grid">';
            let modalTitle = `Relatório: <span class="attacker-name">${debugInfo.attackerName}</span> ataca <span class="defender-name">${debugInfo.targetName}</span>`;

            const reportData = isDual ? (isSecondHit ? debugInfo.attack2 : debugInfo.attack1) : debugInfo;
            if(reportData) {
                contentHtml += buildAttackReport(reportData);
            }
            contentHtml += '</div>';

            showCustomModal(modalTitle, contentHtml, [
                { text: 'Fechar', closes: true }
            ]);
        }
    });
     socket.on('spellResolved', ({ debugReports }) => {
        if (isGm && isGmDebugModeActive && debugReports && debugReports.length > 0) {
            const formatBreakdown = (breakdown) => {
                if (!breakdown) return '';
                return Object.entries(breakdown)
                    .map(([key, value]) => `<div class="breakdown-item"><span>${key}:</span> <span>${value === 'zero_out' ? value : (value >= 0 ? '+' : '') + value}</span></div>`)
                    .join('');
            };

            const buildSpellReport = (spellData) => {
                if (!spellData) return '<p>Falha ao resolver magia.</p>';
                 const defenseType = spellData.isMagicalCalculation ? 'Defesa Mágica' : 'Esquiva';
                let report = `<h4>Cálculo de Acerto (Magia: ${spellData.spellName}) vs <span class="defender-name">${spellData.targetName}</span></h4>`;
                if (spellData.autoHit) {
                     report += `<div class="grid-row result"><span>Resultado do Ataque:</span> <span class="debug-result">ACERTO AUTOMÁTICO</span></div>`;
                } else {
                     report +=`<div class="grid-row"><span>Rolagem D20:</span> <span>${spellData.hitRoll}</span></div>
                    <div class="grid-row"><span>Bônus de Acerto:</span> <span>${spellData.attackBonus >= 0 ? '+' : ''}${spellData.attackBonus}</span></div>
                    <div class="debug-breakdown">${formatBreakdown(spellData.attackBonusBreakdown)}</div>
                    <div class="grid-row result"><span>Resultado Final:</span> <span class="debug-result">${spellData.attackRoll}</span></div>
                    <div class="grid-row"><span>vs ${defenseType} do Alvo:</span> <span class="debug-result">${spellData.targetDefense}</span></div>
                    <div class="debug-breakdown">${formatBreakdown(spellData.targetDefenseBreakdown)}</div>
                    <hr>
                    <h4>Cálculo de Efeito</h4>
                    <div class="grid-row"><span>Resultado do Ataque:</span> <span class="debug-result">${spellData.hit ? 'ACERTOU' : 'ERROU'}</span></div>`;
                }

                if (spellData.hit) {
                    if (spellData.finalDamage !== undefined) {
                        const bonusType = spellData.isMagicalCalculation ? 'BTM' : 'BTD';
                        report += `
                            <div class="grid-row"><span>Rolagem de Dano (${spellData.damageFormula}):</span> <span>${spellData.damageRoll}</span></div>
                            ${spellData.levelBonus ? `<div class="grid-row"><span>Bônus de Nível:</span> <span>+${spellData.levelBonus}</span></div>` : ''}
                            ${spellData.isCrit ? `<div class="grid-row"><span>Dano Crítico (Dobro dos Dados):</span> <span>+${spellData.critDamage}</span></div>` : ''}
                            <div class="grid-row"><span>${bonusType} do Atacante:</span> <span>${spellData.damageBonus >= 0 ? '+' : ''}${spellData.damageBonus}</span></div>
                            <div class="debug-breakdown">${formatBreakdown(spellData.damageBonusBreakdown)}</div>
                            <div class="grid-row"><span>Dano Bruto Total:</span> <span>${spellData.totalDamage}</span></div>
                            <div class="grid-row"><span>vs Proteção do Alvo:</span> <span>-${spellData.targetProtection}</span></div>
                            <div class="debug-breakdown">${formatBreakdown(spellData.protectionBreakdown)}</div>
                            <hr>
                            <div class="final-damage-row"><span>DANO FINAL:</span> <span class="debug-final-damage">${spellData.finalDamage}</span></div>`;
                    }
                    if (spellData.resourceDamage !== undefined) {
                        report += `
                            <hr>
                            <h4>Cálculo de Dano de Mahou</h4>
                            <div class="grid-row"><span>Rolagem de Dano de Mahou (${spellData.damageFormula}):</span> <span>${spellData.damageRoll}</span></div>
                            <hr>
                            <div class="final-damage-row"><span>DANO DE MAHOU:</span> <span class="debug-final-damage" style="color: #007bff">${spellData.resourceDamage}</span></div>`;
                   }
                }
                return report;
            };

            const firstReport = debugReports[0];
            const modalTitle = `Relatório de Magia: <span class="attacker-name">${firstReport.attackerName}</span> usa ${firstReport.spellName}`;
            let contentHtml = '<div class="debug-info-grid">';
            debugReports.forEach((reportData, index) => {
                if (index > 0) contentHtml += '<hr style="border-width: 2px; margin: 15px 0;">';
                contentHtml += buildSpellReport(reportData);
            });
            contentHtml += '</div>';

            showCustomModal(modalTitle, contentHtml, [{ text: 'Fechar', closes: true }]);
        }
    });
    socket.on('fleeResolved', ({ actorKey }) => {
        const actorEl = document.getElementById(actorKey);
        if (actorEl) {
            if (actorEl.classList.contains('player-char-container')) {
                actorEl.classList.add('is-fleeing-player');
            } else {
                actorEl.classList.add('is-fleeing-npc');
            }
        }
    });
    socket.on('showSkillCheckResult', (data) => {
        const { playerName, checkType, roll, bonus, total } = data;
        let resultClass = 'result-normal';
        let critText = '';
        if (roll === 1) {
            resultClass = 'result-crit-fail';
            critText = '<div class="skill-check-crit-text result-crit-fail">ERRO CRÍTICO</div>';
        } else if (roll === 20) {
            resultClass = 'result-crit-success';
            critText = '<div class="skill-check-crit-text result-crit-success">ACERTO CRÍTICO</div>';
        }

        const details = bonus !== 0 ? `1D20(${roll}) + ${bonus}` : `1D20(${roll})`;

        const content = `
            <h4 class="skill-check-result-title">${playerName} rolou ${checkType.toUpperCase()}</h4>
            <p class="skill-check-result-details">${details}</p>
            <div class="skill-check-result-final ${resultClass}">${total}</div>
            ${critText}
        `;
        
        const buttons = [];
        if (isGm) {
            buttons.push({
                text: 'OK',
                onClick: () => {
                    socket.emit('playerAction', { type: 'gmClosesSkillCheck' });
                }
            });
        }

        showCustomModal('', content, buttons, 'skill-check-result-modal');
    });
    socket.on('closeSkillCheckResult', () => {
        modal.classList.add('hidden');
    });
    socket.on('error', (data) => showInfoModal('Erro', data.message));
    
    // --- LÓGICA DE INVOCAÇÃO (CLIENTE) ---
    socket.on('promptForSummon', (data) => {
        showSummonSelectionModal(data);
    });

    socket.on('promptForAdmission', (data) => {
        if (isGm) {
            showCustomModal(
                'Novo Jogador na Batalha',
                `<p>${data.nome} está pronto para entrar na batalha. Deseja admiti-lo agora?</p>`,
                [
                    { text: 'Sim, Admitir', closes: true, onClick: () => socket.emit('playerAction', { type: 'gmDecidesOnAdmission', playerId: data.playerId, admitted: true }) },
                    { text: 'Não, Colocar em Espera', closes: true, className: 'btn-danger', onClick: () => socket.emit('playerAction', { type: 'gmDecidesOnAdmission', playerId: data.playerId, admitted: false }) }
                ]
            );
        }
    });

    function showSummonSelectionModal({ tier, choices, spell }) {
        let contentHtml = `<div class="character-list-container">`;
        choices.forEach(choice => {
            contentHtml += `
                <div class="char-card summon-choice-card" data-choice="${choice.name}">
                    <img src="${choice.img}" alt="${choice.name}">
                    <div class="char-name">${choice.name}</div>
                </div>
            `;
        });
        contentHtml += `</div>`;

        showCustomModal(`Invocar Criatura (Nível ${tier})`, contentHtml, [
            { text: 'Cancelar', closes: true, className: 'btn-danger' }
        ]);

        document.querySelectorAll('.summon-choice-card').forEach(card => {
            card.addEventListener('click', () => {
                const choice = card.dataset.choice;
                socket.emit('playerAction', {
                    type: 'playerSummonsCreature',
                    summonerId: myPlayerKey,
                    spell,
                    choice
                });
                modal.classList.add('hidden');
            });
        });
    }

    // --- FUNÇÃO DE INICIALIZAÇÃO ---
    function initialize() {
        showScreen(document.getElementById('loading-screen'));

        document.getElementById('join-as-player-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'player' }));
        document.getElementById('join-as-spectator-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'spectator' }));
        
        document.getElementById('new-char-btn').addEventListener('click', () => {
            initializeCharacterSheet();
            showScreen(document.getElementById('character-sheet-screen'));
        });
        document.getElementById('load-char-btn').addEventListener('click', () => document.getElementById('load-char-input').click());
        document.getElementById('load-char-input').addEventListener('change', (e) => handleLoadCharacter(e, 'creation'));

        document.querySelectorAll('#character-sheet-screen input, #character-sheet-screen select').forEach(el => {
            el.addEventListener('change', (e) => {
                const isWeaponType = e.target.id.startsWith('sheet-weapon') && e.target.id.endsWith('-type');
                if (isWeaponType) {
                    const weaponSlot = e.target.id.includes('weapon1') ? 'weapon1' : 'weapon2';
                    stagedCharacterSheet[weaponSlot] = { img: null, isRanged: false };
                    updateCharacterSheet(null, e);
                    if (e.target.value !== 'Desarmado') {
                        showWeaponImageSelectionModal(weaponSlot);
                    }
                } else {
                    updateCharacterSheet(null, e);
                }
            });
            if (el.tagName !== 'SELECT' && el.type !== 'file') {
                el.addEventListener('input', (e) => updateCharacterSheet(null, e));
            }
        });
        
        document.getElementById('sheet-save-btn').addEventListener('click', () => handleSaveCharacter('creation'));
        document.getElementById('sheet-confirm-btn').addEventListener('click', handleConfirmCharacter);

        document.getElementById('start-adventure-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsAdventure' }));
        document.getElementById('start-theater-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsTheater' }));
        backToLobbyBtn.addEventListener('click', () => socket.emit('playerAction', { type: 'gmGoesBackToLobby' }));
        document.getElementById('theater-change-scenario-btn').addEventListener('click', () => showScenarioSelectionModal('theater'));
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

        playerInfoWidget.addEventListener('click', toggleIngameSheet);
        document.getElementById('ingame-sheet-close-btn').addEventListener('click', () => {
            const sheetModal = document.getElementById('ingame-sheet-modal');
            if (!sheetModal.classList.contains('gm-view-mode')) {
                handleEquipmentChangeConfirmation();
            }
            handlePointDistributionConfirmation();
        });
        document.getElementById('ingame-sheet-save-btn').addEventListener('click', () => handleSaveCharacter('ingame'));
        document.getElementById('ingame-sheet-load-btn').addEventListener('click', () => document.getElementById('ingame-load-char-input').click());
        document.getElementById('ingame-load-char-input').addEventListener('change', (e) => handleLoadCharacter(e, 'ingame'));
    }
    
    // =============================================================
    // =========== INÍCIO DA EXECUÇÃO DO SCRIPT ===================
    // =============================================================
    initialize();
});