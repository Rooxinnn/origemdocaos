/* ==========================================================
   FICHA COMPLETA DE CRIATURA — Etapa 2 (Registro de Entidade)

   Módulo isolado. Não reescreve, não refatora e não altera nenhum
   sistema já existente do Origem do Caos (Agentes, Ficha de
   Criatura/"Minhas Criaturas", Backup, Compêndio de Criaturas —
   Etapa 1 —, Inventário, Conexões, Condições). Não depende de
   storageGet/storageSet: esta etapa é somente leitura, os dados
   completos de cada criatura vivem em CPD_CREATURES
   (js/criaturas-compendio.js), no campo "ficha" de cada entrada.

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
    if(p === null || p === undefined) return "—";
    if(typeof p === "object") return `${p.atual ?? "—"} / ${p.max ?? "—"}`;
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
    return `
      <div class="crf-accordion-item">
        <button type="button" class="crf-accordion-head" data-crf-acc="${groupKey}-${idx}">
          <span class="crf-accordion-arrow">▼</span>${esc(nome)}
        </button>
        <div class="crf-accordion-body" id="crf-acc-${groupKey}-${idx}">${esc(corpo)}</div>
      </div>
    `;
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

    document.getElementById("crf_panel_status").innerHTML = html;
  }

  /* ---------- aba PODERES (expansão: Ações / Habilidades) ---------- */
  function renderPoderes(f){
    const acoes = f.acoes || [];
    const habs = f.habilidadesPassivas || [];
    const html = `
      <div class="crf-subtabs">
        <button type="button" class="crf-subtab-btn ${crfActivePodTab === "acoes" ? "active" : ""}" data-crf-podtab="acoes">Ações</button>
        <button type="button" class="crf-subtab-btn ${crfActivePodTab === "habilidades" ? "active" : ""}" data-crf-podtab="habilidades">Habilidades</button>
      </div>
      <div class="crf-accordion" data-crf-podpanel="acoes" style="${crfActivePodTab === "acoes" ? "" : "display:none;"}">
        ${acoes.length ? acoes.map((a, i) => buildAccordionItem(a.nome, a.corpo, i, "acoes")).join("") : '<div class="crf-empty">Nenhuma ação catalogada.</div>'}
      </div>
      <div class="crf-accordion" data-crf-podpanel="habilidades" style="${crfActivePodTab === "habilidades" ? "" : "display:none;"}">
        ${habs.length ? habs.map((a, i) => buildAccordionItem(a.nome, a.corpo, i, "habilidades")).join("") : '<div class="crf-empty">Nenhuma habilidade catalogada.</div>'}
      </div>
    `;
    document.getElementById("crf_panel_poderes").innerHTML = html;
    wireCrfSubtabs();
    wireCrfAccordion(document.getElementById("crf_panel_poderes"));
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
    wireCrfAccordion(document.getElementById("crf_panel_descricao"));
  }

  /* ---------- abas principais ---------- */
  function updateCrfTabButtons(){
    document.querySelectorAll(".crf-tab-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.crfTab === crfActiveTab);
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
  function wireCrfAccordion(scope){
    if(!scope) return;
    scope.querySelectorAll(".crf-accordion-head").forEach(btn => {
      btn.onclick = () => {
        const body = document.getElementById("crf-acc-" + btn.dataset.crfAcc);
        const item = btn.closest(".crf-accordion-item");
        if(!body || !item) return;
        const open = item.classList.toggle("open");
        body.style.display = open ? "block" : "none";
      };
    });
  }

  /* ---------- montagem geral da tela ---------- */
  function showFichaCompleta(id){
    const c = window.__cpdGetCreature ? window.__cpdGetCreature(id) : null;
    if(!c || !c.ficha) return;
    crfCurrentCreature = c;
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

    const photo = document.getElementById("crf_photo");
    const fallback = document.getElementById("crf_photo_fallback");
    if(photo && fallback){
      if(c.imagem){
        photo.onerror = () => { photo.style.display = "none"; fallback.style.display = "flex"; };
        photo.src = c.imagem;
        photo.alt = c.nome || "";
        photo.style.display = "block";
        fallback.style.display = "none";
      } else {
        photo.removeAttribute("src");
        photo.style.display = "none";
        fallback.style.display = "flex";
      }
    }

    const screen = document.getElementById("creature_ficha_completa_screen");
    if(screen){
      screen.className = screen.className.replace(/\bcpd-dim-\S+/g, "").trim();
      if(dim) screen.classList.add("cpd-dim-" + dim.key);
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
  }

  /* ---------- wiring geral ---------- */
  function wireFichaModule(){
    const backBtn = document.getElementById("crf_back_btn");
    if(backBtn) backBtn.addEventListener("click", backToCompendio);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", wireFichaModule);
  } else {
    wireFichaModule();
  }

  // Único ponto de entrada chamado por criaturas-compendio.js.
  window.CPD_showFichaCompleta = showFichaCompleta;
})();
