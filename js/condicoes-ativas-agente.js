/* ==========================================================
   CONDIÇÕES ATIVAS — INTEGRAÇÃO COM A FICHA
   Módulo independente e autocontido, adicionado sobre a arquitetura
   já existente. NÃO reescreve o projeto, NÃO cria uma segunda
   biblioteca de Condições e NÃO cria um novo sistema de
   armazenamento:

     COMPÊNDIO → Condições (COMP_CONDICOES, já existente em
                 index.html — fonte única dos dados)
         ↓ referência pelo "nome" da condição
     AGENTES → SOBREVIVÊNCIA → Condições Ativas (nova seção, dentro
               do espaço vazio já existente abaixo de HP / Proteção /
               Descanso / Reest. / Proteção Natural / Resistência
               Natural — nenhum desses campos é tocado)

   POR QUE "nome" É A REFERÊNCIA:
   COMP_CONDICOES (índice de "Condições" dentro de COMPENDIO_CATEGORIES,
   em index.html) guarda cada condição apenas como {nome, desc, fonte}
   — não existe nenhum campo "id" próprio para esta categoria. Usar o
   "nome" como referência não é uma invenção deste módulo: é o MESMO
   identificador que o próprio Compêndio já usa para esta categoria
   (ver cardKey em renderCompendio() e o campo "key" de GUIA_LIVRO,
   ambos em index.html). Este módulo apenas consulta COMP_CONDICOES
   por nome sempre que precisa dos dados completos — nunca copia
   nome, descrição ou página para uma segunda lista.

   PERSISTÊNCIA — SEM SISTEMA NOVO:
   O ponto de integração é um único campo comum dentro de #tab-agentes:

     #condicoes_ativas — campo oculto NOVO, dentro de #tab-agentes,
                          guardando só um JSON com os NOMES das
                          condições ativas desta ficha (a referência,
                          nunca uma cópia dos dados da condição). Por
                          estar dentro de #tab-agentes, é
                          automaticamente coletado pelo MESMO
                          mecanismo genérico já usado por todo o
                          resto da aba (agentFieldIds()/saveAgent()/
                          loadAgent()/duplicateSheet()/
                          exportAgentJSON()/importAgentJSONFile()) —
                          NENHUMA dessas funções foi alterada. Cada
                          ficha guarda seu próprio valor deste campo,
                          exatamente como qualquer outro campo de
                          #tab-agentes — nunca compartilhado entre
                          fichas. JSONs antigos sem este campo
                          carregam naturalmente como "nenhuma
                          condição" (readActive() trata JSON
                          inválido/ausente como lista vazia).

   RENDERIZAÇÃO: como TODOS os pontos do projeto que trocam de ficha
   (abrir ficha, nova ficha, duplicar, resetar, importar JSON) já
   escrevem no valor de #condicoes_ativas através do mesmo mecanismo
   genérico de #tab-agentes, este módulo apenas observa esse campo
   por "espelhamento por leitura periódica" (mesmo padrão já usado
   por outros módulos deste projeto, como marcos-infeccao-agente.js)
   e re-renderiza a lista sempre que o valor muda — sem precisar
   conhecer ou alterar nenhuma dessas funções.

   MODAL: reaproveita a MESMA estrutura genérica de modal
   (".modal-overlay"/".modal-box"/".cx-modal-box"/".cx-modal-section"/
   ".modal-actions"/".field") já usada por todo o projeto — nenhum
   sistema de popup novo é criado. A lista de seleção consulta
   sempre COMPENDIO_CATEGORIES/COMP_CONDICOES ao vivo — nenhuma
   segunda lista é criada.

   PREPARAÇÃO PARA O FUTURO: cada referência ativa é guardada como
   apenas o nome da condição (string). Se no futuro for necessário
   somar duração/intensidade/efeitos automáticos/modificadores, o
   formato pode evoluir para um objeto {nome, ...} sem quebrar dados
   já salvos (basta tratar uma entrada string como equivalente a
   {nome: entrada}). Nenhuma dessas regras futuras é implementada
   nesta etapa.

   Namespace: window.CondicoesAtivasAgente
   ========================================================== */
(function () {
  "use strict";

  var POLL_INTERVAL_MS = 450; // mesma ordem de grandeza já usada pelos outros módulos de polling

  var FIELD_ID = "condicoes_ativas";

  function esc(s) {
    if (typeof escapeHtml === "function") return escapeHtml(s);
    var d = document.createElement("div");
    d.textContent = (s === undefined || s === null) ? "" : String(s);
    return d.innerHTML;
  }

  /* ---------------------------------------------------------
     Acesso ao Compêndio → Condições (COMP_CONDICOES, já existente
     em index.html) — nunca copiado, sempre consultado por nome.
     --------------------------------------------------------- */
  function allCondicoes() {
    return (typeof COMP_CONDICOES !== "undefined") ? COMP_CONDICOES : [];
  }
  function findCondicaoByNome(nome) {
    var list = allCondicoes();
    for (var i = 0; i < list.length; i++) {
      if (list[i].nome === nome) return list[i];
    }
    return null;
  }

  /* ---------------------------------------------------------
     Campo oculto #condicoes_ativas — só um JSON com os nomes das
     condições ativas nesta ficha (a referência ao Compêndio, nunca
     uma cópia dos dados). Nunca compartilhado entre fichas: é só
     mais um campo dentro de #tab-agentes, salvo/carregado junto
     com o resto da ficha pelo mecanismo já existente.
     --------------------------------------------------------- */
  function readActive() {
    var el = document.getElementById(FIELD_ID);
    if (!el) return [];
    try {
      var arr = JSON.parse(el.value || "[]");
      if (!Array.isArray(arr)) return [];
      // Compatibilidade para trás: aceita tanto uma string (nome)
      // quanto, se um dia isto evoluir, um objeto com campo "nome".
      return arr.map(function (entry) {
        return (entry && typeof entry === "object") ? entry.nome : entry;
      }).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  function writeActive(nomes) {
    var el = document.getElementById(FIELD_ID);
    if (!el) return;
    el.value = JSON.stringify(nomes);
    // Dispara "input"/"change" no próprio campo já existente para que o
    // listener genérico de #tab-agentes (que já trata "input, textarea,
    // select") marque a ficha como não salva — sem duplicar essa lógica
    // aqui e sem precisar chamar markAgentDirty() diretamente.
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function addCondicaoToSheet(nome) {
    var atuais = readActive();
    if (atuais.indexOf(nome) !== -1) return; // já ativa nesta ficha: não duplica
    atuais.push(nome);
    writeActive(atuais);
    renderList();
  }

  function removeCondicaoFromSheet(nome) {
    var atuais = readActive().filter(function (n) { return n !== nome; });
    writeActive(atuais);
    renderList();
  }

  /* ==========================================================
     SEÇÃO "CONDIÇÕES ATIVAS" — já existente no HTML de
     #tab-agentes (dentro da coluna "Sobrevivência", logo abaixo de
     Proteção Natural/Resistência Natural). Este módulo só liga o
     botão "+ Adicionar Condição" e renderiza #ca_list — nenhum
     container novo é criado em runtime.
     ========================================================== */
  function renderList() {
    var list = document.getElementById("ca_list");
    if (!list) return;

    var nomes = readActive();
    if (nomes.length === 0) {
      list.innerHTML = '<div class="ca-empty">Nenhuma condição ativa.</div>';
      return;
    }

    list.innerHTML = "";
    nomes.forEach(function (nome) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ca-chip";
      chip.textContent = nome;
      chip.addEventListener("click", function () { openDetailModal(nome); });
      list.appendChild(chip);
    });
  }

  /* ==========================================================
     MODAL "ADICIONAR CONDIÇÃO"
     Reaproveita a MESMA estrutura genérica de modal
     (".modal-overlay"/".modal-box") e os MESMOS componentes visuais
     já usados por outros pickers do projeto (".field") — nenhum
     sistema de popup novo é criado. Consulta sempre COMP_CONDICOES
     ao vivo — nenhuma segunda lista é criada.
     ========================================================== */
  function ensurePickerModal() {
    if (document.getElementById("ca_picker_modal")) return;

    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "ca_picker_modal";
    overlay.innerHTML =
      '<div class="modal-box ca-picker-box">' +
        '<button type="button" class="ca-picker-close" id="ca_picker_close">&times;</button>' +
        '<h3>Adicionar Condição</h3>' +
        '<div class="field ca-picker-search-row"><label>Pesquisar</label>' +
          '<input type="text" id="ca_picker_search" placeholder="Nome da condição…"></div>' +
        '<div id="ca_picker_count" class="note ca-picker-count"></div>' +
        '<div id="ca_picker_list" class="ca-picker-list"></div>' +
      '</div>';
    document.body.appendChild(overlay);

    document.getElementById("ca_picker_close").addEventListener("click", closePickerModal);
    overlay.addEventListener("click", function (e) {
      if (e.target.id === "ca_picker_modal") closePickerModal();
    });
    document.getElementById("ca_picker_search").addEventListener("input", renderPickerList);
  }

  function openPickerModal() {
    ensurePickerModal();
    document.getElementById("ca_picker_search").value = "";
    renderPickerList();
    document.getElementById("ca_picker_modal").style.display = "flex";
  }

  function closePickerModal() {
    var el = document.getElementById("ca_picker_modal");
    if (el) el.style.display = "none";
  }

  function renderPickerList() {
    var listEl = document.getElementById("ca_picker_list");
    var countEl = document.getElementById("ca_picker_count");
    var searchEl = document.getElementById("ca_picker_search");
    if (!listEl) return;

    var q = (searchEl ? searchEl.value : "").toLowerCase().trim();
    var ativos = readActive();

    var itens = allCondicoes().filter(function (c) {
      if (ativos.indexOf(c.nome) !== -1) return false; // já ativa nesta ficha: não aparece de novo
      if (!q) return true;
      return c.nome.toLowerCase().indexOf(q) !== -1;
    });

    if (countEl) countEl.textContent = itens.length + " condiç" + (itens.length === 1 ? "ão" : "ões") + " disponível" + (itens.length === 1 ? "" : "eis");

    if (itens.length === 0) {
      listEl.innerHTML = '<div class="ca-picker-empty">Nenhuma condição encontrada.</div>';
      return;
    }

    listEl.innerHTML = "";
    itens.forEach(function (c) {
      var row = document.createElement("div");
      row.className = "ca-picker-row";
      row.innerHTML =
        '<div class="ca-picker-row-body"><div class="ca-picker-row-title">' + esc(c.nome) + '</div></div>' +
        '<button type="button" class="ca-picker-add-btn">Adicionar</button>';
      row.querySelector(".ca-picker-add-btn").addEventListener("click", function () {
        addCondicaoToSheet(c.nome);
        renderPickerList();
      });
      listEl.appendChild(row);
    });
  }

  /* ==========================================================
     POPUP DE DETALHES DA CONDIÇÃO
     Reaproveita a MESMA estrutura genérica de modal
     (".modal-overlay"/".modal-box"/".cx-modal-box"/
     ".cx-modal-section"/".modal-actions"/".fonte-tag") já usada
     pelo restante do projeto — nenhum sistema de popup novo é
     criado. Dados (descrição, página) vêm sempre ao vivo de
     COMP_CONDICOES, nunca de uma cópia.
     ========================================================== */
  function ensureDetailModal() {
    if (document.getElementById("ca_modal")) return;
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "ca_modal";
    overlay.innerHTML =
      '<div class="modal-box cx-modal-box" id="ca_modal_box">' +
        '<h3 class="ca-modal-titulo" id="ca_modal_title"></h3>' +
        '<div class="cx-modal-section"><p id="ca_modal_desc" style="white-space:pre-wrap;"></p></div>' +
        '<div class="fonte-tag" id="ca_modal_page" style="margin-top:10px;"></div>' +
        '<div class="modal-actions" style="margin-top:14px; justify-content:space-between;">' +
          '<button type="button" id="ca_modal_remove" class="danger">Remover Condição</button>' +
          '<button type="button" id="ca_modal_close">Fechar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById("ca_modal_close").addEventListener("click", closeDetailModal);
    overlay.addEventListener("click", function (e) {
      if (e.target.id === "ca_modal") closeDetailModal();
    });
  }

  function openDetailModal(nome) {
    var c = findCondicaoByNome(nome);
    ensureDetailModal();

    document.getElementById("ca_modal_title").textContent = nome;
    document.getElementById("ca_modal_desc").textContent = c ? c.desc : "Esta condição não foi encontrada no Compêndio (pode ter sido removida ou renomeada).";
    document.getElementById("ca_modal_page").textContent = c && c.fonte ? c.fonte : "";
    document.getElementById("ca_modal_page").style.display = (c && c.fonte) ? "" : "none";

    var removeBtn = document.getElementById("ca_modal_remove");
    removeBtn.onclick = function () {
      removeCondicaoFromSheet(nome);
      closeDetailModal();
    };

    document.getElementById("ca_modal").style.display = "flex";
  }

  function closeDetailModal() {
    var el = document.getElementById("ca_modal");
    if (el) el.style.display = "none";
  }

  /* ---------- polling: adapta-se a qualquer forma de troca de ficha ---------- */
  var lastSnapshot = null;
  function snapshot() {
    var el = document.getElementById(FIELD_ID);
    return el ? el.value : "";
  }

  function poll() {
    if (!document.getElementById("tab-agentes")) return;
    var snap = snapshot();
    if (snap === lastSnapshot) return;
    lastSnapshot = snap;
    renderList();
  }

  /* ---------- boot ---------- */
  function init() {
    if (!document.getElementById("tab-agentes")) return; // estrutura inesperada: não faz nada
    var addBtn = document.getElementById("ca_add_btn");
    if (addBtn) addBtn.addEventListener("click", openPickerModal);
    renderList();
    poll();
    setInterval(poll, POLL_INTERVAL_MS);
  }

  window.CondicoesAtivasAgente = {
    init: init,
    refresh: renderList
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
