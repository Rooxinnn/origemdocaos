/* ==========================================================
   C.R.I.S. — ISOLAMENTO DE CONTAS E LOGOUT SEGURO — ETAPA 5.1
   ==========================================================
   Arquivo isolado. Responsável SOMENTE por:
     - impedir que dados locais (armazenados sob as MESMAS chaves
       fixas que o resto do projeto já usa: "agentes:index",
       "agente:sheet:<id>", "criaturas:index", "criatura:sheet:<id>",
       "paranormal:data", "xp:diario", "backup:auto:*",
       "agente:dicetray:*", "agente:dicetray_hist:*",
       "agente:sheet:<id>:restpoints", "agente:sheet:<id>:cloudsync")
       de uma conta Supabase sejam lidos/gravados como se fossem de
       outra conta, quando duas contas usam o mesmo navegador.

   NÃO mexe em storageGet/storageSet/storageListKeys/storageDeleteKey
   (só os REUTILIZA), não recria o sistema de sincronização de fichas
   (js/supabase-sync.js) nem o de Conexões Personalizadas
   (js/character-connections.js, que já tem seu próprio isolamento
   via syncAfterLogin()/resetOnLogout() e não é tocado aqui), não
   cria tabelas novas, não altera RLS, não implementa fila offline.

   ------------------------------------------------------------
   COMO FUNCIONA (visão geral — ver relatório da Etapa 5.1 para
   detalhes completos)
   ------------------------------------------------------------
   As chaves de dados de conta continuam exatamente com os MESMOS
   nomes fixos de sempre (nenhum outro arquivo do projeto precisou
   ser alterado para "conhecer" um namespace novo). Em vez disso,
   este módulo mantém:

     1) uma chave de DISPOSITIVO (não pertence a nenhuma conta):
          "cris:local_owner" -> { userId }
        que registra de quem são os dados que estão, agora, dentro
        das chaves fixas acima ("dono atual dos dados locais").

     2) uma família de chaves de QUARENTENA (também de dispositivo,
        mas isoladas por conta):
          "cris:acct:<userId>:<chave original>"
        onde ficam guardados, sem serem apagados, os dados de uma
        conta que NÃO é mais a dona atual das chaves fixas.

   Antes de qualquer tela ler as chaves fixas (chamado no INÍCIO de
   crisStartAppIfNeeded, antes de loadSheetsIndex()), este módulo
   compara a conta autenticada agora com "cris:local_owner":

     - MESMA conta (caso comum, toda vez que a mesma pessoa volta a
       usar o app) -> não faz nada, é o caminho rápido de sempre.

     - TROCA de conta (Conta A estava aqui, Conta B loga agora):
         a) move (nunca apaga) todo o conteúdo atual das chaves
            fixas para "cris:acct:<A>:<chave>" (quarentena da A);
         b) se existir quarentena da própria Conta B de uma sessão
            anterior neste mesmo navegador, devolve esse conteúdo
            para as chaves fixas (a B "recupera" o que era dela);
         c) se a B nunca usou este navegador, as chaves fixas ficam
            vazias -> loadSheetsIndex()/loadParanormal()/etc. (que
            rodam logo em seguida, sem nenhuma alteração) simplesmente
            encontram "nada", exatamente como um dispositivo novo.

     - PRIMEIRA EXECUÇÃO desta camada, sem "cris:local_owner" ainda
       gravado (inclusive em dispositivos que já tinham dados de
       ANTES desta etapa existir):
         a) se não existir nenhum dado nas chaves de conta, associa
            a conta atual e segue (nada a proteger);
         b) se já existir dado local (fichas, criaturas, etc.) sem
            nenhum dono registrado, este módulo NÃO tem como saber
            com segurança se esse dado sempre foi desta conta ou se
            outra conta usou este navegador antes desta camada
            existir. Ver "DECISÃO PENDENTE" no relatório da Etapa
            5.1: a escolha feita foi associar esse dado à conta
            atualmente autenticada (opção A da lista do enunciado —
            "associar explicitamente à conta atual") e avisar o
            usuário de forma visível, porém não bloqueante
            (flashIndicator), em vez de apagar ou esconder dados que
            podem ser legítimos da própria conta.

   Nada disto roda sem uma conta autenticada confirmada (user.id do
   Supabase Auth). Sem sessão (offline, Supabase indisponível, ainda
   restaurando sessão, ou logout em andamento), este módulo não toca
   em nenhuma chave — as chaves fixas continuam exatamente como
   estavam, preservando o uso offline (instrução "IMPORTANTE SOBRE
   OFFLINE" do enunciado da Etapa 5.1).
   ========================================================== */

(function () {
  "use strict";

  /* ============================================================
     1) ACESSO AO CLIENTE SUPABASE (reaproveitado — Etapa 1)
     ------------------------------------------------------------
     Mesmo padrão getClient()/getCurrentUser() já duplicado em
     js/supabase-sync.js e js/character-connections.js — nenhuma
     nova instância do Supabase é criada aqui.
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

  function logAI(msg) { console.log("[C.R.I.S. Isolamento] " + msg); }
  function logAIError(context, err) {
    const msg = (err && err.message) ? err.message : String(err);
    console.error("[C.R.I.S. Isolamento] " + context + ":", msg);
  }

  /* ============================================================
     2) QUAIS CHAVES SÃO "DADOS DA CONTA" (instrução "DADOS QUE
        DEVEM SER ANALISADOS", itens 1–8 do enunciado)
     ------------------------------------------------------------
     Propositalmente NÃO inclui:
       - "conexoes:personalizadas" (item 3): já tem isolamento
         próprio (syncAfterLogin()/resetOnLogout() em
         js/character-connections.js) — não duplicado aqui.
       - preferências de dispositivo (item 9): "dicetray:soundEnabled",
         "criaturas:sheetViewMode", "agentes:textViewMode",
         "limbic-panel-toggle" — continuam globais do aparelho.
       - qualquer chave "cris:*" — é a própria infraestrutura deste
         módulo (nunca deve ser tratada como dado de conta).
     ============================================================ */
  const ACCOUNT_EXACT_KEYS = [
    "agentes:index",     // 1) Agentes — índice
    "criaturas:index",   // 2) Criaturas — índice
    "xp:diario",         // 5) Diário de XP
    "paranormal:data",   // 4) Paranormal
    "sync:mutation_queue", // ETAPA 6 — fila de sincronização offline (js/sync-queue.js).
                            // Reaproveita o MESMO mecanismo de isolamento por conta usado
                            // acima, em vez de inventar um segundo mecanismo — a fila de
                            // uma conta nunca pode ser processada como se fosse de outra.
  ];
  const ACCOUNT_PREFIXES = [
    "agente:sheet:",          // 1) Agentes — fichas + :cloudsync + :restpoints (6)
    "criatura:sheet:",        // 2) Criaturas — fichas
    "backup:auto:",           // 8) Backups automáticos — index + conteúdo
    "agente:dicetray:",       // 7) Dice Tray — rolagens
    "agente:dicetray_hist:",  // 7) Dice Tray — histórico
  ];

  function isAccountScopedKey(key) {
    if (ACCOUNT_EXACT_KEYS.indexOf(key) !== -1) return true;
    for (let i = 0; i < ACCOUNT_PREFIXES.length; i++) {
      if (key.indexOf(ACCOUNT_PREFIXES[i]) === 0) return true;
    }
    return false;
  }
  // Exposto só para o Backup Completo (ver index.html) poder excluir a
  // própria família de chaves de quarentena/ownership de dentro de um
  // backup — sem duplicar esta lista lá.
  function isIsolationInfraKey(key) {
    return key.indexOf("cris:") === 0;
  }

  /* ============================================================
     3) IDENTIDADE DA CONTA LOCAL ("cris:local_owner")
     ============================================================ */
  const OWNER_KEY = "cris:local_owner";
  const QUARANTINE_PREFIX = "cris:acct:";

  function quarantineKey(userId, originalKey) {
    return QUARANTINE_PREFIX + userId + ":" + originalKey;
  }

  async function readOwner() {
    try {
      const raw = await window.storageGet(OWNER_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === "object" && parsed.userId) ? parsed.userId : null;
    } catch (e) {
      return null;
    }
  }

  async function writeOwner(userId) {
    try {
      await window.storageSet(OWNER_KEY, JSON.stringify({ userId: userId }), 1, true);
    } catch (e) {
      logAIError("Falha ao gravar dono local dos dados (cris:local_owner)", e);
    }
  }

  /* ============================================================
     4) QUARENTENA (mover, nunca apagar) / RESTAURAÇÃO
     ============================================================ */
  // Move para a quarentena da conta "prevUserId" todo o conteúdo atual
  // das chaves de conta — nunca lê/decodifica o valor, só transporta a
  // string bruta exatamente como está (mesmo princípio já usado pelo
  // Backup Completo em bkpBuildFullSnapshot()/bkpApplyPayload()).
  async function quarantineCurrentAccountData(prevUserId) {
    const keys = await window.storageListKeys("");
    let moved = 0;
    for (const k of keys) {
      if (!isAccountScopedKey(k)) continue;
      const v = await window.storageGet(k);
      if (v === null || v === undefined) continue;
      const ok = await window.storageSet(quarantineKey(prevUserId, k), v, 1, true);
      if (ok === null) {
        // Falha ao gravar a cópia em quarentena: por segurança, NÃO apaga
        // a chave original (instrução "não perder dados" tem prioridade
        // sobre concluir a troca de conta agora). Interrompe a
        // quarentena — a chave problemática (e as seguintes) continuam
        // pertencendo à conta anterior até uma próxima tentativa.
        logAI("Falha ao mover '" + k + "' para quarentena — mantendo como estava.");
        break;
      }
      await window.storageDeleteKey(k);
      moved++;
    }
    logAI("Quarentena: " + moved + " chave(s) da conta anterior isoladas.");
    return moved;
  }

  // Devolve para as chaves fixas o que estava em quarentena para a conta
  // "userId" (de uma sessão anterior deste mesmo navegador). Se não
  // houver nada em quarentena, as chaves fixas simplesmente ficam vazias
  // — exatamente como um dispositivo novo para esta conta.
  async function restoreQuarantinedData(userId) {
    const prefix = QUARANTINE_PREFIX + userId + ":";
    const keys = await window.storageListKeys(prefix);
    let restored = 0;
    for (const qk of keys) {
      const originalKey = qk.slice(prefix.length);
      if (!originalKey) continue;
      const v = await window.storageGet(qk);
      if (v === null || v === undefined) continue;
      const ok = await window.storageSet(originalKey, v, 1, true);
      if (ok === null) {
        logAI("Falha ao restaurar '" + originalKey + "' da quarentena — tentando novamente na próxima entrada.");
        continue;
      }
      await window.storageDeleteKey(qk);
      restored++;
    }
    logAI("Restauração: " + restored + " chave(s) devolvida(s) da quarentena para esta conta.");
    return restored;
  }

  async function hasAnyAccountScopedData() {
    const keys = await window.storageListKeys("");
    for (const k of keys) {
      if (isAccountScopedKey(k)) return true;
    }
    return false;
  }

  /* ============================================================
     5) PONTO DE ENTRADA — chamado do INÍCIO de crisStartAppIfNeeded(),
        ANTES de loadSheetsIndex()/loadParanormal()/etc.
     ============================================================ */
  async function ensureBeforeLoad() {
    const client = getClient();
    if (!client) {
      // Supabase indisponível agora: não há como confirmar identidade —
      // não mexe em nada (instrução "não destruir dados simplesmente
      // porque CRISAuth.client... temporariamente não está disponível").
      logAI("Supabase indisponível — isolamento não avaliado nesta carga (dados locais preservados como estão).");
      return { status: "no-client" };
    }
    const user = await getCurrentUser();
    if (!user || !user.id) {
      // Sem sessão confirmada: idem. crisStartAppIfNeeded() só é chamada
      // a partir de enterApp() (que já exige sessão), então isto só deve
      // acontecer numa corrida rara/momentânea — o caminho seguro é não
      // decidir nada.
      logAI("Sem usuário autenticado confirmado — isolamento não avaliado nesta carga.");
      return { status: "no-user" };
    }

    const activeUserId = user.id;
    const recordedOwner = await readOwner();

    if (recordedOwner === activeUserId) {
      return { status: "same-account" };
    }

    if (!recordedOwner) {
      const legacyData = await hasAnyAccountScopedData();
      if (!legacyData) {
        await writeOwner(activeUserId);
        logAI("Primeira execução do isolamento neste dispositivo — nenhum dado local a proteger.");
        return { status: "first-run-empty" };
      }
      // DECISÃO PENDENTE (documentada no relatório): associa o dado
      // legado sem dono à conta atual e avisa, em vez de escolher
      // silenciosamente ou apagar dado potencialmente legítimo.
      await writeOwner(activeUserId);
      logAI("Dados locais sem conta associada foram vinculados a esta conta (ver 'DECISÃO PENDENTE' no relatório da Etapa 5.1).");
      if (typeof window.flashIndicator === "function") {
        window.flashIndicator("Dados locais deste dispositivo foram associados a esta conta.", false, 4200);
      }
      return { status: "adopted-legacy" };
    }

    // Troca de conta detectada neste mesmo navegador.
    logAI("Troca de conta detectada neste dispositivo — isolando dados locais.");
    await quarantineCurrentAccountData(recordedOwner);
    const restored = await restoreQuarantinedData(activeUserId);
    await writeOwner(activeUserId);
    if (typeof window.flashIndicator === "function") {
      window.flashIndicator("Dados locais isolados por conta neste dispositivo.", false, 3200);
    }
    return { status: "switched-account", restored: restored };
  }

  /* ============================================================
     6) EXPOSIÇÃO PÚBLICA
     ============================================================ */
  window.CRISAccountIsolation = {
    ensureBeforeLoad: ensureBeforeLoad,
    isAccountScopedKey: isAccountScopedKey,
    isIsolationInfraKey: isIsolationInfraKey,
  };
})();
