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
    
    function initializeGlobalKeyListeners() {
        const cheatCode = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'a', 'b'];
        let userInputSequence = [];

        window.addEventListener('keydown', (e) => {
            if (!currentGameState) return;

            const focusedEl = document.activeElement;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(focusedEl.tagName)) {
                 if (e.key === 'Escape' && shopModal.classList.contains('active')) {
                    toggleShop();
                }
                return;
            }

            const characterSheetScreen = document.getElementById('character-sheet-screen');
            if (characterSheetScreen.classList.contains('active')) {
                const key = e.key.toLowerCase();
                userInputSequence.push(key);
                if (userInputSequence.length > cheatCode.length) {
                    userInputSequence.shift();
                }
                if (JSON.stringify(userInputSequence) === JSON.stringify(cheatCode)) {
                    activateCharacterSheetCheat();
                    userInputSequence = [];
                }
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
                showInfoModal("Modo Depuração de Combate", `Modo de depuração de combate ${isGmDebugModeActive ? 'ATIVADO' : 'DESATIVADO'}.`);
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
            
            if (currentGameState.mode === 'theater') {
                if (isGm && e.key.toLowerCase() === 'i') {
                    e.preventDefault();
                    toggleShop();
                }
                if (isGm && e.key.toLowerCase() === 'x') {
                    e.preventDefault();
                    showGmAwardModal();
                }
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
    
    function showScenarioSelectionModal(mode = 'theater'){
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
    
        const title = mode === 'adventure' ? "Escolha o Cenário da Batalha" : "Mudar Cenário";
        showCustomModal(title, contentHtml, []);
    
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
                if (mode === 'adventure') {
                    socket.emit("playerAction", { type: 'gmSetsBattleScenario', scenario: `mapas/${path}` });
                } else {
                    socket.emit("playerAction", { type: 'changeScenario', scenario: path });
                }
                modal.classList.add("hidden");
            });
        });
    }
    
    // --- LÓGICA DA FICHA DE PERSONAGEM (ALMARA RPG) ---
    function initializeCharacterSheet() {
        characterSheetCheatActive = false; // Reseta o cheat ao inicializar a ficha
        stagedCharacterSheet = {
            level: 1,
            spells: [],
            weapon1: { img: null, isRanged: false },
            weapon2: { img: null, isRanged: false },
            tokenImg: null, // Token final
            manualTokenImg: null, // Token escolhido manualmente
            raceTokenImg: null, // Token vindo da raça
            maxAttrPoints: 5,
            maxElemPoints: 2,
            maxSpells: 2
        };
        racePreviewModal.classList.add('hidden');

        const raceSelect = document.getElementById('sheet-race-select');
        let raceOptionsHtml = '<option value="" disabled selected>Selecione uma Raça...</option>';
        raceOptionsHtml += Object.keys(GAME_RULES.races).map(race => `<option value="${race}">${race}</option>`).join('');
        raceSelect.innerHTML = raceOptionsHtml;
        
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

        // Event listeners para a nova lógica de token
        document.getElementById('sheet-token-placeholder').onclick = showManualTokenSelectionModal;
        
        updateCharacterSheet();
    }

    function showManualTokenSelectionModal() {
        const content = `
            <div class="character-list-container" style="max-height: 400px; overflow-y: auto;">
                ${ALL_PLAYER_IMAGES.map(imgPath => {
                    return `<div class="char-card" data-img="${imgPath}">
                                <img src="${imgPath}" alt="Token">
                            </div>`;
                }).join('')}
            </div>`;

        showCustomModal("Escolha um Token Personalizado", content, [
            {
                text: 'Remover Token Personalizado',
                className: 'btn-danger',
                closes: true,
                onClick: () => {
                    stagedCharacterSheet.manualTokenImg = null;
                    stagedCharacterSheet.tokenImg = stagedCharacterSheet.raceTokenImg; // Retorna para o token da raça, se houver
                    updateTokenDisplayOnSheet();
                }
            },
            { text: "Voltar", closes: true, className: 'btn-secondary' }
        ]);

        document.querySelectorAll('#modal .char-card').forEach(card => {
            card.onclick = () => {
                const imgPath = card.dataset.img;
                stagedCharacterSheet.manualTokenImg = imgPath;
                stagedCharacterSheet.tokenImg = imgPath;
                updateTokenDisplayOnSheet();
                modal.classList.add('hidden');
            };
        });
    }
    
    function fixRacePreview(raceName) {
        const img1 = document.getElementById('race-preview-img1');
        const img2 = document.getElementById('race-preview-img2');

        img1.src = `/images/players/${raceName}1.png`;
        img2.src = `/images/players/${raceName}2.png`;
        
        img1.dataset.imgPath = `/images/players/${raceName}1.png`;
        img2.dataset.imgPath = `/images/players/${raceName}2.png`;

        racePreviewModal.classList.remove('hidden');

        document.querySelectorAll('.race-preview-image').forEach(img => {
            img.onclick = (e) => {
                const imgPath = e.target.dataset.imgPath;
                stagedCharacterSheet.raceTokenImg = imgPath;
                if (!stagedCharacterSheet.manualTokenImg) {
                    stagedCharacterSheet.tokenImg = imgPath;
                }
                updateTokenDisplayOnSheet();
                racePreviewModal.classList.add('hidden');
            };
        });
    }
    
    function updateTokenDisplayOnSheet() {
        const placeholder = document.getElementById('sheet-token-placeholder');
        if (stagedCharacterSheet.tokenImg) {
            placeholder.style.backgroundImage = `url('${stagedCharacterSheet.tokenImg}')`;
            placeholder.classList.add('has-image');
        } else {
            placeholder.style.backgroundImage = 'none';
            placeholder.classList.remove('has-image');
        }
    }

    function getElementHexColor(elementName) {
        const colors = {
            fogo: '#ff4d4d', agua: '#4da6ff', vento: '#00cc66', terra: '#a67c52',
            luz: '#ffffff', escuridao: '#b366ff',
            'Chama Azul': '#007bff', 'Gelo': '#a3d8f4', 'Metal': '#c0c0c0',
            'Raio': '#ffd700', 'Cura': '#90ee90', 'Gravidade': '#9370db',
            'Névoa': '#cccccc', 'Calor': '#ffa500', 'Magma': '#ff4500', 
            'Bênção': '#fffacd', 'Maldição': '#8b0000', 'Tempestade': '#708090',
            'Barro': '#8b4513', 'Poção de Cura': '#98FB98', 'Veneno': '#9400d3',
            'Areia': '#f4a460', 'Aurora': '#dda0dd', 'Sussurro': '#483d8b',
            'Natureza': '#228b22', 'Abismo': '#2f4f4f', 'Nulificação': '#808080'
        };
        return colors[elementName] || '#ffffff';
    }

    function getElementColors(elementName, requiredElements = []) {
        if (requiredElements && requiredElements.length === 2) {
            const color1 = getElementHexColor(requiredElements[0]);
            const color2 = getElementHexColor(requiredElements[1]);
            return `linear-gradient(to right, ${color1} 50%, ${color2} 50%)`;
        }
        const color = getElementHexColor(elementName);
        return `linear-gradient(to top, ${color}, ${color})`;
    }
    
    function updateCharacterSheet(loadedData = null, event = null) {
        if (!GAME_RULES.races) return; 
        
        const raceSelect = document.getElementById('sheet-race-select');
        const selectedRace = loadedData ? loadedData.race : raceSelect.value;
        
        if (event && event.type === 'change' && event.target.id === 'sheet-race-select') {
            if (selectedRace) {
                fixRacePreview(selectedRace);
            } else {
                racePreviewModal.classList.add('hidden');
            }
        }
        
        document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
        
        const weapon1Select = document.getElementById('sheet-weapon1-type');
        const weapon2Select = document.getElementById('sheet-weapon2-type');
        const shieldSelect = document.getElementById('sheet-shield-type');
        const armorSelect = document.getElementById('sheet-armor-type');
        
        const raceData = GAME_RULES.races[selectedRace] || { bon: {}, pen: {}, text: 'Selecione uma raça para ver os detalhes.' };
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
        let infoText = '';

        const checkAndHandleRequirement = (itemSelect, itemType, defaultOption) => {
            const itemName = itemSelect.value;
            if (itemName === defaultOption) return false;

            const itemData = (GAME_RULES[itemType] || {})[itemName] || {};
            if (itemData.req_forca && finalAttributes.forca < itemData.req_forca) {
                if (itemSelect.value !== defaultOption) {
                    showInfoModal("Requisito não atendido", `Você precisa de ${itemData.req_forca} de Força para usar ${itemName}.`);
                    itemSelect.value = defaultOption;
                    return true; 
                }
            }
            return false;
        };

        if (event) { // A verificação só ocorre em uma interação do usuário
            if (checkAndHandleRequirement(weapon1Select, 'weapons', 'Desarmado')) return updateCharacterSheet();
            if (checkAndHandleRequirement(weapon2Select, 'weapons', 'Desarmado')) return updateCharacterSheet();
            if (checkAndHandleRequirement(shieldSelect, 'shields', 'Nenhum')) return updateCharacterSheet();
        }

        let weapon1Data = GAME_RULES.weapons[weapon1Select.value] || {};
        let weapon2Data = GAME_RULES.weapons[weapon2Select.value] || {};
        
        if (weapon1Data.hand === 2 && !canWield2HInOneHand) {
            if (weapon2Select.value !== 'Desarmado') {
                weapon2Select.value = 'Desarmado';
                stagedCharacterSheet.weapon2.img = null; // Limpa a imagem
            }
            if (shieldSelect.value !== 'Nenhum') shieldSelect.value = 'Nenhum';
            infoText += 'Arma de 2 mãos requer ambas as mãos. É preciso 4 de Força para usá-la com uma mão. ';
        }
        if (weapon2Data.hand === 2 && !canWield2HInOneHand) {
            if (weapon1Select.value !== 'Desarmado') {
                weapon1Select.value = 'Desarmado';
                stagedCharacterSheet.weapon1.img = null; // Limpa a imagem
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


        const startingMoney = characterSheetCheatActive ? 5000 : 200;
        let cost = (weapon1Data.cost || 0) + (weapon2Data.cost || 0) + (armorData.cost || 0) + (shieldData.cost || 0);
        if (cost > startingMoney && event && event.target && event.type === 'change') {
            alert("Dinheiro insuficiente!");
            const changedElement = event.target;
            changedElement.value = (changedElement.id.includes('weapon')) ? "Desarmado" : (changedElement.id.includes('armor') ? "Nenhuma" : "Nenhum");
            return updateCharacterSheet();
        }
        document.getElementById('sheet-money-copper').textContent = startingMoney - cost;
        
        const maxAttrPoints = characterSheetCheatActive ? 500 : (stagedCharacterSheet.maxAttrPoints + (raceData.bon?.escolha || 0));
        const totalAttrPoints = Object.values(baseAttributes).reduce((sum, val) => sum + val, 0);
        const attrPointsRemaining = maxAttrPoints - totalAttrPoints;
        document.getElementById('sheet-points-attr-remaining').textContent = attrPointsRemaining;
        document.querySelectorAll('#attribute-points-header ~ .attributes-grid .up-arrow').forEach(btn => btn.disabled = attrPointsRemaining <= 0);

        const maxElemPoints = characterSheetCheatActive ? 100 : stagedCharacterSheet.maxElemPoints;
        const totalElemPoints = Object.values(elements).reduce((sum, val) => sum + val, 0);
        const elemPointsRemaining = maxElemPoints - totalElemPoints;
        document.getElementById('sheet-points-elem-remaining').textContent = elemPointsRemaining;
        document.querySelectorAll('.elements-grid .up-arrow').forEach(btn => btn.disabled = elemPointsRemaining <= 0);

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
        
        let availableSpells = [];
        if (characterSheetCheatActive) {
            availableSpells = [
                ...(ALL_SPELLS.grade1 || []), ...(ALL_SPELLS.advanced_grade1 || []),
                ...(ALL_SPELLS.grade2 || []), ...(ALL_SPELLS.advanced_grade2 || []),
                ...(ALL_SPELLS.grade3 || []), ...(ALL_SPELLS.advanced_grade3 || []),
                ...(ALL_SPELLS.grade_combined || [])
            ];
        } else {
            const availableElements = Object.keys(elements).filter(e => elements[e] > 0);
            const allSpellsForNormalMode = [
                ...(ALL_SPELLS.grade1 || []), ...(ALL_SPELLS.advanced_grade1 || []),
                ...(ALL_SPELLS.grade_combined || [])
            ];
            
            availableSpells = allSpellsForNormalMode.filter(spell => {
                if (spell.requiredElements) {
                    return spell.requiredElements.every(reqElem => availableElements.includes(reqElem));
                }
                if (spell.isAdvanced) {
                    return elements[spell.element] === 2;
                }
                return availableElements.includes(spell.element);
            });
        }
        
        stagedCharacterSheet.spells = stagedCharacterSheet.spells.filter(spellName => 
            availableSpells.some(availableSpell => availableSpell.name === spellName)
        );

        const maxSpells = characterSheetCheatActive ? 999 : (stagedCharacterSheet.maxSpells || 2);
        
        availableSpells.forEach(spell => {
            const card = document.createElement('div');
            card.className = 'spell-card';
            card.dataset.spellName = spell.name;
            const spellType = spell.inCombat ? '(Combate)' : '(Utilitário)';
            
            let elementHtml;
            if (spell.combinedElementName) {
                const color = getElementColors(spell.combinedElementName, spell.requiredElements);
                elementHtml = `<span class="spell-element" style="background-image: ${color};">${spell.combinedElementName}</span>`;
            } else {
                const elementName = spell.isAdvanced ? GAME_RULES.advancedElements[spell.element] : spell.element;
                const color = getElementColors(elementName);
                const capitalizedElement = elementName.charAt(0).toUpperCase() + elementName.slice(1);
                elementHtml = `<span class="spell-element" style="background-image: ${color};">${capitalizedElement}</span>`;
            }

            card.innerHTML = `
                <div class="spell-card-header">
                    <h4>${spell.name} <small>${spellType}</small></h4>
                    ${elementHtml}
                </div>
                <p>${spell.description}</p>`;
                
            if (stagedCharacterSheet.spells.includes(spell.name)) {
                card.classList.add('selected');
            }

            card.addEventListener('click', () => {
                if (stagedCharacterSheet.spells.includes(spell.name)) {
                    stagedCharacterSheet.spells = stagedCharacterSheet.spells.filter(s => s !== spell.name);
                } else if (stagedCharacterSheet.spells.length < maxSpells) {
                    stagedCharacterSheet.spells.push(spell.name);
                } else {
                    alert(`Você pode escolher no máximo ${maxSpells} magias.`);
                }
                updateCharacterSheet();
            });
            spellGrid.appendChild(card);
        });
        
        const spellCountSpan = document.getElementById('sheet-spells-selected-count');
        if (characterSheetCheatActive) {
            spellCountSpan.parentElement.innerHTML = `(<span id="sheet-spells-selected-count">${stagedCharacterSheet.spells.length}</span> selecionadas)`;
        } else {
            spellCountSpan.parentElement.innerHTML = `(<span id="sheet-spells-selected-count">${stagedCharacterSheet.spells.length}</span>/${maxSpells} selecionadas)`;
        }
    }

    function showWeaponImageSelectionModal(weaponSlot, callback = null) {
        const isNpc = weaponSlot.startsWith('npc-');
        const weaponId = isNpc ? weaponSlot.replace('npc-', '') : weaponSlot;
        const weaponType = document.getElementById(isNpc ? `npc-cfg-${weaponId}` : `sheet-${weaponId}-type`).value;
        const images = ALL_WEAPON_IMAGES[weaponType];

        if (!images || (images.melee.length === 0 && images.ranged.length === 0)) {
            const data = { name: weaponType, img: null, isRanged: false, type: weaponType };
            if(callback) callback(data);
            else if(!isNpc) stagedCharacterSheet[weaponId] = data;
            
            if(!isNpc) updateCharacterSheet();
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
                        const data = { name: weaponType, img: imgPath, isRanged: isRanged, type: weaponType };
                        if(callback) callback(data);
                        else if(!isNpc) stagedCharacterSheet[weaponId] = data;
                        
                        weaponImageModal.classList.add('hidden');
                        if (!isNpc) updateCharacterSheet();
                    };
                    grid.appendChild(card);
                });
                
                categoryDiv.appendChild(grid);
                modalBody.appendChild(categoryDiv);
            }
        };

        createSection('Armas Corpo a Corpo', images.melee, false);
        createSection('Armas de Longa Distância', images.ranged, true);
        
        document.getElementById('weapon-image-modal-cancel').onclick = () => {
             weaponImageModal.classList.add('hidden');
             if(!isNpc) {
                document.getElementById(`sheet-${weaponId}-type`).value = 'Desarmado';
                stagedCharacterSheet[weaponId].img = null;
                updateCharacterSheet();
             }
        };

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
            tokenName: isCreation ? (stagedCharacterSheet.tokenImg ? stagedCharacterSheet.tokenImg.split('/').pop().split('.')[0] : '') : myFighter.sheet.tokenName,
            tokenImg: isCreation ? stagedCharacterSheet.tokenImg : myFighter.sheet.tokenImg,
            class: isCreation ? document.getElementById('sheet-class').value : myFighter.sheet.class,
            race: isCreation ? document.getElementById('sheet-race-select').value : myFighter.sheet.race,
            money: parseInt(document.getElementById(isCreation ? 'sheet-money-copper' : 'ingame-sheet-money')?.textContent || '0', 10),
            level: myFighter?.level || stagedCharacterSheet.level || 1,
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
            // Preserve inventory and ammo if it exists from a loaded file
            if (stagedCharacterSheet.inventory) data.inventory = stagedCharacterSheet.inventory;
            if (stagedCharacterSheet.ammunition) data.ammunition = stagedCharacterSheet.ammunition;
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

                    // --- AJUSTE PARA CARREGAR PERSONAGEM DE NÍVEL ALTO ---
                    const level = decryptedData.level || 1;
                    let maxAttrPoints = 5;
                    let maxElemPoints = 2;
                    let maxSpells = 2;

                    for (let i = 2; i <= level; i++) {
                        const levelData = LEVEL_UP_TABLE[i];
                        if (levelData) {
                            maxAttrPoints += levelData.rewards.attrPoints || 0;
                            maxElemPoints += levelData.rewards.elemPoints || 0;
                            maxSpells += levelData.rewards.spellCount || 0;
                        }
                    }

                    stagedCharacterSheet.level = level;
                    stagedCharacterSheet.maxAttrPoints = maxAttrPoints;
                    stagedCharacterSheet.maxElemPoints = maxElemPoints;
                    stagedCharacterSheet.maxSpells = maxSpells;
                    stagedCharacterSheet.inventory = decryptedData.inventory; // Preserva inventário
                    stagedCharacterSheet.ammunition = decryptedData.ammunition; // Preserva munição
                    // --- FIM DO AJUSTE ---

                    stagedCharacterSheet.tokenImg = decryptedData.tokenImg || null;
                    stagedCharacterSheet.manualTokenImg = decryptedData.tokenImg || null;
                    stagedCharacterSheet.raceTokenImg = null;
                    stagedCharacterSheet.spells = decryptedData.spells || [];
                    stagedCharacterSheet.weapon1 = decryptedData.equipment?.weapon1 || { img: null, isRanged: false, type: 'Desarmado' };
                    stagedCharacterSheet.weapon2 = decryptedData.equipment?.weapon2 || { img: null, isRanged: false, type: 'Desarmado' };
                    
                    document.getElementById('sheet-name').value = decryptedData.name || '';
                    document.getElementById('sheet-class').value = decryptedData.class || '';
                    document.getElementById('sheet-race-select').value = decryptedData.race || '';

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

                    updateTokenDisplayOnSheet();
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
        const selectedRace = document.getElementById('sheet-race-select').value;
        if (!selectedRace) {
            alert("Por favor, selecione uma raça para o seu personagem.");
            return;
        }

        const maxSpells = characterSheetCheatActive ? 999 : (stagedCharacterSheet.maxSpells || 2);
        if (stagedCharacterSheet.spells.length > maxSpells) {
            alert(`Você só pode ter até ${maxSpells} magias. Por favor, desmarque o excedente.`);
            return;
        }

        const attrPointsRemaining = parseInt(document.getElementById('sheet-points-attr-remaining').textContent, 10);
        const elemPointsRemaining = parseInt(document.getElementById('sheet-points-elem-remaining').textContent, 10);

        let warnings = [];
        if(!characterSheetCheatActive) {
            if(attrPointsRemaining > 0) warnings.push(`Você ainda tem ${attrPointsRemaining} pontos de atributo para distribuir.`);
            if(elemPointsRemaining > 0) warnings.push(`Você ainda tem ${elemPointsRemaining} pontos de elemento para distribuir.`);
            if(stagedCharacterSheet.spells.length < maxSpells) warnings.push(`Você pode escolher mais ${maxSpells - stagedCharacterSheet.spells.length} magias.`);
        }


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
    
    // --- LÓGICA DA FICHA/INVENTÁRIO EM JOGO ---

    function toggleIngameSheet() {
        const modal = document.getElementById('ingame-sheet-modal');
        if (!modal || !currentGameState) return;
    
        const isHidden = modal.classList.contains('hidden');
        if (isHidden) {
            const myFighterData = getFighter(currentGameState, myPlayerKey);
            if (!myFighterData) return;
            originalEquipmentState = JSON.parse(JSON.stringify(myFighterData.sheet.equipment));
            populateIngameSheet(myFighterData, false);
            modal.classList.remove('hidden');
        } else {
            handleEquipmentChangeConfirmation();
            handlePointDistributionConfirmation();
            modal.classList.add('hidden');
            modal.dataset.viewingPlayerId = '';
        }
    }
    
    function populateIngameSheet(fighter, isGmView = false) {
        if (!fighter || !fighter.sheet) return;

        const sheetModal = document.getElementById('ingame-sheet-modal');
        sheetModal.classList.toggle('gm-view-mode', isGmView);
        sheetModal.dataset.viewingPlayerId = fighter.id;
        document.getElementById('gm-edit-inventory-btn').classList.add('hidden');
    
        const isAdventureMode = currentGameState.mode === 'adventure';
        const isMyTurn = isAdventureMode && currentGameState.activeCharacterKey === fighter.id;
        const canEditEquipment = !isGmView && (!isAdventureMode || isMyTurn);
        
        const loadBtn = document.getElementById('ingame-sheet-load-btn');
        loadBtn.disabled = isGmView || isAdventureMode;
        loadBtn.title = (isGmView || isAdventureMode) ? 'Não é possível carregar um personagem neste modo.' : 'Carregar Ficha';

        document.getElementById('ingame-sheet-name').textContent = fighter.sheet.name || fighter.nome;
        const tokenImg = fighter.sheet.tokenImg;
        document.getElementById('ingame-sheet-token').style.backgroundImage = tokenImg ? `url("${tokenImg}")` : 'none';
        
        // Atualiza HP, Mahou, Nível e XP
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
            const forca = fighter.sheet.finalAttributes.forca || 0;
            let infoText = '';

            const checkAndHandleRequirement = (itemName, itemType, itemSelect, defaultOption) => {
                const itemData = (GAME_RULES[itemType] || {})[itemName] || {};
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

        updateAllEquipment(null); // Initial sync
    
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
        
        // Lógica de Level Up
        renderLevelUpDistribution(fighter);
    }
    
    // --- LÓGICA DA FICHA/INVENTÁRIO EM JOGO --- (Funções Re-adicionadas)

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
            return; // Nenhuma mudança, não faz nada
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
        if (Object.keys(stagedLevelUpChanges).length === 0) {
            ingameSheetModal.classList.add('hidden');
            return;
        }

        const myFighter = getFighter(currentGameState, myPlayerKey);
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
            sheetModal.dataset.viewingPlayerId = ''; // Limpa o ID ao fechar
            showGmInventoryEditor(playerFighter);
        };

        sheetModal.classList.remove('hidden');
    }

    function showGmInventoryEditor(player) {
        let stagedInventory = JSON.parse(JSON.stringify(player.inventory || {}));
        let stagedAmmunition = player.ammunition || 0;
    
        const nonItems = ['Desarmado', 'Nenhuma', 'Nenhum'];
        
        // CORREÇÃO: Criar um mapa de todos os itens do jogo UMA VEZ para consulta.
        const allGameItemsFlat = [
            ...Object.entries(GAME_RULES.weapons).flatMap(([weaponName, weaponData]) => {
                const items = [];
                const weaponImages = ALL_WEAPON_IMAGES[weaponName] || {};
                (weaponImages.melee || []).forEach(imgPath => {
                    const name = imgPath.split('/').pop().split('.')[0];
                    items.push({ ...weaponData, name, img: imgPath, type: 'weapon', baseType: weaponName, isRanged: false });
                });
                (weaponImages.ranged || []).forEach(imgPath => {
                    const name = imgPath.split('/').pop().split('.')[0];
                    items.push({ ...weaponData, name, img: imgPath, type: 'weapon', baseType: weaponName, isRanged: true });
                });
                if (items.length === 0 && !nonItems.includes(weaponName)) {
                     items.push({ ...weaponData, name: weaponName, type: 'weapon', baseType: weaponName });
                }
                return items;
            }),
            ...Object.entries(GAME_RULES.armors).map(([name, data]) => ({ ...data, name, type: 'armor', baseType: name })),
            ...Object.entries(GAME_RULES.shields).map(([name, data]) => ({ ...data, name, type: 'shield', baseType: name })),
            ...Object.entries(ALL_ITEMS).map(([name, data]) => ({ ...data, name, type: 'item', baseType: name }))
        ];
        const allItemsMap = new Map(allGameItemsFlat.map(item => [item.name, item]));

        const buildItemCatalogHtml = () => {
            const allGameItemsCategorized = {
                'Armas': allGameItemsFlat.filter(i => i.type === 'weapon' && i.name && !nonItems.includes(i.name)),
                'Armaduras': allGameItemsFlat.filter(i => i.type === 'armor' && i.name && !nonItems.includes(i.name)),
                'Escudos': allGameItemsFlat.filter(i => i.type === 'shield' && i.name && !nonItems.includes(i.name)),
                'Itens': allGameItemsFlat.filter(i => i.type === 'item' && i.name && !nonItems.includes(i.name)),
            };
    
            let catalogHtml = '<div class="shop-tabs">';
            const sanitizeForId = (str) => str.replace(/\s+/g, '-');

            Object.keys(allGameItemsCategorized).forEach((cat, i) => {
                catalogHtml += `<button class="shop-tab-btn ${i === 0 ? 'active' : ''}" data-category="${sanitizeForId(cat)}">${cat}</button>`;
            });
            catalogHtml += '</div><div class="shop-item-grids-container">';
    
            Object.entries(allGameItemsCategorized).forEach(([category, items], i) => {
                catalogHtml += `<div class="gm-inventory-grid shop-item-grid ${i === 0 ? 'active' : ''}" id="catalog-grid-${sanitizeForId(category)}">`;
                const uniqueItems = Array.from(new Map(items.map(item => [item.name, item])).values());
                
                uniqueItems.forEach(item => {
                    let imgPath = item.img;
                     if (!imgPath) {
                        if (item.type === 'armor') {
                            const armorImgName = item.name === 'Mediana' ? 'Armadura Mediana' : `Armadura ${item.name}`;
                            imgPath = `/images/armas/${armorImgName}.png`.replace(/ /g, '%20');
                        } else if (item.type === 'shield') {
                            const shieldImgName = item.name === 'Médio' ? 'Escudo Medio' : `Escudo ${item.name}`;
                            imgPath = `/images/armas/${shieldImgName}.png`.replace(/ /g, '%20');
                        }
                    }
                    catalogHtml += `
                        <div class="gm-inv-item-card" data-item-name="${item.name}" title="Adicionar ${item.name}">
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
                    stagedInventory[item.name].quantity = Math.max(1, stagedInventory[item.name].quantity - 1);
                    renderPlayerInventory();
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
        
        // Event Listeners for catalog
        const catalogContainer = document.getElementById('gm-item-catalog-container');
        const sanitizeForId = (str) => str.replace(/\s+/g, '-');
        catalogContainer.querySelectorAll('.shop-tab-btn').forEach(btn => {
            btn.onclick = () => {
                catalogContainer.querySelectorAll('.shop-tab-btn, .shop-item-grid').forEach(el => el.classList.remove('active'));
                btn.classList.add('active');
                catalogContainer.querySelector(`#catalog-grid-${btn.dataset.category}`).classList.add('active');
            };
        });
    
        catalogContainer.querySelectorAll('.gm-inv-item-card').forEach(card => {
            card.onclick = () => {
                const itemName = card.dataset.itemName;
                const sourceItem = allItemsMap.get(itemName);
                
                if (sourceItem) {
                    if (!stagedInventory[itemName]) {
                        stagedInventory[itemName] = { ...JSON.parse(JSON.stringify(sourceItem)), quantity: 1 };
                    } else {
                        stagedInventory[itemName].quantity++;
                    }
                    renderPlayerInventory();
                } else {
                    console.warn(`Item "${itemName}" não encontrado no catálogo.`);
                }
            };
        });
        
        document.getElementById('gm-inventory-search').oninput = (e) => {
            const searchTerm = e.target.value.toLowerCase();
            catalogContainer.querySelectorAll('.gm-inv-item-card').forEach(card => {
                const itemName = card.dataset.itemName.toLowerCase();
                card.style.display = itemName.includes(searchTerm) ? '' : 'none';
            });
        };
    }

    // --- INICIALIZAÇÃO E LISTENERS DE SOCKET ---
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
        // Apenas um log ou talvez nada, já que o texto flutuante já notifica.
        console.log("Level Up! Abra a ficha para distribuir os pontos.");
    });
    
    socket.on('gameUpdate', (gameState) => { 
        if (clientFlowState === 'initializing') return;
        renderGame(gameState); 
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
            handlePointDistributionConfirmation(); // Adicionado para confirmar pontos ao fechar
            ingameSheetModal.classList.add('hidden');
            ingameSheetModal.dataset.viewingPlayerId = '';
        });
        document.getElementById('ingame-sheet-save-btn').addEventListener('click', () => handleSaveCharacter('ingame'));
        document.getElementById('ingame-sheet-load-btn').addEventListener('click', () => document.getElementById('ingame-load-char-input').click());
        document.getElementById('ingame-load-char-input').addEventListener('change', (e) => handleLoadCharacter(e, 'ingame'));
    }
    
    initialize();
});