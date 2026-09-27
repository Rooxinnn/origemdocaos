/* ==========================================================
   FICHA COMPLETA DE CRIATURA — Etapa 2 (Registro de Entidade)

   Módulo isolado. Não reescreve, não refatora e não altera nenhum
   sistema já existente do Origem do Caos (Agentes, Ficha de
   Criatura/"Minhas Criaturas", Backup, Compêndio de Criaturas —
   Etapa 1 —, Inventário, Conexões, Condições). A ficha catalogada
   permite editar a ficha original ao dono. Os registros fixos e os adicionados pelo usuário
   chegam pelo mesmo campo "ficha" de js/criaturas-compendio.js.

   Este arquivo só enxerga esses dados através da pequena ponte
   somente-leitura que js/criaturas-compendio.js expõe no final de
   si mesmo (window.__cpdGetCreature / window.__cpdGetDimInfo /
   window.__cpdBackToCompendioScreen) — nunca lê ou escreve as
   variáveis internas daquele módulo diretamente.

   Toda classe nova é prefixada com "crf-" para nunca colidir com
   nada existente. A identidade visual por dimensão é 100%
   reaproveitada das classes "cpd-dim-*" e "cpd-card-texture" já
   definidas em css/criaturas-compendio.css — nenhuma cor nova é
   declarada aqui.
   ========================================================== */
(function(){
  "use strict";

  function esc(s){
    if(typeof window.escapeHtml === "function") return window.escapeHtml(s);
    const d = document.createElement("div");
    d.textContent = (s === undefined || s === null) ? "" : String(s);
    return d.innerHTML;
  }

  let crfActiveTab = "status";
  let crfActivePodTab = "acoes";
  let crfCurrentCreature = null;
  const crfDetails = new Map();
  let crfPreviousFocus = null;

  /* ---------- navegação ----------
     Mesma lista de telas já usada por criaturas-compendio.js — repetida
     aqui (padrão já existente no projeto: cada módulo mantém sua
     própria lista de hide, ver criaturas.js/criaturas-compendio.js). */
  function hideAllCrfScreens(){
    [
      "welcome_screen",
      "secret_files_screen",
      "creature_list_screen",
      "creature_sheet_screen",
      "creature_compendio_screen",
      "creature_registro_screen",
      "creature_ficha_completa_screen"
    ].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.style.display = "none";
    });
  }

  function backToCompendio(){
    closeCrfDetail();
    if(typeof window.__cpdBackToCompendioScreen === "function"){
      window.__cpdBackToCompendioScreen();
    } else {
      hideAllCrfScreens();
      const el = document.getElementById("creature_compendio_screen");
      if(el) el.style.display = "block";
    }
  }

  /* ---------- helpers de montagem ---------- */
  function pv(p){
    // "ponto de vida"-like field: {atual,max} OU número simples
    const shown = value => value === null || value === undefined || value === "" ? "—" : value;
    if(p === null || p === undefined) return "—";
    if(typeof p === "object") return `${shown(p.atual)} / ${shown(p.max)}`;
    if(p === "") return "—";
    return String(p);
  }

  function buildHeroBox(label, value){
    return `<div class="crf-hero-box"><label>${esc(label)}</label><div class="crf-hero-value">${esc(value)}</div></div>`;
  }

  function buildChipGroup(title, list){
    if(!list || list.length === 0) return "";
    const chips = list.map(([nome, valor]) => `<div class="crf-chip">${esc(nome)}<b>${esc(valor)}</b></div>`).join("");
    return `
      <div class="crf-subgroup">
        <div class="crf-subgroup-title">${esc(title)}</div>
        <div class="crf-chip-grid">${chips}</div>
      </div>
    `;
  }

  function buildAccordionItem(nome, corpo, idx, groupKey){
    crfDetails.set(`${groupKey}-${idx}`,{nome,corpo,category:groupKey === "desc" ? "Descrição" :
      ({acoes:"Ação",habilidades:"Habilidade",passivas:"Passiva"})[groupKey]});
    return `
      <div class="crf-accordion-item">
        <button type="button" class="crf-accordion-head" data-crf-acc="${groupKey}-${idx}" aria-haspopup="dialog">
          <span class="crf-accordion-arrow" aria-hidden="true">↗</span>${esc(nome)}
        </button>
      </div>
    `;
  }

  function closeCrfDetail(){
    const modal = document.getElementById("crf_detail_modal");
    if(!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("crf-modal-open");
    crfPreviousFocus?.focus?.();
    crfPreviousFocus = null;
  }
  function openCrfDetail(key, button){
    const detail = crfDetails.get(key);
    if(!detail) return;
    crfPreviousFocus = button;
    document.getElementById("crf_detail_category").textContent = detail.category;
    document.getElementById("crf_detail_title").textContent = detail.nome || "Sem título";
    document.getElementById("crf_detail_text").textContent = detail.corpo || "Sem descrição.";
    document.getElementById("crf_detail_modal").hidden = false;
    document.body.classList.add("crf-modal-open");
    document.getElementById("crf_detail_close")?.focus();
  }

  /* ---------- aba STATUS (tudo aberto, leitura rápida em combate) ---------- */
  function renderStatus(f){
    const p = f.pontos || {};
    let html = `
      <div class="crf-hero-row">
        ${buildHeroBox("Vida", pv(p.vida))}
        ${buildHeroBox("Sanidade", pv(p.sanidade))}
        ${buildHeroBox("Proteção", pv(p.protecao))}
        ${buildHeroBox("Resistência Natural", pv(p.resistenciaNatural))}
        ${buildHeroBox("PB", pv(p.pb))}
      </div>
    `;

    if(f.combate){
      const combGrid = (f.combate.valores || []).map(([label, valor]) =>
        `<div class="crf-combat-cell"><label>${esc(label)}</label><span>${esc(valor)}</span></div>`
      ).join("");
      html += `
        <div class="crf-section-title">Dados de Combate</div>
        <div class="crf-combat-grid">
          <div class="crf-combat-cell"><label>MOVS</label><span>${esc(f.combate.movs ?? "—")}</span></div>
          ${combGrid}
        </div>
      `;
    }

    const hasSkills = (f.habilidades && f.habilidades.length) || (f.talentos && f.talentos.length) ||
                       (f.atributos && f.atributos.length) || (f.pericias && f.pericias.length);
    if(hasSkills){
      html += `<div class="crf-section-title">Perícias</div>`;
      html += buildChipGroup("Habilidades", f.habilidades);
      html += buildChipGroup("Talentos", f.talentos);
      html += buildChipGroup("Atributos", f.atributos);
      html += buildChipGroup("Perícias", f.pericias);
    }

    html += `<div class="crf-section-title">Sentidos</div>`;
    html += `<p class="crf-plain-text">${f.sentidos ? esc(f.sentidos) : "Não catalogado no registro original."}</p>`;

    if(f.resistencias){
      html += `<div class="crf-section-title">Resistências e Imunidades</div>`;
      if(f.resistencias.imunidades && f.resistencias.imunidades.length){
        html += `<div class="crf-chip-grid">${f.resistencias.imunidades.map(i => `<div class="crf-chip crf-chip-imune">${esc(i)}</div>`).join("")}</div>`;
      }
      if(f.resistencias.observacoes){
        html += `<p class="crf-plain-text" style="margin-top:10px;">${esc(f.resistencias.observacoes)}</p>`;
      }
    }

    if(f.condicoesFisicas && f.condicoesFisicas.tamanhoPeso){
      html += `<div class="crf-section-title">Tamanho e Peso</div>`;
      html += `<p class="crf-plain-text">${esc(f.condicoesFisicas.tamanhoPeso)}</p>`;
    }

    if(f.condicoesFisicas && f.condicoesFisicas.registro){
      html += `<div class="crf-section-title">Condições físicas</div>`;
      html += `<p class="crf-plain-text">${esc(f.condicoesFisicas.registro)}</p>`;
    }

    if(f.itens){
      html += `<div class="crf-section-title">Itens</div>`;
      html += `<p class="crf-plain-text">${esc(f.itens)}</p>`;
    }

    document.getElementById("crf_panel_status").innerHTML = html;
  }

  /* ---------- aba PODERES (Ações / Habilidades / Passivas) ---------- */
  function renderPoderes(f){
    // Entradas antigas usavam habilidadesPassivas para os dois tipos.
    // Classificá-las na leitura preserva fichas catalogadas antes da separação.
    const hasCost = item => /(?:\bP\.?B\.?\s*(?:[:=]\s*)?[1-9]\d*\b|(?<![+\d])\b\d+\s*P\.?B\.?(?!\w))/i.test(String(item.corpo || ""));
    const isFifty = item => {
      const name = String(item.nome || "").trim();
      if(/[—–-]\s*50\s*[—–-]|\b50\s+pontos?\b/i.test(name)) return true;
      const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR").trim();
      const key = normalize(name);
      return !!key && (window.CRRCreature50 || []).some(rule => {
        const title = String(rule.nome || "");
        return key === normalize(title) || key === normalize(title.split(" — 50 — ").pop());
      });
    };
    const isPassive = item => isFifty(item) || /\bpassiv[ao]\b/i.test(String(item.corpo || "").slice(0,130));
    const legacy = f.habilidadesPassivas || [];
    const acoes = (f.acoes || []).filter(item => !isPassive(item) && !hasCost(item));
    const habs = [...(f.habilidadesPb || []), ...legacy, ...(f.acoes || [])]
      .filter(item => !isPassive(item) && hasCost(item));
    const passivas = [...(f.passivas || []),
      ...(f.habilidadesPb || []).filter(isPassive),
      ...legacy.filter(item => isPassive(item) || !hasCost(item)),
      ...(f.acoes || []).filter(isPassive)];
    const html = `
      <div class="crf-subtabs">
        <button type="button" class="crf-subtab-btn ${crfActivePodTab === "acoes" ? "active" : ""}" data-crf-podtab="acoes">Ações</button>
        <button type="button" class="crf-subtab-btn ${crfActivePodTab === "habilidades" ? "active" : ""}" data-crf-podtab="habilidades">Habilidades</button>
        <button type="button" class="crf-subtab-btn ${crfActivePodTab === "passivas" ? "active" : ""}" data-crf-podtab="passivas">Passivas</button>
      </div>
      <div class="crf-accordion" data-crf-podpanel="acoes" style="${crfActivePodTab === "acoes" ? "" : "display:none;"}">
        ${acoes.length ? acoes.map((a, i) => buildAccordionItem(a.nome, a.corpo, i, "acoes")).join("") : '<div class="crf-empty">Nenhuma ação catalogada.</div>'}
      </div>
      <div class="crf-accordion" data-crf-podpanel="habilidades" style="${crfActivePodTab === "habilidades" ? "" : "display:none;"}">
        ${habs.length ? habs.map((a, i) => buildAccordionItem(a.nome, a.corpo, i, "habilidades")).join("") : '<div class="crf-empty">Nenhuma habilidade catalogada.</div>'}
      </div>
      <div class="crf-accordion" data-crf-podpanel="passivas" style="${crfActivePodTab === "passivas" ? "" : "display:none;"}">
        ${passivas.length ? passivas.map((a, i) => buildAccordionItem(a.nome, a.corpo, i, "passivas")).join("") : '<div class="crf-empty">Nenhuma passiva catalogada.</div>'}
      </div>
    `;
    document.getElementById("crf_panel_poderes").innerHTML = html;
    wireCrfSubtabs();
    wireCrfDetails(document.getElementById("crf_panel_poderes"));
  }

  /* ---------- aba DESCRIÇÃO (100% expansão) ---------- */
  function renderDescricao(f){
    const d = f.descricao || {};
    const blocos = [
      ["Aparência", d.aparencia],
      ["Comportamento", d.comportamento],
      ["Origem", d.origem],
      ["Curiosidades", d.curiosidades],
      ["Relação com a Dimensão", d.relacaoDimensao]
    ];
    const html = `<div class="crf-accordion">${blocos.map(([nome, texto], i) =>
      buildAccordionItem(nome, texto || "Em desenvolvimento.", i, "desc")
    ).join("")}</div>`;
    document.getElementById("crf_panel_descricao").innerHTML = html;
    wireCrfDetails(document.getElementById("crf_panel_descricao"));
  }

  /* ---------- abas principais ---------- */
  function updateCrfTabButtons(){
    document.querySelectorAll(".crf-tab-btn").forEach(btn => {
      const active = btn.dataset.crfTab === crfActiveTab;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    ["status","poderes","descricao"].forEach(tab => {
      const panel = document.getElementById("crf_panel_" + tab);
      if(panel) panel.style.display = (tab === crfActiveTab) ? "block" : "none";
    });
  }
  function wireCrfTabs(){
    document.querySelectorAll(".crf-tab-btn").forEach(btn => {
      btn.onclick = () => {
        crfActiveTab = btn.dataset.crfTab;
        updateCrfTabButtons();
      };
    });
  }
  function wireCrfSubtabs(){
    document.querySelectorAll(".crf-subtab-btn").forEach(btn => {
      btn.onclick = () => {
        crfActivePodTab = btn.dataset.crfPodtab;
        document.querySelectorAll(".crf-subtab-btn").forEach(b => b.classList.toggle("active", b === btn));
        document.querySelectorAll("[data-crf-podpanel]").forEach(p => {
          p.style.display = (p.dataset.crfPodpanel === crfActivePodTab) ? "block" : "none";
        });
      };
    });
  }
  function wireCrfDetails(scope){
    if(!scope) return;
    scope.querySelectorAll(".crf-accordion-head").forEach(btn => {
      btn.onclick = () => openCrfDetail(btn.dataset.crfAcc,btn);
    });
  }

  async function editCrfCreature(button){
    const id = crfCurrentCreature?.sourceSheetId;
    if(!id) return;
    button.disabled = true;
    try{
      if(!await window.CRISCreatureSheets?.editCataloged(id)) throw new Error("Ficha não pertence à conta atual.");
      closeCrfDetail();
    }catch(e){
      console.error("[Compêndio] Edição indisponível:",e);
      window.flashIndicator?.("Não foi possível abrir a ficha desta criatura para edição.",true,3500);
    }finally{ button.disabled = false; }
  }

  function setCrfPhoto(c){
    const photo = document.getElementById("crf_photo");
    const fallback = document.getElementById("crf_photo_fallback");
    if(!photo || !fallback) return;
    if(c.imagem){
      photo.onerror = () => { photo.style.display = "none"; fallback.style.display = "flex"; };
      photo.src = c.imagem;
      photo.alt = c.nome || "";
      photo.style.display = "block";
      fallback.style.display = "none";
    }else{
      photo.removeAttribute("src");
      photo.style.display = "none";
      fallback.style.display = "flex";
    }
  }

  async function saveCrfImage(image){
    const id = crfCurrentCreature?.sourceSheetId;
    const button = document.getElementById("crf_image_button");
    if(!id || !image) return;
    if(button) button.disabled = true;
    try{
      const saved = await window.CRISCreatureSheets?.updateCatalogImage(id,image);
      if(!saved) throw new Error("Imagem não salva.");
      crfCurrentCreature.imagem = image;
      setCrfPhoto(crfCurrentCreature);
      if(button) button.textContent = "Trocar imagem";
      const pending=await window.CRISCreatureCatalog?.isPending?.(id,"publish");
      window.flashIndicator?.(pending ? "Imagem salva na ficha. Atualização pública pendente."
        : "Imagem da criatura salva no Compêndio.",!!pending,3500);
    }catch(e){
      console.error("[Compêndio] Falha ao salvar imagem:",e);
      window.flashIndicator?.("Não foi possível salvar a imagem da criatura.",true,3500);
    }finally{ if(button) button.disabled = false; }
  }

  /* ---------- montagem geral da tela ---------- */
  function showFichaCompleta(id){
    const c = window.__cpdGetCreature ? window.__cpdGetCreature(id) : null;
    if(!c || !c.ficha) return;
    crfCurrentCreature = c;
    closeCrfDetail();
    crfDetails.clear();
    const convert = document.getElementById("crf_convert");
    const remove = document.getElementById("crf_remove");
    const edit = document.getElementById("crf_edit");
    const imageButton = document.getElementById("crf_image_button");
    if(convert) convert.dataset.cpdId = id;
    if(remove){remove.hidden = !c.sourceSheetId;remove.dataset.cpdId = id;}
    if(edit) edit.hidden = !c.sourceSheetId;
    if(imageButton){imageButton.hidden = !c.sourceSheetId;imageButton.textContent = c.imagem ? "Trocar imagem" : "Adicionar imagem";}
    const dim = window.__cpdGetDimInfo ? window.__cpdGetDimInfo(c.dimensao) : null;
    const f = c.ficha;

    document.getElementById("crf_nome").textContent = c.nome || "Não catalogado";
    document.getElementById("crf_dim").innerHTML = dim ? dim.emoji + " " + esc(dim.label) : "Dimensão não catalogada";
    document.getElementById("crf_tipo").textContent = c.tipo ? "Criatura - " + c.tipo : "Tipo não catalogado";

    const nivelBits = [];
    if(f.nivel) nivelBits.push("Nível " + f.nivel);
    if(f.periculosidade) nivelBits.push("Periculosidade " + f.periculosidade);
    if(f.raca) nivelBits.push(f.raca);
    document.getElementById("crf_nivel").textContent = nivelBits.join(" · ");

    setCrfPhoto(c);

    const screen = document.getElementById("creature_ficha_completa_screen");
    if(screen){
      screen.className = screen.className.replace(/\bcpd-dim-\S+/g, "").trim();
      if(dim) screen.classList.add("cpd-dim-" + dim.key);
    }
    const modal = document.getElementById("crf_detail_modal");
    if(modal){
      modal.className = modal.className.replace(/\bcpd-dim-\S+/g, "").trim();
      if(dim) modal.classList.add("cpd-dim-" + dim.key);
    }

    crfActiveTab = "status";
    crfActivePodTab = "acoes";
    renderStatus(f);
    renderPoderes(f);
    renderDescricao(f);
    wireCrfTabs();
    updateCrfTabButtons();

    hideAllCrfScreens();
    if(screen) screen.style.display = "block";
    window.scrollTo(0, 0);
  }

  /* ---------- wiring geral ---------- */
  function wireFichaModule(){
    const backBtn = document.getElementById("crf_back_btn");
    if(backBtn) backBtn.addEventListener("click", backToCompendio);
    document.getElementById("crf_convert")?.addEventListener("click", e => window.CPD_convertCreature?.(e.currentTarget.dataset.cpdId,e.currentTarget));
    document.getElementById("crf_remove")?.addEventListener("click", e => window.CPD_removeCreature?.(e.currentTarget.dataset.cpdId,e.currentTarget));
    document.getElementById("crf_edit")?.addEventListener("click", e => editCrfCreature(e.currentTarget));
    document.getElementById("crf_image_button")?.addEventListener("click", () => document.getElementById("crf_image_input")?.click());
    document.getElementById("crf_image_input")?.addEventListener("change", e => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if(!file) return;
      if(!file.type.startsWith("image/")) return;
      if(window.CRISImageCropper?.open){
        window.CRISImageCropper.open({file,aspectRatio:1,title:"Imagem da Criatura",outputMax:320,
          mimeType:"image/jpeg",quality:0.85,onConfirm:result => saveCrfImage(result.dataUrl)});
      }else{
        window.flashIndicator?.("Editor de imagem indisponível. Use a ficha editável para adicionar a imagem.",true,3500);
      }
    });
    document.getElementById("crf_detail_close")?.addEventListener("click",closeCrfDetail);
    document.getElementById("crf_detail_modal")?.addEventListener("click",e => {
      if(e.target.id === "crf_detail_modal") closeCrfDetail();
    });
    document.addEventListener("keydown",e => {
      const modal = document.getElementById("crf_detail_modal");
      if(modal?.hidden) return;
      if(e.key === "Escape") closeCrfDetail();
      if(e.key === "Tab"){
        e.preventDefault();
        document.getElementById("crf_detail_close")?.focus();
      }
    });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", wireFichaModule);
  } else {
    wireFichaModule();
  }

  // Único ponto de entrada chamado por criaturas-compendio.js.
  window.CPD_showFichaCompleta = showFichaCompleta;
})();
