document.addEventListener('DOMContentLoaded', () => {
    let myRole = null;
    let myPlayerKey = null; // Agora representa o socket.id do jogador
    let isGm = false;
    let currentGameState = null;
    let currentRoomId = new URLSearchParams(window.location.search).get('room');
    const socket = io();

    let selectedTargetId = null;

    const fightScreen = document.getElementById('fight-screen');
    const actionButtonsWrapper = document.getElementById('action-buttons-wrapper');
    const p1Controls = document.getElementById('p1-controls');
    let modal = document.getElementById('modal');
    let modalTitle = document.getElementById('modal-title');
    let modalText = document.getElementById('modal-text');
    let modalButton = document.getElementById('modal-button');
    
    const PLAYABLE_CHARACTERS = { 'Ryu':{img:'images/Ryu.png'},'Yobu':{img:'images/Yobu.png'},'Nathan':{img:'images/Nathan.png'},'Okami':{img:'images/Okami.png'} };

    // --- LÓGICA DE SOCKETS E INICIALIZAÇÃO ---

    socket.on('connect', () => {
        myPlayerKey = socket.id;
        
        const urlParams = new URLSearchParams(window.location.search);
        const roomIdFromUrl = urlParams.get('room');
        const roleFromUrl = urlParams.get('role');

        if (roomIdFromUrl && roleFromUrl) {
            currentRoomId = roomIdFromUrl;
            socket.emit('playerJoinsLobby', { roomId: currentRoomId, role: roleFromUrl });
            if (roleFromUrl === 'player') {
                showScreen('selection-screen');
                document.getElementById('selection-title').innerText = `Selecione seu Herói`;
            } else {
                showScreen('player-waiting-screen');
            }
        } else {
            showScreen('gm-initial-lobby');
            socket.emit('gmCreatesLobby');
        }
    });

    socket.on('assignRole', (data) => {
        myRole = data.role;
        isGm = data.isGm || myRole === 'gm';
    });

    socket.on('gameUpdate', (gameState) => {
        modal.classList.add('hidden');
        currentGameState = gameState;
        scaleGame();

        if (gameState.mode === 'lobby') {
            if (isGm) {
                showScreen('gm-initial-lobby');
                updateGmLobbyUI(gameState);
            } else {
                const myPlayerData = gameState.connectedPlayers[myPlayerKey];
                if (myPlayerData && !myPlayerData.selectedCharacter) {
                    showScreen('selection-screen');
                    renderPlayerCharacterSelection(gameState.unavailableCharacters);
                } else {
                    showScreen('player-waiting-screen');
                }
            }
        } else if (gameState.mode === 'classic_rpg') {
            showScreen('fight-screen');
            updateUI(gameState);
        }
    });

    socket.on('roomCreated', (roomId) => {
        currentRoomId = roomId;
        const baseUrl = window.location.origin;
        const playerUrl = `${baseUrl}?room=${roomId}&role=player`;
        const specUrl = `${baseUrl}?room=${roomId}&role=spectator`;

        const newUrl = `${window.location.pathname}?room=${roomId}`;
        window.history.replaceState({ path: newUrl }, '', newUrl);

        const playerLinkEl = document.getElementById('gm-link-player');
        const specLinkEl = document.getElementById('gm-link-spectator');

        playerLinkEl.textContent = playerUrl;
        specLinkEl.textContent = specUrl;
        
        playerLinkEl.onclick = () => copyToClipboard(playerUrl, playerLinkEl);
        specLinkEl.onclick = () => copyToClipboard(specUrl, specLinkEl);
    });
    
    // O evento 'availableFighters' foi removido para evitar a condição de corrida.

    // --- FUNÇÕES DE SETUP E UI ---

    function onConfirmSelection() {
        const selectedCard = document.querySelector('.char-card.selected');
        if (!selectedCard) { alert('Por favor, selecione um personagem!'); return; }
        
        const playerData = { nome: selectedCard.dataset.name, img: selectedCard.dataset.img };
        socket.emit('playerAction', { type: 'playerSelectsCharacter', character: playerData });
        
        showScreen('player-waiting-screen');
        document.getElementById('player-waiting-message').innerText = "Personagem enviado! Aguardando o Mestre...";
    }

    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.toggle('active', screen.id === screenId);
        });
    }

    function updateGmLobbyUI(state) {
        const playerListEl = document.getElementById('gm-lobby-player-list');
        const startBattleBtn = document.getElementById('start-classic-btn');
        startBattleBtn.innerText = "Iniciar Batalha (Medieval)";
        startBattleBtn.onclick = () => showGmBattleSetupModal(state);
        
        playerListEl.innerHTML = '';
        const connectedPlayers = Object.values(state.connectedPlayers);
        if (connectedPlayers.length === 0) {
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

    function renderPlayerCharacterSelection(unavailable = []) {
        const charListContainer = document.getElementById('character-list-container');
        charListContainer.innerHTML = '';
        Object.entries(PLAYABLE_CHARACTERS).forEach(([name, data]) => {
            const card = document.createElement('div');
            card.className = 'char-card';
            card.dataset.name = name;
            card.dataset.img = data.img;
            card.innerHTML = `<img src="${data.img}" alt="${name}"><div class="char-name">${name}</div>`;
            
            if (unavailable.includes(name)) {
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

    function showGmBattleSetupModal(lobbyState) {
        let selectedEnemies = [];
    
        const playerSelectionHtml = Object.values(lobbyState.connectedPlayers)
            .filter(p => p.selectedCharacter)
            .map(p => `
                <label>
                    <input type="checkbox" class="player-checkbox" value="${p.id}" checked>
                    ${p.selectedCharacter.nome}
                </label>
            `).join('<br>');
    
        // <<< CORREÇÃO: Lê a lista de inimigos diretamente do estado do lobby
        const enemyListHtml = Object.keys(lobbyState.availableEnemies).map(name => `
            <button class="enemy-add-btn" data-name="${name}">${name}</button>
        `).join('');
    
        const modalHtml = `
            <div class="battle-setup-container">
                <div class="setup-column">
                    <h4>Jogadores na Batalha</h4>
                    <div class="player-selection-list">${playerSelectionHtml || 'Nenhum jogador pronto.'}</div>
                </div>
                <div class="setup-column">
                    <h4>Adicionar Inimigos</h4>
                    <div class="enemy-selection-list">${enemyListHtml}</div>
                </div>
                <div class="setup-column">
                    <h4>Inimigos na Batalha (Máx: 8)</h4>
                    <ul id="staged-enemies-list"></ul>
                </div>
            </div>`;
        
        showInteractiveModal("Configurar Batalha", modalHtml, "Iniciar Batalha", null);
    
        const stagedList = document.getElementById('staged-enemies-list');
    
        document.querySelectorAll('.enemy-add-btn').forEach(btn => {
            btn.onclick = () => {
                if (selectedEnemies.length >= 8) {
                    alert("Você pode adicionar no máximo 8 inimigos.");
                    return;
                }
                const enemyName = btn.dataset.name;
                selectedEnemies.push(enemyName);
                const li = document.createElement('li');
                li.textContent = enemyName;
                li.onclick = () => {
                    selectedEnemies.splice(selectedEnemies.indexOf(enemyName), 1);
                    li.remove();
                };
                stagedList.appendChild(li);
            };
        });
    
        modalButton.onclick = () => {
            const selectedPlayers = Array.from(document.querySelectorAll('.player-checkbox:checked')).map(cb => cb.value);
            if (selectedPlayers.length === 0 || selectedEnemies.length === 0) {
                alert('Selecione pelo menos um jogador e um inimigo.');
                return;
            }
            socket.emit('playerAction', {
                type: 'gm_start_battle',
                selectedPlayers: selectedPlayers,
                selectedEnemies: selectedEnemies
            });
            modal.classList.add('hidden');
        };
    }
    
    function updateUI(state) {
        renderCombatants(state);
        updateActionButtons(state);

        const logBox = document.getElementById('fight-log');
        logBox.innerHTML = state.log.map(msg => `<p class="${msg.className || ''}">${msg.text}</p>`).join('');
        logBox.scrollTop = logBox.scrollHeight;
        
        if (state.phase === 'gameover') {
            showInfoModal("Fim da Batalha!", `${state.reason}<br><br><strong>VITÓRIA DOS ${state.winner.toUpperCase()}!</strong>`);
        }
    }

    function renderCombatants(state) {
        const partyContainer = document.getElementById('party-container');
        const enemiesContainer = document.getElementById('enemies-container');
        partyContainer.innerHTML = '';
        enemiesContainer.innerHTML = '';

        Object.values(state.combatants.party).forEach(p => {
            partyContainer.appendChild(createCombatantCard(p, state));
        });

        Object.values(state.combatants.enemies).forEach(e => {
            const card = createCombatantCard(e, state);
            if (e.hp > 0) {
                card.addEventListener('click', () => selectTarget(card, e.id));
            }
            enemiesContainer.appendChild(card);
        });
        
        if (state.whoseTurn) {
            document.querySelector(`.combatant-card[data-id="${state.whoseTurn}"]`)?.classList.add('active-turn');
        }
        if (selectedTargetId) {
             document.querySelector(`.combatant-card[data-id="${selectedTargetId}"]`)?.classList.add('selected-target');
        }
    }

    function createCombatantCard(c, state) {
        const card = document.createElement('div');
        card.className = `combatant-card ${c.isPlayer ? 'party-member' : 'enemy'}`;
        card.dataset.id = c.id;

        if (c.hp <= 0) {
            card.classList.add('defeated');
        }

        const hpPercentage = (c.hp / c.hpMax) * 100;
        const paDots = Array(c.pa).fill('<div class="pa-dot"></div>').join('');

        let initiativeButton = '';
        if (state.phase === 'initiative_roll' && state.initiativeRolls[c.id] === undefined) {
            if (c.isPlayer && c.id === myPlayerKey) {
                initiativeButton = `<button class="roll-init-btn">Rolar Iniciativa</button>`;
            }
        }
        
        card.innerHTML = `
            <img src="${c.img}" class="fighter-img" />
            <div class="combatant-info">
                <h3 class="combatant-name">${c.nome}</h3>
                <div class="stats-bar">
                    <div class="hp-bar-container"><div class="hp-bar" style="width: ${hpPercentage}%"></div></div>
                    <span class="hp-text">${c.hp} / ${c.hpMax}</span>
                </div>
                ${c.isPlayer ? `<div class="pa-display"><span>PA:</span><div class="pa-dots-container">${paDots}</div></div>` : ''}
                <div class="initiative-roll-area">${initiativeButton}</div>
            </div>
        `;
        
        if(initiativeButton) {
            card.querySelector('.roll-init-btn').onclick = () => {
                socket.emit('playerAction', { type: 'roll_initiative', combatantId: c.id });
            };
        }
        return card;
    }

    function selectTarget(cardElement, targetId) {
        if (!cardElement) {
            selectedTargetId = null;
        } else {
            const targetData = currentGameState.combatants.enemies[targetId];
            if (targetData && targetData.hp > 0) {
                selectedTargetId = targetId;
            } else {
                selectedTargetId = null;
            }
        }
        
        document.querySelectorAll('.selected-target').forEach(el => el.classList.remove('selected-target'));
        if (selectedTargetId) {
            document.querySelector(`.combatant-card[data-id="${selectedTargetId}"]`).classList.add('selected-target');
        }
        updateActionButtons(currentGameState);
    }

    function updateActionButtons(state) {
        const isMyTurn = state.whoseTurn === myPlayerKey;
        actionButtonsWrapper.classList.toggle('hidden', !isMyTurn || state.phase !== 'turn');
        
        if (!isMyTurn) return;

        const me = state.combatants.party[myPlayerKey];
        p1Controls.querySelectorAll('.action-btn').forEach(btn => {
            const moveName = btn.dataset.move;
            const move = ALL_MOVES[moveName];
            if (move) {
                let disabled = true;
                if (me.pa >= move.cost) {
                    if (move.self || selectedTargetId) {
                        disabled = false;
                    }
                }
                btn.disabled = disabled;
            }
        });
    }

    function handlePlayerControlClick(event) {
        const target = event.target.closest('button');
        if (!target || target.disabled) return;

        const moveName = target.dataset.move;
        const isEndTurn = target.id === 'p1-end-turn-btn'; 
        
        if(isEndTurn) {
             socket.emit('playerAction', { type: 'end_turn' });
        } else if (moveName) {
            if (!selectedTargetId) {
                alert("Você precisa selecionar um alvo!");
                return;
            }
            socket.emit('playerAction', {
                type: 'attack',
                move: moveName,
                attackerId: myPlayerKey,
                targetId: selectedTargetId
            });
            selectTarget(null, null);
        }
    }
    
    function showInfoModal(title, text) {
        modalTitle.innerText = title;
        modalText.innerHTML = text;
        const newButton = modalButton.cloneNode(true);
        modalButton.parentNode.replaceChild(newButton, modalButton);
        modalButton = newButton;
        modalButton.style.display = 'inline-block';
        modalButton.innerText = 'OK';
        modalButton.onclick = () => modal.classList.add('hidden');
        modal.classList.remove('hidden');
    }

    function showInteractiveModal(title, text, btnText, action) {
        modalTitle.innerText = title;
        modalText.innerHTML = text;
        const newButton = modalButton.cloneNode(true);
        modalButton.parentNode.replaceChild(newButton, modalButton);
        modalButton = newButton;
        modalButton.innerText = btnText;
        modalButton.style.display = 'inline-block';
        modalButton.onclick = action;
        modal.classList.remove('hidden');
    }

    function copyToClipboard(text, element) {
        navigator.clipboard.writeText(text).then(() => {
            const originalText = element.textContent;
            element.textContent = 'Copiado!';
            setTimeout(() => { element.textContent = originalText; }, 2000);
        });
    }

    const scaleGame = () => {
        const w = document.getElementById('game-wrapper');
        const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
        w.style.transform = `scale(${scale})`;
        const left = (window.innerWidth - (1280 * scale)) / 2;
        const top = (window.innerHeight - (720 * scale)) / 2;
        w.style.left = `${left}px`;
        w.style.top = `${top}px`;
    };
    
    document.getElementById('confirm-selection-btn').addEventListener('click', onConfirmSelection);
    p1Controls.addEventListener('click', handlePlayerControlClick);
    window.addEventListener('resize', scaleGame);
    
    // A chamada para initialize() foi removida daqui para dentro do evento 'connect'
});