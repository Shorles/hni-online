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
    let DYNAMIC_CHARACTERS = [];
    let ALL_NPCS = {};
    let ALL_SCENARIOS = {};
    let GAME_DATA = {};
    
    // --- ESTADO LOCAL DO CLIENTE ---
    let characterSheetInProgress = {};
    // ... (outras variáveis de estado local mantidas)

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
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }

    function copyToClipboard(text, element) {
        navigator.clipboard.writeText(text).then(() => {
            const originalHTML = element.innerHTML;
            element.innerHTML = 'Copiado!';
            setTimeout(() => { element.innerHTML = originalHTML; }, 2000);
        });
    }

    // ... (outras funções de utilidade como showInfoModal, getGameScale, etc. mantidas)

    // --- FLUXO PRINCIPAL DE RENDERIZAÇÃO ---
    function renderGame(state) {
        if (!myRole) { // Trava de segurança principal
            currentGameState = state;
            return;
        }

        currentGameState = state;
        if (!state) return;

        const myPlayerData = state.connectedPlayers?.[socket.id];

        // ... (Lógica de botões flutuantes mantida)

        if (isGm) {
            renderGmView(state);
        } else if (myRole === 'player') {
            renderPlayerView(state, myPlayerData);
        } else { // Espectador
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
        };
        switch(myData.sheet.status) {
            case 'creating_sheet': showScreen('character-entry-screen'); break;
            case 'selecting_token': showScreen('token-selection-screen'); renderTokenSelection(); break;
            case 'filling_sheet': showScreen('sheet-creation-screen'); renderSheetCreationUI(); break;
            case 'ready':
                switch(state.mode) {
                    case 'lobby': showScreen('player-waiting-screen'); document.getElementById('player-waiting-message').textContent = "Personagem pronto! Aguardando o Mestre..."; break;
                    // ... (outras visões de jogo)
                }
                break;
        }
    }

    function renderSpectatorView(state) { /* ... (Mantida) ... */ }

    function updateGmLobbyUI(state) {
        const inviteLinkEl = document.getElementById('gm-link-invite');
        // CORREÇÃO: Garante que o link seja sempre renderizado corretamente
        if (myRoomId && inviteLinkEl) {
            const inviteUrl = `${window.location.origin}?room=${myRoomId}`;
            if (inviteLinkEl.textContent !== inviteUrl) {
                inviteLinkEl.textContent = inviteUrl;
            }
        }
        
        // ... (resto da função para listar jogadores mantida)
    }
    
    // --- LÓGICA DE CRIAÇÃO DE PERSONAGEM (FICHA COMPLETA) ---
    function startNewCharacter() {
        if (!currentGameState) return;
        const myData = currentGameState.connectedPlayers[socket.id];
        if (!myData) return;
        myData.sheet.status = 'selecting_token';
        characterSheetInProgress = JSON.parse(JSON.stringify(myData.sheet));
        renderGame(currentGameState);
    }

    function renderTokenSelection() {
        const container = document.getElementById('token-list-container');
        // CORREÇÃO DEFINITIVA: Trava de segurança para dados dos tokens
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
        characterSheetInProgress = myData.sheet;
        renderGame(currentGameState);
    }

    function renderSheetCreationUI() { /* ... (implementação funcional mantida da versão anterior) ... */ }
    function finishSheetCreation() { /* ... (implementação funcional mantida da versão anterior) ... */ }
    function renderGmNpcSetup() { /* ... (implementação funcional mantida da versão anterior) ... */ }
    function renderTheaterUI(state) { /* ... (implementação funcional mantida da versão anterior) ... */ }
    // ... (TODAS as outras funções de renderização e lógica de jogo são mantidas)

    // --- INICIALIZAÇÃO E LISTENERS DE SOCKET ---
    socket.on('initialData', (data) => {
        PLAYABLE_TOKENS = data.playableTokens;
        // ... (resto dos dados)
        renderGame(currentGameState); // Tenta renderizar caso o papel já tenha chegado
    });

    socket.on('assignRole', (data) => {
        myRole = data.role; 
        isGm = !!data.isGm; 
        myRoomId = data.roomId;
        renderGame(currentGameState); // Tenta renderizar caso os dados já tenham chegado
    });
    
    socket.on('gameUpdate', (gameState) => {
        currentGameState = gameState;
        renderGame(gameState);
    });

    socket.on('roomCreated', (roomId) => { 
        myRoomId = roomId;
        // O `assignRole` que vem em seguida vai definir o papel de GM
    });
    
    socket.on('promptForRole', ({ isFull }) => {
        showScreen('role-selection-screen');
        document.getElementById('join-as-player-btn').disabled = isFull;
    });
    
    // ... (outros listeners de socket mantidos)
    
    function initialize() {
        showScreen('loading-screen');

        // CORREÇÃO DEFINITIVA: Listeners de clique robustos e centralizados
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
        
        // Listener para o link de convite do GM
        const inviteLinkEl = document.getElementById('gm-link-invite');
        if (inviteLinkEl) {
            inviteLinkEl.addEventListener('click', () => {
                if(myRoomId) {
                    const inviteUrl = `${window.location.origin}?room=${myRoomId}`;
                    copyToClipboard(inviteUrl, inviteLinkEl);
                }
            });
        }
        
        // ... (todos os outros listeners de botões são mantidos aqui, eles não eram a causa do erro)
        
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