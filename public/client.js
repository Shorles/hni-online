// client.js

document.addEventListener('DOMContentLoaded', () => {
    let myRole = null;
    let myPlayerKey = null;
    let isGm = false;
    let currentGameState = null;
    let currentRoomId = new URLSearchParams(window.location.search).get('room');
    const socket = io();

    let isTargeting = false;
    let coordsModeActive = false;

    let ALL_FIGHTERS_DATA = {};
    let PLAYABLE_CHARACTERS_DATA = [];

    const allScreens = document.querySelectorAll('.screen');
    const gmInitialLobby = document.getElementById('gm-initial-lobby');
    const playerWaitingScreen = document.getElementById('player-waiting-screen');
    const selectionScreen = document.getElementById('selection-screen');
    const fightScreen = document.getElementById('fight-screen');
    const gmPartySetupScreen = document.getElementById('gm-party-setup-screen');
    const gmNpcSetupScreen = document.getElementById('gm-npc-setup-screen');
    
    const charListContainer = document.getElementById('character-list-container');
    const confirmBtn = document.getElementById('confirm-selection-btn');
    const roundInfoEl = document.getElementById('round-info');
    const fightLog = document.getElementById('fight-log');
    const actionButtonsWrapper = document.getElementById('action-buttons-wrapper');
    const fightSceneCharacters = document.getElementById('fight-scene-characters');
    const coordsDisplay = document.getElementById('coords-display');
    const turnOrderSidebar = document.getElementById('turn-order-sidebar');


    socket.on('availableFighters', ({ p1, playable }) => {
        ALL_FIGHTERS_DATA = p1 || {};
        PLAYABLE_CHARACTERS_DATA = playable || [];
    });

    function showScreen(screenToShow) {
        allScreens.forEach(screen => {
            screen.classList.toggle('active', screen === screenToShow);
        });
    }

    // --- FUNÇÕES DE LÓGICA DE JOGO (Sem alterações da ALPHA) ---
    function handleActionClick(event) { /* ... */ }
    function handleTargetClick(event) { /* ... */ }
    function cancelTargeting() { /* ... */ }
    function toggleCoordsMode() { /* ... */ }
    function updateCoordsDisplay(event) { /* ... */ }

    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        currentRoomId = urlParams.get('room');
        const roleFromUrl = urlParams.get('role');

        if (currentRoomId && roleFromUrl) {
            socket.emit('playerJoinsLobby', { roomId: currentRoomId, role: roleFromUrl });
            showScreen(playerWaitingScreen); 
        } else {
            socket.emit('gmCreatesLobby');
        }
        
        document.body.addEventListener('contextmenu', (e) => { if (isTargeting) { e.preventDefault(); cancelTargeting(); } });
        document.body.addEventListener('keydown', (e) => {
            if (isTargeting && e.key === "Escape") { cancelTargeting(); }
            if (isGm && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                toggleCoordsMode();
            }
        });
        actionButtonsWrapper.addEventListener('click', handleActionClick);
    }

    function onConfirmSelection() {
        const selectedCard = document.querySelector('.char-card.selected');
        if (!selectedCard) { alert('Por favor, selecione um personagem!'); return; }
        
        if (myRole === 'player') {
            const playerData = { nome: selectedCard.dataset.name, img: selectedCard.dataset.img };
            socket.emit('playerAction', { type: 'playerSelectsCharacter', character: playerData });
            showScreen(playerWaitingScreen);
            document.getElementById('player-waiting-message').innerText = "Personagem enviado! Aguardando o Mestre...";
            confirmBtn.disabled = true;
        }
    }

    function renderPlayerCharacterSelection(unavailable = []) {
        charListContainer.innerHTML = '';
        confirmBtn.disabled = false;
        
        PLAYABLE_CHARACTERS_DATA.forEach(data => {
            const card = document.createElement('div');
            card.className = 'char-card';
            card.dataset.name = data.name;
            card.dataset.img = data.img;
            card.innerHTML = `<img src="${data.img}" alt="${data.name}"><div class="char-name">${data.name}</div>`;
            
            if (unavailable.includes(data.name)) {
                card.classList.add('disabled');
                card.innerHTML += `<div class="char-unavailable-overlay">SELECIONADO</div>`;
            } else {
                card.addEventListener('click', () => {
                    if (card.classList.contains('disabled')) return;
                    document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                });
            }
            charListContainer.appendChild(card);
        });
        confirmBtn.onclick = onConfirmSelection;
    }

    socket.on('gameUpdate', (gameState) => {
        const oldPhase = currentGameState ? currentGameState.phase : null;
        currentGameState = gameState;
        
        document.getElementById('initiative-ui').classList.add('hidden');

        if (isGm) {
            if (gameState.mode === 'lobby') {
                showScreen(gmInitialLobby);
                updateGmLobbyUI(gameState);
            } else if (gameState.mode === 'adventure') {
                 switch (gameState.phase) {
                    case 'party_setup':
                        showScreen(gmPartySetupScreen);
                        updateGmPartySetupScreen(gameState);
                        break;
                    case 'npc_setup':
                        showScreen(gmNpcSetupScreen);
                        if (oldPhase !== 'npc_setup') renderNpcSelectionForGm();
                        break;
                    case 'initiative_roll':
                        showScreen(fightScreen);
                        updateUI(gameState);
                        renderInitiativeUI(gameState);
                        break;
                    case 'battle':
                    case 'gameover':
                        showScreen(fightScreen);
                        updateUI(gameState);
                        break;
                }
            }
        } else { 
            if (gameState.mode === 'lobby') {
                const myPlayerData = gameState.connectedPlayers[socket.id];
                if (myRole === 'player' && myPlayerData && !myPlayerData.selectedCharacter) {
                    showScreen(selectionScreen);
                    renderPlayerCharacterSelection(gameState.unavailableCharacters);
                } else {
                    showScreen(playerWaitingScreen);
                    document.getElementById('player-waiting-message').innerText = "Aguardando o Mestre iniciar...";
                }
            } else if (gameState.mode === 'adventure') {
                if (['party_setup', 'npc_setup'].includes(gameState.phase)) {
                    showScreen(playerWaitingScreen);
                    document.getElementById('player-waiting-message').innerText = "O Mestre está preparando a aventura...";
                } else if (gameState.phase === 'initiative_roll') {
                    showScreen(fightScreen);
                    updateUI(gameState);
                    renderInitiativeUI(gameState);
                } else {
                    showScreen(fightScreen);
                    updateUI(gameState);
                }
            }
        }
    });

    // --- CORREÇÃO: Listeners de botões do GM movidos para cá ---
    function setupGmButtonListeners() {
        document.getElementById('start-adventure-btn').onclick = () => {
            socket.emit('playerAction', { type: 'gmStartsAdventure' });
        };
        document.getElementById('gm-confirm-party-btn').onclick = () => {
            const playerStats = [];
            document.querySelectorAll('#gm-party-list .party-member-card').forEach(card => {
                playerStats.push({ id: card.dataset.id, agi: parseInt(card.querySelector('.agi-input').value, 10), res: parseInt(card.querySelector('.res-input').value, 10) });
            });
            socket.emit('playerAction', { type: 'gmConfirmParty', playerStats });
        };
        document.getElementById('gm-start-battle-btn').onclick = () => {
            const npcConfigs = [];
            document.querySelectorAll('#npc-selection-area .npc-card.selected').forEach(card => {
                npcConfigs.push({ nome: card.dataset.name, img: card.dataset.img, agi: parseInt(card.querySelector('.agi-input').value, 10), res: parseInt(card.querySelector('.res-input').value, 10) });
            });
            if (npcConfigs.length === 0 || npcConfigs.length > 4) {
                alert("Selecione de 1 a 4 NPCs para a batalha."); return;
            }
            socket.emit('playerAction', { type: 'gmStartBattle', npcs: npcConfigs });
        };
    }

    socket.on('roomCreated', (roomId) => {
        currentRoomId = roomId;
        if (isGm) {
            setupGmButtonListeners(); // Atribui os listeners de botões do GM
            const baseUrl = window.location.origin;
            const playerUrl = `${baseUrl}?room=${roomId}&role=player`;
            const spectatorUrl = `${baseUrl}?room=${roomId}&role=spectator`;
            const playerLinkEl = document.getElementById('gm-link-player');
            const spectatorLinkEl = document.getElementById('gm-link-spectator');
            
            playerLinkEl.textContent = playerUrl;
            spectatorLinkEl.textContent = spectatorUrl;
            playerLinkEl.onclick = () => copyToClipboard(playerUrl, playerLinkEl);
            spectatorLinkEl.onclick = () => copyToClipboard(spectatorUrl, spectatorLinkEl);
            
            showScreen(gmInitialLobby);
        }
    });
    
    function copyToClipboard(text, element) {
        if(!element) return;
        navigator.clipboard.writeText(text).then(() => {
            const originalText = element.textContent;
            element.textContent = 'Copiado!';
            setTimeout(() => { element.textContent = originalText; }, 2000);
        });
    }

    function updateGmLobbyUI(state) {
        if (!isGm) return; // Guarda de segurança
        const playerListEl = document.getElementById('gm-lobby-player-list');
        if (!playerListEl) return;

        playerListEl.innerHTML = '';
        const connectedPlayers = Object.values(state.connectedPlayers);
        if (connectedPlayers.length === 0) {
            playerListEl.innerHTML = '<li>Aguardando jogadores...</li>';
        } else {
            connectedPlayers.forEach(p => {
                const charName = p.selectedCharacter ? p.selectedCharacter.nome : '<i>Selecionando...</i>';
                playerListEl.innerHTML += `<li>Jogador Conectado - Personagem: ${charName}</li>`;
            });
        }
    }
    
    // Todas as outras funções da versão ALPHA permanecem sem alterações
    // ...
    // ...
    
    socket.on('assignRole', (data) => {
        myRole = data.role;
        myPlayerKey = data.playerKey || null;
        isGm = data.isGm || myRole === 'gm';
    });

    initialize();
    
    function scaleGame() {
        const gameWrapper = document.getElementById('game-wrapper');
        const scale = Math.min(
            window.innerWidth / 1280,
            window.innerHeight / 720
        );
        gameWrapper.style.transform = `scale(${scale})`;
        gameWrapper.style.left = `${(window.innerWidth - (1280 * scale)) / 2}px`;
        gameWrapper.style.top = `${(window.innerHeight - (720 * scale)) / 2}px`;
    }
    window.addEventListener('resize', scaleGame);
    scaleGame();
});