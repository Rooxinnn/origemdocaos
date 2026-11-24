/* Navegação compartilhada entre os registros de criaturas. Mantém os fluxos
   existentes de criação, lista, compêndio e regras como destinos únicos. */
(function () {
  "use strict";

  const screens = [
    "secret_files_screen",
    "creature_list_screen",
    "creature_sheet_screen",
    "creature_compendio_screen",
    "creature_registro_screen",
    "creature_ficha_completa_screen",
    "creature_regras_screen"
  ];
  const destinations = {
    minhas: "secret_card_minhas",
    compendio: "secret_card_compendio",
    habilidades: "secret_card_habilidades",
    criar: "secret_card_criar"
  };
  let switching = false;

  function hideCreatureScreens() {
    screens.forEach(id => {
      const screen = document.getElementById(id);
      if (screen) screen.style.display = "none";
    });
  }

  function currentSection() {
    if (document.getElementById("creature_regras_screen")?.style.display === "block") return "habilidades";
    if (["creature_compendio_screen", "creature_registro_screen", "creature_ficha_completa_screen"]
      .some(id => document.getElementById(id)?.style.display === "block")) return "compendio";
    return "minhas";
  }

  function updateActive() {
    const section = currentSection();
    document.querySelectorAll(".cr-area-nav [data-cr-go]").forEach(button => {
      const active = button.dataset.crGo === section;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  async function open(destination) {
    if (switching || (destination !== "inicio" && !destinations[destination])) return false;
    switching = true;
    try {
      const sheet = document.getElementById("creature_sheet_screen");
      if (sheet?.style.display === "block" && window.CRISCreatureSheets?.beforeLeave) {
        if (!await window.CRISCreatureSheets.beforeLeave()) return false;
      }
      hideCreatureScreens();
      if (destination === "inicio") {
        if (typeof showWelcomeScreen === "function") showWelcomeScreen();
      } else {
        document.getElementById("welcome_screen").style.display = "none";
        document.getElementById("app_screen").style.display = "none";
        // A lista permanece visível enquanto uma ficha nova é preparada.
        if (destination === "criar") document.getElementById(destinations.minhas).click();
        document.getElementById(destinations[destination]).click();
        if (destination === "minhas") window.renderCreatureListIfVisible?.();
      }
      updateActive();
      window.scrollTo(0, 0);
      return true;
    } finally {
      switching = false;
    }
  }

  function mount() {
    ["creature_list_screen", "creature_sheet_screen", "creature_compendio_screen",
      "creature_registro_screen", "creature_ficha_completa_screen", "creature_regras_screen"]
      .forEach(id => {
        const screen = document.getElementById(id);
        const host = screen?.querySelector(id === "creature_sheet_screen" ? ".wrap" : ".secret-wrap");
        if (!host) return;
        const nav = document.createElement("nav");
        nav.className = "cr-area-nav";
        nav.setAttribute("aria-label", "Navegação de criaturas");
        nav.innerHTML = `
          <div class="cr-area-nav-top">
            <span class="cr-area-nav-name">⚠ Arquivos Secretos <small>Área de criaturas</small></span>
            <button type="button" data-cr-go="inicio" class="cr-area-exit">← Fichas de agentes</button>
          </div>
          <div class="cr-area-nav-links">
            <button type="button" data-cr-go="minhas">Minhas Criaturas</button>
            <button type="button" data-cr-go="compendio">Compêndio</button>
            <button type="button" data-cr-go="habilidades">Habilidades</button>
            <button type="button" data-cr-go="criar" class="cr-area-create">+ Criar Criatura</button>
          </div>`;
        host.prepend(nav);
        const observer = new MutationObserver(updateActive);
        observer.observe(screen, {attributes: true, attributeFilter: ["style"]});
      });

    document.addEventListener("click", event => {
      const button = event.target.closest(".cr-area-nav [data-cr-go], #cr_list_create_btn");
      if (button) open(button.dataset.crGo || "criar");
    });
    updateActive();
  }

  window.CRISCreatureNav = { open };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
