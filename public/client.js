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
    // ... (restante das variáveis de estado)
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
    // ... (restante dos elementos do DOM)

    // --- FUNÇÕES DE UTILIDADE ---
    // ... (funções de utilidade como scaleGame, showScreen, modals, etc., permanecem as mesmas)
    function scaleGame(){setTimeout(()=>{const e=Math.min(window.innerWidth/1280,window.innerHeight/720);gameWrapper.style.transform=`scale(${e})`,gameWrapper.style.left=`${(window.innerWidth-1280*e)/2}px`,gameWrapper.style.top=`${(window.innerHeight-720*e)/2}px`},10)}
    function showScreen(e){allScreens.forEach(t=>t.classList.toggle("active",t===e))}
    function showInfoModal(e,t,o=!0){document.getElementById("modal-title").innerText=e,document.getElementById("modal-text").innerHTML=t;const n=document.getElementById("modal-content").querySelector(".modal-button-container");n&&n.remove(),document.getElementById("modal-button").classList.toggle("hidden",!o),modal.classList.remove("hidden"),document.getElementById("modal-button").onclick=()=>modal.classList.add("hidden")}
    function showConfirmationModal(e,t,o,n="Sim",a="Não"){const l=document.getElementById("modal-content"),s=document.getElementById("modal-text");document.getElementById("modal-title").innerText=e,s.innerHTML=`<p>${t}</p>`;const i=l.querySelector(".modal-button-container");i&&i.remove();const c=document.createElement("div");c.className="modal-button-container";const d=document.createElement("button");d.textContent=n,d.onclick=()=>{o(!0),modal.classList.add("hidden")};const r=document.createElement("button");r.textContent=a,r.onclick=()=>{o(!1),modal.classList.add("hidden")},c.appendChild(d),c.appendChild(r),l.appendChild(c),document.getElementById("modal-button").classList.add("hidden"),modal.classList.remove("hidden")}
    function getGameScale(){return"none"===window.getComputedStyle(gameWrapper).transform?1:(new DOMMatrix(window.getComputedStyle(gameWrapper).transform)).a}
    function copyToClipboard(e,t){t&&navigator.clipboard.writeText(e).then(()=>{const o=t.innerHTML,n="BUTTON"===t.tagName;t.innerHTML="Copiado!",n&&(t.style.fontSize="14px"),setTimeout(()=>{t.innerHTML=o,n&&(t.style.fontSize="24px")},2e3)})}
    function cancelTargeting(){isTargeting=!1,targetingAttackerKey=null,document.getElementById("targeting-indicator").classList.add("hidden")}
    function getFighter(e,t){return e&&e.fighters&&t?e.fighters.players[t]||e.fighters.npcs[t]:null}
    
    // --- LÓGICA ANTIGA (A SER ATUALIZADA) ---
    function handleAdventureMode(e){const t=document.getElementById("fight-screen");if(isGm)switch(e.phase){case"party_setup":showScreen(document.getElementById("gm-party-setup-screen")),updateGmPartySetupScreen(e);break;case"npc_setup":showScreen(document.getElementById("gm-npc-setup-screen")),oldGameState&&"npc_setup"===oldGameState.phase||(stagedNpcSlots.fill(null),selectedSlotIndex=null,customFighterPositions={},renderNpcSelectionForGm());break;case"initiative_roll":case"battle":default:showScreen(t),updateAdventureUI(e),"initiative_roll"===e.phase?renderInitiativeUI(e):document.getElementById("initiative-ui").classList.add("hidden")}else{getFighter(e,myPlayerKey)?"party_setup"!==e.phase&&"npc_setup"!==e.phase?(showScreen(t),updateAdventureUI(e),"initiative_roll"===e.phase?renderInitiativeUI(e):document.getElementById("initiative-ui").classList.add("hidden")):(showScreen(document.getElementById("player-waiting-screen")),document.getElementById("player-waiting-message").innerText="O Mestre está preparando a aventura..."):(showScreen(document.getElementById("player-waiting-screen")),document.getElementById("player-waiting-message").innerText="Aguardando o Mestre...")}}
    function updateGmLobbyUI(e){const t=document.getElementById("gm-lobby-player-list");if(t&&e&&e.connectedPlayers){t.innerHTML="";const o=Object.values(e.connectedPlayers);0===o.length?t.innerHTML="<li>Aguardando jogadores...</li>":o.forEach(e=>{const o=e.characterName||"<i>Criando ficha...</i>";t.innerHTML+=`<li>${"player"===e.role?"Jogador":"Espectador"} - Personagem: ${o}</li>`})}}
    
    // --- LÓGICA DA FICHA DE PERSONAGEM (NOVO) ---
    // ... (O resto do código permanece o mesmo até a função `updateCharacterSheet`)

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

    // A partir daqui, as funções antigas serão mantidas para compatibilidade, mas a lógica da ficha será a principal.
    // ... (código existente de `updateGmPartySetupScreen` até `showHelpModal` fica aqui)
    function updateGmPartySetupScreen(state){const partyList=document.getElementById("gm-party-list");partyList.innerHTML="",state.fighters&&state.fighters.players&&(Object.values(state.fighters.players).forEach(player=>{const playerDiv=document.createElement("div");playerDiv.className="party-member-card",playerDiv.dataset.id=player.id,playerDiv.innerHTML=`<img src="${player.img}" alt="${player.nome}"><h4>${player.nome}</h4><label>AGI: <input type="number" class="agi-input" value="${player.agi||2}"></label><label>RES: <input type="number" class="res-input" value="${player.res||3}"></label>`,partyList.appendChild(playerDiv)}),document.getElementById("gm-confirm-party-btn").onclick=()=>{const playerStats=[];document.querySelectorAll("#gm-party-list .party-member-card").forEach(card=>{playerStats.push({id:card.dataset.id,agi:parseInt(card.querySelector(".agi-input").value,10),res:parseInt(card.querySelector(".res-input").value,10)})}),socket.emit("playerAction",{type:"gmConfirmParty",playerStats})})}
    function renderNpcSelectionForGm(){const e=document.getElementById("npc-selection-area");e.innerHTML="",(ALL_CHARACTERS.npcs||[]).forEach(t=>{const o=document.createElement("div");o.className="npc-card",o.innerHTML=`<img src="${t.img}" alt="${t.name}"><div class="char-name">${t.name}</div>`,o.addEventListener("click",()=>{let o=selectedSlotIndex;null===o&&(o=stagedNpcSlots.findIndex(e=>null===e)),-1!==o&&null!==o?(stagedNpcSlots[o]={...t,id:`npc-${Date.now()}-${o}`},selectedSlotIndex=null,renderNpcStagingArea()):stagedNpcSlots.every(e=>null!==e)?alert("Todos os slots estão cheios. Remova um inimigo para adicionar outro."):alert("Primeiro, clique em um slot vago abaixo para posicionar o inimigo.")}),e.appendChild(o)}),renderNpcStagingArea(),document.getElementById("gm-start-battle-btn").onclick=()=>{const e=stagedNpcSlots.map((e,t)=>e?{...e,slotIndex:t}:null).filter(e=>null!==e);0===e.length?alert("Adicione pelo menos um inimigo para a batalha."):socket.emit("playerAction",{type:"gmStartBattle",npcs:e})}}
    function renderNpcStagingArea(){const e=document.getElementById("npc-staging-area");e.innerHTML="";for(let t=0;t<MAX_NPCS;t++){const o=document.createElement("div");o.className="npc-slot";const n=stagedNpcSlots[t];n?(o.innerHTML=`<img src="${n.img}" alt="${n.name}"><button class="remove-staged-npc" data-index="${t}">X</button>`,o.querySelector(".remove-staged-npc").addEventListener("click",e=>{e.stopPropagation();const o=parseInt(e.target.dataset.index,10);stagedNpcSlots[o]=null,selectedSlotIndex===o&&(selectedSlotIndex=null),renderNpcStagingArea()})):(o.classList.add("empty-slot"),o.innerHTML=`<span>Slot ${t+1}</span>`,o.dataset.index=t,o.addEventListener("click",e=>{const t=parseInt(e.currentTarget.dataset.index,10);selectedSlotIndex=selectedSlotIndex===t?null:t,renderNpcStagingArea()})),selectedSlotIndex===t&&o.classList.add("selected-slot"),e.appendChild(o)}}
    function updateAdventureUI(e){if(e&&e.fighters){fightSceneCharacters.innerHTML="",document.getElementById("round-info").textContent=`ROUND ${e.currentRound}`,document.getElementById("fight-log").innerHTML=(e.log||[]).map(e=>`<p class="log-${e.type||"info"}">${e.text}</p>`).join("");const t=[{left:"150px",top:"500px"},{left:"250px",top:"400px"},{left:"350px",top:"300px"},{left:"450px",top:"200px"}],o=[{left:"1000px",top:"500px"},{left:"900px",top:"400px"},{left:"800px",top:"300px"},{left:"700px",top:"200px"},{left:"950px",top:"350px"}];Object.keys(e.fighters.players).forEach((n,a)=>{const l=e.fighters.players[n];if("fled"!==l.status){const s=e.customPositions[l.id]||t[a],i=createFighterElement(l,"player",e,s);i&&fightSceneCharacters.appendChild(i)}}),(e.npcSlots||[]).forEach((t,n)=>{const a=getFighter(e,t);if(a&&"fled"!==a.status){const l=e.customPositions[a.id]||o[n],s=createFighterElement(a,"npc",e,l);s&&fightSceneCharacters.appendChild(s)}}),renderActionButtons(e),renderTurnOrderUI(e),renderWaitingPlayers(e)}}
    function createFighterElement(e,t,o,n){const a=document.createElement("div");a.className=`char-container ${t}-char-container`,a.id=e.id,a.dataset.key=e.id;const l=e.scale||1;if(n&&(Object.assign(a.style,n),a.style.zIndex=parseInt(n.top,10)),a.style.setProperty("--character-scale",l),oldGameState&&getFighter(oldGameState,e.id),oldGameState&&"active"===getFighter(oldGameState,e.id)?.status&&"down"===e.status&&!defeatAnimationPlayed.has(e.id)?(defeatAnimationPlayed.add(e.id),a.classList.add("player"===t?"animate-defeat-player":"animate-defeat-npc")):"down"===e.status&&a.classList.add("player"===t?"player-defeated-final":"npc-defeated-final"),"active"===e.status){o.activeCharacterKey===e.id&&a.classList.add("active-turn");const l=getFighter(o,o.activeCharacterKey);l&&"active"===l.status&&(!!o.fighters.players[l.id]!=="player"===t&&a.classList.add("targetable"))}a.classList.contains("targetable")&&a.addEventListener("click",handleTargetClick);let s="";if(e.isMultiPart&&e.parts){s='<div class="multi-health-bar-container">';e.parts.forEach(t=>{const o="down"===t.status?"defeated":"";s+=`\n                    <div class="health-bar-ingame-part ${o}" title="${t.name}: ${t.hp}/${t.hpMax}">\n                        <div class="health-bar-ingame-part-fill" style="width: ${t.hp/t.hpMax*100}%"></div>\n                    </div>\n                `}),s+="</div>"}else{const t=e.hp/e.hpMax*100, i = e.mahou/e.mahouMax*100;s=`\n                <div class="health-bar-ingame">\n                    <div class="health-bar-ingame-fill" style="width: ${t}%"></div>\n                    <span class="health-bar-ingame-text">${e.hp}/${e.hpMax}</span>\n                </div>\n            `}return a.innerHTML=`${s}<img src="${e.img}" class="fighter-img-ingame"><div class="fighter-name-ingame">${e.nome}</div>`,a}
    function renderActionButtons(e){if(actionButtonsWrapper.innerHTML="","battle"===e.phase&&!e.winner){const t=getFighter(e,e.activeCharacterKey);if(t){const o=!!e.fighters.npcs[t.id],n="player"===myRole&&e.activeCharacterKey===myPlayerKey||isGm&&o,a=document.createElement("button");a.className="action-btn",a.textContent="Atacar",a.disabled=!n,a.addEventListener("click",()=>{isTargeting=!0,targetingAttackerKey=e.activeCharacterKey,document.getElementById("targeting-indicator").classList.remove("hidden")});const l=document.createElement("button");l.className="action-btn flee-btn",l.textContent="Fugir",l.disabled=!n,l.addEventListener("click",()=>{socket.emit("playerAction",{type:"flee",actorKey:e.activeCharacterKey})});const s=document.createElement("button");s.className="end-turn-btn",s.textContent="Encerrar Turno",s.disabled=!n,s.addEventListener("click",()=>{socket.emit("playerAction",{type:"end_turn",actorKey:e.activeCharacterKey})}),actionButtonsWrapper.appendChild(a),actionButtonsWrapper.appendChild(l),actionButtonsWrapper.appendChild(s)}}}
    function renderInitiativeUI(e){const t=document.getElementById("initiative-ui"),o=document.getElementById("player-roll-initiative-btn"),n=document.getElementById("gm-roll-initiative-btn");t.classList.remove("hidden"),o.classList.add("hidden"),n.classList.add("hidden");const a=getFighter(e,myPlayerKey);"player"===myRole&&a&&"active"===a.status&&!e.initiativeRolls[myPlayerKey]&&(o.classList.remove("hidden"),o.disabled=!1,o.onclick=()=>{o.disabled=!0,socket.emit("playerAction",{type:"roll_initiative"})}),isGm&&Object.values(e.fighters.npcs).some(t=>"active"===t.status&&!e.initiativeRolls[t.id])&&(n.classList.remove("hidden"),n.disabled=!1,n.onclick=()=>{n.disabled=!0,socket.emit("playerAction",{type:"roll_initiative",isGmRoll:!0})})}
    function renderTurnOrderUI(e){const t=document.getElementById("turn-order-sidebar");if("battle"!==e.phase&&"initiative_roll"!==e.phase)return void t.classList.add("hidden");t.innerHTML="",t.classList.remove("hidden");const o=e.turnOrder.map(t=>getFighter(e,t)).filter(e=>e&&"active"===e.status),n=o.findIndex(t=>t.id===e.activeCharacterKey),a=-1===n?o:o.slice(n).concat(o.slice(0,n));a.forEach((e,o)=>{const n=document.createElement("div");n.className="turn-order-card",0===o&&n.classList.add("active-turn-indicator");const a=document.createElement("img");a.src=e.img,a.alt=e.nome,a.title=e.nome,n.appendChild(a),t.appendChild(n)})}
    function renderWaitingPlayers(e){const t=document.getElementById("waiting-players-sidebar");if(t.innerHTML="",!e.waitingPlayers||0===Object.keys(e.waitingPlayers).length)return void t.classList.add("hidden");t.classList.remove("hidden");for(const o in e.waitingPlayers){const n=e.waitingPlayers[o],a=document.createElement("div");a.className="waiting-player-card",a.innerHTML=`<img src="${n.img}" alt="${n.nome}"><p>${n.nome}</p>`,isGm&&(a.classList.add("gm-clickable"),a.title=`Clique para admitir ${n.nome} na batalha`,a.onclick=()=>{socket.emit("playerAction",{type:"gmDecidesOnAdmission",playerId:o,admitted:!0})}),t.appendChild(a)}}
    function showPartSelectionModal(e,t){let o='<div class="target-part-selection">';t.parts.forEach(e=>{const t="down"===e.status;o+=`\n                <button class="target-part-btn" data-part-key="${e.key}" ${t?"disabled":""}>\n                    ${e.name} (${e.hp}/${e.hpMax})\n                </button>\n            `}),o+="</div>",showInfoModal(`Selecione qual parte de ${t.nome} atacar:`,o,!1),document.querySelectorAll(".target-part-btn").forEach(o=>{o.addEventListener("click",n=>{const a=n.currentTarget.dataset.partKey;document.querySelectorAll("#action-buttons-wrapper button").forEach(e=>e.disabled=!0),socket.emit("playerAction",{type:"attack",attackerKey:e,targetKey:t.id,targetPartKey:a}),cancelTargeting(),document.getElementById("modal").classList.add("hidden")})})}
    function handleTargetClick(e){if(!isFreeMoveModeActive&&isTargeting&&targetingAttackerKey){const t=e.target.closest(".char-container.targetable");if(t){const e=t.dataset.key,o=getFighter(currentGameState,e);o&&o.isMultiPart?showPartSelectionModal(targetingAttackerKey,o):(document.querySelectorAll("#action-buttons-wrapper button").forEach(e=>e.disabled=!0),socket.emit("playerAction",{type:"attack",attackerKey:targetingAttackerKey,targetKey:e}),cancelTargeting())}}}
    function showCheatModal(){let e=`<div class="cheat-menu">\n            <button id="cheat-add-npc-btn" class="mode-btn">Adicionar Inimigo em Slot</button>\n        </div>`;showInfoModal("Cheats",e,!1),document.getElementById("cheat-add-npc-btn").addEventListener("click",handleCheatAddNpc)}
    function handleCheatAddNpc(){if(!currentGameState||!currentGameState.npcSlots)return;const{npcSlots:e}=currentGameState;let t=`<p>Selecione o slot para adicionar/substituir:</p><div class="npc-selection-container">`;let o=!1;for(let n=0;n<MAX_NPCS;n++){const a=e[n],l=getFighter(currentGameState,a);l&&"down"!==l.status&&"fled"!==l.status?t+=`<div class="npc-card disabled">\n                               <img src="${l.img}">\n                               <div class="char-name">${l.nome} (Ocupado)</div>\n                           </div>`: (o=!0,t+=`<div class="npc-card cheat-npc-slot" data-slot-index="${n}">\n                               ${l?`<img src="${l.img}" style="filter: grayscale(100%);">`:""}\n                               <div class="char-name">${l?`${l.nome} (Vago)`:`Slot Vazio ${n+1}`}</div>\n                           </div>`)}t+="</div>",o? (showInfoModal("Selecionar Slot",t,!1),document.querySelectorAll(".cheat-npc-slot").forEach(e=>{e.addEventListener("click",t=>{const o=t.currentTarget.dataset.slotIndex;void 0!==o&&selectNpcForSlot(o)})})) :showInfoModal("Erro","Todos os slots de inimigos estão ocupados por combatentes ativos.")}
    function selectNpcForSlot(e){let t=`<p>Selecione o novo inimigo para o Slot ${parseInt(e,10)+1}:</p>\n                       <div class="npc-selection-container" style="max-height: 300px;">`;(ALL_CHARACTERS.npcs||[]).forEach(e=>{t+=`<div class="npc-card cheat-npc-card" data-name="${e.name}" data-img="${e.img}" data-scale="${e.scale||1}">\n                           <img src="${e.img}" alt="${e.name}">\n                           <div class="char-name">${e.name}</div>\n                       </div>`}),t+="</div>",showInfoModal("Selecionar Novo Inimigo",t,!1),document.querySelectorAll(".cheat-npc-card").forEach(t=>{t.addEventListener("click",()=>{const o={name:t.dataset.name,img:t.dataset.img,scale:parseFloat(t.dataset.scale)};socket.emit("playerAction",{type:"gmSetsNpcInSlot",slotIndex:e,npcData:o}),document.getElementById("modal").classList.add("hidden")})})}
    function makeFightersDraggable(e){document.querySelectorAll("#fight-screen .char-container").forEach(t=>{e?t.addEventListener("mousedown",onFighterMouseDown):t.removeEventListener("mousedown",onFighterMouseDown)}),document.body.classList.toggle("is-draggable",e)}
    function onFighterMouseDown(e){if(isFreeMoveModeActive&&0===e.button){draggedFighter.element=e.currentTarget;const t=draggedFighter.element.getBoundingClientRect(),o=getGameScale();draggedFighter.offsetX=(e.clientX-t.left)/o,draggedFighter.offsetY=(e.clientY-t.top)/o,window.addEventListener("mousemove",onFighterMouseMove),window.addEventListener("mouseup",onFighterMouseUp)}}
    function onFighterMouseMove(e){if(draggedFighter.element){e.preventDefault();const t=gameWrapper.getBoundingClientRect(),o=getGameScale(),n=(e.clientX-t.left)/o-draggedFighter.offsetX,a=(e.clientY-t.top)/o-draggedFighter.offsetY;draggedFighter.element.style.left=`${n}px`,draggedFighter.element.style.top=`${a}px`}}
    function onFighterMouseUp(){draggedFighter.element&&(socket.emit("playerAction",{type:"gmMovesFighter",fighterId:draggedFighter.element.id,position:{left:draggedFighter.element.style.left,top:draggedFighter.element.style.top}})),draggedFighter.element=null,window.removeEventListener("mousemove",onFighterMouseMove),window.removeEventListener("mouseup",onFighterMouseUp)}
    function showHelpModal(){const e='\n            <div style="text-align: left; font-size: 1.2em; line-height: 1.8;">\n                <p><b>C:</b> Abrir menu de Cheats (GM).</p>\n                <p><b>T:</b> Mostrar/Ocultar coordenadas do mouse.</p>\n                <p><b>J:</b> Ativar/Desativar modo de arrastar personagens (GM).</p>\n            </div>\n        ';showInfoModal("Atalhos do Teclado",e)}
    function initializeTheaterMode(){localWorldScale=1,theaterWorldContainer.style.transform="scale(1)",theaterBackgroundViewport.scrollLeft=0,theaterBackgroundViewport.scrollTop=0,theaterCharList.innerHTML="";const e=t=>{const o=document.createElement("div");o.className="theater-char-mini",o.style.backgroundImage=`url("${t.img}")`,o.title=t.name,o.draggable=!0,o.addEventListener("dragstart",e=>{isGm&&e.dataTransfer.setData("application/json",JSON.stringify({charName:t.name,img:t.img}))}),theaterCharList.appendChild(o)};[...(ALL_CHARACTERS.players||[]),...(ALL_CHARACTERS.npcs||[]),...(ALL_CHARACTERS.dynamic||[])].forEach(t=>e(t))}
    function renderTheaterMode(e){if(!isDragging){const t=e.scenarioStates?.[e.currentScenario],o=isGm?t:e.publicState;if(o&&o.scenario){const n=`images/${o.scenario}`;if(!document.getElementById("theater-background-image").src.includes(o.scenario)){const e=new Image;e.onload=()=>{document.getElementById("theater-background-image").src=e.src,theaterWorldContainer.style.width=`${e.naturalWidth}px`,theaterWorldContainer.style.height=`${e.naturalHeight}px`,isGm&&socket.emit("playerAction",{type:"update_scenario_dims",width:e.naturalWidth,height:e.naturalHeight})},e.src=n}document.getElementById("theater-gm-panel").classList.toggle("hidden",!isGm),document.getElementById("toggle-gm-panel-btn").classList.toggle("hidden",!isGm),document.getElementById("theater-publish-btn").classList.toggle("hidden",!isGm||!t?.isStaging),isGm&&t&&(document.getElementById("theater-global-scale").value=t.globalTokenScale||1),theaterTokenContainer.innerHTML="";const a=document.createDocumentFragment();(o.tokenOrder||[]).forEach((e,t)=>{const n=o.tokens[e];if(n){const l=document.createElement("img");l.id=e,l.className="theater-token",l.src=n.img,l.style.left=`${n.x}px`,l.style.top=`${n.y}px`,l.style.zIndex=t,l.dataset.scale=n.scale||1,l.dataset.flipped=String(!!n.isFlipped),l.title=n.charName;const s=o.globalTokenScale||1,i=parseFloat(l.dataset.scale),c="true"===l.dataset.flipped;l.style.transform=`scale(${i*s}) ${c?"scaleX(-1)":""}`,isGm&&(selectedTokens.has(e)&&l.classList.add("selected"),l.addEventListener("mouseenter",()=>hoveredTokenId=e),l.addEventListener("mouseleave",()=>hoveredTokenId=null)),a.appendChild(l)}}),theaterTokenContainer.appendChild(a)}}}
    
    function setupTheaterEventListeners() {
        const viewport = document.getElementById('theater-background-viewport');
        viewport.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            dragStartPos = { x: e.clientX, y: e.clientY };
            if (isGm) {
                const tokenElement = e.target.closest('.theater-token');
                if (isGroupSelectMode && !tokenElement) {
                    isSelectingBox = true;
                    selectionBoxStartPos = { x: e.clientX, y: e.clientY };
                    const gameScale = getGameScale();
                    const viewportRect = viewport.getBoundingClientRect();
                    const startX = (e.clientX - viewportRect.left) / gameScale;
                    const startY = (e.clientY - viewportRect.top) / gameScale;
                    Object.assign(document.getElementById('selection-box').style, { left: `${startX}px`, top: `${startY}px`, width: '0px', height: '0px' });
                    document.getElementById('selection-box').classList.remove('hidden');
                    return;
                }
                if (tokenElement) {
                    isDragging = true;
                    if (!e.ctrlKey && !selectedTokens.has(tokenElement.id)) selectedTokens.clear();
                    if (e.ctrlKey) {
                        selectedTokens.has(tokenElement.id) ? selectedTokens.delete(tokenElement.id) : selectedTokens.add(tokenElement.id);
                    } else {
                        selectedTokens.add(tokenElement.id);
                    }
                    dragOffsets.clear();
                    selectedTokens.forEach(id => {
                        const tokenData = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[id];
                        if (tokenData) dragOffsets.set(id, { startX: tokenData.x, startY: tokenData.y });
                    });
                    renderTheaterMode(currentGameState);
                } else if (!isGroupSelectMode) {
                    if (selectedTokens.size > 0) selectedTokens.clear();
                    renderTheaterMode(currentGameState);
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
                const gameScale = getGameScale(), viewportRect = viewport.getBoundingClientRect();
                const currentX = (e.clientX - viewportRect.left) / gameScale, currentY = (e.clientY - viewportRect.top) / gameScale;
                const startX = (selectionBoxStartPos.x - viewportRect.left) / gameScale, startY = (selectionBoxStartPos.y - viewportRect.top) / gameScale;
                Object.assign(document.getElementById('selection-box').style, { left: `${Math.min(currentX, startX)}px`, top: `${Math.min(currentY, startY)}px`, width: `${Math.abs(currentX - startX)}px`, height: `${Math.abs(currentY - startY)}px` });
            } else if (isPanning) {
                e.preventDefault();
                viewport.scrollLeft -= e.movementX;
                viewport.scrollTop -= e.movementY;
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
                    if (initialPos) socket.emit('playerAction', { type: 'updateToken', token: { id, x: initialPos.startX + deltaX, y: initialPos.startY + deltaY } });
                });
            } else if (isGm && isSelectingBox) {
                const boxRect = document.getElementById('selection-box').getBoundingClientRect();
                isSelectingBox = false;
                document.getElementById('selection-box').classList.add('hidden');
                if (!e.ctrlKey) selectedTokens.clear();
                document.querySelectorAll('.theater-token').forEach(token => {
                    const tokenRect = token.getBoundingClientRect();
                    if (boxRect.left < tokenRect.right && boxRect.right > tokenRect.left && boxRect.top < tokenRect.bottom && boxRect.bottom > tokenRect.top) {
                        e.ctrlKey && selectedTokens.has(token.id) ? selectedTokens.delete(token.id) : selectedTokens.add(token.id);
                    }
                });
                renderTheaterMode(currentGameState);
            }
            isPanning = false;
        });
        viewport.addEventListener('drop', (e) => {
            e.preventDefault(); 
            if (!isGm) return;
            try {
                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                const tokenWidth = 200, gameScale = getGameScale(), viewportRect = viewport.getBoundingClientRect();
                const finalX = ((e.clientX - viewportRect.left) / gameScale + viewport.scrollLeft) / localWorldScale - (tokenWidth / 2);
                const finalY = ((e.clientY - viewportRect.top) / gameScale + viewport.scrollTop) / localWorldScale - (tokenWidth / 2);
                socket.emit('playerAction', { type: 'updateToken', token: { id: `token-${Date.now()}`, charName: data.charName, img: data.img, x: finalX, y: finalY, scale: 1.0, isFlipped: false }});
            } catch (error) { console.error("Drop error:", error); }
        });
        viewport.addEventListener('dragover', (e) => e.preventDefault());
        viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (isGm && hoveredTokenId && selectedTokens.has(hoveredTokenId)) {
                const tokenData = currentGameState.scenarioStates[currentGameState.currentScenario].tokens[hoveredTokenId];
                if (tokenData) {
                    const newScale = (tokenData.scale || 1.0) + (e.deltaY > 0 ? -0.1 : 0.1);
                    selectedTokens.forEach(id => socket.emit('playerAction', { type: 'updateToken', token: { id, scale: Math.max(0.1, newScale) }}));
                }
            } else {
                const zoomIntensity = 0.05, scrollDirection = e.deltaY < 0 ? 1 : -1;
                const newScale = Math.max(0.2, Math.min(localWorldScale + (zoomIntensity * scrollDirection), 5));
                const rect = viewport.getBoundingClientRect();
                const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
                const worldX = (mouseX + viewport.scrollLeft) / localWorldScale, worldY = (mouseY + viewport.scrollTop) / localWorldScale;
                localWorldScale = newScale;
                theaterWorldContainer.style.transform = `scale(${localWorldScale})`;
                viewport.scrollLeft = worldX * localWorldScale - mouseX;
                viewport.scrollTop = worldY * localWorldScale - mouseY;
            }
        }, { passive: false });
        document.getElementById('theater-global-scale').addEventListener('change', (e) => {
             if (isGm) socket.emit('playerAction', {type: 'updateGlobalScale', scale: parseFloat(e.target.value)});
        });
    }

    function initializeGlobalKeyListeners(){window.addEventListener("keydown",e=>{if(currentGameState){if("adventure"===currentGameState.mode&&isTargeting&&"Escape"===e.key)return void cancelTargeting();const t=document.activeElement;if("INPUT"!==t.tagName&&"TEXTAREA"!==t.tagName){if("c"===e.key.toLowerCase()&&isGm&&"adventure"===currentGameState.mode&&(e.preventDefault(),showCheatModal()),"t"===e.key.toLowerCase()&&(e.preventDefault(),coordsModeActive=!coordsModeActive,document.getElementById("coords-display").classList.toggle("hidden",!coordsModeActive)),isGm&&"adventure"===currentGameState.mode&&"j"===e.key.toLowerCase()&&(e.preventDefault(),isFreeMoveModeActive=!isFreeMoveModeActive,makeFightersDraggable(isFreeMoveModeActive),showInfoModal("Modo de Movimento",`Modo de movimento livre ${isFreeMoveModeActive?"ATIVADO":"DESATIVADO"}.`)),"theater"===currentGameState.mode&&isGm){if("g"===e.key.toLowerCase()&&(e.preventDefault(),isGroupSelectMode=!isGroupSelectMode,document.getElementById("theater-background-viewport").classList.toggle("group-select-mode",isGroupSelectMode),isGroupSelectMode||(isSelectingBox=!1,document.getElementById("selection-box").classList.add("hidden"))),hoveredTokenId||1===selectedTokens.size&&selectedTokens.values().next().value){hoveredTokenId||1===selectedTokens.size&&selectedTokens.values().next().value}if("Delete"===e.key&&selectedTokens.size>0&&(e.preventDefault(),socket.emit("playerAction",{type:"updateToken",token:{remove:!0,ids:Array.from(selectedTokens)}}),selectedTokens.clear()),1===selectedTokens.size&&("ArrowUp"===e.key||"ArrowDown"===e.key)){e.preventDefault();const t=selectedTokens.values().next().value,o=[...currentGameState.scenarioStates[currentGameState.currentScenario].tokenOrder],n=o.indexOf(t);"ArrowUp"===e.key&&n<o.length-1?([o[n],o[n+1]]=[o[n+1],o[n]],socket.emit("playerAction",{type:"updateTokenOrder",order:o})):"ArrowDown"===e.key&&n>0&&([o[n],o[n-1]]=[o[n-1],o[n]],socket.emit("playerAction",{type:"updateTokenOrder",order:o}))}}}}}),window.addEventListener("mousemove",e=>{if(coordsModeActive){const t=gameWrapper.getBoundingClientRect(),o=getGameScale(),n=Math.round((e.clientX-t.left)/o),a=Math.round((e.clientY-t.top)/o);document.getElementById("coords-display").innerHTML=`X: ${n}<br>Y: ${a}`}})}
    function showScenarioSelectionModal(){let e='<div class="category-tabs">';const t=Object.keys(ALL_SCENARIOS);t.forEach((t,o)=>{e+=`<button class="category-tab-btn ${0===o?"active":""}" data-category="${t}">${t.replace(/_/g," ")}</button>`}),e+="</div>",t.forEach((t,o)=>{e+=`<div class="scenarios-grid ${0===o?"active":""}" id="grid-${t}">`,ALL_SCENARIOS[t].forEach(t=>{const o=t.split("/").pop().replace(".png","").replace(".jpg","");e+=`<div class="scenario-card" data-path="${t}"><img src="images/mapas/${t}" alt="${o}"><div class="scenario-name">${o}</div></div>`}),e+="</div>"}),showInfoModal("Mudar Cenário",e,!1),document.querySelectorAll(".category-tab-btn").forEach(e=>{e.addEventListener("click",()=>{document.querySelectorAll(".category-tab-btn, .scenarios-grid").forEach(e=>e.classList.remove("active")),e.classList.add("active"),document.getElementById(`grid-${e.dataset.category}`).classList.add("active")})}),document.querySelectorAll(".scenario-card").forEach(e=>{e.addEventListener("click",()=>{const t=e.dataset.path;socket.emit("playerAction",{type:"changeScenario",scenario:t}),modal.classList.add("hidden")})})}
    
    // ... (O resto do código permanece o mesmo até a inicialização)

    initialize();
});