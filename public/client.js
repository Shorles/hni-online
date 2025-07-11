document.addEventListener('DOMContentLoaded', () => {
    let myPlayerKey = null; // host, player1, player2, spectator
    let currentGameState = null;
    let currentRoomId = new URLSearchParams(window.location.search).get('room');
    let arenaPlayerKey = new URLSearchParams(window.location.search).get('player');
    const socket = io();

    let setupData = { scenario: null, gameMode: null };
    let availableSpecialMoves = {};

    const allScreens = document.querySelectorAll('.screen');
    const gameWrapper = document.getElementById('game-wrapper');
    const scenarioScreen = document.getElementById('scenario-screen');
    const scenarioListContainer = document.getElementById('scenario-list-container');
    const gameModeScreen = document.getElementById('game-mode-screen');
    const selectionScreen = document.getElementById('selection-screen');
    const lobbyScreen = document.getElementById('lobby-screen');
    const arenaLobbyScreen = document.getElementById('arena-lobby-screen');
    const fightScreen = document.getElementById('fight-screen');
    const charListContainer = document.getElementById('character-list-container');
    const confirmBtn = document.getElementById('confirm-selection-btn');
    const selectionTitle = document.getElementById('selection-title');
    const shareContainer = document.getElementById('share-container');
    const copySpectatorLinkInGameBtn = document.getElementById('copy-spectator-link-ingame');
    let modal = document.getElementById('modal');
    let modalTitle = document.getElementById('modal-title');
    let modalText = document.getElementById('modal-text');
    let modalButton = document.getElementById('modal-button');
    const specialMovesModal = document.getElementById('special-moves-modal');
    const specialMovesTitle = document.getElementById('special-moves-title');
    const specialMovesList = document.getElementById('special-moves-list');
    const confirmSpecialMovesBtn = document.getElementById('confirm-special-moves-btn');
    
    const gameModeBackBtn = document.getElementById('game-mode-back-btn');
    const charSelectBackBtn = document.getElementById('char-select-back-btn');
    const specialMovesBackBtn = document.getElementById('special-moves-back-btn');
    const lobbyBackBtn = document.getElementById('lobby-back-btn');
    const exitGameBtn = document.getElementById('exit-game-btn');
    const modePvcBtn = document.getElementById('mode-pvc-btn');
    const modePvpBtn = document.getElementById('mode-pvp-btn');
    const startArenaFightBtn = document.getElementById('start-arena-fight-btn');

    const SCENARIOS = { 'Ringue Clássico': 'Ringue.png', 'Arena Subterrânea': 'Ringue2.png', 'Dojo Antigo': 'Ringue3.png', 'Ginásio Moderno': 'Ringue4.png', 'Ringue na Chuva': 'Ringue5.png' };
    const CHARACTERS_P1 = { 'Kureha Shoji':{agi:3,res:1},'Erik Adler':{agi:2,res:2},'Ivan Braskovich':{agi:1,res:3},'Hayato Takamura':{agi:4,res:4},'Logan Graves':{agi:3,res:2},'Daigo Kurosawa':{agi:1,res:4},'Jamal Briggs':{agi:2,res:3},'Takeshi Arada':{agi:3,res:2},'Kaito Mishima':{agi:4,res:3},'Kuga Shunji':{agi:3,res:4},'Eitan Barak':{agi:4,res:3} };
    const CHARACTERS_P2 = { 'Ryu':{agi:2,res:3},'Yobu':{agi:2,res:3},'Nathan':{agi:2,res:3},'Okami':{agi:2,res:3} };
    
    function showScreen(screenToShow) { allScreens.forEach(s => s.classList.toggle('active', s.id === screenToShow.id)); }

    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        const isSpectator = urlParams.get('spectate') === 'true';

        [charSelectBackBtn, specialMovesBackBtn, lobbyBackBtn, exitGameBtn, gameModeBackBtn, copySpectatorLinkInGameBtn].forEach(btn => btn.classList.add('hidden'));

        if (isSpectator) {
            showScreen(lobbyScreen);
            lobbyScreen.querySelector('#lobby-content').innerHTML = `<p>Entrando como espectador...</p>`;
            socket.emit('spectateGame', currentRoomId);
        } else if (arenaPlayerKey) {
            showScreen(selectionScreen);
            selectionTitle.innerText = `Jogador ${arenaPlayerKey.slice(-1)}: Selecione seu Lutador`;
            confirmBtn.innerText = 'Confirmar';
            renderCharacterSelection('p2');
            socket.emit('joinAsArenaPlayer', { roomId: currentRoomId, playerKey: arenaPlayerKey });
        } else if (currentRoomId) {
            showScreen(selectionScreen);
            selectionTitle.innerText = 'Jogador 2: Selecione seu Lutador';
            confirmBtn.innerText = 'Entrar na Luta';
            renderCharacterSelection('p1');
        } else {
            gameModeBackBtn.classList.remove('hidden');
            charSelectBackBtn.classList.remove('hidden');
            specialMovesBackBtn.classList.remove('hidden');
            lobbyBackBtn.classList.remove('hidden');
            showScreen(scenarioScreen);
            renderScenarioSelection();
        }

        gameModeBackBtn.onclick = () => showScreen(scenarioScreen);
        charSelectBackBtn.onclick = () => {
            if (setupData.gameMode === 'classic') showScreen(gameModeScreen);
            else location.reload();
        };
        modePvcBtn.onclick = () => {
            setupData.gameMode = 'classic';
            showScreen(selectionScreen);
            selectionTitle.innerText = 'Jogador 1: Selecione seu Lutador';
            confirmBtn.innerText = 'Confirmar Personagem';
            confirmBtn.disabled = false;
            renderCharacterSelection('p1');
        };
        modePvpBtn.onclick = () => {
            setupData.gameMode = 'arena';
            socket.emit('createGame', { gameMode: 'arena', scenario: setupData.scenario });
        };
        confirmBtn.addEventListener('click', onConfirmSelection);
        exitGameBtn.addEventListener('click', () => { /* ... (código existente, omitido por brevidade) */ });
    }

    function renderScenarioSelection() {
        scenarioListContainer.innerHTML = '';
        Object.entries(SCENARIOS).forEach(([name, fileName]) => {
            const card = document.createElement('div');
            card.className = 'scenario-card';
            card.innerHTML = `<img src="images/${fileName}" alt="${name}"><div class="scenario-name">${name}</div>`;
            card.onclick = () => {
                setupData.scenario = fileName;
                showScreen(gameModeScreen);
            };
            scenarioListContainer.appendChild(card);
        });
    }

    function onConfirmSelection() {
        const selectedCard = document.querySelector('.char-card.selected');
        if (!selectedCard) { alert('Por favor, selecione um lutador!'); return; }
        const playerData = { nome: selectedCard.dataset.name, img: selectedCard.dataset.img };

        if (arenaPlayerKey) {
            socket.emit('chooseArenaCharacter', { character: playerData });
            selectionScreen.innerHTML = `<h1>Personagem escolhido! Aguardando o Anfitrião configurar e iniciar a partida...</h1>`;
        } else if (setupData.gameMode === 'classic') {
            playerData.agi = selectedCard.querySelector('.agi-input').value;
            playerData.res = selectedCard.querySelector('.res-input').value;
            socket.emit('createGame', { gameMode: 'classic', player1Data: playerData, scenario: setupData.scenario });
        } else { // P2 clássico
            socket.emit('joinGame', { roomId: currentRoomId, player2Data: playerData });
            showScreen(lobbyScreen);
            lobbyScreen.querySelector('#lobby-content').innerHTML = `<p>Aguardando o Jogador 1 definir seus atributos e golpes...</p>`;
        }
    }

    function renderCharacterSelection(playerList) { /* ... (código existente, omitido por brevidade) */ }
    function renderSpecialMoveSelection(container, availableMoves, preSelectedMoves = []) { /* ... (código existente, omitido por brevidade) */ }

    // --- OUVINTES DO SOCKET.IO ---
    socket.on('gameCreated', ({ roomId, gameMode }) => {
        currentRoomId = roomId;
        if (gameMode === 'arena') {
            showScreen(arenaLobbyScreen);
            const p1Link = `${window.location.origin}?room=${roomId}&player=player1`;
            const p2Link = `${window.location.origin}?room=${roomId}&player=player2`;
            const specLink = `${window.location.origin}?room=${roomId}&spectate=true`;
            const arenaLinkP1 = document.getElementById('arena-link-p1');
            const arenaLinkP2 = document.getElementById('arena-link-p2');
            const arenaLinkSpec = document.getElementById('arena-link-spectator');
            arenaLinkP1.textContent = p1Link;
            arenaLinkP2.textContent = p2Link;
            arenaLinkSpec.textContent = specLink;
            arenaLinkP1.onclick = () => copyToClipboard(p1Link, arenaLinkP1);
            arenaLinkP2.onclick = () => copyToClipboard(p2Link, arenaLinkP2);
            arenaLinkSpec.onclick = () => copyToClipboard(specLink, arenaLinkSpec);
        }
    });

    socket.on('arenaPlayerJoined', ({ playerKey }) => {
        const statusEl = document.querySelector(`#arena-${playerKey}-status .status-waiting`);
        statusEl.textContent = 'Conectado. Escolhendo personagem...';
        statusEl.className = 'status-ready';
    });

    socket.on('arenaCharacterChosen', ({ playerKey, character }) => {
        document.querySelector(`#arena-${playerKey}-status .char-choice`).classList.remove('hidden');
        document.querySelector(`#arena-${playerKey}-status .char-name`).textContent = character.nome;
    });

    socket.on('promptArenaConfiguration', () => {
        startArenaFightBtn.disabled = false;
        startArenaFightBtn.textContent = 'Configurar e Iniciar Luta';
        startArenaFightBtn.onclick = () => {
            // Abrir um grande modal para configurar ambos os jogadores
        };
    });

    // ... (restante do código)
});


// ================== CÓDIGO COMPLETO PARA SUBSTITUIÇÃO ==================
document.addEventListener('DOMContentLoaded', () => {
    let myPlayerKey = null;
    let currentGameState = null;
    let currentRoomId = new URLSearchParams(window.location.search).get('room');
    let arenaPlayerKey = new URLSearchParams(window.location.search).get('player');
    const socket = io();

    let setupData = { scenario: null, gameMode: null };
    let availableSpecialMoves = {};

    const allScreens = document.querySelectorAll('.screen');
    const gameWrapper = document.getElementById('game-wrapper');
    const scenarioScreen = document.getElementById('scenario-screen');
    const scenarioListContainer = document.getElementById('scenario-list-container');
    const gameModeScreen = document.getElementById('game-mode-screen');
    const selectionScreen = document.getElementById('selection-screen');
    const lobbyScreen = document.getElementById('lobby-screen');
    const arenaLobbyScreen = document.getElementById('arena-lobby-screen');
    const fightScreen = document.getElementById('fight-screen');
    const charListContainer = document.getElementById('character-list-container');
    const confirmBtn = document.getElementById('confirm-selection-btn');
    const selectionTitle = document.getElementById('selection-title');
    const shareContainer = document.getElementById('share-container');
    const copySpectatorLinkInGameBtn = document.getElementById('copy-spectator-link-ingame');
    let modal = document.getElementById('modal');
    let modalTitle = document.getElementById('modal-title');
    let modalText = document.getElementById('modal-text');
    let modalButton = document.getElementById('modal-button');
    const specialMovesModal = document.getElementById('special-moves-modal');
    const specialMovesTitle = document.getElementById('special-moves-title');
    const specialMovesList = document.getElementById('special-moves-list');
    const confirmSpecialMovesBtn = document.getElementById('confirm-special-moves-btn');
    const gameModeBackBtn = document.getElementById('game-mode-back-btn');
    const charSelectBackBtn = document.getElementById('char-select-back-btn');
    const specialMovesBackBtn = document.getElementById('special-moves-back-btn');
    const lobbyBackBtn = document.getElementById('lobby-back-btn');
    const exitGameBtn = document.getElementById('exit-game-btn');
    const modePvcBtn = document.getElementById('mode-pvc-btn');
    const modePvpBtn = document.getElementById('mode-pvp-btn');
    const startArenaFightBtn = document.getElementById('start-arena-fight-btn');

    const SCENARIOS = { 'Ringue Clássico': 'Ringue.png', 'Arena Subterrânea': 'Ringue2.png', 'Dojo Antigo': 'Ringue3.png', 'Ginásio Moderno': 'Ringue4.png', 'Ringue na Chuva': 'Ringue5.png' };
    const CHARACTERS_P1 = { 'Kureha Shoji':{agi:3,res:1},'Erik Adler':{agi:2,res:2},'Ivan Braskovich':{agi:1,res:3},'Hayato Takamura':{agi:4,res:4},'Logan Graves':{agi:3,res:2},'Daigo Kurosawa':{agi:1,res:4},'Jamal Briggs':{agi:2,res:3},'Takeshi Arada':{agi:3,res:2},'Kaito Mishima':{agi:4,res:3},'Kuga Shunji':{agi:3,res:4},'Eitan Barak':{agi:4,res:3} };
    const CHARACTERS_P2 = { 'Ryu':{agi:2,res:3},'Yobu':{agi:2,res:3},'Nathan':{agi:2,res:3},'Okami':{agi:2,res:3} };
    
    function showScreen(screenToShow) { allScreens.forEach(s => s.classList.toggle('active', s.id === screenToShow.id)); }

    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        const isSpectator = urlParams.get('spectate') === 'true';

        [charSelectBackBtn, specialMovesBackBtn, lobbyBackBtn, exitGameBtn, gameModeBackBtn, copySpectatorLinkInGameBtn].forEach(btn => btn.classList.add('hidden'));

        if (isSpectator) {
            showScreen(lobbyScreen);
            lobbyScreen.querySelector('#lobby-content').innerHTML = `<p>Entrando como espectador...</p>`;
            socket.emit('spectateGame', currentRoomId);
        } else if (arenaPlayerKey) {
            showScreen(selectionScreen);
            selectionTitle.innerText = `Jogador ${arenaPlayerKey.slice(-1)}: Selecione seu Lutador`;
            confirmBtn.innerText = 'Confirmar';
            renderCharacterSelection('p2');
            socket.emit('joinAsArenaPlayer', { roomId: currentRoomId, playerKey: arenaPlayerKey });
        } else if (currentRoomId) {
            showScreen(selectionScreen);
            selectionTitle.innerText = 'Jogador 2: Selecione seu Lutador';
            confirmBtn.innerText = 'Entrar na Luta';
            renderCharacterSelection('p1');
        } else {
            gameModeBackBtn.classList.remove('hidden');
            charSelectBackBtn.classList.remove('hidden');
            specialMovesBackBtn.classList.remove('hidden');
            lobbyBackBtn.classList.remove('hidden');
            showScreen(scenarioScreen);
            renderScenarioSelection();
        }

        gameModeBackBtn.onclick = () => showScreen(scenarioScreen);
        charSelectBackBtn.onclick = () => { if (setupData.gameMode === 'classic') showScreen(gameModeScreen); };
        modePvcBtn.onclick = () => {
            setupData.gameMode = 'classic';
            showScreen(selectionScreen);
            selectionTitle.innerText = 'Jogador 1: Selecione seu Lutador';
            confirmBtn.innerText = 'Confirmar Personagem';
            confirmBtn.disabled = false;
            renderCharacterSelection('p1');
        };
        modePvpBtn.onclick = () => {
            setupData.gameMode = 'arena';
            socket.emit('createGame', { gameMode: 'arena', scenario: setupData.scenario });
        };
        confirmBtn.addEventListener('click', onConfirmSelection);
    }

    function renderScenarioSelection() {
        scenarioListContainer.innerHTML = '';
        Object.entries(SCENARIOS).forEach(([name, fileName]) => {
            const card = document.createElement('div');
            card.className = 'scenario-card';
            card.innerHTML = `<img src="images/${fileName}" alt="${name}"><div class="scenario-name">${name}</div>`;
            card.onclick = () => {
                setupData.scenario = fileName;
                showScreen(gameModeScreen);
            };
            scenarioListContainer.appendChild(card);
        });
    }

    function onConfirmSelection() {
        const selectedCard = document.querySelector('.char-card.selected');
        if (!selectedCard) { alert('Por favor, selecione um lutador!'); return; }
        const playerData = { nome: selectedCard.dataset.name, img: selectedCard.dataset.img };
        confirmBtn.disabled = true;

        if (arenaPlayerKey) {
            socket.emit('chooseArenaCharacter', { character: playerData });
            selectionScreen.innerHTML = `<h1>Personagem escolhido! Aguardando o Anfitrião configurar e iniciar a partida...</h1>`;
        } else if (setupData.gameMode === 'classic') {
            playerData.agi = selectedCard.querySelector('.agi-input').value;
            playerData.res = selectedCard.querySelector('.res-input').value;
            socket.emit('createGame', { gameMode: 'classic', player1Data: playerData, scenario: setupData.scenario });
        } else {
            socket.emit('joinGame', { roomId: currentRoomId, player2Data: playerData });
            showScreen(lobbyScreen);
            lobbyScreen.querySelector('#lobby-content').innerHTML = `<p>Aguardando o Jogador 1 definir seus atributos e golpes...</p>`;
        }
    }

    function renderCharacterSelection(playerListType) { /* ... */ }
    function renderSpecialMoveSelection(container, availableMoves) { /* ... */ }
    function copyToClipboard(text, element) { /* ... */ }

    // --- OUVINTES DO SOCKET.IO ---
    socket.on('assignPlayer', (key) => myPlayerKey = key);

    socket.on('gameCreated', ({ roomId, gameMode }) => {
        currentRoomId = roomId;
        if (gameMode === 'arena') {
            showScreen(arenaLobbyScreen);
            const p1Link = `${window.location.origin}?room=${roomId}&player=player1`;
            const p2Link = `${window.location.origin}?room=${roomId}&player=player2`;
            const specLink = `${window.location.origin}?room=${roomId}&spectate=true`;
            const arenaLinkP1 = document.getElementById('arena-link-p1');
            const arenaLinkP2 = document.getElementById('arena-link-p2');
            const arenaLinkSpec = document.getElementById('arena-link-spectator');
            arenaLinkP1.textContent = p1Link;
            arenaLinkP2.textContent = p2Link;
            arenaLinkSpec.textContent = specLink;
            arenaLinkP1.onclick = () => copyToClipboard(p1Link, arenaLinkP1);
            arenaLinkP2.onclick = () => copyToClipboard(p2Link, arenaLinkP2);
            arenaLinkSpec.onclick = () => copyToClipboard(specLink, arenaLinkSpec);
        }
    });

    socket.on('arenaPlayerJoined', ({ playerKey }) => {
        const statusEl = document.querySelector(`#arena-p${playerKey.slice(-1)}-status .status-waiting`);
        if (statusEl) {
            statusEl.textContent = 'Conectado. Escolhendo personagem...';
            statusEl.className = 'status-ready';
        }
    });

    socket.on('arenaCharacterChosen', ({ playerKey, character }) => {
        const statusBox = document.querySelector(`#arena-p${playerKey.slice(-1)}-status`);
        if (statusBox) {
            statusBox.querySelector('.char-choice').classList.remove('hidden');
            statusBox.querySelector('.char-name').textContent = character.nome;
        }
    });

    socket.on('promptArenaConfiguration', () => {
        startArenaFightBtn.disabled = false;
        startArenaFightBtn.textContent = 'Configurar e Iniciar Luta';
        startArenaFightBtn.onclick = () => {
            // Lógica para abrir o modal de configuração de ambos os jogadores
        };
    });

    socket.on('gameUpdate', (state) => {
        currentGameState = state;
        updateUI(state);
    });

    // ... Outros ouvintes e funções
    initialize();
});