/* ==========================================================
   C.R.I.S. — SISTEMA DE CAMPANHAS — FASE B (Área + Criação)
   ==========================================================
   Arquivo isolado. Responsável SOMENTE por:
     - renderizar a aba "Campanhas" (lista "Minhas Campanhas" +
       botão "Criar Campanha");
     - criar uma nova campanha (public.campaigns) e mostrar a tela
       de link de convite.

   NÃO mexe em storageGet/storageSet/sync-queue/fichas/criaturas/
   inventário/paranormal. NÃO cria nenhuma tabela nova (usa as
   criadas na Fase A). NÃO implementa ainda (fica para as próximas
   fases): entrada de fato pelo link, painel de Mestre/Jogador,
   vínculo de personagens.

   Assume que já existem no DOM (index.html):
     #tab-campanhas com os elementos camp_* descritos abaixo, e o
     modal #camp_criar_modal.
   Assume que js/supabase-auth.js já rodou e expõe
   window.CRISAuth.client (mesmo princípio de js/supabase-sync.js).
   ========================================================== */

/* ==========================================================
   FASE C — LINK + ENTRADA (modal central)
   ----------------------------------------------------------
   Acrescenta ao módulo acima (sem alterar nada da Fase B):
     - captura do token de convite vindo do hash da URL
       (#campanha=TOKEN) e persistência em sessionStorage,
       para sobreviver ao redirecionamento de login;
     - modal "Você foi convidado" (preview via
       get_campaign_invite_info) e entrada de fato
       (accept_campaign_invite), ambas via RPC SECURITY DEFINER
       criadas na migration 0003 — nunca faz select/insert direto
       em campaigns/campaign_members para o fluxo de convite;
     - não existe mais entrada manual de token: o convite só chega
       pelo link, e o modal (#camp_invite_modal) aparece sozinho
       por cima de qualquer aba assim que há um convite pendente;
     - window.CRISCampaigns.checkPendingInvite(), chamada por
       js/supabase-auth.js depois que o app termina de iniciar
       para um usuário autenticado.
   ========================================================== */

(function () {
  "use strict";

  var PENDING_INVITE_KEY = "cris_pending_invite_token";

  // FASE D+E — campanha atualmente aberta em #camp_view_link (null fora
  // dela). Não é persistido: só existe enquanto o usuário está com a
  // tela da campanha aberta nesta sessão.
  var currentCampaign = null;
  var __jogadoresLoadedOnce = false;

  // Roda imediatamente ao carregar o script (não espera
  // DOMContentLoaded) para não perder o token caso o usuário
  // ainda não esteja autenticado.
  (function captureInviteFromHash() {
    var hash = window.location.hash || "";
    var m = hash.match(/^#campanha=(.+)$/);
    if (!m || !m[1]) return;
    var token = "";
    try { token = decodeURIComponent(m[1]); } catch (e) { token = m[1]; }
    if (token) {
      try { sessionStorage.setItem(PENDING_INVITE_KEY, token); } catch (e) {
        // sessionStorage indisponível (ex.: navegação privada) — o
        // convite simplesmente não sobrevive a um redirecionamento de
        // login nesse caso; não é um erro fatal para o resto do app.
      }
    }
    // Remove o hash da URL para não reprocessar o mesmo token em
    // reloads futuros da mesma aba.
    try {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch (e) { /* ignora */ }
  })();

  function getPendingInviteToken() {
    try { return sessionStorage.getItem(PENDING_INVITE_KEY); } catch (e) { return null; }
  }

  function clearPendingInviteToken() {
    try { sessionStorage.removeItem(PENDING_INVITE_KEY); } catch (e) { /* ignora */ }
  }

  function $(id) { return document.getElementById(id); }

  /* ============================================================
     FASE F (continuação) — helpers de identidade visual ("dossiê")
     Puramente de apresentação: não leem/gravam nenhum dado novo.
     ============================================================ */
  function formatDatePtBr(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleDateString("pt-BR");
    } catch (e) { return ""; }
  }

  function statusLabel(status) {
    var s = (status || "active").toString().toLowerCase();
    if (s === "active" || s === "ativa") return "Ativa";
    if (s === "inactive" || s === "inativa" || s === "paused" || s === "pausada") return "Pausada";
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function buildStatusPill(status) {
    var s = (status || "active").toString().toLowerCase();
    var pill = document.createElement("span");
    pill.className = "camp-status-pill" + (s === "active" || s === "ativa" ? "" : " is-inactive");
    pill.textContent = statusLabel(status).toUpperCase();
    return pill;
  }

  // Capa gerada só em CSS (ver comentário em css/campanhas.css) — mostra
  // a contagem de participantes e o status como um selo de arquivo.
  // Não recebe/usa nenhum dado de imagem: quando/se uma coluna de capa
  // existir em campaigns, basta trocar este conteúdo por uma <img>.
  function buildCapaEl(status, participantCount) {
    var capa = document.createElement("div");
    capa.className = "camp-capa";
    if (participantCount !== null && participantCount !== undefined) {
      var badge = document.createElement("span");
      badge.className = "camp-capa-badge";
      badge.textContent = "👤 " + participantCount;
      capa.appendChild(badge);
    } else {
      capa.appendChild(document.createElement("span"));
    }
    capa.appendChild(buildStatusPill(status));
    return capa;
  }

  function getClient() {
    if (typeof window.CRISAuth === "undefined") return null;
    if (window.CRISAuth.configError) return null;
    return window.CRISAuth.client || null;
  }

  // FASE D+E — cache simples do usuário atual (só em memória, nunca
  // persistido), usado por isCurrentUserMaster()/renderPersonagemCard()
  // para não precisar de "await" em todo lugar que decide o que mostrar.
  // Sempre atualizado pela própria getCurrentUser(); nunca criado
  // independentemente dela.
  let currentUserCache = null;

  async function getCurrentUser() {
    const client = getClient();
    if (!client) return null;
    try {
      const { data, error } = await client.auth.getSession();
      if (error) return null;
      const user = (data && data.session && data.session.user) || null;
      currentUserCache = user;
      return user;
    } catch (e) {
      return null;
    }
  }

  /* ============================================================
     1) NAVEGAÇÃO ENTRE AS SUB-TELAS DA ABA CAMPANHAS
     (o convite não é mais uma subview — vive no modal
     #camp_invite_modal, que fica por cima de qualquer uma destas)
     ============================================================ */
  function showSubview(name) {
    const views = {
      lista: $("camp_view_lista"),
      link: $("camp_view_link"),
    };
    Object.keys(views).forEach((k) => {
      if (views[k]) views[k].style.display = k === name ? "block" : "none";
    });
  }

  /* ============================================================
     2) LISTA "MINHAS CAMPANHAS"
     ============================================================ */
  function buildInviteLink(token) {
    const base = window.location.origin + window.location.pathname;
    return base + "#campanha=" + encodeURIComponent(token);
  }

  function renderCampaignCard(campaign, user, memberCount) {
    const card = document.createElement("div");
    card.className = "camp-card";

    const isMestre = campaign.owner_id === user.id;
    const mestreLabel = isMestre ? "Você" : "outro jogador";

    // "Capa" do arquivo (item 6) — decorativa, mostra de relance status +
    // total de participantes (mestre + jogadores) sem precisar abrir a
    // campanha.
    card.appendChild(buildCapaEl(campaign.status, memberCount + 1));

    const info = document.createElement("div");
    info.className = "camp-card-info camp-card-body";

    const name = document.createElement("p");
    name.className = "camp-card-name";
    name.textContent = campaign.name;

    const meta = document.createElement("p");
    meta.className = "camp-card-meta";
    const jogadoresTxt = memberCount === 1 ? "1 jogador" : memberCount + " jogadores";
    meta.textContent = "Mestre: " + mestreLabel + " · " + jogadoresTxt;

    const dataEl = document.createElement("p");
    dataEl.className = "camp-card-date";
    const criada = formatDatePtBr(campaign.created_at);
    if (criada) dataEl.textContent = "Iniciada em " + criada;

    info.appendChild(name);
    info.appendChild(meta);
    if (criada) info.appendChild(dataEl);

    const abrirBtn = document.createElement("button");
    abrirBtn.className = "camp-btn-primary";
    abrirBtn.textContent = "Acessar";
    abrirBtn.addEventListener("click", () => openCampaignLinkView(campaign));

    card.appendChild(info);

    // FASE F.3 — Abrir/Excluir agrupados num wrapper próprio, em vez de
    // soltos direto no card, para controlar alinhamento e permitir que
    // a Fase F.5 (responsividade) os empilhe como um grupo só.
    const actions = document.createElement("div");
    actions.className = "camp-card-actions";
    actions.appendChild(abrirBtn);

    // Excluir campanha — só o Mestre (dono) vê esta opção. Jogadores
    // comuns saem pela própria tela da campanha ("Sair da Campanha"),
    // nunca excluem a campanha em si.
    if (isMestre) {
      const excluirBtn = document.createElement("button");
      excluirBtn.className = "entry-del";
      excluirBtn.textContent = "Excluir";
      excluirBtn.addEventListener("click", () => openDeleteCampanhaModal(campaign));
      actions.appendChild(excluirBtn);
    }

    card.appendChild(actions);
    return card;
  }

  /* ============================================================
     EXCLUIR CAMPANHA (só Mestre) — tela inicial "Minhas Campanhas"
     ------------------------------------------------------------
     Apaga a campanha inteira. NUNCA apaga agentes/fichas: só
     campaign_characters, campaign_members e por fim a própria
     linha de campaigns. As policies de DELETE já existentes
     (campaign_characters_delete / campaign_members_delete: dono da
     campanha pode; campaigns_delete: owner_id = auth.uid()) cobrem
     isso — nenhuma policy nova foi criada. Apaga os vínculos antes
     da campanha por segurança (não depende de ON DELETE CASCADE
     não confirmado no schema).
     ============================================================ */
  let __campanhaPendingDelete = null;
  function openDeleteCampanhaModal(campaign) {
    __campanhaPendingDelete = campaign;
    const nomeEl = $("camp_delete_campanha_nome");
    if (nomeEl) nomeEl.textContent = campaign.name;
    const erroEl = $("camp_delete_campanha_erro");
    if (erroEl) erroEl.style.display = "none";
    const modal = $("camp_delete_campanha_modal");
    if (modal) modal.style.display = "flex";
  }
  function closeDeleteCampanhaModal() {
    __campanhaPendingDelete = null;
    const modal = $("camp_delete_campanha_modal");
    if (modal) modal.style.display = "none";
  }
  async function confirmDeleteCampanha() {
    const campaign = __campanhaPendingDelete;
    const erroEl = $("camp_delete_campanha_erro");
    if (erroEl) erroEl.style.display = "none";
    if (!campaign) { closeDeleteCampanhaModal(); return; }

    const client = getClient();
    if (!client) {
      if (erroEl) { erroEl.textContent = "Sem conexão com o Supabase. Tente novamente."; erroEl.style.display = "block"; }
      return;
    }

    try {
      const { error: errChars } = await client
        .from("campaign_characters")
        .delete()
        .eq("campaign_id", campaign.id);
      if (errChars) throw errChars;

      const { error: errMembers } = await client
        .from("campaign_members")
        .delete()
        .eq("campaign_id", campaign.id);
      if (errMembers) throw errMembers;

      const { error: errCampaign } = await client
        .from("campaigns")
        .delete()
        .eq("id", campaign.id);
      if (errCampaign) throw errCampaign;

      closeDeleteCampanhaModal();
      if (currentCampaign && currentCampaign.id === campaign.id) {
        currentCampaign = null;
        showSubview("lista");
      }
      loadCampaignList();
      if (typeof window.flashIndicator === "function") {
        window.flashIndicator("Campanha excluída.");
      }
    } catch (e) {
      console.error("[CRIS Campanhas] Falha ao excluir campanha:", e);
      if (erroEl) {
        erroEl.textContent = "Falha ao excluir: " + (e && e.message ? e.message : "erro desconhecido");
        erroEl.style.display = "block";
      }
    }
  }

  async function countMembers(client, campaignId) {
    try {
      const { count, error } = await client
        .from("campaign_members")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId);
      if (error) return 0;
      return count || 0;
    } catch (e) {
      return 0;
    }
  }

  async function loadCampaignList() {
    const listEl = $("camp_lista_cards");
    const emptyEl = $("camp_lista_vazia");
    const loadingEl = $("camp_lista_carregando");
    if (!listEl) return;

    listEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "none";
    if (loadingEl) loadingEl.style.display = "block";

    const client = getClient();
    const user = await getCurrentUser();
    if (!client || !user) {
      if (loadingEl) loadingEl.style.display = "none";
      if (emptyEl) {
        emptyEl.textContent = "Não foi possível carregar as campanhas (sem conexão com o Supabase).";
        emptyEl.style.display = "block";
      }
      return;
    }

    try {
      const { data, error } = await client
        .from("campaigns")
        .select("id,owner_id,name,description,invite_token,status,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      if (loadingEl) loadingEl.style.display = "none";

      if (!data || data.length === 0) {
        if (emptyEl) {
          emptyEl.textContent = "Você ainda não participa de nenhuma campanha. Crie uma ou entre com um link de convite.";
          emptyEl.style.display = "block";
        }
        return;
      }

      for (const campaign of data) {
        const memberCount = await countMembers(client, campaign.id);
        listEl.appendChild(renderCampaignCard(campaign, user, memberCount));
      }
    } catch (e) {
      console.error("[CRIS Campanhas] Falha ao carregar campanhas:", e);
      if (loadingEl) loadingEl.style.display = "none";
      if (emptyEl) {
        emptyEl.textContent = "Falha ao carregar campanhas: " + (e && e.message ? e.message : "erro desconhecido");
        emptyEl.style.display = "block";
      }
    }
  }

  /* ============================================================
     3) TELA DE LINK DE CONVITE (pós-criação e "Abrir")
     ============================================================ */
  function openCampaignLinkView(campaign) {
    $("camp_link_titulo").textContent = campaign.name;
    $("camp_link_nome").textContent = campaign.description || "";
    $("camp_link_input").value = buildInviteLink(campaign.invite_token);
    showSubview("link");

    // FASE F.2 — cabeçalho como metadados de arquivo: status + data de
    // criação são só leitura do que já veio junto de `campaign` (sem
    // query extra); contagem de agentes/jogadores vem do roster (ver
    // atualizarContadoresDossie(), chamada assim que loadJogadores()
    // responde, logo abaixo).
    const capaSlot = $("camp_link_capa");
    if (capaSlot) {
      capaSlot.innerHTML = "";
      capaSlot.appendChild(buildCapaEl(campaign.status, null));
    }
    const criadaEl = $("camp_link_criada_em");
    if (criadaEl) {
      const criada = formatDatePtBr(campaign.created_at);
      criadaEl.textContent = criada ? "Criada em " + criada : "";
    }
    const agentesCountEl = $("camp_link_agentes_count");
    const jogadoresCountEl = $("camp_link_jogadores_count");
    if (agentesCountEl) agentesCountEl.innerHTML = "";
    if (jogadoresCountEl) jogadoresCountEl.innerHTML = "";

    // FASE D+E — guarda a campanha atualmente aberta e prepara as
    // sub-abas Agentes/Jogadores para ela.
    currentCampaign = campaign;
    showCampSubtab("agentes");
    const sairBtn = $("camp_btn_sair_campanha");
    if (sairBtn) {
      // O Mestre não "sai" pela mesma ação (ele já tem acesso via
      // owner_id, sem linha em campaign_members) — só jogadores comuns.
      sairBtn.style.display = isCurrentUserMaster() ? "none" : "inline-block";
    }
    // FASE E (Administração) — só o Mestre pode editar nome/descrição.
    const editarBtn = $("camp_btn_editar_campanha");
    const mestreEl = $("camp_link_mestre");
    const souMestre = isCurrentUserMaster();
    if (editarBtn) editarBtn.style.display = souMestre ? "inline-block" : "none";
    if (mestreEl) mestreEl.textContent = souMestre ? "Mestre: Você" : "";
    // FASE F.2 — selo "Você é o Mestre" no cabeçalho da campanha (só
    // visual; a mesma variável souMestre já usada acima).
    const masterBadge = $("camp_master_badge");
    if (masterBadge) masterBadge.style.display = souMestre ? "inline-block" : "none";
    loadMyCharacters();
    // FASE F.2 — carrega o roster já na abertura da campanha (não só ao
    // clicar na sub-aba Jogadores) para preencher "N AGENTES · N
    // JOGADORES" no cabeçalho assim que a tela abre. Mesma RPC que a
    // sub-aba já usava — nenhuma chamada nova é criada, só adiantada;
    // por isso marca __jogadoresLoadedOnce = true logo em seguida, para
    // showCampSubtab("jogadores") não buscar de novo.
    __jogadoresLoadedOnce = true;
    loadJogadores();
  }

  // FASE F.2 — soma os personagens de todos os jogadores (roster já
  // devolve a contagem por jogador via get_campaign_roster) para exibir
  // o total de agentes da campanha no cabeçalho, sem nenhuma query nova.
  function atualizarContadoresDossie(rows) {
    const agentesCountEl = $("camp_link_agentes_count");
    const jogadoresCountEl = $("camp_link_jogadores_count");
    if (!agentesCountEl || !jogadoresCountEl) return;
    const totalAgentes = (rows || []).reduce((acc, r) => acc + (r.character_count || 0), 0);
    const totalJogadores = (rows || []).length;
    agentesCountEl.innerHTML = "<strong>" + totalAgentes + "</strong> " + (totalAgentes === 1 ? "agente" : "agentes");
    jogadoresCountEl.innerHTML = "<strong>" + totalJogadores + "</strong> " + (totalJogadores === 1 ? "participante" : "participantes");
  }

  /* ============================================================
     FASE E (Administração) — EDITAR CAMPANHA (nome/descrição)
     ------------------------------------------------------------
     Não mexe em invite_token. Update direto em public.campaigns —
     a policy campaigns_update (já existente, owner_id = auth.uid())
     já restringe isso ao Mestre; não foi preciso criar/alterar
     nenhuma policy para isto.
     ============================================================ */
  function openEditarCampanhaModal() {
    if (!currentCampaign || !isCurrentUserMaster()) return;
    $("camp_editar_nome").value = currentCampaign.name || "";
    $("camp_editar_descricao").value = currentCampaign.description || "";
    const erroEl = $("camp_editar_erro");
    if (erroEl) erroEl.style.display = "none";
    const modal = $("camp_editar_modal");
    if (modal) modal.style.display = "flex";
  }

  function closeEditarCampanhaModal() {
    const modal = $("camp_editar_modal");
    if (modal) modal.style.display = "none";
  }

  async function confirmEditarCampanha() {
    const erroEl = $("camp_editar_erro");
    if (erroEl) erroEl.style.display = "none";

    const nome = ($("camp_editar_nome").value || "").trim();
    const descricao = ($("camp_editar_descricao").value || "").trim();
    if (!nome) {
      if (erroEl) { erroEl.textContent = "Dê um nome para a campanha."; erroEl.style.display = "block"; }
      return;
    }

    const client = getClient();
    if (!client || !currentCampaign) {
      if (erroEl) { erroEl.textContent = "Sem conexão com o Supabase. Tente novamente."; erroEl.style.display = "block"; }
      return;
    }

    try {
      // Só nome/descrição/updated_at — nunca invite_token (instrução 5).
      const { data: updated, error } = await client
        .from("campaigns")
        .update({ name: nome, description: descricao, updated_at: new Date().toISOString() })
        .eq("id", currentCampaign.id)
        .select("id,owner_id,name,description,invite_token,status,created_at")
        .single();
      if (error) throw error;

      currentCampaign = updated;
      $("camp_link_titulo").textContent = updated.name;
      $("camp_link_nome").textContent = updated.description || "";
      closeEditarCampanhaModal();
      if (typeof window.flashIndicator === "function") {
        window.flashIndicator("Campanha atualizada!");
      }
    } catch (e) {
      console.error("[CRIS Campanhas] Falha ao editar campanha:", e);
      if (erroEl) {
        erroEl.textContent = "Falha ao salvar: " + (e && e.message ? e.message : "erro desconhecido");
        erroEl.style.display = "block";
      }
    }
  }

  function isCurrentUserMaster() {
    return !!(currentCampaign && currentUserCache && currentCampaign.owner_id === currentUserCache.id);
  }

  /* ============================================================
     FASE D+E — SUB-ABAS DA CAMPANHA AGENTES / JOGADORES
     ============================================================ */
  function showCampSubtab(name) {
    const panels = { agentes: $("camp_subtab_agentes"), jogadores: $("camp_subtab_jogadores") };
    const btns = { agentes: $("camp_subtab_btn_agentes"), jogadores: $("camp_subtab_btn_jogadores") };
    Object.keys(panels).forEach((k) => {
      if (panels[k]) panels[k].style.display = k === name ? "block" : "none";
      if (btns[k]) btns[k].classList.toggle("active", k === name);
    });
    if (name === "jogadores" && !__jogadoresLoadedOnce) {
      __jogadoresLoadedOnce = true;
      loadJogadores();
    }
  }

  /* ============================================================
     FASE D — MEUS PERSONAGENS
     ------------------------------------------------------------
     "Personagem" aqui NUNCA é uma ficha nova: é só o vínculo
     campaign_characters -> agent_id apontando para uma ficha já
     existente em Agentes (window.sheetsIndex / public.agents).
     "Acessar Ficha" reusa diretamente window.openSheet(), o mesmo
     mecanismo que a aba Agentes já usa (instrução 8 do prompt) —
     nenhuma interface de ficha nova é criada para campanhas.
     ============================================================ */
  async function loadMyCharacters() {
    const cardsEl = $("camp_personagens_cards");
    const emptyEl = $("camp_personagens_vazio");
    const loadingEl = $("camp_personagens_carregando");
    if (!cardsEl || !currentCampaign) return;

    cardsEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "none";
    if (loadingEl) loadingEl.style.display = "block";

    const client = getClient();
    const user = await getCurrentUser();
    if (!client || !user) {
      if (loadingEl) loadingEl.style.display = "none";
      return;
    }

    try {
      const { data: links, error: linkErr } = await client
        .from("campaign_characters")
        .select("id,agent_id")
        .eq("campaign_id", currentCampaign.id)
        .eq("user_id", user.id);
      if (linkErr) throw linkErr;

      if (loadingEl) loadingEl.style.display = "none";

      if (!links || links.length === 0) {
        if (emptyEl) emptyEl.style.display = "block";
        return;
      }

      const agentIds = links.map((l) => l.agent_id);
      const { data: agents, error: agentErr } = await client
        .from("agents")
        .select("id,name,data")
        .in("id", agentIds);
      if (agentErr) throw agentErr;

      const agentsById = {};
      (agents || []).forEach((a) => { agentsById[a.id] = a; });

      links.forEach((link) => {
        const agent = agentsById[link.agent_id];
        // Agente pode ter sido apagado em Agentes desde o vínculo — não
        // quebra a lista, só não mostra card para esse vínculo órfão.
        if (!agent) return;
        cardsEl.appendChild(renderPersonagemCard(link, agent));
      });
    } catch (e) {
      console.error("[CRIS Campanhas] Falha ao carregar meus personagens:", e);
      if (loadingEl) loadingEl.style.display = "none";
      if (emptyEl) {
        emptyEl.textContent = "Falha ao carregar personagens: " + (e && e.message ? e.message : "erro desconhecido");
        emptyEl.style.display = "block";
      }
    }
  }

  // Iniciais para o retrato-placeholder quando a ficha não tem foto —
  // só um recurso visual (item 10), não lê/grava nenhum dado novo.
  function initialsFor(nome) {
    const partes = (nome || "").trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return "?";
    if (partes.length === 1) return partes[0].charAt(0).toUpperCase();
    return (partes[0].charAt(0) + partes[partes.length - 1].charAt(0)).toUpperCase();
  }

  function renderPersonagemCard(link, agent) {
    const data = (agent.data && typeof agent.data === "object") ? agent.data : {};
    const nome = (agent.name || data.nome || "").trim() || "Ficha sem nome";
    const nivel = (data.nivel || "").toString().trim();
    const profissao = (data.profissao || "").toString().trim();
    const foto = (data.foto || "").toString();

    const card = document.createElement("div");
    card.className = "camp-char-card";

    const portrait = document.createElement("div");
    portrait.className = "camp-char-card-portrait";
    if (foto) {
      const img = document.createElement("img");
      img.className = "camp-char-card-img";
      img.src = foto;
      img.alt = nome;
      portrait.appendChild(img);
    } else {
      const initials = document.createElement("span");
      initials.className = "camp-char-card-initials";
      initials.textContent = initialsFor(nome);
      portrait.appendChild(initials);
    }
    card.appendChild(portrait);

    const body = document.createElement("div");
    body.className = "camp-char-card-body";

    const nameEl = document.createElement("div");
    nameEl.className = "camp-char-card-name";
    nameEl.textContent = nome;
    body.appendChild(nameEl);

    if (profissao) {
      const roleEl = document.createElement("div");
      roleEl.className = "camp-char-card-role";
      roleEl.textContent = profissao;
      body.appendChild(roleEl);
    }

    if (nivel) {
      const metaEl = document.createElement("div");
      metaEl.className = "camp-char-card-meta";
      metaEl.textContent = "Nível " + nivel;
      body.appendChild(metaEl);
    }
    card.appendChild(body);

    const actions = document.createElement("div");
    actions.className = "camp-char-card-actions";

    const abrirBtn = document.createElement("button");
    abrirBtn.textContent = "Acessar Ficha";
    abrirBtn.addEventListener("click", async () => {
      // Reaproveita 100% o mecanismo existente de Agentes — mas
      // window.openSheet() espera o ID LOCAL da ficha (sheetStorageKey),
      // enquanto agent.id aqui é o UUID de agents (nuvem), obtido via
      // campaign_characters.agent_id. Resolve o UUID de volta ao ID
      // local (mesmo mecanismo de supabase-sync.js) antes de abrir —
      // nunca passa o UUID direto para openSheet().
      const originalLabel = abrirBtn.textContent;
      abrirBtn.disabled = true;
      abrirBtn.classList.add("camp-btn-loading");
      abrirBtn.textContent = "Abrindo…";
      const localId = (window.CRISSync && typeof window.CRISSync.getLocalSheetIdForCloudId === "function")
        ? await window.CRISSync.getLocalSheetIdForCloudId(agent.id)
        : null;
      if (!localId) {
        abrirBtn.disabled = false;
        abrirBtn.classList.remove("camp-btn-loading");
        abrirBtn.textContent = originalLabel;
        if (typeof window.flashIndicator === "function") {
          window.flashIndicator("✕ Esta ficha ainda não está sincronizada neste dispositivo.", true, 3000);
        }
        return;
      }
      if (typeof window.openSheet === "function") window.openSheet(localId);
      const tabBtn = document.querySelector('.tab-btn[data-tab="agentes"]');
      if (tabBtn) tabBtn.click();
    });
    actions.appendChild(abrirBtn);

    const removerBtn = document.createElement("button");
    removerBtn.className = "entry-del";
    removerBtn.textContent = "Remover da Campanha";
    removerBtn.addEventListener("click", () => openRemovePersonagemModal(link.id));
    actions.appendChild(removerBtn);

    card.appendChild(actions);
    return card;
  }

  let __personagemPendingRemoveId = null;
  // FASE E (Administração) — callback opcional só usado quando o Mestre
  // remove o personagem de outro jogador pela aba Jogadores (precisa
  // tirar a linha daquela lista específica; "Meus Personagens" sempre
  // recarrega via loadMyCharacters(), então não precisa de callback).
  let __personagemPendingRemoveCallback = null;
  function openRemovePersonagemModal(linkId, onRemoved) {
    __personagemPendingRemoveId = linkId;
    __personagemPendingRemoveCallback = (typeof onRemoved === "function") ? onRemoved : null;
    const modal = $("camp_remove_personagem_modal");
    if (modal) modal.style.display = "flex";
  }
  function closeRemovePersonagemModal() {
    __personagemPendingRemoveId = null;
    __personagemPendingRemoveCallback = null;
    const modal = $("camp_remove_personagem_modal");
    if (modal) modal.style.display = "none";
  }
  async function confirmRemovePersonagem() {
    const linkId = __personagemPendingRemoveId;
    const callback = __personagemPendingRemoveCallback;
    if (!linkId) { closeRemovePersonagemModal(); return; }
    const client = getClient();
    if (!client) { closeRemovePersonagemModal(); return; }
    try {
      // Remove só o vínculo (campaign_characters) — o agente/ficha em
      // Agentes nunca é tocado (instrução 10 do prompt).
      const { error } = await client.from("campaign_characters").delete().eq("id", linkId);
      if (error) throw error;
      closeRemovePersonagemModal();
      if (callback) callback(); else loadMyCharacters();
      __jogadoresLoadedOnce = false; // contagem de personagens mudou
    } catch (e) {
      console.error("[CRIS Campanhas] Falha ao remover personagem:", e);
      closeRemovePersonagemModal();
      if (typeof window.flashIndicator === "function") {
        window.flashIndicator("✕ Falha ao remover personagem.", true, 3000);
      }
    }
  }

  /* ------------------------------------------------------------
     Adicionar Personagem — seleciona um agente já existente do
     usuário (window.sheetsIndex) e cria só o vínculo. Nunca cria
     agente novo, nunca duplica ficha/inventário (instrução 6/7).
     ------------------------------------------------------------ */
  let __selectedAgentIdToAdd = null;

  async function openAddPersonagemModal() {
    __selectedAgentIdToAdd = null;
    const listEl = $("camp_add_personagem_lista");
    const emptyEl = $("camp_add_personagem_vazio");
    const erroEl = $("camp_add_personagem_erro");
    if (erroEl) erroEl.style.display = "none";
    if (listEl) listEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "none";

    const meusAgentes = Array.isArray(window.sheetsIndex) ? window.sheetsIndex : [];

    // Não repete um agente já vinculado a esta campanha (proteção extra
    // no cliente; o índice único no banco é a garantia real — item 7/
    // Teste 18).
    let jaVinculados = new Set();
    try {
      const client = getClient();
      const user = await getCurrentUser();
      if (client && user && currentCampaign) {
        const { data } = await client
          .from("campaign_characters")
          .select("agent_id")
          .eq("campaign_id", currentCampaign.id)
          .eq("user_id", user.id);
        jaVinculados = new Set((data || []).map((r) => r.agent_id));
      }
    } catch (e) { /* segue sem o filtro extra — o índice único protege de qualquer forma */ }

    // FASE D (correção) — campaign_characters.agent_id é UUID e
    // referencia agents.id (nuvem). window.sheetsIndex guarda o ID
    // LOCAL da ficha (genSheetId(), ex.: "ficha_xxx"), nunca o UUID.
    // Resolve cada ficha local para seu agents.id correspondente
    // reaproveitando o mecanismo já existente em supabase-sync.js
    // (agente:sheet:<id>:cloudsync) — nunca envia o ID local para
    // esta coluna.
    const podeResolver = window.CRISSync && typeof window.CRISSync.getCloudIdForLocalSheet === "function";
    const comCloudId = [];
    for (const entry of meusAgentes) {
      const cloudId = podeResolver ? await window.CRISSync.getCloudIdForLocalSheet(entry.id) : null;
      comCloudId.push({ entry: entry, cloudId: cloudId });
    }

    // Só é selecionável quem já tem registro na nuvem E ainda não
    // está vinculado a esta campanha. Sem sincronização com a nuvem,
    // não existe agents.id para preencher — o vínculo fica impedido
    // (não há autosave neste app: a sincronização só acontece pelo
    // botão "Salvar Ficha" da própria ficha, então não disparamos
    // sincronização por aqui).
    const disponiveis = comCloudId.filter((c) => !c.cloudId || !jaVinculados.has(c.cloudId));

    if (disponiveis.length === 0) {
      if (emptyEl) emptyEl.style.display = "block";
    } else if (listEl) {
      disponiveis.forEach(({ entry, cloudId }) => {
        const item = document.createElement("div");
        item.className = "camp-add-item";
        item.textContent = entry.nome || "Ficha sem nome";
        if (!cloudId) {
          item.classList.add("disabled");
          item.title = "Esta ficha ainda não foi sincronizada com a nuvem. Abra-a em Agentes e clique em \"Salvar Ficha\" antes de adicioná-la à campanha.";
        } else {
          item.addEventListener("click", () => {
            __selectedAgentIdToAdd = cloudId;
            listEl.querySelectorAll(".camp-add-item").forEach((el) => el.classList.remove("selected"));
            item.classList.add("selected");
          });
        }
        listEl.appendChild(item);
      });
    }

    const modal = $("camp_add_personagem_modal");
    if (modal) modal.style.display = "flex";
  }

  function closeAddPersonagemModal() {
    const modal = $("camp_add_personagem_modal");
    if (modal) modal.style.display = "none";
  }

  async function confirmAddPersonagem() {
    const erroEl = $("camp_add_personagem_erro");
    if (erroEl) erroEl.style.display = "none";

    if (!__selectedAgentIdToAdd) {
      if (erroEl) {
        erroEl.textContent = "Selecione um personagem antes de confirmar.";
        erroEl.style.display = "block";
      }
      return;
    }

    const client = getClient();
    const user = await getCurrentUser();
    if (!client || !user || !currentCampaign) {
      if (erroEl) {
        erroEl.textContent = "Sem conexão com o Supabase. Tente novamente.";
        erroEl.style.display = "block";
      }
      return;
    }

    try {
      const { error } = await client.from("campaign_characters").insert({
        campaign_id: currentCampaign.id,
        user_id: user.id,
        agent_id: __selectedAgentIdToAdd,
      });
      if (error) throw error;
      closeAddPersonagemModal();
      loadMyCharacters();
      __jogadoresLoadedOnce = false; // contagem de personagens mudou
    } catch (e) {
      console.error("[CRIS Campanhas] Falha ao adicionar personagem:", e);
      if (erroEl) {
        // Índice único (campaign_id, agent_id) — mensagem amigável para
        // o caso de clique duplicado/corrida entre abas (Teste 18).
        const jaExiste = e && (e.code === "23505");
        erroEl.textContent = jaExiste
          ? "Este personagem já está nesta campanha."
          : "Falha ao adicionar personagem: " + (e && e.message ? e.message : "erro desconhecido");
        erroEl.style.display = "block";
      }
    }
  }

  /* ============================================================
     FASE E — JOGADORES
     ------------------------------------------------------------
     Usa a RPC public.get_campaign_roster (migration 0004,
     SECURITY DEFINER, só leitura) porque o cliente não tem como
     ler nome de outros usuários em auth.users diretamente.
     ============================================================ */
  async function loadJogadores() {
    const cardsEl = $("camp_jogadores_cards");
    const loadingEl = $("camp_jogadores_carregando");
    if (!cardsEl || !currentCampaign) return;

    cardsEl.innerHTML = "";
    if (loadingEl) loadingEl.style.display = "block";

    const client = getClient();
    if (!client) { if (loadingEl) loadingEl.style.display = "none"; return; }

    try {
      const { data, error } = await client.rpc("get_campaign_roster", { p_campaign_id: currentCampaign.id });
      if (error) throw error;
      if (loadingEl) loadingEl.style.display = "none";

      const rows = (data || []).slice().sort((a, b) => {
        if (a.is_master !== b.is_master) return a.is_master ? -1 : 1;
        return (a.display_name || "").localeCompare(b.display_name || "");
      });

      atualizarContadoresDossie(rows);
      rows.forEach((row) => cardsEl.appendChild(renderJogadorCard(row)));
    } catch (e) {
      console.error("[CRIS Campanhas] Falha ao carregar jogadores:", e);
      if (loadingEl) loadingEl.style.display = "none";
      cardsEl.innerHTML = '<p class="empty-state">Falha ao carregar jogadores: ' +
        (e && e.message ? e.message : "erro desconhecido") + "</p>";
    }
  }

  function renderJogadorCard(row) {
    const card = document.createElement("div");
    card.className = "camp-player-card";
    // FASE F.3 — diferenciação visual da linha do Mestre (borda âmbar),
    // além do texto "Mestre" que já existia no papel abaixo do nome.
    if (row.is_master) card.classList.add("is-master");

    const nameEl = document.createElement("p");
    nameEl.className = "camp-player-card-name";
    nameEl.textContent = row.display_name || (row.is_master ? "Mestre" : "Jogador");
    card.appendChild(nameEl);

    const roleEl = document.createElement("p");
    roleEl.className = "camp-player-card-role";
    roleEl.textContent = row.is_master ? "Mestre" : "Jogador";
    // Item 11 — selo discreto (texto pequeno, não um badge colorido)
    // identificando a própria linha do usuário logado nesta lista.
    if (currentUserCache && row.user_id === currentUserCache.id) {
      roleEl.textContent += " · você";
    }
    card.appendChild(roleEl);

    const count = row.character_count || 0;
    const countEl = document.createElement("p");
    countEl.className = "camp-player-card-count";
    countEl.textContent = count === 1 ? "1 personagem" : count + " personagens";
    card.appendChild(countEl);

    const isMaster = isCurrentUserMaster();

    // FASE G (Etapa 6) — o Mestre pode expandir para ver e abrir os
    // personagens de qualquer jogador (o próprio já vê em "Meus
    // Personagens"). Só é oferecido ao Mestre, conforme item 14: um
    // jogador comum não acessa a ficha de outro jogador.
    if (isMaster && count > 0) {
      const toggleBtn = document.createElement("button");
      toggleBtn.textContent = "▸ Ver Personagens";
      const listEl = document.createElement("div");
      listEl.className = "camp-player-char-list";
      let loaded = false;
      toggleBtn.addEventListener("click", async () => {
        const showing = listEl.classList.contains("is-open");
        if (showing) { listEl.classList.remove("is-open"); toggleBtn.textContent = "▸ Ver Personagens"; return; }
        listEl.classList.add("is-open");
        toggleBtn.textContent = "▾ Ocultar Personagens";
        if (!loaded) {
          loaded = true;
          await renderPlayerCharacterList(listEl, row.user_id, row.is_master);
        }
      });
      card.appendChild(toggleBtn);
      card.appendChild(listEl);
    }

    // Master remover jogador (item 16) — só aparece para o Mestre e só
    // nas linhas que não são o próprio Mestre.
    if (isMaster && !row.is_master) {
      const removerBtn = document.createElement("button");
      removerBtn.className = "entry-del";
      removerBtn.textContent = "Remover Jogador";
      removerBtn.addEventListener("click", () => openRemoveJogadorModal(row.user_id));
      card.appendChild(removerBtn);
    }

    return card;
  }

  /* ------------------------------------------------------------
     FASE G (Etapa 6) — lista os personagens de UM jogador
     específico, com "Acessar Ficha" (abre via
     CRISCampaignAgentView, somente leitura) e "Remover" (item 17
     — Master remove o vínculo campaign_characters; o agente
     original nunca é apagado). Só chamada pelo Mestre, sob
     demanda (ao clicar em "Ver Personagens").
     ------------------------------------------------------------ */
  async function renderPlayerCharacterList(container, userId, isRowMaster) {
    container.innerHTML = '<p class="empty-state">Carregando…</p>';
    const client = getClient();
    if (!client || !currentCampaign) { container.innerHTML = ""; return; }

    try {
      const { data: links, error: linkErr } = await client
        .from("campaign_characters")
        .select("id,agent_id")
        .eq("campaign_id", currentCampaign.id)
        .eq("user_id", userId);
      if (linkErr) throw linkErr;

      if (!links || links.length === 0) { container.innerHTML = ""; return; }

      const agentIds = links.map((l) => l.agent_id);
      // Permitido pela RLS agents_select_campaign_master (já existente):
      // o Mestre pode ler qualquer agente vinculado à própria campanha.
      const { data: agents, error: agentErr } = await client
        .from("agents")
        .select("id,name,data")
        .in("id", agentIds);
      if (agentErr) throw agentErr;

      const agentsById = {};
      (agents || []).forEach((a) => { agentsById[a.id] = a; });

      container.innerHTML = "";
      links.forEach((link) => {
        const agent = agentsById[link.agent_id];
        if (!agent) return; // vínculo órfão (agente apagado) — não mostra
        const data = (agent.data && typeof agent.data === "object") ? agent.data : {};
        const nome = (agent.name || data.nome || "Ficha sem nome").trim();

        const row = document.createElement("div");
        row.className = "camp-player-char-row";

        const nameEl = document.createElement("span");
        nameEl.textContent = nome;
        row.appendChild(nameEl);

        const abrirBtn = document.createElement("button");
        abrirBtn.textContent = "Acessar Ficha";
        abrirBtn.addEventListener("click", () => {
          if (window.CRISCampaignAgentView && typeof window.CRISCampaignAgentView.open === "function") {
            window.CRISCampaignAgentView.open(agent.id, nome);
          }
        });
        row.appendChild(abrirBtn);

        // Item 17 — não faz sentido o Mestre "remover" o próprio
        // personagem por aqui (isso já é feito em Meus Personagens).
        // FASE E (Administração/item 20) — reaproveita o mesmo modal de
        // confirmação de "Meus Personagens" (confirmRemovePersonagem só
        // apaga por link.id, não importa de quem é o vínculo), em vez de
        // deletar direto sem confirmação como antes.
        if (!isRowMaster) {
          const removerBtn = document.createElement("button");
          removerBtn.className = "entry-del";
          removerBtn.textContent = "Remover";
          removerBtn.addEventListener("click", () => openRemovePersonagemModal(link.id, function () {
            row.remove();
          }));
          row.appendChild(removerBtn);
        }

        container.appendChild(row);
      });
    } catch (e) {
      console.error("[CRIS Campanhas] Falha ao listar personagens do jogador:", e);
      container.innerHTML = '<p class="empty-state">Falha ao carregar personagens.</p>';
    }
  }

  // FASE E (Administração/item 9) — confirmação antes de remover
  // jogador; antes disparava removeJogador() direto no clique.
  let __jogadorPendingRemoveId = null;
  function openRemoveJogadorModal(userId) {
    __jogadorPendingRemoveId = userId;
    const modal = $("camp_remove_jogador_modal");
    if (modal) modal.style.display = "flex";
  }
  function closeRemoveJogadorModal() {
    __jogadorPendingRemoveId = null;
    const modal = $("camp_remove_jogador_modal");
    if (modal) modal.style.display = "none";
  }
  async function confirmRemoveJogadorModal() {
    const userId = __jogadorPendingRemoveId;
    closeRemoveJogadorModal();
    if (!userId) return;
    await removeJogador(userId);
  }

  async function removeJogador(userId) {
    const client = getClient();
    if (!client || !currentCampaign) return;
    try {
      // Mesmo comportamento de "sair" (item 16): remove primeiro os
      // vínculos de personagens daquele jogador, depois a membership.
      // Os agentes dele nunca são tocados.
      const { error: errChars } = await client
        .from("campaign_characters")
        .delete()
        .eq("campaign_id", currentCampaign.id)
        .eq("user_id", userId);
      if (errChars) throw errChars;

      const { error: errMember } = await client
        .from("campaign_members")
        .delete()
        .eq("campaign_id", currentCampaign.id)
        .eq("user_id", userId);
      if (errMember) throw errMember;

      loadJogadores();
    } catch (e) {
      console.error("[CRIS Campanhas] Falha ao remover jogador:", e);
      if (typeof window.flashIndicator === "function") {
        window.flashIndicator("✕ Falha ao remover jogador.", true, 3000);
      }
    }
  }

  /* ------------------------------------------------------------
     Sair da Campanha (jogador comum) — item 15.
     ------------------------------------------------------------ */
  function openSairModal() {
    const modal = $("camp_sair_modal");
    if (modal) modal.style.display = "flex";
  }
  function closeSairModal() {
    const modal = $("camp_sair_modal");
    if (modal) modal.style.display = "none";
  }
  async function confirmSairCampanha() {
    const client = getClient();
    const user = await getCurrentUser();
    if (!client || !user || !currentCampaign) { closeSairModal(); return; }
    const campaignId = currentCampaign.id;
    try {
      const { error: errChars } = await client
        .from("campaign_characters")
        .delete()
        .eq("campaign_id", campaignId)
        .eq("user_id", user.id);
      if (errChars) throw errChars;

      const { error: errMember } = await client
        .from("campaign_members")
        .delete()
        .eq("campaign_id", campaignId)
        .eq("user_id", user.id);
      if (errMember) throw errMember;

      closeSairModal();
      currentCampaign = null;
      showSubview("lista");
      loadCampaignList();
      if (typeof window.flashIndicator === "function") {
        window.flashIndicator("Você saiu da campanha.");
      }
    } catch (e) {
      console.error("[CRIS Campanhas] Falha ao sair da campanha:", e);
      closeSairModal();
      if (typeof window.flashIndicator === "function") {
        window.flashIndicator("✕ Falha ao sair da campanha.", true, 3000);
      }
    }
  }

  /* ============================================================
     4) CRIAR CAMPANHA
     ============================================================ */
  function openCreateModal() {
    $("camp_criar_nome").value = "";
    $("camp_criar_descricao").value = "";
    $("camp_criar_erro").style.display = "none";
    $("camp_criar_modal").style.display = "flex";
  }

  function closeCreateModal() {
    $("camp_criar_modal").style.display = "none";
  }

  async function confirmCreateCampaign() {
    const nome = ($("camp_criar_nome").value || "").trim();
    const descricao = ($("camp_criar_descricao").value || "").trim();
    const erroEl = $("camp_criar_erro");
    erroEl.style.display = "none";

    if (!nome) {
      erroEl.textContent = "Dê um nome para a campanha antes de criar.";
      erroEl.style.display = "block";
      return;
    }

    const client = getClient();
    const user = await getCurrentUser();
    if (!client || !user) {
      erroEl.textContent = "Sem conexão com o Supabase. Tente novamente.";
      erroEl.style.display = "block";
      return;
    }

    try {
      const { data: inserted, error } = await client
        .from("campaigns")
        .insert({ owner_id: user.id, name: nome, description: descricao })
        .select("id,owner_id,name,description,invite_token,status,created_at")
        .single();
      if (error) throw error;

      closeCreateModal();
      openCampaignLinkView(inserted);
      // Atualiza a lista em segundo plano para quando o usuário voltar.
      loadCampaignList();
    } catch (e) {
      console.error("[CRIS Campanhas] Falha ao criar campanha:", e);
      erroEl.textContent = "Falha ao criar campanha: " + (e && e.message ? e.message : "erro desconhecido");
      erroEl.style.display = "block";
    }
  }

  /* ============================================================
     6) FASE C — FLUXO DE CONVITE (modal central)
     ============================================================ */
  // Guarda o token do convite atualmente aberto no modal, para o
  // botão "Entrar na Campanha" usar sem depender de nenhum campo de
  // texto (não existe mais entrada manual de token: o convite só
  // chega pelo link).
  var conviteAtualToken = null;

  function showInviteModalState(name) {
    var states = {
      preview: $("camp_convite_preview"),
      invalido: $("camp_convite_invalido"),
    };
    Object.keys(states).forEach(function (k) {
      if (states[k]) states[k].style.display = k === name ? "block" : "none";
    });
  }

  function openInviteModal() {
    var modal = $("camp_invite_modal");
    if (modal) modal.style.display = "flex";
  }

  function closeInviteModal() {
    var modal = $("camp_invite_modal");
    if (modal) modal.style.display = "none";
  }

  async function lookupInvite(token) {
    var client = getClient();
    if (!client) throw new Error("Sem conexão com o Supabase.");
    var res = await client.rpc("get_campaign_invite_info", { p_token: token });
    if (res.error) throw res.error;
    var rows = res.data;
    if (!rows || rows.length === 0) return null;
    return rows[0];
  }

  async function showInvitePreview(token) {
    conviteAtualToken = token;
    openInviteModal();
    showInviteModalState("preview");
    var carregandoEl = $("camp_convite_carregando");
    var actionsEl = document.querySelector("#camp_convite_preview .modal-actions");
    if (carregandoEl) { carregandoEl.textContent = "Carregando convite…"; carregandoEl.style.display = "block"; }
    if (actionsEl) actionsEl.style.display = "none";

    try {
      var info = await lookupInvite(token);
      if (carregandoEl) carregandoEl.style.display = "none";
      if (actionsEl) actionsEl.style.display = "flex";

      if (!info) {
        // Token inválido OU campanha inexistente — mesma mensagem para
        // os dois casos (Testes 5 e 6), sem revelar qual dos dois é.
        clearPendingInviteToken();
        showInviteModalState("invalido");
        return;
      }

      $("camp_convite_nome").textContent = info.campaign_name;
      $("camp_convite_mestre").textContent = info.master_name ? ("Mestre: " + info.master_name) : "";
    } catch (e) {
      console.error("[CRIS Campanhas] Falha ao buscar convite:", e);
      if (carregandoEl) carregandoEl.style.display = "none";
      clearPendingInviteToken();
      showInviteModalState("invalido");
    }
  }

  async function confirmarEntradaConvite() {
    if (!conviteAtualToken) return;
    var client = getClient();
    if (!client) return;

    var carregandoEl = $("camp_convite_carregando");
    var actionsEl = document.querySelector("#camp_convite_preview .modal-actions");
    if (carregandoEl) { carregandoEl.textContent = "Entrando na campanha…"; carregandoEl.style.display = "block"; }
    if (actionsEl) actionsEl.style.display = "none";

    try {
      var res = await client.rpc("accept_campaign_invite", { p_token: conviteAtualToken });
      if (res.error) throw res.error;
      var aceita = (res.data && res.data[0]) || null;
      clearPendingInviteToken();
      conviteAtualToken = null;
      closeInviteModal();
      if (typeof window.flashIndicator === "function") {
        window.flashIndicator("Você entrou na campanha!");
      }

      // Abre a aba CAMPANHAS e mostra a campanha recém-aceita.
      var tabBtn = document.querySelector('.tab-btn[data-tab="campanhas"]');
      if (tabBtn) tabBtn.click();
      showSubview("lista");
      await loadCampaignList();
      if (aceita && aceita.campaign_id) {
        var client2 = getClient();
        var user2 = await getCurrentUser();
        if (client2 && user2) {
          try {
            var full = await client2
              .from("campaigns")
              .select("id,owner_id,name,description,invite_token,status,created_at")
              .eq("id", aceita.campaign_id)
              .single();
            if (!full.error && full.data) openCampaignLinkView(full.data);
          } catch (e2) { /* lista já foi recarregada; não é crítico */ }
        }
      }
    } catch (e) {
      console.error("[CRIS Campanhas] Falha ao entrar na campanha:", e);
      if (carregandoEl) carregandoEl.style.display = "none";
      if (actionsEl) actionsEl.style.display = "flex";
      // Convite pode ter deixado de ser válido entre o preview e a
      // confirmação (ex.: Mestre desativou a campanha nesse meio-tempo).
      showInviteModalState("invalido");
      clearPendingInviteToken();
    }
  }

  function cancelarConvite() {
    conviteAtualToken = null;
    clearPendingInviteToken();
    closeInviteModal();
  }

  function fecharConviteInvalido() {
    conviteAtualToken = null;
    closeInviteModal();
  }

  // Chamada por js/supabase-auth.js assim que o app termina de iniciar
  // para um usuário autenticado (enterApp -> crisStartAppIfNeeded ->
  // aqui). Se não houver convite pendente, não faz nada — não mexe na
  // aba/tela que o usuário já estiver vendo (o modal aparece por cima
  // de qualquer aba).
  async function checkPendingInvite() {
    var token = getPendingInviteToken();
    if (!token) return;
    await showInvitePreview(token);
  }

  /* ============================================================
     5) LIGAÇÃO COM O DOM
     ============================================================ */
  function wireEvents() {
    const btnCriar = $("camp_btn_criar");
    if (btnCriar) btnCriar.addEventListener("click", openCreateModal);

    const btnCriarCancelar = $("camp_criar_cancelar");
    if (btnCriarCancelar) btnCriarCancelar.addEventListener("click", closeCreateModal);

    const btnCriarConfirmar = $("camp_criar_confirmar");
    if (btnCriarConfirmar) btnCriarConfirmar.addEventListener("click", confirmCreateCampaign);

    const btnVoltarLista = $("camp_btn_voltar_lista");
    if (btnVoltarLista) {
      btnVoltarLista.addEventListener("click", () => {
        currentCampaign = null;
        showSubview("lista");
        loadCampaignList();
      });
    }

    // FASE D+E — sub-abas Agentes/Jogadores
    const subtabAgentesBtn = $("camp_subtab_btn_agentes");
    if (subtabAgentesBtn) subtabAgentesBtn.addEventListener("click", () => showCampSubtab("agentes"));
    const subtabJogadoresBtn = $("camp_subtab_btn_jogadores");
    if (subtabJogadoresBtn) subtabJogadoresBtn.addEventListener("click", () => showCampSubtab("jogadores"));

    // FASE D — Adicionar/Remover Personagem
    const btnAddPersonagem = $("camp_btn_add_personagem");
    if (btnAddPersonagem) btnAddPersonagem.addEventListener("click", openAddPersonagemModal);
    const btnAddPersonagemCancelar = $("camp_add_personagem_cancelar");
    if (btnAddPersonagemCancelar) btnAddPersonagemCancelar.addEventListener("click", closeAddPersonagemModal);
    const btnAddPersonagemConfirmar = $("camp_add_personagem_confirmar");
    if (btnAddPersonagemConfirmar) btnAddPersonagemConfirmar.addEventListener("click", confirmAddPersonagem);
    const btnRemovePersonagemCancelar = $("camp_remove_personagem_cancelar");
    if (btnRemovePersonagemCancelar) btnRemovePersonagemCancelar.addEventListener("click", closeRemovePersonagemModal);
    const btnRemovePersonagemConfirmar = $("camp_remove_personagem_confirmar");
    if (btnRemovePersonagemConfirmar) btnRemovePersonagemConfirmar.addEventListener("click", confirmRemovePersonagem);

    // FASE E — Sair da Campanha
    const btnSairCampanha = $("camp_btn_sair_campanha");
    if (btnSairCampanha) btnSairCampanha.addEventListener("click", openSairModal);
    const btnSairCancelar = $("camp_sair_cancelar");
    if (btnSairCancelar) btnSairCancelar.addEventListener("click", closeSairModal);
    const btnSairConfirmar = $("camp_sair_confirmar");
    if (btnSairConfirmar) btnSairConfirmar.addEventListener("click", confirmSairCampanha);

    // FASE E — Administração: Editar Campanha (só Mestre)
    const btnEditarCampanha = $("camp_btn_editar_campanha");
    if (btnEditarCampanha) btnEditarCampanha.addEventListener("click", openEditarCampanhaModal);
    const btnEditarCancelar = $("camp_editar_cancelar");
    if (btnEditarCancelar) btnEditarCancelar.addEventListener("click", closeEditarCampanhaModal);
    const btnEditarConfirmar = $("camp_editar_confirmar");
    if (btnEditarConfirmar) btnEditarConfirmar.addEventListener("click", confirmEditarCampanha);

    // FASE E — Administração: confirmar Remover Jogador
    const btnRemoveJogadorCancelar = $("camp_remove_jogador_cancelar");
    if (btnRemoveJogadorCancelar) btnRemoveJogadorCancelar.addEventListener("click", closeRemoveJogadorModal);
    const btnRemoveJogadorConfirmar = $("camp_remove_jogador_confirmar");
    if (btnRemoveJogadorConfirmar) btnRemoveJogadorConfirmar.addEventListener("click", confirmRemoveJogadorModal);

    // Excluir Campanha (Mestre, na lista inicial)
    const btnDeleteCampanhaCancelar = $("camp_delete_campanha_cancelar");
    if (btnDeleteCampanhaCancelar) btnDeleteCampanhaCancelar.addEventListener("click", closeDeleteCampanhaModal);
    const btnDeleteCampanhaConfirmar = $("camp_delete_campanha_confirmar");
    if (btnDeleteCampanhaConfirmar) btnDeleteCampanhaConfirmar.addEventListener("click", confirmDeleteCampanha);

    const btnConfirmarEntrada = $("camp_btn_confirmar_entrada");
    if (btnConfirmarEntrada) btnConfirmarEntrada.addEventListener("click", confirmarEntradaConvite);

    const btnCancelarConvite = $("camp_btn_cancelar_convite");
    if (btnCancelarConvite) btnCancelarConvite.addEventListener("click", cancelarConvite);

    const btnFecharInvalido = $("camp_btn_fechar_invalido");
    if (btnFecharInvalido) btnFecharInvalido.addEventListener("click", fecharConviteInvalido);

    const btnCopiarLink = $("camp_btn_copiar_link");
    if (btnCopiarLink) {
      btnCopiarLink.addEventListener("click", async () => {
        const input = $("camp_link_input");
        try {
          await navigator.clipboard.writeText(input.value);
          if (typeof window.flashIndicator === "function") {
            window.flashIndicator("Link copiado!");
          }
        } catch (e) {
          input.select();
          document.execCommand("copy");
        }
      });
    }

    // Carrega a lista assim que o usuário clica na aba "Campanhas"
    // pela primeira vez (lazy load — não busca nada até a aba ser
    // aberta, para não fazer chamadas desnecessárias ao Supabase
    // logo na abertura do app).
    const tabBtn = document.querySelector('.tab-btn[data-tab="campanhas"]');
    if (tabBtn) {
      let loadedOnce = false;
      tabBtn.addEventListener("click", () => {
        showSubview("lista");
        if (!loadedOnce) {
          loadedOnce = true;
          loadCampaignList();
        } else {
          loadCampaignList();
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireEvents);
  } else {
    wireEvents();
  }

  // Único ponto de integração com js/supabase-auth.js (Fase C, item 6).
  // Não expõe nada além disso — supabase-auth.js não sabe nada sobre
  // subtelas/RPCs de campanha, só chama esta função depois do login.
  window.CRISCampaigns = {
    checkPendingInvite: checkPendingInvite,
    hasPendingInvite: function () { return !!getPendingInviteToken(); },
    // FASE G — usado por js/campaign-agent-view.js só para voltar à
    // sub-aba Jogadores depois que o Mestre fecha a ficha de terceiro.
    showSubtab: showCampSubtab,
  };
})();
