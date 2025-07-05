document.addEventListener('DOMContentLoaded', () => {
    let myPlayerKey = null;
    let currentGameState = null;
    let currentRoomId = new URLSearchParams(window.location.search).get('room');
    const socket = io();

    // --- ELEMENTOS DO DOM ---
    const selectionScreen = document.getElementById('selection-screen');
    const lobbyScreen = document.getElementById('lobby-screen');
    const fightScreen = document.getElementById('fight-screen');
    const charListContainer = document.getElementById('character-list-container');
    const confirmBtn = document.getElementById('confirm-selection-btn');
    const selectionTitle = document.getElementById('selection-title');
    const lobbyContent = document.getElementById('lobby-content');
    const shareContainer = document.getElementById('share-container');
    const shareLinkP2 = document.getElementById('share-link-p2');
    const shareLinkSpectator = document.getElementById('share-link-spectator');
    const copySpectatorLinkInGameBtn = document.getElementById('copy-spectator-link-ingame');
    let modal = document.getElementById('modal');
    let modalTitle = document.getElementById('modal-title');
    let modalText = document.getElementById('modal-text');
    let modalButton = document.getElementById('modal-button');
    const p1Controls = document.getElementById('p1-controls');
    const p2Controls = document.getElementById('p2-controls');

    // --- DADOS E ÁUDIO ---
    const CHARACTERS_P1 = { 'Kureha Shoji':{agi:3,res:1},'Erik Adler':{agi:2,res:2},'Ivan Braskovich':{agi:1,res:3},'Hayato Takamura':{agi:4,res:4},'Logan Graves':{agi:3,res:2},'Daigo Kurosawa':{agi:1,res:4},'Jamal Briggs':{agi:2,res:3},'Takeshi Arada':{agi:3,res:2},'Kaito Mishima':{agi:4,res:3},'Kuga Shunji':{agi:3,res:4},'Eitan Barak':{agi:4,res:3} };
    const CHARACTERS_P2 = { 'Ryu':{agi:2,res:3},'Yobu':{agi:2,res:3},'Nathan':{agi:2,res:3},'Okami':{agi:2,res:3} };
    const SOUNDS = { jab:[new Audio('sons/jab01.mp3'),new Audio('sons/jab02.mp3'),new Audio('sons/jab03.mp3')], strong:[new Audio('sons/baseforte01.mp3'),new Audio('sons/baseforte02.mp3')], dice:[new Audio('sons/dice1.mp3'),new Audio('sons/dice2.mp3'),new Audio('sons/dice3.mp3')], critical:[new Audio('sons/Critical.mp3')], miss:[new Audio('sons/Esquiva.mp3')] };
    function playRandomSound(soundType) { if (SOUNDS[soundType]) { const s = SOUNDS[soundType]; const sound = s[Math.floor(Math.random() * s.length)]; sound.currentTime = 0; sound.play().catch(e => console.error("Erro ao tocar som:", e)); } }

    // --- INICIALIZAÇÃO ---
    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        const isSpectator = urlParams.get('spectate') === 'true';

        if (isSpectator && currentRoomId) {
            selectionScreen.classList.add('hidden');
            lobbyScreen.classList.add('active');
            lobbyContent.innerHTML = `<p>Entrando como espectador...</p>`;
            socket.emit('spectateGame', currentRoomId);
        } else if (currentRoomId) {
            selectionTitle.innerText = 'Jogador 2: Selecione seu Lutador';
            confirmBtn.innerText = 'Entrar na Luta';
            renderCharacterSelection('p2');
        } else {
            selectionTitle.innerText = 'Jogador 1: Selecione seu Lutador';
            confirmBtn.innerText = 'Criar Jogo';
            renderCharacterSelection('p1');
        }
        confirmBtn.addEventListener('click', onConfirmSelection);
        
        // Eventos de ataque
        document.querySelectorAll('#p1-controls .action-btn').forEach(btn => btn.onclick = () => socket.emit('playerAction', { type: 'attack', move: btn.dataset.move, playerKey: myPlayerKey }));
        document.querySelectorAll('#p2-controls .action-btn').forEach(btn => btn.onclick = () => socket.emit('playerAction', { type: 'attack', move: btn.dataset.move, playerKey: myPlayerKey }));
        
        // Eventos de fim de turno
        document.getElementById('p1-end-turn-btn').onclick = () => socket.emit('playerAction', { type: 'end_turn', playerKey: myPlayerKey });
        document.getElementById('p2-end-turn-btn').onclick = () => socket.emit('playerAction', { type: 'end_turn', playerKey: myPlayerKey });
        
        // Evento de desistência
        document.getElementById('forfeit-btn').onclick = () => {
            if (myPlayerKey && myPlayerKey !== 'spectator' && currentGameState.phase === 'turn' && currentGameState.whoseTurn === myPlayerKey) {
                showForfeitConfirmation();
            }
        };
    }

    function showForfeitConfirmation() {
        const modalContentHtml = `
            <p>Você tem certeza que deseja jogar a toalha e desistir da luta?</p>
            <div style="display: flex; justify-content: center; gap: 20px; margin-top: 20px;">
                <button id="confirm-forfeit-btn" style="background-color: #dc3545; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Sim, Desistir</button>
                <button id="cancel-forfeit-btn" style="background-color: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Não, Continuar</button>
            </div>`;
        showInfoModal("Jogar a Toalha", modalContentHtml);
        document.getElementById('confirm-forfeit-btn').onclick = () => {
            socket.emit('playerAction', { type: 'forfeit', playerKey: myPlayerKey });
            modal.classList.add('hidden');
        };
        document.getElementById('cancel-forfeit-btn').onclick = () => {
            modal.classList.add('hidden');
        };
    }

    function onConfirmSelection() {
        const selectedCard = document.querySelector('.char-card.selected');
        if (!selectedCard) { alert('Por favor, selecione um lutador!'); return; }
        let playerData = { nome: selectedCard.dataset.name, img: selectedCard.dataset.img };
        confirmBtn.disabled = true;
        selectionScreen.classList.add('hidden');
        if (currentRoomId) {
            socket.emit('joinGame', { roomId: currentRoomId, player2Data: playerData });
            lobbyScreen.classList.add('active');
            lobbyContent.innerHTML = `<p>Você escolheu <strong>${playerData.nome}</strong>.</p><p>Aguardando o Jogador 1 definir seus atributos...</p>`;
        } else {
            playerData.agi = selectedCard.querySelector('.agi-input').value;
            playerData.res = selectedCard.querySelector('.res-input').value;
            socket.emit('createGame', playerData);
            lobbyScreen.classList.add('active');
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
            // >>> CORREÇÃO 1: Remove AGI/RES para o Jogador 2 <<<
            const statsHtml = playerType === 'p1' ? `<div class="char-stats"><label>AGI: <input type="number" class="agi-input" value="${stats.agi}"></label><label>RES: <input type="number" class="res-input" value="${stats.res}"></label></div>` : '';
            card.innerHTML = `<img src="images/${name}.png" alt="${name}"><div class="char-name">${name}</div>${statsHtml}`;
            card.addEventListener('click', () => { document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected')); card.classList.add('selected'); });
            charListContainer.appendChild(card);
        }
    }

    // --- OUVINTES DO SOCKET.IO ---
    socket.on('playSound', playRandomSound);
    socket.on('triggerAttackAnimation', ({ attackerKey }) => { const img = document.getElementById(`${attackerKey}-fight-img`); if (img) { img.classList.add(`is-attacking-${attackerKey}`); setTimeout(() => img.classList.remove(`is-attacking-${attackerKey}`), 400); } });
    socket.on('triggerHitAnimation', ({ defenderKey }) => { const img = document.getElementById(`${defenderKey}-fight-img`); if (img) { img.classList.add('is-hit'); setTimeout(() => img.classList.remove('is-hit'), 500); } });
    socket.on('assignPlayer', (playerKey) => { myPlayerKey = playerKey; const msg = playerKey === 'spectator' ? 'Você está <strong>assistindo</strong> a partida.' : `Você é o <strong>Jogador ${playerKey === 'player1' ? '1' : '2'}</strong>.`; lobbyContent.innerHTML = `<p>${msg}</p>`; });
    socket.on('roomCreated', (roomId) => { currentRoomId = roomId; const p2Url = `${window.location.origin}?room=${roomId}`; const specUrl = `${window.location.origin}?room=${roomId}&spectate=true`; shareLinkP2.textContent = p2Url; shareLinkSpectator.textContent = specUrl; shareContainer.classList.remove('hidden'); shareLinkP2.onclick = () => copyToClipboard(p2Url, shareLinkP2); shareLinkSpectator.onclick = () => copyToClipboard(specUrl, shareLinkSpectator); });
    function copyToClipboard(text, element) { navigator.clipboard.writeText(text).then(() => { const originalText = element.textContent; element.textContent = 'Copiado!'; setTimeout(() => { element.textContent = originalText; }, 2000); }); }
    copySpectatorLinkInGameBtn.onclick = () => { if (currentRoomId) copyToClipboard(`${window.location.origin}?room=${currentRoomId}&spectate=true`, copySpectatorLinkInGameBtn); };

    socket.on('gameUpdate', (gameState) => {
        currentGameState = gameState;
        updateUI(gameState);
        if (gameState.phase !== 'waiting' && gameState.phase !== 'p2_stat_assignment' && !fightScreen.classList.contains('active')) {
            lobbyScreen.classList.add('hidden');
            selectionScreen.classList.add('hidden');
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
        if (isMyTurnToRoll) {
            btn.onclick = () => socket.emit('playerAction', action);
            btn.disabled = false;
        } else {
            btn.disabled = true;
            btn.onclick = null;
            if (!isSpectator) btn.classList.add('inactive');
        }
    });

    socket.on('hideRollButtons', () => { ['player1-roll-btn', 'player2-roll-btn'].forEach(id => document.getElementById(id).classList.add('hidden')); });
    socket.on('showModal', ({ title, text, btnText, action, targetPlayerKey, modalType }) => { if (modalType === 'gameover') { showInfoModal(title, text); return; } if (targetPlayerKey === myPlayerKey) { showInteractiveModal(title, text, btnText, action); } else { const activePlayerName = currentGameState?.fighters[targetPlayerKey]?.nome || 'oponente'; if (modalType === 'knockdown') showInfoModal(`${activePlayerName} caiu!`, "Aguarde a contagem..."); } });
    socket.on('promptP2Stats', (p2data) => {
        const modalContentHtml = `<p>O Jogador 2 escolheu <strong>${p2data.nome}</strong>.</p><img src="${p2data.img}" alt="${p2data.nome}" style="width: 80px; height: 80px; border-radius: 50%; background: #555; margin: 10px auto; display: block;"><p>Defina os atributos dele:</p><div style="display: flex; justify-content: center; gap: 20px; color: #fff; padding: 10px 0;"><label>AGI: <input type="number" id="p2-stat-agi" value="2" style="width: 50px; text-align: center; font-size: 1.1em; background: #555; color: #fff; border: 1px solid #777; border-radius: 4px;"></label><label>RES: <input type="number" id="p2-stat-res" value="2" style="width: 50px; text-align: center; font-size: 1.1em; background: #555; color: #fff; border: 1px solid #777; border-radius: 4px;"></label></div>`;
        showInteractiveModal("Definir Atributos do Oponente", modalContentHtml, "Confirmar Atributos", null);
        modalButton.onclick = () => { const agi = document.getElementById('p2-stat-agi').value; const res = document.getElementById('p2-stat-res').value; if (!agi || !res || isNaN(agi) || isNaN(res) || agi < 1 || res < 1) { alert("Valores inválidos para AGI/RES."); return; } const action = { type: 'set_p2_stats', playerKey: myPlayerKey, stats: { agi, res } }; socket.emit('playerAction', action); modal.classList.add('hidden'); };
    });
    socket.on('hideModal', () => modal.classList.add('hidden'));
    socket.on('diceRoll', showDiceRollAnimation);
    socket.on('opponentDisconnected', () => { showInfoModal("Oponente Desconectado", "Fim de jogo. Recarregue a página."); document.querySelectorAll('button').forEach(btn => btn.disabled = true); });

    function updateUI(state) {
        ['player1', 'player2'].forEach(key => {
            const fighter = state.fighters[key];
            if (fighter) {
                document.getElementById(`${key}-fight-name`).innerText = fighter.nome;
                document.getElementById(`${key}-hp-text`).innerText = `${fighter.hp} / ${fighter.hpMax}`;
                document.getElementById(`${key}-hp-bar`).style.width = `${(fighter.hp / fighter.hpMax) * 100}%`;
                document.getElementById(`${key}-def-text`).innerText = fighter.def;
                document.getElementById(`${key}-hits`).innerText = fighter.hitsLanded;
                document.getElementById(`${key}-pa-dots`).innerHTML = Array(fighter.pa).fill('<div class="pa-dot"></div>').join('');
                document.getElementById(`${key}-fight-img`).src = fighter.img;
            } else if (key === 'player2' && state.pendingP2Choice) {
                document.getElementById(`${key}-fight-img`).src = state.pendingP2Choice.img;
            }
        });

        const roundInfoEl = document.getElementById('round-info');
        if (state.phase === 'gameover') roundInfoEl.innerHTML = `<span class="turn-highlight">FIM DE JOGO!</span>`;
        else { const turnName = state.whoseTurn ? state.fighters[state.whoseTurn].nome : '...'; roundInfoEl.innerHTML = `ROUND ${state.currentRound} - RODADA ${state.currentTurn} - Vez de: <span class="turn-highlight">${turnName}</span>`; }
        
        document.getElementById('player1-area').classList.toggle('active-turn', state.whoseTurn === 'player1');
        document.getElementById('player2-area').classList.toggle('active-turn', state.whoseTurn === 'player2');
        
        const isSpectator = myPlayerKey === 'spectator';
        const isGameOver = state.phase === 'gameover';
        
        const p1_is_turn = state.whoseTurn === 'player1' && state.phase === 'turn';
        const p2_is_turn = state.whoseTurn === 'player2' && state.phase === 'turn';

        p1Controls.classList.add('hidden');
        p2Controls.classList.add('hidden');

        if (myPlayerKey === 'player1') {
            p1Controls.classList.remove('hidden');
            const p1_pa = state.fighters.player1?.pa || 0;
            document.querySelectorAll('#p1-controls button').forEach(btn => btn.disabled = !p1_is_turn || isGameOver);
            document.querySelectorAll('#p1-controls .action-btn').forEach(btn => { if(state.moves[btn.dataset.move]?.cost > p1_pa) btn.disabled = true; });
        } else if (myPlayerKey === 'player2') {
            p2Controls.classList.remove('hidden');
            const p2_pa = state.fighters.player2?.pa || 0;
            document.querySelectorAll('#p2-controls button').forEach(btn => btn.disabled = !p2_is_turn || isGameOver);
            document.querySelectorAll('#p2-controls .action-btn').forEach(btn => { if(state.moves[btn.dataset.move]?.cost > p2_pa) btn.disabled = true; });
        } else if (isSpectator) {
            if (p1_is_turn) p1Controls.classList.remove('hidden');
            if (p2_is_turn) p2Controls.classList.remove('hidden');
            document.querySelectorAll('#p1-controls button, #p2-controls button').forEach(btn => btn.disabled = true);
        }

        document.getElementById('forfeit-btn').disabled = isGameOver || isSpectator || state.whoseTurn !== myPlayerKey;

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

    function showDiceRollAnimation(playerKey, rollValue, diceType) {
        const diceOverlay = document.getElementById('dice-overlay');
        // >>> CORREÇÃO 2: Lógica do prefixo do dado corrigida <<<
        const imagePrefix = (diceType === 'd6')
            ? (playerKey === 'player1' ? 'diceA' : 'diceP')
            : (playerKey === 'player1' ? 'D3A-' : 'D3P-');

        const diceContainer = document.getElementById(`${playerKey}-dice-result`);
        if (diceContainer && diceOverlay) {
            diceOverlay.classList.remove('hidden');
            diceContainer.style.backgroundImage = `url('images/${imagePrefix}${rollValue}.png')`;
            diceContainer.classList.remove('hidden');
            const hideAndResolve = () => {
                diceOverlay.classList.add('hidden');
                diceContainer.classList.add('hidden');
            };
            diceOverlay.addEventListener('click', hideAndResolve, { once: true });
            setTimeout(hideAndResolve, 2000);
        }
    }
    
    initialize();
    const scaleGame = () => { const w = document.getElementById('game-wrapper'); const s = Math.min(window.innerWidth / 1280, window.innerHeight / 720); w.style.transform = `scale(${s})`; w.style.left = `${(window.innerWidth - (1280 * s)) / 2}px`; w.style.top = `${(window.innerHeight - (720 * s)) / 2}px`; };
    scaleGame();
    window.addEventListener('resize', scaleGame);
});