/* ==========================================================
   TEXT VIEW MODE
   Módulo independente que adiciona, à aba Agentes, um modo de
   visualização/bloqueado para os blocos de texto livre (Anotações,
   Conexões, Condições Físicas, Condições Psicológicas, Itens).

   IMPORTANTE — este módulo:
   - NÃO cria um segundo sistema de armazenamento dos textos. Ele lê
     o valor atual dos próprios <textarea> já existentes (a mesma
     fonte usada por saveAgent()/loadAgent()) e apenas o espelha,
     em modo leitura, num elemento visual separado.
   - NÃO altera o salvamento, o carregamento de fichas, nem qualquer
     outro sistema do projeto. Não intercepta nem reescreve nenhuma
     função existente do index.html.
   - Guarda só a PREFERÊNCIA de modo (editar/visualizar) no
     localStorage, sob uma chave própria — nunca o conteúdo da ficha.
   - Funciona por "espelhamento por leitura periódica": a cada poucos
     instantes, compara o valor atual de cada textarea alvo com o que
     está exibido e só atualiza o texto na tela quando muda. Assim o
     módulo se adapta sozinho a qualquer forma como o valor do
     textarea seja alterado (digitação, troca de ficha, ficha nova,
     duplicar, resetar, importar JSON, etc.) sem precisar conhecer
     ou modificar essas funções.

   Namespace: window.TextViewMode
   ========================================================== */
(function () {
  "use strict";

  // IDs dos <textarea> da aba Agentes que devem ganhar o modo de
  // visualização. Apenas blocos de texto livre — nunca números,
  // atributos, perícias, HP/SAN/Fadiga, seleções, etc.
  var TARGET_FIELD_IDS = [
    "cond_psi",   // Registro das Condições Psicológicas
    "cond_fis",   // Registro das Condições Físicas
    "itens",      // Itens do Agente
    "conexoes",   // Conexões Aprendidas
    "anotacoes"   // Anotações do Agente
  ];

  var MODE_STORAGE_KEY = "agentes:textViewMode"; // "view" | "edit"
  var POLL_INTERVAL_MS = 400;

  var state = {
    mode: "edit",
    initialized: false,
    fields: [], // { textarea, viewEl, lastValue }
    toggleBtn: null,
    toggleIcon: null,
    toggleLabel: null
  };

  function readStoredMode() {
    try {
      var v = window.localStorage.getItem(MODE_STORAGE_KEY);
      return v === "view" ? "view" : "edit";
    } catch (e) {
      return "edit";
    }
  }

  function writeStoredMode(mode) {
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch (e) {
      // Sem localStorage disponível: a preferência simplesmente não
      // persiste entre recarregamentos. Não afeta os dados da ficha.
    }
  }

  function buildFieldEntries() {
    var entries = [];
    TARGET_FIELD_IDS.forEach(function (id) {
      var textarea = document.getElementById(id);
      if (!textarea || textarea.tagName !== "TEXTAREA") return;

      textarea.classList.add("tvm-field");

      var viewEl = document.createElement("div");
      viewEl.className = "tvm-view";
      viewEl.setAttribute("data-tvm-for", id);
      viewEl.setAttribute("aria-hidden", "true");

      // Insere o bloco de leitura logo depois do textarea, como irmão,
      // sem alterar a estrutura/hierarquia existente do restante da ficha.
      if (textarea.parentNode) {
        textarea.parentNode.insertBefore(viewEl, textarea.nextSibling);
      }

      entries.push({ textarea: textarea, viewEl: viewEl, lastValue: null });
    });
    return entries;
  }

  function renderField(entry, force) {
    var value = entry.textarea.value || "";
    if (!force && value === entry.lastValue) return;
    entry.lastValue = value;

    var trimmed = value.trim();
    if (trimmed === "") {
      entry.viewEl.textContent = "—";
      entry.viewEl.classList.add("is-empty");
    } else {
      // textContent preserva o texto exatamente como está (sem HTML),
      // e o CSS (white-space: pre-wrap) preserva quebras de linha e
      // faz o texto quebrar/crescer naturalmente, sem scroll interno.
      entry.viewEl.textContent = value;
      entry.viewEl.classList.remove("is-empty");
    }
  }

  function renderAll(force) {
    state.fields.forEach(function (entry) { renderField(entry, force); });
  }

  function updateToggleButton() {
    if (!state.toggleBtn) return;
    if (state.mode === "view") {
      state.toggleIcon.textContent = "✏️";
      state.toggleLabel.textContent = "Editar";
      state.toggleBtn.setAttribute("aria-pressed", "true");
      state.toggleBtn.title = "Voltar ao modo de edição dos textos da ficha";
    } else {
      state.toggleIcon.textContent = "👁";
      state.toggleLabel.textContent = "Visualizar";
      state.toggleBtn.setAttribute("aria-pressed", "false");
      state.toggleBtn.title = "Ver os textos da ficha em modo de leitura, sem caixas de edição";
    }
  }

  function setMode(mode) {
    state.mode = mode === "view" ? "view" : "edit";
    document.body.classList.toggle("tvm-mode-view", state.mode === "view");
    writeStoredMode(state.mode);
    updateToggleButton();
    // Ao entrar (ou já estando) em modo visualização, garante que o
    // texto exibido reflita o valor atual dos campos.
    renderAll(true);
  }

  function toggle() {
    setMode(state.mode === "view" ? "edit" : "view");
  }

  function createToggleButton() {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "tvm_toggle_btn";
    btn.className = "tvm-toggle-btn";

    var icon = document.createElement("span");
    icon.className = "tvm-toggle-icon";
    var label = document.createElement("span");
    label.className = "tvm-toggle-label";

    btn.appendChild(icon);
    btn.appendChild(label);
    btn.addEventListener("click", toggle);

    state.toggleBtn = btn;
    state.toggleIcon = icon;
    state.toggleLabel = label;

    // Ponto de integração discreto: injeta o botão no cabeçalho da
    // ficha (titlebar), ao lado do nome/título, sem mexer no marcado
    // existente. Se por algum motivo o cabeçalho não existir, cai
    // para a barra de ações no rodapé da ficha como alternativa.
    var host = document.querySelector("#tab-agentes .titlebar-head");
    if (host) {
      host.appendChild(btn);
      return;
    }
    var actionBar = document.querySelector("#tab-agentes .action-bar");
    if (actionBar) {
      actionBar.insertBefore(btn, actionBar.firstChild);
    }
  }

  function startPolling() {
    setInterval(function () { renderAll(false); }, POLL_INTERVAL_MS);
  }

  function init() {
    if (state.initialized) return;
    if (!document.getElementById("tab-agentes")) return; // estrutura inesperada: não faz nada
    state.initialized = true;

    state.fields = buildFieldEntries();
    if (state.fields.length === 0) return;

    createToggleButton();
    state.mode = readStoredMode();
    setMode(state.mode); // aplica classe + renderiza + atualiza botão
    startPolling();
  }

  window.TextViewMode = {
    init: init,
    toggle: toggle,
    setMode: setMode,
    render: function () { renderAll(true); },
    refresh: function () { renderAll(false); }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
