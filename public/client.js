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
        const oldPhase = currentGameState ? currentGameState.phase : null;
        currentGameState = gameState;
        updateUI(gameState);

        if (gameState.phase !== 'waiting' && lobbyScreen.classList.contains('active')) {
            lobbyScreen.classList.remove('active');
            fightScreen.classList.add('active');
        }
    });

    socket.on('showModal', ({ title, text, btnText, action }) => {
        if (!currentGameState) return; // Garante que o estado do jogo já foi recebido

        // Mostra o modal interativo se for a nossa vez de agir
        if (action.playerKey === myPlayerKey) {
            showInteractiveModal(title, text, btnText, action);
        } else {
            // Se não for nossa vez, mostra um modal informativo
            const activePlayerName = currentGameState.fighters[action.playerKey].nome;
            showInfoModal(title, `Aguardando ${activePlayerName} agir...`);
        }
    });

    // *** NOVO OUVINTE PARA ESCONDER O MODAL ***
    socket.on('hideModal', () => {
        modal.classList.add('hidden');
    });
    
    socket.on('diceRoll', ({ playerKey, rollValue, diceType }) => {
        // A função original para animação de dados não está aqui, mas o ouvinte permanece.
        // A lógica de animação de dados continua a mesma
        // showDiceRollAnimation(playerKey, rollValue, diceType);
    });

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
        
        document.getElementById('player1-area').classList.toggle('active-turn', state.whoseTurn === 'player1');
        document.getElementById('player2-area').classList.toggle('active-turn', state.whoseTurn === 'player2');
        
        const controlsWrapper = document.getElementById('action-buttons-wrapper');
        controlsWrapper.classList.remove('p1-controls', 'p2-controls');
        if (state.whoseTurn) controlsWrapper.classList.add(state.whoseTurn === 'player1' ? 'p1-controls' : 'p2-controls');
        
        const isMyTurn = state.whoseTurn === myPlayerKey && state.phase === 'turn'; // Só pode atacar na fase de turno
        document.querySelectorAll('#move-buttons .action-btn').forEach(btn => {
            const move = state.moves[btn.dataset.move];
            // Certifique-se de que myPlayerKey e state.fighters[myPlayerKey] existem antes de acessar
            const fighterPA = myPlayerKey ? state.fighters[myPlayerKey].pa : 0;
            btn.disabled = !isMyTurn || !move || move.cost > fighterPA;
        });
        document.getElementById('end-turn-btn').disabled = !isMyTurn;
        document.getElementById('forfeit-btn').disabled = state.phase === 'gameover';

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
        
        // Remove qualquer ouvinte de clique antigo para evitar múltiplos envios
        const newButton = modalButton.cloneNode(true);
        modalButton.parentNode.replaceChild(newButton, modalButton);
        modalButton = newButton; // Atualiza a referência

        modalButton.onclick = () => {
            modalButton.disabled = true;
            modalButton.innerText = "Aguarde...";
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
    
    // O resto do client.js continua o mesmo a partir daqui...
    // ... (incluindo a função showDiceRollAnimation, emissores de eventos, etc.)
    // ... cole o restante do seu client.js original aqui.

    // A função de animação do dado (com a correção do som que faltava)
    function showDiceRollAnimation(playerKey, rollValue, diceType) {
        // Simulação da função, já que não temos os arquivos de som/imagem.
        console.log(`Animação de dado: ${playerKey} rolou ${rollValue} no ${diceType}`);
        const diceOverlay = document.getElementById('dice-overlay');
        diceOverlay.classList.remove('hidden');
        const imagePrefix = (diceType === 'd3') ? (playerKey === 'player1' ? 'D3P-' : 'D3A-') : (playerKey === 'player1' ? 'diceP' : 'diceA');
        const diceContainer = document.getElementById(`${playerKey}-dice-result`);
        diceContainer.style.backgroundImage = `url('images/${imagePrefix}${rollValue}.png')`;
        diceContainer.classList.remove('hidden');
        const hideAndResolve = () => {
            diceOverlay.classList.add('hidden');
            diceContainer.classList.add('hidden');
        };
        diceOverlay.addEventListener('click', hideAndResolve, { once: true });
        setTimeout(hideAndResolve, 2000); 
    }
    
    // ===================================================================
    // 3. EMISSORES DE EVENTOS (O que o cliente envia para o servidor)
    // ===================================================================

    document.querySelectorAll('#move-buttons .action-btn').forEach(btn => {
        btn.onclick = () => {
            // Adiciona uma verificação extra para garantir que a ação é para o jogador atual
            if (currentGameState.whoseTurn === myPlayerKey) {
                socket.emit('playerAction', { type: 'attack', move: btn.dataset.move, playerKey: myPlayerKey });
            }
        }
    });
    document.getElementById('end-turn-btn').onclick = () => {
        if (currentGameState.whoseTurn === myPlayerKey) {
            socket.emit('playerAction', { type: 'end_turn', playerKey: myPlayerKey });
        }
    };
    document.getElementById('forfeit-btn').onclick = () => {
        socket.emit('playerAction', { type: 'forfeit', playerKey: myPlayerKey });
    };


    // --- Funções visuais que não dependem do servidor ---
    const scaleGame = () => { const w = document.getElementById('game-wrapper'); const s = Math.min(window.innerWidth / 1280, window.innerHeight / 720); w.style.transform = `scale(${s})`; w.style.left = `${(window.innerWidth - (1280 * s)) / 2}px`; w.style.top = `${(window.innerHeight - (720 * s)) / 2}px`; };
    scaleGame();
    window.addEventListener('resize', scaleGame);

    // --- INÍCIO ---
    const urlParams = new URLSearchParams(window.location.search);
    const roomIdFromUrl = urlParams.get('room');
    socket.emit('joinGame', roomIdFromUrl);
});