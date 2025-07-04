document.addEventListener('DOMContentLoaded', () => {
    let myPlayerKey = null; // será 'player1', 'player2' ou 'spectator'
    let currentGameState = null;
    let currentRoomId = null;
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
    const shareLinkP2 = document.getElementById('share-link-p2');
    const shareLinkSpectator = document.getElementById('share-link-spectator');
    const copySpectatorLinkInGameBtn = document.getElementById('copy-spectator-link-ingame');
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
            
            const statsHtml = playerType === 'p1'
                ? `<div class="char-stats">
                    <label>AGI: <input type="number" class="agi-input" value="${stats.agi}"></label>
                    <label>RES: <input type="number" class="res-input" value="${stats.res}"></label>
                </div>`
                : `<div class="char-stats-display">
                    <span>AGI: ?</span> | <span>RES: ?</span>
                   </div>`;

            card.innerHTML = `
                <img src="images/${name}.png" alt="${name}">
                <div class="char-name">${name}</div>
                ${statsHtml}
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
        
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');
        
        let playerData = {
            nome: selectedCard.dataset.name,
            img: selectedCard.dataset.img,
        };

        confirmBtn.disabled = true;
        selectionScreen.classList.remove('active');

        if (roomId) {
            socket.emit('joinGame', { roomId, player2Data: playerData });
            lobbyScreen.classList.add('active');
            lobbyContent.innerHTML = `<p>Você escolheu <strong>${playerData.nome}</strong>.</p><p>Aguardando o Jogador 1 definir seus atributos...</p>`;
        } else {
            playerData.agi = selectedCard.querySelector('.agi-input').value;
            playerData.res = selectedCard.querySelector('.res-input').value;
            socket.emit('createGame', playerData);
            lobbyScreen.classList.add('active'); 
        }
    });

    // --- LÓGICA DE INICIALIZAÇÃO ---
    const urlParams = new URLSearchParams(window.location.search);
    const roomIdFromUrl = urlParams.get('room');
    const isSpectator = urlParams.get('spectate') === 'true';

    if (isSpectator && roomIdFromUrl) {
        // Lógica para Espectador
        selectionScreen.classList.remove('active');
        lobbyScreen.classList.add('active');
        lobbyContent.innerHTML = `<p>Entrando como espectador...</p>`;
        socket.emit('spectateGame', roomIdFromUrl);
    } else if (roomIdFromUrl) {
        // Lógica para Jogador 2
        selectionTitle.innerText = 'Jogador 2: Selecione seu Lutador';
        confirmBtn.innerText = 'Entrar na Luta';
        renderCharacterSelection('p2');
    } else {
        // Lógica para Jogador 1
        selectionTitle.innerText = 'Jogador 1: Selecione seu Lutador';
        confirmBtn.innerText = 'Criar Jogo';
        renderCharacterSelection('p1');
    }

    // --- OUVINTES DE EVENTOS DO SOCKET.IO ---

    socket.on('playSound', (soundType) => {
        playRandomSound(soundType);
    });

    socket.on('triggerAttackAnimation', ({ attackerKey }) => {
        const attackerImg = document.getElementById(`${attackerKey}-fight-img`);
        if (attackerImg) {
            const animationClass = `is-attacking-${attackerKey}`;
            attackerImg.classList.add(animationClass);
            setTimeout(() => {
                attackerImg.classList.remove(animationClass);
            }, 400); 
        }
    });

    socket.on('triggerHitAnimation', ({ defenderKey }) => {
        const defenderImg = document.getElementById(`${defenderKey}-fight-img`);
        if (defenderImg) {
            defenderImg.classList.add('is-hit');
            setTimeout(() => {
                defenderImg.classList.remove('is-hit');
            }, 500);
        }
    });

    socket.on('assignPlayer', (playerKey) => {
        myPlayerKey = playerKey;
        if (playerKey === 'spectator') {
            lobbyContent.innerHTML = `<p>Você está <strong>assistindo</strong> a partida.</p>`;
        } else {
            lobbyContent.innerHTML = `<p>Você é o <strong>Jogador ${myPlayerKey === 'player1' ? '1' : '2'}</strong>.</p>`;
        }
    });

    socket.on('roomCreated', (roomId) => {
        currentRoomId = roomId;
        const p2Url = `${window.location.origin}?room=${roomId}`;
        const specUrl = `${window.location.origin}?room=${roomId}&spectate=true`;

        shareLinkP2.textContent = p2Url;
        shareLinkSpectator.textContent = specUrl;

        shareContainer.classList.remove('hidden');
        shareLinkP2.onclick = () => copyToClipboard(p2Url, shareLinkP2);
        shareLinkSpectator.onclick = () => copyToClipboard(specUrl, shareLinkSpectator);
    });
    
    function copyToClipboard(text, element) {
        navigator.clipboard.writeText(text).then(() => {
            const originalText = element.textContent;
            element.textContent = 'Copiado!';
            setTimeout(() => { element.textContent = originalText; }, 2000);
        });
    }

    copySpectatorLinkInGameBtn.onclick = () => {
        const specUrl = `${window.location.origin}?room=${currentRoomId}&spectate=true`;
        copyToClipboard(specUrl, copySpectatorLinkInGameBtn);
    };

    socket.on('gameUpdate', (gameState) => {
        currentGameState = gameState;
        
        if(gameState.fighters.player1) document.getElementById('player1-fight-img').src = gameState.fighters.player1.img;
        if(gameState.fighters.player2) document.getElementById('player2-fight-img').src = gameState.fighters.player2.img;
        else if (gameState.pendingP2Choice) document.getElementById('player2-fight-img').src = gameState.pendingP2Choice.img;
        
        updateUI(gameState);
        
        if (gameState.phase !== 'waiting' && gameState.phase !== 'p2_stat_assignment' && !fightScreen.classList.contains('active')) {
            lobbyScreen.classList.remove('active');
            selectionScreen.classList.remove('active');
            fightScreen.classList.add('active');
            if (myPlayerKey !== 'spectator') {
                copySpectatorLinkInGameBtn.classList.remove('hidden');
            }
        }
    });

    socket.on('promptRoll', ({ targetPlayerKey, text, action }) => {
        const btn = document.getElementById(`${targetPlayerKey}-roll-btn`);
        btn.innerText = text;

        if (myPlayerKey === targetPlayerKey) {
            btn.onclick = () => {
                socket.emit('playerAction', action);
                btn.classList.add('hidden');
            };
            btn.disabled = false;
        } else {
            btn.onclick = null;
            btn.disabled = true;
        }
        btn.classList.remove('hidden');
    });

    socket.on('hideRollButtons', () => {
        document.getElementById('player1-roll-btn').classList.add('hidden');
        document.getElementById('player2-roll-btn').classList.add('hidden');
    });

    socket.on('showModal', (payload) => {
        if (!currentGameState) return;

        const { title, text, btnText, action, targetPlayerKey, modalType } = payload;
        
        if (modalType === 'gameover') {
            showInfoModal(title, text);
            return;
        }

        if (targetPlayerKey === myPlayerKey) {
            showInteractiveModal(title, text, btnText, action);
        } else {
            const activePlayerName = currentGameState.fighters[targetPlayerKey]?.nome || 'oponente';
            if (modalType === 'knockdown') {
                showInfoModal(`${activePlayerName} caiu!`, "Aguarde a contagem...");
            }
        }
    });
    
    socket.on('promptP2Stats', (p2data) => {
        const modalContentHtml = `
            <p>O Jogador 2 escolheu <strong>${p2data.nome}</strong>.</p>
            <img src="${p2data.img}" alt="${p2data.nome}" style="width: 80px; height: 80px; border-radius: 50%; background: #555; margin: 10px auto; display: block;">
            <p>Defina os atributos dele:</p>
            <div style="display: flex; justify-content: center; gap: 20px; color: #fff; padding: 10px 0;">
                <label>AGI: <input type="number" id="p2-stat-agi" value="2" style="width: 50px; text-align: center; font-size: 1.1em; background: #555; color: #fff; border: 1px solid #777; border-radius: 4px;"></label>
                <label>RES: <input type="number" id="p2-stat-res" value="2" style="width: 50px; text-align: center; font-size: 1.1em; background: #555; color: #fff; border: 1px solid #777; border-radius: 4px;"></label>
            </div>
        `;
    
        showInteractiveModal("Definir Atributos do Oponente", modalContentHtml, "Confirmar Atributos", null);
        
        modalButton.onclick = () => {
            const agi = document.getElementById('p2-stat-agi').value;
            const res = document.getElementById('p2-stat-res').value;
    
            if (!agi || !res || isNaN(agi) || isNaN(res) || agi < 1 || res < 1) {
                alert("Por favor, insira valores numéricos válidos (mínimo 1) para AGI e RES.");
                return;
            }
            
            const action = {
                type: 'set_p2_stats',
                playerKey: myPlayerKey,
                stats: { agi, res }
            };
            socket.emit('playerAction', action);
            
            modal.classList.add('hidden');
        };
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
            if (!fighter) {
                document.getElementById(`${key}-fight-name`).innerText = `Jogador ${key === 'player1' ? 1 : 2}`;
                document.getElementById(`${key}-hp-text`).innerText = `- / -`;
                document.getElementById(`${key}-hp-bar`).style.width = `100%`;
                document.getElementById(`${key}-def-text`).innerText = `0`;
                document.getElementById(`${key}-hits`).innerText = `0`;
                document.getElementById(`${key}-pa-dots`).innerHTML = '';
                continue;
            };
            document.getElementById(`${key}-fight-name`).innerText = fighter.nome;
            document.getElementById(`${key}-hp-text`).innerText = `${fighter.hp} / ${fighter.hpMax}`;
            document.getElementById(`${key}-hp-bar`).style.width = `${(fighter.hp / fighter.hpMax) * 100}%`;
            document.getElementById(`${key}-def-text`).innerText = fighter.def;
            document.getElementById(`${key}-hits`).innerText = fighter.hitsLanded;
            const paContainer = document.getElementById(`${key}-pa-dots`);
            paContainer.innerHTML = '';
            for (let i = 0; i < fighter.pa; i++) paContainer.innerHTML += '<div class="pa-dot"></div>';
        }

        const roundInfoEl = document.getElementById('round-info');
        if (state.phase === 'gameover') {
            roundInfoEl.innerHTML = `<span class="turn-highlight">FIM DE JOGO!</span>`;
        } else {
            const turnName = state.whoseTurn ? state.fighters[state.whoseTurn].nome : (state.phase.includes('initiative') || state.phase.includes('defense') ? 'Rolando dados...' : '...');
            roundInfoEl.innerHTML = `ROUND ${state.currentRound} - RODADA ${state.currentTurn} - Vez de: <span class="turn-highlight">${turnName}</span>`;
        }
        
        document.getElementById('player1-area').classList.toggle('active-turn', state.whoseTurn === 'player1');
        document.getElementById('player2-area').classList.toggle('active-turn', state.whoseTurn === 'player2');
        
        // Lógica de habilitar/desabilitar botões
        const isMyTurn = state.whoseTurn === myPlayerKey && state.phase === 'turn';
        const isSpectator = myPlayerKey === 'spectator';
        const isGameOver = state.phase === 'gameover';

        document.querySelectorAll('#move-buttons .action-btn').forEach(btn => {
            const move = state.moves[btn.dataset.move];
            const fighterPA = (myPlayerKey && state.fighters[myPlayerKey]) ? state.fighters[myPlayerKey]?.pa : 0;
            const playerControlsId = state.whoseTurn === 'player1' ? 'p1-controls' : 'p2-controls';

            if (isSpectator) {
                controlsWrapper.className = `p1-controls p2-controls`; // Mostra ambas as cores
                btn.disabled = true; // Sempre desabilitado para espectador
            } else {
                btn.disabled = !isMyTurn || !move || move.cost > fighterPA || isGameOver;
                controlsWrapper.className = myPlayerKey === 'player1' ? 'p1-controls' : 'p2-controls';
            }
        });

        document.getElementById('end-turn-btn').disabled = !isMyTurn || isGameOver;
        document.getElementById('forfeit-btn').disabled = isGameOver || isSpectator;
        
        // Espectadores veem os botões de ambos os jogadores
        if (isSpectator) {
            document.getElementById('player1-area').classList.add('p1-controls');
            document.getElementById('player2-area').classList.add('p2-controls');
            // Mostra os botões do jogador da vez para o espectador
            document.getElementById('action-buttons-wrapper').classList.remove('p1-controls', 'p2-controls');
            if (state.whoseTurn) {
                document.getElementById('action-buttons-wrapper').classList.add(`${state.whoseTurn}-controls`);
            }
        }

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
        
        if (action) {
            modalButton.onclick = () => {
                modalButton.disabled = true;
                modalButton.innerText = "Aguarde...";
                socket.emit('playerAction', action);
            };
        }
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
        diceOverlay.classList.remove('hidden');
        const imagePrefix = (diceType === 'd3') ? (playerKey === 'player1' ? 'D3P-' : 'D3A-') : (playerKey === 'player1' ? 'diceP' : 'diceA');
        const diceContainer = document.getElementById(`${playerKey}-dice-result`);
        if (diceContainer) {
            diceContainer.style.backgroundImage = `url('images/${imagePrefix}${rollValue}.png')`;
            diceContainer.classList.remove('hidden');
        }
        const hideAndResolve = () => {
            if (diceOverlay) diceOverlay.classList.add('hidden');
            if (diceContainer) diceContainer.classList.add('hidden');
        };
        if (diceOverlay) diceOverlay.addEventListener('click', hideAndResolve, { once: true });
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