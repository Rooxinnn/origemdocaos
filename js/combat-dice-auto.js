/* ==========================================================
   DADOS DE COMBATE AUTOMÁTICOS
   Módulo independente e isolado (nenhum outro arquivo foi
   reescrito para isto) que preenche automaticamente os campos já
   existentes de Dados de Combate (ATK N/AB/AF/C, DEF N/AB/I/C,
   DESV N/O), convertendo os valores numéricos de Atributos,
   Perícias, Habilidades e Talentos em dados, conforme as fórmulas
   oficiais do sistema.

   IMPORTANTE — este módulo:
   - NÃO cria novos campos nem uma segunda seção de Dados de
     Combate. Usa exatamente os 10 <input id="atk_n">...
     <input id="desv_o"> que já existem no HTML, só passando a
     preenchê-los via JS (e marcando-os "readonly", já que agora
     são 100% derivados) em vez de esperar digitação manual.
   - NÃO cria novo sistema de armazenamento. Os 10 campos
     continuam sendo <input> comuns dentro de #tab-agentes, então
     continuam sendo salvos/carregados/duplicados pelos mesmos
     mecanismos GENÉRICOS que já existem (agentFieldIds()) — não
     foi necessário alterar saveAgent()/loadAgent()/duplicateSheet().
   - NÃO altera os valores numéricos de Atributos/Perícias/
     Habilidades/Talentos, nem seus campos "Atual". Lê apenas o
     campo "Máx." de cada um (mesma fonte já usada pelos outros
     cálculos automáticos do projeto — SAN, HP MÁXIMO, FADIGA
     MÁXIMA — todos derivados do valor "Máx.", não do "Atual").
   - Igual a TextViewMode/CharacterImage, se adapta a QUALQUER
     forma como os valores mudem (digitação, trocar de ficha,
     ficha nova, duplicar, resetar, importar JSON etc.) por
     "espelhamento por leitura periódica": a cada poucos instantes
     compara os valores atuais dos atributos/perícias usados nas
     fórmulas com a última leitura, e só recalcula quando algo
     realmente mudou — sem precisar conhecer ou modificar
     createNewSheet()/openSheet()/loadAgent()/resetar.

   Namespace: window.CombatDiceAuto
   ========================================================== */
(function () {
  "use strict";

  var POLL_INTERVAL_MS = 400; // mesmo intervalo já usado por TextViewMode/CharacterImage

  // Tabela de conversão valor → dado (instrução 1 do pedido). NÃO alterar
  // essas faixas nem inventar outras.
  //   1–5   → 1d4
  //   6–7   → 1d6
  //   8–11  → 1d8
  //   12–15 → 1d12
  //   16–20 → 1d20
  function tierDie(v) {
    if (v >= 16) return 20;
    if (v >= 12) return 12;
    if (v >= 8) return 8;
    if (v >= 6) return 6;
    if (v >= 1) return 4;
    return 0; // sem valor (0 ou vazio): nenhum dado definido pela tabela
  }

  function dieText(v) {
    var d = tierDie(v);
    return d > 0 ? ("1d" + d) : "0";
  }

  function skillVal(id) {
    var el = document.getElementById(id);
    return el ? (parseInt(el.value, 10) || 0) : 0;
  }

  /* Fórmulas oficiais (instrução 2). Cada termo de cada fórmula é:
       - string  → id de um único Atributo/Perícia/Habilidade/Talento
       - [a, b]  → substituição "a OU b" (nunca soma — instrução 3)
       - number  → valor fixo somado, sem virar dado (DESV O, instrução 4)
     NÃO alterar os componentes nem os IDs abaixo. */
  var COMBAT_FORMULAS = {
    atk_n:  ["marcial", "combate", "forca_fisica"],
    atk_ab: ["combate", "pericia_armas_brancas", "forca_fisica"],
    atk_af: ["combate", "pericia_armas_fogo", "mirar"],
    atk_c:  ["combate", "sentido_paranormal", "ocultismo"],
    def_n:  ["forca_fisica", "resistencia", "marcial"],
    def_ab: ["forca_fisica", "pericia_armas_brancas", ["agilidade", "marcial"]],
    def_i:  ["forca_fisica", "pericia_armas_brancas", ["agilidade", "marcial"]],
    def_c:  ["sentido_paranormal", "ocultismo", ["agilidade", "marcial"]],
    desv_n: ["velocidade", "combate", ["agilidade", "marcial"]],
    desv_o: ["sentido_paranormal", "ocultismo", ["agilidade", "marcial"], 5]
  };

  // Todos os IDs de Atributo/Perícia/Habilidade/Talento usados por alguma
  // fórmula acima — usado só para saber QUANDO recalcular (ver poll()).
  var WATCHED_IDS = (function () {
    var set = {};
    Object.keys(COMBAT_FORMULAS).forEach(function (field) {
      COMBAT_FORMULAS[field].forEach(function (term) {
        if (typeof term === "string") set[term] = true;
        else if (Array.isArray(term)) term.forEach(function (id) { set[id] = true; });
      });
    });
    return Object.keys(set);
  })();

  // Constrói o texto de um termo "a OU b" (instrução 3: substituição, nunca
  // soma). Se os dois lados caírem na mesma faixa de dado, mostra só uma
  // vez (não há escolha real a fazer); senão mostra as duas opções lado a
  // lado, já que a ficha não tem como saber sozinha qual delas o jogador
  // vai usar na rolagem.
  function substitutionText(idA, idB) {
    var vA = skillVal(idA), vB = skillVal(idB);
    var dA = tierDie(vA), dB = tierDie(vB);
    var textA = dA > 0 ? ("1d" + dA) : "0";
    if (dA === dB) return textA;
    var textB = dB > 0 ? ("1d" + dB) : "0";
    return "(" + textA + " ou " + textB + ")";
  }

  function computeField(fieldId) {
    var terms = COMBAT_FORMULAS[fieldId];
    var anyNonZero = false;
    var parts = terms.map(function (term) {
      if (typeof term === "number") return String(term); // +5 fixo (DESV O)
      if (Array.isArray(term)) {
        if (skillVal(term[0]) > 0 || skillVal(term[1]) > 0) anyNonZero = true;
        return substitutionText(term[0], term[1]);
      }
      var v = skillVal(term);
      if (v > 0) anyNonZero = true;
      return dieText(v);
    });
    // Enquanto NENHUM atributo/perícia usado na fórmula tiver valor, deixa
    // o campo vazio (mostrando o placeholder) em vez de exibir algo como
    // "0 + 0 + 0" numa ficha ainda não preenchida.
    if (!anyNonZero) return "";
    return parts.join(" + ");
  }

  function ensureReadOnly() {
    Object.keys(COMBAT_FORMULAS).forEach(function (fieldId) {
      var el = document.getElementById(fieldId);
      if (el && !el.hasAttribute("readonly")) {
        el.setAttribute("readonly", "readonly");
        el.title = "Calculado automaticamente a partir dos Atributos/Perícias/Habilidades/Talentos da ficha";
      }
    });
  }

  function recomputeAll() {
    Object.keys(COMBAT_FORMULAS).forEach(function (fieldId) {
      var el = document.getElementById(fieldId);
      if (!el) return;
      var result = computeField(fieldId);
      if (el.value !== result) el.value = result;
    });
  }

  var lastSnapshot = null;
  function watchedSnapshot() {
    return WATCHED_IDS.map(skillVal).join(",");
  }

  function poll() {
    var snap = watchedSnapshot();
    if (snap !== lastSnapshot) {
      lastSnapshot = snap;
      recomputeAll();
    }
  }

  function init() {
    if (!document.getElementById("tab-agentes")) return; // estrutura inesperada: não faz nada
    ensureReadOnly();
    lastSnapshot = null; // força o primeiro cálculo já no load
    poll();
    setInterval(poll, POLL_INTERVAL_MS);
  }

  window.CombatDiceAuto = {
    recompute: recomputeAll
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
