/* ==========================================================
   C.R.I.S. — PERFIL / NICKNAME
   ==========================================================
   Módulo isolado. Responsável SOMENTE por:
     - carregar public.profiles.nickname do usuário logado
       (migration 0008/0009 — tabela protegida por RLS: cada
       usuário só lê/edita a própria linha);
     - mostrar o nickname em #account_name (e, desde a ETAPA E-MAIL DA
       CONTA, também o e-mail somente-leitura em #account_email, que
       js/supabase-auth.js já preenche/esvazia sozinho), dentro do
       popover de conta já existente (#account_popover, criado em
       js/supabase-auth.js/index.html — não é recriado nem duplicado
       aqui);
     - acrescentar, dentro do MESMO popover, um campo para editar o
       nickname depois ("Configurações" da conta), sem criar uma
       tela nova.

   NÃO mexe em auth (login/cadastro/logout — isso continua 100% em
   js/supabase-auth.js), NÃO mexe em campanhas/convite (isso é
   js/campanhas.js), NÃO cria tabela nova (usa public.profiles já
   criada pela migration 0008).

   Como os outros add-ons deste projeto (js/character-image.js,
   js/combat-dice-auto.js, js/text-view-mode.js), este módulo NÃO
   altera js/supabase-auth.js para "avisar" quando um login
   acontece — em vez disso, observa #account_email (que
   supabase-auth.js já preenche/esvazia sozinho ao entrar/sair da
   conta) por leitura periódica (polling) e reage às mudanças.
   Isso mantém os dois arquivos totalmente desacoplados.
   ========================================================== */
(function () {
  "use strict";

  var POLL_INTERVAL_MS = 800;
  var lastSeenEmail = null; // "" quando deslogado, e-mail quando logado
  var currentNickname = null; // string | null (null = ainda sem nickname)
  var loadingForEmail = null; // evita duas cargas concorrentes p/ o mesmo login

  function $(id) { return document.getElementById(id); }

  function getClient() {
    if (typeof window.CRISAuth === "undefined") return null;
    if (window.CRISAuth.configError) return null;
    return window.CRISAuth.client || null;
  }

  /* ============================================================
     1) LEITURA/GRAVAÇÃO DO PERFIL
     ============================================================ */
  async function fetchNickname(client) {
    try {
      var res = await client.auth.getSession();
      var user = res && res.data && res.data.session ? res.data.session.user : null;
      if (!user) return null;
      var prof = await client.from("profiles").select("nickname").eq("user_id", user.id).maybeSingle();
      if (prof.error) {
        console.error("[C.R.I.S. Perfil] Falha ao ler nickname:", prof.error);
        return null;
      }
      return (prof.data && prof.data.nickname) || null;
    } catch (e) {
      console.error("[C.R.I.S. Perfil] Falha ao ler nickname:", e);
      return null;
    }
  }

  async function saveNickname(newNickname) {
    var client = getClient();
    if (!client) return { ok: false, message: "Sem conexão com o Supabase." };
    var trimmed = (newNickname || "").trim();
    if (!trimmed) return { ok: false, message: "O nickname não pode ficar vazio." };
    try {
      var res = await client.auth.getSession();
      var user = res && res.data && res.data.session ? res.data.session.user : null;
      if (!user) return { ok: false, message: "Sessão expirada. Faça login novamente." };
      var upsert = await client
        .from("profiles")
        .upsert({ user_id: user.id, nickname: trimmed }, { onConflict: "user_id" });
      if (upsert.error) {
        console.error("[C.R.I.S. Perfil] Falha ao salvar nickname:", upsert.error);
        return { ok: false, message: "Não foi possível salvar o nickname." };
      }
      currentNickname = trimmed;
      renderAccountUi();
      return { ok: true };
    } catch (e) {
      console.error("[C.R.I.S. Perfil] Falha ao salvar nickname:", e);
      return { ok: false, message: "Não foi possível salvar o nickname." };
    }
  }

  /* ============================================================
     2) UI — reaproveita #account_popover (js/supabase-auth.js /
     index.html), só acrescenta os elementos de nickname uma vez.
     ============================================================ */
  var nicknameUiBuilt = false;

  // ETAPA — E-MAIL DA CONTA: acrescenta rótulos "E-MAIL"/"NICKNAME"
  // dentro do #account_info já existente e reordena os elementos para
  // E-MAIL aparecer primeiro (mock aprovado), sem recriar #account_name/
  // #account_email (que continuam sendo os mesmos elementos que
  // js/supabase-auth.js já lê/escreve — só a POSIÇÃO deles no popover
  // muda, via DOM, sem tocar em supabase-auth.js).
  function buildAccountInfoLabels(info) {
    var accountLabel = $("account_label"); // título "Conta", já existente
    var nameEl = $("account_name");
    var emailEl = $("account_email");
    if (!nameEl || !emailEl) return;

    var emailLabel = $("account_email_label");
    if (!emailLabel) {
      emailLabel = document.createElement("div");
      emailLabel.id = "account_email_label";
      emailLabel.textContent = "E-mail";
      info.appendChild(emailLabel);
    }
    var nameLabel = $("account_name_label");
    if (!nameLabel) {
      nameLabel = document.createElement("div");
      nameLabel.id = "account_name_label";
      nameLabel.textContent = "Nickname";
      info.appendChild(nameLabel);
    }

    // Ordem final dentro de #account_info: Conta (título) → E-mail →
    // valor do e-mail → Nickname → valor do nickname. Reordena via DOM
    // (insertBefore move o próprio elemento, sem clonar/recriar nada
    // que js/supabase-auth.js ou este arquivo já controlam) — cada
    // elemento é encaixado logo depois do anterior, em sequência, para
    // funcionar não importa a ordem em que estivessem antes.
    function placeAfter(el, ref) {
      ref.parentNode.insertBefore(el, ref.nextSibling);
      return el;
    }
    var ref = accountLabel || info.firstChild;
    if (ref) {
      ref = placeAfter(emailLabel, ref);
      ref = placeAfter(emailEl, ref);
      ref = placeAfter(nameLabel, ref);
      placeAfter(nameEl, ref);
    }
  }

  function buildNicknameUi() {
    if (nicknameUiBuilt) return;
    var info = $("account_info");
    var popover = $("account_popover");
    var logoutBtn = $("btn_logout");
    if (!info || !popover || !logoutBtn) return; // DOM ainda não pronto
    nicknameUiBuilt = true;

    buildAccountInfoLabels(info);

    var wrap = document.createElement("div");
    wrap.id = "account_nickname_edit";
    wrap.style.marginTop = "10px";
    wrap.style.paddingTop = "10px";
    wrap.style.borderTop = "1px solid rgba(255,255,255,0.12)";

    var label = document.createElement("div");
    label.id = "account_nickname_label";
    label.textContent = "Nickname";
    label.style.fontSize = "0.75em";
    label.style.opacity = "0.7";
    label.style.marginBottom = "4px";
    wrap.appendChild(label);

    var row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "6px";

    var input = document.createElement("input");
    input.type = "text";
    input.id = "account_nickname_input";
    input.maxLength = 40;
    input.placeholder = "seu nickname";
    input.style.flex = "1 1 auto";
    input.style.minWidth = "0";
    row.appendChild(input);

    var saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.id = "account_nickname_save";
    saveBtn.textContent = "Salvar";
    row.appendChild(saveBtn);

    wrap.appendChild(row);

    var msg = document.createElement("div");
    msg.id = "account_nickname_msg";
    msg.style.fontSize = "0.75em";
    msg.style.marginTop = "4px";
    msg.style.minHeight = "1em";
    wrap.appendChild(msg);

    // Insere antes do botão Sair, dentro do mesmo popover — não cria
    // um segundo painel/tela.
    popover.insertBefore(wrap, logoutBtn);

    saveBtn.addEventListener("click", async function () {
      var val = input.value;
      saveBtn.disabled = true;
      var prevLabel = saveBtn.textContent;
      saveBtn.textContent = "Salvando…";
      msg.textContent = "";
      msg.style.color = "";
      var result = await saveNickname(val);
      saveBtn.disabled = false;
      saveBtn.textContent = prevLabel;
      if (result.ok) {
        msg.textContent = "Nickname atualizado.";
        msg.style.color = "#8fd18f";
      } else {
        msg.textContent = result.message || "Falha ao salvar.";
        msg.style.color = "#e08a8a";
      }
    });
  }

  function renderAccountUi() {
    var nameEl = $("account_name");
    var input = $("account_nickname_input");

    // ETAPA — E-MAIL DA CONTA: o e-mail deixou de ficar escondido — agora
    // aparece sempre (somente leitura) acima do nickname, com seu próprio
    // rótulo "E-mail" (ver buildAccountInfoLabels). #account_name continua
    // mostrando o nickname, com o mesmo fallback de sempre para o e-mail
    // enquanto nenhum nickname tiver sido definido (só para o campo nunca
    // ficar em branco) — comportamento do nickname 100% preservado.
    if (nameEl) {
      var label = currentNickname || lastSeenEmail || "";
      nameEl.textContent = label;
      nameEl.style.display = label ? "block" : "none";
    }
    if (input && document.activeElement !== input) {
      input.value = currentNickname || "";
    }
  }

  function clearAccountUi() {
    currentNickname = null;
    var input = $("account_nickname_input");
    var msg = $("account_nickname_msg");
    if (input) input.value = "";
    if (msg) msg.textContent = "";
  }

  /* ============================================================
     3) POLLING — detecta login/logout observando #account_email,
     do mesmo jeito que outros módulos deste projeto já fazem.
     ============================================================ */
  function poll() {
    buildNicknameUi();

    var emailEl = $("account_email");
    var email = emailEl ? (emailEl.textContent || "") : "";

    if (email === lastSeenEmail) return; // nada mudou

    var previousEmail = lastSeenEmail;
    lastSeenEmail = email;

    if (!email) {
      // Logout — item "logout/login entre contas sem vazamento de
      // nickname": zera tudo, nunca deixa o nickname da conta anterior
      // visível para a próxima conta que logar neste navegador.
      clearAccountUi();
      renderAccountUi();
      return;
    }

    if (email === loadingForEmail) return; // já carregando este login
    loadingForEmail = email;

    var client = getClient();
    if (!client) return;

    fetchNickname(client).then(function (nickname) {
      // Se o usuário já deslogou de novo enquanto a consulta corria,
      // não aplica um resultado desatualizado.
      if (lastSeenEmail !== email) return;
      currentNickname = nickname;
      loadingForEmail = null;
      renderAccountUi();
    });
  }

  setInterval(poll, POLL_INTERVAL_MS);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", poll);
  } else {
    poll();
  }

  // Exposto apenas para outros módulos que queiram mostrar o nickname
  // do próprio usuário (ex.: cabeçalho de campanha); não é obrigatório
  // — o roster/convite de campanha já resolve nickname no servidor
  // (get_campaign_roster / get_campaign_invite_info).
  window.CRISProfile = {
    getNickname: function () { return currentNickname; },
  };
})();
