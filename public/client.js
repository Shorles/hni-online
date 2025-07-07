document.addEventListener('DOMContentLoaded', () => {
    let myPlayerKey = null;
    let currentGameState = null;
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
    const shareLink = document.getElementById('share-link');
    let modal = document.getElementById('modal');
    let modalTitle = document.getElementById('modal-title');
    let modalText = document.getElementById('modal-text');
    let modalButton = document.getElementById('modal-button');
    const controlsWrapper = document.getElementById('action-buttons-wrapper'); 

    // --- DADOS E ÁUDIO ---
    const SOUNDS = {
        jab: [new Audio('sons/jab01.mp3'), new Audio('sons/jab02.mp3'), new Audio('sons/jab03.mp3')],
        strong: [new Audio('sons/baseforte01.mp3'), new Audio('sons/baseforte02.mp3')],
        dice: [new Audio('sons/dice1.mp3'), new Audio('sons/dice2.mp3'), new Audio('sons/dice3.mp3')],
        critical: [new Audio('sons/Critical.mp3')],
        miss: [new Audio('sons/Esquiva.mp3')]
    };
    function playRandomSound(soundType) {
        const soundArray = SOUNDS[soundType];
        if (soundArray && soundArray.length > 0) {
            const randomIndex = Math.floor(Math.random() * soundArray.length);
            const sound = soundArray[randomIndex];
            sound.currentTime = 0;
            sound.play().catch(e => console.error("Erro ao tocar som:", e));
        }
    }

    // --- LÓGICA DE INICIALIZAÇÃO ---
    const urlParams = new URLSearchParams(window.location.search);
    const roomIdFromUrl = urlParams.get('room');
    if (!roomIdFromUrl) {
        lobbyScreen.classList.add('hidden');
        fightScreen.classList.add('hidden');
        selectionScreen.classList.add('active');
        document.getElementById('confirm-selection-btn').onclick = () => {
            const roomId = uuidv4().substring(0, 6);
            window.location.href = `?room=${roomId}`;
        };
    } else {
        lobbyScreen.classList.add('active');
        fightScreen.classList.add('hidden');
        selectionScreen.classList.add('hidden');
        socket.emit('joinGame', roomIdFromUrl);
    }
    
    // --- OUVINTES DE EVENTOS DO SOCKET.IO ---
    socket.on('playSound', (soundType) => {
        playRandomSound(soundType);
    });

    socket.on('assignPlayer', (playerKey) => {
        myPlayerKey = playerKey;
        lobbyContent.innerHTML = `<p>Você é o <strong>Jogador ${myPlayerKey === 'player1' ? '1 (Nathan)' : '2 (Ivan)'}</strong>.</p>`;
        if (playerKey === 'player1') {
            controlsWrapper.classList.add('p1-controls');
        } else {
            controlsWrapper.classList.add('p2-controls');
        }
    });

    socket.on('roomCreated', (roomId) => {
        // Esta lógica não é mais necessária no novo fluxo
    });

    socket.on('gameUpdate', (gameState) => {
        currentGameState = gameState;
        updateUI(gameState);
        if (gameState.phase !== 'waiting' && lobbyScreen.classList.contains('active')) {
            lobbyScreen.classList.remove('active');
            fightScreen.classList.add('active');
        }
    });

    socket.on('promptRoll', ({ targetPlayerKey, text, action }) => {
        const btn = document.getElementById(`${targetPlayerKey}-roll-btn`);
        if(myPlayerKey === targetPlayerKey) {
            btn.disabled = false;
            btn.onclick = () => {
                socket.emit('playerAction', action);
                btn.classList.add('hidden');
            };
        } else {
            btn.disabled = true;
        }
        btn.innerText = text;
        btn.classList.remove('hidden');
    });

    socket.on('hideRollButtons', () => {
        document.getElementById('player1-roll-btn').classList.add('hidden');
        document.getElementById('player2-roll-btn').classList.add('hidden');
    });

    socket.on('showModal', ({ title, text, btnText, action, targetPlayerKey }) => {
        // Lógica de modal de knockdown permanece
        if (title === 'Você caiu!') {
            if (targetPlayerKey === myPlayerKey) {
                showInteractiveModal(title, text, btnText, action);
            } else {
                const activePlayerName = currentGameState.fighters[targetPlayerKey].nome;
                showInfoModal(`${activePlayerName} caiu!`, `Aguarde a contagem...`);
            }
        }
    });

    socket.on('hideModal', () => {
        modal.classList.add('hidden');
    });

    socket.on('diceRoll', ({ playerKey, rollValue, diceType, showOverlay }) => {
        showDiceRollAnimation(playerKey, rollValue, diceType, showOverlay);
    });

    socket.on('opponentDisconnected', () => {
        showInfoModal("Oponente Desconectado", "Seu oponente saiu do jogo. A sala foi encerrada. Recarregue a página para jogar novamente.");
        document.querySelectorAll('button').forEach(btn => btn.disabled = true);
    });

    function updateUI(state) {
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
        
        const isMyTurn = state.whoseTurn === myPlayerKey && state.phase === 'turn';
        document.querySelectorAll('#move-buttons .action-btn').forEach(btn => {
            const move = state.moves[btn.dataset.move];
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
        const newButton = modalButton.cloneNode(true);
        modalButton.parentNode.replaceChild(newButton, modalButton);
        modalButton = document.getElementById('modal-button');
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

    function showDiceRollAnimation(playerKey, rollValue, diceType, showOverlay) {
        const diceOverlay = document.getElementById('dice-overlay');
        const diceContainer = document.getElementById(`${playerKey}-dice-result`);
        if (!diceContainer) return;

        if (showOverlay) {
            diceOverlay.classList.remove('hidden');
        }

        const imagePrefix = (diceType === 'd3') 
            ? (playerKey === 'player1' ? 'D3A-' : 'D3P-') 
            : (playerKey === 'player1' ? 'diceA' : 'diceP');
        
        diceContainer.style.backgroundImage = `url('images/${imagePrefix}${rollValue}.png')`;
        diceContainer.classList.remove('hidden');

        const hideAndResolve = () => {
            if (showOverlay) diceOverlay.classList.add('hidden');
            diceContainer.classList.add('hidden');
        };
        
        if (showOverlay) {
            diceOverlay.addEventListener('click', hideAndResolve, { once: true });
        }
        setTimeout(hideAndResolve, 2000); 
    }

    const scaleGame = () => { const w = document.getElementById('game-wrapper'); const s = Math.min(window.innerWidth / 1280, window.innerHeight / 720); w.style.transform = `scale(${s})`; w.style.left = `${(window.innerWidth - (1280 * s)) / 2}px`; w.style.top = `${(window.innerHeight - (720 * s)) / 2}px`; };
    scaleGame();
    window.addEventListener('resize', scaleGame);
});