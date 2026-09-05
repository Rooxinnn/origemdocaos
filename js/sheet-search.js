/* ==========================================================
   PESQUISA DE FICHAS
   Módulo independente e isolado que adiciona, à tela de
   gerenciamento/listagem de fichas, uma pesquisa por nome.

   IMPORTANTE — este módulo:
   - NÃO cria uma segunda lista de fichas nem outro sistema de
     armazenamento. Ele lê exatamente os cards que já são gerados
     por renderSheetCards() (index.html) e só mostra/esconde cada
     card conforme o texto pesquisado bate ou não com o nome que
     já está escrito no próprio card (.sheet-card-name).
   - NÃO reescreve renderSheetCards(), nem os botões Abrir/Duplicar/
     Excluir, nem a ordem das fichas.
   - Como renderSheetCards() recria os cards do zero sempre que a
     lista muda (criar, duplicar, excluir, voltar para a tela
     inicial etc.), este módulo observa #sheet_list com um
     MutationObserver e reaplica a pesquisa atual automaticamente
     sempre que os cards forem re-renderizados — sem precisar
     alterar nenhuma dessas funções existentes.

   Namespace: window.SheetSearch
   ========================================================== */
(function () {
  "use strict";

  var SEARCH_INPUT_ID = "sheet_search";
  var LIST_ID = "sheet_list";
  var NO_RESULTS_ID = "sheet_search_empty";

  var currentQuery = "";

  function normalize(str) {
    // minúsculas + remove acentos, para uma pesquisa mais tolerante.
    // Continua satisfazendo o requisito de case-insensitive mesmo para
    // navegadores sem suporte a normalize (o try/catch cai para um
    // simples toLowerCase nesse caso raríssimo).
    var s = (str || "").toString().toLowerCase();
    try {
      s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch (e) {
      // sem suporte a normalize: segue só com toLowerCase.
    }
    return s;
  }

  function getList() {
    return document.getElementById(LIST_ID);
  }

  function removeNoResultsMessage(list) {
    var msg = document.getElementById(NO_RESULTS_ID);
    if (msg && msg.parentNode === list) list.removeChild(msg);
  }

  function showNoResultsMessage(list) {
    if (document.getElementById(NO_RESULTS_ID)) return;
    var msg = document.createElement("div");
    msg.id = NO_RESULTS_ID;
    // mesma classe usada pelo próprio projeto para o estado "nenhuma
    // ficha criada ainda", garantindo visual consistente sem CSS novo.
    msg.className = "empty-state";
    msg.textContent = "Nenhuma ficha encontrada para esta pesquisa.";
    list.appendChild(msg);
  }

  function applyFilter() {
    var list = getList();
    if (!list) return;

    var cards = list.querySelectorAll(".sheet-card");
    if (cards.length === 0) {
      // lista vazia (nenhuma ficha existe ainda) ou não renderizada:
      // nada a filtrar, deixa o estado atual (ex.: "Nenhuma ficha
      // criada ainda.") como está.
      removeNoResultsMessage(list);
      return;
    }

    var query = normalize(currentQuery.trim());
    var anyVisible = false;

    cards.forEach(function (card) {
      var nameEl = card.querySelector(".sheet-card-name");
      var name = normalize(nameEl ? nameEl.textContent : "");
      var matches = query === "" || name.indexOf(query) !== -1;
      card.style.display = matches ? "" : "none";
      if (matches) anyVisible = true;
    });

    if (query !== "" && !anyVisible) {
      showNoResultsMessage(list);
    } else {
      removeNoResultsMessage(list);
    }
  }

  function initSearchInput() {
    var input = document.getElementById(SEARCH_INPUT_ID);
    if (!input || input.dataset.sheetSearchBound === "1") return;
    input.dataset.sheetSearchBound = "1";
    input.addEventListener("input", function () {
      currentQuery = input.value || "";
      applyFilter();
    });
  }

  function observeList() {
    var list = getList();
    if (!list || list.dataset.sheetSearchObserved === "1") return;
    list.dataset.sheetSearchObserved = "1";
    var observer = new MutationObserver(function () {
      applyFilter();
    });
    observer.observe(list, { childList: true });
  }

  function init() {
    initSearchInput();
    observeList();
    applyFilter();
  }

  window.SheetSearch = {
    refresh: applyFilter
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
