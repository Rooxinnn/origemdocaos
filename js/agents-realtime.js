/* ==========================================================
   C.R.I.S. — ATUALIZAÇÃO QUASE EM TEMPO REAL (Supabase Realtime)
   ==========================================================
   Arquivo isolado. Resolve o Problema 1 do pedido de correção:
   quando o Mestre edita a ficha de um jogador (ou quando a própria
   ficha é editada em outro dispositivo do dono), o dispositivo com
   a ficha aberta agora recebe a mudança sozinho, sem F5/reload/
   fechar-reabrir/logout-login.

   NÃO cria tabela, API ou backend novo. Usa exclusivamente
   Supabase Realtime (postgres_changes) sobre a tabela já existente
   public.agents, escutando eventos UPDATE.

   SEGURANÇA (instrução do prompt — "não relaxar RLS"): esta
   subscription NÃO usa nenhum filtro amplo indiscriminado. Ela é
   aberta sem filtro de linha porque o Supabase Realtime, quando RLS
   está habilitado na tabela (é o caso de public.agents — ver
   migrations/Supabase Snippet Untitled query (2).csv), avalia as
   policies de SELECT do usuário autenticado ANTES de entregar cada
   evento a esta conexão. Ou seja: mesmo sem filtro no client, o
   servidor só repassa linhas que:
     - pertencem ao próprio usuário (agents_select_campaign_master
       cobre o Mestre; "Users can view own agents" cobre o dono); ou
     - o Mestre tem acesso via campaign_characters/campaigns, quando
       ele administra a campanha à qual o agente está vinculado.
   Um agente sem vínculo de campanha e de outro dono nunca chega até
   aqui. NENHUMA policy foi relaxada ou criada para isto — é preciso
   apenas habilitar a replicação da tabela (ver
   migrations/0006_realtime_agents.sql).

   Este arquivo assume que já existem (não cria nada disso):
     window.CRISAuth.client            (js/supabase-auth.js)
     window.CRISSync.getCloudIdForLocalSheet(localId)
     window.CRISSync.applyCloudRowToLinkedLocalCopy(row)
     window.CRISSync.recordRemoteSyncForOpenSheet(localId, row)
     window.CRISCampaignAgentView.currentForeignId()/applyRemoteUpdate()
     window.applyRemoteAgentUpdateToOpenSheet(row)   (index.html)
   ========================================================== */
(function () {
  "use strict";

  function getClient() {
    if (typeof window.CRISAuth === "undefined") return null;
    if (window.CRISAuth.configError) return null;
    return window.CRISAuth.client || null;
  }

  /* ============================================================
     GERAÇÃO DE SESSÃO (mesmo princípio de supabase-sync.js/
     sync-queue.js — instrução "LOGOUT / TROCA DE CONTA"): qualquer
     evento que chegue depois de um logout, mesmo que a subscription
     ainda não tenha sido totalmente desfeita pelo navegador, é
     descartado por não bater mais com a geração atual.
     ============================================================ */
  let __generation = 0;
  let __channel = null;
  let __subscribedGeneration = null;

  // Guarda-loop ("EVITAR LOOP DE SINCRONIZAÇÃO"): o próprio Supabase
  // Realtime notifica de volta quem escreveu. Antes de tratar um evento
  // como "alteração de terceiro", conferimos se ele é só o eco do nosso
  // próprio UPDATE mais recente para aquele id (mesmo updated_at que
  // acabamos de gravar). saveAgent() (index.html) e
  // saveForeignAgentSheet() (js/campaign-agent-view.js) chamam
  // markSelfWrite() logo após um UPDATE bem-sucedido.
  const __selfWrites = Object.create(null); // cloudId -> updated_at (string ISO)

  function markSelfWrite(cloudId, updatedAt) {
    if (!cloudId || !updatedAt) return;
    __selfWrites[cloudId] = updatedAt;
  }

  function consumeSelfWriteMatch(row) {
    if (!row || !row.id) return false;
    if (__selfWrites[row.id] === row.updated_at) {
      delete __selfWrites[row.id];
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------
     Roteia um UPDATE de public.agents até quem deve reagir a ele:
       1) a ficha de TERCEIRO aberta agora pelo Mestre (se for a mesma);
       2) a ficha PRÓPRIA aberta agora (se o cloudId bater com a ficha
          local atual — dono vendo a própria ficha, inclusive quando a
          alteração veio de outro dispositivo dele mesmo, ou do Mestre);
       3) nenhuma das duas: só mantém a cópia local (se houver) em dia,
          silenciosamente, sem tocar em nenhuma tela.
     ------------------------------------------------------------ */
  async function handleAgentUpdate(row, genAtEvent) {
    if (!row || !row.id) return;
    if (consumeSelfWriteMatch(row)) return; // eco do nosso próprio salvamento — ignora

    // 1) Ficha de terceiro (Mestre editando outro jogador) aberta agora?
    if (
      window.CRISCampaignAgentView &&
      typeof window.CRISCampaignAgentView.currentForeignId === "function" &&
      window.CRISCampaignAgentView.currentForeignId() === row.id
    ) {
      window.CRISCampaignAgentView.applyRemoteUpdate(row);
      return;
    }

    // 2) Ficha própria aberta agora (currentAgentId)?
    const currentLocalId = window.currentAgentId || null;
    if (currentLocalId && window.CRISSync && typeof window.CRISSync.getCloudIdForLocalSheet === "function") {
      try {
        const openCloudId = await window.CRISSync.getCloudIdForLocalSheet(currentLocalId);
        if (genAtEvent !== __generation) return; // troca de conta no meio do caminho — descarta
        if (openCloudId && openCloudId === row.id) {
          if (typeof window.applyRemoteAgentUpdateToOpenSheet === "function") {
            await window.applyRemoteAgentUpdateToOpenSheet(row);
          }
          return;
        }
      } catch (e) {
        console.error("[CRIS Realtime] Falha ao resolver cloudId da ficha aberta:", e);
      }
    }

    // 3) Não está aberta em nenhuma das duas telas — só atualiza o cache
    // local (se este dispositivo tiver uma cópia vinculada a este id),
    // sem gerar nenhum aviso (instrução "FICHA NÃO ABERTA").
    if (window.CRISSync && typeof window.CRISSync.applyCloudRowToLinkedLocalCopy === "function") {
      try {
        await window.CRISSync.applyCloudRowToLinkedLocalCopy(row);
      } catch (e) {
        console.error("[CRIS Realtime] Falha ao atualizar cópia local em segundo plano:", e);
      }
    }
  }

  /* ------------------------------------------------------------
     start() — chamada uma vez por login (crisStartAppIfNeeded, depois
     de CRISSync.onLogin já ter isolado/carregado sheetsIndex).
     Idempotente: se já existe uma subscription para a MESMA geração
     (ex.: chamada de novo sem logout no meio), não cria uma segunda
     (instrução "MULTI-TAB" — evitar listeners duplicados dentro da
     mesma aba).
     ------------------------------------------------------------ */
  async function start() {
    const client = getClient();
    if (!client) return;

    if (__channel && __subscribedGeneration === __generation) {
      return; // já inscrito nesta sessão — não duplica
    }
    // Sessão trocou sem passar por stop() (defensivo) — garante que o
    // canal antigo não fique pendurado antes de criar um novo.
    if (__channel) {
      try { client.removeChannel(__channel); } catch (e) { /* melhor esforço */ }
      __channel = null;
    }

    const genAtStart = __generation;
    const channelName = "cris-agents-" + genAtStart + "-" + Date.now();

    try {
      __channel = client
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "agents" },
          (payload) => {
            if (genAtStart !== __generation) return; // troca de conta — ignora evento tardio
            handleAgentUpdate(payload && payload.new, genAtStart);
          }
        )
        .subscribe();
      __subscribedGeneration = genAtStart;
      console.log("[CRIS Realtime] subscription de public.agents ativa.");
    } catch (e) {
      // Nunca bloqueia o app: sem Realtime, o comportamento cai para o
      // já existente antes desta correção (sincronização manual pelo
      // botão Salvar + atualização no próximo login/abertura).
      console.error("[CRIS Realtime] Falha ao assinar Realtime de agents:", e);
      __channel = null;
      __subscribedGeneration = null;
    }
  }

  /* ------------------------------------------------------------
     stop() — chamada no logout (crisResetAppState), no mesmo ponto
     onde os demais módulos já encerram seu estado por conta
     (instrução "LOGOUT / TROCA DE CONTA"): incrementa a geração
     (qualquer evento "em voo" da conta que está saindo passa a ser
     descartado por handleAgentUpdate) e desfaz a subscription.
     ------------------------------------------------------------ */
  function stop() {
    __generation++;
    if (__channel) {
      const client = getClient();
      try {
        if (client && typeof client.removeChannel === "function") client.removeChannel(__channel);
        else if (typeof __channel.unsubscribe === "function") __channel.unsubscribe();
      } catch (e) { /* melhor esforço — a troca de geração já neutraliza eventos tardios */ }
    }
    __channel = null;
    __subscribedGeneration = null;
  }

  window.CRISAgentsRealtime = {
    start: start,
    stop: stop,
    markSelfWrite: markSelfWrite,
  };
})();
