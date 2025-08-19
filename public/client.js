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
    
    // --- ESTADO LOCAL DO CLIENTE ---
    let characterSheetInProgress = {};
    let stagedNpcs = [];
    let selectedStagedNpcId = null;

    // --- ELEMENTOS DO DOM ---
    const allScreens = document.querySelectorAll('.screen');
    const gameWrapper = document.getElementById('game-wrapper');

    // --- FUNÇÕES DE UTILIDADE ---
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
        document.getElementById('player-sheet-button').classList.toggle('hidden', !isPlayerReady);
        document.getElementById('floating-buttons-container').classList.toggle('hidden', !isGm);
        document.getElementById('back-to-lobby-btn').classList.toggle('hidden', !isGm || state.mode === 'lobby');

        if (isGm) renderGmView(state);
        else if (myRole === 'player') renderPlayerView(state, myPlayerData);
        else renderSpectatorView(state);
    }

    // --- RENDERIZAÇÃO DAS VISÕES ESPECÍFICAS ---
    function renderGmView(state) {
        switch (state.mode) {
            case 'lobby':
                showScreen('gm-initial-lobby');
                updateGmLobbyUI(state);
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
                // renderTheaterUI(state);
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
                // renderTheaterUI(state);
                renderPlayerTheaterControls(state);
                break;
        }
    }

    function renderSpectatorView(state) {
        let message = "Assistindo... Aguardando o Mestre iniciar.";
        let screen = 'player-waiting-screen';

        switch(state.mode) {
            case 'adventure': screen = 'fight-screen'; renderFightUI(state); break;
            case 'theater': screen = 'theater-screen'; /* renderTheaterUI(state); */ break;
        }
        showScreen(screen);
        if (screen === 'player-waiting-screen') {
            document.getElementById('player-waiting-message').textContent = message;
        }
    }

    // --- LÓGICA DA INTERFACE DO USUÁRIO (UI) ---
    function updateGmLobbyUI(state) {
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
        myData.sheet.status = 'selecting_token';
        characterSheetInProgress = JSON.parse(JSON.stringify(myData.sheet)); // Deep copy
        renderGame(currentGameState);
    }
    
    function renderTokenSelection() {
        const container = document.getElementById('token-list-container');
        container.innerHTML = '';
        PLAYABLE_TOKENS.forEach(token => {
            const card = document.createElement('div');
            card.className = 'token-card char-card';
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
        characterSheetInProgress = myData.sheet;
        renderGame(currentGameState);
    }

    function renderSheetCreationUI() {
        const sheet = characterSheetInProgress;
        const container = document.querySelector('.sheet-form-container');
        
        // --- CÁLCULOS ---
        const raceData = sheet.race ? GAME_DATA.races[sheet.race] : null;
        let attributePoints = 5 + (raceData?.bonus?.any || 0);
        let usedPoints = Object.values(sheet.attributes).reduce((a, b) => a + b, 0);
        
        container.innerHTML = `
            <!-- IDENTIDADE -->
            <div class="sheet-section">
                <h3>Identidade</h3>
                <div class="form-grid">
                    <div class="form-field"><label>Nome:</label><input type="text" id="sheet-name" value="${sheet.name}"></div>
                    <div class="form-field"><label>Classe:</label><input type="text" id="sheet-class" value="${sheet.class}"></div>
                </div>
            </div>

            <!-- RAÇA -->
            <div class="sheet-section">
                <h3>Raça</h3>
                <div class="form-grid" id="sheet-races"></div>
            </div>

            <!-- ATRIBUTOS -->
            <div class="sheet-section">
                <h3>Atributos (<span id="points-to-distribute">${attributePoints - usedPoints}</span> pontos restantes)</h3>
                <div class="form-grid" id="sheet-attributes"></div>
            </div>
            
            <!-- Adicionar mais seções aqui (elementos, equipamentos, etc.) -->
        `;

        // --- POPULAR SEÇÕES ---
        const raceContainer = document.getElementById('sheet-races');
        Object.values(GAME_DATA.races).forEach(race => {
            const card = document.createElement('div');
            card.className = `race-card ${sheet.race === race.name ? 'selected' : ''}`;
            card.innerHTML = `<h4>${race.name}</h4><p>${race.uniqueAbility}</p>`;
            card.onclick = () => {
                sheet.race = race.name;
                // Reseta e aplica bônus/penalidades da raça aos atributos
                sheet.attributes = { forca: 0, agilidade: 0, protecao: 0, constituicao: 0, inteligencia: 0, mente: 0 };
                Object.entries(race.bonus || {}).forEach(([attr, val]) => { if(attr !== 'any') sheet.attributes[attr] = (sheet.attributes[attr] || 0) + val; });
                Object.entries(race.penalty || {}).forEach(([attr, val]) => { sheet.attributes[attr] = (sheet.attributes[attr] || 0) + val; });
                renderSheetCreationUI();
            };
            raceContainer.appendChild(card);
        });

        const attrContainer = document.getElementById('sheet-attributes');
        Object.keys(sheet.attributes).forEach(attr => {
            const baseValue = raceData?.bonus?.[attr] || 0 + (raceData?.penalty?.[attr] || 0);
            const field = document.createElement('div');
            field.className = 'attribute-field';
            field.innerHTML = `
                <span>${attr.charAt(0).toUpperCase() + attr.slice(1)}</span>
                <input type="number" id="attr-${attr}" value="${sheet.attributes[attr]}" readonly>
                <div class="attr-btn-group">
                    <button class="attr-btn" data-attr="${attr}" data-amount="-1">-</button>
                    <button class="attr-btn" data-attr="${attr}" data-amount="1">+</button>
                </div>
            `;
            attrContainer.appendChild(field);
        });

        // --- EVENT LISTENERS ---
        document.getElementById('sheet-name').onchange = (e) => sheet.name = e.target.value;
        document.getElementById('sheet-class').onchange = (e) => sheet.class = e.target.value;
        
        document.querySelectorAll('.attr-btn').forEach(btn => {
            btn.onclick = () => {
                const attr = btn.dataset.attr;
                const amount = parseInt(btn.dataset.amount);
                const raceBonus = raceData?.bonus?.[attr] || 0;
                const racePenalty = raceData?.penalty?.[attr] || 0;
                const baseValue = raceBonus + racePenalty;

                if (amount > 0 && (attributePoints - usedPoints) > 0) {
                    sheet.attributes[attr] += 1;
                } else if (amount < 0 && sheet.attributes[attr] > baseValue) {
                    sheet.attributes[attr] -= 1;
                }
                renderSheetCreationUI();
            };
        });
    }

    function finishSheetCreation() {
        // TODO: Adicionar validação completa da ficha
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
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
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
                sheet.status = 'ready';
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
                stagedNpcs.push({
                    id: `staged-${Date.now()}`,
                    name: npcName,
                    hp: 50, bta: 5, btd: 5, btm: 0 // Valores padrão
                });
                renderGmNpcSetup();
            };
            selectionArea.appendChild(card);
        });

        const stagedArea = document.getElementById('staged-npc-list');
        stagedArea.innerHTML = '';
        stagedNpcs.forEach(npc => {
            const card = document.createElement('div');
            card.className = `staged-npc-card ${selectedStagedNpcId === npc.id ? 'selected' : ''}`;
            card.innerHTML = `
                <img src="images/lutadores/${npc.name}.png" alt="${npc.name}">
                <span>${npc.name}</span>
                <button class="remove-npc-btn" data-id="${npc.id}">X</button>
            `;
            card.onclick = () => { selectedStagedNpcId = npc.id; renderGmNpcSetup(); };
            card.querySelector('.remove-npc-btn').onclick = (e) => {
                e.stopPropagation();
                stagedNpcs = stagedNpcs.filter(n => n.id !== npc.id);
                if (selectedStagedNpcId === npc.id) selectedStagedNpcId = null;
                renderGmNpcSetup();
            };
            stagedArea.appendChild(card);
        });

        const editor = document.getElementById('npc-editor');
        if (selectedStagedNpcId) {
            const npcToEdit = stagedNpcs.find(n => n.id === selectedStagedNpcId);
            editor.classList.remove('hidden');
            editor.innerHTML = `
                <h3>Editando ${npcToEdit.name}</h3>
                <div class="form-field"><label>HP:</label><input type="number" id="npc-hp" value="${npcToEdit.hp}"></div>
                <div class="form-field"><label>BTA:</label><input type="number" id="npc-bta" value="${npcToEdit.bta}"></div>
                <div class="form-field"><label>BTD:</label><input type="number" id="npc-btd" value="${npcToEdit.btd}"></div>
                <div class="form-field"><label>BTM:</label><input type="number" id="npc-btm" value="${npcToEdit.btm}"></div>
            `;
            // Add listeners to update stagedNpcs array on input change
            document.getElementById('npc-hp').onchange = (e) => npcToEdit.hp = parseInt(e.target.value);
            document.getElementById('npc-bta').onchange = (e) => npcToEdit.bta = parseInt(e.target.value);
            document.getElementById('npc-btd').onchange = (e) => npcToEdit.btd = parseInt(e.target.value);
            document.getElementById('npc-btm').onchange = (e) => npcToEdit.btm = parseInt(e.target.value);
        } else {
            editor.classList.add('hidden');
        }
    }

    // --- UI DE COMBATE ---
    function renderFightUI(state) {
        document.getElementById('round-info').textContent = `ROUND ${state.currentRound} / CICLO ${state.currentCycle}`;
        document.getElementById('fight-log').innerHTML = (state.log || []).map(entry => `<p>${entry.text}</p>`).join('');

        const initiativeUI = document.getElementById('initiative-ui');
        const myFighter = getFighter(state, socket.id);

        if (state.phase === 'initiative_roll' && myFighter && myFighter.initiativeRoll === undefined) {
            initiativeUI.classList.remove('hidden');
        } else {
            initiativeUI.classList.add('hidden');
        }
        
        // Renderizar action buttons para o personagem ativo
        const actionWrapper = document.getElementById('action-buttons-wrapper');
        actionWrapper.innerHTML = '';
        if (state.activeCharacterKey === socket.id) {
            actionWrapper.innerHTML = `
                <button class="action-btn attack-btn">Atacar</button>
                <button class="action-btn spell-btn">Magia</button>
                <button class="action-btn defend-btn">Defender</button>
                <button class="action-btn end-turn-btn">Terminar Turno</button>
            `;
            document.querySelector('.end-turn-btn').onclick = () => socket.emit('playerAction', { type: 'end_turn' });
        }
    }
    
    // --- UI DO MODO CENÁRIO ---
    function renderPlayerTheaterControls(state) {
        const container = document.getElementById('theater-player-controls');
        const myData = state.connectedPlayers?.[socket.id];
        if(!myData || !myData.sheet) return;

        container.classList.toggle('hidden', state.playerControlsLocked);
        container.innerHTML = `
            <button class="test-btn">Força</button>
            <button class="test-btn">Agilidade</button>
            <button class="test-btn">Proteção</button>
            <button class="test-btn">Constituição</button>
            <button class="test-btn">Inteligência</button>
            <button class="test-btn">Mente</button>
        `;
        // Adicionar botões de magia usáveis fora de combate aqui
    }

    // --- INICIALIZAÇÃO E LISTENERS DE SOCKET ---
    socket.on('initialData', (data) => {
        PLAYABLE_TOKENS = data.playableTokens;
        GAME_DATA = data.gameData;
        ALL_NPCS = data.npcs;
    });

    socket.on('gameUpdate', (gameState) => renderGame(gameState));
    socket.on('roomCreated', (roomId) => {
        myRoomId = roomId;
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
        };
        document.getElementById('player-roll-initiative-btn').onclick = () => socket.emit('playerAction', { type: 'roll_initiative' });

        document.getElementById('start-adventure-btn').onclick = () => socket.emit('playerAction', { type: 'gmStartsAdventure' });
        document.getElementById('start-theater-btn').onclick = () => socket.emit('playerAction', { type: 'gmStartsTheater' });
        document.getElementById('back-to-lobby-btn').onclick = () => socket.emit('playerAction', { type: 'gmGoesBackToLobby' });
        document.getElementById('floating-switch-mode-btn').onclick = () => socket.emit('playerAction', { type: 'gmSwitchesMode' });
        document.getElementById('theater-lock-players-btn').onclick = () => socket.emit('playerAction', { type: 'togglePlayerLock' });
    }
    
    initialize();
});