/* ==========================================================
   RECUPERAR PONTOS DAS SKILLS DA FICHA DE AGENTES
   ==========================================================
   A quantidade informada é recuperada individualmente em cada skill,
   respeitando o máximo de cada uma. Não altera HP, SAN, Fadiga,
   Proteção ou qualquer outro recurso da ficha.
   O salvamento continua manual, como antes.
   ========================================================== */
(function () {
  "use strict";

  function numberFrom(value) {
    var normalized = String(value == null ? "" : value).trim().replace(",", ".");
    if (normalized === "") return null;
    var parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function displayNumber(value) {
    return String(Math.round(value * 1000) / 1000);
  }

  function dispatchFieldUpdate(field) {
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function restoreSkillPoints(amount) {
    var restored = [];

    document.querySelectorAll("#tab-agentes [data-skill-atual]").forEach(function (current) {
      var maximum = document.getElementById(current.dataset.skillAtual);
      if (!maximum) return;

      var currentValue = numberFrom(current.value);
      var maxValue = numberFrom(maximum.value);
      if (currentValue === null || maxValue === null || currentValue >= maxValue) return;

      var nextValue = Math.min(currentValue + amount, maxValue);
      if (nextValue !== currentValue) {
        current.value = displayNumber(nextValue);
        restored.push(current);
      }
    });

    restored.forEach(dispatchFieldUpdate);

    if (typeof window.initAllSkillBaselines === "function") window.initAllSkillBaselines();
    if (typeof window.updateAgentVitalStates === "function") window.updateAgentVitalStates();
    if (typeof window.markAgentDirty === "function") window.markAgentDirty();

    if (typeof window.flashIndicator === "function") {
      window.flashIndicator(
        restored.length
          ? "✦ " + displayNumber(amount) + " ponto(s) recuperado(s) em cada skill. Salve a ficha para confirmar."
          : "✦ Nenhuma skill precisava de recuperação.",
        false,
        2800
      );
    }
  }

  function init() {
    var button = document.getElementById("btn_restore_agent_points");
    if (!button) return;

    button.addEventListener("click", function () {
      var rawAmount = window.prompt("Quantos pontos deseja recuperar em cada skill?", "10");
      if (rawAmount === null) return;

      var amount = numberFrom(rawAmount);
      if (amount === null || amount <= 0) {
        if (typeof window.flashIndicator === "function") {
          window.flashIndicator("Informe uma quantidade válida maior que zero.", true, 2800);
        } else {
          window.alert("Informe uma quantidade válida maior que zero.");
        }
        return;
      }

      restoreSkillPoints(amount);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
