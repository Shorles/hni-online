document.addEventListener('DOMContentLoaded', () => {
    let myRole = null;
    let myPlayerKey = null; // Mantido para modo Arena
    let myFighterId = null; // NOVO: ID do personagem do jogador no modo Clássico
    let isGm = false;
    let currentGameState = null;
    let currentRoomId = new URLSearchParams(window.location.search).get('room');
    const socket = io();

    let player1SetupData = { scenario: null };
    let availableSpecialMoves = {};
    
    let ALL_FIGHTERS_DATA = {};

    const allScreens = document.querySelectorAll('.screen');
    const gameWrapper = document.getElementById('game-wrapper');

    // Novas telas
    const passwordScreen = document.getElementById('password-screen');
    const gmInitialLobby = document.getElementById('gm-initial-lobby');
    const playerWaitingScreen = document.getElementById('player-waiting-screen');

    // Telas antigas
    const modeSelectionScreen = document.getElementById('mode-selection-screen');
    const arenaLobbyScreen = document.getElementById('arena-lobby-screen'); // Reutilizado para GM
    const scenarioScreen = document.getElementById('scenario-screen');
    const selectionScreen = document.getElementById('selection-screen');
    const lobbyScreen = document.getElementById('lobby-screen'); // Reutilizado para P2 Classic
    const fightScreen = document.getElementById('fight-screen');
    const theaterScreen = document.getElementById('theater-screen');

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
    const helpBtn = document.getElementById('help-btn');
    const gmModeSwitchBtn = document.getElementById('gm-mode-switch-btn');

    const theaterBackgroundViewport = document.getElementById('theater-background-viewport');
    const theaterBackgroundImage = document.getElementById('theater-background-image');
    const theaterTokenContainer = document.getElementById('theater-token-container');
    const theaterGmPanel = document.getElementById('theater-gm-panel');
    const theaterCharList = document.getElementById('theater-char-list');
    const theaterGlobalScale = document.getElementById('theater-global-scale');
    const theaterChangeScenarioBtn = document.getElementById('theater-change-scenario-btn');
    const copyTheaterSpectatorLinkBtn = document.getElementById('copy-theater-spectator-link');
    const theaterBackBtn = document.getElementById('theater-back-btn');
    const theaterPublishBtn = document.getElementById('theater-publish-btn');
    
    // NOVO: Div para mostrar coordenadas
    const coordsDisplay = document.createElement('div');
    coordsDisplay.id = 'coords-display';
    coordsDisplay.style.position = 'fixed';
    coordsDisplay.style.top = '10px';
    coordsDisplay.style.left = '10px';
    coordsDisplay.style.backgroundColor = 'rgba(0,0,0,0.7)';
    coordsDisplay.style.color = 'white';
    coordsDisplay.style.padding = '10px';
    coordsDisplay.style.border = '1px solid white';
    coordsDisplay.style.borderRadius = '5px';
    coordsDisplay.style.zIndex = '99999';
    coordsDisplay.style.display = 'none';
    document.body.appendChild(coordsDisplay);

    const SCENARIOS = { 'Ringue Clássico': 'Ringue.png', 'Arena Subterrânea': 'Ringue2.png', 'Dojo Antigo': 'Ringue3.png', 'Ginásio Moderno': 'Ringue4.png', 'Ringue na Chuva': 'Ringue5.png' };
    
    const PLAYABLE_CHARACTERS = { 'Ryu':{img:'images/Ryu.png'},'Yobu':{img:'images/Yobu.png'},'Nathan':{img:'images/Nathan.png'},'Okami':{img:'images/Okami.png'} };
    
    const DYNAMIC_CHARACTERS = [];
    for (let i = 1; i <= 50; i++) {
        DYNAMIC_CHARACTERS.push({
            name: `Personagem (${i})`,
            img: `images/personagens/Personagem (${i}).png`
        });
    }
    
    const THEATER_SCENARIOS = {
        "cenarios externos": { baseName: "externo", count: 50 },
        "cenarios internos": { baseName: "interno", count: 50 },
        "cenas": { baseName: "cena", count: 50 },
        "fichas": { baseName: "ficha", count: 50 },
        "objetos": { baseName: "objeto", count: 50 },
        "outros": { baseName: "outro", count: 50 }
    };

    let linkInitialized = false;

    socket.on('availableFighters', ({ p1 }) => {
        ALL_FIGHTERS_DATA = p1 || {};
        if(myRole === 'gm' && theaterScreen.classList.contains('active')){
            initializeTheaterMode();
        }
    });

    function showHelpModal() {
        if (!currentGameState || currentGameState.mode === 'theater') return;
        const MOVE_EFFECTS = {'Liver Blow': '30% de chance de remover 1 PA do oponente.','Clinch': 'Se acertar, remove 2 PA do oponente. Crítico remove 4.','Golpe Ilegal': 'Chance de perder pontos ou ser desqualificado. A chance de DQ aumenta a cada uso.','Esquiva': '(Reação) Sua DEF passa a ser calculada com AGI em vez de RES por 2 rodadas.','Counter': '(Reação) Intercepta o golpe do oponente. O custo de PA é igual ao do golpe recebido. Ambos rolam ataque; o maior resultado vence e causa o dobro de dano no perdedor.','Flicker Jab': 'Repete o ataque continuamente até errar.','White Fang': 'Permite um segundo uso consecutivo sem custo de PA.','OraOraOra': 'Nenhum'};
        const BASIC_MOVES_ORDER = ['Jab', 'Direto', 'Upper', 'Liver Blow', 'Clinch', 'Golpe Ilegal', 'Esquiva'];
        let playerSpecialMoves = [];
        
        let fighter = null;
        if (myFighterId && currentGameState.mode === 'classic') {
             fighter = currentGameState.players.find(p => p.id === myFighterId);
        } else if (myPlayerKey === 'player1' || myPlayerKey === 'player2') {
             fighter = currentGameState.fighters[myPlayerKey];
        }

        if (fighter && fighter.specialMoves) { 
             playerSpecialMoves = fighter.specialMoves; 
        } else { 
            playerSpecialMoves = Object.keys(currentGameState.moves).filter(m => !BASIC_MOVES_ORDER.includes(m)); 
        }

        playerSpecialMoves.sort();
        let tableHtml = `<div class="help-table-container"><table id="help-modal-table"><thead><tr><th>Nome</th><th>Custo (PA)</th><th>Dano</th><th>Penalidade</th><th>Efeito</th></tr></thead><tbody>`;
        const renderRow = (moveName) => {
            const move = currentGameState.moves[moveName]; if (!move) return '';
            const displayName = move.displayName || moveName; const cost = moveName === 'Counter' ? 'Variável' : move.cost; const effect = MOVE_EFFECTS[moveName] || 'Nenhum'; const penaltyDisplay = move.penalty > 0 ? `-${move.penalty}` : move.penalty;
            return `<tr><td>${displayName}</td><td>${cost}</td><td>${move.damage}</td><td>${penaltyDisplay}</td><td>${effect}</td></tr>`;
        };
        BASIC_MOVES_ORDER.forEach(moveName => { tableHtml += renderRow(moveName); });
        if (playerSpecialMoves.length > 0) { tableHtml += `<tr class="special-moves-divider"><td colspan="5"></td></tr>`; }
        playerSpecialMoves.forEach(moveName => { tableHtml += renderRow(moveName); });
        tableHtml += `</tbody></table></div>`;
        showInfoModal("Guia de Golpes e Efeitos", tableHtml);
    }

    function showScreen(screenToShow) { allScreens.forEach(screen => { screen.classList.toggle('active', screen.id === screenToShow.id); }); }

    function handlePlayerControlClick(event) {
        if (!currentGameState) return;

        const target = event.target.closest('button'); 
        if (!target || target.disabled) return;
        
        const move = target.dataset.move;
        
        if (currentGameState.mode === 'classic') {
            const myTurnFighterId = currentGameState.turnOrder[currentGameState.turnIndex];
            const myTurnFighter = currentGameState.players.find(p => p.id === myTurnFighterId);
            
            // Verifica se é o turno de um jogador e se é este cliente
            if (!myTurnFighter || myTurnFighter.socketId !== socket.id) return;
            
            myFighterId = myTurnFighter.id;

            if (move) {
                const targetFighter = document.querySelector('.fighter-card.target');
                if (!targetFighter) {
                    alert("Selecione um alvo!");
                    return;
                }
                const targetId = targetFighter.dataset.id;
                socket.emit('playerAction', { type: 'attack', move, fighterId: myFighterId, targetId });
            } else if (target.id === `p2-end-turn-btn` || target.classList.contains('end-turn-btn')) { 
                socket.emit('playerAction', { type: 'end_turn', fighterId: myFighterId });
            }

        } else if (currentGameState.mode === 'arena') {
             if (!myPlayerKey || (myPlayerKey !== 'player1' && myPlayerKey !== 'player2')) return;
            if (move === 'Golpe Ilegal') {
                const fighter = currentGameState.fighters[myPlayerKey]; const moveData = currentGameState.moves['Golpe Ilegal'];
                if (fighter && moveData && fighter.pa >= moveData.cost) { showIllegalMoveConfirmation(); }
            } else if (move) { socket.emit('playerAction', { type: 'attack', move: move, playerKey: myPlayerKey });
            } else if (target.id === `p${myPlayerKey.slice(-1)}-end-turn-btn`) { socket.emit('playerAction', { type: 'end_turn', playerKey: myPlayerKey }); }
        }
    }
    
    function showIllegalMoveConfirmation() {
        const modalContentHtml = `<p>Golpes ilegais são efetivos, mas podem gerar perda de pontos ou desqualificação imediata. Deseja continuar?</p><div style="display: flex; justify-content: center; gap: 20px; margin-top: 20px;"><button id="confirm-illegal-btn" style="background-color: #dc3545; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Sim, usar golpe</button><button id="cancel-illegal-btn" style="background-color: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Não, cancelar</button></div>`;
        showInfoModal("Aviso de Golpe Ilegal", modalContentHtml);
        document.getElementById('confirm-illegal-btn').onclick = () => { socket.emit('playerAction', { type: 'attack', move: 'Golpe Ilegal', playerKey: myPlayerKey }); modal.classList.add('hidden'); };
        document.getElementById('cancel-illegal-btn').onclick = () => modal.classList.add('hidden');
    }

    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        currentRoomId = urlParams.get('room');
        const roleFromUrl = urlParams.get('role');

        [charSelectBackBtn, specialMovesBackBtn, lobbyBackBtn, exitGameBtn, copySpectatorLinkInGameBtn, copyTheaterSpectatorLinkBtn, theaterBackBtn].forEach(btn => btn.classList.add('hidden'));
        
        if (currentRoomId && roleFromUrl) {
            socket.emit('playerJoinsLobby', { roomId: currentRoomId, role: roleFromUrl });
            if (roleFromUrl === 'player') {
                showScreen(selectionScreen);
                selectionTitle.innerText = `Selecione seu Personagem`;
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

        // GM Mode Selection buttons in the new lobby
        document.getElementById('start-classic-btn').onclick = () => { showScreen(scenarioScreen); renderScenarioSelection('classic'); };
        document.getElementById('start-arena-btn').onclick = () => { 
            socket.emit('playerAction', { type: 'gmStartsMode', targetMode: 'arena', scenario: 'Ringue2.png' });
        };
        document.getElementById('start-theater-btn').onclick = () => { showScreen(scenarioScreen); renderScenarioSelection('theater'); };


        charSelectBackBtn.addEventListener('click', () => {
            if (myRole === 'gm') showScreen(modeSelectionScreen);
        });
        specialMovesBackBtn.addEventListener('click', () => { showScreen(selectionScreen); });
        lobbyBackBtn.addEventListener('click', () => { specialMovesModal.classList.remove('hidden'); });
        
        const exitAndReload = () => {
            showInfoModal("Sair da Partida", `<p>Tem certeza que deseja voltar ao menu principal? A sessão atual será encerrada.</p><div style="display: flex; justify-content: center; gap: 20px; margin-top: 20px;"><button id="confirm-exit-btn" style="background-color: #dc3545; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Sim, Sair</button><button id="cancel-exit-btn" style="background-color: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Não, Ficar</button></div>`);
            document.getElementById('confirm-exit-btn').onclick = () => { socket.disconnect(); window.location.href = '/'; }; document.getElementById('cancel-exit-btn').onclick = () => modal.classList.add('hidden');
        };
        exitGameBtn.addEventListener('click', exitAndReload);
        theaterBackBtn.addEventListener('click', exitAndReload);
        p1Controls.addEventListener('click', handlePlayerControlClick);
        p2Controls.addEventListener('click', handlePlayerControlClick);
        helpBtn.addEventListener('click', showHelpModal);
        gmModeSwitchBtn.addEventListener('click', showModeSwitchModal);
        
        copySpectatorLinkInGameBtn.onclick = () => { if (currentRoomId) copyToClipboard(`${window.location.origin}?room=${currentRoomId}&role=spectator`, copySpectatorLinkInGameBtn); };

        setupTheaterEventListeners();
        initializeGlobalKeyListeners();
    }

    function onConfirmSelection() {
        const selectedCards = document.querySelectorAll('.char-card.selected'); 
        if (selectedCards.length === 0) { alert('Por favor, selecione ao menos um personagem!'); return; }
        
        if (myRole === 'player') {
            const selectedCard = selectedCards[0]; // Player só pode escolher 1
            const playerData = { nome: selectedCard.dataset.name, img: selectedCard.dataset.img };
            socket.emit('playerAction', { type: 'playerSelectsCharacter', character: playerData });
            showScreen(playerWaitingScreen);
            document.getElementById('player-waiting-message').innerText = "Personagem enviado! Aguardando o Mestre...";
            confirmBtn.disabled = true;
            return;
        }

        // NOVO: Lógica de setup do modo clássico
        if (currentGameState && currentGameState.phase === 'classic_setup_npc_selection') {
            const npcTeamData = Array.from(selectedCards).map(card => ({
                nome: card.dataset.name, 
                img: card.dataset.img,
                agi: card.querySelector('.agi-input').value, 
                res: card.querySelector('.res-input').value,
            }));

            // Monta o time dos jogadores a partir dos que se conectaram e escolheram char
            const playerTeamData = Object.values(currentGameState.connectedPlayers)
                .filter(p => p.role === 'player' && p.selectedCharacter)
                .map(p => ({
                    socketId: p.id,
                    agi: 2, // Atributos padrão para players, podem ser ajustados
                    res: 2,
                    specialMoves: [] // Por enquanto, sem especiais
                }));

            confirmBtn.disabled = true;
            socket.emit('playerAction', { type: 'gm_confirm_classic_setup', npcTeamData, playerTeamData });
            return;
        }

        // Lógica antiga (mantida para compatibilidade, se necessário)
        if (currentGameState && currentGameState.phase === 'gm_classic_setup') {
            const selectedCard = selectedCards[0];
            const player1Data = { 
                nome: selectedCard.dataset.name, 
                img: selectedCard.dataset.img,
                agi: selectedCard.querySelector('.agi-input').value, 
                res: selectedCard.querySelector('.res-input').value,
            };
            confirmBtn.disabled = true;
            socket.emit('playerAction', { type: 'gm_confirm_p1_setup', player1Data });
            return;
        }
    }

    function renderPlayerCharacterSelection(unavailable = []) {
        charListContainer.innerHTML = '';
        confirmBtn.disabled = false;
        
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


    function renderGmCharacterSelection(showStatsInputs = false, multiSelect = false, maxSelect = 4) {
        charListContainer.innerHTML = ''; 
        
        const charData = ALL_FIGHTERS_DATA;
        // ALTERAÇÃO: caminho da pasta
        const imgPath = 'images/npcs/';

        for (const name in charData) {
            const stats = charData[name]; 
            const card = document.createElement('div'); 
            card.className = 'char-card'; 
            card.dataset.name = name; 
            card.dataset.img = `${imgPath}${name}.png`;
            
            const statsHtml = showStatsInputs 
                ? `<div class="char-stats"><label>AGI: <input type="number" class="agi-input" value="${stats.agi}"></label><label>RES: <input type="number" class="res-input" value="${stats.res}"></label></div>` 
                : ``;

            card.innerHTML = `<img src="${imgPath}${name}.png" alt="${name}"><div class="char-name">${name}</div>${statsHtml}`;
            
            card.addEventListener('click', () => { 
                if (multiSelect) {
                    const selectedCount = document.querySelectorAll('.char-card.selected').length;
                    if (card.classList.contains('selected')) {
                        card.classList.remove('selected');
                    } else if (selectedCount < maxSelect) {
                        card.classList.add('selected');
                    } else {
                        alert(`Você pode selecionar no máximo ${maxSelect} personagens.`);
                    }
                    selectionTitle.innerText = `GM: Selecione seu Time (${document.querySelectorAll('.char-card.selected').length}/${maxSelect})`;

                } else {
                    document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected')); 
                    card.classList.add('selected'); 
                }
            });
            charListContainer.appendChild(card);
        }
    }

    function renderSpecialMoveSelection(container, availableMoves) {
        container.innerHTML = '';
        for (const moveName in availableMoves) {
            const moveData = availableMoves[moveName]; const displayName = moveData.displayName || moveName; const card = document.createElement('div'); card.className = 'special-move-card'; card.dataset.name = moveName;
            const reactionText = moveData.reaction ? '<br><span style="color:#17a2b8;">(Reação)</span>' : ''; const costText = moveName === 'Counter' ? 'Custo: Variável' : `Custo: ${moveData.cost} PA`;
            card.innerHTML = `<h4>${displayName}</h4><p>${costText}</p>${moveData.damage > 0 ? `<p>Dano: ${moveData.damage}</p>` : ''}${moveData.penalty > 0 ? `<p>Penalidade: ${moveData.penalty}</p>` : ''}${reactionText}`;
            card.addEventListener('click', () => card.classList.toggle('selected')); container.appendChild(card);
        }
    }

    function renderScenarioSelection(mode) {
        // ... (sem alterações)
    }
    
    function showModeSwitchModal() {
        // ... (sem alterações)
    }

    socket.on('promptOpponentSelection', ({ availablePlayers }) => {
        // ... (sem alterações)
    });

    socket.on('promptArenaOpponentSelection', ({ availablePlayers }) => {
        // ... (sem alterações)
    });

    socket.on('promptArenaConfiguration', ({ p1, p2, availableMoves }) => {
        // ... (sem alterações)
    });

    socket.on('promptSpecialMoves', (data) => {
        // ... (sem alterações)
    });

    socket.on('promptP2StatsAndMoves', ({ p2data, availableMoves }) => {
        // ... (sem alterações)
    });

    socket.on('characterUnavailable', (charName) => {
        // ... (sem alterações)
    });
    
    socket.on('gameUpdate', (gameState) => {
        modal.classList.add('hidden');
        specialMovesModal.classList.add('hidden');
        
        const oldState = currentGameState;
        currentGameState = gameState;
        
        // Atualiza meu ID de lutador no modo clássico, se aplicável
        if (gameState.mode === 'classic' && myRole === 'player' && gameState.players) {
            const myData = gameState.players.find(p => p.socketId === socket.id);
            if (myData) myFighterId = myData.id;
        }

        scaleGame();
        
        const SETUP_PHASES_ARENA = ['p1_special_moves_selection', 'opponent_selection', 'arena_opponent_selection', 'arena_configuring', 'p2_stat_assignment'];

        // GM Logic
        if (isGm) {
            if (gameState.mode === 'lobby') {
                showScreen(gmInitialLobby);
                updateGmLobbyUI(gameState);
            } else if (gameState.mode === 'classic') {
                if (gameState.phase === 'classic_setup_npc_selection') {
                    showScreen(selectionScreen);
                    selectionTitle.innerText = 'GM: Selecione seu Time (0/4)';
                    confirmBtn.innerText = 'Iniciar Batalha';
                    confirmBtn.disabled = false;
                    renderGmCharacterSelection(true, true, 4); // multi-select ativado
                } else {
                    showScreen(fightScreen);
                }
            }
            else if (gameState.mode === 'arena') {
                if (gameState.phase === 'gm_classic_setup') { // Lógica antiga mantida
                    showScreen(selectionScreen);
                    selectionTitle.innerText = 'GM: Selecione seu Lutador';
                    confirmBtn.innerText = 'Confirmar Personagem';
                    confirmBtn.disabled = false;
                    renderGmCharacterSelection(true);
                } else {
                    showScreen(fightScreen);
                }
            } else if (gameState.mode === 'theater') {
                showScreen(theaterScreen);
                initializeTheaterMode();
                renderTheaterMode(gameState);
            }
        } 
        // Player & Spectator Logic
        else if (myRole === 'player' || myRole === 'spectator') {
            if (gameState.mode === 'lobby') {
                if (myRole === 'player') {
                     const myPlayerData = gameState.connectedPlayers[socket.id];
                     if (myPlayerData && !myPlayerData.selectedCharacter) {
                        showScreen(selectionScreen);
                        renderPlayerCharacterSelection(gameState.unavailableCharacters);
                    } else {
                        showScreen(playerWaitingScreen);
                        document.getElementById('player-waiting-message').innerText = myPlayerData ? "Personagem enviado! Aguardando o Mestre..." : "Aguardando o Mestre iniciar o jogo...";
                    }
                } else { // Spectator
                     showScreen(playerWaitingScreen);
                     document.getElementById('player-waiting-message').innerText = "Aguardando como espectador...";
                }
            } else if (gameState.mode === 'classic' || gameState.mode === 'arena') {
                if (SETUP_PHASES_ARENA.includes(gameState.phase) || gameState.phase === 'classic_setup_npc_selection') {
                    showScreen(playerWaitingScreen);
                    document.getElementById('player-waiting-message').innerText = "O Mestre está configurando a partida...";
                } else {
                    showScreen(fightScreen);
                }
            } else if (gameState.mode === 'theater') {
                 showScreen(theaterScreen);
                 renderTheaterMode(gameState);
            }
        }

        const oldPhase = oldState ? oldState.phase : null;
        const wasPaused = oldPhase === 'paused';
        const isNowPaused = gameState.phase === 'paused';
        
        if (isGm && isNowPaused && !wasPaused) { 
            showCheatsModal(); 
        } else if (!isNowPaused && wasPaused) { 
            modal.classList.add('hidden'); 
        }
        
        if (gameState.mode !== 'lobby') {
            updateUI(gameState);
        }

        gameWrapper.classList.toggle('mode-classic', currentGameState.mode === 'classic');
        gameWrapper.classList.toggle('mode-arena', currentGameState.mode === 'arena');
    });

    socket.on('roomCreated', (roomId) => {
        // ... (sem alterações)
    });

    function updateGmLobbyUI(state) {
        // ... (sem alterações)
    }


    function copyToClipboard(text, element) { navigator.clipboard.writeText(text).then(() => { const originalText = element.textContent || '🔗'; element.textContent = 'Copiado!'; setTimeout(() => { element.textContent = originalText; }, 2000); }); }
    
    function renderClassicUI(state) {
        const p1Area = document.getElementById('player1-area');
        const p2Area = document.getElementById('player2-area');
        p1Area.innerHTML = '';
        p2Area.innerHTML = '';

        // Limpa as imagens flutuantes
        document.getElementById('player1-fight-img').classList.add('hidden');
        document.getElementById('player2-fight-img').classList.add('hidden');

        const createFighterCard = (fighter) => {
            const card = document.createElement('div');
            card.className = 'fighter-card';
            card.dataset.id = fighter.id;
            
            if (fighter.hp <= 0) {
                card.classList.add('defeated');
            }

            const hpPercentage = (fighter.hp / fighter.hpMax) * 100;

            card.innerHTML = `
                <div class="fighter-card-header">
                    <h4 class="fighter-card-name">${fighter.nome}</h4>
                    <div class="fighter-card-hp">
                        <div class="fighter-card-hp-bar" style="width: ${hpPercentage}%;"></div>
                        <span class="fighter-card-hp-text">${fighter.hp}/${fighter.hpMax}</span>
                    </div>
                </div>
                <img src="${fighter.img}" class="fighter-card-img">
                <div class="fighter-card-pa">
                    ${Array(fighter.pa).fill('<div class="pa-dot"></div>').join('')}
                </div>
            `;
            
            // Adicionar evento de clique para mirar
            if (isGm || (myFighterId && !fighter.isPlayer)) { // Se for GM ou for um player clicando num NPC
                card.addEventListener('click', () => {
                    document.querySelectorAll('.fighter-card').forEach(c => c.classList.remove('target'));
                    card.classList.add('target');
                });
            }

            return card;
        };
        
        state.npcs.forEach(npc => {
            p1Area.appendChild(createFighterCard(npc));
        });

        state.players.forEach(player => {
            p2Area.appendChild(createFighterCard(player));
        });

        // Lógica de turno e botões
        const currentFighterId = state.turnOrder[state.turnIndex];
        const turnFighter = [...state.npcs, ...state.players].find(f => f.id === currentFighterId);
        
        document.getElementById('player1-area').classList.remove('active-turn');
        document.getElementById('player2-area').classList.remove('active-turn');
        p1Controls.classList.add('hidden');
        p2Controls.classList.add('hidden');
        document.getElementById('action-buttons-wrapper').classList.add('hidden');
        
        if (turnFighter) {
            document.querySelector(`.fighter-card[data-id="${currentFighterId}"]`)?.classList.add('active-turn');
            
            const roundInfoEl = document.getElementById('round-info');
            roundInfoEl.innerHTML = `ROUND ${state.currentRound} - Vez de: <span class="turn-highlight">${turnFighter.nome}</span>`;

            // Se for o turno de um player E for este cliente
            if (turnFighter.isPlayer && turnFighter.socketId === socket.id) {
                document.getElementById('action-buttons-wrapper').classList.remove('hidden');
                p2Controls.classList.remove('hidden');
                 document.querySelectorAll('#p2-controls button').forEach(btn => {
                    const moveName = btn.dataset.move;
                    if (moveName) {
                        const move = state.moves[moveName];
                        btn.disabled = turnFighter.pa < move.cost;
                    } else {
                        btn.disabled = false; // Botão de fim de turno
                    }
                });
            } 
            // Se for o turno de um NPC E for o GM
            else if (!turnFighter.isPlayer && isGm) {
                 document.getElementById('action-buttons-wrapper').classList.remove('hidden');
                 p1Controls.classList.remove('hidden');
                 document.querySelectorAll('#p1-controls button').forEach(btn => {
                    const moveName = btn.dataset.move;
                    if (moveName) {
                        const move = state.moves[moveName];
                        btn.disabled = turnFighter.pa < move.cost;
                    } else {
                        btn.disabled = false; // Botão de fim de turno
                    }
                });
            }
        }
        
        const logBox = document.getElementById('fight-log'); 
        logBox.innerHTML = state.log.map(msg => `<p class="${msg.className || ''}">${msg.text}</p>`).join('');
        logBox.scrollTop = logBox.scrollHeight;
    }

    function updateUI(state) {
        if (!state || !myRole) return;
        
        // NOVO: Roteamento da renderização da UI
        if (state.mode === 'classic') {
            renderClassicUI(state);
            return; // Impede a execução da lógica antiga
        }
        
        // ---- LÓGICA ANTIGA (PARA MODO ARENA E OUTROS) ----

        gmModeSwitchBtn.classList.toggle('hidden', !isGm);
        const isCombatMode = state.mode === 'classic' || state.mode === 'arena';
        const isCombatPhase = !['waiting', 'p1_special_moves_selection', 'p2_stat_assignment', 'arena_lobby', 'arena_configuring', 'gm_classic_setup', 'gameover', 'opponent_selection', 'arena_opponent_selection'].includes(state.phase);
        copySpectatorLinkInGameBtn.classList.toggle('hidden', !(isGm && isCombatMode && isCombatPhase));
        
        helpBtn.classList.toggle('hidden', state.mode === 'theater' || state.mode === 'lobby');
        copyTheaterSpectatorLinkBtn.classList.toggle('hidden', !isGm || state.mode !== 'theater');

        if (state.scenario && state.mode !== 'theater') { gameWrapper.style.backgroundImage = `url('images/${state.scenario}')`; }
        document.getElementById('gm-cheats-panel').classList.toggle('hidden', !isGm || state.mode === 'theater');

        if(isGm) {
            const cheatIndicator = document.getElementById('dice-cheat-indicator'); let cheatText = '';
            if (state.diceCheat === 'crit') cheatText += 'Críticos (T) '; 
            if (state.diceCheat === 'fumble') cheatText += 'Erros (R) ';
            if (typeof state.diceCheat === 'number') cheatText += `Forçar D${state.diceCheat} (Y) `;
            if (state.illegalCheat === 'always') cheatText += 'Sempre Ilegal (I) '; 
            else if (state.illegalCheat === 'never') cheatText += 'Nunca Ilegal (I) ';
            
            if (cheatText) { cheatIndicator.textContent = 'CHEAT ATIVO: ' + cheatText.trim(); cheatIndicator.classList.remove('hidden'); } 
            else { cheatIndicator.classList.add('hidden'); }
        }

        if (state.mode !== 'classic' && state.mode !== 'arena') return;

        p1SpecialMovesContainer.innerHTML = ''; p2SpecialMovesContainer.innerHTML = '';
        ['player1', 'player2'].forEach(key => {
            const fighter = state.fighters[key];
            if (fighter) {
                document.getElementById(`${key}-fight-name`).innerText = fighter.nome.replace(/-SD$/, '');
                document.getElementById(`${key}-fight-img`).src = fighter.img;
                if (fighter.hpMax !== undefined) {
                    document.getElementById(`${key}-hp-text`).innerText = `${fighter.hp} / ${fighter.hpMax}`; 
                    document.getElementById(`${key}-hp-bar`).style.width = `${(fighter.hp / fighter.hpMax) * 100}%`;
                    document.getElementById(`${key}-def-text`).innerText = fighter.def; 
                    document.getElementById(`${key}-agi-text`).innerText = `AGI: ${fighter.agi}`;
                    document.getElementById(`${key}-res-text`).innerText = `RES: ${fighter.res}`;
                    document.getElementById(`${key}-hits`).innerText = fighter.hitsLanded;
                    document.getElementById(`${key}-knockdowns`).innerText = fighter.knockdowns;
                    document.getElementById(`${key}-damage-taken`).innerText = fighter.totalDamageTaken;
                    document.getElementById(`${key}-point-deductions`).innerText = fighter.pointDeductions; document.getElementById(`${key}-pa-dots`).innerHTML = Array(fighter.pa).fill('<div class="pa-dot"></div>').join('');
                }
                if (fighter.specialMoves) {
                    const container = (key === 'player1') ? p1SpecialMovesContainer : p2SpecialMovesContainer;
                    fighter.specialMoves.forEach(moveName => {
                        const moveData = state.moves[moveName]; if (!moveData) return;
                        const displayName = moveData.displayName || moveName; const btn = document.createElement('button');
                        btn.className = `action-btn special-btn-${key}`; btn.dataset.move = moveName; btn.dataset.reaction = moveData.reaction || false;
                        const costText = moveName === 'Counter' ? '(Variável)' : `(${moveData.cost} PA)`; btn.innerHTML = `${displayName} ${costText}`;
                        container.appendChild(btn);
                    });
                }
            } else if (key === 'player2' && state.pendingP2Choice) { document.getElementById(`${key}-fight-img`).src = state.pendingP2Choice.img; }
        });
        const roundInfoEl = document.getElementById('round-info');
        if (state.phase === 'paused') roundInfoEl.innerHTML = `<span class="turn-highlight">JOGO PAUSADO</span>`;
        else if (state.phase === 'gameover') roundInfoEl.innerHTML = `<span class="turn-highlight">FIM DE JOGO!</span>`;
        else if (state.phase === 'double_knockdown') roundInfoEl.innerHTML = `<span class="turn-highlight">QUEDA DUPLA!</span>`;
        else if (state.phase === 'decision_table_wait') roundInfoEl.innerHTML = `<span class="turn-highlight">DECISÃO DOS JUÍZES</span>`;
        else if (state.phase && (state.phase.startsWith('arena_') || ['gm_classic_setup', 'opponent_selection'].includes(state.phase))) roundInfoEl.innerHTML = `Aguardando início...`;
        else if (state.mode !== 'theater') {
            const turnName = state.whoseTurn && state.fighters[state.whoseTurn] ? state.fighters[state.whoseTurn].nome.replace(/-SD$/, '') : '...';
            roundInfoEl.innerHTML = `ROUND ${state.currentRound} - RODADA ${state.currentTurn} - Vez de: <span class="turn-highlight">${turnName}</span>`;
            if (state.reactionState) {
                const reactionUserKey = state.reactionState.playerKey; const reactionMoveName = state.moves[state.reactionState.move].displayName || state.reactionState.move;
                if(myPlayerKey === reactionUserKey) { roundInfoEl.innerHTML += `<br><span class="reaction-highlight">Você está em modo de ${reactionMoveName}!</span>`; }
            }
        }
        document.getElementById('player1-area').classList.toggle('active-turn', state.whoseTurn === 'player1' && state.phase !== 'paused');
        document.getElementById('player2-area').classList.toggle('active-turn', state.whoseTurn === 'player2' && state.phase !== 'paused');
        const isPlayerInFight = myPlayerKey === 'player1' || myPlayerKey === 'player2';
        document.getElementById('action-buttons-wrapper').classList.toggle('hidden', !isPlayerInFight);
        p1Controls.classList.toggle('hidden', myPlayerKey !== 'player1');
        p2Controls.classList.toggle('hidden', myPlayerKey !== 'player2');
        document.querySelectorAll('.white-fang-ready').forEach(btn => { btn.classList.remove('white-fang-ready'); const extraText = btn.querySelector('.white-fang-extra'); if (extraText) extraText.remove(); });
        document.querySelectorAll('#p1-controls button, #p2-controls button').forEach(btn => {
            const controlsId = btn.closest('.move-buttons').id; const buttonPlayerKey = (controlsId === 'p1-controls') ? 'player1' : 'player2';
            if (buttonPlayerKey !== myPlayerKey) { btn.disabled = true; return; }
            let isDisabled = true;
            const moveName = btn.dataset.move; const isReaction = btn.dataset.reaction === 'true'; const isEndTurn = btn.classList.contains('end-turn-btn');
            const me = state.fighters[myPlayerKey]; const isMyTurn = state.whoseTurn === myPlayerKey; const isActionPhase = state.phase === 'turn' || state.phase === 'white_fang_follow_up';
            const hasUsedReaction = state.reactionState && state.reactionState.playerKey === myPlayerKey;
            if (isActionPhase && me) {
                if (isMyTurn) {
                    if (isEndTurn) { isDisabled = false; } 
                    else if (!isReaction && moveName) {
                        const move = state.moves[moveName]; let cost = move.cost;
                        if (state.phase === 'white_fang_follow_up' && moveName === 'White Fang') { cost = 0; btn.classList.add('white-fang-ready'); if (!btn.querySelector('.white-fang-extra')) { btn.innerHTML += '<span class="white-fang-extra">Ataque Extra!</span>'; } }
                        if (move && me.pa >= cost) isDisabled = false;
                    }
                } else { if (isReaction && !hasUsedReaction && moveName) { const move = state.moves[moveName]; if (move && me.pa >= move.cost) isDisabled = false; } }
            }
            if (state.phase === 'paused' && !isGm) isDisabled = true;
            btn.disabled = isDisabled;
        });
        document.getElementById('forfeit-btn').disabled = !(state.whoseTurn === myPlayerKey && (state.phase === 'turn' || state.phase === 'white_fang_follow_up'));
        const logBox = document.getElementById('fight-log'); logBox.innerHTML = state.log.map(msg => `<p class="${msg.className || ''}">${msg.text}</p>`).join('');
        logBox.scrollTop = logBox.scrollHeight;
    }
    
    function showInfoModal(title, text) {
        // ... (sem alterações)
    }

    function showInteractiveModal(title, text, btnText, action) {
        // ... (sem alterações)
    }
    
    function showCheatsModal() {
        // ... (sem alterações)
    }

    function showDiceRollAnimation({ playerKey, rollValue, diceType }) {
        // ... (sem alterações)
    }
    
    // #region LÓGICA DO MODO TEATRO
    
    function initializeTheaterMode() {
        const theaterCharList = document.getElementById('theater-char-list');
        theaterCharList.innerHTML = '';

        let touchDragData = {
            ghost: null,
            charName: null,
            img: null
        };

        const createMini = (name, imgPath) => {
            // ... (sem alterações)
        };
        
        const onMobileDragMove = (e) => {
            // ... (sem alterações)
        };
        
        const onMobileDragEnd = (e) => {
            // ... (sem alterações)
        };

        // ALTERAÇÃO: caminho da pasta
        Object.keys(ALL_FIGHTERS_DATA).forEach(charName => {
            createMini(charName, `images/npcs/${charName}.png`);
        });
        Object.keys(PLAYABLE_CHARACTERS).forEach(charName => {
            createMini(charName, PLAYABLE_CHARACTERS[charName].img);
        });
        DYNAMIC_CHARACTERS.forEach(char => {
            createMini(char.name, char.img);
        });
    }

    let currentScenarioScale = 1.0;
    let isGroupSelectMode = false;
    let selectedTokens = new Set();
    let isDraggingScenario = false;

    function updateTheaterZoom() {
        // ... (sem alterações)
    }

    function initializeGlobalKeyListeners() {
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                if (modal.classList.contains('hidden') && specialMovesModal.classList.contains('hidden')) {
                    e.preventDefault();
                    const display = document.getElementById('coords-display');
                    const isHidden = display.style.display === 'none';
                    display.style.display = isHidden ? 'block' : 'none';

                    if (isHidden) {
                        window.addEventListener('mousemove', updateCoordsDisplay);
                    } else {
                        window.removeEventListener('mousemove', updateCoordsDisplay);
                    }
                }
            }


            if (!isGm) return;
            
            if (currentGameState && currentGameState.mode !== 'theater') {
                if (e.key.toLowerCase() === 'c') {
                    e.preventDefault();
                    socket.emit('playerAction', { type: 'toggle_pause' });
                } else if (e.key.toLowerCase() === 't') {
                    e.preventDefault();
                    socket.emit('playerAction', { type: 'toggle_dice_cheat', cheat: 'crit' });
                } else if (e.key.toLowerCase() === 'r') {
                    e.preventDefault();
                    socket.emit('playerAction', { type: 'toggle_dice_cheat', cheat: 'fumble' });
                } else if (e.key.toLowerCase() === 'i') {
                    e.preventDefault();
                    socket.emit('playerAction', { type: 'toggle_illegal_cheat' });
                } else if (e.key.toLowerCase() === 'y') {
                    e.preventDefault();
                    socket.emit('playerAction', { type: 'toggle_force_dice' });
                }
            }

            if (currentGameState && currentGameState.mode === 'theater') {
                // ... (lógica de atalhos do teatro)
            }
        });
    }

    function updateCoordsDisplay(e) {
        const display = document.getElementById('coords-display');
        if (display.style.display !== 'none') {
            display.innerHTML = `X: ${e.clientX}, Y: ${e.clientY}`;
        }
    }
    
    function setupTheaterEventListeners() {
        // ... (sem alterações)
    }

    function renderTheaterMode(state) {
        // ... (sem alterações)
    }
    // #endregion

    socket.on('playSound', (soundFile) => { if (!soundFile) return; const sound = new Audio(`sons/${soundFile}`); sound.currentTime = 0; sound.play().catch(e => console.error(`Erro ao tocar som: ${soundFile}`, e)); });
    socket.on('triggerAttackAnimation', ({ attackerKey }) => { const img = document.getElementById(`${attackerKey}-fight-img`); if (img) { img.classList.add(`is-attacking-${attackerKey}`); setTimeout(() => img.classList.remove(`is-attacking-${attackerKey}`), 400); } });
    socket.on('triggerHitAnimation', ({ defenderKey }) => { 
        if (currentGameState.mode === 'classic') {
            // No modo classico, a animação de hit é no card
            const card = document.querySelector(`.fighter-card[data-id="${defenderKey}"]`);
            if (card) {
                card.classList.add('is-hit');
                setTimeout(() => card.classList.remove('is-hit'), 500);
            }
        } else {
            const img = document.getElementById(`${defenderKey}-fight-img`); if (img) { img.classList.add('is-hit'); setTimeout(() => img.classList.remove('is-hit'), 500); }
        }
    });

    socket.on('assignRole', (data) => {
        myRole = data.role;
        myPlayerKey = data.playerKey || null;
        isGm = data.isGm || myRole === 'gm';
        if (isGm) exitGameBtn.classList.remove('hidden');
    });
    socket.on('promptRoll', ({ targetPlayerKey, text, action }) => {
        let btn = document.getElementById(`${targetPlayerKey}-roll-btn`); const isMyTurnToRoll = myPlayerKey === targetPlayerKey;
        const newBtn = btn.cloneNode(true); btn.parentNode.replaceChild(newBtn, btn); btn = newBtn;
        btn.innerText = text; btn.classList.remove('hidden', 'inactive');
        if (isMyTurnToRoll) { btn.onclick = () => { btn.disabled = true; socket.emit('playerAction', action); }; btn.disabled = false;
        } else { btn.disabled = true; btn.onclick = null; if (myRole !== 'spectator' && !isGm) btn.classList.add('inactive'); }
    });

    socket.on('hideRollButtons', () => { ['player1-roll-btn', 'player2-roll-btn'].forEach(id => document.getElementById(id).classList.add('hidden')); });
    socket.on('showModal', ({ title, text, btnText, action, targetPlayerKey, modalType, knockdownInfo, doubleKnockdownInfo }) => {
        // ... (sem alterações)
    });

    socket.on('doubleKnockdownResults', (results) => {
        // ... (sem alterações)
    });

    socket.on('showGameAlert', (message) => {
        // ... (sem alterações)
    });

    socket.on('getUpSuccess', ({ downedPlayerName, rollValue }) => { modal.classList.add('hidden'); getUpSuccessOverlay.classList.remove('hidden'); getUpSuccessContent.innerHTML = `${rollValue} - ${downedPlayerName.toUpperCase()} CONSEGUIU SE LEVANTAR! <span>(precisava de 7 ou mais)</span>`; setTimeout(() => getUpSuccessOverlay.classList.add('hidden'), 3000); });
    socket.on('hideModal', () => modal.classList.add('hidden'));
    socket.on('diceRoll', showDiceRollAnimation);
    socket.on('error', ({message}) => { showInfoModal("Erro", `${message}<br>Recarregue a página para tentar novamente.`); });

    initialize();
    
    const scaleGame = () => {
        // ... (sem alterações)
    };
    
    scaleGame();
    window.addEventListener('resize', scaleGame);
});