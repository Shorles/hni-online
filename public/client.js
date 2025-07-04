document.addEventListener('DOMContentLoaded', () => {
    let myPlayerKey = null;
    let currentGameState = null;
    const socket = io();

    // *** DEFINIÇÕES DE SOM ***
    const JAB_SOUNDS = ['sons/jab01.mp3', 'sons/jab02.mp3', 'sons/jab03.mp3'];
    const STRONG_SOUNDS = ['sons/baseforte01.mp3', 'sons/baseforte02.mp3'];
    const DICE_SOUNDS = ['sons/dice1.mp3', 'sons/dice2.mp3', 'sons/dice3.mp3'];
    const CRITICAL_SOUND = 'sons/Critical.mp3';

    // *** FUNÇÃO HELPER PARA TOCAR SONS ***
    function playSound(src) {
        const sound = new Audio(src);
        sound.play();
    }
    function playRandomSound(soundArray) {
        const randomIndex = Math.floor(Math.random() * soundArray.length);
        playSound(soundArray[randomIndex]);
    }

    // --- MANIPULADORES DE DOM (ELEMENTOS DA PÁGINA) ---
    const lobbyScreen = document.getElementById('lobby-screen');
    const fightScreen = document.getElementById('fight-screen');
    // ... (resto das definições de DOM) ...
    const controlsWrapper = document.getElementById('action-buttons-wrapper'); 

    // ===================================================================
    // 1. OUVINTES DE EVENTOS DO SERVIDOR
    // ===================================================================

    // *** NOVO OUVINTE CENTRAL DE SONS ***
    socket.on('playSound', (soundType) => {
        switch (soundType) {
            case 'dice':
                playRandomSound(DICE_SOUNDS);
                break;
            case 'jab':
                playRandomSound(JAB_SOUNDS);
                break;
            case 'strong':
                playRandomSound(STRONG_SOUNDS);
                break;
            case 'critical':
                playSound(CRITICAL_SOUND);
                break;
        }
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
    
    // ... (resto dos ouvintes: roomCreated, gameUpdate, showModal, hideModal, etc.) ...
    
    socket.on('diceRoll', ({ playerKey, rollValue, diceType }) => {
        // A animação visual continua, mas o som foi desacoplado.
        showDiceRollAnimation(playerKey, rollValue, diceType);
    });
    
    // ... (resto do arquivo, incluindo updateUI, modals, etc.) ...

    // Na função showDiceRollAnimation, REMOVA a linha que toca o som, se houver
    function showDiceRollAnimation(playerKey, rollValue, diceType) {
        const diceOverlay = document.getElementById('dice-overlay');
        diceOverlay.classList.remove('hidden');
        
        // A linha de som que existia aqui antes foi removida.
        // playSound(DICE_SOUNDS[Math.floor(Math.random() * DICE_SOUNDS.length)]); // <-- REMOVER ESTA LINHA

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

    // ... (resto do seu client.js) ...
});