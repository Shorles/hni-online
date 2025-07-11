document.addEventListener('DOMContentLoaded', () => {
    let myPlayerKey = null; // host, player1, player2, spectator
    let currentGameState = null;
    let currentRoomId = new URLSearchParams(window.location.search).get('room');
    let arenaPlayerKey = new URLSearchParams(window.location.search).get('player');
    const socket = io();

    let setupData = { scenario: null, gameMode: null };
    let availableSpecialMoves = {};

    // --- ELEMENTOS DO DOM ---
    const allScreens = document.querySelectorAll('.screen');
    const gameWrapper = document.getElementById('game-wrapper');
    const scenarioScreen = document.getElementById('scenario-screen');
    const scenarioListContainer = document.getElementById('scenario-list-container');
    const gameModeScreen = document.getElementById('game-mode-screen');
    const selectionScreen = document.getElementById('selection-screen');
    const lobbyScreen = document.getElementById('lobby-screen');
    const arenaLobbyScreen = document.getElementById('arena-lobby-screen');
    const fightScreen = document.getElementById('fight-screen');
    const charListContainer = document.getElementById('character-list-container');
    const confirmBtn = document.getElementById('confirm-selection-btn');
    const selectionTitle = document.getElementById('selection-title');
    const shareContainer = document.getElementById('share-container');
    const copySpectatorLinkInGameBtn = document.getElementById('copy-spectator-link-ingame');
    let modal = document.getElementById('modal');
    let modalTitle = document.getElementById('modal-title');
    let modalText = document.getElementById('modal-text');
    let modalButton = document.getElementById('modal-button');
    const specialMovesModal = document.getElementById('special-moves-modal');
    const specialMovesTitle = document.getElementById('special-moves-title');
    const specialMovesList = document.getElementById('special-moves-list');
    const confirmSpecialMovesBtn = document.getElementById('confirm-special-moves-btn');
    const getUpSuccessOverlay = document.getElementById('get-up-success-overlay');
    const getUpSuccessContent = document.getElementById('get-up-success-content');
    
    // Botões
    const gameModeBackBtn = document.getElementById('game-mode-back-btn');
    const charSelectBackBtn = document.getElementById('char-select-back-btn');
    const specialMovesBackBtn = document.getElementById('special-moves-back-btn');
    const lobbyBackBtn = document.getElementById('lobby-back-btn');
    const exitGameBtn = document.getElementById('exit-game-btn');
    const modePvcBtn = document.getElementById('mode-pvc-btn');
    const modePvpBtn = document.getElementById('mode-pvp-btn');
    const startArenaFightBtn = document.getElementById('start-arena-fight-btn');

    // --- DADOS E SONS ---
    const SCENARIOS = { 'Ringue Clássico': 'Ringue.png', 'Arena Subterrânea': 'Ringue2.png', 'Dojo Antigo': 'Ringue3.png', 'Ginásio Moderno': 'Ringue4.png', 'Ringue na Chuva': 'Ringue5.png' };
    const CHARACTERS_P1 = { 'Kureha Shoji':{agi:3,res:1},'Erik Adler':{agi:2,res:2},'Ivan Braskovich':{agi:1,res:3},'Hayato Takamura':{agi:4,res:4},'Logan Graves':{agi:3,res:2},'Daigo Kurosawa':{agi:1,res:4},'Jamal Briggs':{agi:2,res:3},'Takeshi Arada':{agi:3,res:2},'Kaito Mishima':{agi:4,res:3},'Kuga Shunji':{agi:3,res:4},'Eitan Barak':{agi:4,res:3} };
    const CHARACTERS_P2 = { 'Ryu':{agi:2,res:3},'Yobu':{agi:2,res:3},'Nathan':{agi:2,res:3},'Okami':{agi:2,res:3} };
    const SOUNDS = { jab:[new Audio('sons/jab01.mp3'),new Audio('sons/jab02.mp3'),new Audio('sons/jab03.mp3')], strong:[new Audio('sons/baseforte01.mp3'),new Audio('sons/baseforte02.mp3')], dice:[new Audio('sons/dice1.mp3'),new Audio('sons/dice2.mp3'),new Audio('sons/dice3.mp3')], critical:[new Audio('sons/Critical.mp3')], miss:[new Audio('sons/Esquiva.mp3')] };
    function playRandomSound(soundType) { if (SOUNDS[soundType]) { const s = SOUNDS[soundType]; const sound = s[Math.floor(Math.random() * s.length)]; sound.currentTime = 0; sound.play().catch(e => console.error("Erro ao tocar som:", e)); } }

    function showScreen(screenToShow) {
        allScreens.forEach(screen => {
            screen.classList.toggle('active', screen.id === screenToShow.id);
        });
    }

    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        const isSpectator = urlParams.get('spectate') === 'true';

        [charSelectBackBtn, specialMovesBackBtn, lobbyBackBtn, exitGameBtn, gameModeBackBtn, copySpectatorLinkInGameBtn].forEach(btn => btn.classList.add('hidden'));

        if (isSpectator) {
            showScreen(lobbyScreen);
            lobbyScreen.querySelector('#lobby-content').innerHTML = `<p>Entrando como espectador...</p>`;
            socket.emit('spectateGame', currentRoomId);
        } else if (arenaPlayerKey) {
            showScreen(selectionScreen);
            selectionTitle.innerText = `Jogador ${arenaPlayerKey.slice(-1)}: Selecione seu Lutador`;
            confirmBtn.innerText = 'Confirmar';
            renderCharacterSelection('p2');
            socket.emit('joinAsArenaPlayer', { roomId: currentRoomId, playerKey: arenaPlayerKey });
        } else if (currentRoomId) {
            showScreen(selectionScreen);
            selectionTitle.innerText = 'Jogador 2: Selecione seu Lutador';
            confirmBtn.innerText = 'Entrar na Luta';
            renderCharacterSelection('p1');
        } else {
            gameModeBackBtn.classList.remove('hidden');
            charSelectBackBtn.classList.remove('hidden');
            specialMovesBackBtn.classList.remove('hidden');
            lobbyBackBtn.classList.remove('hidden');
            showScreen(scenarioScreen);
            renderScenarioSelection();
        }

        gameModeBackBtn.onclick = () => showScreen(scenarioScreen);
        charSelectBackBtn.onclick = () => { if (setupData.gameMode === 'classic') showScreen(gameModeScreen); };
        modePvcBtn.onclick = () => {
            setupData.gameMode = 'classic';
            showScreen(selectionScreen);
            selectionTitle.innerText = 'Jogador 1: Selecione seu Lutador';
            confirmBtn.innerText = 'Confirmar Personagem';
            confirmBtn.disabled = false;
            renderCharacterSelection('p1');
        };
        modePvpBtn.onclick = () => {
            setupData.gameMode = 'arena';
            socket.emit('createGame', { gameMode: 'arena', scenario: setupData.scenario });
        };
        confirmBtn.addEventListener('click', onConfirmSelection);
        exitGameBtn.addEventListener('click', () => {
            showInfoModal(
                "Sair da Partida",
                `<p>Tem certeza que deseja voltar ao menu principal? A partida atual será encerrada para todos.</p><div style="display: flex; justify-content: center; gap: 20px; margin-top: 20px;"><button id="confirm-exit-btn" style="background-color: #dc3545; color: white; padding: 10px 20px;">Sim, Sair</button><button id="cancel-exit-btn" style="background-color: #6c757d; color: white; padding: 10px 20px;">Não, Ficar</button></div>`
            );
            document.getElementById('confirm-exit-btn').onclick = () => { socket.disconnect(); window.location.href = '/'; };
            document.getElementById('cancel-exit-btn').onclick = () => modal.classList.add('hidden');
        });
    }

    function renderScenarioSelection() {
        scenarioListContainer.innerHTML = '';
        Object.entries(SCENARIOS).forEach(([name, fileName]) => {
            const card = document.createElement('div');
            card.className = 'scenario-card';
            card.innerHTML = `<img src="images/${fileName}" alt="${name}"><div class="scenario-name">${name}</div>`;
            card.onclick = () => {
                setupData.scenario = fileName;
                showScreen(gameModeScreen);
            };
            scenarioListContainer.appendChild(card);
        });
    }

    function onConfirmSelection() {
        const selectedCard = document.querySelector('.char-card.selected');
        if (!selectedCard) { alert('Por favor, selecione um lutador!'); return; }
        const playerData = { nome: selectedCard.dataset.name, img: selectedCard.dataset.img };
        confirmBtn.disabled = true;

        if (arenaPlayerKey) {
            socket.emit('chooseArenaCharacter', { character: playerData });
            selectionScreen.innerHTML = `<h1>Personagem escolhido! Aguardando o Anfitrião configurar e iniciar a partida...</h1>`;
        } else if (setupData.gameMode === 'classic') {
            playerData.agi = selectedCard.querySelector('.agi-input').value;
            playerData.res = selectedCard.querySelector('.res-input').value;
            socket.emit('createGame', { gameMode: 'classic', player1Data: playerData, scenario: setupData.scenario });
        } else {
            socket.emit('joinGame', { roomId: currentRoomId, player2Data: playerData });
            showScreen(lobbyScreen);
            lobbyScreen.querySelector('#lobby-content').innerHTML = `<p>Aguardando o Jogador 1 definir seus atributos e golpes...</p>`;
        }
    }
    
    function renderCharacterSelection(playerListType) {
        charListContainer.innerHTML = '';
        const charData = playerListType === 'p1' ? CHARACTERS_P1 : CHARACTERS_P2;
        for (const name in charData) {
            const stats = charData[name];
            const card = document.createElement('div');
            card.className = 'char-card';
            card.dataset.name = name;
            card.dataset.img = `images/${name}.png`;
            const statsHtml = playerListType === 'p1' ? `<div class="char-stats"><label>AGI: <input type="number" class="agi-input" value="${stats.agi}"></label><label>RES: <input type="number" class="res-input" value="${stats.res}"></label></div>` : ``;
            card.innerHTML = `<img src="images/${name}.png" alt="${name}"><div class="char-name">${name}</div>${statsHtml}`;
            card.addEventListener('click', () => { document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected')); card.classList.add('selected'); });
            charListContainer.appendChild(card);
        }
    }

    function renderSpecialMoveSelection(container, availableMoves) {
        container.innerHTML = '';
        for (const moveName in availableMoves) {
            const moveData = availableMoves[moveName];
            const card = document.createElement('div');
            card.className = 'special-move-card';
            card.dataset.name = moveName;
            card.innerHTML = `<h4>${moveName}</h4><p>Custo: ${moveData.cost} PA</p><p>Dano: ${moveData.damage}</p><p>Penalidade: ${moveData.penalty}</p>`;
            card.addEventListener('click', () => card.classList.toggle('selected'));
            container.appendChild(card);
        }
    }
    
    function copyToClipboard(text, element) { navigator.clipboard.writeText(text).then(() => { const originalText = element.textContent; element.textContent = 'Copiado!'; setTimeout(() => { element.textContent = originalText; }, 2000); }); }
    
    function showInfoModal(title, text) {
        modalTitle.innerText = title;
        modalText.innerHTML = text;
        document.getElementById('modal-button').style.display = 'none';
        modal.classList.remove('hidden');
    }

    function showInteractiveModal(title, text, btnText, action) {
        modalTitle.innerText = title;
        modalText.innerHTML = text;
        const newButton = modalButton.cloneNode(true);
        modalButton.parentNode.replaceChild(newButton, modalButton);
        modalButton = document.getElementById('modal-button');
        modalButton.innerText = btnText;
        modalButton.style.display = 'inline-block';
        if (action) { modalButton.onclick = () => { socket.emit('playerAction', action); }; }
        modal.classList.remove('hidden');
    }

    function updateUI(state) {
        if (state.scenario) {
            gameWrapper.style.backgroundImage = `url('images/${state.scenario}')`;
        }

        const p1SpecialMovesContainer = document.getElementById('p1-special-moves');
        const p2SpecialMovesContainer = document.getElementById('p2-special-moves');
        if(p1SpecialMovesContainer) p1SpecialMovesContainer.innerHTML = '';
        if(p2SpecialMovesContainer) p2SpecialMovesContainer.innerHTML = '';

        ['player1', 'player2'].forEach(key => {
            const fighter = state.fighters[key];
            if (fighter) {
                document.getElementById(`${key}-fight-name`).innerText = fighter.nome;
                document.getElementById(`${key}-hp-text`).innerText = `${fighter.hp} / ${fighter.hpMax}`;
                document.getElementById(`${key}-hp-bar`).style.width = `${(fighter.hp / fighter.hpMax) * 100}%`;
                document.getElementById(`${key}-def-text`).innerText = fighter.def;
                document.getElementById(`${key}-hits`).innerText = fighter.hitsLanded;
                document.getElementById(`${key}-knockdowns`).innerText = fighter.knockdowns;
                document.getElementById(`${key}-damage-taken`).innerText = fighter.totalDamageTaken;
                document.getElementById(`${key}-pa-dots`).innerHTML = Array(fighter.pa).fill('<div class="pa-dot"></div>').join('');
                document.getElementById(`${key}-fight-img`).src = fighter.img;

                if (fighter.specialMoves) {
                    const container = (key === 'player1') ? p1SpecialMovesContainer : p2SpecialMovesContainer;
                    fighter.specialMoves.forEach(moveName => {
                        const moveData = state.moves[moveName];
                        const btn = document.createElement('button');
                        btn.className = `action-btn special-btn-${key}`;
                        btn.dataset.move = moveName;
                        btn.textContent = `${moveName} (${moveData.cost} PA)`;
                        btn.onclick = () => socket.emit('playerAction', { type: 'attack', move: moveName, playerKey: myPlayerKey });
                        container.appendChild(btn);
                    });
                }
            } else if (key === 'player2' && state.pendingP2Choice) {
                document.getElementById(`${key}-fight-img`).src = state.pendingP2Choice.img;
            } else if (key === 'player1' && state.gameMode === 'arena' && state.arenaP1_choice) {
                 document.getElementById('player1-fight-name').innerText = state.arenaP1_choice.nome;
                 document.getElementById('player1-fight-img').src = state.arenaP1_choice.img;
            } else if (key === 'player2' && state.gameMode === 'arena' && state.arenaP2_choice) {
                 document.getElementById('player2-fight-name').innerText = state.arenaP2_choice.nome;
                 document.getElementById('player2-fight-img').src = state.arenaP2_choice.img;
            }
        });

        const roundInfoEl = document.getElementById('round-info');
        if (state.phase === 'gameover') roundInfoEl.innerHTML = `<span class="turn-highlight">FIM DE JOGO!</span>`;
        else if (state.phase === 'decision_table_wait') roundInfoEl.innerHTML = `<span class="turn-highlight">DECISÃO DOS JUÍZES</span>`;
        else { const turnName = state.whoseTurn ? (state.fighters[state.whoseTurn]?.nome || '...') : '...'; roundInfoEl.innerHTML = `ROUND ${state.currentRound} - RODADA ${state.currentTurn} - Vez de: <span class="turn-highlight">${turnName}</span>`; }
        
        document.getElementById('player1-area').classList.toggle('active-turn', state.whoseTurn === 'player1');
        document.getElementById('player2-area').classList.toggle('active-turn', state.whoseTurn === 'player2');
        
        const actionWrapper = document.getElementById('action-buttons-wrapper');
        if (myPlayerKey === 'spectator' || myPlayerKey === 'host') { actionWrapper.classList.add('hidden'); } 
        else { actionWrapper.classList.remove('hidden'); }
        
        const isTurnOver = state.phase !== 'turn' && state.phase !== 'white_fang_follow_up';
        
        document.getElementById('p1-controls').classList.toggle('hidden', myPlayerKey !== 'player1');
        document.getElementById('p2-controls').classList.toggle('hidden', myPlayerKey !== 'player2');

        const p1_pa = state.fighters.player1?.pa || 0;
        document.querySelectorAll('#p1-controls button').forEach(btn => {
            const moveName = btn.dataset.move;
            const moveCost = moveName ? state.moves[moveName].cost : 0;
            const isWhiteFangFollowUp = state.phase === 'white_fang_follow_up' && state.followUpState?.playerKey === 'player1';
            let isDisabled = isTurnOver || state.whoseTurn !== 'player1';
            if (btn.classList.contains('action-btn')) {
                if (isWhiteFangFollowUp) { isDisabled = (moveName !== 'White Fang'); } 
                else { isDisabled = isDisabled || moveCost > p1_pa; }
            }
            btn.disabled = isDisabled;
        });

        const p2_pa = state.fighters.player2?.pa || 0;
        document.querySelectorAll('#p2-controls button').forEach(btn => {
            const moveName = btn.dataset.move;
            const moveCost = moveName ? state.moves[moveName].cost : 0;
            const isWhiteFangFollowUp = state.phase === 'white_fang_follow_up' && state.followUpState?.playerKey === 'player2';
            let isDisabled = isTurnOver || state.whoseTurn !== 'player2';
            if (btn.classList.contains('action-btn')) {
                if (isWhiteFangFollowUp) { isDisabled = (moveName !== 'White Fang'); } 
                else { isDisabled = isDisabled || moveCost > p2_pa; }
            }
            btn.disabled = isDisabled;
        });
        document.getElementById('forfeit-btn').disabled = isTurnOver || myPlayerKey === 'spectator' || myPlayerKey === 'host' || state.whoseTurn !== myPlayerKey;
    }

    // --- OUVINTES DO SOCKET.IO ---
    socket.on('assignPlayer', (key) => myPlayerKey = key);
    socket.on('gameCreated', ({ roomId, gameMode }) => {
        currentRoomId = roomId;
        if (gameMode === 'arena') {
            showScreen(arenaLobbyScreen);
            const p1Link = `${window.location.origin}?room=${roomId}&player=player1`;
            const p2Link = `${window.location.origin}?room=${roomId}&player=player2`;
            const specLink = `${window.location.origin}?room=${roomId}&spectate=true`;
            const arenaLinkP1 = document.getElementById('arena-link-p1');
            const arenaLinkP2 = document.getElementById('arena-link-p2');
            const arenaLinkSpec = document.getElementById('arena-link-spectator');
            arenaLinkP1.textContent = p1Link;
            arenaLinkP2.textContent = p2Link;
            arenaLinkSpec.textContent = specLink;
            arenaLinkP1.onclick = () => copyToClipboard(p1Link, arenaLinkP1);
            arenaLinkP2.onclick = () => copyToClipboard(p2Link, arenaLinkP2);
            arenaLinkSpec.onclick = () => copyToClipboard(specLink, arenaLinkSpec);
        }
    });
    socket.on('arenaPlayerJoined', ({ playerKey }) => {
        const statusEl = document.querySelector(`#arena-p${playerKey.slice(-1)}-status .status-waiting`);
        if (statusEl) { statusEl.textContent = 'Conectado. Escolhendo personagem...'; statusEl.className = 'status-ready'; }
    });
    socket.on('arenaCharacterChosen', ({ playerKey, character }) => {
        const statusBox = document.querySelector(`#arena-p${playerKey.slice(-1)}-status`);
        if (statusBox) { statusBox.querySelector('.char-choice').classList.remove('hidden'); statusBox.querySelector('.char-name').textContent = character.nome; }
    });
    socket.on('promptArenaConfiguration', ({p1, p2}) => {
        startArenaFightBtn.disabled = false;
        startArenaFightBtn.textContent = 'Configurar e Iniciar Luta';
        startArenaFightBtn.onclick = () => {
            const modalHtml = `<div style="display:flex; gap: 20px; text-align: left;">
                <div style="flex:1;"><h4 style="text-align:center;">Configurar ${p1.nome} (P1)</h4><label>AGI: <input type="number" id="arena-p1-agi" value="2"></label> <label>RES: <input type="number" id="arena-p1-res" value="2"></label><p>Golpes Especiais:</p><div id="arena-p1-moves-list" class="modal-moves-list"></div></div>
                <div style="flex:1; border-left: 1px solid #555; padding-left: 20px;"><h4 style="text-align:center;">Configurar ${p2.nome} (P2)</h4><label>AGI: <input type="number" id="arena-p2-agi" value="2"></label> <label>RES: <input type="number" id="arena-p2-res" value="2"></label><p>Golpes Especiais:</p><div id="arena-p2-moves-list" class="modal-moves-list"></div></div>
            </div>`;
            showInteractiveModal("Configurar Luta da Arena", modalHtml, "Iniciar Luta!", null);
            renderSpecialMoveSelection(document.getElementById('arena-p1-moves-list'), availableSpecialMoves);
            renderSpecialMoveSelection(document.getElementById('arena-p2-moves-list'), availableSpecialMoves);
            modalButton.onclick = () => {
                const p1_config = {agi: document.getElementById('arena-p1-agi').value, res: document.getElementById('arena-p1-res').value, specialMoves: Array.from(document.querySelectorAll('#arena-p1-moves-list .selected')).map(c => c.dataset.name)};
                const p2_config = {agi: document.getElementById('arena-p2-agi').value, res: document.getElementById('arena-p2-res').value, specialMoves: Array.from(document.querySelectorAll('#arena-p2-moves-list .selected')).map(c => c.dataset.name)};
                socket.emit('configureArenaFight', { p1_config, p2_config });
                modal.classList.add('hidden');
            };
        };
    });
    socket.on('promptSpecialMoves', (data) => {
        availableSpecialMoves = data.availableMoves;
        specialMovesTitle.innerText = 'Selecione seus Golpes Especiais';
        renderSpecialMoveSelection(specialMovesList, availableSpecialMoves);
        showScreen(selectionScreen);
        selectionScreen.classList.remove('active');
        specialMovesModal.classList.remove('hidden');
        confirmSpecialMovesBtn.onclick = () => {
            const selectedMoves = Array.from(specialMovesList.querySelectorAll('.selected')).map(card => card.dataset.name);
            socket.emit('playerAction', { type: 'set_p1_special_moves', playerKey: myPlayerKey, moves: selectedMoves });
            specialMovesModal.classList.add('hidden');
            showScreen(lobbyScreen);
            lobbyBackBtn.classList.remove('hidden');
            document.querySelector('#lobby-content').classList.add('hidden');
            shareContainer.classList.remove('hidden');
        };
    });
    socket.on('promptP2StatsAndMoves', ({ p2data, availableMoves }) => {
        const modalContentHtml = `...`; // Lógica do modo clássico
        showInteractiveModal("Definir Oponente", modalContentHtml, "Confirmar e Iniciar Luta", null);
    });
    socket.on('gameUpdate', (state) => {
        const isPreGame = currentGameState === null || ['waiting', 'p1_special_moves_selection', 'p2_stat_assignment', 'arena_waiting'].includes(currentGameState?.phase);
        currentGameState = state;
        updateUI(state);
        const isGameStarting = isPreGame && !['waiting', 'p1_special_moves_selection', 'p2_stat_assignment', 'arena_waiting'].includes(state.phase);
        if (isGameStarting && !fightScreen.classList.contains('active')) {
            showScreen(fightScreen);
            if(myPlayerKey === 'host') exitGameBtn.classList.remove('hidden');
            if(myPlayerKey === 'player1' && state.gameMode === 'classic') {
                exitGameBtn.classList.remove('hidden');
                copySpectatorLinkInGameBtn.classList.remove('hidden');
            }
        }
    });
    socket.on('roomCreated', (roomId) => {
        currentRoomId = roomId;
        const p2Url = `${window.location.origin}?room=${roomId}`;
        const specUrl = `${window.location.origin}?room=${roomId}&spectate=true`;
        const shareLinkP2 = document.getElementById('share-link-p2');
        const shareLinkSpectator = document.getElementById('share-link-spectator');
        shareLinkP2.textContent = p2Url;
        shareLinkSpectator.textContent = specUrl;
        shareLinkP2.onclick = () => copyToClipboard(p2Url, shareLinkP2);
        shareLinkSpectator.onclick = () => copyToClipboard(specUrl, shareLinkSpectator);
        document.querySelector('#lobby-content').classList.add('hidden');
        shareContainer.classList.remove('hidden');
    });

    // ... (restante do código)
    initialize();
});