/* ==========================================================
   EQUIPAMENTOS PERSONALIZADOS
   Módulo isolado e conservador, somado sobre a arquitetura já
   existente. NÃO cria um segundo Inventário, NÃO cria uma nova
   chave de armazenamento, NÃO cria uma nova Sync Queue e NÃO
   altera EQUIPAMENTOS_DATA / equipamentos oficiais.

   Um equipamento personalizado é um ITEM REAL do MESMO invItems já
   usado pelo Inventário (ver index.html: invItems / renderInventory()
   / saveInventory() / loadInventory() / inventoryStorageKey()) — a
   única diferença para um item manual "simples" (já existente, via
   #inv_nome/#inv_qtd/#inv_peso/#inv_desc/#btn_inv_add) é ter mais
   alguns campos opcionais e a marca:

     { custom: true, nome, categoria, qtd, peso, dano, alcance,
       desc, propriedades, obs }

   "desc" é o MESMO nome de campo já usado pelos itens manuais
   existentes (nenhum campo novo é inventado para a descrição — só
   os campos que realmente não existiam ainda: categoria, dano,
   alcance, propriedades, obs). Itens sem "custom" (equipamentos do
   Compêndio via eqRef, ou itens manuais simples já existentes)
   continuam funcionando exatamente como antes — nada aqui os toca.

   FLUXO:
     CRIAR EQUIPAMENTO PERSONALIZADO → formulário → confirmação/
     detalhes → "Adicionar ao Inventário" → invItems.push(...) →
     renderInventory() + saveInventory() (MESMAS funções já
     existentes) → Sync/Cloud existente (nenhuma alteração precisou
     ser feita: o Inventário já é tratado como array opaco por
     saveAgent()/exportAgentJSON()/importAgentJSONFile()/
     supabase-sync.js/sync-queue.js — ver auditoria no relatório).

   INTEGRAÇÃO COM O INVENTÁRIO (leitura/exibição):
   renderInventory() (index.html) já desenha um card genérico para
   qualquer item sem "eqRef" usando nome/qtd/peso/desc — isso já
   funciona para equipamentos personalizados sem qualquer alteração
   em index.html. O que falta (abrir os campos extras — categoria,
   dano, alcance, propriedades, observações — e permitir editar) é
   resolvido aqui do mesmo jeito que js/equipamentos-agente.js já
   resolve para os equipamentos do Compêndio (eqRef): envolvendo
   renderInventory() (mesmo padrão de "wrap" já usado por aquele
   arquivo e por character-connections.js) para, depois do render
   original, marcar o título dos itens personalizados como clicável
   (mesma classe ".eqinv-title" já usada e estilizada pelos
   equipamentos do Compêndio) e abrir um modal de detalhes próprio.

   Nenhuma linha de index.html precisou ser tocada além de UMA tag
   <script> para carregar este arquivo (ver relatório).

   Namespace: window.EquipamentosCustom
   ========================================================== */
(function () {
  "use strict";

  var editingIdx = null;      // null = criando um item novo; número = editando invItems[idx]
  var pendingDraft = null;    // dados do formulário aguardando confirmação (fluxo de criação)
  var isSubmitting = false;   // trava contra duplo-clique/duplo-submit

  function esc(s){
    if (typeof escapeHtml === "function") return escapeHtml(s);
    var d = document.createElement("div");
    d.textContent = (s === undefined || s === null) ? "" : String(s);
    return d.innerHTML;
  }

  // Mesmo guard já usado por saveInventory()/addEquipmentToSheet() em
  // index.html e js/equipamentos-agente.js: enquanto o Mestre está só
  // visualizando a ficha de um terceiro, nenhum caminho deste módulo
  // pode mutar invItems.
  function isReadOnlyThirdPartyView(){
    return !!(window.CRISCampaignAgentView &&
      typeof window.CRISCampaignAgentView.isActive === "function" &&
      window.CRISCampaignAgentView.isActive());
  }

  function blockReadOnly(){
    if (typeof flashIndicator === "function"){
      flashIndicator("✕ Edição de Inventário de outro personagem ainda não é permitida — isto é só visualização.", true, 3400);
    }
  }

  // Mesmo guard já usado por openPickerModal() em js/equipamentos-agente.js.
  function currentAgentIdReady(){
    if (typeof currentAgentId !== "undefined" && currentAgentId) return true;
    alert("Abra ou crie uma ficha antes de adicionar itens ao Inventário.");
    return false;
  }

  /* ==========================================================
     BOTÃO "CRIAR EQUIPAMENTO PERSONALIZADO"
     Somado ao lado do botão "+ Adicionar Item" já existente
     (#eqinv_add_btn, dentro de #tab-inventario), sem removê-lo nem
     alterá-lo — inserido via JS (insertAdjacentElement), o mesmo
     mecanismo já usado por js/equipamentos-agente.js para somar a
     seção "Itens do Inventário" logo após a textarea "itens", sem
     precisar tocar index.html.
     ========================================================== */

  function ensureCreateButton(){
    if (document.getElementById("eqcustom_create_btn")) return;
    var refBtn = document.getElementById("eqinv_add_btn");
    if (!refBtn) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "eqcustom_create_btn";
    btn.textContent = "Criar Equipamento Personalizado";
    btn.addEventListener("click", openCreateFlow);
    refBtn.insertAdjacentElement("afterend", btn);
  }

  function openCreateFlow(){
    if (!currentAgentIdReady()) return;
    if (isReadOnlyThirdPartyView()){ blockReadOnly(); return; }
    editingIdx = null;
    pendingDraft = null;
    openFormModal(null);
  }

  /* ==========================================================
     FORMULÁRIO (criar/editar)
     Reaproveita a MESMA estrutura genérica de modal/campo já usada
     por todo o projeto (".modal-overlay"/".modal-box"/".cx-modal-box"/
     ".field"/".modal-actions") — nenhum sistema de popup novo, nenhum
     CSS novo precisou ser criado.
     Campos opcionais (categoria, dano, alcance, descrição,
     propriedades, observações) nunca são obrigatórios — só "Nome".
     ========================================================== */

  function ensureFormModal(){
    if (document.getElementById("eqcustom_form_modal")) return;
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "eqcustom_form_modal";
    overlay.innerHTML =
      '<div class="modal-box cx-modal-box eqcustom-form-box" id="eqcustom_form_box" style="text-align:left;">' +
        '<h3 id="eqcustom_form_title">Criar Equipamento Personalizado</h3>' +
        '<div class="cx-modal-body">' +
        '<div class="cx-modal-section">' +
          '<div class="field" style="margin-bottom:12px;"><label>Nome *</label><input type="text" id="eqcustom_f_nome" maxlength="80"></div>' +
          '<div class="field" style="margin-bottom:12px;"><label>Categoria</label><input type="text" id="eqcustom_f_categoria" maxlength="40" placeholder="Ex.: Arma, Proteção, Item…"></div>' +
          '<div style="display:flex; gap:14px; flex-wrap:wrap;">' +
            '<div class="field" style="flex:0 1 110px; margin-bottom:12px;"><label>Quantidade</label><input type="number" id="eqcustom_f_qtd" value="1" min="1" step="1"></div>' +
            '<div class="field" style="flex:0 1 130px; margin-bottom:12px;"><label>Peso (kg)</label><input type="number" id="eqcustom_f_peso" step="0.1" min="0"></div>' +
          '</div>' +
        '</div>' +
        '<div class="cx-modal-section">' +
          '<h5>Informações opcionais</h5>' +
          '<div style="display:flex; gap:14px; flex-wrap:wrap;">' +
            '<div class="field" style="flex:1 1 160px; margin-bottom:12px;"><label>Dano</label><input type="text" id="eqcustom_f_dano" maxlength="40" placeholder="Ex.: 2d10"></div>' +
            '<div class="field" style="flex:1 1 160px; margin-bottom:12px;"><label>Alcance</label><input type="text" id="eqcustom_f_alcance" maxlength="40" placeholder="Ex.: Corpo a corpo"></div>' +
          '</div>' +
          '<div class="field" style="display:block; margin-bottom:12px;"><label style="display:block; margin-bottom:4px;">Descrição</label><textarea id="eqcustom_f_desc" style="min-height:70px;"></textarea></div>' +
          '<div class="field" style="display:block; margin-bottom:12px;"><label style="display:block; margin-bottom:4px;">Propriedades / Efeitos</label><textarea id="eqcustom_f_propriedades" style="min-height:70px;"></textarea></div>' +
          '<div class="field" style="display:block; margin-bottom:0;"><label style="display:block; margin-bottom:4px;">Observações</label><textarea id="eqcustom_f_obs" style="min-height:60px;"></textarea></div>' +
        '</div>' +
        '</div>' +
        '<div class="modal-actions" style="margin-top:14px; justify-content:flex-end; flex:0 0 auto;">' +
          '<button type="button" id="eqcustom_form_cancel">Cancelar</button>' +
          '<button type="button" id="eqcustom_form_next">Avançar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    document.getElementById("eqcustom_form_cancel").addEventListener("click", onFormCancel);
    overlay.addEventListener("click", function(e){
      if (e.target.id === "eqcustom_form_modal") onFormCancel();
    });
    document.getElementById("eqcustom_form_next").addEventListener("click", onFormNext);
  }

  // item: null (criação em branco) ou o item já existente (edição) —
  // neste segundo caso os campos vêm pré-preenchidos com os dados
  // que o próprio item já tem.
  function openFormModal(item){
    ensureFormModal();
    document.getElementById("eqcustom_form_title").textContent =
      editingIdx === null ? "Criar Equipamento Personalizado" : "Editar Equipamento Personalizado";
    document.getElementById("eqcustom_f_nome").value = (item && item.nome) || "";
    document.getElementById("eqcustom_f_categoria").value = (item && item.categoria) || "";
    var qtd = item ? parseInt(item.qtd, 10) : 1;
    if (isNaN(qtd) || qtd < 1) qtd = 1;
    document.getElementById("eqcustom_f_qtd").value = qtd;
    document.getElementById("eqcustom_f_peso").value = (item && item.peso != null) ? item.peso : "";
    document.getElementById("eqcustom_f_dano").value = (item && item.dano) || "";
    document.getElementById("eqcustom_f_alcance").value = (item && item.alcance) || "";
    document.getElementById("eqcustom_f_desc").value = (item && item.desc) || "";
    document.getElementById("eqcustom_f_propriedades").value = (item && item.propriedades) || "";
    document.getElementById("eqcustom_f_obs").value = (item && item.obs) || "";

    // Botão de avançar: "Avançar" (vai para a confirmação) na criação,
    // "Salvar" (aplica direto no item já existente) na edição — o
    // formulário é o mesmo, só o rótulo/comportamento final muda.
    var nextBtn = document.getElementById("eqcustom_form_next");
    nextBtn.textContent = editingIdx === null ? "Avançar" : "Salvar";

    document.getElementById("eqcustom_form_modal").style.display = "flex";
  }

  function closeFormModal(){
    var m = document.getElementById("eqcustom_form_modal");
    if (m) m.style.display = "none";
  }

  // "Cancelar" no formulário: descarta qualquer edição/criação em
  // andamento — nunca deixa "editingIdx"/"pendingDraft" vazando para
  // a próxima vez que o formulário for aberto.
  function onFormCancel(){
    editingIdx = null;
    pendingDraft = null;
    closeFormModal();
  }

  function readDraftFromForm(){
    var nome = document.getElementById("eqcustom_f_nome").value.trim();
    if (!nome){
      alert("Informe um nome para o equipamento.");
      return null;
    }
    var qtd = parseInt(document.getElementById("eqcustom_f_qtd").value, 10);
    if (isNaN(qtd) || qtd < 1) qtd = 1;
    var peso = parseFloat(document.getElementById("eqcustom_f_peso").value);
    if (isNaN(peso) || peso < 0) peso = 0;

    var draft = {
      custom: true,
      nome: nome,
      categoria: document.getElementById("eqcustom_f_categoria").value.trim(),
      qtd: qtd,
      peso: peso,
      dano: document.getElementById("eqcustom_f_dano").value.trim(),
      alcance: document.getElementById("eqcustom_f_alcance").value.trim(),
      desc: document.getElementById("eqcustom_f_desc").value.trim(),
      propriedades: document.getElementById("eqcustom_f_propriedades").value.trim(),
      obs: document.getElementById("eqcustom_f_obs").value.trim()
    };
    return draft;
  }

  function onFormNext(){
    var draft = readDraftFromForm();
    if (!draft) return;

    if (editingIdx === null){
      // Criação: guarda o rascunho e mostra a etapa de confirmação/detalhes
      // ANTES de tocar em invItems — nada é adicionado ao Inventário ainda.
      pendingDraft = draft;
      closeFormModal();
      openConfirmModal(draft);
    } else {
      // Edição: aplica direto no item já existente (mesmo índice em
      // invItems) — nunca cria um item novo a cada edição.
      if (isReadOnlyThirdPartyView()){ blockReadOnly(); return; }
      if (typeof invItems === "undefined" || !invItems[editingIdx]){
        closeFormModal();
        return;
      }
      var target = invItems[editingIdx];
      target.nome = draft.nome;
      target.categoria = draft.categoria;
      target.qtd = draft.qtd;
      target.peso = draft.peso;
      target.dano = draft.dano;
      target.alcance = draft.alcance;
      target.desc = draft.desc;
      target.propriedades = draft.propriedades;
      target.obs = draft.obs;
      target.custom = true;

      closeFormModal();
      editingIdx = null;
      if (typeof renderInventory === "function") renderInventory();
      if (typeof saveInventory === "function") saveInventory();
      if (typeof flashIndicator === "function") flashIndicator("✓ Equipamento atualizado.", false, 1800);
    }
  }

  /* ==========================================================
     CONFIRMAÇÃO / DETALHES (antes de adicionar)
     Mostra o item preenchido antes de gravá-lo no Inventário — só
     "Adicionar ao Inventário" grava de fato; "Editar" volta ao
     formulário sem perder o que já foi digitado; "Cancelar" descarta
     o rascunho sem alterar invItems. Reaproveita a MESMA estrutura
     de modal/detalhe já usada pelo picker do Compêndio
     (js/equipamentos-agente.js#openDetailsModal), inclusive o
     destaque visual de Dano (".eqinv-dano-destaque", já existente em
     css/equipamentos-agente.css) — nenhuma classe nova precisou ser
     criada.
     ========================================================== */

  function ensureConfirmModal(){
    if (document.getElementById("eqcustom_confirm_modal")) return;
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "eqcustom_confirm_modal";
    overlay.innerHTML =
      '<div class="modal-box cx-modal-box eqcustom-confirm-box" id="eqcustom_confirm_box">' +
        '<h3 id="eqcustom_confirm_title"></h3>' +
        '<div class="cx-modal-body">' +
        '<div class="cx-modal-dim" id="eqcustom_confirm_cat"></div>' +
        '<div class="eqinv-dano-destaque" id="eqcustom_confirm_dano_wrap" style="display:none;">' +
          '<div class="eqinv-dano-label">Dano</div>' +
          '<div class="eqinv-dano-valor" id="eqcustom_confirm_dano_valor"></div>' +
        '</div>' +
        '<div class="cx-modal-section" id="eqcustom_confirm_stats"></div>' +
        '<div class="cx-modal-section" id="eqcustom_confirm_desc_wrap" style="display:none;"><h5>Descrição</h5><p id="eqcustom_confirm_desc"></p></div>' +
        '<div class="cx-modal-section" id="eqcustom_confirm_prop_wrap" style="display:none;"><h5>Propriedades</h5><p id="eqcustom_confirm_prop"></p></div>' +
        '<div class="cx-modal-section" id="eqcustom_confirm_obs_wrap" style="display:none;"><h5>Observações</h5><p id="eqcustom_confirm_obs"></p></div>' +
        '</div>' +
        '<div class="modal-actions" style="margin-top:14px; flex-wrap:wrap; flex:0 0 auto;">' +
          '<button type="button" id="eqcustom_confirm_cancel">Cancelar</button>' +
          '<button type="button" id="eqcustom_confirm_edit">Editar</button>' +
          '<button type="button" id="eqcustom_confirm_add">Adicionar ao Inventário</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    document.getElementById("eqcustom_confirm_cancel").addEventListener("click", function(){
      pendingDraft = null;
      closeConfirmModal();
    });
    overlay.addEventListener("click", function(e){
      if (e.target.id === "eqcustom_confirm_modal"){ pendingDraft = null; closeConfirmModal(); }
    });
    document.getElementById("eqcustom_confirm_edit").addEventListener("click", function(){
      closeConfirmModal();
      openFormModal(pendingDraft);
    });
    document.getElementById("eqcustom_confirm_add").addEventListener("click", onConfirmAdd);
  }

  function fillConfirmModal(it){
    document.getElementById("eqcustom_confirm_title").textContent = it.nome;
    document.getElementById("eqcustom_confirm_cat").textContent = it.categoria || "Item personalizado";

    // Dano em destaque visual próprio — só quando preenchido (item 6 do
    // pedido: "equipamentos sem dano simplesmente não devem mostrar uma
    // linha de dano vazia").
    var danoWrap = document.getElementById("eqcustom_confirm_dano_wrap");
    if (it.dano){
      document.getElementById("eqcustom_confirm_dano_valor").textContent = it.dano;
      danoWrap.style.display = "";
    } else {
      danoWrap.style.display = "none";
    }

    var statsHtml = "";
    if (it.alcance) statsHtml += "<p><strong>Alcance:</strong> " + esc(it.alcance) + "</p>";
    statsHtml += "<p><strong>Quantidade:</strong> " + esc(it.qtd) + "</p>";
    statsHtml += "<p><strong>Peso:</strong> " + esc(it.peso) + " kg</p>";
    document.getElementById("eqcustom_confirm_stats").innerHTML = statsHtml;

    var descWrap = document.getElementById("eqcustom_confirm_desc_wrap");
    if (it.desc){
      document.getElementById("eqcustom_confirm_desc").textContent = it.desc;
      descWrap.style.display = "";
    } else { descWrap.style.display = "none"; }

    var propWrap = document.getElementById("eqcustom_confirm_prop_wrap");
    if (it.propriedades){
      document.getElementById("eqcustom_confirm_prop").textContent = it.propriedades;
      propWrap.style.display = "";
    } else { propWrap.style.display = "none"; }

    var obsWrap = document.getElementById("eqcustom_confirm_obs_wrap");
    if (it.obs){
      document.getElementById("eqcustom_confirm_obs").textContent = it.obs;
      obsWrap.style.display = "";
    } else { obsWrap.style.display = "none"; }
  }

  function openConfirmModal(draft){
    ensureConfirmModal();
    fillConfirmModal(draft);
    document.getElementById("eqcustom_confirm_modal").style.display = "flex";
  }

  function closeConfirmModal(){
    var m = document.getElementById("eqcustom_confirm_modal");
    if (m) m.style.display = "none";
  }

  // Único ponto que efetivamente grava o item no Inventário. Trava
  // contra duplo-clique/clique rápido (item 11 do pedido): enquanto
  // isSubmitting é true, novos cliques são ignorados; o botão some
  // assim que o modal fecha, então não há como clicar de novo nele
  // sem reabrir todo o fluxo (o que exigiria confirmar de novo).
  function onConfirmAdd(){
    if (isSubmitting) return;
    if (!pendingDraft) return;
    if (isReadOnlyThirdPartyView()){ blockReadOnly(); return; }
    if (typeof invItems === "undefined") return;

    isSubmitting = true;
    var addBtn = document.getElementById("eqcustom_confirm_add");
    if (addBtn) addBtn.disabled = true;

    invItems.push(pendingDraft);
    pendingDraft = null;

    if (typeof renderInventory === "function") renderInventory();
    if (typeof saveInventory === "function") saveInventory();
    if (typeof flashIndicator === "function") flashIndicator("✓ Equipamento adicionado ao Inventário.", false, 2000);

    closeConfirmModal();
    isSubmitting = false;
    if (addBtn) addBtn.disabled = false;
  }

  /* ==========================================================
     VISUALIZAÇÃO/EDIÇÃO A PARTIR DO INVENTÁRIO (#inv_list)
     Reaproveita o mesmo modal de confirmação/detalhes acima (mesmos
     campos, mesmo destaque de Dano) só que com os botões "Editar" e
     "Fechar" — nenhum popup novo é criado para isto.
     ========================================================== */

  function ensureViewModal(){
    if (document.getElementById("eqcustom_view_modal")) return;
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "eqcustom_view_modal";
    overlay.innerHTML =
      '<div class="modal-box cx-modal-box eqcustom-confirm-box" id="eqcustom_view_box">' +
        '<h3 id="eqcustom_view_title"></h3>' +
        '<div class="cx-modal-body">' +
        '<div class="cx-modal-dim" id="eqcustom_view_cat"></div>' +
        '<div class="eqinv-dano-destaque" id="eqcustom_view_dano_wrap" style="display:none;">' +
          '<div class="eqinv-dano-label">Dano</div>' +
          '<div class="eqinv-dano-valor" id="eqcustom_view_dano_valor"></div>' +
        '</div>' +
        '<div class="cx-modal-section" id="eqcustom_view_stats"></div>' +
        '<div class="cx-modal-section" id="eqcustom_view_desc_wrap" style="display:none;"><h5>Descrição</h5><p id="eqcustom_view_desc"></p></div>' +
        '<div class="cx-modal-section" id="eqcustom_view_prop_wrap" style="display:none;"><h5>Propriedades</h5><p id="eqcustom_view_prop"></p></div>' +
        '<div class="cx-modal-section" id="eqcustom_view_obs_wrap" style="display:none;"><h5>Observações</h5><p id="eqcustom_view_obs"></p></div>' +
        '</div>' +
        '<div class="modal-actions" style="margin-top:14px; justify-content:flex-end; flex:0 0 auto;">' +
          '<button type="button" id="eqcustom_view_close">Fechar</button>' +
          '<button type="button" id="eqcustom_view_edit">Editar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    document.getElementById("eqcustom_view_close").addEventListener("click", closeViewModal);
    overlay.addEventListener("click", function(e){
      if (e.target.id === "eqcustom_view_modal") closeViewModal();
    });
  }

  function openViewModal(idx){
    if (typeof invItems === "undefined" || !invItems[idx]) return;
    var it = invItems[idx];
    ensureViewModal();

    document.getElementById("eqcustom_view_title").textContent = it.nome;
    document.getElementById("eqcustom_view_cat").textContent = it.categoria || "Item personalizado";

    var danoWrap = document.getElementById("eqcustom_view_dano_wrap");
    if (it.dano){
      document.getElementById("eqcustom_view_dano_valor").textContent = it.dano;
      danoWrap.style.display = "";
    } else { danoWrap.style.display = "none"; }

    var statsHtml = "";
    if (it.alcance) statsHtml += "<p><strong>Alcance:</strong> " + esc(it.alcance) + "</p>";
    var qtd = parseInt(it.qtd, 10); if (isNaN(qtd) || qtd < 1) qtd = 1;
    statsHtml += "<p><strong>Quantidade:</strong> " + esc(qtd) + "</p>";
    statsHtml += "<p><strong>Peso:</strong> " + esc(it.peso || 0) + " kg</p>";
    document.getElementById("eqcustom_view_stats").innerHTML = statsHtml;

    var descWrap = document.getElementById("eqcustom_view_desc_wrap");
    if (it.desc){ document.getElementById("eqcustom_view_desc").textContent = it.desc; descWrap.style.display = ""; }
    else { descWrap.style.display = "none"; }

    var propWrap = document.getElementById("eqcustom_view_prop_wrap");
    if (it.propriedades){ document.getElementById("eqcustom_view_prop").textContent = it.propriedades; propWrap.style.display = ""; }
    else { propWrap.style.display = "none"; }

    var obsWrap = document.getElementById("eqcustom_view_obs_wrap");
    if (it.obs){ document.getElementById("eqcustom_view_obs").textContent = it.obs; obsWrap.style.display = ""; }
    else { obsWrap.style.display = "none"; }

    var editBtn = document.getElementById("eqcustom_view_edit");
    editBtn.onclick = function(){
      if (isReadOnlyThirdPartyView()){ blockReadOnly(); return; }
      closeViewModal();
      editingIdx = idx;
      openFormModal(it);
    };

    document.getElementById("eqcustom_view_modal").style.display = "flex";
  }

  function closeViewModal(){
    var m = document.getElementById("eqcustom_view_modal");
    if (m) m.style.display = "none";
  }

  /* ==========================================================
     INTEGRAÇÃO COM O RENDER DO INVENTÁRIO (#inv_list)
     Envolve renderInventory() (mesmo padrão de "wrap" já usado por
     js/equipamentos-agente.js) para, depois do render original (e
     depois do wrap daquele arquivo, já que ele é aplicado primeiro —
     esta tag <script> é carregada em seguida no index.html), marcar
     o card de cada item com "custom: true" como clicável — mesma
     correspondência por índice já usada por aquele arquivo
     (list.children[idx] == invItems[idx], pois renderInventory()
     desenha um card por posição, na mesma ordem, sem filtrar nada).
     ========================================================== */

  function enhanceCustomCards(){
    var list = document.getElementById("inv_list");
    if (!list || typeof invItems === "undefined") return;

    invItems.forEach(function(item, idx){
      if (!item || !item.custom) return;
      var card = list.children[idx];
      if (!card) return;
      card.classList.add("eqinv-card");
      var titleEl = card.querySelector(".entry-title");
      if (!titleEl || titleEl.dataset.eqcustomBound) return;
      titleEl.classList.add("eqinv-title");
      titleEl.dataset.eqcustomBound = "1";
      titleEl.addEventListener("click", function(){ openViewModal(idx); });
    });
  }

  function wrapRenderInventory(){
    if (typeof renderInventory !== "function") return;
    var _orig = renderInventory;
    renderInventory = function(){
      _orig();
      enhanceCustomCards();
    };
  }

  /* ---------- boot ---------- */
  function init(){
    ensureCreateButton();
    wrapRenderInventory();
    enhanceCustomCards();
  }

  window.EquipamentosCustom = { init: init };

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
