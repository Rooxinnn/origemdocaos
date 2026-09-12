/* Assistente de criação: preenche a mesma ficha existente, sem criar regras paralelas. */
(function () {
  "use strict";
  var overlay = document.getElementById("creation_assistant_overlay");
  var content = document.getElementById("creation_assistant_content");
  var close = document.getElementById("creation_assistant_close");
  var launch = document.getElementById("btn_creation_assistant");
  var stepIndex = 0;
  var lastFocus = null;
  var state = { nome: "", idade: "", profissao: "", conceito: "", budgets: [15, 12, 15, 12], values: {} };
  var groups = [
    { title: "Habilidades", label: "Habilidades", items: function () { return HABILIDADES; }, defaultBudget: 15 },
    { title: "Talentos", label: "Talentos", items: function () { return TALENTOS; }, defaultBudget: 12 },
    { title: "Atributos", label: "Atributos", items: function () { return ATRIBUTOS; }, defaultBudget: 15 },
    { title: "Perícias", label: "Perícias", items: function () { return PERICIAS; }, defaultBudget: 12 }
  ];

  function escapeHtml(value) { var el = document.createElement("div"); el.textContent = value == null ? "" : String(value); return el.innerHTML; }
  function clamp(value) { value = parseInt(value, 10); return isNaN(value) ? 0 : Math.max(0, Math.min(20, value)); }
  function sumGroup(group) { return group.items().reduce(function (sum, item) { return sum + clamp(state.values[item[0]]); }, 0); }
  function progress() { return [0,1,2,3,4,5].map(function (n) { return '<span class="' + (n <= stepIndex ? 'is-active' : '') + '"></span>'; }).join(''); }
  function basicStep() {
    return '<article class="creation-assistant-step"><span class="creation-assistant-step-label">Etapa 1 · Base do agente</span><h3>Quem é seu agente?</h3><p>Preencha apenas o essencial. Profissão e idade podem modificar valores; confirme os detalhes no Compêndio ou com o mestre antes de aplicar benefícios.</p><div class="creation-assistant-fields"><div class="creation-assistant-field wide"><label for="ca_nome">Nome do agente</label><input id="ca_nome" type="text" maxlength="90" value="' + escapeHtml(state.nome) + '" placeholder="Nome do agente"></div><div class="creation-assistant-field"><label for="ca_idade">Idade</label><input id="ca_idade" type="text" maxlength="20" value="' + escapeHtml(state.idade) + '" placeholder="Ex.: 23"></div><div class="creation-assistant-field"><label for="ca_profissao">Profissão</label><input id="ca_profissao" type="text" maxlength="100" value="' + escapeHtml(state.profissao) + '" placeholder="Ex.: Investigador"></div><div class="creation-assistant-field wide"><label for="ca_conceito">Conceito ou observação inicial</label><textarea id="ca_conceito" placeholder="Uma frase sobre a história, objetivo ou personalidade do agente…">' + escapeHtml(state.conceito) + '</textarea></div></div></article>';
  }
  function groupStep(group, groupIndex) {
    var used = sumGroup(group), budget = clamp(state.budgets[groupIndex]), over = used > budget;
    var skills = group.items().map(function (item) { var id = item[0], label = item[1]; return '<label class="creation-assistant-skill"><span>' + escapeHtml(label) + '</span><input type="number" min="0" max="20" inputmode="numeric" data-ca-skill="' + id + '" value="' + clamp(state.values[id]) + '"></label>'; }).join('');
    return '<article class="creation-assistant-step"><span class="creation-assistant-step-label">Etapa ' + (groupIndex + 2) + ' · Pontos iniciais</span><h3>' + group.title + '</h3><p>Distribua a reserva recomendada. Você pode mudar o limite se o mestre estiver usando outra regra; o assistente apenas organiza a ficha.</p><div class="creation-assistant-budget"><label><strong>Limite de pontos</strong><input type="number" min="0" max="200" inputmode="numeric" data-ca-budget="' + groupIndex + '" value="' + budget + '"></label><span class="creation-assistant-budget-status ' + (over ? 'is-over' : '') + '">' + used + ' / ' + budget + ' distribuídos' + (over ? ' · acima do limite' : '') + '</span></div><div class="creation-assistant-skills">' + skills + '</div><p class="creation-assistant-note">Os valores escolhidos serão colocados em <strong>Atual / Máx.</strong> ao concluir. Conhecimentos sem ponto continuam em 0 e devem ser desenvolvidos em jogo conforme as regras da mesa.</p></article>';
  }
  function reviewStep() {
    var totals = groups.map(function (group, index) { return '<li><strong>' + group.label + ':</strong> ' + sumGroup(group) + ' / ' + clamp(state.budgets[index]) + '</li>'; }).join('');
    return '<article class="creation-assistant-step"><span class="creation-assistant-step-label">Etapa 6 · Revisão</span><h3>Ficha pronta para editar</h3><p>O assistente criará a ficha com as escolhas abaixo. Depois você poderá aplicar a profissão, adicionar itens e escolher Conexões normalmente.</p><ul class="creation-assistant-review"><li><strong>Agente:</strong> ' + escapeHtml(state.nome || 'Sem nome') + '</li><li><strong>Idade:</strong> ' + escapeHtml(state.idade || 'Não definida') + '</li><li><strong>Profissão:</strong> ' + escapeHtml(state.profissao || 'Não definida') + '</li>' + totals + '</ul><p class="creation-assistant-note">HP, Sanidade, Fadiga, dados e valores de combate continuam sendo calculados pela ficha. Confira o Compêndio para saber exatamente como cada habilidade, talento, atributo ou perícia é usado.</p></article>';
  }
  function render() {
    var body = stepIndex === 0 ? basicStep() : (stepIndex <= 4 ? groupStep(groups[stepIndex - 1], stepIndex - 1) : reviewStep());
    var last = stepIndex === 5;
    content.innerHTML = '<div class="creation-assistant-modal-inner"><p class="creation-assistant-kicker">Assistente de criação · ' + (stepIndex + 1) + ' de 6</p><h2 id="creation_assistant_title">Criar uma ficha guiada</h2><p class="creation-assistant-desc">Você continua no controle: todos os valores podem ser alterados depois e as decisões do mestre têm prioridade.</p><div class="creation-assistant-progress" aria-hidden="true">' + progress() + '</div>' + body + '<div class="creation-assistant-actions"><button type="button" class="creation-assistant-secondary" data-ca-action="cancel">Cancelar</button><button type="button" class="creation-assistant-secondary" data-ca-action="prev" ' + (stepIndex === 0 ? 'hidden' : '') + '>← Anterior</button><button type="button" class="creation-assistant-primary" data-ca-action="' + (last ? 'finish' : 'next') + '">' + (last ? 'Criar ficha' : 'Próxima etapa →') + '</button></div></div>';
  }
  function readBasic() { state.nome = document.getElementById("ca_nome") ? document.getElementById("ca_nome").value.trim() : state.nome; state.idade = document.getElementById("ca_idade") ? document.getElementById("ca_idade").value.trim() : state.idade; state.profissao = document.getElementById("ca_profissao") ? document.getElementById("ca_profissao").value.trim() : state.profissao; state.conceito = document.getElementById("ca_conceito") ? document.getElementById("ca_conceito").value.trim() : state.conceito; }
  function readGroup() { var groupIndex = stepIndex - 1; document.querySelectorAll("[data-ca-skill]").forEach(function (input) { state.values[input.dataset.caSkill] = clamp(input.value); }); var budget = document.querySelector("[data-ca-budget]"); if (budget) state.budgets[groupIndex] = clamp(budget.value); }
  function collectCurrent() { if (stepIndex === 0) readBasic(); else if (stepIndex <= 4) readGroup(); }
  function refreshBudgetStatus() {
    if (stepIndex < 1 || stepIndex > 4) return;
    readGroup();
    var group = groups[stepIndex - 1], used = sumGroup(group), budget = clamp(state.budgets[stepIndex - 1]);
    var status = document.querySelector(".creation-assistant-budget-status");
    if (!status) return;
    status.textContent = used + " / " + budget + " distribuídos" + (used > budget ? " · acima do limite" : "");
    status.classList.toggle("is-over", used > budget);
  }
  function resetState() { stepIndex = 0; state = { nome: "", idade: "", profissao: "", conceito: "", budgets: [15, 12, 15, 12], values: {} }; }
  function open() { lastFocus = document.activeElement; resetState(); render(); overlay.classList.add("is-open"); overlay.setAttribute("aria-hidden", "false"); document.body.classList.add("creation-assistant-open"); var input = content.querySelector("input"); if (input) input.focus(); }
  function closeModal() { overlay.classList.remove("is-open"); overlay.setAttribute("aria-hidden", "true"); document.body.classList.remove("creation-assistant-open"); if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus(); }
  async function finish() {
    collectCurrent();
    var button = content.querySelector('[data-ca-action="finish"]'); if (button) { button.disabled = true; button.textContent = "Criando…"; }
    await createNewSheet();
    var set = function (id, value) { var el = document.getElementById(id); if (el) el.value = value; };
    set("nome", state.nome); set("idade", state.idade); set("profissao", state.profissao);
    if (state.conceito) set("anotacoes", state.conceito);
    groups.forEach(function (group) { group.items().forEach(function (item) { var value = clamp(state.values[item[0]]); set(item[0], value); set(item[0] + "_atual", value); if (typeof updateDiceTiers === "function") updateDiceTiers(item[0]); }); });
    if (typeof updateSAN === "function") updateSAN(); if (typeof updateHP === "function") updateHP(); if (typeof updateFatigue === "function") updateFatigue(); if (typeof initAllSkillBaselines === "function") initAllSkillBaselines(); if (typeof checkHabilidades50Unlock === "function") checkHabilidades50Unlock(); if (typeof window.updateAgentVitalStates === "function") window.updateAgentVitalStates(); if (typeof markAgentDirty === "function") markAgentDirty();
    closeModal();
    await saveAgent();
  }
  if (launch) launch.addEventListener("click", open);
  close.addEventListener("click", closeModal);
  overlay.addEventListener("click", function (event) { if (event.target === overlay) closeModal(); });
  document.addEventListener("click", function (event) { var button = event.target.closest("[data-ca-action]"); if (!button) return; var action = button.dataset.caAction; if (action === "cancel") closeModal(); if (action === "prev" && stepIndex > 0) { collectCurrent(); stepIndex--; render(); } if (action === "next" && stepIndex < 5) { collectCurrent(); stepIndex++; render(); } if (action === "finish") finish(); });
  document.addEventListener("input", function (event) { if (event.target.matches("[data-ca-skill], [data-ca-budget]")) refreshBudgetStatus(); });
  document.addEventListener("keydown", function (event) { if (event.key === "Escape" && overlay.classList.contains("is-open")) closeModal(); });
})();
