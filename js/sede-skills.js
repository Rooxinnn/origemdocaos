/* ==========================================================
   HABILIDADES DE SEDE
   Módulo independente e autocontido, adicionado sobre a
   arquitetura já existente. NÃO reescreve o projeto, NÃO cria
   um segundo Compêndio e NÃO cria uma segunda biblioteca:

     COMPÊNDIO → "Habilidades de Sede"   (biblioteca oficial,
                                           fixa, com 14 entradas)
     AGENTES  → "Habilidades de Sede"    (reflexo automático da
                                           ficha, compacto)

   Segue exatamente o mesmo conceito já usado pelo sistema de
   Conexões (js/character-connections.js):
     Compêndio → escolher/adicionar → ficha → visualizar pelo
     nome → clicar → abrir descrição completa.

   ARMAZENAMENTO DA FICHA: não cria um localStorage/chave separada.
   A lista de referências (apenas os IDs das habilidades escolhidas)
   fica num <input type="hidden" id="agente_sede_habilidades_ids">
   dentro de #tab-agentes — ou seja, é só mais um campo que
   agentFieldIds() (index.html) já varre sozinho, então
   saveAgent()/loadAgent()/duplicateSheet()/exportação/importação já
   salvam, carregam e duplicam essa lista automaticamente, exatamente
   como fazem hoje com agente_conexoes_ids — nenhuma dessas funções
   precisou ser alterada ou reescrita para isso.

   BIBLIOTECA: as 14 Habilidades de Sede (nome, Sede, descrição) são
   fixas no array SEDE_SKILLS_DATA abaixo — igual em espírito a
   CONEXOES_DATA (index.html), só que definida aqui porque a
   funcionalidade inteira é isolada neste arquivo. A ficha nunca
   guarda a descrição: guarda somente o ID, e busca os dados na
   biblioteca (SEDE_SKILLS_DATA) sempre que precisa exibir algo.

   Namespace: window.SedeSkills
   ========================================================== */
(function(){
  "use strict";

  var HIDDEN_FIELD_ID = "agente_sede_habilidades_ids";

  /* ---------------------------------------------------------
     BIBLIOTECA OFICIAL — 14 Habilidades de Sede, exatamente como
     fornecidas no pedido (nome/Sede/descrição preservados na
     íntegra, sem correção, resumo ou reinterpretação).
     --------------------------------------------------------- */
  var SEDE_SKILLS_DATA = [
    {
      id: "sede-ny",
      n: "Perícia Perfeita",
      sede: "NY",
      d: 'quando o jogador realizar uma rolagem que envolva uma Perícia, uma vez por sessão, pode fazer com que, caso obtenha um Sucesso Extremo em sua rolagem, aumente o resultado em +5. Caso o personagem precise fazer um teste de Computação ou Perícia em TI, poderá consumir metade dos seus pontos atuais de um destes dois conhecimentos, para cortar pela metade a DT do teste.'
    },
    {
      id: "sede-texas",
      n: "Atirador do Oeste",
      sede: "Texas",
      d: 'quando o jogador realizar uma rolagem de ATK AF, caso o dado de Perícia em Armas de Fogo tenha obtido um Extremo em sua rolagem, então ele multiplicará o dano x2. Caso o personagem esteja enfrentando outro personagem que esteja equipado com uma arma de fogo, ele obterá +2 em sua rolagem de ATK AF.'
    },
    {
      id: "sede-dc-rainier",
      n: "Treinados pela Rainha",
      sede: "Washington DC | Monte Rainier",
      d: 'quando um teste de rolagem que envolva Sentido Paranormal for pedido, poderá consumir 2 pontos de Sentido Paranormal para aumentar ou diminuir uma DT em -1, de forma acumulativa. Caso a rolagem de ocultismo do personagem seja um sucesso Extremo, então adicione +5 ao resultado da rolagem.'
    },
    {
      id: "sede-franca",
      n: "Amantes da Arte",
      sede: "França",
      d: 'quando um teste de rolagem que envolva Inteligência for pedido, o personagem pode adicionar Criatividade em sua rolagem. Quando um teste que envolva Aparência for pedido, este personagem automáticamente obtém +2 em sua rolagem.'
    },
    {
      id: "sede-el-salvador",
      n: "Ligação Espiritual",
      sede: "El Salvador",
      d: 'este personagem é capaz de acumular turnos sem ação principal, enquanto realiza uma dança ritualistica, e para cada turno em que não realizar uma ação principal por esta habilidade, sua próxima ação que envolva Sentido Paranormal obterá um bônus de +3 por turno acumulado. Caso sua rolagem de DEF C, ou DESV O seja um sucesso Extremo, acumulará +1 Vantagem para sua próxima ação.'
    },
    {
      id: "sede-brasil",
      n: "Amizade Indestrutível",
      sede: "Brasil",
      d: 'quando o jogador vier a usar Trabalho em Equipe, caso o valor obtido na rolagem seja Extremo, então o valor obtido na rolagem da ação de ajuda será dobrada. Uma vez por sessão, caso um personagem aliado entre em suas 3 Rodadas de Morte, este personagem poderá dobrar a quantia de pontos que usar para tentar salvar o personagem aliado.'
    },
    {
      id: "sede-inglaterra",
      n: "Punição da Realeza",
      sede: "Inglaterra",
      d: 'caso a ação deste personagem contenha a intenção de causar dano de Sanidade, e em sua rolagem obteve um Sucesso Extremo, então o dano de Sanidade será dobrado. Caso este personagem esteja realizando uma rolagem de P. Investigativa, ele poderá gastar 5 pontos desta Perícia para cortar pela metade o valor da DT.'
    },
    {
      id: "sede-russia",
      n: "Eterno Espião",
      sede: "Russia",
      d: 'Ao realizar um teste que peça P. Investigativa, poderá também adicionar "Militar" em sua rolagem. Uma vez por cena , rolagens que envolvam Inteligência podem ser rerroladas em troca de um consumo de 5 pontos.'
    },
    {
      id: "sede-dubai",
      n: "Luxo Incomparável",
      sede: "Dubai",
      d: 'Personagens desta Sede obtém +1 de XP para cada 3 ações detentoras de XP, no momento da contabilização de XP. Este personagem possui investimento em ações de alguma grande empresa, então ao fim de cada Missão, receberá um valor bônus de +1d1000 dólares.'
    },
    {
      id: "sede-egito",
      n: "Agente do Deserto",
      sede: "Egito",
      d: 'Este personagem é capaz de adicionar "Sobrevivência" ou "Adaptação" a rolagens que envolvam Resistência, exceto rolagens de DEF. Caso este personagem obtenha um Sucesso Extremo em uma rolagem de DEF, então sua próxima ação ocorrerá com um bônus de +3.'
    },
    {
      id: "sede-nigeria",
      n: "Resistência Absoluta",
      sede: "Nigéria",
      d: 'quando o jogador rolar sua DEF, caso o valor da rolagem de Força Física ou Agilidade tenha sido Extremo, mesmo que não alcance o valor necessário para obter um sucesso contra a rolagem do oponente atacante, a defesa ainda ocorrerá, entretanto o personagem defensor tomará 1/3 do dano original, porém, caso a defesa tenha sido um sucesso, então o personagem atacante obterá uma Desvantagem em sua próxima ação que envolva este personagem. Caso este personagem seja AGARRADO, ele poderá consumir 5 pontos de Resistência para diminuir pela metade o valor obtido na rolagem do personagem que está executando a ação de AGARRAR.'
    },
    {
      id: "sede-japao",
      n: "Corte Ágil",
      sede: "Japão",
      d: 'obter um Extremo em uma rolagem de ação que envolva Perícia em Armas Brancas, permitirá que você realize +1 ação que envolva Armas Brancas. Caso este personagem esteja lutando sozinho em uma cena de combate, ele obtém Vantagem em todas as suas ações.'
    },
    {
      id: "sede-coreia-do-sul",
      n: "Genialidade Imparável",
      sede: "Coréia do Sul",
      d: 'caso este personagem esteja realizando um teste que exija uma Perícia que ele não possua, ele poderá rolar esta Perícia como 1d4. Caso este personagem esteja lutando com as mãos nuas, ele poderá adicionar Marcial em sua rolagem e obterá uma Vantagem, e caso obtenha um Sucesso Extremo em sua rolagem, dobrará o dano de seu ataque.'
    },
    {
      id: "sede-china",
      n: "Sabedoria Antiga",
      sede: "China",
      d: 'Em qualquer teste pedido, este personagem é capaz de adicionar "Matemática" a sua rolagem, e caso obtenha um Sucesso Extremo, obterá uma Vantagem em sua próxima ação. Uma vez por cena, este personagem pode consumir 2 pontos de Referência ou Inteligência, para obter uma Vantagem em uma ação.'
    }
  ];

  /* ---------- acesso ao campo oculto (fonte única de verdade da ficha) ---------- */

  function ensureHiddenField(){
    var el = document.getElementById(HIDDEN_FIELD_ID);
    if(!el){
      var tabAgentes = document.getElementById("tab-agentes");
      if(!tabAgentes) return null;
      el = document.createElement("input");
      el.type = "hidden";
      el.id = HIDDEN_FIELD_ID;
      el.value = "[]";
      tabAgentes.appendChild(el);
    }
    return el;
  }

  function getRefs(){
    var el = ensureHiddenField();
    if(!el) return [];
    try{
      var arr = JSON.parse(el.value || "[]");
      return Array.isArray(arr) ? arr : [];
    }catch(e){
      return [];
    }
  }

  // Grava a lista e marca a ficha como tendo alterações pendentes —
  // mesmo comportamento dos demais campos da ficha, só persistido de
  // fato quando o usuário clica "💾 Salvar Ficha".
  function setRefs(arr){
    var el = ensureHiddenField();
    if(!el) return;
    el.value = JSON.stringify(arr);
    if(typeof markAgentDirty === "function") markAgentDirty();
  }

  // Reset silencioso (sem marcar a ficha como suja) — usado só ao
  // trocar/criar ficha, para nunca deixar a referência da ficha
  // anterior vazar para a próxima antes do carregamento real.
  function resetRefsSilent(){
    var el = ensureHiddenField();
    if(el) el.value = "[]";
  }

  function findSkillById(id){
    for(var i = 0; i < SEDE_SKILLS_DATA.length; i++){
      if(SEDE_SKILLS_DATA[i].id === id) return SEDE_SKILLS_DATA[i];
    }
    return null;
  }

  function addSkill(id){
    var refs = getRefs();
    if(refs.indexOf(id) !== -1) return; // já está na ficha — não duplica
    refs.push(id);
    setRefs(refs);
    renderAll();
  }

  function removeSkill(id){
    var refs = getRefs().filter(function(r){ return r !== id; });
    setRefs(refs);
    renderAll();
  }

  /* ---------- helpers ---------- */

  function esc(s){
    if(typeof escapeHtml === "function") return escapeHtml(s);
    var d = document.createElement("div");
    d.textContent = (s === undefined || s === null) ? "" : String(s);
    return d.innerHTML;
  }

  /* ==========================================================
     MODAL DE DETALHES
     Modal próprio, dedicado a Habilidades de Sede, seguindo o
     mesmo padrão visual/modal já utilizado pelo Compêndio (mesma
     estrutura de #cx_modal / #hab50_modal: modal-overlay > modal-box
     com título, subtítulo e corpo), sem reutilizar/alterar o DOM
     desses outros modais.
     ========================================================== */

  function ensureDetailModal(){
    if(document.getElementById("sks_modal")) return;
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "sks_modal";
    overlay.innerHTML =
      '<div class="modal-box sks-modal-box">' +
        '<h3 id="sks_modal_title"></h3>' +
        '<div class="sks-modal-sede" id="sks_modal_sede"></div>' +
        '<div class="sks-modal-desc" id="sks_modal_desc"></div>' +
        '<div class="modal-actions" style="margin-top:14px;">' +
          '<button type="button" id="sks_modal_close">Fechar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById("sks_modal_close").addEventListener("click", closeDetailModal);
    overlay.addEventListener("click", function(e){
      if(e.target.id === "sks_modal") closeDetailModal();
    });
  }

  function openDetailModal(id){
    var skill = findSkillById(id);
    if(!skill) return;
    ensureDetailModal();
    document.getElementById("sks_modal_title").textContent = skill.n;
    document.getElementById("sks_modal_sede").textContent = skill.sede;
    document.getElementById("sks_modal_desc").textContent = skill.d;
    document.getElementById("sks_modal").style.display = "flex";
  }

  function closeDetailModal(){
    var m = document.getElementById("sks_modal");
    if(m) m.style.display = "none";
  }

  /* ==========================================================
     COMPÊNDIO → "HABILIDADES DE SEDE"
     Nova aba dentro do Compêndio já existente (mesma barra de
     sub-abas de "Regras Gerais"/"Conexões" — .subtab-row dentro de
     #tab-compendio), adicionada dinamicamente. Não recria o
     Compêndio, não cria uma segunda biblioteca: usa a mesma classe
     ".subtab-btn"/".subtab-panel" já usada pelas outras abas do
     Compêndio, para herdar o mesmo estilo.

     Observação técnica: o listener genérico que liga clique nas
     ".subtab-btn" já existentes (index.html) roda uma única vez, no
     carregamento da página, ANTES deste arquivo (carregado por
     último, como os demais módulos independentes do projeto). Por
     isso o botão novo, criado aqui dinamicamente, recebe seu PRÓPRIO
     listener abaixo — mas usa exatamente a mesma lógica (remover
     "active" de todas as .subtab-btn/.subtab-panel e ativar a
     escolhida), então continua 100% compatível com os cliques nos
     botões antigos, que já buscam essas classes no DOM a cada clique.
     ========================================================== */

  function ensureCompendioTab(){
    if(document.getElementById("sub-comp-sede")) return;
    var subtabRow = document.querySelector("#tab-compendio .subtab-row");
    var compPanel = document.querySelector("#tab-compendio .panel");
    if(!subtabRow || !compPanel) return;

    var btn = document.createElement("button");
    btn.className = "subtab-btn";
    btn.setAttribute("data-sub", "comp-sede");
    btn.textContent = "Habilidades de Sede";
    subtabRow.appendChild(btn);

    var panel = document.createElement("div");
    panel.className = "subtab-panel";
    panel.id = "sub-comp-sede";
    panel.innerHTML =
      '<p class="note" style="text-align:left; margin:0 0 14px;">Habilidades exclusivas das Sedes. Adicione uma habilidade à ficha atualmente aberta em Agentes clicando em "Adicionar à Ficha", ou clique no nome para ver a descrição completa.</p>' +
      '<div class="list-add-row" style="margin-bottom:6px;">' +
        '<div class="field" style="flex:2 1 260px;"><label>Pesquisar</label><input type="text" id="sks_search" placeholder="Nome ou Sede…"></div>' +
      '</div>' +
      '<div id="sks_count" class="note" style="text-align:left; margin:0 0 12px;"></div>' +
      '<div id="sks_grid" class="sks-grid"></div>';
    compPanel.appendChild(panel);

    btn.addEventListener("click", function(){
      document.querySelectorAll(".subtab-btn").forEach(function(b){ b.classList.remove("active"); });
      document.querySelectorAll(".subtab-panel").forEach(function(p){ p.classList.remove("active"); });
      btn.classList.add("active");
      panel.classList.add("active");
    });

    var searchEl = document.getElementById("sks_search");
    var handler = (typeof debounce === "function") ? debounce(renderCompendioGrid, 150) : renderCompendioGrid;
    searchEl.addEventListener("input", handler);
  }

  function renderCompendioGrid(){
    var grid = document.getElementById("sks_grid");
    var countEl = document.getElementById("sks_count");
    if(!grid) return;

    var searchEl = document.getElementById("sks_search");
    var q = ((searchEl && searchEl.value) || "").toLowerCase().trim();

    var items = SEDE_SKILLS_DATA;
    if(q){
      items = items.filter(function(s){
        return s.n.toLowerCase().indexOf(q) !== -1 ||
               s.sede.toLowerCase().indexOf(q) !== -1 ||
               s.d.toLowerCase().indexOf(q) !== -1;
      });
    }

    if(countEl) countEl.textContent = items.length + " habilidade" + (items.length === 1 ? "" : "s");

    grid.innerHTML = "";
    if(items.length === 0){
      grid.innerHTML = '<div class="empty-state">Nenhuma habilidade encontrada para esta pesquisa.</div>';
      return;
    }

    var currentRefs = getRefs();
    items.forEach(function(skill){
      var inSheet = currentRefs.indexOf(skill.id) !== -1;
      var shortDesc = skill.d.length > 140 ? (skill.d.slice(0, 140).trim() + "…") : skill.d;

      var card = document.createElement("div");
      card.className = "sks-card";
      card.innerHTML =
        '<div class="sks-card-body">' +
          '<h4>' + esc(skill.n) + '<span class="sks-card-sede">' + esc(skill.sede) + '</span></h4>' +
          '<p>' + esc(shortDesc) + '</p>' +
        '</div>' +
        '<button type="button" class="sks-add-btn' + (inSheet ? ' in-sheet' : '') + '" data-sks-toggle="' + esc(skill.id) + '">' +
          (inSheet ? '✓ Na Ficha' : 'Adicionar à Ficha') +
        '</button>';

      card.querySelector(".sks-card-body").addEventListener("click", function(){
        openDetailModal(skill.id);
      });
      card.querySelector("[data-sks-toggle]").addEventListener("click", function(e){
        e.stopPropagation();
        if(inSheet) removeSkill(skill.id); else addSkill(skill.id);
        renderCompendioGrid(); // atualiza o botão desta linha
      });

      grid.appendChild(card);
    });
  }

  /* ==========================================================
     AGENTES → "HABILIDADES DE SEDE"
     Área pequena e integrada, inserida como irmão do bloco
     ".two-col" que já contém "Conexões Aprendidas"/"Anotações do
     Agente" — esse bloco e os campos que ele contém não são
     alterados nem movidos, o painel novo só entra antes dele
     (mesmo ponto de integração já usado por Conexão/Aborto Límbico).
     ========================================================== */

  function ensureAgentesPanel(){
    if(document.getElementById("sks_agente_panel")) return;
    var conexoesField = document.getElementById("conexoes");
    if(!conexoesField) return;
    var twoCol = conexoesField.closest(".two-col");
    if(!twoCol || !twoCol.parentElement) return;

    var panel = document.createElement("div");
    panel.className = "panel";
    panel.id = "sks_agente_panel";
    panel.innerHTML =
      '<h2>Habilidades de Sede <span class="tag">Vinculado ao Compêndio</span></h2>' +
      '<div id="sks_agente_grid" class="sks-agente-grid"></div>';

    twoCol.parentElement.insertBefore(panel, twoCol);
  }

  function renderAgentesPanel(){
    ensureAgentesPanel();
    var grid = document.getElementById("sks_agente_grid");
    if(!grid) return;

    var refs = getRefs();
    if(refs.length === 0){
      grid.innerHTML = '<div class="empty-state">Nenhuma Habilidade de Sede adicionada. Adicione em Compêndio → Habilidades de Sede.</div>';
      return;
    }

    grid.innerHTML = "";
    refs.forEach(function(id){
      var skill = findSkillById(id);
      var chip = document.createElement("div");
      chip.className = "sks-chip";

      var label = document.createElement("span");
      label.className = "sks-chip-label";
      label.textContent = skill ? (skill.n + " — " + skill.sede) : (id + " (não encontrada)");
      if(skill){
        label.addEventListener("click", function(){ openDetailModal(id); });
      }

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "sks-chip-remove";
      removeBtn.title = "Remover Habilidade de Sede da ficha";
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", function(){ removeSkill(id); });

      chip.appendChild(label);
      chip.appendChild(removeBtn);
      grid.appendChild(chip);
    });
  }

  function renderAll(){
    renderAgentesPanel();
    // O grid do Compêndio só existe se a aba já foi criada; sempre
    // que a ficha muda, o rótulo dos botões ("Adicionar"/"✓ Na
    // Ficha") precisa refletir a nova ficha aberta.
    if(document.getElementById("sks_grid")) renderCompendioGrid();
  }

  /* ==========================================================
     INTEGRAÇÃO COM O FLUXO DE FICHAS JÁ EXISTENTE
     Mesmo padrão já usado pela Bandeja de Rolagens e por Conexões:
     envolve openSheet()/createNewSheet() sem reescrevê-las, só para
     trocar de "dono" junto com a troca/criação de ficha.
     ========================================================== */

  function wrapSheetFunctions(){
    if(typeof openSheet === "function"){
      var _origOpenSheet = openSheet;
      openSheet = async function(id){
        resetRefsSilent();
        await _origOpenSheet(id);
        renderAll();
      };
    }
    if(typeof createNewSheet === "function"){
      var _origCreateNewSheet = createNewSheet;
      createNewSheet = async function(){
        await _origCreateNewSheet();
        resetRefsSilent();
        renderAll();
      };
    }
  }

  /* ---------- boot ---------- */
  function initSedeSkills(){
    ensureHiddenField();
    wrapSheetFunctions();
    ensureCompendioTab();
    ensureAgentesPanel();
    renderAll();
  }

  window.SedeSkills = {
    init: initSedeSkills,
    refresh: renderAll
  };

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", initSedeSkills);
  } else {
    initSedeSkills();
  }

})();
