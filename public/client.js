// client.js

document.addEventListener('DOMContentLoaded', () => {
    // --- VARIÁVEIS DE ESTADO ---
    let myRole = null;
    let myPlayerKey = null;
    let isGm = false;
    let currentGameState = null;
    let oldGameState = null;
    let defeatAnimationPlayed = new Set();
    const socket = io();
    let myRoomId = null; 

    // --- NOVOS DADOS DO JOGO (CLIENT-SIDE) ---
    let ALL_SPELLS = {};
    let characterSheetBuilder = {};

    // Constantes de regras do jogo para a UI
    const RACES = {
        "Anjo": { bonus: {}, penalty: { "forca": 1 }, unique: "+1 em cura, não pode usar Escuridão, 1 ponto obrigatório em Luz." },
        "Demonio": { bonus: {}, penalty: {}, unique: "+1 em magias de Escuridão, -1 em cura recebida, não pode usar Luz, 1 ponto obrigatório em Escuridão." },
        "Elfo": { bonus: { "agilidade": 2 }, penalty: { "forca": 1 }, unique: "Enxerga no escuro." },
        "Anao": { bonus: { "constituicao": 1 }, penalty: {}, unique: "Enxerga no escuro." },
        "Goblin": { bonus: { "mente": 1 }, penalty: { "constituicao": 1 }, unique: "Não pode usar armas Gigante e Colossal." },
        "Orc": { bonus: { "forca": 2 }, penalty: { "inteligencia": 1 }, unique: "Pode comer quase qualquer coisa sem adoecer." },
        "Humano": { bonus: { "any": 1 }, penalty: {}, unique: "+1 em um atributo à sua escolha." },
        "Kairou": { bonus: {}, penalty: {}, unique: "Respira debaixo d'água, +1 em todos os atributos na água. Penalidades severas se ficar seco." },
        "Centauro": { bonus: {}, penalty: { "agilidade": 1 }, unique: "Não pode entrar em locais apertados. +3 em testes de velocidade/salto." },
        "Halfling": { bonus: { "agilidade": 1, "inteligencia": 1 }, penalty: { "forca": 1, "constituicao": 1 }, unique: "Enxerga no escuro. Não pode usar armas Gigante e Colossal." },
        "Tritao": { bonus: { "forca": 2 }, penalty: { "inteligencia": 2 }, unique: "Respira debaixo d'água. Penalidades se ficar seco." },
        "Meio-Elfo": { bonus: { "agilidade": 1 }, penalty: {}, unique: "Enxerga no escuro." },
        "Meio-Orc": { bonus: { "forca": 1 }, penalty: {}, unique: "Nenhuma." },
        "Auslender": { bonus: { "inteligencia": 2, "agilidade": 1 }, penalty: { "forca": 1, "protecao": 1 }, unique: "Compreende tecnologia facilmente." },
        "Tulku": { bonus: { "inteligencia": 1, "mente": 1 }, penalty: {}, unique: "Enxerga no escuro. -1 em magias de Luz." }
    };
    const ATTRIBUTES = { "forca": "Força", "agilidade": "Agilidade", "protecao": "Proteção", "constituicao": "Constituição", "inteligencia": "Inteligência", "mente": "Mente" };
    const ELEMENTS = { "fogo": "Fogo", "agua": "Água", "terra": "Terra", "vento": "Vento", "luz": "Luz", "escuridao": "Escuridão" };
    const WEAPONS = {
        "desarmado": { name: "Desarmado", cost: 0, hands: 1 },
        "minima": { name: "1 Mão Mínima", cost: 60, hands: 1 },
        "leve": { name: "1 Mão Leve", cost: 80, hands: 1 },
        "mediana": { name: "1 Mão Mediana", cost: 100, hands: 1 },
        "cetro": { name: "Cetro", cost: 80, hands: 1 },
        "pesada": { name: "2 Mãos Pesada", cost: 120, hands: 2 },
        "gigante": { name: "2 Mãos Gigante", cost: 140, hands: 2 },
        "colossal": { name: "2 Mãos Colossal", cost: 160, hands: 2 },
        "cajado": { name: "Cajado", cost: 140, hands: 2 }
    };
    const SHIELDS = {
        "nenhum": { name: "Nenhum", cost: 0 },
        "pequeno": { name: "Pequeno", cost: 80 },
        "medio": { name: "Médio", cost: 100 },
        "grande": { name: "Grande", cost: 120 }
    };

    // --- ELEMENTOS DO DOM ---
    const allScreens = document.querySelectorAll('.screen');
    const gameWrapper = document.getElementById('game-wrapper');
    const modal = document.getElementById('modal');
    
    // Elementos da Ficha
    const newCharBtn = document.getElementById('new-char-btn');
    const loadCharBtn = document.getElementById('load-char-btn');
    const charFileInput = document.getElementById('char-file-input');
    const attrPointsRemainingSpan = document.getElementById('attr-points-remaining');
    const elemPointsRemainingSpan = document.getElementById('elem-points-remaining');
    const charMoneySpan = document.getElementById('char-money');
    const attributesContainer = document.getElementById('attributes-container');
    const elementsContainer = document.getElementById('elements-container');
    const sheetNextBtn = document.getElementById('sheet-next-btn');
    const finalizeCharBtn = document.getElementById('finalize-char-btn');
    const saveCharBtn = document.getElementById('save-char-btn');
    const spellListContainer = document.getElementById('spell-list-container');
    
    // --- FUNÇÕES DE UTILIDADE ---
    function scaleGame() {
        setTimeout(() => {
            const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
            gameWrapper.style.transform = `scale(${scale})`;
            gameWrapper.style.left = `${(window.innerWidth - (1280 * scale)) / 2}px`;
            gameWrapper.style.top = `${(window.innerHeight - (720 * scale)) / 2}px`;
        }, 10);
    }
    function showScreen(screenId) {
        allScreens.forEach(screen => screen.classList.toggle('active', screen.id === screenId));
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
    // CORRIGIDO: Função para copiar texto que estava faltando
    function copyToClipboard(text, element) {
        if (!element) return;
        navigator.clipboard.writeText(text).then(() => {
            const originalHTML = element.innerHTML;
            element.innerHTML = 'Copiado!';
            setTimeout(() => { 
                element.innerHTML = originalHTML; 
            }, 2000);
        });
    }

    
    // --- FLUXO DE CRIAÇÃO DE PERSONAGEM ---

    function initializeCharacterSheet() {
        characterSheetBuilder = {
            baseAttrPoints: 5, spentAttrPoints: 0, baseElemPoints: 2, spentElemPoints: 0,
            attributes: { forca: 0, agilidade: 0, protecao: 0, constituicao: 0, inteligencia: 0, mente: 0 },
            elements: { fogo: 0, agua: 0, terra: 0, vento: 0, luz: 0, escuridao: 0 },
            equipment: { weapons: [ { name: "", type: "desarmado" }, { name: "", type: "desarmado" } ], shield: "nenhum" },
            spells: [], money: 200
        };

        const raceSelect = document.getElementById('char-race-select');
        raceSelect.innerHTML = '<option value="">-- Selecione uma Raça --</option>';
        for(const raceKey in RACES) raceSelect.innerHTML += `<option value="${raceKey}">${raceKey}</option>`;

        attributesContainer.innerHTML = '';
        for(const attrKey in ATTRIBUTES) {
            attributesContainer.innerHTML += `
                <div class="point-buy-group">
                    <label>${ATTRIBUTES[attrKey]}</label>
                    <div class="point-buy-controls">
                        <button class="point-buy-btn" data-type="attr" data-action="minus" data-key="${attrKey}">-</button>
                        <span class="point-buy-value" id="attr-value-${attrKey}">0</span>
                        <button class="point-buy-btn" data-type="attr" data-action="plus" data-key="${attrKey}">+</button>
                    </div>
                </div>`;
        }

        elementsContainer.innerHTML = '';
        for(const elemKey in ELEMENTS) {
            elementsContainer.innerHTML += `
                 <div class="point-buy-group">
                    <label>${ELEMENTS[elemKey]}</label>
                    <div class="point-buy-controls">
                        <button class="point-buy-btn" data-type="elem" data-action="minus" data-key="${elemKey}">-</button>
                        <span class="point-buy-value" id="elem-value-${elemKey}">0</span>
                        <button class="point-buy-btn" data-type="elem" data-action="plus" data-key="${elemKey}">+</button>
                    </div>
                </div>`;
        }

        const weapon1Type = document.getElementById('char-weapon-1-type');
        const weapon2Type = document.getElementById('char-weapon-2-type');
        const shieldSelect = document.getElementById('char-shield-select');
        [weapon1Type, weapon2Type].forEach(select => {
            select.innerHTML = '';
            for(const key in WEAPONS) select.innerHTML += `<option value="${key}">${WEAPONS[key].name}</option>`;
        });
        shieldSelect.innerHTML = '';
        for(const key in SHIELDS) shieldSelect.innerHTML += `<option value="${key}">${SHIELDS[key].name}</option>`;

        document.querySelectorAll('.point-buy-btn').forEach(btn => btn.addEventListener('click', handlePointBuy));
        document.getElementById('char-race-select').addEventListener('change', updateRace);
        document.querySelectorAll('.equipment-grid select, .equipment-grid input').forEach(el => el.addEventListener('change', updateEquipment));

        updateAllUI();
        showScreen('character-creation-screen');
    }

    function handlePointBuy(event) {
        const { type, action, key } = event.target.dataset;
        const isAttr = type === 'attr';
        const points = isAttr ? characterSheetBuilder.attributes : characterSheetBuilder.elements;
        const spent = isAttr ? 'spentAttrPoints' : 'spentElemPoints';
        const base = isAttr ? 'baseAttrPoints' : 'baseElemPoints';
        
        if (action === 'plus' && characterSheetBuilder[spent] < characterSheetBuilder[base]) {
            if (isAttr || points[key] < 2) {
                points[key]++;
                characterSheetBuilder[spent]++;
            }
        } else if (action === 'minus' && points[key] > 0) {
            points[key]--;
            characterSheetBuilder[spent]--;
        }
        updateAllUI();
    }

    function updateRace() {
        const raceKey = document.getElementById('char-race-select').value;
        characterSheetBuilder.baseAttrPoints = 5;
        if (raceKey === 'Humano') characterSheetBuilder.baseAttrPoints = 6;
        updateAllUI();
    }
    
    function updateEquipment() {
        const w1Type = document.getElementById('char-weapon-1-type').value;
        const w2Type = document.getElementById('char-weapon-2-type').value;
        const shieldType = document.getElementById('char-shield-select').value;
        const w1Hands = WEAPONS[w1Type].hands;
        const w2Hands = WEAPONS[w2Type].hands;
        const hasShield = shieldType !== 'nenhum';
        const str = characterSheetBuilder.attributes.forca;
        
        let error = false;
        if ((w1Hands === 2 && w2Type !== 'desarmado' && str < 4) || (w2Hands === 2 && w1Type !== 'desarmado' && str < 4) || (w1Hands === 2 && hasShield && str < 4) || (hasShield && w2Type !== 'desarmado')) {
            error = true;
        }

        if (error) {
            document.getElementById('char-weapon-1-type').value = characterSheetBuilder.equipment.weapons[0].type;
            document.getElementById('char-weapon-2-type').value = characterSheetBuilder.equipment.weapons[1].type;
            document.getElementById('char-shield-select').value = characterSheetBuilder.equipment.shield;
            showInfoModal("Ação Inválida", "Combinação de equipamentos não permitida.");
            return;
        }

        characterSheetBuilder.equipment.weapons[0].type = w1Type;
        characterSheetBuilder.equipment.weapons[1].type = w2Type;
        characterSheetBuilder.equipment.weapons[0].name = document.getElementById('char-weapon-1-name').value;
        characterSheetBuilder.equipment.weapons[1].name = document.getElementById('char-weapon-2-name').value;
        characterSheetBuilder.equipment.shield = shieldType;
        updateAllUI();
    }

    function updateAllUI() {
        attrPointsRemainingSpan.textContent = characterSheetBuilder.baseAttrPoints - characterSheetBuilder.spentAttrPoints;
        for (const key in characterSheetBuilder.attributes) document.getElementById(`attr-value-${key}`).textContent = characterSheetBuilder.attributes[key];
        elemPointsRemainingSpan.textContent = characterSheetBuilder.baseElemPoints - characterSheetBuilder.spentElemPoints;
        for (const key in characterSheetBuilder.elements) document.getElementById(`elem-value-${key}`).textContent = characterSheetBuilder.elements[key];
        const totalCost = WEAPONS[characterSheetBuilder.equipment.weapons[0].type].cost + WEAPONS[characterSheetBuilder.equipment.weapons[1].type].cost + SHIELDS[characterSheetBuilder.equipment.shield].cost;
        charMoneySpan.textContent = 200 - totalCost;
    }
    
    function showSpellSelection() {
        spellListContainer.innerHTML = '';
        characterSheetBuilder.spells = [];
        const playerElements = Object.keys(characterSheetBuilder.elements).filter(key => characterSheetBuilder.elements[key] > 0);
        
        ALL_SPELLS.base.grau1.forEach(spell => {
            const canLearn = spell.elements.includes('any') || spell.elements.some(elem => playerElements.includes(elem));
            if (canLearn) {
                const card = document.createElement('div');
                card.className = 'spell-card';
                card.dataset.spellName = spell.name;
                card.innerHTML = `<h3>${spell.name}</h3><p>${spell.description}</p><div class="spell-details">Custo: ${spell.cost.mahou} Mahou, ${spell.cost.pa} PA</div>`;
                card.addEventListener('click', () => toggleSpellSelection(card));
                spellListContainer.appendChild(card);
            }
        });
        
        updateFinalizeButton();
        showScreen('spell-selection-screen');
    }

    function toggleSpellSelection(card) {
        const spellName = card.dataset.spellName;
        const index = characterSheetBuilder.spells.indexOf(spellName);
        if (index > -1) {
            characterSheetBuilder.spells.splice(index, 1);
            card.classList.remove('selected');
        } else if (characterSheetBuilder.spells.length < 2) {
            characterSheetBuilder.spells.push(spellName);
            card.classList.add('selected');
        }
        updateFinalizeButton();
    }

    function updateFinalizeButton() {
        const spellCount = characterSheetBuilder.spells.length;
        document.getElementById('spell-selection-info').textContent = `Selecione 2 magias de Grau 1 (${spellCount}/2)`;
        finalizeCharBtn.disabled = spellCount !== 2;
    }
    
    function finalizeCharacter() {
        const sheet = {
            nome: document.getElementById('char-name-input').value || "Aventureiro",
            classe: document.getElementById('char-class-input').value || "N/A",
            race: document.getElementById('char-race-select').value,
            attributes: characterSheetBuilder.attributes,
            elements: characterSheetBuilder.elements,
            equipment: characterSheetBuilder.equipment,
            spells: characterSheetBuilder.spells,
            money: 200 - (WEAPONS[characterSheetBuilder.equipment.weapons[0].type].cost + WEAPONS[characterSheetBuilder.equipment.weapons[1].type].cost + SHIELDS[characterSheetBuilder.equipment.shield].cost)
        };
        const raceData = RACES[sheet.race];
        for(const attr in raceData.bonus) if(attr !== 'any') sheet.attributes[attr] = (sheet.attributes[attr] || 0) + raceData.bonus[attr];
        for(const attr in raceData.penalty) sheet.attributes[attr] = (sheet.attributes[attr] || 0) - raceData.penalty[attr];
        sheet.hpMax = 20 + (sheet.attributes.constituicao * 5);
        sheet.hp = sheet.hpMax;
        sheet.mahouMax = 10 + (sheet.attributes.mente * 5);
        sheet.mahou = sheet.mahouMax;
        socket.emit('playerSubmitsCharacterSheet', sheet);
        showScreen('player-waiting-screen');
        document.getElementById('player-waiting-message').innerText = "Ficha enviada! Aguardando o Mestre...";
    }

    function handleFileLoad(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => socket.emit('playerLoadsCharacter', e.target.result);
        reader.readAsText(file);
    }

    function saveCharacterFile(data) {
        const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${characterSheetBuilder.nome || 'personagem'}.char`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function updateGmLobbyUI(state) {
        const playerListEl = document.getElementById('gm-lobby-player-list');
        if (!playerListEl || !state || !state.connectedPlayers) return;
        playerListEl.innerHTML = '';
        const connectedPlayers = Object.values(state.connectedPlayers);
        if (connectedPlayers.length === 0) { 
            playerListEl.innerHTML = '<li>Aguardando jogadores...</li>'; 
        } else {
            connectedPlayers.forEach(p => {
                const charName = p.characterSheet ? p.characterSheet.nome : '<i>Criando ficha...</i>';
                const status = p.status || 'Conectado';
                playerListEl.innerHTML += `<li>${p.role} - ${charName} (${status})</li>`;
            });
        }
    }

    // --- RENDERIZAÇÃO PRINCIPAL ---
    function renderGame(gameState) {
        scaleGame();
        currentGameState = gameState;
        if (!gameState || !gameState.mode) {
            showScreen('loading-screen');
            return;
        }

        const myPlayerData = gameState.connectedPlayers?.[socket.id];

        if (isGm) {
            switch (gameState.mode) {
                case 'lobby':
                    showScreen('gm-initial-lobby');
                    updateGmLobbyUI(gameState);
                    break;
                case 'adventure':
                    showScreen('fight-screen');
                    break;
                case 'theater':
                    showScreen('theater-screen');
                    // renderTheaterMode(gameState); // Lógica de teatro a ser integrada
                    break;
            }
        } else { // Player ou Spectator
            if (myRole === 'player' && (!myPlayerData || !myPlayerData.characterSheet)) {
                showScreen('player-hub-screen');
            } else {
                 switch (gameState.mode) {
                    case 'lobby':
                        showScreen('player-waiting-screen');
                        document.getElementById('player-waiting-message').innerText = myRole === 'spectator' ? "Aguardando como espectador..." : "Ficha pronta! Aguardando o Mestre...";
                        break;
                    case 'adventure':
                        showScreen('fight-screen');
                        break;
                     case 'theater':
                        showScreen('theater-screen');
                        // renderTheaterMode(gameState);
                        break;
                 }
            }
        }
    }

    // --- INICIALIZAÇÃO E SOCKETS ---
    socket.on('initialData', (data) => {
        ALL_SPELLS = data.spells || {};
    });

    socket.on('gameUpdate', (gameState) => {
        renderGame(gameState);
    });

    socket.on('roomCreated', (roomId) => {
        myRoomId = roomId;
        const inviteLinkEl = document.getElementById('gm-link-invite');
        if (inviteLinkEl) {
            const inviteUrl = `${window.location.origin}?room=${roomId}`;
            inviteLinkEl.textContent = inviteUrl;
            // CORRIGIDO: Adiciona o listener para copiar
            inviteLinkEl.onclick = () => copyToClipboard(inviteUrl, inviteLinkEl);
        }
    });
    
    // CORRIGIDO: Fluxo de entrada do jogador
    socket.on('promptForRole', ({ isFull }) => {
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
        showScreen('role-selection-screen');
    });

    socket.on('assignRole', (data) => {
        myRole = data.role;
        myPlayerKey = data.playerKey || socket.id;
        isGm = !!data.isGm;
        myRoomId = data.roomId;

        if (!isGm) {
            if (myRole === 'player') {
                showScreen('player-hub-screen');
            } else if (myRole === 'spectator') {
                showScreen('player-waiting-screen');
                document.getElementById('player-waiting-message').innerText = "Aguardando como espectador...";
            }
        }
    });

    socket.on('loadCharacterSuccess', () => {
        showScreen('player-waiting-screen');
        document.getElementById('player-waiting-message').innerText = "Personagem carregado! Aguardando o Mestre...";
    });

    socket.on('error', (data) => showInfoModal('Erro', data.message));
    
    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoomId = urlParams.get('room');
        
        showScreen('loading-screen'); 

        if (urlRoomId) {
            socket.emit('playerJoinsLobby', { roomId: urlRoomId });
        } else {
            socket.emit('gmCreatesLobby');
        }

        document.getElementById('join-as-player-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'player' }));
        document.getElementById('join-as-spectator-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'spectator' }));
        document.getElementById('start-adventure-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsAdventure' }));
        document.getElementById('start-theater-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsTheater' }));
        
        newCharBtn.addEventListener('click', initializeCharacterSheet);
        loadCharBtn.addEventListener('click', () => charFileInput.click());
        charFileInput.addEventListener('change', handleFileLoad);
        sheetNextBtn.addEventListener('click', showSpellSelection);
        finalizeCharBtn.addEventListener('click', finalizeCharacter);
        saveCharBtn.addEventListener('click', () => socket.emit('playerRequestsSave'));
        
        window.addEventListener('resize', scaleGame);
        scaleGame();
    }
    
    initialize();
});