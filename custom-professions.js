/* ==========================================================
   PROFISSÕES E SKILLS PERSONALIZADAS
   Biblioteca privada por conta. Profissões podem conceder pontos,
   itens e Skills; a ficha recebe snapshots das Skills concedidas,
   então elas continuam visíveis ao Mestre mesmo fora desta biblioteca.
   ========================================================== */
(function(){
  "use strict";
  var KEY = "conteudo:profissoes_customizadas";
  var TABLE = "custom_connections"; // tabela já protegida por usuário
  var TAG_PROF = "oc:custom_profession:v1";
  var TAG_SKILL = "oc:custom_skill:v1";
  var PREFIX = "[ODC-CUSTOM-V1]";
  var library = { professions: [], skills: [] };
  var idCounter = 0;

  function esc(v){
    if(typeof escapeHtml === "function") return escapeHtml(String(v || ""));
    var d=document.createElement("div"); d.textContent=String(v||""); return d.innerHTML;
  }
  function uid(kind){ idCounter++; return kind + "-" + Date.now().toString(36) + "-" + idCounter + "-" + Math.random().toString(36).slice(2,7); }
  function clean(s){ return String(s || "").trim(); }
  function cleanPoints(rows){
    return (Array.isArray(rows) ? rows : []).map(function(r){ return { nome:clean(r.nome), valor:parseInt(r.valor,10) || 0 }; })
      .filter(function(r){ return r.nome && r.valor; });
  }
  function cleanItems(rows){
    return (Array.isArray(rows) ? rows : []).map(function(r){ return { nome:clean(r.nome), qtd:Math.max(1,parseInt(r.qtd,10)||1), peso:Math.max(0,parseFloat(r.peso)||0), desc:clean(r.desc) }; })
      .filter(function(r){ return r.nome; });
  }
  function cleanSkillRefs(rows){
    return (Array.isArray(rows) ? rows : []).map(function(s){ return { id:clean(s.id), nome:clean(s.nome), descricao:clean(s.descricao), tipo:clean(s.tipo) }; })
      .filter(function(s){ return s.id && s.nome; });
  }
  function normalize(){
    if(!library || typeof library !== "object") library={};
    library.professions = Array.isArray(library.professions) ? library.professions.map(function(p){
      return { id:clean(p.id)||uid("ocp"), nome:clean(p.nome), descricao:clean(p.descricao), pontos:cleanPoints(p.pontos), itens:cleanItems(p.itens), skills:cleanSkillRefs(p.skills), cloudMeta:p.cloudMeta||null };
    }).filter(function(p){ return p.nome; }) : [];
    library.skills = Array.isArray(library.skills) ? library.skills.map(function(s){
      return { id:clean(s.id)||uid("ocs"), nome:clean(s.nome), descricao:clean(s.descricao), tipo:clean(s.tipo)||"Skill Personalizada", cloudMeta:s.cloudMeta||null };
    }).filter(function(s){ return s.nome; }) : [];
  }
  async function save(){ normalize(); return await storageSet(KEY, JSON.stringify(library), 1, true); }
  async function load(){
    try{ library=JSON.parse(await storageGet(KEY) || "{}"); }catch(_){ library={}; }
    normalize(); renderAll();
  }
  function getClient(){ return window.CRISAuth && !window.CRISAuth.configError ? window.CRISAuth.client : null; }
  async function getUser(){
    var c=getClient(); if(!c) return null;
    try{ var r=await c.auth.getSession(); return r.data && r.data.session ? r.data.session.user : null; }catch(_){ return null; }
  }
  function encode(item){ return PREFIX + "\n" + JSON.stringify(item); }
  function decode(row){
    var raw=String(row.description||"");
    if(raw.indexOf(PREFIX + "\n") !== 0) return null;
    try{ var data=JSON.parse(raw.slice(PREFIX.length+1)); data.id=row.id; data.cloudMeta={existsCloud:true,updatedAt:row.updated_at||null}; return data; }catch(_){ return null; }
  }
  function tagFor(kind){ return kind === "profession" ? TAG_PROF : TAG_SKILL; }
  function records(kind){ return kind === "profession" ? library.professions : library.skills; }
  function find(kind,id){ return records(kind).find(function(x){ return x.id===id; }) || null; }
  async function syncItem(kind,item){
    var c=getClient(), user=await getUser(); if(!c || !user || !item) return false;
    var row={id:item.id,user_id:user.id,name:item.nome,description:encode(item),tag:tagFor(kind),type:"custom"};
    try{
      var res;
      if(item.cloudMeta && item.cloudMeta.existsCloud) res=await c.from(TABLE).update(row).eq("id",item.id).eq("user_id",user.id).select("updated_at").single();
      else res=await c.from(TABLE).insert(row).select("updated_at").single();
      if(res.error) throw res.error;
      item.cloudMeta={existsCloud:true,updatedAt:res.data && res.data.updated_at || null}; await save(); return true;
    }catch(e){ console.warn("[ODC Custom] conteúdo salvo localmente; sincronização pendente.",e); return false; }
  }
  async function syncAfterLogin(){
    var c=getClient(),user=await getUser(); if(!c||!user) return;
    try{
      var res=await c.from(TABLE).select("id,name,description,tag,updated_at").eq("user_id",user.id).in("tag",[TAG_PROF,TAG_SKILL]);
      if(res.error) throw res.error;
      var cloudProf=[],cloudSkills=[];
      (res.data||[]).forEach(function(row){ var x=decode(row); if(!x) return; (row.tag===TAG_PROF?cloudProf:cloudSkills).push(x); });
      ["profession","skill"].forEach(function(kind){
        var local=records(kind), cloud=kind==="profession"?cloudProf:cloudSkills, cloudIds={};
        cloud.forEach(function(x){ cloudIds[x.id]=true; });
        local.forEach(function(x){ if(!cloudIds[x.id]) syncItem(kind,x); });
        library[kind==="profession"?"professions":"skills"]=cloud.concat(local.filter(function(x){ return !cloudIds[x.id]; }));
      });
      normalize(); await save(); renderAll();
    }catch(e){ console.warn("[ODC Custom] não foi possível carregar conteúdo personalizado da nuvem.",e); }
  }
  async function deleteItem(kind,id){
    var item=find(kind,id); if(!item) return;
    var c=getClient(),user=await getUser();
    library[kind==="profession"?"professions":"skills"] = records(kind).filter(function(x){ return x.id!==id; });
    await save(); renderAll();
    if(c&&user){ try{ await c.from(TABLE).delete().eq("id",id).eq("user_id",user.id); }catch(_){ } }
  }
  function buildDescription(p){
    var parts=[];
    if(p.descricao) parts.push(p.descricao);
    if(p.pontos.length) parts.push("PONTUAÇÕES GANHAS\n"+p.pontos.map(function(x){ return "• "+x.nome+" "+(x.valor>0?"+":"")+x.valor+"P"; }).join("\n"));
    if(p.itens.length) parts.push("ITENS GANHOS\n"+p.itens.map(function(x){ return "• "+x.qtd+"x "+x.nome+(x.desc?" {"+x.desc+"}":"")+(x.peso?" Peso: "+x.peso:""); }).join("\n"));
    if(p.skills.length) parts.push("SKILLS CONCEDIDAS\n"+p.skills.map(function(x){ return "• "+x.nome; }).join("\n"));
    return parts.join("\n\n");
  }
  function findProfessionByName(name){
    var target=typeof normalizarNomeSkill==="function"?normalizarNomeSkill(name):clean(name).toLowerCase();
    var p=library.professions.find(function(x){ var n=typeof normalizarNomeSkill==="function"?normalizarNomeSkill(x.nome):x.nome.toLowerCase(); return n===target; });
    if(!p) return null;
    return {__customProfession:true,id:p.id,nome:p.nome,desc:buildDescription(p),pontos:cleanPoints(p.pontos),itens:cleanItems(p.itens),skills:cleanSkillRefs(p.skills)};
  }
  function listProfessionNames(){ return library.professions.map(function(p){ return p.nome; }); }

  /* -------------------- ficha -------------------- */
  function field(){
    var el=document.getElementById("agente_profissao_skills");
    if(el) return el;
    var host=document.getElementById("tab-agentes"); if(!host) return null;
    el=document.createElement("input"); el.type="hidden"; el.id="agente_profissao_skills"; el.value="[]"; host.appendChild(el); return el;
  }
  function sheetSkills(){ try{ var v=JSON.parse((field()||{}).value||"[]"); return Array.isArray(v)?v:[]; }catch(_){ return []; } }
  function setSheetSkills(v){ var el=field(); if(el) el.value=JSON.stringify(v); }
  function ensureSheetPanel(){
    if(document.getElementById("custom_profession_skills_panel")) return;
    var textarea=document.getElementById("itens"); if(!textarea) return;
    var parent=textarea.closest(".panel"); if(!parent) return;
    var panel=document.createElement("div"); panel.id="custom_profession_skills_panel"; panel.className="custom-profession-skills";
    panel.innerHTML='<div class="custom-profession-skills-head"><span>Skills da Profissão</span><small id="custom_profession_skills_count"></small></div><div id="custom_profession_skills_list"></div>';
    parent.insertAdjacentElement("afterend",panel);
  }
  function renderAgentSkills(){
    ensureSheetPanel(); var list=document.getElementById("custom_profession_skills_list"),count=document.getElementById("custom_profession_skills_count"); if(!list) return;
    var skills=sheetSkills(); if(count) count.textContent=skills.length?skills.length+" ativa"+(skills.length===1?"":"s"):"";
    if(!skills.length){ list.innerHTML='<span class="custom-profession-skills-empty">Nenhuma skill concedida pela profissão atual.</span>'; return; }
    list.innerHTML=skills.map(function(s,i){ return '<button type="button" class="custom-profession-skill-chip" data-cps-open="'+i+'">'+esc(s.nome)+'</button>'; }).join("");
    list.querySelectorAll("[data-cps-open]").forEach(function(b){ b.addEventListener("click",function(){ openSkillDetail(sheetSkills()[parseInt(b.dataset.cpsOpen,10)]); }); });
  }
  function addGrantedSkills(skills,source){
    var current=sheetSkills(); (skills||[]).forEach(function(s){
      if(!s||!s.id||current.some(function(x){ return x.id===s.id; })) return;
      current.push({id:s.id,nome:s.nome,descricao:s.descricao||"",tipo:s.tipo||"Skill Personalizada",source:source||""});
    }); setSheetSkills(current); renderAgentSkills();
  }
  function removeGrantedSkills(ids){ var set={}; (ids||[]).forEach(function(id){set[id]=true;}); setSheetSkills(sheetSkills().filter(function(s){return !set[s.id];})); renderAgentSkills(); }
  function ensureSkillModal(){
    if(document.getElementById("custom_skill_detail_modal")) return;
    var m=document.createElement("div"); m.id="custom_skill_detail_modal"; m.className="modal-overlay";
    m.innerHTML='<div class="modal-box cpp-detail-box"><button type="button" class="cpp-modal-x" data-cpp-close>×</button><span id="cpp_detail_type"></span><h3 id="cpp_detail_title"></h3><p id="cpp_detail_desc"></p></div>';
    document.body.appendChild(m); m.addEventListener("click",function(e){if(e.target===m||e.target.hasAttribute("data-cpp-close"))m.style.display="none";});
  }
  function openSkillDetail(s){ if(!s) return; ensureSkillModal(); document.getElementById("cpp_detail_type").textContent=s.tipo||"Skill Personalizada"; document.getElementById("cpp_detail_title").textContent=s.nome||"Skill"; document.getElementById("cpp_detail_desc").textContent=s.descricao||"Sem descrição."; document.getElementById("custom_skill_detail_modal").style.display="flex"; }

  /* -------------------- Compêndio -------------------- */
  function ensureCompendium(){
    if(document.getElementById("sub-comp-custom-content")) return;
    var row=document.querySelector("#tab-compendio .subtab-row"),panel=document.querySelector("#tab-compendio .panel"); if(!row||!panel) return;
    var button=document.createElement("button"); button.type="button"; button.className="subtab-btn"; button.textContent="Conteúdo Próprio"; row.appendChild(button);
    var tab=document.createElement("div"); tab.id="sub-comp-custom-content"; tab.className="subtab-panel cpp-panel";
    tab.innerHTML='<div class="cpp-topline"><div><h3>Profissões e Skills Próprias</h3><p>Biblioteca privada da sua conta. Aplique uma profissão na ficha como faria com uma profissão oficial.</p></div></div><div class="cpp-switch"><button type="button" data-cpp-view="professions" class="active">Profissões</button><button type="button" data-cpp-view="skills">Skills</button></div><div id="cpp_actions"></div><div id="cpp_list"></div>';
    panel.appendChild(tab);
    button.addEventListener("click",function(){ document.querySelectorAll(".subtab-btn").forEach(function(x){x.classList.remove("active");});document.querySelectorAll(".subtab-panel").forEach(function(x){x.classList.remove("active");});button.classList.add("active");tab.classList.add("active");renderLibrary(); });
    tab.querySelectorAll("[data-cpp-view]").forEach(function(b){b.addEventListener("click",function(){tab.dataset.view=b.dataset.cppView;tab.querySelectorAll("[data-cpp-view]").forEach(function(x){x.classList.toggle("active",x===b);});renderLibrary();});});
    tab.dataset.view="professions";
  }
  function renderLibrary(){
    ensureCompendium(); var tab=document.getElementById("sub-comp-custom-content"); if(!tab) return; var view=tab.dataset.view||"professions",actions=document.getElementById("cpp_actions"),list=document.getElementById("cpp_list");
    actions.innerHTML='<button type="button" class="cpp-create" id="cpp_create">+ Criar '+(view==="professions"?"Profissão":"Skill")+'</button>';
    document.getElementById("cpp_create").addEventListener("click",function(){openEditor(view);});
    var rows=records(view==="professions"?"profession":"skill");
    if(!rows.length){list.innerHTML='<div class="empty-state">Nenhuma '+(view==="professions"?"profissão":"skill")+' personalizada criada ainda.</div>';return;}
    list.innerHTML=rows.map(function(x){
      var meta=view==="professions" ? x.pontos.length+" bônus · "+x.itens.length+" itens · "+x.skills.length+" skills" : (x.tipo||"Skill Personalizada");
      return '<article class="cpp-card"><div class="cpp-card-main" data-cpp-detail="'+esc(x.id)+'"><h4>'+esc(x.nome)+'</h4><span>'+esc(meta)+'</span><p>'+esc(view==="professions"?(x.descricao||"Sem descrição."):(x.descricao||"Sem descrição."))+'</p></div><div class="cpp-card-actions"><button type="button" data-cpp-edit="'+esc(x.id)+'">Editar</button><button type="button" data-cpp-del="'+esc(x.id)+'">Excluir</button></div></article>';
    }).join("");
    list.querySelectorAll("[data-cpp-detail]").forEach(function(b){b.addEventListener("click",function(){var x=find(view==="professions"?"profession":"skill",b.dataset.cppDetail);if(view==="skills")openSkillDetail(x);else openProfessionDetail(x);});});
    list.querySelectorAll("[data-cpp-edit]").forEach(function(b){b.addEventListener("click",function(){openEditor(view,find(view==="professions"?"profession":"skill",b.dataset.cppEdit));});});
    list.querySelectorAll("[data-cpp-del]").forEach(function(b){b.addEventListener("click",async function(){var x=find(view==="professions"?"profession":"skill",b.dataset.cppDel);if(!x||!confirm('Excluir "'+x.nome+'"? Fichas que já receberam esta profissão continuarão preservadas.'))return;await deleteItem(view==="professions"?"profession":"skill",x.id);});});
  }
  function openProfessionDetail(p){ if(!p) return; ensureSkillModal(); document.getElementById("cpp_detail_type").textContent="Profissão Personalizada";document.getElementById("cpp_detail_title").textContent=p.nome;document.getElementById("cpp_detail_desc").textContent=buildDescription(p)||"Sem benefícios cadastrados.";document.getElementById("custom_skill_detail_modal").style.display="flex"; }
  function skillOptions(selected){ selected=selected||[]; var set={};selected.forEach(function(s){set[s.id]=true;}); if(!library.skills.length)return '<p class="cpp-empty-inline">Crie uma Skill primeiro para vinculá-la à profissão.</p>';return library.skills.map(function(s){return '<label class="cpp-check"><input type="checkbox" value="'+esc(s.id)+'" '+(set[s.id]?"checked":"")+'><span><b>'+esc(s.nome)+'</b><small>'+esc(s.tipo)+'</small></span></label>';}).join(""); }
  function pointRow(v){v=v||{}; var known=(typeof SKILLS_NORMAIS !== "undefined" ? SKILLS_NORMAIS : []); var opts=known.map(function(s){return '<option value="'+esc(s[1])+'" '+(v.nome===s[1]?"selected":"")+'>'+esc(s[1])+'</option>';}).join("");return '<div class="cpp-point-row"><select data-cpp-point-name><option value="">Conhecimento…</option>'+opts+'</select><input data-cpp-point-value type="number" min="-99" max="99" value="'+esc(v.valor||"")+'" placeholder="+2"><button type="button" data-cpp-remove>×</button></div>';}
  function itemRow(v){v=v||{};return '<div class="cpp-item-row"><input data-cpp-item-name value="'+esc(v.nome)+'" placeholder="Nome do item"><input data-cpp-item-qtd type="number" min="1" value="'+esc(v.qtd||1)+'" title="Quantidade"><input data-cpp-item-peso type="number" min="0" step="0.1" value="'+esc(v.peso||0)+'" title="Peso em kg"><input data-cpp-item-desc value="'+esc(v.desc)+'" placeholder="Descrição/opcional"><button type="button" data-cpp-remove>×</button></div>';}
  function bindRemove(root){root.querySelectorAll("[data-cpp-remove]").forEach(function(b){b.addEventListener("click",function(){b.closest(".cpp-point-row,.cpp-item-row").remove();});});}
  function ensureEditor(){
    if(document.getElementById("cpp_editor_modal"))return;
    var m=document.createElement("div");m.id="cpp_editor_modal";m.className="modal-overlay";m.innerHTML='<div class="modal-box cpp-editor-box"><button type="button" class="cpp-modal-x" data-cpp-close>×</button><div id="cpp_editor_body"></div></div>';document.body.appendChild(m);m.addEventListener("click",function(e){if(e.target===m||e.target.hasAttribute("data-cpp-close"))m.style.display="none";});
  }
  function openEditor(view,existing){
    ensureEditor();var body=document.getElementById("cpp_editor_body"),isProf=view==="professions"||view==="profession",p=existing||{};
    if(!isProf){body.innerHTML='<h3>'+ (existing?"Editar":"Criar") +' Skill Personalizada</h3><div class="field"><label>Nome</label><input id="cpp_skill_name" value="'+esc(p.nome)+'" maxlength="100"></div><div class="field"><label>Tipo / etiqueta</label><input id="cpp_skill_type" value="'+esc(p.tipo||"Skill Personalizada")+'" maxlength="60"></div><div class="field"><label>Descrição / efeito</label><textarea id="cpp_skill_desc" style="min-height:160px;">'+esc(p.descricao)+'</textarea></div><div class="modal-actions"><button type="button" data-cpp-close>Cancelar</button><button type="button" id="cpp_skill_save">Salvar Skill</button></div>';document.getElementById("cpp_skill_save").addEventListener("click",async function(){var name=clean(document.getElementById("cpp_skill_name").value);if(!name)return alert("Informe o nome da Skill.");var x=existing||{id:uid("ocs")};x.nome=name;x.tipo=clean(document.getElementById("cpp_skill_type").value)||"Skill Personalizada";x.descricao=clean(document.getElementById("cpp_skill_desc").value);if(!existing)library.skills.push(x);await save();document.getElementById("cpp_editor_modal").style.display="none";renderAll();syncItem("skill",x);});}
    else {body.innerHTML='<h3>'+ (existing?"Editar":"Criar") +' Profissão Personalizada</h3><div class="field"><label>Nome da profissão</label><input id="cpp_prof_name" value="'+esc(p.nome)+'" maxlength="100"></div><div class="field"><label>Descrição curta</label><textarea id="cpp_prof_desc" style="min-height:84px;">'+esc(p.descricao)+'</textarea></div><div class="cpp-editor-section"><h4>Pontos concedidos</h4><p>Escolha o conhecimento e use valores positivos ou negativos.</p><div id="cpp_points">'+(p.pontos||[]).map(pointRow).join("")+'</div><button type="button" id="cpp_add_point">+ Adicionar pontuação</button></div><div class="cpp-editor-section"><h4>Itens concedidos</h4><p>Estes itens entram no Inventário ao aplicar a profissão.</p><div id="cpp_items">'+(p.itens||[]).map(itemRow).join("")+'</div><button type="button" id="cpp_add_item">+ Adicionar item</button></div><div class="cpp-editor-section"><h4>Skills concedidas</h4><div id="cpp_skill_choices" class="cpp-skill-choices">'+skillOptions(p.skills)+'</div></div><div class="modal-actions"><button type="button" data-cpp-close>Cancelar</button><button type="button" id="cpp_prof_save">Salvar Profissão</button></div>';bindRemove(body);document.getElementById("cpp_add_point").addEventListener("click",function(){document.getElementById("cpp_points").insertAdjacentHTML("beforeend",pointRow());bindRemove(body);});document.getElementById("cpp_add_item").addEventListener("click",function(){document.getElementById("cpp_items").insertAdjacentHTML("beforeend",itemRow());bindRemove(body);});document.getElementById("cpp_prof_save").addEventListener("click",async function(){var name=clean(document.getElementById("cpp_prof_name").value);if(!name)return alert("Informe o nome da profissão.");var norm=typeof normalizarNomeSkill==="function"?normalizarNomeSkill(name):name.toLowerCase();var official=typeof COMP_PROFISSOES!=="undefined"&&COMP_PROFISSOES.some(function(q){return (typeof normalizarNomeSkill==="function"?normalizarNomeSkill(q.nome):q.nome.toLowerCase())===norm;});var duplicate=library.professions.some(function(q){return q!==existing&&(typeof normalizarNomeSkill==="function"?normalizarNomeSkill(q.nome):q.nome.toLowerCase())===norm;});if(official||duplicate)return alert("Use um nome diferente de uma profissão já existente.");var x=existing||{id:uid("ocp")};x.nome=name;x.descricao=clean(document.getElementById("cpp_prof_desc").value);x.pontos=[];body.querySelectorAll(".cpp-point-row").forEach(function(r){x.pontos.push({nome:r.querySelector("[data-cpp-point-name]").value,valor:r.querySelector("[data-cpp-point-value]").value});});x.itens=[];body.querySelectorAll(".cpp-item-row").forEach(function(r){x.itens.push({nome:r.querySelector("[data-cpp-item-name]").value,qtd:r.querySelector("[data-cpp-item-qtd]").value,peso:r.querySelector("[data-cpp-item-peso]").value,desc:r.querySelector("[data-cpp-item-desc]").value});});x.skills=[];body.querySelectorAll("#cpp_skill_choices input:checked").forEach(function(cb){var s=find("skill",cb.value);if(s)x.skills.push({id:s.id,nome:s.nome,descricao:s.descricao,tipo:s.tipo});});x.pontos=cleanPoints(x.pontos);x.itens=cleanItems(x.itens);x.skills=cleanSkillRefs(x.skills);if(!existing)library.professions.push(x);await save();document.getElementById("cpp_editor_modal").style.display="none";renderAll();syncItem("profession",x);});}
    document.getElementById("cpp_editor_modal").style.display="flex";
  }
  function renderAll(){ ensureCompendium(); renderLibrary(); renderAgentSkills(); }
  function resetOnLogout(){ library={professions:[],skills:[]}; renderAll(); }
  function wrapSheet(){
    ["openSheet","loadAgent","createNewSheet"].forEach(function(name){var old=window[name];if(typeof old!=="function"||old.__cppWrapped)return;var wrapped=function(){var r=old.apply(this,arguments);Promise.resolve(r).finally(function(){setTimeout(renderAgentSkills,0);});return r;};wrapped.__cppWrapped=true;window[name]=wrapped;});
  }
  function init(){ field(); ensureSheetPanel(); load(); wrapSheet(); }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
  window.CustomProfessions={reloadLibrary:load,listProfessionNames:listProfessionNames,findProfessionByName:findProfessionByName,addGrantedSkills:addGrantedSkills,removeGrantedSkills:removeGrantedSkills,refresh:renderAll};
  window.CRISCustomProfessionsSync={syncAfterLogin:syncAfterLogin,resetOnLogout:resetOnLogout};
})();
