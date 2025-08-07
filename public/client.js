// client.js

document.addEventListener('DOMContentLoaded', () => {
    let myRole = null;
    let myPlayerKey = null; // Agora será o socket.id do jogador
    let isGm = false;
    let currentGameState = null;
    let currentRoomId = new URLSearchParams(window.location.search).get('room');
    const socket = io();
    
    // --- MODIFICAÇÃO: Variáveis de estado para seleção de alvo
    let isTargeting = false;
    let targetingMove = null;

    let ALL_FIGHTERS_DATA = {};
    let PLAYABLE_CHARACTERS_DATA = [];

    const allScreens = document.querySelectorAll('.screen');
    const gameWrapper = document.getElementById('game-wrapper');

    const passwordScreen = document.getElementById('password-screen');
    const gmInitialLobby = document.getElementById('gm-initial-lobby');
    const playerWaitingScreen = document.getElementById('player-waiting-screen');
    const selectionScreen = document.getElementById('selection-screen');
    const fightScreen = document.getElementById('fight-screen');
    const theaterScreen = document.getElementById('theater-screen'); // Mantido para o modo Teatro

    // --- MODIFICAÇÃO: Novos elementos de UI para o modo aventura
    const gmPartySetupScreen = document.getElementById('gm-party-setup-screen');
    const gmNpcSetupScreen = document.getElementById('gm-npc-setup-screen');
    
    // Elementos da UI
    const charListContainer = document.getElementById('character-list-container');
    const confirmBtn = document.getElementById('confirm-selection-btn');
    const selectionTitle = document.getElementById('selection-title');
    const fightLogContainer = document.getElementById('fight-log-container');
    const roundInfoEl = document.getElementById('round-info');
    const fightLog = document.getElementById('fight-log');
    const actionButtonsWrapper = document.getElementById('action-buttons-wrapper');

    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalText = document.getElementById('modal-text');
    const modalButton = document.getElementById('modal-button');

    const helpBtn = document.getElementById('help-btn');
    const exitGameBtn = document.getElementById('exit-game-btn');


    socket.on('availableFighters', ({ p1, playable }) => {
        ALL_FIGHTERS_DATA = p1 || {};
        PLAYABLE_CHARACTERS_DATA = playable || [];
        if(myRole === 'gm' && theaterScreen.classList.contains('active')){
            // initializeTheaterMode(); // Lógica do modo teatro pode ser mantida aqui
        }
    });

    function showScreen(screenToShow) { allScreens.forEach(screen => { screen.classList.toggle('active', screen.id === screenToShow.id); }); }

    // --- MODIFICAÇÃO: Função para lidar com cliques nos botões de ação (inicia a seleção de alvo)
    function handleActionClick(event) {
        if (!myPlayerKey || !currentGameState || currentGameState.phase !== 'battle') return;
        
        const myFighter = currentGameState.fighters.players[myPlayerKey];
        if (!myFighter || myFighter.id !== currentGameState.activeCharacterKey) {
            return; // Não é a vez deste jogador
        }

        const target = event.target.closest('button'); 
        if (!target || target.disabled) return;
        
        const move = target.dataset.move;
        
        if (move) {
            const moveData = currentGameState.moves[move];
            if (myFighter.pa >= moveData.cost) {
                isTargeting = true;
                targetingMove = move;
                document.getElementById('targeting-indicator').classList.remove('hidden');
                document.querySelectorAll('.npc-container.targetable').forEach(el => el.classList.add('is-targeting'));
            }
        } else if (target.id === 'end-turn-btn') {
            socket.emit('playerAction', { type: 'end_turn', playerKey: myPlayerKey });
        } else if (target.id === 'forfeit-btn') {
             socket.emit('playerAction', { type: 'forfeit', playerKey: myPlayerKey });
        }
    }

    // --- MODIFICAÇÃO: Função para lidar com clique em um alvo NPC
    function handleTargetClick(event) {
        if (!isTargeting || !targetingMove) return;

        const targetContainer = event.target.closest('.npc-container');
        if (!targetContainer || !targetContainer.classList.contains('targetable')) return;

        const targetKey = targetContainer.dataset.key;
        
        socket.emit('playerAction', { 
            type: 'attack', 
            move: targetingMove, 
            playerKey: myPlayerKey,
            targetKey: targetKey 
        });

        cancelTargeting();
    }
    
    // --- MODIFICAÇÃO: Função para cancelar o modo de mira
    function cancelTargeting() {
        isTargeting = false;
        targetingMove = null;
        document.getElementById('targeting-indicator').classList.add('hidden');
        document.querySelectorAll('.npc-container.is-targeting').forEach(el => el.classList.remove('is-targeting'));
    }


    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        currentRoomId = urlParams.get('room');
        const roleFromUrl = urlParams.get('role');

        [exitGameBtn].forEach(btn => btn.classList.add('hidden'));
        
        if (currentRoomId && roleFromUrl) {
            socket.emit('playerJoinsLobby', { roomId: currentRoomId, role: roleFromUrl });
            if (roleFromUrl === 'player') {
                showScreen(selectionScreen);
                selectionTitle.innerText = `Selecione seu Aventureiro`;
                confirmBtn.innerText = 'Confirmar Personagem';
            } else { // spectator
                showScreen(playerWaitingScreen);
                document.getElementById('player-waiting-message').innerText = "Aguardando o GM iniciar o jogo como espectador...";
            }
        } else {
            showScreen(passwordScreen);
            const passInput = document.getElementById('password-input');
            const passBtn = document.getElementById('password-submit-btn');
            passInput.onkeydown = (e) => { if(e.key === 'Enter') passBtn.click(); }
            passBtn.onclick = () => {
                if (passInput.value === 'abif13') {
                    socket.emit('gmCreatesLobby');
                } else {
                    alert('Senha incorreta.');
                }
            };
        }
        
        confirmBtn.addEventListener('click', onConfirmSelection);
        
        // --- MODIFICAÇÃO: Botão de Aventura no lobby do GM
        document.getElementById('start-adventure-btn').onclick = () => {
            socket.emit('playerAction', { type: 'gmStartsAdventure' });
        };
        
        // --- MODIFICAÇÃO: Botões de confirmação para o GM
        document.getElementById('gm-confirm-party-btn').onclick = () => {
            socket.emit('playerAction', { type: 'gmConfirmParty' });
        };
        document.getElementById('gm-start-battle-btn').onclick = () => {
            const npcConfigs = [];
            document.querySelectorAll('#npc-selection-area .npc-card.selected').forEach(card => {
                npcConfigs.push({
                    nome: card.dataset.name,
                    img: card.dataset.img,
                    agi: parseInt(card.dataset.agi, 10) || 1,
                    res: parseInt(card.dataset.res, 10) || 2,
                    specialMoves: ['Smash']
                });
            });

            if (npcConfigs.length === 0 || npcConfigs.length > 4) {
                alert("Selecione de 1 a 4 NPCs para a batalha.");
                return;
            }
            socket.emit('playerAction', { type: 'gmStartBattle', npcs: npcConfigs });
        };

        // Adiciona um listener para cancelar a mira
        document.body.addEventListener('contextmenu', (e) => {
            if (isTargeting) {
                e.preventDefault();
                cancelTargeting();
            }
        });
        document.body.addEventListener('keydown', (e) => {
            if (isTargeting && e.key === "Escape") {
                cancelTargeting();
            }
        });
        
        actionButtonsWrapper.addEventListener('click', handleActionClick);
    }

    function onConfirmSelection() {
        const selectedCard = document.querySelector('.char-card.selected'); if (!selectedCard) { alert('Por favor, selecione um personagem!'); return; }
        
        if (myRole === 'player') {
            const playerData = { nome: selectedCard.dataset.name, img: selectedCard.dataset.img };
            socket.emit('playerAction', { type: 'playerSelectsCharacter', character: playerData });
            showScreen(playerWaitingScreen);
            document.getElementById('player-waiting-message').innerText = "Personagem enviado! Aguardando o Mestre...";
            confirmBtn.disabled = true;
        }
    }

    // --- MODIFICAÇÃO: renderPlayerCharacterSelection usa a lista de jogáveis
    function renderPlayerCharacterSelection(unavailable = []) {
        charListContainer.innerHTML = '';
        confirmBtn.disabled = false;
        
        PLAYABLE_CHARACTERS_DATA.forEach(data => {
            const card = document.createElement('div');
            card.className = 'char-card';
            card.dataset.name = data.name;
            card.dataset.img = data.img;

            card.innerHTML = `<img src="${data.img}" alt="${name}"><div class="char-name">${data.name}</div>`;
            
            if (unavailable.includes(data.name)) {
                card.classList.add('disabled');
                card.innerHTML += `<div class="char-unavailable-overlay">SELECIONADO</div>`;
            } else {
                card.addEventListener('click', () => {
                    if(card.classList.contains('disabled')) return;
                    document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                });
            }
            charListContainer.appendChild(card);
        });
    }

    socket.on('gameUpdate', (gameState) => {
        currentGameState = gameState;
        scaleGame();

        // Esconde telas de setup
        gmPartySetupScreen.classList.add('hidden');
        gmNpcSetupScreen.classList.add('hidden');

        // Lógica de qual tela mostrar
        if (isGm) {
            exitGameBtn.classList.remove('hidden');
            switch (gameState.phase) {
                case 'party_setup':
                    showScreen(gmPartySetupScreen);
                    updateGmPartySetupScreen(gameState);
                    break;
                case 'npc_setup':
                    showScreen(gmNpcSetupScreen);
                    renderNpcSelectionForGm();
                    break;
                case 'battle':
                case 'gameover':
                    showScreen(fightScreen);
                    updateUI(gameState);
                    break;
                default: // lobby, etc
                    showScreen(gmInitialLobby);
                    updateGmLobbyUI(gameState);
                    break;
            }
        } else { // Player ou Spectator
            switch (gameState.mode) {
                case 'lobby':
                    const myPlayerData = gameState.connectedPlayers[socket.id];
                    if (myPlayerData && !myPlayerData.selectedCharacter) {
                        showScreen(selectionScreen);
                        renderPlayerCharacterSelection(gameState.unavailableCharacters);
                    } else {
                        showScreen(playerWaitingScreen);
                        document.getElementById('player-waiting-message').innerText = "Aguardando o Mestre...";
                    }
                    break;
                case 'adventure':
                     if (gameState.phase === 'party_setup' || gameState.phase === 'npc_setup') {
                        showScreen(playerWaitingScreen);
                        document.getElementById('player-waiting-message').innerText = "O Mestre está preparando a aventura...";
                    } else {
                        showScreen(fightScreen);
                        updateUI(gameState);
                    }
                    break;
                // Adicionar lógica de tela para modo teatro aqui se necessário
            }
        }
    });

    socket.on('roomCreated', (roomId) => {
        currentRoomId = roomId;
        if (myRole === 'gm') {
            const baseUrl = window.location.origin;
            const playerUrl = `${baseUrl}?room=${roomId}&role=player`;
            const specUrl = `${baseUrl}?room=${roomId}&role=spectator`;

            const playerLinkEl = document.getElementById('gm-link-player');
            const specLinkEl = document.getElementById('gm-link-spectator');

            playerLinkEl.textContent = playerUrl;
            specLinkEl.textContent = specUrl;
            
            playerLinkEl.onclick = () => copyToClipboard(playerUrl, playerLinkEl);
            specLinkEl.onclick = () => copyToClipboard(specUrl, specLinkEl);

            showScreen(gmInitialLobby);
        }
    });

    function updateGmLobbyUI(state) {
        const playerListEl = document.getElementById('gm-lobby-player-list');
        playerListEl.innerHTML = '';
        const connectedPlayers = Object.values(state.connectedPlayers);
        if(connectedPlayers.length === 0) {
            playerListEl.innerHTML = '<li>Aguardando jogadores...</li>';
        } else {
            connectedPlayers.forEach(p => {
                const charName = p.selectedCharacter ? p.selectedCharacter.nome : '<i>Selecionando...</i>';
                const li = document.createElement('li');
                li.innerHTML = `Jogador Conectado - Personagem: ${charName}`;
                playerListEl.appendChild(li);
            });
        }
    }
    
    // --- MODIFICAÇÃO: Funções de UI para as novas telas do GM
    function updateGmPartySetupScreen(state) {
        const partyList = document.getElementById('gm-party-list');
        partyList.innerHTML = '';
        Object.values(state.fighters.players).forEach(player => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'party-member-card';
            playerDiv.innerHTML = `
                <img src="${player.img}" alt="${player.nome}">
                <h4>${player.nome}</h4>
                <p>AGI: ${player.agi} | RES: ${player.res}</p>
            `;
            partyList.appendChild(playerDiv);
        });
    }

    function renderNpcSelectionForGm() {
        const npcArea = document.getElementById('npc-selection-area');
        npcArea.innerHTML = '';
        const imgPath = 'images/lutadores/';

        Object.keys(ALL_FIGHTERS_DATA).forEach(name => {
            const stats = ALL_FIGHTERS_DATA[name];
            const card = document.createElement('div');
            card.className = 'npc-card';
            card.dataset.name = name;
            card.dataset.img = `${imgPath}${name}.png`;
            card.dataset.agi = stats.agi;
            card.dataset.res = stats.res;
            card.innerHTML = `<img src="${imgPath}${name}.png" alt="${name}"><div class="char-name">${name}</div>`;
            card.addEventListener('click', () => {
                 const selectedCount = document.querySelectorAll('#npc-selection-area .npc-card.selected').length;
                 if (!card.classList.contains('selected') && selectedCount >= 4) {
                     alert("Você pode selecionar no máximo 4 NPCs.");
                     return;
                 }
                card.classList.toggle('selected');
            });
            npcArea.appendChild(card);
        });
    }

    function copyToClipboard(text, element) { navigator.clipboard.writeText(text).then(() => { const originalText = element.textContent || '🔗'; element.textContent = 'Copiado!'; setTimeout(() => { element.textContent = originalText; }, 2000); }); }
    
    // --- MODIFICAÇÃO: updateUI completamente reescrita para o layout 4x4
    function updateUI(state) {
        if (!state || state.mode !== 'adventure') return;

        const playersContainer = document.getElementById('players-container');
        const npcsContainer = document.getElementById('npcs-container');
        playersContainer.innerHTML = '';
        npcsContainer.innerHTML = '';

        // Renderiza Jogadores
        Object.values(state.fighters.players).forEach(fighter => {
            const el = createFighterElement(fighter, 'player', state);
            playersContainer.appendChild(el);
        });

        // Renderiza NPCs
        Object.values(state.fighters.npcs).forEach(fighter => {
            const el = createFighterElement(fighter, 'npc', state);
            npcsContainer.appendChild(el);
            // Adiciona listener para seleção de alvo
            if (el.classList.contains('targetable')) {
                el.addEventListener('click', handleTargetClick);
            }
        });

        // Atualiza log e info do round
        if (state.phase === 'gameover') {
            roundInfoEl.innerHTML = `<span class="turn-highlight">FIM DE JOGO!</span>`;
        } else if (state.activeCharacterKey) {
            const activeFighter = state.fighters.players[state.activeCharacterKey] || state.fighters.npcs[state.activeCharacterKey];
            roundInfoEl.innerHTML = `ROUND ${state.currentRound} - Vez de: <span class="turn-highlight">${activeFighter.nome}</span>`;
        } else {
             roundInfoEl.innerHTML = `ROUND ${state.currentRound}`;
        }

        logBox.innerHTML = state.log.map(msg => `<p class="${msg.className || ''}">${msg.text}</p>`).join('');
        logBox.scrollTop = logBox.scrollHeight;
        
        // Atualiza botões de ação
        const myTurn = myPlayerKey === state.activeCharacterKey;
        const canAct = myTurn && state.phase === 'battle';
        
        actionButtonsWrapper.innerHTML = ''; // Limpa botões antigos

        if (myPlayerKey && state.fighters.players[myPlayerKey] && state.fighters.players[myPlayerKey].status === 'active') {
            const myFighter = state.fighters.players[myPlayerKey];
            let buttonsHtml = '';

            // Botões de golpes básicos
            buttonsHtml += `<button class="action-btn" data-move="Jab" ${!canAct || myFighter.pa < 1 ? 'disabled' : ''}>Jab (1 PA)</button>`;
            buttonsHtml += `<button class="action-btn" data-move="Direto" ${!canAct || myFighter.pa < 2 ? 'disabled' : ''}>Direto (2 PA)</button>`;
            buttonsHtml += `<button class="action-btn" data-move="Upper" ${!canAct || myFighter.pa < 3 ? 'disabled' : ''}>Upper (3 PA)</button>`;
            
            // Botões de golpes especiais
            myFighter.specialMoves.forEach(moveName => {
                const moveData = state.moves[moveName];
                if (moveData) {
                    buttonsHtml += `<button class="action-btn special-btn" data-move="${moveName}" ${!canAct || myFighter.pa < moveData.cost ? 'disabled' : ''}>${moveData.displayName || moveName} (${moveData.cost} PA)</button>`;
                }
            });

            // Botões de utilidade
            buttonsHtml += `<button id="end-turn-btn" class="end-turn-btn" ${!canAct ? 'disabled' : ''}>Passar Turno</button>`;
            buttonsHtml += `<button id="forfeit-btn" ${!canAct ? 'disabled' : ''}>Desistir</button>`;
            
            actionButtonsWrapper.innerHTML = buttonsHtml;
        }
    }

    // --- MODIFICAÇÃO: Nova função para criar o elemento de um lutador
    function createFighterElement(fighter, type, state) {
        const container = document.createElement('div');
        container.className = `${type}-container`;
        container.id = fighter.id;
        container.dataset.key = fighter.id;
        
        let statusClass = '';
        if (fighter.status === 'down') {
            statusClass = 'down';
        } else if (state.activeCharacterKey === fighter.id) {
            statusClass = 'active-turn';
        }

        if (type === 'npc' && fighter.status === 'active') {
            container.classList.add('targetable');
        }

        container.classList.add(statusClass);

        container.innerHTML = `
            <div class="fighter-img-container">
                <img src="${fighter.img}" alt="${fighter.nome}" class="fighter-img">
            </div>
            <div class="fighter-info">
                <h2>${fighter.nome}</h2>
                <div class="stats-bar">
                    <div class="hp-bar-container"><div class="hp-bar" style="width:${(fighter.hp / fighter.hpMax) * 100}%"></div></div>
                    <span class="hp-text">${fighter.hp}/${fighter.hpMax}</span>
                </div>
                <div class="pa-display">
                    <span>PA:</span>
                    <div class="pa-dots-container">${Array(fighter.pa).fill('<div class="pa-dot"></div>').join('')}</div>
                </div>
                 <div class="defense-display">
                    <p class="stat-text">DEF: ${fighter.def}</p>
                </div>
            </div>
        `;
        return container;
    }


    socket.on('assignRole', (data) => {
        myRole = data.role;
        myPlayerKey = data.playerKey || null; // e.g., socket.id
        isGm = data.isGm || myRole === 'gm';
    });

    socket.on('characterUnavailable', (charName) => {
        showGameAlert(`O personagem ${charName} já foi escolhido!`);
        const card = document.querySelector(`.char-card[data-name="${charName}"]`);
        if (card) {
            card.classList.add('disabled');
            card.classList.remove('selected');
            card.innerHTML += `<div class="char-unavailable-overlay">SELECIONADO</div>`;
        }
    });

    socket.on('triggerAttackAnimation', ({ attackerKey }) => { 
        const el = document.getElementById(attackerKey);
        if (el) { el.classList.add(`is-attacking`); setTimeout(() => el.classList.remove(`is-attacking`), 400); }
    });
    socket.on('triggerHitAnimation', ({ defenderKey }) => { 
        const el = document.getElementById(defenderKey);
        if (el) { el.classList.add('is-hit'); setTimeout(() => el.classList.remove('is-hit'), 500); }
    });
    
    socket.on('error', ({message}) => { 
        showInfoModal("Erro", `${message}<br>Recarregue a página para tentar novamente.`); 
        showScreen(passwordScreen); // Volta para a tela inicial em caso de erro grave
    });
    
    function showInfoModal(title, text) {
        modalTitle.innerText = title;
        modalText.innerHTML = text;
        modalButton.onclick = () => modal.classList.add('hidden');
        modal.classList.remove('hidden');
    }

    function showGameAlert(message) {
        const alertOverlay = document.getElementById('game-alert-overlay');
        const alertContent = document.getElementById('game-alert-content');
        if (alertOverlay && alertContent) {
            alertContent.innerHTML = message;
            alertOverlay.classList.remove('hidden');
            setTimeout(() => { alertOverlay.classList.add('hidden'); }, 3000);
        }
    }


    initialize();
    
    const scaleGame = () => {
        const w = document.getElementById('game-wrapper');
        const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
        w.style.transform = `scale(${scale})`;
        const left = (window.innerWidth - (1280 * scale)) / 2;
        const top = (window.innerHeight - (720 * scale)) / 2;
        w.style.left = `${left}px`;
        w.style.top = `${top}px`;
    };
    
    scaleGame();
    window.addEventListener('resize', scaleGame);
});