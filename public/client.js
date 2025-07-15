document.addEventListener('DOMContentLoaded', () => {
    let myPlayerKey = null;
    let isGm = false; // Nova variável para identificar o GM
    let currentGameState = null;
    let currentRoomId = new URLSearchParams(window.location.search).get('room');
    const socket = io();

    let player1SetupData = { scenario: null };
    let availableSpecialMoves = {};

    const allScreens = document.querySelectorAll('.screen');
    const gameWrapper = document.getElementById('game-wrapper');
    const modeSelectionScreen = document.getElementById('mode-selection-screen');
    const arenaLobbyScreen = document.getElementById('arena-lobby-screen');
    const modeClassicBtn = document.getElementById('mode-classic-btn');
    const modeArenaBtn = document.getElementById('mode-arena-btn');
    const scenarioScreen = document.getElementById('scenario-screen');
    const scenarioListContainer = document.getElementById('scenario-list-container');
    const selectionScreen = document.getElementById('selection-screen');
    const lobbyScreen = document.getElementById('lobby-screen');
    const fightScreen = document.getElementById('fight-screen');
    const charListContainer = document.getElementById('character-list-container');
    const confirmBtn = document.getElementById('confirm-selection-btn');
    const selectionTitle = document.getElementById('selection-title');
    const lobbyContent = document.getElementById('lobby-content');
    const shareContainer = document.getElementById('share-container');
    const copySpectatorLinkInGameBtn = document.getElementById('copy-spectator-link-ingame');
    let modal = document.getElementById('modal');
    let modalTitle = document.getElementById('modal-title');
    let modalText = document.getElementById('modal-text');
    let modalButton = document.getElementById('modal-button');
    const p1Controls = document.getElementById('p1-controls');
    const p2Controls = document.getElementById('p2-controls');
    const p1SpecialMovesContainer = document.getElementById('p1-special-moves');
    const p2SpecialMovesContainer = document.getElementById('p2-special-moves');
    const specialMovesModal = document.getElementById('special-moves-modal');
    const specialMovesTitle = document.getElementById('special-moves-title');
    const specialMovesList = document.getElementById('special-moves-list');
    const confirmSpecialMovesBtn = document.getElementById('confirm-special-moves-btn');
    const getUpSuccessOverlay = document.getElementById('get-up-success-overlay');
    const getUpSuccessContent = document.getElementById('get-up-success-content');
    const charSelectBackBtn = document.getElementById('char-select-back-btn');
    const specialMovesBackBtn = document.getElementById('special-moves-back-btn');
    const lobbyBackBtn = document.getElementById('lobby-back-btn');
    const exitGameBtn = document.getElementById('exit-game-btn');

    const SCENARIOS = { 'Ringue Clássico': 'Ringue.png', 'Arena Subterrânea': 'Ringue2.png', 'Dojo Antigo': 'Ringue3.png', 'Ginásio Moderno': 'Ringue4.png', 'Ringue na Chuva': 'Ringue5.png' };
    const CHARACTERS_P1 = { 'Kureha Shoji':{agi:3,res:1},'Erik Adler':{agi:2,res:2},'Ivan Braskovich':{agi:1,res:3},'Hayato Takamura':{agi:4,res:4},'Logan Graves':{agi:3,res:2},'Daigo Kurosawa':{agi:1,res:4},'Jamal Briggs':{agi:2,res:3},'Takeshi Arada':{agi:3,res:2},'Kaito Mishima':{agi:4,res:3},'Kuga Shunji':{agi:3,res:4},'Eitan Barak':{agi:4,res:3} };
    const CHARACTERS_P2 = { 'Ryu':{agi:2,res:3},'Yobu':{agi:2,res:3},'Nathan':{agi:2,res:3},'Okami':{agi:2,res:3} };

    function showScreen(screenToShow) {
        allScreens.forEach(screen => {
            screen.classList.toggle('active', screen.id === screenToShow.id);
        });
    }

    function handlePlayerControlClick(event) {
        if (!myPlayerKey || (myPlayerKey !== 'player1' && myPlayerKey !== 'player2')) return;

        const target = event.target.closest('button'); 
        
        if (!target || target.disabled) return;

        const isP1Control = p1Controls.contains(target);
        const isP2Control = p2Controls.contains(target);
        if ((myPlayerKey === 'player1' && !isP1Control) || (myPlayerKey === 'player2' && !isP2Control)) {
            return;
        }

        const move = target.dataset.move;
        
        if (move) {
            socket.emit('playerAction', { type: 'attack', move: move, playerKey: myPlayerKey });
        } else if (target.id === 'p1-end-turn-btn' || target.id === 'p2-end-turn-btn') {
            socket.emit('playerAction', { type: 'end_turn', playerKey: myPlayerKey });
        }
    }

    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        currentRoomId = urlParams.get('room');
        const arenaPlayerKey = urlParams.get('player');
        const isSpectator = urlParams.get('spectate') === 'true';

        [charSelectBackBtn, specialMovesBackBtn, lobbyBackBtn, exitGameBtn, copySpectatorLinkInGameBtn].forEach(btn => btn.classList.add('hidden'));
        
        if (arenaPlayerKey && currentRoomId) {
            myPlayerKey = arenaPlayerKey;
            socket.emit('joinArenaGame', { roomId: currentRoomId, playerKey: arenaPlayerKey });
            showScreen(selectionScreen);
            selectionTitle.innerText = `Jogador ${arenaPlayerKey === 'player1' ? 1 : '2'}: Selecione seu Lutador`;
            confirmBtn.innerText = 'Confirmar Personagem';
            renderCharacterSelection('p2', false);
        } else if (isSpectator && currentRoomId) {
            showScreen(lobbyScreen);
            lobbyContent.innerHTML = `<p>Entrando como espectador...</p>`;
            socket.emit('spectateGame', currentRoomId);
        } else if (currentRoomId) {
            showScreen(selectionScreen);
            selectionTitle.innerText = 'Jogador 2: Selecione seu Lutador';
            confirmBtn.innerText = 'Entrar na Luta';
            renderCharacterSelection('p2', false);
        } else {
            showScreen(modeSelectionScreen);
        }
        
        confirmBtn.addEventListener('click', onConfirmSelection);
        
        modeClassicBtn.onclick = () => {
            myPlayerKey = 'player1';
            showScreen(scenarioScreen);
            renderScenarioSelection('classic');
            charSelectBackBtn.classList.remove('hidden');
            specialMovesBackBtn.classList.remove('hidden');
            lobbyBackBtn.classList.remove('hidden');
            copySpectatorLinkInGameBtn.classList.remove('hidden');
        };
        modeArenaBtn.onclick = () => {
            myPlayerKey = 'host';
            exitGameBtn.classList.remove('hidden');
            showScreen(scenarioScreen);
            renderScenarioSelection('arena');
        };

        charSelectBackBtn.addEventListener('click', () => showScreen(scenarioScreen));
        specialMovesBackBtn.addEventListener('click', () => {
            alert('A partida já foi criada no servidor. Para alterar o personagem, a página será recarregada.');
            location.reload();
        });
        lobbyBackBtn.addEventListener('click', () => {
             specialMovesModal.classList.remove('hidden');
        });
        exitGameBtn.addEventListener('click', () => {
            showInfoModal(
                "Sair da Partida",
                `<p>Tem certeza que deseja voltar ao menu principal? A partida atual será encerrada.</p><div style="display: flex; justify-content: center; gap: 20px; margin-top: 20px;"><button id="confirm-exit-btn" style="background-color: #dc3545; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Sim, Sair</button><button id="cancel-exit-btn" style="background-color: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Não, Ficar</button></div>`
            );
            document.getElementById('confirm-exit-btn').onclick = () => {
                socket.disconnect();
                window.location.href = '/';
            };
            document.getElementById('cancel-exit-btn').onclick = () => modal.classList.add('hidden');
        });
        
        p1Controls.addEventListener('click', handlePlayerControlClick);
        p2Controls.addEventListener('click', handlePlayerControlClick);
        
        document.getElementById('forfeit-btn').onclick = () => {
            if (myPlayerKey && myPlayerKey !== 'spectator' && myPlayerKey !== 'host' && currentGameState && (currentGameState.phase === 'turn' || currentGameState.phase === 'white_fang_follow_up') && currentGameState.whoseTurn === myPlayerKey) {
                showForfeitConfirmation();
            }
        };

        // --- Listener para o Menu de Trapaças ---
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'c' && isGm) {
                if (currentGameState && (currentGameState.phase === 'decision_table_wait' || currentGameState.phase === 'gameover')) {
                    // Não faz nada se o jogo já acabou por rounds.
                    return;
                }
                socket.emit('playerAction', { type: 'toggle_pause' });
            }
        });
    }

    function renderScenarioSelection(mode = 'classic') {
        scenarioListContainer.innerHTML = '';
        Object.entries(SCENARIOS).forEach(([name, fileName]) => {
            const card = document.createElement('div');
            card.className = 'scenario-card';
            card.innerHTML = `<img src="images/${fileName}" alt="${name}"><div class="scenario-name">${name}</div>`;
            card.onclick = () => {
                if (mode === 'classic') {
                    player1SetupData.scenario = fileName;
                    showScreen(selectionScreen);
                    selectionTitle.innerText = 'Jogador 1: Selecione seu Lutador';
                    confirmBtn.innerText = 'Confirmar Personagem';
                    confirmBtn.disabled = false;
                    renderCharacterSelection('p1', true);
                } else {
                    socket.emit('createArenaGame', { scenario: fileName });
                    showScreen(arenaLobbyScreen);
                }
            };
            scenarioListContainer.appendChild(card);
        });
    }

    function onConfirmSelection() {
        const selectedCard = document.querySelector('.char-card.selected');
        if (!selectedCard) { alert('Por favor, selecione um lutador!'); return; }
        let playerData = { nome: selectedCard.dataset.name, img: selectedCard.dataset.img };
        
        if (myPlayerKey === 'player1' && !currentRoomId) {
            playerData.agi = selectedCard.querySelector('.agi-input').value;
            playerData.res = selectedCard.querySelector('.res-input').value;
            confirmBtn.disabled = true;
            socket.emit('createGame', { player1Data: playerData, scenario: player1SetupData.scenario });
        } else if (myPlayerKey === 'player1' || myPlayerKey === 'player2') {
             confirmBtn.disabled = true;
             socket.emit('selectArenaCharacter', { character: playerData });
             showScreen(lobbyScreen);
             lobbyContent.innerHTML = `<p>Personagem selecionado! Aguardando o Anfitrião configurar e iniciar a partida...</p>`;
        } else {
            confirmBtn.disabled = true;
            showScreen(lobbyScreen);
            lobbyContent.innerHTML = `<p>Aguardando o Jogador 1 definir seus atributos e golpes...</p>`;
            socket.emit('joinGame', { roomId: currentRoomId, player2Data: playerData });
        }
    }

    function renderCharacterSelection(playerType, showStatsInputs = false) {
        charListContainer.innerHTML = '';
        const charData = playerType === 'p1' ? CHARACTERS_P1 : CHARACTERS_P2;
        for (const name in charData) {
            const stats = charData[name];
            const card = document.createElement('div');
            card.className = 'char-card';
            card.dataset.name = name;
            card.dataset.img = `images/${name}.png`;
            const statsHtml = showStatsInputs ? `<div class="char-stats"><label>AGI: <input type="number" class="agi-input" value="${stats.agi}"></label><label>RES: <input type="number" class="res-input" value="${stats.res}"></label></div>` : ``;
            card.innerHTML = `<img src="images/${name}.png" alt="${name}"><div class="char-name">${name}</div>${statsHtml}`;
            card.addEventListener('click', () => { document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected')); card.classList.add('selected'); });
            charListContainer.appendChild(card);
        }
    }

    function renderSpecialMoveSelection(container, availableMoves) {
        container.innerHTML = '';
        for (const moveName in availableMoves) {
            const moveData = availableMoves[moveName];
            const displayName = moveData.displayName || moveName;
            const card = document.createElement('div');
            card.className = 'special-move-card';
            card.dataset.name = moveName;
            card.innerHTML = `<h4>${displayName}</h4><p>Custo: ${moveData.cost} PA</p><p>Dano: ${moveData.damage}</p><p>Penalidade: ${moveData.penalty}</p>`;
            card.addEventListener('click', () => card.classList.toggle('selected'));
            container.appendChild(card);
        }
    }
    
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
            lobbyContent.innerHTML = `<p>Aguardando oponente se conectar...</p>`;
        };
    });

    socket.on('promptP2StatsAndMoves', ({ p2data, availableMoves }) => {
        const modalContentHtml = `<div style="display:flex; gap: 30px;">
            <div style="flex: 1; text-align: center;">
                <h4>Definir Atributos de ${p2data.nome}</h4>
                <img src="${p2data.img}" alt="${p2data.nome}" style="width: 80px; height: 80px; border-radius: 50%; background: #555; margin: 10px auto; display: block;">
                <label>AGI: <input type="number" id="p2-stat-agi" value="2" style="width: 50px; text-align: center;"></label>
                <label>RES: <input type="number" id="p2-stat-res" value="2" style="width: 50px; text-align: center;"></label>
            </div>
            <div style="flex: 2; border-left: 1px solid #555; padding-left: 20px; text-align: center;">
                <h4>Escolher Golpes Especiais</h4>
                <div id="p2-moves-selection-list"></div>
            </div>
        </div>`;
        showInteractiveModal("Definir Oponente", modalContentHtml, "Confirmar e Iniciar Luta", null);
        const p2MovesContainer = document.getElementById('p2-moves-selection-list');
        renderSpecialMoveSelection(p2MovesContainer, availableMoves);
        modalButton.onclick = () => {
            const agi = document.getElementById('p2-stat-agi').value;
            const res = document.getElementById('p2-stat-res').value;
            const selectedMoves = Array.from(p2MovesContainer.querySelectorAll('.selected')).map(card => card.dataset.name);
            if (!agi || !res || isNaN(agi) || isNaN(res) || agi < 1 || res < 1) { alert("Valores inválidos para AGI/RES."); return; }
            const action = { type: 'set_p2_stats', playerKey: myPlayerKey, stats: { agi, res }, moves: selectedMoves };
            socket.emit('playerAction', action);
            modal.classList.add('hidden');
        };
    });
    
    socket.on('arenaRoomCreated', (roomId) => {
        currentRoomId = roomId;
        const baseUrl = window.location.origin;
        const p1Url = `${baseUrl}?room=${roomId}&player=player1`;
        const p2Url = `${baseUrl}?room=${roomId}&player=player2`;
        const specUrl = `${baseUrl}?room=${roomId}&spectate=true`;

        document.getElementById('arena-link-p1').textContent = p1Url;
        document.getElementById('arena-link-p2').textContent = p2Url;
        document.getElementById('arena-link-spectator').textContent = specUrl;

        document.getElementById('arena-link-p1').onclick = () => copyToClipboard(p1Url, document.getElementById('arena-link-p1'));
        document.getElementById('arena-link-p2').onclick = () => copyToClipboard(p2Url, document.getElementById('arena-link-p2'));
        document.getElementById('arena-link-spectator').onclick = () => copyToClipboard(specUrl, document.getElementById('arena-link-spectator'));
    });

    socket.on('updateArenaLobby', ({ playerKey, status, character }) => {
        const statusEl = document.getElementById(`arena-${playerKey}-status`);
        if (status === 'connected') {
            statusEl.innerHTML = `<h4>Jogador ${playerKey === 'player1' ? 1 : 2}</h4><p style="color: #28a745;">Conectado! Aguardando seleção de personagem...</p>`;
        } else if (status === 'character_selected') {
            statusEl.innerHTML = `<h4>Jogador ${playerKey === 'player1' ? 1 : 2}</h4><p style="color: #17a2b8;">Selecionou: ${character.nome}</p><img src="${character.img}" style="width: 50px; height: 50px; border-radius: 50%;" />`;
        } else if (status === 'disconnected') {
            statusEl.innerHTML = `<h4>Jogador ${playerKey === 'player1' ? 1 : 2}</h4><p style="color: #dc3545;">Desconectado.</p>`;
        }
    });

    socket.on('promptArenaConfiguration', ({ p1, p2, availableMoves }) => {
        const modalContentHtml = `<div style="display:flex; gap: 20px;">
            <div style="flex: 1; text-align: center; border-right: 1px solid #555; padding-right: 20px;">
                <h4>${p1.nome} (Jogador 1)</h4>
                <label>AGI: <input type="number" id="arena-p1-agi" value="2" style="width: 50px; text-align: center;"></label>
                <label>RES: <input type="number" id="arena-p1-res" value="2" style="width: 50px; text-align: center;"></label>
                <p>Golpes Especiais:</p><div id="arena-p1-moves"></div>
            </div>
            <div style="flex: 1; text-align: center;">
                <h4>${p2.nome} (Jogador 2)</h4>
                <label>AGI: <input type="number" id="arena-p2-agi" value="2" style="width: 50px; text-align: center;"></label>
                <label>RES: <input type="number" id="arena-p2-res" value="2" style="width: 50px; text-align: center;"></label>
                <p>Golpes Especiais:</p><div id="arena-p2-moves"></div>
            </div>
        </div>`;
        showInteractiveModal("Configurar Batalha da Arena", modalContentHtml, "Iniciar Batalha", null);
        
        renderSpecialMoveSelection(document.getElementById('arena-p1-moves'), availableMoves);
        renderSpecialMoveSelection(document.getElementById('arena-p2-moves'), availableMoves);

        modalButton.onclick = () => {
            const p1_config = {
                agi: document.getElementById('arena-p1-agi').value,
                res: document.getElementById('arena-p1-res').value,
                specialMoves: Array.from(document.querySelectorAll('#arena-p1-moves .selected')).map(c => c.dataset.name)
            };
            const p2_config = {
                agi: document.getElementById('arena-p2-agi').value,
                res: document.getElementById('arena-p2-res').value,
                specialMoves: Array.from(document.querySelectorAll('#arena-p2-moves .selected')).map(c => c.dataset.name)
            };
            socket.emit('playerAction', { type: 'configure_and_start_arena', playerKey: 'host', p1_config, p2_config });
            modal.classList.add('hidden');
        };
    });


    socket.on('gameUpdate', (gameState) => {
        // --- INÍCIO DA CORREÇÃO ---
        const oldPhase = currentGameState ? currentGameState.phase : null;
        const wasPaused = oldPhase === 'paused';
        const PRE_GAME_PHASES = ['waiting', 'p1_special_moves_selection', 'p2_stat_assignment', 'arena_lobby', 'arena_configuring'];

        currentGameState = gameState;
        updateUI(gameState);
        
        const isNowPaused = gameState.phase === 'paused';
        if (isNowPaused && !wasPaused) {
            showCheatsModal();
        } else if (!isNowPaused && wasPaused) {
            modal.classList.add('hidden');
        }

        const wasInPreGame = !oldPhase || PRE_GAME_PHASES.includes(oldPhase);
        const isNowInGame = !PRE_GAME_PHASES.includes(gameState.phase);

        if (wasInPreGame && isNowInGame && !fightScreen.classList.contains('active')) {
            showScreen(fightScreen);
        }

        // --- Adicionando a lógica para posicionar os lutadores ---
        if (currentGameState.mode === 'classic') {
            gameWrapper.classList.add('mode-classic');
            gameWrapper.classList.remove('mode-arena');
        } else if (currentGameState.mode === 'arena') {
            gameWrapper.classList.add('mode-arena');
            gameWrapper.classList.remove('mode-classic');
        } else {
            gameWrapper.classList.remove('mode-classic', 'mode-arena');
        }
        // --- FIM DA CORREÇÃO ---
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

        lobbyContent.classList.add('hidden');
        shareContainer.classList.remove('hidden');
    });

    function copyToClipboard(text, element) { navigator.clipboard.writeText(text).then(() => { const originalText = element.textContent; element.textContent = 'Copiado!'; setTimeout(() => { element.textContent = originalText; }, 2000); }); }
    copySpectatorLinkInGameBtn.onclick = () => { if (currentRoomId) copyToClipboard(`${window.location.origin}?room=${currentRoomId}&spectate=true`, copySpectatorLinkInGameBtn); };

    function updateUI(state) {
        if (state.scenario) {
            gameWrapper.style.backgroundImage = `url('images/${state.scenario}')`;
        }

        p1SpecialMovesContainer.innerHTML = '';
        p2SpecialMovesContainer.innerHTML = '';

        ['player1', 'player2'].forEach(key => {
            const fighter = state.fighters[key];
            if (fighter) {
                document.getElementById(`${key}-fight-name`).innerText = fighter.nome;
                if (fighter.hpMax) {
                    document.getElementById(`${key}-hp-text`).innerText = `${fighter.hp} / ${fighter.hpMax}`;
                    document.getElementById(`${key}-hp-bar`).style.width = `${(fighter.hp / fighter.hpMax) * 100}%`;
                    document.getElementById(`${key}-def-text`).innerText = fighter.def;
                    document.getElementById(`${key}-hits`).innerText = fighter.hitsLanded;
                    document.getElementById(`${key}-knockdowns`).innerText = fighter.knockdowns;
                    document.getElementById(`${key}-damage-taken`).innerText = fighter.totalDamageTaken;
                    document.getElementById(`${key}-pa-dots`).innerHTML = Array(fighter.pa).fill('<div class="pa-dot"></div>').join('');
                }
                document.getElementById(`${key}-fight-img`).src = fighter.img;

                if (fighter.specialMoves) {
                    const container = (key === 'player1') ? p1SpecialMovesContainer : p2SpecialMovesContainer;
                    fighter.specialMoves.forEach(moveName => {
                        const moveData = state.moves[moveName];
                        if (!moveData) return; 
                        const displayName = moveData.displayName || moveName;
                        const btn = document.createElement('button');
                        btn.className = `action-btn special-btn-${key}`;
                        btn.dataset.move = moveName;
                        btn.textContent = `${displayName} (${moveData.cost} PA)`;
                        container.appendChild(btn);
                    });
                }
            } else if (key === 'player2' && state.pendingP2Choice) {
                document.getElementById(`${key}-fight-img`).src = state.pendingP2Choice.img;
            }
        });

        const roundInfoEl = document.getElementById('round-info');
        if (state.phase === 'paused') {
            roundInfoEl.innerHTML = `<span class="turn-highlight">JOGO PAUSADO</span>`;
        } else if (state.phase === 'gameover') {
            roundInfoEl.innerHTML = `<span class="turn-highlight">FIM DE JOGO!</span>`;
        } else if (state.phase === 'decision_table_wait') {
            roundInfoEl.innerHTML = `<span class="turn-highlight">DECISÃO DOS JUÍZES</span>`;
        } else if (state.phase.startsWith('arena_')) {
            roundInfoEl.innerHTML = `Aguardando início...`;
        } else {
            const turnName = state.whoseTurn ? state.fighters[state.whoseTurn].nome : '...';
            roundInfoEl.innerHTML = `ROUND ${state.currentRound} - RODADA ${state.currentTurn} - Vez de: <span class="turn-highlight">${turnName}</span>`;
        }
        
        document.getElementById('player1-area').classList.toggle('active-turn', state.whoseTurn === 'player1' && state.phase !== 'paused');
        document.getElementById('player2-area').classList.toggle('active-turn', state.whoseTurn === 'player2' && state.phase !== 'paused');
        
        const isPlayer = myPlayerKey === 'player1' || myPlayerKey === 'player2';
        const actionWrapper = document.getElementById('action-buttons-wrapper');
        if (!isPlayer) { actionWrapper.classList.add('hidden'); } 
        else { actionWrapper.classList.remove('hidden'); }
        
        const isActionPhase = state.phase === 'turn' || state.phase === 'white_fang_follow_up';
        
        p1Controls.classList.toggle('hidden', myPlayerKey !== 'player1');
        p2Controls.classList.toggle('hidden', myPlayerKey !== 'player2');
        
        document.querySelectorAll('#p1-controls button, #p2-controls button, #forfeit-btn').forEach(btn => {
            if (state.phase === 'paused' && !isGm) {
                btn.disabled = true;
            }
        });

        if (state.phase !== 'paused') {
            const p1_is_turn = state.whoseTurn === 'player1';
            document.querySelectorAll('#p1-controls button').forEach(btn => {
                let isDisabled = !p1_is_turn || !isActionPhase;

                if (!isDisabled) {
                    const moveName = btn.dataset.move;
                    if (state.phase === 'white_fang_follow_up') {
                        if (moveName && moveName !== 'White Fang') { isDisabled = true; }
                    } else if (moveName) {
                        const move = state.moves[moveName];
                        if (move && state.fighters.player1.pa < move.cost) { isDisabled = true; }
                    }
                }
                btn.disabled = isDisabled;
            });

            const p2_is_turn = state.whoseTurn === 'player2';
            document.querySelectorAll('#p2-controls button').forEach(btn => {
                let isDisabled = !p2_is_turn || !isActionPhase;
                if (!isDisabled) {
                    const moveName = btn.dataset.move;
                    if (state.phase === 'white_fang_follow_up') {
                        if (moveName && moveName !== 'White Fang') { isDisabled = true; }
                    } else if (moveName) {
                        const move = state.moves[moveName];
                        if (move && state.fighters.player2.pa < move.cost) { isDisabled = true; }
                    }
                }
                btn.disabled = isDisabled;
            });
            
            document.getElementById('forfeit-btn').disabled = !isActionPhase || !isPlayer || state.whoseTurn !== myPlayerKey;
        }

        const logBox = document.getElementById('fight-log');
        logBox.innerHTML = state.log.map(msg => `<p class="${msg.className || ''}">${msg.text}</p>`).join('');
        logBox.scrollTop = logBox.scrollHeight;
    }
    
    function showForfeitConfirmation() {
        const modalContentHtml = `<p>Você tem certeza que deseja jogar a toalha e desistir da luta?</p><div style="display: flex; justify-content: center; gap: 20px; margin-top: 20px;"><button id="confirm-forfeit-btn" style="background-color: #dc3545; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Sim, Desistir</button><button id="cancel-forfeit-btn" style="background-color: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Não, Continuar</button></div>`;
        showInfoModal("Jogar a Toalha", modalContentHtml);
        document.getElementById('confirm-forfeit-btn').onclick = () => { socket.emit('playerAction', { type: 'forfeit', playerKey: myPlayerKey }); modal.classList.add('hidden'); };
        document.getElementById('cancel-forfeit-btn').onclick = () => modal.classList.add('hidden');
    }

    function showInfoModal(title, text) {
        modalTitle.innerText = title;
        modalText.innerHTML = text;
        modalButton.style.display = 'none';
        modal.classList.remove('hidden');
    }

    function showInteractiveModal(title, text, btnText, action) {
        modalTitle.innerText = title;
        modalText.innerHTML = text;
        modalButton.innerText = btnText;
        modalButton.style.display = btnText ? 'inline-block' : 'none';
        modalButton.disabled = false;
        const newButton = modalButton.cloneNode(true);
        modalButton.parentNode.replaceChild(newButton, modalButton);
        modalButton = document.getElementById('modal-button');
        if (action) { modalButton.onclick = () => { modalButton.disabled = true; modalButton.innerText = "Aguarde..."; socket.emit('playerAction', action); }; }