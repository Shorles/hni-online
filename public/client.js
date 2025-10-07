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
        container.innerHTML = ''; // Limpa o conteúdo anterior
    
        const state = currentGameState.shop;
        if (!state) return;
    
        const nonItems = ['Desarmado', 'Nenhuma', 'Nenhum'];
    
        const meleeWeapons = [];
        const rangedWeapons = [];
        const magicWeapons = [];
    
        Object.entries(ALL_WEAPON_IMAGES).forEach(([weaponType, imageSets]) => {
            if (weaponType === 'customProjectiles') return; // Pula a chave de configuração de projéteis
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

        // Adiciona o item "Munição" à lista de armas de distância para a loja
        const ammunitionItem = ALL_ITEMS['Munição'];
        if (ammunitionItem) {
            rangedWeapons.push({
                name: 'Munição',
                type: 'ammunition',
                ...ammunitionItem
            });
        }
    
        const allGameItems = {
            'Armas Corpo a Corpo': meleeWeapons,
            'Armas de Distância': rangedWeapons,
            'Armas Mágicas': magicWeapons,
            'Armaduras': Object.entries(GAME_RULES.armors).map(([name, data]) => ({ name, type: 'armor', ...data })).filter(item => !nonItems.includes(item.name)),
            'Escudos': Object.entries(GAME_RULES.shields).map(([name, data]) => ({ name, type: 'shield', ...data })).filter(item => !nonItems.includes(item.name)),
            'Itens': Object.entries(ALL_ITEMS).filter(([name]) => name !== 'Munição').map(([name, data]) => ({ name, type: 'item', ...data })),
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
                if (!imgPath) { // Fallback para armaduras/escudos sem imagem definida em all_weapon_images
                    if (itemData.type === 'armor' && itemData.name !== 'Nenhuma') {
                        const armorImgName = itemData.name === 'Mediana' ? 'Armadura Mediana' : `Armadura ${itemData.name}`;
                        imgPath = `/images/armas/${armorImgName}.png`.replace(/ /g, '%20');
                    } else if (itemData.type === 'shield' && itemData.name !== 'Nenhum') {
                         const shieldImgName = itemData.name === 'Médio' ? 'Escudo Medio' : `Escudo ${itemData.name}`;
                         imgPath = `/images/armas/${shieldImgName}.png`.replace(/ /g, '%20');
                    }
                }
                
                let handInfo = '';
                if (itemData.type === 'weapon' && itemData.hand) {
                    handInfo = `<div class="shop-item-hand">${itemData.hand} Mão${itemData.hand > 1 ? 's' : ''}</div>`;
                }

                card.innerHTML = `
                    ${handInfo}
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
                        itemData: itemData // Store original data
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
                if (itemData.type === 'armor' && itemData.name !== 'Nenhuma') {
                    const armorImgName = itemData.name === 'Mediana' ? 'Armadura Mediana' : `Armadura ${itemData.name}`;
                    imgPath = `/images/armas/${armorImgName}.png`.replace(/ /g, '%20');
                } else if (itemData.type === 'shield' && itemData.name !== 'Nenhum') {
                     const shieldImgName = itemData.name === 'Médio' ? 'Escudo Medio' : `Escudo ${itemData.name}`;
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
        container.innerHTML = ''; // Limpa o conteúdo anterior
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
                     const shieldImgName = itemData.name === 'Médio' ? 'Escudo Medio' : `Escudo ${itemData.name}`;
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
            updateTotal(); // Initial call
        }
    }

    function preloadProjectileImages() {
        const imageUrlsToPreload = new Set();
        imageUrlsToPreload.add('/images/armas/bullet.png');

        if (ALL_WEAPON_IMAGES && ALL_WEAPON_IMAGES.customProjectiles) {
            for (const key in ALL_WEAPON_IMAGES.customProjectiles) {
                const projectileInfo = ALL_WEAPON_IMAGES.customProjectiles[key];
                if (projectileInfo && projectileInfo.name) {
                    if (projectileInfo.name === 'machadinha') {
                        imageUrlsToPreload.add('/images/armas/Leve (5).png');
                    } else {
                        imageUrlsToPreload.add(`/images/armas/${projectileInfo.name}.png`);
                    }
                }
            }
        }
        console.log("Pré-carregando projéteis:", Array.from(imageUrlsToPreload));
        imageUrlsToPreload.forEach(url => {
            const img = new Image();
            img.src = url;
        });
    }

    // =================================================================
    // ================= FUNÇÃO PRINCIPAL DE RENDERIZAÇÃO ==============
    // =================================================================
    function renderGame(gameState) {
        oldGameState = currentGameState;
        currentGameState = gameState;

        if (oldGameState && oldGameState.activeCharacterKey !== currentGameState.activeCharacterKey) {
            cancelTargeting();
        }

        if (!gameState || !gameState.mode || !gameState.connectedPlayers) {
            showScreen(document.getElementById('loading-screen'));
            return;
        }

        scaleGame(); 

        // AJUSTE: Lógica de atualização em tempo real da ficha
        const ingameSheetModal = document.getElementById('ingame-sheet-modal');
        if (!ingameSheetModal.classList.contains('hidden')) {
            const viewingPlayerId = ingameSheetModal.dataset.viewingPlayerId;
            if (viewingPlayerId) {
                const updatedFighterData = getFighter(gameState, viewingPlayerId);
                if (updatedFighterData) {
                    const isOwner = viewingPlayerId === myPlayerKey;
                    if (isOwner || isGm) {
                        populateIngameSheet(updatedFighterData, isGm && !isOwner);
                    }
                }
            }
        }

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
             if (currentScreen.id !== 'character-sheet-screen' && currentScreen.id !== 'player-initial-choice-screen') {
                 showScreen(document.getElementById('player-waiting-screen'));
             }
             return;
        }
        
        if (gameState.mode === 'adventure' && gameState.scenario) {
            gameWrapper.style.backgroundImage = `url('/images/${gameState.scenario}')`;
        }
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
                case 'scenario_selection':
                    showScenarioSelectionModal('adventure');
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
            else if (['npc_setup', 'scenario_selection'].includes(gameState.phase)) {
                showScreen(document.getElementById('player-waiting-screen'));
                const message = gameState.phase === 'npc_setup' 
                    ? "O Mestre está preparando a aventura..."
                    : "O Mestre está escolhendo o cenário da batalha...";
                document.getElementById('player-waiting-message').innerText = message;
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
    
    function renderNpcSelectionForGm() {
        const npcArea = document.getElementById('npc-selection-area');
        npcArea.innerHTML = '';
        (ALL_CHARACTERS.npcs || []).forEach(npcData => {
            const card = document.createElement('div');
            card.className = 'npc-card';
            card.innerHTML = `<img src="${npcData.img}" alt="${npcData.name}"><div class="char-name">${npcData.name}</div>`;
            card.addEventListener('click', () => {
                let targetSlot;
                if (selectedSlotIndex !== null) {
                    targetSlot = selectedSlotIndex;
                } else {
                    targetSlot = stagedNpcSlots.findIndex(slot => slot === null);
                }

                if (targetSlot !== -1 && targetSlot !== null) {
                    stagedNpcSlots[targetSlot] = { 
                        ...npcData, 
                        id: `npc-staged-${Date.now()}-${targetSlot}`,
                        customStats: { hp: 10, mahou: 10, forca: 1, agilidade: 1, protecao: 1, constituicao: 1, inteligencia: 1, mente: 1, xpReward: 30, moneyReward: 0, scale: 1.0 },
                        equipment: { weapon1: {type: 'Desarmado', name: 'Desarmado', img: null, isRanged: false}, weapon2: {type: 'Desarmado', name: 'Desarmado', img: null, isRanged: false}, armor: 'Nenhuma', shield: 'Nenhum' },
                        spells: []
                    };
                    selectedSlotIndex = null;
                    renderNpcStagingArea();
                } else if (stagedNpcSlots.every(slot => slot !== null)) {
                     showInfoModal("Aviso", "Todos os slots estão cheios. Remova um inimigo para adicionar outro.");
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
        
        let current;
        if (isLiveConfig) {
            current = { stats: { hp: npcData.hpMax, mahou: npcData.mahouMax, ...npcData.sheet.finalAttributes, xpReward: npcData.xpReward, moneyReward: npcData.moneyReward, scale: npcData.scale }, equip: npcData.sheet.equipment, spells: npcData.sheet.spells };
        } else if(isMidBattleAdd) {
             current = { stats: { hp: 10, mahou: 10, forca: 1, agilidade: 1, protecao: 1, constituicao: 1, inteligencia: 1, mente: 1, xpReward: 30, moneyReward: 0, scale: 1.0 }, equip: { weapon1: { type: 'Desarmado', name: 'Desarmado', img: null, isRanged: false }, weapon2: { type: 'Desarmado', name: 'Desarmado', img: null, isRanged: false }, armor: 'Nenhuma', shield: 'Nenhum' }, spells: [] };
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
    
        const spellCategories = {
            "Magias Grau 1": ALL_SPELLS.grade1 || [], "Magias Avançadas Grau 1": ALL_SPELLS.advanced_grade1 || [],
            "Magias Grau 2": ALL_SPELLS.grade2 || [], "Magias Avançadas Grau 2": ALL_SPELLS.advanced_grade2 || [],
            "Magias Grau 3": ALL_SPELLS.grade3 || [], "Magias Avançadas Grau 3": ALL_SPELLS.advanced_grade3 || [],
            "Magias Combinadas": ALL_SPELLS.grade_combined || []
        };
    
        let spellsHtml = '<div class="npc-config-spells">';
        for (const categoryName in spellCategories) {
            const spellsInCategory = spellCategories[categoryName].filter(spell => spell.inCombat);
            if (spellsInCategory.length > 0) {
                spellsHtml += `<h5 class="spell-category-title">${categoryName}</h5>`;
    
                const spellsByElement = spellsInCategory.reduce((acc, spell) => {
                    const key = spell.combinedElementName || (spell.isAdvanced ? GAME_RULES.advancedElements[spell.element] : spell.element);
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(spell);
                    return acc;
                }, {});
    
                for (const elementName in spellsByElement) {
                    const capitalized = elementName.charAt(0).toUpperCase() + elementName.slice(1);
                    spellsHtml += `<h6 class="spell-element-title">${capitalized}</h6>`;
                    spellsByElement[elementName].forEach(spell => {
                        spellsHtml += `
                            <div class="spell-checkbox">
                               <input type="checkbox" id="npc-spell-${spell.name.replace(/\s+/g, '-')}" value="${spell.name}" ${current.spells.includes(spell.name) ? 'checked' : ''}>
                               <label for="npc-spell-${spell.name.replace(/\s+/g, '-')}">${spell.name}</label>
                            </div>
                        `;
                    });
                }
            }
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
                 <h4>Outros</h4>
                 <div class="npc-config-grid">
                    <label>Escala:</label><input type="number" id="npc-cfg-scale" value="${current.stats.scale || 1.0}" step="0.1" min="0.1">
                </div>
                <h4>Recompensas</h4>
                 <div class="npc-config-grid">
                    <label>XP Reward:</label><input type="number" id="npc-cfg-xp" value="${current.stats.xpReward !== undefined ? current.stats.xpReward : 30}">
                    <label>Money Reward:</label><input type="number" id="npc-cfg-money" value="${current.stats.moneyReward !== undefined ? current.stats.moneyReward : 0}">
                </div>
                <h4>Equipamentos</h4>
                <div class="npc-config-equip">
                    <div class="equip-item">
                        <div id="npc-cfg-weapon1-image" class="equipment-image-display"></div>
                        <div class="equip-controls">
                            <label>Arma 1:</label><select id="npc-cfg-weapon1">${weaponOptions}</select>
                        </div>
                    </div>
                    <div class="equip-item">
                        <div id="npc-cfg-weapon2-image" class="equipment-image-display"></div>
                        <div class="equip-controls">
                            <label>Arma 2:</label><select id="npc-cfg-weapon2">${weaponOptions}</select>
                        </div>
                    </div>
                    <div class="equip-item">
                        <div id="npc-cfg-armor-image" class="equipment-image-display"></div>
                        <div class="equip-controls">
                            <label>Armadura:</label><select id="npc-cfg-armor">${armorOptions}</select>
                        </div>
                    </div>
                    <div class="equip-item">
                        <div id="npc-cfg-shield-image" class="equipment-image-display"></div>
                        <div class="equip-controls">
                            <label>Escudo:</label><select id="npc-cfg-shield">${shieldOptions}</select>
                        </div>
                    </div>
                </div>
            </div>
            <div class="npc-config-col">
                <h4>Magias</h4>
                ${spellsHtml}
            </div>
        </div>`;
        
        let tempEquipment = JSON.parse(JSON.stringify(current.equip));

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
                    xpReward: parseInt(document.getElementById('npc-cfg-xp').value, 10),
                    moneyReward: parseInt(document.getElementById('npc-cfg-money').value, 10),
                    scale: parseFloat(document.getElementById('npc-cfg-scale').value) || 1.0
                };

                if (npcData.isMultiPart) {
                    updatedStats.parts = npcData.parts.map(part => ({
                        key: part.key, name: part.name,
                        hp: parseInt(document.getElementById(`npc-cfg-hp-${part.key}`).value, 10)
                    }));
                } else { updatedStats.hp = parseInt(document.getElementById('npc-cfg-hp').value, 10); }

                tempEquipment.armor = document.getElementById('npc-cfg-armor').value;
                tempEquipment.shield = document.getElementById('npc-cfg-shield').value;

                const selectedSpells = Array.from(document.querySelectorAll('.npc-config-spells input:checked')).map(cb => cb.value);

                if (isLiveConfig) {
                    socket.emit('playerAction', { type: 'gmConfiguresLiveNpc', fighterId: npcData.id, stats: updatedStats, equipment: tempEquipment, spells: selectedSpells });
                } else if (isMidBattleAdd) {
                    socket.emit('playerAction', { type: 'gmSetsNpcInSlot', slotIndex: config.slotIndex, npcData: npcData, customStats: updatedStats, equipment: tempEquipment, spells: selectedSpells });
                } else {
                    stagedNpcSlots[config.slotIndex].customStats = updatedStats;
                    stagedNpcSlots[config.slotIndex].equipment = tempEquipment;
                    stagedNpcSlots[config.slotIndex].spells = selectedSpells;
                }
            }},
            { text: 'Cancelar', closes: true, className: 'btn-danger' }
        ]);

        const setupWeaponSlot = (slot) => {
            const typeSelect = document.getElementById(`npc-cfg-weapon${slot}`);
            const imageDisplay = document.getElementById(`npc-cfg-weapon${slot}-image`);
            
            typeSelect.value = tempEquipment[`weapon${slot}`].type;
            imageDisplay.style.backgroundImage = tempEquipment[`weapon${slot}`].img ? `url("${tempEquipment[`weapon${slot}`].img}")` : 'none';

            const openImageSelection = () => {
                if (typeSelect.value !== 'Desarmado') {
                     showWeaponImageSelectionModal(`npc-weapon${slot}`, (weaponData) => {
                        tempEquipment[`weapon${slot}`] = weaponData;
                        imageDisplay.style.backgroundImage = weaponData.img ? `url("${weaponData.img}")` : 'none';
                     });
                }
            };

            typeSelect.onchange = () => {
                tempEquipment[`weapon${slot}`] = { name: typeSelect.value, type: typeSelect.value, img: null, isRanged: false };
                imageDisplay.style.backgroundImage = 'none';
                openImageSelection();
            };
            imageDisplay.onclick = openImageSelection;
        };

        setupWeaponSlot('1');
        setupWeaponSlot('2');
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
        
        const PLAYER_POSITIONS = [ { left: '150px', top: '350px' }, { left: '250px', top: '250px' }, { left: '350px', top: '150px' }, { left: '450px', top: '50px' } ];
        const NPC_POSITIONS = [ { left: '1000px', top: '350px' }, { left: '900px',  top: '250px' }, { left: '800px',  top: '150px' }, { left: '700px',  top: '50px' }, { left: '1050px', top: '200px' } ];
        
        Object.keys(state.fighters.players).forEach((key, index) => {
            const player = state.fighters.players[key];
             if (player.status === 'fled' || player.status === 'banished') return;
             const position = state.customPositions[player.id] || PLAYER_POSITIONS[index];
             const el = createFighterElement(player, 'player', state, position);
             if (el) fightSceneCharacters.appendChild(el);
        });

        (state.npcSlots || []).forEach((npcId, index) => {
            const npc = getFighter(state, npcId);
            if (npc && npc.status !== 'fled' && npc.status !== 'banished') {
                const position = state.customPositions[npc.id] || NPC_POSITIONS[index];
                const el = createFighterElement(npc, 'npc', state, position);
                if (el) fightSceneCharacters.appendChild(el);
            }
        });
        
        // Render Summons
        Object.keys(state.fighters.summons || {}).forEach(key => {
            const summon = state.fighters.summons[key];
            if (summon.status === 'fled' || summon.status === 'banished') return;
            const ownerEl = document.getElementById(summon.ownerId);
            let position = state.customPositions[summon.id];
            if (!position && ownerEl) {
                const ownerRect = ownerEl.getBoundingClientRect();
                const gameWrapperRect = gameWrapper.getBoundingClientRect();
                const gameScale = getGameScale();
                const x = (ownerRect.left - gameWrapperRect.left) / gameScale + (ownerEl.classList.contains('player-char-container') ? 80 : -80);
                const y = (ownerRect.top - gameWrapperRect.top) / gameScale + 50;
                position = { left: `${x}px`, top: `${y}px` };
            }
             if (position) {
                const el = createFighterElement(summon, 'summon', state, position);
                if (el) fightSceneCharacters.appendChild(el);
             }
        });
        
        updateTargetableStatus();
        renderActionButtons(state);
        renderTurnOrderUI(state);
        renderWaitingPlayers(state);
    }
    
    function createFighterElement(fighter, type, state, position) {
        const container = document.createElement('div');
        container.className = `char-container ${type}-char-container`;
        if (fighter.isSummon) {
            container.classList.add('summon-char-container');
        }
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
        }
        
        container.addEventListener('click', handleTargetClick);
        container.addEventListener('mouseover', handleTargetMouseOver);
        container.addEventListener('mouseout', handleTargetMouseOut);
        
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

        let marksHtml = '<div class="marks-container">';
        if (fighter.marks) {
            for(const markType in fighter.marks) {
                for(let i = 0; i < fighter.marks[markType]; i++) {
                    marksHtml += `<div class="mark-dot ${markType}"></div>`;
                }
            }
        }
        marksHtml += '</div>';

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
        
        const durationHtml = fighter.isSummon && fighter.duration ? `<span class="summon-duration">(${fighter.duration} turnos)</span>` : '';
    
        let effectsHtml = '<div class="effects-display-container">';
        const combinedEffects = {};
        if (fighter.activeEffects) {
            fighter.activeEffects.forEach(effect => {
                const processModifier = (mod) => {
                    if (!combinedEffects[mod.attribute]) {
                        combinedEffects[mod.attribute] = 0;
                    }
                    if (mod.value === 'zero_out') {
                        combinedEffects[mod.attribute] = 'zero_out';
                    } else if (typeof combinedEffects[mod.attribute] === 'number') {
                        combinedEffects[mod.attribute] += mod.value;
                    }
                };

                if(effect.modifiers) {
                    effect.modifiers.forEach(processModifier);
                }
                if (effect.type === 'bta_buff' || effect.type === 'bta_debuff') {
                    processModifier({ attribute: 'bta', value: effect.value });
                }
                 if (effect.type === 'progressive_debuff') {
                    const turnsPassed = (effect.initial_duration - effect.duration) + 1;
                    const currentValue = effect.value * turnsPassed;
                    processModifier({ attribute: effect.attribute, value: currentValue });
                }
                if (effect.type === 'progressive_debuff_custom') {
                    // duration is remaining. initial_duration is the original.
                    // Server sends duration+1 initially. It gets decremented before this runs.
                    // So, for a 4 turn effect, initial_duration=4. 
                    // Turn 1 starts, duration becomes 4. turnsPassed = 4 - (4-1) = 1. index = 0.
                    const turnsPassed = effect.initial_duration - (effect.duration - 1);
                    const valueIndex = turnsPassed - 1;
                    if (valueIndex >= 0 && valueIndex < effect.values.length) {
                        const currentValue = effect.values[valueIndex];
                        processModifier({ attribute: effect.attribute, value: currentValue });
                    }
                }
            });
        }
        
        Object.entries(combinedEffects).forEach(([attr, value]) => {
            if (value !== 0) {
                const attrAbbr = attr.substring(0, 3).toUpperCase();
                let valueText;
                if (value === 'zero_out') {
                    valueText = 'ZERADO';
                } else {
                    valueText = (value > 0 ? '+' : '') + value;
                }
                const className = value > 0 ? 'effect-buff' : 'effect-debuff';
                effectsHtml += `<div class="${className}">${valueText} ${attrAbbr}</div>`;
            }
        });
        effectsHtml += '</div>';

        container.innerHTML = `${effectsHtml}${marksHtml}${paHtml}${healthBarHtml}<img src="${fighter.img}" class="fighter-img-ingame"><div class="fighter-name-ingame">${fighter.nome} ${durationHtml}</div>`;
        return container;
    }

    function updateTargetableStatus() {
        document.querySelectorAll('.char-container').forEach(el => el.classList.remove('targetable'));
        if (!isTargeting || !currentGameState) return;
    
        const activeFighter = getFighter(currentGameState, currentGameState.activeCharacterKey);
        if (!activeFighter) return;
    
        const canIControlThisTurn = (myPlayerKey === currentGameState.activeCharacterKey) || (isGm && !activeFighter.isPlayer && !activeFighter.isSummon) || (activeFighter.isSummon && activeFighter.ownerId === myPlayerKey);
        if (!canIControlThisTurn) return;
        
        const isActiveFighterPlayerSide = activeFighter.isPlayer || activeFighter.isSummon;
        const isAllyTargetAction = targetingAction.type === 'use_spell' && ['self', 'single_ally', 'all_allies', 'single_ally_down'].includes(targetingAction.spell.targetType);
    
        document.querySelectorAll('.char-container').forEach(container => {
            const fighter = getFighter(currentGameState, container.id);
            if (!fighter) return;
    
            if (targetingAction.spell?.targetType === 'single_ally_down') {
                if (fighter.status !== 'down' && fighter.status !== 'active') return;
            } else {
                if (fighter.status !== 'active') return;
            }
    
            const isThisFighterPlayerSide = fighter.isPlayer || fighter.isSummon;
    
            if (isAllyTargetAction) {
                if (isThisFighterPlayerSide === isActiveFighterPlayerSide) {
                    container.classList.add('targetable');
                }
            } else { // Ataque ou magia ofensiva
                if (isThisFighterPlayerSide !== isActiveFighterPlayerSide) {
                    container.classList.add('targetable');
                }
            }
        });
    }

    
    function renderActionButtons(state) {
        actionButtonsWrapper.innerHTML = '';
        if (state.phase !== 'battle' || !!state.winner) return;
        const activeFighter = getFighter(state, state.activeCharacterKey);
        if (!activeFighter) return;

        const isNpcTurn = !!state.fighters.npcs[activeFighter.id];
        const isMySummonTurn = activeFighter.isSummon && activeFighter.ownerId === myPlayerKey;
        const canControl = (myRole === 'player' && state.activeCharacterKey === myPlayerKey) || (isGm && isNpcTurn) || isMySummonTurn;
        
        const isStunned = activeFighter.activeEffects && activeFighter.activeEffects.some(e => e.status === 'stunned' || e.status === 'invulnerable_and_pacified');
        const finalCanControl = canControl && !isStunned;
        
        let attackButtonAdded = false;

        const createButton = (text, onClick, disabled = false, className = 'action-btn', ammoCount = null, title = null) => {
            const btn = document.createElement('button');
            btn.className = className;
            btn.textContent = text;
            btn.disabled = disabled;
            btn.onclick = onClick;
            if (title) btn.title = title;
            if (ammoCount !== null && ammoCount !== undefined) {
                const ammoEl = document.createElement('span');
                ammoEl.className = 'attack-ammo-counter';
                ammoEl.textContent = ammoCount;
                btn.appendChild(ammoEl);
                if (ammoCount <= 0) btn.disabled = true;
            }
            return btn;
        };
        
        if (isMySummonTurn) {
             actionButtonsWrapper.appendChild(
                createButton(
                    'Dispensar Invocação',
                    () => socket.emit('playerAction', { type: 'dismiss_summon', summonKey: state.activeCharacterKey }),
                    !finalCanControl,
                    'action-btn flee-btn'
                )
            );
        }
        
        // Summons don't have dual wield or complex weapons
        if (activeFighter.isSummon) {
             const btn = createButton('Ataque Básico (2 PA)', () => startAttackSequence('weapon1'), !finalCanControl, 'action-btn');
             actionButtonsWrapper.appendChild(btn);
        } else {
            const createAttackButton = (weaponKey) => {
                const weapon = activeFighter.sheet.equipment[weaponKey];
                if (weapon && weapon.type !== 'Desarmado') {
                    const ammo = weapon.isRanged ? activeFighter.ammunition : null;
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
                const ammo = (weapon1.isRanged || weapon2.isRanged) ? activeFighter.ammunition : null;
                let dualDisabled = (ammo !== null && ammo < 2); // Precisa de pelo menos 2 munições para ataque duplo se uma for ranged

                const btn = createButton('Ataque Duplo (3 PA)', () => startAttackSequence('dual'), !finalCanControl || dualDisabled, 'action-btn');
                actionButtonsWrapper.appendChild(btn);
            }
        }

        const fighterSpells = activeFighter.sheet?.spells || [];
        if (fighterSpells.length > 0) {
            fighterSpells.forEach(spellName => {
                const allSpells = [...(ALL_SPELLS.grade1 || []), ...(ALL_SPELLS.grade2 || []), ...(ALL_SPELLS.grade3 || []), ...(ALL_SPELLS.advanced_grade1 || []), ...(ALL_SPELLS.advanced_grade2 || []), ...(ALL_SPELLS.advanced_grade3 || []), ...(ALL_SPELLS.grade_combined || [])];
                const spell = allSpells.find(s => s.name === spellName);
                if (spell && spell.inCombat) {
                    const costPA = spell.costPA !== undefined ? spell.costPA : 2;
                    const btnText = `${spell.name} (${costPA} PA)`;
                    const spellBtn = createButton(btnText, () => startSpellSequence(spell), !finalCanControl, 'action-btn spell-btn');
                    spellBtn.title = `${spell.description} (Custo: ${spell.costMahou} Mahou)`;
                    actionButtonsWrapper.appendChild(spellBtn);
                }
            });
        }
        
        // Botão de Defesa com Escudo
        const shieldName = activeFighter.sheet?.equipment?.shield;
        if (!activeFighter.isSummon && shieldName && shieldName !== 'Nenhum') {
            const btn = createButton(
                'Defender com Escudo (3 PA)',
                () => {
                    showCustomModal("Confirmar Defesa", "Você gastará 3 PA para dobrar a proteção do seu escudo e encerrar seu turno. Deseja continuar?", [
                        { text: 'Sim', closes: true, onClick: () => socket.emit('playerAction', { type: 'defendWithShield', actorKey: state.activeCharacterKey }) },
                        { text: 'Não', closes: true, className: 'btn-danger' }
                    ]);
                },
                !finalCanControl,
                'action-btn flee-btn', // Usando estilo azul
                null,
                'Dobra a proteção do escudo até o início do seu próximo turno, mas encerra o turno atual.'
            );
            actionButtonsWrapper.appendChild(btn);
        }
        
        // Summons cannot flee
        if (!activeFighter.isSummon) {
             actionButtonsWrapper.appendChild(createButton('Fugir', () => socket.emit('playerAction', { type: 'flee', actorKey: state.activeCharacterKey }), !finalCanControl, 'action-btn flee-btn'));
        }

        actionButtonsWrapper.appendChild(createButton('Encerrar Turno', () => socket.emit('playerAction', { type: 'end_turn', actorKey: state.activeCharacterKey }), !finalCanControl, 'end-turn-btn'));
    }

    function startAttackSequence(weaponChoice) {
        const attacker = getFighter(currentGameState, currentGameState.activeCharacterKey);
        if (!attacker) return;
        
        targetingAction = { type: 'attack', attackerKey: attacker.id, weaponChoice: weaponChoice };
        isTargeting = true;
        document.getElementById('targeting-indicator').classList.remove('hidden');
        updateTargetableStatus();
    }
    
    function startSpellSequence(spell) {
        if (spell.targetType === 'self' || spell.targetType === 'all_allies' || spell.targetType === 'all_enemies' || spell.effect.type === 'summon' || spell.effect.type === 'summon_elemental') {
             socket.emit('playerAction', {
                type: 'use_spell',
                attackerKey: currentGameState.activeCharacterKey,
                spellName: spell.name,
                targetKey: currentGameState.activeCharacterKey // O servidor determina os alvos reais
            });
        } else {
            targetingAction = { type: 'use_spell', attackerKey: currentGameState.activeCharacterKey, spellName: spell.name, spell: spell };
            isTargeting = true;
            document.getElementById('targeting-indicator').classList.remove('hidden');
            updateTargetableStatus();
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
            .filter(f => f && (f.status === 'active' || f.status === 'down'));
        
        const activeIndex = orderedFighters.findIndex(f => f.id === state.activeCharacterKey);
        const sortedVisibleFighters = activeIndex === -1 ? orderedFighters : orderedFighters.slice(activeIndex).concat(orderedFighters.slice(0, activeIndex));

        sortedVisibleFighters.forEach((fighter, index) => {
            const card = document.createElement('div');
            card.className = 'turn-order-card';
            if (index === 0) card.classList.add('active-turn-indicator');
            if (fighter.isSummon) card.classList.add('summon-card');
            const img = document.createElement('img');
            img.src = fighter.img;
            img.alt = fighter.nome;
            img.title = fighter.nome;
            if (fighter.status === 'down') {
                img.style.filter = 'grayscale(1)';
            }
            card.appendChild(img);
            turnOrderSidebar.appendChild(card);
        });
    }

    function renderWaitingPlayers(state) {
        waitingPlayersSidebar.innerHTML = '';
        const waiting = state.waitingPlayers || {};
        if (Object.keys(waiting).length === 0 || !isGm) {
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
    
    function handleTargetMouseOver(event) {
        if (!isTargeting || !targetingAction || targetingAction.type !== 'use_spell') return;
        
        const targetContainer = event.target.closest('.char-container.targetable');
        if (!targetContainer) return;
    
        const targetKey = targetContainer.dataset.key;
        const { spell } = targetingAction;
        const activeFighter = getFighter(currentGameState, currentGameState.activeCharacterKey);
        if (!activeFighter) return;
    
        document.querySelectorAll('.char-container.target-highlight').forEach(el => el.classList.remove('target-highlight'));
        
        const alliesSelector = (activeFighter.isPlayer || activeFighter.isSummon) ? '.player-char-container, .summon-char-container' : '.npc-char-container';
        const enemiesSelector = (activeFighter.isPlayer || activeFighter.isSummon) ? '.npc-char-container' : '.player-char-container, .summon-char-container';


        if (spell.targetType === 'adjacent_enemy') {
            const targetIndex = currentGameState.npcSlots.indexOf(targetKey);
            if (targetIndex !== -1) {
                const adjacencyMap = {
                    0: [0, 1],
                    1: [0, 1, 2, 4],
                    2: [1, 2, 3, 4],
                    3: [2, 3],
                    4: [1, 2, 4]
                };
                
                const affectedIndexes = adjacencyMap[targetIndex] || [targetIndex];

                affectedIndexes.forEach(index => {
                    const npcId = currentGameState.npcSlots[index];
                    if (npcId) {
                        const el = document.getElementById(npcId);
                        if(el) el.classList.add('target-highlight');
                    }
                });
            }
        } else if (spell.targetType === 'all_enemies') {
             document.querySelectorAll(enemiesSelector).forEach(el => el.classList.add('target-highlight'));
        } else if (spell.targetType === 'all_allies') {
            document.querySelectorAll(alliesSelector).forEach(el => el.classList.add('target-highlight'));
        } else {
            targetContainer.classList.add('target-highlight');
        }
    }
    
    function handleTargetMouseOut() {
        if (isTargeting) {
            document.querySelectorAll('.char-container.target-highlight').forEach(el => el.classList.remove('target-highlight'));
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
            <p><b>X:</b> Abrir menu de recompensas (GM - Modo Cenário).</p>
        </div>`;
        showInfoModal("Atalhos do Teclado", content);
    }
    
    // --- LÓGICA DO MODO CENÁRIO ---
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
        
        if (isGm) {
            theaterGlobalScale.value = dataToRender.globalTokenScale || 1.0;
            theaterSkillCheckButtons.classList.add('hidden');
        } else {
            renderSkillCheckButtons(state);
        }
        
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
    
    function renderSkillCheckButtons(state) {
        theaterSkillCheckButtons.innerHTML = '';
        const amIPlayer = myRole === 'player' && state.connectedPlayers[myPlayerKey];
        theaterSkillCheckButtons.classList.toggle('hidden', !amIPlayer);
        if(!amIPlayer) return;

        const attributes = ['forca', 'agilidade', 'protecao', 'constituicao', 'inteligencia', 'mente', 'sorte'];
        attributes.forEach(attr => {
            const btn = document.createElement('button');
            btn.className = 'skill-check-btn';
            
            let label = attr.charAt(0).toUpperCase() + attr.slice(1);
            if (attr === 'sorte') {
                label = 'Sorte';
            }
            
            btn.textContent = `Teste de ${label.replace('cao', 'ção')}`;
            btn.disabled = state.isSkillCheckActive;
            btn.onclick = () => {
                socket.emit('playerAction', { type: 'playerRollsSkillCheck', attribute: attr });
            };
            theaterSkillCheckButtons.appendChild(btn);
        });
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
                    const newScale = (tokenData.scale || 1.0) + (e.deltaY > 0 ? -0.15 : 0.15); // Aumentado para 0.15
                    selectedTokens.forEach(id => socket.emit('playerAction', { type: 'updateToken', token: { id, scale: Math.max(0.1, newScale) }}));
                }
            } else {
                const zoomIntensity = 0.1, scrollDirection = e.deltaY < 0 ? 1 : -1; // Aumentado para 0.1
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
    
    function activateCharacterSheetCheat() {
        characterSheetCheatActive = true;
        showInfoModal("Cheat Ativado", "Pontos e dinheiro aumentados. Todas as magias estão disponíveis.", true);
        updateCharacterSheet(); // Atualiza a ficha para refletir os novos valores
    }
    
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
            handleEquipmentChangeConfirmation();
            handlePointDistributionConfirmation();
        });
        document.getElementById('ingame-sheet-save-btn').addEventListener('click', () => handleSaveCharacter('ingame'));
        document.getElementById('ingame-sheet-load-btn').addEventListener('click', () => document.getElementById('ingame-load-char-input').click());
        document.getElementById('ingame-load-char-input').addEventListener('change', (e) => handleLoadCharacter(e, 'ingame'));
    }
    
    initialize();
});