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
    let myRole = null;
    let myPlayerKey = null;
    let isGm = false;
    let currentGameState = null;
    let oldGameState = null;
    let defeatAnimationPlayed = new Set();
    const socket = io();
    let myRoomId = null; 

    let coordsModeActive = false;

    let clientFlowState = 'initializing';
    const gameStateQueue = [];

    // Dados do Jogo
    let ALL_CHARACTERS = { players: [], npcs: [], dynamic: [] };
    let ALL_SCENARIOS = {};
    let stagedNpcSlots = new Array(5).fill(null);
    let selectedSlotIndex = null;
    const MAX_NPCS = 5;

    // Controles de UI
    let isTargeting = false;
    let targetingAttackerKey = null;
    let isFreeMoveModeActive = false;
    let customFighterPositions = {};
    let draggedFighter = { element: null, offsetX: 0, offsetY: 0 };

    // Variáveis do Modo Cenário
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
    
    // --- LÓGICA DO MODO AVENTURA ---
    function handleAdventureMode(gameState){const fightScreen=document.getElementById("fight-screen");if(isGm)switch(gameState.phase){case"party_setup":showScreen(document.getElementById("gm-party-setup-screen")),updateGmPartySetupScreen(gameState);break;case"npc_setup":showScreen(document.getElementById("gm-npc-setup-screen")),oldGameState&&"npc_setup"===oldGameState.phase||(stagedNpcSlots.fill(null),selectedSlotIndex=null,customFighterPositions={},renderNpcSelectionForGm());break;case"initiative_roll":case"battle":default:showScreen(fightScreen),updateAdventureUI(gameState),"initiative_roll"===gameState.phase?renderInitiativeUI(gameState):initiativeUI.classList.add("hidden")}else{getFighter(gameState,myPlayerKey)?"party_setup"!==gameState.phase&&"npc_setup"!==gameState.phase?(showScreen(fightScreen),updateAdventureUI(gameState),"initiative_roll"===gameState.phase?renderInitiativeUI(gameState):initiativeUI.classList.add("hidden")):(showScreen(document.getElementById("player-waiting-screen")),document.getElementById("player-waiting-message").innerText="O Mestre está preparando a aventura..."):(showScreen(document.getElementById("player-waiting-screen")),document.getElementById("player-waiting-message").innerText="Aguardando o Mestre...")}}
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

    function updateGmPartySetupScreen(state){const partyList=document.getElementById("gm-party-list");partyList.innerHTML="",state.fighters&&state.fighters.players&&(Object.values(state.fighters.players).forEach(player=>{const playerDiv=document.createElement("div");playerDiv.className="party-member-card",playerDiv.dataset.id=player.id,playerDiv.innerHTML=`<img src="${player.img}" alt="${player.nome}"><h4>${player.nome}</h4><label>AGI: <input type="number" class="agi-input" value="${player.agi||2}"></label><label>RES: <input type="number" class="res-input" value="${player.res||3}"></label>`,partyList.appendChild(playerDiv)}),document.getElementById("gm-confirm-party-btn").onclick=()=>{const playerStats=[];document.querySelectorAll("#gm-party-list .party-member-card").forEach(card=>{playerStats.push({id:card.dataset.id,agi:parseInt(card.querySelector(".agi-input").value,10),res:parseInt(card.querySelector(".res-input").value,10)})}),socket.emit("playerAction",{type:"gmConfirmParty",playerStats})})}
    function renderNpcSelectionForGm(){const e=document.getElementById("npc-selection-area");e.innerHTML="",(ALL_CHARACTERS.npcs||[]).forEach(t=>{const o=document.createElement("div");o.className="npc-card",o.innerHTML=`<img src="${t.img}" alt="${t.name}"><div class="char-name">${t.name}</div>`,o.addEventListener("click",()=>{let o=selectedSlotIndex;null===o&&(o=stagedNpcSlots.findIndex(e=>null===e)),-1!==o&&null!==o?(stagedNpcSlots[o]={...t,id:`npc-${Date.now()}-${o}`},selectedSlotIndex=null,renderNpcStagingArea()):stagedNpcSlots.every(e=>null!==e)?alert("Todos os slots estão cheios. Remova um inimigo para adicionar outro."):alert("Primeiro, clique em um slot vago abaixo para posicionar o inimigo.")}),e.appendChild(o)}),renderNpcStagingArea(),document.getElementById("gm-start-battle-btn").onclick=()=>{const e=stagedNpcSlots.map((e,t)=>e?{...e,slotIndex:t}:null).filter(e=>null!==e);0===e.length?alert("Adicione pelo menos um inimigo para a batalha."):socket.emit("playerAction",{type:"gmStartBattle",npcs:e})}}
    function renderNpcStagingArea(){const e=document.getElementById("npc-staging-area");e.innerHTML="";for(let t=0;t<MAX_NPCS;t++){const o=document.createElement("div");o.className="npc-slot";const n=stagedNpcSlots[t];n?(o.innerHTML=`<img src="${n.img}" alt="${n.name}"><button class="remove-staged-npc" data-index="${t}">X</button>`,o.querySelector(".remove-staged-npc").addEventListener("click",e=>{e.stopPropagation();const o=parseInt(e.target.dataset.index,10);stagedNpcSlots[o]=null,selectedSlotIndex===o&&(selectedSlotIndex=null),renderNpcStagingArea()})):(o.classList.add("empty-slot"),o.innerHTML=`<span>Slot ${t+1}</span>`,o.dataset.index=t,o.addEventListener("click",e=>{const t=parseInt(e.currentTarget.dataset.index,10);selectedSlotIndex=selectedSlotIndex===t?null:t,renderNpcStagingArea()})),selectedSlotIndex===t&&o.classList.add("selected-slot"),e.appendChild(o)}}
    function updateAdventureUI(e){if(e&&e.fighters){fightSceneCharacters.innerHTML="",document.getElementById("round-info").textContent=`ROUND ${e.currentRound}`,document.getElementById("fight-log").innerHTML=(e.log||[]).map(e=>`<p class="log-${e.type||"info"}">${e.text}</p>`).join("");const t=[{left:"150px",top:"500px"},{left:"250px",top:"400px"},{left:"350px",top:"300px"},{left:"450px",top:"200px"}],o=[{left:"1000px",top:"500px"},{left:"900px",top:"400px"},{left:"800px",top:"300px"},{left:"700px",top:"200px"},{left:"950px",top:"350px"}];Object.keys(e.fighters.players).forEach((n,a)=>{const l=e.fighters.players[n];if("fled"!==l.status){const s=e.customPositions[l.id]||t[a],i=createFighterElement(l,"player",e,s);i&&fightSceneCharacters.appendChild(i)}}),(e.npcSlots||[]).forEach((t,n)=>{const a=getFighter(e,t);if(a&&"fled"!==a.status){const l=e.customPositions[a.id]||o[n],s=createFighterElement(a,"npc",e,l);s&&fightSceneCharacters.appendChild(s)}}),renderActionButtons(e),renderTurnOrderUI(e),renderWaitingPlayers(e)}}
    function createFighterElement(e,t,o,n){const a=document.createElement("div");a.className=`char-container ${t}-char-container`,a.id=e.id,a.dataset.key=e.id;const l=e.scale||1;if(n&&(Object.assign(a.style,n),a.style.zIndex=parseInt(n.top,10)),a.style.setProperty("--character-scale",l),oldGameState&&getFighter(oldGameState,e.id),oldGameState&&"active"===getFighter(oldGameState,e.id)?.status&&"down"===e.status&&!defeatAnimationPlayed.has(e.id)?(defeatAnimationPlayed.add(e.id),a.classList.add("player"===t?"animate-defeat-player":"animate-defeat-npc")):"down"===e.status&&a.classList.add("player"===t?"player-defeated-final":"npc-defeated-final"),"active"===e.status){o.activeCharacterKey===e.id&&a.classList.add("active-turn");const l=getFighter(o,o.activeCharacterKey);l&&"active"===l.status&&(!!o.fighters.players[l.id]!=="player"===t&&a.classList.add("targetable"))}a.classList.contains("targetable")&&a.addEventListener("click",handleTargetClick);let s="";if(e.isMultiPart&&e.parts){s='<div class="multi-health-bar-container">';e.parts.forEach(t=>{const o="down"===t.status?"defeated":"";s+=`\n                    <div class="health-bar-ingame-part ${o}" title="${t.name}: ${t.hp}/${t.hpMax}">\n                        <div class="health-bar-ingame-part-fill" style="width: ${t.hp/t.hpMax*100}%"></div>\n                    </div>\n                `}),s+="</div>"}else{const t=e.hp/e.hpMax*100;s=`\n                <div class="health-bar-ingame">\n                    <div class="health-bar-ingame-fill" style="width: ${t}%"></div>\n                    <span class="health-bar-ingame-text">${e.hp}/${e.hpMax}</span>\n                </div>\n            `}return a.innerHTML=`${s}<img src="${e.img}" class="fighter-img-ingame"><div class="fighter-name-ingame">${e.nome}</div>`,a}
    function renderActionButtons(e){if(actionButtonsWrapper.innerHTML="","battle"===e.phase&&!e.winner){const t=getFighter(e,e.activeCharacterKey);if(t){const o=!!e.fighters.npcs[t.id],n="player"===myRole&&e.activeCharacterKey===myPlayerKey||isGm&&o,a=document.createElement("button");a.className="action-btn",a.textContent="Atacar",a.disabled=!n,a.addEventListener("click",()=>{isTargeting=!0,targetingAttackerKey=e.activeCharacterKey,document.getElementById("targeting-indicator").classList.remove("hidden")});const l=document.createElement("button");l.className="action-btn flee-btn",l.textContent="Fugir",l.disabled=!n,l.addEventListener("click",()=>{socket.emit("playerAction",{type:"flee",actorKey:e.activeCharacterKey})});const s=document.createElement("button");s.className="end-turn-btn",s.textContent="Encerrar Turno",s.disabled=!n,s.addEventListener("click",()=>{socket.emit("playerAction",{type:"end_turn",actorKey:e.activeCharacterKey})}),actionButtonsWrapper.appendChild(a),actionButtonsWrapper.appendChild(l),actionButtonsWrapper.appendChild(s)}}}
    function renderInitiativeUI(e){initiativeUI.classList.remove("hidden");const t=document.getElementById("player-roll-initiative-btn"),o=document.getElementById("gm-roll-initiative-btn");if(t.classList.add("hidden"),o.classList.add("hidden"),"player"===myRole&&getFighter(e,myPlayerKey)&&"active"===getFighter(e,myPlayerKey).status&&!e.initiativeRolls[myPlayerKey]&&(t.classList.remove("hidden"),t.disabled=!1,t.onclick=()=>{t.disabled=!0,socket.emit("playerAction",{type:"roll_initiative"})}),isGm){Object.values(e.fighters.npcs).some(t=>"active"===t.status&&!e.initiativeRolls[t.id])&&(o.classList.remove("hidden"),o.disabled=!1,o.onclick=()=>{o.disabled=!0,socket.emit("playerAction",{type:"roll_initiative",isGmRoll:!0})})}}
    function renderTurnOrderUI(e){if("battle"!==e.phase&&"initiative_roll"!==e.phase)return void turnOrderSidebar.classList.add("hidden");turnOrderSidebar.innerHTML="",turnOrderSidebar.classList.remove("hidden");const t=e.turnOrder.map(t=>getFighter(e,t)).filter(e=>e&&"active"===e.status),o=t.findIndex(t=>t.id===e.activeCharacterKey),n=-1===o?t:t.slice(o).concat(t.slice(0,o));n.forEach((e,t)=>{const o=document.createElement("div");o.className="turn-order-card",0===t&&o.classList.add("active-turn-indicator");const n=document.createElement("img");n.src=e.img,n.alt=e.nome,n.title=e.nome,o.appendChild(n),turnOrderSidebar.appendChild(o)})}
    function renderWaitingPlayers(e){if(waitingPlayersSidebar.innerHTML="",!e.waitingPlayers||0===Object.keys(e.waitingPlayers).length)return void waitingPlayersSidebar.classList.add("hidden");waitingPlayersSidebar.classList.remove("hidden");for(const t in e.waitingPlayers){const o=e.waitingPlayers[t],n=document.createElement("div");n.className="waiting-player-card",n.innerHTML=`<img src="${o.img}" alt="${o.nome}"><p>${o.nome}</p>`,isGm&&(n.classList.add("gm-clickable"),n.title=`Clique para admitir ${o.nome} na batalha`,n.onclick=()=>{socket.emit("playerAction",{type:"gmDecidesOnAdmission",playerId:t,admitted:!0})}),waitingPlayersSidebar.appendChild(n)}}
    function showPartSelectionModal(e,t){let o='<div class="target-part-selection">';t.parts.forEach(e=>{const t="down"===e.status;o+=`\n                <button class="target-part-btn" data-part-key="${e.key}" ${t?"disabled":""}>\n                    ${e.name} (${e.hp}/${e.hpMax})\n                </button>\n            `}),o+="</div>",showInfoModal(`Selecione qual parte de ${t.nome} atacar:`,o,!1),document.querySelectorAll(".target-part-btn").forEach(o=>{o.addEventListener("click",n=>{const a=n.currentTarget.dataset.partKey;actionButtonsWrapper.querySelectorAll("button").forEach(e=>e.disabled=!0),socket.emit("playerAction",{type:"attack",attackerKey:e,targetKey:t.id,targetPartKey:a}),cancelTargeting(),modal.classList.add("hidden")})})}
    function handleTargetClick(e){if(!isFreeMoveModeActive&&isTargeting&&targetingAttackerKey){const t=e.target.closest(".char-container.targetable");if(t){const e=t.dataset.key,o=getFighter(currentGameState,e);o&&o.isMultiPart?showPartSelectionModal(targetingAttackerKey,o):(actionButtonsWrapper.querySelectorAll("button").forEach(e=>e.disabled=!0),socket.emit("playerAction",{type:"attack",attackerKey:targetingAttackerKey,targetKey:e}),cancelTargeting())}}}
    function showCheatModal(){let e=`<div class="cheat-menu">\n            <button id="cheat-add-npc-btn" class="mode-btn">Adicionar Inimigo em Slot</button>\n        </div>`;showInfoModal("Cheats",e,!1),document.getElementById("cheat-add-npc-btn").addEventListener("click",handleCheatAddNpc)}
    function handleCheatAddNpc(){if(!currentGameState||!currentGameState.npcSlots)return;const{npcSlots:e}=currentGameState;let t=`<p>Selecione o slot para adicionar/substituir:</p><div class="npc-selection-container">`;let o=!1;for(let n=0;n<MAX_NPCS;n++){const a=e[n],l=getFighter(currentGameState,a);l&&"down"!==l.status&&"fled"!==l.status?t+=`<div class="npc-card disabled">\n                               <img src="${l.img}">\n                               <div class="char-name">${l.nome} (Ocupado)</div>\n                           </div>`: (o=!0,t+=`<div class="npc-card cheat-npc-slot" data-slot-index="${n}">\n                               ${l?`<img src="${l.img}" style="filter: grayscale(100%);">`:""}\n                               <div class="char-name">${l?`${l.nome} (Vago)`:`Slot Vazio ${n+1}`}</div>\n                           </div>`)}t+="</div>",o? (showInfoModal("Selecionar Slot",t,!1),document.querySelectorAll(".cheat-npc-slot").forEach(e=>{e.addEventListener("click",t=>{const o=t.currentTarget.dataset.slotIndex;void 0!==o&&selectNpcForSlot(o)})})) :showInfoModal("Erro","Todos os slots de inimigos estão ocupados por combatentes ativos.")}
    function selectNpcForSlot(e){let t=`<p>Selecione o novo inimigo para o Slot ${parseInt(e,10)+1}:</p>\n                       <div class="npc-selection-container" style="max-height: 300px;">`;(ALL_CHARACTERS.npcs||[]).forEach(e=>{t+=`<div class="npc-card cheat-npc-card" data-name="${e.name}" data-img="${e.img}" data-scale="${e.scale||1}">\n                           <img src="${e.img}" alt="${e.name}">\n                           <div class="char-name">${e.name}</div>\n                       </div>`}),t+="</div>",showInfoModal("Selecionar Novo Inimigo",t,!1),document.querySelectorAll(".cheat-npc-card").forEach(t=>{t.addEventListener("click",()=>{const o={name:t.dataset.name,img:t.dataset.img,scale:parseFloat(t.dataset.scale)};socket.emit("playerAction",{type:"gmSetsNpcInSlot",slotIndex:e,npcData:o}),modal.classList.add("hidden")})})}
    function makeFightersDraggable(e){document.querySelectorAll("#fight-screen .char-container").forEach(t=>{e?t.addEventListener("mousedown",onFighterMouseDown):t.removeEventListener("mousedown",onFighterMouseDown)}),document.body.classList.toggle("is-draggable",e)}
    function onFighterMouseDown(e){if(isFreeMoveModeActive&&0===e.button){draggedFighter.element=e.currentTarget;const t=draggedFighter.element.getBoundingClientRect(),o=getGameScale();draggedFighter.offsetX=(e.clientX-t.left)/o,draggedFighter.offsetY=(e.clientY-t.top)/o,window.addEventListener("mousemove",onFighterMouseMove),window.addEventListener("mouseup",onFighterMouseUp)}}
    function onFighterMouseMove(e){if(draggedFighter.element){e.preventDefault();const t=gameWrapper.getBoundingClientRect(),o=getGameScale(),n=(e.clientX-t.left)/o-draggedFighter.offsetX,a=(e.clientY-t.top)/o-draggedFighter.offsetY;draggedFighter.element.style.left=`${n}px`,draggedFighter.element.style.top=`${a}px`}}
    function onFighterMouseUp(){draggedFighter.element&&(socket.emit("playerAction",{type:"gmMovesFighter",fighterId:draggedFighter.element.id,position:{left:draggedFighter.element.style.left,top:draggedFighter.element.style.top}})),draggedFighter.element=null,window.removeEventListener("mousemove",onFighterMouseMove),window.removeEventListener("mouseup",onFighterMouseUp)}
    function showHelpModal(){const e='\n            <div style="text-align: left; font-size: 1.2em; line-height: 1.8;">\n                <p><b>C:</b> Abrir menu de Cheats (GM).</p>\n                <p><b>T:</b> Mostrar/Ocultar coordenadas do mouse.</p>\n                <p><b>J:</b> Ativar/Desativar modo de arrastar personagens (GM).</p>\n            </div>\n        ';showInfoModal("Atalhos do Teclado",e)}
    function initializeTheaterMode(){localWorldScale=1,theaterWorldContainer.style.transform="scale(1)",theaterBackgroundViewport.scrollLeft=0,theaterBackgroundViewport.scrollTop=0,theaterCharList.innerHTML="";const e=t=>{const o=document.createElement("div");o.className="theater-char-mini",o.style.backgroundImage=`url("${t.img}")`,o.title=t.name,o.draggable=!0,o.addEventListener("dragstart",e=>{isGm&&e.dataTransfer.setData("application/json",JSON.stringify({charName:t.name,img:t.img}))}),theaterCharList.appendChild(o)};[...(ALL_CHARACTERS.players||[]),...(ALL_CHARACTERS.npcs||[]),...(ALL_CHARACTERS.dynamic||[])].forEach(t=>e(t))}
    function renderTheaterMode(e){if(!isDragging){const t=e.scenarioStates?.[e.currentScenario],o=isGm?t:e.publicState;if(o&&o.scenario){const n=`images/${o.scenario}`;if(!theaterBackgroundImage.src.includes(o.scenario)){const e=new Image;e.onload=()=>{theaterBackgroundImage.src=e.src,theaterWorldContainer.style.width=`${e.naturalWidth}px`,theaterWorldContainer.style.height=`${e.naturalHeight}px`,isGm&&socket.emit("playerAction",{type:"update_scenario_dims",width:e.naturalWidth,height:e.naturalHeight})},e.src=n}document.getElementById("theater-gm-panel").classList.toggle("hidden",!isGm),document.getElementById("toggle-gm-panel-btn").classList.toggle("hidden",!isGm),document.getElementById("theater-publish-btn").classList.toggle("hidden",!isGm||!t?.isStaging),isGm&&t&&(theaterGlobalScale.value=t.globalTokenScale||1),theaterTokenContainer.innerHTML="";const a=document.createDocumentFragment();(o.tokenOrder||[]).forEach((e,t)=>{const n=o.tokens[e];if(n){const l=document.createElement("img");l.id=e,l.className="theater-token",l.src=n.img,l.style.left=`${n.x}px`,l.style.top=`${n.y}px`,l.style.zIndex=t,l.dataset.scale=n.scale||1,l.dataset.flipped=String(!!n.isFlipped),l.title=n.charName;const s=o.globalTokenScale||1,i=parseFloat(l.dataset.scale),c="true"===l.dataset.flipped;l.style.transform=`scale(${i*s}) ${c?"scaleX(-1)":""}`,isGm&&(selectedTokens.has(e)&&l.classList.add("selected"),l.addEventListener("mouseenter",()=>hoveredTokenId=e),l.addEventListener("mouseleave",()=>hoveredTokenId=null)),a.appendChild(l)}}),theaterTokenContainer.appendChild(a)}}}
    
    function setupTheaterEventListeners() {
        theaterBackgroundViewport.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            dragStartPos = { x: e.clientX, y: e.clientY };

            if (isGm) {
                const tokenElement = e.target.closest('.theater-token');
                if (isGroupSelectMode && !tokenElement) {
                    isSelectingBox = true;
                    selectionBoxStartPos = { x: e.clientX, y: e.clientY };
                    const gameScale = getGameScale();
                    const viewportRect = theaterBackgroundViewport.getBoundingClientRect();
                    const startX = (e.clientX - viewportRect.left) / gameScale;
                    const startY = (e.clientY - viewportRect.top) / gameScale;
                    Object.assign(selectionBox.style, { left: `${startX}px`, top: `${startY}px`, width: '0px', height: '0px' });
                    selectionBox.classList.remove('hidden');
                    return;
                }

                if (tokenElement) {
                    isDragging = true;
                    if (!e.ctrlKey && !selectedTokens.has(tokenElement.id)) {
                        selectedTokens.clear();
                        selectedTokens.add(tokenElement.id);
                    } else if (e.ctrlKey) {
                        if (selectedTokens.has(tokenElement.id)) {
                            selectedTokens.delete(tokenElement.id);
                        } else {
                            selectedTokens.add(tokenElement.id);
                        }
                    }
                    dragOffsets.clear();
                    selectedTokens.forEach(id => {
                        const tokenData = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[id];
                        if (tokenData) {
                           dragOffsets.set(id, { startX: tokenData.x, startY: tokenData.y });
                        }
                    });
                    renderTheaterMode(currentGameState);
                } else if (!isGroupSelectMode) {
                    if (selectedTokens.size > 0) {
                        selectedTokens.clear();
                        renderTheaterMode(currentGameState);
                    }
                    isPanning = true;
                }
            } else {
                isPanning = true;
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (isGm && isDragging) {
                e.preventDefault();
                requestAnimationFrame(() => {
                    const gameScale = getGameScale();
                    const deltaX = (e.clientX - dragStartPos.x) / gameScale / localWorldScale;
                    const deltaY = (e.clientY - dragStartPos.y) / gameScale / localWorldScale;
                    selectedTokens.forEach(id => {
                        const tokenEl = document.getElementById(id);
                        const initialPos = dragOffsets.get(id);
                        if (tokenEl && initialPos) {
                            tokenEl.style.left = `${initialPos.startX + deltaX}px`;
                            tokenEl.style.top = `${initialPos.startY + deltaY}px`;
                        }
                    });
                });
            } else if (isGm && isSelectingBox) {
                e.preventDefault();
                const gameScale = getGameScale();
                const viewportRect = theaterBackgroundViewport.getBoundingClientRect();
                const currentX = (e.clientX - viewportRect.left) / gameScale;
                const currentY = (e.clientY - viewportRect.top) / gameScale;
                const startX = (selectionBoxStartPos.x - viewportRect.left) / gameScale;
                const startY = (selectionBoxStartPos.y - viewportRect.top) / gameScale;
                const left = Math.min(currentX, startX);
                const top = Math.min(currentY, startY);
                const width = Math.abs(currentX - startX);
                const height = Math.abs(currentY - startY);
                Object.assign(selectionBox.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
            } else if (isPanning) {
                 e.preventDefault();
                 theaterBackgroundViewport.scrollLeft -= e.movementX;
                 theaterBackgroundViewport.scrollTop -= e.movementY;
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (isGm && isDragging) {
                isDragging = false;
                const gameScale = getGameScale();
                const deltaX = (e.clientX - dragStartPos.x) / gameScale / localWorldScale;
                const deltaY = (e.clientY - dragStartPos.y) / gameScale / localWorldScale;
                selectedTokens.forEach(id => {
                    const initialPos = dragOffsets.get(id);
                    if(initialPos) {
                        const finalX = initialPos.startX + deltaX;
                        const finalY = initialPos.startY + deltaY;
                        socket.emit('playerAction', { type: 'updateToken', token: { id: id, x: finalX, y: finalY } });
                    }
                });
            } else if (isGm && isSelectingBox) {
                const boxRect = selectionBox.getBoundingClientRect();
                isSelectingBox = false;
                selectionBox.classList.add('hidden');
                if (!e.ctrlKey) {
                    selectedTokens.clear();
                }
                document.querySelectorAll('.theater-token').forEach(token => {
                    const tokenRect = token.getBoundingClientRect();
                    if (boxRect.left < tokenRect.right && boxRect.right > tokenRect.left && boxRect.top < tokenRect.bottom && boxRect.bottom > tokenRect.top) {
                         if (e.ctrlKey && selectedTokens.has(token.id)) {
                             selectedTokens.delete(token.id);
                         } else {
                             selectedTokens.add(token.id);
                         }
                    }
                });
                renderTheaterMode(currentGameState);
            }
            isPanning = false;
        });

        theaterBackgroundViewport.addEventListener('drop', (e) => {
            e.preventDefault(); 
            if (!isGm) return;
            try {
                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                const tokenWidth = 200;
                const gameScale = getGameScale();
                const viewportRect = theaterBackgroundViewport.getBoundingClientRect();
                const finalX = ((e.clientX - viewportRect.left) / gameScale + theaterBackgroundViewport.scrollLeft) / localWorldScale - (tokenWidth / 2);
                const finalY = ((e.clientY - viewportRect.top) / gameScale + theaterBackgroundViewport.scrollTop) / localWorldScale - (tokenWidth / 2);
                socket.emit('playerAction', { type: 'updateToken', token: { id: `token-${Date.now()}`, charName: data.charName, img: data.img, x: finalX, y: finalY, scale: 1.0, isFlipped: false }});
            } catch (error) { console.error("Drop error:", error); }
        });

        theaterBackgroundViewport.addEventListener('dragover', (e) => e.preventDefault());

        theaterBackgroundViewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (isGm && hoveredTokenId && selectedTokens.has(hoveredTokenId)) {
                const tokenData = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[hoveredTokenId];
                if (tokenData) {
                    const newScale = (tokenData.scale || 1.0) + (e.deltaY > 0 ? -0.1 : 0.1);
                    selectedTokens.forEach(id => {
                        socket.emit('playerAction', { type: 'updateToken', token: { id: id, scale: Math.max(0.1, newScale) }});
                    });
                }
            } else {
                const zoomIntensity = 0.05;
                const scrollDirection = e.deltaY < 0 ? 1 : -1;
                const newScale = Math.max(0.2, Math.min(localWorldScale + (zoomIntensity * scrollDirection), 5));
                const rect = theaterBackgroundViewport.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                const worldX = (mouseX + theaterBackgroundViewport.scrollLeft) / localWorldScale;
                const worldY = (mouseY + theaterBackgroundViewport.scrollTop) / localWorldScale;
                localWorldScale = newScale;
                theaterWorldContainer.style.transform = `scale(${localWorldScale})`;
                const newScrollLeft = worldX * localWorldScale - mouseX;
                const newScrollTop = worldY * localWorldScale - mouseY;
                theaterBackgroundViewport.scrollLeft = newScrollLeft;
                theaterBackgroundViewport.scrollTop = newScrollTop;
            }
        }, { passive: false });

        theaterGlobalScale.addEventListener('change', (e) => {
             if (!isGm) return;
             socket.emit('playerAction', {type: 'updateGlobalScale', scale: parseFloat(e.target.value)});
        });
    }

    function initializeGlobalKeyListeners() {
        window.addEventListener('keydown', (e) => {
            if (!currentGameState) return;
            if (currentGameState.mode === 'adventure' && isTargeting && e.key === 'Escape') {
                cancelTargeting();
                return;
            }

            const focusedEl = document.activeElement;
            if (focusedEl.tagName === 'INPUT' || focusedEl.tagName === 'TEXTAREA') {
                return;
            }
            
            if (e.key.toLowerCase() === 'c' && isGm && currentGameState.mode === 'adventure') {
                e.preventDefault();
                showCheatModal();
            }

            if (e.key.toLowerCase() === 't') {
                e.preventDefault();
                coordsModeActive = !coordsModeActive;
                coordsDisplay.classList.toggle('hidden', !coordsModeActive);
            }
            
            if (isGm && currentGameState.mode === 'adventure' && e.key.toLowerCase() === 'j') {
                e.preventDefault();
                isFreeMoveModeActive = !isFreeMoveModeActive;
                makeFightersDraggable(isFreeMoveModeActive);
                showInfoModal("Modo de Movimento", `Modo de movimento livre ${isFreeMoveModeActive ? 'ATIVADO' : 'DESATIVADO'}.`);
            }

            if (currentGameState.mode !== 'theater' || !isGm) return;
            
            if(e.key.toLowerCase() === 'g') {
                e.preventDefault();
                isGroupSelectMode = !isGroupSelectMode;
                theaterBackgroundViewport.classList.toggle('group-select-mode', isGroupSelectMode);
                if (!isGroupSelectMode) {
                    isSelectingBox = false;
                    selectionBox.classList.add('hidden');
                }
            }

            const targetId = hoveredTokenId || (selectedTokens.size === 1 ? selectedTokens.values().next().value : null);
            if (e.key.toLowerCase() === 'f' && targetId) {
                e.preventDefault();
                const tokenData = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[targetId];
                if (tokenData) socket.emit('playerAction', { type: 'updateToken', token: { id: targetId, isFlipped: !tokenData.isFlipped } });
            } else if (e.key.toLowerCase() === 'o' && targetId) {
                e.preventDefault();
                socket.emit('playerAction', { type: 'updateToken', token: { id: targetId, scale: 1.0 } });
            } else if (e.key === 'Delete' && selectedTokens.size > 0) {
                e.preventDefault();
                socket.emit('playerAction', { type: 'updateToken', token: { remove: true, ids: Array.from(selectedTokens) } });
                selectedTokens.clear();
            } else if (selectedTokens.size === 1 && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault();
                const tokenId = selectedTokens.values().next().value;
                const currentOrder = [...currentGameState.scenarioStates[currentGameState.currentScenario].tokenOrder];
                const currentIndex = currentOrder.indexOf(tokenId);
                
                if (e.key === 'ArrowUp' && currentIndex < currentOrder.length - 1) {
                    [currentOrder[currentIndex], currentOrder[currentIndex + 1]] = [currentOrder[currentIndex + 1], currentOrder[currentIndex]];
                    socket.emit('playerAction', { type: 'updateTokenOrder', order: currentOrder });
                } else if (e.key === 'ArrowDown' && currentIndex > 0) {
                    [currentOrder[currentIndex], currentOrder[currentIndex - 1]] = [currentOrder[currentIndex - 1], currentOrder[currentIndex]];
                    socket.emit('playerAction', { type: 'updateTokenOrder', order: currentOrder });
                }
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!coordsModeActive) return;
            const gameWrapperRect = gameWrapper.getBoundingClientRect();
            const gameScale = getGameScale();
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            const gameX = Math.round((mouseX - gameWrapperRect.left) / gameScale);
            const gameY = Math.round((mouseY - gameWrapperRect.top) / gameScale);
            coordsDisplay.innerHTML = `X: ${gameX}<br>Y: ${gameY}`;
        });
    }

    function showScenarioSelectionModal(){let e='<div class="category-tabs">';const t=Object.keys(ALL_SCENARIOS);t.forEach((t,o)=>{e+=`<button class="category-tab-btn ${0===o?"active":""}" data-category="${t}">${t.replace(/_/g," ")}</button>`}),e+="</div>",t.forEach((t,o)=>{e+=`<div class="scenarios-grid ${0===o?"active":""}" id="grid-${t}">`,ALL_SCENARIOS[t].forEach(t=>{const o=t.split("/").pop().replace(".png","").replace(".jpg","");e+=`<div class="scenario-card" data-path="${t}"><img src="images/mapas/${t}" alt="${o}"><div class="scenario-name">${o}</div></div>`}),e+="</div>"}),showInfoModal("Mudar Cenário",e,!1),document.querySelectorAll(".category-tab-btn").forEach(e=>{e.addEventListener("click",()=>{document.querySelectorAll(".category-tab-btn, .scenarios-grid").forEach(e=>e.classList.remove("active")),e.classList.add("active"),document.getElementById(`grid-${e.dataset.category}`).classList.add("active")})}),document.querySelectorAll(".scenario-card").forEach(e=>{e.addEventListener("click",()=>{const t=e.dataset.path;socket.emit("playerAction",{type:"changeScenario",scenario:t}),modal.classList.add("hidden")})})}
    
    // --- LÓGICA DA FICHA DE PERSONAGEM (NOVO) ---
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
                renderSpellSelection(playerElements); // Re-renderiza para atualizar o estado visual
            });

            spellGrid.appendChild(card);
        });
    }


    function updateCharacterSheet() {
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
        
        // --- CÁLCULOS E VALIDAÇÕES ---
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
            if (points === 2) {
                advancedDisplay.textContent = GAME_RULES.advancedElements[elem];
            } else {
                advancedDisplay.textContent = "";
            }
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
        
        const canOneHand2H = sheet.finalAttributes.forca >= 4;
        const w2Select = document.getElementById('sheet-weapon2-type');
        const shieldSelect = document.getElementById('sheet-shield-type');

        const w1BlocksW2 = (sheet.equipment.weapon1.hand === 2 && !canOneHand2H);
        w2Select.disabled = w1BlocksW2 || shieldtype !== 'Nenhum';
        shieldSelect.disabled = (sheet.equipment.weapon1.hand === 2 && !canOneHand2H) || w2type !== 'Desarmado';
        if (w2Select.disabled && w2Select.value !== 'Desarmado') w2Select.value = 'Desarmado';
        if (shieldSelect.disabled && shieldSelect.value !== 'Nenhum') shieldSelect.value = 'Nenhum';
        
        let equipInfo = [];
        if (money < 0) equipInfo.push(`Dinheiro insuficiente!`);
        if (sheet.equipment.shield.req_forca > 0 && sheet.finalAttributes.forca < sheet.equipment.shield.req_forca) equipInfo.push(`Requer ${sheet.equipment.shield.req_forca} Força para o escudo.`);
        if (sheet.equipment.weapon1.hand === 2 && sheet.equipment.weapon2.hand === 2 && !canOneHand2H) equipInfo.push(`Requer 4 Força para usar 2 armas de Duas Mãos.`);

        const isAmbidextrous = w1type !== 'Desarmado' && w2type !== 'Desarmado';
        let bta = sheet.finalAttributes.agilidade;
        let btd = sheet.finalAttributes.forca;
        let btm = sheet.finalAttributes.inteligencia;

        const w1Data = sheet.equipment.weapon1;
        const w2Data = sheet.equipment.weapon2;
        if(w1Data){
            let finalBTA1 = w1Data.bta;
            let finalBTD1 = w1Data.btd;
            if (isAmbidextrous) {
                finalBTA1 += w1Data.ambi_bta_mod;
                finalBTD1 += w1Data.ambi_btd_mod;
            }
            if(w1Data.hand === 2 && canOneHand2H) finalBTA1 += w1Data.one_hand_bta_mod || 0;
            bta += finalBTA1;
            btd += finalBTD1;
            btm += w1Data.btm || 0;
        }
        if(isAmbidextrous && w2Data){
             let finalBTA2 = w2Data.bta + w2Data.ambi_bta_mod;
             let finalBTD2 = w2Data.btd + w2Data.ambi_btd_mod;
             if(w2Data.hand === 2 && canOneHand2H) finalBTA2 += w2Data.one_hand_bta_mod || 0;
             bta += finalBTA2;
             btd += finalBTD2;
             if((w2Data.btm || 0) > (w1Data.btm || 0)) btm += (w2Data.btm || 0);
        }
        
        // --- RENDERIZAÇÃO NA UI ---
        document.getElementById('sheet-final-attr-forca').textContent = sheet.finalAttributes.forca;
        document.getElementById('sheet-final-attr-agilidade').textContent = sheet.finalAttributes.agilidade;
        document.getElementById('sheet-final-attr-protecao').textContent = sheet.finalAttributes.protecao;
        document.getElementById('sheet-final-attr-constituicao').textContent = sheet.finalAttributes.constituicao;
        document.getElementById('sheet-final-attr-inteligencia').textContent = sheet.finalAttributes.inteligencia;
        document.getElementById('sheet-final-attr-mente').textContent = sheet.finalAttributes.mente;
        
        document.getElementById('sheet-hp-max').textContent = sheet.hpMax;
        document.getElementById('sheet-hp-current').textContent = sheet.hpMax;
        document.getElementById('sheet-mahou-max').textContent = sheet.mahouMax;
        document.getElementById('sheet-mahou-current').textContent = sheet.mahouMax;

        document.getElementById('race-info-box').textContent = raceData.text;
        document.getElementById('equipment-info-text').textContent = equipInfo.length > 0 ? equipInfo.join(' ') : 'Tudo certo com seus equipamentos.';
        document.getElementById('sheet-money-copper').textContent = Math.max(0, money);

        document.getElementById('sheet-bta').textContent = (bta >= 0 ? '+' : '') + bta;
        document.getElementById('sheet-btd').textContent = (btd >= 0 ? '+' : '') + btd;
        document.getElementById('sheet-btm').textContent = (btm >= 0 ? '+' : '') + btm;
    }

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
        
        const justEnteredTheater = gameState.mode === 'theater' && (!currentGameState || currentGameState.mode !== 'theater');
        oldGameState = currentGameState;
        currentGameState = gameState;

        if (!gameState || !gameState.mode || !gameState.connectedPlayers) {
            showScreen(document.getElementById('loading-screen'));
            return;
        }

        if(gameState.mode === 'adventure' && gameState.customPositions){
            customFighterPositions = gameState.customPositions;
        }

        const myPlayerData = gameState.connectedPlayers?.[socket.id];
        
        if (myRole === 'player' && myPlayerData && !myPlayerData.characterFinalized) {
            return; 
        }
        
        if (gameState.mode === 'adventure' && gameState.scenario) {
             gameWrapper.style.backgroundImage = `url('images/${gameState.scenario}')`;
        } else if (gameState.mode === 'lobby') {
             gameWrapper.style.backgroundImage = `url('images/mapas/cenarios externos/externo (1).png')`;
        } else {
            gameWrapper.style.backgroundImage = 'none';
        }

        turnOrderSidebar.classList.add('hidden');
        floatingButtonsContainer.classList.add('hidden');
        waitingPlayersSidebar.classList.add('hidden');
        backToLobbyBtn.classList.add('hidden');

        if (isGm && (gameState.mode === 'adventure' || gameState.mode === 'theater')) {
            floatingButtonsContainer.classList.remove('hidden');
            backToLobbyBtn.classList.remove('hidden');
            const switchBtn = document.getElementById('floating-switch-mode-btn');
            if(gameState.mode === 'adventure') {
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
                if (justEnteredTheater) initializeTheaterMode();
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
        
        while(gameStateQueue.length > 0) {
            const state = gameStateQueue.shift();
            renderGame(state);
        }
    });

    socket.on('gameUpdate', (gameState) => {
        if (clientFlowState === 'choosing_role') return;
        renderGame(gameState);
    });
    
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
            const baseUrl = window.location.origin;
            const inviteLinkEl = document.getElementById('gm-link-invite');
            const inviteUrl = `${baseUrl}?room=${roomId}`;
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
        myRole = data.role;
        myPlayerKey = data.playerKey || null;
        isGm = !!data.isGm;
        myRoomId = data.roomId;
        clientFlowState = 'in_game';

        if (myRole === 'player') {
            showScreen(document.getElementById('player-initial-choice-screen'));
        }
    });

    socket.on('gmPromptToAdmit', ({ playerId, character }) => {
        if (!isGm) return;
        showConfirmationModal('Novo Jogador', `${character.nome} deseja entrar na batalha. Permitir?`, (admitted) => {
            socket.emit('playerAction', { type: 'gmDecidesOnAdmission', playerId, admitted });
        });
    });
    
    socket.on('promptForAdventureType', () => {
        if (!isGm) return;
        showConfirmationModal(
            'Retornar à Aventura',
            'Deseja continuar a aventura anterior ou começar uma nova batalha?',
            (continuar) => {
                const choice = continuar ? 'continue' : 'new';
                socket.emit('playerAction', { type: 'gmChoosesAdventureType', choice });
            },
            'Continuar Batalha',
            'Nova Batalha'
        );
    });

    socket.on('attackResolved', ({ attackerKey, targetKey, hit }) => {
        const attackerEl = document.getElementById(attackerKey);
        const targetEl = document.getElementById(targetKey);

        if (attackerEl) {
            const isPlayer = attackerEl.classList.contains('player-char-container');
            const originalLeft = attackerEl.style.left;
            const lungeAmount = isPlayer ? 200 : -200;
            
            attackerEl.style.left = `${parseFloat(originalLeft) + lungeAmount}px`;
            
            setTimeout(() => {
                attackerEl.style.left = originalLeft;
            }, 500);
        }

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
        if (actorEl) {
            const isPlayer = actorEl.classList.contains('player-char-container');
            actorEl.classList.add(isPlayer ? 'is-fleeing-player' : 'is-fleeing-npc');
        }
    });

    socket.on('error', (data) => showInfoModal('Erro', data.message));
    
    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoomId = urlParams.get('room');
        
        showScreen(document.getElementById('loading-screen')); 

        if (urlRoomId) {
            socket.emit('playerJoinsLobby', { roomId: urlRoomId });
        } else {
            socket.emit('gmCreatesLobby');
        }

        document.getElementById('join-as-player-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'player' }));
        document.getElementById('join-as-spectator-btn').addEventListener('click', () => socket.emit('playerChoosesRole', { role: 'spectator' }));
        document.getElementById('new-char-btn').addEventListener('click', () => {
            showScreen(document.getElementById('selection-screen'));
            renderPlayerTokenSelection();
        });
        document.getElementById('load-char-btn').addEventListener('click', () => document.getElementById('load-char-input').click());
        document.getElementById('load-char-input').addEventListener('change', handleLoadCharacter);

        document.querySelectorAll('#character-sheet-screen input, #character-sheet-screen select').forEach(el => {
            el.addEventListener('change', updateCharacterSheet);
            el.addEventListener('input', updateCharacterSheet);
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
        
        if (floatingHelpBtn) {
            floatingHelpBtn.addEventListener('click', showHelpModal);
        }

        setupTheaterEventListeners();
        initializeGlobalKeyListeners();
        window.addEventListener('resize', scaleGame);
        scaleGame();
    }
    
    initialize();
});