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
        document.getElementById(screenId).classList.add('active');
        scaleGame(); // CORREÇÃO: Garante a escala em toda troca de tela.
    }

    function copyToClipboard(text, element) {
        navigator.clipboard.writeText(text).then(() => {
            const originalHTML = element.innerHTML;
            element.innerHTML = 'Copiado!';
            setTimeout(() => { element.innerHTML = originalHTML; }, 2000);
        });
    }

    function showInfoModal(title, text) {
        const modal = document.getElementById('modal');
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-text').innerHTML = text;
        modal.classList.remove('hidden');
        document.getElementById('modal-button').onclick = () => modal.classList.add('hidden');
    }

    // --- FLUXO PRINCIPAL DE RENDERIZAÇÃO ---
    function renderGame(state) {
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

    function renderSpectatorView(state) {
        showScreen('player-waiting-screen');
        document.getElementById('player-waiting-message').textContent = "Assistindo... Aguardando o Mestre iniciar.";
    }

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
        // Inicializa a ficha com valores padrão para evitar erros
        characterSheetInProgress = {
            name: "Aventureiro", class: "", race: null, token: null, level: 1, xp: 0,
            money: 200, elements: {}, attributes: { forca: 0, agilidade: 0, protecao: 0, constituicao: 0, inteligencia: 0, mente: 0 },
            equipment: { weapon1: null, weapon2: null, shield: null, armor: null },
            spells: []
        };
        renderGame(currentGameState);
    }

    function renderTokenSelection() {
        const container = document.getElementById('token-list-container');
        if (!PLAYABLE_TOKENS || PLAYABLE_TOKENS.length === 0) {
            container.innerHTML = '<p>Carregando personagens...</p>';
            return;
        }
        
        container.innerHTML = '';
        PLAYABLE_TOKENS.forEach(token => {
            const card = document.createElement('div');
            card.className = 'token-card';
            card.innerHTML = `<img src="${token.img}" alt="${token.name}">`;
            card.onclick = () => {
                characterSheetInProgress.token = token;
                document.querySelectorAll('.token-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                document.getElementById('confirm-token-btn').disabled = false;
            };
            container.appendChild(card);
        });
    }
    
    function confirmTokenSelection() {
        if (!currentGameState) return;
        const myData = currentGameState.connectedPlayers[socket.id];
        if (!myData) return;
        myData.sheet.status = 'filling_sheet';
        myData.sheet.token = characterSheetInProgress.token;
        characterSheetInProgress.token = myData.sheet.token;
        renderGame(currentGameState);
    }

    function renderSheetCreationUI() {
        // CORREÇÃO DEFINITIVA: Função completamente preenchida com toda a lógica da ficha.
        const sheet = characterSheetInProgress;
        const container = document.querySelector('.sheet-form-container');
        
        // --- CÁLCULOS ---
        const raceData = sheet.race ? GAME_DATA.races[sheet.race] : null;
        let attributePoints = 5 + (raceData?.bonus?.any || 0);
        let usedAttrPoints = 0;
        if(raceData){
            usedAttrPoints = Object.keys(sheet.attributes).reduce((total, key) => {
                const baseVal = (raceData.bonus[key] || 0) + (raceData.penalty[key] || 0);
                return total + (sheet.attributes[key] - baseVal);
            }, 0);
        }

        const usedElementPoints = Object.values(sheet.elements).reduce((a, b) => a + b, 0);
        const remainingElementPoints = 2 - usedElementPoints;
        
        const equipmentCost = Object.values(sheet.equipment).reduce((total, itemName) => {
            if (!itemName) return total;
            const item = Object.values(GAME_DATA.equipment).flatMap(cat => Object.values(cat)).find(i => i.name === itemName);
            return total + (item?.cost || 0);
        }, 0);
        const remainingMoney = 200 - equipmentCost;

        // --- RENDERIZAÇÃO DO HTML ---
        container.innerHTML = `
            <div class="sheet-section"><h3>Identidade</h3><div class="form-grid">
                <div class="form-field"><label for="sheet-name">Nome:</label><input type="text" id="sheet-name" value="${sheet.name}"></div>
                <div class="form-field"><label for="sheet-class">Classe:</label><input type="text" id="sheet-class" value="${sheet.class}"></div>
            </div></div>
            <div class="sheet-section"><h3>Raça</h3><div class="form-grid" id="sheet-races"></div></div>
            <div class="sheet-section"><h3>Atributos (<span id="points-to-distribute">${attributePoints - usedAttrPoints}</span> pontos restantes)</h3><div class="form-grid" id="sheet-attributes"></div></div>
            <div class="sheet-section"><h3>Elementos (${remainingElementPoints} pontos restantes)</h3><div class="form-grid" id="sheet-elements"></div></div>
            <div class="sheet-section"><h3>Equipamentos (Dinheiro Restante: ${remainingMoney} moedas)</h3><div class="form-grid" id="sheet-equipment"></div></div>
            <div class="sheet-section"><h3>Magias (Selecione ${2 - sheet.spells.length} de Grau 1)</h3><div class="form-grid" id="sheet-spells"></div></div>
        `;
        
        // --- POPULAR E ADICIONAR LISTENERS ---
        const raceContainer = document.getElementById('sheet-races');
        Object.values(GAME_DATA.races).forEach(race => {
            const card = document.createElement('div');
            card.className = `race-card ${sheet.race === race.name ? 'selected' : ''}`;
            card.innerHTML = `<h4>${race.name}</h4><p>${race.uniqueAbility}</p>`;
            card.onclick = () => {
                sheet.race = race.name;
                sheet.attributes = { forca: 0, agilidade: 0, protecao: 0, constituicao: 0, inteligencia: 0, mente: 0 };
                Object.entries(race.bonus || {}).forEach(([attr, val]) => { if(attr !== 'any') sheet.attributes[attr] += val; });
                Object.entries(race.penalty || {}).forEach(([attr, val]) => { sheet.attributes[attr] += val; });
                renderSheetCreationUI();
            };
            raceContainer.appendChild(card);
        });

        const attrContainer = document.getElementById('sheet-attributes');
        Object.keys(sheet.attributes).forEach(attr => {
            const field = document.createElement('div');
            field.className = 'attribute-field';
            field.innerHTML = `<span>${attr.charAt(0).toUpperCase() + attr.slice(1)}</span><input type="number" value="${sheet.attributes[attr]}" readonly><div class="attr-btn-group"><button class="attr-btn" data-attr="${attr}" data-amount="-1">-</button><button class="attr-btn" data-attr="${attr}" data-amount="1">+</button></div>`;
            attrContainer.appendChild(field);
        });

        const elementContainer = document.getElementById('sheet-elements');
        const elements = ["Fogo", "Água", "Terra", "Vento", "Luz", "Escuridão"];
        elements.forEach(el => {
            const points = sheet.elements[el] || 0;
            const card = document.createElement('div');
            card.className = 'attribute-field';
            card.innerHTML = `<span>${el} ${points === 2 ? `(Avançado!)` : ''}</span><input type="number" value="${points}" readonly><div class="attr-btn-group"><button class="attr-btn" data-el="${el}" data-amount="-1">-</button><button class="attr-btn" data-el="${el}" data-amount="1">+</button></div>`;
            elementContainer.appendChild(card);
        });

        const equipContainer = document.getElementById('sheet-equipment');
        const createSelect = (id, category, selectedValue) => {
            let options = `<option value="">-- Nenhum --</option>`;
            Object.values(GAME_DATA.equipment[category]).forEach(item => {
                options += `<option value="${item.name}" ${selectedValue === item.name ? 'selected' : ''}>${item.name} (${item.cost} moedas)</option>`;
            });
            return `<div class="form-field"><label for="${id}">${id.charAt(0).toUpperCase() + id.slice(1)}:</label><select id="${id}">${options}</select></div>`;
        };
        equipContainer.innerHTML = createSelect('weapon1', 'weapons', sheet.equipment.weapon1) + createSelect('weapon2', 'weapons', sheet.equipment.weapon2) + createSelect('shield', 'shields', sheet.equipment.shield) + createSelect('armor', 'armors', sheet.equipment.armor);
        
        const spellContainer = document.getElementById('sheet-spells');
        spellContainer.innerHTML = ''; // Limpa antes de preencher
        const chosenElements = Object.keys(sheet.elements);
        const availableSpells = Object.values(GAME_DATA.spells).filter(s => s.grade === 1 && chosenElements.includes(s.element));
        
        availableSpells.forEach(spell => {
            const isSelected = sheet.spells.includes(spell.name);
            const card = document.createElement('div');
            card.className = `spell-card ${isSelected ? 'selected' : ''}`;
            card.innerHTML = `<h4>${spell.name}</h4><p>${spell.description}</p>`;
            card.onclick = () => {
                if (isSelected) {
                    sheet.spells = sheet.spells.filter(s => s !== spell.name);
                } else if (sheet.spells.length < 2) {
                    sheet.spells.push(spell.name);
                }
                renderSheetCreationUI();
            };
            spellContainer.appendChild(card);
        });

        // Adiciona todos os listeners de uma vez no final
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
                const baseValue = (raceData?.bonus?.[attr] || 0) + (raceData?.penalty?.[attr] || 0);
                let attributePoints = 5 + (raceData?.bonus?.any || 0);
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

        const updateEquipment = () => {
            sheet.equipment.weapon1 = document.getElementById('weapon1').value || null;
            sheet.equipment.weapon2 = document.getElementById('weapon2').value || null;
            sheet.equipment.shield = document.getElementById('shield').value || null;
            sheet.equipment.armor = document.getElementById('armor').value || null;

            const w1 = GAME_DATA.equipment.weapons[sheet.equipment.weapon1];
            const hasStrFor2H = (sheet.attributes.forca || 0) >= 4;
            if (w1 && w1.hands === 2 && !hasStrFor2H) {
                sheet.equipment.weapon2 = null;
                sheet.equipment.shield = null;
            }
            if (sheet.equipment.weapon2) sheet.equipment.shield = null;
            if (sheet.equipment.shield) sheet.equipment.weapon2 = null;

            renderSheetCreationUI();
        };
        document.getElementById('sheet-equipment').querySelectorAll('select').forEach(sel => sel.onchange = updateEquipment);
    }


    function finishSheetCreation() {
        characterSheetInProgress.status = 'ready';
        socket.emit('playerAction', { type: 'playerSubmitsSheet', sheet: characterSheetInProgress });
    }

    // --- INICIALIZAÇÃO E LISTENERS DE SOCKET ---
    socket.on('initialData', (data) => {
        PLAYABLE_TOKENS = data.playableTokens;
        GAME_DATA = data.gameData;
        // ... etc
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

        document.getElementById('join-as-player-btn').addEventListener('click', () => {
            showScreen('loading-screen');
            socket.emit('playerChoosesRole', { role: 'player' });
        });
        document.getElementById('join-as-spectator-btn').addEventListener('click', () => {
            showScreen('loading-screen');
            socket.emit('playerChoosesRole', { role: 'spectator' });
        });
        document.getElementById('new-char-btn').addEventListener('click', startNewCharacter);
        document.getElementById('confirm-token-btn').addEventListener('click', confirmTokenSelection);
        document.getElementById('finish-sheet-btn').addEventListener('click', finishSheetCreation);
        
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