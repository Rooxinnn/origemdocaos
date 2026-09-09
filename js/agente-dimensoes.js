/* ==========================================================
   DIMENSÕES MÚLTIPLAS — INTEGRAÇÃO COM A FICHA (AGENTES)
   Módulo independente e isolado, adicionado sobre a arquitetura já
   existente. NÃO reescreve o projeto, NÃO cria um novo catálogo de
   Dimensões e NÃO cria um novo sistema de armazenamento:

     CONEXÕES (index.html) → CONEXOES_DIM_ORDER / CONEXOES_DIM_LABELS
         ↓ (fonte única dos nomes/chaves de Dimensão — já usada pelo
            antigo <select id="dimensao"> em js/marcos-corrupcao-agente.js)
     Este módulo: permite escolher até 2 dessas Dimensões para o
     Agente, em vez de apenas 1, guardando a lista em um campo comum
     de #tab-agentes (mesmo mecanismo genérico de sempre).

   AUDITORIA (resumo — ver relatório completo na resposta ao pedido):
     - Campo antigo: <select id="dimensao"> dentro de
       ".combat-dimension-box" (index.html). Preenchido por
       ensureDimensaoOptions() em js/marcos-corrupcao-agente.js.
       Salvo/carregado/duplicado/exportado/importado/sincronizado
       automaticamente por já estar dentro de #tab-agentes
       (agentFieldIds() varre "input, textarea, select").
     - Marcos de Corrupção (js/marcos-corrupcao-agente.js) já
       funcionam por Dimensão: para a Dimensão selecionada, filtra
       window.MarcosCorrupcao.data (Compêndio) por m.dimensao e
       compara m.corrupcao contra o valor ÚNICO e COMPARTILHADO do
       campo #corrupcao (não existe um contador de Corrupção por
       Dimensão). Ou seja, a regra já existente para "considerar os
       Marcos de uma Dimensão" é: filtrar o Compêndio por essa chave
       e comparar contra o mesmo #corrupcao de sempre. Para 2
       Dimensões, este módulo não inventa nenhuma fórmula de
       combinação: js/marcos-corrupcao-agente.js passou a repetir
       EXATAMENTE essa mesma checagem, já existente, uma vez para
       cada Dimensão selecionada, contra o mesmo #corrupcao —
       nenhum valor é somado/combinado entre Dimensões.

   ESTRUTURA DE DADOS (compatibilidade obrigatória):
     - #dimensoes (NOVO, campo oculto, fonte da verdade a partir de
       agora): JSON com até 2 chaves de Dimensão, ex.:
       ["infernal","terrena"]. Já faz parte de #tab-agentes, então
       segue o mesmo mecanismo genérico de sempre (nenhum
       armazenamento novo, nenhuma tabela/coluna nova no Supabase —
       chega à nuvem exatamente do mesmo jeito que qualquer outro
       campo de agents.data).
     - #dimensao (o campo antigo, mantido como campo oculto — deixou
       de ser <select>, mas o id continua o mesmo): espelha SEMPRE a
       PRIMEIRA Dimensão de #dimensoes. Existe só para não exigir
       nenhuma alteração em quem já lia esse campo isoladamente
       (Exportar PDF, que só tem um espaço físico para "Dimensão" no
       formulário original — ver index.html, bloco "Exportar PDF").
       Fichas antigas (dimensao:"Dimensão A" texto livre OU já
       migradas para chave, conforme a Etapa 2 dos Marcos de
       Corrupção) continuam sendo lidas normalmente por loadAgent()
       para dentro deste campo #dimensao; este módulo então
       migra esse valor para #dimensoes automaticamente (ver
       migrateFromLegacyIfNeeded()) — sem exigir que o usuário
       recrie ou corrija a ficha, e sem apagar o campo antigo.

   Namespace: window.CRISAgenteDimensoes
   ========================================================== */
(function () {
  "use strict";

  var POLL_INTERVAL_MS = 450; // mesma ordem de grandeza já usada pelos outros módulos "-agente"
  var MAX_DIMS = 2;

  var NEW_FIELD_ID = "dimensoes";
  var LEGACY_FIELD_ID = "dimensao";

  // Dimensões válidas para o Agente: reaproveita EXATAMENTE
  // CONEXOES_DIM_ORDER/CONEXOES_DIM_LABELS (index.html — mesma fonte
  // já usada pelo antigo <select id="dimensao">), só removendo as 3
  // entradas que não são Dimensões "de Corrupção"/Conexão do Agente
  // (Aborto Límbico, Conexões Superiores, Especiais). Nenhuma lista
  // nova é criada.
  var NON_AGENT_DIMS = { tecnica: true, superior: true, especial: true };

  function dimKeys() {
    if (typeof CONEXOES_DIM_ORDER === "object" && CONEXOES_DIM_ORDER) {
      return CONEXOES_DIM_ORDER.filter(function (k) { return !NON_AGENT_DIMS[k]; });
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

  function isValidDim(key) {
    return !!key && dimKeys().indexOf(key) !== -1;
  }

  function esc(s) {
    if (typeof escapeHtml === "function") return escapeHtml(s);
    var d = document.createElement("div");
    d.textContent = (s === undefined || s === null) ? "" : String(s);
    return d.innerHTML;
  }

  /* ---------------------------------------------------------
     Campo #dimensoes — leitura/escrita do array (máx. 2, sem
     duplicatas, só chaves válidas).
     --------------------------------------------------------- */
  function readDimensoes() {
    var el = document.getElementById(NEW_FIELD_ID);
    if (!el) return [];
    var arr;
    try {
      arr = JSON.parse(el.value || "[]");
    } catch (e) {
      arr = [];
    }
    if (!Array.isArray(arr)) arr = [];
    var out = [];
    arr.forEach(function (k) {
      if (isValidDim(k) && out.indexOf(k) === -1 && out.length < MAX_DIMS) out.push(k);
    });
    return out;
  }

  // Escreve o array + espelha a primeira Dimensão no campo legado
  // #dimensao, disparando "input"/"change" nos dois (mesmo padrão já
  // usado por outros módulos "-agente") para que o listener genérico
  // de #tab-agentes marque a ficha como não salva.
  function writeDimensoes(arr) {
    var newEl = document.getElementById(NEW_FIELD_ID);
    var legacyEl = document.getElementById(LEGACY_FIELD_ID);
    if (!newEl) return;
    var clean = [];
    (arr || []).forEach(function (k) {
      if (isValidDim(k) && clean.indexOf(k) === -1 && clean.length < MAX_DIMS) clean.push(k);
    });
    newEl.value = JSON.stringify(clean);
    newEl.dispatchEvent(new Event("input", { bubbles: true }));
    newEl.dispatchEvent(new Event("change", { bubbles: true }));
    if (legacyEl) {
      legacyEl.value = clean[0] || "";
      legacyEl.dispatchEvent(new Event("input", { bubbles: true }));
      legacyEl.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  // Mesma escrita acima, mas SEM disparar "dirty" — usada só pela
  // migração/auto-correção automáticas (abrir uma ficha não pode, por
  // si só, marcar a ficha como tendo alterações não salvas).
  function silentSetDimensoes(arr) {
    var newEl = document.getElementById(NEW_FIELD_ID);
    if (!newEl) return;
    var clean = [];
    (arr || []).forEach(function (k) {
      if (isValidDim(k) && clean.indexOf(k) === -1 && clean.length < MAX_DIMS) clean.push(k);
    });
    newEl.value = JSON.stringify(clean);
  }

  function addDimensao(key) {
    var atuais = readDimensoes();
    if (atuais.length >= MAX_DIMS) return; // TESTE 4 — terceira Dimensão é impedida
    if (!isValidDim(key) || atuais.indexOf(key) !== -1) return;
    atuais.push(key);
    writeDimensoes(atuais);
    renderChips();
  }

  function removeDimensao(key) {
    var atuais = readDimensoes().filter(function (k) { return k !== key; });
    writeDimensoes(atuais);
    renderChips();
  }

  /* ==========================================================
     COMPATIBILIDADE / ANTI-RESÍDUO — "espelhamento por leitura
     periódica" (mesmo princípio já usado por
     js/marcos-corrupcao-agente.js e js/condicoes-ativas-agente.js):
     a cada leitura, garante que #dimensoes[0] corresponda sempre ao
     valor atual do campo legado #dimensao. Isso resolve, sem
     precisar conhecer nem alterar openSheet()/loadAgent(), os dois
     casos que loadAgent() por si só não cobre (ele só atribui aos
     campos as chaves que já existem no JSON salvo):
       1) Ficha ANTIGA (salva antes desta funcionalidade existir):
          o JSON salvo tem "dimensao" mas não tem "dimensoes" —
          loadAgent() atualiza #dimensao normalmente e não toca em
          #dimensoes, que ficaria com o valor da ficha aberta
          ANTERIORMENTE (dado residual). Este módulo detecta que
          #dimensoes[0] não bate mais com #dimensao e refaz
          #dimensoes = [dimensao] (ou [] se vazio) — migração segura,
          sem exigir ação do usuário (TESTE 7).
       2) Ficha NOVA sem nenhuma Dimensão salva ainda: mesmo
          raciocínio, resultando em [].
     Uma ficha já migrada (JSON salvo com "dimensoes") nunca cai
     neste caso: loadAgent() já entrega #dimensoes e #dimensao
     corretos e consistentes entre si na mesma passada.
     ========================================================== */
  function reconcileWithLegacyIfNeeded() {
    var legacyEl = document.getElementById(LEGACY_FIELD_ID);
    if (!legacyEl) return;
    var legacyVal = (legacyEl.value || "").trim();
    var atuais = readDimensoes();
    var primeiraAtual = atuais[0] || "";
    if (primeiraAtual === legacyVal) return; // já consistente: nada a fazer
    if (legacyVal && isValidDim(legacyVal)) {
      silentSetDimensoes([legacyVal]);
    } else {
      silentSetDimensoes([]);
    }
  }

  /* ==========================================================
     RENDER — chips "Dimensão ×" + botão "+ Adicionar Dimensão",
     dentro do MESMO ".combat-dimension-box" que já existia (apenas
     o <select> antigo foi substituído por este conteúdo).
     ========================================================== */
  function renderChips() {
    var list = document.getElementById("dim_chips_list");
    var addBtn = document.getElementById("dim_add_btn");
    var limitNote = document.getElementById("dim_limit_note");
    if (!list) return;

    var atuais = readDimensoes();

    if (atuais.length === 0) {
      list.innerHTML = '<div class="dim-empty-note">Nenhuma Dimensão selecionada.</div>';
    } else {
      list.innerHTML = "";
      atuais.forEach(function (key) {
        var chip = document.createElement("div");
        chip.className = "dim-chip";
        chip.innerHTML =
          '<span class="dim-chip-label">' + esc(dimLabel(key)) + '</span>' +
          '<button type="button" class="dim-chip-remove" aria-label="Remover ' + esc(dimLabel(key)) + '">×</button>';
        chip.querySelector(".dim-chip-remove").addEventListener("click", function () {
          removeDimensao(key);
        });
        list.appendChild(chip);
      });
    }

    var atingiuLimite = atuais.length >= MAX_DIMS;
    if (addBtn) {
      addBtn.style.display = atingiuLimite ? "none" : "";
    }
    if (limitNote) {
      limitNote.style.display = atingiuLimite ? "" : "none";
    }
  }

  /* ==========================================================
     MODAL "ADICIONAR DIMENSÃO" — reaproveita a MESMA estrutura
     genérica de modal (".modal-overlay"/".modal-box") já usada por
     todo o projeto (ex.: picker de Condições Ativas) — nenhum
     sistema de popup novo é criado. Lista sempre ao vivo a partir de
     dimKeys(), nunca uma cópia.
     ========================================================== */
  function ensurePickerModal() {
    if (document.getElementById("dim_picker_modal")) return;
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "dim_picker_modal";
    overlay.innerHTML =
      '<div class="modal-box dim-picker-box">' +
        '<h3>Adicionar Dimensão</h3>' +
        '<div id="dim_picker_list" class="dim-picker-list"></div>' +
        '<div class="modal-actions" style="margin-top:14px; justify-content:flex-end;">' +
          '<button type="button" id="dim_picker_close">Fechar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById("dim_picker_close").addEventListener("click", closePickerModal);
    overlay.addEventListener("click", function (e) {
      if (e.target.id === "dim_picker_modal") closePickerModal();
    });
  }

  function renderPickerList() {
    var listEl = document.getElementById("dim_picker_list");
    if (!listEl) return;
    var atuais = readDimensoes();
    var disponiveis = dimKeys().filter(function (k) { return atuais.indexOf(k) === -1; });

    if (disponiveis.length === 0) {
      listEl.innerHTML = '<div class="dim-picker-empty">Nenhuma Dimensão disponível — limite de 2 já atingido.</div>';
      return;
    }

    listEl.innerHTML = "";
    disponiveis.forEach(function (key) {
      var row = document.createElement("div");
      row.className = "dim-picker-row";
      row.innerHTML =
        '<span class="dim-picker-row-title">' + esc(dimLabel(key)) + '</span>' +
        '<button type="button" class="dim-picker-add-btn">Adicionar</button>';
      row.querySelector(".dim-picker-add-btn").addEventListener("click", function () {
        addDimensao(key);
        closePickerModal();
      });
      listEl.appendChild(row);
    });
  }

  function openPickerModal() {
    if (readDimensoes().length >= MAX_DIMS) return; // TESTE 4 — impede terceira Dimensão mesmo se o botão ainda estiver visível
    ensurePickerModal();
    renderPickerList();
    document.getElementById("dim_picker_modal").style.display = "flex";
  }

  function closePickerModal() {
    var el = document.getElementById("dim_picker_modal");
    if (el) el.style.display = "none";
  }

  /* ---------- polling: adapta-se a qualquer forma de alteração (troca de ficha, digitação, importação, duplicação, etc.) ---------- */
  var lastSnapshot = null;
  function snapshot() {
    var newEl = document.getElementById(NEW_FIELD_ID);
    var legacyEl = document.getElementById(LEGACY_FIELD_ID);
    return [
      newEl ? newEl.value : "",
      legacyEl ? legacyEl.value : ""
    ].join("|");
  }

  function poll() {
    if (!document.getElementById("tab-agentes")) return;
    reconcileWithLegacyIfNeeded();
    var snap = snapshot();
    if (snap === lastSnapshot) return;
    lastSnapshot = snap;
    renderChips();
  }

  function wireAddButton() {
    var addBtn = document.getElementById("dim_add_btn");
    if (addBtn && !addBtn.dataset.dimWired) {
      addBtn.addEventListener("click", openPickerModal);
      addBtn.dataset.dimWired = "1";
    }
  }

  /* ---------- boot ---------- */
  function init() {
    if (!document.getElementById("tab-agentes")) return; // estrutura inesperada: não faz nada
    wireAddButton();
    reconcileWithLegacyIfNeeded();
    renderChips();
    poll();
    setInterval(poll, POLL_INTERVAL_MS);
  }

  window.CRISAgenteDimensoes = {
    init: init,
    refresh: function () { renderChips(); },
    // Usado por js/marcos-corrupcao-agente.js para considerar os
    // Marcos de Corrupção de CADA Dimensão selecionada (até 2), sem
    // duplicar aqui nenhuma lógica de Marcos/Corrupção.
    getSelected: function () { return readDimensoes(); }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
