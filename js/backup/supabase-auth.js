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
  const SUPABASE_URL = "https://zyvtkwqquoiasvbmyqww.supabase.co/rest/v1/";
  const SUPABASE_PUBLISHABLE_KEY = "COLOQUE_AQUI_A_SUPABASE_PUBLISHABLE_KEY";

  const isPlaceholder =
    !SUPABASE_URL ||
    !SUPABASE_PUBLISHABLE_KEY ||
    SUPABASE_URL.indexOf("COLOQUE_AQUI") === 0 ||
    SUPABASE_PUBLISHABLE_KEY.indexOf("sb_publishable_QwXfOgSnSXHdLgkEyfutpQ_Y_TTBtjp") === 0;

  const libLoaded = typeof window.supabase !== "undefined" && typeof window.supabase.createClient === "function";

  let client = null;
  let configError = null;

  if (!libLoaded) {
    configError = "Não foi possível carregar a biblioteca do Supabase (verifique sua conexão com a internet).";
  } else if (isPlaceholder) {
    configError = "Supabase ainda não configurado. Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY em js/supabase-auth.js.";
  } else {
    try {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    } catch (e) {
      configError = "Não foi possível iniciar o Supabase. Verifique SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY.";
    }
  }

  /* ============================================================
     2) HELPERS DE UI
     ============================================================ */
  function $(id) { return document.getElementById(id); }

  function showAuthScreen() {
    const loading = $("loading_screen");
    const welcome = $("welcome_screen");
    const app = $("app_screen");
    const auth = $("auth_screen");
    const logoutBtn = $("btn_logout");
    if (loading) loading.style.display = "none";
    if (welcome) welcome.style.display = "none";
    if (app) app.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (auth) auth.style.display = "block";
  }

  function hideAuthScreen() {
    const auth = $("auth_screen");
    const logoutBtn = $("btn_logout");
    if (auth) auth.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "block";
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
     3) MENSAGENS DE ERRO EM PT-BR
     ============================================================ */
  function friendlyError(err) {
    const raw = (err && (err.message || err.error_description || String(err))) || "";
    const m = raw.toLowerCase();

    if (m.indexOf("invalid login credentials") !== -1) return "Email ou senha incorretos.";
    if (m.indexOf("email not confirmed") !== -1) return "Você ainda não confirmou seu email. Verifique sua caixa de entrada.";
    if (m.indexOf("user already registered") !== -1 || m.indexOf("already registered") !== -1) return "Este email já está cadastrado.";
    if (m.indexOf("password should be at least") !== -1 || m.indexOf("at least 6 characters") !== -1) return "A senha deve ter pelo menos 6 caracteres.";
    if (m.indexOf("unable to validate email") !== -1 || m.indexOf("invalid email") !== -1) return "Email inválido.";
    if (m.indexOf("rate limit") !== -1) return "Muitas tentativas em pouco tempo. Aguarde um momento e tente novamente.";
    if (m.indexOf("failed to fetch") !== -1 || m.indexOf("networkerror") !== -1 || m.indexOf("network request failed") !== -1) {
      return "Erro de conexão. Verifique sua internet e tente novamente.";
    }
    if (m.indexOf("session") !== -1 && m.indexOf("expired") !== -1) return "Sua sessão expirou. Faça login novamente.";
    if (!raw) return "Não foi possível concluir a operação. Tente novamente.";
    return "Não foi possível concluir a operação. Tente novamente.";
  }

  /* ============================================================
     4) AÇÕES DE AUTENTICAÇÃO
     ============================================================ */
  async function doLogin(email, password) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function doSignup(email, password) {
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.href.split("#")[0] }
    });
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
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.href.split("#")[0]
    });
    if (error) throw error;
  }

  async function doUpdatePassword(newPassword) {
    const { data, error } = await client.auth.updateUser({ password: newPassword });
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

  function enterApp() {
    hideAuthScreen();
    appStartedOnce = true;
    if (typeof window.crisStartAppIfNeeded === "function") {
      window.crisStartAppIfNeeded();
    } else {
      // Segurança: se por algum motivo a função ainda não existir quando o
      // evento de sessão chega, tenta de novo logo em seguida em vez de
      // travar silenciosamente o usuário autenticado numa tela em branco.
      setTimeout(() => {
        if (typeof window.crisStartAppIfNeeded === "function") window.crisStartAppIfNeeded();
      }, 250);
    }
  }

  function leaveApp() {
    appStartedOnce = false;
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
        const btn = $("auth_signup_submit");
        setMsg("");
        if (password.length < 6) { setMsg("A senha deve ter pelo menos 6 caracteres.", "error"); return; }
        if (password !== password2) { setMsg("As senhas não coincidem.", "error"); return; }
        setLoading(btn, true);
        try {
          const data = await doSignup(email, password);
          if (data && data.session) {
            // Projeto sem confirmação de email obrigatória: já entra direto.
          } else {
            setMsg("Conta criada. Verifique seu email para confirmar sua conta.", "success");
            signupForm.reset();
            setTimeout(() => showPanel("login"), 2500);
          }
        } catch (err) {
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
          setTimeout(() => enterApp(), 1200);
        } catch (err) {
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
     ============================================================ */
  function init() {
    wireForms();
    showPanel("login");

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
        enterApp();
      } else if (event === "SIGNED_OUT" || appStartedOnce) {
        leaveApp();
      }
    });

    client.auth.getSession().then(({ data }) => {
      if (recoveryInProgress) return;
      if (data && data.session) {
        enterApp();
      } else {
        showAuthScreen();
      }
    }).catch(() => {
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
