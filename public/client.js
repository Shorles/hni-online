// client.js

document.addEventListener('DOMContentLoaded', () => {
    // --- VARIÁVEIS DE ESTADO GLOBAIS ---
    let myRole = null;
    let myPlayerKey = null;
    let isGm = false;
    let currentGameState = null;
    const socket = io();
    let myRoomId = null;

    // --- DADOS DO JOGO (CARREGADOS DO SERVIDOR) ---
    let PLAYABLE_TOKENS = [];
    let GAME_DATA = {};
    let ALL_NPCS = {};
    let ALL_SCENARIOS = {};
    
    // --- ESTADO LOCAL DO CLIENTE ---
    let characterSheetInProgress = {};
    let stagedNpcs = []; // NPCs atualmente selecionados para a batalha
    let selectedStagedNpcId = null; // ID do NPC selecionado para edição
    
    // Variáveis do Modo Cenário
    let localWorldScale = 1.0; // Zoom local do usuário no modo Cenário
    let selectedTokens = new Set(); // Tokens selecionados no modo GM
    let hoveredTokenId = null; // Token sob o mouse no modo GM
    let isDragging = false; // Se um token está sendo arrastado
    let isPanning = false; // Se o cenário está sendo panormizado
    let dragStartPos = { x: 0, y: 0 }; // Posição inicial do clique/arrasto
    let dragOffsets = new Map(); // Offset para arrastar múltiplos tokens
    let isGroupSelectMode = false; // Se o GM está em modo de seleção em grupo (G)
    let isSelectingBox = false; // Se o GM está desenhando uma caixa de seleção
    let selectionBoxStartPos = { x: 0, y: 0 }; // Início da caixa de seleção

    // --- ELEMENTOS DO DOM ---
    const allScreens = document.querySelectorAll('.screen');
    const gameWrapper = document.getElementById('game-wrapper');
    const modal = document.getElementById('modal'); // Adicionado para ser usado globalmente
    const theaterBackgroundViewport = document.getElementById('theater-background-viewport');
    const theaterBackgroundImage = document.getElementById('theater-background-image');
    const theaterWorldContainer = document.getElementById('theater-world-container');
    const theaterTokenContainer = document.getElementById('theater-token-container');
    const theaterCharList = document.getElementById('theater-char-list');
    const theaterGlobalScale = document.getElementById('theater-global-scale');
    const selectionBox = document.getElementById('selection-box');


    // --- FUNÇÕES DE UTILIDADE ---
    
    // Função de escala da janela
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

    function showInfoModal(title, text) {
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-text').innerHTML = text;
        modal.classList.remove('hidden');
        document.getElementById('modal-button').onclick = () => modal.classList.add('hidden');
    }

    function copyToClipboard(text, element) {
        navigator.clipboard.writeText(text).then(() => {
            const originalHTML = element.innerHTML;
            element.innerHTML = 'Copiado!';
            setTimeout(() => { element.innerHTML = originalHTML; }, 2000);
        });
    }

    function getFighter(state, key) {
        if (!state || !state.fighters || !key) return null;
        return state.fighters.players[key] || state.fighters.npcs[key];
    }

    // --- FLUXO PRINCIPAL DE RENDERIZAÇÃO ---
    function renderGame(state) {
        currentGameState = state;
        if (!state || !myRole) return;

        const myPlayerData = state.connectedPlayers?.[socket.id];

        // Controla botões flutuantes
        const isPlayerReady = myPlayerData?.sheet?.status === 'ready';
        document.getElementById('player-sheet-button').classList.toggle('hidden', !(isPlayerReady && myRole === 'player'));
        document.getElementById('floating-buttons-container').classList.toggle('hidden', !isGm);
        document.getElementById('back-to-lobby-btn').classList.toggle('hidden', !isGm || state.mode === 'lobby');
        
        // Atualiza o texto do botão de modo no GM
        const floatingSwitchModeBtn = document.getElementById('floating-switch-mode-btn');
        if (floatingSwitchModeBtn) {
            if (state.mode === 'adventure') {
                floatingSwitchModeBtn.innerHTML = '🎭';
                floatingSwitchModeBtn.title = 'Mudar para Modo Cenário';
            } else {
                floatingSwitchModeBtn.innerHTML = '⚔️';
                floatingSwitchModeBtn.title = 'Mudar para Modo Aventura';
            }
        }

        if (isGm) renderGmView(state);
        else if (myRole === 'player') renderPlayerView(state, myPlayerData);
        else renderSpectatorView(state);
    }

    // --- RENDERIZAÇÃO DAS VISÕES ESPECÍFICAS ---
    function renderGmView(state) {
        switch (state.mode) {
            case 'lobby':
                showScreen('gm-initial-lobby');
                updateGmLobbyUI(state); // Atualiza o link aqui
                break;
            case 'adventure':
                if (state.phase === 'npc_setup') {
                    showScreen('gm-npc-setup-screen');
                    renderGmNpcSetup();
                } else {
                    showScreen('fight-screen');
                    renderFightUI(state);
                }
                break;
            case 'theater':
                showScreen('theater-screen');
                renderTheaterUI(state); // CORRIGIDO: Chamada reativada
                break;
        }
    }

    function renderPlayerView(state, myData) {
        if (!myData || !myData.sheet) return;

        switch(myData.sheet.status) {
            case 'creating_sheet': showScreen('character-entry-screen'); return;
            case 'selecting_token': showScreen('token-selection-screen'); renderTokenSelection(); return;
            case 'filling_sheet': showScreen('sheet-creation-screen'); renderSheetCreationUI(); return;
            case 'ready': break; // Continua para o jogo
        }

        switch(state.mode) {
            case 'lobby':
                showScreen('player-waiting-screen');
                document.getElementById('player-waiting-message').textContent = "Personagem pronto! Aguardando o Mestre...";
                break;
            case 'adventure':
                showScreen('fight-screen');
                renderFightUI(state);
                break;
            case 'theater':
                showScreen('theater-screen');
                renderTheaterUI(state); // CORRIGIDO: Chamada reativada
                renderPlayerTheaterControls(state);
                break;
        }
    }

    function renderSpectatorView(state) {
        let message = "Assistindo... Aguardando o Mestre iniciar.";
        let screen = 'player-waiting-screen';

        switch(state.mode) {
            case 'adventure': screen = 'fight-screen'; renderFightUI(state); break;
            case 'theater': screen = 'theater-screen'; renderTheaterUI(state); break;
        }
        showScreen(screen);
        if (screen === 'player-waiting-screen') {
            document.getElementById('player-waiting-message').textContent = message;
        }
    }

    // --- LÓGICA DA INTERFACE DO USUÁRIO (UI) ---
    function updateGmLobbyUI(state) {
        // CORRIGIDO: Garante que o link de convite seja gerado
        if (myRoomId) {
            const inviteLinkEl = document.getElementById('gm-link-invite');
            const inviteUrl = `${window.location.origin}?room=${myRoomId}`;
            if (inviteLinkEl) { 
                inviteLinkEl.textContent = inviteUrl; 
                inviteLinkEl.onclick = () => copyToClipboard(inviteUrl, inviteLinkEl); 
            }
        }

        const playerListEl = document.getElementById('gm-lobby-player-list');
        playerListEl.innerHTML = '';
        const players = Object.values(state.connectedPlayers).filter(p => p.role === 'player');
        if (players.length === 0) {
            playerListEl.innerHTML = '<li>Aguardando jogadores...</li>';
            return;
        }
        players.forEach(p => {
            let status = 'Conectando...';
            if (p.sheet) {
                if (p.sheet.status === 'ready') status = `<span style="color: #28a745;">Pronto (${p.sheet.name})</span>`;
                else if (p.sheet.status === 'filling_sheet') status = `<span style="color: #ffc107;">Criando Ficha...</span>`;
                else status = `<span style="color: #ffc107;">Escolhendo Aparência...</span>`;
            }
            playerListEl.innerHTML += `<li>Jogador: ${status}</li>`;
        });
    }

    // --- FLUXO DE CRIAÇÃO DE PERSONAGEM ---
    function startNewCharacter() {
        const myData = currentGameState.connectedPlayers[socket.id];
        // Reinicia a ficha apenas se não estiver já no processo de criação
        if (myData.sheet.status !== 'selecting_token' && myData.sheet.status !== 'filling_sheet') {
             myData.sheet = {
                name: "Aventureiro", class: "", race: null, token: null, level: 1, xp: 0, money: 200,
                elements: {}, attributes: { forca: 0, agilidade: 0, protecao: 0, constituicao: 0, inteligencia: 0, mente: 0 },
                equipment: { weapon1: null, weapon2: null, shield: null, armor: null }, spells: [], status: 'selecting_token'
            };
        }
        myData.sheet.status = 'selecting_token';
        characterSheetInProgress = JSON.parse(JSON.stringify(myData.sheet)); // Deep copy para trabalhar localmente
        renderGame(currentGameState);
    }
    
    function renderTokenSelection() {
        const container = document.getElementById('token-list-container');
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
        const myData = currentGameState.connectedPlayers[socket.id];
        myData.sheet.status = 'filling_sheet';
        myData.sheet.token = characterSheetInProgress.token;
        characterSheetInProgress = myData.sheet; // Sincroniza a cópia de trabalho com a do estado global
        renderGame(currentGameState);
    }

    function renderSheetCreationUI() {
        const sheet = characterSheetInProgress;
        const container = document.querySelector('.sheet-form-container');
        
        const raceData = sheet.race ? GAME_DATA.races[sheet.race] : null;
        let attributePointsBudget = 5 + (raceData?.bonus?.any || 0);
        let usedPoints = Object.keys(sheet.attributes).reduce((total, key) => {
            const attrBase = (raceData?.bonus?.[key] || 0) + (raceData?.penalty?.[key] || 0);
            return total + (sheet.attributes[key] - attrBase);
        }, 0);
        
        container.innerHTML = `
            <div class="sheet-section"><h3>Identidade</h3><div class="form-grid"><div class="form-field"><label>Nome:</label><input type="text" id="sheet-name" value="${sheet.name}"></div><div class="form-field"><label>Classe:</label><input type="text" id="sheet-class" value="${sheet.class}"></div></div></div>
            <div class="sheet-section"><h3>Raça</h3><div class="form-grid" id="sheet-races"></div></div>
            <div class="sheet-section"><h3>Elementos (2 pontos para distribuir)</h3><div class="form-grid" id="sheet-elements"></div></div>
            <div class="sheet-section"><h3>Atributos (<span id="points-to-distribute">${attributePointsBudget - usedPoints}</span> pontos restantes)</h3><div class="form-grid" id="sheet-attributes"></div></div>
            <div class="sheet-section"><h3>Armamento (Dinheiro: <span id="sheet-money">${sheet.money}</span>)</h3><div class="form-grid" id="sheet-equipment"></div></div>
            <div class="sheet-section"><h3>Magias (Escolha 2 de Grau 1)</h3><div class="form-grid" id="sheet-spells"></div></div>
        `;

        // --- POPULAR SEÇÕES ---
        // Raças
        const raceContainer = document.getElementById('sheet-races');
        Object.values(GAME_DATA.races).forEach(race => {
            const card = document.createElement('div');
            card.className = `race-card ${sheet.race === race.name ? 'selected' : ''}`;
            card.innerHTML = `<h4>${race.name}</h4><p>${race.uniqueAbility}</p>`;
            card.onclick = () => {
                sheet.race = race.name;
                sheet.attributes = { forca: 0, agilidade: 0, protecao: 0, constituicao: 0, inteligencia: 0, mente: 0 };
                Object.entries(race.bonus || {}).forEach(([attr, val]) => { if(attr !== 'any') sheet.attributes[attr] = (sheet.attributes[attr] || 0) + val; });
                Object.entries(race.penalty || {}).forEach(([attr, val]) => { sheet.attributes[attr] = (sheet.attributes[attr] || 0) + val; });
                renderSheetCreationUI(); // Re-renderiza para atualizar pontos e atributos
            };
            raceContainer.appendChild(card);
        });

        // Elementos
        const elementsContainer = document.getElementById('sheet-elements');
        const elements = ["Fogo", "Água", "Terra", "Vento", "Luz", "Escuridão"];
        let elementPointsUsed = Object.values(sheet.elements).reduce((sum, val) => sum + val, 0);

        elements.forEach(element => {
            const card = document.createElement('div');
            card.className = `element-card ${sheet.elements[element] ? 'selected' : ''}`;
            card.innerHTML = `<h4>${element} (${sheet.elements[element] || 0})</h4>`; // Placeholder for advanced element info
            // TODO: Adicionar lógica para elementos avançados
            card.onclick = () => {
                if ((elementPointsUsed < 2 && (sheet.elements[element] || 0) < 2) || ((sheet.elements[element] || 0) > 0 && elementPointsUsed <=2)) {
                    sheet.elements[element] = (sheet.elements[element] || 0) + 1;
                    if(sheet.elements[element] > 2) sheet.elements[element] = 0; // Reset if > 2
                } else if ((sheet.elements[element] || 0) > 0) {
                    sheet.elements[element] = (sheet.elements[element] || 0) -1;
                }
                renderSheetCreationUI();
            };
            elementsContainer.appendChild(card);
        });
        
        // Atributos
        const attrContainer = document.getElementById('sheet-attributes');
        Object.keys(sheet.attributes).forEach(attr => {
            const field = document.createElement('div');
            field.className = 'attribute-field';
            field.innerHTML = `<span>${attr.charAt(0).toUpperCase() + attr.slice(1)}</span><input type="number" id="attr-${attr}" value="${sheet.attributes[attr]}" readonly><div class="attr-btn-group"><button class="attr-btn" data-attr="${attr}" data-amount="-1">-</button><button class="attr-btn" data-attr="${attr}" data-amount="1">+</button></div>`;
            attrContainer.appendChild(field);
        });

        // Armamento
        const equipmentContainer = document.getElementById('sheet-equipment');
        equipmentContainer.innerHTML = `
            <div class="form-field">
                <label>Arma 1:</label>
                <select id="equip-weapon1">
                    <option value="">Desarmado</option>
                    ${Object.keys(GAME_DATA.equipment.weapons).map(w => `<option value="${w}" ${sheet.equipment.weapon1 === w ? 'selected' : ''}>${w} (${GAME_DATA.equipment.weapons[w].cost} moedas)</option>`).join('')}
                </select>
            </div>
            <div class="form-field">
                <label>Arma 2:</label>
                <select id="equip-weapon2">
                    <option value="">Nenhuma</option>
                    ${Object.keys(GAME_DATA.equipment.weapons).map(w => `<option value="${w}" ${sheet.equipment.weapon2 === w ? 'selected' : ''}>${w} (${GAME_DATA.equipment.weapons[w].cost} moedas)</option>`).join('')}
                </select>
            </div>
            <div class="form-field">
                <label>Escudo:</label>
                <select id="equip-shield">
                    <option value="">Nenhum</option>
                    ${Object.keys(GAME_DATA.equipment.shields).map(s => `<option value="${s}" ${sheet.equipment.shield === s ? 'selected' : ''}>${s} (${GAME_DATA.equipment.shields[s].cost} moedas)</option>`).join('')}
                </select>
            </div>
            <div class="form-field">
                <label>Armadura:</label>
                <select id="equip-armor">
                    <option value="">Nenhuma</option>
                    ${Object.keys(GAME_DATA.equipment.armors).map(a => `<option value="${a}" ${sheet.equipment.armor === a ? 'selected' : ''}>${a} (${GAME_DATA.equipment.armors[a].cost} moedas)</option>`).join('')}
                </select>
            </div>
        `;
        
        // --- EVENT LISTENERS ---
        document.getElementById('sheet-name').onchange = (e) => sheet.name = e.target.value;
        document.getElementById('sheet-class').onchange = (e) => sheet.class = e.target.value;
        
        document.querySelectorAll('.attr-btn').forEach(btn => {
            btn.onclick = () => {
                const attr = btn.dataset.attr;
                const amount = parseInt(btn.dataset.amount);
                const baseValue = (raceData?.bonus?.[attr] || 0) + (raceData?.penalty?.[attr] || 0);

                let currentUsedPoints = Object.keys(sheet.attributes).reduce((total, key) => {
                    const attrBase = (raceData?.bonus?.[key] || 0) + (raceData?.penalty?.[key] || 0);
                    return total + (sheet.attributes[key] - attrBase);
                }, 0);
                
                if (amount > 0 && currentUsedPoints < attributePointsBudget) {
                    sheet.attributes[attr] += 1;
                } else if (amount < 0 && sheet.attributes[attr] > baseValue) {
                    sheet.attributes[attr] -= 1;
                }
                renderSheetCreationUI();
            };
        });

        const updateEquipmentAndMoney = () => {
            let totalCost = 0;
            const w1 = document.getElementById('equip-weapon1').value;
            const w2 = document.getElementById('equip-weapon2').value;
            const shield = document.getElementById('equip-shield').value;
            const armor = document.getElementById('equip-armor').value;

            const weapon1Data = GAME_DATA.equipment.weapons[w1];
            const weapon2Data = GAME_DATA.equipment.weapons[w2];
            const shieldData = GAME_DATA.equipment.shields[shield];
            const armorData = GAME_DATA.equipment.armors[armor];

            let canEquipWeapon2 = true;
            let canEquipShield = true;
            let forceFor2H1H = sheet.attributes.forca >= 4; // Força para usar 2H em 1 mão

            // Validação de armas de 2 mãos
            if (weapon1Data && weapon1Data.hands === 2 && !forceFor2H1H) canEquipWeapon2 = false;
            if (weapon2Data && weapon2Data.hands === 2 && !forceFor2H1H) canEquipWeapon2 = false;

            // Validação de shield vs 2 mãos
            if ((weapon1Data && weapon1Data.hands === 2 && !forceFor2H1H) || (weapon2Data && weapon2Data.hands === 2 && !forceFor2H1H)) canEquipShield = false;
            if (shield && (!weapon1Data || weapon1Data.hands !== 1 || (weapon2Data && weapon2Data.hands === 1))) canEquipWeapon2 = false; // Se tem escudo, só uma arma de 1 mão

            if (weapon1Data) totalCost += weapon1Data.cost;
            if (weapon2Data && canEquipWeapon2) totalCost += weapon2Data.cost;
            if (shieldData && canEquipShield) totalCost += shieldData.cost;
            if (armorData) totalCost += armorData.cost;

            sheet.money = 200 - totalCost; // Dinheiro inicial - custo
            document.getElementById('sheet-money').textContent = sheet.money;

            // Atualiza o estado da ficha
            sheet.equipment.weapon1 = w1 || null;
            sheet.equipment.weapon2 = (w2 && canEquipWeapon2) ? w2 : null;
            sheet.equipment.shield = (shield && canEquipShield) ? shield : null;
            sheet.equipment.armor = armor || null;

            // Desabilita/habilita selects com base nas regras
            document.getElementById('equip-weapon2').disabled = !canEquipWeapon2;
            document.getElementById('equip-shield').disabled = !canEquipShield;
            
            // Reajusta selects se as escolhas se tornaram inválidas
            if (!canEquipWeapon2 && document.getElementById('equip-weapon2').value !== "") document.getElementById('equip-weapon2').value = "";
            if (!canEquipShield && document.getElementById('equip-shield').value !== "") document.getElementById('equip-shield').value = "";
        };

        document.getElementById('equip-weapon1').onchange = updateEquipmentAndMoney;
        document.getElementById('equip-weapon2').onchange = updateEquipmentAndMoney;
        document.getElementById('equip-shield').onchange = updateEquipmentAndMoney;
        document.getElementById('equip-armor').onchange = updateEquipmentAndMoney;
        updateEquipmentAndMoney(); // Chama uma vez para inicializar o custo e o estado dos selects

        // Magias
        const spellsContainer = document.getElementById('sheet-spells');
        spellsContainer.innerHTML = '';
        Object.values(GAME_DATA.spells).forEach(spell => {
            // TODO: Filtrar por elemento, grau, etc.
            const card = document.createElement('div');
            card.className = `spell-card ${sheet.spells.includes(spell.name) ? 'selected' : ''}`;
            card.innerHTML = `<h4>${spell.name} (Grau ${spell.grade})</h4><p>${spell.description}</p>`;
            card.onclick = () => {
                if (sheet.spells.includes(spell.name)) {
                    sheet.spells = sheet.spells.filter(s => s !== spell.name);
                } else if (sheet.spells.length < 2) { // Limite de 2 magias de grau 1
                    sheet.spells.push(spell.name);
                } else {
                    alert("Você já escolheu 2 magias de Grau 1. Remova uma para adicionar outra.");
                }
                renderSheetCreationUI();
            };
            spellsContainer.appendChild(card);
        });
    }

    function finishSheetCreation() {
        // TODO: Adicionar validação completa da ficha (ex: nome, raça, pontos distribuídos corretamente)
        const raceData = characterSheetInProgress.race ? GAME_DATA.races[characterSheetInProgress.race] : null;
        let attributePointsBudget = 5 + (raceData?.bonus?.any || 0);
        let usedPoints = Object.keys(characterSheetInProgress.attributes).reduce((total, key) => {
            const attrBase = (raceData?.bonus?.[key] || 0) + (raceData?.penalty?.[key] || 0);
            return total + (characterSheetInProgress.attributes[key] - attrBase);
        }, 0);

        if (usedPoints !== attributePointsBudget) {
            alert(`Você precisa distribuir exatamente ${attributePointsBudget} pontos nos atributos. Pontos restantes: ${attributePointsBudget - usedPoints}`);
            return;
        }
        if (!characterSheetInProgress.race) {
            alert("Por favor, selecione uma raça.");
            return;
        }
        if (characterSheetInProgress.spells.length !== 2) {
            alert("Você deve escolher exatamente 2 magias de Grau 1.");
            return;
        }
        if (characterSheetInProgress.money < 0) {
            alert("Você não tem moedas suficientes para comprar este equipamento.");
            return;
        }

        characterSheetInProgress.status = 'ready';
        socket.emit('playerAction', { type: 'playerSubmitsSheet', sheet: characterSheetInProgress });
    }

    // --- LÓGICA DE SALVAR/CARREGAR ---
    function saveCharacterToFile() {
        const sheet = characterSheetInProgress;
        const dataStr = JSON.stringify(sheet);
        const dataB64 = btoa(unescape(encodeURIComponent(dataStr))); // Ofuscação com Base64 e suporte a UTF-8
        const blob = new Blob([dataB64], {type: "application/json;charset=utf-8"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sheet.name.replace(/\s+/g, '_')}_almara.json`;
        document.body.appendChild(a); // Temporarily add to body for click
        a.click();
        document.body.removeChild(a); // Clean up
        URL.revokeObjectURL(url);
    }

    function loadCharacterFromFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const b64Str = event.target.result;
                const jsonStr = decodeURIComponent(escape(atob(b64Str)));
                const sheet = JSON.parse(jsonStr);
                // Validar o formato básico da ficha carregada
                if (!sheet.name || !sheet.token || !sheet.attributes) {
                    throw new Error("Formato de ficha inválido.");
                }
                sheet.status = 'ready'; // Marca como pronto
                socket.emit('playerAction', { type: 'playerSubmitsSheet', sheet: sheet });
            } catch (e) {
                showInfoModal('Erro', 'Arquivo de personagem inválido ou corrompido.');
                console.error("Erro ao carregar personagem:", e);
            }
        };
        reader.readAsText(file);
    }
    
    // --- UI DE PREPARAÇÃO DO GM ---
    function renderGmNpcSetup() {
        const selectionArea = document.getElementById('npc-selection-area');
        selectionArea.innerHTML = '';
        Object.keys(ALL_NPCS).forEach(npcName => {
            const card = document.createElement('div');
            card.className = 'char-card';
            card.innerHTML = `<img src="images/lutadores/${npcName}.png" alt="${npcName}"><div class="char-name">${npcName}</div>`;
            card.onclick = () => {
                if (stagedNpcs.length >= 5) { // Limite de 5 NPCs
                    showInfoModal('Limite Atingido', 'Você não pode ter mais de 5 inimigos na batalha.');
                    return;
                }
                stagedNpcs.push({
                    id: `staged-${Date.now()}`,
                    name: npcName,
                    hp: 50, bta: 5, btd: 5, btm: 0 // Valores padrão
                });
                renderGmNpcSetup(); // Re-renderiza para atualizar a lista
            };
            selectionArea.appendChild(card);
        });

        const stagedArea = document.getElementById('staged-npc-list');
        stagedArea.innerHTML = '';
        stagedNpcs.forEach(npc => {
            const card = document.createElement('div');
            card.className = `staged-npc-card ${selectedStagedNpcId === npc.id ? 'selected' : ''}`;
            card.innerHTML = `<img src="images/lutadores/${npc.name}.png" alt="${npc.name}"><span>${npc.name}</span><button class="remove-npc-btn" data-id="${npc.id}">X</button>`;
            card.onclick = (e) => { 
                if (e.target.classList.contains('remove-npc-btn')) return; // Evita que o clique no X selecione
                selectedStagedNpcId = npc.id; 
                renderGmNpcSetup(); // Re-renderiza para atualizar seleção
            };
            card.querySelector('.remove-npc-btn').onclick = (e) => {
                e.stopPropagation(); // Evita que o clique no botão de remover selecione o card
                stagedNpcs = stagedNpcs.filter(n => n.id !== npc.id);
                if (selectedStagedNpcId === npc.id) selectedStagedNpcId = null;
                renderGmNpcSetup();
            };
            stagedArea.appendChild(card);
        });

        const editor = document.getElementById('npc-editor');
        const npcToEdit = stagedNpcs.find(n => n.id === selectedStagedNpcId);
        if (npcToEdit) {
            editor.classList.remove('hidden');
            editor.innerHTML = `
                <h3>Editando ${npcToEdit.name}</h3>
                <div class="form-field"><label>HP:</label><input type="number" id="npc-hp" value="${npcToEdit.hp}"></div>
                <div class="form-field"><label>BTA:</label><input type="number" id="npc-bta" value="${npcToEdit.bta}"></div>
                <div class="form-field"><label>BTD:</label><input type="number" id="npc-btd" value="${npcToEdit.btd}"></div>
                <div class="form-field"><label>BTM:</label><input type="number" id="npc-btm" value="${npcToEdit.btm}"></div>
            `;
            // Atualiza o objeto stagedNpcs ao editar
            document.getElementById('npc-hp').onchange = (e) => npcToEdit.hp = parseInt(e.target.value) || 0;
            document.getElementById('npc-bta').onchange = (e) => npcToEdit.bta = parseInt(e.target.value) || 0;
            document.getElementById('npc-btd').onchange = (e) => npcToEdit.btd = parseInt(e.target.value) || 0;
            document.getElementById('npc-btm').onchange = (e) => npcToEdit.btm = parseInt(e.target.value) || 0;
        } else {
            editor.classList.add('hidden');
        }
    }

    // --- UI DE COMBATE ---
    function renderFightUI(state) {
        document.getElementById('round-info').textContent = `ROUND ${state.currentRound} / CICLO ${state.currentCycle}`;
        document.getElementById('fight-log').innerHTML = (state.log || []).map(entry => `<p>${entry.text}</p>`).join('');

        const initiativeUI = document.getElementById('initiative-ui');
        const playerRollBtn = document.getElementById('player-roll-initiative-btn');
        
        const myFighter = getFighter(state, socket.id);

        if (state.phase === 'initiative_roll' && myFighter && myFighter.status === 'active' && myFighter.initiativeRoll === undefined) {
            initiativeUI.classList.remove('hidden');
            playerRollBtn.disabled = false;
        } else {
            initiativeUI.classList.add('hidden');
        }
        
        const actionWrapper = document.getElementById('action-buttons-wrapper');
        actionWrapper.innerHTML = '';
        if (state.activeCharacterKey === socket.id) {
            actionWrapper.innerHTML = `<button class="action-btn attack-btn">Atacar</button><button class="action-btn spell-btn">Magia</button><button class="action-btn defend-btn">Defender</button><button class="action-btn end-turn-btn">Terminar Turno</button>`;
            document.querySelector('.end-turn-btn').onclick = () => socket.emit('playerAction', { type: 'end_turn' });
            // TODO: Adicionar lógica para ativar/desativar botões de ação baseado em PA/condições
        }
    }
    
    // --- UI DO MODO CENÁRIO ---
    function renderTheaterUI(state) {
        const currentScenarioState = state.scenarioStates?.[state.currentScenario];
        const dataToRender = isGm ? currentScenarioState : state.publicState;
        if (!dataToRender || !dataToRender.scenario) return;

        const scenarioUrl = `images/${dataToRender.scenario}`;
        if (!theaterBackgroundImage.src.includes(dataToRender.scenario)) {
            const img = new Image();
            img.onload = () => {
                theaterBackgroundImage.src = img.src;
                // Ajusta o tamanho do mundo do teatro ao tamanho da imagem do cenário
                theaterWorldContainer.style.width = `${img.naturalWidth}px`;
                theaterWorldContainer.style.height = `${img.naturalHeight}px`;
            };
            img.src = scenarioUrl;
        }
        
        // GM Panel visibility
        document.getElementById('theater-gm-panel').classList.toggle('hidden', !isGm);
        document.getElementById('toggle-gm-panel-btn').classList.toggle('hidden', !isGm);
        
        // GM controls
        if (isGm && currentScenarioState) {
            theaterGlobalScale.value = currentScenarioState.globalTokenScale || 1.0;
            document.getElementById('theater-publish-btn').classList.toggle('hidden', !currentScenarioState.isStaging);
            document.getElementById('theater-lock-players-btn').textContent = state.playerControlsLocked ? 'Desbloquear Jogadores' : 'Bloquear Jogadores';
        }

        // Renderiza tokens
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
            tokenEl.style.zIndex = index; // Z-index para ordem de camadas
            tokenEl.dataset.scale = tokenData.scale || 1.0;
            tokenEl.dataset.flipped = String(!!tokenData.isFlipped);
            tokenEl.dataset.owner = tokenData.owner || ''; // Propriedade para o owner do token
            tokenEl.title = tokenData.charName;
            
            const globalTokenScale = dataToRender.globalTokenScale || 1.0;
            const baseScale = parseFloat(tokenEl.dataset.scale);
            const isFlipped = tokenEl.dataset.flipped === 'true';
            tokenEl.style.transform = `scale(${baseScale * globalTokenScale}) ${isFlipped ? 'scaleX(-1)' : ''}`;
            
            // Event listeners para GM (seleção, hover)
            if (isGm) {
                if (selectedTokens.has(tokenId)) tokenEl.classList.add('selected');
                tokenEl.addEventListener('mouseenter', () => hoveredTokenId = tokenId);
                tokenEl.addEventListener('mouseleave', () => hoveredTokenId = null);
            }
            fragment.appendChild(tokenEl);
        });
        theaterTokenContainer.appendChild(fragment);

        // Inicializa a lista de personagens para o GM no painel (se for a primeira vez ou se mudar o estado)
        if (theaterCharList.innerHTML === '' || !isGm) { // Evita re-renderizar toda hora
            theaterCharList.innerHTML = '';
            const allMinis = [...PLAYABLE_TOKENS, ...Object.keys(ALL_NPCS).map(name => ({name, img: `images/lutadores/${name}.png`})), ...DYNAMIC_CHARACTERS];
            allMinis.forEach(char => {
                const mini = document.createElement('div');
                mini.className = 'theater-char-mini';
                mini.style.backgroundImage = `url("${char.img}")`;
                mini.title = char.name;
                mini.draggable = true;
                mini.addEventListener('dragstart', (e) => {
                    if (!isGm) return;
                    e.dataTransfer.setData('application/json', JSON.stringify({ charName: char.name, img: char.img }));
                });
                theaterCharList.appendChild(mini);
            });
        }
    }

    // CORRIGIDO: Funções para controle de tokens e cenário re-introduzidas
    function setupTheaterEventListeners() {
        // MOUSE DOWN (PAN, DRAG, SELECT)
        theaterBackgroundViewport.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // Only left click
            dragStartPos = { x: e.clientX, y: e.clientY };
            const gameScale = gameWrapper.getBoundingClientRect().width / 1280; // Get actual scale of game-wrapper

            if (isGm) {
                const tokenElement = e.target.closest('.theater-token');
                if (isGroupSelectMode && !tokenElement) {
                    // Start box selection
                    isSelectingBox = true;
                    selectionBoxStartPos = { x: e.clientX, y: e.clientY };
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
                        const tokenEl = document.getElementById(id);
                        if (tokenEl) {
                           dragOffsets.set(id, { startX: parseFloat(tokenEl.style.left), startY: parseFloat(tokenEl.style.top) });
                        }
                    });
                    renderTheaterUI(currentGameState); // Update selection highlight
                } else if (!isGroupSelectMode) {
                    // Start panning if not selecting a token or in group select mode
                    if (selectedTokens.size > 0) {
                        selectedTokens.clear();
                        renderTheaterUI(currentGameState);
                    }
                    isPanning = true;
                }
            } else { // Player controls
                 const tokenElement = e.target.closest('.theater-token');
                 if (tokenElement && tokenElement.dataset.owner === myPlayerKey && !currentGameState.gameModes.theater.playerControlsLocked) {
                    isDragging = true;
                    selectedTokens.clear(); // Player only drags their own
                    selectedTokens.add(tokenElement.id);
                    dragOffsets.clear();
                    dragOffsets.set(tokenElement.id, { startX: parseFloat(tokenElement.style.left), startY: parseFloat(tokenElement.style.top) });
                 } else {
                    isPanning = true;
                 }
            }
        });

        // MOUSE MOVE (DRAG, RESIZE, PAN, BOX SELECT)
        window.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                const gameScale = gameWrapper.getBoundingClientRect().width / 1280;
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
            } else if (isSelectingBox) {
                e.preventDefault();
                const gameScale = gameWrapper.getBoundingClientRect().width / 1280;
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

        // MOUSE UP (END DRAG, END PAN, END BOX SELECT)
        window.addEventListener('mouseup', (e) => {
            if (isDragging) {
                isDragging = false;
                const gameScale = gameWrapper.getBoundingClientRect().width / 1280;
                const deltaX = (e.clientX - dragStartPos.x) / gameScale / localWorldScale;
                const deltaY = (e.clientY - dragStartPos.y) / gameScale / localWorldScale;

                selectedTokens.forEach(id => {
                    const initialPos = dragOffsets.get(id);
                    if(initialPos) {
                        const finalX = initialPos.startX + deltaX;
                        const finalY = initialPos.startY + deltaY;
                        
                        if (isGm) {
                            socket.emit('playerAction', { type: 'updateToken', token: { id: id, x: finalX, y: finalY } });
                        } else if (getFighter(currentGameState.gameModes.theater, id)?.owner === myPlayerKey) {
                            socket.emit('playerAction', { type: 'playerMovesToken', tokenId: id, position: { x: finalX, y: finalY } });
                        }
                    }
                });
            } else if (isSelectingBox) {
                const boxRect = selectionBox.getBoundingClientRect();
                isSelectingBox = false;
                selectionBox.classList.add('hidden');
                if (!e.ctrlKey) {
                    selectedTokens.clear();
                }
                document.querySelectorAll('.theater-token').forEach(token => {
                    const tokenRect = token.getBoundingClientRect();
                    // Check for intersection
                    if (boxRect.left < tokenRect.right && boxRect.right > tokenRect.left && boxRect.top < tokenRect.bottom && boxRect.bottom > tokenRect.top) {
                         if (e.ctrlKey && selectedTokens.has(token.id)) {
                             selectedTokens.delete(token.id);
                         } else {
                             selectedTokens.add(token.id);
                         }
                    }
                });
                renderTheaterUI(currentGameState);
            }
            isPanning = false;
            dragOffsets.clear();
        });

        // DRAG AND DROP (FOR GM TO ADD TOKENS)
        theaterBackgroundViewport.addEventListener('drop', (e) => {
            e.preventDefault(); 
            if (!isGm) return;
            try {
                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                const tokenWidth = 200; // Default token size for calculation
                const gameScale = gameWrapper.getBoundingClientRect().width / 1280;
                const viewportRect = theaterBackgroundViewport.getBoundingClientRect();
                
                // Calculate position relative to the world container, considering scroll and local zoom
                const finalX = ((e.clientX - viewportRect.left) / gameScale + theaterBackgroundViewport.scrollLeft) / localWorldScale - (tokenWidth / 2);
                const finalY = ((e.clientY - viewportRect.top) / gameScale + theaterBackgroundViewport.scrollTop) / localWorldScale - (tokenWidth / 2);
                
                // Determine owner for player tokens
                let ownerId = null;
                if (PLAYABLE_TOKENS.some(t => t.name === data.charName)) {
                    // Check if this character is owned by a player in the game
                    const playerSockets = Object.keys(currentGameState.connectedPlayers).filter(id => {
                        const playerData = currentGameState.connectedPlayers[id];
                        return playerData.role === 'player' && playerData.sheet?.token?.name === data.charName;
                    });
                    if (playerSockets.length > 0) {
                        ownerId = playerSockets[0]; // Assign to the first player found with this token
                    }
                }

                socket.emit('playerAction', { type: 'updateToken', token: { id: `token-${uuidv4()}`, charName: data.charName, img: data.img, x: finalX, y: finalY, scale: 1.0, isFlipped: false, owner: ownerId }});
            } catch (error) { console.error("Drop error:", error); }
        });

        theaterBackgroundViewport.addEventListener('dragover', (e) => e.preventDefault());

        // MOUSE WHEEL (ZOOM)
        theaterBackgroundViewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (isGm && hoveredTokenId && selectedTokens.has(hoveredTokenId)) {
                // Zoom on selected token (GM only)
                const tokenData = currentGameState.gameModes.theater.scenarioStates[currentGameState.gameModes.theater.currentScenario].tokens[hoveredTokenId];
                if (tokenData) {
                    const newScale = (tokenData.scale || 1.0) + (e.deltaY > 0 ? -0.1 : 0.1);
                    selectedTokens.forEach(id => {
                        socket.emit('playerAction', { type: 'updateToken', token: { id: id, scale: Math.max(0.1, newScale) }});
                    });
                }
            } else {
                // Global pan zoom
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

        // GM Panel controls
        theaterGlobalScale.addEventListener('input', (e) => { // Use 'input' for continuous update
             if (!isGm) return;
             socket.emit('playerAction', {type: 'updateGlobalScale', scale: parseFloat(e.target.value)});
        });
        document.getElementById('theater-change-scenario-btn').onclick = showScenarioSelectionModal;
        document.getElementById('theater-publish-btn').onclick = () => socket.emit('playerAction', { type: 'publish_stage' });

        // GM Keyboard Shortcuts
        window.addEventListener('keydown', (e) => {
            if (!isGm || currentGameState.mode !== 'theater') return;
            const focusedEl = document.activeElement;
            if (focusedEl.tagName === 'INPUT' || focusedEl.tagName === 'TEXTAREA') return;

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
                const tokenData = currentGameState.gameModes.theater.scenarioStates[currentGameState.gameModes.theater.currentScenario].tokens[targetId];
                if(tokenData) socket.emit('playerAction', { type: 'updateToken', token: { id: targetId, isFlipped: !tokenData.isFlipped } });
            } else if (e.key === 'Delete' && selectedTokens.size > 0) {
                e.preventDefault();
                socket.emit('playerAction', { type: 'updateToken', token: { remove: true, ids: Array.from(selectedTokens) } });
                selectedTokens.clear();
            } else if (selectedTokens.size === 1 && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault();
                const tokenId = selectedTokens.values().next().value;
                const currentOrder = [...currentGameState.gameModes.theater.scenarioStates[currentGameState.gameModes.theater.currentScenario].tokenOrder];
                const currentIndex = currentOrder.indexOf(tokenId);
                
                if (e.key === 'ArrowUp' && currentIndex < currentOrder.length - 1) {
                    [currentOrder[currentIndex], currentOrder[currentIndex + 1]] = [currentOrder[currentIndex + 1], currentOrder[currentIndex]];
                    socket.emit('playerAction', { type: 'updateTokenOrder', order: currentOrder });
                } else if (e.key === 'ArrowDown' && currentIndex > 0) {
                    [currentOrder[currentIndex], currentOrder[currentIndex - 1]] = [currentOrder[currentIndex - 1], currentOrder[currentIndex]];
                    socket.emit('playerAction', { type: 'updateTokenOrder', order: currentOrder });
                }
            } else if (e.key.toLowerCase() === 'b' && isGm) { // GM toggle player lock
                e.preventDefault();
                document.getElementById('theater-lock-players-btn').click(); // Simula o clique no botão
            }
        });
    }

    // Modal de seleção de cenário
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
        showInfoModal('Mudar Cenário', content); // Usar showInfoModal para exibir
        document.querySelectorAll('#modal .category-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#modal .category-tab-btn, #modal .scenarios-grid').forEach(el => el.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(`grid-${btn.dataset.category}`).classList.add('active');
            });
        });
        document.querySelectorAll('#modal .scenario-card').forEach(card => {
            card.addEventListener('click', () => {
                const scenario = card.dataset.path;
                socket.emit('playerAction', { type: 'changeScenario', scenario: scenario });
                modal.classList.add('hidden');
            });
        });
    }


    function renderPlayerTheaterControls(state) {
        const container = document.getElementById('theater-player-controls');
        const myData = state.connectedPlayers?.[socket.id];
        if(!myData || !myData.sheet) return;

        container.classList.toggle('hidden', state.playerControlsLocked);
        container.innerHTML = `
            <button class="test-btn" data-attr="forca">Força</button>
            <button class="test-btn" data-attr="agilidade">Agilidade</button>
            <button class="test-btn" data-attr="protecao">Proteção</button>
            <button class="test-btn" data-attr="constituicao">Constituição</button>
            <button class="test-btn" data-attr="inteligencia">Inteligência</button>
            <button class="test-btn" data-attr="mente">Mente</button>
        `;
        // Adicionar listeners para os testes de atributo, etc.
        // Adicionar botões para magias usáveis fora de combate
    }


    // --- INICIALIZAÇÃO E LISTENERS GERAIS ---
    socket.on('initialData', (data) => {
        PLAYABLE_TOKENS = data.playableTokens;
        GAME_DATA = data.gameData;
        ALL_NPCS = data.npcs;
        ALL_SCENARIOS = data.scenarios;
        // Depois de carregar os dados, re-renderiza o estado do jogo
        renderGame(currentGameState);
    });

    socket.on('gameUpdate', (gameState) => renderGame(gameState));
    
    socket.on('roomCreated', (roomId) => {
        myRoomId = roomId;
        // O `updateGmLobbyUI` é chamado no renderGame, então o link será atualizado lá
        // No entanto, para garantir que o link apareça imediatamente na criação da sala:
        const inviteLinkEl = document.getElementById('gm-link-invite');
        if (inviteLinkEl) {
            const inviteUrl = `${window.location.origin}?room=${roomId}`;
            inviteLinkEl.textContent = inviteUrl;
            inviteLinkEl.onclick = () => copyToClipboard(inviteUrl, inviteLinkEl);
        }
    });

    socket.on('promptForRole', ({ isFull }) => {
        showScreen('role-selection-screen');
        document.getElementById('join-as-player-btn').disabled = isFull;
        document.getElementById('room-full-message').classList.toggle('hidden', !isFull);
    });

    socket.on('assignRole', (data) => {
        myRole = data.role; isGm = !!data.isGm; myRoomId = data.roomId; myPlayerKey = data.playerKey || socket.id;
        // Se o player acabou de se conectar e não tem sheet, inicializa uma nova
        if (myRole === 'player' && (!currentGameState?.connectedPlayers?.[socket.id]?.sheet || currentGameState.connectedPlayers[socket.id].sheet.status === undefined)) {
            currentGameState.connectedPlayers[socket.id].sheet = {
                name: "Aventureiro", class: "", race: null, token: null, level: 1, xp: 0, money: 200,
                elements: {}, attributes: { forca: 0, agilidade: 0, protecao: 0, constituicao: 0, inteligencia: 0, mente: 0 },
                equipment: { weapon1: null, weapon2: null, shield: null, armor: null }, spells: [], status: 'creating_sheet'
            };
            characterSheetInProgress = JSON.parse(JSON.stringify(currentGameState.connectedPlayers[socket.id].sheet));
        }
        renderGame(currentGameState);
    });

    socket.on('error', (data) => showInfoModal('Erro', data.message));
    
    function initialize() {
        showScreen('loading-screen');
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoomId = urlParams.get('room');
        
        if (urlRoomId) socket.emit('playerJoinsLobby', { roomId: urlRoomId });
        else socket.emit('gmCreatesLobby');

        // --- Listeners de botões principais ---
        document.getElementById('join-as-player-btn').onclick = () => socket.emit('playerChoosesRole', { role: 'player' });
        document.getElementById('join-as-spectator-btn').onclick = () => socket.emit('playerChoosesRole', { role: 'spectator' });
        
        document.getElementById('new-char-btn').onclick = startNewCharacter;
        document.getElementById('load-char-btn').onclick = () => document.getElementById('load-char-input').click();
        document.getElementById('load-char-input').onchange = (e) => loadCharacterFromFile(e.target.files[0]);
        document.getElementById('confirm-token-btn').onclick = confirmTokenSelection;
        document.getElementById('finish-sheet-btn').onclick = finishSheetCreation;
        document.getElementById('save-sheet-btn').onclick = saveCharacterToFile;
        
        document.getElementById('gm-start-battle-btn').onclick = () => {
            if(stagedNpcs.length > 0) socket.emit('playerAction', { type: 'gmStartBattle', npcs: stagedNpcs });
            else showInfoModal('Erro', 'Adicione pelo menos um inimigo para iniciar a batalha.');
        };
        document.getElementById('player-roll-initiative-btn').onclick = () => socket.emit('playerAction', { type: 'roll_initiative' });

        document.getElementById('start-adventure-btn').onclick = () => socket.emit('playerAction', { type: 'gmStartsAdventure' });
        document.getElementById('start-theater-btn').onclick = () => socket.emit('playerAction', { type: 'gmStartsTheater' });
        document.getElementById('back-to-lobby-btn').onclick = () => socket.emit('playerAction', { type: 'gmGoesBackToLobby' });
        document.getElementById('floating-switch-mode-btn').onclick = () => socket.emit('playerAction', { type: 'gmSwitchesMode' });
        document.getElementById('theater-lock-players-btn').onclick = () => socket.emit('playerAction', { type: 'togglePlayerLock' });
        
        // CORRIGIDO: Inicializa listeners do modo Cenário aqui
        setupTheaterEventListeners();

        // Sempre chama a função de escala ao iniciar e redimensionar
        window.addEventListener('resize', scaleGame);
        scaleGame();
    }
    
    initialize();
});