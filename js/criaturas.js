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
  let crDirty = false;
  let crRevision = 0;
  let crAutosaveTimer = null;
  let crSavePromise = null;
  const crPendingDrafts = new Map();
  const crSkillMaxBaseline = new WeakMap();
  const CR_DRAFT_PREFIX = "criaturas:rascunho:";
  const CR_CATALOG_DIMS = new Set(["infernal","arkanjerial","terrena","carnical","sombria","perdicao","limbica"]);

  // Backups automáticos são cópias auxiliares. Se o navegador estiver sem
  // espaço, libera os mais antigos antes de desistir de gravar uma ficha ou
  // o índice. Nunca remove fichas nem backups manuais.
  async function crStorageSet(key, value){
    let saved = await storageSet(key, value, 1, true);
    if(saved || hasNativeStorage()) return saved;
    const mappedKey = window.CRISGuest && typeof window.CRISGuest.mapStorageKey === "function"
      ? window.CRISGuest.mapStorageKey(key) : key;
    try{
      localStorage.setItem(mappedKey, value);
      return { key: mappedKey, value };
    }catch(e){
      if(e?.name !== "QuotaExceededError" && e?.code !== 22) return null;
    }
    let backups = [];
    try{
      const raw = await storageGet("backup:auto:index");
      backups = JSON.parse(raw || "[]");
      if(!Array.isArray(backups)) backups = [];
    }catch(e){ backups = []; }
    while(backups.length && !saved){
      const old = backups.pop();
      if(!old?.id) continue;
      await storageDeleteKey("backup:auto:" + old.id);
      await storageSet("backup:auto:index", JSON.stringify(backups), 1, true);
      saved = await storageSet(key, value, 1, true);
    }
    return saved;
  }

  function crDraftKey(id){ return CR_DRAFT_PREFIX + id; }
  function getPendingDraft(id){
    if(crPendingDrafts.has(id)) return crPendingDrafts.get(id);
    try{
      const saved = JSON.parse(sessionStorage.getItem(crDraftKey(id)) || "null");
      if(saved && typeof saved === "object" && !Array.isArray(saved)) return saved;
    }catch(e){}
    return null;
  }

  function scheduleCrAutosave(){
    clearTimeout(crAutosaveTimer);
    const scheduledId = currentCreatureId;
    if(!scheduledId) return;
    crAutosaveTimer = setTimeout(() => {
      crAutosaveTimer = null;
      if(crDirty && currentCreatureId === scheduledId) saveCreature(true);
    }, 700);
  }
  function markCrDirty(){
    crDirty = true;
    crRevision++;
    scheduleCrAutosave();
  }
  async function flushCrBeforeSwitch(quiet){
    clearTimeout(crAutosaveTimer);
    if(crSavePromise) await crSavePromise;
    if(!crDirty) return true;
    let saved = await saveCreature(true);
    if(saved && crDirty) saved = await saveCreature(true);
    if(!saved && !quiet && typeof flashIndicator === "function"){
      flashIndicator("✕ Não foi possível salvar a criatura. Tente novamente antes de trocar de ficha.", true, 3400);
    }
    return saved;
  }
  function preserveCurrentDraft(){
    if(!currentCreatureId || !crDirty) return false;
    const draft = {};
    crFieldIds().forEach(id => { draft[id] = document.getElementById(id).value; });
    crPendingDrafts.set(currentCreatureId, draft);
    try{ sessionStorage.setItem(crDraftKey(currentCreatureId), JSON.stringify(draft)); }catch(e){}
    clearTimeout(crAutosaveTimer);
    crDirty = false;
    return true;
  }
  async function safeLeaveCreature(){
    if(await flushCrBeforeSwitch(true)) return true;
    // Uma falha do navegador não prende a pessoa na ficha. O rascunho
    // continua acessível ao reabrir a mesma criatura nesta sessão.
    if(preserveCurrentDraft()){
      if(typeof flashIndicator === "function") flashIndicator("⚠ Salvamento indisponível. Rascunho mantido nesta aba; tente salvar novamente depois.", true, 5000);
      return true;
    }
    return false;
  }

  function crSheetKey(id){ return "criatura:sheet:" + id; }
  function crText(v){ return v === null || v === undefined || v === "—" ? "" : String(v); }
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
    refreshCrCatalogAction();
  }

  function refreshCrCatalogAction(){
    const cataloged = document.getElementById("cr_catalogado")?.value === "1";
    const add = document.getElementById("cr_btn_catalog");
    const remove = document.getElementById("cr_btn_catalog_remove");
    if(add) add.textContent = cataloged ? "Editar no Compêndio" : "+ Adicionar ao Compêndio";
    if(remove) remove.hidden = !cataloged;
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
    return crStorageSet(CR_INDEX_KEY, JSON.stringify(creaturesIndex));
  }

  function renderCreatureList(){
    const list = document.getElementById("creature_list");
    if(!list) return;
    const count = document.getElementById("cr_list_count");
    if(creaturesIndex.length === 0){
      list.innerHTML = '<div class="empty-state">Nenhuma criatura registrada ainda.</div>';
      if(count) count.textContent = "0 criaturas registradas";
      return;
    }
    const query = (document.getElementById("cr_list_search")?.value || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const sort = document.getElementById("cr_list_sort")?.value || "recentes";
    const normalized = v => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const sorted = creaturesIndex.filter(entry => !query || normalized(entry.nome).includes(query))
      .sort((a,b) => sort === "nome"
        ? String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR")
        : (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
    if(count) count.textContent = `${sorted.length} de ${creaturesIndex.length} ${creaturesIndex.length === 1 ? "criatura" : "criaturas"}`;
    if(!sorted.length){
      list.innerHTML = '<div class="empty-state">Nenhuma criatura corresponde à pesquisa.</div>';
      return;
    }
    list.innerHTML = "";
    sorted.forEach(entry => {
      const card = document.createElement("div");
      card.className = "sheet-card";
      card.innerHTML = `
        <div class="sheet-card-name">${esc(entry.nome || "Criatura sem nome")}</div>
        <div class="cr-list-tag">Criatura</div>
        <div class="sheet-card-actions">
          <button data-cr-open="${esc(entry.id)}">Abrir</button>
          <button data-cr-dup="${esc(entry.id)}">Duplicar</button>
          <button class="entry-del" data-cr-del="${esc(entry.id)}">Excluir</button>
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
  async function showCreatureListScreen(){
    hideAllCreatureAndSecretScreens();
    document.getElementById("welcome_screen").style.display = "none";
    document.getElementById("creature_list_screen").style.display = "block";
    // A lista em memória nasce vazia a cada atualização da página.
    // Releia o índice persistido também ao entrar pelo menu inicial.
    await loadCreaturesIndex();
    renderCreatureList();
  }
  function showCreatureSheetScreen(){
    hideAllCreatureAndSecretScreens();
    document.getElementById("welcome_screen").style.display = "none";
    document.getElementById("creature_sheet_screen").style.display = "block";
  }
  function backToSecretFiles(){
    window.CRISCreatureNav.open("minhas");
  }

  /* ---------- CRUD ---------- */
  async function createNewCreature(){
    if(!await flushCrBeforeSwitch()) return;
    clearTimeout(crAutosaveTimer);
    await loadCreaturesIndex();
    const id = genCreatureId();
    if(!await crStorageSet(crSheetKey(id), "{}")){
      if(typeof flashIndicator === "function") flashIndicator("✕ Não foi possível criar a ficha: armazenamento indisponível.", true, 4200);
      return false;
    }
    creaturesIndex.push({ id, nome: "Criatura sem nome", updatedAt: Date.now() });
    if(!await saveCreaturesIndex()){
      creaturesIndex = creaturesIndex.filter(entry => entry.id !== id);
      await storageDeleteKey(crSheetKey(id));
      if(typeof flashIndicator === "function") flashIndicator("✕ Não foi possível criar a ficha: armazenamento indisponível.", true, 4200);
      return false;
    }
    currentCreatureId = id;
    crDirty = false;
    buildAllCrGrids();
    clearCreatureForm();
    // ETAPA 5.2B — cloud: cria o registro em public.creatures com o
    // MESMO id local, se houver sessão válida. Nunca bloqueia a
    // criação local nem apaga nada se a nuvem falhar (ver
    // js/creatures-sync.js).
    if (typeof window.CRISCreaturesSync === "object" && window.CRISCreaturesSync) {
      try { await window.CRISCreaturesSync.syncCreatureToCloud(id, "Criatura sem nome", {}); }
      catch (e) { console.error("[Criaturas] Erro ao sincronizar criação com a nuvem:", e); }
    }
    // A ficha vazia já está salva. Um backup completo aqui pode ocupar o
    // espaço necessário para a primeira edição; backups seguem nos saves.
    if (typeof window.CRISCreaturesSync === "object" && window.CRISCreaturesSync && typeof window.CRISCreaturesSync.refreshBadge === "function") {
      window.CRISCreaturesSync.refreshBadge(id);
    }
    showCreatureSheetScreen();
  }

  async function openCreature(id){
    if(currentCreatureId !== id && !await flushCrBeforeSwitch()) return false;
    clearTimeout(crAutosaveTimer);
    await loadCreaturesIndex();
    buildAllCrGrids();
    currentCreatureId = id;
    crDirty = false;
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
    const pendingDraft = getPendingDraft(id);
    if(pendingDraft){
      Object.keys(pendingDraft).forEach(fid => {
        const field = document.getElementById(fid);
        if(field) field.value = pendingDraft[fid];
      });
      crDirty = true;
      scheduleCrAutosave();
    }
    refreshCrCatalogAction();
    applyPhotoFromField();
    fallbackCrSkillAtualFromMax();
    CR_ALL_SKILLS.forEach(([skillId]) => {
      const input = document.getElementById(skillId);
      if(input) crSkillMaxBaseline.set(input, input.value);
    });
    updateAllCrDiceTiers();
    // ETAPA 5.2B — só atualiza o indicador (☁) com o último estado
    // conhecido; não faz nenhuma chamada de rede aqui.
    if (typeof window.CRISCreaturesSync === "object" && window.CRISCreaturesSync && typeof window.CRISCreaturesSync.refreshBadge === "function") {
      window.CRISCreaturesSync.refreshBadge(id);
    }
    showCreatureSheetScreen();
    return true;
  }

  async function saveCreature(isAutosave){
    if(!currentCreatureId) return false;
    if(crSavePromise){
      await crSavePromise;
      if(crDirty) return saveCreature(isAutosave);
      return true;
    }
    const savedId = currentCreatureId;
    const savedRevision = crRevision;
    const btn = document.getElementById("cr_btn_save");
    const originalLabel = btn ? btn.textContent : "";
    if(btn && !isAutosave){ btn.disabled = true; btn.textContent = "Salvando…"; }
    const operation = (async () => {
    try{
      // Conserve campos de versões anteriores que esta interface ainda não
      // conhece. A ficha publicada pode ganhar/perder campos visuais sem
      // descartar informações já salvas ao editar um campo conhecido.
      const previousRaw = await storageGet(crSheetKey(savedId));
      let data = {};
      let wasCataloged = false;
      if(previousRaw){
        const previous = JSON.parse(previousRaw);
        if(!previous || typeof previous !== "object" || Array.isArray(previous)){
          throw new Error("A ficha existente tem um formato inválido; salvamento interrompido para preservar os dados.");
        }
        data = previous;
        wasCataloged = previous.cr_catalogado === "1";
      }
      crFieldIds().forEach(id => data[id] = document.getElementById(id).value);
      const res = await crStorageSet(crSheetKey(savedId), JSON.stringify(data));
      if(res){
        const idx = creaturesIndex.findIndex(e => e.id === savedId);
        const nome = (data.cr_nome || "").trim() || "Criatura sem nome";
        if(idx >= 0){
          creaturesIndex[idx].nome = nome;
          creaturesIndex[idx].updatedAt = Date.now();
        } else {
          creaturesIndex.push({ id: savedId, nome, updatedAt: Date.now() });
        }
        const indexSaved = await saveCreaturesIndex();
        if(!indexSaved) console.warn("[Criaturas] Ficha salva; nome na lista será atualizado no próximo salvamento.");
        if(currentCreatureId === savedId && crRevision === savedRevision) crDirty = false;
        crPendingDrafts.delete(savedId);
        try{ sessionStorage.removeItem(crDraftKey(savedId)); }catch(e){}
        if(!isAutosave && typeof flashIndicator === "function") flashIndicator(indexSaved ? "✓ Criatura salva com sucesso!" : "✓ Ficha salva. O nome na lista será atualizado depois.", !indexSaved, 3000);
        if(!isAutosave) await crAutoBackup("Salvamento da criatura", false);
        // ETAPA 5.2B — cloud: só roda DEPOIS que o storageSet local já
        // confirmou sucesso (res). Nunca é chamado se o salvamento
        // local falhar; nunca apaga/reverte o dado local se a nuvem
        // falhar (ver js/creatures-sync.js).
        if (typeof window.CRISCreaturesSync === "object" && window.CRISCreaturesSync) {
          try { await window.CRISCreaturesSync.syncCreatureToCloud(savedId, nome, data); }
          catch (e) { console.error("[Criaturas] Erro ao sincronizar salvamento com a nuvem:", e); }
        }
        if(window.CRISCreatureCatalog){
          const published = data.cr_catalogado === "1"
            ? await window.CRISCreatureCatalog.publish(savedId,data)
            : wasCataloged ? await window.CRISCreatureCatalog.unpublish(savedId) : {ok:true};
          if(!published.ok && !isAutosave && typeof flashIndicator === "function")
            flashIndicator("Ficha salva neste dispositivo. A atualização do compêndio público está pendente.",true,4500);
        }
        return true;
      } else {
        if(!isAutosave && typeof flashIndicator === "function") flashIndicator("✕ Não foi possível salvar a criatura. Tente novamente.", true, 3000);
        return false;
      }
    }catch(e){
      console.error("[Criaturas] Erro ao salvar:", e);
      if(!isAutosave && typeof flashIndicator === "function") flashIndicator("✕ Não foi possível salvar a criatura. Tente novamente.", true, 3000);
      return false;
    }finally{
      if(btn && !isAutosave){ btn.disabled = false; btn.textContent = originalLabel; }
    }
    })();
    crSavePromise = operation;
    let succeeded = false;
    try{ succeeded = await operation; return succeeded; }
    finally{
      if(crSavePromise === operation) crSavePromise = null;
      if(succeeded && crDirty && currentCreatureId === savedId) scheduleCrAutosave();
    }
  }

  function crHasPbCost(value){
    const text = crText(value);
    // Ganhos de PB e descontos no custo não transformam uma passiva em habilidade ativa.
    return /(?:\bP\.?B\.?\s*(?:[:=]\s*)?[1-9]\d*\b|\b(?:gasta|gastar|gastando|consome|consumir|consumindo|custa|custo)\s+\d+\s*P\.?B\.?\b|(?<![+\d])\b\d+\s*P\.?B\.?(?!\w))/i.test(text) &&
      !/^(?:ganha|recupera|restaura)\s*\+?\d+\s*P\.?B\.?\s*$/i.test(text.trim());
  }

  function crIsFiftyPower(item){
    const name = crText(item && item.nome).trim();
    if(/[—–-]\s*50\s*[—–-]|\b50\s+pontos?\b/i.test(name)) return true;
    const normalize = value => crText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR").trim();
    const key = normalize(name);
    return !!key && (window.CRRCreature50 || []).some(rule => {
      const title = crText(rule.nome);
      return key === normalize(title) || key === normalize(title.split(" — 50 — ").pop());
    });
  }

  function crSplitPowerBlocks(text){
    const blocks = [];
    let current = "";
    crText(text).split("\n").forEach(line => {
      const trimmed = line.trim();
      // O campo do PDF costuma trazer vários golpes em linhas consecutivas,
      // sem parágrafos em branco. Cabeçalhos de golpe e marcadores iniciam
      // uma entrada; linhas comuns continuam a descrição anterior.
      const bullet = /^[-•*]\s*\S/.test(trimmed);
      const attack = /^[^|:\n]{2,90}\s*\|\s*(?:ATK|DEF|DESV)\b/i.test(trimmed);
      const named = /^[^:—–|\n]{2,75}\s+[—–]\s+\S/.test(trimmed) &&
        !/^(?:Dano|Efeito|Consumo|Condição|Consequência|Aprimorar)\s+[—–]/i.test(trimmed);
      if(current && (bullet || attack || named)){
        blocks.push(current.trim());
        current = "";
      }
      current += (current ? "\n" : "") + line;
    });
    if(current.trim()) blocks.push(current.trim());
    return blocks;
  }

  function parseCrCatalogText(raw){
    const result = {acoes:[],habilidades:[],passivas:[],descricao:{},sentidos:"",imunidades:[],resistencias:""};
    let section = "acoes";
    const chunks = crText(raw).replace(/\r\n?/g,"\n").split(/\n\s*\n+/).map(s => s.trim()).filter(Boolean);
    chunks.forEach(chunk => {
      let text = chunk;
      const heading = text.match(/^(Ações|Habilidades(?: Passivas| Especiais| (?:em|de) 50(?: Pontos)?)?|Passivas(?: Gerais)?)\s*:?\s*$/i);
      if(heading){ section = /^Ações/i.test(heading[1]) ? "acoes" : /Passivas|50/i.test(heading[1]) ? "passivas" : "habilidades"; return; }
      // Um título de seção pode vir na mesma linha do primeiro registro.
      const inlineHeading = text.match(/^(Ações|Habilidades(?: Passivas| Especiais| (?:em|de) 50(?: Pontos)?)?|Passivas(?: Gerais)?)\s*:\s*\n([\s\S]+)$/i);
      if(inlineHeading){section = /^Ações/i.test(inlineHeading[1]) ? "acoes" : /Passivas|50/i.test(inlineHeading[1]) ? "passivas" : "habilidades";text = inlineHeading[2].trim();}
      const info = text.match(/^(Apar[êe]ncia|Comportamento|Origem|Curiosidades|Rela[çc][ãa]o com a Dimens[ãa]o|Sentidos|Imunidades?|Resist[êe]ncias?)\s*:\s*([\s\S]+)$/i);
      if(info){
        const key = info[1].normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
        const value = info[2].trim();
        if(key === "aparencia") result.descricao.aparencia = value;
        else if(key === "comportamento") result.descricao.comportamento = value;
        else if(key === "origem") result.descricao.origem = value;
        else if(key === "curiosidades") result.descricao.curiosidades = value;
        else if(key.startsWith("relacao")) result.descricao.relacaoDimensao = value;
        else if(key === "sentidos") result.sentidos = value;
        else if(key.startsWith("imunidade")) result.imunidades = value.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
        else result.resistencias = value;
        return;
      }
      const blocks = crSplitPowerBlocks(text);
      blocks.forEach(block => {
        block = block.replace(/^[-•*]\s*/,"").trim();
        const pipedMatch = block.match(/^([^|\n]{2,90}?)\s*\|\s*([\s\S]+)$/);
        const piped = pipedMatch && (!/\s+[—–]\s+/.test(pipedMatch[1]) || /[—–]\s*50\s*[—–]/.test(pipedMatch[1]))
          ? pipedMatch : null;
        const named = block.match(/^([^\n:]{2,130}?\s+[—–]\s*50\s+[—–]\s*[^\n:—–]{2,75}?)(?:\s+[—–]\s+|:\s+)([\s\S]+)$/) ||
          block.match(/^([^\n:—–]{2,75}?)(?:\s+[—–]\s+|:\s+)([\s\S]+)$/);
        const lines = block.split("\n");
        let nome, corpo;
        if(piped){nome=piped[1].trim();corpo=piped[2].trim();}
        else if(named){nome=named[1].trim();corpo=named[2].trim();}
        else if(lines.length > 1 && lines[0].length <= 75){nome=lines[0].trim();corpo=lines.slice(1).join("\n").trim();}
        else {nome="";corpo=block;}
        // O marco de 50 e a indicação explícita de passiva têm prioridade
        // sobre um gasto eventual de PB descrito dentro do efeito.
        const group = crIsFiftyPower({nome}) || section === "passivas" ||
          /\bpassiv[ao]\b/i.test(block.slice(0,130)) ? "passivas" :
          crHasPbCost(block) ? "habilidades" : section === "habilidades" ? "passivas" : "acoes";
        if(!nome) nome = (group === "acoes" ? "Ação " : group === "habilidades" ? "Habilidade " : "Passiva ") + (result[group].length+1);
        result[group].push({nome,corpo});
      });
    });
    return result;
  }

  function crCatalogEntry(entry, data){
    const skills = group => group.filter(([id]) => crText(data[id]) !== "")
      .map(([id,label]) => [label, crText(data[id])]);
    const pair = (current,max) => ({atual:crText(data[current]),max:crText(data[max])});
    const combatFields = [
      ["ATK N","cr_atk_n"],["ATK AB","cr_atk_ab"],["ATK AF","cr_atk_af"],["ATK C","cr_atk_c"],
      ["DEF N","cr_def_n"],["DEF AB","cr_def_ab"],["DEF C","cr_def_c"],
      ["DESV N","cr_desv_n"],["DESV O","cr_desv_o"]
    ];
    const interpreted = parseCrCatalogText(data.cr_movimentos);
    const conditions = parseCrCatalogText(data.cr_condicoes);
    const physicalConditions = crText(data.cr_condicoes).replace(/\r\n?/g,"\n")
      .split(/\n\s*\n+/)
      .filter(chunk => !/^\s*(?:Imunidades?|Resist[êe]ncias?)\s*:/i.test(chunk))
      .join("\n\n").trim();
    const catalogImmunities = crText(data.cr_catalogo_imunidades).split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    const immunities = [...new Set([...catalogImmunities,...interpreted.imunidades,...conditions.imunidades])];
    const resistances = [...new Set([crText(data.cr_catalogo_resistencias),interpreted.resistencias,conditions.resistencias]
      .map(s => s.trim()).filter(Boolean))].join("\n");
    const createdAbilities = (() => {
      try{
        const saved = JSON.parse(data.cf_habilidades_data || "[]");
        if(!Array.isArray(saved)) return [];
        return saved.filter(h => h && typeof h === "object").map(h => ({
          nome:crText(h.nome).trim() || "Habilidade",
          corpo:[h.atk ? "ATK: " + crText(h.atk) : "",h.pb ? "PB: " + crText(h.pb) : "",crText(h.descricao)]
            .filter(Boolean).join("\n")
        }));
      }catch(e){ return []; }
    })();
    // O importador do PDF também transforma "Habilidades Especiais" em
    // cards editáveis. Se o mesmo nome aparece no texto integral, usa a
    // versão estruturada para não exibir o mesmo poder duas vezes.
    const createdNames = new Set(createdAbilities.map(item => crText(item.nome).normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim()));
    const uniqueRaw = items => items.filter(item => !createdNames.has(crText(item.nome).normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim()));
    interpreted.acoes = uniqueRaw(interpreted.acoes);
    interpreted.habilidades = uniqueRaw(interpreted.habilidades);
    interpreted.passivas = uniqueRaw(interpreted.passivas);
    const unlocked = (() => {
      try{ const ids = JSON.parse(data.cr_hab50_unlocked || "[]"); return Array.isArray(ids) ? ids : []; }
      catch(e){ return []; }
    })();
    const existingPowerNames = [...interpreted.acoes,...interpreted.habilidades,...interpreted.passivas,...createdAbilities]
      .map(item => crText(item.nome).trim().toLocaleLowerCase("pt-BR"));
    const fifty = (window.CRRCreature50 || []).filter(item => {
      const label = String(item.nome || "").split(" — 50 — ")[0];
      return CR_ALL_SKILLS.some(([id,name]) =>
        (unlocked.includes(id) || Number(data[id]) >= 50) && name.toLocaleLowerCase("pt-BR") === label.toLocaleLowerCase("pt-BR"));
    }).filter(item => {
      const title = String(item.nome || "").trim().toLocaleLowerCase("pt-BR");
      const shortTitle = title.split(" — 50 — ").pop().trim();
      return !existingPowerNames.includes(title) && !existingPowerNames.includes(shortTitle);
    })
      .map(item => ({nome:item.nome,corpo:item.desc}));
    const isPassiveCard = item => crIsFiftyPower(item) || /\bpassiv[ao]\b/i.test(crText(item.corpo).slice(0,130));
    const abilities = [...interpreted.habilidades,
      ...createdAbilities.filter(item => !isPassiveCard(item) && crHasPbCost(item.corpo))];
    const passives = [...interpreted.passivas,
      ...createdAbilities.filter(item => isPassiveCard(item) || !crHasPbCost(item.corpo)), ...fifty];
    return {
      id:"minha:" + entry.id,
      sourceSheetId:entry.id,
      nome:crText(data.cr_nome).trim() || entry.nome || "Criatura sem nome",
      dimensao:data.cr_catalogo_dimensao,
      tipo:crText(data.cr_catalogo_tipo).trim() || crText(data.cr_raca).trim(),
      imagem:crText(data.cr_foto) || null,
      descricao:crText(data.cr_catalogo_descricao) || interpreted.descricao.aparencia || null,
      sheetData:data,
      ficha:{
        periculosidade:crText(data.cr_periculosidade), nivel:crText(data.cr_nivel),
        impactoSanidade:crText(data.cr_impacto_sanidade), raca:crText(data.cr_raca),
        pontos:{vida:pair("cr_hp_atual","cr_hp_max"),sanidade:pair("cr_san_atual","cr_san_max"),
          protecao:pair("cr_protecao_atual","cr_protecao_max"),resistenciaNatural:crText(data.cr_res_n),
          pb:pair("cr_pb_atual","cr_pb_max")},
        combate:{movs:crText(data.cr_movs),valores:combatFields.map(([label,id]) => [label,crText(data[id]) || "—"])},
        habilidades:skills(CR_HABILIDADES),talentos:skills(CR_TALENTOS),
        atributos:skills(CR_ATRIBUTOS),pericias:skills(CR_PERICIAS),
        sentidos:interpreted.sentidos || null,
        resistencias:{imunidades:immunities,observacoes:resistances},
        condicoesFisicas:{tamanhoPeso:crText(data.cr_peso_total),registro:physicalConditions},
        itens:crText(data.cr_itens),
        acoes:interpreted.acoes,
        habilidadesPb:abilities,
        passivas:passives,
        descricao:{
          aparencia:crText(data.cr_catalogo_descricao) || interpreted.descricao.aparencia || null,
          comportamento:crText(data.cr_catalogo_comportamento) || interpreted.descricao.comportamento || null,
          origem:crText(data.cr_catalogo_origem) || interpreted.descricao.origem || null,
          curiosidades:crText(data.cr_catalogo_curiosidades) || interpreted.descricao.curiosidades || null,
          relacaoDimensao:crText(data.cr_catalogo_relacao) || interpreted.descricao.relacaoDimensao || null
        }
      }
    };
  }

  async function listCatalogedCreatures(){
    const raw = await storageGet(CR_INDEX_KEY);
    let index = [];
    try{ index = JSON.parse(raw || "[]"); if(!Array.isArray(index)) index = []; }catch(e){}
    const found = [];
    for(const entry of index){
      if(!entry || !entry.id) continue;
      try{
        const sheet = JSON.parse(await storageGet(crSheetKey(entry.id)) || "null");
        if(sheet && !Array.isArray(sheet) && sheet.cr_catalogado === "1" && CR_CATALOG_DIMS.has(sheet.cr_catalogo_dimensao)){
          found.push(crCatalogEntry(entry,sheet));
        }
      }catch(e){ console.warn("[Criaturas] Registro de compêndio inválido:",entry.id,e); }
    }
    return found;
  }

  async function ownedCatalogSheet(id){
    if(!id || typeof id !== "string") return null;
    const rawIndex = await storageGet(CR_INDEX_KEY);
    let index;
    try{ index = JSON.parse(rawIndex || "[]"); }catch(e){ return null; }
    if(!Array.isArray(index) || !index.some(entry => entry?.id === id)) return null;
    const raw = await storageGet(crSheetKey(id));
    try{
      const data = JSON.parse(raw || "null");
      return data && !Array.isArray(data) && data.cr_catalogado === "1" ? data : null;
    }catch(e){ return null; }
  }

  async function editOwnedCatalogCreature(id){
    if(!await ownedCatalogSheet(id)) return false;
    return openCreature(id);
  }

  async function updateOwnedCatalogImage(id, image){
    if(typeof image !== "string" || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) return false;
    if(currentCreatureId === id && !await flushCrBeforeSwitch()) return false;
    const data = await ownedCatalogSheet(id);
    if(!data) return false;
    data.cr_foto = image;
    if(!await crStorageSet(crSheetKey(id), JSON.stringify(data))) return false;
    if(currentCreatureId === id){
      const field = document.getElementById("cr_foto");
      if(field) field.value = image;
      applyPhotoFromField();
    }
    if(window.CRISCreaturesSync?.syncCreatureToCloud){
      try{ await window.CRISCreaturesSync.syncCreatureToCloud(id,crText(data.cr_nome) || "Criatura sem nome",data); }
      catch(e){ console.error("[Criaturas] Falha ao sincronizar imagem:",e); }
    }
    const published = await window.CRISCreatureCatalog?.publish(id,data);
    if(published && !published.ok && typeof flashIndicator === "function")
      flashIndicator("Imagem salva localmente. Publicação no compêndio pendente.",true,4000);
    return true;
  }

  async function setCataloged(id, active){
    const raw = await storageGet(crSheetKey(id));
    if(!raw) return false;
    let data;
    try{ data = JSON.parse(raw); if(!data || typeof data !== "object" || Array.isArray(data)) return false; }
    catch(e){ return false; }
    data.cr_catalogado = active ? "1" : "";
    if(!await crStorageSet(crSheetKey(id), JSON.stringify(data))) return false;
    if(currentCreatureId === id){
      const field = document.getElementById("cr_catalogado");
      if(field) field.value = data.cr_catalogado;
      refreshCrCatalogAction();
    }
    if(window.CRISCreaturesSync?.syncCreatureToCloud){
      try{ await window.CRISCreaturesSync.syncCreatureToCloud(id,crText(data.cr_nome) || "Criatura sem nome",data); }
      catch(e){ console.error("[Criaturas] Falha ao sincronizar catálogo:",e); }
    }
    const publication = active ? await window.CRISCreatureCatalog?.publish(id,data)
      : await window.CRISCreatureCatalog?.unpublish(id);
    if(publication && !publication.ok && typeof flashIndicator === "function")
      flashIndicator("Alteração salva localmente. Sincronização do compêndio público pendente.",true,4200);
    return true;
  }

  function addCatalogPowersToSheetCards(data, ficha){
    let cards;
    try{
      cards = JSON.parse(data.cf_habilidades_data || "[]");
      if(!Array.isArray(cards)) return; // mantém um campo antigo inválido intacto
    }catch(e){ return; }

    const normalize = value => crText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR").trim();
    const keys = name => {
      const title = normalize(name);
      return [title,title.split(" — 50 — ").pop()].filter(Boolean);
    };
    const seen = new Set(cards.flatMap(card => keys(card && card.nome)));
    const isPassive = item => crIsFiftyPower(item) || /\bpassiv[ao]\b/i.test(crText(item.corpo).slice(0,130));
    const powers = [
      ...(ficha.habilidadesPb || []).map(item => ({item,passive:isPassive(item)})),
      ...(ficha.passivas || []).map(item => ({item,passive:true})),
      ...(ficha.habilidadesPassivas || []).map(item => ({item,passive:isPassive(item) || !crHasPbCost(item.corpo)})),
      ...(ficha.acoes || []).filter(isPassive).map(item => ({item,passive:true}))
    ];
    let added = 0;
    powers.forEach(({item,passive}) => {
      if(!item || !crText(item.nome).trim() || keys(item.nome).some(key => seen.has(key))) return;
      const body = crText(item.corpo).trim();
      const cost = crHasPbCost(body)
        ? body.match(/\bP\.?B\.?\s*(?:[:=]\s*)?([1-9]\d*)\b|(?<!\+)\b([1-9]\d*)\s*P\.?B\.?(?!\w)/i) : null;
      const atkMatch = body.match(/\b(?:ATK|DEF|DESV)\s*(?:N|AB|AF|C|O)\b/i);
      const description = body.replace(/^(?:(?:ATK\s*:\s*)?(?:ATK|DEF|DESV)\s*(?:N|AB|AF|C|O)|P\.?B\.?\s*:?\s*\d+|PASSIVA)\s*(?:\||\n|:\s*)\s*/i, "")
        .replace(/^(?:P\.?B\.?\s*:?\s*\d+|PASSIVA)\s*(?:\||\n)\s*/i, "")
        .replace(/^Efeito\s*:\s*/i, "").trim() || body;
      cards.push({
        id:"cfhab_catalog_" + Date.now().toString(36) + "_" + cards.length,
        nome:crText(item.nome).trim(),
        atk:passive ? "PASSIVA" : atkMatch ? atkMatch[0].toUpperCase() : "",
        pb:cost ? (cost[1] || cost[2]) : "",
        descricao:description
      });
      keys(item.nome).forEach(key => seen.add(key));
      added++;
    });
    if(added) data.cf_habilidades_data = JSON.stringify(cards);
  }

  async function createFromCatalog(c){
    if(!c) return false;
    const data = c.sheetData ? { ...c.sheetData } : {};
    const f = c.ficha || {};
    if(!c.sheetData){
      const oldPowers = f.habilidadesPassivas || [];
      const isPassive = item => crIsFiftyPower(item) || /\bpassiv[ao]\b/i.test(crText(item.corpo).slice(0,130));
      const freeActions = (f.acoes || []).filter(item => !isPassive(item) && !crHasPbCost(item.corpo));
      const pbPowers = [...(f.habilidadesPb || []),...oldPowers,...(f.acoes || [])]
        .filter(item => !isPassive(item) && crHasPbCost(item.corpo));
      const passivePowers = [...(f.passivas || []),
        ...(f.habilidadesPb || []).filter(isPassive),
        ...oldPowers.filter(item => isPassive(item) || !crHasPbCost(item.corpo)),
        ...(f.acoes || []).filter(isPassive)];
      const p = f.pontos || {};
      const resource = (key,value) => {
        if(value && typeof value === "object"){
          data[key + "_atual"] = crText(value.atual);
          data[key + "_max"] = crText(value.max);
        }
      };
      resource("cr_hp",p.vida);resource("cr_san",p.sanidade);
      resource("cr_protecao",p.protecao);resource("cr_pb",p.pb);
      Object.assign(data,{
        cr_periculosidade:crText(f.periculosidade),cr_nivel:crText(f.nivel),
        cr_impacto_sanidade:crText(f.impactoSanidade),cr_raca:crText(f.raca),
        cr_res_n:crText(p.resistenciaNatural),cr_movs:crText(f.combate?.movs),
        cr_peso_total:crText(f.condicoesFisicas?.tamanhoPeso),
        cr_foto:crText(c.imagem),cr_catalogo_descricao:crText(c.descricao || f.descricao?.aparencia),
        cr_catalogo_comportamento:crText(f.descricao?.comportamento),
        cr_catalogo_origem:crText(f.descricao?.origem),
        cr_catalogo_curiosidades:crText(f.descricao?.curiosidades),
        cr_catalogo_relacao:crText(f.descricao?.relacaoDimensao),
        cr_catalogo_resistencias:crText(f.resistencias?.observacoes),
        cr_catalogo_imunidades:(f.resistencias?.imunidades || []).join("\n"),
        cr_condicoes:[crText(f.condicoesFisicas?.registro),
          (f.resistencias?.imunidades || []).length ? "Imunidades: " + f.resistencias.imunidades.join(", ") : "",
          f.resistencias?.observacoes ? "Resistências: " + f.resistencias.observacoes : ""
        ].filter(Boolean).join("\n\n"),
        cr_itens:crText(f.itens),
        cr_movimentos:[
          freeActions.length ? "Ações:\n\n" + freeActions.map(item => [item.nome,item.corpo].filter(Boolean).join(" — ")).join("\n\n") : "",
          pbPowers.length ? "Habilidades:\n\n" + pbPowers.map(item => [item.nome,item.corpo].filter(Boolean).join(" — ")).join("\n\n") : "",
          passivePowers.length ? "Passivas:\n\n" + passivePowers.map(item => [item.nome,item.corpo].filter(Boolean).join(" — ")).join("\n\n") : ""
        ].filter(Boolean).join("\n\n")
      });
      const combatIds = {"ATK N":"cr_atk_n","ATK AB":"cr_atk_ab","ATK AF":"cr_atk_af","ATK C":"cr_atk_c",
        "DEF N":"cr_def_n","DEF AB":"cr_def_ab","DEF C":"cr_def_c","DESV N":"cr_desv_n","DESV O":"cr_desv_o"};
      (f.combate?.valores || []).forEach(([label,value]) => { if(combatIds[label]) data[combatIds[label]] = crText(value); });
      const simplify = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      [[f.habilidades,CR_HABILIDADES],[f.talentos,CR_TALENTOS],[f.atributos,CR_ATRIBUTOS],[f.pericias,CR_PERICIAS]]
        .forEach(([items,group]) => (items || []).forEach(([label,value]) => {
          const field = group.find(([,name]) => simplify(name) === simplify(label));
          if(field){ data[field[0]] = crText(value); data[field[0] + "_atual"] = crText(value); }
        }));
    }
    addCatalogPowersToSheetCards(data,f);
    data.cr_nome = crText(c.nome) || "Criatura sem nome";
    data.cr_catalogado = "";
    data.cr_catalogo_dimensao = crText(c.dimensao);
    data.cr_catalogo_tipo = crText(c.tipo);
    const result = await window.CRISCreatureSheets.importFromPdf(data,{preserveExtra:true});
    return result;
  }

  // Entrada usada pelo importador de PDF. Mantém a mesma estrutura de dados,
  // índice e sincronização das criaturas criadas pela interface.
  window.CRISCreatureSheets = window.CRISCreatureSheets || {};
  window.CRISCreatureSheets.importFromPdf = async function(data, options){
    if(!data || typeof data !== "object" || !Object.keys(data).length){
      throw new Error("Nenhum campo de criatura foi reconhecido.");
    }
    // Uma falha ao salvar a ficha antiga não pode impedir a criação de
    // um registro novo. Mantém a ficha antiga intacta e aberta nesse caso.
    const canSwitch = await flushCrBeforeSwitch(true);
    await loadCreaturesIndex();
    buildAllCrGrids();
    const allowed = new Set(crFieldIds());
    // Cópias do Compêndio mantêm campos de versões antigas da ficha;
    // a importação de PDF continua restrita aos campos reconhecidos.
    const clean = Object.create(null);
    Object.keys(data).forEach(id => {
      if((allowed.has(id) || options?.preserveExtra) && typeof data[id] === "string") clean[id] = data[id];
    });
    if(!Object.keys(clean).length) throw new Error("Nenhum campo compatível foi reconhecido.");
    const id = genCreatureId();
    const nome = (clean.cr_nome || "").trim() || "Criatura sem nome";
    const saved = await storageSet(crSheetKey(id), JSON.stringify(clean), 1, true);
    if(!saved) throw new Error("Não foi possível salvar a criatura importada.");
    creaturesIndex.push({ id, nome, updatedAt: Date.now() });
    try{
      const indexSaved = await storageSet(CR_INDEX_KEY, JSON.stringify(creaturesIndex), 1, true);
      if(!indexSaved) throw new Error("Não foi possível atualizar a lista de criaturas.");
    }catch(e){
      creaturesIndex = creaturesIndex.filter(entry => entry.id !== id);
      await storageDeleteKey(crSheetKey(id));
      throw e;
    }
    try{ await crAutoBackup("Importação de criatura em PDF", true); }
    catch(e){ console.error("[Criaturas] Backup após importação:", e); }
    if(window.CRISCreaturesSync && typeof window.CRISCreaturesSync.syncCreatureToCloud === "function"){
      try{ await window.CRISCreaturesSync.syncCreatureToCloud(id, nome, clean); }
      catch(e){ console.error("[Criaturas] Sincronização após importação:", e); }
    }
    if(!canSwitch) preserveCurrentDraft();
    const opened = await openCreature(id);
    return { id, opened: !!opened, previousPending: !canSwitch };
  };

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
    if(!atualEl) return;
    if(atualEl.value === "") atualEl.value = maxEl.value;
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

  /* ---------- imagem da criatura ----------
     ETAPA — CROP GLOBAL: usa o mesmo editor reutilizável de
     js/image-cropper.js (aspectRatio 1:1, igual ao quadrado de
     .cr-photo-box) em vez de gravar a imagem crua em #cr_foto sem
     nenhum controle de enquadramento/tamanho. Se o editor não
     estiver disponível, cai no comportamento anterior (imagem
     completa, sem redimensionar) para não travar a funcionalidade. */
  function wireCreaturePhoto(){
    const box = document.getElementById("cr_photo_box");
    const input = document.getElementById("cr_photo_input");
    const foto = document.getElementById("cr_foto");
    if(!box || !input || !foto) return;
    box.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      input.value = "";
      if(!file) return;
      if (window.CRISImageCropper && typeof window.CRISImageCropper.open === "function") {
        window.CRISImageCropper.open({
          file: file,
          aspectRatio: 1,
          title: "Imagem da Criatura",
          outputMax: 320,
          mimeType: "image/jpeg",
          quality: 0.85,
          onConfirm: function (result) {
            foto.value = result.dataUrl;
            applyPhotoFromField();
            markCrDirty();
          }
        });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        foto.value = reader.result;
        applyPhotoFromField();
        markCrDirty();
      };
      reader.readAsDataURL(file);
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
    const listSearchHandler = typeof debounce === "function" ? debounce(renderCreatureList, 150) : renderCreatureList;
    document.getElementById("cr_list_search")?.addEventListener("input", listSearchHandler);
    document.getElementById("cr_list_sort")?.addEventListener("change", renderCreatureList);

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
    if(btnSave) btnSave.addEventListener("click", () => saveCreature(false));

    const catalogModal = document.getElementById("cr_catalog_modal");
    const closeCatalog = () => { if(catalogModal) catalogModal.style.display = "none"; };
    const catalogDescriptionFields = [
      ["cr_catalogo_descricao","cr_catalog_modal_desc","aparencia"],
      ["cr_catalogo_comportamento","cr_catalog_modal_behavior","comportamento"],
      ["cr_catalogo_origem","cr_catalog_modal_origin","origem"],
      ["cr_catalogo_curiosidades","cr_catalog_modal_curiosities","curiosidades"],
      ["cr_catalogo_relacao","cr_catalog_modal_relation","relacaoDimensao"]
    ];
    document.getElementById("cr_btn_catalog")?.addEventListener("click", () => {
      if(!currentCreatureId || !catalogModal) return;
      document.getElementById("cr_catalog_modal_dim").value = document.getElementById("cr_catalogo_dimensao").value;
      document.getElementById("cr_catalog_modal_tipo").value = document.getElementById("cr_catalogo_tipo").value || document.getElementById("cr_raca").value;
      const inferred = parseCrCatalogText(document.getElementById("cr_movimentos")?.value).descricao;
      const powerTags = parseCrCatalogText(document.getElementById("cr_movimentos")?.value);
      const conditionTags = parseCrCatalogText(document.getElementById("cr_condicoes")?.value);
      document.getElementById("cr_catalog_modal_resistencias").value =
        document.getElementById("cr_catalogo_resistencias").value || powerTags.resistencias || conditionTags.resistencias || "";
      document.getElementById("cr_catalog_modal_imunidades").value =
        document.getElementById("cr_catalogo_imunidades").value ||
        [...powerTags.imunidades,...conditionTags.imunidades].join("\n");
      catalogDescriptionFields.forEach(([field,control,key]) => {
        document.getElementById(control).value = document.getElementById(field).value || inferred[key] || "";
      });
      catalogModal.style.display = "flex";
    });
    document.getElementById("cr_catalog_cancel")?.addEventListener("click", closeCatalog);
    catalogModal?.addEventListener("click", e => { if(e.target === catalogModal) closeCatalog(); });
    document.getElementById("cr_catalog_confirm")?.addEventListener("click", async e => {
      const dim = document.getElementById("cr_catalog_modal_dim").value;
      if(!CR_CATALOG_DIMS.has(dim)){
        document.getElementById("cr_catalog_modal_dim").focus();
        if(typeof flashIndicator === "function") flashIndicator("Escolha a dimensão para catalogar a criatura.",true,3200);
        return;
      }
      const btn = e.currentTarget;
      btn.disabled = true;
      const ids = ["cr_catalogado","cr_catalogo_dimensao","cr_catalogo_tipo",
        "cr_catalogo_resistencias","cr_catalogo_imunidades",...catalogDescriptionFields.map(([field]) => field)];
      const old = ids.map(id => document.getElementById(id).value);
      ["1",dim,document.getElementById("cr_catalog_modal_tipo").value.trim(),
        document.getElementById("cr_catalog_modal_resistencias").value.trim(),
        document.getElementById("cr_catalog_modal_imunidades").value.trim(),
        ...catalogDescriptionFields.map(([,control]) => document.getElementById(control).value.trim())]
        .forEach((value,i) => { document.getElementById(ids[i]).value = value; });
      markCrDirty();
      const saved = await saveCreature(false);
      if(!saved) ids.forEach((id,i) => { document.getElementById(id).value = old[i]; });
      else closeCatalog();
      refreshCrCatalogAction();
      btn.disabled = false;
    });
    document.getElementById("cr_btn_catalog_remove")?.addEventListener("click", async e => {
      if(!currentCreatureId) return;
      const btn = e.currentTarget;
      btn.disabled = true;
      const field = document.getElementById("cr_catalogado");
      field.value = "";
      markCrDirty();
      if(!await saveCreature(false)) field.value = "1";
      refreshCrCatalogAction();
      btn.disabled = false;
    });

    // Dado (4/6/8/12/20) + regra ATUAL/MÁX. reagem ao campo Máx. de cada skill
    const creatureScreen = document.getElementById("creature_sheet_screen");
    creatureScreen?.addEventListener("focusin", (e) => {
      if(e.target && e.target.dataset && e.target.dataset.crSkill){
        crSkillMaxBaseline.set(e.target, e.target.value);
      }
    });
    creatureScreen?.addEventListener("input", (e) => {
      if(e.target && e.target.dataset && e.target.dataset.crSkill){
        updateCrDiceTiers(e.target.id);
        syncCrSkillAtualOnMaxInput(e.target);
      }
      if(e.target && e.target.id && e.target.matches("input, textarea, select")) markCrDirty();
    });
    creatureScreen?.addEventListener("change", (e) => {
      const maxEl = e.target;
      if(!maxEl || !maxEl.dataset || !maxEl.dataset.crSkill) return;
      const previous = Number(crSkillMaxBaseline.get(maxEl));
      const next = Number(maxEl.value);
      const atualEl = document.getElementById(maxEl.id + "_atual");
      if(atualEl && maxEl.value !== "" && Number.isFinite(previous) && Number.isFinite(next) && next > previous && atualEl.value !== ""){
        const atual = Number(atualEl.value);
        if(Number.isFinite(atual)) atualEl.value = String(Math.min(next, atual + next - previous));
      }
      if(atualEl && maxEl.value !== "" && Number.isFinite(next) && Number(atualEl.value) > next){
        atualEl.value = String(next);
      }
      crSkillMaxBaseline.set(maxEl, maxEl.value);
      markCrDirty();
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
      const deletedRaw = await storageGet(crSheetKey(id));
      let wasPublished = false;
      try{ wasPublished = JSON.parse(deletedRaw || "null")?.cr_catalogado === "1"; }catch(e){}
      await storageDeleteKey(crSheetKey(id));
      if(wasPublished) await window.CRISCreatureCatalog?.unpublish(id);
      if(currentCreatureId === id){
        clearTimeout(crAutosaveTimer);
        currentCreatureId = null;
        crDirty = false;
      }
      crPendingDrafts.delete(id);
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
  window.CRISCreatureSheets = window.CRISCreatureSheets || {};
  window.CRISCreatureSheets.getCurrentId = function(){ return currentCreatureId; };
  // Navegação entre áreas: confirma o salvamento local antes de sair da ficha.
  window.CRISCreatureSheets.beforeLeave = safeLeaveCreature;
  window.CRISCreatureSheets.save = saveCreature;
  window.CRISCreatureSheets.listCataloged = listCatalogedCreatures;
  window.CRISCreatureSheets.catalogEntryFromSheet = function(id,data){
    if(!id || !data || data.cr_catalogado !== "1" || !CR_CATALOG_DIMS.has(data.cr_catalogo_dimensao)) return null;
    return crCatalogEntry({id,nome:data.cr_nome},data);
  };
  window.CRISCreatureSheets.editCataloged = editOwnedCatalogCreature;
  window.CRISCreatureSheets.updateCatalogImage = updateOwnedCatalogImage;
  window.CRISCreatureSheets.setCataloged = setCataloged;
  window.CRISCreatureSheets.createFromCatalog = createFromCatalog;
})();
