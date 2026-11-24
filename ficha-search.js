/* ==========================================================
   BUSCA RÁPIDA DA FICHA
   Módulo independente e autocontido, adicionado sobre a
   arquitetura já existente. NÃO cria uma nova fonte de dados: é só
   uma CAMADA DE NAVEGAÇÃO que lê, a cada pesquisa, os elementos que
   já existem no DOM da ficha atualmente aberta (#tab-agentes) —
   Atributos, Perícias, Habilidades, Talentos, Habilidades de Sede,
   Conexões (normais/Superiores/Especiais/Personalizadas), Dados de
   Combate, Inventário e alguns campos/seções gerais — e usa isso
   para: destacar e rolar (scroll suave) até o elemento clicado.

   IMPORTANTE — este módulo:
   - NÃO cria armazenamento novo (nem localStorage, nem chave de
     ficha nova). Não guarda nada: cada pesquisa é resolvida ao
     vivo, direto no DOM já renderizado pelos sistemas existentes
     (grid_habilidades/grid_pericias/grid_atributos/grid_talentos,
     #sks_agente_grid de js/sede-skills.js, #cconn_agente_grid de
     js/character-connections.js, .combat-cell dos Dados de Combate,
     #inv_list do Inventário). Por isso funciona automaticamente na
     ficha que estiver aberta no momento, sem precisar "escutar"
     trocas de ficha: ao digitar, o índice é reconstruído na hora, a
     partir do que já está na tela.
   - NÃO altera nenhuma função existente (renderGrid, buildSkillRow,
     renderInventory, renderAgenteConexoes, renderAgentesPanel de
     Habilidades de Sede, cálculo de Dados de Combate, etc.) — só
     LÊ o DOM que essas funções já produzem.
   - NÃO abre pop-ups automaticamente. Clicar num resultado apenas
     rola até o elemento e aplica um destaque temporário — se aquele
     elemento já tem um comportamento de clique próprio (Conexões,
     Habilidades de Sede, Compêndio), esse comportamento continua
     exatamente como era; o usuário pode clicar nele normalmente
     depois de chegar lá.
   - A barra só é inserida uma vez, no topo da seção "Habilidades"
     (antes de #grid_habilidades), sem mover nenhuma outra seção.

   Namespace: window.FichaSearch
   ========================================================== */
(function(){
  "use strict";

  var MAX_RESULTS = 12;
  var HIGHLIGHT_MS = 1700;
  var highlightTimer = null;

  /* ---------- normalização (tolerante a acento/caixa/espaços) ---------- */
  function normalize(str){
    var s = (str || "").toString().toLowerCase();
    try{
      s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }catch(e){
      // navegador sem suporte a normalize: segue só com toLowerCase
    }
    return s.replace(/\s+/g, " ").trim();
  }

  /* ---------------------------------------------------------
     ÍNDICE — construído do zero a cada pesquisa, sempre a partir do
     DOM da ficha atual. Cada entrada: { label, category, target,
     highlightTarget }. "target" é o elemento usado para scroll;
     "highlightTarget" é o elemento que recebe a classe de destaque
     (geralmente o mesmo, às vezes um contêiner um pouco maior, para
     ficar mais visível).
     --------------------------------------------------------- */

  function skillGridEntries(containerId, category){
    var out = [];
    var container = document.getElementById(containerId);
    if(!container) return out;
    container.querySelectorAll("[data-skill-name]").forEach(function(nameEl){
      var row = nameEl.closest(".skill-row") || nameEl;
      // O texto do nome pode conter os "★" de SAN/Fadiga/Buff Límbico
      // dentro de <span>; usamos só o primeiro nó de texto (o nome puro).
      var raw = nameEl.childNodes.length ? nameEl.childNodes[0].textContent : nameEl.textContent;
      var label = (raw || "").trim();
      if(!label) return;
      out.push({ label: label, category: category, target: row, highlightTarget: row });
    });
    return out;
  }

  function sedeSkillEntries(){
    var out = [];
    var grid = document.getElementById("sks_agente_grid");
    if(!grid) return out;
    grid.querySelectorAll(".sks-chip").forEach(function(chip){
      var labelEl = chip.querySelector(".sks-chip-label");
      if(!labelEl) return;
      var label = (labelEl.textContent || "").trim();
      if(!label || label.indexOf("(não encontrada)") !== -1) return;
      out.push({ label: label, category: "Habilidade de Sede", target: chip, highlightTarget: chip });
    });
    return out;
  }

  function conexaoCategoryFor(block){
    if(block.classList.contains("cx-personalizada")) return "Personalizada";
    if(block.classList.contains("cx-superior")) return "Conexão Superior";
    if(block.classList.contains("cx-especial")) return "Especial";
    return "Conexão";
  }

  function conexaoEntries(){
    var out = [];
    var grid = document.getElementById("cconn_agente_grid");
    if(!grid) return out;
    grid.querySelectorAll(".cconn-block").forEach(function(block){
      var span = block.querySelector("span");
      var label = ((span ? span.textContent : block.textContent) || "").trim();
      if(!label) return;
      out.push({ label: label, category: conexaoCategoryFor(block), target: block, highlightTarget: block });
    });
    return out;
  }

  function combatEntries(){
    var out = [];
    document.querySelectorAll("#tab-agentes .combat-cell").forEach(function(cell){
      var labelEl = cell.querySelector("label");
      var label = labelEl ? labelEl.textContent.trim() : "";
      if(!label) return;
      out.push({ label: label, category: "Dado de Combate", target: cell, highlightTarget: cell });
    });
    return out;
  }

  function inventoryEntries(){
    var out = [];
    var list = document.getElementById("inv_list");
    if(!list) return out;
    list.querySelectorAll(".entry-card").forEach(function(card){
      var titleEl = card.querySelector(".entry-title");
      if(!titleEl) return;
      // Só o nome do item (primeiro nó de texto), sem o "<span class="meta">"
      // (quantidade/peso) que também mora dentro do mesmo título.
      var raw = titleEl.childNodes.length ? titleEl.childNodes[0].textContent : titleEl.textContent;
      var label = (raw || "").trim();
      if(!label) return;
      out.push({ label: label, category: "Item de Inventário", target: card, highlightTarget: card });
    });
    return out;
  }

  // Campos/seções gerais já existentes na ficha (id do elemento →
  // rótulo pesquisável). Não duplica valores — só referencia o campo
  // pelo próprio id para saber até onde rolar. Combatentes (ATK/DEF/
  // DESV) e SAN/Fadiga "Atual/Máxima" já têm rótulo próprio via
  // combatEntries(), então não entram aqui de novo.
  var GENERAL_FIELDS = [
    { id: "nome", label: "Nome do Agente" },
    { id: "profissao", label: "Profissão" },
    { id: "idade", label: "Idade" },
    { id: "exp", label: "EXP" },
    { id: "nivel", label: "Nível" },
    { id: "hp", label: "HP" },
    { id: "protecao", label: "Proteção" },
    { id: "descanso", label: "Descanso" },
    { id: "reest", label: "Reest." },
    { id: "san_atual", label: "SAN" },
    { id: "fadiga_atual", label: "Fadiga" },
    { id: "infeccao", label: "Infecção" },
    { id: "corrupcao", label: "Corrupção" },
    { id: "dimensao", label: "Dimensão" },
    { id: "peso_total", label: "Peso Total" },
    { id: "pontos_acumulados", label: "Pontos Acumulados" },
    { id: "nivel_mov", label: "Nível de Movimentação" },
    { id: "dinheiro", label: "Dinheiro" },
    { id: "cond_psi", label: "Condições Psicológicas" },
    { id: "cond_fis", label: "Condições Físicas" },
    { id: "itens", label: "Itens do Agente" },
    { id: "conexoes", label: "Conexões Aprendidas" },
    { id: "anotacoes", label: "Anotações do Agente" },
    { id: "hab50_grid", label: "Habilidades Desbloqueadas" },
    { id: "panel_aborto_limbico", label: "Aborto Límbico" }
  ];
  var FIELD_CONTAINER_SELECTOR = ".field, .combat-hero-box, .combat-minor-cell, .san-box, .threshold-box, .combat-dimension-box, .footer-box, .items-footer, .panel";

  function generalFieldEntries(){
    var out = [];
    GENERAL_FIELDS.forEach(function(f){
      var el = document.getElementById(f.id);
      if(!el) return;
      var container = el.closest(FIELD_CONTAINER_SELECTOR) || el;
      out.push({ label: f.label, category: "Campo", target: container, highlightTarget: container });
    });
    return out;
  }

  function buildIndex(){
    if(!document.getElementById("tab-agentes")) return [];
    return []
      .concat(skillGridEntries("grid_atributos", "Atributo"))
      .concat(skillGridEntries("grid_pericias", "Perícia"))
      .concat(skillGridEntries("grid_habilidades", "Habilidade"))
      .concat(skillGridEntries("grid_talentos", "Talento"))
      .concat(sedeSkillEntries())
      .concat(conexaoEntries())
      .concat(combatEntries())
      .concat(inventoryEntries())
      .concat(generalFieldEntries());
  }

  /* ---------------------------------------------------------
     BUSCA + RESULTADOS
     --------------------------------------------------------- */

  function search(query){
    var q = normalize(query);
    if(!q) return [];
    var index = buildIndex();
    return index.filter(function(entry){
      return normalize(entry.label).indexOf(q) !== -1;
    });
  }

  function ensureUI(){
    if(document.getElementById("fsearch_wrap")) return;
    var gridHabilidades = document.getElementById("grid_habilidades");
    if(!gridHabilidades || !gridHabilidades.parentElement) return;

    var wrap = document.createElement("div");
    wrap.className = "fsearch-wrap";
    wrap.id = "fsearch_wrap";
    wrap.innerHTML =
      '<div class="fsearch-bar">' +
        '<span class="fsearch-icon">🔍</span>' +
        '<input type="text" id="fsearch_input" class="fsearch-input" placeholder="Pesquisar na ficha…" autocomplete="off">' +
      '</div>' +
      '<div id="fsearch_results" class="fsearch-results" style="display:none;"></div>';

    gridHabilidades.parentElement.insertBefore(wrap, gridHabilidades);

    var input = document.getElementById("fsearch_input");
    var handler = (typeof debounce === "function") ? debounce(onSearchInput, 120) : onSearchInput;
    input.addEventListener("input", handler);
    input.addEventListener("keydown", function(e){
      if(e.key === "Escape"){ input.value = ""; renderResults([], ""); input.blur(); }
    });

    // Fecha a lista de resultados ao clicar fora da barra/lista — não
    // limpa o texto digitado, só recolhe a lista (comportamento comum
    // de busca; a lista reaparece ao digitar de novo ou focar o campo).
    document.addEventListener("click", function(e){
      if(!wrap.contains(e.target)) hideResults();
    });
    input.addEventListener("focus", function(){
      if(input.value.trim()) onSearchInput();
    });
  }

  function onSearchInput(){
    var input = document.getElementById("fsearch_input");
    if(!input) return;
    var q = input.value;
    if(!q.trim()){ renderResults([], q); return; }
    var results = search(q);
    renderResults(results, q);
  }

  function hideResults(){
    var box = document.getElementById("fsearch_results");
    if(box) box.style.display = "none";
  }

  function renderResults(results, query){
    var box = document.getElementById("fsearch_results");
    if(!box) return;

    // Campo vazio: nenhum resultado exibido, ficha continua exatamente
    // como estava (instrução 17).
    if(!query || !query.trim()){
      box.style.display = "none";
      box.innerHTML = "";
      return;
    }

    box.style.display = "block";

    if(results.length === 0){
      box.innerHTML = '<div class="fsearch-empty">Nenhum resultado encontrado.</div>';
      return;
    }

    var shown = results.slice(0, MAX_RESULTS);
    var extra = results.length - shown.length;

    box.innerHTML = "";
    shown.forEach(function(entry){
      var row = document.createElement("button");
      row.type = "button";
      row.className = "fsearch-result";
      row.innerHTML =
        '<span class="fsearch-result-label">' + escapeForSearch(entry.label) + '</span>' +
        '<span class="fsearch-result-cat">' + escapeForSearch(entry.category) + '</span>';
      row.addEventListener("click", function(){
        goToEntry(entry);
      });
      box.appendChild(row);
    });

    if(extra > 0){
      var more = document.createElement("div");
      more.className = "fsearch-more-hint";
      more.textContent = "+" + extra + " resultado" + (extra === 1 ? "" : "s") + " — continue digitando para refinar.";
      box.appendChild(more);
    }
  }

  function escapeForSearch(s){
    if(typeof escapeHtml === "function") return escapeHtml(s);
    var d = document.createElement("div");
    d.textContent = (s === undefined || s === null) ? "" : String(s);
    return d.innerHTML;
  }

  /* ---------------------------------------------------------
     NAVEGAÇÃO — scroll suave + destaque temporário. Não dispara
     nenhum "click" no elemento (Conexões/Habilidades de Sede/etc.
     continuam abrindo seus próprios pop-ups só quando o usuário
     clicar neles normalmente, depois de chegar lá).
     --------------------------------------------------------- */
  function goToEntry(entry){
    hideResults();
    if(!entry || !entry.target || !document.body.contains(entry.target)) return;

    entry.target.scrollIntoView({ behavior: "smooth", block: "center" });

    var hl = entry.highlightTarget || entry.target;
    if(highlightTimer){ clearTimeout(highlightTimer); }
    document.querySelectorAll(".fsearch-highlight").forEach(function(el){
      el.classList.remove("fsearch-highlight");
    });
    // Força reflow antes de reaplicar a classe, para o efeito reiniciar
    // mesmo se o mesmo elemento for clicado duas vezes seguidas.
    void hl.offsetWidth;
    hl.classList.add("fsearch-highlight");
    highlightTimer = setTimeout(function(){
      hl.classList.remove("fsearch-highlight");
      highlightTimer = null;
    }, HIGHLIGHT_MS);
  }

  /* ---------- boot ---------- */
  function init(){
    ensureUI();
  }

  window.FichaSearch = {
    init: init
  };

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
