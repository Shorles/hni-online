document.addEventListener('DOMContentLoaded', () => {
    let myPlayerKey = null;
    let currentGameState = null;
    const socket = io();

    // --- DADOS DOS PERSONAGENS ---
    const CHARACTERS_P1 = {
        'Kureha Shoji': { agi: 3, res: 1 }, 'Erik Adler': { agi: 2, res: 2 }, 'Ivan Braskovich': { agi: 1, res: 3 },
        'Hayato Takamura': { agi: 4, res: 4 }, 'Logan Graves': { agi: 3, res: 2 }, 'Daigo Kurosawa': { agi: 1, res: 4 },
        'Jamal Briggs': { agi: 2, res: 3 }, 'Takeshi Arada': { agi: 3, res: 2 }, 'Kaito Mishima': { agi: 4, res: 3 },
        'Kuga Shunji': { agi: 3, res: 4 }, 'Eitan Barak': { agi: 4, res: 3 }
    };
    const CHARACTERS_P2 = {
        'Ryu': { agi: 2, res: 3 }, 'Yobu': { agi: 2, res: 3 },
        'Nathan': { agi: 2, res: 3 }, 'Okami': { agi: 2, res: 3 }
    };

    // --- ÁUDIOS PRÉ-CARREGADOS ---
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

    // --- FUNÇÃO PARA RENDERIZAR A SELEÇÃO ---
    function renderCharacterSelection(playerType) {
        charListContainer.innerHTML = '';
        const charData = playerType === 'p1' ? CHARACTERS_P1 : CHARACTERS_P2;

        for (const name in charData) {
            const stats = charData[name];
            const card = document.createElement('div');
            card.className = 'char-card';
            card.dataset.name = name;
            card.dataset.img = `images/${name}.png`;
            
            card.innerHTML = `
                <img src="images/${name}.png" alt="${name}">
                <div class="char-name">${name}</div>
                <div class="char-stats">
                    <label>AGI: <input type="number" class="agi-input" value="${stats.agi}"></label>
                    <label>RES: <input type="number" class="res-input" value="${stats.res}"></label>
                </div>
            `;
            card.addEventListener('click', () => {
                document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
            });
            charListContainer.appendChild(card);
        }
    }

    // --- LÓGICA DO BOTÃO DE CONFIRMAÇÃO ---
    confirmBtn.addEventListener('click', () => {
        const selectedCard = document.querySelector('.char-card.selected');
        if (!selectedCard) {
            alert('Por favor, selecione um lutador!');
            return;
        }

        const playerData = {
            nome: selectedCard.dataset.name,
            img: selectedCard.dataset.img,
            agi: selectedCard.querySelector('.agi-input').value,
            res: selectedCard.querySelector('.res-input').value
        };

        confirmBtn.disabled = true;
        selectionScreen.classList.remove('active');

        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');

        if (roomId) { // Jogador 2 entrando
            socket.emit('joinGame', { roomId, player2Data: playerData });
            // O servidor responderá com 'gameUpdate' para iniciar a luta para ambos.
        } else { // Jogador 1 criando
            socket.emit('createGame', playerData);
            lobbyScreen.classList.add('active'); // Mostra a tela de lobby para P1.
        }
    });

    // --- LÓGICA DE INICIALIZAÇÃO ---
    const urlParams = new URLSearchParams(window.location.search);
    const roomIdFromUrl = urlParams.get('room');

    if (roomIdFromUrl) { // É o Jogador 2
        selectionTitle.innerText = 'Jogador 2: Selecione seu Lutador';
        confirmBtn.innerText = 'Entrar na Luta';
        renderCharacterSelection('p2');
    } else { // É o Jogador 1
        selectionTitle.innerText = 'Jogador 1: Selecione seu Lutador';
        confirmBtn.innerText = 'Criar Jogo';
        renderCharacterSelection('p1');
    }

    // --- OUVINTES DE EVENTOS DO SOCKET.IO ---

    socket.on('playSound', (soundType) => {
        playRandomSound(soundType);
    });

    socket.on('assignPlayer', (playerKey) => {
        myPlayerKey = playerKey;
        lobbyContent.innerHTML = `<p>Você é o <strong>Jogador ${myPlayerKey === 'player1' ? '1' : '2'}</strong>.</p>`;
        if (playerKey === 'player1') {
            controlsWrapper.classList.add('p1-controls');
        } else {
            controlsWrapper.classList.add('p2-controls');
        }
    });

    socket.on('roomCreated', (roomId) => {
        const url = `${window.location.origin}?room=${roomId}`;
        shareLink.textContent = url;
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
        
        // Atualiza as imagens dos lutadores na tela de luta
        if(gameState.fighters.player1) document.getElementById('player1-fight-img').src = gameState.fighters.player1.img;
        if(gameState.fighters.player2) document.getElementById('player2-fight-img').src = gameState.fighters.player2.img;
        
        updateUI(gameState);
        
        // Se a fase não é mais de espera, troca para a tela de luta
        if (gameState.phase !== 'waiting' && !fightScreen.classList.contains('active')) {
            lobbyScreen.classList.remove('active');
            selectionScreen.classList.remove('active');
            fightScreen.classList.add('active');
        }
    });

    socket.on('showModal', ({ title, text, btnText, action, targetPlayerKey }) => {
        if (!currentGameState) return;

        if (targetPlayerKey === myPlayerKey) {
            showInteractiveModal(title, text, btnText, action);
        } else {
            const activePlayerName = currentGameState.fighters[targetPlayerKey]?.nome || 'oponente';
            showInfoModal(title, `Aguardando ${activePlayerName} agir...`);
        }
    });

    socket.on('hideModal', () => {
        modal.classList.add('hidden');
    });

    socket.on('diceRoll', ({ playerKey, rollValue, diceType }) => {
        showDiceRollAnimation(playerKey, rollValue, diceType);
    });

    socket.on('opponentDisconnected', () => {
        showInfoModal("Oponente Desconectado", "Seu oponente saiu do jogo. A sala foi encerrada. Recarregue a página para jogar novamente.");
        document.querySelectorAll('button').forEach(btn => btn.disabled = true);
    });

    function updateUI(state) {
        for (const key of ['player1', 'player2']) {
            const fighter = state.fighters[key];
            if (!fighter) continue; // Pula se o lutador ainda não foi definido
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
            const fighterPA = (myPlayerKey && state.fighters[myPlayerKey]) ? state.fighters[myPlayerKey].pa : 0;
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

    function showDiceRollAnimation(playerKey, rollValue, diceType) {
        const diceOverlay = document.getElementById('dice-overlay');
        const diceContainer = document.getElementById(`${playerKey}-dice-result`);
        if (!diceOverlay || !diceContainer) { return; }
        
        // >>> CORREÇÃO DEFINITIVA DA LÓGICA DE NOMENCLATURA <<<
        const imagePrefix = (diceType === 'd3') 
            ? (playerKey === 'player1' ? 'D3A-' : 'D3P-') 
            : (playerKey === 'player1' ? 'diceA' : 'diceP');
        
        diceContainer.style.backgroundImage = `url('images/${imagePrefix}${rollValue}.png')`;
        
        diceOverlay.classList.remove('hidden');
        diceContainer.classList.remove('hidden');
        
        const hideAndResolve = () => {
            if (diceOverlay) diceOverlay.classList.add('hidden');
            if (diceContainer) diceContainer.classList.add('hidden');
        };
        
        diceOverlay.addEventListener('click', hideAndResolve, { once: true });
        setTimeout(hideAndResolve, 2000); 
    }

    document.querySelectorAll('#move-buttons .action-btn').forEach(btn => {
        btn.onclick = () => socket.emit('playerAction', { type: 'attack', move: btn.dataset.move, playerKey: myPlayerKey });
    });
    document.getElementById('end-turn-btn').onclick = () => socket.emit('playerAction', { type: 'end_turn', playerKey: myPlayerKey });
    document.getElementById('forfeit-btn').onclick = () => socket.emit('playerAction', { type: 'forfeit', playerKey: myPlayerKey });

    const scaleGame = () => { const w = document.getElementById('game-wrapper'); const s = Math.min(window.innerWidth / 1280, window.innerHeight / 720); w.style.transform = `scale(${s})`; w.style.left = `${(window.innerWidth - (1280 * s)) / 2}px`; w.style.top = `${(window.innerHeight - (720 * s)) / 2}px`; };
    scaleGame();
    window.addEventListener('resize', scaleGame);
});