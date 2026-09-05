/* ==========================================================
   C.R.I.S. — FILA DE SINCRONIZAÇÃO OFFLINE-FIRST — ETAPA 6
   ==========================================================
   Arquivo isolado. Responsável SOMENTE por:
     - manter uma fila de mutações PERSISTENTE (não só em memória),
       reutilizável por Agentes, Criaturas e Conexões Personalizadas;
     - detectar online/offline e reagir (window "online"/"offline");
     - processar a fila com retry + backoff progressivo quando a
       internet volta, respeitando a ordem de cada entidade;
     - isolar a fila por conta (mesma proteção de
       js/account-isolation.js — "sync:mutation_queue" foi
       adicionada à lista de chaves de conta desse módulo) e, além
       disso, revalidar o user.id de cada operação ANTES de
       executá-la (defesa em profundidade — nunca envia uma
       operação de uma conta como se fosse de outra);
     - evitar duas abas processando a fila ao mesmo tempo (lock
       simples via localStorage, com expiração);
     - mostrar um indicador global discreto de estado de rede/fila;
     - centralizar a interface dos dois modais de conflito já
       existentes (#cloud_conflict_modal / #cloud_conflict_confirm_modal,
       criados na Etapa 2.3 para Agentes), permitindo que Criaturas e
       Conexões Personalizadas os reaproveitem sem duplicar HTML/CSS.

   NÃO decide sozinho qual versão "vence" em um conflito, NÃO cria
   autosave, NÃO substitui storageGet/storageSet/storageListKeys/
   storageDeleteKey (só os reutiliza), NÃO cria tabela nova no
   Supabase, NÃO mexe no lock de js/supabase-auth.js.

   Cada sistema (Agentes/Criaturas/Conexões) continua sendo o único
   dono de COMO sincronizar sua própria entidade — este arquivo só
   decide QUANDO tentar (e repetir), através de um "adapter" que
   cada sistema registra:

     window.CRISSyncQueue.registerAdapter(entity, {
       sync: async function(localId){ ... },   // cria OU atualiza
       del:  async function(localId){ ... },   // exclui
     });

   O contrato de retorno de sync()/del() (mesmo formato já usado
   pelos três sistemas antes desta etapa, só com um campo novo
   opcional "errorInfo" para classificar o erro):
     { ok: true, ... }
     { ok: false, offline: true }                       -> sem sessão/Supabase agora
     { ok: false, conflict: true }                       -> conflito (já tratado pelo próprio sistema)
     { ok: false, error: true, errorInfo: {status,code,message} }
   ========================================================== */

(function () {
  "use strict";

  const QUEUE_KEY = "sync:mutation_queue";
  const LOCK_KEY = "cris:sync:lock";
  const LOCK_TTL_MS = 12000;
  const LOCK_RENEW_MS = 5000;
  const TAB_ID = "tab_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  const MAX_BACKOFF_MS = 5 * 60 * 1000; // teto de 5 min entre tentativas
  const BACKOFF_STEPS_S = [1, 2, 4, 8, 16, 32, 60, 120, 300]; // segundos
  const MAX_TEMP_ATTEMPTS = 12; // depois disso, erro "temporário" vira "failed" (evita retry infinito agressivo)
  const MAX_TOTAL_ATTEMPTS = 200; // teto absoluto, qualquer classificação — rede de segurança contra má classificação

  function now() { return Date.now(); }
  function genOpId() { return "mut_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9); }
  function log(msg) { console.log("[C.R.I.S. SyncQueue] " + msg); }
  function logErr(context, err) {
    const msg = (err && err.message) ? err.message : String(err);
    console.error("[C.R.I.S. SyncQueue] " + context + ":", msg);
  }

  /* ============================================================
     0) ACESSO AO CLIENTE/SESSÃO (mesmo padrão dos outros módulos)
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
     1) GERAÇÃO DE SESSÃO (defesa contra corrida logout->login)
     ------------------------------------------------------------
     Incrementada a cada logout. Qualquer processamento em curso
     confere a geração DEPOIS de cada "await" e, se ela mudou,
     interrompe imediatamente sem tocar em nenhum estado visual —
     é a forma prática (sem depender de AbortController em cada
     chamada do supabase-js) de garantir que uma resposta que
     estava "em voo" durante a Conta A não afete a Conta B.
     ============================================================ */
  let __generation = 0;
  function currentGeneration() { return __generation; }

  /* ============================================================
     2) PERSISTÊNCIA DA FILA
     ------------------------------------------------------------
     Uma única chave ("sync:mutation_queue") contendo o array
     inteiro de operações — evita múltiplas chamadas de storage em
     sequência para uma mesma alteração. Isolada por conta pelo
     MESMO mecanismo de js/account-isolation.js (a chave foi
     adicionada à lista ACCOUNT_EXACT_KEYS desse arquivo).

     __memQueue é um cache em memória, sempre a fonte de verdade
     DENTRO desta aba entre um load() e o próximo; toda mutação
     (enqueue/remove/update) grava de volta no storage antes de
     retornar, então duas chamadas em sequência na mesma aba nunca
     se perdem.
     ============================================================ */
  let __memQueue = null; // null = ainda não carregada nesta aba
  let __queueChain = Promise.resolve(); // serializa leituras/escritas concorrentes na mesma aba

  async function loadQueueRaw() {
    try {
      const raw = await window.storageGet(QUEUE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      logErr("Falha ao ler a fila persistida — tratando como vazia (nada é apagado no storage)", e);
      return [];
    }
  }

  async function saveQueueRaw(arr) {
    try {
      const ok = await window.storageSet(QUEUE_KEY, JSON.stringify(arr), 1, true);
      return !!ok;
    } catch (e) {
      logErr("Falha ao persistir a fila", e);
      return false;
    }
  }

  // Toda operação de leitura/escrita da fila passa por aqui — serializado
  // (um de cada vez) para nunca perder uma operação por causa de duas
  // gravações concorrentes na mesma aba (ex.: clique duplo).
  function withQueue(fn) {
    const run = __queueChain.then(async () => {
      if (__memQueue === null) __memQueue = await loadQueueRaw();
      const result = await fn(__memQueue);
      if (result && result.dirty) {
        await saveQueueRaw(__memQueue);
      }
      return result ? result.value : undefined;
    });
    __queueChain = run.catch(() => {}); // nunca deixa uma rejeição travar a corrente
    return run;
  }

  // Força releitura do storage (usado depois do login/troca de conta —
  // account-isolation.js já pode ter trocado o conteúdo por baixo).
  function invalidateQueueCache() { __memQueue = null; }

  /* ============================================================
     3) ENQUEUE — com consolidação (instruções "UPDATE UPDATE ->
        UPDATE" e "DELETE colapsa CREATE/UPDATE anteriores")
     ------------------------------------------------------------
     Invariante mantida por este módulo: no máximo UMA operação
     pendente por (entity, localId) na fila a qualquer momento.
     Isso já implementa a consolidação pedida sem precisar comparar
     payloads — o "payload" de verdade é sempre lido do storage
     local NA HORA de reenviar (ver replayOp), nunca duplicado aqui.
     ============================================================ */
  async function enqueue(entity, type, localId, opts) {
    opts = opts || {};
    const user = await getCurrentUser();
    if (!user) {
      // Sem sessão confirmada não há como carimbar userIdAtEnqueue com
      // segurança — instrução "toda operação deve carregar
      // userIdAtEnqueue". Não enfileira (o chamador já mostrou o erro
      // apropriado ao usuário; o dado local já está salvo de qualquer
      // forma, então nada é perdido).
      log("enqueue ignorado (sem sessão confirmada) — " + entity + "/" + type + "/" + localId);
      return null;
    }

    return withQueue(async (arr) => {
      const existingIdx = arr.findIndex((op) => op.entity === entity && op.localId === localId);

      if (type === "delete") {
        // DELETE sempre substitui qualquer CREATE/UPDATE pendente da
        // mesma entidade — o dado local já não existe mais, então não
        // há nada de útil a reenviar além do próprio DELETE. Se a
        // entidade nunca tiver chegado à nuvem, o próprio adapter de
        // exclusão (deleteCloudSheet/deleteCreatureCloud/conexão) já
        // detecta isso e não faz nenhuma chamada desnecessária.
        if (existingIdx !== -1) arr.splice(existingIdx, 1);
        arr.push({
          id: genOpId(), type: "delete", entity: entity, localId: localId,
          userIdAtEnqueue: user.id, createdAt: now(), updatedAt: now(),
          attempts: 0, lastAttemptAt: null, nextAttemptAt: 0,
          lastError: null, status: "pending",
        });
        return { dirty: true, value: true };
      }

      if (existingIdx !== -1) {
        const op = arr[existingIdx];
        if (op.type === "delete") {
          // Não deveria acontecer (não se edita algo já excluído), mas
          // por segurança nunca reviver um DELETE em CREATE/UPDATE.
          return { dirty: false, value: true };
        }
        // Consolida: mesma operação lógica, só "reaquecida" — mantém a
        // posição original na fila (ordem preservada) e limpa qualquer
        // estado de erro/backoff anterior, já que há uma alteração local
        // nova para enviar.
        op.updatedAt = now();
        op.status = "pending";
        op.attempts = 0;
        op.nextAttemptAt = 0;
        op.lastError = null;
        return { dirty: true, value: true };
      }

      arr.push({
        id: genOpId(), type: type, entity: entity, localId: localId,
        userIdAtEnqueue: user.id, createdAt: now(), updatedAt: now(),
        attempts: 0, lastAttemptAt: null, nextAttemptAt: 0,
        lastError: null, status: "pending",
      });
      return { dirty: true, value: true };
    }).then((v) => {
      updateBadge();
      // Tenta processar imediatamente, em segundo plano — sem bloquear
      // quem chamou enqueue() (o dado local já está salvo).
      if (navigator.onLine) processQueue().catch(() => {});
      return v;
    });
  }

  async function removeOp(opId) {
    return withQueue(async (arr) => {
      const idx = arr.findIndex((o) => o.id === opId);
      if (idx === -1) return { dirty: false, value: false };
      arr.splice(idx, 1);
      return { dirty: true, value: true };
    }).then((v) => { updateBadge(); return v; });
  }

  async function updateOp(opId, patch) {
    return withQueue(async (arr) => {
      const idx = arr.findIndex((o) => o.id === opId);
      if (idx === -1) return { dirty: false, value: false };
      Object.assign(arr[idx], patch);
      return { dirty: true, value: true };
    }).then((v) => { updateBadge(); return v; });
  }

  async function getQueueSnapshot() {
    return withQueue(async (arr) => ({ dirty: false, value: arr.slice() }));
  }

  async function getPendingForEntity(entity, localId) {
    const snap = await getQueueSnapshot();
    return snap.find((op) => op.entity === entity && op.localId === localId) || null;
  }

  /* ============================================================
     4) ADAPTERS — registrados por cada sistema (Agentes/Criaturas/
        Conexões Personalizadas)
     ============================================================ */
  const __adapters = {}; // entity -> { sync(localId), del(localId) }
  function registerAdapter(entity, adapter) { __adapters[entity] = adapter; }

  /* ============================================================
     5) CLASSIFICAÇÃO DE ERRO
     ------------------------------------------------------------
     Distingue pelo menos as 4 categorias pedidas: rede, temporário
     (5xx), sessão expirada, permanente (RLS/schema/operação
     inválida). Sem "errorInfo" (ex.: exceção de rede pura, tipo
     TypeError: Failed to fetch), trata como rede.
     ============================================================ */
  function classifyError(errorInfo) {
    if (!errorInfo) return "network";
    const status = errorInfo.status;
    const code = String(errorInfo.code || "");
    const msg = String(errorInfo.message || "").toLowerCase();

    if (status === 401 || msg.indexOf("jwt") !== -1 || msg.indexOf("token") !== -1 || msg.indexOf("session") !== -1 || msg.indexOf("sess\u00e3o") !== -1) {
      return "session";
    }
    if (status === 403 || code === "42501" || msg.indexOf("row-level security") !== -1 || msg.indexOf("permission denied") !== -1) {
      return "permanent";
    }
    if (code.indexOf("22") === 0 || code.indexOf("23") === 0 || code.indexOf("42") === 0 || msg.indexOf("invalid input") !== -1 || msg.indexOf("violat") !== -1 || msg.indexOf("schema") !== -1) {
      return "permanent"; // erro de validação/schema/coluna-inexistente — reenviar sem mudar nada só repetiria o mesmo erro
    }
    if (code.indexOf("PGRST") === 0) {
      return "permanent"; // erro do PostgREST (recurso/relacionamento/coluna não encontrados etc.) — não é rede
    }
    if (status && status >= 500) return "temporary";
    if (status && status >= 400) return "permanent";
    return "network";
  }

  function backoffMsFor(attempts) {
    const idx = Math.min(attempts, BACKOFF_STEPS_S.length - 1);
    return Math.min(BACKOFF_STEPS_S[idx] * 1000, MAX_BACKOFF_MS);
  }

  /* ============================================================
     6) LOCK ENTRE ABAS (evita duas abas processando a mesma fila)
     ------------------------------------------------------------
     Mecanismo simples (instrução: "não criar arquitetura
     exageradamente complexa"): uma chave de localStorage com TTL,
     renovada periodicamente enquanto esta aba processa. Não usa
     window.storage (que pode ser assíncrono/remoto) de propósito —
     o lock precisa ser local ao navegador e de leitura síncrona
     para ser útil entre abas do MESMO dispositivo.
     ============================================================ */
  function readLock() {
    try {
      const raw = localStorage.getItem(LOCK_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.ts) return null;
      if (now() - parsed.ts > LOCK_TTL_MS) return null; // expirado — trata como livre
      return parsed;
    } catch (e) {
      return null;
    }
  }
  function writeLock() {
    try { localStorage.setItem(LOCK_KEY, JSON.stringify({ tabId: TAB_ID, ts: now() })); } catch (e) {}
  }
  function releaseLock() {
    try {
      const cur = readLock();
      if (cur && cur.tabId === TAB_ID) localStorage.removeItem(LOCK_KEY);
    } catch (e) {}
  }
  function tryAcquireLock() {
    const cur = readLock();
    if (cur && cur.tabId !== TAB_ID) return false; // outra aba está processando agora
    writeLock();
    return true;
  }
  let __lockRenewTimer = null;
  function startLockRenewal() {
    stopLockRenewal();
    __lockRenewTimer = setInterval(writeLock, LOCK_RENEW_MS);
  }
  function stopLockRenewal() {
    if (__lockRenewTimer) { clearInterval(__lockRenewTimer); __lockRenewTimer = null; }
  }

  /* ============================================================
     7) PROCESSAMENTO DA FILA
     ------------------------------------------------------------
     Regras: uma execução por vez (nesta aba E entre abas); ordem
     preservada (a fila é sempre percorrida na ordem do array —
     como enqueue() garante no máximo 1 operação pendente por
     entidade, a ordem relativa entre entidades diferentes é a
     ordem em que cada uma teve sua PRIMEIRA alteração pendente,
     que é exatamente a ordem "lógica" pedida); nunca processa como
     usuário errado; nunca apaga operação silenciosamente em caso
     de erro permanente (marca "failed" e avisa).
     ============================================================ */
  let __processing = false;

  function isRunning() { return __processing; }

  async function processQueue() {
    if (__processing) return { skipped: "already-running-this-tab" };
    if (!navigator.onLine) return { skipped: "offline" };
    if (!tryAcquireLock()) return { skipped: "locked-by-other-tab" };

    __processing = true;
    startLockRenewal();
    const runGeneration = currentGeneration();
    updateBadge("syncing");

    try {
      const user = await getCurrentUser();
      if (runGeneration !== currentGeneration()) return { skipped: "generation-changed" };
      if (!user) {
        // Sessão expirada/ausente: pausa a fila inteira (instrução —
        // "nunca processar como outro usuário"; a sessão será
        // recuperada pelo fluxo normal do Supabase Auth, não por aqui).
        updateBadge();
        return { skipped: "no-session" };
      }

      let processedOk = 0, processedFail = 0, stoppedEarly = false;
      // snapshot da ordem atual — se novas operações forem enfileiradas
      // durante o processamento (ex.: usuário editando enquanto a fila
      // roda), elas entram numa próxima chamada, não nesta.
      const ids = (await getQueueSnapshot()).map((op) => op.id);

      for (const opId of ids) {
        if (runGeneration !== currentGeneration()) { stoppedEarly = true; break; }
        const snap = await getQueueSnapshot();
        const op = snap.find((o) => o.id === opId);
        if (!op) continue; // já removida (ex.: resolvida manualmente)
        if (op.status === "conflict") continue; // aguardando decisão explícita do usuário
        if (op.status === "failed") continue; // erro permanente — não repete sozinho
        if (op.nextAttemptAt && op.nextAttemptAt > now()) continue; // ainda no backoff

        // Revalida a conta ANTES de executar — proteção obrigatória
        // contra troca de conta com fila pendente (instrução crítica).
        if (op.userIdAtEnqueue !== user.id) {
          log("operação pulada — pertence a outra conta (" + op.entity + "/" + op.localId + ")");
          continue;
        }

        const adapter = __adapters[op.entity];
        if (!adapter) { logErr("Sem adapter registrado para entidade '" + op.entity + "'", new Error("adapter ausente")); continue; }

        let result;
        try {
          result = op.type === "delete" ? await adapter.del(op.localId) : await adapter.sync(op.localId);
        } catch (e) {
          result = { ok: false, error: true, errorInfo: { message: (e && e.message) || String(e) } };
        }

        if (runGeneration !== currentGeneration()) { stoppedEarly = true; break; }

        if (result && result.ok) {
          await removeOp(op.id);
          processedOk++;
          continue;
        }

        if (result && result.conflict) {
          // Já foi sinalizado ao usuário pelo próprio sistema (badge/
          // modal específico da entidade) — só marca na fila para não
          // ficar tentando reenviar sozinho por cima do conflito.
          await updateOp(op.id, { status: "conflict", lastAttemptAt: now(), lastError: "conflito de sincronização" });
          processedFail++;
          continue;
        }

        if (result && result.offline) {
          // Sem sessão/Supabase agora — provavelmente a conexão caiu
          // durante o processamento. Para o loop inteiro (instrução:
          // "conexão cai durante upload -> operação continua pendente"),
          // em vez de insistir em cada operação restante.
          await updateOp(op.id, { lastAttemptAt: now(), lastError: "offline" });
          stoppedEarly = true;
          break;
        }

        const kind = classifyError(result && result.errorInfo);
        if (kind === "session") {
          await updateOp(op.id, { lastAttemptAt: now(), lastError: "sessão expirada" });
          stoppedEarly = true; // pausa a fila inteira até a sessão ser restabelecida
          break;
        }
        if (kind === "permanent") {
          await updateOp(op.id, {
            status: "failed", lastAttemptAt: now(),
            lastError: (result && result.errorInfo && result.errorInfo.message) || "erro permanente",
          });
          processedFail++;
          if (typeof window.flashIndicator === "function") {
            window.flashIndicator("⚠ Uma alteração não pôde ser sincronizada (erro permanente). Veja o indicador de sincronização.", true, 4200);
          }
          continue;
        }
        // "network" ou "temporary": retry com backoff progressivo.
        const attempts = (op.attempts || 0) + 1;
        const patch = {
          attempts: attempts, lastAttemptAt: now(),
          nextAttemptAt: now() + backoffMsFor(attempts),
          lastError: (result && result.errorInfo && result.errorInfo.message) || kind,
        };
        if (kind === "temporary" && attempts >= MAX_TEMP_ATTEMPTS) {
          patch.status = "failed";
          if (typeof window.flashIndicator === "function") {
            window.flashIndicator("⚠ Uma alteração não pôde ser sincronizada após várias tentativas.", true, 4200);
          }
        }
        // Rede de segurança: mesmo que um erro tenha sido classificado
        // (incorretamente) como "network" — ex.: um erro do servidor sem
        // status/code reconhecível, que não é realmente perda de conexão
        // — nenhuma operação pode tentar para sempre sem nunca virar
        // "failed" e avisar o usuário. Bem mais alto que MAX_TEMP_ATTEMPTS
        // de propósito: uma queda de internet real (kind="network"
        // legítimo) pode facilmente levar mais de 12 tentativas para
        // voltar, e isso NÃO deve virar "failed" prematuramente.
        if (attempts >= MAX_TOTAL_ATTEMPTS) {
          patch.status = "failed";
          if (typeof window.flashIndicator === "function") {
            window.flashIndicator("⚠ Uma alteração ficou pendente por muito tempo sem sincronizar. Veja o indicador de sincronização.", true, 4200);
          }
        }
        await updateOp(op.id, patch);
        processedFail++;
        if (kind === "network") { stoppedEarly = true; break; } // rede caiu — não adianta tentar as próximas agora
      }

      return { ok: processedOk, failed: processedFail, stoppedEarly: stoppedEarly };
    } finally {
      __processing = false;
      stopLockRenewal();
      releaseLock();
      updateBadge();
    }
  }

  /* ============================================================
     8) ONLINE / OFFLINE
     ============================================================ */
  function handleOnline() {
    log("evento online — processando fila");
    if (typeof window.flashIndicator === "function") {
      window.flashIndicator("☁ Conexão restaurada — sincronizando…", false, 2600);
    }
    updateBadge();
    processQueue().catch((e) => logErr("Falha ao processar fila após reconexão", e));
  }
  function handleOffline() {
    log("evento offline");
    if (typeof window.flashIndicator === "function") {
      window.flashIndicator("☁ Offline — alterações serão sincronizadas quando a conexão voltar.", true, 3600);
    }
    updateBadge("offline");
  }
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  // Rede entre abas: se outra aba processar a fila e terminar, esta aba
  // também deve atualizar seu badge (a fila persistida mudou).
  let __bc = null;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      __bc = new BroadcastChannel("cris-sync-queue");
      __bc.onmessage = function (ev) {
        if (ev && ev.data === "queue-changed") {
          invalidateQueueCache();
          updateBadge();
        }
      };
    }
  } catch (e) { __bc = null; }
  function notifyOtherTabs() { try { if (__bc) __bc.postMessage("queue-changed"); } catch (e) {} }

  // Rede de segurança: tenta processar periodicamente (cobre o caso de
  // "voltou a internet mas o evento 'online' não disparou" — acontece
  // em alguns navegadores/containers).
  setInterval(() => {
    if (navigator.onLine && !__processing) processQueue().catch(() => {});
  }, 45000);

  /* ============================================================
     9) INDICADOR GLOBAL DISCRETO
     ------------------------------------------------------------
     Estados: ONLINE (sem nada pendente -> fica invisível, não
     precisa de "tudo certo" o tempo todo), OFFLINE, SINCRONIZANDO,
     PENDENTE, ERRO, CONFLITO.
     ============================================================ */
  function $(id) { return document.getElementById(id); }

  async function updateBadge(forceState) {
    notifyOtherTabs();
    const el = $("cris_global_sync_indicator");
    if (!el) return;

    if (forceState === "offline" || !navigator.onLine) {
      el.className = "cris-global-sync state-offline";
      el.textContent = "☁ Offline — pendente";
      el.style.display = "inline-flex";
      return;
    }
    if (forceState === "syncing" || __processing) {
      el.className = "cris-global-sync state-syncing";
      el.textContent = "☁ Sincronizando…";
      el.style.display = "inline-flex";
      return;
    }

    const snap = await getQueueSnapshot();
    const conflictCount = snap.filter((o) => o.status === "conflict").length;
    const failedCount = snap.filter((o) => o.status === "failed").length;
    const pendingCount = snap.length - conflictCount - failedCount;

    if (conflictCount > 0) {
      el.className = "cris-global-sync state-conflict";
      el.textContent = "⚠ " + conflictCount + " conflito(s) de sincronização";
      el.style.display = "inline-flex";
      return;
    }
    if (failedCount > 0) {
      el.className = "cris-global-sync state-error";
      el.textContent = "⚠ " + failedCount + " erro(s) de sincronização";
      el.style.display = "inline-flex";
      return;
    }
    if (pendingCount > 0) {
      el.className = "cris-global-sync state-pending";
      el.textContent = "☁ " + pendingCount + " pendente(s) de sincronização";
      el.style.display = "inline-flex";
      return;
    }
    // Nada pendente — indicador discreto some (instrução: não poluir a UI).
    el.style.display = "none";
    el.textContent = "";
  }

  function wireBadgeClick() {
    const el = $("cris_global_sync_indicator");
    if (!el) return;
    el.addEventListener("click", async () => {
      const snap = await getQueueSnapshot();
      const conflictCount = snap.filter((o) => o.status === "conflict").length;
      const failedCount = snap.filter((o) => o.status === "failed").length;
      const pendingCount = snap.length - conflictCount - failedCount;
      const parts = [];
      if (pendingCount > 0) parts.push(pendingCount + " pendente(s)");
      if (failedCount > 0) parts.push(failedCount + " com erro");
      if (conflictCount > 0) parts.push(conflictCount + " em conflito (abra a ficha/criatura/conexão em conflito para resolver)");
      if (typeof window.flashIndicator === "function") {
        window.flashIndicator(parts.length ? ("☁ " + parts.join(" · ")) : "☁ Tudo sincronizado.", conflictCount > 0 || failedCount > 0, 4200);
      }
      if (navigator.onLine) processQueue().catch(() => {});
    });
  }

  /* ============================================================
     10) MODAL DE CONFLITO COMPARTILHADO
     ------------------------------------------------------------
     Reaproveita #cloud_conflict_modal / #cloud_conflict_confirm_modal
     (criados na Etapa 2.3 para Agentes) para Criaturas e Conexões
     Personalizadas também — generaliza sem duplicar modal/CSS. Cada
     sistema se registra com suas próprias funções; este módulo só
     decide QUAL conjunto de funções chamar a cada clique, de acordo
     com qual conflito está aberto no momento.
     ============================================================ */
  const __conflictHandlers = {}; // entity -> {open,useCloud,keepLocal,cancelKeepLocal,confirmKeepLocal}
  let __activeConflictEntity = null;
  let __activeConflictLocalId = null;

  function registerConflictHandlers(entity, handlers) {
    __conflictHandlers[entity] = handlers;
  }

  function conflictModalIsOpen() {
    const el = $("cloud_conflict_modal");
    const confirmEl = $("cloud_conflict_confirm_modal");
    return !!((el && el.style.display === "flex") || (confirmEl && confirmEl.style.display === "flex"));
  }

  // CORREÇÃO: um conflito pode ser detectado tanto por uma ação direta do
  // usuário (abriu a ficha/criatura/conexão, ou clicou "Salvar") quanto
  // pelo processamento automático da fila em segundo plano — e o modal é
  // COMPARTILHADO entre as 3 entidades. Sem esta proteção, um conflito de
  // outra entidade descoberto em segundo plano trocaria silenciosamente
  // __activeConflictEntity por baixo do usuário, enquanto ele ainda está
  // decidindo o conflito atual — o clique dele poderia acabar resolvendo
  // a entidade ERRADA. Se o modal já está aberto com OUTRO conflito, este
  // chamado só marca a operação como pendente na fila (já feito por quem
  // chamou) e NÃO reabre/troca o modal; o usuário resolve um de cada vez
  // (reabrindo a ficha/criatura/conexão, ou pelo indicador global, depois
  // que o atual for concluído).
  function openConflict(entity, localId) {
    if (conflictModalIsOpen() && (__activeConflictEntity !== entity || __activeConflictLocalId !== localId)) {
      log("conflito de '" + entity + "/" + localId + "' detectado, mas o modal já está aberto para outra pendência — aguardando o usuário concluir a atual");
      return;
    }
    __activeConflictEntity = entity;
    __activeConflictLocalId = localId;
    const h = __conflictHandlers[entity];
    if (h && typeof h.open === "function") h.open(localId);
  }

  function dispatchConflictAction(action) {
    const h = __conflictHandlers[__activeConflictEntity];
    if (h && typeof h[action] === "function") h[action]();
  }

  function wireConflictModalButtons() {
    const useCloudBtn = $("cloud_conflict_use_cloud");
    if (useCloudBtn) useCloudBtn.addEventListener("click", () => dispatchConflictAction("useCloud"));
    const keepLocalBtn = $("cloud_conflict_keep_local");
    if (keepLocalBtn) keepLocalBtn.addEventListener("click", () => dispatchConflictAction("keepLocal"));
    const confirmCancelBtn = $("cloud_conflict_confirm_cancel");
    if (confirmCancelBtn) confirmCancelBtn.addEventListener("click", () => dispatchConflictAction("cancelKeepLocal"));
    const confirmReplaceBtn = $("cloud_conflict_confirm_replace");
    if (confirmReplaceBtn) confirmReplaceBtn.addEventListener("click", () => dispatchConflictAction("confirmKeepLocal"));
  }

  /* ============================================================
     11) CICLO DE VIDA — LOGIN / LOGOUT / TROCA DE ABA
     ============================================================ */
  // Chamado a partir de crisStartAppIfNeeded(), depois que
  // CRISAccountIsolation.ensureBeforeLoad() e os onLogin() de cada
  // sistema já rodaram — a fila da conta certa já está isolada e as
  // operações vindas de outra conta (se houver) já foram
  // deixadas de lado pela revalidação de userIdAtEnqueue.
  async function onLogin() {
    invalidateQueueCache();
    updateBadge();
    if (navigator.onLine) {
      try { await processQueue(); } catch (e) { logErr("Falha ao processar fila após login", e); }
    }
  }

  // Chamado a partir de window.crisResetAppState() (logout). Nunca
  // apaga a fila persistida (ela pertence à conta que estava ativa e
  // continua isolada por account-isolation.js) — só interrompe
  // qualquer processamento em andamento e limpa estado em memória
  // desta aba, para que nenhuma resposta que ainda esteja "em voo"
  // possa atualizar a interface da próxima conta que logar.
  function onLogout() {
    __generation++;
    __memQueue = null;
    __processing = false;
    stopLockRenewal();
    releaseLock();
    __activeConflictEntity = null;
    updateBadge();
  }

  /* ============================================================
     12) EXPOSIÇÃO PÚBLICA
     ============================================================ */
  window.CRISSyncQueue = {
    enqueue: enqueue,
    removeOp: removeOp,
    updateOp: updateOp,
    getQueueSnapshot: getQueueSnapshot,
    getPendingForEntity: getPendingForEntity,
    registerAdapter: registerAdapter,
    registerConflictHandlers: registerConflictHandlers,
    openConflict: openConflict,
    processQueue: processQueue,
    isRunning: isRunning,
    onLogin: onLogin,
    onLogout: onLogout,
    updateBadge: updateBadge,
    classifyError: classifyError,
  };

  document.addEventListener("DOMContentLoaded", () => {
    wireBadgeClick();
    wireConflictModalButtons();
    updateBadge();
  });
})();
