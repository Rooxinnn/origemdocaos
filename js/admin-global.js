/* ==========================================================
   C.R.I.S. — CENTRAL GLOBAL DO MESTRE (somente leitura)
   A autorização real é feita pelas RPCs protegidas no Supabase.
   Este módulo nunca confia em flags locais para liberar os dados.
   ========================================================== */
(function () {
  "use strict";

  var PAGE_SIZE = 100;
  var client = null;
  var isAdmin = false;
  var offset = 0;
  var currentQuery = "";
  var rows = [];
  var searchTimer = null;
  var activeAgent = null;
  var refreshTimer = null;

  function $(id) { return document.getElementById(id); }
  function getClient() {
    return window.CRISAuth && !window.CRISAuth.configError ? window.CRISAuth.client : null;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function createInterface() {
    var popover = $("account_popover");
    if (popover && !$("cris_admin_open")) {
      var btn = el("button", "cris-admin-open", "✦ Central do Mestre");
      btn.id = "cris_admin_open";
      btn.type = "button";
      btn.style.display = "none";
      btn.addEventListener("click", function () {
        popover.classList.remove("is-open");
        var gear = $("account_gear_btn");
        if (gear) gear.setAttribute("aria-expanded", "false");
        openPanel();
      });
      var logout = $("btn_logout");
      popover.insertBefore(btn, logout || null);
    }

    if (!$ ("cris_admin_overlay")) {
      var overlay = el("div", "cris-admin-overlay");
      overlay.id = "cris_admin_overlay";
      overlay.setAttribute("aria-hidden", "true");
      var shell = el("section", "cris-admin-shell");
      shell.setAttribute("role", "dialog");
      shell.setAttribute("aria-modal", "true");
      shell.setAttribute("aria-labelledby", "cris_admin_title");

      var header = el("header", "cris-admin-header");
      var heading = el("div", "cris-admin-heading");
      heading.appendChild(el("div", "cris-admin-kicker", "ACESSO RESTRITO · ADMINISTRADOR"));
      var title = el("h2", "", "Central do Mestre");
      title.id = "cris_admin_title";
      heading.appendChild(title);
      heading.appendChild(el("p", "", "Biblioteca global de fichas · somente leitura"));
      var close = el("button", "cris-admin-close", "✕");
      close.type = "button";
      close.setAttribute("aria-label", "Fechar Central do Mestre");
      close.addEventListener("click", closePanel);
      header.append(heading, close);

      var searchWrap = el("div", "cris-admin-search-wrap");
      searchWrap.appendChild(el("label", "", "BUSCA GLOBAL"));
      var search = el("input", "cris-admin-search");
      search.id = "cris_admin_search";
      search.type = "search";
      search.placeholder = "Jogador, personagem, item, habilidade, histórico...";
      search.autocomplete = "off";
      search.addEventListener("input", function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          currentQuery = search.value.trim();
          offset = 0;
          rows = [];
          loadRows(false);
        }, 300);
      });
      searchWrap.appendChild(search);
      searchWrap.appendChild(el("small", "", "A busca percorre nomes e todos os campos armazenados de cada ficha."));

      var body = el("div", "cris-admin-body");
      var results = el("div", "cris-admin-results");
      results.id = "cris_admin_results";
      var detail = el("aside", "cris-admin-detail");
      detail.id = "cris_admin_detail";
      detail.appendChild(el("div", "cris-admin-empty-detail", "Selecione uma ficha para visualizar seus dados."));
      body.append(results, detail);

      var footer = el("footer", "cris-admin-footer");
      var status = el("span", "cris-admin-status", "Pronto para consultar.");
      status.id = "cris_admin_status";
      var actions = el("div", "cris-admin-footer-actions");
      var refresh = el("button", "cris-admin-refresh", "Atualizar");
      refresh.id = "cris_admin_refresh";
      refresh.type = "button";
      refresh.addEventListener("click", function () { offset = 0; rows = []; loadRows(false); });
      var more = el("button", "cris-admin-more", "Carregar mais fichas");
      more.id = "cris_admin_more";
      more.type = "button";
      more.addEventListener("click", function () { loadRows(true); });
      actions.append(refresh, more);
      footer.append(status, actions);

      shell.append(header, searchWrap, body, footer);
      overlay.appendChild(shell);
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) closePanel();
      });
      document.body.appendChild(overlay);
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && overlay.classList.contains("is-open")) closePanel();
      });
    }
  }

  async function verifyAdmin() {
    client = getClient();
    if (!client) return false;
    try {
      var result = await client.rpc("cris_is_global_admin");
      if (result.error) throw result.error;
      isAdmin = result.data === true;
      var button = $("cris_admin_open");
      if (button) button.style.display = isAdmin ? "flex" : "none";
      return isAdmin;
    } catch (error) {
      isAdmin = false;
      var btn = $("cris_admin_open");
      if (btn) btn.style.display = "none";
      console.warn("[C.R.I.S. Central do Mestre] Verificação de administrador indisponível.", error);
      return false;
    }
  }

  function openPanel() {
    if (!isAdmin) return;
    var overlay = $("cris_admin_overlay");
    if (!overlay) return;
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("cris-admin-lock");
    var input = $("cris_admin_search");
    if (input) input.focus();
    offset = 0;
    rows = [];
    loadRows(false);
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      if (!overlay.classList.contains("is-open")) return;
      // Atualiza a página corrente periodicamente sem alterar a ficha original.
      loadRows(false);
    }, 30000);
  }

  function closePanel() {
    var overlay = $("cris_admin_overlay");
    if (!overlay) return;
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("cris-admin-lock");
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  function setStatus(message) {
    var status = $("cris_admin_status");
    if (status) status.textContent = message;
  }

  async function loadRows(append) {
    if (!isAdmin || !client) return;
    var more = $("cris_admin_more");
    if (more) more.disabled = true;
    setStatus("Consultando fichas...");
    try {
      var result = await client.rpc("cris_global_admin_search_agents", {
        p_query: currentQuery || null,
        p_limit: PAGE_SIZE,
        p_offset: append ? offset : 0
      });
      if (result.error) throw result.error;
      var incoming = Array.isArray(result.data) ? result.data : [];
      if (!append) rows = incoming;
      else rows = rows.concat(incoming);
      offset = append ? offset + incoming.length : incoming.length;
      renderResults();
      setStatus(rows.length + " ficha(s) carregada(s)" + (currentQuery ? " para ‘" + currentQuery + "’" : ""));
      if (more) more.style.display = incoming.length === PAGE_SIZE ? "inline-flex" : "none";
    } catch (error) {
      console.error("[C.R.I.S. Central do Mestre] Falha ao consultar fichas:", error);
      setStatus(error && /not_authorized/i.test(error.message || "") ? "Acesso não autorizado." : "Não foi possível carregar as fichas. Verifique a migration 0011 e o cadastro do administrador.");
      if (more) more.style.display = "none";
    } finally {
      if (more) more.disabled = false;
    }
  }

  function groupRows() {
    var groups = new Map();
    rows.forEach(function (row) {
      var key = row.player_user_id;
      if (!groups.has(key)) groups.set(key, { id: key, name: row.player_name || "Jogador", agents: [] });
      groups.get(key).agents.push(row);
    });
    return Array.from(groups.values()).sort(function (a, b) { return a.name.localeCompare(b.name, "pt-BR"); });
  }

  function renderResults() {
    var host = $("cris_admin_results");
    if (!host) return;
    host.replaceChildren();
    if (!rows.length) {
      host.appendChild(el("div", "cris-admin-no-results", currentQuery ? "Nenhuma ficha contém esse termo." : "Nenhuma ficha sincronizada foi encontrada."));
      return;
    }
    var groups = groupRows();
    groups.forEach(function (group) {
      var card = el("section", "cris-admin-player");
      var toggle = el("button", "cris-admin-player-toggle");
      toggle.type = "button";
      var left = el("span", "cris-admin-player-name", group.name);
      var right = el("span", "cris-admin-player-count", group.agents.length + (group.agents.length === 1 ? " ficha" : " fichas"));
      toggle.append(left, right);
      var list = el("div", "cris-admin-agent-list");
      list.hidden = false;
      group.agents.forEach(function (agent) {
        var item = el("button", "cris-admin-agent");
        item.type = "button";
        var label = el("span", "cris-admin-agent-name", agent.agent_name || "Ficha sem nome");
        var meta = el("span", "cris-admin-agent-meta", "Atualizada " + formatDate(agent.updated_at));
        item.append(label, meta);
        item.addEventListener("click", function () { showAgent(agent); });
        list.appendChild(item);
      });
      toggle.addEventListener("click", function () {
        list.hidden = !list.hidden;
        card.classList.toggle("is-collapsed", list.hidden);
      });
      card.append(toggle, list);
      host.appendChild(card);
    });
  }

  function formatDate(value) {
    if (!value) return "sem data";
    var date = new Date(value);
    return isNaN(date.getTime()) ? "sem data" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  function humanize(key) {
    return String(key).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, function (s) { return s.toUpperCase(); });
  }

  function renderValue(value, depth) {
    depth = depth || 0;
    if (value === null || value === undefined || value === "") return el("span", "cris-admin-value is-empty", "—");
    if (typeof value !== "object") {
      var text = typeof value === "boolean" ? (value ? "Sim" : "Não") : String(value);
      if (text.length > 650) text = text.slice(0, 650) + "… [conteúdo reduzido na visualização]";
      return el("span", "cris-admin-value", text);
    }
    if (depth > 7) return el("span", "cris-admin-value is-empty", "[nível interno ocultado]");
    var wrap = el("div", Array.isArray(value) ? "cris-admin-nested is-array" : "cris-admin-nested");
    var entries = Array.isArray(value) ? value.map(function (v, i) { return [String(i + 1), v]; }) : Object.entries(value);
    if (!entries.length) return el("span", "cris-admin-value is-empty", Array.isArray(value) ? "Lista vazia" : "Sem dados");
    entries.forEach(function (entry) {
      var row = el("div", "cris-admin-field");
      row.appendChild(el("div", "cris-admin-field-label", humanize(entry[0])));
      row.appendChild(renderValue(entry[1], depth + 1));
      wrap.appendChild(row);
    });
    return wrap;
  }

  function showAgent(agent) {
    activeAgent = agent;
    var host = $("cris_admin_detail");
    if (!host) return;
    host.replaceChildren();
    var top = el("div", "cris-admin-detail-top");
    top.appendChild(el("div", "cris-admin-kicker", agent.player_name || "JOGADOR"));
    top.appendChild(el("h3", "", agent.agent_name || "Ficha sem nome"));
    top.appendChild(el("div", "cris-admin-detail-meta", "Atualizada em " + formatDate(agent.updated_at)));
    var copyId = el("button", "cris-admin-copy-id", "ID da ficha: " + agent.agent_id);
    copyId.type = "button";
    copyId.title = "Copiar ID da ficha";
    copyId.addEventListener("click", function () {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(agent.agent_id).then(function () { copyId.textContent = "ID copiado"; }).catch(function () {});
    });
    top.appendChild(copyId);
    host.appendChild(top);

    var data = agent.data && typeof agent.data === "object" ? agent.data : {};
    var excluded = { localSheetId: true };
    Object.keys(data).forEach(function (key) {
      if (excluded[key]) return;
      var section = el("section", "cris-admin-data-section");
      section.appendChild(el("h4", "", humanize(key)));
      section.appendChild(renderValue(data[key], 0));
      host.appendChild(section);
    });
    if (!Object.keys(data).length) host.appendChild(el("p", "cris-admin-no-results", "Esta ficha não possui dados detalhados."));
    if (window.matchMedia && window.matchMedia("(max-width: 760px)").matches) host.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function init() {
    createInterface();
    // profile.js e supabase-auth.js podem concluir em momentos diferentes.
    // Verificamos a sessão/role novamente quando o usuário abre a conta.
    var gear = $("account_gear_btn");
    if (gear) gear.addEventListener("click", function () { setTimeout(verifyAdmin, 0); });
    // O login preenche #account_email em supabase-auth.js. Observar esse
    // elemento evita depender da ordem dos eventos iniciais do SDK.
    var emailEl = $("account_email");
    if (emailEl && typeof MutationObserver !== "undefined") {
      var accountObserver = new MutationObserver(function () {
        if (emailEl.textContent.trim()) setTimeout(verifyAdmin, 0);
        else {
          isAdmin = false;
          var adminButton = $("cris_admin_open");
          if (adminButton) adminButton.style.display = "none";
          closePanel();
        }
      });
      accountObserver.observe(emailEl, { childList: true, characterData: true, subtree: true });
    }
    var logout = $("btn_logout");
    if (logout) logout.addEventListener("click", function () { isAdmin = false; closePanel(); });
    await verifyAdmin();
    if (client && client.auth) {
      client.auth.onAuthStateChange(function (event) {
        if (event === "SIGNED_OUT") {
          isAdmin = false;
          var button = $("cris_admin_open");
          if (button) button.style.display = "none";
          closePanel();
        } else if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
          // Não chamar RPC dentro do callback síncrono do Auth (evita
          // reentrância do lock interno do SDK).
          setTimeout(verifyAdmin, 0);
        }
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
