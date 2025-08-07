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

    socket.on('availableFighters', ({ p1, playable }) => {
        ALL_FIGHTERS_DATA = p1 || {};
        PLAYABLE_CHARACTERS_DATA = playable || [];
    });

    function showScreen(screenToShow) {
        allScreens.forEach(screen => {
            screen.classList.toggle('active', screen === screenToShow);
        });
    }

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
            document.querySelectorAll('.npc-char-container.targetable').forEach(el => el.classList.add('is-targeting'));
        } else if (action === 'end_turn') {
            socket.emit('playerAction', { type: 'end_turn' });
        }
    }

    function handleTargetClick(event) {
        if (!isTargeting) return;
        const targetContainer = event.target.closest('.npc-char-container');
        if (!targetContainer || !targetContainer.classList.contains('targetable')) return;
        const targetKey = targetContainer.dataset.key;
        
        socket.emit('playerAction', { type: 'attack', targetKey: targetKey });
        cancelTargeting();
    }
    
    function cancelTargeting() {
        isTargeting = false;
        document.getElementById('targeting-indicator').classList.add('hidden');
        document.querySelectorAll('.npc-char-container.is-targeting').forEach(el => el.classList.remove('is-targeting'));
    }

    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        currentRoomId = urlParams.get('room');
        const roleFromUrl = urlParams.get('role');

        if (currentRoomId && roleFromUrl) {
            socket.emit('playerJoinsLobby', { roomId: currentRoomId, role: roleFromUrl });
            if (roleFromUrl === 'player') {
                showScreen(selectionScreen);
            } else {
                showScreen(playerWaitingScreen);
            }
        } else {
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

        document.body.addEventListener('contextmenu', (e) => { if (isTargeting) { e.preventDefault(); cancelTargeting(); } });
        document.body.addEventListener('keydown', (e) => { if (isTargeting && e.key === "Escape") { cancelTargeting(); } });
        
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
        // ... (código existente, permanece o mesmo)
    }

    socket.on('gameUpdate', (gameState) => {
        const oldPhase = currentGameState ? currentGameState.phase : null;
        currentGameState = gameState;
        
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
                    case 'battle':
                    case 'gameover':
                        showScreen(fightScreen);
                        updateUI(gameState);
                        break;
                }
            }
        } else {
            if (gameState.mode === 'lobby') { /* ... */ } 
            else if (gameState.mode === 'adventure') {
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
        // ... (código existente, permanece o mesmo)
    });

    function updateGmLobbyUI(state) {
        // ... (código existente, permanece o mesmo)
    }
    
    function updateGmPartySetupScreen(state) {
        // ... (código existente, permanece o mesmo)
    }

    function renderNpcSelectionForGm() {
        // ... (código existente, permanece o mesmo)
    }

    // --- MODIFICAÇÃO: updateUI completamente redesenhada para o novo layout
    function updateUI(state) {
        if (!state || state.mode !== 'adventure') return;
        
        // Limpa a cena antes de redesenhar
        fightSceneCharacters.innerHTML = '';

        // Posições fixas para os personagens no cenário
        const PLAYER_POSITIONS = [{bottom: '15%', left: '10%'}, {bottom: '15%', left: '20%'}, {bottom: '15%', left: '30%'}, {bottom: '15%', left: '40%'}];
        const NPC_POSITIONS = [{bottom: '15%', right: '10%'}, {bottom: '15%', right: '20%'}, {bottom: '15%', right: '30%'}, {bottom: '15%', right: '40%'}];
        
        // Renderiza Jogadores
        Object.values(state.fighters.players).forEach((fighter, index) => {
            const pos = PLAYER_POSITIONS[index];
            const el = createFighterElement(fighter, 'player', state, pos);
            fightSceneCharacters.appendChild(el);
        });

        // Renderiza NPCs
        Object.values(state.fighters.npcs).forEach((fighter, index) => {
            const pos = NPC_POSITIONS[index];
            const el = createFighterElement(fighter, 'npc', state, pos);
            fightSceneCharacters.appendChild(el);
            if (el.classList.contains('targetable')) {
                el.addEventListener('click', handleTargetClick);
            }
        });

        // Atualiza log e info do round
        if (state.phase === 'gameover') {
            roundInfoEl.innerHTML = `<span class="turn-highlight">FIM DE JOGO!</span><br>${state.reason}`;
        } else if (state.activeCharacterKey) {
            const activeFighter = state.fighters.players[state.activeCharacterKey] || state.fighters.npcs[state.activeCharacterKey];
            roundInfoEl.innerHTML = `ROUND ${state.currentRound} - Vez de: <span class="turn-highlight">${activeFighter.nome}</span>`;
        }
        
        fightLog.innerHTML = state.log.map(msg => `<p class="${msg.className || ''}">${msg.text}</p>`).join('');
        fightLog.scrollTop = fightLog.scrollHeight;
        
        // Atualiza botões de ação
        actionButtonsWrapper.innerHTML = '';
        if (myPlayerKey && state.fighters.players[myPlayerKey] && state.fighters.players[myPlayerKey].status === 'active') {
            const myTurn = myPlayerKey === state.activeCharacterKey;
            const canAct = myTurn && state.phase === 'battle';
            
            actionButtonsWrapper.innerHTML = `
                <button class="action-btn" data-action="attack" ${!canAct ? 'disabled' : ''}>Atacar</button>
                <button class="end-turn-btn" data-action="end_turn" ${!canAct ? 'disabled' : ''}>Passar Turno</button>
            `;
        }
    }

    // --- MODIFICAÇÃO: Nova função para criar o elemento de um lutador NO CENÁRIO
    function createFighterElement(fighter, type, state, position) {
        const container = document.createElement('div');
        container.className = `${type}-char-container`;
        container.id = fighter.id;
        container.dataset.key = fighter.id;

        // Aplica a posição
        Object.assign(container.style, position);
        
        let statusClass = '';
        if (fighter.status === 'down') statusClass = 'down';
        else if (state.activeCharacterKey === fighter.id) statusClass = 'active-turn';
        if (type === 'npc' && fighter.status === 'active') container.classList.add('targetable');

        container.classList.add(statusClass);

        const healthPercentage = (fighter.hp / fighter.hpMax) * 100;

        container.innerHTML = `
            <div class="health-bar-ingame">
                <div class="health-bar-ingame-fill" style="width: ${healthPercentage}%"></div>
                <span class="health-bar-ingame-text">${fighter.hp}/${fighter.hpMax}</span>
            </div>
            <img src="${fighter.img}" class="fighter-img-ingame">
            <div class="fighter-name-ingame">${fighter.nome}</div>
        `;

        // Vira a imagem do NPC
        if(type === 'npc'){
            container.querySelector('.fighter-img-ingame').style.transform = 'scaleX(-1)';
        }

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
    
    socket.on('error', (err) => { /* ... */ });
    
    initialize();
    
    // Adicione esta função para o dimensionamento da tela
    function scaleGame() {
        const w = document.getElementById('game-wrapper');
        const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
        w.style.transform = `scale(${scale})`;
        const left = (window.innerWidth - (1280 * scale)) / 2;
        const top = (window.innerHeight - (720 * scale)) / 2;
        w.style.left = `${left}px`;
        w.style.top = `${top}px`;
    }
    window.addEventListener('resize', scaleGame);
    scaleGame();
});