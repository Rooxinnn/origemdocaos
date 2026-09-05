/* ==========================================================
   CONEXÕES DA FICHA — ETAPA 2 + ETAPA 3 (PERSONALIZADAS)
   Sistema independente e autocontido, adicionado sobre a
   arquitetura já existente. NÃO recria o Compêndio de Conexões
   (CONEXOES_DATA / renderConexoes / openConexaoModal continuam
   exatamente como estão) e NÃO cria uma segunda biblioteca:
   apenas guarda, por ficha, uma lista de REFERÊNCIAS e usa
   essas referências para:

     PARANORMAL → "Minhas Conexões"   (gerenciamento: add/remover)
     AGENTES → "Conexão"              (reflexo automático da ficha)

   Armazenamento das referências da ficha: NÃO cria um localStorage/
   chave separada. A lista de referências fica num
   <input type="hidden" id="agente_conexoes_ids"> dentro de
   #tab-agentes — ou seja, é só mais um campo que agentFieldIds() já
   varre sozinho, então saveAgent()/loadAgent()/duplicateSheet()/
   export-import já salvam, carregam e duplicam essa lista
   automaticamente, exatamente como fazem hoje com hab50_unlocked e
   aborto_limbico_habilidades — nenhuma dessas funções precisou ser
   reescrita.

   Referências: para Conexões oficiais, a referência é o nome (c.n),
   único dentro de CONEXOES_DATA. Para Personalizadas, a referência é
   o ID próprio da Personalizada (ex.: "custom-..."), nunca o nome —
   assim duas Personalizadas podem ter o mesmo nome sem conflito, e
   uma Personalizada nunca esbarra numa Conexão oficial.

   ----------------------------------------------------------
   PERSONALIZADAS (ETAPA 3)
   ----------------------------------------------------------
   PERSONALIZADAS é tratada como mais uma categoria dentro da MESMA
   interface "Adicionar Conexão à Ficha": mesmo modal, mesmos
   filtros, mesma pesquisa, mesmo estilo visual. Não existe uma
   segunda interface, um segundo picker ou um segundo modal de
   detalhes — o modal de detalhes das Personalizadas reaproveita o
   MESMO #cx_modal (DOM/CSS) já usado pelo Compêndio, só que
   populado por uma função própria (openPersonalizadaModal), porque
   openConexaoModal() do index.html espera um índice numérico dentro
   de CONEXOES_DATA e não pode ser chamada para um objeto que não
   pertence a essa biblioteca. O index.html NÃO é alterado.

   Biblioteca de Personalizadas: array próprio (customConnections),
   guardado com a MESMA infraestrutura já usada pelo projeto
   (storageGet/storageSet — window.storage com fallback para
   localStorage), sob a chave "conexoes:personalizadas". É uma
   coleção GLOBAL do usuário (a biblioteca), independente de qual
   ficha está aberta — exatamente como CONEXOES_DATA é uma biblioteca
   global. A associação de uma Personalizada com UMA ficha específica
   continua sendo feita só pela lista de referências da própria ficha
   (agente_conexoes_ids), então adicionar uma Personalizada a uma
   ficha nunca a adiciona a outra.

   Este arquivo só ENVOLVE (sem redefinir) openSheet() e
   createNewSheet(), do mesmo jeito que a Bandeja de Rolagens já faz
   mais abaixo no projeto, para trocar de "dono" junto com a
   troca/criação de ficha. Também envolve openConexaoModal() apenas
   para esconder as ações extras (Editar/Excluir/Adicionar-Remover)
   quando uma Conexão oficial é aberta — o comportamento da função
   original não muda em nenhuma linha.
   ========================================================== */
(function(){

  var HIDDEN_FIELD_ID = "agente_conexoes_ids";
  var CUSTOM_STORAGE_KEY = "conexoes:personalizadas";
  var pickerActiveFilter = "todas";

  var customConnections = [];   // biblioteca de Personalizadas (carregada de storageGet)
  var customLoaded = false;
  var customIdCounter = 0;

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

  /* ---------- biblioteca de Personalizadas ---------- */

  function genCustomId(){
    customIdCounter++;
    return "custom-" + Date.now().toString(36) + "-" + customIdCounter.toString(36) + "-" + Math.random().toString(36).slice(2,7);
  }

  function findCustomById(id){
    for(var i = 0; i < customConnections.length; i++){
      if(customConnections[i].id === id) return customConnections[i];
    }
    return null;
  }

  // Converte uma Personalizada (formato de armazenamento: id/name/
  // description/tag/type) para o mesmo "formato de entrada" que
  // CONEXOES_DATA usa (n/d/dl/c/e/s), para que TODO o resto do
  // sistema (findConnByRef, dimLabel, symSrc, renderPickerList,
  // renderMinhasConexoes, renderAgenteConexoes) funcione sem precisar
  // saber se está lidando com uma Conexão oficial ou Personalizada.
  function customToEntry(cc){
    return {
      __custom: true,
      id: cc.id,
      n: cc.name,
      d: "personalizada",
      dl: cc.tag || "Personalizada",
      tag: cc.tag || "",
      description: cc.description || "",
      c: {},
      e: [],
      s: null,
      p: null
    };
  }

  function getCustomEntries(){
    return customConnections.map(customToEntry);
  }

  async function saveCustomLibrary(){
    await storageSet(CUSTOM_STORAGE_KEY, JSON.stringify(customConnections), 1, true);
  }

  function createCustomConnection(data){
    var cc = {
      id: genCustomId(),
      name: (data.name || "").trim(),
      description: (data.description || "").trim(),
      tag: (data.tag || "").trim(),
      type: "custom"
    };
    customConnections.push(cc);
    saveCustomLibrary();
    return cc;
  }

  function updateCustomConnection(id, data){
    var cc = findCustomById(id);
    if(!cc) return null;
    cc.name = (data.name || "").trim();
    cc.description = (data.description || "").trim();
    cc.tag = (data.tag || "").trim();
    saveCustomLibrary();
    return cc;
  }

  function deleteCustomConnection(id){
    customConnections = customConnections.filter(function(c){ return c.id !== id; });
    saveCustomLibrary();
  }

  async function loadCustomConnections(){
    try{
      var raw = await storageGet(CUSTOM_STORAGE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      customConnections = Array.isArray(arr) ? arr : [];
    }catch(e){
      customConnections = [];
    }
    customLoaded = true;
    renderAll();
    // Se o picker já estiver aberto (ex.: carregamento lento), atualiza
    // a lista assim que a biblioteca de Personalizadas chegar.
    var pickerModal = document.getElementById("cconn_picker_modal");
    if(pickerModal && pickerModal.style.display === "flex") renderPickerList();
  }

  /* ---------- referência → entrada (oficial OU personalizada) ---------- */

  function refOf(c){
    return c.__custom ? c.id : c.n;
  }

  function findConnByRef(ref){
    var custom = findCustomById(ref);
    if(custom) return customToEntry(custom);
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
  // possuem símbolo no livro, e Personalizadas nunca têm símbolo —
  // retorna null nesse caso, e quem chama decide não renderizar
  // nenhuma <img> (sem imagem quebrada / falsa).
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
        'Conexões desta ficha, selecionadas diretamente do Compêndio ou criadas por você em Personalizadas. ' +
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
        var detailsBtnHtml = c.__custom
          ? '<button class="entry-del" type="button" data-cconn-details="' + esc(ref) + '">Detalhes</button>'
          : '';
        card.innerHTML =
          thumbHtml +
          '<div class="entry-body">' +
            '<div class="entry-title">' + esc(c.n) + ' <span class="meta">' + esc(dimLabel(c)) + '</span></div>' +
          '</div>' +
          detailsBtnHtml +
          '<button class="entry-del" type="button" data-cconn-remove="' + esc(ref) + '">Remover</button>';
      } else {
        // Referência que não foi encontrada (Conexão oficial renomeada/
        // removida da biblioteca, ou Personalizada excluída) — não
        // quebra a lista, só avisa, e continua removível normalmente.
        card.innerHTML =
          '<div class="entry-body">' +
            '<div class="entry-title">' + esc(ref) + ' <span class="meta">não encontrada (pode ter sido excluída)</span></div>' +
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
    list.querySelectorAll("[data-cconn-details]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var c2 = findConnByRef(btn.getAttribute("data-cconn-details"));
        if(c2 && c2.__custom) openPersonalizadaModal(c2);
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

      // Reaproveita o modal de detalhes: Conexão oficial → modal do
      // Compêndio (openConexaoModal, sem nenhuma alteração nele);
      // Personalizada → modal próprio, que popula o MESMO #cx_modal.
      if(c){
        block.addEventListener("click", function(){
          if(c.__custom){
            openPersonalizadaModal(c);
          } else if(typeof openConexaoModal === "function" && typeof CONEXOES_DATA !== "undefined"){
            openConexaoModal(CONEXOES_DATA.indexOf(c));
          }
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
     Lista as Conexões que já existem em CONEXOES_DATA (mesma fonte
     de dados do Compêndio) MAIS as Personalizadas da biblioteca do
     usuário, lado a lado, na mesma lista/filtro/pesquisa — não
     cadastra nada novo em CONEXOES_DATA, não duplica a biblioteca
     oficial.
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
    // PERSONALIZADAS entra como mais uma categoria da MESMA barra de
    // filtros, sempre por último — nunca é adicionada a
    // CONEXOES_DIM_ORDER (isso afetaria o Compêndio), só à barra
    // deste picker.
    html += '<button type="button" class="cx-filter-btn cx-personalizada" data-filter="personalizada"><span class="dot"></span>Personalizadas</button>';
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
    if(!list) return;

    var searchEl = document.getElementById("cconn_picker_search");
    var q = ((searchEl && searchEl.value) || "").toLowerCase().trim();

    var officialItems = (typeof CONEXOES_DATA !== "undefined") ? CONEXOES_DATA : [];
    var items = officialItems.concat(getCustomEntries());

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

    list.innerHTML = "";

    // "+ CRIAR CONEXÃO PERSONALIZADA" — só aparece dentro da própria
    // categoria PERSONALIZADAS, junto da lista (item fixo no topo),
    // exatamente como pedido.
    if(pickerActiveFilter === "personalizada"){
      var createBtn = document.createElement("button");
      createBtn.type = "button";
      createBtn.className = "cconn-picker-create-btn";
      createBtn.textContent = "+ Criar Conexão Personalizada";
      createBtn.addEventListener("click", function(){ openCustomForm(null, false); });
      list.appendChild(createBtn);
    }

    if(items.length === 0){
      var empty = document.createElement("div");
      empty.className = "cconn-picker-empty";
      empty.textContent = "Nenhuma Conexão encontrada para este filtro/pesquisa.";
      list.appendChild(empty);
      return;
    }

    var currentRefs = getConnRefs();
    items.forEach(function(c){
      var ref = refOf(c);
      var inSheet = currentRefs.indexOf(ref) !== -1;
      // Exceção obrigatória: Aborto Límbico aparece no Compêndio (dentro
      // de Conexões Superiores) mas nunca pode ser adicionado à ficha
      // como Conexão — ele já possui seu próprio sistema em Agentes.
      var blocked = c.noAdd === true;
      var row = document.createElement("div");
      row.className = "cconn-picker-row cx-" + c.d + (c.__custom ? " is-clickable" : "");
      var rowThumbSrc = symSrc(c);
      var rowThumbHtml = rowThumbSrc ? ('<img class="cconn-thumb-sm" src="' + rowThumbSrc + '" alt="">') : '';
      var badgeHtml = c.__custom ? ' <span class="cconn-custom-badge">Personalizada</span>' : '';
      var btnHtml = blocked
        ? '<button type="button" class="cconn-picker-add-btn in-sheet" disabled title="Aborto Límbico possui seu próprio sistema em Agentes e não pode ser adicionado como Conexão.">Indisponível</button>'
        : ('<button type="button" class="cconn-picker-add-btn' + (inSheet ? ' in-sheet' : '') + '">' +
            (inSheet ? '✓ Na Ficha' : 'Adicionar') +
          '</button>');
      row.innerHTML =
        rowThumbHtml +
        '<div class="cconn-picker-row-body">' +
          '<div class="cconn-picker-row-title">' + esc(c.n) + badgeHtml + '</div>' +
          '<div class="cconn-picker-row-dim">' + esc(dimLabel(c)) + '</div>' +
        '</div>' +
        btnHtml;

      if(!blocked){
        var btn = row.querySelector(".cconn-picker-add-btn");
        btn.addEventListener("click", function(e){
          e.stopPropagation();
          addConnection(ref);
          renderPickerList(); // atualiza o botão desta linha para "✓ Na Ficha"
        });
      }

      // Só as Personalizadas abrem o modal de detalhes ao clicar na
      // linha (é lá que ficam Editar/Excluir). Conexões oficiais
      // continuam exatamente como estavam — nada muda para elas.
      if(c.__custom){
        row.addEventListener("click", function(){
          openPersonalizadaModal(c);
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
     FORMULÁRIO "CRIAR / EDITAR CONEXÃO PERSONALIZADA"
     Modal próprio (nome, etiqueta, descrição) — único ponto de
     entrada de dados das Personalizadas. Usado tanto para criar
     quanto para editar (editar nunca cria uma nova entrada: sempre
     grava de volta no mesmo id).
     ========================================================== */

  function ensureCustomFormModal(){
    if(document.getElementById("cconn_form_modal")) return;

    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "cconn_form_modal";
    overlay.innerHTML =
      '<div class="modal-box cconn-form-box">' +
        '<button type="button" class="cconn-picker-close" id="cconn_form_close">&times;</button>' +
        '<h3 id="cconn_form_title">Criar Conexão Personalizada</h3>' +
        '<div class="field cconn-form-field"><label>Nome</label>' +
          '<input type="text" id="cconn_form_name" maxlength="80" placeholder="Nome da Conexão…"></div>' +
        '<div class="field cconn-form-field"><label>Etiqueta</label>' +
          '<input type="text" id="cconn_form_tag" maxlength="40" list="cconn_form_tag_list" placeholder="Ex.: Campanha, NPC, Mestre…"></div>' +
        '<datalist id="cconn_form_tag_list">' +
          '<option value="Especial"><option value="Pessoal"><option value="NPC">' +
          '<option value="Campanha"><option value="Mestre"><option value="Customizada">' +
        '</datalist>' +
        '<div class="field cconn-form-field cconn-form-field-desc"><label>Descrição</label>' +
          '<textarea id="cconn_form_desc" placeholder="Descrição da Conexão…"></textarea></div>' +
        '<div class="cconn-form-err" id="cconn_form_err" style="display:none;">Informe um nome para a Conexão.</div>' +
        '<div class="cconn-form-actions">' +
          '<button type="button" id="cconn_form_cancel">Cancelar</button>' +
          '<button type="button" id="cconn_form_save" class="primary">Salvar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    document.getElementById("cconn_form_close").addEventListener("click", closeCustomForm);
    document.getElementById("cconn_form_cancel").addEventListener("click", closeCustomForm);
    overlay.addEventListener("click", function(e){
      if(e.target.id === "cconn_form_modal") closeCustomForm();
    });

    document.getElementById("cconn_form_save").addEventListener("click", function(){
      var nameEl = document.getElementById("cconn_form_name");
      var tagEl = document.getElementById("cconn_form_tag");
      var descEl = document.getElementById("cconn_form_desc");
      var errEl = document.getElementById("cconn_form_err");
      var name = (nameEl.value || "").trim();
      if(!name){
        errEl.style.display = "block";
        nameEl.focus();
        return;
      }
      errEl.style.display = "none";

      var editingId = overlay.dataset.editingId || "";
      var data = { name: name, tag: tagEl.value, description: descEl.value };
      var saved = editingId ? updateCustomConnection(editingId, data) : createCustomConnection(data);
      var reopenModal = overlay.dataset.reopenModal === "1";

      closeCustomForm();
      renderAll();
      renderPickerList();

      if(reopenModal && saved) openPersonalizadaModal(customToEntry(saved));
    });
  }

  // reopenAfterSave: quando a edição foi aberta a partir do modal de
  // detalhes ("Editar"), reabre o mesmo modal já atualizado ao salvar,
  // mantendo tudo dentro do mesmo fluxo (nunca cria uma segunda
  // Personalizada nem um segundo modal).
  function openCustomForm(existingCustom, reopenAfterSave){
    ensureCustomFormModal();
    var overlay = document.getElementById("cconn_form_modal");
    var nameEl = document.getElementById("cconn_form_name");
    var tagEl = document.getElementById("cconn_form_tag");
    var descEl = document.getElementById("cconn_form_desc");
    var errEl = document.getElementById("cconn_form_err");

    errEl.style.display = "none";
    document.getElementById("cconn_form_title").textContent = existingCustom ? "Editar Conexão Personalizada" : "Criar Conexão Personalizada";
    nameEl.value = existingCustom ? existingCustom.name : "";
    tagEl.value = existingCustom ? existingCustom.tag : "";
    descEl.value = existingCustom ? existingCustom.description : "";
    overlay.dataset.editingId = existingCustom ? existingCustom.id : "";
    overlay.dataset.reopenModal = reopenAfterSave ? "1" : "0";

    overlay.style.display = "flex";
    nameEl.focus();
  }

  function closeCustomForm(){
    var m = document.getElementById("cconn_form_modal");
    if(m) m.style.display = "none";
  }

  /* ==========================================================
     MODAL DE DETALHES DA PERSONALIZADA
     Reaproveita o MESMO #cx_modal (DOM e CSS) já usado pelo
     Compêndio para as Conexões oficiais — só popula os elementos por
     conta própria, porque openConexaoModal() do index.html é
     escrita especificamente para indexar CONEXOES_DATA[idx] e não
     pode ser reaproveitada como função para um objeto fora dessa
     biblioteca sem alterar o index.html (o que este projeto pede
     para evitar). Nenhum elemento novo de modal é criado: título,
     descrição, símbolo (oculto aqui) e botão fechar são os mesmos.
     Só as ações extras (Adicionar/Remover/Editar/Excluir) são
     adicionadas, e somente quando uma Personalizada está aberta.
     ========================================================== */

  function ensureModalCustomActions(){
    var existing = document.getElementById("cconn_modal_actions");
    if(existing) return existing;
    var modalBox = document.querySelector("#cx_modal .cx-modal-box");
    var actionsBar = document.querySelector("#cx_modal .modal-actions");
    if(!modalBox) return null;
    var actions = document.createElement("div");
    actions.id = "cconn_modal_actions";
    actions.className = "cconn-modal-actions";
    actions.style.display = "none";
    if(actionsBar) modalBox.insertBefore(actions, actionsBar);
    else modalBox.appendChild(actions);
    return actions;
  }

  // Chamado sempre que uma Conexão oficial é aberta (via wrap de
  // openConexaoModal), para nunca deixar as ações de Personalizada
  // aparecerem em cima de uma Conexão oficial.
  function hideCustomModalActions(){
    var actions = document.getElementById("cconn_modal_actions");
    if(actions) actions.style.display = "none";
  }

  function openPersonalizadaModal(entry){
    var cc = findCustomById(entry.id);
    if(!cc) return; // foi excluída entre um clique e outro
    var c = customToEntry(cc);

    var symWrap = document.getElementById("cx_modal_sym");
    if(symWrap) symWrap.style.display = "none"; // Personalizadas não têm símbolo

    var titleEl = document.getElementById("cx_modal_title");
    var dimEl = document.getElementById("cx_modal_dim");
    var tecnicaBadge = document.getElementById("cx_modal_tecnica_badge");
    var fieldsEl = document.getElementById("cx_modal_fields");
    var sectionsEl = document.getElementById("cx_modal_sections");
    var pageEl = document.getElementById("cx_modal_page");
    var modalBox = document.querySelector("#cx_modal .cx-modal-box");
    if(!titleEl || !modalBox) return;

    titleEl.textContent = c.n;
    if(dimEl) dimEl.textContent = c.dl || "Personalizada";
    if(tecnicaBadge) tecnicaBadge.style.display = "none";
    modalBox.className = "modal-box cx-modal-box cx-personalizada";
    if(fieldsEl) fieldsEl.innerHTML = "";

    var descHtml = c.description
      ? ('<div class="cx-modal-section"><h5>Descrição</h5><p>' + esc(c.description) + '</p></div>')
      : '<div class="cx-modal-section"><p class="empty-state">Sem descrição.</p></div>';
    if(sectionsEl) sectionsEl.innerHTML = descHtml;
    if(pageEl) pageEl.textContent = "Conexão Personalizada";

    var actions = ensureModalCustomActions();
    if(actions){
      var refs = getConnRefs();
      var inSheet = refs.indexOf(c.id) !== -1;
      actions.innerHTML =
        '<button type="button" id="cconn_modal_toggle_btn" class="primary">' + (inSheet ? "Remover da Ficha" : "Adicionar à Ficha") + '</button>' +
        '<button type="button" id="cconn_modal_edit_btn">Editar</button>' +
        '<button type="button" id="cconn_modal_delete_btn">Excluir</button>';
      actions.style.display = "flex";

      document.getElementById("cconn_modal_toggle_btn").addEventListener("click", function(){
        if(inSheet) removeConnection(c.id); else addConnection(c.id);
        openPersonalizadaModal(c); // re-renderiza o modal já com o novo estado
      });
      document.getElementById("cconn_modal_edit_btn").addEventListener("click", function(){
        document.getElementById("cx_modal").style.display = "none";
        openCustomForm(cc, true);
      });
      document.getElementById("cconn_modal_delete_btn").addEventListener("click", function(){
        if(!confirm('Excluir a Conexão Personalizada "' + cc.name + '"? Essa ação não pode ser desfeita.')) return;
        deleteCustomConnection(cc.id);
        removeConnection(cc.id); // some da ficha atual, se estiver associada (já renderiza tudo de novo)
        document.getElementById("cx_modal").style.display = "none";
        renderPickerList();
      });
    }

    document.getElementById("cx_modal").style.display = "flex";
  }

  /* ==========================================================
     INTEGRAÇÃO COM O FLUXO DE FICHAS/MODAL JÁ EXISTENTE
     Mesmo padrão já usado pela Bandeja de Rolagens: envolve
     openSheet() / createNewSheet() / openConexaoModal() sem
     reescrevê-las, só para trocar de "dono" junto com a
     troca/criação de ficha e para esconder as ações de Personalizada
     quando uma Conexão oficial é exibida.
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

  function wrapOpenConexaoModal(){
    if(typeof window.openConexaoModal !== "function") return;
    var _origOpenConexaoModal = window.openConexaoModal;
    window.openConexaoModal = function(idx){
      _origOpenConexaoModal(idx);
      hideCustomModalActions();
    };
  }

  /* ---------- boot ---------- */
  function initCharacterConnections(){
    ensureHiddenField();
    wrapSheetFunctions();
    wrapOpenConexaoModal();
    ensureParanormalPanel();
    ensureAgentesDisplayPanel();
    renderAll();
    loadCustomConnections();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", initCharacterConnections);
  } else {
    initCharacterConnections();
  }

})();
