// client.js

document.addEventListener('DOMContentLoaded', () => {
    let myRole = null;
    let myPlayerKey = null;
    let isGm = false;
    let currentGameState = null;
    let oldGameState = null; // Para comparar estados e detectar mudanças
    let defeatAnimationPlayed = new Set(); // Para controlar animações de derrota
    let currentRoomId = new URLSearchParams(window.location.search).get('room');
    const socket = io();

    let isTargeting = false;
    let targetingAttackerKey = null;
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

    function showScreen(screenToShow) { allScreens.forEach(screen => screen.classList.toggle('active', screen === screenToShow)); }

    function handleActionClick(event) {
        if (!currentGameState || currentGameState.phase !== 'battle') return;
        const activeFighterKey = currentGameState.activeCharacterKey;
        const myFighter = currentGameState.fighters.players[myPlayerKey];
        const canControl = (myFighter && myFighter.id === activeFighterKey) || (isGm && currentGameState.fighters.npcs[activeFighterKey]);
        if (!canControl) return;
        const target = event.target.closest('button'); 
        if (!target || target.disabled) return;
        const action = target.dataset.action;
        if (action === 'attack') {
            isTargeting = true;
            targetingAttackerKey = activeFighterKey;
            document.getElementById('targeting-indicator').classList.remove('hidden');
            const isNpcTurn = !!currentGameState.fighters.npcs[activeFighterKey];
            const targetSelector = isNpcTurn ? '.player-char-container.targetable' : '.npc-char-container.targetable';
            document.querySelectorAll(targetSelector).forEach(el => el.classList.add('is-targeting'));
        } else if (action === 'end_turn') {
            socket.emit('playerAction', { type: 'end_turn', actorKey: activeFighterKey });
        }
    }

    function handleTargetClick(event) {
        if (!isTargeting || !targetingAttackerKey) return;
        const targetContainer = event.target.closest('.char-container');
        if (!targetContainer || !targetContainer.classList.contains('targetable')) return;
        const targetKey = targetContainer.dataset.key;
        socket.emit('playerAction', { 
            type: 'attack',
            attackerKey: targetingAttackerKey,
            targetKey: targetKey 
        });
        cancelTargeting();
    }
    
    function cancelTargeting() {
        isTargeting = false;
        targetingAttackerKey = null;
        document.getElementById('targeting-indicator').classList.add('hidden');
        document.querySelectorAll('.char-container.is-targeting').forEach(el => el.classList.remove('is-targeting'));
    }

    function toggleCoordsMode() {
        coordsModeActive = !coordsModeActive;
        coordsDisplay.classList.toggle('hidden', !coordsModeActive);
        if (coordsModeActive) { document.addEventListener('mousemove', updateCoordsDisplay); } 
        else { document.removeEventListener('mousemove', updateCoordsDisplay); }
    }

    function updateCoordsDisplay(event) {
        const gameWrapper = document.getElementById('game-wrapper');
        const rect = gameWrapper.getBoundingClientRect();
        const transform = window.getComputedStyle(gameWrapper).transform;
        const scale = transform === 'none' ? 1 : new DOMMatrix(transform).a;
        const x = Math.round((event.clientX - rect.left) / scale);
        const y = Math.round((event.clientY - rect.top) / scale);
        coordsDisplay.textContent = `X: ${x}, Y: ${y}`;
    }

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
            if (isGm && e.key.toLowerCase() === 'f') { e.preventDefault(); toggleCoordsMode(); }
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
        oldGameState = currentGameState;
        currentGameState = gameState;
        
        const oldPhase = oldGameState ? oldGameState.phase : null;
        const initiativeUI = document.getElementById('initiative-ui');
        if(initiativeUI) initiativeUI.classList.add('hidden');

        if (isGm) {
            if (gameState.mode === 'lobby') { showScreen(gmInitialLobby); updateGmLobbyUI(gameState); defeatAnimationPlayed.clear(); }
            else if (gameState.mode === 'adventure') {
                 switch (gameState.phase) {
                    case 'party_setup': showScreen(gmPartySetupScreen); updateGmPartySetupScreen(gameState); break;
                    case 'npc_setup': showScreen(gmNpcSetupScreen); if (oldPhase !== 'npc_setup') renderNpcSelectionForGm(); break;
                    case 'initiative_roll': showScreen(fightScreen); updateUI(gameState); renderInitiativeUI(gameState); break;
                    case 'battle': case 'gameover': showScreen(fightScreen); updateUI(gameState); break;
                }
            }
        } else { 
            if (gameState.mode === 'lobby') {
                const myPlayerData = gameState.connectedPlayers[socket.id];
                if (myRole === 'player' && myPlayerData && !myPlayerData.selectedCharacter) {
                    showScreen(selectionScreen); renderPlayerCharacterSelection(gameState.unavailableCharacters);
                } else {
                    showScreen(playerWaitingScreen); document.getElementById('player-waiting-message').innerText = "Aguardando o Mestre iniciar...";
                }
                 defeatAnimationPlayed.clear();
            } else if (gameState.mode === 'adventure') {
                if (['party_setup', 'npc_setup'].includes(gameState.phase)) {
                    showScreen(playerWaitingScreen); document.getElementById('player-waiting-message').innerText = "O Mestre está preparando a aventura...";
                } else if (gameState.phase === 'initiative_roll') {
                    showScreen(fightScreen); updateUI(gameState); renderInitiativeUI(gameState);
                } else {
                    showScreen(fightScreen); updateUI(gameState);
                }
            }
        }
    });

    socket.on('roomCreated', (roomId) => {
        currentRoomId = roomId;
        if (isGm) {
            const baseUrl = window.location.origin;
            const playerUrl = `${baseUrl}?room=${roomId}&role=player`;
            const spectatorUrl = `${baseUrl}?room=${roomId}&role=spectator`;
            const playerLinkEl = document.getElementById('gm-link-player');
            const spectatorLinkEl = document.getElementById('gm-link-spectator');
            playerLinkEl.textContent = playerUrl;
            spectatorLinkEl.textContent = spectatorUrl;
            playerLinkEl.onclick = () => copyToClipboard(playerUrl, playerLinkEl);
            spectatorLinkEl.onclick = () => copyToClipboard(spectatorUrl, spectatorLinkEl);
            document.getElementById('start-adventure-btn').onclick = () => socket.emit('playerAction', { type: 'gmStartsAdventure' });
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
                if (npcConfigs.length === 0 || npcConfigs.length > 4) { alert("Selecione de 1 a 4 NPCs para a batalha."); return; }
                socket.emit('playerAction', { type: 'gmStartBattle', npcs: npcConfigs });
            };
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
        if (!isGm) return;
        const playerListEl = document.getElementById('gm-lobby-player-list');
        if (!playerListEl) return;
        playerListEl.innerHTML = '';
        const connectedPlayers = Object.values(state.connectedPlayers);
        if (connectedPlayers.length === 0) { playerListEl.innerHTML = '<li>Aguardando jogadores...</li>'; } 
        else {
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
            playerDiv.innerHTML = `<img src="${player.img}" alt="${player.nome}"><h4>${player.nome}</h4><label>AGI: <input type="number" class="agi-input" value="2"></label><label>RES: <input type="number" class="res-input" value="3"></label>`;
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
            card.innerHTML = `<img src="${imgPath}${name}.png" alt="${name}"><div class="char-name">${name}</div><label>AGI: <input type="number" class="agi-input" value="${stats.agi}"></label><label>RES: <input type="number" class="res-input" value="${stats.res}"></label>`;
            card.addEventListener('click', (e) => {
                if(e.target.tagName === 'INPUT') return;
                const selectedCount = document.querySelectorAll('#npc-selection-area .npc-card.selected').length;
                if (!card.classList.contains('selected') && selectedCount >= 4) { alert("Você pode selecionar no máximo 4 NPCs."); return; }
                card.classList.toggle('selected');
            });
            npcArea.appendChild(card);
        });
    }
    
    function renderInitiativeUI(state) {
        const initiativeUI = document.getElementById('initiative-ui');
        initiativeUI.classList.remove('hidden');
        const playerRollBtn = document.getElementById('player-roll-initiative-btn');
        const gmRollBtn = document.getElementById('gm-roll-initiative-btn');
        if (myRole === 'player' && state.fighters.players[myPlayerKey] && !state.initiativeRolls[myPlayerKey]) {
            playerRollBtn.classList.remove('hidden'); playerRollBtn.disabled = false;
            playerRollBtn.onclick = () => { playerRollBtn.disabled = true; socket.emit('playerAction', { type: 'roll_initiative' }); };
        } else { playerRollBtn.classList.add('hidden'); }
        if (isGm) {
            const npcsNeedToRoll = Object.values(state.fighters.npcs).some(npc => !state.initiativeRolls[npc.id]);
            if (npcsNeedToRoll) {
                gmRollBtn.classList.remove('hidden'); gmRollBtn.disabled = false;
                gmRollBtn.onclick = () => { gmRollBtn.disabled = true; socket.emit('playerAction', { type: 'roll_initiative', isGmRoll: true }); };
            } else { gmRollBtn.classList.add('hidden'); }
        } else { gmRollBtn.classList.add('hidden'); }
    }

    function updateTurnOrderUI(state) {
        turnOrderSidebar.innerHTML = '';
        if (state.phase !== 'battle') { turnOrderSidebar.classList.add('hidden'); return; }
        turnOrderSidebar.classList.remove('hidden');
        state.turnOrder.forEach((charId, index) => {
            const fighter = getFighter(state, charId);
            if (!fighter) return;
            const turnEntry = document.createElement('div');
            turnEntry.className = 'turn-order-entry';
            if (index === 0) { turnEntry.classList.add('active-in-turn-order'); }
            turnEntry.innerHTML = `<img src="${fighter.img}" alt="${fighter.nome}">`;
            turnOrderSidebar.appendChild(turnEntry);
        });
    }

    function updateUI(state) {
        if (!state || !state.fighters) return;
        fightSceneCharacters.innerHTML = '';
        updateTurnOrderUI(state);
        
        // AJUSTE ÚNICO NESTE ARQUIVO: Camadas (zIndex) corrigidas para a perspectiva correta.
        const PLAYER_POSITIONS = [ 
            { left: '150px', top: '500px', zIndex: 14 }, 
            { left: '250px', top: '400px', zIndex: 13 }, 
            { left: '350px', top: '300px', zIndex: 12 }, 
            { left: '450px', top: '200px', zIndex: 11 } 
        ];
        const NPC_POSITIONS = [ 
            { left: '1000px', top: '500px', zIndex: 14 }, 
            { left: '900px',  top: '400px', zIndex: 13 }, 
            { left: '800px',  top: '300px', zIndex: 12 }, 
            { left: '700px',  top: '200px', zIndex: 11 } 
        ];
        
        const allFighters = [...Object.values(state.fighters.players), ...Object.values(state.fighters.npcs)];
        const fighterPositions = {};
        Object.values(state.fighters.players).forEach((f, i) => fighterPositions[f.id] = PLAYER_POSITIONS[i]);
        Object.values(state.fighters.npcs).forEach((f, i) => fighterPositions[f.id] = NPC_POSITIONS[i]);

        allFighters.forEach(fighter => {
            const isPlayer = !!state.fighters.players[fighter.id];
            const el = createFighterElement(fighter, isPlayer ? 'player' : 'npc', state, fighterPositions[fighter.id]);
            fightSceneCharacters.appendChild(el);
        });

        if (state.phase === 'gameover') {
            roundInfoEl.innerHTML = `<span class="turn-highlight">FIM DE JOGO!</span><br>${state.reason}`;
        } else if (state.phase === 'initiative_roll') {
            roundInfoEl.innerHTML = `ROUND ${state.currentRound} - Iniciativa`;
        } else if (state.activeCharacterKey) {
            const activeFighter = getFighter(state, state.activeCharacterKey);
            if (activeFighter) { roundInfoEl.innerHTML = `ROUND ${state.currentRound} - Vez de: <span class="turn-highlight">${activeFighter.nome}</span>`; }
        }
        
        fightLog.innerHTML = state.log.map(msg => `<p class="${msg.className || ''}">${msg.text}</p>`).join('');
        fightLog.scrollTop = fightLog.scrollHeight;
        
        actionButtonsWrapper.innerHTML = '';
        const activeFighter = getFighter(state, state.activeCharacterKey);
        const isMyPlayerTurn = myPlayerKey === state.activeCharacterKey;
        const isMyGmNpcTurn = isGm && state.fighters.npcs[state.activeCharacterKey];
        if (activeFighter && (isMyPlayerTurn || isMyGmNpcTurn)) {
            const canAct = state.phase === 'battle';
            const hasActed = activeFighter.hasActed;
            actionButtonsWrapper.innerHTML = `<button class="action-btn" data-action="attack" ${(!canAct || hasActed) ? 'disabled' : ''}>Atacar</button><button class="end-turn-btn" data-action="end_turn" ${!canAct ? 'disabled' : ''}>Passar Turno</button>`;
        }
    }
    
    function getFighter(state, key) { return state.fighters.players[key] || state.fighters.npcs[key]; }
    function getOldFighter(key) { return oldGameState ? (oldGameState.fighters.players[key] || oldGameState.fighters.npcs[key]) : null; }

    function createFighterElement(fighter, type, state, position) {
        const container = document.createElement('div');
        container.className = `char-container ${type}-char-container`;
        container.id = fighter.id;
        container.dataset.key = fighter.id;
        Object.assign(container.style, position);

        const oldFighterState = getOldFighter(fighter.id);
        const wasJustDefeated = oldFighterState && oldFighterState.status === 'active' && fighter.status === 'down';

        if (wasJustDefeated && !defeatAnimationPlayed.has(fighter.id)) {
            defeatAnimationPlayed.add(fighter.id);
            container.classList.add(type === 'player' ? 'animate-defeat-player' : 'animate-defeat-npc');
        } else if (fighter.status === 'down') {
             container.classList.add(type === 'player' ? 'player-defeated-final' : 'npc-defeated-final');
        }

        if (fighter.status === 'active') {
            if (state.activeCharacterKey === fighter.id) {
                container.classList.add('active-turn');
            }
            const activeFighter = getFighter(state, state.activeCharacterKey);
            if (activeFighter) {
                const isActiveFighterPlayer = !!state.fighters.players[activeFighter.id];
                const isThisFighterPlayer = type === 'player';
                if (isActiveFighterPlayer !== isThisFighterPlayer) {
                    container.classList.add('targetable');
                }
            }
        }
        
        container.addEventListener('mouseenter', () => { if (isTargeting && container.classList.contains('targetable')) { container.classList.add('target-hover'); } });
        container.addEventListener('mouseleave', () => { container.classList.remove('target-hover'); });
        
        if(container.classList.contains('targetable')) {
             container.addEventListener('click', handleTargetClick);
        }

        const healthPercentage = (fighter.hp / fighter.hpMax) * 100;
        container.innerHTML = `<div class="health-bar-ingame"><div class="health-bar-ingame-fill" style="width: ${healthPercentage}%"></div><span class="health-bar-ingame-text">${fighter.hp}/${fighter.hpMax}</span></div><img src="${fighter.img}" class="fighter-img-ingame"><div class="fighter-name-ingame">${fighter.nome}</div>`;
        return container;
    }

    socket.on('assignRole', (data) => {
        myRole = data.role; myPlayerKey = data.playerKey || null; isGm = data.isGm || myRole === 'gm';
    });

    socket.on('triggerAttackAnimation', ({ attackerKey }) => { 
        setTimeout(() => {
            const el = document.getElementById(attackerKey);
            if (el) { 
                const isPlayer = el.classList.contains('player-char-container');
                const animationClass = isPlayer ? 'is-attacking-player' : 'is-attacking-npc';
                el.classList.add(animationClass); 
                el.addEventListener('animationend', () => el.classList.remove(animationClass), { once: true });
            }
        }, 50);
    });

    socket.on('triggerHitAnimation', ({ defenderKey }) => { 
        setTimeout(() => {
            const el = document.getElementById(defenderKey);
            if (el) {
                el.classList.add('is-hit-flash');
                el.addEventListener('animationend', () => el.classList.remove('is-hit-flash'), { once: true });
            }
        }, 50);
    });
    
    socket.on('playSound', (soundFile) => {
        const audio = new Audio(`sons/${soundFile}`);
        audio.play();
    });

    socket.on('error', (err) => { alert(err.message); window.location.reload(); });
    
    initialize();
    
    function scaleGame() {
        const gameWrapper = document.getElementById('game-wrapper');
        const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
        gameWrapper.style.transform = `scale(${scale})`;
        gameWrapper.style.left = `${(window.innerWidth - (1280 * scale)) / 2}px`;
        gameWrapper.style.top = `${(window.innerHeight - (720 * scale)) / 2}px`;
    }
    window.addEventListener('resize', scaleGame);
    scaleGame();
});