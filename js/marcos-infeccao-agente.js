/* ==========================================================
   MARCOS DE INFECÇÃO — INTEGRAÇÃO COM A FICHA
   Módulo independente e isolado, adicionado sobre a arquitetura já
   existente. NÃO reescreve o projeto, NÃO cria uma segunda
   biblioteca de Marcos e NÃO cria um novo sistema de armazenamento:

     COMPÊNDIO (js/marcos-infeccao.js, já pronto)
         ↓ window.MarcosInfeccao.data (fonte única dos Marcos)
     AGENTES → Infecção da ficha (campo já existente #infeccao)
         ↓
     Este módulo: detecta Marcos atingidos, avisa (popup) e exibe na
     ficha SOMENTE os Marcos cujo requisito é <= à Infecção atual —
     se a Infecção diminuir, os Marcos acima do novo valor somem
     automaticamente (ver "MARCOS DE INFECÇÃO DINÂMICOS" abaixo).

   IMPORTANTE — este módulo:
   - NÃO duplica os Marcos de Infecção. Consulta sempre
     window.MarcosInfeccao.data (array já exposto pelo Compêndio)
     por id — nunca copia título/descrição/página para uma segunda
     lista.
   - NÃO usa Dimensão. Diferente dos Marcos de Corrupção, os Marcos
     de Infecção não dependem da Dimensão da ficha (instrução 14 do
     pedido) — a única entrada considerada é o valor atual de
     Infecção.
   - NÃO cria um novo campo de Infecção. Lê somente o campo já
     existente #infeccao (formato "Atual/Máx.", mesmo padrão de
     Corrupção — ver corrupcaoAtual() em marcos-corrupcao-agente.js),
     extraindo a parte "Atual" antes da primeira "/". Nunca escreve
     nesse campo.
   - NÃO cria um novo sistema de armazenamento. O ponto de
     integração é um campo comum dentro de #tab-agentes:
       #marcos_infeccao_conquistados — campo oculto NOVO, dentro de
                    #tab-agentes, coletado pelo mesmo mecanismo
                    genérico (agentFieldIds()/saveAgent()/
                    loadAgent()/duplicateSheet()/exportAgentJSON()/
                    importAgentJSONFile()) — guarda só um JSON com
                    os IDs dos Marcos já conquistados por esta ficha
                    (a referência, não uma cópia dos dados do Marco).
     Como esse campo já faz parte de #tab-agentes, ele é
     automaticamente preservado por createNewSheet()/openSheet()/
     duplicateSheet()/resetar/exportar/importar — nenhuma dessas
     funções foi alterada. JSONs antigos sem esse campo carregam
     naturalmente como "[]" (readAchieved() trata JSON inválido/
     ausente como lista vazia — mesmo comportamento já usado por
     Marcos de Corrupção).
   - MARCOS DE INFECÇÃO DINÂMICOS (atualização sobre a versão
     anterior deste módulo): o painel exibido em #mia_list é sempre
     recalculado a partir do valor ATUAL do campo #infeccao — Marco
     ativo = requisito do Marco <= Infecção atual. Se a Infecção
     diminuir, os Marcos cujo requisito ficou acima do valor atual
     desaparecem da ficha imediatamente; se ela voltar a subir, esses
     mesmos Marcos voltam a aparecer, sem duplicar nada. Este é o
     MESMO padrão já usado por Marcos de Corrupção
     (marcos-corrupcao-agente.js) — a diferença de "Marcos de
     Infecção não depende de Dimensão" continua valendo, só isso.
     O campo #marcos_infeccao_conquistados CONTINUA existindo e
     sendo salvo (não foi removido, para não quebrar fichas antigas
     nem o mecanismo de #tab-agentes), mas passa a servir só como
     registro interno de "quais Marcos já dispararam popup nesta
     ficha" — ele não é mais usado para decidir o que aparece no
     painel (ver checkForNewMarcos()/renderPanel() abaixo).
   - NÃO aplica nenhum efeito mecânico automaticamente (não altera
     Sanidade, não aplica Doenças Psicológicas, etc. — mesmo texto
     do livro é só exibido, igual a Marcos de Corrupção). Apenas
     detecta, avisa, registra e mostra a descrição já cadastrada no
     Compêndio.
   - Assim como Marcos de Corrupção/TextViewMode/CharacterImage, se
     adapta a QUALQUER forma como a Infecção da ficha mude
     (digitação, trocar de ficha, abrir ficha, duplicar, resetar,
     importar JSON etc.) por "espelhamento por leitura periódica": a
     cada poucos instantes compara o valor atual com a última
     leitura e só age quando algo de fato mudou — sem precisar
     conhecer ou alterar createNewSheet()/openSheet()/loadAgent()/
     duplicateSheet()/resetar.

   Namespace: window.MarcosInfeccaoAgente
   ========================================================== */
(function () {
  "use strict";

  var POLL_INTERVAL_MS = 450; // mesma ordem de grandeza já usada pelos outros módulos de polling

  var INFECCAO_FIELD_ID = "infeccao";
  var ACHIEVED_FIELD_ID = "marcos_infeccao_conquistados";

  function esc(s) {
    if (typeof escapeHtml === "function") return escapeHtml(s);
    var d = document.createElement("div");
    d.textContent = (s === undefined || s === null) ? "" : String(s);
    return d.innerHTML;
  }

  /* ---------------------------------------------------------
     Acesso aos Marcos do Compêndio (window.MarcosInfeccao.data) —
     nunca copiados, sempre consultados por id.
     --------------------------------------------------------- */
  function allMarcos() {
    return (window.MarcosInfeccao && window.MarcosInfeccao.data) || [];
  }
  function findMarco(id) {
    var list = allMarcos();
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
    return null;
  }

  /* ---------------------------------------------------------
     Campo #infeccao — extrai só a parte "Atual" (antes da 1ª "/"),
     mesmo padrão já usado pelo campo Corrupção (ver corrupcaoAtual()
     em marcos-corrupcao-agente.js). Nunca escreve nesse campo.
     --------------------------------------------------------- */
  function infeccaoAtual() {
    var el = document.getElementById(INFECCAO_FIELD_ID);
    if (!el) return null;
    var raw = (el.value || "").toString().trim();
    if (!raw) return null;
    var atualStr = raw.split("/")[0].trim().replace(",", ".");
    var n = parseFloat(atualStr);
    return isNaN(n) ? null : n;
  }

  /* ---------------------------------------------------------
     Campo oculto #marcos_infeccao_conquistados — só um JSON com os
     IDs dos Marcos que já dispararam popup nesta ficha (a referência
     ao Marco, nunca uma cópia dos dados). Esta lista é só um
     registro interno para a fila de popups não repetir um aviso já
     mostrado — diminuir a Infecção nunca remove nada daqui, mas isso
     não afeta o que aparece no painel da ficha (ver renderPanel()),
     que é sempre recalculado a partir do valor atual de Infecção.
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
     ÁREA "MARCOS DE INFECÇÃO" — dentro da aba AGENTES. Inserida
     logo após o painel de Marcos de Corrupção (#mca_panel), se ele
     já estiver montado, mantendo a mesma ordem visual: Dados de
     Combate → Marcos de Corrupção → Marcos de Infecção. Se o painel
     de Marcos de Corrupção ainda não existir no momento em que este
     módulo rodar, insere logo após o painel de Dados de Combate
     (mesma área de Infecção/Corrupção) — sem reorganizar nenhum
     outro layout existente.
     ========================================================== */
  function ensurePanel() {
    if (document.getElementById("mia_panel")) return;
    var infEl = document.getElementById(INFECCAO_FIELD_ID);
    var hostPanel = infEl && infEl.closest(".panel");
    if (!hostPanel || !hostPanel.parentElement) return;

    var mcaPanel = document.getElementById("mca_panel"); // painel de Marcos de Corrupção, se já existir
    var anchor = mcaPanel || hostPanel;

    var panel = document.createElement("div");
    panel.className = "panel mia-panel";
    panel.id = "mia_panel";
    // ALTERAÇÃO 2 do pedido (minimizar Corrupção/Infecção): o cabeçalho
    // <h2> vira um toggle recolhível (mesmo <h2>/.panel já existente, só
    // com um ícone ▲/▼ clicável somado — nenhum novo container/aba/painel
    // é criado, só expande/recolhe o próprio painel "Marcos de Infecção"
    // que já existia). O conteúdo passa a ficar dentro de #mia_body, que é
    // apenas ocultado (display:none) ao recolher — o polling/
    // checkForNewMarcos() continua rodando normalmente mesmo com o painel
    // recolhido (instrução 15), só a exibição é afetada.
    panel.innerHTML =
      '<h2 class="mia-toggle-header" id="mia_toggle" role="button" tabindex="0" aria-expanded="true">' +
        '<span>Marcos de Infecção</span>' +
        '<span class="mia-toggle-icon" id="mia_toggle_icon">▲</span>' +
      '</h2>' +
      '<div class="mia-collapse-body" id="mia_body"><div id="mia_list"></div></div>';
    anchor.parentElement.insertBefore(panel, anchor.nextSibling);

    var header = document.getElementById("mia_toggle");
    header.addEventListener("click", toggleCollapse);
    header.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCollapse(); }
    });
  }

  function toggleCollapse() {
    var panel = document.getElementById("mia_panel");
    var body = document.getElementById("mia_body");
    var icon = document.getElementById("mia_toggle_icon");
    var header = document.getElementById("mia_toggle");
    if (!panel || !body || !icon) return;
    var collapsed = panel.classList.toggle("is-collapsed");
    body.style.display = collapsed ? "none" : "";
    icon.textContent = collapsed ? "▼" : "▲";
    if (header) header.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }

  function renderPanel() {
    var list = document.getElementById("mia_list");
    if (!list) return;

    // ATUALIZAÇÃO (Marcos de Infecção dinâmicos): a lista exibida NÃO é
    // mais o histórico permanente gravado em #marcos_infeccao_conquistados
    // — esse campo continua existindo e sendo salvo (serve só para a fila
    // de popups não repetir um aviso já mostrado, ver checkForNewMarcos).
    // O que aparece aqui é sempre recalculado a partir do valor ATUAL do
    // campo #infeccao: Marco ativo = requisito do Marco <= Infecção atual.
    // Isso cobre automaticamente aumento e diminuição (um Marco cujo
    // requisito ficou acima do valor atual some da ficha imediatamente),
    // exatamente no mesmo padrão já usado por Marcos de Corrupção
    // (marcos-corrupcao-agente.js).
    var atual = infeccaoAtual();
    var marcos = [];
    if (atual !== null) {
      marcos = allMarcos().filter(function (m) { return m.infeccao <= atual; });
      marcos.sort(function (a, b) { return a.infeccao - b.infeccao; });
    }

    if (marcos.length === 0) {
      list.innerHTML = '<div class="empty-state">Nenhum Marco de Infecção alcançado ainda.</div>';
      return;
    }

    var html = "";
    marcos.forEach(function (m) {
      html += '<button type="button" class="mia-row" data-mia-id="' + esc(m.id) + '">' +
        '<span class="mia-row-star">★</span>' +
        '<span class="mia-row-body">' +
          '<span class="mia-row-title">' + esc(m.titulo) + '</span>' +
          '<span class="mia-row-infeccao">Infecção: ' + esc(m.infeccao) + '</span>' +
        '</span>' +
      '</button>';
    });

    list.innerHTML = html || '<div class="empty-state">Nenhum Marco de Infecção alcançado ainda.</div>';
    list.querySelectorAll("[data-mia-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var m = findMarco(btn.getAttribute("data-mia-id"));
        if (m) openMarcoModal(m, false);
      });
    });
  }

  /* ==========================================================
     MODAL — reaproveita a MESMA estrutura genérica de modal
     (".modal-overlay"/".modal-box"/".modal-actions") já usada pelo
     restante do projeto (mesmo padrão de Marcos de Corrupção) —
     nenhum sistema de popup novo é criado. Serve tanto para o aviso
     de "Novo Marco" quanto para consultar um Marco já registrado.
     ========================================================== */
  function ensureModal() {
    if (document.getElementById("mia_modal")) return;
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "mia_modal";
    overlay.innerHTML =
      '<div class="modal-box cx-modal-box cx-infeccao" id="mia_modal_box">' +
        '<h3 id="mia_modal_title"></h3>' +
        '<div class="cx-modal-section">' +
          '<p class="mia-modal-marco-titulo" id="mia_modal_marco_titulo"></p>' +
          '<p class="mia-modal-infeccao" id="mia_modal_infeccao"></p>' +
          '<p id="mia_modal_desc" style="white-space:pre-wrap;"></p>' +
        '</div>' +
        '<div class="fonte-tag" id="mia_modal_page" style="margin-top:10px;"></div>' +
        '<div class="modal-actions" style="margin-top:14px; justify-content:flex-end;">' +
          '<button type="button" id="mia_modal_close">Fechar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById("mia_modal_close").addEventListener("click", closeMarcoModal);
    overlay.addEventListener("click", function (e) {
      if (e.target.id === "mia_modal") closeMarcoModal();
    });
  }

  function openMarcoModal(m, isNew) {
    ensureModal();
    document.getElementById("mia_modal_title").textContent = isNew ? "NOVO MARCO DE INFECÇÃO" : "Marco de Infecção";
    document.getElementById("mia_modal_marco_titulo").textContent = m.titulo;
    document.getElementById("mia_modal_infeccao").textContent = "Infecção: " + m.infeccao;
    document.getElementById("mia_modal_desc").textContent = m.descricao;
    document.getElementById("mia_modal_page").textContent = "Sistema de OdC — pág. " + m.pagina;
    // No aviso de Marco novo, o Marco já foi adicionado à ficha automaticamente
    // (instrução 10 do pedido — a detecção em checkForNewMarcos() já grava o id
    // antes de enfileirar o popup), então o botão só precisa confirmar/fechar.
    document.getElementById("mia_modal_close").textContent = isNew ? "Adicionar à Ficha" : "Fechar";
    document.getElementById("mia_modal").style.display = "flex";
  }

  function closeMarcoModal() {
    var el = document.getElementById("mia_modal");
    if (el) el.style.display = "none";
    showNextQueuedPopup();
  }

  /* ---------------------------------------------------------
     Fila de popups — se vários Marcos forem atingidos de uma vez
     (ex.: Infecção 0 → 35 cruzando 5 Marcos), nenhum se perde: mostra
     um de cada vez, na ordem de Infecção crescente.
     --------------------------------------------------------- */
  var popupQueue = [];
  var popupShowing = false;

  function queueNewMarcoPopups(marcos) {
    marcos.slice().sort(function (a, b) { return a.infeccao - b.infeccao; }).forEach(function (m) {
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
     Não assume incremento de 1 em 1: sempre compara TODOS os
     Marcos contra o valor atual de Infecção e contra os já
     registrados em #marcos_infeccao_conquistados, então qualquer
     salto é detectado por completo, e nenhum popup já mostrado é
     repetido. Esse campo é só o registro interno de popups (nunca
     removido dele, mesmo padrão já usado por Marcos de Corrupção) —
     o que aparece no painel da ficha é sempre recalculado à parte,
     em renderPanel(), a partir do valor atual de Infecção.
     ========================================================== */
  function checkForNewMarcos() {
    var atual = infeccaoAtual();
    if (atual === null) return; // sem Infecção numérica preenchida: nada a checar

    var achieved = readAchieved();
    var achievedSet = {};
    achieved.forEach(function (id) { achievedSet[id] = true; });

    var novos = allMarcos().filter(function (m) {
      return m.infeccao <= atual && !achievedSet[m.id];
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
    var infEl = document.getElementById(INFECCAO_FIELD_ID);
    var achEl = document.getElementById(ACHIEVED_FIELD_ID);
    return [
      infEl ? infEl.value : "",
      achEl ? achEl.value : ""
    ].join("|");
  }

  function poll() {
    if (!document.getElementById("tab-agentes")) return;
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
    ensurePanel();
    renderPanel();
    poll();
    setInterval(poll, POLL_INTERVAL_MS);
  }

  window.MarcosInfeccaoAgente = {
    init: init,
    refresh: function () { renderPanel(); }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
