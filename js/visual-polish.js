(function(){
  "use strict";

  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const previousValues = new WeakMap();
  const dimensionKeys = ["infernal","arkanjerial","terrena","carnical","sombria","perdicao","limbica"];

  function replayClass(el,className,duration){
    if(!el || reducedMotion) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    window.setTimeout(function(){ el.classList.remove(className); },duration);
  }

  function setupDocumentTransitions(){
    document.addEventListener("click",function(event){
      const button = event.target.closest(".tab-btn, .subtab-btn, .camp-subtab-btn");
      if(!button) return;

      window.requestAnimationFrame(function(){
        let panel = null;
        if(button.classList.contains("tab-btn")) panel = document.querySelector(".tab-panel.active");
        else if(button.classList.contains("subtab-btn")) panel = document.querySelector(".subtab-panel.active");
        else panel = document.querySelector(".camp-subtab-panel.active, .camp-subtab-content.active");
        replayClass(panel,"oc-document-reveal",520);
      });
    });
  }

  function setupValueFeedback(){
    document.addEventListener("focusin",function(event){
      if(!event.target.matches("input, textarea, select")) return;
      previousValues.set(event.target,event.target.value);
    });

    document.addEventListener("input",function(event){
      const field = event.target;
      if(!field.matches("input, textarea, select") || field.type === "file") return;

      /* HP e SAN possuem linguagem critica propria em vital-states.
         Nao exibem flash a cada aumento/reducao: somente <= 0 ativa
         o efeito periodico original. */
      if(field.id === "hp" || field.id === "san_atual"){
        previousValues.set(field,field.value);
        return;
      }

      const before = previousValues.get(field);
      const after = field.value;
      let className = "oc-value-change";

      if(field.matches('input[type="number"]') && before !== undefined && before !== "" && after !== ""){
        const oldNumber = Number(before);
        const newNumber = Number(after);
        if(Number.isFinite(oldNumber) && Number.isFinite(newNumber)){
          if(newNumber > oldNumber) className = "oc-value-up";
          if(newNumber < oldNumber) className = "oc-value-down";
        }
      }

      previousValues.set(field,after);
      replayClass(field,className,450);
    });
  }

  function dimensionFromElement(el){
    if(!el) return null;
    if(el.dataset && dimensionKeys.indexOf(el.dataset.dim) !== -1) return el.dataset.dim;
    for(let node = el; node && node !== document.body; node = node.parentElement){
      for(const key of dimensionKeys){
        if(node.classList && (node.classList.contains("cx-" + key) || node.classList.contains("cpd-dim-" + key))) return key;
      }
      if(node.dataset && dimensionKeys.indexOf(node.dataset.dim) !== -1) return node.dataset.dim;
    }
    return null;
  }

  function setupDimensionBursts(){
    let layer = document.getElementById("oc_dimension_burst");
    if(!layer){
      layer = document.createElement("div");
      layer.id = "oc_dimension_burst";
      layer.setAttribute("aria-hidden","true");
      document.body.appendChild(layer);
    }

    let clearTimer = null;
    document.addEventListener("click",function(event){
      const trigger = event.target.closest(".cx-card, .cpd-card, .cpd-filter-btn, .dim-picker-add-btn, [data-dim]");
      /* Conexoes possui modal e renderizacao proprios. O burst global
         ficava concorrendo com essa abertura e podia bloquear a pagina. */
      if(trigger && trigger.closest("#sub-comp-conexoes")) return;
      const dimension = dimensionFromElement(trigger);
      if(!dimension || reducedMotion) return;

      if(clearTimer) window.clearTimeout(clearTimer);
      layer.className = "";
      void layer.offsetWidth;
      layer.className = "oc-dim-burst oc-dim-" + dimension;
      clearTimer = window.setTimeout(function(){
        layer.className = "";
        clearTimer = null;
      },950);
    });
  }

  function setupSaveIndicator(){
    const indicator = document.getElementById("save_indicator");
    if(!indicator) return;

    function syncState(){
      const text = (indicator.textContent || "").toLowerCase();
      if(indicator.classList.contains("err") || /erro|falha|nao foi|não foi/.test(text)){
        indicator.dataset.ocState = "error";
      }else if(/salvando|sincronizando|arquivando/.test(text)){
        indicator.dataset.ocState = "saving";
      }else{
        indicator.dataset.ocState = "success";
      }
    }

    syncState();
    new MutationObserver(syncState).observe(indicator,{attributes:true,attributeFilter:["class"],childList:true,subtree:true,characterData:true});
  }

  function numberFromField(field){
    if(!field) return NaN;
    const match = String(field.value || "").replace(",",".").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : NaN;
  }

  function setupVitalBars(){
    const pairs = [
      {current:"hp", maximum:"hp_max", host:"hp_combat_box", kind:"hp"},
      {current:"san_atual", maximum:"san_max", host:"san_combat_box", kind:"san"},
      {current:"fadiga_atual", maximum:"fadiga_max", kind:"fadiga"}
    ];

    pairs.forEach(function(pair){
      const current = document.getElementById(pair.current);
      const maximum = document.getElementById(pair.maximum);
      let host = pair.host ? document.getElementById(pair.host) : (current && current.closest(".san-box"));
      if(!current || !maximum || !host) return;

      host.classList.add("oc-vital-host");
      host.dataset.ocVital = pair.kind;
      const track = document.createElement("span");
      track.className = "oc-vital-track";
      track.setAttribute("aria-hidden","true");
      const fill = document.createElement("span");
      fill.className = "oc-vital-fill";
      track.appendChild(fill);
      host.appendChild(track);

      function update(){
        const now = numberFromField(current);
        const max = numberFromField(maximum);
        const ratio = Number.isFinite(now) && Number.isFinite(max) && max > 0 ? Math.max(0,Math.min(1,now / max)) : 0;
        host.style.setProperty("--oc-vital-ratio",String(ratio));
        host.classList.toggle("oc-vital-low",Number.isFinite(now) && Number.isFinite(max) && max > 0 && now / max <= .25);
      }
      current.addEventListener("input",update);
      current.addEventListener("change",update);
      maximum.addEventListener("input",update);
      maximum.addEventListener("change",update);
      update();
    });
  }

  function setupDiceImpact(){
    const panel = document.getElementById("dice_tray_panel");
    if(!panel) return;
    document.addEventListener("click",function(event){
      if(!(event.target instanceof Element)) return;
      const trigger = event.target.closest("#dtq_roll_btn,.drc-btn-roll,[data-dice-roll],.dice-roll-btn");
      if(!trigger || !panel.contains(trigger)) return;
      window.requestAnimationFrame(function(){ replayClass(panel,"oc-dice-impact",620); });
    });
    const quickInput = document.getElementById("dtq_expr");
    if(quickInput) quickInput.addEventListener("keydown",function(event){
      if(event.key === "Enter") window.requestAnimationFrame(function(){ replayClass(panel,"oc-dice-impact",620); });
    });
  }

  function setupPerformanceMode(){
    const memory = Number(navigator.deviceMemory || 0);
    const cores = Number(navigator.hardwareConcurrency || 0);
    if(reducedMotion || (memory > 0 && memory <= 4) || (cores > 0 && cores <= 4)){
      document.documentElement.classList.add("oc-performance");
    }
  }

  function setupProfessionalSemantics(){
    const indicator = document.getElementById("save_indicator");
    if(indicator){
      indicator.setAttribute("role","status");
      indicator.setAttribute("aria-live","polite");
      indicator.setAttribute("aria-atomic","true");
    }

    document.querySelectorAll(".modal-overlay").forEach(function(overlay,index){
      const box = overlay.querySelector(".modal-box");
      if(!box) return;
      box.setAttribute("role","dialog");
      box.setAttribute("aria-modal","true");
      const heading = box.querySelector("h1,h2,h3");
      if(heading){
        if(!heading.id) heading.id = "oc_dialog_title_" + index;
        box.setAttribute("aria-labelledby",heading.id);
      }
    });

    document.querySelectorAll('.empty-state[id$="_carregando"],.pdfimp-loading').forEach(function(el){
      el.setAttribute("role","status");
      el.setAttribute("aria-live","polite");
    });
  }

  function setupSearchClearButtons(){
    ["comp_search","cx_search","cpd_search","crr_search"].forEach(function(id){
      const input = document.getElementById(id);
      if(!input || input.parentElement.querySelector(".oc-search-clear")) return;
      const host = input.parentElement;
      host.classList.add("oc-has-search-clear");
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "oc-search-clear";
      clear.textContent = "×";
      clear.setAttribute("aria-label","Limpar pesquisa");
      clear.title = "Limpar pesquisa";
      clear.addEventListener("click",function(){
        if(!input.value) return input.focus();
        input.value = "";
        input.dispatchEvent(new Event("input",{bubbles:true}));
        input.focus();
      });
      host.appendChild(clear);
    });
  }

  function init(){
    setupDocumentTransitions();
    setupValueFeedback();
    setupSaveIndicator();
    setupDimensionBursts();
    setupVitalBars();
    setupDiceImpact();
    setupPerformanceMode();
    setupProfessionalSemantics();
    setupSearchClearButtons();
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
