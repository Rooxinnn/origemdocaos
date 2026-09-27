/* Regras automáticas da ficha de criatura. Mantém valores especiais
   digitados/importados e usa a própria lista do Compêndio para os marcos 50. */
(function(){
  "use strict";

  const LEVEL_BUDGET = {1:40,2:65,3:85,4:100,5:120,6:180,7:230,8:280,9:350,10:450};
  const COMBAT = {
    cr_atk_ab:["cr_tal_combate","cr_per_armas_brancas","cr_atr_forca_fisica"],
    cr_atk_af:["cr_tal_combate","cr_per_armas_fogo","cr_tal_mirar"],
    cr_atk_c:["cr_tal_combate","cr_hab_sentido_paranormal","cr_atr_ocultismo"],
    cr_def_ab:["cr_atr_forca_fisica","cr_per_armas_brancas","cr_atr_agilidade"],
    cr_def_c:["cr_hab_sentido_paranormal","cr_atr_ocultismo","cr_atr_agilidade"],
    cr_desv_n:["cr_atr_velocidade","cr_tal_combate","cr_atr_agilidade"],
    cr_desv_o:["cr_hab_sentido_paranormal","cr_atr_ocultismo","cr_atr_agilidade"]
  };
  const RESOURCES = [
    ["cr_hp_atual","cr_hp_max"], ["cr_san_atual","cr_san_max"],
    ["cr_protecao_atual","cr_protecao_max"], ["cr_pb_atual","cr_pb_max"]
  ];
  const EXTRA_ALIAS = {"idiomas antigos":"idioma antigo"};
  const generated = {};
  const manualCombat = new Set();
  let lastCreatureId = null;
  let lastSnapshot = null;
  const focusValue = new WeakMap();

  function el(id){ return document.getElementById(id); }
  function normalize(s){
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }
  function escape(s){
    const node = document.createElement("span"); node.textContent = String(s); return node.innerHTML;
  }
  function number(value){
    if(String(value ?? "").trim() === "") return null;
    const n = Number(String(value).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  function display(n){ return String(Math.round(n * 1000) / 1000); }
  function tierDie(n){
    if(n >= 16) return 20;
    if(n >= 12) return 12;
    if(n >= 8) return 8;
    if(n >= 6) return 6;
    if(n >= 1) return 4;
    return 0;
  }
  function skillInputs(){ return Array.from(document.querySelectorAll("#creature_sheet_screen [data-cr-skill]")); }
  function skillIndex(){
    const result = {};
    skillInputs().forEach(input => {
      const label = input.closest(".cr-skill-row")?.querySelector(".cr-skill-name")?.textContent;
      if(label) result[normalize(label)] = input.id;
    });
    return result;
  }
  function fiftyIndex(){
    const names = skillIndex();
    return (window.CRRCreature50 || []).map(item => {
      const pieces = item.nome.split(" — 50 — ");
      if(pieces.length !== 2) return null;
      const key = normalize(pieces[0]);
      return { id:names[EXTRA_ALIAS[key] || key], title:pieces[1], requirement:pieces[0], item };
    }).filter(x => x && x.id);
  }
  function unlockedIds(){
    try{
      const raw = JSON.parse(el("cr_hab50_unlocked")?.value || "[]");
      return new Set(Array.isArray(raw) ? raw : []);
    }catch(e){ return new Set(); }
  }
  function refreshFifty(){
    const hidden = el("cr_hab50_unlocked"), grid = el("cr_hab50_grid");
    if(!hidden || !grid) return new Set();
    const index = fiftyIndex();
    const unlocked = unlockedIds();
    let added = false;
    index.forEach(x => {
      if((number(el(x.id)?.value) || 0) >= 50 && !unlocked.has(x.id)){
        unlocked.add(x.id); added = true;
      }
    });
    if(added){
      hidden.value = JSON.stringify(Array.from(unlocked));
      hidden.dispatchEvent(new Event("input", { bubbles:true }));
    }
    const active = index.filter(x => unlocked.has(x.id));
    grid.innerHTML = active.length ? active.map(x =>
      '<article class="cr-auto-50-card"><h4>' + escape(x.item.nome) + '</h4>' +
      '<p>' + escape(x.item.desc) + '</p><small>' + escape(x.requirement + " — 50 pontos") + '</small></article>'
    ).join("") : '<div class="cr-auto-note">Nenhuma habilidade em 50 desbloqueada.</div>';
    return unlocked;
  }
  function formula(id, unlocked){
    const dice = COMBAT[id].map(skill => tierDie(number(el(skill)?.value) || 0)).filter(Boolean).sort((a,b) => a-b);
    if(!dice.length) return "";
    const grouped = [];
    dice.forEach(die => {
      const last = grouped[grouped.length - 1];
      if(last && last.die === die) last.count++;
      else grouped.push({die,count:1});
    });
    const value = grouped.map(g => g.count + "d" + g.die).join("+");
    const bonus = id === "cr_desv_o" ? 5 : 0;
    const occultBonus = unlocked.has("cr_atr_ocultismo") && ["cr_atk_c","cr_def_c","cr_desv_o"].includes(id) ? 5 : 0;
    return value + (bonus + occultBonus ? "+" + (bonus + occultBonus) : "");
  }
  function comparable(s){
    const text = String(s || "").replace(/\s+/g, "").toLowerCase();
    const parts = text.split("+");
    const dice = [], bonuses = [];
    for(const part of parts){
      const m = part.match(/^(\d+)d(4|6|8|12|20)$/);
      if(m) dice.push(...Array(Number(m[1])).fill(Number(m[2])));
      else if(/^\d+$/.test(part)) bonuses.push(Number(part));
      else if(part) return text;
    }
    return dice.sort((a,b)=>a-b).join(",") + "/" + bonuses.reduce((a,b)=>a+b,0);
  }
  function refreshCombat(unlocked){
    Object.keys(COMBAT).forEach(id => {
      const input = el(id);
      if(!input) return;
      if(input.value === "") manualCombat.delete(id);
      const next = formula(id, unlocked);
      const autoOwned = !manualCombat.has(id) && (input.value === "" ||
        (Object.prototype.hasOwnProperty.call(generated,id) && input.value === generated[id]) ||
        (next && comparable(input.value) === comparable(next)));
      if(autoOwned){
        if(input.value !== next){
          input.value = next;
          input.dispatchEvent(new Event("input", { bubbles:true }));
        }
        generated[id] = next;
        input.title = "Calculado pelos pontos. Digite um valor para usar um ajuste próprio da criatura.";
      }else{
        manualCombat.add(id);
        delete generated[id];
        input.title = "Valor próprio preservado. Limpe o campo para voltar ao cálculo automático.";
      }
    });
  }
  function refreshBudget(){
    const box = el("cr_points_summary");
    if(!box) return;
    const level = number(el("cr_nivel")?.value);
    const budget = LEVEL_BUDGET[level];
    let spent = 0;
    skillInputs().forEach(input => { spent += number(input.value) || 0; });
    box.classList.toggle("cr-auto-over", !!budget && spent > budget);
    box.textContent = budget ? "Nível " + level + ": " + spent + " / " + budget + " pontos distribuídos" +
      (spent > budget ? " — excede " + (spent - budget) + " ponto(s); confira a ficha." : " — restam " + (budget-spent) + ".") :
      "Pontos distribuídos: " + spent + ". Informe um nível de 1 a 10 para ver a reserva disponível.";
  }
  function refresh(){
    const id = window.CRISCreatureSheets?.getCurrentId?.();
    if(!id) return;
    if(id !== lastCreatureId){
      lastCreatureId = id;
      lastSnapshot = null;
      Object.keys(generated).forEach(key => delete generated[key]);
      manualCombat.clear();
    }
    const pbMax = el("cr_pb_max"), pbAtual = el("cr_pb_atual");
    if(pbMax && pbMax.value === ""){
      pbMax.value = "15";
      pbMax.dispatchEvent(new Event("input", { bubbles:true }));
    }
    if(pbAtual && pbAtual.value === ""){
      pbAtual.value = "0";
      pbAtual.dispatchEvent(new Event("input", { bubbles:true }));
    }
    const snapshot = [id,el("cr_nivel")?.value,el("cr_hab50_unlocked")?.value,
      ...skillInputs().map(input => input.value), ...Object.keys(COMBAT).map(key => el(key)?.value)].join("|");
    if(snapshot === lastSnapshot) return;
    const unlocked = refreshFifty();
    refreshCombat(unlocked);
    refreshBudget();
    lastSnapshot = [id,el("cr_nivel")?.value,el("cr_hab50_unlocked")?.value,
      ...skillInputs().map(input => input.value), ...Object.keys(COMBAT).map(key => el(key)?.value)].join("|");
  }
  function dispatch(input){ input.dispatchEvent(new Event("input", { bubbles:true })); }
  function restore(){
    let changed = 0;
    const pairs = [...RESOURCES, ...skillInputs().map(input => [input.id + "_atual",input.id])];
    pairs.forEach(([currentId,maxId]) => {
      const current = el(currentId), maximum = el(maxId);
      if(!current || !maximum || number(maximum.value) === null) return;
      const next = display(number(maximum.value));
      if(current.value !== next){ current.value = next; dispatch(current); changed++; }
    });
    if(typeof flashIndicator === "function") flashIndicator(changed ? "✦ Pontos recuperados." : "✦ Os pontos já estão no máximo.", false, 2800);
  }
  function isCurrentField(input){
    return input && (RESOURCES.some(pair => pair[0] === input.id) || !!input.dataset.crSkillAtual);
  }
  function init(){
    const screen = el("creature_sheet_screen");
    if(!screen) return;
    const restoreBtn = el("cr_restore_points");
    restoreBtn?.addEventListener("click", () => {
      if(confirm("Recuperar HP, SAN, Proteção, PB e pontos atuais de todas as grades até seus máximos?")) restore();
    });
    el("cr_pb_gain")?.addEventListener("click", () => {
      const input = el("cr_pb_atual");
      if(!input) return;
      const max = number(el("cr_pb_max")?.value) ?? 15;
      const next = Math.min(max, (number(input.value) || 0) + 1);
      if(input.value !== display(next)){ input.value = display(next); dispatch(input); }
    });
    screen.addEventListener("focusin", e => {
      if(isCurrentField(e.target)) focusValue.set(e.target, number(e.target.value) || 0);
    });
    screen.addEventListener("change", e => {
      const input = e.target;
      if(!isCurrentField(input)) return;
      const match = String(input.value).trim().match(/^([+-])\s*(\d+(?:[.,]\d+)?)$/);
      if(match && focusValue.has(input)){
        const base = focusValue.get(input);
        input.value = display(base + (match[1] === "-" ? -1 : 1) * Number(match[2].replace(",",".")));
        dispatch(input);
      }
      if(input.id === "cr_pb_atual"){
        const max = number(el("cr_pb_max")?.value);
        const value = number(input.value);
        if(max !== null && value !== null && value > max){ input.value = display(max); dispatch(input); }
      }
      if(input.dataset.crSkillAtual){
        const max = number(el(input.dataset.crSkillAtual)?.value);
        const value = number(input.value);
        if(max !== null && value !== null && value > max){ input.value = display(max); dispatch(input); }
      }
      focusValue.set(input, number(input.value) || 0);
    });
    screen.addEventListener("input", e => {
      if(e.isTrusted && Object.prototype.hasOwnProperty.call(COMBAT, e.target.id)){
        if(e.target.value === "") manualCombat.delete(e.target.id);
        else manualCombat.add(e.target.id);
      }
      refresh();
    });
    refresh();
    setInterval(refresh, 400); // cobre criação, importação e abertura sem reescrever o fluxo de armazenamento
  }
  window.CRISCreatureAuto = { tierDie, fiftyIndex, formula, refresh };
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
