/* ==========================================================
   C.R.I.S. — MENSAGENS DE ERRO AMIGÁVEIS (ETAPA — ERROS/AVISOS)
   ==========================================================
   Arquivo isolado e pequeno, com uma única responsabilidade:
   transformar um erro técnico (PostgrestError do Supabase, erro de
   rede, exceção JS genérica) em uma frase curta e humana, SEM nunca
   expor ao usuário stack trace, código SQL, nomes de tabela/coluna/
   função ou a mensagem crua da exceção.

   Não substitui console.error (que continua registrando o erro
   real para diagnóstico) nem os sistemas de exibição já existentes
   (flashIndicator, áreas de erro inline como #camp_*_erro) — só
   fornece o TEXTO que essas telas devem mostrar.

   Não cria um mecanismo novo de notificação; é reutilizado pelas
   telas de Campanhas (js/campanhas.js) e da Ficha de Terceiro
   (js/campaign-agent-view.js), que antes concatenavam e.message
   diretamente no texto exibido ao usuário.
   ========================================================== */
(function () {
  "use strict";

  // classifyKind(e): melhor esforço para reconhecer a NATUREZA do erro
  // (não o texto técnico em si), o suficiente para escolher uma frase
  // amigável apropriada.
  function classifyKind(e) {
    if (!e) return "unknown";
    const code = e.code || (e.originalError && e.originalError.code) || null;
    const status = e.status || (e.originalError && e.originalError.status) || null;
    const msg = String((e && e.message) || "").toLowerCase();

    // Falha de rede/conexão (fetch falhou antes de chegar ao servidor).
    if (
      msg.indexOf("failed to fetch") !== -1 ||
      msg.indexOf("network") !== -1 ||
      msg.indexOf("load failed") !== -1 ||
      e.name === "TypeError" && msg.indexOf("fetch") !== -1
    ) {
      return "network";
    }

    // Sessão expirada / não autenticado.
    if (status === 401 || code === "PGRST301" || msg.indexOf("jwt") !== -1) {
      return "session";
    }

    // Permissão negada (RLS).
    if (status === 403 || code === "42501") {
      return "permission";
    }

    // Registro duplicado (índice/constraint único).
    if (code === "23505") {
      return "duplicate";
    }

    // Registro não encontrado.
    if (code === "PGRST116" || status === 404) {
      return "not_found";
    }

    return "generic";
  }

  // friendlyMessage(e, fallback): retorna a frase amigável final.
  // "fallback" é um texto específico da AÇÃO que estava sendo feita
  // (ex.: "Não foi possível salvar a campanha."), usado para os casos
  // "generic"/"network"/"unknown" — ou seja, o chamador ainda escolhe
  // O QUE estava sendo feito, este helper só decide COMO falar sobre
  // o erro em si, sem nunca repetir o texto técnico da exceção.
  function friendlyMessage(e, fallback) {
    const kind = classifyKind(e);
    const base = fallback || "Não foi possível concluir esta ação.";
    switch (kind) {
      case "network":
        return base + " Verifique sua conexão com a internet e tente novamente.";
      case "session":
        return "Sua sessão terminou. Faça login novamente.";
      case "permission":
        return "Você não tem permissão para realizar esta ação.";
      case "duplicate":
        return "Este registro já existe.";
      case "not_found":
        return "Este item não foi encontrado (pode ter sido removido).";
      default:
        return base + " Tente novamente.";
    }
  }

  window.CRISFriendlyError = friendlyMessage;
})();
