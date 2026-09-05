/* ==========================================================
   AJUSTE RÁPIDO DE VALORES (+N / -N)
   Módulo independente e isolado (nenhum outro arquivo foi
   reescrito para isto) que permite, nos campos "Atual" de
   Atributos, Perícias, Habilidades, Talentos, HP, SAN e Fadiga,
   digitar "+N" ou "-N" para somar/subtrair do valor já presente
   no campo, em vez de precisar calcular o resultado manualmente.

   IMPORTANTE — este módulo:
   - NÃO cria um novo sistema de armazenamento nem intercepta
     saveAgent()/loadAgent(). Ele só reescreve, no próprio campo
     já existente, o valor final (ex.: troca "-5" por "15"),
     exatamente como se o usuário tivesse digitado "15" direto.
     Dali em diante o campo é salvo/carregado normalmente pelos
     mecanismos GENÉRICOS que já existem (agentFieldIds()).
   - NÃO cria novas regras de jogo: não trava o valor em 0, não
     trava no máximo, não inventa limites que o projeto não tinha.
   - NÃO altera o campo "Máx." de nenhuma pontuação — a operação
     só é aplicada ao campo "Atual" (ou ao HP/SAN/Fadiga atuais).
   - Depois de aplicar o resultado, dispara os eventos padrão
     "input" e "change" no campo, para que toda a lógica que já
     existia (clamp Atual ≤ Máx., recálculo de SAN/HP/Fadiga,
     marcação de "ficha não salva" etc.) continue funcionando
     exatamente como antes, sem precisar duplicar essa lógica aqui.

   Campos alvo (ver 1.1 do pedido): apenas os campos "Atual" que
   representam pontuação/recurso de jogo modificável durante a
   sessão. Habilidades em 50, Habilidades Desbloqueadas, Compêndio
   e Aborto Límbico não possuem campos desse tipo e por isso não
   são tocados por este módulo.

   Namespace: window.QuickValueAdjustments
   ========================================================== */
(function () {
  "use strict";

  // Campos "Atual" de Atributos/Perícias/Habilidades/Talentos —
  // todos compartilham o atributo data-skill-atual (ver renderGrid /
  // buildSkillRow no index.html). Não inclui o campo "Máx." (esse
  // usa data-skill, não data-skill-atual).
  var GRID_ATUAL_SELECTOR = "[data-skill-atual]";

  // Demais recursos "Atual" que já existem na ficha, fora dos grids
  // de skill. Os campos "Máximo"/"Máxima" correspondentes (hp_max,
  // san_max, fadiga_max) propositalmente NÃO estão nesta lista.
  var EXTRA_FIELD_IDS = ["hp", "san_atual", "fadiga_atual"];

  // Aceita "+5", "-5", "+ 5", "-5.5", "-5,5" (vírgula como separador
  // decimal também é aceita, já que o teclado numérico de celular
  // costuma usar vírgula). Espaços nas pontas são ignorados.
  var QUICK_ADJUST_RE = /^([+-])\s*(\d+(?:[.,]\d+)?)$/;

  // Guarda o valor confirmado mais recente de cada campo, para servir
  // de base ao aplicar "+N"/"-N". Um WeakMap não interfere em nada
  // fora deste módulo e é limpo automaticamente pelo garbage collector
  // caso o campo seja removido do DOM.
  var baseline = new WeakMap();

  function isTargetField(el) {
    if (!el || typeof el.matches !== "function") return false;
    if (el.matches(GRID_ATUAL_SELECTOR)) return true;
    return el.id && EXTRA_FIELD_IDS.indexOf(el.id) !== -1;
  }

  function parseNumber(str) {
    var n = parseFloat(String(str || "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  }

  function formatResult(n) {
    // Evita ruído de ponto flutuante (ex.: 0.1 + 0.2) e mantém
    // números inteiros sem casas decimais desnecessárias, já que a
    // imensa maioria dos valores da ficha são inteiros.
    var rounded = Math.round(n * 1000) / 1000;
    return String(rounded);
  }

  function captureBaseline(el) {
    baseline.set(el, parseNumber(el.value));
  }

  // Retorna true se o valor do campo era uma expressão "+N"/"-N" e foi
  // convertida para o resultado final; false se o campo deve ser
  // deixado exatamente como o usuário digitou (preenchimento normal).
  function applyQuickAdjust(el) {
    var raw = (el.value || "").trim();
    var match = raw.match(QUICK_ADJUST_RE);
    if (!match) return false;

    var sign = match[1] === "-" ? -1 : 1;
    var amount = parseNumber(match[2]);
    var base = baseline.has(el) ? baseline.get(el) : parseNumber(el.value);
    var result = base + sign * amount;

    el.value = formatResult(result);
    return true;
  }

  function confirmField(el) {
    var wasQuickAdjust = applyQuickAdjust(el);
    // Atualiza a base para o valor já confirmado (seja ele resultado de
    // "+N"/"-N" ou um número normal digitado direto).
    baseline.set(el, parseNumber(el.value));

    if (wasQuickAdjust) {
      // Só dispara os eventos padrão quando o módulo de fato reescreveu
      // o campo — assim, o resto do projeto reage à mudança exatamente
      // como reagiria se o usuário tivesse digitado o resultado final.
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  document.addEventListener("focusin", function (e) {
    if (!isTargetField(e.target)) return;
    captureBaseline(e.target);
  });

  document.addEventListener("focusout", function (e) {
    if (!isTargetField(e.target)) return;
    confirmField(e.target);
  });

  // Confirma também ao pressionar Enter, sem esperar o campo perder o
  // foco — comportamento comum durante uma sessão de RPG, quando o
  // jogador quer ver o resultado na hora.
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    if (!isTargetField(e.target)) return;
    confirmField(e.target);
  });

  window.QuickValueAdjustments = {
    isTargetField: isTargetField
  };
})();
