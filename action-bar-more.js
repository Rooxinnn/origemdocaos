/* ==========================================================
   AJUSTE DE UI (visual apenas) — menu "Mais Opções" da barra de
   ações da ficha (#action-bar). Agrupa Exportar PDF/JSON, Importar
   JSON, Resetar Ficha e Opções da Ficha, que antes ficavam soltos
   lado a lado com os botões principais (Voltar/Salvar/Sincronizado).

   Este script SÓ abre/fecha visualmente o menu (adiciona/remove a
   classe .is-open nos elementos #action_bar_more_btn e
   #action_bar_more_menu). Não cria, remove nem substitui nenhum
   botão; não adiciona nem remove os listeners já existentes de
   #btn_pdf, #btn_export_json, #btn_import_json, #btn_reset e
   #btn_ficha_options — cada um continua funcionando exatamente como
   antes, através dos próprios listeners registrados em outros
   arquivos do projeto. Também não mexe em #input_import_json.
   ========================================================== */
(function () {
  "use strict";

  function init() {
    var wrap = document.getElementById("action_bar_more");
    var btn = document.getElementById("action_bar_more_btn");
    var menu = document.getElementById("action_bar_more_menu");
    if (!wrap || !btn || !menu) return;

    function closeMenu() {
      menu.classList.remove("is-open");
      btn.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
    }
    function openMenu() {
      menu.classList.add("is-open");
      btn.classList.add("is-open");
      btn.setAttribute("aria-expanded", "true");
    }

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (menu.classList.contains("is-open")) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    // Fecha o menu ao clicar fora dele.
    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) closeMenu();
    });

    // Fecha o menu depois de qualquer clique num botão dentro dele (ex.:
    // "Exportar PDF"), sem interferir no clique original — o listener já
    // registrado de cada botão continua disparando normalmente antes
    // deste fechamento (o fechamento é só uma reação visual ao mesmo
    // evento, na fase de propagação).
    menu.addEventListener("click", function (e) {
      var target = e.target;
      if (target && target.tagName === "BUTTON") closeMenu();
    });

    // Fecha com Esc, por acessibilidade.
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
