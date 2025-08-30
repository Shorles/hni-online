document.addEventListener('DOMContentLoaded', () => {
    let myRole = null;
    let myPlayerKey = null;
    let isGm = false;
    let currentGameState = null;
    let currentRoomId = new URLSearchParams(window.location.search).get('room');
    const socket = io();

    let player1SetupData = { scenario: null };
    let availableSpecialMoves = {};
    
    let ALL_FIGHTERS_DATA = {};

    const allScreens = document.querySelectorAll('.screen');
    const gameWrapper = document.getElementById('game-wrapper');

    const initialLoadingScreen = document.getElementById('initial-loading-screen');
    const passwordScreen = document.getElementById('password-screen');
    const roleSelectionScreen = document.getElementById('role-selection-screen');
    const gmInitialLobby = document.getElementById('gm-initial-lobby');
    const playerWaitingScreen = document.getElementById('player-waiting-screen');

    const scenarioScreen = document.getElementById('scenario-screen');
    const selectionScreen = document.getElementById('selection-screen');
    const fightScreen = document.getElementById('fight-screen');
    const theaterScreen = document.getElementById('theater-screen');

    const charListContainer = document.getElementById('character-list-container');
    const confirmBtn = document.getElementById('confirm-selection-btn');
    const selectionTitle = document.getElementById('selection-title');
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
    const theaterBackBtn = document.getElementById('theater-back-btn');
    const theaterPublishBtn = document.getElementById('theater-publish-btn');
    
    const testAgiBtn = document.getElementById('test-agi-btn');
    const testResBtn = document.getElementById('test-res-btn');
    const testPadraoBtn = document.getElementById('test-padrao-btn');
    const attributeTestOverlay = document.getElementById('attribute-test-overlay');
    const attributeTestContent = document.getElementById('attribute-test-content');
    const testResultHeader = document.getElementById('test-result-header');
    const testResultCritText = document.getElementById('test-result-crit-text');
    const testResultTotal = document.getElementById('test-result-total');
    const testResultGmOkBtn = document.getElementById('test-result-gm-ok-btn');

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

    socket.on('availableFighters', ({ p1 }) => {
        ALL_FIGHTERS_DATA = p1 || {};
        if(myRole === 'gm' && theaterScreen.classList.contains('active')){
            initializeTheaterMode();
        }
    });

    function showHelpModal() {
        if (!currentGameState || currentGameState.mode === 'theater') return;
        // <<< ALTERAÇÃO 1: Atualizando a descrição do golpe na ajuda >>>
        const MOVE_EFFECTS = {'Liver Blow': '30% de chance de remover 1 PA do oponente.','Clinch': 'Se acertar, remove 2 PA do oponente. Crítico remove 4.','Golpe Ilegal': 'Chance de perder pontos ou ser desqualificado. A chance de DQ aumenta a cada uso.','Fortalecer Defesa': '(Reação) Custa 3 PA e adiciona +1 à sua DEF permanentemente neste round. Pode ser usado até 2 vezes por round.','Counter': '(Reação) Intercepta o golpe do oponente. O custo de PA é igual ao do golpe recebido. Ambos rolam ataque; o maior resultado vence e causa o dobro de dano no perdedor.','Flicker Jab': 'Repete o ataque continuamente até errar.','White Fang': 'Permite um segundo uso consecutivo sem custo de PA.','OraOraOra': 'Nenhum', 'Dempsey Roll': 'Recebe +2 no acerto. Se errar, o usuário recebe o dano do golpe.'};
        const BASIC_MOVES_ORDER = ['Jab', 'Direto', 'Upper', 'Liver Blow', 'Clinch', 'Golpe Ilegal', 'Fortalecer Defesa'];
        let playerSpecialMoves = [];
        if (myPlayerKey === 'player1' || myPlayerKey === 'player2') {
            const fighter = currentGameState.fighters[myPlayerKey];
            if (fighter && fighter.specialMoves) { playerSpecialMoves = fighter.specialMoves; } else { playerSpecialMoves = Object.keys(availableSpecialMoves || {}); }
        } else { playerSpecialMoves = Object.keys(currentGameState.moves).filter(m => !BASIC_MOVES_ORDER.includes(m)); }
        playerSpecialMoves.sort();
        let tableHtml = `<div class="help-table-container"><table id="help-modal-table"><thead><tr><th>Nome</th><th>Custo (PA)</th><th>Dano</th><th>Penalidade</th><th>Efeito</th></tr></thead><tbody>`;
        const renderRow = (moveName) => {
            const move = currentGameState.moves[moveName]; if (!move) return '';
            const displayName = move.displayName || moveName; const cost = moveName === 'Counter' ? 'Variável' : move.cost; const effect = MOVE_EFFECTS[moveName] || 'Nenhum'; const penaltyDisplay = move.penalty > 0 ? `-${move.penalty}` : (move.hitBonus > 0 ? `+${move.hitBonus}` : move.penalty);
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
        
        const target = event.target.closest('button');
        if (!target || target.disabled) return;
        
        const move = target.dataset.move;

        if (move === 'Fortalecer Defesa') {
            socket.emit('playerAction', { type: 'Fortalecer Defesa', playerKey: myPlayerKey });
        } else if (move === 'Golpe Ilegal') {
            const fighter = currentGameState.fighters[myPlayerKey];
            const moveData = currentGameState.moves['Golpe Ilegal'];
            if (fighter && moveData && fighter.pa >= moveData.cost) {
                showIllegalMoveConfirmation();
            }
        } else if (move) {
            socket.emit('playerAction', { type: 'attack', move: move, playerKey: myPlayerKey });
        } else if (target.id === `p${myPlayerKey.slice(-1)}-end-turn-btn`) {
            socket.emit('playerAction', { type: 'end_turn', playerKey: myPlayerKey });
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

        [charSelectBackBtn, specialMovesBackBtn, exitGameBtn, copySpectatorLinkInGameBtn, theaterBackBtn].forEach(btn => {
            if (btn) btn.classList.add('hidden');
        });
        
        if (currentRoomId) {
            socket.emit('playerJoinsLobby', { roomId: currentRoomId });
            showScreen(roleSelectionScreen);

            document.getElementById('join-as-player-btn').onclick = () => {
                socket.emit('playerSetsRole', { role: 'player' });
                showScreen(selectionScreen);
                selectionTitle.innerText = `Selecione seu Personagem`;
                confirmBtn.innerText = 'Confirmar Personagem';
            };

            document.getElementById('join-as-spectator-btn').onclick = () => {
                socket.emit('playerSetsRole', { role: 'spectator' });
                showScreen(playerWaitingScreen);
                playerWaitingScreen.querySelector('h1').innerText = "Arata na Ippo";
                document.getElementById('player-waiting-message').innerText = "Aguardando como espectador...";
            };
        } else {
            showScreen(passwordScreen);
            const passInput = document.getElementById('password-input');
            const passBtn = document.getElementById('password-submit-btn');
            passInput.onkeydown = (e) => { if (e.key === 'Enter') passBtn.click(); };
            passBtn.onclick = () => {
                if (passInput.value === 'abif13') {
                    socket.emit('gmCreatesLobby');
                } else {
                    alert('Senha incorreta.');
                }
            };
        }
        
        confirmBtn.addEventListener('click', onConfirmSelection);

        document.getElementById('start-classic-btn').onclick = () => { showScreen(scenarioScreen); renderScenarioSelection('classic'); };
        document.getElementById('start-arena-btn').onclick = () => { 
            socket.emit('playerAction', { type: 'gmStartsMode', targetMode: 'arena', scenario: 'Ringue2.png' });
        };
        document.getElementById('start-theater-btn').onclick = () => { showScreen(scenarioScreen); renderScenarioSelection('theater'); };


        charSelectBackBtn.addEventListener('click', () => {
        });
        specialMovesBackBtn.addEventListener('click', () => { showScreen(selectionScreen); });
        
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
        
        // <<< ALTERAÇÃO 2: Adicionando event listener para o botão "Jogar a Toalha" >>>
        document.getElementById('forfeit-btn').addEventListener('click', () => {
            if (!myPlayerKey || document.getElementById('forfeit-btn').disabled) return;
            const modalContentHtml = `<p>Tem certeza de que deseja desistir da luta? Isso resultará em uma derrota imediata.</p><div style="display: flex; justify-content: center; gap: 20px; margin-top: 20px;"><button id="confirm-forfeit-btn" style="background-color: #dc3545; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Sim, Desistir</button><button id="cancel-forfeit-btn" style="background-color: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Não, Continuar</button></div>`;
            showInfoModal("Jogar a Toalha", modalContentHtml);
            document.getElementById('confirm-forfeit-btn').onclick = () => { 
                socket.emit('playerAction', { type: 'forfeit', playerKey: myPlayerKey });
                modal.classList.add('hidden'); 
            };
            document.getElementById('cancel-forfeit-btn').onclick = () => modal.classList.add('hidden');
        });

        copySpectatorLinkInGameBtn.onclick = () => { 
            if (currentRoomId) copyToClipboard(`${window.location.origin}?room=${currentRoomId}`, copySpectatorLinkInGameBtn);
        };
        
        testAgiBtn.addEventListener('click', () => {
            socket.emit('playerAction', { type: 'player_roll_theater_test', testType: 'AGI' });
        });
        testResBtn.addEventListener('click', () => {
            socket.emit('playerAction', { type: 'player_roll_theater_test', testType: 'RES' });
        });
        testPadraoBtn.addEventListener('click', () => {
            socket.emit('playerAction', { type: 'player_roll_theater_test', testType: 'Padrão' });
        });
        testResultGmOkBtn.addEventListener('click', () => {
            socket.emit('playerAction', { type: 'gm_clear_attribute_test' });
        });

        setupTheaterEventListeners();
        initializeGlobalKeyListeners();
    }

    function onConfirmSelection() {
        const selectedCard = document.querySelector('.char-card.selected'); if (!selectedCard) { alert('Por favor, selecione um personagem!'); return; }
        
        if (myRole === 'player') {
            const playerData = { nome: selectedCard.dataset.name, img: selectedCard.dataset.img };
            socket.emit('playerAction', { type: 'playerSelectsCharacter', character: playerData });
            showScreen(playerWaitingScreen);
            playerWaitingScreen.querySelector('h1').innerText = "Arata na Ippo";
            document.getElementById('player-waiting-message').innerText = "Personagem enviado! Aguardando o Mestre configurar seus atributos...";
            confirmBtn.disabled = true;
            return;
        }

        if (currentGameState && currentGameState.phase === 'gm_classic_setup') {
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


    function renderGmCharacterSelection(showStatsInputs = false) {
        charListContainer.innerHTML = ''; 
        
        const charData = ALL_FIGHTERS_DATA;
        const imgPath = 'images/lutadores/';

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
                document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected')); 
                card.classList.add('selected'); 
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
        const tabsContainer = document.getElementById('scenario-category-tabs');
        const scenarioListContainer = document.getElementById('scenario-list-container');
        
        tabsContainer.innerHTML = '';
        scenarioListContainer.innerHTML = '';

        if (mode === 'classic' || mode === 'arena') {
            tabsContainer.style.display = 'none';
            Object.entries(SCENARIOS).forEach(([name, fileName]) => {
                const card = document.createElement('div');
                card.className = 'scenario-card';
                card.innerHTML = `<img src="images/${fileName}" alt="${name}"><div class="scenario-name">${name}</div>`;
                card.onclick = () => {
                    socket.emit('playerAction', { type: 'gmStartsMode', targetMode: mode, scenario: fileName });
                };
                scenarioListContainer.appendChild(card);
            });
        } else if (mode === 'theater') {
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
                        socket.emit('playerAction', { type: 'gmStartsMode', targetMode: 'theater', scenario: fileName });
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
                }
            });

            renderCategory(categories[0]);
        }
    }
    
    function showModeSwitchModal() {
        if (!isGm) return;
        const modalContentHtml = `
            <p>Deseja alterar o modo de jogo?</p>
            <p style="font-size: 0.9em; color: #ccc;">A sessão será reiniciada e todos voltarão ao lobby inicial.</p>
            <div style="display: flex; justify-content: center; gap: 20px; margin-top: 20px;">
                <button id="switch-to-lobby-btn" class="mode-btn">Voltar ao Lobby</button>
            </div>
        `;
        showInfoModal("Mudar Modo de Jogo", modalContentHtml);
        document.getElementById('switch-to-lobby-btn').onclick = () => { 
            socket.emit('playerAction', { type: 'gm_switch_mode', targetMode: 'lobby' });
            modal.classList.add('hidden');
        };
    }

    socket.on('promptOpponentSelection', ({ availablePlayers }) => {
        if (!isGm) return;
        let playerListHtml = '<ul>';
        if (availablePlayers.length > 0) {
            availablePlayers.forEach(player => {
                const stats = player.configuredStats;
                const statsText = `(AGI: ${stats.agi}, RES: ${stats.res})`;
                playerListHtml += `
                    <li class="opponent-selection-item" data-socket-id="${player.id}">
                        <img src="${player.selectedCharacter.img}" alt="${player.selectedCharacter.nome}">
                        <span>${player.selectedCharacter.nome}</span>
                        <small>${statsText}</small>
                    </li>`;
            });
        } else {
            playerListHtml += `<li>Nenhum jogador configurado disponível para lutar.</li>`;
        }
        playerListHtml += '</ul>';

        showInfoModal("Selecione o Oponente", playerListHtml);

        document.querySelectorAll('.opponent-selection-item').forEach(item => {
            item.onclick = () => {
                const opponentSocketId = item.dataset.socketId;
                socket.emit('playerAction', { type: 'gmSelectsOpponent', opponentSocketId });
                modal.classList.add('hidden');
            };
        });
    });

    socket.on('promptArenaOpponentSelection', ({ availablePlayers }) => {
        if (!isGm) return;
        let selected = [];
        let playerListHtml = '<ul>';
        
        if (availablePlayers.length >= 2) {
             availablePlayers.forEach(player => {
                playerListHtml += `
                    <li class="opponent-selection-item" data-socket-id="${player.id}">
                        <img src="${player.selectedCharacter.img}" alt="${player.selectedCharacter.nome}">
                        <span>${player.selectedCharacter.nome}</span>
                    </li>`;
            });
        } else {
             playerListHtml += `<li>São necessários pelo menos 2 jogadores configurados para o modo Arena.</li>`;
        }
        playerListHtml += '</ul>';

        showInteractiveModal("Selecione 2 Lutadores para a Arena", playerListHtml, "Confirmar e Iniciar Luta", null);
        modalButton.disabled = true;

        document.querySelectorAll('.opponent-selection-item').forEach(item => {
            item.onclick = () => {
                item.classList.toggle('selected');
                
                selected = Array.from(document.querySelectorAll('.opponent-selection-item.selected'))
                                .map(el => el.dataset.socketId);
                
                modalButton.disabled = selected.length !== 2;
            };
        });

        modalButton.onclick = () => {
            if (selected.length === 2) {
                socket.emit('playerAction', { type: 'gmSelectsArenaFighters', p1_socketId: selected[0], p2_socketId: selected[1] });
                modal.classList.add('hidden');
            }
        };
    });

    socket.on('promptSpecialMoves', (data) => {
        availableSpecialMoves = data.availableMoves;
        specialMovesTitle.innerText = 'Selecione os Golpes Especiais do GM';
        renderSpecialMoveSelection(specialMovesList, data.availableMoves);
        specialMovesModal.classList.remove('hidden');
        confirmSpecialMovesBtn.onclick = () => {
            const selectedMoves = Array.from(specialMovesList.querySelectorAll('.selected')).map(card => card.dataset.name);
            socket.emit('playerAction', { type: 'set_p1_special_moves', playerKey: myPlayerKey, moves: selectedMoves });
            specialMovesModal.classList.add('hidden');
        };
    });

    socket.on('promptPlayerConfiguration', ({ playerData, availableMoves }) => {
        if (!isGm) return;
        const char = playerData.selectedCharacter;
        const modalContentHtml = `
            <div style="display:flex; gap: 30px; position: relative;">
                <div style="flex: 1; text-align: center;">
                    <h4>Definir Atributos de ${char.nome}</h4>
                    <img src="${char.img}" alt="${char.nome}" style="width: 80px; height: 80px; border-radius: 50%; background: #555; margin: 10px auto; display: block;">
                    <label>AGI: <input type="number" id="player-config-agi" value="2" style="width: 50px; text-align: center;"></label>
                    <label>RES: <input type="number" id="player-config-res" value="2" style="width: 50px; text-align: center;"></label>
                </div>
                <div style="flex: 2; border-left: 1px solid #555; padding-left: 20px; text-align: center;">
                    <h4>Escolher Golpes Especiais</h4>
                    <div id="player-config-moves-list"></div>
                </div>
            </div>`;
        showInteractiveModal(`Configurar Jogador: ${char.nome}`, modalContentHtml, "Confirmar Configuração", null);
        const movesContainer = document.getElementById('player-config-moves-list');
        renderSpecialMoveSelection(movesContainer, availableMoves);
        modal.style.zIndex = "4000";

        modalButton.onclick = () => {
            const agi = document.getElementById('player-config-agi').value;
            const res = document.getElementById('player-config-res').value;
            const selectedMoves = Array.from(movesContainer.querySelectorAll('.selected')).map(card => card.dataset.name);

            if (!agi || !res || isNaN(agi) || isNaN(res) || agi < 1 || res < 1) {
                alert("Valores inválidos para AGI/RES.");
                return;
            }
            const action = {
                type: 'gmSetsPlayerStats',
                playerId: playerData.id,
                stats: { agi, res },
                moves: selectedMoves
            };
            socket.emit('playerAction', action);
            modal.classList.add('hidden');
            modal.style.zIndex = "3000";
        };
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
    
    socket.on('gameUpdate', (gameState) => {
        if (!modal.classList.contains('hidden') && modal.querySelector('#player-config-agi')) {
        } else if (!modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
        }
        specialMovesModal.classList.add('hidden');
        
        const oldState = currentGameState;
        currentGameState = gameState;
        scaleGame();
        
        const SETUP_PHASES = ['p1_special_moves_selection', 'opponent_selection', 'arena_opponent_selection'];
        
        const lobbyState = gameState.mode === 'lobby' ? gameState : gameState.lobbyCache;

        if (isGm) {
            if (gameState.mode === 'lobby') {
                showScreen(gmInitialLobby);
                updateGmLobbyUI(gameState);
            } else if (gameState.mode === 'classic' || gameState.mode === 'arena') {
                 if (gameState.phase === 'gm_classic_setup') {
                    showScreen(selectionScreen);
                    selectionTitle.innerText = 'GM: Selecione seu Lutador';
                    confirmBtn.innerText = 'Confirmar Personagem';
                    confirmBtn.disabled = false;
                    renderGmCharacterSelection(true);
                } else if (SETUP_PHASES.includes(gameState.phase)) {
                    showScreen(playerWaitingScreen);
                    playerWaitingScreen.querySelector('h1').innerText = "Arata na Ippo";
                    document.getElementById('player-waiting-message').innerText = "O Mestre está configurando a partida...";
                } else {
                    showScreen(fightScreen);
                }
            } else if (gameState.mode === 'theater') {
                showScreen(theaterScreen);
                initializeTheaterMode();
                renderTheaterMode(gameState);
            }
        } 
        else if (myRole === 'player') {
            const myPlayerData = lobbyState?.connectedPlayers[socket.id];
            
            if (myPlayerData && !myPlayerData.selectedCharacter) {
                showScreen(selectionScreen);
                renderPlayerCharacterSelection(lobbyState.unavailableCharacters);
            } else {
                if (gameState.mode === 'lobby') {
                    showScreen(playerWaitingScreen);
                    playerWaitingScreen.querySelector('h1').innerText = "Arata na Ippo";
                    let waitMessage = "Aguardando o Mestre iniciar o jogo...";
                    if (myPlayerData && !myPlayerData.configuredStats) {
                        waitMessage = "Personagem enviado! Aguardando o Mestre configurar seus atributos...";
                    } else if (myPlayerData && myPlayerData.configuredStats) {
                        waitMessage = "Você está pronto! Aguardando o Mestre iniciar uma partida...";
                    }
                    document.getElementById('player-waiting-message').innerText = waitMessage;
                } else if (gameState.mode === 'classic' || gameState.mode === 'arena') {
                    if (SETUP_PHASES.includes(gameState.phase) || gameState.phase === 'gm_classic_setup') {
                        showScreen(playerWaitingScreen);
                        playerWaitingScreen.querySelector('h1').innerText = "Arata na Ippo";
                        document.getElementById('player-waiting-message').innerText = "O Mestre está configurando a partida...";
                    } else {
                        showScreen(fightScreen);
                    }
                } else if (gameState.mode === 'theater') {
                     showScreen(theaterScreen);
                     renderTheaterMode(gameState);
                }
            }
        } else if (myRole === 'spectator') {
             if (gameState.mode === 'lobby') {
                showScreen(playerWaitingScreen);
                playerWaitingScreen.querySelector('h1').innerText = "Arata na Ippo";
                document.getElementById('player-waiting-message').innerText = "Aguardando como espectador...";
             } else if (gameState.mode === 'classic' || gameState.mode === 'arena') {
                if (SETUP_PHASES.includes(gameState.phase) || gameState.phase === 'gm_classic_setup') {
                    showScreen(playerWaitingScreen);
                    playerWaitingScreen.querySelector('h1').innerText = "Arata na Ippo";
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
        currentRoomId = roomId;
        if (myRole === 'gm') {
            const baseUrl = window.location.origin;
            const unifiedUrl = `${baseUrl}?room=${roomId}`;

            const unifiedLinkEl = document.getElementById('gm-link-unified');
            unifiedLinkEl.textContent = unifiedUrl;
            unifiedLinkEl.onclick = () => copyToClipboard(unifiedUrl, unifiedLinkEl);

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
                const li = document.createElement('li');
                const charName = p.selectedCharacter ? p.selectedCharacter.nome : '<i>Selecionando...</i>';
                let statusText = '';
                
                if (!p.selectedCharacter) {
                    statusText = `<span style="color: #ffc107;">Selecionando personagem...</span>`;
                } else if (state.isConfiguringPlayer === p.id) {
                    statusText = `<span style="color: #17a2b8;">Configurando agora...</span>`;
                } else if (!p.configuredStats) {
                    statusText = `<span style="color: #dc3545;">Aguardando Configuração</span>`;
                } else {
                    statusText = `<span style="color: #28a745;">Pronto para Lutar</span>`;
                }

                li.innerHTML = `Jogador: <b>${charName}</b> - Status: ${statusText}`;
                playerListEl.appendChild(li);
            });
        }
        const unifiedLinkEl = document.getElementById('gm-link-unified');
        if (unifiedLinkEl && !unifiedLinkEl.textContent.includes('Gerando')) {
             const baseUrl = window.location.origin;
             unifiedLinkEl.textContent = `${baseUrl}?room=${currentRoomId}`;
        }
    }


    function copyToClipboard(text, element) { navigator.clipboard.writeText(text).then(() => { const originalText = element.textContent || '🔗'; element.textContent = 'Copiado!'; setTimeout(() => { element.textContent = originalText; }, 2000); }); }
    
    function updateUI(state) {
        if (!state || !myRole) return;
        
        gmModeSwitchBtn.classList.toggle('hidden', !isGm);
        
        const showCopyLink = isGm && (state.mode === 'classic' || state.mode === 'arena' || state.mode === 'theater');
        copySpectatorLinkInGameBtn.classList.toggle('hidden', !showCopyLink);
        
        const showHelp = state.mode !== 'theater' && state.mode !== 'lobby' && myRole !== 'spectator';
        helpBtn.classList.toggle('hidden', !showHelp);

        if (state.scenario && state.mode !== 'theater') { gameWrapper.style.backgroundImage = `url('images/${state.scenario}')`; }
        
        const showCheatsPanel = isGm && state.mode !== 'theater';
        document.getElementById('gm-cheats-panel').classList.toggle('hidden', !showCheatsPanel);

        if(isGm) {
            const cheatIndicator = document.getElementById('dice-cheat-indicator'); let cheatText = '';
            
            if (state.mode === 'theater') {
                if (state.diceCheat === 'crit') cheatText += 'Críticos (T) '; 
                if (state.diceCheat === 'fumble') cheatText += 'Erros (I) ';
            } else {
                if (state.diceCheat === 'crit') cheatText += 'Críticos (T) '; 
                if (state.diceCheat === 'fumble') cheatText += 'Erros (R) ';
                if (typeof state.diceCheat === 'number') cheatText += `Forçar D${state.diceCheat} (Y) `;
                if (state.illegalCheat === 'always') cheatText += 'Sempre Ilegal (I) '; 
                else if (state.illegalCheat === 'never') cheatText += 'Nunca Ilegal (I) ';
            }
            
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
            
            if (me) {
                if (moveName === 'Fortalecer Defesa') {
                    // <<< ALTERAÇÃO 1: Atualizando verificação do custo de PA >>>
                    if (me.pa >= 3 && me.fortalecerDefesaUses < 2) {
                        isDisabled = false;
                    }
                } else if (isActionPhase) {
                    if (isMyTurn) {
                        if (isEndTurn) { isDisabled = false; } 
                        else if (!isReaction && moveName) {
                            const move = state.moves[moveName]; let cost = move.cost;
                            if (state.phase === 'white_fang_follow_up' && moveName === 'White Fang') { cost = 0; btn.classList.add('white-fang-ready'); if (!btn.querySelector('.white-fang-extra')) { btn.innerHTML += '<span class="white-fang-extra">Ataque Extra!</span>'; } }
                            if (move && me.pa >= cost) isDisabled = false;
                        }
                    } else { 
                        if (isReaction && moveName) {
                            const move = state.moves[moveName];
                            if (move && moveName === 'Counter') isDisabled = false; 
                        }
                    }
                }
            }
            if (state.phase === 'paused' && !isGm) isDisabled = true;
            btn.disabled = isDisabled;
        });
        document.getElementById('forfeit-btn').disabled = !(state.whoseTurn === myPlayerKey && (state.phase === 'turn' || state.phase === 'white_fang_follow_up'));
        const logBox = document.getElementById('fight-log'); logBox.innerHTML = state.log.map(msg => `<p class="${msg.className || ''}">${msg.text}</p>`).join('');
        logBox.scrollTop = logBox.scrollHeight;
    }
    
    function showInfoModal(title, text) {
        modalTitle.innerText = title; modalText.innerHTML = text;
        const newButton = modalButton.cloneNode(true);
        modalButton.parentNode.replaceChild(newButton, modalButton);
        modalButton = newButton;

        const tempDiv = document.createElement('div'); tempDiv.innerHTML = text;
        const hasCustomButtons = tempDiv.querySelector('button');
        const hasClickableItems = tempDiv.querySelector('[data-socket-id]');

        if (hasCustomButtons || hasClickableItems) {
            modalButton.style.display = 'none';
        } else {
            modalButton.style.display = 'inline-block';
            modalButton.innerText = 'OK';
            modalButton.onclick = () => {
                modal.classList.add('hidden');
                modal.style.zIndex = "3000";
            };
        }
        modal.classList.remove('hidden');
    }

    function showInteractiveModal(title, text, btnText, action) {
        modalTitle.innerText = title; modalText.innerHTML = text;
        const newButton = modalButton.cloneNode(true);
        modalButton.parentNode.replaceChild(newButton, modalButton);
        modalButton = newButton;
        modalButton.innerText = btnText;
        modalButton.style.display = btnText ? 'inline-block' : 'none';
        modalButton.disabled = false;
        if (action) {
            modalButton.onclick = () => {
                modalButton.disabled = true;
                modalButton.innerText = "Aguarde...";
                socket.emit('playerAction', action);
            }; 
        } else {
            modalButton.onclick = () => {
                modal.classList.add('hidden');
                modal.style.zIndex = "3000";
            };
        }
        modal.classList.remove('hidden');
    }
    
    function showCheatsModal() {
        if (!isGm) return;
        
        const p1_base = currentGameState.fighters.player1 || { nome: 'Jogador 1', agi: 1, res: 1, hp: 5, pa: 3 };
        const p2_base = currentGameState.fighters.player2 || currentGameState.pendingP2Choice || { nome: 'Jogador 2', agi: 1, res: 1, hp: 5, pa: 3 };
        
        const p1 = {
            nome: p1_base.nome || 'Jogador 1',
            agi: p1_base.agi ?? 1,
            res: p1_base.res ?? 1,
            hp: p1_base.hp ?? (p1_base.res || 1) * 5,
            pa: p1_base.pa ?? 3
        };

        const p2 = {
            nome: p2_base.nome || 'Jogador 2',
            agi: p2_base.agi ?? 1,
            res: p2_base.res ?? 1,
            hp: p2_base.hp ?? (p2_base.res || 1) * 5,
            pa: p2_base.pa ?? 3
        };

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
    
    function initializeTheaterMode() {
        const theaterCharList = document.getElementById('theater-char-list');
        theaterCharList.innerHTML = '';

        const createMini = (name, imgPath) => {
            const mini = document.createElement('div');
            mini.className = 'theater-char-mini';
            mini.style.backgroundImage = `url("${imgPath}")`;
            mini.title = name;
            mini.draggable = true;
            mini.addEventListener('dragstart', (e) => {
                if (!isGm) return;
                e.dataTransfer.setData('application/json', JSON.stringify({ charName: name, img: imgPath }));
            });
            theaterCharList.appendChild(mini);
        };

        Object.keys(ALL_FIGHTERS_DATA).forEach(charName => {
            createMini(charName, `images/lutadores/${charName}.png`);
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
        const scenarioState = currentGameState?.scenarioStates?.[currentGameState.currentScenario];
        const publicScenarioState = currentGameState?.publicState;
        const dataToRender = (myRole !== 'gm' && publicScenarioState) ? publicScenarioState : scenarioState;
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
                } else if (e.key.toLowerCase() === 'y') {
                    e.preventDefault();
                    socket.emit('playerAction', { type: 'toggle_force_dice' });
                }
            }

            if (currentGameState && currentGameState.mode === 'theater') {
                if (e.key.toLowerCase() === 't') {
                    e.preventDefault();
                    socket.emit('playerAction', { type: 'gm_toggle_theater_cheat', cheat: 'crit' });
                } else if (e.key.toLowerCase() === 'i') {
                    e.preventDefault();
                    socket.emit('playerAction', { type: 'gm_toggle_theater_cheat', cheat: 'fumble' });
                }

                if (e.key.toLowerCase() === 'g') {
                    e.preventDefault();
                    isGroupSelectMode = !isGroupSelectMode;
                    theaterBackgroundViewport.classList.toggle('group-select-mode', isGroupSelectMode);
                    if (!isGroupSelectMode) {
                        selectedTokens.clear();
                        document.querySelectorAll('.theater-token.selected').forEach(t => t.classList.remove('selected'));
                    }
                }
                
                if (e.key.toLowerCase() === 'o') {
                    e.preventDefault();
                    const hoveredToken = document.querySelector(".theater-token:hover");
                    if (hoveredToken) {
                         socket.emit('playerAction', { type: 'updateToken', token: { id: hoveredToken.id, scale: 1.0 }});
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
                        const scenarioState = currentGameState.scenarioStates[currentGameState.currentScenario];
                        if(!scenarioState) return;

                        currentSelectedTokens.forEach(token => {
                            const currentTokenState = scenarioState.tokens[token.id];
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
    
    function setupTheaterEventListeners() {
        const toggleGmPanelBtn = document.getElementById('toggle-gm-panel-btn');
        const theaterScreenEl = document.getElementById('theater-screen');
        const selectionBox = document.getElementById('selection-box');
        
        toggleGmPanelBtn.addEventListener('click', () => { 
            theaterScreenEl.classList.toggle('panel-hidden');
        });
    
        theaterBackgroundViewport.addEventListener('dragover', (e) => { e.preventDefault(); });
    
        const getGameScale = () => {
            const transform = window.getComputedStyle(gameWrapper).transform;
            if (transform === 'none') return 1;
            const matrix = new DOMMatrix(transform);
            return matrix.a; 
        };

        const screenToWorldCoords = (e) => {
            const gameScale = getGameScale();
            const viewportRect = theaterBackgroundViewport.getBoundingClientRect();
            const mouseXOnViewport = e.clientX - viewportRect.left;
            const mouseYOnViewport = e.clientY - viewportRect.top;
            const worldX = (mouseXOnViewport / gameScale + theaterBackgroundViewport.scrollLeft) / currentScenarioScale;
            const worldY = (mouseYOnViewport / gameScale + theaterBackgroundViewport.scrollTop) / currentScenarioScale;
            return { worldX, worldY };
        };

        theaterBackgroundViewport.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!isGm) return;
            try {
                const dataString = e.dataTransfer.getData('application/json');
                if (!dataString) return;
                const data = JSON.parse(dataString);
                const { worldX, worldY } = screenToWorldCoords(e);
                const tokenBaseWidth = 200;
                const tokenScale = 1.0; 
                const newToken = { 
                    id: `token-${Date.now()}`, 
                    charName: data.charName, 
                    img: data.img, 
                    x: worldX - (tokenBaseWidth * tokenScale / 2), 
                    y: worldY - (tokenBaseWidth * tokenScale / 2), 
                    scale: tokenScale, 
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
                const { worldX: worldStartX, worldY: worldStartY } = screenToWorldCoords(e);

                selectionBox.style.left = `${worldStartX}px`;
                selectionBox.style.top = `${worldStartY}px`;
                selectionBox.style.width = '0px';
                selectionBox.style.height = '0px';
                selectionBox.classList.remove('hidden');

                const onMouseMoveMarquee = (moveEvent) => {
                    const { worldX: worldCurrentX, worldY: worldCurrentY } = screenToWorldCoords(moveEvent);
                    const width = worldCurrentX - worldStartX;
                    const height = worldCurrentY - worldStartY;

                    selectionBox.style.width = `${Math.abs(width)}px`;
                    selectionBox.style.height = `${Math.abs(height)}px`;
                    selectionBox.style.left = `${(width < 0 ? worldCurrentX : worldStartX)}px`;
                    selectionBox.style.top = `${(height < 0 ? worldCurrentY : worldStartY)}px`;
                };

                const onMouseUpMarquee = () => {
                    selectionBox.classList.add('hidden');
                    if (!e.ctrlKey) {
                        document.querySelectorAll('.theater-token.selected').forEach(t => t.classList.remove('selected'));
                        selectedTokens.clear();
                    }
                    const worldBox = {
                        left: parseFloat(selectionBox.style.left),
                        top: parseFloat(selectionBox.style.top),
                        right: parseFloat(selectionBox.style.left) + parseFloat(selectionBox.style.width),
                        bottom: parseFloat(selectionBox.style.top) + parseFloat(selectionBox.style.height)
                    };

                    const scenarioState = currentGameState.scenarioStates[currentGameState.currentScenario];
                    if(!scenarioState) return;

                    Object.values(scenarioState.tokens).forEach(tokenData => {
                        const tokenEl = document.getElementById(tokenData.id);
                        if (!tokenEl) return;
                        
                        const tokenRect = {
                            left: tokenData.x,
                            top: tokenData.y,
                            right: tokenData.x + (200 * (tokenData.scale || 1)),
                            bottom: tokenData.y + (200 * (tokenData.scale || 1))
                        };

                        const isIntersecting = !(tokenRect.right < worldBox.left || 
                                                 tokenRect.left > worldBox.right || 
                                                 tokenRect.bottom < worldBox.top || 
                                                 tokenRect.top > worldBox.bottom);

                        if (isIntersecting) {
                            tokenEl.classList.add('selected');
                            selectedTokens.add(tokenData.id);
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
                const startMouseX = e.clientX;
                const startMouseY = e.clientY;
                let hasDragged = false;
                
                const onMouseUpToken = (upEvent) => {
                    window.removeEventListener('mousemove', onMouseMoveToken);
                    window.removeEventListener('mouseup', onMouseUpToken);
                    
                    if (hasDragged) {
                        const tokensToDrag = selectedTokens.has(draggedToken.id) ? Array.from(selectedTokens) : [draggedToken.id];
                        const updates = tokensToDrag.map(tokenId => {
                             const tokenEl = document.getElementById(tokenId);
                             if (tokenEl) {
                                 delete tokenEl.dataset.startX;
                                 delete tokenEl.dataset.startY;
                                 return { id: tokenId, x: parseFloat(tokenEl.style.left), y: parseFloat(tokenEl.style.top) };
                             }
                             return null;
                        }).filter(Boolean);
                        
                        if (updates.length > 0) {
                            socket.emit('playerAction', { type: 'updateToken', token: { updates: updates } });
                        }
                    } else { // It was a click
                        if (!upEvent.ctrlKey) {
                            document.querySelectorAll('.theater-token.selected').forEach(t => {
                                if (t.id !== draggedToken.id) t.classList.remove('selected');
                            });
                            selectedTokens.clear();
                        }
                        draggedToken.classList.toggle('selected');
                        if (draggedToken.classList.contains('selected')) {
                            selectedTokens.add(draggedToken.id);
                        } else {
                            selectedTokens.delete(draggedToken.id);
                        }
                    }
                };
                
                const onMouseMoveToken = (moveEvent) => {
                    const dx = moveEvent.clientX - startMouseX;
                    const dy = moveEvent.clientY - startMouseY;
                    
                    if (!hasDragged && Math.sqrt(dx*dx + dy*dy) > 5) {
                        hasDragged = true;
                        if (!selectedTokens.has(draggedToken.id)) {
                             if (!e.ctrlKey) {
                                document.querySelectorAll('.theater-token.selected').forEach(t => t.classList.remove('selected'));
                                selectedTokens.clear();
                             }
                             draggedToken.classList.add('selected');
                             selectedTokens.add(draggedToken.id);
                        }
                    }

                    if (!hasDragged) return;

                    const gameScale = getGameScale();
                    const worldDx = dx / gameScale / currentScenarioScale;
                    const worldDy = dy / gameScale / currentScenarioScale;

                    const tokensToDrag = selectedTokens.has(draggedToken.id) ? Array.from(selectedTokens) : [draggedToken.id];
                    
                    tokensToDrag.forEach(tokenId => {
                        const tokenEl = document.getElementById(tokenId);
                        if(tokenEl && !tokenEl.dataset.startX) tokenEl.dataset.startX = tokenEl.offsetLeft;
                        if(tokenEl && !tokenEl.dataset.startY) tokenEl.dataset.startY = tokenEl.offsetTop;

                        const startX = parseFloat(tokenEl.dataset.startX);
                        const startY = parseFloat(tokenEl.dataset.startY);
                       
                        if (tokenEl) {
                           tokenEl.style.left = `${startX + worldDx}px`;
                           tokenEl.style.top = `${startY + worldDy}px`;
                        }
                    });
                };
                
                window.addEventListener('mousemove', onMouseMoveToken);
                window.addEventListener('mouseup', onMouseUpToken);

            } else if (!isToken && !(isGm && isGroupSelectMode)) {
                if (isGm && selectedTokens.size > 0) {
                    document.querySelectorAll('.theater-token.selected').forEach(t => t.classList.remove('selected'));
                    selectedTokens.clear();
                }
                
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
            e.preventDefault();

            if (isGm && selectedTokens.size > 0) {
                const scaleAmount = e.deltaY > 0 ? -0.1 : 0.1;
                const updates = [];
                selectedTokens.forEach(tokenId => {
                    const scenarioState = currentGameState.scenarioStates[currentGameState.currentScenario];
                    if(!scenarioState) return;
                    const tokenData = scenarioState.tokens[tokenId];
                    if (tokenData) {
                        const currentScale = tokenData.scale || 1;
                        const newScale = Math.max(0.1, currentScale + scaleAmount);
                        updates.push({ id: tokenId, scale: newScale });
                    }
                });
                if (updates.length > 0) {
                    socket.emit('playerAction', { type: 'updateToken', token: { updates: updates } });
                }
                return;
            }

            const scaleAmount = e.deltaY > 0 ? -0.1 : 0.1;
            const isMobile = window.innerWidth <= 800;
            const minZoom = isMobile ? 0.05 : 0.2;
            currentScenarioScale = Math.max(minZoom, Math.min(5, currentScenarioScale + scaleAmount));
            updateTheaterZoom();

        }, { passive: false });

        let isPinching = false;
        let initialPinchDistance = 0;
        let isTouchPanning = false;
        let lastTouchX = 0;
        let lastTouchY = 0;

        theaterBackgroundViewport.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                isPinching = true;
                isTouchPanning = false;
                initialPinchDistance = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
            } else if (e.touches.length === 1) {
                const isToken = e.target.classList.contains('theater-token');
                if (isToken) return;
                isTouchPanning = true;
                isPinching = false;
                lastTouchX = e.touches[0].pageX;
                lastTouchY = e.touches[0].pageY;
            }
        }, { passive: false });

        theaterBackgroundViewport.addEventListener('touchmove', (e) => {
            if (currentGameState.mode !== 'theater') return;
            e.preventDefault();

            if (isPinching && e.touches.length === 2) {
                const currentPinchDistance = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
                const scaleMultiplier = currentPinchDistance / initialPinchDistance;
                const newScale = currentScenarioScale * scaleMultiplier;

                const isMobile = window.innerWidth <= 800;
                const minZoom = isMobile ? 0.05 : 0.2;
                currentScenarioScale = Math.max(minZoom, Math.min(5, newScale));
                
                updateTheaterZoom();
                initialPinchDistance = currentPinchDistance;

            } else if (isTouchPanning && e.touches.length === 1) {
                const dx = e.touches[0].pageX - lastTouchX;
                const dy = e.touches[0].pageY - lastTouchY;
                theaterBackgroundViewport.scrollLeft -= dx;
                theaterBackgroundViewport.scrollTop -= dy;
                lastTouchX = e.touches[0].pageX;
                lastTouchY = e.touches[0].pageY;
            }
        }, { passive: false });

        theaterBackgroundViewport.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) isPinching = false;
            if (e.touches.length < 1) isTouchPanning = false;
        });
    }

    function renderTheaterMode(state) {
        if (state.activeTestResult) {
            const result = state.activeTestResult;
            const testType = result.testType === 'Padrão' ? `Teste Padrão` : `Teste de ${result.testType}`;
            testResultHeader.textContent = `${result.playerName} rolou um ${testType}`;
            testResultTotal.textContent = result.total;
            
            attributeTestContent.classList.remove('crit', 'fumble');
            if (result.type === 'crit') {
                testResultCritText.textContent = 'ACERTO CRÍTICO!';
                attributeTestContent.classList.add('crit');
            } else if (result.type === 'fumble') {
                testResultCritText.textContent = 'ERRO CRÍTICO!';
                attributeTestContent.classList.add('fumble');
            } else {
                testResultCritText.textContent = '';
            }
            
            testResultGmOkBtn.classList.toggle('hidden', !isGm);
            attributeTestOverlay.classList.remove('hidden');
        } else {
            attributeTestOverlay.classList.add('hidden');
        }

        const playerControls = document.getElementById('theater-player-controls');
        const myPlayerData = state.lobbyCache?.connectedPlayers[socket.id];
        const showPlayerControls = myRole === 'player' && myPlayerData?.configuredStats;
        playerControls.classList.toggle('hidden', !showPlayerControls);
        
        if (showPlayerControls) {
            const isTestActive = !!state.activeTestResult;
            testAgiBtn.disabled = isTestActive;
            testResBtn.disabled = isTestActive;
            testPadraoBtn.disabled = isTestActive;
        }

        const currentScenarioState = state.scenarioStates?.[state.currentScenario];
        const dataToRender = isGm ? currentScenarioState : state.publicState;
        
        if (!dataToRender || !dataToRender.scenario) {
            return;
        }

        const img = new Image();
        img.onload = () => {
            theaterBackgroundImage.src = img.src;
            const worldContainer = document.getElementById('theater-world-container');
            if (worldContainer) {
                worldContainer.style.width = `${img.naturalWidth}px`;
                worldContainer.style.height = `${img.naturalHeight}px`;
            }
            if (isGm && currentScenarioState && (currentScenarioState.scenarioWidth !== img.naturalWidth || currentScenarioState.scenarioHeight !== img.naturalHeight)) {
                socket.emit('playerAction', { type: 'update_scenario_dims', width: img.naturalWidth, height: img.naturalHeight });
            }

            const isMobileSpectator = myRole === 'spectator' && window.innerWidth <= 800;
            if (isMobileSpectator) {
                const viewport = theaterBackgroundViewport;
                const scenarioWidth = img.naturalWidth;
                const scenarioHeight = img.naturalHeight;

                if (scenarioWidth > 0 && scenarioHeight > 0) {
                    const scaleX = viewport.clientWidth / scenarioWidth;
                    const scaleY = viewport.clientHeight / scenarioHeight;
                    currentScenarioScale = Math.min(scaleX, scaleY);
                    
                    const scaledWidth = scenarioWidth * currentScenarioScale;
                    const scaledHeight = scenarioHeight * currentScenarioScale;
                    viewport.scrollLeft = (scaledWidth - viewport.clientWidth) / 2;
                    viewport.scrollTop = (scaledHeight - viewport.clientHeight) / 2;
                }
            }
            updateTheaterZoom();
        };
        img.src = `images/${dataToRender.scenario}`;
        
        const theaterScreenEl = document.getElementById('theater-screen'); 
        const toggleGmPanelBtn = document.getElementById('toggle-gm-panel-btn');
        theaterGmPanel.classList.toggle('hidden', !isGm); 
        toggleGmPanelBtn.classList.toggle('hidden', !isGm);
        theaterPublishBtn.classList.toggle('hidden', !isGm || !state.scenarioStates?.[state.currentScenario]?.isStaging);

        if (isGm && currentScenarioState) {
            theaterGlobalScale.value = currentScenarioState.globalTokenScale || 1.0;
        }

        if (!isGm) { 
            theaterScreenEl.classList.add('panel-hidden'); 
        }
        
        theaterTokenContainer.innerHTML = '';
        const fragment = document.createDocumentFragment();
        
        const tokensToRender = dataToRender.tokens || {};
        const tokenOrderToRender = dataToRender.tokenOrder || [];

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
                const gmData = state.scenarioStates?.[state.currentScenario];
                if (gmData) {
                    const tokenCenterX = tokenData.x + (200 * scale / 2);
                    const tokenCenterY = tokenData.y + (200 * scale / 2);
                    if (gmData.scenarioWidth && (tokenCenterX < 0 || tokenCenterX > gmData.scenarioWidth || tokenCenterY < 0 || tokenCenterY > gmData.scenarioHeight)) {
                        tokenEl.classList.add('off-stage');
                    }
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
        let isMyTurnForAction = myPlayerKey === targetPlayerKey || (isGm && action);
        
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
            const resultData = results[pKey]; if (resultData) { const overlay = document.getElementById(`${pKey}-dk-result`); overlay.innerHTML = `<h4>${currentGameState.fighters[pKey].nome}</h4><p>Rolagem: ${resultData.total}</p>`; overlay.className = 'dk-result-overlay'; overlay.classList.add(resultData.success ? 'fail' : 'success'); overlay.classList.remove('hidden'); }
        });
        setTimeout(() => { document.getElementById('player1-dk-result').classList.add('hidden'); document.getElementById('player2-dk-result').classList.add('hidden'); }, 3000);
    });

    socket.on('showGameAlert', (message) => {
        const alertOverlay = document.getElementById('game-alert-overlay'); const alertContent = document.getElementById('game-alert-content');
        if (alertOverlay && alertContent) { alertContent.innerHTML = message; alertOverlay.classList.remove('hidden'); setTimeout(() => { alertOverlay.classList.add('hidden'); }, 3000); }
    });

    socket.on('getUpSuccess', ({ downedPlayerName, rollValue }) => { modal.classList.add('hidden'); getUpSuccessOverlay.classList.remove('hidden'); getUpSuccessContent.innerHTML = `${rollValue} - ${downedPlayerName.toUpperCase()} CONSEGUIU SE LEVANTAR! <span>(precisava de 7 ou mais)</span>`; setTimeout(() => getUpSuccessOverlay.classList.add('hidden'), 3000); });
    socket.on('hideModal', () => { 
        if(modal.style.zIndex === "4000") return;
        modal.classList.add('hidden');
    });
    socket.on('diceRoll', showDiceRollAnimation);
    socket.on('error', ({message}) => { showInfoModal("Erro", `${message}<br>Recarregue a página para tentar novamente.`); });

    initialize();
    
    const scaleGame = () => {
        const w = document.getElementById('game-wrapper');
        const isMobile = window.innerWidth <= 800;

        w.style.width = '1280px';
        w.style.height = '720px';

        if (isMobile) {
            if (currentGameState && currentGameState.mode === 'theater') {
                w.style.transform = 'none';
                w.style.width = '100%';
                w.style.height = `${window.innerHeight}px`;
                w.style.left = '0';
                w.style.top = '0';
            } else {
                const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
                w.style.transform = `scale(${scale})`;
                const left = (window.innerWidth - (1280 * scale)) / 2;
                const top = (window.innerHeight - (720 * scale)) / 2;
                w.style.left = `${left}px`;
                w.style.top = `${top}px`;
            }
        } else {
            const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
            w.style.transform = `scale(${scale})`;
            const left = (window.innerWidth - (1280 * scale)) / 2;
            const top = (window.innerHeight - (720 * scale)) / 2;
            w.style.left = `${left}px`;
            w.style.top = `${top}px`;
        }
    };
    
    scaleGame();
    window.addEventListener('resize', scaleGame);
});