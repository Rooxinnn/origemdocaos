/* Ajustes +N/-N: confirma antes dos cálculos existentes e nunca usa eval. */
(function(){
  'use strict';
  const states=new WeakMap();
  const resources=new Set(['hp','hp_max','san_atual','san_max','fadiga_atual','fadiga_max','dinheiro','protecao','corrupcao','infeccao','exp','idade','pontos_acumulados','nivel_mov','inv_qtd','inv_peso','eqcustom_f_qtd','eqcustom_f_peso','cr_hp','cr_san','cr_pb','cr_protecao','cr_hp_atual','cr_hp_max','cr_san_atual','cr_san_max','cr_pb_atual','cr_pb_max','cr_protecao_atual','cr_protecao_max','cr_pontos','cr_peso_total']);
  const scope='#tab-agentes,#tab-inventario,#tab-paranormal,#creature_sheet_screen,#eqcustom_form_modal';
  function isTargetField(el){
    if(!el||el.tagName!=='INPUT'||el.readOnly||el.disabled||el.type==='hidden')return false;
    if(el.matches('[data-skill-atual],[data-skill],[data-cr-skill-atual],[data-cr-skill]'))return true;
    if(resources.has(el.id))return true;
    return !!el.closest(scope)&&(el.type==='number'||el.dataset.qvaNumber==='1'||el.inputMode==='decimal'||el.inputMode==='numeric');
  }
  function number(s){
    s=String(s).trim().replace(/\s/g,'');
    const k=/k$/i.test(s);if(k)s=s.slice(0,-1);
    if(s.includes(',')){s=s.replace(/\./g,'').replace(',','.');}
    else if(/^[1-9]\d{0,2}(?:\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
    if(!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(s))return null;
    const n=Number(s)*(k?1000:1);return Number.isFinite(n)?n:null;
  }
  function parts(raw){
    raw=String(raw??'');if(!raw.trim())return {value:0,suffix:''};
    const m=raw.match(/^\s*([+-]?[\d.,]+\s*k?)(\s*\/\s*[^\n]+|\s+\([^\n]*\))?\s*$/i);
    if(!m)return null;const n=number(m[1]);return n===null?null:{value:n,suffix:m[2]||''};
  }
  function calculate(base,expression){
    const m=String(expression).trim().match(/^([+-])\s*([\d.,]+\s*k?)$/i);
    if(!m)return null;const p=parts(base),amount=number(m[2]);if(!p||amount===null)return null;
    const value=Math.round((p.value+(m[1]==='-'?-amount:amount))*1e6)/1e6;
    return Number.isFinite(value)?String(value)+p.suffix:null;
  }
  function prepare(el){
    if(el.type==='number'){el.dataset.qvaNumber='1';el.type='text';el.inputMode='decimal';}
    states.set(el,{base:el.value,pending:false,emitting:false});
  }
  function signed(el){return /^[+-]/.test(el.value.trim());}
  function emit(el,type){el.dispatchEvent(new Event(type,{bubbles:true}));}
  function confirm(el,sendChange){
    const state=states.get(el);if(!state||!state.pending)return false;
    const result=calculate(state.base,el.value);state.pending=false;state.emitting=true;
    el.value=result===null?state.base:result;
    if(result===null&&typeof flashIndicator==='function')flashIndicator('Ajuste inválido. Use +100 ou -100 em um valor numérico.',true,2800);
    emit(el,'input');if(sendChange)emit(el,'change');
    state.base=el.value;state.emitting=false;return true;
  }
  document.addEventListener('focusin',e=>{if(isTargetField(e.target))prepare(e.target);},true);
  document.addEventListener('input',e=>{
    const el=e.target;if(!isTargetField(el))return;const state=states.get(el);if(!state||state.emitting)return;
    state.pending=signed(el);
    if(state.pending){e.stopImmediatePropagation();return;}
    // Digitação comum segue pelas regras de jogo já existentes.
  },true);
  document.addEventListener('change',e=>{
    const el=e.target;if(!isTargetField(el))return;const state=states.get(el);if(!state||state.emitting)return;
    if(state.pending)confirm(el,false);state.base=el.value;
  },true);
  document.addEventListener('focusout',e=>{
    const el=e.target;if(!isTargetField(el))return;confirm(el,true);
    const state=states.get(el);if(state)state.base=el.value;
  },true);
  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter'||!isTargetField(e.target))return;
    if(confirm(e.target,true))e.preventDefault();
  },true);
  window.QuickValueAdjustments={isTargetField,calculate,
    hasPending:()=>!!states.get(document.activeElement)?.pending,
    commitPending:()=>{const el=document.activeElement;if(el)confirm(el,true);}
  };
})();
