// client.js

document.addEventListener('DOMContentLoaded', () => {
    // --- VARIÁVEIS DE REGRAS DO JOGO (CARREGADAS DE JSON) ---
    let GAME_RULES = {};
    let ALL_SPELLS = {};
    let ALL_WEAPON_IMAGES = {};
    let ALL_ITEMS = {}; 

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

    // --- DEFINIÇÃO DE TODAS AS FUNÇÕES ---

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
        document.getElementById('modal-title').innerHTML = title;
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
        if (!state || !key) return null;
    
        const playerLobbyData = state.connectedPlayers?.[key];
        const lobbySheet = playerLobbyData?.characterSheet;
        const fighterInBattle = state.fighters?.players[key] || state.fighters?.npcs[key];
    
        if (fighterInBattle) {
            return { ...fighterInBattle, sheet: lobbySheet || fighterInBattle.sheet };
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
    function toggleShop() {
        if (!currentGameState || currentGameState.mode !== 'theater' || !shopModal) return;
        isShopOpen = !isShopOpen;
        shopModal.classList.toggle('hidden', !isShopOpen);
        shopModal.classList.toggle('active', isShopOpen);
        if (isShopOpen) {
            renderShopModal();
        } else if (isGm) {
            socket.emit('playerAction', { type: 'gmClosesShop' });
        }
    }
    function renderShopModal() {
        const shopModalContent = document.getElementById('shop-modal-content');
        if (!shopModalContent) return;
        
        if (isGm) {
            renderGmShopPanel(shopModalContent);
        } else {
            renderPlayerShopPanel(shopModalContent);
        }
    }
    function renderGmShopPanel(container) {
        container.innerHTML = '';
    
        const state = currentGameState.shop;
        if (!state) return;
    
        const nonItems = ['Desarmado', 'Nenhuma', 'Nenhum'];
    
        const meleeWeapons = [];
        const rangedWeapons = [];
        const magicWeapons = [];
    
        Object.entries(ALL_WEAPON_IMAGES).forEach(([weaponType, imageSets]) => {
            const weaponData = GAME_RULES.weapons[weaponType];
            if (!weaponData || weaponType === 'Desarmado') return;
    
            const isMagicWeapon = weaponType === 'Cetro' || weaponType === 'Cajado';
    
            if (imageSets.melee && imageSets.melee.length > 0) {
                imageSets.melee.forEach(imgPath => {
                    const itemName = imgPath.split('/').pop().split('.')[0];
                    const itemToAdd = {
                        name: itemName,
                        type: 'weapon',
                        baseType: weaponType,
                        img: imgPath,
                        isRanged: false,
                        ...weaponData
                    };
                    if (isMagicWeapon) {
                        magicWeapons.push(itemToAdd);
                    } else {
                        meleeWeapons.push(itemToAdd);
                    }
                });
            }
    
            if (imageSets.ranged && imageSets.ranged.length > 0) {
                imageSets.ranged.forEach(imgPath => {
                    const itemName = imgPath.split('/').pop().split('.')[0];
                    rangedWeapons.push({
                        name: itemName,
                        type: 'weapon',
                        baseType: weaponType,
                        img: imgPath,
                        isRanged: true,
                        ...weaponData
                    });
                });
            }
        });
    
        const allGameItems = {
            'Armas Corpo a Corpo': meleeWeapons,
            'Armas de Distância': rangedWeapons,
            'Armas Mágicas': magicWeapons,
            'Armaduras': Object.entries(GAME_RULES.armors).map(([name, data]) => ({ name, type: 'armor', ...data })).filter(item => !nonItems.includes(item.name)),
            'Escudos': Object.entries(GAME_RULES.shields).map(([name, data]) => ({ name, type: 'shield', ...data })).filter(item => !nonItems.includes(item.name)),
            'Itens': Object.entries(ALL_ITEMS).map(([name, data]) => ({ name, type: 'item', ...data })),
        };
        
        container.innerHTML = `
            <div class="shop-header">
                <h2>Gerenciador da Loja (GM)</h2>
                <button id="shop-close-btn" class="close-btn">&times;</button>
            </div>
            <div class="shop-layout">
                <div class="shop-selection-panel">
                    <h3>Catálogo de Itens</h3>
                    <div class="shop-tabs"></div>
                    <div class="shop-item-grids-container"></div>
                </div>
                <div class="shop-staging-panel">
                    <h3>Itens à Venda</h3>
                    <div id="shop-staging-area"></div>
                    <button id="shop-publish-btn" class="mode-btn">Publicar Loja para Jogadores</button>
                </div>
            </div>
        `;
        
        const tabsContainer = container.querySelector('.shop-tabs');
        const gridsContainer = container.querySelector('.shop-item-grids-container');
        
        Object.keys(allGameItems).forEach((category, index) => {
            const tabBtn = document.createElement('button');
            tabBtn.className = `shop-tab-btn ${index === 0 ? 'active' : ''}`;
            tabBtn.dataset.category = category;
            tabBtn.textContent = category;
            tabsContainer.appendChild(tabBtn);
            
            const grid = document.createElement('div');
            grid.className = `shop-item-grid ${index === 0 ? 'active' : ''}`;
            grid.id = `shop-grid-${category}`;
            gridsContainer.appendChild(grid);
            
            allGameItems[category].forEach(itemData => {
                const card = document.createElement('div');
                card.className = 'shop-item-card';
                card.title = itemData.description || itemData.name;
                
                let imgPath = itemData.img;
                if (!imgPath) { 
                    if (itemData.type === 'armor' && itemData.name !== 'Nenhuma') {
                        const armorImgName = itemData.name === 'Mediana' ? 'Armadura Mediana' : `Armadura ${itemData.name}`;
                        imgPath = `/images/armas/${armorImgName}.png`.replace(/ /g, '%20');
                    } else if (itemData.type === 'shield' && itemData.name !== 'Nenhum') {
                         const shieldImgName = itemData.name === 'Médio' ? 'Escudo Medio' : `Escudo ${shieldImgName}`;
                         imgPath = `/images/armas/${shieldImgName}.png`.replace(/ /g, '%20');
                    }
                }
                
                card.innerHTML = `
                    <img src="${imgPath || ''}" alt="${itemData.name}" onerror="this.style.display='none'">
                    <div class="shop-item-name">${itemData.name}</div>
                `;
                card.onclick = () => showAddItemToShopModal(itemData);
                grid.appendChild(card);
            });
            
            tabBtn.onclick = () => {
                container.querySelectorAll('.shop-tab-btn, .shop-item-grid').forEach(el => el.classList.remove('active'));
                tabBtn.classList.add('active');
                grid.classList.add('active');
            };
        });

        renderStagedItemsForGm(container.querySelector('#shop-staging-area'));
        
        container.querySelector('#shop-publish-btn').onclick = () => {
             socket.emit('playerAction', { type: 'gmPublishesShop', items: shopStagedItems });
             showInfoModal("Loja Publicada", "Os jogadores agora podem ver e comprar os itens.");
        };

        container.querySelector('#shop-close-btn').onclick = toggleShop;
    }
    function showAddItemToShopModal(itemData) {
        const itemId = itemData.name.replace(/\s+/g, '-');
        const existingItem = shopStagedItems[itemId];

        const content = `
            <div class="npc-config-grid" style="grid-template-columns: auto 1fr; max-width: 300px; margin: auto;">
                <label for="shop-item-price">Preço:</label>
                <input type="number" id="shop-item-price" value="${existingItem ? existingItem.price : (itemData.cost || 10)}" min="0">
                <label for="shop-item-quantity">Quantidade:</label>
                <input type="number" id="shop-item-quantity" value="${existingItem ? existingItem.quantity : 1}" min="1">
            </div>
        `;
        
        showCustomModal(`Adicionar ${itemData.name} à Loja`, content, [
            { text: 'Confirmar', closes: true, onClick: () => {
                const price = parseInt(document.getElementById('shop-item-price').value, 10);
                const quantity = parseInt(document.getElementById('shop-item-quantity').value, 10);
                
                if (price >= 0 && quantity > 0) {
                    shopStagedItems[itemId] = {
                        id: itemId,
                        name: itemData.name,
                        price: price,
                        quantity: quantity,
                        itemData: itemData 
                    };
                    renderStagedItemsForGm(document.getElementById('shop-staging-area'));
                    socket.emit('playerAction', { type: 'gmUpdatesShop', items: shopStagedItems });
                }
            }},
            { text: 'Cancelar', closes: true }
        ]);
    }
    function renderStagedItemsForGm(container) {
        if (!container) return;
        container.innerHTML = '';
        Object.values(shopStagedItems).forEach(stagedItem => {
            const card = document.createElement('div');
            card.className = 'staged-item-card';

            const itemData = stagedItem.itemData;
             let imgPath = itemData.img;
            if (!imgPath) {
                if(itemData.type === 'weapon') {
                   const weaponTypeImages = ALL_WEAPON_IMAGES[itemData.name];
                   if (weaponTypeImages && weaponTypeImages.melee.length > 0) {
                       imgPath = weaponTypeImages.melee[0];
                   }
                } else if (itemData.type === 'armor' && itemData.name !== 'Nenhuma') {
                    const armorImgName = itemData.name === 'Mediana' ? 'Armadura Mediana' : `Armadura ${itemData.name}`;
                    imgPath = `/images/armas/${armorImgName}.png`.replace(/ /g, '%20');
                } else if (itemData.type === 'shield' && itemData.name !== 'Nenhum') {
                     const shieldImgName = itemData.name === 'Médio' ? 'Escudo Medio' : `Escudo ${shieldImgName}`;
                     imgPath = `/images/armas/${shieldImgName}.png`.replace(/ /g, '%20');
                }
            }
            
            card.innerHTML = `
                <button class="remove-staged-npc" style="top:2px; right:2px;">X</button>
                <img src="${imgPath || ''}" alt="${stagedItem.name}" onerror="this.style.display='none'">
                <div class="staged-item-info">
                    <div>${stagedItem.name}</div>
                    <div>Preço: ${stagedItem.price}</div>
                    <div>Qtd: ${stagedItem.quantity}</div>
                </div>
            `;
            card.onclick = (e) => {
                if (e.target.tagName !== 'BUTTON') {
                    showAddItemToShopModal(stagedItem.itemData);
                }
            };
            card.querySelector('button').onclick = () => {
                delete shopStagedItems[stagedItem.id];
                renderStagedItemsForGm(container);
                socket.emit('playerAction', { type: 'gmUpdatesShop', items: shopStagedItems });
            };
            container.appendChild(card);
        });
    }
    function renderPlayerShopPanel(container) {
        container.innerHTML = '';
        const state = currentGameState.shop;
        if (!state || !state.playerItems) return;

        const myFighter = getFighter(currentGameState, myPlayerKey);
        const myMoney = myFighter ? myFighter.money : 0;

        container.innerHTML = `
            <div class="shop-header">
                <h2>Loja</h2>
                <span>Seu Dinheiro: ${myMoney} moedas</span>
            </div>
            <div id="shop-player-view-area"></div>
        `;
        
        const playerViewArea = container.querySelector('#shop-player-view-area');
        
        if (state.playerItems.length === 0) {
            playerViewArea.innerHTML = '<p style="text-align: center; color: #888;">A loja está fechada ou não há itens à venda no momento.</p>';
            return;
        }

        state.playerItems.forEach(shopItem => {
            const card = document.createElement('div');
            card.className = 'shop-item-card player-view';
            card.title = shopItem.itemData.description || `${shopItem.name}\n${shopItem.price > 0 ? 'Preço: ' + shopItem.price + '\n' : ''}Disponível: ${shopItem.quantity}`;

            const itemData = shopItem.itemData;
            let imgPath = itemData.img;
            if (!imgPath) {
                if(itemData.type === 'weapon') {
                   const weaponTypeImages = ALL_WEAPON_IMAGES[itemData.name];
                   if (weaponTypeImages && weaponTypeImages.melee.length > 0) {
                       imgPath = weaponTypeImages.melee[0];
                   }
                } else if (itemData.type === 'armor' && itemData.name !== 'Nenhuma') {
                    const armorImgName = itemData.name === 'Mediana' ? 'Armadura Mediana' : `Armadura ${itemData.name}`;
                    imgPath = `/images/armas/${armorImgName}.png`.replace(/ /g, '%20');
                } else if (itemData.type === 'shield' && itemData.name !== 'Nenhum') {
                     const shieldImgName = itemData.name === 'Médio' ? 'Escudo Medio' : `Escudo ${shieldImgName}`;
                     imgPath = `/images/armas/${shieldImgName}.png`.replace(/ /g, '%20');
                }
            }
            
            const priceHtml = shopItem.price > 0 ? `<div class="shop-item-price">Preço: ${shopItem.price}</div>` : '';

            card.innerHTML = `
                <img src="${imgPath || ''}" alt="${shopItem.name}" onerror="this.style.display='none'">
                <div class="shop-item-name">${shopItem.name}</div>
                ${priceHtml}
            `;
            
            card.onclick = () => showBuyItemModal(shopItem, myMoney);
            playerViewArea.appendChild(card);
        });
    }
    function showBuyItemModal(shopItem, myMoney) {
        const isFree = shopItem.price === 0;
        
        const content = `
            <div style="text-align: center;">
                <p>${shopItem.itemData.description || 'Um item valioso.'}</p>
                <p><strong>Disponível:</strong> ${shopItem.quantity}</p>
                ${isFree ? '' : `
                    <p><strong>Preço:</strong> ${shopItem.price} moedas cada</p>
                    <div class="npc-config-grid" style="grid-template-columns: auto 1fr; max-width: 250px; margin: 20px auto;">
                        <label for="buy-quantity">Quantidade:</label>
                        <input type="number" id="buy-quantity" value="1" min="1" max="${shopItem.quantity}">
                    </div>
                    <p><strong>Custo Total:</strong> <span id="total-cost">${shopItem.price}</span> moedas</p>
                `}
            </div>
        `;
        
        const buyBtn = {
            text: isFree ? 'Pegar' : 'Comprar',
            closes: true,
            onClick: () => {
                const quantity = isFree ? 1 : parseInt(document.getElementById('buy-quantity').value, 10);
                if (quantity > 0) {
                    socket.emit('playerAction', {
                        type: 'playerBuysItem',
                        itemId: shopItem.id,
                        quantity: quantity
                    });
                }
            }
        };

        if (!isFree && myMoney < shopItem.price) {
            buyBtn.className = 'disabled-btn';
        }

        showCustomModal(`${isFree ? 'Pegar' : 'Comprar'} ${shopItem.name}`, content, [
            buyBtn,
            { text: 'Cancelar', closes: true, className: 'btn-danger' }
        ]);
        
        if (!isFree) {
            const quantityInput = document.getElementById('buy-quantity');
            const totalCostSpan = document.getElementById('total-cost');
            const buyButtonInModal = document.querySelector('.modal-button-container button:first-child');
            
            const updateTotal = () => {
                const quantity = parseInt(quantityInput.value, 10) || 0;
                const total = quantity * shopItem.price;
                totalCostSpan.textContent = total;
                if (total > myMoney || quantity <= 0 || quantity > shopItem.quantity) {
                    buyButtonInModal.classList.add('disabled-btn');
                    buyButtonInModal.disabled = true;
                } else {
                    buyButtonInModal.classList.remove('disabled-btn');
                    buyButtonInModal.disabled = false;
                }
            };
            
            quantityInput.oninput = updateTotal;
            updateTotal();
        }
    }

    function handleAdventureMode(gameState) {
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
    function updateAdventureUI(state) {
        if (!state || !state.fighters) return;
        
        fightSceneCharacters.innerHTML = '';
        document.getElementById('round-info').textContent = `ROUND ${state.currentRound}`;
        document.getElementById('fight-log').innerHTML = (state.log || [])
            .filter(entry => entry.type !== 'debug' || isGm)
            .map(entry => `<p class="log-${entry.type || 'info'}">${entry.text}</p>`).join('');
        
        const PLAYER_POSITIONS = [ { left: '150px', top: '450px' }, { left: '250px', top: '350px' }, { left: '350px', top: '250px' }, { left: '450px', top: '150px' } ];
        const NPC_POSITIONS = [ { left: '1000px', top: '450px' }, { left: '900px',  top: '350px' }, { left: '800px',  top: '250px' }, { left: '700px',  top: '150px' }, { left: '1050px', top: '300px' } ];
        
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
        
        if (isGm) {
            container.title = 'Clique direito para aplicar buff/debuff';
            container.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const fighterData = getFighter(currentGameState, fighter.id);
                if (fighterData) {
                    showGMBuffModal(fighterData);
                }
            });
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
                const partHealthPercentage = (part.hpMax > 0) ? (part.hp / part.hpMax) * 100 : 0;
                const isDefeated = part.status === 'down' ? 'defeated' : '';
                healthBarHtml += `
                    <div class="health-bar-ingame-part ${isDefeated}" title="${part.name}: ${part.hp}/${part.hpMax}">
                        <div class="health-bar-ingame-part-fill" style="width: ${partHealthPercentage}%"></div>
                        <span class="health-bar-ingame-part-text">${part.hp}/${part.hpMax}</span>
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
        if (state.phase !== 'battle' || !!state.winner) return;
        const activeFighter = getFighter(state, state.activeCharacterKey);
        if (!activeFighter) return;

        const isNpcTurn = !!state.fighters.npcs[activeFighter.id];
        const canControl = (myRole === 'player' && state.activeCharacterKey === myPlayerKey) || (isGm && isNpcTurn);
        
        const isStunned = activeFighter.activeEffects && activeFighter.activeEffects.some(e => e.status === 'stunned');
        const finalCanControl = canControl && !isStunned;
        
        let attackButtonAdded = false;

        const createButton = (text, onClick, disabled = false, className = 'action-btn', ammoCount = null) => {
            const btn = document.createElement('button');
            btn.className = className;
            btn.textContent = text;
            btn.disabled = disabled;
            btn.onclick = onClick;
            if (ammoCount !== null && ammoCount !== undefined) {
                const ammoEl = document.createElement('span');
                ammoEl.className = 'attack-ammo-counter';
                ammoEl.textContent = ammoCount;
                btn.appendChild(ammoEl);
                if (ammoCount <= 0) btn.disabled = true;
            }
            return btn;
        };

        const createAttackButton = (weaponKey) => {
            const weapon = activeFighter.sheet.equipment[weaponKey];
            if (weapon && weapon.type !== 'Desarmado') {
                const ammo = weapon.isRanged ? activeFighter.ammunition?.[weaponKey] : null;
                const btn = createButton(
                    `Atacar com ${weapon.name} (2 PA)`,
                    () => startAttackSequence(weaponKey),
                    !finalCanControl,
                    'action-btn',
                    ammo
                );
                actionButtonsWrapper.appendChild(btn);
                attackButtonAdded = true;
            }
        };

        createAttackButton('weapon1');
        createAttackButton('weapon2');
        
        if (!attackButtonAdded) {
            const btn = createButton('Atacar Desarmado (2 PA)', () => startAttackSequence('weapon1'), !finalCanControl, 'action-btn');
            actionButtonsWrapper.appendChild(btn);
        }

        const weapon1 = activeFighter.sheet.equipment.weapon1;
        const weapon2 = activeFighter.sheet.equipment.weapon2;
        const isDualWielding = weapon1.type !== 'Desarmado' && weapon2.type !== 'Desarmado';
        
        if (isDualWielding) {
            let ammo1 = weapon1.isRanged ? activeFighter.ammunition?.['weapon1'] : Infinity;
            let ammo2 = weapon2.isRanged ? activeFighter.ammunition?.['weapon2'] : Infinity;
            let dualDisabled = ammo1 <= 0 || ammo2 <= 0;

            const btn = createButton('Ataque Duplo (3 PA)', () => startAttackSequence('dual'), !finalCanControl || dualDisabled, 'action-btn');
            actionButtonsWrapper.appendChild(btn);
        }

        const fighterSpells = activeFighter.sheet?.spells || [];
        if (fighterSpells.length > 0) {
            fighterSpells.forEach(spellName => {
                const allSpells = [...(ALL_SPELLS.grade1 || []), ...(ALL_SPELLS.grade2 || []), ...(ALL_SPELLS.grade3 || [])];
                const spell = allSpells.find(s => s.name === spellName);
                if (spell && spell.inCombat) {
                    const paCost = spell.costPA || 2;
                    const spellBtn = createButton(`${spell.name} (${paCost} PA)`, () => startSpellSequence(spell), !finalCanControl, 'action-btn spell-btn');
                    spellBtn.title = `${spell.description} (Custo: ${spell.costMahou} Mahou)`;
                    actionButtonsWrapper.appendChild(spellBtn);
                }
            });
        }
        
        actionButtonsWrapper.appendChild(createButton('Fugir', () => socket.emit('playerAction', { type: 'flee', actorKey: state.activeCharacterKey }), !finalCanControl, 'action-btn flee-btn'));
        actionButtonsWrapper.appendChild(createButton('Encerrar Turno', () => socket.emit('playerAction', { type: 'end_turn', actorKey: state.activeCharacterKey }), !finalCanControl, 'end-turn-btn'));
    }
    function startAttackSequence(weaponChoice) {
        const attacker = getFighter(currentGameState, currentGameState.activeCharacterKey);
        if (!attacker) return;
        
        targetingAction = { type: 'attack', attackerKey: attacker.id, weaponChoice: weaponChoice };
        isTargeting = true;
        document.getElementById('targeting-indicator').classList.remove('hidden');
    }
    function startSpellSequence(spell) {
        if (spell.targetType === 'self') {
            socket.emit('playerAction', {
                type: 'use_spell',
                attackerKey: currentGameState.activeCharacterKey,
                spellName: spell.name,
                targetKey: currentGameState.activeCharacterKey 
            });
        } else {
            targetingAction = { type: 'use_spell', attackerKey: currentGameState.activeCharacterKey, spellName: spell.name };
            isTargeting = true;
            document.getElementById('targeting-indicator').classList.remove('hidden');
        }
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
                modal.classList.add('hidden');
                const fullNpcData = ALL_CHARACTERS.npcs.find(npc => npc.name === card.dataset.name) || {};
                showNpcConfigModal({ baseData: fullNpcData, slotIndex: parseInt(slotIndex, 10) });
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
        const content = `<div style="text-align: left; font-size: 1.2em; line-height: 1.8;">
            <p><b>P:</b> Abrir menu de Cheats (GM).</p>
            <p><b>M:</b> Ativar/Desativar modo de depuração de combate (GM).</p>
            <p><b>T:</b> Mostrar/Ocultar coordenadas do mouse.</p>
            <p><b>J:</b> Ativar/Desativar modo de arrastar personagens (GM).</p>
            <p><b>I:</b> Abrir/Fechar loja (GM - Modo Cenário).</p>
        </div>`;
        showInfoModal("Atalhos do Teclado", content);
    }
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
                if (isGm) e.dataTransfer.setData('application/json', JSON.stringify({ charName: data.name, img: data.img, isFlipped: false, scale: 1.0 }));
            });
            theaterCharList.appendChild(mini);
        };
        [...(ALL_CHARACTERS.players || []), ...(ALL_CHARACTERS.npcs || []), ...(ALL_CHARACTERS.dynamic || [])].forEach(createMini);
    }
    function renderTheaterMode(state) {
        if (isDragging) return;
        const dataToRender = isGm ? state.scenarioStates?.[state.currentScenario] : state.publicState;
        if (!dataToRender || !dataToRender.scenario) return;

        const scenarioUrl = `/images/${dataToRender.scenario}`;
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
        document.getElementById('theater-publish-btn').classList.toggle('hidden', !isGm || !dataToRender.isStaging);
        
        if (isGm) theaterGlobalScale.value = dataToRender.globalTokenScale || 1.0;
        
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
            
            if (isGm && tokenData.isHidden) {
                tokenEl.classList.add('hidden-token');
            }
            
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
                    if (!e.ctrlKey && !selectedTokens.has(tokenElement.id)) {
                        selectedTokens.clear();
                    }
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
                    selectedTokens.clear();
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
                const scenarioState = currentGameState.scenarioStates[currentGameState.currentScenario];
                const scenarioWidth = scenarioState.scenarioWidth;
                const scenarioHeight = scenarioState.scenarioHeight;

                selectedTokens.forEach(id => {
                    const initialPos = dragOffsets.get(id);
                    if (initialPos) {
                        const finalX = initialPos.startX + deltaX;
                        const finalY = initialPos.startY + deltaY;
                        const isHidden = scenarioWidth ? (finalX < 0 || finalX > scenarioWidth || finalY < 0 || finalY > scenarioHeight) : false;
                        socket.emit('playerAction', { type: 'updateToken', token: { id, x: finalX, y: finalY, isHidden: isHidden } });
                    }
                });
            } else if (isGm && isSelectingBox) {
                const boxRect = selectionBox.getBoundingClientRect();
                isSelectingBox = false;
                selectionBox.classList.add('hidden');
                if (!e.ctrlKey) selectedTokens.clear();
                document.querySelectorAll('.theater-token').forEach(token => {
                    const tokenRect = token.getBoundingClientRect();
                    if (boxRect.left < tokenRect.right && boxRect.right > tokenRect.left && boxRect.top < tokenRect.bottom && boxRect.bottom > tokenRect.top) {
                        if(e.ctrlKey) {
                             selectedTokens.has(token.id) ? selectedTokens.delete(token.id) : selectedTokens.add(token.id);
                        } else {
                            selectedTokens.add(token.id);
                        }
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
                socket.emit('playerAction', { type: 'updateToken', token: { id: `token-${Date.now()}`, charName: data.charName, img: data.img, x: finalX, y: finalY, scale: 1.0, isFlipped: false, isHidden: false }});
            } catch (error) { console.error("Drop error:", error); }
        });
        viewport.addEventListener('dragover', (e) => e.preventDefault());
        viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (isGm && hoveredTokenId && selectedTokens.has(hoveredTokenId)) {
                const tokenData = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[hoveredTokenId];
                if (tokenData) {
                    const newScale = (tokenData.scale || 1.0) + (e.deltaY > 0 ? -0.15 : 0.15); 
                    selectedTokens.forEach(id => socket.emit('playerAction', { type: 'updateToken', token: { id, scale: Math.max(0.1, newScale) }}));
                }
            } else {
                const zoomIntensity = 0.1, scrollDirection = e.deltaY < 0 ? 1 : -1; 
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

            const focusedEl = document.activeElement;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(focusedEl.tagName)) {
                 if (e.key === 'Escape' && shopModal.classList.contains('active')) {
                    toggleShop();
                }
                return;
            }

            if (currentGameState.mode === 'adventure' && isTargeting && e.key === 'Escape') {
                cancelTargeting();
                return;
            }
            
            if (e.key.toLowerCase() === 'p' && isGm && currentGameState.mode === 'adventure') {
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
            
            if (currentGameState.mode === 'theater' && e.key.toLowerCase() === 'i') {
                e.preventDefault();
                toggleShop();
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
    function showScenarioSelectionModal(){
        let contentHtml = '<div class="category-tabs">';
        const categories = Object.keys(ALL_SCENARIOS);
        categories.forEach((category, index) => {
            contentHtml += `<button class="category-tab-btn ${index === 0 ? "active" : ""}" data-category="${category}">${category.replace(/_/g, " ")}</button>`;
        });
        contentHtml += '</div>';
    
        categories.forEach((category, index) => {
            contentHtml += `<div class="scenarios-grid ${index === 0 ? "active" : ""}" id="grid-${category}">`;
            ALL_SCENARIOS[category].forEach(path => {
                const name = path.split('/').pop().replace('.png', '').replace('.jpg', '');
                contentHtml += `<div class="scenario-card" data-path="${path}"><img src="images/mapas/${path}" alt="${name}"><div class="scenario-name">${name}</div></div>`;
            });
            contentHtml += '</div>';
        });
    
        showCustomModal("Mudar Cenário", contentHtml, []);
    
        document.querySelectorAll(".category-tab-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".category-tab-btn, .scenarios-grid").forEach(el => el.classList.remove("active"));
                btn.classList.add("active");
                document.getElementById(`grid-${btn.dataset.category}`).classList.add("active");
            });
        });
        document.querySelectorAll(".scenario-card").forEach(card => {
            card.addEventListener("click", () => {
                const path = card.dataset.path;
                socket.emit("playerAction", { type: 'changeScenario', scenario: path });
                modal.classList.add("hidden");
            });
        });
    }
    function initializeCharacterSheet() {
        stagedCharacterSheet.spells = []; 
        stagedCharacterSheet.weapon1 = { img: null, isRanged: false };
        stagedCharacterSheet.weapon2 = { img: null, isRanged: false };

        const raceSelect = document.getElementById('sheet-race-select');
        raceSelect.innerHTML = Object.keys(GAME_RULES.races).map(race => `<option value="${race}">${race}</option>`).join('');

        const createEquipmentOptions = (type) => {
            return Object.entries(GAME_RULES[type])
                .map(([name, data]) => `<option value="${name}">${name} (${data.cost} moedas)</option>`)
                .join('');
        };

        const weapon1Select = document.getElementById('sheet-weapon1-type');
        const weapon2Select = document.getElementById('sheet-weapon2-type');
        weapon1Select.innerHTML = createEquipmentOptions('weapons');
        weapon2Select.innerHTML = createEquipmentOptions('weapons');

        document.getElementById('sheet-armor-type').innerHTML = createEquipmentOptions('armors');
        document.getElementById('sheet-shield-type').innerHTML = createEquipmentOptions('shields');

        document.querySelectorAll('.number-input-wrapper input').forEach(input => input.readOnly = true);
        
        document.querySelectorAll('.arrow-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const wrapper = e.target.closest('.number-input-wrapper');
                const input = wrapper.querySelector('input');
                let value = parseInt(input.value, 10);
                if (e.target.classList.contains('up-arrow')) {
                    if (e.target.disabled) return;
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
    function updateCharacterSheet(loadedData = null) {
        if (!GAME_RULES.races) return; 
        
        document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
        
        const weapon1Select = document.getElementById('sheet-weapon1-type');
        const weapon2Select = document.getElementById('sheet-weapon2-type');
        const shieldSelect = document.getElementById('sheet-shield-type');
        const armorSelect = document.getElementById('sheet-armor-type');
        
        const selectedRace = loadedData ? loadedData.race : document.getElementById('sheet-race-select').value;
        const raceData = GAME_RULES.races[selectedRace];
        const baseAttributes = loadedData ? loadedData.baseAttributes : {
            forca: parseInt(document.getElementById('sheet-base-attr-forca').value) || 0, agilidade: parseInt(document.getElementById('sheet-base-attr-agilidade').value) || 0,
            protecao: parseInt(document.getElementById('sheet-base-attr-protecao').value) || 0, constituicao: parseInt(document.getElementById('sheet-base-attr-constituicao').value) || 0,
            inteligencia: parseInt(document.getElementById('sheet-base-attr-inteligencia').value) || 0, mente: parseInt(document.getElementById('sheet-base-attr-mente').value) || 0,
        };
        const elements = loadedData ? loadedData.elements : {
            fogo: parseInt(document.getElementById('sheet-elem-fogo').value) || 0, agua: parseInt(document.getElementById('sheet-elem-agua').value) || 0,
            terra: parseInt(document.getElementById('sheet-elem-terra').value) || 0, vento: parseInt(document.getElementById('sheet-elem-vento').value) || 0,
            luz: parseInt(document.getElementById('sheet-elem-luz').value) || 0, escuridao: parseInt(document.getElementById('sheet-elem-escuridao').value) || 0,
        };
        
        let finalAttributes = { ...baseAttributes };
        if (raceData && raceData.bon) Object.keys(raceData.bon).forEach(attr => { if(attr !== 'escolha') finalAttributes[attr] += raceData.bon[attr]; });
        if (raceData && raceData.pen) Object.keys(raceData.pen).forEach(attr => finalAttributes[attr] += raceData.pen[attr]);
        
        const canWield2HInOneHand = finalAttributes.forca >= 4;

        let weapon1Data = GAME_RULES.weapons[weapon1Select.value] || {};
        let weapon2Data = GAME_RULES.weapons[weapon2Select.value] || {};

        if (weapon1Data.hand === 2 && !canWield2HInOneHand) {
            if (weapon2Select.value !== 'Desarmado') {
                weapon2Select.value = 'Desarmado';
                stagedCharacterSheet.weapon2 = { img: null, isRanged: false };
            }
            if (shieldSelect.value !== 'Nenhum') shieldSelect.value = 'Nenhum';
        }
        if (weapon2Data.hand === 2 && !canWield2HInOneHand) {
            if (weapon1Select.value !== 'Desarmado') {
                weapon1Select.value = 'Desarmado';
                stagedCharacterSheet.weapon1 = { img: null, isRanged: false };
            }
            if (shieldSelect.value !== 'Nenhum') shieldSelect.value = 'Nenhum';
        }

        if (weapon2Select.value !== 'Desarmado' && shieldSelect.value !== 'Nenhum') {
            shieldSelect.value = 'Nenhum';
        }
        
        const weapon1Type = weapon1Select.value;
        const weapon2Type = weapon2Select.value;
        const shieldType = shieldSelect.value;
        const armorType = armorSelect.value;
        weapon1Data = GAME_RULES.weapons[weapon1Type] || {};
        weapon2Data = GAME_RULES.weapons[weapon2Type] || {};
        let armorData = GAME_RULES.armors[armorType] || {};
        let shieldData = GAME_RULES.shields[shieldType] || {};

        weapon2Select.disabled = (weapon1Data.hand === 2 && !canWield2HInOneHand) || shieldType !== 'Nenhum';
        shieldSelect.disabled = weapon2Type !== 'Desarmado' || (weapon1Data.hand === 2 && !canWield2HInOneHand);

        const imgPath1 = stagedCharacterSheet.weapon1.img;
        document.getElementById('sheet-weapon1-image').style.backgroundImage = imgPath1 ? `url("${imgPath1}")` : 'none';
        const imgPath2 = stagedCharacterSheet.weapon2.img;
        document.getElementById('sheet-weapon2-image').style.backgroundImage = imgPath2 ? `url("${imgPath2}")` : 'none';

        const armorImgDiv = document.getElementById('sheet-armor-image');
        const armorImgName = armorType === 'Mediana' ? 'Armadura Mediana' : `Armadura ${armorType}`;
        armorImgDiv.style.backgroundImage = (armorType !== 'Nenhuma') ? `url("/images/armas/${armorImgName}.png")`.replace(/ /g, '%20') : 'none';
        
        const shieldImgDiv = document.getElementById('sheet-shield-image');
        const shieldImgName = shieldType === 'Médio' ? 'Escudo Medio' : `Escudo ${shieldType}`;
        shieldImgDiv.style.backgroundImage = (shieldType !== 'Nenhum') ? `url("/images/armas/${shieldImgName}.png")`.replace(/ /g, '%20') : 'none';


        let cost = (weapon1Data.cost || 0) + (weapon2Data.cost || 0) + (armorData.cost || 0) + (shieldData.cost || 0);
        if (cost > 200 && event && event.target && event.type === 'change') {
            alert("Dinheiro insuficiente!");
            const changedElement = event.target;
            changedElement.value = (changedElement.id.includes('weapon')) ? "Desarmado" : (changedElement.id.includes('armor') ? "Nenhuma" : "Nenhum");
            return updateCharacterSheet();
        }
        
        document.getElementById('sheet-money-copper').textContent = 200 - cost;
        
        let maxAttrPoints = 5 + (raceData.bon?.escolha || 0);
        const totalAttrPoints = Object.values(baseAttributes).reduce((sum, val) => sum + val, 0);
        const attrPointsRemaining = maxAttrPoints - totalAttrPoints;
        document.getElementById('sheet-points-attr-remaining').textContent = attrPointsRemaining;
        document.querySelectorAll('#attribute-points-header ~ .attributes-grid .up-arrow').forEach(btn => btn.disabled = attrPointsRemaining <= 0);

        const maxElemPoints = 2;
        const totalElemPoints = Object.values(elements).reduce((sum, val) => sum + val, 0);
        const elemPointsRemaining = maxElemPoints - totalElemPoints;
        document.getElementById('sheet-points-elem-remaining').textContent = elemPointsRemaining;
        document.querySelectorAll('.elements-grid .up-arrow').forEach(btn => btn.disabled = elemPointsRemaining <= 0);

        let infoText = '';
        if ((weapon1Data.hand === 2 || weapon2Data.hand === 2) && !canWield2HInOneHand) {
            infoText += 'Arma de 2 mãos requer ambas as mãos. É preciso 4 de Força para usá-la com uma mão. ';
        }

        let bta = finalAttributes.agilidade;
        let weaponBtaMod = weapon1Data.bta || 0;
        if (weapon1Type !== 'Desarmado' && weapon2Type !== 'Desarmado') {
             weaponBtaMod = Math.min(weapon1Data.bta || 0, weapon2Data.bta || 0);
        }
        bta += weaponBtaMod;
        bta += (armorData.esq_mod || 0);
        bta += (shieldData.esq_mod || 0);
        document.getElementById('sheet-bta').textContent = bta >= 0 ? `+${bta}` : bta;
        
        let btdAttribute = finalAttributes.forca;
        if ((weapon1Type !== 'Desarmado' && stagedCharacterSheet.weapon1.isRanged) || 
            (weapon2Type !== 'Desarmado' && stagedCharacterSheet.weapon2.isRanged)) {
            btdAttribute = finalAttributes.agilidade;
        }

        let btd = btdAttribute + (weapon1Data.btd || 0);
        if (weapon1Type !== 'Desarmado' && weapon2Type !== 'Desarmado') btd -= 1;
        document.getElementById('sheet-btd').textContent = btd >= 0 ? `+${btd}` : btd;

        let btm = finalAttributes.inteligencia + (weapon1Data.btm || 0);
        document.getElementById('sheet-btm').textContent = btm >= 0 ? `+${btm}` : btm;

        let esq = 10 + finalAttributes.agilidade;
        let weaponEsqMod = weapon1Data.esq_mod || 0;
        if (weapon1Type !== 'Desarmado' && weapon2Type !== 'Desarmado') {
            weaponEsqMod = Math.min(weapon1Data.esq_mod || 0, weapon2Data.esq_mod || 0);
        }
        esq += weaponEsqMod;
        esq += (armorData.esq_mod || 0);
        esq += (shieldData.esq_mod || 0);
        document.getElementById('sheet-esq').textContent = esq;
        
        finalAttributes.protecao += (armorData.protection || 0);
        finalAttributes.protecao += (shieldData.protection_bonus || 0);
        
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
            if (stagedCharacterSheet.spells.includes(spell.name)) {
                card.classList.add('selected');
            }
            card.addEventListener('click', () => {
                if (stagedCharacterSheet.spells.includes(spell.name)) {
                    stagedCharacterSheet.spells = stagedCharacterSheet.spells.filter(s => s !== spell.name);
                } else if (stagedCharacterSheet.spells.length < 2) {
                    stagedCharacterSheet.spells.push(spell.name);
                } else {
                    alert("Você pode escolher no máximo 2 magias iniciais.");
                }
                updateCharacterSheet();
            });
            spellGrid.appendChild(card);
        });
        
        document.getElementById('sheet-spells-selected-count').textContent = stagedCharacterSheet.spells.length;
    }
    function showWeaponImageSelectionModal(weaponSlot) {
        const weaponType = document.getElementById(`sheet-${weaponSlot}-type`).value;
        const images = ALL_WEAPON_IMAGES[weaponType];
        
        if (!images || (images.melee.length === 0 && images.ranged.length === 0)) {
            stagedCharacterSheet[weaponSlot] = { img: null, isRanged: false };
            updateCharacterSheet();
            return;
        }

        const modalBody = document.getElementById('weapon-image-modal-body');
        modalBody.innerHTML = '';

        const createSection = (title, imageList, isRanged) => {
            if (imageList.length > 0) {
                const categoryDiv = document.createElement('div');
                categoryDiv.className = 'weapon-image-category';
                categoryDiv.innerHTML = `<h4>${title}</h4>`;
                
                const grid = document.createElement('div');
                grid.className = 'weapon-image-grid';
                
                imageList.forEach(imgPath => {
                    const card = document.createElement('div');
                    card.className = 'weapon-image-card';
                    card.innerHTML = `<img src="${imgPath}" alt="weapon image">`;
                    card.onclick = () => {
                        stagedCharacterSheet[weaponSlot] = { img: imgPath, isRanged: isRanged };
                        weaponImageModal.classList.add('hidden');
                        updateCharacterSheet();
                    };
                    grid.appendChild(card);
                });
                
                categoryDiv.appendChild(grid);
                modalBody.appendChild(categoryDiv);
            }
        };

        createSection('Armas Corpo a Corpo', images.melee, false);
        createSection('Armas de Longa Distância', images.ranged, true);
        
        weaponImageModal.classList.remove('hidden');
    }
    function getCharacterSheetData(context) {
        const isCreation = context === 'creation';
        const prefix = isCreation ? 'sheet' : 'ingame-sheet';
        const myFighter = isCreation ? null : getFighter(currentGameState, myPlayerKey);

        const finalAttributes = {};
        const attrSelector = isCreation ? '#character-sheet-screen .final-attributes .attr-item' : '#ingame-sheet-attributes .attr-item';
        document.querySelectorAll(attrSelector).forEach(item => {
            const label = item.querySelector('label').textContent.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const value = parseInt(item.querySelector('span').textContent, 10);
            finalAttributes[label] = value;
        });
        
        const weapon1Select = document.getElementById(`${prefix}-weapon1-type`);
        const weapon2Select = document.getElementById(`${prefix}-weapon2-type`);
        const weapon1Type = weapon1Select.value;
        const weapon2Type = weapon2Select.value;

        let weapon1, weapon2;

        if (isCreation) {
            weapon1 = { name: (document.getElementById('sheet-weapon1-name').value.trim() || weapon1Type), type: weapon1Type, ...stagedCharacterSheet.weapon1 };
            weapon2 = { name: (document.getElementById('sheet-weapon2-name').value.trim() || weapon2Type), type: weapon2Type, ...stagedCharacterSheet.weapon2 };
        } else {
            const w1Item = myFighter.inventory[weapon1Type] || { baseType: 'Desarmado', img: null, isRanged: false };
            const w2Item = myFighter.inventory[weapon2Type] || { baseType: 'Desarmado', img: null, isRanged: false };
            weapon1 = { name: weapon1Type, type: w1Item.baseType, img: w1Item.img, isRanged: w1Item.isRanged };
            weapon2 = { name: weapon2Type, type: w2Item.baseType, img: w2Item.img, isRanged: w2Item.isRanged };
        }

        const data = {
            name: isCreation ? document.getElementById('sheet-name').value : myFighter.sheet.name,
            tokenName: isCreation ? stagedCharacterSheet.tokenName : myFighter.sheet.tokenName,
            tokenImg: isCreation ? stagedCharacterSheet.tokenImg : myFighter.sheet.tokenImg,
            class: isCreation ? document.getElementById('sheet-class').value : myFighter.sheet.class,
            race: isCreation ? document.getElementById('sheet-race-select').value : myFighter.sheet.race,
            money: parseInt(document.getElementById(isCreation ? 'sheet-money-copper' : 'ingame-sheet-money')?.textContent || '0', 10),
            level: myFighter?.level || 1,
            xp: myFighter?.xp || 0,
            xpNeeded: myFighter?.xpNeeded || 100,
            baseAttributes: {},
            finalAttributes: finalAttributes,
            elements: {},
            equipment: {
                weapon1: weapon1,
                weapon2: weapon2,
                armor: document.getElementById(`${prefix}-armor-type`).value,
                shield: document.getElementById(`${prefix}-shield-type`).value,
            },
            spells: isCreation ? [...stagedCharacterSheet.spells] : [...myFighter.sheet.spells]
        };

        if (isCreation) {
            ['forca', 'agilidade', 'protecao', 'constituicao', 'inteligencia', 'mente'].forEach(attr => {
                data.baseAttributes[attr] = parseInt(document.getElementById(`sheet-base-attr-${attr}`).value) || 0;
            });
            ['fogo', 'agua', 'terra', 'vento', 'luz', 'escuridao'].forEach(elem => {
                data.elements[elem] = parseInt(document.getElementById(`sheet-elem-${elem}`).value) || 0;
            });
        } else {
            data.baseAttributes = myFighter.sheet.baseAttributes;
            data.elements = myFighter.sheet.elements;
            data.inventory = myFighter.inventory;
            data.ammunition = myFighter.ammunition;
            data.hp = myFighter.hp;
            data.mahou = myFighter.mahou;
        }

        return data;
    }
    function encryptData(data) {
        try {
            const jsonString = JSON.stringify(data);
            return btoa(unescape(encodeURIComponent(jsonString)));
        } catch (e) {
            console.error("Erro ao codificar dados:", e);
            return null;
        }
    }
    function decryptData(encodedData) {
        try {
            const jsonString = decodeURIComponent(escape(atob(encodedData)));
            return JSON.parse(jsonString);
        } catch (e) {
            console.error("Erro ao decodificar dados:", e);
            return null;
        }
    }
    function handleSaveCharacter(context) {
        const sheetData = getCharacterSheetData(context);
        const characterName = sheetData.name || sheetData.tokenName;
        if (!characterName) {
            alert("Por favor, dê um nome ao seu personagem antes de salvar.");
            return;
        }
        const encryptedData = encryptData(sheetData);
        if (!encryptedData) return;

        const blob = new Blob([encryptedData], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${characterName.replace(/\s+/g, '_')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    function handleLoadCharacter(event, context) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const decryptedData = decryptData(e.target.result);
                if (!decryptedData) throw new Error("Arquivo inválido ou corrompido.");
                
                if (context === 'creation') {
                    initializeCharacterSheet();
                    if (!GAME_RULES.races[decryptedData.race]) {
                        throw new Error(`Raça "${decryptedData.race}" do arquivo não é válida nas regras atuais do jogo.`);
                    }
                    stagedCharacterSheet.tokenName = decryptedData.tokenName || '';
                    stagedCharacterSheet.tokenImg = decryptedData.tokenImg || '';
                    stagedCharacterSheet.spells = decryptedData.spells || [];
                    stagedCharacterSheet.weapon1 = decryptedData.equipment?.weapon1 || { img: null, isRanged: false, type: 'Desarmado' };
                    stagedCharacterSheet.weapon2 = decryptedData.equipment?.weapon2 || { img: null, isRanged: false, type: 'Desarmado' };
                    
                    document.getElementById('sheet-name').value = decryptedData.name || '';
                    document.getElementById('sheet-class').value = decryptedData.class || '';
                    document.getElementById('sheet-race-select').value = decryptedData.race || 'Humano';

                    Object.keys(decryptedData.baseAttributes || {}).forEach(attr => {
                        const input = document.getElementById(`sheet-base-attr-${attr}`);
                        if (input) input.value = decryptedData.baseAttributes[attr];
                    });
                    Object.keys(decryptedData.elements || {}).forEach(elem => {
                         const input = document.getElementById(`sheet-elem-${elem}`);
                         if (input) input.value = decryptedData.elements[elem];
                    });
                    
                    const w1 = stagedCharacterSheet.weapon1;
                    const w2 = stagedCharacterSheet.weapon2;
                    document.getElementById('sheet-weapon1-name').value = (w1.name && w1.name !== w1.type) ? w1.name : '';
                    document.getElementById('sheet-weapon1-type').value = w1.type || 'Desarmado';
                    document.getElementById('sheet-weapon2-name').value = (w2.name && w2.name !== w2.type) ? w2.name : '';
                    document.getElementById('sheet-weapon2-type').value = w2.type || 'Desarmado';
                    document.getElementById('sheet-armor-type').value = decryptedData.equipment?.armor || 'Nenhuma';
                    document.getElementById('sheet-shield-type').value = decryptedData.equipment?.shield || 'Nenhum';

                    updateCharacterSheet();
                    showScreen(document.getElementById('character-sheet-screen'));
                } else if (context === 'ingame') {
                    socket.emit('playerAction', {
                        type: 'playerLoadsCharacterIngame',
                        characterData: decryptedData
                    });
                    showInfoModal("Sucesso", "Personagem carregado! A ficha será atualizada em breve.");
                    toggleIngameSheet(); 
                }
            } catch (error) {
                alert(`Erro ao carregar a ficha: ${error.message}`);
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    }
    function handleConfirmCharacter() {
        if (stagedCharacterSheet.spells.length > 2) {
            alert("Você só pode escolher até 2 magias iniciais. Por favor, desmarque o excedente.");
            return;
        }

        const attrPointsRemaining = parseInt(document.getElementById('sheet-points-attr-remaining').textContent, 10);
        const elemPointsRemaining = parseInt(document.getElementById('sheet-points-elem-remaining').textContent, 10);

        let warnings = [];
        if(attrPointsRemaining > 0) warnings.push(`Você ainda tem ${attrPointsRemaining} pontos de atributo para distribuir.`);
        if(elemPointsRemaining > 0) warnings.push(`Você ainda tem ${elemPointsRemaining} pontos de elemento para distribuir.`);
        if(stagedCharacterSheet.spells.length === 0) warnings.push(`Você não selecionou nenhuma magia inicial.`);

        const sendData = () => {
            const finalSheet = getCharacterSheetData('creation');

            socket.emit('playerAction', { 
                type: 'playerFinalizesCharacter', 
                characterData: finalSheet,
                weaponImages: {
                    weapon1: stagedCharacterSheet.weapon1.img,
                    weapon2: stagedCharacterSheet.weapon2.img
                },
                isRanged: {
                    weapon1: stagedCharacterSheet.weapon1.isRanged,
                    weapon2: stagedCharacterSheet.weapon2.isRanged
                }
            });
            showScreen(document.getElementById('player-waiting-screen'));
            document.getElementById('player-waiting-message').innerText = "Personagem enviado! Aguardando o Mestre...";
        };

        if(warnings.length > 0) {
            let warningText = "Os seguintes itens não foram completados:<br><ul>" + warnings.map(w => `<li>${w}</li>`).join('') + "</ul>Deseja continuar mesmo assim?";
            showCustomModal("Aviso", warningText, [
                { text: 'Sim, continuar', closes: true, onClick: sendData },
                { text: 'Não, voltar', closes: true, className: 'btn-danger' }
            ]);
        } else {
            sendData();
        }
    }
    
    // --- INICIALIZAÇÃO E LISTENERS DE SOCKET ---
    socket.on('initialData', (data) => {
        GAME_RULES = data.rules;
        ALL_SPELLS = data.spells;
        ALL_WEAPON_IMAGES = data.weaponImages;
        ALL_ITEMS = data.items || {};
        ALL_CHARACTERS = data.characters || { players: [], npcs: [], dynamic: [] };
        ALL_SCENARIOS = data.scenarios || {};
    
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoomId = urlParams.get('room');

        if (urlRoomId) {
            socket.emit('playerJoinsLobby', { roomId: urlRoomId });
        } else {
            socket.emit('gmCreatesLobby');
        }

        scaleGame();
    });

    socket.on('gameUpdate', (gameState) => { 
        if (clientFlowState === 'initializing') return;
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
        clientFlowState = 'in_game';
        if (myRole === 'player') showScreen(document.getElementById('player-initial-choice-screen'));

        if (currentGameState) {
            renderGame(currentGameState);
        }
    });
    socket.on('promptForAdventureType', () => { if (isGm) showCustomModal('Retornar à Aventura', 'Deseja continuar a aventura anterior ou começar uma nova batalha?', [{text: 'Continuar Batalha', closes: true, onClick: () => socket.emit('playerAction', { type: 'gmChoosesAdventureType', choice: 'continue' })}, {text: 'Nova Batalha', closes: true, onClick: () => socket.emit('playerAction', { type: 'gmChoosesAdventureType', choice: 'new' })}]); });
    
    socket.on('visualEffectTriggered', ({ casterId, targetId, animation }) => {
        const casterEl = document.getElementById(casterId);
        const targetEl = document.getElementById(targetId);
        if (!casterEl || !targetEl) return;
    
        const effectEl = document.createElement('div');
        const gameWrapperRect = gameWrapper.getBoundingClientRect();
        const gameScale = getGameScale();
    
        const casterRect = casterEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
    
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
            const effectX = (animation.startsWith('self')) ? startX : endX;
            const effectY = (animation.startsWith('self')) ? startY : endY;
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

            setTimeout(() => {
                textEl.remove();
            }, 2000);
        }, textsForDelay * 100);
    });

    socket.on('attackResolved', ({ attackerKey, targetKey, hit, debugInfo, isDual }) => {

        const playAttackAnimation = (isSecondAttack = false) => {
            const attackerEl = document.getElementById(attackerKey);
            if (attackerEl) {
                const isPlayer = attackerEl.classList.contains('player-char-container');
                const originalLeft = attackerEl.style.left;
                attackerEl.style.left = `${parseFloat(originalLeft) + (isPlayer ? 200 : -200)}px`;
                setTimeout(() => { attackerEl.style.left = originalLeft; }, 500);
            }
            const targetEl = document.getElementById(targetKey);
            const currentHit = isDual ? (isSecondAttack ? debugInfo.attack2?.hit : debugInfo.attack1?.hit) : hit;
            if (targetEl && currentHit) {
                const img = targetEl.querySelector('.fighter-img-ingame');
                if (img) {
                    img.classList.add('is-hit-flash');
                    setTimeout(() => img.classList.remove('is-hit-flash'), 400);
                }
            }
        };

        playAttackAnimation(false);
        if (isDual) {
            setTimeout(() => playAttackAnimation(true), 800);
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
                        <div class="grid-row"><span>Dano Bruto Total:</span> <span>${attackData.totalDamage}</span></div>
                        <div class="grid-row"><span>vs Proteção do Alvo:</span> <span>-${attackData.targetProtection}</span></div>
                        <div class="debug-breakdown">${formatBreakdown(attackData.protectionBreakdown)}</div>
                        <hr>
                        <div class="final-damage-row"><span>DANO FINAL:</span> <span class="debug-final-damage">${attackData.finalDamage}</span></div>`;
                }
                return report;
            };

            let contentHtml = '<div class="debug-info-grid">';
            let modalTitle = `Relatório: <span class="attacker-name">${debugInfo.attackerName}</span> ataca <span class="defender-name">${debugInfo.targetName}</span>`;

            if (isDual) {
                contentHtml += '<h3>Ataque 1</h3>' + buildAttackReport(debugInfo.attack1);
                contentHtml += '<hr style="border-width: 2px; margin: 15px 0;">';
                contentHtml += '<h3>Ataque 2</h3>' + buildAttackReport(debugInfo.attack2);
            } else {
                contentHtml += buildAttackReport(debugInfo);
            }
            contentHtml += '</div>';

            showCustomModal(modalTitle, contentHtml, [
                { text: 'Fechar', closes: true }
            ]);
        }
    });
     socket.on('spellResolved', ({ debugInfo }) => {
        if (isGm && isGmDebugModeActive && debugInfo) {
            const formatBreakdown = (breakdown) => {
                if (!breakdown) return '';
                return Object.entries(breakdown)
                    .map(([key, value]) => `<div class="breakdown-item"><span>${key}:</span> <span>${value >= 0 ? '+' : ''}${value}</span></div>`)
                    .join('');
            };

            const buildSpellReport = (spellData) => {
                if (!spellData) return '<p>Falha ao resolver magia.</p>';
                 const defenseType = spellData.isPureMagic ? 'Defesa Mágica' : 'Esquiva';
                let report = `<h4>Cálculo de Acerto (Magia: ${spellData.spellName})</h4>`;
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
                        report += `
                            <div class="grid-row"><span>Rolagem de Dano (${spellData.damageFormula}):</span> <span>${spellData.damageRoll}</span></div>
                            ${spellData.levelBonus ? `<div class="grid-row"><span>Bônus de Nível:</span> <span>+${spellData.levelBonus}</span></div>` : ''}
                            ${spellData.isCrit ? `<div class="grid-row"><span>Dano Crítico (Dobro dos Dados):</span> <span>+${spellData.critDamage}</span></div>` : ''}
                            <div class="grid-row"><span>BTM do Atacante:</span> <span>${spellData.btm >= 0 ? '+' : ''}${spellData.btm}</span></div>
                            <div class="debug-breakdown">${formatBreakdown(spellData.btmBreakdown)}</div>
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

            const contentHtml = `<div class="debug-info-grid">${buildSpellReport(debugInfo)}</div>`;
            const modalTitle = `Relatório de Magia: <span class="attacker-name">${debugInfo.attackerName}</span> usa ${debugInfo.spellName} em <span class="defender-name">${debugInfo.targetName}</span>`;

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
    socket.on('error', (data) => showInfoModal('Erro', data.message));
    
    function initialize() {
        showScreen(document.getElementById('loading-screen'));

        document.getElementById('join-as-player-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'player' }));
        document.getElementById('join-as-spectator-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'spectator' }));
        
        document.getElementById('new-char-btn').addEventListener('click', () => {
            showScreen(document.getElementById('selection-screen'));
            renderPlayerTokenSelection();
        });
        document.getElementById('load-char-btn').addEventListener('click', () => document.getElementById('load-char-input').click());
        document.getElementById('load-char-input').addEventListener('change', (e) => handleLoadCharacter(e, 'creation'));

        document.getElementById('confirm-selection-btn').onclick = () => {
            const selectedCard = document.querySelector('.char-card.selected');
            if (selectedCard) {
                stagedCharacterSheet.tokenName = selectedCard.dataset.name;
                stagedCharacterSheet.tokenImg = selectedCard.dataset.img;
                initializeCharacterSheet();
                showScreen(document.getElementById('character-sheet-screen'));
            }
        };

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

        document.getElementById('weapon-image-modal-cancel').onclick = () => {
             weaponImageModal.classList.add('hidden');
        };
        
        document.getElementById('sheet-save-btn').addEventListener('click', () => handleSaveCharacter('creation'));
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

        playerInfoWidget.addEventListener('click', toggleIngameSheet);
        document.getElementById('ingame-sheet-close-btn').addEventListener('click', () => {
            handleEquipmentChangeConfirmation();
        });
        document.getElementById('ingame-sheet-save-btn').addEventListener('click', () => handleSaveCharacter('ingame'));
        document.getElementById('ingame-sheet-load-btn').addEventListener('click', () => document.getElementById('ingame-load-char-input').click());
        document.getElementById('ingame-load-char-input').addEventListener('change', (e) => handleLoadCharacter(e, 'ingame'));
    }
    
    initialize();
});