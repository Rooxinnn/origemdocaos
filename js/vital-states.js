/* ============================================================
   ESTADOS VISUAIS DE HP E SAN — REVISÃO
   ------------------------------------------------------------
   Efeito 100% visual. NÃO altera HP, SAN, cálculos, testes,
   combate, recuperação, descanso ou corrupção. Apenas LÊ os
   valores já existentes nos campos #hp e #san_atual (os mesmos
   já usados por saveAgent()/updateSAN()/updateHP()) e aplica
   classes CSS em #agent-sheet-capture.

   Nada é salvo na nuvem por este arquivo — o estado é sempre
   recalculado a partir de agents.data.hp / agents.data.san_atual,
   tanto na ficha do jogador quanto na visualização do Mestre
   (que usa os MESMOS campos de #tab-agentes — ver
   js/campaign-agent-view.js: fillFieldsFrom()/refreshDerivedDisplays()).

   ------------------------------------------------------------
   HISTÓRICO — implementação anterior removida nesta revisão:
   sangue escorrendo (.vital-blood/.vital-drip/@keyframes
   vitalDripFall) e rachadura de vidro (.vital-crack/
   .vital-static-noise) foram completamente eliminados (ver
   css/vital-states.css). A API pública (window.
   updateAgentVitalStates, classes vital-critical-hp/-san/-both
   em #agent-sheet-capture) foi mantida para não exigir nenhuma
   mudança nos pontos de chamada já existentes em index.html e
   js/campaign-agent-view.js.

   NOVA LINGUAGEM VISUAL:
   HP  <= 0 → luz de emergência (vinheta vermelha pulsando em
              sequência irregular ao entrar em crise; depois,
              pulsação contínua bem discreta).
   SAN <= 0 → falha de lâmpada (pequenos apagões rápidos e
              irregulares ao entrar em colapso; depois, apagões
              ocasionais e sutis, sem tremor digital/RGB/neon).
   ============================================================ */
(function () {
  "use strict";

  // Guarda o estado anterior só para saber QUANDO tocar a sequência de
  // entrada (cruzou de positivo para <= 0) — nunca para decidir o
  // estado atual, que é sempre recalculado do zero a partir dos campos.
  var __prevHpCritical = null;
  var __prevSanCritical = null;

  // Timers da sequência de entrada (ver nota de PERFORMANCE no topo do
  // arquivo original): apenas timeouts temporários de curta duração,
  // sempre limpos antes de agendar um novo, nunca setInterval.
  var __hpEnterTimeout = null;
  var __sanEnterTimeout = null;

  function getCaptureEl() {
    return document.getElementById("agent-sheet-capture");
  }

  // Cria (uma única vez) os elementos de sobreposição usados pelos
  // efeitos. Chamado a cada updateAgentVitalStates(), mas idempotente:
  // se o elemento já existe, não faz nada.
  function ensureOverlays(root) {
    function ensure(id, className) {
      var el = document.getElementById(id);
      if (!el) {
        el = document.createElement("div");
        el.id = id;
        el.className = className;
        el.setAttribute("aria-hidden", "true");
        root.appendChild(el);
      }
      return el;
    }
    // Vinheta ambiente: indicação estática (sem animação própria) da
    // presença do estado crítico — cumpre o requisito de acessibilidade
    // de não depender só de movimento para comunicar o estado.
    ensure("vital_vignette", "vital-vignette");
    // HP: sequência de entrada (flash de emergência) + pulsação
    // ambiente contínua e discreta, em elementos separados para não
    // colidir as duas animações na mesma propriedade do mesmo nó.
    ensure("vital_hp_entry", "vital-hp-entry");
    ensure("vital_hp_ambient", "vital-hp-ambient");
    // SAN: sequência de entrada (apagões rápidos) + apagões ocasionais
    // e sutis depois.
    ensure("vital_san_entry", "vital-san-entry");
    ensure("vital_san_ambient", "vital-san-ambient");
  }

  function ensureTag(boxEl, text) {
    if (!boxEl) return;
    var label = boxEl.querySelector("label, .san-label");
    if (!label) return;
    var tag = label.querySelector(".vital-tag");
    if (!tag) {
      tag = document.createElement("span");
      tag.className = "vital-tag";
      label.appendChild(tag);
    }
    tag.textContent = text;
  }

  function readNumber(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    var v = parseInt(el.value, 10);
    return isNaN(v) ? null : v;
  }

  function updateAgentVitalStates() {
    var root = getCaptureEl();
    if (!root) return; // ficha ainda não renderizada — nada a fazer

    var hp = readNumber("hp");
    var san = readNumber("san_atual");

    // Campo vazio (ficha nova/sem valor definido) não é tratado como
    // crítico — só valores numéricos <= 0 ativam o estado.
    var hpCritical = (hp !== null && hp <= 0);
    var sanCritical = (san !== null && san <= 0);

    ensureOverlays(root);
    ensureTag(document.getElementById("hp_combat_box"), "CRÍTICO");
    ensureTag(document.getElementById("san_combat_box"), "COLAPSO");

    // toggle() em vez de remove()+add(): se o estado não mudou desde a
    // última chamada, a classe permanece exatamente a mesma instância
    // no DOM — evita reiniciar qualquer animação ambiente a cada tecla
    // digitada enquanto o valor continuar crítico (ficha pode ser
    // atualizada por input, carregamento, salvamento, sincronização,
    // abertura da ficha, visualização do Mestre, etc. — a
    // implementação precisa ser idempotente nesses casos).
    root.classList.toggle("vital-critical-hp", hpCritical);
    root.classList.toggle("vital-critical-san", sanCritical);
    root.classList.toggle("vital-critical-both", hpCritical && sanCritical);

    // Sequência de entrada: só quando cruza de "não crítico" para
    // "crítico" nesta própria chamada (nunca enquanto permanece crítico
    // entre uma tecla e outra, e nunca ao simplesmente carregar a ficha
    // já crítica — ver __prevHpCritical/__prevSanCritical iniciados
    // null, que nunca disparam entrada sozinhos).
    if (hpCritical && __prevHpCritical === false) {
      if (__hpEnterTimeout) window.clearTimeout(__hpEnterTimeout);
      root.classList.remove("vital-enter-hp");
      // força reflow para permitir reiniciar a mesma animação CSS caso
      // o estado tenha entrado/saído/entrado de novo muito rápido.
      void root.offsetWidth;
      root.classList.add("vital-enter-hp");
      __hpEnterTimeout = window.setTimeout(function () {
        root.classList.remove("vital-enter-hp");
        __hpEnterTimeout = null;
      }, 2200);
    }
    if (sanCritical && __prevSanCritical === false) {
      if (__sanEnterTimeout) window.clearTimeout(__sanEnterTimeout);
      root.classList.remove("vital-enter-san");
      void root.offsetWidth;
      root.classList.add("vital-enter-san");
      __sanEnterTimeout = window.setTimeout(function () {
        root.classList.remove("vital-enter-san");
        __sanEnterTimeout = null;
      }, 2000);
    }

    __prevHpCritical = hpCritical;
    __prevSanCritical = sanCritical;
  }

  window.updateAgentVitalStates = updateAgentVitalStates;
})();
