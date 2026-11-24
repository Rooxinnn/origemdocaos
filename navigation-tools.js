(function () {
  "use strict";

  const FAVORITES_KEY = "oc_compendio_favoritos_v1";
  const readJSON = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (_) { return fallback; }
  };
  const writeJSON = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  };
  const clean = value => String(value || "").trim();

  let reader;
  function ensureReader() {
    if (reader) return reader;
    reader = document.createElement("div");
    reader.className = "oc-reader";
    reader.hidden = true;
    reader.innerHTML = '<div class="oc-reader-backdrop"></div><article class="oc-reader-sheet" role="dialog" aria-modal="true" aria-labelledby="oc_reader_title"><button type="button" class="oc-reader-close" aria-label="Fechar modo de leitura">×</button><div class="oc-reader-kicker">Modo de leitura</div><h2 id="oc_reader_title"></h2><div class="oc-reader-meta"></div><div class="oc-reader-text"></div></article>';
    document.body.appendChild(reader);
    const close = () => {
      reader.hidden = true;
      document.body.classList.remove("oc-reader-open");
      document.documentElement.classList.remove("oc-reader-open");
    };
    reader.querySelector(".oc-reader-close").addEventListener("click", close);
    reader.querySelector(".oc-reader-backdrop").addEventListener("click", close);
    document.addEventListener("keydown", event => { if (event.key === "Escape" && !reader.hidden) close(); });
    return reader;
  }

  function openReader(item) {
    const modal = ensureReader();
    modal.querySelector("#oc_reader_title").textContent = item.title || "Registro";
    modal.querySelector(".oc-reader-meta").textContent = item.meta || "Compêndio";
    modal.querySelector(".oc-reader-text").textContent = item.text || "Sem descrição disponível.";
    modal.hidden = false;
    document.body.classList.add("oc-reader-open");
    document.documentElement.classList.add("oc-reader-open");
    modal.querySelector(".oc-reader-sheet").scrollTop = 0;
    modal.querySelector(".oc-reader-close").focus();
  }

  function favorites() { return readJSON(FAVORITES_KEY, []); }
  function cardItem(card) {
    const titleNode = card.querySelector("h3, h4, .eq-card-title, .criatura-card-title");
    const textNode = card.querySelector("p, .eq-card-desc, .criatura-card-desc");
    const metaNode = card.querySelector(".fonte-tag, .cat-tag, .cx-dimlabel, .eq-card-tag");
    const title = clean(card.dataset.ocItemTitle || (titleNode && titleNode.childNodes[0] && titleNode.childNodes[0].textContent));
    const panel = card.closest(".subtab-panel");
    return {
      id: clean(card.dataset.ocItemId || ((panel ? panel.id : "compendio") + "::" + title)),
      kind: clean(card.dataset.ocItemKind || "registro"),
      title: title || "Registro do Compêndio",
      text: clean(card.dataset.ocItemText || (textNode && textNode.textContent)),
      meta: clean(card.dataset.ocItemMeta || (metaNode && metaNode.textContent)),
      image: clean(card.dataset.ocItemImage),
      imageAlt: clean(card.dataset.ocItemImageAlt),
      imageStyle: clean(card.dataset.ocItemImageStyle),
      tone: clean(card.dataset.ocItemTone)
    };
  }

  function isFavorite(id) { return favorites().some(item => item.id === id); }
  function toggleFavorite(item) {
    let list = favorites();
    const exists = list.some(saved => saved.id === item.id);
    list = exists ? list.filter(saved => saved.id !== item.id) : [item].concat(list).slice(0, 80);
    writeJSON(FAVORITES_KEY, list);
    decorateCompendium();
    renderFavorites();
  }

  function toolButton(label, className, title) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.title = title;
    return button;
  }

  function decorateCompendium() {
    const root = document.getElementById("tab-compendio");
    if (!root) return;
    root.querySelectorAll(".compendio-card, .cx-card, .sks-card").forEach(card => {
      if (card.querySelector(":scope > .oc-card-tools")) {
        const item = cardItem(card);
        const fav = card.querySelector(":scope > .oc-card-tools .oc-favorite-btn");
        if (fav) { fav.classList.toggle("active", isFavorite(item.id)); fav.setAttribute("aria-pressed", isFavorite(item.id)); }
        return;
      }
      const item = cardItem(card);
      if (!item.id || !item.title) return;
      const tools = document.createElement("div");
      tools.className = "oc-card-tools";
      const fav = toolButton("★", "oc-favorite-btn", "Adicionar aos favoritos");
      fav.setAttribute("aria-label", "Favoritar " + item.title);
      fav.setAttribute("aria-pressed", isFavorite(item.id));
      fav.classList.toggle("active", isFavorite(item.id));
      fav.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); toggleFavorite(cardItem(card)); });
      tools.append(fav);
      card.appendChild(tools);
    });
  }

  function openConnection(item) {
    const card = document.querySelector('#tab-compendio .cx-card[data-oc-item-id="' + CSS.escape(item.id) + '"]');
    if (card) card.click(); else openReader(item);
  }

  function renderFavorites() {
    const panel = document.getElementById("sub-comp-favoritos");
    if (!panel) return;
    const list = favorites();
    panel.innerHTML = '<div class="oc-favorites-head"><div><span class="oc-eyebrow">Arquivo pessoal</span><h2>Favoritos do Compêndio</h2></div><span class="oc-favorites-count">' + list.length + '</span></div>';
    if (!list.length) {
      const empty = document.createElement("p");
      empty.className = "oc-favorites-empty";
      empty.textContent = "Use a estrela nos registros do Compêndio para criar atalhos aqui.";
      panel.appendChild(empty);
      return;
    }
    const grid = document.createElement("div");
    grid.className = "oc-favorites-grid";
    list.forEach(item => {
      const card = document.createElement("article");
      card.className = "oc-favorite-card";
      const meta = document.createElement("div"); meta.className = "oc-favorite-meta"; meta.textContent = item.meta || item.kind;
      const title = document.createElement("h3"); title.textContent = item.title;
      const actions = document.createElement("div"); actions.className = "oc-favorite-actions";
      const open = toolButton("Abrir", "oc-favorite-open", "Abrir favorito no modo de leitura");
      open.addEventListener("click", () => openReader(item));
      const remove = toolButton("Remover", "oc-favorite-remove", "Remover dos favoritos");
      remove.addEventListener("click", () => toggleFavorite(item));
      actions.append(open, remove); card.append(meta, title, actions); grid.appendChild(card);
    });
    panel.appendChild(grid);
  }

  function setupFavorites() {
    const root = document.getElementById("tab-compendio");
    const row = root && root.querySelector(".subtab-row");
    if (!row || document.getElementById("sub-comp-favoritos")) return;
    const button = document.createElement("button");
    button.type = "button"; button.className = "subtab-btn oc-favorites-tab"; button.dataset.sub = "comp-favoritos"; button.textContent = "★ Favoritos";
    const panel = document.createElement("div");
    panel.className = "subtab-panel oc-favorites-panel"; panel.id = "sub-comp-favoritos";
    row.appendChild(button); row.parentNode.appendChild(panel);
    button.addEventListener("click", () => {
      row.querySelectorAll(".subtab-btn").forEach(btn => btn.classList.toggle("active", btn === button));
      row.parentNode.querySelectorAll(":scope > .subtab-panel").forEach(tab => tab.classList.toggle("active", tab === panel));
      renderFavorites();
    });
    renderFavorites(); decorateCompendium();
    root.addEventListener("click", event => {
      const card = event.target.closest(".compendio-card, .cx-card, .sks-card");
      if (card && !event.target.closest(".oc-card-tools")) {
        event.preventDefault(); event.stopImmediatePropagation(); openReader(cardItem(card));
      }
      setTimeout(decorateCompendium, 0);
    }, true);
    root.addEventListener("input", () => setTimeout(decorateCompendium, 0));
  }

  function setupBackToTop() {
    if (document.querySelector(".oc-back-top")) return;
    const button = toolButton("↑", "oc-back-top", "Voltar ao topo");
    button.setAttribute("aria-label", "Voltar ao topo"); document.body.appendChild(button);
    let scheduled = false;
    const update = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { button.classList.toggle("visible", window.scrollY > 520); scheduled = false; });
    };
    window.addEventListener("scroll", update, { passive: true }); update();
    button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function init() { ensureReader(); setupFavorites(); setupBackToTop(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(init, 0));
  else setTimeout(init, 0);
})();
