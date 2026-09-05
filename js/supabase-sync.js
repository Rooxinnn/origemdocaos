/* ==========================================================
   C.R.I.S. — SINCRONIZAÇÃO DE FICHAS COM SUPABASE — ETAPA 2
   ==========================================================
   Arquivo isolado. Responsável SOMENTE por:
     - sincronizar fichas de agentes (public.agents) com a nuvem,
       usando o cliente Supabase já criado por js/supabase-auth.js
       (window.CRISAuth.client) — nenhuma nova instância é criada;
     - associar cada ficha local ao seu registro na nuvem através de
       um metadado local separado (agente:sheet:<id>:cloudsync), sem
       alterar sheetStorageKey()/inventoryStorageKey()/genSheetId()
       nem o formato de exportação/importação;
     - mostrar um estado discreto de sincronização (☁) e, quando
       necessário, uma faixa de migração/carregamento na tela de
       fichas — sem redesenhar a interface existente.

   NÃO mexe em storageGet/storageSet/storageListKeys/storageDeleteKey,
   em Paranormal, Backups, Dados de Interface, Minhas Criaturas,
   Dice Tray, XP ou Conexões Personalizadas. NÃO cria autosave: a
   sincronização com a nuvem só é disparada pelo botão "Salvar Ficha"
   (salvamento manual já existente) ou por uma ação explícita do
   usuário na faixa de migração/carregamento.

   Este arquivo assume que o index.html já expõe (script principal,
   carregado antes deste arquivo):
     storageGet, storageSet, sheetsIndex, sheetStorageKey(),
     inventoryStorageKey(), genSheetId(), saveSheetsIndex(),
     renderSheetCards(), flashIndicator()
   e que js/supabase-auth.js expõe window.CRISAuth.client.
   ========================================================== */

(function () {
  "use strict";

  /* ============================================================
     1) ACESSO AO CLIENTE SUPABASE (reaproveitado — Etapa 1)
     ============================================================ */
  function getClient() {
    if (typeof window.CRISAuth === "undefined") return null;
    if (window.CRISAuth.configError) return null;
    return window.CRISAuth.client || null;
  }

  async function getCurrentUser() {
    const client = getClient();
    if (!client) return null;
    try {
      const { data, error } = await client.auth.getSession();
      if (error) return null;
      return (data && data.session && data.session.user) || null;
    } catch (e) {
      return null;
    }
  }

  /* ============================================================
     1.1) ETAPA 7.1 — GERAÇÃO DE SESSÃO (mesmo princípio de
     js/sync-queue.js, adaptado a este módulo: js/sync-queue.js NÃO
     expõe sua própria __generation publicamente, então este arquivo
     mantém a sua própria — incrementada a cada logout, nunca no
     login). O download pós-login (onLogin -> downloadCloudAgentList/
     refreshLinkedCloudAgents) confere esta geração ANTES de cada
     gravação local; se ela mudou (logout/login de outra conta
     enquanto uma resposta da Conta A ainda estava "em voo"), o
     restante do fluxo é descartado sem gravar nada e sem tocar em
     UI — a resposta é simplesmente ignorada quando chega, nunca
     cancelada à força (nenhuma promise em andamento é abortada).
     ============================================================ */
  let __generation = 0;
  function currentGeneration() { return __generation; }
  function logGenStale(where) {
    console.log("[CRIS Sync] geração de sessão mudou durante '" + where + "' — resultado descartado (troca de conta em andamento).");
  }

  /* ============================================================
     2) METADADO LOCAL DE SINCRONIZAÇÃO
     ------------------------------------------------------------
     Guarda, por ficha local, qual registro de public.agents lhe
     corresponde — sem tocar no ID local (genSheetId()) nem no
     conteúdo/formato da ficha. Reaproveita storageGet/storageSet
     já existentes (mesmo mecanismo de window.storage/localStorage),
     só que numa chave própria, isolada.
     ============================================================ */
  function cloudMetaKey(localId) {
    return "agente:sheet:" + localId + ":cloudsync";
  }

  async function readCloudMeta(localId) {
    try {
      const raw = await window.storageGet(cloudMetaKey(localId));
      if (!raw) return null;
      const meta = JSON.parse(raw);
      return meta && typeof meta === "object" ? meta : null;
    } catch (e) {
      return null;
    }
  }

  async function writeCloudMeta(localId, meta) {
    try {
      await window.storageSet(cloudMetaKey(localId), JSON.stringify(meta), 1, true);
    } catch (e) {
      /* não bloqueia o fluxo — o pior caso é tentar de novo no próximo salvamento */
    }
  }

  /* ============================================================
     2.1) FASE D — RESOLUÇÃO localSheetId <-> agents.id (UUID)
     ------------------------------------------------------------
     Único ponto de leitura pública do vínculo local<->nuvem já
     mantido por este arquivo (agente:sheet:<id>:cloudsync). Nenhuma
     chave nova é criada e nenhum outro módulo precisa conhecer o
     formato "agente:sheet:...:cloudsync" — só chama estas funções.
     Usado por js/campanhas.js para nunca enviar um localSheetId a
     uma coluna UUID (campaign_characters.agent_id).
     ============================================================ */

  // localSheetId -> agents.id (UUID) ou null se a ficha ainda não
  // tiver sido sincronizada com a nuvem nenhuma vez.
  async function getCloudIdForLocalSheet(localId) {
    const meta = await readCloudMeta(localId);
    return (meta && meta.cloudId) ? meta.cloudId : null;
  }

  // agents.id (UUID) -> localSheetId, procurando entre as fichas já
  // presentes no sheetsIndex deste dispositivo. Retorna null se este
  // dispositivo ainda não tem cópia local desse agente (ex.: ficha
  // sincronizada e aberta primeiro em outro aparelho).
  async function getLocalSheetIdForCloudId(cloudId) {
    if (!cloudId) return null;
    const entries = Array.isArray(window.sheetsIndex) ? window.sheetsIndex : [];
    for (const entry of entries) {
      const meta = await readCloudMeta(entry.id);
      if (meta && meta.cloudId === cloudId) return entry.id;
    }
    return null;
  }

  /* ============================================================
     3) LOG DE ERROS SEM EXPOR DADOS SENSÍVEIS
     ============================================================ */
  function logSyncError(context, err) {
    const msg = (err && err.message) ? err.message : String(err);
    console.error("[C.R.I.S. Sync] " + context + ":", msg);
  }

  /* ============================================================
     4) INDICADOR DISCRETO DE SINCRONIZAÇÃO (☁)
     ------------------------------------------------------------
     Elemento próprio (#cloud_sync_badge), ao lado do botão
     "Salvar Ficha" — não reaproveita nem altera #save_indicator
     (usado por Agentes/Inventário/Paranormal para "Salvo"/"Erro").
     ============================================================ */
  const BADGE_STATES = {
    syncing: "☁ Sincronizando…",
    synced: "☁ Sincronizado",
    local: "☁ Salvo localmente",
    offline: "☁ Salvo localmente — sincronização indisponível",
    error: "☁ Erro de sincronização",
    conflict: "☁ Conflito de sincronização pendente",
  };

  function setBadge(state) {
    const el = document.getElementById("cloud_sync_badge");
    if (!el) return;
    if (!state) {
      el.style.display = "none";
      el.className = "cloud-sync-badge";
      el.textContent = "";
      return;
    }
    el.style.display = "inline-block";
    el.className = "cloud-sync-badge state-" + state;
    el.textContent = BADGE_STATES[state] || "";
  }

  // Atualiza o indicador ao abrir uma ficha, refletindo o último
  // estado de sincronização conhecido para ela (não faz nenhuma
  // chamada de rede — só lê o metadado local).
  //
  // ETAPA 2.3: quando a ficha está em conflito, o badge também vira
  // um atalho clicável para reabrir a interface de resolução (o
  // conflito não fica "preso" — o usuário pode resolvê-lo tanto na
  // hora (ao tentar salvar) quanto depois, reabrindo a ficha).
  async function refreshBadge(localId) {
    const el = document.getElementById("cloud_sync_badge");
    if (!localId) { setBadge(null); return; }
    const client = getClient();
    if (!client) { setBadge(null); return; }
    const meta = await readCloudMeta(localId);
    if (meta && meta.conflict) {
      setBadge("conflict");
      if (el) {
        el.style.cursor = "pointer";
        el.title = "Conflito de sincronização — clique para resolver";
        el.onclick = () => {
          if (window.CRISSyncQueue && typeof window.CRISSyncQueue.openConflict === "function") {
            window.CRISSyncQueue.openConflict("agent", localId);
          } else {
            openConflictResolution(localId);
          }
        };
      }
      return;
    }
    if (el) {
      el.style.cursor = "";
      el.title = "Estado da sincronização com a nuvem";
      el.onclick = null;
    }
    if (meta && meta.cloudId) { setBadge("synced"); return; }
    setBadge("local");
  }

  /* ============================================================
     5) SALVAMENTO NA NUVEM (chamado só pelo botão "Salvar Ficha")
     ------------------------------------------------------------
     Fluxo (instruções 8/9/10/11/20/21):
       1. o salvamento local (storageSet) já aconteceu antes de
          chegar aqui — esta função NUNCA é chamada se o
          salvamento local falhar;
       2. se não houver sessão válida ou o Supabase estiver
          indisponível, marca "offline" e retorna sem bloquear;
       3. se a ficha ainda não tem registro na nuvem, cria um
          (INSERT); se já tem, atualiza o mesmo registro (UPDATE) —
          nunca cria uma linha nova a cada salvamento;
       4. se detectar que o registro na nuvem mudou desde a última
          sincronização conhecida (provável edição em outro
          dispositivo), NÃO sobrescreve — marca conflito pendente.
     ============================================================ */
  async function syncSheetToCloud(localId, agentData) {
    const client = getClient();
    if (!client) {
      setBadge("offline");
      if (window.CRISSyncQueue) await window.CRISSyncQueue.enqueue("agent", "update", localId);
      return { ok: false, offline: true };
    }

    const user = await getCurrentUser();
    if (!user) {
      setBadge("offline");
      if (window.CRISSyncQueue) await window.CRISSyncQueue.enqueue("agent", "update", localId);
      return { ok: false, offline: true };
    }

    console.log("[CRIS Sync] Salvando ficha", localId);
    setBadge("syncing");

    // O inventário mora dentro da ficha (data.inventario) só na
    // nuvem — localmente continua em inventoryStorageKey(id),
    // sem nenhuma alteração (instrução 6).
    let inventario = [];
    try {
      const invRaw = await window.storageGet(window.inventoryStorageKey(localId));
      inventario = invRaw ? JSON.parse(invRaw) : [];
      if (!Array.isArray(inventario)) inventario = [];
    } catch (e) {
      inventario = [];
    }

    const nome = ((agentData && agentData.nome) || "").trim() || "Ficha sem nome";
    const payload = {
      user_id: user.id,
      name: nome,
      data: Object.assign({}, agentData, {
        inventario: inventario,
        localSheetId: localId,
      }),
    };

    const meta = await readCloudMeta(localId);

    try {
      if (meta && meta.cloudId) {
        console.log("[CRIS Sync] Cloud ID encontrado:", meta.cloudId);
        // ATUALIZAÇÃO (instrução 11) — mas antes verifica se o
        // registro na nuvem ainda existe e não foi alterado por
        // outra sessão desde a última sincronização (instrução 20).
        const { data: existing, error: fetchErr } = await client
          .from("agents")
          .select("id,updated_at")
          .eq("id", meta.cloudId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (fetchErr) throw fetchErr;

        if (!existing) {
          // Registro sumiu da nuvem (ex.: apagado em outro lugar) —
          // trata como primeiro salvamento, sem apagar nada local.
          return await insertNewCloudRecord(client, localId, payload);
        }

        if (
          meta.lastSyncedCloudUpdatedAt &&
          existing.updated_at &&
          existing.updated_at !== meta.lastSyncedCloudUpdatedAt
        ) {
          // Conflito: a versão na nuvem mudou desde a última vez que
          // sincronizamos esta ficha por aqui. Não sobrescreve
          // silenciosamente — marca como pendente e para.
          await writeCloudMeta(localId, Object.assign({}, meta, { conflict: true }));
          setBadge("conflict");
          console.log("[CRIS Sync] conflito detectado ao salvar:", localId);
          // ETAPA 2.3: se a ficha em conflito é a que está aberta agora
          // (é sempre o caso, já que só se chega aqui a partir do botão
          // "Salvar Ficha" da ficha aberta), mostra a interface de
          // resolução imediatamente, em vez de deixar o conflito só
          // registrado silenciosamente no badge.
          if (typeof window.currentAgentId !== "undefined" && window.currentAgentId === localId) {
            // CORREÇÃO (Etapa 6): precisa passar por CRISSyncQueue.openConflict()
            // para marcar __activeConflictEntity = "agent" no dispatcher central
            // que agora liga os botões do modal compartilhado — chamar
            // openConflictResolution() direto deixaria os cliques em
            // "Usar versão da nuvem"/"Manter minha versão" roteados para o
            // handler de outra entidade (ou para nenhum), já que só quem
            // passa por CRISSyncQueue.openConflict() atualiza esse estado.
            if (window.CRISSyncQueue && typeof window.CRISSyncQueue.openConflict === "function") {
              window.CRISSyncQueue.openConflict("agent", localId);
            } else {
              openConflictResolution(localId);
            }
          }
          return { ok: false, conflict: true };
        }

        const { data: updated, error: updErr } = await client
          .from("agents")
          .update(payload)
          .eq("id", meta.cloudId)
          .eq("user_id", user.id)
          .select("id,updated_at")
          .single();
        if (updErr) throw updErr;

        await writeCloudMeta(localId, {
          cloudId: updated.id,
          lastSyncedCloudUpdatedAt: updated.updated_at,
          lastSyncedAt: Date.now(),
        });
        console.log("[CRIS Sync] UPDATE agents concluído");
        console.log("[CRIS Sync] updated_at recebido:", updated.updated_at);
        setBadge("synced");
        return { ok: true, mode: "update" };
      }

      // PRIMEIRO SALVAMENTO NA NUVEM (instrução 10)
      return await insertNewCloudRecord(client, localId, payload);
    } catch (e) {
      logSyncError("Falha ao sincronizar ficha '" + localId + "'", e);
      setBadge("error");
      if (window.CRISSyncQueue) await window.CRISSyncQueue.enqueue("agent", "update", localId);
      return { ok: false, error: true, errorInfo: errInfo(e) };
    }
  }

  // ETAPA 6 — extrai status/code/message de um erro do supabase-js (ou de
  // uma exceção de rede pura) num formato pequeno e serializável, para a
  // fila (js/sync-queue.js) poder classificar rede/temporário/sessão
  // expirada/permanente sem precisar conhecer a forma interna do erro.
  function errInfo(e) {
    if (!e) return null;
    return {
      status: e.status || (e.originalError && e.originalError.status) || null,
      code: e.code || null,
      message: e.message || String(e),
    };
  }

  async function insertNewCloudRecord(client, localId, payload) {
    try {
      const { data: inserted, error } = await client
        .from("agents")
        .insert(payload)
        .select("id,updated_at")
        .single();
      if (error) throw error;
      await writeCloudMeta(localId, {
        cloudId: inserted.id,
        lastSyncedCloudUpdatedAt: inserted.updated_at,
        lastSyncedAt: Date.now(),
      });
      setBadge("synced");
      return { ok: true, mode: "insert" };
    } catch (e) {
      logSyncError("Falha ao criar registro na nuvem para '" + localId + "'", e);
      setBadge("error");
      if (window.CRISSyncQueue) await window.CRISSyncQueue.enqueue("agent", "create", localId);
      return { ok: false, error: true, errorInfo: errInfo(e) };
    }
  }

  /* ============================================================
     6) FAIXA DE MIGRAÇÃO/CARREGAMENTO (Casos 1–4, instruções 13–19)
     ============================================================ */
  function $(id) { return document.getElementById(id); }

  function hideBanner() {
    const el = $("cloud_sync_banner");
    if (el) { el.style.display = "none"; el.innerHTML = ""; }
  }

  function showBanner(html) {
    const el = $("cloud_sync_banner");
    if (!el) return;
    el.innerHTML = html;
    el.style.display = "block";
  }

  function renderMigrateOnlyBanner(localCount) {
    showBanner(
      '<p>Encontramos <strong>' + localCount + '</strong> ficha(s) salvas apenas neste dispositivo. ' +
      "Deseja migrá-las para a sua conta, para acessá-las de qualquer aparelho?</p>" +
      '<div class="cloud-sync-banner-actions">' +
      '<button id="cloud_sync_btn_migrate" class="primary">☁ Migrar fichas locais para a nuvem</button>' +
      '<button id="cloud_sync_btn_dismiss">Agora não</button>' +
      "</div>"
    );
    wireBannerButtons({ migrate: true });
  }

  function renderBothBanner(localCount, cloudOnlyCount) {
    const parts = [];
    parts.push(
      "<p>Encontramos fichas locais e fichas na nuvem para esta conta " +
      "(<strong>" + localCount + "</strong> local(is), <strong>" + cloudOnlyCount + "</strong> só na nuvem). " +
      "Escolha o que deseja fazer — nenhuma ficha é apagada nesse processo.</p>"
    );
    parts.push('<div class="cloud-sync-banner-actions">');
    if (cloudOnlyCount > 0) {
      parts.push('<button id="cloud_sync_btn_download" class="primary">☁ Carregar fichas da nuvem</button>');
    }
    parts.push('<button id="cloud_sync_btn_migrate">☁ Migrar fichas locais para a nuvem</button>');
    parts.push('<button id="cloud_sync_btn_dismiss">Agora não</button>');
    parts.push("</div>");
    showBanner(parts.join(""));
    wireBannerButtons({ migrate: true, download: cloudOnlyCount > 0 });
  }

  function wireBannerButtons(opts) {
    const migrateBtn = $("cloud_sync_btn_migrate");
    if (migrateBtn) {
      migrateBtn.addEventListener("click", async () => {
        migrateBtn.disabled = true;
        migrateBtn.textContent = "Migrando…";
        const res = await migrateLocalToCloud();
        hideBanner();
        if (typeof window.flashIndicator === "function") {
          // ETAPA 2.5 (instrução 3.4): nunca dizer que "tudo foi migrado"
          // se alguma ficha falhou — informa os dois números quando os
          // dois existem.
          if (res.migrated > 0 && res.failed > 0) {
            window.flashIndicator(
              "☁ " + res.migrated + " ficha(s) migrada(s) com sucesso. " + res.failed + " ficha(s) não puderam ser migradas e continuam apenas neste dispositivo.",
              true, 4200
            );
          } else if (res.migrated > 0) {
            window.flashIndicator("☁ " + res.migrated + " ficha(s) migrada(s) para a nuvem.", false, 3200);
          } else if (res.failed > 0) {
            window.flashIndicator("☁ Não foi possível migrar as fichas agora.", true, 3200);
          }
        }
        if (typeof window.renderSheetCards === "function") window.renderSheetCards();
      });
    }
    const downloadBtn = $("cloud_sync_btn_download");
    if (downloadBtn && opts && opts.download) {
      downloadBtn.addEventListener("click", async () => {
        downloadBtn.disabled = true;
        downloadBtn.textContent = "Carregando…";
        const res = await downloadUnlinkedCloudAgents();
        hideBanner();
        if (typeof window.flashIndicator === "function") {
          if (res.downloaded > 0) {
            window.flashIndicator("☁ " + res.downloaded + " ficha(s) carregada(s) da nuvem.", false, 3200);
          }
        }
        if (typeof window.renderSheetCards === "function") window.renderSheetCards();
      });
    }
    const dismissBtn = $("cloud_sync_btn_dismiss");
    if (dismissBtn) {
      dismissBtn.addEventListener("click", () => hideBanner());
    }
  }

  /* ============================================================
     7) MIGRAÇÃO: FICHA LOCAL → NUVEM (instrução 18)
     ------------------------------------------------------------
     O ID local NUNCA é apagado/alterado; a ficha local nunca é
     removida. Só cria o registro correspondente em public.agents
     (via insertNewCloudRecord — mesmo caminho do salvamento normal,
     então não duplica se já houver metadado de nuvem).
     ============================================================ */
  async function migrateLocalToCloud() {
    const client = getClient();
    const user = await getCurrentUser();
    if (!client || !user) return { migrated: 0, failed: 0 };

    const entries = Array.isArray(window.sheetsIndex) ? window.sheetsIndex.slice() : [];
    let migrated = 0;
    let failed = 0;

    for (const entry of entries) {
      const meta = await readCloudMeta(entry.id);
      if (meta && meta.cloudId) continue; // já sincronizada — não duplica

      let agentData = null;
      try {
        const raw = await window.storageGet(window.sheetStorageKey(entry.id));
        agentData = raw ? JSON.parse(raw) : null;
      } catch (e) {
        agentData = null;
      }
      if (!agentData) { failed++; continue; }

      const res = await syncSheetToCloud(entry.id, agentData);
      if (res && res.ok) migrated++; else failed++;
    }

    // Se a ficha aberta no momento faz parte da migração, atualiza o
    // indicador visível dela.
    if (typeof window.currentAgentId !== "undefined" && window.currentAgentId) {
      await refreshBadge(window.currentAgentId);
    }

    return { migrated, failed };
  }

  /* ============================================================
     8) CARREGAMENTO: NUVEM → LOCAL (instruções 15 e 19)
     ------------------------------------------------------------
     Cria fichas locais NOVAS a partir de registros da nuvem que
     ainda não têm nenhuma ficha local associada — nunca sobrescreve
     ficha local existente e nunca reassocia o mesmo registro da
     nuvem duas vezes.
     ============================================================ */
  async function fetchCloudAgents(user) {
    const client = getClient();
    if (!client || !user) return [];
    const { data, error } = await client
      .from("agents")
      .select("id,name,data,updated_at")
      .eq("user_id", user.id);
    if (error) { logSyncError("Falha ao buscar fichas da nuvem", error); return []; }
    return data || [];
  }

  async function linkedCloudIdSet() {
    const linked = new Set();
    const entries = Array.isArray(window.sheetsIndex) ? window.sheetsIndex : [];
    for (const entry of entries) {
      const meta = await readCloudMeta(entry.id);
      if (meta && meta.cloudId) linked.add(meta.cloudId);
    }
    return linked;
  }

  // ETAPA 7.1: aceita opcionalmente a geração capturada no início do
  // fluxo que chamou esta função (onLogin()). Quando não informada
  // (chamada a partir do botão da faixa de migração, fora do fluxo de
  // login), usa a geração atual — comportamento idêntico ao de antes
  // desta etapa nesse caso, já que não há login concorrente para
  // invalidar o resultado.
  async function downloadCloudAgentList(cloudAgents, genAtLogin) {
    const gen = (typeof genAtLogin === "number") ? genAtLogin : currentGeneration();
    let downloaded = 0;
    for (const cloudAgent of cloudAgents) {
      if (gen !== currentGeneration()) { logGenStale("downloadCloudAgentList (início da iteração)"); break; }

      const cloudData = (cloudAgent && cloudAgent.data && typeof cloudAgent.data === "object")
        ? cloudAgent.data
        : {};

      // separa inventário (que na nuvem mora dentro de data) do
      // restante dos campos da ficha, sem alterar o formato local.
      const inventario = Array.isArray(cloudData.inventario) ? cloudData.inventario : [];
      const agentData = Object.assign({}, cloudData);
      delete agentData.inventario;
      delete agentData.localSheetId;

      const newLocalId = window.genSheetId();
      try {
        // Confere ANTES de cada gravação local — nunca depois: uma vez
        // disparada, a chamada de storageSet já grava sob as chaves
        // fixas ativas agora (que podem já pertencer à próxima conta).
        if (gen !== currentGeneration()) { logGenStale("downloadCloudAgentList (antes de gravar ficha)"); break; }
        const okSheet = await window.storageSet(window.sheetStorageKey(newLocalId), JSON.stringify(agentData), 1, true);
        if (!okSheet) continue;

        if (gen !== currentGeneration()) { logGenStale("downloadCloudAgentList (antes de gravar inventário)"); break; }
        if (inventario.length > 0) {
          await window.storageSet(window.inventoryStorageKey(newLocalId), JSON.stringify(inventario), 1, true);
        }

        if (gen !== currentGeneration()) { logGenStale("downloadCloudAgentList (antes de gravar cloudMeta)"); break; }
        await writeCloudMeta(newLocalId, {
          cloudId: cloudAgent.id,
          lastSyncedCloudUpdatedAt: cloudAgent.updated_at,
          lastSyncedAt: Date.now(),
        });

        if (gen !== currentGeneration()) { logGenStale("downloadCloudAgentList (antes de indexar)"); break; }
        const nome = (agentData.nome || "").trim() || cloudAgent.name || "Ficha sem nome";
        window.sheetsIndex.push({ id: newLocalId, nome: nome, updatedAt: Date.now() });
        console.log("[CRIS Sync] ficha local criada:", newLocalId);
        console.log("[CRIS Sync] Download da ficha concluído");
        downloaded++;
      } catch (e) {
        logSyncError("Falha ao carregar ficha da nuvem '" + cloudAgent.id + "'", e);
      }
    }
    if (gen !== currentGeneration()) {
      // A conta ativa já não é a mesma de quando este download começou —
      // não persiste sheetsIndex (poderia misturar contas) nem reporta
      // fichas baixadas; a próxima conta segue seu próprio fluxo normal.
      return { downloaded: 0 };
    }
    if (downloaded > 0 && typeof window.saveSheetsIndex === "function") {
      await window.saveSheetsIndex();
      console.log("[CRIS Sync] sheetsIndex atualizado —", downloaded, "ficha(s)");
    }
    console.log("[CRIS Sync] carregamento concluído");
    return { downloaded: downloaded };
  }

  async function downloadUnlinkedCloudAgents() {
    const user = await getCurrentUser();
    if (!user) return { downloaded: 0 };
    const cloudAgents = await fetchCloudAgents(user);
    const linked = await linkedCloudIdSet();
    const unlinked = cloudAgents.filter((a) => !linked.has(a.id));
    return await downloadCloudAgentList(unlinked);
  }

  /* ============================================================
     8.1) ETAPA 2.2 — ATUALIZAR FICHAS JÁ VINCULADAS (pull)
     ------------------------------------------------------------
     downloadCloudAgentList() (acima) só cria fichas locais NOVAS a
     partir de registros da nuvem SEM vínculo local. Ele nunca toca
     numa ficha que já está vinculada (agente:sheet:<id>:cloudsync).
     Isso deixava um buraco no fluxo pedido na Etapa 2.2: se o
     usuário editar e salvar a MESMA ficha em outro dispositivo, o
     dispositivo original nunca recebia essa atualização — a ficha
     local ficava desatualizada para sempre, mesmo a nuvem já tendo
     a versão mais nova.

     Esta função fecha esse buraco, SEM criar autosave e SEM
     resolver conflitos: para cada ficha local já vinculada
     (meta.cloudId existe), compara o updated_at atual da nuvem com
     o último updated_at que ESTE dispositivo sincronizou
     (meta.lastSyncedCloudUpdatedAt). Só baixa quando são
     diferentes — ou seja, quando a nuvem avançou desde a última vez
     que este dispositivo leu ou gravou essa ficha.

     Isso é seguro porque, nesta arquitetura, uma ficha local só é
     alterada por ação explícita do usuário através do botão
     "Salvar Ficha", e todo "Salvar Ficha" bem-sucedido já tenta
     sincronizar com a nuvem imediatamente (syncSheetToCloud) e
     atualiza meta.lastSyncedCloudUpdatedAt na hora. Ou seja: se
     meta.lastSyncedCloudUpdatedAt ainda bate com o valor salvo
     localmente, não existe edição local "perdida" para proteger —
     a única forma de o updated_at da nuvem ter mudado é através de
     outro dispositivo.

     Fichas com meta.conflict === true são puladas aqui de propósito
     (instrução 9 da Etapa 2.2): um conflito pendente exige decisão
     do usuário, e esta função nunca decide sozinha qual versão
     prevalece.
     ============================================================ */
  async function refreshLinkedCloudAgents(cloudAgents, genAtLogin) {
    const gen = (typeof genAtLogin === "number") ? genAtLogin : currentGeneration();
    const entries = Array.isArray(window.sheetsIndex) ? window.sheetsIndex.slice() : [];
    let updated = 0;

    for (const entry of entries) {
      if (gen !== currentGeneration()) { logGenStale("refreshLinkedCloudAgents (início da iteração)"); break; }

      const meta = await readCloudMeta(entry.id);
      if (!meta || !meta.cloudId) continue; // não vinculada — fora do escopo desta função
      if (meta.conflict) continue; // conflito pendente — não decide sozinho

      const cloudAgent = cloudAgents.find((a) => a.id === meta.cloudId);
      if (!cloudAgent) continue; // registro sumiu da nuvem — não mexe no que existe localmente

      if (cloudAgent.updated_at === meta.lastSyncedCloudUpdatedAt) continue; // já em dia

      const cloudData = (cloudAgent.data && typeof cloudAgent.data === "object") ? cloudAgent.data : {};
      const inventario = Array.isArray(cloudData.inventario) ? cloudData.inventario : [];
      const agentData = Object.assign({}, cloudData);
      delete agentData.inventario;
      delete agentData.localSheetId;

      try {
        if (gen !== currentGeneration()) { logGenStale("refreshLinkedCloudAgents (antes de gravar ficha)"); break; }
        const okSheet = await window.storageSet(window.sheetStorageKey(entry.id), JSON.stringify(agentData), 1, true);
        if (!okSheet) continue;

        if (gen !== currentGeneration()) { logGenStale("refreshLinkedCloudAgents (antes de gravar inventário)"); break; }
        // Mantém o Inventário local igual ao que veio junto da ficha na
        // nuvem (instrução 8 — mesma arquitetura já usada no download
        // inicial), inclusive quando ficou vazio.
        await window.storageSet(window.inventoryStorageKey(entry.id), JSON.stringify(inventario), 1, true);

        if (gen !== currentGeneration()) { logGenStale("refreshLinkedCloudAgents (antes de gravar cloudMeta)"); break; }
        await writeCloudMeta(entry.id, {
          cloudId: cloudAgent.id,
          lastSyncedCloudUpdatedAt: cloudAgent.updated_at,
          lastSyncedAt: Date.now(),
        });

        if (gen !== currentGeneration()) { logGenStale("refreshLinkedCloudAgents (antes de atualizar índice)"); break; }
        const nome = (agentData.nome || "").trim() || cloudAgent.name || "Ficha sem nome";
        entry.nome = nome;
        entry.updatedAt = Date.now();
        console.log("[CRIS Sync] ficha atualizada da nuvem:", entry.id);
        updated++;
      } catch (e) {
        logSyncError("Falha ao atualizar ficha vinculada '" + entry.id + "'", e);
      }
    }

    if (gen !== currentGeneration()) {
      // Não persiste sheetsIndex com entradas atualizadas por uma conta
      // que já não é mais a ativa.
      return { updated: 0 };
    }
    if (updated > 0 && typeof window.saveSheetsIndex === "function") {
      await window.saveSheetsIndex();
    }
    return { updated: updated };
  }

  /* ============================================================
     8.2) ETAPA 2.3 — RESOLUÇÃO DE CONFLITOS
     ------------------------------------------------------------
     Um conflito (meta.conflict === true) é detectado em
     syncSheetToCloud() quando a nuvem mudou desde a última vez que
     este dispositivo sincronizou a ficha. Esta seção só decide o
     que fazer quando o USUÁRIO escolhe explicitamente — nunca
     sozinha (instruções 1.2/1.5/1.6).

     Os dois modais usados aqui (#cloud_conflict_modal e
     #cloud_conflict_confirm_modal) são elementos estáticos do
     index.html, com o mesmo padrão visual de .modal-overlay/
     .modal-box/.modal-actions já usado por #delete_modal e outros
     popups do projeto — nenhum CSS novo foi criado.
     ============================================================ */
  let __conflictLocalId = null;

  function clearConflictBadgeUI() {
    const el = document.getElementById("cloud_sync_badge");
    if (el) {
      el.style.cursor = "";
      el.title = "Estado da sincronização com a nuvem";
      el.onclick = null;
    }
  }

  function showConflictModal() {
    const el = document.getElementById("cloud_conflict_modal");
    if (el) el.style.display = "flex";
  }
  function hideConflictModal() {
    const el = document.getElementById("cloud_conflict_modal");
    if (el) el.style.display = "none";
  }
  function showConflictConfirmModal() {
    const el = document.getElementById("cloud_conflict_confirm_modal");
    if (el) el.style.display = "flex";
  }
  function hideConflictConfirmModal() {
    const el = document.getElementById("cloud_conflict_confirm_modal");
    if (el) el.style.display = "none";
  }

  // Ponto de entrada único para abrir a resolução de um conflito — tanto
  // logo após uma tentativa de salvar quanto depois, clicando no badge
  // ☁ de uma ficha que já estava marcada como conflitante.
  function openConflictResolution(localId) {
    if (!localId) return;
    __conflictLocalId = localId;
    showConflictModal();
  }

  // "USAR VERSÃO DA NUVEM" (instrução 1.4): baixa a versão cloud e
  // grava por cima da ficha local — preservando o mesmo localId e o
  // mesmo cloudId (nunca cria ficha nova).
  async function useCloudVersionForConflict() {
    const localId = __conflictLocalId;
    hideConflictModal();
    if (!localId) return;

    const client = getClient();
    const user = await getCurrentUser();
    if (!client || !user) {
      if (typeof window.flashIndicator === "function") window.flashIndicator("☁ Sem conexão com a nuvem agora. Tente novamente mais tarde.", true, 3200);
      return;
    }

    const meta = await readCloudMeta(localId);
    if (!meta || !meta.cloudId) { __conflictLocalId = null; return; }

    try {
      const { data: cloudAgent, error } = await client
        .from("agents")
        .select("id,name,data,updated_at")
        .eq("id", meta.cloudId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!cloudAgent) throw new Error("registro cloud não encontrado");

      const cloudData = (cloudAgent.data && typeof cloudAgent.data === "object") ? cloudAgent.data : {};
      const inventario = Array.isArray(cloudData.inventario) ? cloudData.inventario : [];
      const agentData = Object.assign({}, cloudData);
      delete agentData.inventario;
      delete agentData.localSheetId;

      const okSheet = await window.storageSet(window.sheetStorageKey(localId), JSON.stringify(agentData), 1, true);
      if (!okSheet) throw new Error("falha ao gravar ficha local");
      await window.storageSet(window.inventoryStorageKey(localId), JSON.stringify(inventario), 1, true);

      // Metadata reescrita do zero: substitui o objeto inteiro, então
      // "conflict" some naturalmente (instrução 1.4 — "limpar estado
      // de conflito").
      await writeCloudMeta(localId, {
        cloudId: cloudAgent.id,
        lastSyncedCloudUpdatedAt: cloudAgent.updated_at,
        lastSyncedAt: Date.now(),
      });

      // Atualiza sheetsIndex SEM criar entrada nova — preserva o mesmo
      // localId (instrução 1.4).
      const entries = Array.isArray(window.sheetsIndex) ? window.sheetsIndex : [];
      const idx = entries.findIndex((e) => e.id === localId);
      const nome = (agentData.nome || "").trim() || cloudAgent.name || "Ficha sem nome";
      if (idx >= 0) { entries[idx].nome = nome; entries[idx].updatedAt = Date.now(); }
      if (typeof window.saveSheetsIndex === "function") await window.saveSheetsIndex();

      // Se a ficha em conflito é a que está aberta na tela agora, recarrega
      // os campos exibidos a partir do que acabou de ser gravado — sem
      // isso, a tela continuaria mostrando os dados antigos até reabrir.
      if (typeof window.currentAgentId !== "undefined" && window.currentAgentId === localId) {
        if (typeof window.loadAgent === "function") await window.loadAgent(localId);
        if (typeof window.loadInventory === "function") await window.loadInventory(localId);
      }

      clearConflictBadgeUI();
      setBadge("synced");
      if (typeof window.renderSheetCards === "function") window.renderSheetCards();
      if (typeof window.flashIndicator === "function") window.flashIndicator("☁ Versão da nuvem aplicada.", false, 2500);
      console.log("[CRIS Sync] conflito resolvido (usou versão da nuvem):", localId);
    } catch (e) {
      logSyncError("Falha ao aplicar versão da nuvem no conflito '" + localId + "'", e);
      if (typeof window.flashIndicator === "function") window.flashIndicator("☁ Não foi possível carregar a versão da nuvem. Tente novamente.", true, 3200);
      // conflito continua pendente — não perde nada, não decide sozinho
    } finally {
      __conflictLocalId = null;
    }
  }

  // "MANTER MINHA VERSÃO" — instrução 1.5: só abre a segunda
  // confirmação; NÃO substitui nada ainda.
  function askKeepLocalVersion() {
    hideConflictModal();
    showConflictConfirmModal();
  }

  // Cancelar a segunda confirmação: o conflito continua pendente,
  // então volta para o modal principal (instrução 1.6 — nada é
  // alterado, nada é perdido).
  function cancelKeepLocalVersion() {
    hideConflictConfirmModal();
    showConflictModal();
  }

  // "SUBSTITUIR NUVEM" (segunda confirmação): só agora, de fato,
  // envia a versão local por cima da versão na nuvem (instrução 1.5).
  async function confirmKeepLocalVersion() {
    const localId = __conflictLocalId;
    hideConflictConfirmModal();
    if (!localId) return;

    const client = getClient();
    const user = await getCurrentUser();
    if (!client || !user) {
      if (typeof window.flashIndicator === "function") window.flashIndicator("☁ Sem conexão com a nuvem agora. Tente novamente mais tarde.", true, 3200);
      return;
    }

    const meta = await readCloudMeta(localId);
    if (!meta || !meta.cloudId) { __conflictLocalId = null; return; }

    // Lê a ficha local NA HORA (não usa nenhum dado guardado de antes),
    // para garantir que "minha versão" é sempre o que está gravado
    // localmente agora, mesmo que o conflito tenha sido reaberto pelo
    // badge bem depois da tentativa de salvar original.
    let agentData = null;
    try {
      const raw = await window.storageGet(window.sheetStorageKey(localId));
      agentData = raw ? JSON.parse(raw) : null;
    } catch (e) {
      agentData = null;
    }
    if (!agentData) {
      if (typeof window.flashIndicator === "function") window.flashIndicator("☁ Não foi possível ler a ficha local.", true, 3200);
      __conflictLocalId = null;
      return;
    }

    let inventario = [];
    try {
      const invRaw = await window.storageGet(window.inventoryStorageKey(localId));
      inventario = invRaw ? JSON.parse(invRaw) : [];
      if (!Array.isArray(inventario)) inventario = [];
    } catch (e) {
      inventario = [];
    }

    const nome = ((agentData && agentData.nome) || "").trim() || "Ficha sem nome";
    const payload = {
      user_id: user.id,
      name: nome,
      data: Object.assign({}, agentData, { inventario: inventario, localSheetId: localId }),
    };

    try {
      const { data: updated, error } = await client
        .from("agents")
        .update(payload)
        .eq("id", meta.cloudId)
        .eq("user_id", user.id)
        .select("id,updated_at")
        .single();
      if (error) throw error;

      // Metadata reescrita do zero: "conflict" some (instrução 1.5 —
      // "conflict removido").
      await writeCloudMeta(localId, {
        cloudId: updated.id,
        lastSyncedCloudUpdatedAt: updated.updated_at,
        lastSyncedAt: Date.now(),
      });

      clearConflictBadgeUI();
      setBadge("synced");
      if (typeof window.flashIndicator === "function") window.flashIndicator("☁ Sua versão substituiu a versão da nuvem.", false, 2500);
      console.log("[CRIS Sync] conflito resolvido (manteve versão local):", localId);
    } catch (e) {
      logSyncError("Falha ao substituir a nuvem pela versão local '" + localId + "'", e);
      // Falhou — o conflito continua pendente, exatamente como estava.
      await writeCloudMeta(localId, Object.assign({}, meta, { conflict: true }));
      setBadge("conflict");
      if (typeof window.flashIndicator === "function") window.flashIndicator("☁ Não foi possível substituir a versão da nuvem. Tente novamente.", true, 3200);
    } finally {
      __conflictLocalId = null;
    }
  }

  // ETAPA 6: os dois modais estáticos (#cloud_conflict_modal /
  // #cloud_conflict_confirm_modal) agora são compartilhados com
  // Criaturas e Conexões Personalizadas (ver js/sync-queue.js) — quem
  // liga os cliques dos botões passou a ser o dispatcher central, para
  // nunca ter dois addEventListener concorrentes no mesmo botão. O
  // COMPORTAMENTO de Agentes em si (as 4 funções abaixo) não mudou em
  // nada — só quem chama essas funções ao clicar mudou de lugar.
  // Se por algum motivo js/sync-queue.js não tiver carregado (defeito
  // de rede ao servir o arquivo, por exemplo), cai no binding direto de
  // antes, para nunca deixar a resolução de conflito de Agentes quebrada.
  function wireConflictModals() {
    if (window.CRISSyncQueue && typeof window.CRISSyncQueue.registerConflictHandlers === "function") {
      window.CRISSyncQueue.registerConflictHandlers("agent", {
        open: openConflictResolution,
        useCloud: useCloudVersionForConflict,
        keepLocal: askKeepLocalVersion,
        cancelKeepLocal: cancelKeepLocalVersion,
        confirmKeepLocal: confirmKeepLocalVersion,
      });
      return;
    }
    const useCloudBtn = document.getElementById("cloud_conflict_use_cloud");
    if (useCloudBtn) useCloudBtn.addEventListener("click", () => { useCloudVersionForConflict(); });
    const keepLocalBtn = document.getElementById("cloud_conflict_keep_local");
    if (keepLocalBtn) keepLocalBtn.addEventListener("click", () => { askKeepLocalVersion(); });
    const confirmCancelBtn = document.getElementById("cloud_conflict_confirm_cancel");
    if (confirmCancelBtn) confirmCancelBtn.addEventListener("click", () => { cancelKeepLocalVersion(); });
    const confirmReplaceBtn = document.getElementById("cloud_conflict_confirm_replace");
    if (confirmReplaceBtn) confirmReplaceBtn.addEventListener("click", () => { confirmKeepLocalVersion(); });
  }

  /* ============================================================
     8.4) ETAPA 6 — ADAPTER DA FILA DE SINCRONIZAÇÃO
     ------------------------------------------------------------
     sync(localId): relê a ficha (e o inventário) local NA HORA —
     nunca reenvia um payload "congelado" de quando a operação foi
     enfileirada — e chama syncSheetToCloud(), que já decide sozinho
     INSERT vs UPDATE vs conflito. del(localId): chama
     deleteCloudSheet() (idempotente: se a ficha nunca teve vínculo
     cloud, retorna ok imediatamente sem nenhuma chamada de rede —
     é assim que um CREATE+DELETE offline nunca chega a existir na
     nuvem, sem precisar de lógica extra aqui) e, em caso de
     sucesso, também limpa o metadado de vínculo local.
     ============================================================ */
  async function queueSync(localId) {
    let agentData = null;
    try {
      const raw = await window.storageGet(window.sheetStorageKey(localId));
      agentData = raw ? JSON.parse(raw) : null;
    } catch (e) { agentData = null; }
    if (!agentData) {
      // Ficha local não existe mais (ex.: foi excluída depois de um
      // UPDATE ter sido enfileirado, mas antes de sincronizar — o
      // enqueue() da fila já substitui UPDATE por DELETE nesse caso,
      // então isto só aconteceria por uma inconsistência externa).
      // Trata como sucesso silencioso: não há mais nada para enviar.
      return { ok: true, skipped: true };
    }
    return await syncSheetToCloud(localId, agentData);
  }

  async function queueDelete(localId) {
    const res = await deleteCloudSheet(localId);
    if (res && res.ok) {
      await deleteCloudMeta(localId);
    }
    return res;
  }

  if (window.CRISSyncQueue && typeof window.CRISSyncQueue.registerAdapter === "function") {
    window.CRISSyncQueue.registerAdapter("agent", { sync: queueSync, del: queueDelete });
  }

  /* ============================================================
     8.3) ETAPA 2.4 — EXCLUSÃO SINCRONIZADA
     ------------------------------------------------------------
     Chamada a partir do handler existente de #delete_confirm em
     index.html, ANTES de qualquer remoção local (instrução 2.4 —
     nunca perder a ficha local por causa de uma falha de rede).
     ============================================================ */
  async function deleteCloudSheet(localId) {
    const meta = await readCloudMeta(localId);

    if (!meta || !meta.cloudId) {
      // Nunca teve vínculo com a nuvem — nada a apagar em agents.
      return { ok: true, hadCloud: false };
    }

    const client = getClient();
    const user = await getCurrentUser();
    if (!client || !user) {
      // Sem sessão/Supabase agora: não há como confirmar a exclusão
      // cloud, então NÃO decide sozinho — instrução 2.4.
      return { ok: false, hadCloud: true, offline: true };
    }

    try {
      // .eq("user_id", user.id) é redundância proposital em cima do
      // RLS (instrução 2.3) — o DELETE nunca deve depender só da
      // policy do banco para não atingir fichas de outro usuário.
      const { error } = await client
        .from("agents")
        .delete()
        .eq("id", meta.cloudId)
        .eq("user_id", user.id);
      if (error) throw error;
      console.log("[CRIS Sync] DELETE agents concluído:", meta.cloudId);
      return { ok: true, hadCloud: true };
    } catch (e) {
      logSyncError("Falha ao excluir ficha na nuvem '" + localId + "'", e);
      return { ok: false, hadCloud: true, error: true, errorInfo: errInfo(e) };
    }
  }

  // Remove só o metadado de vínculo cloud desta ficha
  // (agente:sheet:<id>:cloudsync) — chamado pelo index.html depois que
  // deleteCloudSheet() confirma sucesso (ou confirma que nunca houve
  // vínculo). Não mexe em mais nenhuma chave.
  async function deleteCloudMeta(localId) {
    try {
      if (typeof window.storageDeleteKey === "function") {
        await window.storageDeleteKey(cloudMetaKey(localId));
      }
    } catch (e) {
      /* não bloqueia a exclusão local */
    }
  }


  /* ============================================================
     9) PONTO DE ENTRADA CHAMADO APÓS LOGIN (instruções 13–17)
     ------------------------------------------------------------
     Chamado a partir de crisStartAppIfNeeded() (index.html), depois
     que loadSheetsIndex()/migrateLegacySheetIfNeeded() já rodaram —
     nunca sobrescreve fichas locais automaticamente; só decide se
     mostra a faixa de migração/carregamento ou baixa
     automaticamente no caso trivial (nuvem > 0, local = 0).
     ============================================================ */
  async function onLogin() {
    // ETAPA 7.1 — captura a geração no início do fluxo. Se, em qualquer
    // ponto depois de um await, ela não bater mais com currentGeneration()
    // (logout ocorreu -> resetOnLogout() incrementou a geração), o
    // restante deste onLogin() é abandonado: nenhuma gravação local,
    // nenhuma alteração de UI de migração/faixa relacionada à conta
    // antiga. O novo login (que já está chamando seu próprio onLogin())
    // segue seu curso normalmente, sem interferência.
    const genAtLogin = currentGeneration();

    hideBanner();
    console.log("[CRIS Sync] onLogin iniciado");

    const client = getClient();
    if (!client) return; // Supabase indisponível — segue 100% local (instrução 21)

    const user = await getCurrentUser();
    if (genAtLogin !== currentGeneration()) { logGenStale("onLogin (getCurrentUser)"); return; }
    if (!user) return;
    console.log("[CRIS Sync] usuário autenticado: SIM");
    console.log("[CRIS Sync] user.id:", user.id);

    console.log("[CRIS Sync] buscando agents");
    const cloudAgents = await fetchCloudAgents(user);
    if (genAtLogin !== currentGeneration()) { logGenStale("onLogin (fetchCloudAgents)"); return; }
    console.log("[CRIS Sync] fichas cloud encontradas:", cloudAgents.length);
    const linked = await linkedCloudIdSet();
    if (genAtLogin !== currentGeneration()) { logGenStale("onLogin (linkedCloudIdSet)"); return; }
    const unlinkedCloud = cloudAgents.filter((a) => !linked.has(a.id));

    const localCount = Array.isArray(window.sheetsIndex) ? window.sheetsIndex.length : 0;
    const cloudCount = cloudAgents.length;
    console.log("[CRIS Sync] fichas locais:", localCount, "| sem vínculo local:", unlinkedCloud.length);

    // Etapa 2.2: antes de decidir qual dos 4 casos abaixo se aplica,
    // atualiza as fichas que já estão vinculadas e cuja versão na nuvem
    // avançou desde o último save/download deste dispositivo (ex.: a
    // mesma ficha foi editada e salva em outro navegador). Isso não
    // interfere na contagem de localCount/cloudCount nem no restante do
    // fluxo — só mantém em dia o que já era vinculado.
    const refreshRes = await refreshLinkedCloudAgents(cloudAgents, genAtLogin);
    if (genAtLogin !== currentGeneration()) { logGenStale("onLogin (refreshLinkedCloudAgents)"); return; }
    if (refreshRes.updated > 0) {
      console.log("[CRIS Sync] fichas vinculadas atualizadas da nuvem:", refreshRes.updated);
      if (typeof window.flashIndicator === "function") {
        window.flashIndicator("☁ " + refreshRes.updated + " ficha(s) atualizada(s) da nuvem.", false, 3200);
      }
    }

    if (cloudCount === 0 && localCount === 0) {
      return; // Caso 1 — usuário novo, nada a fazer
    }

    if (cloudCount > 0 && localCount === 0) {
      // Caso 2 — não há nenhuma ficha local para entrar em conflito,
      // então carregar as fichas da nuvem é seguro e direto.
      await downloadCloudAgentList(unlinkedCloud, genAtLogin);
      if (genAtLogin !== currentGeneration()) { logGenStale("onLogin (pós-download, Caso 2)"); return; }
      if (typeof window.renderSheetCards === "function") window.renderSheetCards();
      return;
    }

    if (cloudCount === 0 && localCount > 0) {
      if (genAtLogin !== currentGeneration()) { logGenStale("onLogin (pré-faixa, Caso 3)"); return; }
      renderMigrateOnlyBanner(localCount); // Caso 3
      return;
    }

    // Caso 4 — cloud > 0 e local > 0: nunca decide sozinho.
    if (genAtLogin !== currentGeneration()) { logGenStale("onLogin (pré-faixa, Caso 4)"); return; }
    renderBothBanner(localCount, unlinkedCloud.length);
  }

  // ETAPA 7.1 — chamado a partir de window.crisResetAppState() (logout),
  // no mesmo ponto onde js/sync-queue.js e js/character-connections.js já
  // são avisados do logout. Incrementa a geração (qualquer onLogin() desta
  // conta ainda "em voo" passa a descartar seu resultado ao chegar) e
  // esconde a faixa de migração/carregamento, que se referia à conta que
  // acabou de sair. NÃO apaga nenhuma ficha local nem metadado de
  // vínculo — só evita que um resultado tardio da conta anterior seja
  // gravado ou exibido para a próxima conta.
  function resetOnLogout() {
    __generation++;
    hideBanner();
    setBadge(null);
  }

  /* ============================================================
     10) EXPOSIÇÃO PÚBLICA
     ============================================================ */
  window.CRISSync = {
    onLogin: onLogin,
    resetOnLogout: resetOnLogout,
    syncSheetToCloud: syncSheetToCloud,
    refreshBadge: refreshBadge,
    migrateLocalToCloud: migrateLocalToCloud,
    downloadUnlinkedCloudAgents: downloadUnlinkedCloudAgents,
    refreshLinkedCloudAgents: refreshLinkedCloudAgents,
    deleteCloudSheet: deleteCloudSheet,
    deleteCloudMeta: deleteCloudMeta,
    openConflictResolution: openConflictResolution,
    getCloudIdForLocalSheet: getCloudIdForLocalSheet,
    getLocalSheetIdForCloudId: getLocalSheetIdForCloudId,
  };

  wireConflictModals();
})();
