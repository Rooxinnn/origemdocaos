/* ==========================================================
   RECUPERAR PONTOS DA FICHA
   ==========================================================
   Recupera apenas valores que possuem um máximo explícito:
   HP, SAN, Fadiga e cada Habilidade/Talento/Atributo/Perícia.
   Não altera máximos, Corrupção, Infecção, inventário ou qualquer
   outra regra da ficha. O salvamento continua manual, como antes.
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

  function restorePair(currentId, maximumId) {
    var current = document.getElementById(currentId);
    var maximum = document.getElementById(maximumId);
    if (!current || !maximum) return false;
    var maxValue = numberFrom(maximum.value);
    if (maxValue === null) return false;
    var next = displayNumber(maxValue);
    if (current.value === next) return false;
    current.value = next;
    return true;
  }

  function dispatchFieldUpdate(field) {
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function restoreAllPoints() {
    var restored = [];

    // As skills são recuperadas primeiro. Assim, qualquer máximo automático
    // (especialmente SAN/Fadiga) é recalculado antes da recuperação final.
    document.querySelectorAll("#tab-agentes [data-skill-atual]").forEach(function (current) {
      var maximumId = current.dataset.skillAtual;
      var maximum = document.getElementById(maximumId);
      if (!maximum) return;
      var maxValue = numberFrom(maximum.value);
      if (maxValue === null) return;
      var next = displayNumber(maxValue);
      if (current.value !== next) {
        current.value = next;
        restored.push(current);
      }
    });

    // Reaproveita os cálculos normais existentes antes de copiar SAN/Fadiga.
    if (typeof window.updateSAN === "function") window.updateSAN();
    if (typeof window.updateFatigue === "function") window.updateFatigue();

    [["hp", "hp_max"], ["san_atual", "san_max"], ["fadiga_atual", "fadiga_max"]].forEach(function (pair) {
      var current = document.getElementById(pair[0]);
      if (restorePair(pair[0], pair[1]) && current) restored.push(current);
    });

    restored.forEach(dispatchFieldUpdate);

    if (typeof window.initAllSkillBaselines === "function") window.initAllSkillBaselines();
    if (typeof window.updateAgentVitalStates === "function") window.updateAgentVitalStates();
    if (typeof window.markAgentDirty === "function") window.markAgentDirty();

    if (typeof window.flashIndicator === "function") {
      window.flashIndicator(restored.length ? "✦ Pontos recuperados. Salve a ficha para confirmar." : "✦ Todos os pontos já estão no máximo.", false, 2800);
    }
  }

  function init() {
    var button = document.getElementById("btn_restore_agent_points");
    if (!button) return;
    button.addEventListener("click", function () {
      if (!confirm("Recuperar HP, SAN, Fadiga e todos os campos Atual/Máx. preenchidos?")) return;
      restoreAllPoints();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
