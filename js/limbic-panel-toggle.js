/* ==========================================================
   ABORTO LÍMBICO — MINIMIZAR/RECOLHER O PAINEL
   Módulo independente e isolado que acrescenta um botão para
   minimizar/expandir a área de skills com Buff Límbico
   (#al_buff_area), aprimorando o sistema já existente de Aborto
   Límbico sem reescrevê-lo.

   IMPORTANTE — este módulo:
   - NÃO cria um segundo sistema de Aborto Límbico. Continua
     usando exatamente os campos e a função já existentes
     (aborto_limbico_ativo, aborto_limbico_habilidades,
     renderAbortoLimbico() em index.html) — este módulo só ACRESCENTA
     um botão dentro do rótulo "Skills com Buff Límbico", que já é
     estático (não é recriado quando renderAbortoLimbico() atualiza
     a grade de skills), então o botão sobrevive a toda
     re-renderização normal do painel.
   - Minimizar/expandir é só uma preferência de EXIBIÇÃO: não apaga
     configurações, não desativa o Aborto Límbico, não remove
     habilidades marcadas, não altera nenhum dado da ficha — apenas
     esconde/mostra visualmente a grade de skills (#al_buff_grid) e
     a mensagem de "nenhuma skill" (#al_buff_empty) via uma classe
     CSS em #al_buff_area.
   - A preferência (minimizado ou não) é guardada só no localStorage,
     sob uma chave própria — nunca junto dos dados da ficha, e nunca
     interfere no armazenamento existente.

   Namespace: window.LimbicPanelToggle
   ========================================================== */
(function () {
  "use strict";

  var STORAGE_KEY = "agentes:limbicPanelCollapsed"; // "1" | "0" — preferência de exibição, não dado de ficha
  var AREA_ID = "al_buff_area";
  var COLLAPSED_CLASS = "al-panel-collapsed";

  var state = {
    initialized: false,
    collapsed: false,
    btn: null
  };

  function readStored() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function writeStored(v) {
    try {
      window.localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch (e) {
      // sem localStorage disponível: a preferência simplesmente não
      // persiste entre recarregamentos — não afeta os dados da ficha.
    }
  }

  function applyState() {
    var area = document.getElementById(AREA_ID);
    if (area) area.classList.toggle(COLLAPSED_CLASS, state.collapsed);
    if (state.btn) {
      state.btn.textContent = state.collapsed ? "▸ Expandir" : "▾ Minimizar";
      state.btn.setAttribute("aria-pressed", state.collapsed ? "true" : "false");
      state.btn.title = state.collapsed
        ? "Mostrar novamente as skills configuradas com o Buff Límbico"
        : "Recolher a lista de skills (as configurações continuam salvas)";
    }
  }

  function toggle() {
    state.collapsed = !state.collapsed;
    writeStored(state.collapsed);
    applyState();
  }

  function createButton(area) {
    var label = area.querySelector(".combat-subgroup-label");
    if (!label) return null;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "al_collapse_btn";
    btn.className = "al-collapse-btn";
    btn.addEventListener("click", toggle);
    label.appendChild(btn);
    return btn;
  }

  function init() {
    if (state.initialized) return;
    var area = document.getElementById(AREA_ID);
    if (!area) return; // estrutura inesperada: não faz nada
    var btn = area.querySelector("#al_collapse_btn") || createButton(area);
    if (!btn) return;
    state.initialized = true;
    state.btn = btn;
    state.collapsed = readStored();
    applyState();
  }

  window.LimbicPanelToggle = {
    toggle: toggle
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
