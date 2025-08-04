document.addEventListener('DOMContentLoaded', () => {
    // --- Variáveis de Estado Global ---
    let myRole = null; // 'gm', 'player', ou 'spectator'
    let isGm = false;
    let currentGameState = null;
    let currentRoomId = new URLSearchParams(window.location.search).get('room');
    const socket = io();

    let player1SetupData = { scenario: null };
    let availableSpecialMoves = {};
    let AVAILABLE_FIGHTERS_P1 = {};
    let myCharacter = null; 

    // --- Referências de Elementos HTML ---
    const allScreens = document.querySelectorAll('.screen');
    const passwordScreen = document.getElementById('password-screen');
    const gmLobbyScreen = document.getElementById('gm-lobby-screen');
    const playerInitialSelectionScreen = document.getElementById('player-initial-selection-screen');
    const modeSelectionScreen = document.getElementById('mode-selection-screen');
    const scenarioScreen = document.getElementById('scenario-screen');
    const selectionScreen = document.getElementById('selection-screen'); // Reutilizada para o GM
    const fightScreen = document.getElementById('fight-screen');
    const theaterScreen = document.getElementById('theater-screen');
    
    // Elementos da Tela de Senha
    const passwordInput = document.getElementById('password-input');
    const passwordSubmitBtn = document.getElementById('password-submit-btn');
    const passwordError = document.getElementById('password-error');

    // Elementos do Lobby do GM
    const shareLinkUniversal = document.getElementById('share-link-universal');
    const proceedToModeSelectionBtn = document.getElementById('proceed-to-mode-selection-btn');
    const connectedPlayersList = document.getElementById('connected-players-list');
    
    // Elementos da Seleção do Jogador
    const playerCharListContainer = document.getElementById('player-character-list-container');
    const playerSelectionStatus = document.getElementById('player-selection-status');
    const spectateBtn = document.getElementById('spectate-btn');
    
    // Outros Elementos
    const confirmBtn = document.getElementById('confirm-selection-btn');
    const charListContainer = document.getElementById('character-list-container');
    const modeClassicBtn = document.getElementById('mode-classic-btn');
    const modeArenaBtn = document.getElementById('mode-arena-btn');
    const modeTheaterBtn = document.getElementById('mode-theater-btn');
    const copySpectatorLinkInGameBtn = document.getElementById('copy-spectator-link-ingame');
    const copyTheaterSpectatorLinkBtn = document.getElementById('copy-theater-spectator-link');
    
    const CHARACTERS_P2 = { 'Ryu':{agi:2,res:3},'Yobu':{agi:2,res:3},'Nathan':{agi:2,res:3},'Okami':{agi:2,res:3} };
    const DYNAMIC_CHARACTERS = [];
    for (let i = 1; i <= 50; i++) { DYNAMIC_CHARACTERS.push({ name: `Personagem (${i})`, img: `images/personagens/Personagem (${i}).png` }); }
    const THEATER_SCENARIOS = {
        "cenarios externos": { baseName: "externo", count: 50 }, "cenarios internos": { baseName: "interno", count: 50 },
        "cenas": { baseName: "cena", count: 50 }, "fichas": { baseName: "ficha", count: 50 },
        "objetos": { baseName: "objeto", count: 50 }, "outros": { baseName: "outro", count: 50 }
    };

    // --- LÓGICA DE INICIALIZAÇÃO E FLUXO PRINCIPAL ---

    function showScreen(screenToShow) {
        allScreens.forEach(screen => screen.classList.toggle('active', screen.id === screenToShow.id));
    }

    function initialize() {
        if (currentRoomId) {
            socket.emit('joinLobby', { roomId: currentRoomId });
        } else {
            showScreen(passwordScreen);
        }
        
        // --- LISTENERS DE EVENTOS DE UI ---
        passwordSubmitBtn.addEventListener('click', () => {
            passwordError.classList.add('hidden');
            socket.emit('createLobby', { password: passwordInput.value });
        });

        proceedToModeSelectionBtn.addEventListener('click', () => showScreen(modeSelectionScreen));
        spectateBtn.addEventListener('click', handleSpectateClick);

        modeClassicBtn.onclick = () => {
            showScreen(selectionScreen);
            selectionTitle.innerText = 'GM (P1): Selecione seu Lutador';
            confirmBtn.innerText = 'Selecionar Oponente';
            renderCharacterSelection('p1', true);
            confirmBtn.onclick = handleGmClassicSelection; // Reatribui o clique do botão
        };

        modeArenaBtn.onclick = () => {
            socket.emit('playerAction', { type: 'gm_select_mode', mode: 'arena' });
        };
        
        modeTheaterBtn.onclick = () => {
            socket.emit('playerAction', { type: 'gm_select_mode', mode: 'theater', scenario: 'mapas/cenarios externos/externo (1).png' });
        };

        const universalLinkHandler = () => {
            if (currentRoomId) {
                const url = `${window.location.origin}?room=${currentRoomId}`;
                copyToClipboard(url, copySpectatorLinkInGameBtn);
            }
        };
        copySpectatorLinkInGameBtn.onclick = universalLinkHandler;
        copyTheaterSpectatorLinkBtn.onclick = universalLinkHandler;

        setupTheaterEventListeners();
        initializeGlobalKeyListeners();
    }

    function handleGmClassicSelection() {
        const selectedCard = document.querySelector('#selection-screen .char-card.selected');
        if (!selectedCard) {
            alert('Por favor, selecione seu lutador!');
            return;
        }
        player1SetupData = {
            nome: selectedCard.dataset.name,
            img: selectedCard.dataset.img,
            agi: selectedCard.querySelector('.agi-input').value,
            res: selectedCard.querySelector('.res-input').value
        };
        socket.emit('requestLobbyPlayersForMatch');
    }

    function handleSpectateClick() {
        socket.emit('enterAsSpectator');
        playerSelectionStatus.textContent = "Você entrou como espectador. Aguardando o início do jogo...";
        playerCharListContainer.querySelectorAll('.char-card').forEach(card => card.style.pointerEvents = 'none');
        spectateBtn.disabled = true;
    }

    // --- SOCKET EVENT HANDLERS ---

    socket.on('passwordIncorrect', () => passwordError.classList.remove('hidden'));

    socket.on('lobbyCreated', ({ roomId }) => {
        currentRoomId = roomId;
        const url = `${window.location.origin}?room=${roomId}`;
        history.pushState({}, '', `?room=${roomId}`);
        
        shareLinkUniversal.textContent = url;
        shareLinkUniversal.onclick = () => copyToClipboard(url, shareLinkUniversal);
        
        showScreen(gmLobbyScreen);
    });

    socket.on('assignRole', ({ role }) => {
        myRole = role;
        isGm = (role === 'gm');
        if(role === 'player' || role === 'spectator') {
            showScreen(playerInitialSelectionScreen);
            renderPlayerCharacterSelection();
        }
    });

    socket.on('updateLobbyPlayers', (players) => {
        if (!isGm) return;
        connectedPlayersList.innerHTML = '';
        const playerEntries = Object.values(players);
        if (playerEntries.length <= 1) {
            connectedPlayersList.innerHTML = '<p>Aguardando jogadores...</p>';
            return;
        }
        playerEntries.forEach(player => {
            if (player.role === 'gm') return;
            const playerDiv = document.createElement('div');
            playerDiv.className = 'player-lobby-item';
            if (player.role === 'spectator') {
                playerDiv.classList.add('spectator');
                playerDiv.textContent = `Espectador #${player.id.substring(0, 4)}`;
            } else if (player.character) {
                playerDiv.innerHTML = `<b>${player.character.name}</b> (Jogador #${player.id.substring(0, 4)})`;
            } else {
                playerDiv.textContent = `Jogador #${player.id.substring(0, 4)} (Escolhendo...)`;
            }
            connectedPlayersList.appendChild(playerDiv);
        });
    });

    socket.on('lobbyJoined', ({ selectedCharacters }) => {
        updatePlayerCharacterList(selectedCharacters);
    });

    socket.on('updateSelectedCharacters', (selectedCharacters) => {
        if (myRole === 'player') {
            updatePlayerCharacterList(selectedCharacters);
        }
    });
    
    socket.on('characterTaken', (characterName) => alert(`Personagem ${characterName} já foi selecionado!`));

    socket.on('characterConfirmed', (character) => {
        myCharacter = character;
        playerSelectionStatus.textContent = `Você selecionou ${character.name}! Aguarde o GM iniciar o jogo.`;
        playerCharListContainer.querySelectorAll('.char-card').forEach(card => card.style.pointerEvents = 'none');
        spectateBtn.style.display = 'none';
    });

    socket.on('showOpponentSelection', ({ players, mode }) => {
        const availablePlayers = Object.values(players).filter(p => p.role === 'player' && p.character);
        if (availablePlayers.length === 0) {
            alert("Nenhum jogador selecionou um personagem para a partida!");
            showScreen(selectionScreen); // Volta para a tela de seleção do GM
            return;
        }

        let modalHtml = `<h3>Selecione o Oponente:</h3><div class="opponent-selection-container">`;
        availablePlayers.forEach(player => {
            modalHtml += `
                <div class="char-card opponent-option" data-player-id="${player.id}">
                    <img src="${player.character.img}" alt="${player.character.name}">
                    <div class="char-name">${player.character.name}</div>
                </div>`;
        });
        modalHtml += '</div>';

        showInfoModal(`Selecionar Jogador 2 para ${mode === 'classic' ? 'Modo Clássico' : 'Modo Arena'}`, modalHtml);

        document.querySelectorAll('.opponent-option').forEach(card => {
            card.addEventListener('click', () => {
                const opponentId = card.dataset.playerId;
                document.getElementById('modal').classList.add('hidden');
                socket.emit('playerAction', {
                    type: 'gm_start_classic_game',
                    player1Data: player1SetupData,
                    opponentId: opponentId
                });
            });
        });
    });

    // ... (socket.on('gameUpdate') e outras funções de UI/jogo permanecem aqui) ...
    
    // --- FUNÇÕES DE RENDERIZAÇÃO ---
    function renderPlayerCharacterSelection() {
        playerCharListContainer.innerHTML = '';
        Object.keys(CHARACTERS_P2).forEach(name => {
            const card = document.createElement('div');
            card.className = 'char-card';
            card.dataset.name = name;
            card.innerHTML = `<img src="images/${name}.png" alt="${name}"><div class="char-name">${name}</div>`;
            card.addEventListener('click', () => {
                if (card.classList.contains('taken') || myCharacter) return;
                socket.emit('selectPlayerCharacter', { characterName: name, characterImg: `images/${name}.png` });
            });
            playerCharListContainer.appendChild(card);
        });
    }

    function updatePlayerCharacterList(selectedCharacters) {
        playerCharListContainer.querySelectorAll('.char-card').forEach(card => {
            const isTaken = selectedCharacters.includes(card.dataset.name);
            card.classList.toggle('taken', isTaken);
        });
        if (selectedCharacters.length >= Object.keys(CHARACTERS_P2).length && !myCharacter) {
            playerSelectionStatus.textContent = "Todos os personagens foram selecionados. Você só pode entrar como espectador.";
        }
    }
    
    // As funções restantes (showHelpModal, renderSpecialMoveSelection, etc.) permanecem as mesmas.
    // Omitidas para brevidade. Cole-as aqui.

    initialize();
});