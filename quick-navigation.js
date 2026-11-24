/* Atalhos de navegação. Reutiliza abas e fichas existentes, sem criar registros. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const make = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  const button = (text, action) => { const b = make('button', text); b.type = 'button'; b.addEventListener('click', action); return b; };
  const isForeign = () => !!window.CRISCampaignAgentView?.isActive();
  let switching = false, generation = 0;

  // Somente o novo seletor usa esta barreira. O salvamento atual segue intacto.
  async function beforeSwitch() {
    if (isForeign()) throw Error('Volte da ficha do jogador antes de trocar de agente.');
    const id = window.currentAgentId;
    if (!id) return;
    const deadline = Date.now() + 6000;
    while (__agentSaveInFlight) {
      if (Date.now() > deadline) throw Error('O salvamento ainda está em andamento. Aguarde e tente novamente.');
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    if (__agentDirty) await saveAgent(true);
    if (__agentDirty || __agentSaveInFlight) throw Error('Não foi possível concluir o salvamento. Sua ficha foi mantida aberta.');
    if (window.currentAgentId !== id) throw Error('A ficha atual mudou. Abra o seletor novamente.');
    const inventory = getOpenInventorySnapshot();
    const saved = await storageSet(inventoryStorageKey(id), JSON.stringify(inventory), 1, true);
    if (!saved) throw Error('Não foi possível salvar o inventário. Sua ficha foi mantida aberta.');
    clearTimeout(__agentAutosaveTimer);
    __agentAutosaveTimer = null;
  }

  // Acessar: apenas um botão adicional no grupo da tela inicial.
  const access = make('details', null, 'qn-access');
  const summary = make('summary', 'Acessar ▾');
  const menu = make('nav', null, 'qn-access-menu');
  menu.setAttribute('aria-label', 'Acessar áreas do site');
  access.append(summary, menu);
  $('btn_welcome_campanhas').parentElement.append(access);
  function browse(tab) {
    access.open = false;
    if (tab === 'campanhas' && window.CRISGuest?.isGuest()) {
      window.CRISGuest.requireLoginForCampaigns(); return;
    }
    showAppScreen();
    document.querySelector('.tab-btn[data-tab="' + tab + '"]')?.click();
    refreshContext();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  for (const [text, tab] of [['Compêndio', 'compendio'], ['Guia do Livro', 'guialivro']]) menu.append(button(text, () => browse(tab)));
  menu.append(button('Bestiário de Agentes', () => {
    access.open = false;
    window.CRISAgentBestiary?.open();
  }));
  document.addEventListener('click', e => { if (!access.contains(e.target)) access.open = false; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && access.open) { access.open = false; summary.focus(); } });

  // Seletor de ficha: mantém a navegação existente e não muda a tela inicial.
  const switchButton = button('Trocar ficha ▾', openPicker);
  switchButton.className = 'qn-switch';
  switchButton.setAttribute('aria-haspopup', 'dialog');
  document.querySelector('#app_screen .tabs').append(switchButton);
  const context = make('div', null, 'qn-context');
  context.append(make('span', 'Consulta livre · selecione uma ficha para acessar Agente, Inventário e Paranormal.'));
  context.append(button('Escolher ficha', openPicker));
  document.querySelector('#app_screen .topbar').after(context);
  function refreshContext() {
    const hasSheet = !!window.currentAgentId;
    $('app_screen').classList.toggle('qn-no-sheet', !hasSheet);
    const current = (window.sheetsIndex || []).find(x => x.id === window.currentAgentId);
    switchButton.textContent = 'Trocar ficha ▾';
    switchButton.title = current ? 'Ficha atual: ' + current.nome : 'Escolher uma ficha existente';
    switchButton.disabled = isForeign();
  }
  // Evita mostrar campos vazios de uma ficha inexistente na consulta livre.
  document.addEventListener('click', e => {
    const tab = e.target.closest('.tab-btn');
    if (tab && ['agentes', 'inventario', 'paranormal'].includes(tab.dataset.tab) && !window.currentAgentId) {
      e.preventDefault(); e.stopImmediatePropagation(); openPicker();
    }
  }, true);

  const picker = make('dialog', null, 'qn-picker');
  picker.setAttribute('aria-labelledby', 'qn_picker_title');
  const heading = make('div', null, 'qn-picker-head');
  const title = make('h2', 'Trocar ficha'); title.id = 'qn_picker_title';
  const close = button('Fechar', () => { if (!switching) picker.close(); });
  heading.append(title, close);
  const search = make('input'); search.type = 'search'; search.placeholder = 'Pesquisar ficha pelo nome…'; search.setAttribute('aria-label', 'Pesquisar ficha');
  const feedback = make('p', '', 'qn-feedback'); feedback.setAttribute('role', 'status');
  const choices = make('div', null, 'qn-choices');
  picker.append(heading, search, feedback, choices); document.body.append(picker);
  function paintChoices() {
    choices.replaceChildren();
    const term = search.value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const items = (window.sheetsIndex || []).filter(x => String(x.nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(term)).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
    feedback.textContent = items.length ? 'Escolha um personagem. A ficha atual será salva antes da troca.' : 'Nenhuma ficha encontrada.';
    for (const entry of items) {
      const b = button('', () => switchTo(entry.id)); b.className = 'qn-choice';
      const initial = make('span', String(entry.nome || '?').trim().slice(0, 1).toUpperCase(), 'qn-initial');
      const caption = make('span', entry.nome || 'Ficha sem nome', 'qn-choice-name');
      b.append(initial, caption);
      if (entry.id === window.currentAgentId) { b.append(make('span', 'Atual', 'qn-current')); b.setAttribute('aria-current', 'true'); }
      choices.append(b);
      // Miniatura é somente uma leitura; nunca altera o índice nem a ficha.
      storageGet(sheetStorageKey(entry.id)).then(raw => {
        if (!b.isConnected || !raw) return;
        try {
          const d = JSON.parse(raw), src = d.foto;
          if (typeof src !== 'string' || !/^(https?:\/\/|img\/|data:image\/(png|jpeg|webp|gif);base64,)/i.test(src)) return;
          const img = make('img'); img.src = src; img.alt = ''; img.onerror = () => img.remove(); initial.replaceChildren(img);
        } catch (_) { /* mantém a inicial */ }
      }).catch(() => {});
    }
  }
  function openPicker() {
    if (switching) return;
    access.open = false;
    if (isForeign()) { flashIndicator('Volte da ficha do jogador antes de trocar de agente.', true, 3000); return; }
    search.value = ''; paintChoices(); refreshContext();
    if (!picker.open) picker.showModal(); search.focus();
  }
  async function switchTo(id) {
    if (switching) return;
    if (id === window.currentAgentId) { picker.close(); browse('agentes'); return; }
    switching = true; const stamp = generation;
    picker.querySelectorAll('button,input').forEach(n => n.disabled = true);
    feedback.textContent = 'Salvando a ficha atual…';
    try {
      const raw = await storageGet(sheetStorageKey(id));
      if (!raw) throw Error('Essa ficha não está disponível neste dispositivo. Recarregue suas fichas e tente novamente.');
      const data = JSON.parse(raw);
      if (!data || Array.isArray(data) || typeof data !== 'object') throw Error('A ficha selecionada não pôde ser lida.');
      await beforeSwitch();
      if (stamp !== generation || !(window.sheetsIndex || []).some(x => x.id === id)) throw Error('A sessão mudou. Abra o seletor novamente.');
      const opened = await openSheet(id);
      if(opened === false) throw Error('Não foi possível abrir a ficha. A ficha anterior foi mantida.');
      refreshContext(); picker.close(); window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (e) { feedback.textContent = e.message || 'Não foi possível trocar de ficha.'; }
    finally { switching = false; picker.querySelectorAll('button,input').forEach(n => n.disabled = false); }
  }
  const outside = e => { const r = picker.getBoundingClientRect(); return e.target === picker && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom); };
  let pressedOutside = false;
  picker.addEventListener('pointerdown', e => { pressedOutside = outside(e); });
  picker.addEventListener('click', e => { if (!switching && pressedOutside && outside(e)) picker.close(); pressedOutside = false; });
  picker.addEventListener('cancel', e => { if (switching) e.preventDefault(); });
  search.addEventListener('input', paintChoices);
  document.addEventListener('oc:welcome-screen-shown', () => { access.open = false; refreshContext(); });
  // Atualiza somente o estado dos novos controles ao mudar a tela.
  new MutationObserver(refreshContext).observe($('app_screen'), { attributes: true, attributeFilter: ['style'] });
  let account;
  window.CRISAuth?.client?.auth.onAuthStateChange((event, session) => {
    const next = session?.user?.id || null;
    if (account !== undefined && account !== next) { generation++; if (picker.open) picker.close(); access.open = false; }
    account = next;
  });
  refreshContext();
})();
