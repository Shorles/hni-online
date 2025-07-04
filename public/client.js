// VERSÃO FINAL E DEFINITIVA - client.js

document.addEventListener('DOMContentLoaded', () => {
    // --- ESTADO DO LADO DO CLIENTE ---
    let myPlayerKey = null;
    let currentGameState = null;

    // Conecta ao servidor, forçando WebSocket para maior confiabilidade no Render
    const socket = io({ transports: ['websocket'], upgrade: false });

    // --- MANIPULADORES DE DOM (ELEMENTOS DA PÁGINA) ---
    const lobbyScreen = document.getElementById('lobby-screen');
    const fightScreen = document.getElementById('fight-screen');
    const lobbyContent = document.getElementById('lobby-content');
    const shareContainer = document.getElementById('share-container');
    const shareLink = document.getElementById('share-link');
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalText = document.getElementById('modal-text');
    const modalButton = document.getElementById('modal-button');

    // ===================================================================
    // 1. OUVINTES DE EVENTOS DO SERVIDOR
    // ===================================================================

    socket.on('assignPlayer', (playerKey) => {
        myPlayerKey = playerKey;
        lobbyContent.innerHTML = `<p>Você é o <strong>Jogador ${myPlayerKey === 'player1' ? '1 (Nathan)' : '2 (Ivan)'}</strong>.</p>`;
    });

    socket.on('roomCreated', (roomId) => {
        const url = `${window.location.origin}?room=${roomId}`;
        shareLink.textContent = url;
        lobbyContent.innerHTML += `<p>Aguardando oponente...</p>`;
        shareContainer.classList.remove('hidden');
        shareLink.onclick = () => {
            navigator.clipboard.writeText(url).then(() => {
                shareLink.textContent = 'Copiado!';
                setTimeout(() => { shareLink.textContent = url; }, 2000);
            });
        };
    });

    socket.on('gameUpdate', (gameState) => {
        currentGameState = gameState;
        
        // **A CORREÇÃO CRÍTICA ESTÁ AQUI**
        // Se a fase do jogo não é mais 'esperando', força a troca para a tela de luta.
        if (gameState.phase !== 'waiting' && lobbyScreen.classList.contains('active')) {
            lobbyScreen.classList.remove('active');
            fightScreen.classList.add('active');
            modal.classList.add('hidden'); // Garante que nenhum modal do lobby fique aberto
        }
        
        updateUI(gameState);
    });

    socket.on('showModal', ({ title, text, btnText, action }) => {
        const actingPlayerName = currentGameState.fighters[action.playerKey]?.nome || '...';
        if (action.playerKey === myPlayerKey) {
            showInteractiveModal(title, text, btnText, action);
        } else {
            showInfoModal(title, `Aguardando ${actingPlayerName} agir...`);
        }
    });

    socket.on('diceRoll', ({ playerKey, rollValue, diceType }) => showDiceRollAnimation(playerKey, rollValue, diceType));

    socket.on('opponentDisconnected', () => {
        showInfoModal("Oponente Desconectado", "Seu oponente saiu. Recarregue a página para jogar novamente.");
        document.querySelectorAll('button').forEach(btn => btn.disabled = true);
    });

    // ===================================================================
    // 2. FUNÇÕES DE INTERFACE E VISUAIS
    // ===================================================================

    function updateUI(state) {
        if (!state) return;
        for (const key of ['player1', 'player2']) {
            const fighter = state.fighters[key];
            document.getElementById(`${key}-fight-name`).innerText = fighter.nome;
            document.getElementById(`${key}-hp-text`).innerText = `${fighter.hp} / ${fighter.hpMax}`;
            document.getElementById(`${key}-hp-bar`).style.width = `${(fighter.hp / fighter.hpMax) * 100}%`;
            document.getElementById(`${key}-def-text`).innerText = fighter.def;
            document.getElementById(`${key}-hits`).innerText = fighter.hitsLanded;
            const paContainer = document.getElementById(`${key}-pa-dots`);
            paContainer.innerHTML = '';
            for (let i = 0; i < fighter.pa; i++) paContainer.innerHTML += '<div class="pa-dot"></div>';
        }
        const turnName = state.whoseTurn ? state.fighters[state.whoseTurn].nome : '...';
        document.getElementById('round-info').innerText = `ROUND ${state.currentRound} - RODADA ${state.currentTurn} - Vez de: ${turnName}`;
        document.getElementById('player1-area').classList.toggle('active-turn', state.whoseTurn === 'player1');
        document.getElementById('player2-area').classList.toggle('active-turn', state.whoseTurn === 'player2');
        const controlsWrapper = document.getElementById('action-buttons-wrapper');
        controlsWrapper.classList.remove('p1-controls', 'p2-controls');
        if (state.whoseTurn) controlsWrapper.classList.add(state.whoseTurn === 'player1' ? 'p1-controls' : 'p2-controls');
        
        const isMyTurn = state.phase === 'turn' && state.whoseTurn === myPlayerKey;
        const myFighterState = state.fighters[myPlayerKey];

        document.querySelectorAll('#move-buttons .action-btn').forEach(btn => {
            const move = state.moves[btn.dataset.move];
            btn.disabled = !isMyTurn || !move || !myFighterState || move.cost > myFighterState.pa;
        });
        document.getElementById('end-turn-btn').disabled = !isMyTurn;
        document.getElementById('forfeit-btn').disabled = state.phase === 'gameover';
        const logBox = document.getElementById('fight-log');
        logBox.innerHTML = state.log.map(msg => `<p class="${msg.className || ''}">${msg.text}</p>`).join('');
        logBox.scrollTop = logBox.scrollHeight;
    }

    function showInteractiveModal(title, text, btnText, action) {
        modalTitle.innerText = title; modalText.innerHTML = text; modalButton.innerText = btnText;
        modalButton.style.display = 'inline-block'; modalButton.disabled = false;
        modalButton.onclick = () => {
            modalButton.disabled = true;
            socket.emit('playerAction', action);
        };
        modal.classList.remove('hidden');
    }

    function showInfoModal(title, text) {
        modalTitle.innerText = title; modalText.innerHTML = text;
        modalButton.style.display = 'none';
        modal.classList.remove('hidden');
    }

    const DICE_SOUNDS = ['dice1.mp3', 'dice2.mp3', 'dice3.mp3'];
    function playSound(soundFile) {
        const sfxVolume = 0.5;
        if (sfxVolume <= 0) return;
        const audio = new Audio(`sons/${soundFile}`);
        audio.volume = sfxVolume;
        audio.play().catch(e => console.error("Erro ao tocar som:", e));
    };

    function showDiceRollAnimation(playerKey, rollValue, diceType) {
        return new Promise(resolve => {
            const diceOverlay = document.getElementById('dice-overlay');
            diceOverlay.classList.remove('hidden');
            playSound(DICE_SOUNDS[Math.floor(Math.random() * DICE_SOUNDS.length)]);
            const imagePrefix = (diceType === 'd3') ? (playerKey === 'player1' ? 'D3P-' : 'D3A-') : (playerKey === 'player1' ? 'diceP' : 'diceA');
            const diceContainer = document.getElementById(`${playerKey}-dice-result`);
            diceContainer.style.backgroundImage = `url('/images/${imagePrefix}${rollValue}.png')`;
            diceContainer.classList.remove('hidden');
            const hideAndResolve = () => {
                diceOverlay.classList.add('hidden');
                diceContainer.classList.add('hidden');
                resolve();
            };
            diceOverlay.addEventListener('click', hideAndResolve, { once: true });
            setTimeout(hideAndResolve, 2000);
        });
    }

    // ===================================================================
    // 3. EMISSORES DE EVENTOS
    // ===================================================================

    document.querySelectorAll('#move-buttons .action-btn').forEach(btn => {
        btn.onclick = () => socket.emit('playerAction', { type: 'attack', move: btn.dataset.move, playerKey: myPlayerKey });
    });
    document.getElementById('end-turn-btn').onclick = () => socket.emit('playerAction', { type: 'end_turn', playerKey: myPlayerKey });
    document.getElementById('forfeit-btn').onclick = () => socket.emit('playerAction', { type: 'forfeit', playerKey: myPlayerKey });

    const scaleGame = () => { const w = document.getElementById('game-wrapper'); const s = Math.min(window.innerWidth / 1280, window.innerHeight / 720); w.style.transform = `scale(${s})`; w.style.left = `${(window.innerWidth - (1280 * s)) / 2}px`; w.style.top = `${(window.innerHeight - (720 * s)) / 2}px`; };
    scaleGame(); window.addEventListener('resize', scaleGame);

    const urlParams = new URLSearchParams(window.location.search);
    const roomIdFromUrl = urlParams.get('room');
    socket.emit('joinGame', roomIdFromUrl);
});