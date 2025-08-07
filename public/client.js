// client.js

document.addEventListener('DOMContentLoaded', () => {
    let myRole = null;
    let myPlayerKey = null;
    let isGm = false;
    let currentGameState = null;
    let currentRoomId = new URLSearchParams(window.location.search).get('room');
    const socket = io();

    let isTargeting = false;

    let ALL_FIGHTERS_DATA = {};
    let PLAYABLE_CHARACTERS_DATA = [];

    const allScreens = document.querySelectorAll('.screen');
    const gameWrapper = document.getElementById('game-wrapper');

    // --- MODIFICAÇÃO: Removida a tela de senha, gmInitialLobby é a tela inicial do GM
    const gmInitialLobby = document.getElementById('gm-initial-lobby');
    const playerWaitingScreen = document.getElementById('player-waiting-screen');
    const selectionScreen = document.getElementById('selection-screen');
    const fightScreen = document.getElementById('fight-screen');
    const gmPartySetupScreen = document.getElementById('gm-party-setup-screen');
    const gmNpcSetupScreen = document.getElementById('gm-npc-setup-screen');
    
    const charListContainer = document.getElementById('character-list-container');
    const confirmBtn = document.getElementById('confirm-selection-btn');
    const selectionTitle = document.getElementById('selection-title');
    const roundInfoEl = document.getElementById('round-info');
    const fightLog = document.getElementById('fight-log');
    const actionButtonsWrapper = document.getElementById('action-buttons-wrapper');

    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalText = document.getElementById('modal-text');
    const modalButton = document.getElementById('modal-button');
    const exitGameBtn = document.getElementById('exit-game-btn');


    socket.on('availableFighters', ({ p1, playable }) => {
        ALL_FIGHTERS_DATA = p1 || {};
        PLAYABLE_CHARACTERS_DATA = playable || [];
    });

    function showScreen(screenToShow) { allScreens.forEach(screen => { screen.classList.toggle('active', screen.id === screenToShow.id); }); }

    function handleActionClick(event) {
        if (!myPlayerKey || !currentGameState || currentGameState.phase !== 'battle') return;
        
        const myFighter = currentGameState.fighters.players[myPlayerKey];
        if (!myFighter || myFighter.id !== currentGameState.activeCharacterKey) return;

        const target = event.target.closest('button'); 
        if (!target || target.disabled) return;
        
        const action = target.dataset.action;
        
        if (action === 'attack') {
            isTargeting = true;
            document.getElementById('targeting-indicator').classList.remove('hidden');
            document.querySelectorAll('.npc-container.targetable').forEach(el => el.classList.add('is-targeting'));
        } else if (action === 'end_turn') {
            socket.emit('playerAction', { type: 'end_turn' });
        }
    }

    function handleTargetClick(event) {
        if (!isTargeting) return;
        const targetContainer = event.target.closest('.npc-container');
        if (!targetContainer || !targetContainer.classList.contains('targetable')) return;
        const targetKey = targetContainer.dataset.key;
        
        socket.emit('playerAction', { type: 'attack', targetKey: targetKey });
        cancelTargeting();
    }
    
    function cancelTargeting() {
        isTargeting = false;
        document.getElementById('targeting-indicator').classList.add('hidden');
        document.querySelectorAll('.npc-container.is-targeting').forEach(el => el.classList.remove('is-targeting'));
    }

    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        currentRoomId = urlParams.get('room');
        const roleFromUrl = urlParams.get('role');

        if (currentRoomId && roleFromUrl) { // Jogador ou Espectador
            socket.emit('playerJoinsLobby', { roomId: currentRoomId, role: roleFromUrl });
            if (roleFromUrl === 'player') {
                showScreen(selectionScreen);
            } else {
                showScreen(playerWaitingScreen);
            }
        } else { // GM
            socket.emit('gmCreatesLobby');
        }
        
        confirmBtn.addEventListener('click', onConfirmSelection);
        
        document.getElementById('start-adventure-btn').onclick = () => {
            socket.emit('playerAction', { type: 'gmStartsAdventure' });
        };
        
        document.getElementById('gm-confirm-party-btn').onclick = () => {
            const playerStats = [];
            document.querySelectorAll('#gm-party-list .party-member-card').forEach(card => {
                playerStats.push({
                    id: card.dataset.id,
                    agi: parseInt(card.querySelector('.agi-input').value, 10),
                    res: parseInt(card.querySelector('.res-input').value, 10)
                });
            });
            socket.emit('playerAction', { type: 'gmConfirmParty', playerStats });
        };

        document.getElementById('gm-start-battle-btn').onclick = () => {
            const npcConfigs = [];
            document.querySelectorAll('#npc-selection-area .npc-card.selected').forEach(card => {
                npcConfigs.push({
                    nome: card.dataset.name,
                    img: card.dataset.img,
                    agi: parseInt(card.querySelector('.agi-input').value, 10),
                    res: parseInt(card.querySelector('.res-input').value, 10),
                });
            });

            if (npcConfigs.length === 0 || npcConfigs.length > 4) {
                alert("Selecione de 1 a 4 NPCs para a batalha.");
                return;
            }
            socket.emit('playerAction', { type: 'gmStartBattle', npcs: npcConfigs });
        };

        document.body.addEventListener('contextmenu', (e) => {
            if (isTargeting) { e.preventDefault(); cancelTargeting(); }
        });
        document.body.addEventListener('keydown', (e) => {
            if (isTargeting && e.key === "Escape") { cancelTargeting(); }
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
    }

    socket.on('gameUpdate', (gameState) => {
        const oldPhase = currentGameState ? currentGameState.phase : null;
        currentGameState = gameState;
        
        // --- CORREÇÃO: Assegura que a tela correta seja mostrada para o GM
        if (isGm) {
            exitGameBtn.classList.remove('hidden');
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
                        // Renderiza apenas se for a primeira vez
                        if(oldPhase !== 'npc_setup') renderNpcSelectionForGm();
                        break;
                    case 'battle':
                    case 'gameover':
                        showScreen(fightScreen);
                        updateUI(gameState);
                        break;
                }
            }
        } else { // Player ou Spectator
            if (gameState.mode === 'lobby') {
                const myPlayerData = gameState.connectedPlayers[socket.id];
                if (myRole === 'player' && myPlayerData && !myPlayerData.selectedCharacter) {
                    showScreen(selectionScreen);
                    renderPlayerCharacterSelection(gameState.unavailableCharacters);
                } else {
                    showScreen(playerWaitingScreen);
                }
            } else if (gameState.mode === 'adventure') {
                if (['party_setup', 'npc_setup'].includes(gameState.phase)) {
                    showScreen(playerWaitingScreen);
                    document.getElementById('player-waiting-message').innerText = "O Mestre está preparando a aventura...";
                } else {
                    showScreen(fightScreen);
                    updateUI(gameState);
                }
            }
        }
    });

    socket.on('roomCreated', (roomId) => {
        currentRoomId = roomId;
        if (myRole === 'gm') {
            const baseUrl = window.location.origin;
            document.getElementById('gm-link-player').textContent = `${baseUrl}?room=${roomId}&role=player`;
            document.getElementById('gm-link-spectator').textContent = `${baseUrl}?room=${roomId}&role=spectator`;
            showScreen(gmInitialLobby);
        }
    });

    function updateGmLobbyUI(state) {
        const playerListEl = document.getElementById('gm-lobby-player-list');
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
    
    function updateGmPartySetupScreen(state) {
        const partyList = document.getElementById('gm-party-list');
        partyList.innerHTML = '';
        Object.values(state.fighters.players).forEach(player => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'party-member-card';
            playerDiv.dataset.id = player.id;
            playerDiv.innerHTML = `
                <img src="${player.img}" alt="${player.nome}">
                <h4>${player.nome}</h4>
                <label>AGI: <input type="number" class="agi-input" value="2"></label>
                <label>RES: <input type="number" class="res-input" value="3"></label>
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
            card.innerHTML = `
                <img src="${imgPath}${name}.png" alt="${name}"><div class="char-name">${name}</div>
                <label>AGI: <input type="number" class="agi-input" value="${stats.agi}"></label>
                <label>RES: <input type="number" class="res-input" value="${stats.res}"></label>
            `;
            card.addEventListener('click', (e) => {
                if(e.target.tagName === 'INPUT') return;
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

    function updateUI(state) {
        if (!state || state.mode !== 'adventure') return;

        const playersContainer = document.getElementById('players-container');
        const npcsContainer = document.getElementById('npcs-container');
        playersContainer.innerHTML = '';
        npcsContainer.innerHTML = '';

        Object.values(state.fighters.players).forEach(fighter => {
            playersContainer.appendChild(createFighterElement(fighter, 'player', state));
        });

        Object.values(state.fighters.npcs).forEach(fighter => {
            const el = createFighterElement(fighter, 'npc', state);
            npcsContainer.appendChild(el);
            if (el.classList.contains('targetable')) {
                el.addEventListener('click', handleTargetClick);
            }
        });

        if (state.phase === 'gameover') {
            roundInfoEl.innerHTML = `<span class="turn-highlight">FIM DE JOGO!</span><br>${state.reason}`;
        } else if (state.activeCharacterKey) {
            const activeFighter = state.fighters.players[state.activeCharacterKey] || state.fighters.npcs[state.activeCharacterKey];
            roundInfoEl.innerHTML = `ROUND ${state.currentRound} - Vez de: <span class="turn-highlight">${activeFighter.nome}</span>`;
        }
        
        fightLog.innerHTML = state.log.map(msg => `<p class="${msg.className || ''}">${msg.text}</p>`).join('');
        fightLog.scrollTop = fightLog.scrollHeight;
        
        actionButtonsWrapper.innerHTML = '';
        if (myPlayerKey && state.fighters.players[myPlayerKey] && state.fighters.players[myPlayerKey].status === 'active') {
            const myTurn = myPlayerKey === state.activeCharacterKey;
            const canAct = myTurn && state.phase === 'battle';
            
            let buttonsHtml = `
                <button class="action-btn" data-action="attack" ${!canAct ? 'disabled' : ''}>Atacar</button>
                <button class="end-turn-btn" data-action="end_turn" ${!canAct ? 'disabled' : ''}>Passar Turno</button>
            `;
            actionButtonsWrapper.innerHTML = buttonsHtml;
        }
    }

    function createFighterElement(fighter, type, state) {
        const container = document.createElement('div');
        container.className = `${type}-container`;
        container.id = fighter.id;
        container.dataset.key = fighter.id;
        
        let statusClass = '';
        if (fighter.status === 'down') statusClass = 'down';
        else if (state.activeCharacterKey === fighter.id) statusClass = 'active-turn';
        if (type === 'npc' && fighter.status === 'active') container.classList.add('targetable');

        container.classList.add(statusClass);

        container.innerHTML = `
            <div class="fighter-img-container"><img src="${fighter.img}" class="fighter-img"></div>
            <div class="fighter-info">
                <h2>${fighter.nome}</h2>
                <div class="stats-bar">
                    <div class="hp-bar-container"><div class="hp-bar" style="width:${(fighter.hp / fighter.hpMax) * 100}%"></div></div>
                    <span class="hp-text">${fighter.hp}/${fighter.hpMax}</span>
                </div>
                <div class="attributes-display">
                    <span class="stat-text">AGI: ${fighter.agi}</span>
                    <span class="stat-text">RES: ${fighter.res}</span>
                </div>
            </div>`;
        return container;
    }

    socket.on('assignRole', (data) => {
        myRole = data.role;
        myPlayerKey = data.playerKey || null;
        isGm = data.isGm || myRole === 'gm';
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
        showInfoModal("Erro", `${message}<br>A página será recarregada.`);
        setTimeout(() => window.location.reload(), 3000);
    });
    
    function showInfoModal(title, text) {
        modalTitle.innerText = title;
        modalText.innerHTML = text;
        modalButton.onclick = () => modal.classList.add('hidden');
        modal.classList.remove('hidden');
    }

    initialize();
});