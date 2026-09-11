/* ==========================================================
   CONEXÕES DA FICHA — ETAPA 2 + ETAPA 3 (PERSONALIZADAS)
   Sistema independente e autocontido, adicionado sobre a
   arquitetura já existente. NÃO recria o Compêndio de Conexões
   (CONEXOES_DATA / renderConexoes / openConexaoModal continuam
   exatamente como estão) e NÃO cria uma segunda biblioteca:
   apenas guarda, por ficha, uma lista de REFERÊNCIAS e usa
   essas referências para:

     PARANORMAL → "Minhas Conexões"   (gerenciamento: add/remover)
     AGENTES → "Conexão"              (reflexo automático da ficha)

   Armazenamento das referências da ficha: NÃO cria um localStorage/
   chave separada. A lista de referências fica num
   <input type="hidden" id="agente_conexoes_ids"> dentro de
   #tab-agentes — ou seja, é só mais um campo que agentFieldIds() já
   varre sozinho, então saveAgent()/loadAgent()/duplicateSheet()/
   export-import já salvam, carregam e duplicam essa lista
   automaticamente, exatamente como fazem hoje com hab50_unlocked e
   aborto_limbico_habilidades — nenhuma dessas funções precisou ser
   reescrita.

   Referências: para Conexões oficiais, a referência é o nome (c.n),
   único dentro de CONEXOES_DATA. Para Personalizadas, a referência é
   o ID próprio da Personalizada (ex.: "custom-..."), nunca o nome —
   assim duas Personalizadas podem ter o mesmo nome sem conflito, e
   uma Personalizada nunca esbarra numa Conexão oficial.

   ----------------------------------------------------------
   PERSONALIZADAS (ETAPA 3)
   ----------------------------------------------------------
   PERSONALIZADAS é tratada como mais uma categoria dentro da MESMA
   interface "Adicionar Conexão à Ficha": mesmo modal, mesmos
   filtros, mesma pesquisa, mesmo estilo visual. Não existe uma
   segunda interface, um segundo picker ou um segundo modal de
   detalhes — o modal de detalhes das Personalizadas reaproveita o
   MESMO #cx_modal (DOM/CSS) já usado pelo Compêndio, só que
   populado por uma função própria (openPersonalizadaModal), porque
   openConexaoModal() do index.html espera um índice numérico dentro
   de CONEXOES_DATA e não pode ser chamada para um objeto que não
   pertence a essa biblioteca. O index.html NÃO é alterado.

   Biblioteca de Personalizadas: array próprio (customConnections),
   guardado com a MESMA infraestrutura já usada pelo projeto
   (storageGet/storageSet — window.storage com fallback para
   localStorage), sob a chave "conexoes:personalizadas". É uma
   coleção GLOBAL do usuário (a biblioteca), independente de qual
   ficha está aberta — exatamente como CONEXOES_DATA é uma biblioteca
   global. A associação de uma Personalizada com UMA ficha específica
   continua sendo feita só pela lista de referências da própria ficha
   (agente_conexoes_ids), então adicionar uma Personalizada a uma
   ficha nunca a adiciona a outra.

   Este arquivo só ENVOLVE (sem redefinir) openSheet() e
   createNewSheet(), do mesmo jeito que a Bandeja de Rolagens já faz
   mais abaixo no projeto, para trocar de "dono" junto com a
   troca/criação de ficha. Também envolve openConexaoModal() apenas
   para esconder as ações extras (Editar/Excluir/Adicionar-Remover)
   quando uma Conexão oficial é aberta — o comportamento da função
   original não muda em nenhuma linha.
   ========================================================== */
(function(){

  var HIDDEN_FIELD_ID = "agente_conexoes_ids";
  var CUSTOM_STORAGE_KEY = "conexoes:personalizadas";
  var CUSTOM_CLOUD_PREFIX = "⟦ODC • CONEXÃO PERSONALIZADA • V2⟧";
  var CUSTOM_CLOUD_EFFECT_SEPARATOR = "\n\nEfeito:\n";
  var CUSTOM_FIELD_DEFS = [
    { key: "funcao", label: "Função", inputId: "cconn_form_funcao", placeholder: "Ex.: ATK C" },
    { key: "alcance", label: "Alcance", inputId: "cconn_form_alcance", placeholder: "Ex.: Toque" },
    { key: "corrupcao", label: "Corrupção", inputId: "cconn_form_corrupcao", placeholder: "Ex.: 1" },
    { key: "consumo", label: "Consumo", inputId: "cconn_form_consumo", placeholder: "Ex.: 1d6 de HP" },
    { key: "necessario", label: "Necessário", inputId: "cconn_form_necessario", placeholder: "Ex.: Ocultismo 20" },
    { key: "re", label: "RE", inputId: "cconn_form_re", placeholder: "Ex.: 1" },
    { key: "de", label: "DE", inputId: "cconn_form_de", placeholder: "Ex.: 1 Ação" }
  ];
  var pickerActiveFilter = "todas";

  var customConnections = [];   // biblioteca de Personalizadas (carregada de storageGet)
  var customLoaded = false;
  var customIdCounter = 0;

  /* ============================================================
     ETAPA 7.1 — GERAÇÃO DE SESSÃO
     ------------------------------------------------------------
     Mesmo princípio adotado em js/supabase-sync.js e
     js/creatures-sync.js (originado em js/sync-queue.js): geração
     própria deste módulo, incrementada só no logout (dentro do
     resetOnLogout() já existente abaixo — instrução: "não remover o
     mecanismo existente sem demonstrar que a substituição é segura";
     aqui nada é removido, só é somada uma verificação a mais).

     syncAfterLogin() confere esta geração antes de cada gravação
     local (saveCustomLibrary()) e antes de tocar a UI (renderAll()/
     renderPickerList()). Se a geração mudou — logout/login de outra
     conta enquanto o fetch de custom_connections da conta anterior
     ainda estava "em voo" —, o resultado tardio é descartado sem
     mesclar/gravar/renderizar nada, exatamente o cenário do
     enunciado: "uma resposta da Conta A que chegar depois do
     logout/login da Conta B deve ser simplesmente descartada".
     ============================================================ */
  var __ccGeneration = 0;
  function ccCurrentGeneration(){ return __ccGeneration; }
  function ccLogGenStale(where){
    console.log("[CRIS CUSTOM CONNECTIONS SYNC] geração de sessão mudou durante '" + where + "' — resultado descartado (troca de conta em andamento).");
  }

  /* ============================================================
     ETAPA 4.1B — SINCRONIZAÇÃO DE PERSONALIZADAS COM SUPABASE
     ------------------------------------------------------------
     Camada isolada, autocontida neste arquivo — não importa nem
     redefine nada de js/supabase-auth.js ou js/supabase-sync.js.
     Reaproveita exatamente o mesmo cliente já criado por
     js/supabase-auth.js (window.CRISAuth.client), no mesmo padrão
     de getClient()/getCurrentUser() já usado em js/supabase-sync.js
     — nenhuma segunda instância do Supabase é criada.

     Tabela usada (já existe, não é criada/alterada aqui):
       public.custom_connections (id, user_id, name, description,
       tag, type, created_at, updated_at), RLS já configurado.

     A biblioteca local (customConnections / CUSTOM_STORAGE_KEY)
     continua sendo a fonte disponível offline — a nuvem é só uma
     camada adicional por cima dela, igual ao padrão já usado para
     fichas/inventário: nenhuma operação local é bloqueada ou
     revertida por causa de uma falha de rede.
     ============================================================ */
  function getClient(){
    if(typeof window.CRISAuth === "undefined") return null;
    if(window.CRISAuth.configError) return null;
    return window.CRISAuth.client || null;
  }

  async function getCurrentUser(){
    var client = getClient();
    if(!client) return null;
    try{
      var res = await client.auth.getSession();
      if(res.error) return null;
      return (res.data && res.data.session && res.data.session.user) || null;
    }catch(e){
      return null;
    }
  }

  function logCC(msg){ console.log("[CRIS CUSTOM CONNECTIONS] " + msg); }
  function logCCSync(msg){ console.log("[CRIS CUSTOM CONNECTIONS SYNC] " + msg); }
  function logCCError(context, err){
    var msg = (err && err.message) ? err.message : String(err);
    console.error("[CRIS CUSTOM CONNECTIONS ERROR] " + context + ":", msg);
  }

  function cleanCustomField(value){
    return String(value || "").replace(/\s*[\r\n]+\s*/g, " ").trim();
  }

  function normalizeCustomFields(fields){
    fields = fields && typeof fields === "object" ? fields : {};
    var normalized = {};
    CUSTOM_FIELD_DEFS.forEach(function(def){
      normalized[def.key] = cleanCustomField(fields[def.key]);
    });
    return normalized;
  }

  function hasCustomFields(fields){
    fields = normalizeCustomFields(fields);
    return CUSTOM_FIELD_DEFS.some(function(def){ return !!fields[def.key]; });
  }

  // A tabela existente no Supabase possui apenas um campo description.
  // Para não exigir migração nem quebrar instalações atuais, os novos
  // dados são enviados nesse mesmo campo em um bloco textual legível.
  // Conexões antigas não têm o prefixo e, portanto, nunca são analisadas
  // ou reinterpretadas: todo o texto antigo continua sendo o Efeito.
  function encodeCloudDescription(cc){
    var description = String((cc && cc.description) || "").trim();
    var fields = normalizeCustomFields(cc && cc.fields);
    if(!hasCustomFields(fields)) return description;

    var lines = [CUSTOM_CLOUD_PREFIX];
    CUSTOM_FIELD_DEFS.forEach(function(def){
      if(fields[def.key]) lines.push(def.label + ": " + fields[def.key]);
    });
    return lines.join("\n") + CUSTOM_CLOUD_EFFECT_SEPARATOR + description;
  }

  function decodeCloudDescription(value){
    var raw = String(value || "");
    var prefix = CUSTOM_CLOUD_PREFIX + "\n";
    if(raw.indexOf(prefix) !== 0){
      return { description: raw, fields: normalizeCustomFields(null) };
    }

    var separatorAt = raw.indexOf(CUSTOM_CLOUD_EFFECT_SEPARATOR, prefix.length);
    if(separatorAt < 0){
      return { description: raw, fields: normalizeCustomFields(null) };
    }

    var fields = normalizeCustomFields(null);
    var fieldLines = raw.slice(prefix.length, separatorAt).split("\n");
    fieldLines.forEach(function(line){
      CUSTOM_FIELD_DEFS.forEach(function(def){
        var labelPrefix = def.label + ": ";
        if(line.indexOf(labelPrefix) === 0){
          fields[def.key] = cleanCustomField(line.slice(labelPrefix.length));
        }
      });
    });
    return {
      description: raw.slice(separatorAt + CUSTOM_CLOUD_EFFECT_SEPARATOR.length),
      fields: fields
    };
  }

  function errInfoCC(e){
    if(!e) return null;
    return { status: e.status || (e.originalError && e.originalError.status) || null, code: e.code || null, message: e.message || String(e) };
  }

  // ETAPA 6: em vez de "dispara e esquece" (fire-and-forget) sem
  // nenhum retorno, agora as duas funções devolvem um resultado
  // padronizado — {ok}/{ok:false, offline}/{ok:false, conflict}/
  // {ok:false, error, errorInfo} — que tanto o chamador direto (ao
  // criar/editar) quanto o adapter da fila (js/sync-queue.js) sabem
  // interpretar. O "cloudMeta" (existsCloud/lastSyncedUpdatedAt/
  // conflict) passou a viver DENTRO do próprio objeto da Personalizada
  // — é salvo pela MESMA saveCustomLibrary() de sempre, então reaproveita
  // o isolamento por conta já existente (resetOnLogout limpa tudo junto),
  // sem precisar de uma segunda chave de storage isolada à parte.
  async function syncCreateToCloud(cc){
    var client = getClient();
    if(!client){ logCC("criada só localmente (Supabase indisponível): " + cc.id); return { ok: false, offline: true }; }
    var user = await getCurrentUser();
    if(!user){ logCC("criada só localmente (sem sessão): " + cc.id); return { ok: false, offline: true }; }
    try{
      var res = await client.from("custom_connections").insert({
        id: cc.id, user_id: user.id, name: cc.name, description: encodeCloudDescription(cc), tag: cc.tag, type: cc.type || "custom"
      }).select("id,updated_at").single();
      if(res.error) throw res.error;
      cc.cloudMeta = { existsCloud: true, lastSyncedUpdatedAt: res.data.updated_at, conflict: false };
      saveCustomLibrary();
      logCCSync("criada na nuvem: " + cc.id);
      return { ok: true };
    }catch(e){
      logCCError("falha ao criar na nuvem (registro local preservado) '" + cc.id + "'", e);
      return { ok: false, error: true, errorInfo: errInfoCC(e) };
    }
  }

  async function syncUpdateToCloud(cc){
    var client = getClient();
    if(!client){ logCC("atualizada só localmente (Supabase indisponível): " + cc.id); return { ok: false, offline: true }; }
    var user = await getCurrentUser();
    if(!user){ logCC("atualizada só localmente (sem sessão): " + cc.id); return { ok: false, offline: true }; }

    // Nunca sincronizou (ou nunca confirmou) com a nuvem ainda — trata
    // como criação em vez de UPDATE (evita um "update" de 0 linhas).
    if(!cc.cloudMeta || !cc.cloudMeta.existsCloud){
      return await syncCreateToCloud(cc);
    }

    try{
      // Confere se a versão na nuvem mudou desde a última sincronização
      // conhecida ANTES de sobrescrever — regra de conflito da Etapa 6
      // (mesmo padrão de Agentes/Criaturas): só segue direto se a nuvem
      // não mudou por baixo; senão, para e pede decisão explícita.
      var cur = await client.from("custom_connections")
        .select("updated_at").eq("id", cc.id).eq("user_id", user.id).maybeSingle();
      if(cur.error) throw cur.error;

      if(!cur.data){
        // Não existe mais na nuvem (foi excluída em outro dispositivo) —
        // recria em vez de tentar um UPDATE que não afetaria nada.
        cc.cloudMeta = { existsCloud: false, lastSyncedUpdatedAt: null, conflict: false };
        return await syncCreateToCloud(cc);
      }

      if(cc.cloudMeta.lastSyncedUpdatedAt && cur.data.updated_at !== cc.cloudMeta.lastSyncedUpdatedAt){
        cc.cloudMeta.conflict = true;
        saveCustomLibrary();
        logCC("conflito de sincronização detectado: " + cc.id);
        if(window.CRISSyncQueue && typeof window.CRISSyncQueue.openConflict === "function"){
          window.CRISSyncQueue.openConflict("custom_connection", cc.id);
        } else if(typeof window.flashIndicator === "function"){
          window.flashIndicator("☁ Esta Conexão Personalizada foi alterada em outro dispositivo. Abra-a para escolher qual versão manter.", true, 4200);
        }
        return { ok: false, conflict: true };
      }

      var res = await client.from("custom_connections")
        .update({ name: cc.name, description: encodeCloudDescription(cc), tag: cc.tag, type: cc.type || "custom" })
        .eq("id", cc.id)
        .eq("user_id", user.id)
        .select("id,updated_at")
        .single();
      if(res.error) throw res.error;
      cc.cloudMeta = { existsCloud: true, lastSyncedUpdatedAt: res.data.updated_at, conflict: false };
      saveCustomLibrary();
      logCCSync("atualizada na nuvem: " + cc.id);
      return { ok: true };
    }catch(e){
      logCCError("falha ao atualizar na nuvem (alteração local preservada) '" + cc.id + "'", e);
      return { ok: false, error: true, errorInfo: errInfoCC(e) };
    }
  }

  // Tenta sincronizar imediatamente (melhor esforço); se não conseguir
  // por rede/erro (não por conflito, que já se autorresolve mostrando o
  // modal), enfileira para retry automático — instrução: "CREATE: local
  // → fila → cloud" / "UPDATE: local → fila → cloud", em vez do antigo
  // fire-and-forget sem nenhuma tentativa de repetir.
  function attemptSyncOrQueue(cc, type){
    var p = (type === "create") ? syncCreateToCloud(cc) : syncUpdateToCloud(cc);
    p.then(function(res){
      if(res && (res.ok || res.conflict)) return; // sucesso, ou conflito já sinalizado — nada a enfileirar
      if(window.CRISSyncQueue) window.CRISSyncQueue.enqueue("custom_connection", type, cc.id);
    }).catch(function(){
      if(window.CRISSyncQueue) window.CRISSyncQueue.enqueue("custom_connection", type, cc.id);
    });
  }

  // Busca a biblioteca do usuário autenticado. O filtro .eq("user_id", ...)
  // aqui é redundância proposital em cima do RLS (mesmo padrão já usado em
  // js/supabase-sync.js para exclusão de fichas) — nunca depende só da
  // policy do banco.
  async function fetchCloudCustomConnections(user){
    var client = getClient();
    if(!client || !user) return null; // null = "não foi possível consultar" (offline/sem sessão)
    try{
      var res = await client.from("custom_connections")
        .select("id,name,description,tag,type,updated_at")
        .eq("user_id", user.id);
      if(res.error) throw res.error;
      return res.data || [];
    }catch(e){
      logCCError("falha ao buscar Personalizadas na nuvem", e);
      return null;
    }
  }

  // Mescla o que veio da nuvem com o cache local — nunca por cima às
  // cegas: registros que só existem localmente (ex.: criados enquanto
  // offline e cujo INSERT ainda não confirmou na nuvem) são preservados
  // e reenviados em segundo plano, em vez de serem apagados pela troca.
  // Para os registros que já existem nos dois lados, a nuvem prevalece
  // (ONLINE: Supabase → fonte persistente; local → cache), já que não
  // existe hoje infraestrutura para detectar edição concorrente real
  // (ver DECISÃO PENDENTE no relatório desta etapa).
  // ETAPA 7.1: mergeCloudIntoLocal() em si é inteiramente síncrona (as
  // chamadas assíncronas dentro dela — attemptSyncOrQueue()/
  // saveCustomLibrary() — são disparadas sem await, "melhor esforço",
  // exatamente como já era). Por isso, uma única checagem de geração
  // ANTES de chamar esta função (feita em syncAfterLogin(), logo abaixo)
  // já é suficiente: não existe nenhum ponto de espera (await) dentro
  // dela onde a geração poderia mudar no meio da execução.
  function mergeCloudIntoLocal(cloudRows){
    var seen = {};
    var merged = cloudRows.map(function(r){
      seen[r.id] = true;
      var decoded = decodeCloudDescription(r.description);
      return {
        id: r.id,
        name: r.name || "",
        description: decoded.description,
        fields: decoded.fields,
        tag: r.tag || "",
        type: r.type || "custom",
        cloudMeta: { existsCloud: true, lastSyncedUpdatedAt: r.updated_at, conflict: false }
      };
    });
    customConnections.forEach(function(local){
      if(!seen[local.id]){
        merged.push(local);
        attemptSyncOrQueue(local, "create"); // tenta reenviar o que ainda não chegou à nuvem
      }
    });
    customConnections = merged;
    saveCustomLibrary();
  }

  // Chamado a partir de crisStartAppIfNeeded() (index.html), depois do
  // login — mesmo ponto de entrada já usado por CRISSync.onLogin() para
  // fichas. Nunca decide nada sobre fichas/agentes; só atualiza a
  // biblioteca de Personalizadas.
  //
  // ETAPA 7.1: captura a geração no início. Se ela mudar depois de
  // qualquer await (logout -> resetOnLogout() incrementa a geração), o
  // restante do fluxo é abandonado — a resposta tardia da conta anterior
  // NUNCA chega a mesclar(mergeCloudIntoLocal)/gravar(saveCustomLibrary)/
  // renderizar(renderAll/renderPickerList) por cima da biblioteca da
  // conta que já está ativa agora. Nenhuma promise em andamento é
  // cancelada à força — só o resultado, quando chega, é descartado.
  async function syncAfterLogin(){
    var genAtLogin = ccCurrentGeneration();
    var user = await getCurrentUser();
    if(genAtLogin !== ccCurrentGeneration()){ ccLogGenStale("syncAfterLogin (getCurrentUser)"); return; }
    if(!user){
      logCC("syncAfterLogin: sem sessão — mantém biblioteca local como está");
      return;
    }
    logCCSync("usuário autenticado: " + user.id);
    var rows = await fetchCloudCustomConnections(user);
    if(genAtLogin !== ccCurrentGeneration()){ ccLogGenStale("syncAfterLogin (fetchCloudCustomConnections)"); return; }
    if(rows === null){
      logCC("syncAfterLogin: Supabase indisponível agora — mantém cache local existente");
      return;
    }
    logCCSync("Personalizadas encontradas na nuvem: " + rows.length);
    mergeCloudIntoLocal(rows);
    if(genAtLogin !== ccCurrentGeneration()){ ccLogGenStale("syncAfterLogin (pós-merge)"); return; }
    renderAll();
    var pickerModal = document.getElementById("cconn_picker_modal");
    if(pickerModal && pickerModal.style.display === "flex") renderPickerList();
  }

  // Chamado a partir de window.crisResetAppState (index.html), no
  // logout — evita que a biblioteca de uma conta apareça para a
  // próxima conta que logar neste mesmo navegador (instrução 6, item
  // crítico). O dado em si nunca é perdido: continua salvo em
  // custom_connections na nuvem para quando o dono logar de novo; o
  // que é limpo aqui é só o cache local deste navegador.
  //
  // ETAPA 7.1: agora também incrementa __ccGeneration — nada do
  // mecanismo existente foi removido, só foi somada esta linha, para
  // que um syncAfterLogin() da conta que está saindo (ainda com um
  // fetch em andamento) descarte seu resultado ao chegar, em vez de
  // mesclar os dados dela por cima da biblioteca já limpa/da próxima
  // conta.
  function resetOnLogout(){
    __ccGeneration++;
    customConnections = [];
    customLoaded = false;
    saveCustomLibrary();
    logCC("cache local de Personalizadas limpo no logout");
    renderAll();
  }

  /* ---------- acesso ao campo oculto (fonte única de verdade da ficha) ---------- */

  function ensureHiddenField(){
    var el = document.getElementById(HIDDEN_FIELD_ID);
    if(!el){
      var tabAgentes = document.getElementById("tab-agentes");
      if(!tabAgentes) return null;
      el = document.createElement("input");
      el.type = "hidden";
      el.id = HIDDEN_FIELD_ID;
      el.value = "[]";
      tabAgentes.appendChild(el);
    }
    return el;
  }

  function getConnRefs(){
    var el = ensureHiddenField();
    if(!el) return [];
    try{
      var arr = JSON.parse(el.value || "[]");
      return Array.isArray(arr) ? arr : [];
    }catch(e){
      return [];
    }
  }

  // Grava a lista e marca a ficha como tendo alterações pendentes
  // (mesmo comportamento dos demais campos da ficha — só é
  // persistido de fato quando o usuário clica "💾 Salvar Ficha").
  function setConnRefs(arr){
    var el = ensureHiddenField();
    if(!el) return;
    el.value = JSON.stringify(arr);
    if(typeof markAgentDirty === "function") markAgentDirty();
  }

  // Reset silencioso (sem marcar a ficha como suja) — usado só ao
  // trocar/criar ficha, para nunca deixar a referência da ficha
  // anterior vazar para a próxima antes do carregamento real.
  function resetConnRefsSilent(){
    var el = ensureHiddenField();
    if(el) el.value = "[]";
  }

  /* ---------- biblioteca de Personalizadas ---------- */

  function genCustomId(){
    customIdCounter++;
    return "custom-" + Date.now().toString(36) + "-" + customIdCounter.toString(36) + "-" + Math.random().toString(36).slice(2,7);
  }

  function findCustomById(id){
    for(var i = 0; i < customConnections.length; i++){
      if(customConnections[i].id === id) return customConnections[i];
    }
    return null;
  }

  // Converte uma Personalizada (formato de armazenamento: id/name/
  // description/tag/type/fields) para o mesmo "formato de entrada" que
  // CONEXOES_DATA usa (n/d/dl/c/e/s), para que TODO o resto do
  // sistema (findConnByRef, dimLabel, symSrc, renderPickerList,
  // renderMinhasConexoes, renderAgenteConexoes) funcione sem precisar
  // saber se está lidando com uma Conexão oficial ou Personalizada.
  function customToEntry(cc){
    var fields = normalizeCustomFields(cc.fields);
    var stats = {};
    CUSTOM_FIELD_DEFS.forEach(function(def){
      if(fields[def.key]) stats[def.label] = fields[def.key];
    });
    var effect = String(cc.description || "").trim();
    return {
      __custom: true,
      id: cc.id,
      n: cc.name,
      d: "personalizada",
      dl: cc.tag || "Personalizada",
      tag: cc.tag || "",
      description: effect,
      c: stats,
      e: effect ? [{ t: "Efeito", x: effect }] : [],
      s: null,
      p: null
    };
  }

  function getCustomEntries(){
    return customConnections.map(customToEntry);
  }

  async function saveCustomLibrary(){
    return await storageSet(CUSTOM_STORAGE_KEY, JSON.stringify(customConnections), 1, true);
  }

  // Importação explícita do modo visitante: une por ID, preserva as
  // Personalizadas que já pertencem à conta e só então agenda o envio
  // normal para a nuvem. Nunca tenta interpretar nem reescrever o Efeito.
  async function importCustomLibrary(items){
    if(!Array.isArray(items) || !items.length) return 0;
    var added = [];
    items.forEach(function(raw){
      if(!raw || !raw.id || findCustomById(raw.id)) return;
      var cc = {
        id: String(raw.id),
        name: String(raw.name || "").trim(),
        description: String(raw.description || "").trim(),
        fields: normalizeCustomFields(raw.fields),
        tag: String(raw.tag || "").trim(),
        type: "custom",
        cloudMeta: { existsCloud: false, lastSyncedUpdatedAt: null, conflict: false }
      };
      customConnections.push(cc);
      added.push(cc);
    });
    if(!added.length) return 0;
    await saveCustomLibrary();
    added.forEach(function(cc){ attemptSyncOrQueue(cc, "create"); });
    renderAll();
    return added.length;
  }

  // Criação continua síncrona (mesma assinatura/retorno de antes — quem
  // chama não precisa virar async): grava local na hora, e SÓ DEPOIS
  // dispara o envio à nuvem em segundo plano, sem aguardar (instrução 3 —
  // "não gerar um segundo ID apenas para o Supabase": o mesmo cc.id vai
  // para os dois lados).
  function createCustomConnection(data){
    var cc = {
      id: genCustomId(),
      name: (data.name || "").trim(),
      description: (data.description || "").trim(),
      fields: normalizeCustomFields(data.fields),
      tag: (data.tag || "").trim(),
      type: "custom",
      cloudMeta: { existsCloud: false, lastSyncedUpdatedAt: null, conflict: false }
    };
    customConnections.push(cc);
    saveCustomLibrary();
    attemptSyncOrQueue(cc, "create");
    return cc;
  }

  function updateCustomConnection(id, data){
    var cc = findCustomById(id);
    if(!cc) return null;
    cc.name = (data.name || "").trim();
    cc.description = (data.description || "").trim();
    cc.fields = normalizeCustomFields(data.fields);
    cc.tag = (data.tag || "").trim();
    saveCustomLibrary();
    attemptSyncOrQueue(cc, "update");
    return cc;
  }

  // ETAPA 6 (correção de bug encontrado na auditoria 6.0 — "cloud sempre
  // vencendo silenciosamente" / exclusão bloqueada em cloud-primeiro):
  // agora a exclusão é SEMPRE local-primeiro, exatamente como Agentes e
  // Criaturas — o registro some da biblioteca do usuário imediatamente
  // (online ou offline), e a exclusão na nuvem é enfileirada e tentada
  // em segundo plano, com retry automático. Retorna {ok:true} assim que
  // o local foi removido; nunca bloqueia nem faz o usuário esperar a
  // rede para poder excluir algo.
  async function deleteCustomConnection(id){
    var existed = !!findCustomById(id);
    customConnections = customConnections.filter(function(c){ return c.id !== id; });
    var saveOk = await saveCustomLibrary();
    if(!existed){ return { ok: true }; }
    if(!saveOk){
      // Falha ao gravar localmente: instrução geral da Etapa 6 — "se o
      // salvamento local falhar, NÃO colocar operação na fila, mostrar
      // erro". Não perde o registro em memória, mas avisa.
      return { ok: false, localSaveFailed: true };
    }
    logCC("excluída localmente (imediato): " + id);
    if(window.CRISSyncQueue){
      await window.CRISSyncQueue.enqueue("custom_connection", "delete", id);
    }
    return { ok: true };
  }

  async function loadCustomConnections(){
    try{
      var raw = await storageGet(CUSTOM_STORAGE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      customConnections = Array.isArray(arr) ? arr : [];
    }catch(e){
      customConnections = [];
    }
    customLoaded = true;
    renderAll();
    // Se o picker já estiver aberto (ex.: carregamento lento), atualiza
    // a lista assim que a biblioteca de Personalizadas chegar.
    var pickerModal = document.getElementById("cconn_picker_modal");
    if(pickerModal && pickerModal.style.display === "flex") renderPickerList();
  }

  /* ---------- referência → entrada (oficial OU personalizada) ---------- */

  function refOf(c){
    return c.__custom ? c.id : c.n;
  }

  function findConnByRef(ref){
    var custom = findCustomById(ref);
    if(custom) return customToEntry(custom);
    if(typeof CONEXOES_DATA === "undefined") return null;
    for(var i = 0; i < CONEXOES_DATA.length; i++){
      if(CONEXOES_DATA[i].n === ref) return CONEXOES_DATA[i];
    }
    return null;
  }

  function addConnection(ref){
    var refs = getConnRefs();
    if(refs.indexOf(ref) !== -1) return; // já está na ficha — não duplica
    var c = findConnByRef(ref);
    if(c && c.noAdd === true) return; // Aborto Límbico — nunca adicionável como Conexão
    refs.push(ref);
    setConnRefs(refs);
    renderAll();
  }

  function removeConnection(ref){
    var refs = getConnRefs().filter(function(r){ return r !== ref; });
    setConnRefs(refs);
    renderAll();
  }

  /* ---------- pequenos helpers que reaproveitam funções já existentes ---------- */

  function esc(s){
    if(typeof escapeHtml === "function") return escapeHtml(s);
    var d = document.createElement("div");
    d.textContent = (s === undefined || s === null) ? "" : String(s);
    return d.innerHTML;
  }

  // Algumas entradas do Compêndio (ex.: categoria "Especiais") não
  // possuem símbolo no livro, e Personalizadas nunca têm símbolo —
  // retorna null nesse caso, e quem chama decide não renderizar
  // nenhuma <img> (sem imagem quebrada / falsa).
  function symSrc(c){
    if(!c || !c.s) return null;
    if(typeof cx_symSrc === "function") return cx_symSrc(c);
    if(/^(?:data:|blob:|https?:|\/|\.\.\/|\.\/|img\/)/i.test(String(c.s))) return String(c.s);
    return "data:image/png;base64," + c.s;
  }

  function dimLabel(c){
    if(typeof CONEXOES_DIM_LABELS !== "undefined"){
      return c.d === "tecnica" ? "Técnica de Aborto Límbico" : (CONEXOES_DIM_LABELS[c.d] || c.dl || "");
    }
    return c.dl || "";
  }

  /* ==========================================================
     PARANORMAL → "MINHAS CONEXÕES"
     Painel principal da aba #tab-paranormal. O antigo formulario manual
     foi retirado porque este seletor ja oferece todas as Conexoes.
     ========================================================== */

  function ensureParanormalPanel(){
    if(document.getElementById("cconn_panel")) return;
    var tabParanormal = document.getElementById("tab-paranormal");
    if(!tabParanormal) return;

    var panel = document.createElement("div");
    panel.className = "panel";
    panel.id = "cconn_panel";
    panel.innerHTML =
      '<h2>Minhas Conexões <span class="tag">Vinculado ao Compêndio</span></h2>' +
      '<p class="empty-state" style="margin-bottom:14px;">' +
        'Conexões desta ficha, selecionadas diretamente do Compêndio ou criadas por você em Personalizadas. ' +
        'Elas aparecem automaticamente em <strong>Agentes → Conexão</strong>.' +
      '</p>' +
      '<div class="cconn-toolbar">' +
        '<button type="button" id="cconn_add_btn">+ Adicionar Conexão</button>' +
      '</div>' +
      '<div id="cconn_list"></div>';

    tabParanormal.appendChild(panel);
    document.getElementById("cconn_add_btn").addEventListener("click", openPickerModal);
  }

  function renderMinhasConexoes(){
    ensureParanormalPanel();
    var list = document.getElementById("cconn_list");
    if(!list) return;

    var refs = getConnRefs();
    if(refs.length === 0){
      list.innerHTML = '<div class="empty-state">Nenhuma Conexão adicionada a esta ficha ainda.</div>';
      return;
    }

    list.innerHTML = "";
    refs.forEach(function(ref){
      var c = findConnByRef(ref);
      var card = document.createElement("div");
      card.className = "entry-card cconn-entry-card";

      if(c){
        var thumbSrc = symSrc(c);
        var thumbHtml = thumbSrc ? ('<img class="cconn-thumb" src="' + thumbSrc + '" alt="">') : '';
        var detailsBtnHtml = c.__custom
          ? '<button class="entry-del" type="button" data-cconn-details="' + esc(ref) + '">Detalhes</button>'
          : '';
        card.innerHTML =
          thumbHtml +
          '<div class="entry-body">' +
            '<div class="entry-title">' + esc(c.n) + ' <span class="meta">' + esc(dimLabel(c)) + '</span></div>' +
          '</div>' +
          detailsBtnHtml +
          '<button class="entry-del" type="button" data-cconn-remove="' + esc(ref) + '">Remover</button>';
      } else {
        // Referência que não foi encontrada (Conexão oficial renomeada/
        // removida da biblioteca, ou Personalizada excluída) — não
        // quebra a lista, só avisa, e continua removível normalmente.
        card.innerHTML =
          '<div class="entry-body">' +
            '<div class="entry-title">' + esc(ref) + ' <span class="meta">não encontrada (pode ter sido excluída)</span></div>' +
          '</div>' +
          '<button class="entry-del" type="button" data-cconn-remove="' + esc(ref) + '">Remover</button>';
      }
      list.appendChild(card);
    });

    list.querySelectorAll("[data-cconn-remove]").forEach(function(btn){
      btn.addEventListener("click", function(){
        removeConnection(btn.getAttribute("data-cconn-remove"));
      });
    });
    list.querySelectorAll("[data-cconn-details]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var c2 = findConnByRef(btn.getAttribute("data-cconn-details"));
        if(c2 && c2.__custom) openPersonalizadaModal(c2);
      });
    });
  }

  /* ==========================================================
     AGENTES → "CONEXÃO"
     Painel novo, inserido como irmão do bloco ".two-col" que já
     contém "Conexões Aprendidas" / "Anotações do Agente" — esse
     bloco e os campos que ele contém não são alterados nem
     movidos, o painel novo só entra antes dele.
     ========================================================== */

  function ensureAgentesDisplayPanel(){
    if(document.getElementById("cconn_agente_panel")) return;
    var conexoesField = document.getElementById("conexoes");
    if(!conexoesField) return;
    var twoCol = conexoesField.closest(".two-col");
    if(!twoCol || !twoCol.parentElement) return;

    var panel = document.createElement("div");
    panel.className = "panel";
    panel.id = "cconn_agente_panel";
    panel.innerHTML =
      '<h2>Conexão</h2>' +
      '<div id="cconn_agente_grid" class="cconn-agente-grid"></div>';

    twoCol.parentElement.insertBefore(panel, twoCol);
  }

  function renderAgenteConexoes(){
    ensureAgentesDisplayPanel();
    var grid = document.getElementById("cconn_agente_grid");
    if(!grid) return;

    var refs = getConnRefs();
    if(refs.length === 0){
      grid.innerHTML = '<div class="empty-state">Nenhuma Conexão vinculada. Adicione em Paranormal → Minhas Conexões.</div>';
      return;
    }

    grid.innerHTML = "";
    refs.forEach(function(ref){
      var c = findConnByRef(ref);
      var block = document.createElement("div");
      block.className = "cconn-block" + (c ? (" cx-" + c.d) : "");
      block.setAttribute("data-conn-ref", ref);

      var blockThumbSrc = c ? symSrc(c) : null;
      block.innerHTML = c
        ? ((blockThumbSrc ? ('<img class="cconn-thumb-sm" src="' + blockThumbSrc + '" alt="">') : '') + '<span>' + esc(c.n) + '</span>')
        : ('<span>' + esc(ref) + '</span>');

      // Reaproveita o modal de detalhes: Conexão oficial → modal do
      // Compêndio (openConexaoModal, sem nenhuma alteração nele);
      // Personalizada → modal próprio, que popula o MESMO #cx_modal,
      // mas aqui (AGENTES) sempre em modo somente leitura — o
      // gerenciamento (Adicionar/Remover da Ficha, Editar, Excluir)
      // continua existindo só em PARANORMAL → PERSONALIZADAS.
      if(c){
        block.addEventListener("click", function(){
          if(c.__custom){
            openPersonalizadaModal(c, true);
          } else if(typeof openConexaoModal === "function" && typeof CONEXOES_DATA !== "undefined"){
            openConexaoModal(CONEXOES_DATA.indexOf(c));
          }
        });
      }

      grid.appendChild(block);
    });
  }

  function renderAll(){
    renderMinhasConexoes();
    renderAgenteConexoes();
  }

  /* ==========================================================
     MODAL "ADICIONAR CONEXÃO"
     Lista as Conexões que já existem em CONEXOES_DATA (mesma fonte
     de dados do Compêndio) MAIS as Personalizadas da biblioteca do
     usuário, lado a lado, na mesma lista/filtro/pesquisa — não
     cadastra nada novo em CONEXOES_DATA, não duplica a biblioteca
     oficial.
     ========================================================== */

  function ensurePickerModal(){
    if(document.getElementById("cconn_picker_modal")) return;

    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "cconn_picker_modal";
    overlay.innerHTML =
      '<div class="modal-box cconn-picker-box">' +
        '<button type="button" class="cconn-picker-close" id="cconn_picker_close">&times;</button>' +
        '<h3>Adicionar Conexão à Ficha</h3>' +
        '<div class="field cconn-picker-search-row"><label>Pesquisar</label>' +
          '<input type="text" id="cconn_picker_search" placeholder="Nome da Conexão…"></div>' +
        '<div id="cconn_picker_filters" class="cx-filters"></div>' +
        '<div id="cconn_picker_count" class="note cconn-picker-count"></div>' +
        '<div id="cconn_picker_list" class="cconn-picker-list"></div>' +
      '</div>';
    document.body.appendChild(overlay);

    document.getElementById("cconn_picker_close").addEventListener("click", closePickerModal);
    overlay.addEventListener("click", function(e){
      if(e.target.id === "cconn_picker_modal") closePickerModal();
    });

    var searchEl = document.getElementById("cconn_picker_search");
    var handler = (typeof debounce === "function") ? debounce(renderPickerList, 150) : renderPickerList;
    searchEl.addEventListener("input", handler);
  }

  function renderPickerFilters(){
    var wrap = document.getElementById("cconn_picker_filters");
    if(!wrap || wrap.dataset.built) return;
    if(typeof CONEXOES_DIM_ORDER === "undefined" || typeof CONEXOES_DIM_LABELS === "undefined") return;

    var html = '<button type="button" class="cx-filter-btn cx-filter-all active" data-filter="todas">Todas</button>';
    CONEXOES_DIM_ORDER.forEach(function(key){
      var label = key === "tecnica" ? "Técnicas de Aborto Límbico" : CONEXOES_DIM_LABELS[key];
      html += '<button type="button" class="cx-filter-btn cx-' + key + '" data-filter="' + key + '"><span class="dot"></span>' + esc(label) + '</button>';
    });
    // PERSONALIZADAS entra como mais uma categoria da MESMA barra de
    // filtros, sempre por último — nunca é adicionada a
    // CONEXOES_DIM_ORDER (isso afetaria o Compêndio), só à barra
    // deste picker.
    html += '<button type="button" class="cx-filter-btn cx-personalizada" data-filter="personalizada"><span class="dot"></span>Personalizadas</button>';
    wrap.innerHTML = html;
    wrap.dataset.built = "1";

    wrap.querySelectorAll(".cx-filter-btn").forEach(function(btn){
      btn.addEventListener("click", function(){
        pickerActiveFilter = btn.dataset.filter;
        wrap.querySelectorAll(".cx-filter-btn").forEach(function(b){ b.classList.remove("active"); });
        btn.classList.add("active");
        renderPickerList();
      });
    });
  }

  function renderPickerList(){
    var list = document.getElementById("cconn_picker_list");
    var countEl = document.getElementById("cconn_picker_count");
    if(!list) return;

    var searchEl = document.getElementById("cconn_picker_search");
    var q = ((searchEl && searchEl.value) || "").toLowerCase().trim();

    var officialItems = (typeof CONEXOES_DATA !== "undefined") ? CONEXOES_DATA : [];
    var items = officialItems.concat(getCustomEntries());

    if(pickerActiveFilter !== "todas"){
      items = items.filter(function(c){ return c.d === pickerActiveFilter; });
    }
    if(q){
      items = items.filter(function(c){
        return c.n.toLowerCase().indexOf(q) !== -1 ||
               ((CONEXOES_DIM_LABELS && CONEXOES_DIM_LABELS[c.d]) || "").toLowerCase().indexOf(q) !== -1 ||
               (c.dl || "").toLowerCase().indexOf(q) !== -1;
      });
    }

    if(countEl) countEl.textContent = items.length + " resultado" + (items.length === 1 ? "" : "s");

    list.innerHTML = "";

    // "+ CRIAR CONEXÃO PERSONALIZADA" — só aparece dentro da própria
    // categoria PERSONALIZADAS, junto da lista (item fixo no topo),
    // exatamente como pedido.
    if(pickerActiveFilter === "personalizada"){
      var createBtn = document.createElement("button");
      createBtn.type = "button";
      createBtn.className = "cconn-picker-create-btn";
      createBtn.textContent = "+ Criar Conexão Personalizada";
      createBtn.addEventListener("click", function(){ openCustomForm(null, false); });
      list.appendChild(createBtn);
    }

    if(items.length === 0){
      var empty = document.createElement("div");
      empty.className = "cconn-picker-empty";
      empty.textContent = "Nenhuma Conexão encontrada para este filtro/pesquisa.";
      list.appendChild(empty);
      return;
    }

    var currentRefs = getConnRefs();
    items.forEach(function(c){
      var ref = refOf(c);
      var inSheet = currentRefs.indexOf(ref) !== -1;
      // Exceção obrigatória: Aborto Límbico aparece no Compêndio (dentro
      // de Conexões Superiores) mas nunca pode ser adicionado à ficha
      // como Conexão — ele já possui seu próprio sistema em Agentes.
      var blocked = c.noAdd === true;
      var row = document.createElement("div");
      row.className = "cconn-picker-row cx-" + c.d + (c.__custom ? " is-clickable" : "");
      var rowThumbSrc = symSrc(c);
      var rowThumbHtml = rowThumbSrc ? ('<img class="cconn-thumb-sm" src="' + rowThumbSrc + '" alt="">') : '';
      var badgeHtml = c.__custom ? ' <span class="cconn-custom-badge">Personalizada</span>' : '';
      var btnHtml = blocked
        ? '<button type="button" class="cconn-picker-add-btn in-sheet" disabled title="Aborto Límbico possui seu próprio sistema em Agentes e não pode ser adicionado como Conexão.">Indisponível</button>'
        : ('<button type="button" class="cconn-picker-add-btn' + (inSheet ? ' in-sheet' : '') + '">' +
            (inSheet ? '✓ Na Ficha' : 'Adicionar') +
          '</button>');
      row.innerHTML =
        rowThumbHtml +
        '<div class="cconn-picker-row-body">' +
          '<div class="cconn-picker-row-title">' + esc(c.n) + badgeHtml + '</div>' +
          '<div class="cconn-picker-row-dim">' + esc(dimLabel(c)) + '</div>' +
        '</div>' +
        btnHtml;

      if(!blocked){
        var btn = row.querySelector(".cconn-picker-add-btn");
        btn.addEventListener("click", function(e){
          e.stopPropagation();
          addConnection(ref);
          renderPickerList(); // atualiza o botão desta linha para "✓ Na Ficha"
        });
      }

      // Só as Personalizadas abrem o modal de detalhes ao clicar na
      // linha (é lá que ficam Editar/Excluir). Conexões oficiais
      // continuam exatamente como estavam — nada muda para elas.
      if(c.__custom){
        row.addEventListener("click", function(){
          openPersonalizadaModal(c);
        });
      }

      list.appendChild(row);
    });
  }

  function openPickerModal(){
    ensurePickerModal();
    pickerActiveFilter = "todas";
    var wrap = document.getElementById("cconn_picker_filters");
    if(wrap){
      wrap.querySelectorAll(".cx-filter-btn").forEach(function(b){ b.classList.remove("active"); });
      var allBtn = wrap.querySelector('[data-filter="todas"]');
      if(allBtn) allBtn.classList.add("active");
    }
    var searchEl = document.getElementById("cconn_picker_search");
    if(searchEl) searchEl.value = "";
    renderPickerFilters();
    renderPickerList();
    document.getElementById("cconn_picker_modal").style.display = "flex";
  }

  function closePickerModal(){
    var m = document.getElementById("cconn_picker_modal");
    if(m) m.style.display = "none";
  }

  /* ==========================================================
     FORMULÁRIO "CRIAR / EDITAR CONEXÃO PERSONALIZADA"
     Modal próprio (nome, etiqueta, dados e efeito) — único ponto de
     entrada de dados das Personalizadas. Usado tanto para criar
     quanto para editar (editar nunca cria uma nova entrada: sempre
     grava de volta no mesmo id).
     ========================================================== */

  function readCustomFieldsFromForm(){
    var fields = {};
    CUSTOM_FIELD_DEFS.forEach(function(def){
      var input = document.getElementById(def.inputId);
      fields[def.key] = input ? input.value : "";
    });
    return normalizeCustomFields(fields);
  }

  function fillCustomFieldsForm(fields){
    fields = normalizeCustomFields(fields);
    CUSTOM_FIELD_DEFS.forEach(function(def){
      var input = document.getElementById(def.inputId);
      if(input) input.value = fields[def.key];
    });
  }

  function ensureCustomFormModal(){
    if(document.getElementById("cconn_form_modal")) return;

    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "cconn_form_modal";
    overlay.innerHTML =
      '<div class="modal-box cconn-form-box">' +
        '<button type="button" class="cconn-picker-close" id="cconn_form_close">&times;</button>' +
        '<h3 id="cconn_form_title">Criar Conexão Personalizada</h3>' +
        '<div class="cconn-form-scroll">' +
        '<div class="field cconn-form-field"><label>Nome</label>' +
          '<input type="text" id="cconn_form_name" maxlength="80" placeholder="Nome da Conexão…"></div>' +
        '<div class="field cconn-form-field"><label>Etiqueta</label>' +
          '<input type="text" id="cconn_form_tag" maxlength="40" list="cconn_form_tag_list" placeholder="Ex.: Campanha, NPC, Mestre…"></div>' +
        '<datalist id="cconn_form_tag_list">' +
          '<option value="Especial"><option value="Pessoal"><option value="NPC">' +
          '<option value="Campanha"><option value="Mestre"><option value="Customizada">' +
        '</datalist>' +
        '<div class="cconn-form-stats">' +
          CUSTOM_FIELD_DEFS.map(function(def){
            return '<div class="field cconn-form-field"><label>' + def.label + '</label>' +
              '<input type="text" id="' + def.inputId + '" maxlength="60" placeholder="' + def.placeholder + '"></div>';
          }).join("") +
        '</div>' +
        '<div class="field cconn-form-field cconn-form-field-desc"><label>Efeito</label>' +
          '<textarea id="cconn_form_desc" placeholder="Descreva o efeito completo da Conexão…"></textarea></div>' +
        '<div class="cconn-form-err" id="cconn_form_err" style="display:none;">Informe um nome para a Conexão.</div>' +
        '</div>' +
        '<div class="cconn-form-actions">' +
          '<button type="button" id="cconn_form_cancel">Cancelar</button>' +
          '<button type="button" id="cconn_form_save" class="primary">Salvar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    document.getElementById("cconn_form_close").addEventListener("click", closeCustomForm);
    document.getElementById("cconn_form_cancel").addEventListener("click", closeCustomForm);
    overlay.addEventListener("click", function(e){
      if(e.target.id === "cconn_form_modal") closeCustomForm();
    });

    document.getElementById("cconn_form_save").addEventListener("click", function(){
      var nameEl = document.getElementById("cconn_form_name");
      var tagEl = document.getElementById("cconn_form_tag");
      var descEl = document.getElementById("cconn_form_desc");
      var errEl = document.getElementById("cconn_form_err");
      var name = (nameEl.value || "").trim();
      if(!name){
        errEl.style.display = "block";
        nameEl.focus();
        return;
      }
      errEl.style.display = "none";

      var editingId = overlay.dataset.editingId || "";
      var data = {
        name: name,
        tag: tagEl.value,
        description: descEl.value,
        fields: readCustomFieldsFromForm()
      };
      var saved = editingId ? updateCustomConnection(editingId, data) : createCustomConnection(data);
      var reopenModal = overlay.dataset.reopenModal === "1";

      closeCustomForm();
      renderAll();
      renderPickerList();

      if(reopenModal && saved) openPersonalizadaModal(customToEntry(saved));
    });
  }

  // reopenAfterSave: quando a edição foi aberta a partir do modal de
  // detalhes ("Editar"), reabre o mesmo modal já atualizado ao salvar,
  // mantendo tudo dentro do mesmo fluxo (nunca cria uma segunda
  // Personalizada nem um segundo modal).
  function openCustomForm(existingCustom, reopenAfterSave){
    ensureCustomFormModal();
    var overlay = document.getElementById("cconn_form_modal");
    var nameEl = document.getElementById("cconn_form_name");
    var tagEl = document.getElementById("cconn_form_tag");
    var descEl = document.getElementById("cconn_form_desc");
    var errEl = document.getElementById("cconn_form_err");

    errEl.style.display = "none";
    document.getElementById("cconn_form_title").textContent = existingCustom ? "Editar Conexão Personalizada" : "Criar Conexão Personalizada";
    nameEl.value = existingCustom ? existingCustom.name : "";
    tagEl.value = existingCustom ? existingCustom.tag : "";
    descEl.value = existingCustom ? existingCustom.description : "";
    fillCustomFieldsForm(existingCustom ? existingCustom.fields : null);
    overlay.dataset.editingId = existingCustom ? existingCustom.id : "";
    overlay.dataset.reopenModal = reopenAfterSave ? "1" : "0";

    overlay.style.display = "flex";
    nameEl.focus();
  }

  function closeCustomForm(){
    var m = document.getElementById("cconn_form_modal");
    if(m) m.style.display = "none";
  }

  /* ==========================================================
     MODAL DE DETALHES DA PERSONALIZADA
     Reaproveita o MESMO #cx_modal (DOM e CSS) já usado pelo
     Compêndio para as Conexões oficiais — só popula os elementos por
     conta própria, porque openConexaoModal() do index.html é
     escrita especificamente para indexar CONEXOES_DATA[idx] e não
     pode ser reaproveitada como função para um objeto fora dessa
     biblioteca sem alterar o index.html (o que este projeto pede
     para evitar). Nenhum elemento novo de modal é criado: título,
     descrição, símbolo (oculto aqui) e botão fechar são os mesmos.
     Só as ações extras (Adicionar/Remover/Editar/Excluir) são
     adicionadas, e somente quando uma Personalizada está aberta.
     ========================================================== */

  function ensureModalCustomActions(){
    var existing = document.getElementById("cconn_modal_actions");
    if(existing) return existing;
    var modalBox = document.querySelector("#cx_modal .cx-modal-box");
    var actionsBar = document.querySelector("#cx_modal .modal-actions");
    if(!modalBox) return null;
    var actions = document.createElement("div");
    actions.id = "cconn_modal_actions";
    actions.className = "cconn-modal-actions";
    actions.style.display = "none";
    if(actionsBar) modalBox.insertBefore(actions, actionsBar);
    else modalBox.appendChild(actions);
    return actions;
  }

  // Chamado sempre que uma Conexão oficial é aberta (via wrap de
  // openConexaoModal), para nunca deixar as ações de Personalizada
  // aparecerem em cima de uma Conexão oficial.
  function hideCustomModalActions(){
    var actions = document.getElementById("cconn_modal_actions");
    if(actions) actions.style.display = "none";
  }

  // readOnly: quando true (chamado a partir de AGENTES → CONEXÕES), o
  // modal mostra exatamente os mesmos dados (nome/etiqueta/campos/efeito),
  // mas NÃO monta a barra de ações (Adicionar/Remover da Ficha, Editar,
  // Excluir) — vira puramente visualização. Sem esse parâmetro (chamado
  // a partir de PARANORMAL → PERSONALIZADAS), o comportamento de
  // gerenciamento continua exatamente como já era.
  function openPersonalizadaModal(entry, readOnly){
    var cc = findCustomById(entry.id);
    if(!cc) return; // foi excluída entre um clique e outro
    var c = customToEntry(cc);

    var symWrap = document.getElementById("cx_modal_sym");
    if(symWrap){
      symWrap.style.display = "none"; // sem imagem = nenhum espaço vazio no cabeçalho
      symWrap.classList.remove("cx-sym-light");
    }

    var titleEl = document.getElementById("cx_modal_title");
    var dimEl = document.getElementById("cx_modal_dim");
    var tecnicaBadge = document.getElementById("cx_modal_tecnica_badge");
    var fieldsEl = document.getElementById("cx_modal_fields");
    var sectionsEl = document.getElementById("cx_modal_sections");
    var pageEl = document.getElementById("cx_modal_page");
    var modalBox = document.querySelector("#cx_modal .cx-modal-box");
    if(!titleEl || !modalBox) return;

    titleEl.textContent = c.n;
    if(dimEl) dimEl.textContent = c.dl || "Personalizada";
    if(tecnicaBadge) tecnicaBadge.style.display = "none";
    modalBox.className = "modal-box cx-modal-box cx-personalizada";

    var fieldOrder = ["Função", "Alcance", "Corrupção", "Consumo", "Necessário", "RE", "DE"];
    var fieldsHtml = "";
    fieldOrder.forEach(function(label){
      if(c.c[label]){
        fieldsHtml += '<div class="cx-modal-field"><b>' + esc(label) + '</b><span>' + esc(c.c[label]) + '</span></div>';
      }
    });
    if(fieldsEl) fieldsEl.innerHTML = fieldsHtml;

    var sectionsHtml = "";
    (c.e || []).forEach(function(section){
      sectionsHtml += '<div class="cx-modal-section"><h5>' + esc(section.t) + '</h5><p>' + esc(section.x) + '</p></div>';
    });
    if(!sectionsHtml){
      sectionsHtml = '<div class="cx-modal-section"><p class="empty-state">Sem efeito descrito.</p></div>';
    }
    if(sectionsEl) sectionsEl.innerHTML = sectionsHtml;
    if(pageEl){
      pageEl.textContent = "Conexão Personalizada";
      pageEl.style.display = "";
    }

    var actions = ensureModalCustomActions();
    if(actions){
      if(readOnly){
        // AGENTES → CONEXÕES: somente leitura. Nunca mostra Adicionar/
        // Remover da Ficha, Editar ou Excluir aqui — o gerenciamento
        // continua exclusivo de PARANORMAL → PERSONALIZADAS.
        actions.innerHTML = "";
        actions.style.display = "none";
      } else {
        var refs = getConnRefs();
        var inSheet = refs.indexOf(c.id) !== -1;
        actions.innerHTML =
          '<button type="button" id="cconn_modal_toggle_btn" class="primary">' + (inSheet ? "Remover da Ficha" : "Adicionar à Ficha") + '</button>' +
          '<button type="button" id="cconn_modal_edit_btn">Editar</button>' +
          '<button type="button" id="cconn_modal_delete_btn">Excluir</button>';
        actions.style.display = "flex";

        document.getElementById("cconn_modal_toggle_btn").addEventListener("click", function(){
          if(inSheet) removeConnection(c.id); else addConnection(c.id);
          openPersonalizadaModal(c); // re-renderiza o modal já com o novo estado (gerenciamento)
        });
        document.getElementById("cconn_modal_edit_btn").addEventListener("click", function(){
          document.getElementById("cx_modal").style.display = "none";
          openCustomForm(cc, true);
        });
        document.getElementById("cconn_modal_delete_btn").addEventListener("click", async function(){
          if(!confirm('Excluir a Conexão Personalizada "' + cc.name + '"? Essa ação não pode ser desfeita.')) return;
          var delBtn = document.getElementById("cconn_modal_delete_btn");
          if(delBtn){ delBtn.disabled = true; delBtn.textContent = "Excluindo…"; }

          // ETAPA 6: exclusão agora é local-primeiro (igual Agentes e
          // Criaturas) — não espera mais a nuvem confirmar. Só fica
          // "presa" aqui se o próprio salvamento LOCAL falhar.
          var res = await deleteCustomConnection(cc.id);
          if(!res || !res.ok){
            if(typeof window.flashIndicator === "function"){
              window.flashIndicator("☁ Não foi possível salvar a exclusão localmente. Tente novamente.", true, 3600);
            }
            if(delBtn){ delBtn.disabled = false; delBtn.textContent = "Excluir"; }
            return;
          }

          removeConnection(cc.id); // some da ficha atual, se estiver associada (já renderiza tudo de novo)
          document.getElementById("cx_modal").style.display = "none";
          renderPickerList();
        });
      }
    }

    document.getElementById("cx_modal").style.display = "flex";
  }

  /* ==========================================================
     INTEGRAÇÃO COM O FLUXO DE FICHAS/MODAL JÁ EXISTENTE
     Mesmo padrão já usado pela Bandeja de Rolagens: envolve
     openSheet() / createNewSheet() / openConexaoModal() sem
     reescrevê-las, só para trocar de "dono" junto com a
     troca/criação de ficha e para esconder as ações de Personalizada
     quando uma Conexão oficial é exibida.
     ========================================================== */

  function wrapSheetFunctions(){
    if(typeof openSheet === "function"){
      var _origOpenSheet = openSheet;
      openSheet = async function(id){
        // Evita que a referência da ficha anterior "vaze" para a
        // próxima antes do carregamento real (relevante só para
        // fichas antigas, salvas antes de agente_conexoes_ids
        // existir — loadAgent() sobrescreve normalmente quando o
        // campo já foi salvo).
        resetConnRefsSilent();
        await _origOpenSheet(id);
        renderAll();
      };
    }
    if(typeof createNewSheet === "function"){
      var _origCreateNewSheet = createNewSheet;
      createNewSheet = async function(){
        await _origCreateNewSheet();
        resetConnRefsSilent();
        renderAll();
      };
    }
  }

  function wrapOpenConexaoModal(){
    if(typeof window.openConexaoModal !== "function") return;
    var _origOpenConexaoModal = window.openConexaoModal;
    window.openConexaoModal = function(idx){
      _origOpenConexaoModal(idx);
      hideCustomModalActions();
    };
  }

  /* ==========================================================
     ETAPA 6 — RESOLUÇÃO EXPLÍCITA DE CONFLITO
     Reaproveita o mesmo modal compartilhado (#cloud_conflict_modal /
     #cloud_conflict_confirm_modal) usado por Agentes e Criaturas —
     ver js/sync-queue.js. Corrige o problema encontrado na auditoria
     6.0 ("ausência de conflito" / "cloud sempre vencendo
     silenciosamente"): agora, quando a nuvem mudou por baixo, NADA é
     sobrescrito sozinho — o usuário escolhe.
     ========================================================== */
  var __conflictCCId = null;
  function showConflictModalCC(){ var el = document.getElementById("cloud_conflict_modal"); if(el) el.style.display = "flex"; }
  function hideConflictModalCC(){ var el = document.getElementById("cloud_conflict_modal"); if(el) el.style.display = "none"; }
  function showConflictConfirmModalCC(){ var el = document.getElementById("cloud_conflict_confirm_modal"); if(el) el.style.display = "flex"; }
  function hideConflictConfirmModalCC(){ var el = document.getElementById("cloud_conflict_confirm_modal"); if(el) el.style.display = "none"; }

  function openConflictResolutionCC(id){
    if(!id) return;
    __conflictCCId = id;
    showConflictModalCC();
  }

  async function useCloudVersionForConflictCC(){
    var id = __conflictCCId;
    hideConflictModalCC();
    if(!id) return;
    var cc = findCustomById(id);
    var client = getClient();
    var user = await getCurrentUser();
    if(!cc || !client || !user){
      if(typeof window.flashIndicator === "function") window.flashIndicator("☁ Sem conexão com a nuvem agora. Tente novamente mais tarde.", true, 3200);
      __conflictCCId = null;
      return;
    }
    try{
      var res = await client.from("custom_connections").select("id,name,description,tag,updated_at").eq("id", id).eq("user_id", user.id).maybeSingle();
      if(res.error) throw res.error;
      if(!res.data){
        // Foi excluída na nuvem enquanto o conflito estava aberto — a
        // decisão explícita vira "excluir localmente também", nunca
        // um reenvio silencioso.
        customConnections = customConnections.filter(function(c){ return c.id !== id; });
        saveCustomLibrary();
        if(typeof window.flashIndicator === "function") window.flashIndicator("☁ Esta Conexão foi excluída na nuvem. Removida também localmente.", true, 3600);
        renderAll(); renderPickerList();
        __conflictCCId = null;
        return;
      }
      cc.name = res.data.name || "";
      var decoded = decodeCloudDescription(res.data.description);
      cc.description = decoded.description;
      cc.fields = decoded.fields;
      cc.tag = res.data.tag || "";
      cc.cloudMeta = { existsCloud: true, lastSyncedUpdatedAt: res.data.updated_at, conflict: false };
      saveCustomLibrary();
      renderAll(); renderPickerList();
      if(typeof window.flashIndicator === "function") window.flashIndicator("☁ Versão da nuvem aplicada.", false, 2600);
    }catch(e){
      logCCError("falha ao aplicar versão da nuvem no conflito '" + id + "'", e);
      if(typeof window.flashIndicator === "function") window.flashIndicator("☁ Não foi possível carregar a versão da nuvem. Tente novamente.", true, 3200);
    }finally{
      __conflictCCId = null;
    }
  }

  function askKeepLocalVersionCC(){ hideConflictModalCC(); showConflictConfirmModalCC(); }
  function cancelKeepLocalVersionCC(){ hideConflictConfirmModalCC(); showConflictModalCC(); }

  async function confirmKeepLocalVersionCC(){
    var id = __conflictCCId;
    hideConflictConfirmModalCC();
    if(!id) return;
    var cc = findCustomById(id);
    var client = getClient();
    var user = await getCurrentUser();
    if(!cc || !client || !user){
      if(typeof window.flashIndicator === "function") window.flashIndicator("☁ Sem conexão com a nuvem agora. Tente novamente mais tarde.", true, 3200);
      __conflictCCId = null;
      return;
    }
    try{
      var res = await client.from("custom_connections")
        .update({ name: cc.name, description: encodeCloudDescription(cc), tag: cc.tag, type: cc.type || "custom" })
        .eq("id", id).eq("user_id", user.id).select("id,updated_at").single();
      if(res.error) throw res.error;
      cc.cloudMeta = { existsCloud: true, lastSyncedUpdatedAt: res.data.updated_at, conflict: false };
      saveCustomLibrary();
      if(typeof window.flashIndicator === "function") window.flashIndicator("☁ Sua versão substituiu a versão da nuvem.", false, 2500);
    }catch(e){
      logCCError("falha ao substituir a nuvem pela versão local '" + id + "'", e);
      if(cc){ cc.cloudMeta = cc.cloudMeta || {}; cc.cloudMeta.conflict = true; saveCustomLibrary(); }
      if(typeof window.flashIndicator === "function") window.flashIndicator("☁ Não foi possível substituir a versão da nuvem. Tente novamente.", true, 3200);
    }finally{
      __conflictCCId = null;
    }
  }

  /* ==========================================================
     ETAPA 6 — ADAPTER DA FILA DE SINCRONIZAÇÃO
     sync(localId): relê a Personalizada local NA HORA e chama
     syncUpdateToCloud() (que decide sozinho create/update/conflito).
     del(localId): exclusão por id é idempotente por natureza (DELETE
     de uma linha que não existe mais não é erro), então funciona
     mesmo que o registro nunca tenha chegado à nuvem — sem precisar
     de nenhum metadado extra para decidir isso.
     ========================================================== */
  async function queueSyncCC(localId){
    var cc = findCustomById(localId);
    if(!cc) return { ok: true, skipped: true };
    return await syncUpdateToCloud(cc);
  }
  async function queueDeleteCC(localId){
    var client = getClient();
    if(!client) return { ok: false, offline: true };
    var user = await getCurrentUser();
    if(!user) return { ok: false, offline: true };
    try{
      var res = await client.from("custom_connections").delete().eq("id", localId).eq("user_id", user.id);
      if(res.error) throw res.error;
      return { ok: true };
    }catch(e){
      logCCError("falha ao excluir na nuvem '" + localId + "'", e);
      return { ok: false, error: true, errorInfo: errInfoCC(e) };
    }
  }

  function registerWithSyncQueue(){
    if(!window.CRISSyncQueue) return;
    if(typeof window.CRISSyncQueue.registerAdapter === "function"){
      window.CRISSyncQueue.registerAdapter("custom_connection", { sync: queueSyncCC, del: queueDeleteCC });
    }
    if(typeof window.CRISSyncQueue.registerConflictHandlers === "function"){
      window.CRISSyncQueue.registerConflictHandlers("custom_connection", {
        open: openConflictResolutionCC,
        useCloud: useCloudVersionForConflictCC,
        keepLocal: askKeepLocalVersionCC,
        cancelKeepLocal: cancelKeepLocalVersionCC,
        confirmKeepLocal: confirmKeepLocalVersionCC
      });
    }
  }

  /* ---------- boot ---------- */
  function initCharacterConnections(){
    ensureHiddenField();
    wrapSheetFunctions();
    wrapOpenConexaoModal();
    ensureParanormalPanel();
    ensureAgentesDisplayPanel();
    renderAll();
    loadCustomConnections();
    registerWithSyncQueue(); // ETAPA 6 — chamado aqui (não no topo do
    // arquivo) de propósito: este script roda ANTES de js/sync-queue.js
    // na ordem das tags <script>, então window.CRISSyncQueue só existe
    // com certeza depois de DOMContentLoaded, quando todo script síncrono
    // já rodou.
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", initCharacterConnections);
  } else {
    initCharacterConnections();
  }

  // ---------------------------------------------------------
  // API pública mínima — só para permitir que outros sistemas já
  // existentes (ex.: Pontos de Restauração da Ficha, em index.html)
  // peçam um redesenho do painel de Conexões depois de alterar o
  // campo oculto #agente_conexoes_ids por fora (ex.: restaurando um
  // backup). NÃO cria nenhum armazenamento novo nem muda o
  // comportamento de renderAll()/renderMinhasConexoes()/
  // renderAgenteConexoes() — apenas expõe o que já existia como
  // função privada do módulo.
  // ---------------------------------------------------------
  window.CharacterConnections = {
    refresh: renderAll,
    // Recarrega somente a biblioteca local ativa. O modo visitante usa a
    // mesma interface, mas uma área de armazenamento separada por aparelho.
    reloadLibrary: loadCustomConnections,
    importLibrary: importCustomLibrary
  };

  // ETAPA 4.1B — chamado por index.html: syncAfterLogin() a partir de
  // crisStartAppIfNeeded() (mesmo ponto onde CRISSync.onLogin() já roda
  // para fichas); resetOnLogout() a partir de window.crisResetAppState().
  window.CRISCustomConnectionsSync = {
    syncAfterLogin: syncAfterLogin,
    resetOnLogout: resetOnLogout
  };

})();
