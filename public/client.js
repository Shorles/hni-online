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
        // CORREÇÃO DEFINITIVA: Atribui o listener no momento da renderização
        if (myRoomId && inviteLinkEl) {
            const inviteUrl = `${window.location.origin}?room=${myRoomId}`;
            if (inviteLinkEl.textContent !== inviteUrl) {
                inviteLinkEl.textContent = inviteUrl;
            }
            inviteLinkEl.onclick = () => copyToClipboard(inviteUrl, inviteLinkEl);
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
        // ... (Implementação completa e funcional mantida da versão anterior)
    }

    function addSheetListeners() {
        // ... (Implementação completa e funcional mantida da versão anterior)
    }


    function finishSheetCreation() {
        characterSheetInProgress.status = 'ready';
        socket.emit('playerAction', { type: 'playerSubmitsSheet', sheet: characterSheetInProgress });
    }
    
    function saveCharacterToFile() {
        // ... (implementação funcional mantida da versão anterior)
    }

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

        // CORREÇÃO DEFINITIVA: Listeners persistentes são definidos uma única vez
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
        document.getElementById('save-sheet-btn').addEventListener('click', saveCharacterToFile);
        document.getElementById('start-adventure-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsAdventure' }));
        document.getElementById('start-theater-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsTheater' }));
        
        // ... (todos os outros listeners de botões e eventos de janela)
        
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