/* Lista pública separada da tabela privada de fichas. */
(function(){
  'use strict';
  const TABLE='creature_compendium';
  const pendingKey='criaturas:catalog:pending';
  const publishKey='criaturas:catalog:pending_publish';
  const client=()=>window.CRISAuth?.client || null;
  async function user(){
    try{ return (await client()?.auth.getSession())?.data?.session?.user || null; }
    catch(e){ return null; }
  }
  async function pending(key=pendingKey){
    try{ const arr=JSON.parse(await window.storageGet(key)||'[]');return Array.isArray(arr)?arr:[]; }
    catch(e){return [];}
  }
  async function addPending(key,id){
    const ids=new Set(await pending(key));ids.add(id);
    await window.storageSet(key,JSON.stringify([...ids]),1,true);
  }
  async function clearPending(key,id){
    await window.storageSet(key,JSON.stringify((await pending(key)).filter(entry=>entry!==id)),1,true);
  }
  async function rememberRemove(id){
    await addPending(pendingKey,id);
    await clearPending(publishKey,id);
  }
  async function forgetRemove(id){
    await clearPending(pendingKey,id);
  }
  async function publish(id,data){
    if(!data || data.cr_catalogado!=='1') return {ok:false};
    const item=window.CRISCreatureSheets?.catalogEntryFromSheet?.(id,data);
    if(!item) return {ok:false};
    const owner=await user();
    if(!owner || !client()){await addPending(publishKey,item.id);return {ok:false,offline:true};}
    // Não publica sheetData, campos internos, índices nem rascunhos.
    const safeImage=typeof item.imagem==='string' &&
      (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(item.imagem) || /^https:\/\//i.test(item.imagem))
      ? item.imagem : null;
    const payload={id:item.id,nome:item.nome,dimensao:item.dimensao,tipo:item.tipo,
      imagem:safeImage,descricao:item.descricao,ficha:item.ficha};
    try{
      const {error}=await client().from(TABLE).upsert({id:item.id,owner_id:owner.id,
        payload,updated_at:new Date().toISOString()},{onConflict:'id'});
      if(error) throw error;
      await forgetRemove(item.id);
      await clearPending(publishKey,item.id);
      return {ok:true};
    }catch(error){
      console.error('[Compêndio] Falha ao publicar:',error);
      await addPending(publishKey,item.id);
      return {ok:false,error};
    }
  }
  async function unpublish(id){
    const catalogId=id.startsWith('minha:')?id:'minha:'+id;
    const owner=await user();
    if(!owner || !client()){await rememberRemove(catalogId);return {ok:false,offline:true};}
    try{
      const {error}=await client().from(TABLE).delete().eq('id',catalogId).eq('owner_id',owner.id);
      if(error) throw error;
      await forgetRemove(catalogId);
      return {ok:true};
    }catch(error){
      console.error('[Compêndio] Falha ao despublicar:',error);
      await rememberRemove(catalogId);
      return {ok:false,error};
    }
  }
  async function list(){
    const c=client();if(!c) return {ok:false,items:[]};
    const atStart=await user();
    try{
      const result=[];
      for(let from=0;;from+=500){
        const {data,error}=await c.from(TABLE).select('id,owner_id,payload').order('id').range(from,from+499);
        if(error) throw error;
        result.push(...(data||[]));
        if(!data || data.length<500) break;
      }
      const atEnd=await user();
      if(atStart?.id!==atEnd?.id) return {ok:false,items:[]};
      const removalIds=new Set(await pending());
      const isRecord=v=>v && typeof v==='object' && !Array.isArray(v);
      const validSheet=f=>{
        if(!isRecord(f)) return false;
        for(const key of ['acoes','habilidadesPb','passivas','habilidadesPassivas'])
          if(f[key]!=null && (!Array.isArray(f[key]) || !f[key].every(isRecord))) return false;
        for(const key of ['habilidades','talentos','atributos','pericias'])
          if(f[key]!=null && (!Array.isArray(f[key]) || !f[key].every(Array.isArray))) return false;
        if(f.combate?.valores!=null && (!Array.isArray(f.combate.valores) || !f.combate.valores.every(Array.isArray))) return false;
        if(f.resistencias?.imunidades!=null && !Array.isArray(f.resistencias.imunidades)) return false;
        return true;
      };
      return {ok:true,items:result.filter(row=>!(row.owner_id===atStart?.id && removalIds.has(row.id))).map(row=>{
        const p=row.payload||{};
        const image=typeof p.imagem==='string' &&
          (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(p.imagem) || /^https:\/\//i.test(p.imagem))
          ? p.imagem : null;
        return {id:row.id,nome:String(p.nome||'Criatura sem nome'),dimensao:p.dimensao,
          tipo:p.tipo,imagem:image,descricao:p.descricao,ficha:p.ficha,
          ownerId:row.owner_id};
      }).filter(item=>validSheet(item.ficha) && typeof item.id==='string' && item.id.startsWith('minha:'))};
    }catch(error){console.error('[Compêndio] Falha ao carregar catálogo público:',error);
      return {ok:false,items:[],error};}
  }
  async function reconcile(own,publicItems=[]){
    const owner=await user();if(!owner) return false;
    let changed=false;
    for(const id of await pending()){
      if((await user())?.id!==owner.id) return changed;
      if((await unpublish(id)).ok) changed=true;
    }
    const publishedIds=new Set(publicItems.map(item=>item.id));
    const awaiting=new Set(await pending(publishKey));
    for(const item of own){
      if((await user())?.id!==owner.id) return changed;
      if(item.sheetData?.cr_catalogado==='1' && (!publishedIds.has(item.id) || awaiting.has(item.id)))
        if((await publish(item.sourceSheetId,item.sheetData)).ok) changed=true;
    }
    return changed;
  }
  async function isPending(id,type){
    const key=type==='remove'?pendingKey:publishKey;
    const catalogId=id.startsWith('minha:')?id:'minha:'+id;
    return (await pending(key)).includes(catalogId);
  }
  window.CRISCreatureCatalog={publish,unpublish,list,reconcile,isPending,
    pendingPublishIds:()=>pending(publishKey)};
})();
