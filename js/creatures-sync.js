/* ==========================================================
   C.R.I.S. — SINCRONIZAÇÃO DE CRIATURAS COM SUPABASE — ETAPA 5.2B
   ==========================================================
   Arquivo isolado. Responsável SOMENTE por:
     - sincronizar "Minhas Criaturas" (public.creatures) com a nuvem,
       usando o cliente já criado por js/supabase-auth.js
       (window.CRISAuth.client) — nenhuma nova instância é criada;
     - o ID cloud de cada criatura é EXATAMENTE o mesmo ID local já
       usado por criatura:sheet:<id> ("criatura_..."). NÃO existe
       cloudId separado, NÃO existe uuid, NÃO existe tabela de
       mapeamento local↔cloud (diferente do padrão de Agentes).

   NÃO reescreve js/criaturas.js. NÃO altera as chaves locais
   existentes (criaturas:index, criatura:sheet:<id>), o formato de
   "data" (mapa campo do DOM → valor) nem nenhuma mecânica/regra da
   ficha. NÃO mexe em Agentes, Personalizadas, Backup, Paranormal,
   XP ou account-isolation.js.

   Metadado próprio por criatura (cai dentro do prefixo
   "criatura:sheet:" já coberto pelo isolamento de contas da Etapa
   5.1 — nenhuma alteração necessária em account-isolation.js):
     criatura:sheet:<id>:cloudsync ->
       { existsCloud, lastSyncedCloudUpdatedAt, lastSyncedAt,
         pendingSync, conflict }

   Este arquivo assume que index.html já expõe (script principal,
   carregado antes deste arquivo):
     storageGet, storageSet, storageDeleteKey, flashIndicator
   e que js/supabase-auth.js expõe window.CRISAuth.client.
   Não depende de nenhuma variável interna de js/criaturas.js —
   lê/escreve as mesmas chaves fixas diretamente.
   ========================================================== */
(function () {
  "use strict";

  const CR_INDEX_KEY = "criaturas:index";
  function crSheetKey(id) { return "criatura:sheet:" + id; }
  function cloudMetaKey(id) { return "criatura:sheet:" + id + ":cloudsync"; }

  /* ============================================================
     0.1) ETAPA 7.1 — GERAÇÃO DE SESSÃO (mesmo princípio adotado em
     js/supabase-sync.js e originado em js/sync-queue.js — geração
     própria deste módulo, incrementada só no logout, nunca no login;
     onLogin() confere antes de cada gravação local e descarta o
     restante do fluxo sem gravar nada se a conta ativa já mudou).
     ============================================================ */
  let __generation = 0;
  function currentGeneration() { return __generation; }
  function logGenStale(where) {
    console.log("[C.R.I.S. Criaturas Sync] geração de sessão mudou durante '" + where + "' — resultado descartado (troca de conta em andamento).");
  }

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

  function logSyncError(context, err) {
    const msg = (err && err.message) ? err.message : String(err);
    console.error("[C.R.I.S. Criaturas Sync] " + context + ":", msg);
  }

  /* ============================================================
     2) STORAGE LOCAL (chaves fixas — sem depender de criaturas.js)
     ============================================================ */
  async function loadLocalIndex() {
    try {
      const raw = await window.storageGet(CR_INDEX_KEY);
      if (!raw) return [];
      const idx = JSON.parse(raw);
      return Array.isArray(idx) ? idx : [];
    } catch (e) {
      return [];
    }
  }
  async function saveLocalIndex(idx) {
    await window.storageSet(CR_INDEX_KEY, JSON.stringify(idx), 1, true);
  }
  async function loadLocalSheetData(id) {
    try {
      const raw = await window.storageGet(crSheetKey(id));
      if (!raw) return null;
      const data = JSON.parse(raw);
      return (data && typeof data === "object") ? data : null;
    } catch (e) {
      return null;
    }
  }
  async function saveLocalSheetData(id, dataObj) {
    await window.storageSet(crSheetKey(id), JSON.stringify(dataObj || {}), 1, true);
  }
  async function readCloudMeta(id) {
    try {
      const raw = await window.storageGet(cloudMetaKey(id));
      if (!raw) return null;
      const meta = JSON.parse(raw);
      return (meta && typeof meta === "object") ? meta : null;
    } catch (e) {
      return null;
    }
  }
  async function writeCloudMeta(id, meta) {
    try {
      await window.storageSet(cloudMetaKey(id), JSON.stringify(meta), 1, true);
    } catch (e) { /* não bloqueia o fluxo local */ }
  }
  async function deleteCloudMeta(id) {
    try {
      if (typeof window.storageDeleteKey === "function") {
        await window.storageDeleteKey(cloudMetaKey(id));
      }
    } catch (e) { /* não bloqueia */ }
  }

  /* ============================================================
     3) INDICADOR DISCRETO DE SINCRONIZAÇÃO (☁) — tela da ficha
     ------------------------------------------------------------
     Elemento próprio (#creature_cloud_sync_badge), nunca o
     #cloud_sync_badge dos Agentes.
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
    const el = document.getElementById("creature_cloud_sync_badge");
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
  // Só lê o metadado local — nunca faz chamada de rede.
  // ETAPA 6: assim como o badge de Agentes, quando há conflito pendente
  // o badge vira um atalho clicável para reabrir a resolução explícita.
  async function refreshBadge(localId) {
    const el = document.getElementById("creature_cloud_sync_badge");
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
            window.CRISSyncQueue.openConflict("creature", localId);
          } else {
            openConflictResolution(localId);
          }
        };
      }
      return;
    }
    if (el) { el.style.cursor = ""; el.title = "Estado da sincronização com a nuvem"; el.onclick = null; }
    const pending = window.CRISSyncQueue ? await window.CRISSyncQueue.getPendingForEntity("creature", localId) : null;
    if (pending) { setBadge(navigator.onLine ? "error" : "offline"); return; }
    if (meta && meta.existsCloud && !meta.pendingSync) { setBadge("synced"); return; }
    if (meta && meta.pendingSync) { setBadge("error"); return; }
    setBadge("local");
  }

  /* ============================================================
     4) FAIXA DE MIGRAÇÃO — só para criaturas locais sem vínculo
        cloud (nunca migração automática/silenciosa)
     ============================================================ */
  function $(id) { return document.getElementById(id); }
  function hideBanner() {
    const el = $("creature_cloud_sync_banner");
    if (el) { el.style.display = "none"; el.innerHTML = ""; }
  }
  function showBanner(html) {
    const el = $("creature_cloud_sync_banner");
    if (!el) return;
    el.innerHTML = html;
    el.style.display = "block";
  }
  function renderMigrateOnlyBanner(count) {
    showBanner(
      "<p>Encontramos <strong>" + count + "</strong> criatura(s) salva(s) apenas neste dispositivo. " +
      "Deseja migrá-las para a sua conta, para acessá-las de qualquer aparelho?</p>" +
      '<div class="cloud-sync-banner-actions">' +
      '<button id="creature_cloud_sync_btn_migrate" class="primary">☁ Migrar criaturas locais para a nuvem</button>' +
      '<button id="creature_cloud_sync_btn_dismiss">Agora não</button>' +
      "</div>"
    );
    const migrateBtn = $("creature_cloud_sync_btn_migrate");
    if (migrateBtn) {
      migrateBtn.addEventListener("click", async () => {
        migrateBtn.disabled = true;
        migrateBtn.textContent = "Migrando…";
        const res = await migrateAllLocalOnlyToCloud();
        hideBanner();
        if (typeof window.flashIndicator === "function") {
          if (res.migrated > 0 && res.failed > 0) {
            window.flashIndicator("☁ " + res.migrated + " criatura(s) migrada(s). " + res.failed + " não puderam ser migradas e continuam apenas neste dispositivo.", true, 4200);
          } else if (res.migrated > 0) {
            window.flashIndicator("☁ " + res.migrated + " criatura(s) migrada(s) para a nuvem.", false, 3200);
          } else if (res.failed > 0) {
            window.flashIndicator("☁ Não foi possível migrar as criaturas agora.", true, 3200);
          }
        }
        if (typeof window.renderCreatureListIfVisible === "function") window.renderCreatureListIfVisible();
      });
    }
    const dismissBtn = $("creature_cloud_sync_btn_dismiss");
    if (dismissBtn) dismissBtn.addEventListener("click", () => hideBanner());
  }

  async function migrateAllLocalOnlyToCloud() {
    const client = getClient();
    const user = await getCurrentUser();
    if (!client || !user) return { migrated: 0, failed: 0 };
    const idx = await loadLocalIndex();
    let migrated = 0, failed = 0;
    for (const entry of idx) {
      const meta = await readCloudMeta(entry.id);
      if (meta && meta.existsCloud) continue; // já vinculada
      const data = await loadLocalSheetData(entry.id);
      const res = await syncCreatureToCloud(entry.id, entry.nome || "Criatura sem nome", data || {});
      if (res && res.ok) migrated++; else failed++;
    }
    return { migrated, failed };
  }

  /* ============================================================
     5) CRIAÇÃO / EDIÇÃO — INSERT ou UPDATE com checagem de conflito
     ------------------------------------------------------------
     Chamado só DEPOIS que o salvamento local já aconteceu com
     sucesso (nunca é chamado se o storageSet local falhar).
       - Se a criatura nunca teve registro cloud (existsCloud
         ausente/false): tenta INSERT.
       - Se já teve: antes de sobrescrever, confere se o
         updated_at da nuvem mudou desde a última sincronização
         conhecida. Se mudou (edição em outro dispositivo), NÃO
         sobrescreve — marca conflito pendente e preserva os dois
         lados (Etapa 6 resolve a UI de conflito).
     Nunca lança: qualquer falha de rede marca pendingSync e
     retorna { ok:false }, sem apagar nada local.
     ============================================================ */
  function errInfo(e) {
    if (!e) return null;
    return { status: e.status || (e.originalError && e.originalError.status) || null, code: e.code || null, message: e.message || String(e) };
  }

  async function syncCreatureToCloud(localId, name, dataObj) {
    const client = getClient();
    if (!client) {
      setBadge("offline");
      if (window.CRISSyncQueue) await window.CRISSyncQueue.enqueue("creature", "update", localId);
      return { ok: false, offline: true };
    }
    const user = await getCurrentUser();
    if (!user) {
      setBadge("offline");
      if (window.CRISSyncQueue) await window.CRISSyncQueue.enqueue("creature", "update", localId);
      return { ok: false, offline: true };
    }

    setBadge("syncing");
    const meta = await readCloudMeta(localId);
    const safeName = (name || "").trim() || "Criatura sem nome";
    const safeData = dataObj && typeof dataObj === "object" ? dataObj : {};

    if (!meta || !meta.existsCloud) {
      // Nunca sincronizada — tenta criar o registro cloud com o
      // MESMO id local (nunca um id novo/uuid).
      try {
        const { data: inserted, error } = await client
          .from("creatures")
          .insert({ id: localId, user_id: user.id, name: safeName, data: safeData })
          .select("id,updated_at")
          .single();
        if (error) throw error;
        await writeCloudMeta(localId, {
          existsCloud: true,
          lastSyncedCloudUpdatedAt: inserted.updated_at,
          lastSyncedAt: Date.now(),
          pendingSync: false,
          conflict: false,
        });
        setBadge("synced");
        return { ok: true, mode: "insert" };
      } catch (e) {
        // Pode já existir um registro cloud com este id (ex.: meta
        // local perdida). Tenta recuperar via UPDATE antes de desistir.
        try {
          const { data: updated, error: updErr } = await client
            .from("creatures")
            .update({ name: safeName, data: safeData })
            .eq("id", localId)
            .eq("user_id", user.id)
            .select("id,updated_at")
            .single();
          if (updErr) throw updErr;
          await writeCloudMeta(localId, {
            existsCloud: true,
            lastSyncedCloudUpdatedAt: updated.updated_at,
            lastSyncedAt: Date.now(),
            pendingSync: false,
            conflict: false,
          });
          setBadge("synced");
          return { ok: true, mode: "update-recovered" };
        } catch (e2) {
          logSyncError("Falha ao criar registro cloud para '" + localId + "'", e2);
          await writeCloudMeta(localId, Object.assign({}, meta, { pendingSync: true }));
          setBadge("error");
          if (window.CRISSyncQueue) await window.CRISSyncQueue.enqueue("creature", "create", localId);
          return { ok: false, error: true, errorInfo: errInfo(e2) };
        }
      }
    }

    // Já tem vínculo cloud: confere se a versão da nuvem mudou desde
    // a última sincronização conhecida ANTES de sobrescrever.
    try {
      const { data: current, error: selErr } = await client
        .from("creatures")
        .select("id,updated_at")
        .eq("id", localId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (selErr) throw selErr;

      if (!current) {
        // Registro cloud sumiu (ex.: apagado em outro dispositivo).
        // Recria com o mesmo id, sem inventar outro.
        const { data: inserted, error: insErr } = await client
          .from("creatures")
          .insert({ id: localId, user_id: user.id, name: safeName, data: safeData })
          .select("id,updated_at")
          .single();
        if (insErr) throw insErr;
        await writeCloudMeta(localId, {
          existsCloud: true,
          lastSyncedCloudUpdatedAt: inserted.updated_at,
          lastSyncedAt: Date.now(),
          pendingSync: false,
          conflict: false,
        });
        setBadge("synced");
        return { ok: true, mode: "recreated" };
      }

      if (meta.lastSyncedCloudUpdatedAt && current.updated_at !== meta.lastSyncedCloudUpdatedAt) {
        // A nuvem mudou desde a última sincronização conhecida deste
        // dispositivo (provável edição em outro aparelho). Nunca
        // sobrescreve silenciosamente — preserva os dois lados.
        await writeCloudMeta(localId, Object.assign({}, meta, { conflict: true, pendingSync: false }));
        setBadge("conflict");
        // ETAPA 6: em vez de só avisar, abre a mesma resolução explícita
        // já usada por Agentes (reaproveitando o modal compartilhado —
        // ver js/sync-queue.js). syncCreatureToCloud só é chamado logo
        // após uma ação explícita do usuário (criar/salvar/duplicar), então
        // a criatura em conflito é sempre a que acabou de ser mexida.
        if (window.CRISSyncQueue && typeof window.CRISSyncQueue.openConflict === "function") {
          window.CRISSyncQueue.openConflict("creature", localId);
        } else if (typeof window.flashIndicator === "function") {
          window.flashIndicator("☁ Esta criatura foi alterada em outro dispositivo. Abra a ficha dela para escolher qual versão manter.", true, 4200);
        }
        return { ok: false, conflict: true };
      }

      const { data: updated, error: updErr } = await client
        .from("creatures")
        .update({ name: safeName, data: safeData })
        .eq("id", localId)
        .eq("user_id", user.id)
        .select("id,updated_at")
        .single();
      if (updErr) throw updErr;
      await writeCloudMeta(localId, {
        existsCloud: true,
        lastSyncedCloudUpdatedAt: updated.updated_at,
        lastSyncedAt: Date.now(),
        pendingSync: false,
        conflict: false,
      });
      setBadge("synced");
      return { ok: true, mode: "update" };
    } catch (e) {
      logSyncError("Falha ao sincronizar criatura '" + localId + "'", e);
      await writeCloudMeta(localId, Object.assign({}, meta, { pendingSync: true }));
      setBadge("error");
      if (window.CRISSyncQueue) await window.CRISSyncQueue.enqueue("creature", "update", localId);
      return { ok: false, error: true, errorInfo: errInfo(e) };
    }
  }

  /* ============================================================
     6) EXCLUSÃO SINCRONIZADA
     ------------------------------------------------------------
     Chamada ANTES de qualquer remoção local. Nunca decide sozinho:
       - nunca teve vínculo cloud -> ok, segue exclusão local normal;
       - tem vínculo mas não há sessão/cliente agora (ex.: offline) ->
         bloqueia a exclusão local para não perder consistência —
         a criatura é preservada dos dois lados;
       - tem vínculo, sessão válida, DELETE falha -> idem, preserva;
       - DELETE cloud bem-sucedido -> ok, segue exclusão local e
         o metadado :cloudsync desta criatura é removido depois.
     Sempre filtra por id + user_id (redundância proposital sobre a
     RLS): uma conta nunca pode excluir registro de outra.
     ============================================================ */
  async function deleteCreatureCloud(localId) {
    const meta = await readCloudMeta(localId);
    if (!meta || !meta.existsCloud) {
      return { ok: true, hadCloud: false };
    }
    const client = getClient();
    const user = await getCurrentUser();
    if (!client || !user) {
      return { ok: false, hadCloud: true, offline: true };
    }
    try {
      const { error } = await client
        .from("creatures")
        .delete()
        .eq("id", localId)
        .eq("user_id", user.id);
      if (error) throw error;
      return { ok: true, hadCloud: true };
    } catch (e) {
      logSyncError("Falha ao excluir criatura na nuvem '" + localId + "'", e);
      return { ok: false, hadCloud: true, error: true, errorInfo: errInfo(e) };
    }
  }

  /* ============================================================
     7) LOGIN — comparação cloud × local (nunca mistura contas)
     ------------------------------------------------------------
     A consulta já filtra por user_id (redundância sobre a RLS —
     nunca "select tudo e filtra no JS"). Casos:
       - cloud-only  -> download automático e seguro (não há dado
         local para entrar em conflito, mesmo critério já usado
         para Agentes no Caso 2);
       - local-only  -> NUNCA migração automática — mostra a faixa
         pedindo confirmação explícita do usuário;
       - linked      -> se o updated_at conhecido bater com o da
         nuvem, nada a fazer; se não bater (ou não houver
         metadado confiável), marca conflito em vez de decidir
         sozinho qual versão "vence".
     ============================================================ */
  async function fetchCloudCreatures(user) {
    const client = getClient();
    try {
      const { data, error } = await client
        .from("creatures")
        .select("id,name,data,updated_at")
        .eq("user_id", user.id);
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (e) {
      logSyncError("Falha ao buscar criaturas na nuvem", e);
      return [];
    }
  }

  async function onLogin() {
    // ETAPA 7.1 — mesma proteção aplicada a CRISSync.onLogin(): captura a
    // geração no início; se ela mudar (logout -> resetOnLogout()) em
    // qualquer ponto depois de um await, o restante é abandonado sem
    // gravar/renderizar nada relacionado à conta que já saiu.
    const genAtLogin = currentGeneration();

    hideBanner();
    const client = getClient();
    if (!client) return; // Supabase indisponível — segue 100% local
    const user = await getCurrentUser();
    if (genAtLogin !== currentGeneration()) { logGenStale("onLogin (getCurrentUser)"); return; }
    if (!user) return;

    const cloudCreatures = await fetchCloudCreatures(user);
    if (genAtLogin !== currentGeneration()) { logGenStale("onLogin (fetchCloudCreatures)"); return; }
    const localIndex = await loadLocalIndex();
    if (genAtLogin !== currentGeneration()) { logGenStale("onLogin (loadLocalIndex)"); return; }
    const localIds = new Set(localIndex.map((e) => e.id));
    const cloudIds = new Set(cloudCreatures.map((c) => c.id));

    // --- cloud-only: baixa automaticamente (seguro, nada local em risco) ---
    const cloudOnly = cloudCreatures.filter((c) => !localIds.has(c.id));
    if (cloudOnly.length > 0) {
      for (const c of cloudOnly) {
        // Confere ANTES de cada gravação — nunca depois: a chamada de
        // storageSet já grava sob as chaves fixas ativas agora.
        if (genAtLogin !== currentGeneration()) { logGenStale("onLogin (cloud-only, antes de gravar criatura)"); break; }
        await saveLocalSheetData(c.id, c.data || {});

        if (genAtLogin !== currentGeneration()) { logGenStale("onLogin (cloud-only, antes de indexar)"); break; }
        localIndex.push({
          id: c.id,
          nome: c.name || "Criatura sem nome",
          updatedAt: c.updated_at ? Date.parse(c.updated_at) || Date.now() : Date.now(),
        });

        if (genAtLogin !== currentGeneration()) { logGenStale("onLogin (cloud-only, antes de gravar cloudMeta)"); break; }
        await writeCloudMeta(c.id, {
          existsCloud: true,
          lastSyncedCloudUpdatedAt: c.updated_at,
          lastSyncedAt: Date.now(),
          pendingSync: false,
          conflict: false,
        });
      }
      if (genAtLogin !== currentGeneration()) { logGenStale("onLogin (pós cloud-only)"); return; }
      await saveLocalIndex(localIndex);
      if (typeof window.flashIndicator === "function") {
        window.flashIndicator("☁ " + cloudOnly.length + " criatura(s) carregada(s) da nuvem.", false, 3200);
      }
      if (typeof window.renderCreatureListIfVisible === "function") window.renderCreatureListIfVisible();
    }

    if (genAtLogin !== currentGeneration()) { logGenStale("onLogin (antes da seção 'linked')"); return; }

    // --- linked: nunca sobrescreve silenciosamente ---
    const cloudById = {};
    cloudCreatures.forEach((c) => { cloudById[c.id] = c; });
    for (const entry of localIndex) {
      if (genAtLogin !== currentGeneration()) { logGenStale("onLogin (linked, início da iteração)"); break; }
      if (!cloudIds.has(entry.id)) continue;
      const c = cloudById[entry.id];
      const meta = await readCloudMeta(entry.id);
      if (genAtLogin !== currentGeneration()) { logGenStale("onLogin (linked, após readCloudMeta)"); break; }
      if (meta && meta.existsCloud && meta.lastSyncedCloudUpdatedAt === c.updated_at) {
        continue; // já em dia
      }
      // Sem metadado confiável, ou a nuvem avançou desde a última
      // sincronização conhecida deste dispositivo: marca conflito em
      // vez de decidir sozinho — preserva os dois lados.
      if (genAtLogin !== currentGeneration()) { logGenStale("onLogin (linked, antes de gravar conflito)"); break; }
      await writeCloudMeta(entry.id, {
        existsCloud: true,
        lastSyncedCloudUpdatedAt: (meta && meta.lastSyncedCloudUpdatedAt) || null,
        lastSyncedAt: (meta && meta.lastSyncedAt) || null,
        pendingSync: false,
        conflict: true,
      });
    }

    if (genAtLogin !== currentGeneration()) { logGenStale("onLogin (antes da faixa de migração)"); return; }

    // --- local-only: nunca migração automática ---
    const localOnly = [];
    for (const entry of localIndex) {
      if (cloudIds.has(entry.id)) continue;
      const meta = await readCloudMeta(entry.id);
      if (meta && meta.existsCloud) continue; // vínculo perdido do lado cloud só, já tratado acima como conflito/recriação no próximo save
      localOnly.push(entry);
    }
    if (genAtLogin !== currentGeneration()) { logGenStale("onLogin (pré-render da faixa de migração)"); return; }
    if (localOnly.length > 0) {
      renderMigrateOnlyBanner(localOnly.length);
    }
  }

  // ETAPA 7.1 — chamado a partir de window.crisResetAppState() (logout),
  // no mesmo ponto onde js/sync-queue.js e js/character-connections.js já
  // são avisados. Incrementa a geração (qualquer onLogin() desta conta
  // ainda "em voo" descarta seu resultado ao chegar) e esconde a faixa de
  // migração, que se referia à conta que acabou de sair. Não apaga
  // nenhuma criatura local nem metadado de vínculo.
  function resetOnLogout() {
    __generation++;
    hideBanner();
    setBadge(null);
  }

  /* ============================================================
     8) ETAPA 6 — RESOLUÇÃO EXPLÍCITA DE CONFLITO (mesmo padrão de
        Agentes, reaproveitando o modal compartilhado de
        js/sync-queue.js — ver registerConflictHandlers("creature", …)
        mais abaixo). "USAR VERSÃO DA NUVEM" baixa e grava por cima
        da ficha local (mesmo id); "MANTER MINHA VERSÃO" (com
        segunda confirmação) sobrescreve a nuvem com o que está
        salvo localmente agora. Nenhuma das duas decide sozinha —
        as duas exigem clique explícito do usuário.
     ============================================================ */
  let __conflictLocalId = null;
  function showConflictModal() { const el = document.getElementById("cloud_conflict_modal"); if (el) el.style.display = "flex"; }
  function hideConflictModal() { const el = document.getElementById("cloud_conflict_modal"); if (el) el.style.display = "none"; }
  function showConflictConfirmModal() { const el = document.getElementById("cloud_conflict_confirm_modal"); if (el) el.style.display = "flex"; }
  function hideConflictConfirmModal() { const el = document.getElementById("cloud_conflict_confirm_modal"); if (el) el.style.display = "none"; }
  function clearConflictBadgeUI() {
    const el = document.getElementById("creature_cloud_sync_badge");
    if (el) { el.style.cursor = ""; el.title = "Estado da sincronização com a nuvem"; el.onclick = null; }
  }

  function openConflictResolution(localId) {
    if (!localId) return;
    __conflictLocalId = localId;
    showConflictModal();
  }

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
    try {
      const { data: cloudCreature, error } = await client
        .from("creatures").select("id,name,data,updated_at")
        .eq("id", localId).eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      if (!cloudCreature) throw new Error("registro cloud não encontrado");

      const cloudData = (cloudCreature.data && typeof cloudCreature.data === "object") ? cloudCreature.data : {};
      await saveLocalSheetData(localId, cloudData);

      const idx = await loadLocalIndex();
      const entryIdx = idx.findIndex((e) => e.id === localId);
      const nome = (cloudData.cr_nome || "").trim() || cloudCreature.name || "Criatura sem nome";
      if (entryIdx >= 0) { idx[entryIdx].nome = nome; idx[entryIdx].updatedAt = Date.now(); }
      await saveLocalIndex(idx);

      await writeCloudMeta(localId, {
        existsCloud: true, lastSyncedCloudUpdatedAt: cloudCreature.updated_at,
        lastSyncedAt: Date.now(), pendingSync: false, conflict: false,
      });
      clearConflictBadgeUI();
      setBadge("synced");
      if (typeof window.renderCreatureListIfVisible === "function") window.renderCreatureListIfVisible();
      if (typeof window.flashIndicator === "function") window.flashIndicator("☁ Versão da nuvem aplicada. Reabra a criatura para ver os dados atualizados.", false, 3600);
    } catch (e) {
      logSyncError("Falha ao aplicar versão da nuvem no conflito de criatura '" + localId + "'", e);
      if (typeof window.flashIndicator === "function") window.flashIndicator("☁ Não foi possível carregar a versão da nuvem. Tente novamente.", true, 3200);
    } finally {
      __conflictLocalId = null;
    }
  }

  function askKeepLocalVersion() { hideConflictModal(); showConflictConfirmModal(); }
  function cancelKeepLocalVersion() { hideConflictConfirmModal(); showConflictModal(); }

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
    const dataObj = await loadLocalSheetData(localId);
    if (!dataObj) {
      if (typeof window.flashIndicator === "function") window.flashIndicator("☁ Não foi possível ler a criatura local.", true, 3200);
      __conflictLocalId = null;
      return;
    }
    const safeName = (dataObj.cr_nome || "").trim() || "Criatura sem nome";
    try {
      const { data: updated, error } = await client
        .from("creatures").update({ name: safeName, data: dataObj })
        .eq("id", localId).eq("user_id", user.id).select("id,updated_at").single();
      if (error) throw error;
      await writeCloudMeta(localId, {
        existsCloud: true, lastSyncedCloudUpdatedAt: updated.updated_at,
        lastSyncedAt: Date.now(), pendingSync: false, conflict: false,
      });
      clearConflictBadgeUI();
      setBadge("synced");
      if (typeof window.flashIndicator === "function") window.flashIndicator("☁ Sua versão substituiu a versão da nuvem.", false, 2500);
    } catch (e) {
      logSyncError("Falha ao substituir a nuvem pela versão local de criatura '" + localId + "'", e);
      await writeCloudMeta(localId, { existsCloud: true, conflict: true });
      setBadge("conflict");
      if (typeof window.flashIndicator === "function") window.flashIndicator("☁ Não foi possível substituir a versão da nuvem. Tente novamente.", true, 3200);
    } finally {
      __conflictLocalId = null;
    }
  }

  if (window.CRISSyncQueue && typeof window.CRISSyncQueue.registerConflictHandlers === "function") {
    window.CRISSyncQueue.registerConflictHandlers("creature", {
      open: openConflictResolution,
      useCloud: useCloudVersionForConflict,
      keepLocal: askKeepLocalVersion,
      cancelKeepLocal: cancelKeepLocalVersion,
      confirmKeepLocal: confirmKeepLocalVersion,
    });
  }

  /* ============================================================
     9) ETAPA 6 — ADAPTER DA FILA DE SINCRONIZAÇÃO
     ------------------------------------------------------------
     sync(localId): relê a ficha local NA HORA (nome + dados) e
     chama syncCreatureToCloud(), que já decide INSERT/UPDATE/
     conflito sozinho. del(localId): chama deleteCreatureCloud()
     (idempotente — sem vínculo cloud, retorna ok sem chamada de
     rede) e limpa o metadado em caso de sucesso.
     ============================================================ */
  async function queueSync(localId) {
    const dataObj = await loadLocalSheetData(localId);
    if (!dataObj) return { ok: true, skipped: true }; // nada mais a enviar
    const nome = (dataObj.cr_nome || "").trim() || "Criatura sem nome";
    return await syncCreatureToCloud(localId, nome, dataObj);
  }
  async function queueDelete(localId) {
    const res = await deleteCreatureCloud(localId);
    if (res && res.ok) await deleteCloudMeta(localId);
    return res;
  }
  if (window.CRISSyncQueue && typeof window.CRISSyncQueue.registerAdapter === "function") {
    window.CRISSyncQueue.registerAdapter("creature", { sync: queueSync, del: queueDelete });
  }

  /* ============================================================
     10) EXPOSIÇÃO PÚBLICA
     ============================================================ */
  window.CRISCreaturesSync = {
    onLogin: onLogin,
    resetOnLogout: resetOnLogout,
    syncCreatureToCloud: syncCreatureToCloud,
    deleteCreatureCloud: deleteCreatureCloud,
    deleteCloudMeta: deleteCloudMeta,
    refreshBadge: refreshBadge,
    hideBanner: hideBanner,
    openConflictResolution: openConflictResolution,
  };
})();
