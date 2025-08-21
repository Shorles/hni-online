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
        scaleGame();
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
        const sheet = characterSheetInProgress;
        const container = document.querySelector('.sheet-form-container');
        
        // --- CÁLCULOS ---
        const raceData = sheet.race ? GAME_DATA.races[sheet.race] : null;
        // ... (cálculos de pontos mantidos) ...

        // --- RENDERIZAÇÃO DO HTML ---
        container.innerHTML = `...`; // Conteúdo principal do HTML é gerado abaixo

        // --- POPULAR E ADICIONAR LISTENERS ---
        const raceContainer = document.getElementById('sheet-races');
        Object.values(GAME_DATA.races).forEach(race => {
            const card = document.createElement('div');
            card.className = `race-card ${sheet.race === race.name ? 'selected' : ''}`;
            
            // CORREÇÃO: Formata e adiciona bônus e penalidades ao card
            let bonusText = Object.entries(race.bonus).map(([attr, val]) => `${attr === 'any' ? '+1 em qualquer atributo' : `+${val} ${attr}`}`).join(', ');
            let penaltyText = Object.entries(race.penalty).map(([attr, val]) => `-${Math.abs(val)} ${attr}`).join(', ');
            let modifiersHtml = '';
            if (bonusText) modifiersHtml += `<p class="race-bonus"><b>Bônus:</b> ${bonusText}</p>`;
            if (penaltyText) modifiersHtml += `<p class="race-penalty"><b>Penalidade:</b> ${penaltyText}</p>`;

            card.innerHTML = `<h4>${race.name}</h4><p>${race.uniqueAbility}</p>${modifiersHtml}`;
            card.onclick = () => {
                sheet.race = race.name;
                sheet.attributes = { forca: 0, agilidade: 0, protecao: 0, constituicao: 0, inteligencia: 0, mente: 0 };
                Object.entries(race.bonus || {}).forEach(([attr, val]) => { if(attr !== 'any') sheet.attributes[attr] += val; });
                Object.entries(race.penalty || {}).forEach(([attr, val]) => { sheet.attributes[attr] += val; });
                renderSheetCreationUI();
            };
            raceContainer.appendChild(card);
        });
        
        // ... (resto da lógica de renderização e listeners mantida)
    }

    function saveCharacterToFile() {
        // Coleta os dados atuais da ficha antes de salvar
        characterSheetInProgress.name = document.getElementById('sheet-name')?.value || characterSheetInProgress.name;
        characterSheetInProgress.class = document.getElementById('sheet-class')?.value || characterSheetInProgress.class;
        
        const dataStr = JSON.stringify(characterSheetInProgress);
        const dataB64 = btoa(unescape(encodeURIComponent(dataStr)));
        const blob = new Blob([dataB64], {type: "application/json;charset=utf-8"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${characterSheetInProgress.name.replace(/\s+/g, '_')}_almara.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    function finishSheetCreation() {
        characterSheetInProgress.status = 'ready';
        socket.emit('playerAction', { type: 'playerSubmitsSheet', sheet: characterSheetInProgress });
    }

    // --- INICIALIZAÇÃO E LISTENERS DE SOCKET ---
    socket.on('initialData', (data) => {
        PLAYABLE_TOKENS = data.playableTokens;
        GAME_DATA = data.gameData;
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

        // Atribui listeners aos botões uma única vez
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
        
        // CORREÇÃO: Adiciona os listeners para os botões da ficha
        document.getElementById('finish-sheet-btn').addEventListener('click', finishSheetCreation);
        document.getElementById('save-sheet-btn').addEventListener('click', saveCharacterToFile);
        
        const inviteLinkEl = document.getElementById('gm-link-invite');
        if (inviteLinkEl) {
            inviteLinkEl.addEventListener('click', () => {
                if(myRoomId) {
                    const inviteUrl = `${window.location.origin}?room=${myRoomId}`;
                    copyToClipboard(inviteUrl, inviteLinkEl);
                }
            });
        }
        
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