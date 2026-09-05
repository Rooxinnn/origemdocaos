/* ==========================================================
   ANOMALIA PARANORMAL — SELEÇÃO DA DIMENSÃO LÍMBICA
   Módulo independente e isolado, adicionado sobre a arquitetura já
   existente. NÃO reescreve o projeto, NÃO cria um novo sistema de
   modal e NÃO cria um novo mecanismo de armazenamento:

     - Escuta apenas o evento nativo "change" do <select id="dimensao">
       que já existe em #tab-agentes (mesmo campo usado por
       Corrupção/Marcos de Corrupção — ver js/marcos-corrupcao-agente.js).
       Esse evento só dispara por INTERAÇÃO REAL do usuário com o
       <select>: carregar ficha (loadAgent), abrir ficha (openSheet),
       criar ficha (createNewSheet) e duplicar ficha (duplicateSheet)
       preenchem o campo atribuindo diretamente `.value`, o que NUNCA
       dispara "change" — por isso este módulo nunca aparece ao
       simplesmente abrir/duplicar/carregar uma ficha, só quando o
       usuário de fato tenta selecionar Límbica no <select>.
     - NÃO altera o valor do campo. A seleção de Límbica é sempre
       aceita normalmente pelo próprio <select> nativo; este módulo
       apenas soma uma camada visual temporária por cima.
     - NÃO cria um segundo sistema de popup: reaproveita a MESMA
       estrutura genérica já usada no projeto (.modal-overlay /
       .modal-box / .modal-actions — ver index.html e
       js/marcos-corrupcao-agente.js), só somando classes novas
       prefixadas com "lda-" (ver css/limbica-anomalia.css).
     - NÃO mexe em Corrupção, Marcos de Corrupção, Compêndio, Aborto
       Límbico, armazenamento ou qualquer outro sistema. Dimensão
       continua sendo salva/carregada exatamente pelo mecanismo
       genérico já existente (agentFieldIds()/saveAgent()/loadAgent()),
       que não foi tocado.

   Namespace: window.LimbicaAnomalia
   ========================================================== */
(function () {
  "use strict";

  var DIM_FIELD_ID = "dimensao";
  var LIMBICA_VALUE = "limbica";
  var TOAST_MS = 1700; // duração da segunda mensagem curta (instrução 5)

  var overlayOpen = false;

  function esc(s) {
    if (typeof escapeHtml === "function") return escapeHtml(s);
    var d = document.createElement("div");
    d.textContent = (s === undefined || s === null) ? "" : String(s);
    return d.innerHTML;
  }

  /* ---------------------------------------------------------
     Popup principal — reaproveita .modal-overlay/.modal-box/
     .modal-actions já existentes no projeto.
     --------------------------------------------------------- */
  function buildOverlay() {
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay lda-overlay";
    overlay.id = "lda_modal";
    overlay.style.display = "flex";
    overlay.innerHTML =
      '<div class="modal-box cx-limbica lda-box" id="lda_modal_box">' +
        '<p class="lda-warn">⚠ Erro de classificação</p>' +
        '<h3 class="lda-title">Dimensão: Límbica</h3>' +
        '<div class="lda-dim-line">Vínculo detectado — <b>origem incompatível</b></div>' +
        '<div class="lda-body">' +
          '<p>Esta classificação não deveria ser possível.</p>' +
          '<p>A realidade rejeita o vínculo.</p>' +
        '</div>' +
        '<span class="lda-scan" id="lda_scan_line">... tentando identificar origem ...</span>' +
        '<div class="lda-actions">' +
          '<button type="button" class="lda-btn-continue" id="lda_btn_continue">Continuar mesmo assim</button>' +
        '</div>' +
      '</div>';
    return overlay;
  }

  // Alterna o texto de rastreamento a cada instante, sem criar nenhum
  // sistema de armazenamento — puramente visual (instrução 3).
  var SCAN_MESSAGES = [
    "... tentando identificar origem ...",
    "ORIGEM: NÃO IDENTIFICADA",
    "ERRO // CLASSIFICAÇÃO INVÁLIDA"
  ];
  var scanTimer = null;
  function startScanCycle(el) {
    var i = 0;
    scanTimer = setInterval(function () {
      i = (i + 1) % SCAN_MESSAGES.length;
      if (el) el.textContent = SCAN_MESSAGES[i];
    }, 950);
  }
  function stopScanCycle() {
    if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
  }

  function showToast() {
    var toast = document.createElement("div");
    toast.className = "lda-toast";
    toast.innerHTML =
      '<p class="lda-toast-title">Vínculo aceito</p>' +
      '<p class="lda-toast-sub">Não deveria ter funcionado.</p>';
    document.body.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, TOAST_MS);
  }

  function closeOverlay(selectEl) {
    var overlay = document.getElementById("lda_modal");
    stopScanCycle();
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlayOpen = false;
    if (selectEl) selectEl.classList.remove("lda-select-anomaly");
  }

  function confirmAndClose(selectEl) {
    closeOverlay(selectEl);
    showToast(); // segunda mensagem curta (instrução 5) — some sozinha
  }

  function openAnomalyPopup(selectEl) {
    if (overlayOpen) return; // evita abrir duas vezes em cliques muito rápidos
    overlayOpen = true;

    selectEl.classList.add("lda-select-anomaly"); // reação visual discreta no campo (instrução 9)

    var overlay = buildOverlay();
    document.body.appendChild(overlay);

    startScanCycle(document.getElementById("lda_scan_line"));

    document.getElementById("lda_btn_continue").addEventListener("click", function () {
      confirmAndClose(selectEl);
    });
    // Clicar fora não bloqueia nem reverte a escolha (instrução 4) — a
    // Dimensão já foi aceita pelo <select> nativo; clicar fora só fecha
    // a camada visual, do mesmo jeito que o botão faria.
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) confirmAndClose(selectEl);
    });
  }

  /* ---------------------------------------------------------
     Disparo — só reage a uma tentativa real de seleção
     (evento "change" do próprio <select>), nunca a carregamento
     de ficha (instrução 10/12).
     --------------------------------------------------------- */
  function onDimensaoChange(e) {
    var sel = e.target;
    if (sel.value === LIMBICA_VALUE) openAnomalyPopup(sel);
  }

  function bind() {
    var sel = document.getElementById(DIM_FIELD_ID);
    if (!sel || sel.dataset.ldaBound) return;
    sel.addEventListener("change", onDimensaoChange);
    sel.dataset.ldaBound = "1";
  }

  window.LimbicaAnomalia = { init: bind };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
