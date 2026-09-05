/* ==========================================================
   MARCOS DE CORRUPÇÃO — ETAPA 2 (INTEGRAÇÃO COM A FICHA)
   Módulo independente e isolado, adicionado sobre a arquitetura já
   existente. NÃO reescreve o projeto, NÃO cria uma segunda
   biblioteca de Marcos e NÃO cria um novo sistema de armazenamento:

     COMPÊNDIO (js/marcos-corrupcao.js, já pronto)
         ↓ window.MarcosCorrupcao.data (fonte única dos Marcos)
     AGENTES → Dimensão + Corrupção da ficha (campos já existentes)
         ↓
     Este módulo: detecta Marcos alcançados, avisa (popup) e
     registra na própria ficha.

   IMPORTANTE — este módulo:
   - NÃO duplica os Marcos de Corrupção. Consulta sempre
     window.MarcosCorrupcao.data (array já exposto pelo Compêndio)
     por id — nunca copia título/descrição/página para uma segunda
     lista.
   - NÃO duplica a lista de Dimensões. Reaproveita exatamente
     CONEXOES_DIM_ORDER/CONEXOES_DIM_LABELS (já definidos em
     index.html para Conexões), apenas filtrando fora as 3 entradas
     que não são Dimensões de Corrupção (tecnica/superior/especial).
   - NÃO cria um novo campo de Corrupção nem um novo contador. Lê
     somente o campo já existente #corrupcao (formato "Atual/Máx.",
     mesmo padrão de Infecção — ver stripFixedSuffix() em
     index.html), extraindo a parte "Atual" antes da primeira "/".
     Nunca escreve nesse campo.
   - NÃO cria um novo sistema de armazenamento. Os dois pontos de
     integração são campos comuns dentro de #tab-agentes:
       #dimensao  — já existia; passou de <input type="text"> livre
                    para <select> (ver index.html), mas continua com
                    o MESMO id, então continua sendo salvo/carregado
                    pelo mecanismo genérico de sempre
                    (agentFieldIds()/saveAgent()/loadAgent()).
       #marcos_corrupcao_conquistados — campo oculto NOVO, também
                    dentro de #tab-agentes, também coletado pelo
                    mesmo mecanismo genérico — guarda só um JSON com
                    os IDs dos Marcos já conquistados por esta ficha
                    (a referência, não uma cópia dos dados do Marco).
     Como esses dois campos já fazem parte de #tab-agentes, eles são
     automaticamente preservados por createNewSheet()/openSheet()/
     duplicateSheet()/resetar — nenhuma dessas funções foi alterada.
   - NÃO aplica nenhum efeito mecânico automaticamente (não altera
     atributos, perícias, habilidades, dados, etc.). Apenas detecta,
     avisa, registra e mostra a descrição já cadastrada no Compêndio.
   - Assim como TextViewMode/CharacterImage/CombatDiceAuto, se adapta
     a QUALQUER forma como a Dimensão/Corrupção da ficha mudem
     (digitação, trocar de ficha, abrir ficha, duplicar, resetar,
     importar JSON etc.) por "espelhamento por leitura periódica":
     a cada poucos instantes compara os valores atuais com a última
     leitura e só age quando algo de fato mudou — sem precisar
     conhecer ou alterar createNewSheet()/openSheet()/loadAgent()/
     duplicateSheet()/resetar.

   Namespace: window.MarcosCorrupcaoAgente
   ========================================================== */
(function () {
  "use strict";

  var POLL_INTERVAL_MS = 450; // mesma ordem de grandeza já usada por outros módulos de polling

  var DIM_FIELD_ID = "dimensao";
  var CORRUPCAO_FIELD_ID = "corrupcao";
  var ACHIEVED_FIELD_ID = "marcos_corrupcao_conquistados";

  // Dimensões válidas para Marcos de Corrupção: reaproveita
  // EXATAMENTE CONEXOES_DIM_ORDER (index.html), só removendo as 3
  // entradas que não são Dimensões de Corrupção (Aborto Límbico,
  // Conexões Superiores, Especiais). Nenhuma lista nova é criada.
  var NON_CORRUPTION_DIMS = { tecnica: true, superior: true, especial: true };

  function dimKeys() {
    if (typeof CONEXOES_DIM_ORDER === "object" && CONEXOES_DIM_ORDER) {
      return CONEXOES_DIM_ORDER.filter(function (k) { return !NON_CORRUPTION_DIMS[k]; });
    }
    // Fallback só usado se CONEXOES_DIM_ORDER ainda não existir no momento
    // da chamada — não é uma segunda fonte, apenas evita quebrar a tela.
    return ["infernal", "arkanjerial", "terrena", "carnical", "sombria", "perdicao", "limbica"];
  }

  function dimLabel(key) {
    if (typeof CONEXOES_DIM_LABELS === "object" && CONEXOES_DIM_LABELS && CONEXOES_DIM_LABELS[key]) {
      return CONEXOES_DIM_LABELS[key];
    }
    return key;
  }

  // Emoji de identificação visual por Dimensão (instrução 10 do pedido).
  // Puramente decorativo — a cor "de verdade" continua vindo das classes
  // cx-<dimensao> já existentes (variáveis --cx-c/--cx-c-dim).
  var DIM_EMOJI = {
    infernal: "🔵", terrena: "🟢", arkanjerial: "⚪",
    sombria: "⚫", carnical: "🔴", limbica: "🔘", perdicao: "🟣"
  };

  function esc(s) {
    if (typeof escapeHtml === "function") return escapeHtml(s);
    var d = document.createElement("div");
    d.textContent = (s === undefined || s === null) ? "" : String(s);
    return d.innerHTML;
  }

  /* ---------------------------------------------------------
     Acesso aos Marcos do Compêndio (window.MarcosCorrupcao.data) —
     nunca copiados, sempre consultados por id.
     --------------------------------------------------------- */
  function allMarcos() {
    return (window.MarcosCorrupcao && window.MarcosCorrupcao.data) || [];
  }
  function marcosDaDimensao(dimKey) {
    return allMarcos().filter(function (m) { return m.dimensao === dimKey; });
  }
  function findMarco(id) {
    var list = allMarcos();
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
    return null;
  }

  /* ---------------------------------------------------------
     Campo #dimensao — preenchimento do <select> (uma única vez).
     --------------------------------------------------------- */
  function ensureDimensaoOptions() {
    var sel = document.getElementById(DIM_FIELD_ID);
    if (!sel || sel.tagName !== "SELECT" || sel.dataset.mcaBuilt) return;
    var html = '<option value="">— Selecionar —</option>';
    dimKeys().forEach(function (key) {
      html += '<option value="' + esc(key) + '">' + esc((DIM_EMOJI[key] || "") + " " + dimLabel(key)) + '</option>';
    });
    sel.innerHTML = html;
    sel.dataset.mcaBuilt = "1";
  }

  /* ---------------------------------------------------------
     Campo #corrupcao — extrai só a parte "Atual" (antes da 1ª "/"),
     mesmo padrão já usado pelo campo Infecção (ver stripFixedSuffix
     em index.html). Nunca escreve nesse campo.
     --------------------------------------------------------- */
  function corrupcaoAtual() {
    var el = document.getElementById(CORRUPCAO_FIELD_ID);
    if (!el) return null;
    var raw = (el.value || "").toString().trim();
    if (!raw) return null;
    var atualStr = raw.split("/")[0].trim().replace(",", ".");
    var n = parseFloat(atualStr);
    return isNaN(n) ? null : n;
  }

  /* ---------------------------------------------------------
     Campo oculto #marcos_corrupcao_conquistados — só um JSON com
     os IDs já conquistados por ESTA ficha (a referência ao Marco,
     nunca uma cópia dos dados). Diminuir a Corrupção NUNCA remove
     nada daqui (instrução 12); trocar de Dimensão também não
     (instrução 14) — só passa a próxima detecção a considerar os
     Marcos da nova Dimensão selecionada.
     --------------------------------------------------------- */
  function readAchieved() {
    var el = document.getElementById(ACHIEVED_FIELD_ID);
    if (!el) return [];
    try {
      var arr = JSON.parse(el.value || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function writeAchieved(ids) {
    var el = document.getElementById(ACHIEVED_FIELD_ID);
    if (!el) return;
    el.value = JSON.stringify(ids);
    // Dispara "input"/"change" no próprio campo já existente para que o
    // listener genérico de #tab-agentes (que já trata "input, textarea,
    // select") marque a ficha como não salva — sem duplicar essa lógica
    // aqui e sem precisar chamar markAgentDirty() diretamente.
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /* ==========================================================
     ÁREA "MARCOS DE CORRUPÇÃO ALCANÇADOS" — dentro da aba AGENTES,
     logo após o painel "Dados de Combate" (mesma área de Dimensão/
     Corrupção), sem reorganizar o layout existente.
     ========================================================== */
  function ensurePanel() {
    if (document.getElementById("mca_panel")) return;
    var dimBox = document.querySelector("#tab-agentes .combat-dimension-box");
    var hostPanel = dimBox && dimBox.closest(".panel");
    if (!hostPanel || !hostPanel.parentElement) return;

    var panel = document.createElement("div");
    panel.className = "panel mca-panel";
    panel.id = "mca_panel";
    // ALTERAÇÃO 2 do pedido (minimizar Corrupção/Infecção): o cabeçalho
    // <h2> vira um toggle recolhível (mesmo <h2>/.panel já existente, só
    // com um ícone ▲/▼ clicável somado — nenhum novo container/aba/painel
    // é criado, só expande/recolhe o próprio painel "Marcos de Corrupção
    // Alcançados" que já existia). O conteúdo passa a ficar dentro de
    // #mca_body, que é apenas ocultado (display:none) ao recolher — o
    // polling/checkForNewMarcos() continua rodando normalmente mesmo com
    // o painel recolhido (instrução 15), só a exibição é afetada.
    panel.innerHTML =
      '<h2 class="mca-toggle-header" id="mca_toggle" role="button" tabindex="0" aria-expanded="true">' +
        '<span>Marcos de Corrupção Alcançados</span>' +
        '<span class="mca-toggle-icon" id="mca_toggle_icon">▲</span>' +
      '</h2>' +
      '<div class="mca-collapse-body" id="mca_body"><div id="mca_list"></div></div>';
    hostPanel.parentElement.insertBefore(panel, hostPanel.nextSibling);

    var header = document.getElementById("mca_toggle");
    header.addEventListener("click", toggleCollapse);
    header.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCollapse(); }
    });
  }

  function toggleCollapse() {
    var panel = document.getElementById("mca_panel");
    var body = document.getElementById("mca_body");
    var icon = document.getElementById("mca_toggle_icon");
    var header = document.getElementById("mca_toggle");
    if (!panel || !body || !icon) return;
    var collapsed = panel.classList.toggle("is-collapsed");
    body.style.display = collapsed ? "none" : "";
    icon.textContent = collapsed ? "▼" : "▲";
    if (header) header.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }

  function renderPanel() {
    var list = document.getElementById("mca_list");
    if (!list) return;

    // A lista exibida NÃO é mais o histórico permanente gravado em
    // #marcos_corrupcao_conquistados — esse campo continua existindo e
    // sendo salvo (serve só para a fila de popups não repetir um aviso já
    // mostrado, ver checkForNewMarcos). O que aparece aqui é sempre
    // recalculado a partir do estado atual da ficha: Dimensão selecionada
    // agora + valor atual de Corrupção agora. Isso cobre automaticamente
    // aumento, diminuição e troca de Dimensão, sem herdar nada de outra
    // ficha nem de uma leitura anterior.
    var sel = document.getElementById(DIM_FIELD_ID);
    var dimKey = sel ? sel.value : "";
    var atual = corrupcaoAtual();

    var marcos = [];
    if (dimKey && !NON_CORRUPTION_DIMS[dimKey] && atual !== null) {
      marcos = marcosDaDimensao(dimKey).filter(function (m) { return m.corrupcao <= atual; });
      marcos.sort(function (a, b) { return a.corrupcao - b.corrupcao; });
    }

    if (marcos.length === 0) {
      list.innerHTML = '<div class="empty-state">Nenhum Marco de Corrupção alcançado ainda.</div>';
      return;
    }

    var html = '<div class="mca-group cx-' + esc(dimKey) + '">';
    html += '<div class="mca-group-title">' + esc((DIM_EMOJI[dimKey] || "") + " " + dimLabel(dimKey).toUpperCase()) + '</div>';
    marcos.forEach(function (m) {
      html += '<button type="button" class="mca-row" data-mca-id="' + esc(m.id) + '">' +
        '<span class="mca-row-star">★</span>' +
        '<span class="mca-row-body">' +
          '<span class="mca-row-title">' + esc(m.titulo) + '</span>' +
          '<span class="mca-row-corrupcao">Corrupção: ' + esc(m.corrupcao) + '</span>' +
        '</span>' +
      '</button>';
    });
    html += '</div>';

    list.innerHTML = html;
    list.querySelectorAll("[data-mca-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var m = findMarco(btn.getAttribute("data-mca-id"));
        if (m) openMarcoModal(m, false);
      });
    });
  }

  /* ==========================================================
     MODAL — reaproveita a MESMA estrutura genérica de modal
     (".modal-overlay"/".modal-box"/".modal-actions") e as classes
     de tema por Dimensão (".cx-<dimensao>", ".cx-modal-dim",
     ".cx-modal-section") já usadas pelo Compêndio de Marcos de
     Corrupção (js/marcos-corrupcao.js) — nenhum sistema de popup
     novo é criado. Serve tanto para o aviso de "Novo Marco" quanto
     para consultar um Marco já registrado na ficha.
     ========================================================== */
  function ensureModal() {
    if (document.getElementById("mca_modal")) return;
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "mca_modal";
    overlay.innerHTML =
      '<div class="modal-box cx-modal-box" id="mca_modal_box">' +
        '<h3 id="mca_modal_title"></h3>' +
        '<div class="cx-modal-dim" id="mca_modal_dim"></div>' +
        '<div class="cx-modal-section">' +
          '<p class="mca-modal-marco-titulo" id="mca_modal_marco_titulo"></p>' +
          '<p class="mca-modal-corrupcao" id="mca_modal_corrupcao"></p>' +
          '<p id="mca_modal_desc" style="white-space:pre-wrap;"></p>' +
        '</div>' +
        '<div class="modal-actions" style="margin-top:14px; justify-content:flex-end;">' +
          '<button type="button" id="mca_modal_close">Fechar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById("mca_modal_close").addEventListener("click", closeMarcoModal);
    overlay.addEventListener("click", function (e) {
      if (e.target.id === "mca_modal") closeMarcoModal();
    });
  }

  function openMarcoModal(m, isNew) {
    ensureModal();
    document.getElementById("mca_modal_title").textContent = isNew ? "NOVO MARCO DE CORRUPÇÃO" : "Marco de Corrupção";
    document.getElementById("mca_modal_dim").textContent = (DIM_EMOJI[m.dimensao] || "") + " " + dimLabel(m.dimensao).toUpperCase();
    document.getElementById("mca_modal_marco_titulo").textContent = m.titulo;
    document.getElementById("mca_modal_corrupcao").textContent = "Corrupção: " + m.corrupcao;
    document.getElementById("mca_modal_desc").textContent = m.descricao;
    document.getElementById("mca_modal_box").className = "modal-box cx-modal-box cx-" + m.dimensao;
    document.getElementById("mca_modal").style.display = "flex";
  }

  function closeMarcoModal() {
    var el = document.getElementById("mca_modal");
    if (el) el.style.display = "none";
    showNextQueuedPopup();
  }

  /* ---------------------------------------------------------
     Fila de popups — se vários Marcos forem alcançados de uma vez
     (instrução 11: Corrupção 8 → 15 cruzando 3 Marcos), nenhum se
     perde: mostra um de cada vez, na ordem de Corrupção crescente.
     --------------------------------------------------------- */
  var popupQueue = [];
  var popupShowing = false;

  function queueNewMarcoPopups(marcos) {
    marcos.slice().sort(function (a, b) { return a.corrupcao - b.corrupcao; }).forEach(function (m) {
      popupQueue.push(m);
    });
    if (!popupShowing) showNextQueuedPopup();
  }

  function showNextQueuedPopup() {
    if (popupQueue.length === 0) { popupShowing = false; return; }
    popupShowing = true;
    var m = popupQueue.shift();
    openMarcoModal(m, true);
  }

  /* ==========================================================
     DETECÇÃO AUTOMÁTICA — comparação por leitura periódica.
     Não assume incremento de 1 em 1 (instrução 5): sempre compara
     TODOS os Marcos da Dimensão atual contra o valor atual de
     Corrupção e contra os já conquistados, então qualquer salto
     (ex.: 8 → 15) é detectado por completo, e nada já registrado é
     repetido (instrução 6/8/13).
     ========================================================== */
  function checkForNewMarcos() {
    var sel = document.getElementById(DIM_FIELD_ID);
    var dimKey = sel ? sel.value : "";
    if (!dimKey || NON_CORRUPTION_DIMS[dimKey]) return; // sem Dimensão válida selecionada: nada a checar

    var atual = corrupcaoAtual();
    if (atual === null) return; // sem Corrupção numérica preenchida: nada a checar

    var achieved = readAchieved();
    var achievedSet = {};
    achieved.forEach(function (id) { achievedSet[id] = true; });

    var novos = marcosDaDimensao(dimKey).filter(function (m) {
      return m.corrupcao <= atual && !achievedSet[m.id];
    });
    if (novos.length === 0) return;

    novos.forEach(function (m) { achieved.push(m.id); });
    writeAchieved(achieved);
    renderPanel();
    queueNewMarcoPopups(novos);
  }

  /* ---------- polling: adapta-se a qualquer forma de alteração ---------- */
  var lastSnapshot = null;
  function snapshot() {
    var selEl = document.getElementById(DIM_FIELD_ID);
    var corEl = document.getElementById(CORRUPCAO_FIELD_ID);
    var achEl = document.getElementById(ACHIEVED_FIELD_ID);
    return [
      selEl ? selEl.value : "",
      corEl ? corEl.value : "",
      achEl ? achEl.value : ""
    ].join("|");
  }

  function poll() {
    if (!document.getElementById("tab-agentes")) return;
    ensureDimensaoOptions();
    ensurePanel();
    var snap = snapshot();
    if (snap === lastSnapshot) return;
    lastSnapshot = snap;
    checkForNewMarcos();
    renderPanel();
  }

  /* ---------- boot ---------- */
  function init() {
    if (!document.getElementById("tab-agentes")) return; // estrutura inesperada: não faz nada
    ensureDimensaoOptions();
    ensurePanel();
    renderPanel();
    poll();
    setInterval(poll, POLL_INTERVAL_MS);
  }

  window.MarcosCorrupcaoAgente = {
    init: init,
    refresh: function () { renderPanel(); }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
