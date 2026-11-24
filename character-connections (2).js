/* ==========================================================
   CONEXÕES DA FICHA — ETAPA 2
   Sistema independente e autocontido, adicionado sobre a
   arquitetura já existente. NÃO recria o Compêndio de Conexões
   (CONEXOES_DATA / renderConexoes / openConexaoModal continuam
   exatamente como estão) e NÃO cria uma segunda biblioteca:
   apenas guarda, por ficha, uma lista de REFERÊNCIAS (o nome de
   cada Conexão, que já é único dentro de CONEXOES_DATA) e usa
   essas referências para:

     PARANORMAL → "Minhas Conexões"   (gerenciamento: add/remover)
     AGENTES → "Conexão"              (reflexo automático da ficha)

   Armazenamento: NÃO cria um localStorage/chave separada. A lista
   de referências fica num <input type="hidden" id="agente_conexoes_ids">
   dentro de #tab-agentes — ou seja, é só mais um campo que
   agentFieldIds() já varre sozinho, então saveAgent()/loadAgent()/
   duplicateSheet()/export-import já salvam, carregam e duplicam
   essa lista automaticamente, exatamente como fazem hoje com
   hab50_unlocked e aborto_limbico_habilidades — nenhuma dessas
   funções precisou ser reescrita.

   Este arquivo só ENVOLVE (sem redefinir) openSheet() e
   createNewSheet(), do mesmo jeito que a Bandeja de Rolagens já
   faz mais abaixo no projeto, para trocar de "dono" junto com a
   troca/criação de ficha.
   ========================================================== */
(function(){

  var HIDDEN_FIELD_ID = "agente_conexoes_ids";
  var pickerActiveFilter = "todas";

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

  function getConnRefs(){
    var el = ensureHiddenField();
    if(!el) return [];
    try{
      var arr = JSON.parse(el.value || "[]");
      return Array.isArray(arr) ? arr : [];
    }catch(e){
      return [];
    }
  }

  // Grava a lista e marca a ficha como tendo alterações pendentes
  // (mesmo comportamento dos demais campos da ficha — só é
  // persistido de fato quando o usuário clica "💾 Salvar Ficha").
  function setConnRefs(arr){
    var el = ensureHiddenField();
    if(!el) return;
    el.value = JSON.stringify(arr);
    if(typeof markAgentDirty === "function") markAgentDirty();
  }

  // Reset silencioso (sem marcar a ficha como suja) — usado só ao
  // trocar/criar ficha, para nunca deixar a referência da ficha
  // anterior vazar para a próxima antes do carregamento real.
  function resetConnRefsSilent(){
    var el = ensureHiddenField();
    if(el) el.value = "[]";
  }

  function findConnByRef(ref){
    if(typeof CONEXOES_DATA === "undefined") return null;
    for(var i = 0; i < CONEXOES_DATA.length; i++){
      if(CONEXOES_DATA[i].n === ref) return CONEXOES_DATA[i];
    }
    return null;
  }

  function addConnection(ref){
    var refs = getConnRefs();
    if(refs.indexOf(ref) !== -1) return; // já está na ficha — não duplica
    var c = findConnByRef(ref);
    if(c && c.noAdd === true) return; // Aborto Límbico — nunca adicionável como Conexão
    refs.push(ref);
    setConnRefs(refs);
    renderAll();
  }

  function removeConnection(ref){
    var refs = getConnRefs().filter(function(r){ return r !== ref; });
    setConnRefs(refs);
    renderAll();
  }

  /* ---------- pequenos helpers que reaproveitam funções já existentes ---------- */

  function esc(s){
    if(typeof escapeHtml === "function") return escapeHtml(s);
    var d = document.createElement("div");
    d.textContent = (s === undefined || s === null) ? "" : String(s);
    return d.innerHTML;
  }

  // Algumas entradas do Compêndio (ex.: categoria "Especiais") não
  // possuem símbolo no livro — retorna null nesse caso, e quem chama
  // decide não renderizar nenhuma <img> (sem imagem quebrada / falsa).
  function symSrc(c){
    if(!c || !c.s) return null;
    if(typeof cx_symSrc === "function") return cx_symSrc(c);
    return "data:image/png;base64," + c.s;
  }

  function dimLabel(c){
    if(typeof CONEXOES_DIM_LABELS !== "undefined"){
      return c.d === "tecnica" ? "Técnica de Aborto Límbico" : (CONEXOES_DIM_LABELS[c.d] || c.dl || "");
    }
    return c.dl || "";
  }

  /* ==========================================================
     PARANORMAL → "MINHAS CONEXÕES"
     Painel novo, adicionado como último filho de #tab-paranormal —
     o painel manual já existente ali ("Paranormal — Conexões")
     não é tocado nem movido.
     ========================================================== */

  function ensureParanormalPanel(){
    if(document.getElementById("cconn_panel")) return;
    var tabParanormal = document.getElementById("tab-paranormal");
    if(!tabParanormal) return;

    var panel = document.createElement("div");
    panel.className = "panel";
    panel.id = "cconn_panel";
    panel.innerHTML =
      '<h2>Minhas Conexões <span class="tag">Vinculado ao Compêndio</span></h2>' +
      '<p class="empty-state" style="margin-bottom:14px;">' +
        'Conexões desta ficha, selecionadas diretamente do Compêndio. ' +
        'Elas aparecem automaticamente em <strong>Agentes → Conexão</strong>.' +
      '</p>' +
      '<div class="cconn-toolbar">' +
        '<button type="button" id="cconn_add_btn">+ Adicionar Conexão</button>' +
      '</div>' +
      '<div id="cconn_list"></div>';

    tabParanormal.appendChild(panel);
    document.getElementById("cconn_add_btn").addEventListener("click", openPickerModal);
  }

  function renderMinhasConexoes(){
    ensureParanormalPanel();
    var list = document.getElementById("cconn_list");
    if(!list) return;

    var refs = getConnRefs();
    if(refs.length === 0){
      list.innerHTML = '<div class="empty-state">Nenhuma Conexão adicionada a esta ficha ainda.</div>';
      return;
    }

    list.innerHTML = "";
    refs.forEach(function(ref){
      var c = findConnByRef(ref);
      var card = document.createElement("div");
      card.className = "entry-card cconn-entry-card";

      if(c){
        var thumbSrc = symSrc(c);
        var thumbHtml = thumbSrc ? ('<img class="cconn-thumb" src="' + thumbSrc + '" alt="">') : '';
        card.innerHTML =
          thumbHtml +
          '<div class="entry-body">' +
            '<div class="entry-title">' + esc(c.n) + ' <span class="meta">' + esc(dimLabel(c)) + '</span></div>' +
          '</div>' +
          '<button class="entry-del" type="button" data-cconn-remove="' + esc(ref) + '">Remover</button>';
      } else {
        // Referência que não foi encontrada no Compêndio (ex.: Conexão
        // renomeada/removida da biblioteca) — não quebra a lista, só
        // avisa, e continua removível normalmente.
        card.innerHTML =
          '<div class="entry-body">' +
            '<div class="entry-title">' + esc(ref) + ' <span class="meta">não encontrada no Compêndio</span></div>' +
          '</div>' +
          '<button class="entry-del" type="button" data-cconn-remove="' + esc(ref) + '">Remover</button>';
      }
      list.appendChild(card);
    });

    list.querySelectorAll("[data-cconn-remove]").forEach(function(btn){
      btn.addEventListener("click", function(){
        removeConnection(btn.getAttribute("data-cconn-remove"));
      });
    });
  }

  /* ==========================================================
     AGENTES → "CONEXÃO"
     Painel novo, inserido como irmão do bloco ".two-col" que já
     contém "Conexões Aprendidas" / "Anotações do Agente" — esse
     bloco e os campos que ele contém não são alterados nem
     movidos, o painel novo só entra antes dele.
     ========================================================== */

  function ensureAgentesDisplayPanel(){
    if(document.getElementById("cconn_agente_panel")) return;
    var conexoesField = document.getElementById("conexoes");
    if(!conexoesField) return;
    var twoCol = conexoesField.closest(".two-col");
    if(!twoCol || !twoCol.parentElement) return;

    var panel = document.createElement("div");
    panel.className = "panel";
    panel.id = "cconn_agente_panel";
    panel.innerHTML =
      '<h2>Conexão</h2>' +
      '<div id="cconn_agente_grid" class="cconn-agente-grid"></div>';

    twoCol.parentElement.insertBefore(panel, twoCol);
  }

  function renderAgenteConexoes(){
    ensureAgentesDisplayPanel();
    var grid = document.getElementById("cconn_agente_grid");
    if(!grid) return;

    var refs = getConnRefs();
    if(refs.length === 0){
      grid.innerHTML = '<div class="empty-state">Nenhuma Conexão vinculada. Adicione em Paranormal → Minhas Conexões.</div>';
      return;
    }

    grid.innerHTML = "";
    refs.forEach(function(ref){
      var c = findConnByRef(ref);
      var block = document.createElement("div");
      block.className = "cconn-block" + (c ? (" cx-" + c.d) : "");
      block.setAttribute("data-conn-ref", ref);

      var blockThumbSrc = c ? symSrc(c) : null;
      block.innerHTML = c
        ? ((blockThumbSrc ? ('<img class="cconn-thumb-sm" src="' + blockThumbSrc + '" alt="">') : '') + '<span>' + esc(c.n) + '</span>')
        : ('<span>' + esc(ref) + '</span>');

      // Preparado para a Etapa 3: já reaproveita o modal de detalhes
      // do próprio Compêndio (sem alterá-lo) para abrir a ficha
      // completa da Conexão ao clicar.
      if(c && typeof openConexaoModal === "function" && typeof CONEXOES_DATA !== "undefined"){
        block.addEventListener("click", function(){
          openConexaoModal(CONEXOES_DATA.indexOf(c));
        });
      }

      grid.appendChild(block);
    });
  }

  function renderAll(){
    renderMinhasConexoes();
    renderAgenteConexoes();
  }

  /* ==========================================================
     MODAL "ADICIONAR CONEXÃO"
     Lista as Conexões que já existem em CONEXOES_DATA (mesma
     fonte de dados do Compêndio) para seleção — não cadastra
     nada novo, não duplica a biblioteca.
     ========================================================== */

  function ensurePickerModal(){
    if(document.getElementById("cconn_picker_modal")) return;

    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "cconn_picker_modal";
    overlay.innerHTML =
      '<div class="modal-box cconn-picker-box">' +
        '<button type="button" class="cconn-picker-close" id="cconn_picker_close">&times;</button>' +
        '<h3>Adicionar Conexão à Ficha</h3>' +
        '<div class="field cconn-picker-search-row"><label>Pesquisar</label>' +
          '<input type="text" id="cconn_picker_search" placeholder="Nome da Conexão…"></div>' +
        '<div id="cconn_picker_filters" class="cx-filters"></div>' +
        '<div id="cconn_picker_count" class="note cconn-picker-count"></div>' +
        '<div id="cconn_picker_list" class="cconn-picker-list"></div>' +
      '</div>';
    document.body.appendChild(overlay);

    document.getElementById("cconn_picker_close").addEventListener("click", closePickerModal);
    overlay.addEventListener("click", function(e){
      if(e.target.id === "cconn_picker_modal") closePickerModal();
    });

    var searchEl = document.getElementById("cconn_picker_search");
    var handler = (typeof debounce === "function") ? debounce(renderPickerList, 150) : renderPickerList;
    searchEl.addEventListener("input", handler);
  }

  function renderPickerFilters(){
    var wrap = document.getElementById("cconn_picker_filters");
    if(!wrap || wrap.dataset.built) return;
    if(typeof CONEXOES_DIM_ORDER === "undefined" || typeof CONEXOES_DIM_LABELS === "undefined") return;

    var html = '<button type="button" class="cx-filter-btn cx-filter-all active" data-filter="todas">Todas</button>';
    CONEXOES_DIM_ORDER.forEach(function(key){
      var label = key === "tecnica" ? "Técnicas de Aborto Límbico" : CONEXOES_DIM_LABELS[key];
      html += '<button type="button" class="cx-filter-btn cx-' + key + '" data-filter="' + key + '"><span class="dot"></span>' + esc(label) + '</button>';
    });
    wrap.innerHTML = html;
    wrap.dataset.built = "1";

    wrap.querySelectorAll(".cx-filter-btn").forEach(function(btn){
      btn.addEventListener("click", function(){
        pickerActiveFilter = btn.dataset.filter;
        wrap.querySelectorAll(".cx-filter-btn").forEach(function(b){ b.classList.remove("active"); });
        btn.classList.add("active");
        renderPickerList();
      });
    });
  }

  function renderPickerList(){
    var list = document.getElementById("cconn_picker_list");
    var countEl = document.getElementById("cconn_picker_count");
    if(!list || typeof CONEXOES_DATA === "undefined") return;

    var searchEl = document.getElementById("cconn_picker_search");
    var q = ((searchEl && searchEl.value) || "").toLowerCase().trim();

    var items = CONEXOES_DATA;
    if(pickerActiveFilter !== "todas"){
      items = items.filter(function(c){ return c.d === pickerActiveFilter; });
    }
    if(q){
      items = items.filter(function(c){
        return c.n.toLowerCase().indexOf(q) !== -1 ||
               ((CONEXOES_DIM_LABELS && CONEXOES_DIM_LABELS[c.d]) || "").toLowerCase().indexOf(q) !== -1 ||
               (c.dl || "").toLowerCase().indexOf(q) !== -1;
      });
    }

    if(countEl) countEl.textContent = items.length + " resultado" + (items.length === 1 ? "" : "s");

    if(items.length === 0){
      list.innerHTML = '<div class="cconn-picker-empty">Nenhuma Conexão encontrada para este filtro/pesquisa.</div>';
      return;
    }

    var currentRefs = getConnRefs();
    list.innerHTML = "";
    items.forEach(function(c){
      var inSheet = currentRefs.indexOf(c.n) !== -1;
      // Exceção obrigatória: Aborto Límbico aparece no Compêndio (dentro
      // de Conexões Superiores) mas nunca pode ser adicionado à ficha
      // como Conexão — ele já possui seu próprio sistema em Agentes.
      var blocked = c.noAdd === true;
      var row = document.createElement("div");
      row.className = "cconn-picker-row cx-" + c.d;
      var rowThumbSrc = symSrc(c);
      var rowThumbHtml = rowThumbSrc ? ('<img class="cconn-thumb-sm" src="' + rowThumbSrc + '" alt="">') : '';
      var btnHtml = blocked
        ? '<button type="button" class="cconn-picker-add-btn in-sheet" disabled title="Aborto Límbico possui seu próprio sistema em Agentes e não pode ser adicionado como Conexão.">Indisponível</button>'
        : ('<button type="button" class="cconn-picker-add-btn' + (inSheet ? ' in-sheet' : '') + '">' +
            (inSheet ? '✓ Na Ficha' : 'Adicionar') +
          '</button>');
      row.innerHTML =
        rowThumbHtml +
        '<div class="cconn-picker-row-body">' +
          '<div class="cconn-picker-row-title">' + esc(c.n) + '</div>' +
          '<div class="cconn-picker-row-dim">' + esc(dimLabel(c)) + '</div>' +
        '</div>' +
        btnHtml;

      if(!blocked){
        var btn = row.querySelector(".cconn-picker-add-btn");
        btn.addEventListener("click", function(){
          addConnection(c.n);
          renderPickerList(); // atualiza o botão desta linha para "✓ Na Ficha"
        });
      }

      list.appendChild(row);
    });
  }

  function openPickerModal(){
    ensurePickerModal();
    pickerActiveFilter = "todas";
    var wrap = document.getElementById("cconn_picker_filters");
    if(wrap){
      wrap.querySelectorAll(".cx-filter-btn").forEach(function(b){ b.classList.remove("active"); });
      var allBtn = wrap.querySelector('[data-filter="todas"]');
      if(allBtn) allBtn.classList.add("active");
    }
    var searchEl = document.getElementById("cconn_picker_search");
    if(searchEl) searchEl.value = "";
    renderPickerFilters();
    renderPickerList();
    document.getElementById("cconn_picker_modal").style.display = "flex";
  }

  function closePickerModal(){
    var m = document.getElementById("cconn_picker_modal");
    if(m) m.style.display = "none";
  }

  /* ==========================================================
     INTEGRAÇÃO COM O FLUXO DE FICHAS JÁ EXISTENTE
     Mesmo padrão já usado pela Bandeja de Rolagens: envolve
     openSheet() / createNewSheet() sem reescrevê-las, só para
     trocar de "dono" junto com a troca/criação de ficha.
     ========================================================== */

  function wrapSheetFunctions(){
    if(typeof openSheet === "function"){
      var _origOpenSheet = openSheet;
      openSheet = async function(id){
        // Evita que a referência da ficha anterior "vaze" para a
        // próxima antes do carregamento real (relevante só para
        // fichas antigas, salvas antes de agente_conexoes_ids
        // existir — loadAgent() sobrescreve normalmente quando o
        // campo já foi salvo).
        resetConnRefsSilent();
        await _origOpenSheet(id);
        renderAll();
      };
    }
    if(typeof createNewSheet === "function"){
      var _origCreateNewSheet = createNewSheet;
      createNewSheet = async function(){
        await _origCreateNewSheet();
        resetConnRefsSilent();
        renderAll();
      };
    }
  }

  /* ---------- boot ---------- */
  function initCharacterConnections(){
    ensureHiddenField();
    wrapSheetFunctions();
    ensureParanormalPanel();
    ensureAgentesDisplayPanel();
    renderAll();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", initCharacterConnections);
  } else {
    initCharacterConnections();
  }

})();
