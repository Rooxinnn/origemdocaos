/* ==========================================================
   AJUSTE DE UI (visual apenas) — reposiciona #account_bar (botão de
   engrenagem ⚙ da conta) para dentro do cabeçalho "ORIGEM DO CAOS"
   da tela atualmente visível (#app_screen ou #creature_sheet_screen),
   evitando que ele fique flutuando sobre as abas (ex.: "Paranormal").

   Este script SÓ move o elemento já existente no DOM (insertBefore) e
   alterna a classe .docked usada pelo CSS em css/auth.css. Não cria
   elemento novo, não duplica o botão, não toca em
   js/supabase-auth.js nem em nenhuma lógica de autenticação/logout —
   #account_bar continua sendo o mesmo elemento único, com os mesmos
   listeners e o mesmo controle de display:none/flex de sempre (feito
   por showAuthScreen()/hideAuthScreen() em js/supabase-auth.js, que
   não foi alterado).

   Em telas sem cabeçalho "ORIGEM DO CAOS" (ex.: tela de fichas,
   arquivos secretos), #account_bar volta a se comportar como antes:
   botão fixo no canto da tela.
   ========================================================== */
(function () {
  "use strict";

  var CHECK_MS = 250;

  function getVisibleTopbarTabs(screenId) {
    var screen = document.getElementById(screenId);
    if (!screen || screen.style.display === "none") return null;
    var topbar = screen.querySelector(".topbar");
    if (!topbar) return null;
    return topbar.querySelector(".tabs");
  }

  function findActiveTabsHost() {
    return getVisibleTopbarTabs("app_screen") || getVisibleTopbarTabs("creature_sheet_screen");
  }

  function sync() {
    var accountBar = document.getElementById("account_bar");
    if (!accountBar) return;
    var tabsHost = findActiveTabsHost();

    if (tabsHost) {
      if (accountBar.parentNode !== tabsHost.parentNode || accountBar.nextElementSibling !== tabsHost) {
        tabsHost.parentNode.insertBefore(accountBar, tabsHost);
      }
      accountBar.classList.add("docked");
    } else if (accountBar.classList.contains("docked")) {
      document.body.appendChild(accountBar);
      accountBar.classList.remove("docked");
    }
  }

  function init() {
    sync();
    setInterval(sync, CHECK_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
