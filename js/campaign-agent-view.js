/* ==========================================================
   C.R.I.S. — VISUALIZAÇÃO/EDIÇÃO DE FICHA DE TERCEIRO PELO MESTRE
   (FASE G — Etapa 6)
   ==========================================================
   Arquivo isolado. Permite que o Mestre de uma campanha abra E
   edite a ficha de um personagem vinculado que NÃO é dele,
   reaproveitando o HTML/CSS de #tab-agentes já existente — sem
   criar uma segunda interface de ficha.

   POR QUE A GRAVAÇÃO NÃO REUSA saveAgent():
     saveAgent() sempre grava no storage LOCAL do usuário logado
     (storageSet(sheetStorageKey(currentAgentId), ...)) e depois
     sincroniza esse registro local para a nuvem como pertencente
     a ELE (supabase-sync.js -> agents.user_id = auth.uid()). Se a
     ficha de outro jogador fosse editada por esse caminho, o
     resultado seria uma CÓPIA do agente pertencente ao Mestre —
     exatamente a duplicação que o prompt proíbe.

     Por isso a gravação daqui é um UPDATE DIRETO em public.agents
     pelo id do agente original, usando a policy já existente
     agents_update_campaign_master (auditada na Etapa 1 — nenhuma
     policy nova foi necessária para isto). currentAgentId,
     sheetsIndex e sheetStorageKey nunca são tocados por este
     arquivo.

   ESCOPO desta edição: só os campos que já fazem parte de
   agentFieldIds() (os mesmos que saveAgent() sempre salvou —
   atributos, SAN/HP/Fadiga, habilidades, dados, Corrupção/
   Infecção/Dimensão, Aborto Límbico, Habilidades em 50 etc.).
   Inventário e Conexões Paranormais ficam de fora nesta etapa:
   são subsistemas com armazenamento PRÓPRIO, separado de
   agentFieldIds() (inventoryStorageKey / character-connections.js),
   então editá-los aqui exigiria desviar também esses dois
   mecanismos — deixado para depois, para não arriscar os dois de
   uma vez. Por segurança, sair da aba Agentes enquanto se vê a
   ficha de terceiro encerra automaticamente o modo (ver
   wireAutoExitOnOtherTabs()), assim nenhuma edição de Inventário/
   Paranormal acontece "por engano" enquanto uma ficha de terceiro
   está carregada nos campos.
   ========================================================== */
(function () {
  "use strict";

  function getClient() {
    if (typeof window.CRISAuth === "undefined") return null;
    if (window.CRISAuth.configError) return null;
    return window.CRISAuth.client || null;
  }

  function $(id) { return document.getElementById(id); }

  // Estado do módulo — nunca persistido, só em memória enquanto a tela
  // de ficha de terceiro está aberta.
  var __foreignActive = false;
  var __foreignAgentId = null;
  var __foreignAgentName = null;
  var __restoreAgentId = null;

  /* ============================================================
     CORREÇÃO — AUTOSAVE DA FICHA DE TERCEIRO (Problema 1)
     ------------------------------------------------------------
     Antes desta correção, a única forma de gravar a edição do
     Mestre era o clique manual em "Salvar Alterações". Isso não
     violava a arquitetura (o UPDATE direto em public.agents já
     descrito acima continua sendo o único caminho de escrita),
     mas exigia uma ação manual — o que não funciona bem no celular
     e não dá a sensação "quase em tempo real" pedida.

     __foreignDirty rastreia se HÁ edição do Mestre ainda não
     confirmada no Supabase desde a última aplicação de uma
     atualização remota — usado para nunca sobrescrever
     silenciosamente uma edição do Mestre ainda não salva quando uma
     atualização remota (de outro dispositivo do mesmo jogador,
     por exemplo) chegar via Realtime enquanto o Mestre edita.
     ============================================================ */
  var __foreignDirty = false;
  var __foreignSaveInFlight = false; // evita saves concorrentes (autosave x clique manual), mesmo padrão de __agentSaveInFlight
  var __foreignSaveDebounced = null; // criado sob demanda (precisa de window.debounce)

  function isForeignDirty() { return __foreignActive && __foreignDirty; }

  function clearFields() {
    if (typeof window.agentFieldIds !== "function") return;
    window.agentFieldIds().forEach(function (id) {
      var el = $(id);
      if (el) el.value = "";
    });
  }

  function fillFieldsFrom(data) {
    Object.keys(data || {}).forEach(function (id) {
      var el = $(id);
      if (el) el.value = data[id];
    });
  }

  function refreshDerivedDisplays() {
    [
      "updateSAN", "updateHP", "updateFatigue", "updateLevelDisplay",
      "renderProgressao", "initAllSkillBaselines", "checkHabilidades50Unlock",
      "renderAbortoLimbico",
    ].forEach(function (fn) {
      if (typeof window[fn] === "function") {
        try { window[fn](); } catch (e) { /* melhor esforço — não bloqueia a visualização */ }
      }
    });
  }

  function foreignBannerBaseText(nome) {
    return "Editando ficha de " + nome + " como Mestre — as alterações são salvas direto nesta ficha (nunca cria uma cópia).";
  }

  function showBanner(nome) {
    __foreignAgentName = nome;
    var banner = $("cris_foreign_banner");
    var text = $("cris_foreign_banner_text");
    if (text) text.textContent = foreignBannerBaseText(nome);
    if (banner) banner.style.display = "flex";
    var capture = $("agent-sheet-capture");
    if (capture) capture.classList.add("cris-foreign-readonly");
  }

  function hideBanner() {
    var banner = $("cris_foreign_banner");
    if (banner) banner.style.display = "none";
    var capture = $("agent-sheet-capture");
    if (capture) capture.classList.remove("cris-foreign-readonly");
  }

  /* ============================================================
     Sai do modo "ficha de terceiro" e restaura a ficha que estava
     aberta antes (ou limpa os campos, se nenhuma estava aberta).
     Chamada pelo botão "Voltar", ao trocar de aba (proteção contra
     editar Inventário/Paranormal com a ficha errada carregada) e,
     defensivamente, no início de openSheet()/createNewSheet().
     ============================================================ */
  function exitForeignModeIfNeeded() {
    if (!__foreignActive) return;
    __foreignActive = false;
    __foreignAgentId = null;
    __foreignAgentName = null;
    __foreignDirty = false;
    hideBanner();
    var btnSave = $("btn_save_agent");
    if (btnSave) btnSave.style.display = "";

    if (__restoreAgentId && typeof window.openSheet === "function") {
      window.openSheet(__restoreAgentId);
    } else {
      clearFields();
    }
    __restoreAgentId = null;
  }

  async function openForeignAgentSheet(agentId, fallbackName) {
    // Protege edições não salvas da PRÓPRIA ficha do Mestre antes de
    // substituir os campos pelos de outra pessoa.
    if (!__foreignActive && typeof window.isAgentDirty === "function" && window.isAgentDirty()) {
      var ok = window.confirm(
        "Você tem alterações não salvas na sua própria ficha. Elas serão perdidas ao abrir a ficha de outro personagem. Deseja continuar?"
      );
      if (!ok) return;
    }

    var client = getClient();
    if (!client) {
      if (typeof window.flashIndicator === "function") {
        window.flashIndicator("✕ Sem conexão com o Supabase.", true, 3000);
      }
      return;
    }

    try {
      var res = await client.from("agents").select("id,name,data").eq("id", agentId).maybeSingle();
      if (res.error) throw res.error;
      if (!res.data) {
        if (typeof window.flashIndicator === "function") {
          window.flashIndicator("✕ Não foi possível abrir esta ficha.", true, 3000);
        }
        return;
      }

      var agent = res.data;
      var data = (agent.data && typeof agent.data === "object") ? agent.data : {};
      var nome = (agent.name || data.nome || fallbackName || "Ficha sem nome").trim();

      // Só guarda a ficha própria que estava aberta na PRIMEIRA vez que
      // entra em modo terceiro — evita que abrir ficha de terceiro duas
      // vezes seguidas sobrescreva a referência de restauração correta.
      if (!__foreignActive) __restoreAgentId = window.currentAgentId || null;
      __foreignActive = true;
      __foreignAgentId = agentId;

      clearFields();
      fillFieldsFrom(data);
      refreshDerivedDisplays();

      var btnSave = $("btn_save_agent");
      if (btnSave) btnSave.style.display = "none";
      showBanner(nome);

      if (typeof window.showAppScreen === "function") window.showAppScreen();
      var tabBtn = document.querySelector('.tab-btn[data-tab="agentes"]');
      if (tabBtn) tabBtn.click();
    } catch (e) {
      console.error("[CRIS CampaignAgentView] Falha ao abrir ficha de terceiro:", e);
      if (typeof window.flashIndicator === "function") {
        window.flashIndicator("✕ Falha ao abrir ficha: " + (e && e.message ? e.message : "erro desconhecido"), true, 3000);
      }
    }
  }

  /* ------------------------------------------------------------
     Salva a ficha de terceiro — UPDATE direto em public.agents por
     id (ver explicação no cabeçalho do arquivo). Mesmos dois passos
     de saneamento que saveAgent() já faz (checkHabilidades50Unlock
     e o teto de SAN Atual pela SAN Máxima) para não divergir do
     comportamento normal de salvar uma ficha.

     CORREÇÃO (autosave): agora aceita ser chamada tanto pelo clique
     manual em "Salvar Alterações" (isAutosave=false — comportamento
     idêntico ao de antes, com botão desabilitado e toast de
     sucesso/erro) quanto pelo debounce do autosave (isAutosave=true
     — não desabilita o botão nem mostra um toast a cada salvamento
     silencioso; só o texto discreto do próprio banner muda para
     "Salvando…"/"Salvo"). Erros SEMPRE aparecem, nos dois modos —
     nunca falham silenciosamente.
     ------------------------------------------------------------ */
  async function saveForeignAgentSheet(isAutosave) {
    if (!__foreignActive || !__foreignAgentId) return;
    if (__foreignSaveInFlight) {
      // Já existe um salvamento em andamento (autosave ou clique manual):
      // não dispara um segundo em paralelo. Como o debounce só chama esta
      // função depois de ~700ms sem edição, o próprio __foreignDirty
      // (marcado a cada tecla) garante que a próxima chamada tentará de
      // novo assim que o salvamento atual terminar, se ainda houver
      // edição pendente — nenhuma alteração fica perdida silenciosamente.
      return;
    }
    var client = getClient();
    if (!client) return;
    __foreignSaveInFlight = true;

    var agentIdAtSaveStart = __foreignAgentId; // protege contra "Voltar"/trocar de ficha no meio do salvamento
    var btn = $("cris_foreign_banner_salvar");
    var originalLabel = btn ? btn.textContent : null;
    var textEl = $("cris_foreign_banner_text");

    if (isAutosave) {
      if (textEl) textEl.textContent = "Salvando…";
    } else {
      if (btn) { btn.disabled = true; btn.textContent = "Salvando…"; }
    }

    try {
      if (typeof window.checkHabilidades50Unlock === "function") window.checkHabilidades50Unlock();

      var data = {};
      window.agentFieldIds().forEach(function (id) {
        var el = $(id);
        if (el) data[id] = el.value;
      });

      var sanMax = parseInt(data.san_max, 10);
      var sanAtual = parseInt(data.san_atual, 10);
      if (!isNaN(sanMax) && !isNaN(sanAtual) && sanAtual > sanMax) {
        data.san_atual = String(sanMax);
        var elSan = $("san_atual");
        if (elSan) elSan.value = data.san_atual;
      }

      var nomeFicha = (data.nome || "").trim() || "Ficha sem nome";
      var upd = await client
        .from("agents")
        .update({ name: nomeFicha, data: data, updated_at: new Date().toISOString() })
        .eq("id", agentIdAtSaveStart)
        .select("id,updated_at")
        .single();
      if (upd.error) throw upd.error;

      // Se o Mestre saiu da ficha (ou abriu outra) enquanto o UPDATE estava
      // em voo, não mexe mais em nenhum estado/UI desta ficha antiga.
      if (__foreignAgentId !== agentIdAtSaveStart) return;

      // Registra este próprio UPDATE no guarda-loop do Realtime (ver
      // js/agents-realtime.js): quando o evento Realtime deste mesmo
      // UPDATE chegar de volta (o Supabase notifica também quem
      // escreveu), ele é reconhecido como eco e ignorado — nunca tratado
      // como uma nova alteração remota de terceiro.
      if (window.CRISAgentsRealtime && typeof window.CRISAgentsRealtime.markSelfWrite === "function") {
        window.CRISAgentsRealtime.markSelfWrite(upd.data.id, upd.data.updated_at);
      }

      __foreignDirty = false;

      if (isAutosave) {
        if (textEl) {
          textEl.textContent = "Salvo.";
          setTimeout(function () {
            // só restaura o texto padrão se ainda estivermos na mesma ficha
            // e nenhuma outra mensagem transitória (ex.: atualização remota
            // chegada nesse meio-tempo) já tiver substituído esta.
            if (__foreignActive && __foreignAgentId === agentIdAtSaveStart && textEl.textContent === "Salvo." && __foreignAgentName) {
              textEl.textContent = foreignBannerBaseText(__foreignAgentName);
            }
          }, 1800);
        }
      } else if (typeof window.flashIndicator === "function") {
        window.flashIndicator("✓ Ficha salva com sucesso!", false, 2500);
      }
    } catch (e) {
      console.error("[CRIS CampaignAgentView] Falha ao salvar ficha de terceiro:", e);
      if (typeof window.flashIndicator === "function") {
        window.flashIndicator("✕ Não foi possível salvar: " + (e && e.message ? e.message : "erro desconhecido"), true, 3000);
      }
      if (isAutosave && textEl) textEl.textContent = "Erro ao salvar — tentando de novo em breve.";
    } finally {
      if (!isAutosave && btn) { btn.disabled = false; btn.textContent = originalLabel; }
      __foreignSaveInFlight = false;
      // Se chegou edição nova enquanto este salvamento estava em voo (ou o
      // salvamento falhou e __foreignDirty nunca foi zerado), garante que
      // não fica "esquecida" sem tentar de novo — reagenda o autosave.
      if (__foreignActive && __foreignDirty) getForeignSaveDebounced()();
    }
  }

  /* ------------------------------------------------------------
     AUTOSAVE — dispara saveForeignAgentSheet(true) depois de um
     debounce curto (700ms) sem novas edições, exatamente como
     pedido ("aguarda ~500-1000ms sem nova alteração"). Reaproveita
     a função debounce() já definida globalmente pelo script
     principal do index.html (window.debounce) — nenhuma segunda
     implementação de debounce é criada.
     ------------------------------------------------------------ */
  function getForeignSaveDebounced() {
    if (!__foreignSaveDebounced) {
      var fn = (typeof window.debounce === "function")
        ? window.debounce(function () { saveForeignAgentSheet(true); }, 700)
        : function () { saveForeignAgentSheet(true); }; // fallback defensivo — nunca deveria faltar
      __foreignSaveDebounced = fn;
    }
    return __foreignSaveDebounced;
  }

  /* ------------------------------------------------------------
     Ouve input/change dentro de #tab-agentes SOMENTE enquanto o
     modo "ficha de terceiro" está ativo — um listener PRÓPRIO,
     paralelo ao listener delegado já existente no script principal
     (que continua marcando __agentDirty normalmente para a ficha do
     PRÓPRIO Mestre; não é tocado por este arquivo). Não usa
     dispatchEvent em nenhum lugar deste módulo, então atualizações
     remotas aplicadas via applyRemoteUpdate() (que só faz
     el.value = ...) nunca disparam este listener — sem risco do
     loop "salva -> Realtime -> recebe -> salva de novo" descrito no
     prompt.
     ------------------------------------------------------------ */
  function wireForeignAutosave() {
    var panel = $("tab-agentes");
    if (!panel) return;
    function onEdit(e) {
      if (!__foreignActive) return;
      if (!e.target || !e.target.matches || !e.target.matches("input, textarea, select")) return;
      __foreignDirty = true;
      getForeignSaveDebounced()();
    }
    panel.addEventListener("input", onEdit);
    panel.addEventListener("change", onEdit);
  }

  /* ------------------------------------------------------------
     RECEBER ATUALIZAÇÃO REMOTA (Realtime) enquanto o Mestre está
     vendo esta MESMA ficha de terceiro — chamado por
     js/agents-realtime.js quando chega um UPDATE em public.agents
     cujo id é o __foreignAgentId atual.

     Regras (instruções "CUIDADO COM CAMPOS EDITÁVEIS"/"CONFLITOS"):
       - se o Mestre tem uma edição própria ainda não salva aqui
         (__foreignDirty), NÃO sobrescreve nada agora — o próprio
         autosave, ao rodar em seguida, vai fazer um UPDATE que
         sobrescreve com a versão do Mestre (é o comportamento já
         aceito hoje, sem lock otimista nesta ficha específica —
         documentado no relatório como risco residual do Caso D);
       - caso contrário, aplica os campos exceto o que estiver com
         foco neste exato momento (evita interromper uma digitação
         em andamento mesmo que ainda não tenha marcado dirty).
     ------------------------------------------------------------ */
  function applyRemoteUpdate(row) {
    if (!__foreignActive || !row || row.id !== __foreignAgentId) return;
    if (__foreignDirty) return; // não sobrescreve edição do Mestre ainda não salva

    var data = (row.data && typeof row.data === "object") ? row.data : {};
    var focused = document.activeElement;
    Object.keys(data).forEach(function (id) {
      if (focused && focused.id === id) return; // não mexe no campo em edição agora
      var el = $(id);
      if (el) el.value = data[id];
    });
    refreshDerivedDisplays();

    var textEl = $("cris_foreign_banner_text");
    if (textEl) {
      textEl.textContent = "Ficha atualizada (alterada em outro dispositivo).";
      setTimeout(function () {
        if (__foreignActive && __foreignAgentId === row.id && __foreignAgentName && textEl.textContent.indexOf("Ficha atualizada") === 0) {
          textEl.textContent = foreignBannerBaseText(__foreignAgentName);
        }
      }, 2600);
    }
  }

  /* ------------------------------------------------------------
     Sair automaticamente do modo "ficha de terceiro" ao navegar
     para QUALQUER outra aba (Inventário, Paranormal, Compêndio,
     Campanhas etc.) — impede editar Inventário/Conexões (que têm
     armazenamento próprio, fora do escopo desta etapa) com uma
     ficha de terceiro ainda "carregada" nos campos de #tab-agentes.
     ------------------------------------------------------------ */
  function wireAutoExitOnOtherTabs() {
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      if (btn.dataset.tab === "agentes") return;
      btn.addEventListener("click", function () {
        if (__foreignActive) exitForeignModeIfNeeded();
      });
    });
  }

  function wireBanner() {
    var voltarBtn = $("cris_foreign_banner_voltar");
    if (voltarBtn) {
      voltarBtn.addEventListener("click", function () {
        exitForeignModeIfNeeded();
        var tabBtn = document.querySelector('.tab-btn[data-tab="campanhas"]');
        if (tabBtn) tabBtn.click();
        if (window.CRISCampaigns && typeof window.CRISCampaigns.showSubtab === "function") {
          window.CRISCampaigns.showSubtab("jogadores");
        }
      });
    }
    var salvarBtn = $("cris_foreign_banner_salvar");
    if (salvarBtn) salvarBtn.addEventListener("click", function () { saveForeignAgentSheet(false); });

    wireAutoExitOnOtherTabs();
    wireForeignAutosave();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireBanner);
  } else {
    wireBanner();
  }

  window.CRISCampaignAgentView = {
    open: openForeignAgentSheet,
    exitIfNeeded: exitForeignModeIfNeeded,
    isActive: function () { return __foreignActive; },
    // usados por js/agents-realtime.js para rotear um evento de UPDATE
    // recebido do Supabase até esta ficha de terceiro (quando aplicável).
    currentForeignId: function () { return __foreignActive ? __foreignAgentId : null; },
    applyRemoteUpdate: applyRemoteUpdate,
    isDirty: isForeignDirty,
  };
})();
