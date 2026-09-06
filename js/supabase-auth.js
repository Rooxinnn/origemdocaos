/* ==========================================================
   C.R.I.S. — AUTENTICAÇÃO (Supabase Auth) — ETAPA 1
   ==========================================================
   Arquivo isolado. Responsável SOMENTE por:
     - login / cadastro / recuperação de senha / logout;
     - verificar se existe sessão válida ao abrir a página;
     - bloquear o uso do app enquanto não houver sessão.

   NÃO mexe em storageGet/storageSet/storageListKeys/storageDeleteKey,
   nem em nenhuma ficha, inventário, compêndio, paranormal, dados,
   backups etc. A persistência dos dados do C.R.I.S. continua exatamente
   como estava — a integração com o banco (public.agents) será feita
   numa Etapa 2 separada.

   Este arquivo assume que o index.html expõe:
     - a marcação de #auth_screen (login/cadastro/recuperar/nova senha)
     - o botão #btn_logout
     - a função global window.crisStartAppIfNeeded(), que dispara a
       inicialização já existente do C.R.I.S. (definida no <script>
       principal do index.html) — sem duplicar essa lógica aqui.
   ========================================================== */

(function () {
  "use strict";

  /* ============================================================
     1) CREDENCIAIS
     ------------------------------------------------------------
     Preencha com os dados do projeto Supabase (Project Settings →
     API). Use a "Project URL" e a "Publishable key" (chave pública,
     anon/publishable) — NUNCA a "service role key" (secreta) aqui.

     Enquanto os valores abaixo forem os placeholders, a tela de
     autenticação mostrará um aviso claro em vez de tentar conectar.
     ============================================================ */
  const SUPABASE_URL = "https://zyvtkwqquoiasvbmyqww.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_QwXfOgSnSXHdLgkEyfutpQ_Y_TTBtjp";

  const isPlaceholder =
    !SUPABASE_URL ||
    !SUPABASE_PUBLISHABLE_KEY ||
    SUPABASE_URL.indexOf("COLOQUE_AQUI") === 0 ||
    SUPABASE_PUBLISHABLE_KEY.indexOf("COLOQUE_AQUI") === 0;

  const libLoaded = typeof window.supabase !== "undefined" && typeof window.supabase.createClient === "function";

  let client = null;
  let configError = null;

  if (!libLoaded) {
    configError = "Não foi possível carregar a biblioteca do Supabase (verifique sua conexão com a internet).";
  } else if (isPlaceholder) {
    configError = "Supabase ainda não configurado. Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY em js/supabase-auth.js.";
  } else if (SUPABASE_URL.indexOf("https://") !== 0) {
    // Checagem simples de formato — evita erros de fetch confusos mais
    // adiante quando a URL está sem o protocolo ou colada errada.
    configError = "SUPABASE_URL parece inválida (precisa começar com \"https://\"). Verifique js/supabase-auth.js.";
  } else {
    try {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          // CORREÇÃO DE BUG ("tela de carregamento infinita até dar F5"):
          // por padrão, o supabase-js serializa TODAS as chamadas de auth
          // (login, getSession, refresh...) usando a Web Locks API do
          // navegador (navigator.locks). Esse lock pode ficar "travado"
          // (zumbi) depois de um refresh interrompido, aba em segundo
          // plano, etc. — é um problema conhecido do próprio SDK. Quando
          // isso acontece, TODA chamada de auth (inclusive o login) fica
          // pendurada para sempre esperando o lock, e a promise de
          // signInWithPassword() nunca resolve nem rejeita — por isso
          // nenhum try/catch pega, e a tela de carregamento nunca some.
          // Um F5 "resolve" só porque descarta o contexto que segurava o
          // lock zumbi. Como este app é de usuário único (sem necessidade
          // real de sincronizar múltiplas abas), substituímos o lock por
          // uma implementação vazia: cada chamada roda direto, sem nunca
          // esperar um lock do navegador que pode nunca ser liberado.
          lock: async (name, acquireTimeout, fn) => fn(),
        },
      });
    } catch (e) {
      console.error("[C.R.I.S. Auth] createClient", e);
      configError = "Não foi possível iniciar o Supabase. Verifique SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY.";
    }
  }

  /* ============================================================
     2) HELPERS DE UI
     ============================================================ */
  function $(id) { return document.getElementById(id); }

  // ETAPA 1.1 — CORREÇÃO DE BUG (causa do "quadro pequeno no canto da tela"):
  // antes, showAuthScreen() fazia auth.style.display = "block" via JS. Um
  // estilo inline tem prioridade sobre a regra CSS "#auth_screen.is-visible
  // {display:flex}" definida em css/auth.css, então a centralização em tela
  // cheia (flex) nunca era aplicada — sobrava um box block, sem margin:auto,
  // colado no topo-esquerda. A correção é nunca escrever "display" inline
  // aqui: só alternar a classe .is-visible, deixando o CSS decidir o valor
  // correto (flex). Mesmo padrão que #loading_screen já usava.
  function showAuthScreen() {
    const loading = $("loading_screen");
    const welcome = $("welcome_screen");
    const app = $("app_screen");
    const auth = $("auth_screen");
    const accountBar = $("account_bar");
    if (loading) loading.style.display = "none";
    if (welcome) welcome.style.display = "none";
    if (app) app.style.display = "none";
    if (accountBar) accountBar.style.display = "none";
    if (auth) auth.classList.add("is-visible");

    // FASE C, item 5 — integração mínima com js/campanhas.js: só lê se
    // existe um convite pendente (sessionStorage) para mostrar um aviso
    // genérico. Não busca nome de campanha/Mestre aqui (isso exige
    // usuário autenticado — ver get_campaign_invite_info na migration
    // 0003) e não altera nada da lógica de login em si.
    const inviteBanner = $("auth_invite_banner");
    if (inviteBanner) {
      const hasPending = typeof window.CRISCampaigns !== "undefined" &&
        typeof window.CRISCampaigns.hasPendingInvite === "function" &&
        window.CRISCampaigns.hasPendingInvite();
      inviteBanner.style.display = hasPending ? "block" : "none";
    }
  }

  function hideAuthScreen() {
    const auth = $("auth_screen");
    const accountBar = $("account_bar");
    if (auth) auth.classList.remove("is-visible");
    if (accountBar) accountBar.style.display = "flex";
  }

  // ETAPA 1.1 — CORREÇÃO DE BUG ("tela preta pós-login"): hideAuthScreen()
  // esconde #auth_screen imediatamente, mas crisStartAppIfNeeded() (que
  // decide quando mostrar #welcome_screen/#app_screen) é assíncrona — entre
  // uma coisa e outra não sobrava NENHUMA tela visível, só o fundo escuro
  // do <body>. #loading_screen já existe e já é escondida sozinha ao final
  // de crisStartAppIfNeeded() (ver index.html); bastava reexibi-la aqui no
  // início da transição para cobrir esse intervalo, sem tocar em nada da
  // inicialização do app em si.
  function showLoadingScreen() {
    const loading = $("loading_screen");
    if (loading) loading.style.display = "flex";
  }

  function setMsg(text, kind) {
    const el = $("auth_msg");
    if (!el) return;
    if (!text) {
      el.className = "auth-msg";
      el.textContent = "";
      return;
    }
    el.textContent = text;
    el.className = "auth-msg show " + (kind || "info");
  }

  function setSwitchHint(html) {
    const el = $("auth_switch_hint");
    if (el) el.innerHTML = html || "";
  }

  function showPanel(name) {
    document.querySelectorAll(".auth-panel").forEach((p) => p.classList.remove("active"));
    document.querySelectorAll(".auth-tab-btn").forEach((b) => b.classList.remove("active"));
    const panel = document.querySelector('.auth-panel[data-auth-panel="' + name + '"]');
    if (panel) panel.classList.add("active");
    const tabBtn = document.querySelector('.auth-tab-btn[data-auth-tab="' + name + '"]');
    if (tabBtn) tabBtn.classList.add("active");
    setMsg("");
    if (name === "recover") {
      setSwitchHint("Você receberá um email com um link para redefinir sua senha.");
    } else if (name === "newpassword") {
      setSwitchHint("Defina uma nova senha para continuar.");
    } else {
      setSwitchHint("");
    }
  }

  function setLoading(btn, isLoading, labelWhenIdle) {
    if (!btn) return;
    btn.disabled = isLoading;
    btn.textContent = isLoading ? "Aguarde…" : labelWhenIdle;
  }

  /* ============================================================
     3) MENSAGENS DE ERRO EM PT-BR + DIAGNÓSTICO
     ------------------------------------------------------------
     ETAPA 1.1 — antes, qualquer erro não reconhecido virava sempre
     "Não foi possível concluir a operação. Tente novamente.", sem
     nada no console — impossível diagnosticar. Duas mudanças:
       1) logAuthError() sempre manda o erro real pro console (sem
          senha/chaves), pra quem estiver desenvolvendo conseguir ver
          a causa de verdade em qualquer situação;
       2) friendlyError() ganhou mais casos conhecidos do Supabase, e
          quando NENHUM caso bate, mostra a mensagem técnica original
          (sanitizada) para o usuário, em vez de esconder atrás de um
          texto genérico — isso é o que estava mascarando a causa real
          do erro de cadastro relatado.
     ============================================================ */
  function logAuthError(context, err) {
    // Nunca loga senha (nem os campos de senha são lidos aqui — só err).
    // err de erros do Supabase (AuthError) não contém a senha do usuário.
    console.error("[C.R.I.S. Auth] " + context, err);
  }

  function friendlyError(err) {
    const raw = (err && (err.message || err.error_description || String(err))) || "";
    const m = raw.toLowerCase();

    if (m.indexOf("invalid login credentials") !== -1) return "Email ou senha incorretos.";
    if (m.indexOf("email not confirmed") !== -1) return "Você ainda não confirmou seu email. Verifique sua caixa de entrada.";
    if (m.indexOf("user already registered") !== -1 || m.indexOf("already registered") !== -1) return "Este email já está cadastrado.";
    if (m.indexOf("password should be at least") !== -1 || m.indexOf("at least 6 characters") !== -1) return "A senha deve ter pelo menos 6 caracteres.";
    if (m.indexOf("password is too short") !== -1) return "A senha é muito curta.";
    if (m.indexOf("unable to validate email") !== -1 || m.indexOf("invalid email") !== -1 || (m.indexOf("email address") !== -1 && m.indexOf("invalid") !== -1)) return "Email inválido.";
    if (m.indexOf("rate limit") !== -1 || m.indexOf("too many requests") !== -1) return "Muitas tentativas em pouco tempo. Aguarde um momento e tente novamente.";
    if (m.indexOf("failed to fetch") !== -1 || m.indexOf("networkerror") !== -1 || m.indexOf("network request failed") !== -1 || m.indexOf("load failed") !== -1) {
      return "Erro de conexão. Verifique sua internet e tente novamente.";
    }
    if (m.indexOf("session") !== -1 && m.indexOf("expired") !== -1) return "Sua sessão expirou. Faça login novamente.";
    if (m.indexOf("signups not allowed") !== -1 || m.indexOf("signup is disabled") !== -1 || m.indexOf("email logins are disabled") !== -1) {
      return "Cadastro/login por email está desativado nas configurações deste projeto Supabase.";
    }
    if (m.indexOf("invalid api key") !== -1 || m.indexOf("invalid apikey") !== -1 || m.indexOf("no api key") !== -1) {
      return "Configuração do Supabase inválida (chave incorreta). Verifique SUPABASE_PUBLISHABLE_KEY em js/supabase-auth.js.";
    }
    if (m.indexOf("project not found") !== -1 || m.indexOf("could not resolve host") !== -1 || m.indexOf("err_name_not_resolved") !== -1) {
      return "Não foi possível encontrar o projeto Supabase. Verifique SUPABASE_URL em js/supabase-auth.js.";
    }
    if (m.indexOf("database error saving new user") !== -1 || m.indexOf("database error") !== -1) {
      return "Erro ao salvar o novo usuário no banco de dados do Supabase (fora do C.R.I.S. — verifique triggers/policies do projeto).";
    }
    if (m.indexOf("redirect") !== -1 && (m.indexOf("not allowed") !== -1 || m.indexOf("invalid") !== -1)) {
      return "A URL usada para retorno do email (" + window.location.origin + ") não está na lista de URLs permitidas do projeto Supabase (Authentication → URL Configuration).";
    }
    if (m.indexOf("user not found") !== -1) return "Não existe conta cadastrada com este email.";
    if (m.indexOf("same password") !== -1 || m.indexOf("different from the old") !== -1) return "A nova senha precisa ser diferente da senha atual.";

    // Nenhum padrão conhecido: mostra a mensagem técnica original (em vez de
    // um texto genérico que esconderia a causa real) para permitir diagnóstico.
    if (raw) return "Não foi possível concluir a operação (" + raw + "). Veja o console para mais detalhes.";
    return "Não foi possível concluir a operação. Tente novamente. Veja o console para mais detalhes.";
  }

  /* ============================================================
     4) AÇÕES DE AUTENTICAÇÃO
     ============================================================ */
  // Rede de segurança extra: mesmo com o lock desabilitado acima, qualquer
  // chamada de rede pode em tese nunca resolver nem rejeitar (conexão que
  // trava, aba em segundo plano, etc.). withTimeout() garante que o usuário
  // NUNCA fique preso indefinidamente num botão "Aguarde…": depois de 15s
  // sem resposta, a operação é tratada como erro (mensagem clara, sem
  // precisar de F5), em vez de travar para sempre.
  function withTimeout(promise, ms, timeoutMessage) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async function doLogin(email, password) {
    const { data, error } = await withTimeout(
      client.auth.signInWithPassword({ email, password }),
      15000,
      "Tempo de espera esgotado ao tentar fazer login. Verifique sua internet e tente novamente."
    );
    if (error) throw error;
    return data;
  }

  async function doSignup(email, password, nickname) {
    const { data, error } = await withTimeout(
      client.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.href.split("#")[0],
          // NICKNAME (item 1): vai em user_metadata só para o trigger
          // on_auth_user_created_profile (migration 0008) conseguir
          // gravar public.profiles.nickname já na criação da conta —
          // nenhum outro dado novo é enviado aqui.
          data: nickname ? { nickname: nickname } : undefined,
        }
      }),
      15000,
      "Tempo de espera esgotado ao criar a conta. Verifique sua internet e tente novamente."
    );
    if (error) throw error;
    // Particularidade do Supabase: com confirmação de email obrigatória, se o
    // email já existir a chamada pode "suceder" sem erro, mas devolvendo um
    // usuário sem identidades novas. Tratamos isso como email já cadastrado.
    if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      const e = new Error("User already registered");
      throw e;
    }
    return data;
  }

  async function doRecover(email) {
    const { error } = await withTimeout(
      client.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.href.split("#")[0]
      }),
      15000,
      "Tempo de espera esgotado ao enviar o email de recuperação. Verifique sua internet e tente novamente."
    );
    if (error) throw error;
  }

  async function doUpdatePassword(newPassword) {
    const { data, error } = await withTimeout(
      client.auth.updateUser({ password: newPassword }),
      15000,
      "Tempo de espera esgotado ao salvar a nova senha. Verifique sua internet e tente novamente."
    );
    if (error) throw error;
    return data;
  }

  async function doLogout() {
    try { await client.auth.signOut(); } catch (e) { /* segue o fluxo mesmo se falhar */ }
  }

  /* ============================================================
     5) LIGAÇÃO COM O RESTANTE DO APP
     ------------------------------------------------------------
     Só chama crisStartAppIfNeeded() (definida no index.html) quando
     existe sessão válida. Nunca mexe em storage/fichas diretamente.
     ============================================================ */
  let appStartedOnce = false;

  // ETAPA 1.1 — CONTA LOGADA: só lê user.user_metadata (nome, quando o
  // usuário tiver algum cadastrado) e user.email — nada é armazenado, nada
  // cria um sistema de usuários novo. Se não houver nome, mostra somente o
  // email (o elemento #account_name fica oculto).
  function updateAccountInfo(user) {
    const nameEl = $("account_name");
    const emailEl = $("account_email");
    if (!user) return;
    const meta = user.user_metadata || {};
    const rawName = meta.full_name || meta.name || meta.nome || "";
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (nameEl) {
      if (name) {
        nameEl.textContent = name;
        nameEl.style.display = "block";
      } else {
        nameEl.textContent = "";
        nameEl.style.display = "none";
      }
    }
    if (emailEl) emailEl.textContent = user.email || "";
  }

  function clearAccountInfo() {
    const nameEl = $("account_name");
    const emailEl = $("account_email");
    if (nameEl) { nameEl.textContent = ""; nameEl.style.display = "none"; }
    if (emailEl) emailEl.textContent = "";
  }

  function enterApp(user) {
    // ETAPA 1.1 — DIAGNÓSTICO TEMPORÁRIO: confirma que enterApp() está
    // sendo chamada e se crisStartAppIfNeeded já existe neste momento.
    console.log("[C.R.I.S. Auth DIAG] enterApp() chamada. crisStartAppIfNeeded existe?", typeof window.crisStartAppIfNeeded);
    hideAuthScreen();
    updateAccountInfo(user);

    // CORREÇÃO DE BUG ("volta a travar ao trocar de aba e voltar"): o
    // Supabase revalida/renova a sessão sozinho quando a aba volta a ficar
    // visível (autoRefreshToken), o que dispara onAuthStateChange de novo
    // com uma sessão válida — e isso chamava enterApp() outra vez mesmo com
    // o app já rodando. Isso reexibia a tela de carregamento, mas
    // crisStartAppIfNeeded() já tem a trava __crisAppStarted e retornava
    // imediatamente sem nunca chegar no "finally" que esconde a tela — ou
    // seja, o loading ficava preso pra sempre. Se o app já foi iniciado,
    // esse evento é só um refresh de sessão em segundo plano: atualiza o
    // cartão de conta (já feito acima) e não toca mais na UI.
    if (appStartedOnce) return;

    appStartedOnce = true;
    // Mantém a tela de carregamento visível durante a inicialização
    // assíncrona do app (ver showLoadingScreen acima) — ela mesma já se
    // esconde sozinha ao final de crisStartAppIfNeeded(), em index.html.
    showLoadingScreen();

    // REDE DE SEGURANÇA ("não podemos só ignorar essa tela e entrar
    // direto?"): em vez de depender 100% de crisStartAppIfNeeded() para
    // esconder a tela de carregamento — o que trava o usuário para sempre
    // se qualquer coisa lá dentro travar por um motivo ainda não
    // identificado —, depois de alguns segundos a tela é liberada de
    // qualquer jeito e o usuário entra no app. A inicialização continua
    // rodando por trás; se ela terminar depois, só atualiza a tela
    // normalmente (nada é cancelado, só paramos de ESPERAR por ela).
    const forceProceedTimer = setTimeout(() => {
      console.warn("[C.R.I.S. Auth] Inicialização demorou mais que o esperado — liberando a tela mesmo assim.");
      const loading = $("loading_screen");
      if (loading) loading.style.display = "none";
      if (typeof window.showWelcomeScreen === "function") window.showWelcomeScreen();
    }, 6000);

    function startAppNow() {
      if (typeof window.crisStartAppIfNeeded !== "function") {
        // Segurança: se por algum motivo a função ainda não existir quando
        // o evento de sessão chega, tenta de novo logo em seguida em vez
        // de travar silenciosamente o usuário autenticado numa tela em
        // branco.
        setTimeout(startAppNow, 250);
        return;
      }
      Promise.resolve(window.crisStartAppIfNeeded())
        .catch((e) => console.error("[C.R.I.S. Auth] Erro em crisStartAppIfNeeded:", e))
        .finally(() => clearTimeout(forceProceedTimer))
        .then(() => {
          // FASE C, item 6 — integração mínima: só dispara a checagem de
          // convite pendente (js/campanhas.js decide sozinho o que fazer;
          // se não houver token em sessionStorage, é um no-op). Não mexe
          // em mais nada do fluxo de login/sessão.
          if (typeof window.CRISCampaigns !== "undefined" &&
              typeof window.CRISCampaigns.checkPendingInvite === "function") {
            window.CRISCampaigns.checkPendingInvite();
          }
        });
    }
    startAppNow();
  }

  function leaveApp() {
    appStartedOnce = false;
    // Zera a trava interna de crisStartAppIfNeeded() também — sem isso, um
    // novo login nesta mesma aba encontraria a trava ainda ligada da vez
    // anterior e nunca rodaria a inicialização de novo (ver comentário em
    // window.crisResetAppState, no index.html).
    if (typeof window.crisResetAppState === "function") window.crisResetAppState();
    // CONVITE GLOBAL — evita que o token/popup de convite de uma conta
    // "vaze" para a próxima conta que logar neste mesmo navegador
    // (sessionStorage não é limpo automaticamente pelo signOut).
    if (typeof window.CRISCampaigns !== "undefined" &&
        typeof window.CRISCampaigns.clearPendingInviteState === "function") {
      window.CRISCampaigns.clearPendingInviteState();
    }
    clearAccountInfo();
    showAuthScreen();
    showPanel("login");
  }

  /* ============================================================
     6) WIRING DOS FORMULÁRIOS
     ============================================================ */
  function wireForms() {
    document.querySelectorAll(".auth-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => showPanel(btn.dataset.authTab));
    });

    const loginForm = $("auth_panel_login");
    if (loginForm) {
      loginForm.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        if (configError) { setMsg(configError, "error"); return; }
        const email = $("auth_login_email").value.trim();
        const password = $("auth_login_password").value;
        const btn = $("auth_login_submit");
        setMsg("");
        setLoading(btn, true);
        try {
          await doLogin(email, password);
          // enterApp() é chamado pelo listener de onAuthStateChange (SIGNED_IN)
        } catch (err) {
          logAuthError("login", err);
          setMsg(friendlyError(err), "error");
        } finally {
          setLoading(btn, false, "Entrar");
        }
      });
    }

    const signupForm = $("auth_panel_signup");
    if (signupForm) {
      signupForm.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        if (configError) { setMsg(configError, "error"); return; }
        const email = $("auth_signup_email").value.trim();
        const password = $("auth_signup_password").value;
        const password2 = $("auth_signup_password2").value;
        // NICKNAME (item 1) — campo novo no formulário de cadastro
        // (ver index.html). Se o elemento não existir por algum motivo,
        // segue sem nickname em vez de quebrar o cadastro.
        const nicknameEl = $("auth_signup_nickname");
        const nickname = nicknameEl ? nicknameEl.value.trim() : "";
        const btn = $("auth_signup_submit");
        setMsg("");
        if (nicknameEl && !nickname) { setMsg("Escolha um nickname.", "error"); return; }
        if (password.length < 6) { setMsg("A senha deve ter pelo menos 6 caracteres.", "error"); return; }
        if (password !== password2) { setMsg("As senhas não coincidem.", "error"); return; }
        setLoading(btn, true);
        try {
          const data = await doSignup(email, password, nickname);
          if (data && data.session) {
            // Projeto sem confirmação de email obrigatória: já entra direto.
          } else {
            setMsg("Conta criada. Verifique seu email para confirmar sua conta.", "success");
            signupForm.reset();
            setTimeout(() => showPanel("login"), 2500);
          }
        } catch (err) {
          logAuthError("signup", err);
          setMsg(friendlyError(err), "error");
        } finally {
          setLoading(btn, false, "Criar conta");
        }
      });
    }

    const recoverForm = $("auth_panel_recover");
    if (recoverForm) {
      recoverForm.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        if (configError) { setMsg(configError, "error"); return; }
        const email = $("auth_recover_email").value.trim();
        const btn = $("auth_recover_submit");
        setMsg("");
        setLoading(btn, true);
        try {
          await doRecover(email);
          setMsg("Email de recuperação enviado. Verifique sua caixa de entrada.", "success");
        } catch (err) {
          logAuthError("recover", err);
          setMsg(friendlyError(err), "error");
        } finally {
          setLoading(btn, false, "Enviar recuperação");
        }
      });
    }

    const newPasswordForm = $("auth_panel_newpassword");
    if (newPasswordForm) {
      newPasswordForm.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        if (configError) { setMsg(configError, "error"); return; }
        const p1 = $("auth_newpassword_1").value;
        const p2 = $("auth_newpassword_2").value;
        const btn = $("auth_newpassword_submit");
        setMsg("");
        if (p1.length < 6) { setMsg("A senha deve ter pelo menos 6 caracteres.", "error"); return; }
        if (p1 !== p2) { setMsg("As senhas não coincidem.", "error"); return; }
        setLoading(btn, true);
        try {
          await doUpdatePassword(p1);
          setMsg("Senha atualizada com sucesso.", "success");
          newPasswordForm.reset();
          setTimeout(async () => {
            // ETAPA 1.1: passa o usuário atual para enterApp() também aqui,
            // para que o cartão de conta (nome/email) já apareça correto
            // neste fluxo (antes ficava em branco até um logout/login).
            const { data } = await client.auth.getSession();
            enterApp(data && data.session ? data.session.user : undefined);
          }, 1200);
        } catch (err) {
          logAuthError("newpassword", err);
          setMsg(friendlyError(err), "error");
        } finally {
          setLoading(btn, false, "Salvar nova senha");
        }
      });
    }

    const logoutBtn = $("btn_logout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        logoutBtn.disabled = true;
        await doLogout();
        logoutBtn.disabled = false;
        // leaveApp() é chamado pelo listener de onAuthStateChange (SIGNED_OUT)
      });
    }
  }

  /* ============================================================
     7) SESSÃO / GATE DE ACESSO
     ------------------------------------------------------------
     ETAPA 1.1 — retorno do link de confirmação/recuperação de email:
     quando o link falha (token expirado/já usado, ou a URL de retorno
     não está na lista de "Redirect URLs" do painel do Supabase), o
     Supabase volta para este app com "error"/"error_description" no
     hash ou na query string, em vez de uma sessão — antes disso não
     era lido em nenhum lugar, então o usuário só via a tela de login
     normal, sem explicação nenhuma do que houve. Só LEMOS esses
     parâmetros para mostrar a mensagem (reaproveitando friendlyError())
     e limpamos a URL logo em seguida; nenhuma sessão/dado é alterado.
     ============================================================ */
  function readUrlAuthError() {
    function parse(str) {
      if (!str || str.length < 2) return null;
      const params = new URLSearchParams(str.slice(1));
      const desc = params.get("error_description") || params.get("error");
      return desc ? desc.replace(/\+/g, " ") : null;
    }
    return parse(window.location.hash) || parse(window.location.search);
  }

  function init() {
    wireForms();
    showPanel("login");

    const urlError = readUrlAuthError();
    if (urlError) {
      // Evita repetir a mesma mensagem de erro se o usuário recarregar a
      // página; não mexe em sessão nem em nenhum dado do app.
      history.replaceState(null, "", window.location.pathname);
    }

    if (configError) {
      // Sem client configurado: não há como verificar sessão. Mostra a tela
      // de auth com o aviso, em vez de deixar o app preso no loading.
      showAuthScreen();
      setMsg(configError, "error");
      return;
    }

    // PASSWORD_RECOVERY: o Supabase detecta sozinho o link de recuperação na
    // URL (detectSessionInUrl, ligado por padrão) e dispara este evento com
    // uma sessão temporária de recuperação — usamos só para trocar a senha,
    // não para liberar o app direto.
    let recoveryInProgress = false;

    client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        recoveryInProgress = true;
        showAuthScreen();
        showPanel("newpassword");
        return;
      }
      if (recoveryInProgress) return;

      if (session) {
        enterApp(session.user);
      } else if (event === "SIGNED_OUT" || appStartedOnce) {
        leaveApp();
      }
    });

    withTimeout(
      client.auth.getSession(),
      15000,
      "Tempo de espera esgotado ao verificar sessão. Verifique sua internet e tente novamente."
    ).then(({ data }) => {
      if (recoveryInProgress) return;
      if (data && data.session) {
        enterApp(data.session.user);
      } else {
        showAuthScreen();
        // ETAPA 1.1 — só chega aqui quando NÃO há sessão (ex.: link de
        // confirmação de email expirado/já usado, ou redirect_to fora da
        // lista de URLs permitidas no painel do Supabase). Antes disso, o
        // usuário só via a tela de login normal, sem nenhuma explicação.
        if (urlError) setMsg(friendlyError({ message: urlError }), "error");
      }
    }).catch((err) => {
      logAuthError("getSession", err);
      showAuthScreen();
      setMsg("Erro ao verificar sessão. Verifique sua internet e tente novamente.", "error");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Exposto apenas para depuração/testes manuais — não é usado por nenhum
  // outro módulo do C.R.I.S.
  window.CRISAuth = { get client() { return client; }, get configError() { return configError; } };
})();
