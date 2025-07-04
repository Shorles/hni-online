document.addEventListener('DOMContentLoaded', () => {
    // --- ESTADO DO LADO DO CLIENTE ---
    let myPlayerKey = null; // Será 'player1' ou 'player2'
    let currentGameState = null;

    // Conecta ao servidor. A mágica do Socket.IO!
    const socket = io();

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
    // 1. OUVINTES DE EVENTOS DO SERVIDOR (O que fazer quando o servidor manda uma mensagem)
    // ===================================================================

    // O servidor nos atribuiu um papel (P1 ou P2)
    socket.on('assignPlayer', (playerKey) => {
        myPlayerKey = playerKey;
        lobbyContent.innerHTML = `<p>Você é o <strong>Jogador ${myPlayerKey === 'player1' ? '1 (Nathan)' : '2 (Ivan)'}</strong>.</p>`;
    });

    // O servidor criou uma sala para nós (somente P1 recebe)
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

    // O servidor enviou um novo estado de jogo. Esta é a função mais importante!
    socket.on('gameUpdate', (gameState) => {
        currentGameState = gameState;
        updateUI(gameState);

        // Se o jogo começou, troca da tela de lobby para a de luta
        if (gameState.phase !== 'waiting' && lobbyScreen.classList.contains('active')) {
            lobbyScreen.classList.remove('active');
            fightScreen.classList.add('active');
        }
    });

    // O servidor quer mostrar um modal (para rolar dados, etc.)
    socket.on('showModal', ({ title, text, btnText, action }) => {
        // Mostra o modal apenas se for a nossa vez de agir
        if (action.playerKey === myPlayerKey) {
            showInteractiveModal(title, text, btnText, action);
        } else {
            // Se não for nossa vez, mostra um modal informativo
            showInfoModal(title, `Aguardando ${currentGameState.fighters[action.playerKey].nome} agir...`);
        }
    });
    
    // O servidor mandou uma animação de dado
    socket.on('diceRoll', ({ playerKey, rollValue, diceType }) => {
        showDiceRollAnimation(playerKey, rollValue, diceType);
    });

    // O oponente desconectou
    socket.on('opponentDisconnected', () => {
        showInfoModal("Oponente Desconectado", "Seu oponente saiu do jogo. A sala foi encerrada. Recarregue a página para jogar novamente.");
        document.querySelectorAll('button').forEach(btn => btn.disabled = true);
    });

    // ===================================================================
    // 2. FUNÇÕES DE INTERFACE E VISUAIS (Como o cliente desenha na tela)
    // ===================================================================

    function updateUI(state) {
        // Atualiza a vida, PA, etc. para ambos os jogadores
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
        
        // Destaque do jogador ativo
        document.getElementById('player1-area').classList.toggle('active-turn', state.whoseTurn === 'player1');
        document.getElementById('player2-area').classList.toggle('active-turn', state.whoseTurn === 'player2');
        
        // Cores dos botões
        const controlsWrapper = document.getElementById('action-buttons-wrapper');
        controlsWrapper.classList.remove('p1-controls', 'p2-controls');
        if (state.whoseTurn) controlsWrapper.classList.add(state.whoseTurn === 'player1' ? 'p1-controls' : 'p2-controls');
        
        // Habilita/Desabilita botões se for ou não a nossa vez
        const isMyTurn = state.phase === 'turn' && state.whoseTurn === myPlayerKey;
        document.querySelectorAll('#move-buttons .action-btn').forEach(btn => {
            const move = state.moves[btn.dataset.move];
            btn.disabled = !isMyTurn || !move || move.cost > state.fighters[myPlayerKey].pa;
        });
        document.getElementById('end-turn-btn').disabled = !isMyTurn;
        document.getElementById('forfeit-btn').disabled = state.phase === 'gameover';

        // Atualiza o log da luta
        const logBox = document.getElementById('fight-log');
        logBox.innerHTML = state.log.map(msg => `<p class="${msg.className || ''}">${msg.text}</p>`).join('');
        logBox.scrollTop = logBox.scrollHeight;
    }
    
    function showInteractiveModal(title, text, btnText, action) {
        modalTitle.innerText = title;
        modalText.innerHTML = text;
        modalButton.innerText = btnText;
        modalButton.style.display = 'inline-block';
        modalButton.disabled = false;
        modalButton.onclick = () => {
            modalButton.disabled = true;
            socket.emit('playerAction', action);
        };
        modal.classList.remove('hidden');
    }

    function showInfoModal(title, text) {
        modalTitle.innerText = title;
        modalText.innerHTML = text;
        modalButton.style.display = 'none';
        modal.classList.remove('hidden');
    }

    function showDiceRollAnimation(playerKey, rollValue, diceType) {
        return new Promise(resolve => {
            const diceOverlay = document.getElementById('dice-overlay');
            diceOverlay.classList.remove('hidden');
            playSound(DICE_SOUNDS[Math.floor(Math.random() * DICE_SOUNDS.length)]);
            const imagePrefix = (diceType === 'd3') ? (playerKey === 'player1' ? 'D3P-' : 'D3A-') : (playerKey === 'player1' ? 'diceP' : 'diceA');
            const diceContainer = document.getElementById(`${playerKey}-dice-result`);
            diceContainer.style.backgroundImage = `url('images/${imagePrefix}${rollValue}.png')`;
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
    // 3. EMISSORES DE EVENTOS (O que o cliente envia para o servidor)
    // ===================================================================

    document.querySelectorAll('#move-buttons .action-btn').forEach(btn => {
        btn.onclick = () => socket.emit('playerAction', { type: 'attack', move: btn.dataset.move });
    });
    document.getElementById('end-turn-btn').onclick = () => socket.emit('playerAction', { type: 'end_turn' });
    document.getElementById('forfeit-btn').onclick = () => socket.emit('playerAction', { type: 'forfeit' });


    // --- Funções visuais que não dependem do servidor ---
    const scaleGame = () => { const w = document.getElementById('game-wrapper'); const s = Math.min(window.innerWidth / 1280, window.innerHeight / 720); w.style.transform = `scale(${s})`; w.style.left = `${(window.innerWidth - (1280 * s)) / 2}px`; w.style.top = `${(window.innerHeight - (720 * s)) / 2}px`; };
    scaleGame();
    window.addEventListener('resize', scaleGame);

    // --- INÍCIO ---
    const urlParams = new URLSearchParams(window.location.search);
    const roomIdFromUrl = urlParams.get('room');
    socket.emit('joinGame', roomIdFromUrl);
});