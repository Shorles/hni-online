// client.js

document.addEventListener('DOMContentLoaded', () => {
    // --- CONSTANTES DE REGRAS DO JOGO (ALMARA RPG) ---
    const GAME_RULES = {
        races: {
            "Anjo": { bon: {}, pen: { forca: -1 }, text: "Não podem usar elemento Escuridão. Obrigatoriamente começam com 1 ponto em Luz. Recebem +1 em magias de cura." },
            "Demônio": { bon: {}, pen: {}, text: "Não podem usar elemento Luz. Obrigatoriamente começam com 1 ponto em Escuridão. Recebem +1 em dano de magias de Escuridão. Cura recebida é reduzida em 1." },
            "Elfo": { bon: { agilidade: 2 }, pen: { forca: -1 }, text: "Enxergam no escuro (exceto escuridão mágica)." },
            "Anão": { bon: { constituicao: 1 }, pen: {}, text: "Enxergam no escuro (exceto escuridão mágica)." },
            "Goblin": { bon: { mente: 1 }, pen: { constituicao: -1 }, text: "Não podem utilizar armas do tipo Gigante e Colossal." },
            "Orc": { bon: { forca: 2 }, pen: { inteligencia: -1 }, text: "Podem comer quase qualquer coisa sem adoecerem." },
            "Humano": { bon: { escolha: 1 }, pen: {}, text: "Recebem +1 ponto de atributo básico para distribuir." },
            "Kairou": { bon: {}, pen: {}, text: "Respiram debaixo d'água. Devem umedecer a pele a cada dia. +1 em todos os atributos se lutarem na água." },
            "Centauro": { bon: {}, pen: { agilidade: -1 }, text: "Não podem entrar em locais apertados ou subir escadas de mão. +3 em testes de velocidade/salto." },
            "Halfling": { bon: { agilidade: 1, inteligencia: 1 }, pen: { forca: -1, constituicao: -1 }, text: "Não podem usar armas Gigante/Colossal. Enxergam no escuro." },
            "Tritão": { bon: { forca: 2 }, pen: { inteligencia: -2 }, text: "Respiram debaixo d'água. Devem umedecer a pele a cada 5 dias." },
            "Meio-Elfo": { bon: { agilidade: 1 }, pen: {}, text: "Enxergam no escuro (exceto escuridão mágica)." },
            "Meio-Orc": { bon: { forca: 1 }, pen: {}, text: "Nenhuma característica única." },
            "Auslender": { bon: { inteligencia: 2, agilidade: 1 }, pen: { forca: -1, protecao: -1 }, text: "Não precisam de testes para usar artefatos tecnológicos." },
            "Tulku": { bon: { inteligencia: 1, mente: 1 }, pen: {}, text: "Recebem -1 para usar magias de Luz. Enxergam no escuro." },
        },
        weapons: {
            "Desarmado": { cost: 0, damage: "1D4", hand: 1, bta: 0, btd: 0, ambi_bta_mod: 0, ambi_btd_mod: 0 },
            "1 Mão Mínima": { cost: 60, damage: "1D6", hand: 1, bta: 4, btd: -1, ambi_bta_mod: 0, ambi_btd_mod: -1 },
            "1 Mão Leve": { cost: 80, damage: "1D6", hand: 1, bta: 3, btd: 0, ambi_bta_mod: 0, ambi_btd_mod: -1 },
            "1 Mão Mediana": { cost: 100, damage: "1D6", hand: 1, bta: 1, btd: 1, ambi_bta_mod: 0, ambi_btd_mod: -1 },
            "Cetro": { cost: 80, damage: "1D4", hand: 1, bta: 1, btd: 0, btm: 1, ambi_bta_mod: 0, ambi_btd_mod: -1 },
            "2 Mãos Pesada": { cost: 120, damage: "1D10", hand: 2, bta: 2, btd: 0, one_hand_bta_mod: -2, ambi_btd_mod: -2 },
            "2 Mãos Gigante": { cost: 140, damage: "1D10", hand: 2, bta: 1, btd: 1, one_hand_bta_mod: -2, ambi_btd_mod: -2 },
            "2 Mãos Colossal": { cost: 160, damage: "1D10", hand: 2, bta: -1, btd: 2, one_hand_bta_mod: -2, ambi_btd_mod: -2 },
            "Cajado": { cost: 140, damage: "1D6", hand: 2, bta: 1, btd: 0, btm: 2, one_hand_bta_mod: -2 },
        },
        armors: {
            "Nenhuma": { cost: 0, protection: 0, agility_pen: 0 },
            "Leve": { cost: 80, protection: 1, agility_pen: 0 },
            "Mediana": { cost: 100, protection: 2, agility_pen: -1 },
            "Pesada": { cost: 120, protection: 3, agility_pen: -2 },
        },
        shields: {
            "Nenhum": { cost: 0, defense: 0, agility_pen: 0, req_forca: 0 },
            "Pequeno": { cost: 80, defense: 2, agility_pen: -1, req_forca: 1 },
            "Médio": { cost: 100, defense: 4, agility_pen: -2, req_forca: 2 },
            "Grande": { cost: 120, defense: 6, agility_pen: -3, req_forca: 3 },
        },
        advancedElements: {
            fogo: "Chama Azul", agua: "Gelo", terra: "Metal", 
            vento: "Raio", luz: "Cura", escuridao: "Gravidade"
        },
        spells: {
            grade1: [
                { name: "Estalo de Fogo", element: "fogo", desc: "Cria uma pequena chama para acender objetos. (Fora de combate)" },
                { name: "Baforada Dracônica", element: "fogo", desc: "Causa 1D4 + nível de dano em área." },
                { name: "Afogamento", element: "agua", desc: "Causa 2 de dano por 3 turnos (80% chance)." },
                { name: "Geração de Água", element: "agua", desc: "Cria água potável. (Fora de combate)" },
                { name: "Golpe Rochoso", element: "terra", desc: "+3 Força, -2 Agilidade por 3 turnos." },
                { name: "Elevação", element: "terra", desc: "Eleva um pedaço de terra/rocha. (Fora de combate)" },
                { name: "Aceleração", element: "vento", desc: "+3 Agilidade por 3 turnos." },
                { name: "Tubo de Aceleração", element: "vento", desc: "Dispara algo/alguém a distância. (Fora de combate)" },
                { name: "Iluminar", element: "luz", desc: "Cria um globo de luz por 1 hora. (Fora de combate)" },
                { name: "Flash", element: "luz", desc: "Cega alvos por 1 turno (15% chance de resistir)." },
                { name: "Desfazer Ilusão Mínima", element: "escuridao", desc: "Dissolve ilusões de grau 1. (Fora de combate)" },
                { name: "Dano de Energia", element: "escuridao", desc: "Causa 1D6+1 de dano no Mahou/Ki do alvo." },
            ]
        }
    };
    let tempCharacterSheet = {};

    // --- VARIÁVEIS DE ESTADO ---
    let myRole = null, myPlayerKey = null, isGm = false;
    let currentGameState = null, oldGameState = null;
    let defeatAnimationPlayed = new Set();
    const socket = io();
    let myRoomId = null; 
    let coordsModeActive = false;
    let clientFlowState = 'initializing';
    const gameStateQueue = [];
    let ALL_CHARACTERS = { players: [], npcs: [], dynamic: [] };
    let ALL_SCENARIOS = {};
    let stagedNpcSlots = new Array(5).fill(null);
    let selectedSlotIndex = null;
    const MAX_NPCS = 5;
    let isTargeting = false;
    let targetingAttackerKey = null;
    let isFreeMoveModeActive = false;
    let customFighterPositions = {};
    let draggedFighter = { element: null, offsetX: 0, offsetY: 0 };
    let localWorldScale = 1.0;
    let selectedTokens = new Set();
    let hoveredTokenId = null;
    let isDragging = false;
    let isPanning = false;
    let dragStartPos = { x: 0, y: 0 };
    let dragOffsets = new Map();
    let isGroupSelectMode = false;
    let isSelectingBox = false;
    let selectionBoxStartPos = { x: 0, y: 0 };

    // --- ELEMENTOS DO DOM ---
    const allScreens = document.querySelectorAll('.screen');
    const gameWrapper = document.getElementById('game-wrapper');
    const fightSceneCharacters = document.getElementById('fight-scene-characters');
    const actionButtonsWrapper = document.getElementById('action-buttons-wrapper');
    const theaterBackgroundViewport = document.getElementById('theater-background-viewport');
    const theaterBackgroundImage = document.getElementById('theater-background-image');
    const theaterTokenContainer = document.getElementById('theater-token-container');
    const theaterWorldContainer = document.getElementById('theater-world-container');
    const theaterCharList = document.getElementById('theater-char-list');
    const theaterGlobalScale = document.getElementById('theater-global-scale');
    const initiativeUI = document.getElementById('initiative-ui');
    const modal = document.getElementById('modal');
    const selectionBox = document.getElementById('selection-box');
    const turnOrderSidebar = document.getElementById('turn-order-sidebar');
    const floatingButtonsContainer = document.getElementById('floating-buttons-container');
    const floatingInviteBtn = document.getElementById('floating-invite-btn');
    const floatingSwitchModeBtn = document.getElementById('floating-switch-mode-btn');
    const floatingHelpBtn = document.getElementById('floating-help-btn');
    const waitingPlayersSidebar = document.getElementById('waiting-players-sidebar');
    const backToLobbyBtn = document.getElementById('back-to-lobby-btn');
    const coordsDisplay = document.getElementById('coords-display');

    // --- FUNÇÕES DE UTILIDADE ---
    function scaleGame(){setTimeout(()=>{const e=Math.min(window.innerWidth/1280,window.innerHeight/720);gameWrapper.style.transform=`scale(${e})`,gameWrapper.style.left=`${(window.innerWidth-1280*e)/2}px`,gameWrapper.style.top=`${(window.innerHeight-720*e)/2}px`},10)}
    function showScreen(e){allScreens.forEach(t=>t.classList.toggle("active",t===e))}
    function showInfoModal(e,t,o=!0){document.getElementById("modal-title").innerText=e,document.getElementById("modal-text").innerHTML=t;const n=document.getElementById("modal-content").querySelector(".modal-button-container");n&&n.remove(),document.getElementById("modal-button").classList.toggle("hidden",!o),modal.classList.remove("hidden"),document.getElementById("modal-button").onclick=()=>modal.classList.add("hidden")}
    function showConfirmationModal(e,t,o,n="Sim",a="Não"){const l=document.getElementById("modal-content"),s=document.getElementById("modal-text");document.getElementById("modal-title").innerText=e,s.innerHTML=`<p>${t}</p>`;const i=l.querySelector(".modal-button-container");i&&i.remove();const c=document.createElement("div");c.className="modal-button-container";const d=document.createElement("button");d.textContent=n,d.onclick=()=>{o(!0),modal.classList.add("hidden")};const r=document.createElement("button");r.textContent=a,r.onclick=()=>{o(!1),modal.classList.add("hidden")},c.appendChild(d),c.appendChild(r),l.appendChild(c),document.getElementById("modal-button").classList.add("hidden"),modal.classList.remove("hidden")}
    function getGameScale(){return"none"===window.getComputedStyle(gameWrapper).transform?1:(new DOMMatrix(window.getComputedStyle(gameWrapper).transform)).a}
    function copyToClipboard(e,t){t&&navigator.clipboard.writeText(e).then(()=>{const o=t.innerHTML,n="BUTTON"===t.tagName;t.innerHTML="Copiado!",n&&(t.style.fontSize="14px"),setTimeout(()=>{t.innerHTML=o,n&&(t.style.fontSize="24px")},2e3)})}
    function cancelTargeting(){isTargeting=!1,targetingAttackerKey=null,document.getElementById("targeting-indicator").classList.add("hidden")}
    function getFighter(e,t){return e&&e.fighters&&t?e.fighters.players[t]||e.fighters.npcs[t]:null}
    
    // --- LÓGICA DO MODO AVENTURA (ANTIGA) ---
    function handleAdventureMode(gameState){const fightScreen=document.getElementById("fight-screen");if(isGm)switch(gameState.phase){case"party_setup":showScreen(document.getElementById("gm-party-setup-screen")),updateGmPartySetupScreen(gameState);break;case"npc_setup":showScreen(document.getElementById("gm-npc-setup-screen")),oldGameState&&"npc_setup"===oldGameState.phase||(stagedNpcSlots.fill(null),selectedSlotIndex=null,customFighterPositions={},renderNpcSelectionForGm());break;case"initiative_roll":case"battle":default:showScreen(fightScreen),updateAdventureUI(gameState),"initiative_roll"===gameState.phase?renderInitiativeUI(gameState):document.getElementById("initiative-ui").classList.add("hidden")}else{getFighter(gameState,myPlayerKey)?"party_setup"!==gameState.phase&&"npc_setup"!==gameState.phase?(showScreen(fightScreen),updateAdventureUI(gameState),"initiative_roll"===gameState.phase?renderInitiativeUI(gameState):document.getElementById("initiative-ui").classList.add("hidden")):(showScreen(document.getElementById("player-waiting-screen")),document.getElementById("player-waiting-message").innerText="O Mestre está preparando a aventura..."):(showScreen(document.getElementById("player-waiting-screen")),document.getElementById("player-waiting-message").innerText="Aguardando o Mestre...")}}
    function updateGmLobbyUI(state){const playerListEl=document.getElementById("gm-lobby-player-list");if(playerListEl&&state&&state.connectedPlayers){playerListEl.innerHTML="";const connectedPlayers=Object.values(state.connectedPlayers);0===connectedPlayers.length?playerListEl.innerHTML="<li>Aguardando jogadores...</li>":connectedPlayers.forEach(player=>{const charName=player.characterName||"<i>Criando ficha...</i>";playerListEl.innerHTML+=`<li>${"player"===player.role?"Jogador":"Espectador"} - Personagem: ${charName}</li>`})}}
    
    function renderPlayerTokenSelection(unavailable = []) {
        const charListContainer = document.getElementById('character-list-container');
        const confirmBtn = document.getElementById('confirm-selection-btn');
        charListContainer.innerHTML = '';
        confirmBtn.disabled = true;
        let myCurrentSelection = tempCharacterSheet.tokenImg;

        (ALL_CHARACTERS.players || []).forEach(data => {
            const card = document.createElement('div');
            card.className = 'char-card';
            card.dataset.name = data.name;
            card.dataset.img = data.img;
            card.innerHTML = `<img src="${data.img}" alt="${data.name}"><div class="char-name">${data.name}</div>`;
            if (myCurrentSelection === data.img) {
                card.classList.add('selected');
                confirmBtn.disabled = false;
            }
            card.addEventListener('click', () => {
                document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                confirmBtn.disabled = false;
            });
            charListContainer.appendChild(card);
        });
        confirmBtn.onclick = () => {
            const selectedCard = document.querySelector('.char-card.selected');
            if (selectedCard) {
                tempCharacterSheet.tokenName = selectedCard.dataset.name;
                tempCharacterSheet.tokenImg = selectedCard.dataset.img;
                initializeCharacterSheet();
                showScreen(document.getElementById('character-sheet-screen'));
            }
        };
    }

    // --- FUNÇÕES DA FICHA DE PERSONAGEM (NOVAS E CORRIGIDAS) ---
    function initializeCharacterSheet() {
        tempCharacterSheet = {
            name: '', class: '', race: 'Anjo',
            tokenName: tempCharacterSheet.tokenName,
            tokenImg: tempCharacterSheet.tokenImg,
            baseAttributes: { forca: 0, agilidade: 0, protecao: 0, constituicao: 0, inteligencia: 0, mente: 0 },
            elements: { fogo: 0, agua: 0, terra: 0, vento: 0, luz: 0, escuridao: 0 },
            equipment: {
                weapon1: { name: '', type: 'Desarmado' },
                weapon2: { name: '', type: 'Desarmado' },
                armor: 'Nenhuma',
                shield: 'Nenhum'
            },
            spells: [],
            money: 200,
        };

        const raceSelect = document.getElementById('sheet-race-select');
        raceSelect.innerHTML = Object.keys(GAME_RULES.races).map(r => `<option value="${r}">${r}</option>`).join('');
        const weaponSelects = [document.getElementById('sheet-weapon1-type'), document.getElementById('sheet-weapon2-type')];
        weaponSelects.forEach(sel => sel.innerHTML = Object.keys(GAME_RULES.weapons).map(w => `<option value="${w}">${w}</option>`).join(''));
        document.getElementById('sheet-armor-type').innerHTML = Object.keys(GAME_RULES.armors).map(a => `<option value="${a}">${a}</option>`).join('');
        document.getElementById('sheet-shield-type').innerHTML = Object.keys(GAME_RULES.shields).map(s => `<option value="${s}">${s}</option>`).join('');
        
        document.getElementById('sheet-name').value = '';
        document.getElementById('sheet-class').value = '';
        document.querySelectorAll('#character-sheet-screen input[type="number"]').forEach(input => input.value = 0);

        document.querySelectorAll('.arrow-btn').forEach(button => {
            if (button.dataset.listenerAttached) return;
            button.dataset.listenerAttached = true;
            button.addEventListener('click', (e) => {
                const wrapper = e.target.closest('.number-input-wrapper');
                const input = wrapper.querySelector('input[type="number"]');
                let value = parseInt(input.value);
                const min = parseInt(input.min);
                const max = parseInt(input.max);

                if (e.target.classList.contains('up-arrow')) {
                    if (isNaN(max) || value < max) value++;
                } else if (e.target.classList.contains('down-arrow')) {
                    if (isNaN(min) || value > min) value--;
                }
                input.value = value;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
        });

        document.querySelectorAll('#sheet-equipment-section select').forEach(select => {
            select.addEventListener('focus', (e) => {
                e.target.dataset.previousValue = e.target.value;
            });
        });

        updateCharacterSheet();
    }

    function renderSpellSelection(playerElements) {
        const spellGrid = document.getElementById('spell-selection-grid');
        spellGrid.innerHTML = '';
        
        const availableSpells = GAME_RULES.spells.grade1.filter(spell => 
            playerElements.includes(spell.element)
        );

        if (availableSpells.length === 0) {
            spellGrid.innerHTML = "<p>Escolha seus elementos para ver as magias disponíveis.</p>";
            return;
        }

        availableSpells.forEach(spell => {
            const card = document.createElement('div');
            card.className = 'spell-card';
            card.dataset.spellName = spell.name;
            card.innerHTML = `<h4>${spell.name}</h4><p>${spell.desc}</p>`;

            if (tempCharacterSheet.spells.includes(spell.name)) {
                card.classList.add('selected');
            }

            card.addEventListener('click', () => {
                const selectedSpells = tempCharacterSheet.spells;
                if (selectedSpells.includes(spell.name)) {
                    tempCharacterSheet.spells = selectedSpells.filter(s => s !== spell.name);
                } else {
                    if (selectedSpells.length < 2) {
                        tempCharacterSheet.spells.push(spell.name);
                    }
                }
                document.getElementById('sheet-spells-selected-count').textContent = tempCharacterSheet.spells.length;
                renderSpellSelection(playerElements);
            });

            spellGrid.appendChild(card);
        });
    }

    function updateCharacterSheet(event) {
        const sheet = {};
        const race = document.getElementById('sheet-race-select').value;
        const raceData = GAME_RULES.races[race];
        const isHuman = race === 'Humano';
        const totalAttrPointsAvailable = 5 + (isHuman ? 1 : 0);

        sheet.baseAttributes = {
            forca: parseInt(document.getElementById('sheet-base-attr-forca').value) || 0,
            agilidade: parseInt(document.getElementById('sheet-base-attr-agilidade').value) || 0,
            protecao: parseInt(document.getElementById('sheet-base-attr-protecao').value) || 0,
            constituicao: parseInt(document.getElementById('sheet-base-attr-constituicao').value) || 0,
            inteligencia: parseInt(document.getElementById('sheet-base-attr-inteligencia').value) || 0,
            mente: parseInt(document.getElementById('sheet-base-attr-mente').value) || 0,
        };
        sheet.elements = {
            fogo: parseInt(document.getElementById('sheet-elem-fogo').value) || 0,
            agua: parseInt(document.getElementById('sheet-elem-agua').value) || 0,
            terra: parseInt(document.getElementById('sheet-elem-terra').value) || 0,
            vento: parseInt(document.getElementById('sheet-elem-vento').value) || 0,
            luz: parseInt(document.getElementById('sheet-elem-luz').value) || 0,
            escuridao: parseInt(document.getElementById('sheet-elem-escuridao').value) || 0,
        };
        
        const w1type = document.getElementById('sheet-weapon1-type').value;
        const w2type = document.getElementById('sheet-weapon2-type').value;
        const armortype = document.getElementById('sheet-armor-type').value;
        const shieldtype = document.getElementById('sheet-shield-type').value;
        
        sheet.equipment = {
            weapon1: GAME_RULES.weapons[w1type],
            weapon2: GAME_RULES.weapons[w2type],
            armor: GAME_RULES.armors[armortype],
            shield: GAME_RULES.shields[shieldtype]
        };
        
        const totalAttrPoints = Object.values(sheet.baseAttributes).reduce((a, b) => a + b, 0);
        const remainingAttrPoints = totalAttrPointsAvailable - totalAttrPoints;
        const totalElemPoints = Object.values(sheet.elements).reduce((a, b) => a + b, 0);
        const remainingElemPoints = 2 - totalElemPoints;

        document.getElementById('attribute-points-header').innerHTML = `Atributos Básicos <small>(<span id="sheet-points-attr-remaining">${remainingAttrPoints}</span>/${totalAttrPointsAvailable} pontos) <span class="error-message" id="attr-error-message"></span></small>`;
        document.getElementById('sheet-points-elem-remaining').textContent = remainingElemPoints;
        document.getElementById('attr-error-message').textContent = remainingAttrPoints < 0 ? "Pontos excedidos!" : "";
        document.getElementById('elem-error-message').textContent = remainingElemPoints < 0 ? "Pontos excedidos!" : "";

        const playerActiveElements = [];
        for (const [elem, points] of Object.entries(sheet.elements)) {
            const advancedDisplay = document.getElementById(`advanced-${elem}`);
            if (points > 0) playerActiveElements.push(elem);
            advancedDisplay.textContent = (points === 2) ? GAME_RULES.advancedElements[elem] : "";
        }
        renderSpellSelection(playerActiveElements);
        
        sheet.finalAttributes = { ...sheet.baseAttributes };
        for (const attr in raceData.bon) { if (attr !== 'escolha') sheet.finalAttributes[attr] += raceData.bon[attr]; }
        for (const attr in raceData.pen) { sheet.finalAttributes[attr] += raceData.pen[attr]; }
        sheet.finalAttributes.agilidade += sheet.equipment.armor.agility_pen;
        sheet.finalAttributes.agilidade += sheet.equipment.shield.agility_pen;

        sheet.hpMax = 20 + (sheet.finalAttributes.constituicao * 5);
        sheet.mahouMax = 10 + (sheet.finalAttributes.mente * 5);

        let totalCost = sheet.equipment.weapon1.cost + sheet.equipment.weapon2.cost + sheet.equipment.armor.cost + sheet.equipment.shield.cost;
        let money = 200 - totalCost;

        if (money < 0 && event && event.target.dataset.previousValue) {
            event.target.value = event.target.dataset.previousValue;
            showInfoModal("Aviso", "Você não tem dinheiro suficiente para comprar este item.");
            // Chamar a função novamente para recalcular com o valor revertido
            updateCharacterSheet(); 
            return;
        }

        const canOneHand2H = sheet.finalAttributes.forca >= 4;
        const w2Select = document.getElementById('sheet-weapon2-type');
        const shieldSelect = document.getElementById('sheet-shield-type');

        const w1BlocksW2 = (sheet.equipment.weapon1.hand === 2 && !canOneHand2H);
        w2Select.disabled = w1BlocksW2 || shieldtype !== 'Nenhum';
        shieldSelect.disabled = (sheet.equipment.weapon1.hand === 2 && !canOneHand2H) || w2type !== 'Desarmado';

        if (w2Select.disabled && w2Select.value !== 'Desarmado') w2Select.value = 'Desarmado';
        if (shieldSelect.disabled && shieldSelect.value !== 'Nenhum') shieldSelect.value = 'Nenhum';
        
        let equipInfo = [];
        if (sheet.equipment.shield.req_forca > 0 && sheet.finalAttributes.forca < sheet.equipment.shield.req_forca) equipInfo.push(`Requer ${sheet.equipment.shield.req_forca} Força para o escudo.`);
        if (sheet.equipment.weapon1.hand === 2 && sheet.equipment.weapon2.hand === 2 && !canOneHand2H) equipInfo.push(`Requer 4 Força para usar 2 armas de Duas Mãos.`);

        const isAmbidextrous = w1type !== 'Desarmado' && w2type !== 'Desarmado';
        let bta = sheet.finalAttributes.agilidade;
        let btd = sheet.finalAttributes.forca;
        let btm = sheet.finalAttributes.inteligencia;
        
        const w1Data = sheet.equipment.weapon1, w2Data = sheet.equipment.weapon2;
        if(w1Data){
            let finalBTA1 = w1Data.bta, finalBTD1 = w1Data.btd;
            if (isAmbidextrous) { finalBTA1 += w1Data.ambi_bta_mod; finalBTD1 += w1Data.ambi_btd_mod; }
            if(w1Data.hand === 2 && canOneHand2H && !isAmbidextrous) finalBTA1 += w1Data.one_hand_bta_mod || 0;
            bta += finalBTA1; btd += finalBTD1; btm += w1Data.btm || 0;
        }
        if(isAmbidextrous && w2Data){
             let finalBTA2 = w2Data.bta + w2Data.ambi_bta_mod;
             let finalBTD2 = w2Data.btd + w2Data.ambi_btd_mod;
             if(w2Data.hand === 2 && canOneHand2H) finalBTA2 += w2Data.one_hand_bta_mod || 0;
             bta += finalBTA2; btd += finalBTD2;
             if((w2Data.btm || 0) > (w1Data.btm || 0)) btm += (w2Data.btm || 0);
        }
        
        // --- RENDERIZAÇÃO NA UI ---
        document.getElementById('sheet-final-attr-forca').textContent = sheet.finalAttributes.forca;
        document.getElementById('sheet-final-attr-agilidade').textContent = sheet.finalAttributes.agilidade;
        document.getElementById('sheet-final-attr-protecao').textContent = sheet.finalAttributes.protecao;
        document.getElementById('sheet-final-attr-constituicao').textContent = sheet.finalAttributes.constituicao;
        document.getElementById('sheet-final-attr-inteligencia').textContent = sheet.finalAttributes.inteligencia;
        document.getElementById('sheet-final-attr-mente').textContent = sheet.finalAttributes.mente;
        
        document.getElementById('sheet-hp-max').textContent = sheet.hpMax; document.getElementById('sheet-hp-current').textContent = sheet.hpMax;
        document.getElementById('sheet-mahou-max').textContent = sheet.mahouMax; document.getElementById('sheet-mahou-current').textContent = sheet.mahouMax;
        document.getElementById('race-info-box').textContent = raceData.text;
        document.getElementById('equipment-info-text').textContent = equipInfo.length > 0 ? equipInfo.join(' ') : 'Tudo certo.';
        document.getElementById('sheet-money-copper').textContent = Math.max(0, money);
        document.getElementById('sheet-bta').textContent = (bta >= 0 ? '+' : '') + bta;
        document.getElementById('sheet-btd').textContent = (btd >= 0 ? '+' : '') + btd;
        document.getElementById('sheet-btm').textContent = (btm >= 0 ? '+' : '') + btm;
    }

    // ... (O resto do código, de handleSaveCharacter em diante, permanece igual)
    function handleSaveCharacter() {
        const sheetData = {
            name: document.getElementById('sheet-name').value,
            class: document.getElementById('sheet-class').value,
            race: document.getElementById('sheet-race-select').value,
            tokenName: tempCharacterSheet.tokenName,
            tokenImg: tempCharacterSheet.tokenImg,
            baseAttributes: {
                forca: parseInt(document.getElementById('sheet-base-attr-forca').value) || 0,
                agilidade: parseInt(document.getElementById('sheet-base-attr-agilidade').value) || 0,
                protecao: parseInt(document.getElementById('sheet-base-attr-protecao').value) || 0,
                constituicao: parseInt(document.getElementById('sheet-base-attr-constituicao').value) || 0,
                inteligencia: parseInt(document.getElementById('sheet-base-attr-inteligencia').value) || 0,
                mente: parseInt(document.getElementById('sheet-base-attr-mente').value) || 0,
            },
            elements: {
                fogo: parseInt(document.getElementById('sheet-elem-fogo').value) || 0,
                agua: parseInt(document.getElementById('sheet-elem-agua').value) || 0,
                terra: parseInt(document.getElementById('sheet-elem-terra').value) || 0,
                vento: parseInt(document.getElementById('sheet-elem-vento').value) || 0,
                luz: parseInt(document.getElementById('sheet-elem-luz').value) || 0,
                escuridao: parseInt(document.getElementById('sheet-elem-escuridao').value) || 0,
            },
            equipment: {
                weapon1: { name: document.getElementById('sheet-weapon1-name').value, type: document.getElementById('sheet-weapon1-type').value },
                weapon2: { name: document.getElementById('sheet-weapon2-name').value, type: document.getElementById('sheet-weapon2-type').value },
                armor: document.getElementById('sheet-armor-type').value,
                shield: document.getElementById('sheet-shield-type').value
            },
            spells: tempCharacterSheet.spells,
        };
        const dataStr = JSON.stringify(sheetData, null, 2);
        const dataBase64 = btoa(dataStr);
        const a = document.createElement("a");
        a.href = "data:text/plain;charset=utf-8," + encodeURIComponent(dataBase64);
        a.download = `${sheetData.name || 'personagem'}_almara.txt`;
        a.click();
    }
    function handleLoadCharacter(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const decodedData = atob(e.target.result);
                const sheetData = JSON.parse(decodedData);
                tempCharacterSheet.tokenName = sheetData.tokenName;
                tempCharacterSheet.tokenImg = sheetData.tokenImg;
                tempCharacterSheet.spells = sheetData.spells || [];
                initializeCharacterSheet();
                document.getElementById('sheet-name').value = sheetData.name || '';
                document.getElementById('sheet-class').value = sheetData.class || '';
                document.getElementById('sheet-race-select').value = sheetData.race || 'Humano';
                Object.keys(sheetData.baseAttributes).forEach(attr => {
                    document.getElementById(`sheet-base-attr-${attr}`).value = sheetData.baseAttributes[attr] || 0;
                });
                Object.keys(sheetData.elements).forEach(elem => {
                    document.getElementById(`sheet-elem-${elem}`).value = sheetData.elements[elem] || 0;
                });
                document.getElementById('sheet-weapon1-name').value = sheetData.equipment.weapon1.name || '';
                document.getElementById('sheet-weapon1-type').value = sheetData.equipment.weapon1.type || 'Desarmado';
                document.getElementById('sheet-weapon2-name').value = sheetData.equipment.weapon2.name || '';
                document.getElementById('sheet-weapon2-type').value = sheetData.equipment.weapon2.type || 'Desarmado';
                document.getElementById('sheet-armor-type').value = sheetData.equipment.armor || 'Nenhuma';
                document.getElementById('sheet-shield-type').value = sheetData.equipment.shield || 'Nenhum';
                updateCharacterSheet();
                showScreen(document.getElementById('character-sheet-screen'));
            } catch (error) {
                showInfoModal('Erro', 'Não foi possível carregar o arquivo. Formato inválido.');
                console.error('Erro ao carregar personagem:', error);
            }
        };
        reader.readAsText(file);
    }
    function handleConfirmCharacter() {
        const finalSheet = {
             name: document.getElementById('sheet-name').value,
             class: document.getElementById('sheet-class').value,
             race: document.getElementById('sheet-race-select').value,
             tokenName: tempCharacterSheet.tokenName,
             tokenImg: tempCharacterSheet.tokenImg,
             baseAttributes: {
                forca: parseInt(document.getElementById('sheet-base-attr-forca').value) || 0,
                agilidade: parseInt(document.getElementById('sheet-base-attr-agilidade').value) || 0,
                protecao: parseInt(document.getElementById('sheet-base-attr-protecao').value) || 0,
                constituicao: parseInt(document.getElementById('sheet-base-attr-constituicao').value) || 0,
                inteligencia: parseInt(document.getElementById('sheet-base-attr-inteligencia').value) || 0,
                mente: parseInt(document.getElementById('sheet-base-attr-mente').value) || 0,
             },
             elements: {
                fogo: parseInt(document.getElementById('sheet-elem-fogo').value) || 0,
                agua: parseInt(document.getElementById('sheet-elem-agua').value) || 0,
                terra: parseInt(document.getElementById('sheet-elem-terra').value) || 0,
                vento: parseInt(document.getElementById('sheet-elem-vento').value) || 0,
                luz: parseInt(document.getElementById('sheet-elem-luz').value) || 0,
                escuridao: parseInt(document.getElementById('sheet-elem-escuridao').value) || 0,
             },
             equipment: {
                weapon1: { name: document.getElementById('sheet-weapon1-name').value, type: document.getElementById('sheet-weapon1-type').value },
                weapon2: { name: document.getElementById('sheet-weapon2-name').value, type: document.getElementById('sheet-weapon2-type').value },
                armor: document.getElementById('sheet-armor-type').value,
                shield: document.getElementById('sheet-shield-type').value
             },
             spells: tempCharacterSheet.spells,
        };
        socket.emit('playerAction', { type: 'playerFinalizesCharacter', characterData: finalSheet });
        showScreen(document.getElementById('player-waiting-screen'));
        document.getElementById('player-waiting-message').innerText = "Personagem enviado! Aguardando o Mestre...";
    }
    
    function renderGame(gameState) {
        scaleGame(); 
        oldGameState = currentGameState;
        currentGameState = gameState;
        if (!gameState || !gameState.mode || !gameState.connectedPlayers) {
            showScreen(document.getElementById('loading-screen'));
            return;
        }
        if (gameState.mode === 'adventure' && gameState.customPositions) customFighterPositions = gameState.customPositions;
        
        const myPlayerData = gameState.connectedPlayers?.[socket.id];
        if (myRole === 'player' && myPlayerData && !myPlayerData.characterFinalized) return; 
        
        if (gameState.mode === 'adventure' && gameState.scenario) gameWrapper.style.backgroundImage = `url('images/${gameState.scenario}')`;
        else if (gameState.mode === 'lobby') gameWrapper.style.backgroundImage = `url('images/mapas/cenarios externos/externo (1).png')`;
        else gameWrapper.style.backgroundImage = 'none';

        document.getElementById('turn-order-sidebar').classList.add('hidden');
        floatingButtonsContainer.classList.add('hidden');
        document.getElementById('waiting-players-sidebar').classList.add('hidden');
        document.getElementById('back-to-lobby-btn').classList.add('hidden');

        if (isGm && (gameState.mode === 'adventure' || gameState.mode === 'theater')) {
            floatingButtonsContainer.classList.remove('hidden');
            document.getElementById('back-to-lobby-btn').classList.remove('hidden');
            const switchBtn = document.getElementById('floating-switch-mode-btn');
            if (gameState.mode === 'adventure') {
                switchBtn.innerHTML = '🎭';
                switchBtn.title = 'Mudar para Modo Cenário';
            } else {
                switchBtn.innerHTML = '⚔️';
                switchBtn.title = 'Mudar para Modo Aventura';
            }
        }

        switch(gameState.mode) {
            case 'lobby':
                defeatAnimationPlayed.clear();
                stagedNpcSlots.fill(null);
                selectedSlotIndex = null;
                if (isGm) {
                    showScreen(document.getElementById('gm-initial-lobby'));
                    updateGmLobbyUI(gameState);
                } else {
                    showScreen(document.getElementById('player-waiting-screen'));
                    document.getElementById('player-waiting-message').innerText = "Aguardando o Mestre iniciar o jogo...";
                }
                break;
            case 'adventure':
                handleAdventureMode(gameState);
                break;
            case 'theater':
                if (!oldGameState || oldGameState.mode !== 'theater') initializeTheaterMode();
                showScreen(document.getElementById('theater-screen'));
                renderTheaterMode(gameState);
                break;
            default:
                showScreen(document.getElementById('loading-screen'));
        }
    }

    // --- INICIALIZAÇÃO E LISTENERS DE SOCKET ---
    socket.on('initialData', (data) => {
        ALL_CHARACTERS = data.characters || { players: [], npcs: [], dynamic: [] };
        ALL_SCENARIOS = data.scenarios || {};
    });
    socket.on('gameUpdate', (gameState) => { if (clientFlowState !== 'choosing_role') renderGame(gameState); });
    socket.on('fighterMoved', ({ fighterId, position }) => {
        customFighterPositions[fighterId] = position;
        const fighterEl = document.getElementById(fighterId);
        if (fighterEl) {
            fighterEl.style.left = position.left;
            fighterEl.style.top = position.top;
        }
    });
    socket.on('roomCreated', (roomId) => {
        myRoomId = roomId;
        if (isGm) {
            const inviteLinkEl = document.getElementById('gm-link-invite');
            const inviteUrl = `${window.location.origin}?room=${roomId}`;
            if (inviteLinkEl) { 
                inviteLinkEl.textContent = inviteUrl; 
                inviteLinkEl.onclick = () => copyToClipboard(inviteUrl, inviteLinkEl); 
            }
        }
    });
    socket.on('promptForRole', ({ isFull }) => {
        clientFlowState = 'choosing_role';
        const roleSelectionScreen = document.getElementById('role-selection-screen');
        const joinAsPlayerBtn = document.getElementById('join-as-player-btn');
        const roomFullMessage = document.getElementById('room-full-message');
        if (isFull) {
            joinAsPlayerBtn.disabled = true;
            roomFullMessage.textContent = 'A sala de jogadores está cheia. Você pode entrar como espectador.';
            roomFullMessage.classList.remove('hidden');
        } else {
            joinAsPlayerBtn.disabled = false;
            roomFullMessage.classList.add('hidden');
        }
        showScreen(roleSelectionScreen);
    });
    socket.on('assignRole', (data) => {
        myRole = data.role; myPlayerKey = data.playerKey || null; isGm = !!data.isGm; myRoomId = data.roomId;
        clientFlowState = 'in_game';
        if (myRole === 'player') showScreen(document.getElementById('player-initial-choice-screen'));
    });
    socket.on('gmPromptToAdmit', ({ playerId, character }) => { if (isGm) showConfirmationModal('Novo Jogador', `${character.nome} deseja entrar na batalha. Permitir?`, (admitted) => socket.emit('playerAction', { type: 'gmDecidesOnAdmission', playerId, admitted })); });
    socket.on('promptForAdventureType', () => { if (isGm) showConfirmationModal('Retornar à Aventura', 'Deseja continuar a aventura anterior ou começar uma nova batalha?', (continuar) => socket.emit('playerAction', { type: 'gmChoosesAdventureType', choice: continuar ? 'continue' : 'new' }), 'Continuar Batalha', 'Nova Batalha'); });
    socket.on('attackResolved', ({ attackerKey, targetKey, hit }) => {
        const attackerEl = document.getElementById(attackerKey);
        if (attackerEl) {
            const isPlayer = attackerEl.classList.contains('player-char-container');
            const originalLeft = attackerEl.style.left;
            attackerEl.style.left = `${parseFloat(originalLeft) + (isPlayer ? 200 : -200)}px`;
            setTimeout(() => { attackerEl.style.left = originalLeft; }, 500);
        }
        const targetEl = document.getElementById(targetKey);
        if (targetEl && hit) {
            const img = targetEl.querySelector('.fighter-img-ingame');
            if (img) {
                img.classList.add('is-hit-flash');
                setTimeout(() => img.classList.remove('is-hit-flash'), 400);
            }
        }
    });
    socket.on('fleeResolved', ({ actorKey }) => {
        const actorEl = document.getElementById(actorKey);
        if (actorEl) actorEl.classList.add(actorEl.classList.contains('player-char-container') ? 'is-fleeing-player' : 'is-fleeing-npc');
    });
    socket.on('error', (data) => showInfoModal('Erro', data.message));
    
    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoomId = urlParams.get('room');
        
        showScreen(document.getElementById('loading-screen')); 

        if (urlRoomId) socket.emit('playerJoinsLobby', { roomId: urlRoomId });
        else socket.emit('gmCreatesLobby');

        document.getElementById('join-as-player-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'player' }));
        document.getElementById('join-as-spectator-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'spectator' }));
        document.getElementById('new-char-btn').addEventListener('click', () => {
            showScreen(document.getElementById('selection-screen'));
            renderPlayerTokenSelection();
        });
        document.getElementById('load-char-btn').addEventListener('click', () => document.getElementById('load-char-input').click());
        document.getElementById('load-char-input').addEventListener('change', handleLoadCharacter);

        document.querySelectorAll('#character-sheet-screen input, #character-sheet-screen select').forEach(el => {
            el.addEventListener('change', (e) => updateCharacterSheet(e));
            el.addEventListener('input', (e) => updateCharacterSheet(e));
        });
        document.getElementById('sheet-save-btn').addEventListener('click', handleSaveCharacter);
        document.getElementById('sheet-confirm-btn').addEventListener('click', handleConfirmCharacter);

        document.getElementById('start-adventure-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsAdventure' }));
        document.getElementById('start-theater-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'gmStartsTheater' }));
        backToLobbyBtn.addEventListener('click', () => socket.emit('playerAction', { type: 'gmGoesBackToLobby' }));
        document.getElementById('theater-change-scenario-btn').addEventListener('click', showScenarioSelectionModal);
        document.getElementById('theater-publish-btn').addEventListener('click', () => socket.emit('playerAction', { type: 'publish_stage' }));
        
        floatingSwitchModeBtn.addEventListener('click', () => socket.emit('playerAction', { type: 'gmSwitchesMode' }));
        floatingInviteBtn.addEventListener('click', () => {
             if (myRoomId) {
                const inviteUrl = `${window.location.origin}?room=${myRoomId}`;
                copyToClipboard(inviteUrl, floatingInviteBtn);
            }
        });
        
        if (floatingHelpBtn) floatingHelpBtn.addEventListener('click', showHelpModal);

        setupTheaterEventListeners();
        initializeGlobalKeyListeners();
        window.addEventListener('resize', scaleGame);
        scaleGame();
    }
    
    initialize();
});