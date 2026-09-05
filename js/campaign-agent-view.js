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
  var __restoreAgentId = null;

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

  function showBanner(nome) {
    var banner = $("cris_foreign_banner");
    var text = $("cris_foreign_banner_text");
    if (text) text.textContent = "Editando ficha de " + nome + " como Mestre — as alterações são salvas direto nesta ficha (nunca cria uma cópia).";
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
     ------------------------------------------------------------ */
  async function saveForeignAgentSheet() {
    if (!__foreignActive || !__foreignAgentId) return;
    var client = getClient();
    if (!client) return;

    var btn = $("cris_foreign_banner_salvar");
    var originalLabel = btn ? btn.textContent : null;
    if (btn) { btn.disabled = true; btn.textContent = "Salvando…"; }

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
        .eq("id", __foreignAgentId);
      if (upd.error) throw upd.error;

      if (typeof window.flashIndicator === "function") {
        window.flashIndicator("✓ Ficha salva com sucesso!", false, 2500);
      }
    } catch (e) {
      console.error("[CRIS CampaignAgentView] Falha ao salvar ficha de terceiro:", e);
      if (typeof window.flashIndicator === "function") {
        window.flashIndicator("✕ Não foi possível salvar: " + (e && e.message ? e.message : "erro desconhecido"), true, 3000);
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
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
    if (salvarBtn) salvarBtn.addEventListener("click", saveForeignAgentSheet);

    wireAutoExitOnOtherTabs();
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
  };
})();
