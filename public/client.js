// client.js

document.addEventListener('DOMContentLoaded', () => {
    // --- VARIÁVEIS DE ESTADO GLOBAIS ---
    let myRole = null;
    let isGm = false;
    let currentGameState = null;
    const socket = io();
    let myRoomId = null;

    // --- DADOS DO JOGO (CARREGADOS DO SERVIDOR) ---
    let PLAYABLE_TOKENS = [];
    let GAME_DATA = {};
    let isDataInitialized = false;
    
    // --- ESTADO LOCAL DO CLIENTE ---
    let characterSheetInProgress = {};

    // --- FUNÇÕES DE UTILIDADE ---
    function scaleGame() {
        setTimeout(() => {
            const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
            const gameWrapper = document.getElementById('game-wrapper');
            gameWrapper.style.transform = `scale(${scale})`;
            gameWrapper.style.left = `${(window.innerWidth - (1280 * scale)) / 2}px`;
            gameWrapper.style.top = `${(window.innerHeight - (720 * scale)) / 2}px`;
        }, 10);
    }

    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.add('active');
        }
        scaleGame();
    }

    function copyToClipboard(text, element) { /* ... (Mantida) ... */ }
    function showInfoModal(title, text) { /* ... (Mantida) ... */ }

    // --- FLUXO PRINCIPAL DE RENDERIZAÇÃO ---
    function renderGame(state) {
        // Trava de segurança definitiva: Não faz nada até saber o papel.
        if (!myRole) {
            currentGameState = state;
            return;
        }

        currentGameState = state;
        if (!state) return;

        const myPlayerData = state.connectedPlayers?.[socket.id];

        if (isGm) {
            renderGmView(state);
        } else if (myRole === 'player') {
            renderPlayerView(state, myPlayerData);
        } else {
            renderSpectatorView(state);
        }
    }

    // --- RENDERIZAÇÃO DAS VISÕES ---
    function renderGmView(state) {
        switch (state.mode) {
            case 'lobby':
                showScreen('gm-initial-lobby');
                updateGmLobbyUI(state);
                break;
            // ... (outras visões do GM)
        }
    }

    function renderPlayerView(state, myData) {
        if (!myData || !myData.sheet) {
             showScreen('loading-screen');
             return;
        }
        switch(myData.sheet.status) {
            case 'creating_sheet': showScreen('character-entry-screen'); break;
            case 'selecting_token': showScreen('token-selection-screen'); renderTokenSelection(); break;
            case 'filling_sheet': showScreen('sheet-creation-screen'); renderSheetCreationUI(); break;
            case 'ready':
                switch(state.mode) {
                    case 'lobby': showScreen('player-waiting-screen'); document.getElementById('player-waiting-message').textContent = "Personagem pronto! Aguardando o Mestre..."; break;
                    // ... (outras visões)
                }
                break;
        }
    }

    function renderSpectatorView(state) { /* ... (Mantida) ... */ }

    function updateGmLobbyUI(state) {
        const inviteLinkEl = document.getElementById('gm-link-invite');
        if (myRoomId && inviteLinkEl) {
            const inviteUrl = `${window.location.origin}?room=${myRoomId}`;
            if (inviteLinkEl.textContent !== inviteUrl) {
                inviteLinkEl.textContent = inviteUrl;
            }
        }
        // ... (resto da função de listar jogadores mantida)
    }
    
    // --- LÓGICA DE CRIAÇÃO DE PERSONAGEM ---
    function startNewCharacter() {
        if (!currentGameState) return;
        const myData = currentGameState.connectedPlayers[socket.id];
        if (!myData) return;
        myData.sheet.status = 'selecting_token';
        characterSheetInProgress = {
            name: "Aventureiro", class: "", race: null, token: null, level: 1, xp: 0,
            money: 200, elements: {}, attributes: { forca: 0, agilidade: 0, protecao: 0, constituicao: 0, inteligencia: 0, mente: 0 },
            equipment: { weapon1: null, weapon2: null, shield: null, armor: null },
            spells: []
        };
        renderGame(currentGameState);
    }

    function renderTokenSelection() { /* ... (Mantida) ... */ }
    function confirmTokenSelection() { /* ... (Mantida) ... */ }

    function renderSheetCreationUI() {
        const sheet = characterSheetInProgress;
        const raceData = sheet.race ? GAME_DATA.races[sheet.race] : null;
        let attributePoints = 5 + (raceData?.bonus?.any || 0);
        let usedAttrPoints = 0;
        if(raceData){
            usedAttrPoints = Object.keys(sheet.attributes).reduce((total, key) => {
                const baseVal = (raceData.bonus[key] || 0) + (raceData.penalty[key] || 0);
                return total + (sheet.attributes[key] - baseVal);
            }, 0);
        }
        const remainingAttrPoints = attributePoints - usedAttrPoints;
        const usedElementPoints = Object.values(sheet.elements).reduce((a, b) => a + b, 0);
        const remainingElementPoints = 2 - usedElementPoints;
        const equipmentCost = Object.values(sheet.equipment).reduce((total, itemName) => {
            if (!itemName) return total;
            const item = Object.values(GAME_DATA.equipment).flatMap(cat => Object.values(cat)).find(i => i.name === itemName);
            return total + (item?.cost || 0);
        }, 0);
        const remainingMoney = 200 - equipmentCost;

        document.getElementById('points-to-distribute').textContent = remainingAttrPoints;
        document.getElementById('element-points-to-distribute').textContent = remainingElementPoints;
        document.getElementById('money-remaining').textContent = remainingMoney;
        document.getElementById('spells-to-select').textContent = 2 - sheet.spells.length;

        const raceContainer = document.getElementById('sheet-races');
        raceContainer.innerHTML = '';
        Object.values(GAME_DATA.races).forEach(race => { /* ... (lógica de renderização de raça mantida) ... */ });

        const attrContainer = document.getElementById('sheet-attributes');
        attrContainer.innerHTML = '';
        Object.keys(sheet.attributes).forEach(attr => { /* ... (lógica de renderização de atributo mantida) ... */ });
        
        const elementContainer = document.getElementById('sheet-elements');
        elementContainer.innerHTML = '';
        const elements = ["Fogo", "Água", "Terra", "Vento", "Luz", "Escuridão"];
        elements.forEach(el => { /* ... (lógica de renderização de elemento mantida) ... */ });

        const equipContainer = document.getElementById('sheet-equipment');
        const createSelect = (id, category, selectedValue) => { /* ... (lógica de renderização de equipamento mantida) ... */ };
        equipContainer.innerHTML = createSelect('weapon1', 'weapons', sheet.equipment.weapon1) + createSelect('weapon2', 'weapons', sheet.equipment.weapon2) + createSelect('shield', 'shields', sheet.equipment.shield) + createSelect('armor', 'armors', sheet.equipment.armor);
        
        const spellContainer = document.getElementById('sheet-spells');
        spellContainer.innerHTML = '';
        const chosenElements = Object.keys(sheet.elements);
        const availableSpells = Object.values(GAME_DATA.spells).filter(s => s.grade === 1 && chosenElements.includes(s.element));
        availableSpells.forEach(spell => { /* ... (lógica de renderização de magia mantida) ... */ });

        addSheetListeners();
    }

    function addSheetListeners() {
        const sheet = characterSheetInProgress;
        document.getElementById('sheet-name').onchange = (e) => sheet.name = e.target.value;
        document.getElementById('sheet-class').onchange = (e) => sheet.class = e.target.value;
        
        document.querySelectorAll('.attr-btn[data-attr]').forEach(btn => {
            btn.onclick = () => {
                const raceData = sheet.race ? GAME_DATA.races[sheet.race] : null;
                if (!raceData) { showInfoModal("Aviso", "Por favor, selecione uma raça antes de distribuir os pontos."); return; }
                
                const attr = btn.dataset.attr;
                const amount = parseInt(btn.dataset.amount);
                const baseValue = (raceData.bonus[attr] || 0) + (raceData.penalty[attr] || 0);
                let attributePoints = 5 + (raceData.bonus.any || 0);
                let usedAttrPoints = Object.keys(sheet.attributes).reduce((total, key) => {
                    const attrBase = (raceData.bonus[key] || 0) + (raceData.penalty[key] || 0);
                    return total + (sheet.attributes[key] - attrBase);
                }, 0);

                if (amount > 0 && usedAttrPoints < attributePoints) sheet.attributes[attr] += 1;
                else if (amount < 0 && sheet.attributes[attr] > baseValue) sheet.attributes[attr] -= 1;
                renderSheetCreationUI();
            };
        });

        document.querySelectorAll('.attr-btn[data-el]').forEach(btn => {
            btn.onclick = () => {
                const el = btn.dataset.el;
                const amount = parseInt(btn.dataset.amount);
                const currentPoints = sheet.elements[el] || 0;
                const usedElementPoints = Object.values(sheet.elements).reduce((a, b) => a + b, 0);

                if (amount > 0 && usedElementPoints < 2 && currentPoints < 2) {
                    sheet.elements[el] = currentPoints + 1;
                } else if (amount < 0 && currentPoints > 0) {
                    sheet.elements[el] = currentPoints - 1;
                    if (sheet.elements[el] === 0) delete sheet.elements[el];
                }
                renderSheetCreationUI();
            };
        });

        const updateEquipment = (event) => {
            const previousEquipment = { ...sheet.equipment };
            const selectId = event.target.id;
            const selectedValue = event.target.value;
            
            const newSheetState = JSON.parse(JSON.stringify(sheet));
            newSheetState.equipment[selectId] = selectedValue || null;

            const newCost = Object.values(newSheetState.equipment).reduce((total, itemName) => {
                if (!itemName) return total;
                const item = Object.values(GAME_DATA.equipment).flatMap(cat => Object.values(cat)).find(i => i.name === itemName);
                return total + (item?.cost || 0);
            }, 0);

            if (200 - newCost < 0) {
                showInfoModal("Dinheiro Insuficiente", "Você não pode comprar este item pois seu dinheiro ficaria negativo.");
                event.target.value = previousEquipment[selectId]; // Reverte a seleção na UI
                return;
            }

            sheet.equipment = newSheetState.equipment;

            const w1 = GAME_DATA.equipment.weapons[sheet.equipment.weapon1];
            const hasStrFor2H = (sheet.attributes.forca || 0) >= 4;
            if (w1 && w1.hands === 2 && !hasStrFor2H) {
                sheet.equipment.weapon2 = null;
                sheet.equipment.shield = null;
            }
            if (sheet.equipment.weapon2 && sheet.equipment.shield) {
                if (selectId === 'weapon2') sheet.equipment.shield = null;
                else sheet.equipment.weapon2 = null;
            }

            renderSheetCreationUI();
        };
        document.getElementById('sheet-equipment').querySelectorAll('select').forEach(sel => sel.onchange = updateEquipment);
    }

    function finishSheetCreation() { /* ... (Mantida) ... */ }
    function saveCharacterToFile() { /* ... (Mantida) ... */ }

    // --- INICIALIZAÇÃO E LISTENERS DE SOCKET ---
    socket.on('initialData', (data) => {
        PLAYABLE_TOKENS = data.playableTokens;
        GAME_DATA = data.gameData;
        isDataInitialized = true;
        renderGame(currentGameState);
    });

    socket.on('assignRole', (data) => {
        myRole = data.role; 
        isGm = !!data.isGm; 
        myRoomId = data.roomId;
        renderGame(currentGameState);
    });
    
    socket.on('gameUpdate', (gameState) => {
        currentGameState = gameState;
        renderGame(gameState);
    });

    socket.on('roomCreated', (roomId) => { 
        myRoomId = roomId;
    });
    
    socket.on('promptForRole', ({ isFull }) => {
        showScreen('role-selection-screen');
        document.getElementById('join-as-player-btn').disabled = isFull;
    });
    
    function initialize() {
        showScreen('loading-screen');

        document.getElementById('join-as-player-btn').addEventListener('click', () => { /* ... */ });
        document.getElementById('join-as-spectator-btn').addEventListener('click', () => { /* ... */ });
        document.getElementById('new-char-btn').addEventListener('click', startNewCharacter);
        document.getElementById('confirm-token-btn').addEventListener('click', confirmTokenSelection);
        document.getElementById('finish-sheet-btn').addEventListener('click', finishSheetCreation);
        document.getElementById('save-sheet-btn').addEventListener('click', saveCharacterToFile);
        document.getElementById('gm-link-invite').addEventListener('click', (e) => {
            if(myRoomId) {
                const inviteUrl = `${window.location.origin}?room=${myRoomId}`;
                copyToClipboard(inviteUrl, e.target);
            }
        });
        
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoomId = urlParams.get('room');
        
        if (urlRoomId) {
            socket.emit('playerJoinsLobby', { roomId: urlRoomId });
        } else {
            socket.emit('gmCreatesLobby');
        }

        window.addEventListener('resize', scaleGame);
        scaleGame();
    }
    
    initialize();
});