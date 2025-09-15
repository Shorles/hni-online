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
    
    // --- LÓGICA DA LOJA ---
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
        const amIPlayerAndFinalized = myRole === 'player' && myPlayerData && myPlayerData.characterFinalized;

        playerInfoWidget.classList.toggle('hidden', !amIPlayerAndFinalized);
        if (amIPlayerAndFinalized) {
            const myFighterData = getFighter(gameState, myPlayerKey);
            if (myFighterData && myFighterData.sheet) {
                const tokenImg = myFighterData.sheet.tokenImg;
                const charName = myFighterData.sheet.name || myFighterData.nome;
                
                if(tokenImg) {
                    document.getElementById('player-info-token').style.backgroundImage = `url("${tokenImg}")`;
                } else {
                    document.getElementById('player-info-token').style.backgroundImage = 'none';
                }
                document.getElementById('player-info-name').textContent = charName;
            }
        }
        
        if (myRole === 'player' && myPlayerData && !myPlayerData.characterFinalized) {
             const currentScreen = document.querySelector('.screen.active');
             if (currentScreen.id !== 'character-sheet-screen' && currentScreen.id !== 'player-initial-choice-screen' && currentScreen.id !== 'selection-screen') {
                 showScreen(document.getElementById('player-waiting-screen'));
             }
             return;
        }
        
        if (gameState.mode === 'adventure' && gameState.scenario) gameWrapper.style.backgroundImage = `url('/images/${gameState.scenario}')`;
        else if (gameState.mode === 'lobby') gameWrapper.style.backgroundImage = `url('/images/mapas/cenarios externos/externo (1).png')`;
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
                isShopOpen = false;
                if(shopModal) shopModal.classList.add('hidden');
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
                isShopOpen = false;
                if(shopModal) shopModal.classList.add('hidden');
                handleAdventureMode(gameState);
                break;
            case 'theater':
                if (!oldGameState || oldGameState.mode !== 'theater') initializeTheaterMode();
                showScreen(document.getElementById('theater-screen'));
                renderTheaterMode(gameState);
                if (gameState.shop) {
                    if (isGm) {
                        shopStagedItems = gameState.shop.gmItems;
                        if(isShopOpen) renderShopModal();
                    } else {
                        if (gameState.shop.isOpen) {
                            if (!isShopOpen) {
                                isShopOpen = true;
                                shopModal.classList.remove('hidden');
                                shopModal.classList.add('active');
                            }
                            renderShopModal();
                        } else {
                            isShopOpen = false;
                            shopModal.classList.add('hidden');
                            shopModal.classList.remove('active');
                        }
                    }
                }
                break;
            default:
                showScreen(document.getElementById('loading-screen'));
        }
    }
    
    // --- LÓGICA DO MODO AVENTURA ---
    // CORREÇÃO: Todas as funções relacionadas ao modo aventura foram agrupadas aqui para garantir o escopo correto.
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
        let myCurrentSelection = stagedCharacterSheet.tokenImg; 

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
                slot.addEventListener('click', () => showNpcConfigModal({ slotIndex: i }));
                
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

    function showNpcConfigModal(config) {
        let npcData, isLiveConfig, isMidBattleAdd;

        if (config.fighter) {
            npcData = config.fighter; isLiveConfig = true; isMidBattleAdd = false;
        } else if (config.slotIndex !== undefined && !config.baseData) {
            npcData = stagedNpcSlots[config.slotIndex]; isLiveConfig = false; isMidBattleAdd = false;
        } else if (config.baseData && config.slotIndex !== undefined) {
            npcData = config.baseData; isLiveConfig = false; isMidBattleAdd = true;
        } else { return; }
    
        if (!npcData) return;

        const weaponOptions = Object.keys(GAME_RULES.weapons).map(w => `<option value="${w}">${w}</option>`).join('');
        const armorOptions = Object.keys(GAME_RULES.armors).map(a => `<option value="${a}">${a}</option>`).join('');
        const shieldOptions = Object.keys(GAME_RULES.shields).map(s => `<option value="${s}">${s}</option>`).join('');
        
        const spellsByElement = {};
        [...(ALL_SPELLS.grade1 || []), ...(ALL_SPELLS.grade2 || []), ...(ALL_SPELLS.grade3 || [])].forEach(spell => {
            if (!spellsByElement[spell.element]) {
                spellsByElement[spell.element] = [];
            }
            spellsByElement[spell.element].push(spell);
        });

        let current;
        if (isLiveConfig) {
            current = { stats: { hp: npcData.hpMax, mahou: npcData.mahouMax, ...npcData.sheet.finalAttributes }, equip: npcData.sheet.equipment, spells: npcData.sheet.spells };
        } else if(isMidBattleAdd) {
             current = { stats: { hp: 10, mahou: 10, forca: 1, agilidade: 1, protecao: 1, constituicao: 1, inteligencia: 1, mente: 1 }, equip: { weapon1: { type: 'Desarmado' }, weapon2: { type: 'Desarmado' }, armor: 'Nenhuma', shield: 'Nenhum' }, spells: [] };
        } else {
             current = { stats: npcData.customStats, equip: npcData.equipment, spells: npcData.spells };
        }
        
        let hpInputHtml = '';
        if (npcData.isMultiPart) {
            hpInputHtml = npcData.parts.map(part => {
                const currentHp = (isLiveConfig && part.hpMax) ? part.hpMax : 10;
                return `<label>${part.name} HP:</label><input type="number" data-part-key="${part.key}" id="npc-cfg-hp-${part.key}" value="${currentHp}">`;
            }).join('');
        } else {
            hpInputHtml = `<label>HP:</label><input type="number" id="npc-cfg-hp" value="${current.stats.hp}">`;
        }

        let spellsHtml = '<div class="npc-config-spells">';
        for (const element in spellsByElement) {
            spellsHtml += `<h5 class="spell-element-title">${element.charAt(0).toUpperCase() + element.slice(1)}</h5>`;
            spellsByElement[element].forEach(spell => {
                spellsHtml += `
                    <div class="spell-checkbox">
                       <input type="checkbox" id="npc-spell-${spell.name.replace(/\s+/g, '-')}" value="${spell.name}" ${current.spells.includes(spell.name) ? 'checked' : ''}>
                       <label for="npc-spell-${spell.name.replace(/\s+/g, '-')}">${spell.name}</label>
                    </div>
                `;
            });
        }
        spellsHtml += '</div>';

        let content = `<div class="npc-config-container">
            <div class="npc-config-col">
                <h4>Atributos Principais</h4>
                <div class="npc-config-grid">
                    ${hpInputHtml}
                    <label>Mahou:</label><input type="number" id="npc-cfg-mahou" value="${current.stats.mahou}">
                    <label>Força:</label><input type="number" id="npc-cfg-forca" value="${current.stats.forca}">
                    <label>Agilidade:</label><input type="number" id="npc-cfg-agilidade" value="${current.stats.agilidade}">
                    <label>Proteção:</label><input type="number" id="npc-cfg-protecao" value="${current.stats.protecao}">
                    <label>Constituição:</label><input type="number" id="npc-cfg-constituicao" value="${current.stats.constituicao}">
                    <label>Inteligência:</label><input type="number" id="npc-cfg-inteligencia" value="${current.stats.inteligencia}">
                    <label>Mente:</label><input type="number" id="npc-cfg-mente" value="${current.stats.mente}">
                </div>
                <h4>Equipamentos</h4>
                <div class="npc-config-equip">
                    <label>Arma 1:</label><select id="npc-cfg-weapon1">${weaponOptions}</select>
                    <label>Arma 2:</label><select id="npc-cfg-weapon2">${weaponOptions}</select>
                    <label>Armadura:</label><select id="npc-cfg-armor">${armorOptions}</select>
                    <label>Escudo:</label><select id="npc-cfg-shield">${shieldOptions}</select>
                </div>
            </div>
            <div class="npc-config-col">
                <h4>Magias</h4>
                ${spellsHtml}
            </div>
        </div>`;
        
        showCustomModal(`Configurar ${npcData.nome || npcData.name}`, content, [
            { text: 'Confirmar', closes: true, onClick: () => {
                const updatedStats = {
                    mahou: parseInt(document.getElementById('npc-cfg-mahou').value, 10),
                    forca: parseInt(document.getElementById('npc-cfg-forca').value, 10),
                    agilidade: parseInt(document.getElementById('npc-cfg-agilidade').value, 10),
                    protecao: parseInt(document.getElementById('npc-cfg-protecao').value, 10),
                    constituicao: parseInt(document.getElementById('npc-cfg-constituicao').value, 10),
                    inteligencia: parseInt(document.getElementById('npc-cfg-inteligencia').value, 10),
                    mente: parseInt(document.getElementById('npc-cfg-mente').value, 10),
                };

                if (npcData.isMultiPart) {
                    updatedStats.parts = npcData.parts.map(part => ({
                        key: part.key,
                        name: part.name,
                        hp: parseInt(document.getElementById(`npc-cfg-hp-${part.key}`).value, 10)
                    }));
                } else {
                    updatedStats.hp = parseInt(document.getElementById('npc-cfg-hp').value, 10);
                }

                const updatedEquipment = {
                    weapon1: { type: document.getElementById('npc-cfg-weapon1').value },
                    weapon2: { type: document.getElementById('npc-cfg-weapon2').value },
                    armor: document.getElementById('npc-cfg-armor').value,
                    shield: document.getElementById('npc-cfg-shield').value,
                };
                const selectedSpells = [];
                document.querySelectorAll('.npc-config-spells input[type="checkbox"]:checked').forEach(cb => {
                    selectedSpells.push(cb.value);
                });

                if (isLiveConfig) {
                    socket.emit('playerAction', { type: 'gmConfiguresLiveNpc', fighterId: npcData.id, stats: updatedStats, equipment: updatedEquipment, spells: selectedSpells });
                } else if (isMidBattleAdd) {
                    socket.emit('playerAction', { type: 'gmSetsNpcInSlot', slotIndex: config.slotIndex, npcData: npcData, customStats: updatedStats, equipment: updatedEquipment, spells: selectedSpells });
                } else {
                    stagedNpcSlots[config.slotIndex].customStats = updatedStats;
                    stagedNpcSlots[config.slotIndex].equipment = updatedEquipment;
                    stagedNpcSlots[config.slotIndex].spells = selectedSpells;
                }
            }},
            { text: 'Cancelar', closes: true, className: 'btn-danger' }
        ]);

        document.getElementById('npc-cfg-weapon1').value = current.equip.weapon1.type;
        document.getElementById('npc-cfg-weapon2').value = current.equip.weapon2.type;
        document.getElementById('npc-cfg-armor').value = current.equip.armor;
        document.getElementById('npc-cfg-shield').value = current.equip.shield;
    }

    function showGMBuffModal(fighter) {
        if (!fighter) return;
        const attributes = ['forca', 'agilidade', 'protecao', 'constituicao', 'inteligencia', 'mente'];
        let content = `<div class="npc-config-grid" style="grid-template-columns: auto 1fr; max-width: 300px; margin: auto;">`;
        attributes.forEach(attr => {
            const currentEffect = (fighter.activeEffects || []).find(e => e.attribute === attr);
            const currentValue = currentEffect ? currentEffect.value : 0;
            content += `
                <label style="text-transform: capitalize;">${attr}:</label>
                <input type="number" id="buff-${attr}" value="${currentValue}" style="width: 60px;">
            `;
        });
        content += '</div>';

        showCustomModal(`Aplicar Buff/Debuff em ${fighter.nome}`, content, [
            { text: 'Confirmar', closes: true, onClick: () => {
                attributes.forEach(attr => {
                    const input = document.getElementById(`buff-${attr}`);
                    const value = parseInt(input.value, 10) || 0;
                    socket.emit('playerAction', {
                        type: 'gmAppliesBuff',
                        fighterId: fighter.id,
                        attribute: attr,
                        value: value
                    });
                });
            }},
            { text: 'Cancelar', closes: true }
        ]);
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
    
    // --- LÓGICA DA FICHA/INVENTÁRIO EM JOGO ---
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
            handleEquipmentChangeConfirmation();
        }
    }
    
    function renderIngameInventory(fighter) {
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
        const canInteract = !isAdventureMode || isMyTurn;
    
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

    function showItemContextMenu(item) {
        const itemDetails = ALL_ITEMS[item.name] || {};
        const effectiveDetails = {
            ...itemDetails,
            img: item.img || itemDetails.img,
            description: itemDetails.description || `Tipo: ${item.type}`,
            isUsable: itemDetails.isUsable || false
        };
    
        const myFighter = getFighter(currentGameState, myPlayerKey);
        if (!myFighter) return;
    
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
            const useItemAction = () => {
                if (currentGameState.mode === 'adventure') {
                    if (myFighter.pa < (effectiveDetails.costPA || 3)) {
                        showInfoModal("Ação Bloqueada", `Você não tem ${effectiveDetails.costPA || 3} Pontos de Ação (PA) suficientes para usar este item.`);
                        return;
                    }
                    showCustomModal("Confirmar Ação", `Usar ${item.name} custará ${effectiveDetails.costPA || 3} Pontos de Ação. Deseja continuar?`, [
                        { text: "Sim, Usar", closes: true, onClick: () => {
                            socket.emit('playerAction', { type: 'useItem', actorKey: myPlayerKey, itemName: item.name });
                            ingameSheetModal.classList.add('hidden');
                        }},
                        { text: "Não", closes: true, className: "btn-secondary" }
                    ]);
                } else {
                    // Uso fora de combate não requer confirmação de PA
                    socket.emit('playerAction', { type: 'useItem', actorKey: myPlayerKey, itemName: item.name });
                    ingameSheetModal.classList.add('hidden');
                }
            };
    
            buttons.push({
                text: 'Usar',
                closes: true, // Fecha o modal de contexto, mas pode abrir o de confirmação
                onClick: useItemAction
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
    
    function populateIngameSheet(fighter) {
        if (!fighter || !fighter.sheet) return;
    
        const isAdventureMode = currentGameState.mode === 'adventure';
        const isMyTurn = isAdventureMode && currentGameState.activeCharacterKey === myPlayerKey;
        const canEdit = !isAdventureMode || isMyTurn;
        
        const loadBtn = document.getElementById('ingame-sheet-load-btn');
        loadBtn.disabled = isAdventureMode;
        loadBtn.title = isAdventureMode ? 'Não é possível carregar um personagem durante o combate.' : 'Carregar Ficha';

        document.getElementById('ingame-sheet-name').textContent = fighter.sheet.name || fighter.nome;
        const tokenImg = fighter.sheet.tokenImg;
        document.getElementById('ingame-sheet-token').style.backgroundImage = tokenImg ? `url("${tokenImg}")` : 'none';
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
        allEquipmentSelectors.forEach(sel => {
            sel.onchange = null;
            sel.disabled = !canEdit;
        });

        const updateAllEquipment = (eventSource) => {
            const inventory = fighter.inventory || {};
            
            let selectedW1 = weapon1Select.value;
            let weapon1Item = inventory[selectedW1] || {};
            let weapon1BaseType = weapon1Item.baseType || (selectedW1 === 'Desarmado' ? 'Desarmado' : null);
            let weapon1Data = GAME_RULES.weapons[weapon1BaseType] || {};
            
            let selectedW2 = weapon2Select.value;
            let weapon2Item = inventory[selectedW2] || {};
            let weapon2BaseType = weapon2Item.baseType || (selectedW2 === 'Desarmado' ? 'Desarmado' : null);
            let weapon2Data = GAME_RULES.weapons[weapon2BaseType] || {};

            const canWield2HInOneHand = (fighter.sheet.finalAttributes.forca || 0) >= 4;
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

            if (canEdit) {
                weapon2Select.disabled = (finalW1Data.hand === 2 && !canWield2HInOneHand) || finalShield !== 'Nenhum';
                shieldSelect.disabled = finalW2 !== 'Desarmado' || (finalW1Data.hand === 2 && !canWield2HInOneHand);
            }

            document.getElementById('ingame-sheet-weapon1-image').style.backgroundImage = finalW1Item.img ? `url("${finalW1Item.img}")` : 'none';
            document.getElementById('ingame-sheet-weapon2-image').style.backgroundImage = (inventory[finalW2] || {}).img ? `url("${(inventory[finalW2] || {}).img}")` : 'none';
            renderIngameInventory(fighter);
        };

        const populateAllSelects = () => {
            const inventory = fighter.inventory || {};
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
        const finalAttributes = fighter.sheet.finalAttributes || {};
        for (const attr in finalAttributes) {
            const capitalized = attr.charAt(0).toUpperCase() + attr.slice(1).replace('cao', 'ção');
            attributesGrid.innerHTML += `<div class="attr-item"><label>${capitalized}</label><span>${finalAttributes[attr]}</span></div>`;
        }
    
        const elementsGrid = document.getElementById('ingame-sheet-elements');
        elementsGrid.innerHTML = '';
        const elements = fighter.sheet.elements || {};
        for (const elem in elements) {
            if (elements[elem] > 0) {
                 const capitalized = elem.charAt(0).toUpperCase() + elem.slice(1).replace('ao', 'ão');
                elementsGrid.innerHTML += `<div class="attr-item"><label>${capitalized}</label><span>${elements[elem]}</span></div>`;
            }
        }
        
        const spellsGrid = document.getElementById('ingame-sheet-spells-grid');
        spellsGrid.innerHTML = '';
        const spells = fighter.sheet.spells || [];
        const allSpells = [...(ALL_SPELLS.grade1 || []), ...(ALL_SPELLS.grade2 || []), ...(ALL_SPELLS.grade3 || [])];
        
        if (spells.length > 0) {
            spells.forEach(spellName => {
                const spellData = allSpells.find(s => s.name === spellName);
                if(spellData) {
                    const card = document.createElement('div');
                    card.className = 'spell-card ingame-spell';
                    card.dataset.spellName = spellData.name;
                    const spellType = spellData.inCombat ? '(Combate)' : '(Utilitário)';
                    card.innerHTML = `<h4>${spellData.name} <small>${spellType}</small></h4><p>${spellData.description}</p>`;
                    spellsGrid.appendChild(card);
                }
            });
        } else {
            spellsGrid.innerHTML = `<p style="color: #888; text-align: center; grid-column: 1 / -1;">Nenhuma magia conhecida.</p>`;
        }
        
        const ammoContainer = document.getElementById('ingame-sheet-ammunition');
        const ammoList = document.getElementById('ingame-sheet-ammo-list');
        ammoList.innerHTML = '';
        const ammunition = fighter.ammunition || {};
        let hasRangedWeapon = false;
        
        ['weapon1', 'weapon2'].forEach(slot => {
            if (fighter.sheet.equipment[slot] && fighter.sheet.equipment[slot].isRanged) {
                hasRangedWeapon = true;
                const ammoItem = document.createElement('div');
                ammoItem.className = 'ammo-item';
                ammoItem.innerHTML = `<span>${fighter.sheet.equipment[slot].name}:</span><span>${ammunition[slot] || 0}</span>`;
                ammoList.appendChild(ammoItem);
            }
        });

        ammoContainer.classList.toggle('hidden', !hasRangedWeapon);
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
            if (!item) return { name: itemName, type: itemType, img: null, isRanged: false };
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
            ingameSheetModal.classList.add('hidden');
            return;
        }
    
        if (currentGameState.mode === 'adventure') {
            if (myFighter.pa < 3) {
                showInfoModal("Ação Bloqueada", "Você não tem 3 Pontos de Ação (PA) para trocar de equipamento. Suas alterações não foram salvas.");
                ingameSheetModal.classList.add('hidden');
                return;
            }
    
            showCustomModal(
                "Confirmar Mudança de Equipamento",
                "Trocar de equipamento durante o combate custará 3 Pontos de Ação. Deseja continuar?",
                [
                    { text: 'Sim, Gastar 3 PA', closes: true, onClick: () => {
                        socket.emit('playerAction', { type: 'changeEquipment', newEquipment });
                        ingameSheetModal.classList.add('hidden');
                    }},
                    { text: 'Não, Cancelar', closes: true, onClick: () => {
                        ingameSheetModal.classList.add('hidden');
                    }}
                ]
            );
        } else {
            socket.emit('playerAction', { type: 'changeEquipment', newEquipment });
            ingameSheetModal.classList.add('hidden');
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