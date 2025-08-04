document.addEventListener('DOMContentLoaded', () => {
    let myPlayerKey = null; // Será 'gm', 'player', ou 'spectator' no novo fluxo
    let isGm = false;
    let currentGameState = null;
    let currentRoomId = new URLSearchParams(window.location.search).get('room');
    const socket = io();

    // --- MANUTENÇÃO DE VARIÁVEIS ANTIGAS E ADIÇÃO DE NOVAS ---
    let player1SetupData = { scenario: null };
    let availableSpecialMoves = {};
    let AVAILABLE_FIGHTERS_P1 = {};
    let myCharacter = null; // Para o jogador saber qual personagem escolheu

    // --- REFERÊNCIAS A TODOS OS ELEMENTOS DE TELA ---
    const allScreens = document.querySelectorAll('.screen');
    const passwordScreen = document.getElementById('password-screen');
    const gmLobbyScreen = document.getElementById('gm-lobby-screen');
    const playerInitialSelectionScreen = document.getElementById('player-initial-selection-screen');
    const modeSelectionScreen = document.getElementById('mode-selection-screen');
    const scenarioScreen = document.getElementById('scenario-screen');
    const selectionScreen = document.getElementById('selection-screen');
    const fightScreen = document.getElementById('fight-screen');
    const theaterScreen = document.getElementById('theater-screen');
    
    // Elementos da tela de senha
    const passwordInput = document.getElementById('password-input');
    const passwordSubmitBtn = document.getElementById('password-submit-btn');
    const passwordError = document.getElementById('password-error');

    // Elementos do lobby do GM
    const shareLinkUniversal = document.getElementById('share-link-universal');
    const proceedToModeSelectionBtn = document.getElementById('proceed-to-mode-selection-btn');
    const connectedPlayersList = document.getElementById('connected-players-list');
    
    // Elementos da seleção do jogador
    const playerCharListContainer = document.getElementById('player-character-list-container');
    const playerSelectionStatus = document.getElementById('player-selection-status');
    const spectateBtn = document.getElementById('spectate-btn');
    
    // ... (outras referências de elementos existentes) ...
    const confirmBtn = document.getElementById('confirm-selection-btn');
    const charListContainer = document.getElementById('character-list-container');
    const modeClassicBtn = document.getElementById('mode-classic-btn');
    const modeArenaBtn = document.getElementById('mode-arena-btn');
    const modeTheaterBtn = document.getElementById('mode-theater-btn');
    const p1Controls = document.getElementById('p1-controls');
    const p2Controls = document.getElementById('p2-controls');
    
    const CHARACTERS_P2 = { 'Ryu':{agi:2,res:3},'Yobu':{agi:2,res:3},'Nathan':{agi:2,res:3},'Okami':{agi:2,res:3} };

    // --- FUNÇÕES DE NAVEGAÇÃO E INICIALIZAÇÃO ---
    
    function showScreen(screenToShow) {
        allScreens.forEach(screen => {
            screen.classList.toggle('active', screen.id === screenToShow.id);
        });
    }

    function initialize() {
        if (currentRoomId) {
            // Se tem um 'room' na URL, é um jogador ou espectador entrando.
            socket.emit('joinLobby', { roomId: currentRoomId });
            showScreen(playerInitialSelectionScreen);
            renderPlayerCharacterSelection();
        } else {
            // Se não tem 'room', é o GM. Mostra a tela de senha.
            showScreen(passwordScreen);
        }
        
        passwordSubmitBtn.addEventListener('click', () => {
            const password = passwordInput.value;
            socket.emit('createLobby', { password });
        });

        proceedToModeSelectionBtn.addEventListener('click', () => {
            showScreen(modeSelectionScreen);
        });

        spectateBtn.addEventListener('click', () => {
            socket.emit('enterAsSpectator');
            playerSelectionStatus.textContent = "Você entrou como espectador. Aguardando o início do jogo...";
            // Desabilita os botões para evitar mais ações
            playerCharListContainer.querySelectorAll('.char-card').forEach(card => card.style.pointerEvents = 'none');
            spectateBtn.disabled = true;
        });

        modeClassicBtn.onclick = () => {
            // Lógica para iniciar o modo clássico
            // Primeiro, o GM escolhe seu personagem
            showScreen(selectionScreen);
            // ... (lógica para selecionar oponente virá depois)
        };

        // ... (outros listeners de botões)
    }

    // --- NOVO FLUXO DE SOCKETS ---
    
    socket.on('passwordIncorrect', () => {
        passwordError.classList.remove('hidden');
    });

    socket.on('lobbyCreated', ({ roomId }) => {
        currentRoomId = roomId;
        const url = `${window.location.origin}?room=${roomId}`;
        history.pushState({}, '', `?room=${roomId}`); // Atualiza a URL sem recarregar
        
        shareLinkUniversal.textContent = url;
        shareLinkUniversal.onclick = () => copyToClipboard(url, shareLinkUniversal);
        
        showScreen(gmLobbyScreen);
    });

    socket.on('assignRole', ({ role }) => {
        myPlayerKey = role;
        isGm = (role === 'gm');
    });

    socket.on('updateLobbyPlayers', (players) => {
        if (!isGm) return;
        connectedPlayersList.innerHTML = '';
        if (Object.keys(players).length <= 1) {
            connectedPlayersList.innerHTML = '<p>Aguardando jogadores...</p>';
            return;
        }
        for (const id in players) {
            const player = players[id];
            if (player.role === 'gm') continue;

            const playerDiv = document.createElement('div');
            playerDiv.className = 'player-lobby-item';
            
            if (player.role === 'spectator') {
                playerDiv.classList.add('spectator');
                playerDiv.textContent = `Espectador #${id.substring(0,4)}`;
            } else if (player.character) {
                playerDiv.innerHTML = `<b>${player.character.name}</b> (Jogador)`;
            } else {
                playerDiv.textContent = `Jogador #${id.substring(0,4)} (Escolhendo...)`;
            }
            connectedPlayersList.appendChild(playerDiv);
        }
    });

    socket.on('lobbyJoined', ({ selectedCharacters }) => {
        updatePlayerCharacterList(selectedCharacters);
    });

    socket.on('updateSelectedCharacters', (selectedCharacters) => {
        if (myPlayerKey === 'player') {
            updatePlayerCharacterList(selectedCharacters);
        }
    });

    socket.on('characterTaken', (characterName) => {
        alert(`Personagem ${characterName} já foi selecionado!`);
    });

    socket.on('characterConfirmed', (character) => {
        myCharacter = character;
        playerSelectionStatus.textContent = `Você selecionou ${character.name}! Aguarde o GM iniciar o jogo.`;
        // Desabilita os botões para evitar mais ações
        playerCharListContainer.querySelectorAll('.char-card').forEach(card => card.style.pointerEvents = 'none');
        spectateBtn.style.display = 'none'; // Esconde o botão de espectador
    });


    // --- FUNÇÕES DE RENDERIZAÇÃO ATUALIZADAS ---
    
    function renderPlayerCharacterSelection() {
        playerCharListContainer.innerHTML = '';
        for (const name in CHARACTERS_P2) {
            const stats = CHARACTERS_P2[name];
            const card = document.createElement('div');
            card.className = 'char-card';
            card.dataset.name = name;
            card.innerHTML = `<img src="images/${name}.png" alt="${name}"><div class="char-name">${name}</div>`;
            
            card.addEventListener('click', () => {
                if (card.classList.contains('taken') || myCharacter) return;
                socket.emit('selectPlayerCharacter', {
                    characterName: name,
                    characterImg: `images/${name}.png`
                });
            });
            playerCharListContainer.appendChild(card);
        }
    }

    function updatePlayerCharacterList(selectedCharacters) {
        playerCharListContainer.querySelectorAll('.char-card').forEach(card => {
            if (selectedCharacters.includes(card.dataset.name)) {
                card.classList.add('taken');
            } else {
                card.classList.remove('taken');
            }
        });

        // Se todos os personagens foram escolhidos e o jogador atual não escolheu nenhum
        if (selectedCharacters.length >= Object.keys(CHARACTERS_P2).length && !myCharacter) {
            playerSelectionStatus.textContent = "Todos os personagens foram selecionados. Você só pode entrar como espectador.";
        }
    }

    function showOpponentSelectionModal(players, mode) {
        const availablePlayers = Object.values(players).filter(p => p.role === 'player' && p.character);

        if (availablePlayers.length === 0) {
            alert("Nenhum jogador selecionou um personagem ainda!");
            return;
        }

        let modalHtml = '<h3>Selecione o Oponente:</h3><div class="opponent-selection-container">';
        availablePlayers.forEach(player => {
            modalHtml += `
                <div class="char-card opponent-option" data-player-id="${player.id}">
                    <img src="${player.character.img}" alt="${player.character.name}">
                    <div class="char-name">${player.character.name}</div>
                </div>
            `;
        });
        modalHtml += '</div>';

        // Usando a função de modal existente
        showInfoModal("Selecionar Jogador 2", modalHtml);

        document.querySelectorAll('.opponent-option').forEach(card => {
            card.addEventListener('click', () => {
                const playerId = card.dataset.playerId;
                const opponentData = players[playerId];
                
                // Fechar o modal
                document.getElementById('modal').classList.add('hidden');
                
                // Iniciar a configuração do oponente
                if (mode === 'classic') {
                    // O GM agora configura os stats do oponente escolhido
                    // (Esta parte vai precisar ser integrada com a lógica de `set_p2_stats`)
                    console.log(`GM escolheu ${opponentData.character.name} (ID: ${playerId}) para o modo Clássico.`);
                    // AQUI VAI A LÓGICA PARA CONFIGURAR O P2 E INICIAR A LUTA
                } else if (mode === 'arena') {
                     // AQUI VAI A LÓGICA PARA ESCOLHER P1 E P2 E INICIAR A LUTA
                }
            });
        });
    }


    // --- FUNÇÕES ANTIGAS E DE COMBATE ---
    // (Omitidas para brevidade, mas devem ser mantidas no seu arquivo)
    // ... updateUI, showInfoModal, showCheatsModal, etc.
    
    initialize();
});