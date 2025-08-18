// client.js

document.addEventListener('DOMContentLoaded', () => {
    // --- VARIÁVEIS DE ESTADO ---
    let myRole = null;
    let isGm = false;
    let currentGameState = null;
    const socket = io();
    let selectedPlayerToken = { name: null, img: null };
    let characterSheetBuilder = {};
    let ALL_SPELLS = {};
    let ALL_NPCS_DATA = [];
    let stagedNpcSlots = new Array(5).fill(null);

    // --- CONSTANTES DE REGRAS DO JOGO ---
    const RACES = { /* ... (Mantido como antes, omitido por brevidade) ... */ };
    const ATTRIBUTES = { "forca": "Força", "agilidade": "Agilidade", "protecao": "Proteção", "constituicao": "Constituição", "inteligencia": "Inteligência", "mente": "Mente" };
    const ELEMENTS = { "fogo": "Fogo", "agua": "Água", "terra": "Terra", "vento": "Vento", "luz": "Luz", "escuridao": "Escuridão" };
    const ADVANCED_ELEMENTS = { "fogo": "Chama Azul", "agua": "Gelo", "terra": "Metal", "vento": "Raio", "luz": "Cura", "escuridao": "Gravidade" };
    const WEAPONS = { /* ... (Mantido como antes, omitido por brevidade) ... */ };
    const SHIELDS = { /* ... (Mantido como antes, omitido por brevidade) ... */ };

    // --- ELEMENTOS DO DOM ---
    const allScreens = document.querySelectorAll('.screen');
    const gameWrapper = document.getElementById('game-wrapper');
    const modal = document.getElementById('modal');
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
    const advancedElementInfo = document.getElementById('advanced-element-info');
    const confirmSelectionBtn = document.getElementById('confirm-selection-btn');
    const npcEditorModal = document.getElementById('npc-editor-modal');

    // --- FUNÇÕES DE UTILIDADE ---
    function scaleGame() { setTimeout(() => { const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720); gameWrapper.style.transform = `scale(${scale})`; gameWrapper.style.left = `${(window.innerWidth - 1280 * scale) / 2}px`; gameWrapper.style.top = `${(window.innerHeight - 720 * scale) / 2}px`; }, 10); }
    function showScreen(screenId) { allScreens.forEach(screen => screen.classList.toggle('active', screen.id === screenId)); }
    function showInfoModal(title, text) { document.getElementById('modal-title').innerText = title; document.getElementById('modal-text').innerHTML = text; modal.classList.remove('hidden'); }
    function copyToClipboard(text, element) { navigator.clipboard.writeText(text).then(() => { const original = element.innerHTML; element.innerHTML = 'Copiado!'; setTimeout(() => { element.innerHTML = original; }, 2000); }); }
    function obfuscateData(data) { return btoa(JSON.stringify(data)); }
    function deobfuscateData(data) { try { return JSON.parse(atob(data)); } catch (e) { return null; } }

    // --- FLUXO DE CRIAÇÃO DE PERSONAGEM ---
    function renderPlayerCharacterSelection() {
        const charListContainer = document.getElementById('character-list-container');
        charListContainer.innerHTML = '';
        confirmSelectionBtn.disabled = true;
        // Simulação de personagens disponíveis
        const availableChars = [
            { name: "Humano Guerreiro", img: "images/players/Humano Guerreiro.png" },
            { name: "Elfa Arqueira", img: "images/players/Elfa Arqueira.png" },
            { name: "Anão Barbaro", img: "images/players/Anão Barbaro.png" },
            { name: "Humana Maga", img: "images/players/Humana Maga.png" },
        ];
        availableChars.forEach(data => {
            const card = document.createElement('div');
            card.className = 'char-card';
            card.dataset.name = data.name;
            card.dataset.img = data.img;
            card.innerHTML = `<img src="${data.img}" alt="${data.name}"><div class="char-name">${data.name}</div>`;
            card.addEventListener('click', () => {
                document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                confirmSelectionBtn.disabled = false;
            });
            charListContainer.appendChild(card);
        });
    }

    function confirmTokenSelection() {
        const selectedCard = document.querySelector('.char-card.selected');
        if (!selectedCard) return;
        selectedPlayerToken = { name: selectedCard.dataset.name, img: selectedCard.dataset.img };
        showScreen('player-hub-screen');
    }

    function initializeCharacterSheet() {
        characterSheetBuilder = {
            baseAttrPoints: 5, spentAttrPoints: 0, baseElemPoints: 2, spentElemPoints: 0,
            attributes: { forca: 0, agilidade: 0, protecao: 0, constituicao: 0, inteligencia: 0, mente: 0 },
            elements: { fogo: 0, agua: 0, terra: 0, vento: 0, luz: 0, escuridao: 0 },
            equipment: { weapons: [{ name: "", type: "desarmado" }, { name: "", type: "desarmado" }], shield: "nenhum" },
            spells: [], money: 200, token: selectedPlayerToken
        };
        const raceSelect = document.getElementById('char-race-select');
        raceSelect.innerHTML = '<option value="">-- Selecione --</option>' + Object.keys(RACES).map(r => `<option value="${r}">${r}</option>`).join('');
        attributesContainer.innerHTML = Object.keys(ATTRIBUTES).map(key => `<div class="point-buy-group"><label>${ATTRIBUTES[key]}</label><div class="point-buy-controls"><button class="point-buy-btn" data-type="attr" data-action="minus" data-key="${key}">-</button><span class="point-buy-value" id="attr-value-${key}">0</span><button class="point-buy-btn" data-type="attr" data-action="plus" data-key="${key}">+</button></div></div>`).join('');
        elementsContainer.innerHTML = Object.keys(ELEMENTS).map(key => `<div class="point-buy-group"><label>${ELEMENTS[key]}</label><div class="point-buy-controls"><button class="point-buy-btn" data-type="elem" data-action="minus" data-key="${key}">-</button><span class="point-buy-value" id="elem-value-${key}">0</span><button class="point-buy-btn" data-type="elem" data-action="plus" data-key="${key}">+</button></div></div>`).join('');
        const weaponSelects = [document.getElementById('char-weapon-1-type'), document.getElementById('char-weapon-2-type')];
        weaponSelects.forEach(s => s.innerHTML = Object.keys(WEAPONS).map(k => `<option value="${k}">${WEAPONS[k].name}</option>`).join(''));
        document.getElementById('char-shield-select').innerHTML = Object.keys(SHIELDS).map(k => `<option value="${k}">${SHIELDS[k].name}</option>`).join('');
        document.querySelectorAll('.point-buy-btn').forEach(b => b.addEventListener('click', handlePointBuy));
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
        if (action === 'plus' && characterSheetBuilder[spent] < characterSheetBuilder[base] && (isAttr || points[key] < 2)) {
            points[key]++; characterSheetBuilder[spent]++;
        } else if (action === 'minus' && points[key] > 0) {
            points[key]--; characterSheetBuilder[spent]--;
        }
        updateAllUI();
    }

    function updateAllUI() {
        attrPointsRemainingSpan.textContent = characterSheetBuilder.baseAttrPoints - characterSheetBuilder.spentAttrPoints;
        Object.keys(characterSheetBuilder.attributes).forEach(k => document.getElementById(`attr-value-${k}`).textContent = characterSheetBuilder.attributes[k]);
        elemPointsRemainingSpan.textContent = characterSheetBuilder.baseElemPoints - characterSheetBuilder.spentElemPoints;
        Object.keys(characterSheetBuilder.elements).forEach(k => document.getElementById(`elem-value-${k}`).textContent = characterSheetBuilder.elements[k]);
        const totalCost = WEAPONS[characterSheetBuilder.equipment.weapons[0].type].cost + WEAPONS[characterSheetBuilder.equipment.weapons[1].type].cost + SHIELDS[characterSheetBuilder.equipment.shield].cost;
        charMoneySpan.textContent = 200 - totalCost;
        let advanced = [];
        Object.keys(characterSheetBuilder.elements).forEach(k => { if (characterSheetBuilder.elements[k] === 2) advanced.push(ADVANCED_ELEMENTS[k]); });
        if (advanced.length > 0) {
            advancedElementInfo.innerHTML = `Elementos Avançados liberados: <b>${advanced.join(', ')}</b>`;
            advancedElementInfo.classList.remove('hidden');
        } else {
            advancedElementInfo.classList.add('hidden');
        }
    }
    // As funções updateRace e updateEquipment permanecem as mesmas
    function updateRace() { characterSheetBuilder.baseAttrPoints = (document.getElementById('char-race-select').value === 'Humano') ? 6 : 5; updateAllUI(); }
    function updateEquipment() { /* ... Lógica de validação de armas ... */ }

    function showSpellSelection() {
        spellListContainer.innerHTML = '';
        characterSheetBuilder.spells = [];
        const playerElements = Object.keys(characterSheetBuilder.elements).filter(k => characterSheetBuilder.elements[k] > 0);
        if (characterSheetBuilder.elements.agua === 2) playerElements.push('gelo'); // Adiciona lógicas para todos os avançados
        if (characterSheetBuilder.elements.fogo === 2) playerElements.push('chama azul');
        if (characterSheetBuilder.elements.terra === 2) playerElements.push('metal');
        if (characterSheetBuilder.elements.vento === 2) playerElements.push('raio');
        if (characterSheetBuilder.elements.luz === 2) playerElements.push('cura');
        if (characterSheetBuilder.elements.escuridao === 2) playerElements.push('gravidade');
        
        ALL_SPELLS.base.grau1.forEach(spell => {
            if (spell.elements.includes('any') || spell.elements.some(elem => playerElements.includes(elem))) {
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
        const count = characterSheetBuilder.spells.length;
        document.getElementById('spell-selection-info').textContent = `Selecione 2 magias de Grau 1 (${count}/2)`;
        finalizeCharBtn.disabled = count !== 2;
    }
    function buildCharacterSheet() {
        const sheet = {
            nome: document.getElementById('char-name-input').value || "Aventureiro",
            classe: document.getElementById('char-class-input').value || "N/A",
            race: document.getElementById('char-race-select').value,
            attributes: { ...characterSheetBuilder.attributes },
            elements: characterSheetBuilder.elements,
            equipment: characterSheetBuilder.equipment,
            spells: characterSheetBuilder.spells,
            token: characterSheetBuilder.token,
            money: 200 - (WEAPONS[characterSheetBuilder.equipment.weapons[0].type].cost + WEAPONS[characterSheetBuilder.equipment.weapons[1].type].cost + SHIELDS[characterSheetBuilder.equipment.shield].cost)
        };
        const raceData = RACES[sheet.race];
        if (raceData) {
            for(const attr in raceData.bonus) if(attr !== 'any') sheet.attributes[attr] = (sheet.attributes[attr] || 0) + raceData.bonus[attr];
            for(const attr in raceData.penalty) sheet.attributes[attr] = (sheet.attributes[attr] || 0) - raceData.penalty[attr];
        }
        sheet.hpMax = 20 + (sheet.attributes.constituicao * 5);
        sheet.hp = sheet.hpMax;
        sheet.mahouMax = 10 + (sheet.attributes.mente * 5);
        sheet.mahou = sheet.mahouMax;
        return sheet;
    }
    function finalizeCharacter() {
        const finalSheet = buildCharacterSheet();
        socket.emit('playerSubmitsCharacterSheet', finalSheet);
        showScreen('player-waiting-screen');
    }
    function saveCharacter() {
        const finalSheet = buildCharacterSheet();
        const data = obfuscateData(finalSheet);
        const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${finalSheet.nome.replace(/\s+/g, '_') || 'personagem'}.char`;
        a.click();
        URL.revokeObjectURL(url);
    }
    function handleFileLoad(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const sheet = deobfuscateData(e.target.result);
            if (sheet && sheet.nome) {
                socket.emit('playerSubmitsCharacterSheet', sheet);
                showScreen('player-waiting-screen');
            } else {
                showInfoModal("Erro", "Arquivo de personagem inválido ou corrompido.");
            }
        };
        reader.readAsText(file);
    }

    // --- LÓGICA DO GM E EDITOR DE NPCS ---
    function renderNpcSelectionForGm() {
        const npcArea = document.getElementById('npc-selection-area');
        npcArea.innerHTML = '';
        ALL_NPCS_DATA.forEach(npcData => {
            const card = document.createElement('div');
            card.className = 'npc-card';
            card.innerHTML = `<img src="${npcData.img}" alt="${npcData.name}"><div class="char-name">${npcData.name}</div>`;
            card.onclick = () => {
                const emptySlotIndex = stagedNpcSlots.findIndex(s => s === null);
                if (emptySlotIndex !== -1) {
                    stagedNpcSlots[emptySlotIndex] = { ...npcData, id: `npc-${Date.now()}-${emptySlotIndex}`, slotIndex: emptySlotIndex, attributes: {forca:1, agilidade:1, protecao:1, constituicao:1, inteligencia:1, mente:1}, spells: [] };
                    renderNpcStagingArea();
                } else {
                    showInfoModal("Slots Cheios", "Todos os slots de inimigos estão ocupados.");
                }
            };
            npcArea.appendChild(card);
        });
    }

    function renderNpcStagingArea() {
        const stagingArea = document.getElementById('npc-staging-area');
        stagingArea.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            const slot = document.createElement('div');
            slot.className = 'npc-slot';
            const npc = stagedNpcSlots[i];
            if (npc) {
                slot.innerHTML = `<img src="${npc.img}" alt="${npc.name}"><div class="char-name">${npc.name}</div><button class="remove-staged-npc" data-index="${i}">X</button>`;
                slot.onclick = () => openNpcEditor(i);
                slot.querySelector('.remove-staged-npc').onclick = (e) => {
                    e.stopPropagation();
                    stagedNpcSlots[i] = null;
                    renderNpcStagingArea();
                };
            } else {
                slot.innerHTML = `<span>Slot Vazio</span>`;
            }
            stagingArea.appendChild(slot);
        }
    }

    function openNpcEditor(slotIndex) {
        const npc = stagedNpcSlots[slotIndex];
        if (!npc) return;
        document.getElementById('npc-editor-title').textContent = `Editar ${npc.name}`;
        const attrContainer = document.getElementById('npc-attributes-container');
        attrContainer.innerHTML = Object.keys(ATTRIBUTES).map(key => `<div class="point-buy-group"><label>${ATTRIBUTES[key]}</label><div class="point-buy-controls"><input type="number" id="npc-attr-${key}" value="${npc.attributes[key] || 0}" class="npc-attr-input"></div></div>`).join('');
        const spellContainer = document.getElementById('npc-spell-container');
        spellContainer.innerHTML = ALL_SPELLS.base.grau1.map(spell => `<div class="spell-checkbox-group"><input type="checkbox" id="npc-spell-${spell.name.replace(/\s+/g, '')}" value="${spell.name}" ${npc.spells.includes(spell.name) ? 'checked' : ''}><label for="npc-spell-${spell.name.replace(/\s+/g, '')}">${spell.name}</label></div>`).join('');
        
        document.getElementById('npc-editor-save-btn').onclick = () => saveNpcChanges(slotIndex);
        document.getElementById('npc-editor-cancel-btn').onclick = () => npcEditorModal.classList.add('hidden');
        npcEditorModal.classList.remove('hidden');
    }

    function saveNpcChanges(slotIndex) {
        const npc = stagedNpcSlots[slotIndex];
        Object.keys(ATTRIBUTES).forEach(key => {
            npc.attributes[key] = parseInt(document.getElementById(`npc-attr-${key}`).value, 10) || 0;
        });
        npc.spells = [];
        ALL_SPELLS.base.grau1.forEach(spell => {
            if (document.getElementById(`npc-spell-${spell.name.replace(/\s+/g, '')}`).checked) {
                npc.spells.push(spell.name);
            }
        });
        npcEditorModal.classList.add('hidden');
    }

    // --- RENDERIZAÇÃO PRINCIPAL ---
    function renderGame(gameState) {
        scaleGame();
        currentGameState = gameState;
        if (!gameState || !gameState.mode) return showScreen('loading-screen');
        const myPlayerData = gameState.connectedPlayers?.[socket.id];

        if (isGm) {
            switch (gameState.mode) {
                case 'lobby': showScreen('gm-initial-lobby'); updateGmLobbyUI(gameState); break;
                case 'adventure': 
                    if (gameState.phase === 'npc_setup') {
                        showScreen('gm-npc-setup-screen');
                        renderNpcSelectionForGm();
                        renderNpcStagingArea();
                    } else {
                        showScreen('fight-screen');
                    }
                    break;
                case 'theater': showScreen('theater-screen'); break;
            }
        } else {
            if (myRole === 'player' && (!myPlayerData || !myPlayerData.characterSheet)) {
                if (!selectedPlayerToken.name) showScreen('selection-screen');
                else showScreen('player-hub-screen');
            } else {
                 switch (gameState.mode) {
                    case 'lobby':
                        showScreen('player-waiting-screen');
                        document.getElementById('player-waiting-message').innerText = myRole === 'spectator' ? "Aguardando como espectador..." : "Ficha pronta! Aguardando o Mestre...";
                        break;
                    default: showScreen('fight-screen'); break;
                 }
            }
        }
    }

    // --- INICIALIZAÇÃO E SOCKETS ---
    socket.on('initialData', (data) => {
        ALL_SPELLS = data.spells || {};
        ALL_NPCS_DATA = data.characters.npcs || [];
        renderPlayerCharacterSelection(); // Prepara a tela de seleção de token
    });
    socket.on('gameUpdate', (gameState) => renderGame(gameState));
    socket.on('roomCreated', (roomId) => {
        const el = document.getElementById('gm-link-invite');
        if (el) { const url = `${window.location.origin}?room=${roomId}`; el.textContent = url; el.onclick = () => copyToClipboard(url, el); }
    });
    socket.on('promptForRole', ({ isFull }) => {
        document.getElementById('join-as-player-btn').disabled = isFull;
        document.getElementById('room-full-message').classList.toggle('hidden', !isFull);
        showScreen('role-selection-screen');
    });
    socket.on('assignRole', (data) => {
        myRole = data.role; isGm = !!data.isGm;
        if (!isGm) {
            if (myRole === 'player') showScreen('selection-screen');
            else showScreen('player-waiting-screen');
        }
    });
    socket.on('error', (data) => showInfoModal("Erro", data.message));
    
    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoomId = urlParams.get('room');
        showScreen('loading-screen');
        if (urlRoomId) socket.emit('playerJoinsLobby', { roomId: urlRoomId });
        else socket.emit('gmCreatesLobby');

        document.getElementById('join-as-player-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'player' }));
        document.getElementById('join-as-spectator-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'spectator' }));
        document.getElementById('start-adventure-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsAdventure' }));
        document.getElementById('start-theater-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsTheater' }));
        document.getElementById('gm-start-battle-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartBattle', npcs: stagedNpcSlots.filter(n => n) }));
        
        confirmSelectionBtn.addEventListener('click', confirmTokenSelection);
        newCharBtn.addEventListener('click', initializeCharacterSheet);
        loadCharBtn.addEventListener('click', () => charFileInput.click());
        charFileInput.addEventListener('change', handleFileLoad);
        sheetNextBtn.addEventListener('click', showSpellSelection);
        finalizeCharBtn.addEventListener('click', finalizeCharacter);
        saveCharBtn.addEventListener('click', saveCharacter);
        
        window.addEventListener('resize', scaleGame);
        scaleGame();
    }
    
    initialize();
});