document.addEventListener('DOMContentLoaded', () => {
    let myPlayerKey = null;
    let isGm = false;
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
    const modeTheaterBtn = document.getElementById('mode-theater-btn');
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
    const helpBtn = document.getElementById('help-btn');
    const gmModeSwitchBtn = document.getElementById('gm-mode-switch-btn');

    const theaterScreen = document.getElementById('theater-screen');
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

    const SCENARIOS = { 'Ringue Clássico': 'Ringue.png', 'Arena Subterrânea': 'Ringue2.png', 'Dojo Antigo': 'Ringue3.png', 'Ginásio Moderno': 'Ringue4.png', 'Ringue na Chuva': 'Ringue5.png' };
    
    const CHARACTERS_P1 = {
        'Kureha Shoji':{agi:3,res:1},'Erik Adler':{agi:2,res:2},'Ivan Braskovich':{agi:1,res:3},'Hayato Takamura':{agi:4,res:4},'Logan Graves':{agi:3,res:2},'Daigo Kurosawa':{agi:1,res:4},'Jamal Briggs':{agi:2,res:3},'Takeshi Arada':{agi:3,res:2},'Kaito Mishima':{agi:4,res:3},'Kuga Shunji':{agi:3,res:4},'Eitan Barak':{agi:4,res:3},
        'Rukyanu Hoo': { agi: 1, res: 1 },
        'Shirubio Sando': { agi: 1, res: 1 },
        'Guguro Riberatsu': { agi: 1, res: 1 },
        'Raujiro Oka': { agi: 1, res: 1 }
    };
    const CHARACTERS_P2 = { 'Ryu':{agi:2,res:3},'Yobu':{agi:2,res:3},'Nathan':{agi:2,res:3},'Okami':{agi:2,res:3} };
    
    const THEATER_CHARACTERS = { ...CHARACTERS_P1, ...CHARACTERS_P2 };
    
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

    function showHelpModal() {
        if (!currentGameState || currentGameState.mode === 'theater') return;
        const MOVE_EFFECTS = {'Liver Blow': '30% de chance de remover 1 PA do oponente.','Clinch': 'Se acertar, remove 2 PA do oponente. Crítico remove 4.','Golpe Ilegal': 'Chance de perder pontos ou ser desqualificado. A chance de DQ aumenta a cada uso.','Esquiva': '(Reação) Sua DEF passa a ser calculada com AGI em vez de RES por 2 rodadas.','Counter': '(Reação) Intercepta o golpe do oponente. O custo de PA é igual ao do golpe recebido. Ambos rolam ataque; o maior resultado vence e causa o dobro de dano no perdedor.','Flicker Jab': 'Repete o ataque continuamente até errar.','White Fang': 'Permite um segundo uso consecutivo sem custo de PA.','OraOraOra': 'Nenhum'};
        const BASIC_MOVES_ORDER = ['Jab', 'Direto', 'Upper', 'Liver Blow', 'Clinch', 'Golpe Ilegal', 'Esquiva'];
        let playerSpecialMoves = [];
        if (myPlayerKey === 'player1' || myPlayerKey === 'player2') {
            const fighter = currentGameState.fighters[myPlayerKey];
            if (fighter && fighter.specialMoves) { playerSpecialMoves = fighter.specialMoves; } else { playerSpecialMoves = Object.keys(availableSpecialMoves || {}); }
        } else { playerSpecialMoves = Object.keys(currentGameState.moves).filter(m => !BASIC_MOVES_ORDER.includes(m)); }
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
        if (!myPlayerKey || (myPlayerKey !== 'player1' && myPlayerKey !== 'player2') || !currentGameState) return;
        const target = event.target.closest('button'); if (!target || target.disabled) return;
        const move = target.dataset.move;
        if (move === 'Golpe Ilegal') {
            const fighter = currentGameState.fighters[myPlayerKey]; const moveData = currentGameState.moves['Golpe Ilegal'];
            if (fighter && moveData && fighter.pa >= moveData.cost) { showIllegalMoveConfirmation(); }
        } else if (move) { socket.emit('playerAction', { type: 'attack', move: move, playerKey: myPlayerKey });
        } else if (target.id === `p${myPlayerKey.slice(-1)}-end-turn-btn`) { socket.emit('playerAction', { type: 'end_turn', playerKey: myPlayerKey }); }
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
        const arenaPlayerKey = urlParams.get('player');
        const isSpectator = urlParams.get('spectate') === 'true';

        [charSelectBackBtn, specialMovesBackBtn, lobbyBackBtn, exitGameBtn, copySpectatorLinkInGameBtn, copyTheaterSpectatorLinkBtn, theaterBackBtn].forEach(btn => btn.classList.add('hidden'));
        
        if (arenaPlayerKey && currentRoomId) {
            myPlayerKey = arenaPlayerKey; socket.emit('joinArenaGame', { roomId: currentRoomId, playerKey: arenaPlayerKey });
            showScreen(selectionScreen); selectionTitle.innerText = `Jogador ${arenaPlayerKey === 'player1' ? 1 : 2}: Selecione seu Lutador`; confirmBtn.innerText = 'Confirmar Personagem';
            renderCharacterSelection('p2', false);
        } else if (isSpectator && currentRoomId) { 
            showScreen(lobbyScreen); lobbyContent.innerHTML = `<p>Entrando como espectador...</p>`; socket.emit('spectateGame', currentRoomId);
        } else if (currentRoomId) {
            showScreen(selectionScreen); selectionTitle.innerText = 'Jogador 2: Selecione seu Lutador'; confirmBtn.innerText = 'Entrar na Luta';
            renderCharacterSelection('p2', false);
        } else { showScreen(modeSelectionScreen); }
        
        confirmBtn.addEventListener('click', onConfirmSelection);
        
        modeClassicBtn.onclick = () => { myPlayerKey = 'player1'; showScreen(scenarioScreen); renderScenarioSelection('classic'); charSelectBackBtn.classList.remove('hidden'); specialMovesBackBtn.classList.remove('hidden'); lobbyBackBtn.classList.remove('hidden'); copySpectatorLinkInGameBtn.classList.remove('hidden'); };
        modeArenaBtn.onclick = () => { myPlayerKey = 'host'; exitGameBtn.classList.remove('hidden'); showScreen(scenarioScreen); renderScenarioSelection('arena'); };
        modeTheaterBtn.onclick = () => { myPlayerKey = 'gm'; theaterBackBtn.classList.remove('hidden'); copyTheaterSpectatorLinkBtn.classList.remove('hidden'); showScreen(scenarioScreen); selectionTitle.innerText = 'Selecione o Cenário Inicial'; renderScenarioSelection('theater'); };

        charSelectBackBtn.addEventListener('click', () => showScreen(scenarioScreen));
        specialMovesBackBtn.addEventListener('click', () => { alert('A partida já foi criada no servidor. Para alterar o personagem, a página será recarregada.'); location.reload(); });
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
        document.getElementById('forfeit-btn').onclick = () => { if (myPlayerKey && myPlayerKey !== 'spectator' && myPlayerKey !== 'host' && currentGameState && (currentGameState.phase === 'turn' || currentGameState.phase === 'white_fang_follow_up') && currentGameState.whoseTurn === myPlayerKey) { showForfeitConfirmation(); } };
        
        initializeTheaterMode();
        initializeGlobalKeyListeners();
    }

    function onConfirmSelection() {
        const selectedCard = document.querySelector('.char-card.selected'); if (!selectedCard) { alert('Por favor, selecione um lutador!'); return; }
        let playerData = { nome: selectedCard.dataset.name, img: selectedCard.dataset.img };
        
        if (currentGameState && currentGameState.phase === 'gm_classic_setup') {
            playerData.agi = selectedCard.querySelector('.agi-input').value; 
            playerData.res = selectedCard.querySelector('.res-input').value;
            confirmBtn.disabled = true;
            socket.emit('playerAction', { type: 'gm_confirm_p1_setup', player1Data: playerData });
            return;
        }

        if (myPlayerKey === 'player1' && !currentRoomId) {
            playerData.agi = selectedCard.querySelector('.agi-input').value; playerData.res = selectedCard.querySelector('.res-input').value;
            confirmBtn.disabled = true; socket.emit('createGame', { player1Data: playerData, scenario: player1SetupData.scenario });
        } else if (myPlayerKey === 'player1' || myPlayerKey === 'player2') {
             confirmBtn.disabled = true; socket.emit('selectArenaCharacter', { character: playerData });
             showScreen(arenaLobbyScreen); lobbyContent.innerHTML = `<p>Personagem selecionado! Aguardando o Anfitrião configurar e iniciar a partida...</p>`;
        } else {
            confirmBtn.disabled = true; showScreen(lobbyScreen); lobbyContent.innerHTML = `<p>Aguardando o Jogador 1 definir seus atributos e golpes...</p>`;
            socket.emit('joinGame', { roomId: currentRoomId, player2Data: playerData });
        }
    }

    function renderCharacterSelection(playerType, showStatsInputs = false) {
        charListContainer.innerHTML = ''; const charData = playerType === 'p1' ? CHARACTERS_P1 : CHARACTERS_P2;
        for (const name in charData) {
            const stats = charData[name]; const card = document.createElement('div'); card.className = 'char-card'; card.dataset.name = name; 
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
            const moveData = availableMoves[moveName]; const displayName = moveData.displayName || moveName; const card = document.createElement('div'); card.className = 'special-move-card'; card.dataset.name = moveName;
            const reactionText = moveData.reaction ? '<br><span style="color:#17a2b8;">(Reação)</span>' : ''; const costText = moveName === 'Counter' ? 'Custo: Variável' : `Custo: ${moveData.cost} PA`;
            card.innerHTML = `<h4>${displayName}</h4><p>${costText}</p>${moveData.damage > 0 ? `<p>Dano: ${moveData.damage}</p>` : ''}${moveData.penalty > 0 ? `<p>Penalidade: ${moveData.penalty}</p>` : ''}${reactionText}`;
            card.addEventListener('click', () => card.classList.toggle('selected')); container.appendChild(card);
        }
    }

    function renderScenarioSelection(mode = 'classic') {
        const tabsContainer = document.getElementById('scenario-category-tabs');
        tabsContainer.innerHTML = '';
        scenarioListContainer.innerHTML = '';

        if (mode === 'theater') {
            tabsContainer.style.display = 'flex';
            const categories = Object.keys(THEATER_SCENARIOS);

            const renderCategory = (categoryName) => {
                scenarioListContainer.innerHTML = '';
                const category = THEATER_SCENARIOS[categoryName];
                for (let i = 1; i <= category.count; i++) {
                    const name = `${category.baseName} (${i})`;
                    const fileName = `mapas/${categoryName}/${name}.png`;
                    const card = document.createElement('div');
                    card.className = 'scenario-card';
                    card.innerHTML = `<img src="images/${fileName}" alt="${name}"><div class="scenario-name">${name}</div>`;
                    card.onclick = () => {
                        socket.emit('createTheaterGame', { scenario: fileName });
                    };
                    scenarioListContainer.appendChild(card);
                }
            };

            categories.forEach((categoryName, index) => {
                const btn = document.createElement('button');
                btn.className = 'category-tab-btn';
                btn.textContent = categoryName.replace(/_/g, ' ').toUpperCase();
                btn.onclick = () => {
                    document.querySelectorAll('.category-tab-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    renderCategory(categoryName);
                };
                tabsContainer.appendChild(btn);
                if (index === 0) {
                    btn.classList.add('active');
                    renderCategory(categoryName);
                }
            });
        } else {
            tabsContainer.style.display = 'none';
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
                    } else if (mode === 'arena') {
                        socket.emit('createArenaGame', { scenario: fileName });
                        showScreen(arenaLobbyScreen);
                    }
                };
                scenarioListContainer.appendChild(card);
            });
        }
    }
    
    function showModeSwitchModal() {
        if (!isGm) return;
        const modalContentHtml = `
            <p>Para qual modo de jogo deseja alternar?</p>
            <p style="font-size: 0.9em; color: #ccc;">Todos na sala (jogadores e espectadores) serão movidos para o novo modo.</p>
            <div style="display: flex; justify-content: center; gap: 20px; margin-top: 20px;">
                <button id="switch-to-classic" class="mode-btn">Clássico</button>
                <button id="switch-to-arena" class="mode-btn">Arena</button>
                <button id="switch-to-theater" class="mode-btn">Cenários</button>
            </div>
        `;
        showInfoModal("Mudar Modo de Jogo", modalContentHtml);

        document.getElementById('switch-to-classic').onclick = () => {
            socket.emit('playerAction', { type: 'gm_switch_mode', targetMode: 'classic', scenario: 'Ringue.png' });
            modal.classList.add('hidden');
        };
        document.getElementById('switch-to-arena').onclick = () => {
            socket.emit('playerAction', { type: 'gm_switch_mode', targetMode: 'arena', scenario: 'Ringue2.png' });
            modal.classList.add('hidden');
        };
        document.getElementById('switch-to-theater').onclick = () => {
            socket.emit('playerAction', { type: 'gm_switch_mode', targetMode: 'theater', scenario: 'mapas/cenarios internos/interno (1).png' });
            modal.classList.add('hidden');
        };
    }

    socket.on('promptSpecialMoves', (data) => {
        availableSpecialMoves = data.availableMoves;
        specialMovesTitle.innerText = 'Selecione seus Golpes Especiais';
        renderSpecialMoveSelection(specialMovesList, availableMoves);
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
        const modalContentHtml = `<div style="display:flex; gap: 30px;"><div style="flex: 1; text-align: center;"><h4>Definir Atributos de ${p2data.nome}</h4><img src="${p2data.img}" alt="${p2data.nome}" style="width: 80px; height: 80px; border-radius: 50%; background: #555; margin: 10px auto; display: block;"><label>AGI: <input type="number" id="p2-stat-agi" value="2" style="width: 50px; text-align: center;"></label><label>RES: <input type="number" id="p2-stat-res" value="2" style="width: 50px; text-align: center;"></label></div><div style="flex: 2; border-left: 1px solid #555; padding-left: 20px; text-align: center;"><h4>Escolher Golpes Especiais</h4><div id="p2-moves-selection-list"></div></div></div>`;
        showInteractiveModal("Definir Oponente", modalContentHtml, "Confirmar e Iniciar Luta", null);
        const p2MovesContainer = document.getElementById('p2-moves-selection-list'); renderSpecialMoveSelection(p2MovesContainer, availableMoves);
        modalButton.onclick = () => {
            const agi = document.getElementById('p2-stat-agi').value; const res = document.getElementById('p2-stat-res').value; const selectedMoves = Array.from(p2MovesContainer.querySelectorAll('.selected')).map(card => card.dataset.name);
            if (!agi || !res || isNaN(agi) || isNaN(res) || agi < 1 || res < 1) { alert("Valores inválidos para AGI/RES."); return; }
            const action = { type: 'set_p2_stats', playerKey: myPlayerKey, stats: { agi, res }, moves: selectedMoves };
            socket.emit('playerAction', action); modal.classList.add('hidden');
        };
    });
    
    socket.on('arenaRoomCreated', (roomId) => {
        currentRoomId = roomId; const baseUrl = window.location.origin;
        const p1Url = `${baseUrl}?room=${roomId}&player=player1`; const p2Url = `${baseUrl}?room=${roomId}&player=player2`; const specUrl = `${baseUrl}?room=${roomId}&spectate=true`;
        document.getElementById('arena-link-p1').textContent = p1Url; document.getElementById('arena-link-p2').textContent = p2Url; document.getElementById('arena-link-spectator').textContent = specUrl;
        document.getElementById('arena-link-p1').onclick = () => copyToClipboard(p1Url, document.getElementById('arena-link-p1'));
        document.getElementById('arena-link-p2').onclick = () => copyToClipboard(p2Url, document.getElementById('arena-link-p2'));
        document.getElementById('arena-link-spectator').onclick = () => copyToClipboard(specUrl, document.getElementById('arena-link-spectator'));
    });

    socket.on('updateArenaLobby', ({ playerKey, status, character }) => {
        const statusEl = document.getElementById(`arena-${playerKey}-status`);
        if (status === 'connected') { statusEl.innerHTML = `<h4>Jogador ${playerKey === 'player1' ? 1 : 2}</h4><p style="color: #28a745;">Conectado! Aguardando seleção de personagem...</p>`;
        } else if (status === 'character_selected') { statusEl.innerHTML = `<h4>Jogador ${playerKey === 'player1' ? 1 : 2}</h4><p style="color: #17a2b8;">Selecionou: ${character.nome}</p><img src="${character.img}" style="width: 50px; height: 50px; border-radius: 50%;" />`;
        } else if (status === 'disconnected') { statusEl.innerHTML = `<h4>Jogador ${playerKey === 'player1' ? 1 : 2}</h4><p style="color: #dc3545;">Desconectado.</p>`; }
    });
    
    socket.on('promptArenaConfiguration', ({ p1, p2, availableMoves }) => {
        const modalContentHtml = `<div style="display:flex; gap: 20px;"><div style="flex: 1; text-align: center; border-right: 1px solid #555; padding-right: 20px;"><h4>${p1.nome} (Jogador 1)</h4><label>AGI: <input type="number" id="arena-p1-agi" value="2" style="width: 50px; text-align: center;"></label><label>RES: <input type="number" id="arena-p1-res" value="2" style="width: 50px; text-align: center;"></label><p>Golpes Especiais:</p><div id="arena-p1-moves"></div></div><div style="flex: 1; text-align: center;"><h4>${p2.nome} (Jogador 2)</h4><label>AGI: <input type="number" id="arena-p2-agi" value="2" style="width: 50px; text-align: center;"></label><label>RES: <input type="number" id="arena-p2-res" value="2" style="width: 50px; text-align: center;"></label><p>Golpes Especiais:</p><div id="arena-p2-moves"></div></div></div>`;
        showInteractiveModal("Configurar Batalha da Arena", modalContentHtml, "Iniciar Batalha", null);
        renderSpecialMoveSelection(document.getElementById('arena-p1-moves'), availableMoves); renderSpecialMoveSelection(document.getElementById('arena-p2-moves'), availableMoves);
        modalButton.onclick = () => {
            const p1_config = { agi: document.getElementById('arena-p1-agi').value, res: document.getElementById('arena-p1-res').value, specialMoves: Array.from(document.querySelectorAll('#arena-p1-moves .selected')).map(c => c.dataset.name) };
            const p2_config = { agi: document.getElementById('arena-p2-agi').value, res: document.getElementById('arena-p2-res').value, specialMoves: Array.from(document.querySelectorAll('#arena-p2-moves .selected')).map(c => c.dataset.name) };
            socket.emit('playerAction', { type: 'configure_and_start_arena', playerKey: 'host', p1_config, p2_config }); modal.classList.add('hidden');
        };
    });

    socket.on('gameUpdate', (gameState) => {
        const oldState = currentGameState;
        currentGameState = gameState;
        
        const PRE_GAME_PHASES = ['waiting', 'p1_special_moves_selection', 'p2_stat_assignment', 'arena_lobby', 'arena_configuring', 'gm_classic_setup'];
        
        if (myPlayerKey === 'spectator' && oldState && oldState.mode === 'theater' && gameState.mode !== 'theater' && PRE_GAME_PHASES.includes(gameState.phase)) {
            console.log("GM is setting up a new mode. Spectator view is paused on Theater.");
            return;
        }

        const oldMode = oldState ? oldState.mode : null;
        if (gameState.mode !== oldMode) {
             linkInitialized = false;
        }
        
        switch(gameState.mode) {
            case 'theater':
                showScreen(theaterScreen);
                if (isGm && !linkInitialized && currentRoomId) {
                    const specUrl = `${window.location.origin}?room=${currentRoomId}&spectate=true`;
                    copyTheaterSpectatorLinkBtn.disabled = false;
                    copyTheaterSpectatorLinkBtn.onclick = () => copyToClipboard(specUrl, copyTheaterSpectatorLinkBtn);
                    linkInitialized = true;
                }
                renderTheaterMode(gameState);
                break;
            case 'classic':
                 if (gameState.phase === 'gm_classic_setup' && isGm) {
                    showScreen(selectionScreen);
                    selectionTitle.innerText = 'GM (P1): Selecione seu Lutador';
                    confirmBtn.innerText = 'Confirmar para Iniciar';
                    confirmBtn.disabled = false;
                    renderCharacterSelection('p1', true);
                } else if (PRE_GAME_PHASES.includes(gameState.phase)) {
                    showScreen(lobbyScreen);
                } else {
                    showScreen(fightScreen);
                }
                break;
            case 'arena':
                if (gameState.phase === 'arena_lobby') {
                    if (myPlayerKey === 'player1' || myPlayerKey === 'player2') {
                         if (!selectionScreen.classList.contains('active')) {
                            showScreen(selectionScreen);
                        }
                    } else { // Host or Spectator
                        showScreen(arenaLobbyScreen);
                    }
                } else if (PRE_GAME_PHASES.includes(gameState.phase)) {
                    showScreen(arenaLobbyScreen); 
                } else {
                    showScreen(fightScreen);
                }
                break;
        }

        if (gameState.mode === 'classic' && (myPlayerKey === 'player1' || isGm) && !linkInitialized && currentRoomId) {
            const p2Url = `${window.location.origin}?room=${currentRoomId}`;
            const specUrl = `${window.location.origin}?room=${currentRoomId}&spectate=true`;
            const shareLinkP2 = document.getElementById('share-link-p2');
            shareLinkP2.textContent = p2Url; shareLinkP2.onclick = () => copyToClipboard(p2Url, shareLinkP2);
            lobbyContent.classList.add('hidden'); shareContainer.classList.remove('hidden');
            const shareLinkSpectator = document.getElementById('share-link-spectator');
            shareLinkSpectator.textContent = specUrl; shareLinkSpectator.onclick = () => copyToClipboard(specUrl, shareLinkSpectator);
            linkInitialized = true;
        }

        const oldPhase = oldState ? oldState.phase : null;
        const wasPaused = oldPhase === 'paused';
        const isNowPaused = currentGameState.phase === 'paused';
        
        if (isNowPaused && !wasPaused) { showCheatsModal(); } 
        else if (!isNowPaused && wasPaused) { modal.classList.add('hidden'); }
        
        updateUI(currentGameState);

        gameWrapper.classList.toggle('mode-classic', currentGameState.mode === 'classic');
        gameWrapper.classList.toggle('mode-arena', currentGameState.mode === 'arena');
    });

    socket.on('roomCreated', (roomId) => {
        currentRoomId = roomId;
    });

    function copyToClipboard(text, element) { navigator.clipboard.writeText(text).then(() => { const originalText = element.textContent || '🔗'; element.textContent = 'Copiado!'; setTimeout(() => { element.textContent = originalText; }, 2000); }); }
    copySpectatorLinkInGameBtn.onclick = () => { if (currentRoomId) copyToClipboard(`${window.location.origin}?room=${currentRoomId}&spectate=true`, copySpectatorLinkInGameBtn); };
    
    function updateUI(state) {
        if (!state || !myPlayerKey) return;

        gmModeSwitchBtn.classList.toggle('hidden', !isGm);
        helpBtn.classList.toggle('hidden', state.mode === 'theater');

        if (state.scenario && state.mode !== 'theater') { gameWrapper.style.backgroundImage = `url('images/${state.scenario}')`; }
        document.getElementById('gm-cheats-panel').classList.toggle('hidden', !isGm || state.mode === 'theater');

        if(isGm) {
            const cheatIndicator = document.getElementById('dice-cheat-indicator'); let cheatText = '';
            if (state.diceCheat === 'crit') cheatText += 'Críticos (T) '; if (state.diceCheat === 'fumble') cheatText += 'Erros (R) ';
            if (state.illegalCheat === 'always') cheatText += 'Sempre Ilegal (I) '; else if (state.illegalCheat === 'never') cheatText += 'Nunca Ilegal (I) ';
            if (cheatText) { cheatIndicator.textContent = 'CHEAT ATIVO: ' + cheatText.trim(); cheatIndicator.classList.remove('hidden'); } 
            else { cheatIndicator.classList.add('hidden'); }
        }
        p1SpecialMovesContainer.innerHTML = ''; p2SpecialMovesContainer.innerHTML = '';
        ['player1', 'player2'].forEach(key => {
            const fighter = state.fighters[key];
            if (fighter) {
                document.getElementById(`${key}-fight-name`).innerText = fighter.nome.replace(/-SD$/, '');
                document.getElementById(`${key}-fight-img`).src = fighter.img;
                if (fighter.hpMax !== undefined) {
                    document.getElementById(`${key}-hp-text`).innerText = `${fighter.hp} / ${fighter.hpMax}`; document.getElementById(`${key}-hp-bar`).style.width = `${(fighter.hp / fighter.hpMax) * 100}%`;
                    document.getElementById(`${key}-def-text`).innerText = fighter.def; document.getElementById(`${key}-hits`).innerText = fighter.hitsLanded;
                    document.getElementById(`${key}-knockdowns`).innerText = fighter.knockdowns; document.getElementById(`${key}-damage-taken`).innerText = fighter.totalDamageTaken;
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
        else if (state.phase && (state.phase.startsWith('arena_') || state.phase === 'gm_classic_setup')) roundInfoEl.innerHTML = `Aguardando início...`;
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
        const isPlayer = myPlayerKey === 'player1' || myPlayerKey === 'player2';
        document.getElementById('action-buttons-wrapper').classList.toggle('hidden', !isPlayer || state.mode === 'theater');
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
        modalTitle.innerText = title; modalText.innerHTML = text; const tempDiv = document.createElement('div'); tempDiv.innerHTML = text;
        const hasCustomButtons = tempDiv.querySelector('button');
        if (hasCustomButtons) { modalButton.style.display = 'none';
        } else { modalButton.style.display = 'inline-block'; modalButton.innerText = 'OK'; modalButton.onclick = () => modal.classList.add('hidden'); }
        modal.classList.remove('hidden');
    }

    function showInteractiveModal(title, text, btnText, action) {
        modalTitle.innerText = title; modalText.innerHTML = text; const newButton = modalButton.cloneNode(true);
        modalButton.parentNode.replaceChild(newButton, modalButton); modalButton = newButton;
        modalButton.innerText = btnText; modalButton.style.display = btnText ? 'inline-block' : 'none'; modalButton.disabled = false;
        if (action) { modalButton.onclick = () => { modalButton.disabled = true; modalButton.innerText = "Aguarde..."; socket.emit('playerAction', action); }; 
        } else { modalButton.onclick = () => modal.classList.add('hidden'); }
        modal.classList.remove('hidden');
    }
    
    function showCheatsModal() {
        if (!isGm || !currentGameState) return;
        const p1 = currentGameState.fighters.player1; const p2 = currentGameState.fighters.player2;
        if (!p1 || !p2) { console.warn("Cheats tentado antes dos lutadores estarem prontos."); socket.emit('playerAction', { type: 'toggle_pause' }); return; }
        const cheatHtml = `<div style="display: flex; gap: 20px; justify-content: space-around; text-align: left;"><div id="cheat-p1"><h4>${p1.nome}</h4><label>AGI: <input type="number" id="cheat-p1-agi" value="${p1.agi}"></label><br><label>RES: <input type="number" id="cheat-p1-res" value="${p1.res}"></label><br><label>HP: <input type="number" id="cheat-p1-hp" value="${p1.hp}"></label><br><label>PA: <input type="number" id="cheat-p1-pa" value="${p1.pa}"></label><br></div><div id="cheat-p2"><h4>${p2.nome}</h4><label>AGI: <input type="number" id="cheat-p2-agi" value="${p2.agi}"></label><br><label>RES: <input type="number" id="cheat-p2-res" value="${p2.res}"></label><br><label>HP: <input type="number" id="cheat-p2-hp" value="${p2.hp}"></label><br><label>PA: <input type="number" id="cheat-p2-pa" value="${p2.pa}"></label><br></div></div>`;
        showInteractiveModal("Menu de Trapaças (GM)", cheatHtml, "Aplicar e Continuar", null);
        modalButton.onclick = () => {
            const cheats = { p1: { agi: document.getElementById('cheat-p1-agi').value, res: document.getElementById('cheat-p1-res').value, hp: document.getElementById('cheat-p1-hp').value, pa: document.getElementById('cheat-p1-pa').value, }, p2: { agi: document.getElementById('cheat-p2-agi').value, res: document.getElementById('cheat-p2-res').value, hp: document.getElementById('cheat-p2-hp').value, pa: document.getElementById('cheat-p2-pa').value, } };
            socket.emit('playerAction', { type: 'apply_cheats', cheats }); socket.emit('playerAction', { type: 'toggle_pause' });
        };
    }

    function showDiceRollAnimation({ playerKey, rollValue, diceType }) {
        const diceOverlay = document.getElementById('dice-overlay'); const diceContainer = document.getElementById(`${playerKey}-dice-result`); if (!diceOverlay || !diceContainer) return;
        let imagePrefix = (diceType === 'd6') ? (playerKey === 'player1' ? 'diceA' : 'diceP') : (playerKey === 'player1' ? 'D3A-' : 'D3P-');
        diceContainer.style.backgroundImage = `url('images/${imagePrefix}${rollValue}.png')`; diceOverlay.classList.remove('hidden'); diceContainer.classList.remove('hidden');
        const hideAndResolve = () => { diceOverlay.classList.add('hidden'); diceContainer.classList.add('hidden'); };
        diceOverlay.addEventListener('click', hideAndResolve, { once: true }); setTimeout(hideAndResolve, 2000); 
    }
    
    // #region LÓGICA DO MODO TEATRO
    let currentScenarioScale = 1.0;
    let isGroupSelectMode = false;
    let selectedTokens = new Set();
    let isDraggingScenario = false;

    function updateTheaterZoom() {
        const dataToRender = (currentGameState && myPlayerKey === 'spectator' && currentGameState.publicState) ? currentGameState.publicState : currentGameState;
        if (!dataToRender) return;

        const globalTokenScale = dataToRender.globalTokenScale || 1.0;
        
        const worldContainer = document.getElementById('theater-world-container');
        if (worldContainer) {
           worldContainer.style.transform = `scale(${currentScenarioScale})`;
        }
        
        document.querySelectorAll('.theater-token').forEach(token => {
            const baseScale = parseFloat(token.dataset.scale) || 1;
            const isFlipped = token.dataset.flipped === 'true';
            token.style.transform = `scale(${baseScale * globalTokenScale}) ${isFlipped ? 'scaleX(-1)' : ''}`;
        });
    }

    function initializeGlobalKeyListeners() {
        window.addEventListener('keydown', (e) => {
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
                }
            }

            if (currentGameState && currentGameState.mode === 'theater') {
                if (e.key.toLowerCase() === 'g') {
                    e.preventDefault();
                    isGroupSelectMode = !isGroupSelectMode;
                    theaterBackgroundViewport.classList.toggle('group-select-mode', isGroupSelectMode);
                    if (!isGroupSelectMode) {
                        selectedTokens.clear();
                        document.querySelectorAll('.theater-token.selected').forEach(t => t.classList.remove('selected'));
                    }
                }

                const currentSelectedTokens = document.querySelectorAll('.theater-token.selected');
                if (currentSelectedTokens.length > 0) {
                     if (e.key === 'Delete') {
                        e.preventDefault();
                        const idsToRemove = Array.from(selectedTokens);
                        socket.emit('playerAction', { type: 'updateToken', token: { remove: true, ids: idsToRemove }});
                        selectedTokens.clear();
                     } else if (e.key.toLowerCase() === 'f') {
                        e.preventDefault();
                        currentSelectedTokens.forEach(token => {
                            const currentTokenState = currentGameState.tokens[token.id];
                            if (currentTokenState) {
                                socket.emit('playerAction', { type: 'updateToken', token: { id: token.id, isFlipped: !currentTokenState.isFlipped }});
                            }
                        });
                     } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        currentSelectedTokens.forEach(token => {
                            socket.emit('playerAction', { type: 'changeTokenOrder', tokenId: token.id, direction: 'forward' });
                        });
                     } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        currentSelectedTokens.forEach(token => {
                            socket.emit('playerAction', { type: 'changeTokenOrder', tokenId: token.id, direction: 'backward' });
                        });
                     }
                }
            }
        });
    }

    function initializeTheaterMode() {
        const toggleGmPanelBtn = document.getElementById('toggle-gm-panel-btn');
        const theaterScreenEl = document.getElementById('theater-screen');
        const selectionBox = document.getElementById('selection-box');
        
        toggleGmPanelBtn.addEventListener('click', () => { 
            theaterScreenEl.classList.toggle('panel-hidden');
        });
        
        theaterCharList.innerHTML = '';
        Object.keys(THEATER_CHARACTERS).forEach(charName => {
            const charImg = `images/${charName}.png`; const mini = document.createElement('div');
            mini.className = 'theater-char-mini';
            mini.style.backgroundImage = `url("${charImg}")`;
            mini.title = charName; mini.draggable = true;
            mini.addEventListener('dragstart', (e) => {
                if (!isGm) return;
                e.dataTransfer.setData('application/json', JSON.stringify({ charName: charName, img: charImg }));
            });
            theaterCharList.appendChild(mini);
        });

        DYNAMIC_CHARACTERS.forEach(char => {
            const mini = document.createElement('div');
            mini.className = 'theater-char-mini';
            mini.style.backgroundImage = `url("${char.img}")`;
            mini.title = char.name; mini.draggable = true;
            mini.addEventListener('dragstart', (e) => {
                if (!isGm) return;
                e.dataTransfer.setData('application/json', JSON.stringify({ charName: char.name, img: char.img }));
            });
            theaterCharList.appendChild(mini);
        });
    
        theaterBackgroundViewport.addEventListener('dragover', (e) => { e.preventDefault(); });
    
        theaterBackgroundViewport.addEventListener('drop', (e) => {
            e.preventDefault(); if (!isGm) return;
            try {
                const dataString = e.dataTransfer.getData('application/json');
                if (!dataString) return;
                const data = JSON.parse(dataString);
                const containerRect = theaterBackgroundViewport.getBoundingClientRect();
                
                const worldX = (e.clientX - containerRect.left + theaterBackgroundViewport.scrollLeft) / currentScenarioScale;
                const worldY = (e.clientY - containerRect.top + theaterBackgroundViewport.scrollTop) / currentScenarioScale;
                
                const tokenWidth = 200; // default width
                const tokenHeight = 200; // estimate

                const newToken = { 
                    id: `token-${Date.now()}`, 
                    charName: data.charName, 
                    img: data.img, 
                    x: worldX - (tokenWidth / 2), 
                    y: worldY - (tokenHeight / 2), 
                    scale: 1, 
                    isFlipped: false 
                };
                socket.emit('playerAction', { type: 'updateToken', token: newToken });
            } catch (error) { console.error("Erro ao processar o drop:", error); }
        });
    
        theaterGlobalScale.addEventListener('input', () => {
             if(isGm) {
                socket.emit('playerAction', { type: 'updateGlobalScale', scale: parseFloat(theaterGlobalScale.value) });
            }
        });
        
        theaterPublishBtn.addEventListener('click', () => {
            showInfoModal("Publicar Cena", `<p>Deseja mostrar a cena atual para os espectadores?</p><p>Eles verão o cenário e os personagens como você os arrumou.</p><div style="display: flex; justify-content: center; gap: 20px; margin-top: 20px;"><button id="confirm-publish-btn" style="background-color: #28a745; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Sim, Publicar</button><button id="cancel-publish-btn" style="background-color: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Ainda Não</button></div>`);
            document.getElementById('confirm-publish-btn').onclick = () => { socket.emit('playerAction', { type: 'publish_stage' }); modal.classList.add('hidden'); }; document.getElementById('cancel-publish-btn').onclick = () => modal.classList.add('hidden');
        });

        theaterChangeScenarioBtn.onclick = () => {
            const modalHtml = `
                <div id="modal-tabs-container" style="display: flex; gap: 10px; margin-bottom: 15px; justify-content: center; flex-wrap: wrap;"></div>
                <div id="modal-scenarios-container" style="display: flex; flex-wrap: wrap; gap: 15px; justify-content: center; max-height: 400px; overflow-y: auto;"></div>
            `;
            showInfoModal("Mudar Cenário", modalHtml);

            const tabsContainer = document.getElementById('modal-tabs-container');
            const scenariosContainer = document.getElementById('modal-scenarios-container');

            const renderCategory = (categoryName) => {
                scenariosContainer.innerHTML = '';
                const category = THEATER_SCENARIOS[categoryName];
                for (let i = 1; i <= category.count; i++) {
                    const name = `${category.baseName} (${i})`;
                    const fileName = `mapas/${categoryName}/${name}.png`;
                    const card = document.createElement('div');
                    card.className = 'scenario-card';
                    card.style.width = '200px';
                    card.innerHTML = `<img src="images/${fileName}" alt="${name}" style="height: 100px;"><div class="scenario-name" style="font-size: 1.1em; padding: 5px;">${name}</div>`;
                    card.onclick = () => {
                        socket.emit('playerAction', { type: 'changeScenario', scenario: fileName });
                        modal.classList.add('hidden');
                    };
                    scenariosContainer.appendChild(card);
                }
            };

            Object.keys(THEATER_SCENARIOS).forEach((categoryName, index) => {
                const btn = document.createElement('button');
                btn.className = 'category-tab-btn';
                btn.textContent = categoryName.replace(/_/g, ' ').toUpperCase();
                btn.onclick = (e) => {
                    tabsContainer.querySelectorAll('.category-tab-btn').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                    renderCategory(categoryName);
                };
                if (index === 0) {
                    btn.classList.add('active');
                }
                tabsContainer.appendChild(btn);
            });
            
            renderCategory(Object.keys(THEATER_SCENARIOS)[0]);
        };
    
        theaterBackgroundViewport.addEventListener('mousedown', (e) => {
            const isToken = e.target.classList.contains('theater-token');
            
            if (isGm && isGroupSelectMode && !isToken) {
                e.preventDefault();
                const viewportRect = theaterBackgroundViewport.getBoundingClientRect();
                
                // Posição inicial do mouse relativa ao viewport
                const startX = e.clientX - viewportRect.left;
                const startY = e.clientY - viewportRect.top;

                selectionBox.style.left = `${startX + theaterBackgroundViewport.scrollLeft}px`;
                selectionBox.style.top = `${startY + theaterBackgroundViewport.scrollTop}px`;
                selectionBox.style.width = '0px';
                selectionBox.style.height = '0px';
                selectionBox.classList.remove('hidden');

                const onMouseMoveMarquee = (moveEvent) => {
                    const currentX = moveEvent.clientX - viewportRect.left;
                    const currentY = moveEvent.clientY - viewportRect.top;
                    
                    const width = currentX - startX;
                    const height = currentY - startY;

                    selectionBox.style.width = `${Math.abs(width)}px`;
                    selectionBox.style.height = `${Math.abs(height)}px`;
                    selectionBox.style.left = `${(width < 0 ? currentX : startX) + theaterBackgroundViewport.scrollLeft}px`;
                    selectionBox.style.top = `${(height < 0 ? currentY : startY) + theaterBackgroundViewport.scrollTop}px`;
                };

                const onMouseUpMarquee = () => {
                    // *** CORREÇÃO: Usar getBoundingClientRect para comparar posições visuais ***
                    const boxRect = selectionBox.getBoundingClientRect();
                    selectionBox.classList.add('hidden');
                    
                    if (!e.ctrlKey) {
                        document.querySelectorAll('.theater-token.selected').forEach(t => t.classList.remove('selected'));
                        selectedTokens.clear();
                    }
                    
                    document.querySelectorAll('.theater-token').forEach(token => {
                        const tokenRect = token.getBoundingClientRect();
                        const isIntersecting = !(tokenRect.right < boxRect.left || 
                                                 tokenRect.left > boxRect.right || 
                                                 tokenRect.bottom < boxRect.top || 
                                                 tokenRect.top > boxRect.bottom);

                        if (isIntersecting) {
                            token.classList.add('selected');
                            selectedTokens.add(token.id);
                        }
                    });

                    window.removeEventListener('mousemove', onMouseMoveMarquee);
                    window.removeEventListener('mouseup', onMouseUpMarquee);
                };
                window.addEventListener('mousemove', onMouseMoveMarquee);
                window.addEventListener('mouseup', onMouseUpMarquee);

            } else if (isGm && isToken) {
                e.preventDefault();
                const draggedToken = e.target;
                
                const isGroupDrag = selectedTokens.has(draggedToken.id);
                const tokensToDrag = isGroupDrag ? Array.from(selectedTokens) : [draggedToken.id];
                const startPositions = {};
                
                tokensToDrag.forEach(tokenId => {
                    const tokenEl = document.getElementById(tokenId);
                    if(tokenEl) {
                       startPositions[tokenId] = { x: parseFloat(tokenEl.style.left), y: parseFloat(tokenEl.style.top) };
                    }
                });

                const startMouseX = e.clientX;
                const startMouseY = e.clientY;

                if (!isGroupDrag) {
                    if (!e.ctrlKey) {
                        document.querySelectorAll('.theater-token.selected').forEach(t => t.classList.remove('selected'));
                        selectedTokens.clear();
                    }
                    draggedToken.classList.add('selected');
                    selectedTokens.add(draggedToken.id);
                }

                function onMouseMoveToken(moveEvent) {
                    const dx = (moveEvent.clientX - startMouseX) / currentScenarioScale;
                    const dy = (moveEvent.clientY - startMouseY) / currentScenarioScale;

                    tokensToDrag.forEach(tokenId => {
                        const tokenEl = document.getElementById(tokenId);
                        if(tokenEl && startPositions[tokenId]) {
                           tokenEl.style.left = `${startPositions[tokenId].x + dx}px`;
                           tokenEl.style.top = `${startPositions[tokenId].y + dy}px`;
                        }
                    });
                }

                function onMouseUpToken() {
                    const updates = tokensToDrag.map(tokenId => {
                         const tokenEl = document.getElementById(tokenId);
                         if (tokenEl) {
                             return {
                                 id: tokenId,
                                 x: parseFloat(tokenEl.style.left),
                                 y: parseFloat(tokenEl.style.top)
                             };
                         }
                         return null;
                    }).filter(Boolean);
                    
                    if (updates.length > 0) {
                        socket.emit('playerAction', { type: 'updateToken', token: { updates: updates } });
                    }
                     
                    window.removeEventListener('mousemove', onMouseMoveToken);
                    window.removeEventListener('mouseup', onMouseUpToken);
                }
                window.addEventListener('mousemove', onMouseMoveToken);
                window.addEventListener('mouseup', onMouseUpToken);
            } else if (!isToken && !(isGm && isGroupSelectMode)) {
                isDraggingScenario = true;
                theaterBackgroundViewport.style.cursor = 'grabbing';
                let lastMouseX = e.clientX;
                let lastMouseY = e.clientY;

                const onMouseMoveScenario = (moveEvent) => {
                    if (!isDraggingScenario) return;
                    const dx = moveEvent.clientX - lastMouseX;
                    const dy = moveEvent.clientY - lastMouseY;
                    theaterBackgroundViewport.scrollLeft -= dx;
                    theaterBackgroundViewport.scrollTop -= dy;
                    lastMouseX = moveEvent.clientX;
                    lastMouseY = moveEvent.clientY;
                };

                const onMouseUpScenario = () => {
                    isDraggingScenario = false;
                    theaterBackgroundViewport.style.cursor = 'grab';
                    window.removeEventListener('mousemove', onMouseMoveScenario);
                    window.removeEventListener('mouseup', onMouseUpScenario);
                };

                window.addEventListener('mousemove', onMouseMoveScenario);
                window.addEventListener('mouseup', onMouseUpScenario);
            }
        });
    
        theaterBackgroundViewport.addEventListener('wheel', (e) => {
            if (!currentGameState || currentGameState.mode !== 'theater') return;

            if (isGm && e.target.classList.contains('theater-token')) {
                e.preventDefault();
                const currentToken = e.target;
                const isGroupResize = selectedTokens.has(currentToken.id);
                const tokensToResize = isGroupResize ? Array.from(selectedTokens).map(id => document.getElementById(id)) : [currentToken];
                
                const scaleAmount = e.deltaY > 0 ? -0.1 : 0.1;

                tokensToResize.forEach(tokenToResize => {
                    if (tokenToResize) {
                        const currentScale = parseFloat(tokenToResize.dataset.scale) || 1;
                        const newScale = Math.max(0.1, currentScale + scaleAmount);
                        tokenToResize.dataset.scale = newScale;
                        socket.emit('playerAction', { type: 'updateToken', token: { id: tokenToResize.id, scale: newScale }});
                    }
                });
                return;
            }

            e.preventDefault();
            const scaleAmount = e.deltaY > 0 ? -0.1 : 0.1;
            currentScenarioScale = Math.max(0.2, Math.min(5, currentScenarioScale + scaleAmount));
            updateTheaterZoom();

        }, { passive: false });
    }

    function renderTheaterMode(state) {
        const dataToRender = (myPlayerKey === 'spectator' && state.publicState) ? state.publicState : state;
        const gmData = isGm ? state : null;

        if (dataToRender.scenario) {
            const worldContainer = document.getElementById('theater-world-container');
            
            const img = new Image();
            img.onload = () => {
                theaterBackgroundImage.src = img.src;
                if (worldContainer) {
                    worldContainer.style.width = `${img.naturalWidth}px`;
                    worldContainer.style.height = `${img.naturalHeight}px`;
                }
                if (isGm && (state.scenarioWidth !== img.naturalWidth || state.scenarioHeight !== img.naturalHeight)) {
                    socket.emit('playerAction', { type: 'update_scenario_dims', width: img.naturalWidth, height: img.naturalHeight });
                }
            };
            img.src = `images/${dataToRender.scenario}`;
        }
        
        const theaterScreenEl = document.getElementById('theater-screen'); 
        const toggleGmPanelBtn = document.getElementById('toggle-gm-panel-btn');
        theaterGmPanel.classList.toggle('hidden', !isGm); 
        toggleGmPanelBtn.classList.toggle('hidden', !isGm);
        theaterPublishBtn.classList.toggle('hidden', !isGm || !state.isStaging);

        if (isGm) {
            theaterGlobalScale.value = state.globalTokenScale || 1.0;
        }

        if (!isGm) { 
            theaterScreenEl.classList.add('panel-hidden'); 
        }
        
        theaterTokenContainer.innerHTML = '';
        const fragment = document.createDocumentFragment();
        
        const tokensToRender = isGm ? gmData.tokens : dataToRender.tokens;
        const tokenOrderToRender = isGm ? gmData.tokenOrder : dataToRender.tokenOrder;

        tokenOrderToRender.forEach((tokenId, index) => {
            const tokenData = tokensToRender[tokenId];
            if (!tokenData) return;

            const tokenEl = document.createElement('img');
            tokenEl.id = tokenId;
            tokenEl.className = 'theater-token';
            tokenEl.src = tokenData.img;
            tokenEl.style.left = `${tokenData.x}px`;
            tokenEl.style.top = `${tokenData.y}px`;
            tokenEl.style.zIndex = index;
            
            const scale = tokenData.scale || 1;
            const isFlipped = tokenData.isFlipped;
            tokenEl.dataset.scale = scale;
            tokenEl.dataset.flipped = String(isFlipped);
            tokenEl.title = tokenData.charName;
            tokenEl.draggable = false;
            
            if (isGm) {
                if (selectedTokens.has(tokenId)) {
                    tokenEl.classList.add('selected');
                }
                const tokenCenterX = tokenData.x + (200 * scale / 2);
                const tokenCenterY = tokenData.y + (200 * scale / 2);
                if (gmData.scenarioWidth && (tokenCenterX < 0 || tokenCenterX > gmData.scenarioWidth || tokenCenterY < 0 || tokenCenterY > gmData.scenarioHeight)) {
                    tokenEl.classList.add('off-stage');
                }
            }
            fragment.appendChild(tokenEl);
        });
        theaterTokenContainer.appendChild(fragment);
        
        updateTheaterZoom();
    }
    // #endregion

    socket.on('playSound', (soundFile) => { if (!soundFile) return; const sound = new Audio(`sons/${soundFile}`); sound.currentTime = 0; sound.play().catch(e => console.error(`Erro ao tocar som: ${soundFile}`, e)); });
    socket.on('triggerAttackAnimation', ({ attackerKey }) => { const img = document.getElementById(`${attackerKey}-fight-img`); if (img) { img.classList.add(`is-attacking-${attackerKey}`); setTimeout(() => img.classList.remove(`is-attacking-${attackerKey}`), 400); } });
    socket.on('triggerHitAnimation', ({ defenderKey }) => { const img = document.getElementById(`${defenderKey}-fight-img`); if (img) { img.classList.add('is-hit'); setTimeout(() => img.classList.remove('is-hit'), 500); } });
    socket.on('assignPlayer', (data) => { myPlayerKey = data.playerKey; isGm = data.isGm; if (myPlayerKey === 'host' || isGm) exitGameBtn.classList.remove('hidden'); });
    socket.on('promptRoll', ({ targetPlayerKey, text, action }) => {
        let btn = document.getElementById(`${targetPlayerKey}-roll-btn`); const isMyTurnToRoll = myPlayerKey === targetPlayerKey;
        const newBtn = btn.cloneNode(true); btn.parentNode.replaceChild(newBtn, btn); btn = newBtn;
        btn.innerText = text; btn.classList.remove('hidden', 'inactive');
        if (isMyTurnToRoll) { btn.onclick = () => { btn.disabled = true; socket.emit('playerAction', action); }; btn.disabled = false;
        } else { btn.disabled = true; btn.onclick = null; if (myPlayerKey !== 'spectator' && myPlayerKey !== 'host' && !isGm) btn.classList.add('inactive'); }
    });

    socket.on('hideRollButtons', () => { ['player1-roll-btn', 'player2-roll-btn'].forEach(id => document.getElementById(id).classList.add('hidden')); });
    socket.on('showModal', ({ title, text, btnText, action, targetPlayerKey, modalType, knockdownInfo, doubleKnockdownInfo }) => {
        let isMyTurnForAction = myPlayerKey === targetPlayerKey;
        if (modalType === 'disqualification' && isGm) isMyTurnForAction = true;
        if (currentGameState.mode === 'arena' && action?.type === 'reveal_winner') isMyTurnForAction = myPlayerKey === 'host';
        switch(modalType) {
            case 'gm_knockdown_decision': if (isGm) { const downedFighterName = currentGameState.fighters[knockdownInfo.downedPlayer]?.nome || 'O lutador'; const modalContentHtml = `<p>${downedFighterName} falhou em todas as tentativas de se levantar. O que o juíz (você) fará?</p><div style="display: flex; justify-content: center; gap: 20px; margin-top: 20px;"><button id="gm-give-chance-btn" style="background-color: #28a745; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Dar Última Chance</button><button id="gm-end-fight-btn" style="background-color: #dc3545; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Encerrar a Luta (KO)</button></div>`; showInfoModal("Decisão do Juíz", modalContentHtml); document.getElementById('gm-give-chance-btn').onclick = () => { socket.emit('playerAction', { type: 'give_last_chance' }); modal.classList.add('hidden'); }; document.getElementById('gm-end-fight-btn').onclick = () => { socket.emit('playerAction', { type: 'resolve_knockdown_loss' }); modal.classList.add('hidden'); }; } break;
            case 'disqualification': case 'gameover': case 'decision_table': if (isMyTurnForAction) { showInteractiveModal(title, text, btnText, action); } else { showInfoModal(title, text); } break;
            case 'double_knockdown':
                const dki = doubleKnockdownInfo; const counts = ["1..... 2.....", "3..... 4.....", "5..... 6.....", "7..... 8.....", "9....."]; const countText = `O juíz inicia a contagem: ${counts[dki.attempts] || counts[counts.length-1]}`; const p1Name = currentGameState.fighters.player1.nome; const p2Name = currentGameState.fighters.player2.nome;
                const getStatusText = (playerKey) => { if (dki.getUpStatus[playerKey] === 'success') return `<span style="color: #28a745;">Se levantou!</span>`; if (dki.getUpStatus[playerKey] === 'fail_tko') return `<span style="color: #dc3545;">Não pode continuar!</span>`; if (dki.readyStatus[playerKey]) return "Pronto!"; return `Aguardando ${playerKey === 'player1' ? p1Name : p2Name}...`; };
                let p1StatusText = getStatusText('player1'); let p2StatusText = getStatusText('player2');
                let modalContentHtml = `<p style='text-align: center; font-style: italic; color: #ccc;'>${countText}</p><div style="display:flex; justify-content:space-around; margin: 15px 0;"><p>${p1StatusText}</p><p>${p2StatusText}</p></div>`;
                const myPlayerCanAct = (myPlayerKey === 'player1' && dki.getUpStatus.player1 === 'pending' && !dki.readyStatus.player1) || (myPlayerKey === 'player2' && dki.getUpStatus.player2 === 'pending' && !dki.readyStatus.player2);
                showInteractiveModal(title, modalContentHtml, btnText, { ...action, playerKey: myPlayerKey }); if(!myPlayerCanAct) { modalButton.disabled = true; modalButton.innerText = "Aguardando Oponente..."; } break;
            case 'knockdown':
                const downedFighterName = currentGameState.fighters[targetPlayerKey]?.nome || 'Oponente'; let modalTitleText = `${downedFighterName} caiu!`; const attempts = knockdownInfo.attempts; const maxAttempts = knockdownInfo.isLastChance ? 5 : 4; const counts_single = ["1..... 2.....", "3..... 4.....", "5..... 6.....", "7..... 8.....", "9....."];
                const countText_single = attempts === 0 ? `O juíz começa a contagem: ${counts_single[0]}` : `A contagem continua: ${counts_single[attempts] || counts_single[counts_single.length-1]}`; let modalContentText = `<p style='text-align: center; font-style: italic; color: #ccc;'>${countText_single}</p>`;
                if (knockdownInfo.lastRoll) { modalContentText += `Rolagem: <strong>${knockdownInfo.lastRoll}</strong> <span>(precisa de 7 ou mais)</span>`; }
                if (targetPlayerKey === myPlayerKey) { modalTitleText = `Você caiu!`; modalContentText += `<br>Tentativas restantes: ${maxAttempts - attempts}`; showInteractiveModal(modalTitleText, modalContentText, 'Tentar Levantar', action);
                } else { modalContentText = `<p style='text-align: center; font-style: italic; color: #ccc;'>${countText_single}</p> Aguarde a contagem...`; if (knockdownInfo.lastRoll) { modalContentText += `<br>Rolagem: <strong>${knockdownInfo.lastRoll}</strong> <span>(precisa de 7 ou mais)</span>`; } showInfoModal(modalTitleText, modalContentText); } break;
        }
    });

    socket.on('doubleKnockdownResults', (results) => {
        modal.classList.add('hidden');
        ['player1', 'player2'].forEach(pKey => {
            const resultData = results[pKey]; if (resultData) { const overlay = document.getElementById(`${pKey}-dk-result`); overlay.innerHTML = `<h4>${currentGameState.fighters[pKey].nome}</h4><p>Rolagem: ${resultData.total}</p>`; overlay.className = 'dk-result-overlay'; overlay.classList.add(resultData.success ? 'success' : 'fail'); overlay.classList.remove('hidden'); }
        });
        setTimeout(() => { document.getElementById('player1-dk-result').classList.add('hidden'); document.getElementById('player2-dk-result').classList.add('hidden'); }, 3000);
    });

    socket.on('showGameAlert', (message) => {
        const alertOverlay = document.getElementById('game-alert-overlay'); const alertContent = document.getElementById('game-alert-content');
        if (alertOverlay && alertContent) { alertContent.innerHTML = message; alertOverlay.classList.remove('hidden'); setTimeout(() => { alertOverlay.classList.add('hidden'); }, 3000); }
    });

    socket.on('getUpSuccess', ({ downedPlayerName, rollValue }) => { modal.classList.add('hidden'); getUpSuccessOverlay.classList.remove('hidden'); getUpSuccessContent.innerHTML = `${rollValue} - ${downedPlayerName.toUpperCase()} CONSEGUIU SE LEVANTAR! <span>(precisava de 7 ou mais)</span>`; setTimeout(() => getUpSuccessOverlay.classList.add('hidden'), 3000); });
    socket.on('hideModal', () => modal.classList.add('hidden'));
    socket.on('diceRoll', showDiceRollAnimation);
    socket.on('opponentDisconnected', ({message}) => { showInfoModal("Partida Encerrada", `${message}<br>Recarregue a página para jogar novamente.`); });

    initialize();
    
    // *** A lógica de escala original foi restaurada para corrigir o bug do menu inicial. ***
    const scaleGame = () => { if (window.innerWidth > 800) { const w = document.getElementById('game-wrapper'); const s = Math.min(window.innerWidth / 1280, window.innerHeight / 720); w.style.transform = `scale(${s})`; w.style.left = `${(window.innerWidth - (1280 * s)) / 2}px`; w.style.top = `${(window.innerHeight - (720 * s)) / 2}px`; } else { const w = document.getElementById('game-wrapper'); w.style.transform = 'none'; w.style.left = '0'; w.style.top = '0'; } };
    
    scaleGame();
    window.addEventListener('resize', scaleGame);
});