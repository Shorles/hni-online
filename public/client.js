document.addEventListener('DOMContentLoaded', () => {
    let myPlayerKey = null;
    let currentGameState = null;
    let currentRoomId = new URLSearchParams(window.location.search).get('room');
    const socket = io();

    // --- ELEMENTOS DO DOM ---
    const allScreens = document.querySelectorAll('.screen');
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

    // --- DADOS E ÁUDIO ---
    const CHARACTERS_P1 = { 'Kureha Shoji':{agi:3,res:1},'Erik Adler':{agi:2,res:2},'Ivan Braskovich':{agi:1,res:3},'Hayato Takamura':{agi:4,res:4},'Logan Graves':{agi:3,res:2},'Daigo Kurosawa':{agi:1,res:4},'Jamal Briggs':{agi:2,res:3},'Takeshi Arada':{agi:3,res:2},'Kaito Mishima':{agi:4,res:3},'Kuga Shunji':{agi:3,res:4},'Eitan Barak':{agi:4,res:3} };
    const CHARACTERS_P2 = { 'Ryu':{agi:2,res:3},'Yobu':{agi:2,res:3},'Nathan':{agi:2,res:3},'Okami':{agi:2,res:3} };
    const SOUNDS = { jab:[new Audio('sons/jab01.mp3'),new Audio('sons/jab02.mp3'),new Audio('sons/jab03.mp3')], strong:[new Audio('sons/baseforte01.mp3'),new Audio('sons/baseforte02.mp3')], dice:[new Audio('sons/dice1.mp3'),new Audio('sons/dice2.mp3'),new Audio('sons/dice3.mp3')], critical:[new Audio('sons/Critical.mp3')], miss:[new Audio('sons/Esquiva.mp3')] };
    function playRandomSound(soundType) { if (SOUNDS[soundType]) { const s = SOUNDS[soundType]; const sound = s[Math.floor(Math.random() * s.length)]; sound.currentTime = 0; sound.play().catch(e => console.error("Erro ao tocar som:", e)); } }

    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        const isSpectator = urlParams.get('spectate') === 'true';

        allScreens.forEach(screen => screen.classList.remove('active'));

        if (isSpectator && currentRoomId) {
            lobbyScreen.classList.add('active');
            lobbyContent.innerHTML = `<p>Entrando como espectador...</p>`;
            socket.emit('spectateGame', currentRoomId);
        } else if (currentRoomId) {
            selectionScreen.classList.add('active');
            selectionTitle.innerText = 'Jogador 2: Selecione seu Lutador';
            confirmBtn.innerText = 'Entrar na Luta';
            renderCharacterSelection('p2');
        } else {
            selectionScreen.classList.add('active');
            selectionTitle.innerText = 'Jogador 1: Selecione seu Lutador';
            confirmBtn.innerText = 'Criar Jogo';
            renderCharacterSelection('p1');
        }
        
        confirmBtn.addEventListener('click', onConfirmSelection);
        document.querySelectorAll('#p1-controls .action-btn.p1-btn').forEach(btn => btn.onclick = () => socket.emit('playerAction', { type: 'attack', move: btn.dataset.move, playerKey: myPlayerKey }));
        document.querySelectorAll('#p2-controls .action-btn.p2-btn').forEach(btn => btn.onclick = () => socket.emit('playerAction', { type: 'attack', move: btn.dataset.move, playerKey: myPlayerKey }));
        document.getElementById('p1-end-turn-btn').onclick = () => socket.emit('playerAction', { type: 'end_turn', playerKey: myPlayerKey });
        document.getElementById('p2-end-turn-btn').onclick = () => socket.emit('playerAction', { type: 'end_turn', playerKey: myPlayerKey });
        document.getElementById('forfeit-btn').onclick = () => { if (myPlayerKey && myPlayerKey !== 'spectator' && (currentGameState.phase === 'turn' || currentGameState.phase === 'white_fang_follow_up') && currentGameState.whoseTurn === myPlayerKey) showForfeitConfirmation(); };
    }

    function showForfeitConfirmation() {
        const modalContentHtml = `<p>Você tem certeza que deseja jogar a toalha e desistir da luta?</p><div style="display: flex; justify-content: center; gap: 20px; margin-top: 20px;"><button id="confirm-forfeit-btn" style="background-color: #dc3545; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Sim, Desistir</button><button id="cancel-forfeit-btn" style="background-color: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Não, Continuar</button></div>`;
        showInfoModal("Jogar a Toalha", modalContentHtml);
        document.getElementById('confirm-forfeit-btn').onclick = () => { socket.emit('playerAction', { type: 'forfeit', playerKey: myPlayerKey }); modal.classList.add('hidden'); };
        document.getElementById('cancel-forfeit-btn').onclick = () => modal.classList.add('hidden');
    }

    function onConfirmSelection() {
        const selectedCard = document.querySelector('.char-card.selected');
        if (!selectedCard) { alert('Por favor, selecione um lutador!'); return; }
        let playerData;
        const isPlayer1 = !currentRoomId;

        if (isPlayer1) {
            playerData = {
                nome: selectedCard.dataset.name, img: selectedCard.dataset.img,
                agi: selectedCard.querySelector('.agi-input').value, res: selectedCard.querySelector('.res-input').value
            };
        } else {
            playerData = { nome: selectedCard.dataset.name, img: selectedCard.dataset.img };
        }

        confirmBtn.disabled = true;
        selectionScreen.classList.add('hidden');
        
        if (currentRoomId) {
            lobbyScreen.classList.add('active');
            lobbyContent.innerHTML = `<p>Aguardando o Jogador 1 definir seus atributos e golpes...</p>`;
            socket.emit('joinGame', { roomId: currentRoomId, player2Data: playerData });
        } else {
            // P1 vai para a seleção de golpes, não para o lobby ainda.
            socket.emit('createGame', playerData);
        }
    }

    function renderCharacterSelection(playerType) {
        charListContainer.innerHTML = '';
        const charData = playerType === 'p1' ? CHARACTERS_P1 : CHARACTERS_P2;
        for (const name in charData) {
            const stats = charData[name];
            const card = document.createElement('div');
            card.className = 'char-card';
            card.dataset.name = name;
            card.dataset.img = `images/${name}.png`;
            const statsHtml = playerType === 'p1' ? `<div class="char-stats"><label>AGI: <input type="number" class="agi-input" value="${stats.agi}"></label><label>RES: <input type="number" class="res-input" value="${stats.res}"></label></div>` : ``;
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
            card.addEventListener('click', () => {
                card.classList.toggle('selected');
                const selectedCount = container.querySelectorAll('.special-move-card.selected').length;
                if (selectedCount > 3) {
                    card.classList.remove('selected');
                    alert('Você só pode escolher até 3 golpes especiais.');
                }
            });
            container.appendChild(card);
        }
    }

    // --- OUVINTES DO SOCKET.IO ---
    socket.on('promptSpecialMoves', ({ availableMoves }) => {
        specialMovesTitle.innerText = 'Selecione seus 3 Golpes Especiais';
        renderSpecialMoveSelection(specialMovesList, availableMoves);
        specialMovesModal.classList.remove('hidden');
        confirmSpecialMovesBtn.onclick = () => {
            const selectedMoves = Array.from(specialMovesList.querySelectorAll('.selected')).map(card => card.dataset.name);
            if (selectedMoves.length > 3) { alert('Escolha no máximo 3 golpes.'); return; }
            socket.emit('playerAction', { type: 'set_p1_special_moves', playerKey: myPlayerKey, moves: selectedMoves });
            specialMovesModal.classList.add('hidden');
            lobbyScreen.classList.add('active');
            lobbyContent.innerHTML = `<p>Aguardando oponente se conectar...</p>`;
        };
    });

    socket.on('promptP2StatsAndMoves', ({ p2data, availableMoves }) => {
        const modalContentHtml = `<div style="display:flex; gap: 30px;">
            <div style="flex: 1;">
                <h4>Definir Atributos de ${p2data.nome}</h4>
                <img src="${p2data.img}" alt="${p2data.nome}" style="width: 80px; height: 80px; border-radius: 50%; background: #555; margin: 10px auto; display: block;">
                <label>AGI: <input type="number" id="p2-stat-agi" value="2" style="width: 50px; text-align: center;"></label>
                <label>RES: <input type="number" id="p2-stat-res" value="2" style="width: 50px; text-align: center;"></label>
            </div>
            <div style="flex: 2; border-left: 1px solid #555; padding-left: 20px;">
                <h4>Escolher Golpes Especiais (até 3)</h4>
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
            if (selectedMoves.length > 3) { alert('Escolha no máximo 3 golpes para o oponente.'); return; }
            const action = { type: 'set_p2_stats', playerKey: myPlayerKey, stats: { agi, res }, moves: selectedMoves };
            socket.emit('playerAction', action);
            modal.classList.add('hidden');
        };
    });

    socket.on('playSound', playRandomSound);
    socket.on('triggerAttackAnimation', ({ attackerKey }) => { const img = document.getElementById(`${attackerKey}-fight-img`); if (img) { img.classList.add(`is-attacking-${attackerKey}`); setTimeout(() => img.classList.remove(`is-attacking-${attackerKey}`), 400); } });
    socket.on('triggerHitAnimation', ({ defenderKey }) => { const img = document.getElementById(`${defenderKey}-fight-img`); if (img) { img.classList.add('is-hit'); setTimeout(() => img.classList.remove('is-hit'), 500); } });
    
    socket.on('assignPlayer', (playerKey) => { myPlayerKey = playerKey; });
    socket.on('roomCreated', (roomId) => {
        currentRoomId = roomId;
        const p2Url = `${window.location.origin}?room=${roomId}`;
        const specUrl = `${window.location.origin}?room=${roomId}&spectate=true`;
        const shareLinkP2 = document.getElementById('share-link-p2');
        const shareLinkSpectator = document.getElementById('share-link-spectator');
        shareLinkP2.textContent = p2Url;
        shareLinkSpectator.textContent = specUrl;
        lobbyContent.classList.add('hidden');
        shareContainer.classList.remove('hidden');
        shareLinkP2.onclick = () => copyToClipboard(p2Url, shareLinkP2);
        shareLinkSpectator.onclick = () => copyToClipboard(specUrl, shareLinkSpectator);
    });

    function copyToClipboard(text, element) { navigator.clipboard.writeText(text).then(() => { const originalText = element.textContent; element.textContent = 'Copiado!'; setTimeout(() => { element.textContent = originalText; }, 2000); }); }
    copySpectatorLinkInGameBtn.onclick = () => { if (currentRoomId) copyToClipboard(`${window.location.origin}?room=${currentRoomId}&spectate=true`, copySpectatorLinkInGameBtn); };

    socket.on('gameUpdate', (gameState) => {
        const shouldTransitionToFight = currentGameState === null || (currentGameState.phase === 'p1_special_moves_selection' || currentGameState.phase === 'waiting' || currentGameState.phase === 'p2_stat_assignment');
        currentGameState = gameState;
        updateUI(gameState);
        if (shouldTransitionToFight && (gameState.phase !== 'waiting' && gameState.phase !== 'p1_special_moves_selection' && gameState.phase !== 'p2_stat_assignment') && !fightScreen.classList.contains('active')) {
            lobbyScreen.classList.add('hidden');
            selectionScreen.classList.add('hidden');
            specialMovesModal.classList.add('hidden');
            fightScreen.classList.add('active');
            if (myPlayerKey !== 'spectator') copySpectatorLinkInGameBtn.classList.remove('hidden');
        }
    });

    socket.on('promptRoll', ({ targetPlayerKey, text, action }) => {
        const btn = document.getElementById(`${targetPlayerKey}-roll-btn`);
        const isMyTurnToRoll = myPlayerKey === targetPlayerKey;
        const isSpectator = myPlayerKey === 'spectator';
        btn.innerText = text;
        btn.classList.remove('hidden', 'inactive');
        if (isMyTurnToRoll) { btn.onclick = () => socket.emit('playerAction', action); btn.disabled = false; } 
        else { btn.disabled = true; btn.onclick = null; if (!isSpectator) btn.classList.add('inactive'); }
    });

    socket.on('hideRollButtons', () => { ['player1-roll-btn', 'player2-roll-btn'].forEach(id => document.getElementById(id).classList.add('hidden')); });
    socket.on('showModal', ({ title, text, btnText, action, targetPlayerKey, modalType, knockdownInfo }) => {
        switch(modalType) {
            case 'gameover': showInfoModal(title, text); break;
            case 'decision_table':
                if (myPlayerKey === targetPlayerKey) { showInteractiveModal(title, text, btnText, action); } 
                else { showInfoModal(title, text); }
                break;
            case 'knockdown':
                const downedFighterName = currentGameState.fighters[targetPlayerKey]?.nome || 'Oponente';
                let modalTitleText = `${downedFighterName} caiu!`;
                let modalContentText = `Aguarde a contagem...`;
                if (knockdownInfo.lastRoll) modalContentText = `Rolagem: <strong>${knockdownInfo.lastRoll}</strong> <span>(precisa de 7 ou mais)</span>`;
                if (targetPlayerKey === myPlayerKey) {
                    modalTitleText = `Você caiu!`;
                    modalContentText += `<br>Tentativas restantes: ${4 - knockdownInfo.attempts}`;
                    showInteractiveModal(modalTitleText, modalContentText, 'Tentar Levantar', action);
                } else { showInfoModal(modalTitleText, modalContentText); }
                break;
        }
    });
    
    socket.on('getUpSuccess', ({ downedPlayerName, rollValue }) => { modal.classList.add('hidden'); getUpSuccessOverlay.classList.remove('hidden'); getUpSuccessContent.innerHTML = `${rollValue} - ${downedPlayerName.toUpperCase()} CONSEGUIU SE LEVANTAR! <span>(precisava de 7 ou mais)</span>`; setTimeout(() => getUpSuccessOverlay.classList.add('hidden'), 3000); });
    socket.on('hideModal', () => modal.classList.add('hidden'));
    socket.on('diceRoll', showDiceRollAnimation);
    socket.on('opponentDisconnected', () => { showInfoModal("Oponente Desconectado", "Fim de jogo. Recarregue a página."); document.querySelectorAll('button').forEach(btn => btn.disabled = true); });

    function updateUI(state) {
        p1SpecialMovesContainer.innerHTML = '';
        p2SpecialMovesContainer.innerHTML = '';

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
            }
        });

        const roundInfoEl = document.getElementById('round-info');
        if (state.phase === 'gameover') roundInfoEl.innerHTML = `<span class="turn-highlight">FIM DE JOGO!</span>`;
        else if (state.phase === 'decision_table_wait') roundInfoEl.innerHTML = `<span class="turn-highlight">DECISÃO DOS JUÍZES</span>`;
        else { const turnName = state.whoseTurn ? state.fighters[state.whoseTurn].nome : '...'; roundInfoEl.innerHTML = `ROUND ${state.currentRound} - RODADA ${state.currentTurn} - Vez de: <span class="turn-highlight">${turnName}</span>`; }
        
        document.getElementById('player1-area').classList.toggle('active-turn', state.whoseTurn === 'player1');
        document.getElementById('player2-area').classList.toggle('active-turn', state.whoseTurn === 'player2');
        
        const isSpectator = myPlayerKey === 'spectator';
        const actionWrapper = document.getElementById('action-buttons-wrapper');
        if (isSpectator) { actionWrapper.classList.add('hidden'); } 
        else { actionWrapper.classList.remove('hidden'); }
        
        const isTurnOver = state.phase !== 'turn' && state.phase !== 'white_fang_follow_up';
        const p1_is_turn = state.whoseTurn === 'player1';
        const p2_is_turn = state.whoseTurn === 'player2';
        
        p1Controls.classList.toggle('hidden', myPlayerKey !== 'player1');
        p2Controls.classList.toggle('hidden', myPlayerKey !== 'player2');

        const p1_pa = state.fighters.player1?.pa || 0;
        document.querySelectorAll('#p1-controls button').forEach(btn => {
            const moveName = btn.dataset.move;
            const moveCost = moveName ? state.moves[moveName].cost : 0;
            const isWhiteFangFollowUp = state.phase === 'white_fang_follow_up' && state.followUpState.playerKey === 'player1';
            let isDisabled = isTurnOver || !p1_is_turn;
            if (btn.classList.contains('action-btn')) {
                if (isWhiteFangFollowUp) {
                    isDisabled = (moveName !== 'White Fang');
                } else {
                    isDisabled = isDisabled || moveCost > p1_pa;
                }
            }
            btn.disabled = isDisabled;
        });

        const p2_pa = state.fighters.player2?.pa || 0;
        document.querySelectorAll('#p2-controls button').forEach(btn => {
            const moveName = btn.dataset.move;
            const moveCost = moveName ? state.moves[moveName].cost : 0;
            const isWhiteFangFollowUp = state.phase === 'white_fang_follow_up' && state.followUpState.playerKey === 'player2';
            let isDisabled = isTurnOver || !p2_is_turn;
            if (btn.classList.contains('action-btn')) {
                if (isWhiteFangFollowUp) {
                    isDisabled = (moveName !== 'White Fang');
                } else {
                    isDisabled = isDisabled || moveCost > p2_pa;
                }
            }
            btn.disabled = isDisabled;
        });

        document.getElementById('forfeit-btn').disabled = isTurnOver || isSpectator || state.whoseTurn !== myPlayerKey;
        const logBox = document.getElementById('fight-log');
        logBox.innerHTML = state.log.map(msg => `<p class="${msg.className || ''}">${msg.text}</p>`).join('');
        logBox.scrollTop = logBox.scrollHeight;
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

    function showInfoModal(title, text) { modalTitle.innerText = title; modalText.innerHTML = text; modalButton.style.display = 'none'; modal.classList.remove('hidden'); }
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
    
    initialize();
    const scaleGame = () => { const w = document.getElementById('game-wrapper'); const s = Math.min(window.innerWidth / 1280, window.innerHeight / 720); w.style.transform = `scale(${s})`; w.style.left = `${(window.innerWidth - (1280 * s)) / 2}px`; w.style.top = `${(window.innerHeight - (720 * s)) / 2}px`; };
    scaleGame();
    window.addEventListener('resize', scaleGame);
});