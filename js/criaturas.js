/* ==========================================================
   CRIATURAS — ARQUIVOS SECRETOS
   Etapa 3 — Ficha de Criatura
   Etapa 4 — Minhas Criaturas

   Módulo isolado. Não reescreve, não refatora e não altera
   nenhum sistema já existente do Origem do Caos (Agentes,
   Backup, Compêndio, Inventário, Conexões, Condições,
   Habilidades). Reaproveita SOMENTE os helpers genéricos já
   expostos globalmente por index.html:
     storageGet / storageSet / storageDeleteKey / storageListKeys
     flashIndicator, escapeHtml (se existir)
     bkpCreateAutoBackup (chamado com typeof-check, como o
     restante do projeto já faz — nunca criado nem alterado aqui)

   Chaves de armazenamento PRÓPRIAS (nunca colidem com "agente:*"
   nem com "agentes:index"; o backup existente enumera TODAS as
   chaves via storageListKeys(""), então estas passam a ser
   incluídas automaticamente em qualquer snapshot, sem precisar
   tocar no script de Backup e Restauração):
     criaturas:index          -> [{id, nome, updatedAt}]
     criatura:sheet:<id>      -> dados completos da ficha (JSON)

   Os campos da ficha foram levantados a partir do PDF oficial
   enviado (ficha "Gladiadora Perdida | Angel"): identificação,
   dados de combate, sistema de vitalidade, condições físicas,
   itens, Habilidades/Talentos/Atributos/Perícias (grade de
   Pontos + níveis de dado 4/6/8/12/20, no mesmo padrão visual das
   skills de Agente) e o bloco livre "Movimentos, Conexões e
   Habilidades". Habilidades de Criaturas e o Compêndio de
   Criaturas NÃO são implementados aqui (etapas futuras) — os
   cards correspondentes continuam com o aviso de placeholder já
   existente, sem nenhuma alteração.
   ========================================================== */
(function(){
  "use strict";

  /* ---------- listas de skills da ficha de criatura ---------- */
  const CR_HABILIDADES = [
    ["cr_hab_arrombamento","Arrombamento"],
    ["cr_hab_flexibilidade","Flexibilidade"],
    ["cr_hab_sentido_paranormal","Sentido Paranormal"],
    ["cr_hab_ferramenta","Ferramenta"],
    ["cr_hab_natacao","Natação"],
    ["cr_hab_ilusionismo","Ilusionismo"],
    ["cr_hab_roubo","Roubo"],
    ["cr_hab_atletismo","Atletismo"],
    ["cr_hab_manipulacao","Manipulação"]
  ];
  const CR_TALENTOS = [
    ["cr_tal_intimidacao","Intimidação"],
    ["cr_tal_rastrear","Rastrear"],
    ["cr_tal_folego","Fôlego"],
    ["cr_tal_trabalho_equipe","Trabalho em Equipe"],
    ["cr_tal_mirar","Mirar"],
    ["cr_tal_combate","Combate"],
    ["cr_tal_silencioso","Silencioso"],
    ["cr_tal_observador","Observador"],
    ["cr_tal_criminalidade","Criminalidade"],
    ["cr_tal_percepcao","Percepção"],
    ["cr_tal_lideranca","Liderança"],
    ["cr_tal_adaptacao","Adaptação"]
  ];
  const CR_ATRIBUTOS = [
    ["cr_atr_agilidade","Agilidade"],
    ["cr_atr_inteligencia","Inteligência"],
    ["cr_atr_ocultismo","Ocultismo"],
    ["cr_atr_velocidade","Velocidade"],
    ["cr_atr_logica","Lógica"],
    ["cr_atr_aparencia","Aparência"],
    ["cr_atr_forca_fisica","Força Física"],
    ["cr_atr_assimilacao","Assimilação"],
    ["cr_atr_carisma","Carisma"],
    ["cr_atr_resistencia","Resistência"],
    ["cr_atr_resistencia_psiquica","Resistência Psíquica"],
    ["cr_atr_saude","Saúde"]
  ];
  const CR_PERICIAS = [
    ["cr_per_obediencia","Obediência"],
    ["cr_per_idiomas","Idiomas"],
    ["cr_per_explosivos","Perícia em Explosivos"],
    ["cr_per_investigativa","Perícia Investigativa"],
    ["cr_per_idioma_antigo","Idioma Antigo"],
    ["cr_per_tortura","Perícia em Tortura"],
    ["cr_per_radar","Perícia em Radar"],
    ["cr_per_armas_brancas","Perícia em Armas Brancas"],
    ["cr_per_montaria","Perícia em Montaria"],
    ["cr_per_memorizacao","Perícia em Memorização"],
    ["cr_per_armas_fogo","Perícia em Armas de Fogo"]
  ];
  const CR_ALL_SKILLS = [...CR_HABILIDADES, ...CR_TALENTOS, ...CR_ATRIBUTOS, ...CR_PERICIAS];

  const CR_INDEX_KEY = "criaturas:index";
  let creaturesIndex = [];
  let currentCreatureId = null;

  function crSheetKey(id){ return "criatura:sheet:" + id; }
  function genCreatureId(){
    return "criatura_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }
  function esc(s){
    if(typeof window.escapeHtml === "function") return window.escapeHtml(s);
    const d = document.createElement("div");
    d.textContent = (s === undefined || s === null) ? "" : String(s);
    return d.innerHTML;
  }
  async function crAutoBackup(label, force){
    if(typeof window.bkpCreateAutoBackup === "function"){
      try{ await window.bkpCreateAutoBackup(label, !!force); }catch(e){}
    }
  }

  /* ---------- construção das grades de skill (Atual/Máx. + dado 4/6/8/12/20) ----------
     Correção: cada skill agora tem ATUAL/MÁX., no mesmo padrão visual usado pela
     ficha de Agentes (buildSkillRow/.pts-wrap/.pts-atual/.pts-slash em index.html),
     só que com classes próprias (cr-pts-*, nunca ".pts-wrap"/".pts-atual" dos
     Agentes) pelo mesmo motivo já documentado para "cr-dice-tiers" no topo deste
     arquivo: evitar que código genérico dos Agentes (que faz querySelectorAll
     sobre essas classes) alcance por engano os campos da Criatura.
     O id original da skill (ex.: "cr_hab_arrombamento") continua sendo o campo
     MÁX. — de quem o dado 4/6/8/12/20 depende (updateCrDiceTiers, inalterado).
     O novo campo ATUAL é "<id>_atual", com data-cr-skill-atual="<id>" apontando
     de volta para o Máx. correspondente. */
  function buildCrSkillRow(id, label){
    const row = document.createElement("div");
    row.className = "cr-skill-row";
    row.innerHTML = `
      <div class="cr-dice-tiers" data-for="${id}">
        <span data-tier="4">4</span><span data-tier="6">6</span><span data-tier="8">8</span><span data-tier="12">12</span><span data-tier="20">20</span>
      </div>
      <div class="cr-skill-name">${label}</div>
      <div class="cr-pts-wrap">
        <div class="cr-pts-atual"><label>Atual</label><input type="text" inputmode="decimal" id="${id}_atual" data-cr-skill-atual="${id}"></div>
        <div class="cr-pts-slash">/</div>
        <div class="cr-pts-max"><label>Máx.</label><input type="number" min="0" id="${id}" data-cr-skill="1"></div>
      </div>
    `;
    return row;
  }
  function renderCrGrid(containerId, list){
    const container = document.getElementById(containerId);
    if(!container || container.dataset.crBuilt === "1") return;
    list.forEach(([id, label]) => container.appendChild(buildCrSkillRow(id, label)));
    container.dataset.crBuilt = "1";
  }
  function buildAllCrGrids(){
    renderCrGrid("cr_grid_habilidades", CR_HABILIDADES);
    renderCrGrid("cr_grid_talentos", CR_TALENTOS);
    renderCrGrid("cr_grid_atributos", CR_ATRIBUTOS);
    renderCrGrid("cr_grid_pericias", CR_PERICIAS);
  }

  function updateCrDiceTiers(id){
    const el = document.getElementById(id);
    const wrap = document.querySelector(`.cr-dice-tiers[data-for="${id}"]`);
    if(!el || !wrap) return;
    const val = parseInt(el.value) || 0;
    wrap.querySelectorAll("span").forEach(s => {
      const tier = parseInt(s.dataset.tier);
      s.classList.toggle("on", val >= tier);
    });
  }
  function updateAllCrDiceTiers(){
    CR_ALL_SKILLS.forEach(([id]) => updateCrDiceTiers(id));
  }

  /* ---------- todos os campos editáveis da ficha de criatura ---------- */
  function crFieldIds(){
    return Array.from(document.querySelectorAll("#creature_sheet_screen input, #creature_sheet_screen textarea, #creature_sheet_screen select"))
      .map(el => el.id)
      .filter(Boolean);
  }

  function clearCreatureForm(){
    crFieldIds().forEach(id => {
      const el = document.getElementById(id);
      if(el) el.value = "";
    });
    const preview = document.getElementById("cr_photo_preview");
    const placeholder = document.getElementById("cr_photo_placeholder");
    if(preview){ preview.style.display = "none"; preview.src = ""; }
    if(placeholder) placeholder.style.display = "block";
    updateAllCrDiceTiers();
  }

  function applyPhotoFromField(){
    const foto = document.getElementById("cr_foto");
    const preview = document.getElementById("cr_photo_preview");
    const placeholder = document.getElementById("cr_photo_placeholder");
    if(!foto || !preview || !placeholder) return;
    if(foto.value){
      preview.src = foto.value;
      preview.style.display = "block";
      placeholder.style.display = "none";
    } else {
      preview.style.display = "none";
      preview.src = "";
      placeholder.style.display = "block";
    }
  }

  /* ---------- índice (Minhas Criaturas) ---------- */
  async function loadCreaturesIndex(){
    const raw = await storageGet(CR_INDEX_KEY);
    if(raw){
      try{ creaturesIndex = JSON.parse(raw); }catch(e){ creaturesIndex = []; }
    } else {
      creaturesIndex = [];
    }
  }
  async function saveCreaturesIndex(){
    await storageSet(CR_INDEX_KEY, JSON.stringify(creaturesIndex), 1, true);
  }

  function renderCreatureList(){
    const list = document.getElementById("creature_list");
    if(!list) return;
    if(creaturesIndex.length === 0){
      list.innerHTML = '<div class="empty-state">Nenhuma criatura registrada ainda.</div>';
      return;
    }
    const sorted = [...creaturesIndex].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    list.innerHTML = "";
    sorted.forEach(entry => {
      const card = document.createElement("div");
      card.className = "sheet-card";
      card.innerHTML = `
        <div class="sheet-card-name">${esc(entry.nome || "Criatura sem nome")}</div>
        <div class="cr-list-tag">Criatura</div>
        <div class="sheet-card-actions">
          <button data-cr-open="${entry.id}">Abrir</button>
          <button data-cr-dup="${entry.id}">Duplicar</button>
          <button class="entry-del" data-cr-del="${entry.id}">Excluir</button>
        </div>
      `;
      list.appendChild(card);
    });
    list.querySelectorAll("[data-cr-open]").forEach(b => b.addEventListener("click", () => openCreature(b.dataset.crOpen)));
    list.querySelectorAll("[data-cr-dup]").forEach(b => b.addEventListener("click", () => duplicateCreature(b.dataset.crDup)));
    list.querySelectorAll("[data-cr-del]").forEach(b => b.addEventListener("click", () => confirmDeleteCreature(b.dataset.crDel)));
  }

  /* ---------- navegação entre telas ---------- */
  function hideAllCreatureAndSecretScreens(){
    const ids = ["secret_files_screen", "creature_list_screen", "creature_sheet_screen"];
    ids.forEach(id => { const el = document.getElementById(id); if(el) el.style.display = "none"; });
  }
  function showCreatureListScreen(){
    hideAllCreatureAndSecretScreens();
    document.getElementById("welcome_screen").style.display = "none";
    renderCreatureList();
    document.getElementById("creature_list_screen").style.display = "block";
  }
  function showCreatureSheetScreen(){
    hideAllCreatureAndSecretScreens();
    document.getElementById("welcome_screen").style.display = "none";
    document.getElementById("creature_sheet_screen").style.display = "block";
  }
  function backToSecretFiles(){
    hideAllCreatureAndSecretScreens();
    document.getElementById("secret_files_screen").style.display = "block";
  }

  /* ---------- CRUD ---------- */
  async function createNewCreature(){
    await loadCreaturesIndex();
    const id = genCreatureId();
    currentCreatureId = id;
    buildAllCrGrids();
    clearCreatureForm();
    creaturesIndex.push({ id, nome: "Criatura sem nome", updatedAt: Date.now() });
    await saveCreaturesIndex();
    // ETAPA 5.2B — cloud: cria o registro em public.creatures com o
    // MESMO id local, se houver sessão válida. Nunca bloqueia a
    // criação local nem apaga nada se a nuvem falhar (ver
    // js/creatures-sync.js).
    if (typeof window.CRISCreaturesSync === "object" && window.CRISCreaturesSync) {
      try { await window.CRISCreaturesSync.syncCreatureToCloud(id, "Criatura sem nome", {}); }
      catch (e) { console.error("[Criaturas] Erro ao sincronizar criação com a nuvem:", e); }
    }
    await crAutoBackup("Criação de criatura", true);
    if (typeof window.CRISCreaturesSync === "object" && window.CRISCreaturesSync && typeof window.CRISCreaturesSync.refreshBadge === "function") {
      window.CRISCreaturesSync.refreshBadge(id);
    }
    showCreatureSheetScreen();
  }

  async function openCreature(id){
    await loadCreaturesIndex();
    buildAllCrGrids();
    currentCreatureId = id;
    const raw = await storageGet(crSheetKey(id));
    clearCreatureForm();
    if(raw){
      try{
        const data = JSON.parse(raw);
        Object.keys(data).forEach(fid => {
          const el = document.getElementById(fid);
          if(el) el.value = data[fid];
        });
      }catch(e){}
    }
    applyPhotoFromField();
    fallbackCrSkillAtualFromMax();
    updateAllCrDiceTiers();
    // ETAPA 5.2B — só atualiza o indicador (☁) com o último estado
    // conhecido; não faz nenhuma chamada de rede aqui.
    if (typeof window.CRISCreaturesSync === "object" && window.CRISCreaturesSync && typeof window.CRISCreaturesSync.refreshBadge === "function") {
      window.CRISCreaturesSync.refreshBadge(id);
    }
    showCreatureSheetScreen();
  }

  let __creatureSaveInFlight = false;
  async function saveCreature(){
    if(!currentCreatureId || __creatureSaveInFlight) return;
    __creatureSaveInFlight = true;
    const btn = document.getElementById("cr_btn_save");
    const originalLabel = btn ? btn.textContent : "";
    if(btn){ btn.disabled = true; btn.textContent = "Salvando…"; }
    try{
      const data = {};
      crFieldIds().forEach(id => data[id] = document.getElementById(id).value);
      const res = await storageSet(crSheetKey(currentCreatureId), JSON.stringify(data), 1, true);
      if(res){
        const idx = creaturesIndex.findIndex(e => e.id === currentCreatureId);
        const nome = (data.cr_nome || "").trim() || "Criatura sem nome";
        if(idx >= 0){
          creaturesIndex[idx].nome = nome;
          creaturesIndex[idx].updatedAt = Date.now();
        } else {
          creaturesIndex.push({ id: currentCreatureId, nome, updatedAt: Date.now() });
        }
        await saveCreaturesIndex();
        if(typeof flashIndicator === "function") flashIndicator("✓ Criatura salva com sucesso!", false, 2500);
        await crAutoBackup("Salvamento da criatura", false);
        // ETAPA 5.2B — cloud: só roda DEPOIS que o storageSet local já
        // confirmou sucesso (res). Nunca é chamado se o salvamento
        // local falhar; nunca apaga/reverte o dado local se a nuvem
        // falhar (ver js/creatures-sync.js).
        if (typeof window.CRISCreaturesSync === "object" && window.CRISCreaturesSync) {
          try { await window.CRISCreaturesSync.syncCreatureToCloud(currentCreatureId, nome, data); }
          catch (e) { console.error("[Criaturas] Erro ao sincronizar salvamento com a nuvem:", e); }
        }
      } else {
        if(typeof flashIndicator === "function") flashIndicator("✕ Não foi possível salvar a criatura. Tente novamente.", true, 3000);
      }
    }catch(e){
      if(typeof flashIndicator === "function") flashIndicator("✕ Não foi possível salvar a criatura. Tente novamente.", true, 3000);
    }finally{
      if(btn){ btn.disabled = false; btn.textContent = originalLabel; }
      __creatureSaveInFlight = false;
    }
  }

  async function duplicateCreature(id){
    const raw = await storageGet(crSheetKey(id));
    if(!raw) return;
    await crAutoBackup("Antes de duplicar criatura", true);
    const newId = genCreatureId();
    await storageSet(crSheetKey(newId), raw, 1, true);
    let nome = "Criatura sem nome (Cópia)";
    let dupData = null;
    try{
      dupData = JSON.parse(raw);
      nome = ((dupData.cr_nome || "").trim() || "Criatura sem nome") + " (Cópia)";
    }catch(e){}
    creaturesIndex.push({ id: newId, nome, updatedAt: Date.now() });
    await saveCreaturesIndex();
    // ETAPA 5.2B — cloud: a cópia é tratada como criatura nova, com o
    // seu próprio id novo (genCreatureId() já gerou newId acima —
    // nunca reaproveita o id original, igual ao comportamento local).
    if (typeof window.CRISCreaturesSync === "object" && window.CRISCreaturesSync) {
      try { await window.CRISCreaturesSync.syncCreatureToCloud(newId, nome, dupData || {}); }
      catch (e) { console.error("[Criaturas] Erro ao sincronizar cópia com a nuvem:", e); }
    }
    renderCreatureList();
  }

  let __creaturePendingDelete = null;
  function confirmDeleteCreature(id){
    __creaturePendingDelete = id;
    document.getElementById("creature_delete_modal").style.display = "flex";
  }

  /* ---------- Habilidades/Talentos/Atributos/Perícias — regra ATUAL/MÁX. ----------
     Correção do pedido anterior: a regra "MÁX. mudou -> ATUAL acompanha o novo
     MÁX." pertence aos campos Atual/Máx. de cada skill (Habilidades, Talentos,
     Atributos, Perícias) — não a um quadro separado no topo da ficha (removido).
     Alterar ATUAL nunca mexe no Máx. correspondente.
     A sincronização roda no "input" delegado de #creature_sheet_screen (já
     existente, ver wireCreatureModule) sempre que o alvo tiver data-cr-skill="1"
     (ou seja, é um campo Máx. de skill) — reaproveita o mesmo listener que já
     aciona updateCrDiceTiers(), sem criar um segundo listener por linha.
     Carregar uma ficha salva (openCreature) só atribui os valores brutos
     guardados e não passa por este listener, então não dispara a regra. */
  function syncCrSkillAtualOnMaxInput(maxEl){
    const atualEl = document.getElementById(maxEl.id + "_atual");
    if(atualEl) atualEl.value = maxEl.value;
  }

  /* Migração leve para fichas salvas antes desta correção: elas só têm o
     valor antigo de "Pontos" no campo Máx. (id original) e nenhum "_atual"
     ainda (campo novo). Ao abrir essas fichas, se o Máx. tiver valor e o
     Atual estiver vazio, o Atual é preenchido com o próprio Máx. uma única
     vez, no carregamento — não é um listener novo nem roda a cada edição. */
  function fallbackCrSkillAtualFromMax(){
    CR_ALL_SKILLS.forEach(([id]) => {
      const maxEl = document.getElementById(id);
      const atualEl = document.getElementById(id + "_atual");
      if(maxEl && atualEl && maxEl.value !== "" && atualEl.value === ""){
        atualEl.value = maxEl.value;
      }
    });
  }

  /* ---------- imagem da criatura ---------- */
  function wireCreaturePhoto(){
    const box = document.getElementById("cr_photo_box");
    const input = document.getElementById("cr_photo_input");
    const foto = document.getElementById("cr_foto");
    if(!box || !input || !foto) return;
    box.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        foto.value = reader.result;
        applyPhotoFromField();
      };
      reader.readAsDataURL(file);
      input.value = "";
    });
  }

  /* ---------- wiring geral ---------- */
  function wireCreatureModule(){
    buildAllCrGrids();

    // Cards do lobby de Arquivos Secretos: Criar Nova Criatura / Minhas Criaturas
    // passam a funcionar de verdade nesta etapa (Compêndio e Habilidades de
    // Criaturas continuam com o placeholder já existente, sem alteração).
    const cardCriar = document.getElementById("secret_card_criar");
    const cardMinhas = document.getElementById("secret_card_minhas");
    if(cardCriar) cardCriar.addEventListener("click", () => { createNewCreature(); });
    if(cardMinhas) cardMinhas.addEventListener("click", () => { showCreatureListScreen(); });

    // Minhas Criaturas → Voltar (Arquivos Secretos)
    const listBack = document.getElementById("creature_list_back_btn");
    if(listBack) listBack.addEventListener("click", backToSecretFiles);

    // Ficha de Criatura → Voltar para Minhas Criaturas / Arquivos Secretos
    const btnNavMinhas = document.getElementById("cr_btn_nav_minhas");
    const btnNavSecretos = document.getElementById("cr_btn_nav_secretos");
    if(btnNavMinhas) btnNavMinhas.addEventListener("click", showCreatureListScreen);
    if(btnNavSecretos) btnNavSecretos.addEventListener("click", backToSecretFiles);

    // Salvar
    const btnSave = document.getElementById("cr_btn_save");
    if(btnSave) btnSave.addEventListener("click", saveCreature);

    // Dado (4/6/8/12/20) + regra ATUAL/MÁX. reagem ao campo Máx. de cada skill
    document.getElementById("creature_sheet_screen")?.addEventListener("input", (e) => {
      if(e.target && e.target.dataset && e.target.dataset.crSkill){
        updateCrDiceTiers(e.target.id);
        syncCrSkillAtualOnMaxInput(e.target);
      }
    });

    // Exclusão (modal próprio — não reaproveita #delete_modal dos Agentes)
    const delCancel = document.getElementById("creature_delete_cancel");
    const delConfirm = document.getElementById("creature_delete_confirm");
    if(delCancel) delCancel.addEventListener("click", () => {
      __creaturePendingDelete = null;
      document.getElementById("creature_delete_modal").style.display = "none";
    });
    if(delConfirm) delConfirm.addEventListener("click", async () => {
      const id = __creaturePendingDelete;
      document.getElementById("creature_delete_modal").style.display = "none";
      __creaturePendingDelete = null;
      if(!id) return;
      // ETAPA 6 — LOCAL-PRIMEIRO: a Etapa 5.2B exigia que a exclusão na
      // nuvem confirmasse ANTES de tocar em qualquer dado local (abortava
      // a exclusão inteira quando offline). Isso contraria a regra
      // central desta etapa e foi identificado na auditoria 6.0. Agora a
      // criatura é sempre removida localmente na hora; a exclusão na
      // nuvem é tentada em seguida e, se não conseguir, fica na fila com
      // retry automático.
      await crAutoBackup("Antes de excluir criatura", true);
      await storageDeleteKey(crSheetKey(id));
      creaturesIndex = creaturesIndex.filter(e => e.id !== id);
      await saveCreaturesIndex();
      renderCreatureList();

      let cloudRes = { ok: true, hadCloud: false };
      if (typeof window.CRISCreaturesSync === "object" && window.CRISCreaturesSync && typeof window.CRISCreaturesSync.deleteCreatureCloud === "function") {
        try { cloudRes = await window.CRISCreaturesSync.deleteCreatureCloud(id); }
        catch (e) { cloudRes = { ok: false, hadCloud: true, error: true }; }
      }

      if (cloudRes.ok) {
        if (cloudRes.hadCloud && typeof window.CRISCreaturesSync === "object" && window.CRISCreaturesSync && typeof window.CRISCreaturesSync.deleteCloudMeta === "function") {
          await window.CRISCreaturesSync.deleteCloudMeta(id);
        }
        if(typeof flashIndicator === "function") flashIndicator("Um backup foi criado antes da exclusão.", false, 2800);
        return;
      }

      // Não conseguiu excluir na nuvem agora — mantém o metadado de
      // vínculo (a fila precisa dele para saber que existe algo a
      // excluir) e enfileira para retry automático.
      if (typeof window.CRISSyncQueue === "object" && window.CRISSyncQueue && typeof window.CRISSyncQueue.enqueue === "function") {
        await window.CRISSyncQueue.enqueue("creature", "delete", id);
      }
      if(typeof flashIndicator === "function") flashIndicator("Criatura excluída deste dispositivo. A exclusão na nuvem será concluída quando a conexão voltar.", false, 3600);
    });

    wireCreaturePhoto();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", wireCreatureModule);
  } else {
    wireCreatureModule();
  }

  // ETAPA 5.2B — ponto de entrada mínimo para js/creatures-sync.js
  // atualizar a tela "Minhas Criaturas" depois de um download/migração
  // cloud, só se ela estiver visível no momento (nunca força navegação).
  window.renderCreatureListIfVisible = function () {
    const screen = document.getElementById("creature_list_screen");
    if (screen && screen.style.display !== "none") {
      loadCreaturesIndex().then(renderCreatureList);
    }
  };
})();
