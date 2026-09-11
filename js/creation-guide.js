/* Guia de criação de ficha. Preferência local isolada por conta; não toca em fichas nem no Supabase. */
(function () {
  "use strict";

  var STORAGE_KEY = "onboarding:creation_guide";
  var overlay = document.getElementById("creation_guide_overlay");
  var modalContent = document.getElementById("creation_guide_modal_content");
  var home = document.getElementById("creation_guide_home");
  var closeButton = document.getElementById("creation_guide_close");
  var currentStep = 0;
  var previouslyFocused = null;
  var automaticAttemptDone = false;

  var steps = [
    { title: "Defina seu agente", body: '<p>Comece pelo conceito: <strong>nome, aparência, idade, profissão</strong> e a ideia central do personagem. Escolha algo que combine com a campanha e converse com o mestre antes de fechar os detalhes.</p><p>As faixas de idade vão de <strong>18 a 50+</strong>. Idade e profissão podem mudar pontuações e recursos, então vale escolher as duas antes de distribuir pontos.</p>' },
    { title: "Distribua os pontos iniciais", body: '<p>Como base recomendada, use os pontos abaixo nas quatro categorias da ficha. O mestre pode definir valores diferentes para a campanha.</p><div class="creation-guide-allocation"><div>Habilidades<b>15</b></div><div>Talentos<b>12</b></div><div>Atributos<b>15</b></div><div>Perícias<b>12</b></div></div><p>Cada grupo possui sua própria categoria na ficha. Um conhecimento sem pontos <strong>não pode ser melhorado normalmente</strong>: para desenvolvê-lo, o agente precisa treiná-lo durante a mesa ou usar <strong>Perícia Erúdita</strong>.</p>' },
    { title: "Confirme profissão, idade e itens", body: '<p>Confira no <strong>Compêndio</strong> os modificadores de profissão e idade: eles podem aumentar ou diminuir valores da ficha.</p><ul><li>Defina com o mestre se o agente é civil, novato, de campo ou usa outra origem.</li><li>Confirme os itens iniciais, a conexão inicial, patente e quaisquer regras especiais da campanha.</li></ul><p>Essas escolhas vêm antes da revisão final dos pontos, pois podem mudar o resultado da ficha.</p>' },
    { title: "Entenda Atual / Máx.", body: '<p>Vários campos da ficha usam o formato <strong>Atual / Máx.</strong>.</p><ul><li><strong>Atual</strong> é o que está disponível agora.</li><li><strong>Máx.</strong> é o total da reserva. Esses pontos podem ser gastos para melhorar uma rolagem.</li></ul><p>Exemplo: ao gastar 2 pontos de uma reserva <strong>3 / 3</strong>, ela fica <strong>1 / 3</strong>. Digite <strong>-2</strong> no valor atual para gastar 2 ou <strong>+2</strong> para recuperar 2.</p>' },
    { title: "Leia os dados por faixa", body: '<p>Em geral, a pontuação determina o dado usado na rolagem:</p><ul><li><strong>1–5:</strong> d4</li><li><strong>6–7:</strong> d6</li><li><strong>8–11:</strong> d8</li><li><strong>12–19:</strong> d12</li><li><strong>20:</strong> d20</li></ul><p>O site mostra o dado correspondente; consulte a regra ou o mestre quando uma habilidade tiver uma exceção.</p>' },
    { title: "Prepare sobrevivência e combate", body: '<p>O <strong>HP máximo</strong> começa em 20 e recebe o valor de Saúde. Sanidade e Fadiga são calculadas pela ficha: campos com linha <strong>azul</strong> contribuem para Sanidade, e os de linha <strong>amarela/laranja</strong> contribuem para Fadiga.</p><p>No combate, confira principalmente <strong>Combate, Força Física, Armas Brancas</strong> e <strong>Armas de Fogo</strong>. Agilidade, Velocidade e Marcial também podem entrar em esquivas e bloqueios. <strong>ATK, DEF e DESV</strong> são derivados: você não distribui pontos neles diretamente.</p><p>Abra o <strong>Compêndio</strong> para conferir exatamente o que cada Habilidade, Talento, Atributo e Perícia faz e em quais situações é usado.</p>' },
    { title: "Recupere a reserva com a narrativa", body: '<p>Pontos gastos da reserva não voltam sozinhos. A recuperação pode acontecer com <strong>descanso, alimentação, tratamento, itens, cura, Reestruturação</strong> ou outro efeito que o mestre aprovar.</p><p>Use o botão <strong>Recuperar Pontos</strong> somente quando essa recuperação tiver acontecido na história ou quando o mestre autorizar.</p>' },
    { title: "Revise e comece a jogar", body: '<p>Antes de salvar, confirme o básico do agente, as quatro categorias de pontos, HP/Sanidade/Fadiga, itens e conexões.</p><p>O site organiza e calcula a ficha; o mestre define as regras da campanha, itens, conexões, modificadores e quando uma recuperação pode acontecer.</p><p class="creation-guide-callout">Pronto. Você pode reabrir este guia quando quiser em <strong>Guia do Livro → Criar sua Ficha</strong>.</p>' }
  ];

  function homeMarkup() {
    return '<div class="creation-guide-eyebrow">Orientação para novos agentes</div><h3 id="creation_guide_home_title">Criar sua Ficha</h3><p>Um roteiro curto para entender a ordem de criação, os pontos iniciais, as reservas e os valores de combate.</p><div class="creation-guide-home-actions"><button type="button" class="creation-guide-primary" data-creation-guide="open">↻ Reabrir Tutorial Inicial</button><button type="button" class="creation-guide-secondary" data-creation-guide="compendium">Abrir Compêndio</button></div>';
  }
  function currentMarkup() {
    var step = steps[currentStep];
    var progress = steps.map(function (_, index) { return '<span class="' + (index <= currentStep ? 'is-active' : '') + '"></span>'; }).join('');
    var isLast = currentStep === steps.length - 1;
    return '<div class="creation-guide-modal-inner"><p class="creation-guide-kicker">Guia de criação · ' + (currentStep + 1) + ' de ' + steps.length + '</p><h2 id="creation_guide_modal_title">' + step.title + '</h2><div class="creation-guide-progress" aria-hidden="true">' + progress + '</div><article class="creation-guide-step"><span class="creation-guide-step-label">Etapa ' + (currentStep + 1) + '</span><h3>' + step.title + '</h3>' + step.body + '</article><div class="creation-guide-actions"><button type="button" class="creation-guide-secondary" data-creation-guide="prev" ' + (currentStep === 0 ? 'hidden' : '') + '>← Anterior</button><button type="button" class="creation-guide-secondary" data-creation-guide="skip">Criar ficha agora</button><button type="button" class="creation-guide-primary creation-guide-next" data-creation-guide="' + (isLast ? 'finish' : 'next') + '">' + (isLast ? 'Concluir guia' : 'Próxima etapa →') + '</button></div><p class="creation-guide-hint">Fechar também marca este guia como visto. Ele continuará disponível em Guia do Livro.</p></div>';
  }
  async function isCompleted() {
    try { return (await window.storageGet(STORAGE_KEY)) === "completed"; }
    catch (_) { return false; }
  }
  async function markCompleted() {
    try { await window.storageSet(STORAGE_KEY, "completed", 1, true); }
    catch (_) {}
  }
  function renderModal() { modalContent.innerHTML = currentMarkup(); }
  function openGuide() {
    previouslyFocused = document.activeElement;
    currentStep = 0;
    renderModal();
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("creation-guide-open");
    var first = modalContent.querySelector('[data-creation-guide="skip"]');
    if (first) first.focus();
  }
  function closeGuide() {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("creation-guide-open");
    if (previouslyFocused && typeof previouslyFocused.focus === "function") previouslyFocused.focus();
  }
  async function closeAndComplete() { await markCompleted(); closeGuide(); }
  function openCompendium() {
    closeGuide();
    var tab = document.querySelector('.tab-btn[data-tab="compendio"]');
    if (tab) tab.click();
  }
  async function createSheet() {
    await markCompleted();
    closeGuide();
    var createButton = document.getElementById("btn_new_sheet");
    if (createButton) createButton.click();
  }
  async function maybeShowGuide() {
    if (automaticAttemptDone || !overlay) return;
    automaticAttemptDone = true;
    // O primeiro aviso é reservado a quem ainda não possui ficha. Quem já
    // jogava antes ganha o acesso permanente no Guia do Livro sem interrupção.
    if (typeof sheetsIndex !== "undefined" && Array.isArray(sheetsIndex) && sheetsIndex.length > 0) return;
    if (!(await isCompleted())) openGuide();
  }
  function onAction(action) {
    if (action === "open") openGuide();
    if (action === "compendium") openCompendium();
    if (action === "prev" && currentStep > 0) { currentStep--; renderModal(); }
    if (action === "next" && currentStep < steps.length - 1) { currentStep++; renderModal(); }
    if (action === "finish") closeAndComplete();
    if (action === "skip") createSheet();
  }

  if (home) { home.innerHTML = homeMarkup(); }
  document.addEventListener("click", function (event) {
    var target = event.target.closest("[data-creation-guide]");
    if (target) onAction(target.getAttribute("data-creation-guide"));
  });
  closeButton.addEventListener("click", closeAndComplete);
  overlay.addEventListener("click", function (event) { if (event.target === overlay) closeAndComplete(); });
  document.addEventListener("keydown", function (event) { if (event.key === "Escape" && overlay.classList.contains("is-open")) closeAndComplete(); });
  document.addEventListener("oc:welcome-screen-shown", function () { window.setTimeout(maybeShowGuide, 80); });
})();
