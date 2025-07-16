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

    // --- INÍCIO DA MUDANÇA: Função de controle de tela atualizada ---
    function showScreen(screenToShow) {
        allScreens.forEach(screen => {
            screen.classList.toggle('active', screen.id === screenToShow.id);
        });

        // Controla a capacidade de rolagem para evitar "vazamento" de telas no mobile
        if (screenToShow.id === 'fight-screen') {
            // Permite a rolagem na tela de luta (necessário para o modo vertical)
            gameWrapper.style.overflowY = 'auto';
        } else {
            // Impede a rolagem em todas as outras telas
            gameWrapper.style.overflowY = 'hidden';
            // Reseta a posição da rolagem para o topo
            gameWrapper.scrollTop = 0;
        }
    }
    // --- FIM DA MUDANÇA ---

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
        const oldPhase = currentGameState ? currentGameState.phase : null;
        
        currentGameState = gameState;
        
        const wasPaused = oldPhase === 'paused';
        const isNowPaused = currentGameState.phase === 'paused';
        const PRE_GAME_PHASES = ['waiting', 'p1_special_moves_selection', 'p2_stat_assignment', 'arena_lobby', 'arena_configuring'];

        if (isNowPaused && !wasPaused) {
            showCheatsModal();
        } else if (!isNowPaused && wasPaused) {
            modal.classList.add('hidden');
        }

        updateUI(currentGameState);

        if (currentGameState.mode === 'classic') {
            gameWrapper.classList.add('mode-classic');
            gameWrapper.classList.remove('mode-arena');
        } else if (currentGameState.mode === 'arena') {
            gameWrapper.classList.add('mode-arena');
            gameWrapper.classList.remove('mode-classic');
        }
        
        const wasInPreGame = !oldPhase || PRE_GAME_PHASES.includes(oldPhase);
        const isNowInGame = !PRE_GAME_PHASES.includes(currentGameState.phase);

        if (wasInPreGame && isNowInGame && !fightScreen.classList.contains('active')) {
            showScreen(fightScreen);
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

        lobbyContent.classList.add('hidden');
        shareContainer.classList.remove('hidden');
    });

    function copyToClipboard(text, element) { navigator.clipboard.writeText(text).then(() => { const originalText = element.textContent; element.textContent = 'Copiado!'; setTimeout(() => { element.textContent = originalText; }, 2000); }); }
    copySpectatorLinkInGameBtn.onclick = () => { if (currentRoomId) copyToClipboard(`${window.location.origin}?room=${currentRoomId}&spectate=true`, copySpectatorLinkInGameBtn); };

    function updateUI(state) {
        if (state.scenario) {
            const gameArea = document.getElementById('game-area');
            // A imagem de fundo é aplicada tanto no wrapper quanto na área de jogo
            // para funcionar no desktop e no mobile
            gameWrapper.style.backgroundImage = `url('images/${state.scenario}')`;
            if (gameArea) {
                gameArea.style.backgroundImage = `url('images/${state.scenario}')`;
            }
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
            const turnName = state.whoseTurn ? (state.fighters[state.whoseTurn] ? state.fighters[state.whoseTurn].nome : '...') : '...';
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
        modal.classList.remove('hidden');
    }

    function showCheatsModal() {
        if (!isGm || !currentGameState) return;
        
        const p1 = currentGameState.fighters.player1;
        const p2 = currentGameState.fighters.player2;

        if (!p1 || !p2) {
            console.warn("Cheats tentado antes de ambos os lutadores estarem prontos.");
            socket.emit('playerAction', { type: 'toggle_pause' });
            return;
        }

        const cheatHtml = `
            <div style="display: flex; gap: 20px; justify-content: space-around; text-align: left;">
                <div id="cheat-p1">
                    <h4>${p1.nome}</h4>
                    <label>AGI: <input type="number" id="cheat-p1-agi" value="${p1.agi}"></label><br>
                    <label>RES: <input type="number" id="cheat-p1-res" value="${p1.res}"></label><br>
                    <label>HP: <input type="number" id="cheat-p1-hp" value="${p1.hp}"></label><br>
                    <label>PA: <input type="number" id="cheat-p1-pa" value="${p1.pa}"></label><br>
                </div>
                <div id="cheat-p2">
                    <h4>${p2.nome}</h4>
                    <label>AGI: <input type="number" id="cheat-p2-agi" value="${p2.agi}"></label><br>
                    <label>RES: <input type="number" id="cheat-p2-res" value="${p2.res}"></label><br>
                    <label>HP: <input type="number" id="cheat-p2-hp" value="${p2.hp}"></label><br>
                    <label>PA: <input type="number" id="cheat-p2-pa" value="${p2.pa}"></label><br>
                </div>
            </div>
        `;
        showInteractiveModal("Menu de Trapaças (GM)", cheatHtml, "Aplicar e Continuar", null);
        modalButton.onclick = () => {
            const cheats = {
                p1: {
                    agi: document.getElementById('cheat-p1-agi').value,
                    res: document.getElementById('cheat-p1-res').value,
                    hp: document.getElementById('cheat-p1-hp').value,
                    pa: document.getElementById('cheat-p1-pa').value,
                },
                p2: {
                    agi: document.getElementById('cheat-p2-agi').value,
                    res: document.getElementById('cheat-p2-res').value,
                    hp: document.getElementById('cheat-p2-hp').value,
                    pa: document.getElementById('cheat-p2-pa').value,
                }
            };
            socket.emit('playerAction', { type: 'apply_cheats', cheats });
            socket.emit('playerAction', { type: 'toggle_pause' }); // Continua o jogo
        };
    }

    function showDiceRollAnimation({ playerKey, rollValue, diceType }) {
        const diceOverlay = document.getElementById('dice-overlay');
        const diceContainer = document.getElementById(`${playerKey}-dice-result`);
        if (!diceOverlay || !diceContainer) { return; }
        let imagePrefix = (diceType === 'd6') ? (playerKey === 'player1' ? 'diceA' : 'diceP') : (playerKey === 'player1' ? 'D3A-' : 'D3P-');
        diceContainer.style.backgroundImage = `url('images/${imagePrefix}${rollValue}.png')`;
        diceOverlay.classList.remove('hidden');
        diceContainer.classList.remove('hidden');
        const hideAndResolve = () => { diceOverlay.classList.add('hidden'); diceContainer.classList.add('hidden'); };
        diceOverlay.addEventListener('click', hideAndResolve, { once: true });
        setTimeout(hideAndResolve, 2000); 
    }
    
    socket.on('playSound', (soundFile) => {
        if (!soundFile) return;
        const sound = new Audio(`sons/${soundFile}`);
        sound.currentTime = 0;
        sound.play().catch(e => console.error(`Erro ao tocar som: ${soundFile}`, e));
    });

    socket.on('triggerAttackAnimation', ({ attackerKey }) => { const img = document.getElementById(`${attackerKey}-fight-img`); if (img) { img.classList.add(`is-attacking-${attackerKey}`); setTimeout(() => img.classList.remove(`is-attacking-${attackerKey}`), 400); } });
    socket.on('triggerHitAnimation', ({ defenderKey }) => { const img = document.getElementById(`${defenderKey}-fight-img`); if (img) { img.classList.add('is-hit'); setTimeout(() => img.classList.remove('is-hit'), 500); } });
    
    socket.on('assignPlayer', (data) => { 
        myPlayerKey = data.playerKey;
        isGm = data.isGm;
        if (myPlayerKey === 'host') {
            exitGameBtn.classList.remove('hidden');
        }
    });

    socket.on('promptRoll', ({ targetPlayerKey, text, action }) => {
        let btn = document.getElementById(`${targetPlayerKey}-roll-btn`);
        const isMyTurnToRoll = myPlayerKey === targetPlayerKey;
        
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        btn = newBtn;

        btn.innerText = text;
        btn.classList.remove('hidden', 'inactive');

        if (isMyTurnToRoll) {
            btn.onclick = () => {
                btn.disabled = true; 
                socket.emit('playerAction', action);
            };
            btn.disabled = false;
        } else {
            btn.disabled = true;
            btn.onclick = null;
            if (myPlayerKey !== 'spectator' && myPlayerKey !== 'host' && !isGm) btn.classList.add('inactive');
        }
    });

    socket.on('hideRollButtons', () => { ['player1-roll-btn', 'player2-roll-btn'].forEach(id => document.getElementById(id).classList.add('hidden')); });
    
    socket.on('showModal', ({ title, text, btnText, action, targetPlayerKey, modalType, knockdownInfo }) => {
        let isMyTurnForAction = myPlayerKey === targetPlayerKey;
        if (currentGameState.mode === 'arena' && action?.type === 'reveal_winner') {
            isMyTurnForAction = myPlayerKey === 'host';
        }

        switch(modalType) {
            case 'gm_knockdown_decision':
                if (isGm) {
                    const cheatHtml = `
                        <p>${text}</p>
                        <div style="margin-top:20px; display: flex; justify-content: center; gap: 20px;">
                            <button id="gm-continue-btn" style="background-color: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Continuar</button>
                            <button id="gm-last-chance-btn" style="background-color: #ffeb3b; color: black; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Dar mais uma chance</button>
                        </div>
                        <p style="margin-top: 15px; font-size: 0.9em;">(Você também pode pressionar 'C' para abrir o menu de trapaças)</p>
                    `;
                    showInfoModal(title, cheatHtml);
                    document.getElementById('gm-continue-btn').onclick = () => {
                        socket.emit('playerAction', { type: 'resolve_knockdown_loss' });
                        modal.classList.add('hidden');
                    };
                    document.getElementById('gm-last-chance-btn').onclick = () => {
                        socket.emit('playerAction', { type: 'give_last_chance' });
                        modal.classList.add('hidden');
                    };
                }
                break;
            case 'gameover': showInfoModal(title, text); break;
            case 'decision_table':
                if (isMyTurnForAction) { showInteractiveModal(title, text, btnText, action); } 
                else { showInfoModal(title, text); }
                break;
            case 'knockdown':
                const downedFighterName = currentGameState.fighters[targetPlayerKey]?.nome || 'Oponente';
                let modalTitleText = `${downedFighterName} caiu!`;
                
                const attempts = knockdownInfo.attempts;
                const maxAttempts = knockdownInfo.isLastChance ? 5 : 4;
                const counts = ["1..... 2.....", "3..... 4.....", "5..... 6.....", "7..... 8.....", "9....."];
                const countText = attempts === 0 
                    ? `O juíz começa a contagem: ${counts[0]}`
                    : `A contagem continua: ${counts[attempts] || counts[counts.length-1]}`;

                let modalContentText = `<p style='text-align: center; font-style: italic; color: #ccc;'>${countText}</p>`;
                
                if (knockdownInfo.lastRoll) {
                    modalContentText += `Rolagem: <strong>${knockdownInfo.lastRoll}</strong> <span>(precisa de 7 ou mais)</span>`;
                }

                if (targetPlayerKey === myPlayerKey) {
                    modalTitleText = `Você caiu!`;
                    modalContentText += `<br>Tentativas restantes: ${maxAttempts - attempts}`;
                    showInteractiveModal(modalTitleText, modalContentText, 'Tentar Levantar', action);
                } else {
                     modalContentText = `<p style='text-align: center; font-style: italic; color: #ccc;'>${countText}</p> Aguarde a contagem...`;
                     if (knockdownInfo.lastRoll) {
                        modalContentText += `<br>Rolagem: <strong>${knockdownInfo.lastRoll}</strong> <span>(precisa de 7 ou mais)</span>`;
                    }
                    showInfoModal(modalTitleText, modalContentText);
                }
                break;
        }
    });

    socket.on('getUpSuccess', ({ downedPlayerName, rollValue }) => { modal.classList.add('hidden'); getUpSuccessOverlay.classList.remove('hidden'); getUpSuccessContent.innerHTML = `${rollValue} - ${downedPlayerName.toUpperCase()} CONSEGUIU SE LEVANTAR! <span>(precisava de 7 ou mais)</span>`; setTimeout(() => getUpSuccessOverlay.classList.add('hidden'), 3000); });
    socket.on('hideModal', () => modal.classList.add('hidden'));
    socket.on('diceRoll', showDiceRollAnimation);
    socket.on('opponentDisconnected', ({message}) => { showInfoModal("Partida Encerrada", `${message}<br>Recarregue a página para jogar novamente.`); document.querySelectorAll('button').forEach(btn => btn.disabled = true); });

    initialize();
    const scaleGame = () => { const w = document.getElementById('game-wrapper'); const s = Math.min(window.innerWidth / 1280, window.innerHeight / 720); w.style.transform = `scale(${s})`; w.style.left = `${(window.innerWidth - (1280 * s)) / 2}px`; w.style.top = `${(window.innerHeight - (720 * s)) / 2}px`; };
    scaleGame();
    window.addEventListener('resize', scaleGame);
});