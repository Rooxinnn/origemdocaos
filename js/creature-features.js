/* ==========================================================
   CREATURE FEATURES — módulo isolado e independente
   Implementa TRÊS funcionalidades sobre o sistema de "Minhas
   Criaturas" já existente (ver js/criaturas.js), sem reescrever,
   refatorar ou alterar uma única linha daquele arquivo:

   1) MODO VISUALIZAÇÃO / EDIÇÃO (botão 🖊️ EDITAR no cabeçalho)
      A ficha de criatura (#creature_sheet_screen) continua sendo a
      MESMA tela sempre — nunca existem duas fichas. Este módulo
      injeta, dentro do cabeçalho já existente (.cr-titlebar), um
      botão de alternância idêntico em conceito ao já usado na ficha
      de Agente (ver js/text-view-mode.js): "🖊️ EDITAR" (modo
      visualização) / "👁 VISUALIZAR" (modo edição).

      IMPORTANTE — a distinção é só sobre a APRESENTAÇÃO DOS TEXTOS
      LONGOS (cr_condicoes, cr_itens, cr_movimentos): no modo
      visualização, esses três campos (os únicos <textarea> de texto
      livre da ficha) são espelhados, em modo leitura, num bloco que
      cresce para mostrar o conteúdo inteiro (sem corte, sem scroll
      interno — scroll normal da página), com o MESMO padrão de
      "espelhamento por leitura periódica" já usado por
      js/text-view-mode.js. Nenhum outro campo é afetado: HP, PB,
      Proteção, RES N, ATK/DEF/DESV, MOVS, SAN, Peso e as grades de
      Habilidades/Talentos/Atributos/Perícias (Atual/Máx. + dado)
      continuam sendo <input> reais, sempre editáveis, em qualquer
      um dos dois modos — nunca viram texto estático.

      Ao abrir uma criatura salva (clique em "Abrir" em #creature_list,
      data-cr-open, já existente em criaturas.js) a ficha entra em
      modo VISUALIZAÇÃO. Ao criar uma criatura nova
      (#secret_card_criar, já existente) a ficha entra em modo EDIÇÃO
      (ficha em branco — faz sentido já começar editando). Em ambos
      os casos isso é feito com um listener ADICIONAL sobre os
      elementos já existentes (addEventListener soma-se aos
      listeners que criaturas.js já registrou — nunca os substitui).
      A preferência de modo (só a preferência, nunca o conteúdo da
      ficha) fica em localStorage sob chave própria, como já faz
      text-view-mode.js.

   2) CRIAR NOVA HABILIDADE (por criatura)
      Adiciona, dentro do painel "Movimentos, Conexões e
      Habilidades" já existente na ficha de criatura, uma lista de
      cards expansíveis (Nome + PB visíveis; ATK/PB/Descrição ao
      expandir) com criação, edição e exclusão.

      PERSISTÊNCIA — NÃO cria um segundo localStorage nem uma
      biblioteca global. As habilidades de cada criatura são
      guardadas como um JSON dentro de um único campo novo:
      <textarea id="cf_habilidades_data"> (oculto), inserido por
      este módulo dentro de #creature_sheet_screen. Isso é
      suficiente para entrar automaticamente no mesmo sistema de
      salvamento/leitura que TODOS os demais campos da ficha já
      usam (ver crFieldIds()/saveCreature()/openCreature()/
      clearCreatureForm() em criaturas.js, que operam sobre
      QUALQUER input/textarea/select dentro de #creature_sheet_screen
      pelo id, de forma genérica) — ou seja, o campo passa a ser
      salvo, carregado, limpo e duplicado automaticamente pela
      MESMA lógica que já existe, sem precisar alterar aquele
      arquivo.

      Como a ficha é uma única tela reaproveitada por todas as
      criaturas (idêntico ao padrão de Agentes), e o valor desse
      campo oculto muda "por baixo" sempre que criaturas.js abre,
      limpa ou troca de criatura, este módulo usa o mesmo padrão de
      "espelhamento por leitura periódica" já estabelecido no
      projeto (ver js/text-view-mode.js) para detectar essas trocas
      e re-renderizar os cards — sem precisar interceptar nem
      modificar openCreature()/clearCreatureForm().

   Toda classe nova é prefixada com "cfh-" para nunca colidir com
   nada existente (inclusive com "cr-*" da ficha de Criatura e
   "crf-*" da Ficha Completa/Compêndio).
   ========================================================== */
(function(){
  "use strict";

  var HIDDEN_FIELD_ID = "cf_habilidades_data";
  var POLL_INTERVAL_MS = 400;

  // ---------- Parte 1: Modo Visualização/Edição ----------
  // Únicos <textarea> de texto livre da ficha de criatura (ver
  // #creature_sheet_screen em index.html) — os mesmos que já
  // eram texto no HTML original, nunca campos mecânicos.
  var CV_TARGET_FIELD_IDS = ["cr_condicoes", "cr_itens", "cr_movimentos"];
  var CV_MODE_STORAGE_KEY = "criaturas:sheetViewMode"; // "view" | "edit"
  var CV_POLL_INTERVAL_MS = 400;

  var cvState = {
    mode: "view",
    initialized: false,
    fields: [], // { textarea, viewEl, lastValue }
    toggleBtn: null,
    toggleIcon: null,
    toggleLabel: null
  };

  var cfHabilidades = [];
  var lastSeenRaw = null;
  var pendingDeleteId = null;

  /* ---------- helpers ---------- */
  function esc(s){
    if(typeof window.escapeHtml === "function") return window.escapeHtml(s);
    var d = document.createElement("div");
    d.textContent = (s === undefined || s === null) ? "" : String(s);
    return d.innerHTML;
  }
  function genHabId(){
    return "cfhab_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }
  function parseHabilidades(raw){
    if(!raw) return [];
    try{
      var arr = JSON.parse(raw);
      if(!Array.isArray(arr)) return [];
      // Compatibilidade: garante que cada item tenha os campos esperados,
      // mesmo que a estrutura salva seja de uma versão futura/anterior.
      return arr.map(function(h){
        return {
          id: h && h.id ? String(h.id) : genHabId(),
          nome: h && h.nome !== undefined ? String(h.nome) : "",
          atk: h && h.atk !== undefined ? String(h.atk) : "",
          pb: h && h.pb !== undefined ? String(h.pb) : "",
          descricao: h && h.descricao !== undefined ? String(h.descricao) : ""
        };
      });
    }catch(e){
      return [];
    }
  }
  function getHiddenField(){
    return document.getElementById(HIDDEN_FIELD_ID);
  }
  function persist(){
    var el = getHiddenField();
    if(!el) return;
    var raw = JSON.stringify(cfHabilidades);
    el.value = raw;
    lastSeenRaw = raw;
  }

  /* ---------- injeção do markup (uma única vez, no carregamento) ----------
     Inserido como irmão do textarea #cr_movimentos, dentro do mesmo
     painel "Movimentos, Conexões e Habilidades" já existente. O
     textarea original NÃO é removido, substituído nem tem seu
     comportamento alterado — os dados que ele já guarda continuam
     intactos. */
  function injectMarkup(){
    if(document.getElementById(HIDDEN_FIELD_ID)) return true; // já injetado
    var movimentos = document.getElementById("cr_movimentos");
    if(!movimentos || !movimentos.parentNode) return false;

    var wrap = document.createElement("div");
    wrap.className = "cfh-hab-wrap";
    wrap.innerHTML =
      '<div class="cfh-hab-toolbar">' +
        '<span class="cfh-hab-toolbar-label">Habilidades da Criatura</span>' +
        '<button type="button" class="cfh-hab-add-btn" id="cfh_hab_add_btn">+ Criar Nova Habilidade</button>' +
      '</div>' +
      '<div class="cfh-hab-list" id="cfh_hab_list"></div>';

    var hidden = document.createElement("textarea");
    hidden.id = HIDDEN_FIELD_ID;
    hidden.setAttribute("aria-hidden", "true");
    hidden.style.display = "none";

    movimentos.parentNode.insertBefore(wrap, movimentos.nextSibling);
    movimentos.parentNode.insertBefore(hidden, wrap.nextSibling);
    return true;
  }

  /* ---------- render dos cards ---------- */
  function buildCard(h){
    var pbLabel = (h.pb !== "" ? esc(h.pb) : "—") + " PB";
    return (
      '<div class="cfh-hab-card" data-cfh-id="' + esc(h.id) + '">' +
        '<button type="button" class="cfh-hab-card-head" data-cfh-toggle="' + esc(h.id) + '">' +
          '<span class="cfh-hab-card-name">' + (h.nome ? esc(h.nome) : "Habilidade sem nome") + '</span>' +
          '<span class="cfh-hab-card-pb">' + pbLabel + '</span>' +
        '</button>' +
        '<div class="cfh-hab-card-body" id="cfh_hab_body_' + esc(h.id) + '">' +
          '<div class="cfh-hab-row"><label>ATK</label><div class="cfh-hab-row-value">' + (h.atk ? esc(h.atk) : "—") + '</div></div>' +
          '<div class="cfh-hab-row"><label>PB</label><div class="cfh-hab-row-value">' + (h.pb !== "" ? esc(h.pb) : "—") + '</div></div>' +
          '<div class="cfh-hab-row cfh-hab-desc"><label>Descrição</label><p>' + (h.descricao ? esc(h.descricao) : "—") + '</p></div>' +
          '<div class="cfh-hab-card-actions">' +
            '<button type="button" class="cfh-hab-edit-btn" data-cfh-edit="' + esc(h.id) + '">Editar</button>' +
            '<button type="button" class="cfh-hab-del-btn" data-cfh-del="' + esc(h.id) + '">Excluir</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderHabilidades(){
    var list = document.getElementById("cfh_hab_list");
    if(!list) return;
    if(cfHabilidades.length === 0){
      list.innerHTML = '<div class="empty-state">Nenhuma habilidade cadastrada ainda.</div>';
      return;
    }
    list.innerHTML = cfHabilidades.map(buildCard).join("");
    wireCardEvents();
  }

  function wireCardEvents(){
    document.querySelectorAll("[data-cfh-toggle]").forEach(function(btn){
      btn.onclick = function(){
        var card = btn.closest(".cfh-hab-card");
        var body = document.getElementById("cfh_hab_body_" + btn.dataset.cfhToggle);
        if(!card || !body) return;
        var open = card.classList.toggle("open");
        body.style.display = open ? "block" : "none";
      };
    });
    document.querySelectorAll("[data-cfh-edit]").forEach(function(btn){
      btn.onclick = function(){ openHabModal(btn.dataset.cfhEdit); };
    });
    document.querySelectorAll("[data-cfh-del]").forEach(function(btn){
      btn.onclick = function(){ confirmDeleteHabilidade(btn.dataset.cfhDel); };
    });
  }

  /* ---------- modal de criação/edição ---------- */
  function ensureHabModal(){
    if(document.getElementById("cfh_hab_modal")) return;
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay cfh-hab-modal";
    overlay.id = "cfh_hab_modal";
    overlay.innerHTML =
      '<div class="modal-box cfh-hab-modal-box">' +
        '<h3 id="cfh_hab_modal_title">Nova Habilidade</h3>' +
        '<div class="cfh-hab-field"><label>Nome</label><input type="text" id="cfh_f_nome" placeholder="Ex.: Mordida"></div>' +
        '<div class="cfh-hab-field"><label>ATK / Tipo de Ataque</label><input type="text" id="cfh_f_atk" placeholder="Ex.: Mordida, Garras…"></div>' +
        '<div class="cfh-hab-field"><label>PB</label><input type="text" inputmode="numeric" id="cfh_f_pb" placeholder="Ex.: 2"></div>' +
        '<div class="cfh-hab-field"><label>Descrição</label><textarea id="cfh_f_desc" style="min-height:120px;" placeholder="Como a habilidade funciona…"></textarea></div>' +
        '<div class="modal-actions">' +
          '<button type="button" id="cfh_hab_modal_cancel">Cancelar</button>' +
          '<button type="button" class="primary" id="cfh_hab_modal_save">Salvar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    document.getElementById("cfh_hab_modal_cancel").addEventListener("click", closeHabModal);
    overlay.addEventListener("click", function(e){ if(e.target === overlay) closeHabModal(); });
    document.getElementById("cfh_hab_modal_save").addEventListener("click", saveHabFromModal);
  }

  var editingHabId = null;
  function openHabModal(id){
    ensureHabModal();
    editingHabId = id || null;
    var h = id ? cfHabilidades.find(function(x){ return x.id === id; }) : null;
    document.getElementById("cfh_hab_modal_title").textContent = h ? "Editar Habilidade" : "Nova Habilidade";
    document.getElementById("cfh_f_nome").value = h ? h.nome : "";
    document.getElementById("cfh_f_atk").value = h ? h.atk : "";
    document.getElementById("cfh_f_pb").value = h ? h.pb : "";
    document.getElementById("cfh_f_desc").value = h ? h.descricao : "";
    document.getElementById("cfh_hab_modal").style.display = "flex";
  }
  function closeHabModal(){
    var modal = document.getElementById("cfh_hab_modal");
    if(modal) modal.style.display = "none";
    editingHabId = null;
  }
  function saveHabFromModal(){
    var nome = document.getElementById("cfh_f_nome").value.trim();
    var atk = document.getElementById("cfh_f_atk").value.trim();
    var pb = document.getElementById("cfh_f_pb").value.trim();
    var descricao = document.getElementById("cfh_f_desc").value;

    if(editingHabId){
      var existing = cfHabilidades.find(function(x){ return x.id === editingHabId; });
      if(existing){
        existing.nome = nome;
        existing.atk = atk;
        existing.pb = pb;
        existing.descricao = descricao;
      }
    } else {
      cfHabilidades.push({ id: genHabId(), nome: nome, atk: atk, pb: pb, descricao: descricao });
    }
    persist();
    renderHabilidades();
    closeHabModal();
    if(typeof flashIndicator === "function") flashIndicator("✓ Habilidade salva na ficha da criatura.", false, 2200);
  }

  /* ---------- exclusão (com confirmação) ---------- */
  function ensureDeleteModal(){
    if(document.getElementById("cfh_hab_delete_modal")) return;
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "cfh_hab_delete_modal";
    overlay.innerHTML =
      '<div class="modal-box">' +
        '<p>Deseja realmente excluir esta habilidade?</p>' +
        '<div class="modal-actions">' +
          '<button id="cfh_hab_delete_cancel">Cancelar</button>' +
          '<button class="danger" id="cfh_hab_delete_confirm">Excluir</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById("cfh_hab_delete_cancel").addEventListener("click", function(){
      pendingDeleteId = null;
      overlay.style.display = "none";
    });
    document.getElementById("cfh_hab_delete_confirm").addEventListener("click", function(){
      if(pendingDeleteId){
        cfHabilidades = cfHabilidades.filter(function(x){ return x.id !== pendingDeleteId; });
        persist();
        renderHabilidades();
      }
      pendingDeleteId = null;
      overlay.style.display = "none";
    });
  }
  function confirmDeleteHabilidade(id){
    ensureDeleteModal();
    pendingDeleteId = id;
    document.getElementById("cfh_hab_delete_modal").style.display = "flex";
  }

  /* ---------- espelhamento por leitura periódica ----------
     Detecta trocas de valor feitas "por baixo" pelo próprio sistema
     de Criaturas (abrir uma ficha salva, criar nova, limpar o
     formulário) e re-renderiza os cards de acordo — sem interceptar
     nem alterar nenhuma função de criaturas.js. Mesmo padrão já
     usado por TextViewMode (js/text-view-mode.js). */
  function pollHiddenField(){
    var el = getHiddenField();
    if(!el) return;
    if(el.value === lastSeenRaw) return;
    lastSeenRaw = el.value;
    cfHabilidades = parseHabilidades(el.value);
    renderHabilidades();
  }

  /* ==========================================================
     Parte 1: MODO VISUALIZAÇÃO / EDIÇÃO
     Mesmo padrão de js/text-view-mode.js, aplicado aos 3 campos de
     texto livre da ficha de criatura. Só a apresentação dos textos
     muda — nenhum campo mecânico é tocado por este bloco.
     ========================================================== */
  function cvReadStoredMode(){
    try{
      var v = window.localStorage.getItem(CV_MODE_STORAGE_KEY);
      return (v === "edit") ? "edit" : "view";
    }catch(e){
      return "view";
    }
  }
  function cvWriteStoredMode(mode){
    try{ window.localStorage.setItem(CV_MODE_STORAGE_KEY, mode); }catch(e){}
  }

  function cvBuildFieldEntries(){
    var entries = [];
    CV_TARGET_FIELD_IDS.forEach(function(id){
      var textarea = document.getElementById(id);
      if(!textarea || textarea.tagName !== "TEXTAREA") return;
      if(textarea.classList.contains("cfh-view-field")) return; // já construído

      textarea.classList.add("cfh-view-field");

      var viewEl = document.createElement("div");
      viewEl.className = "cfh-view-mirror";
      viewEl.setAttribute("data-cfh-view-for", id);
      viewEl.setAttribute("aria-hidden", "true");

      if(textarea.parentNode){
        textarea.parentNode.insertBefore(viewEl, textarea.nextSibling);
      }
      entries.push({ textarea: textarea, viewEl: viewEl, lastValue: null });
    });
    return entries;
  }

  function cvRenderField(entry, force){
    var value = entry.textarea.value || "";
    if(!force && value === entry.lastValue) return;
    entry.lastValue = value;
    var trimmed = value.trim();
    if(trimmed === ""){
      entry.viewEl.textContent = "—";
      entry.viewEl.classList.add("is-empty");
    } else {
      // textContent preserva o texto exatamente como está (sem HTML);
      // o CSS (white-space:pre-wrap) preserva quebras de linha e deixa
      // o bloco crescer naturalmente, sem scroll interno.
      entry.viewEl.textContent = value;
      entry.viewEl.classList.remove("is-empty");
    }
  }
  function cvRenderAll(force){
    cvState.fields.forEach(function(entry){ cvRenderField(entry, force); });
  }

  function cvUpdateToggleButton(){
    if(!cvState.toggleBtn) return;
    if(cvState.mode === "view"){
      cvState.toggleIcon.textContent = "🖊️";
      cvState.toggleLabel.textContent = "EDITAR";
      cvState.toggleBtn.setAttribute("aria-pressed", "false");
      cvState.toggleBtn.title = "Editar a ficha completa da criatura";
    } else {
      cvState.toggleIcon.textContent = "👁";
      cvState.toggleLabel.textContent = "VISUALIZAR";
      cvState.toggleBtn.setAttribute("aria-pressed", "true");
      cvState.toggleBtn.title = "Ver os textos da ficha em modo de leitura, sem caixas de edição";
    }
  }

  function cvSetMode(mode){
    cvState.mode = (mode === "edit") ? "edit" : "view";
    document.body.classList.toggle("cfh-mode-view", cvState.mode === "view");
    cvWriteStoredMode(cvState.mode);
    cvUpdateToggleButton();
    cvRenderAll(true);
  }
  function cvToggle(){
    cvSetMode(cvState.mode === "view" ? "edit" : "view");
  }

  function cvCreateToggleButton(){
    if(document.getElementById("cfh_view_toggle_btn")) return; // já criado
    var host = document.querySelector("#creature_sheet_screen .cr-titlebar");
    if(!host) return;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "cfh_view_toggle_btn";
    btn.className = "cfh-view-toggle-btn";

    var icon = document.createElement("span");
    icon.className = "cfh-view-toggle-icon";
    var label = document.createElement("span");
    label.className = "cfh-view-toggle-label";

    btn.appendChild(icon);
    btn.appendChild(label);
    btn.addEventListener("click", cvToggle);

    cvState.toggleBtn = btn;
    cvState.toggleIcon = icon;
    cvState.toggleLabel = label;

    host.appendChild(btn);
  }

  function cvStartPolling(){
    setInterval(function(){ cvRenderAll(false); }, CV_POLL_INTERVAL_MS);
  }

  /* Ganchos ADICIONAIS (addEventListener soma-se, nunca substitui) sobre
     os controles já existentes em criaturas.js: abrir uma criatura salva
     entra em modo VISUALIZAÇÃO; criar uma criatura nova (ficha em
     branco) entra em modo EDIÇÃO. Delegação de evento em #creature_list
     (o próprio contêiner nunca é recriado, só o innerHTML dele — ver
     criaturas.js), então funciona em qualquer render da lista sem
     precisar de MutationObserver. */
  function wireCreatureFlowModeHooks(){
    var list = document.getElementById("creature_list");
    if(list){
      list.addEventListener("click", function(e){
        var openBtn = e.target.closest && e.target.closest("[data-cr-open]");
        if(openBtn) cvSetMode("view");
      });
    }
    var cardCriar = document.getElementById("secret_card_criar");
    if(cardCriar){
      cardCriar.addEventListener("click", function(){ cvSetMode("edit"); });
    }
  }

  function cvInit(){
    if(cvState.initialized) return;
    if(!document.getElementById("creature_sheet_screen")) return; // estrutura inesperada
    cvState.initialized = true;

    cvState.fields = cvBuildFieldEntries();
    if(cvState.fields.length === 0) return;

    cvCreateToggleButton();
    cvState.mode = cvReadStoredMode();
    cvSetMode(cvState.mode); // aplica classe + renderiza + atualiza botão
    cvStartPolling();
    wireCreatureFlowModeHooks();
  }

  /* ---------- espelhamento por leitura periódica ----------
     Detecta trocas de valor feitas "por baixo" pelo próprio sistema
     de Criaturas (abrir uma ficha salva, criar nova, limpar o
     formulário) e re-renderiza os cards de acordo — sem interceptar
     nem alterar nenhuma função de criaturas.js. Mesmo padrão já
     usado por TextViewMode (js/text-view-mode.js). */
  function pollHiddenField(){
    var el = getHiddenField();
    if(!el) return;
    if(el.value === lastSeenRaw) return;
    lastSeenRaw = el.value;
    cfHabilidades = parseHabilidades(el.value);
    renderHabilidades();
  }

  /* ---------- wiring geral ---------- */
  function init(){
    if(!injectMarkup()) return; // estrutura inesperada: não faz nada

    var addBtn = document.getElementById("cfh_hab_add_btn");
    if(addBtn) addBtn.addEventListener("click", function(){ openHabModal(null); });

    lastSeenRaw = getHiddenField() ? getHiddenField().value : "";
    cfHabilidades = parseHabilidades(lastSeenRaw);
    renderHabilidades();

    setInterval(pollHiddenField, POLL_INTERVAL_MS);

    cvInit();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
