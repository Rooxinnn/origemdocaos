/* ==========================================================
   MARCOS DE INFECÇÃO
   Módulo independente e autocontido, adicionado sobre a
   arquitetura já existente. NÃO reescreve o projeto, NÃO cria uma
   segunda lista de Dimensões e NÃO cria um segundo Compêndio:

     COMPÊNDIO → "Marcos de Infecção"   (nova sub-aba, biblioteca
                                          fixa, extraída do PDF do
                                          Sistema de OdC — 1ª Ed.)

   Segue EXATAMENTE o mesmo padrão já usado por Marcos de Corrupção
   (js/marcos-corrupcao.js): nova sub-aba dentro de #tab-compendio
   (mesma barra ".subtab-row"/".subtab-btn"/".subtab-panel" já
   existente), grid de cards no mesmo estilo visual do Compêndio
   (".cx-grid"/".cx-card"/".cx-body"/".cx-arrow"), e um modal de
   detalhes próprio, reaproveitando a MESMA estrutura genérica de
   modal (".modal-overlay"/".modal-box"/".modal-actions") já usada
   por todos os outros modais do projeto — nenhum sistema de popup
   novo é criado.

   DIFERENÇA EM RELAÇÃO A MARCOS DE CORRUPÇÃO: os Marcos de Infecção
   NÃO dependem de Dimensão (instrução 14 do pedido — a Tabela de
   Infecções da pág. 100 do PDF é uma lista única, sem separação por
   Dimensão). Por isso este módulo não cria filtros de Dimensão nem
   reaproveita CONEXOES_DIM_LABELS/CONEXOES_DIM_ORDER: é uma única
   lista, ordenada por valor de Infecção. Para os cards herdarem uma
   identidade visual própria (mesmo mecanismo de --cx-c/--cx-c-dim
   já usado por cada Dimensão), foi somada apenas UMA classe nova,
   ".cx-infeccao", no arquivo isolado css/marcos-infeccao.css —
   nenhuma classe de Dimensão existente foi tocada.

   FONTE: Sistema de OdC — 1ª Edição (V1.0.3), pág. 100 — "Tabela de
   Infecções". Cada Marco preserva o texto do livro (valor de
   Infecção e consequência), sem resumir, reescrever ou completar
   informações por conhecimento externo. A tabela da pág. 100 é
   autocontida (não continua nem depende de nenhuma página vizinha).

   Namespace: window.MarcosInfeccao
   ========================================================== */
(function () {
  "use strict";

  /* ---------------------------------------------------------
     BIBLIOTECA OFICIAL — Marcos de Infecção.
     Extraídos integralmente da "Tabela de Infecções", pág. 100 do
     PDF (Sistema de OdC — 1ª Edição). São 9 Marcos ao todo, cada um
     com o valor de Infecção da coluna "Infecção" e a consequência
     exata da coluna "CONSEQUÊNCIAS" da mesma linha da tabela — nada
     foi resumido, reescrito ou inventado.

     Campo "titulo" segue o mesmo padrão já usado pelos Marcos de
     Corrupção ("N de Corrupção" → aqui "N de Infecção"), já que a
     tabela do livro também não nomeia cada linha, apenas numera o
     valor de Infecção.

     Campo "infeccao" é o valor numérico (usado para ordenação), e
     "pagina" é a página do livro onde a Tabela de Infecções aparece
     (100, para todos os Marcos, pois é uma única tabela).
     --------------------------------------------------------- */
  var MARCOS_INFECCAO_DATA = [
    { id:"infeccao-005", infeccao:5, titulo:"5 de Infecção", pagina:100,
      descricao:`O personagem toma 1d4 de dano de Sanidade.` },
    { id:"infeccao-010", infeccao:10, titulo:"10 de Infecção", pagina:100,
      descricao:`O personagem toma 1d4 de dano de Sanidade e desenvolve uma doença psicológica.` },
    { id:"infeccao-020", infeccao:20, titulo:"20 de Infecção", pagina:100,
      descricao:`O personagem toma 1d4 de dano de Sanidade e desenvolve Idolatria por sua Dimensão Conectada.` },
    { id:"infeccao-030", infeccao:30, titulo:"30 de Infecção", pagina:100,
      descricao:`O personagem toma 1d4 de dano de Sanidade e têm uma breve alucinação.` },
    { id:"infeccao-035", infeccao:35, titulo:"35 de Infecção", pagina:100,
      descricao:`O personagem desenvolve uma Doença Psicológica.` },
    { id:"infeccao-040", infeccao:40, titulo:"40 de Infecção", pagina:100,
      descricao:`O personagem toma 1d6 de dano de Sanidade e desenvolve PESADELOS e obtém +1 Doença Psicológica.` },
    { id:"infeccao-055", infeccao:55, titulo:"55 de Infecção", pagina:100,
      descricao:`O personagem toma 1d12 de dano de Sanidade e desenvolve SURTO PSICÓTICO.` },
    { id:"infeccao-065", infeccao:65, titulo:"65 de Infecção", pagina:100,
      descricao:`O personagem toma 1d10 de dano de Sanidade e alterações biológicas que o tornarão uma criatura da sua Dimensão Conectada começam a ocorrer.` },
    { id:"infeccao-070", infeccao:70, titulo:"70 de Infecção", pagina:100,
      descricao:`Perda da personalidade original; alteração biológica completa.` }
  ];

  function esc(s){
    if (typeof escapeHtml === "function") return escapeHtml(s);
    var d = document.createElement("div");
    d.textContent = (s === undefined || s === null) ? "" : String(s);
    return d.innerHTML;
  }

  function findMarcoById(id){
    for (var i = 0; i < MARCOS_INFECCAO_DATA.length; i++){
      if (MARCOS_INFECCAO_DATA[i].id === id) return MARCOS_INFECCAO_DATA[i];
    }
    return null;
  }

  /* ==========================================================
     COMPÊNDIO → "MARCOS DE INFECÇÃO"
     Nova sub-aba dentro do Compêndio já existente, seguindo
     exatamente o mesmo padrão de integração já usado por Marcos de
     Corrupção: mesma barra de sub-abas (".subtab-row" dentro de
     #tab-compendio), mesmas classes ".subtab-btn"/".subtab-panel"
     para herdar o estilo.
     ========================================================== */

  function ensureCompendioTab(){
    if (document.getElementById("sub-comp-marcos-infeccao")) return;
    var subtabRow = document.querySelector("#tab-compendio .subtab-row");
    var compPanel = document.querySelector("#tab-compendio .panel");
    if (!subtabRow || !compPanel) return;

    var btn = document.createElement("button");
    btn.className = "subtab-btn";
    btn.setAttribute("data-sub", "comp-marcos-infeccao");
    btn.textContent = "Marcos de Infecção";
    subtabRow.appendChild(btn);

    var panel = document.createElement("div");
    panel.className = "subtab-panel";
    panel.id = "sub-comp-marcos-infeccao";
    panel.innerHTML =
      '<p class="note" style="text-align:left; margin:0 0 14px;">Consequências físicas e psicológicas que um personagem sofre ao atingir determinados níveis de Infecção (Sistema de OdC, Tabela de Infecções, pág. 100). Diferente dos Marcos de Corrupção, não dependem de Dimensão. Clique em um Marco para ver a descrição completa.</p>' +
      '<div id="mi_count" class="note" style="text-align:left;"></div>' +
      '<div id="mi_grid" class="cx-grid"></div>';
    compPanel.appendChild(panel);

    btn.addEventListener("click", function(){
      document.querySelectorAll(".subtab-btn").forEach(function(b){ b.classList.remove("active"); });
      document.querySelectorAll(".subtab-panel").forEach(function(p){ p.classList.remove("active"); });
      btn.classList.add("active");
      panel.classList.add("active");
    });
  }

  function renderGrid(){
    var grid = document.getElementById("mi_grid");
    var countEl = document.getElementById("mi_count");
    if (!grid) return;

    var list = MARCOS_INFECCAO_DATA.slice().sort(function(a, b){ return a.infeccao - b.infeccao; });

    if (countEl) countEl.textContent = list.length + " marco" + (list.length === 1 ? "" : "s");

    grid.innerHTML = "";
    if (list.length === 0){
      grid.innerHTML = '<div class="cx-empty">Nenhum Marco de Infecção encontrado.</div>';
      return;
    }

    list.forEach(function(m){
      var card = document.createElement("div");
      card.className = "cx-card cx-infeccao";
      var shortDesc = m.descricao.length > 150 ? (m.descricao.slice(0, 150).trim() + "…") : m.descricao;
      card.innerHTML =
        '<div class="cx-body">' +
          '<h4>' + esc(m.titulo) + '</h4>' +
          '<p style="margin:6px 0 0; font-size:11.5px; line-height:1.55; color:var(--paper-dim);">' + esc(shortDesc) + '</p>' +
        '</div>' +
        '<div class="cx-arrow">&rsaquo;</div>';
      card.addEventListener("click", function(){ openMarcoModal(m.id); });
      grid.appendChild(card);
    });
  }

  /* ==========================================================
     MODAL DE DETALHES
     Modal próprio, dedicado aos Marcos de Infecção, reaproveitando
     a MESMA estrutura genérica de modal (".modal-overlay"/
     ".modal-box"/".modal-actions") já usada pelos demais modais do
     projeto (mesmo padrão já seguido por marcos-corrupcao.js) —
     nenhum sistema de popup novo é criado.
     ========================================================== */

  function ensureModal(){
    if (document.getElementById("mi_modal")) return;
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "mi_modal";
    overlay.innerHTML =
      '<div class="modal-box cx-modal-box cx-infeccao" id="mi_modal_box">' +
        '<h3 id="mi_modal_title"></h3>' +
        '<div class="cx-modal-section"><p id="mi_modal_desc" style="white-space:pre-wrap;"></p></div>' +
        '<div class="fonte-tag" id="mi_modal_page" style="margin-top:10px;"></div>' +
        '<div class="modal-actions" style="margin-top:14px; justify-content:flex-end;">' +
          '<button type="button" id="mi_modal_close">Fechar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById("mi_modal_close").addEventListener("click", closeMarcoModal);
    overlay.addEventListener("click", function(e){
      if (e.target.id === "mi_modal") closeMarcoModal();
    });
  }

  function openMarcoModal(id){
    var m = findMarcoById(id);
    if (!m) return;
    ensureModal();
    document.getElementById("mi_modal_title").textContent = m.titulo;
    document.getElementById("mi_modal_desc").textContent = m.descricao;
    document.getElementById("mi_modal_page").textContent = "Sistema de OdC — pág. " + m.pagina;
    document.getElementById("mi_modal").style.display = "flex";
  }

  function closeMarcoModal(){
    var m = document.getElementById("mi_modal");
    if (m) m.style.display = "none";
  }

  /* ---------- boot ---------- */
  function init(){
    ensureCompendioTab();
    renderGrid();
  }

  window.MarcosInfeccao = {
    init: init,
    refresh: renderGrid,
    data: MARCOS_INFECCAO_DATA,
    openMarcoModal: openMarcoModal
  };

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
