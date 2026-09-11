/* C.R.I.S. — Modo visitante
   Mantém dados locais sob "guest:" e nunca aciona Supabase, campanhas ou fila. */
(function () {
  "use strict";
  var PREFIX = "guest:";
  var active = false;
  var pendingSnapshot = null;

  function mapKey(key) {
    key = String(key || "");
    return active && key.indexOf(PREFIX) !== 0 ? PREFIX + key : key;
  }
  function mapPrefix(prefix) {
    prefix = String(prefix || "");
    return active && prefix.indexOf(PREFIX) !== 0 ? PREFIX + prefix : prefix;
  }
  function unmapKeys(keys) {
    if (!active) return keys;
    return (keys || []).filter(function (key) { return key.indexOf(PREFIX) === 0; }).map(function (key) { return key.slice(PREFIX.length); });
  }
  async function rawGet(key) {
    try {
      if (typeof window.storage !== "undefined" && window.storage && typeof window.storage.get === "function") {
        var res = await window.storage.get(key, false);
        return res ? res.value : null;
      }
      return window.localStorage.getItem(key);
    } catch (_) { return null; }
  }
  function parseArray(raw) { try { var v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v : []; } catch (_) { return []; } }
  async function readSnapshot() {
    var index = parseArray(await rawGet(PREFIX + "agentes:index"));
    var sheets = [];
    for (var i = 0; i < index.length; i++) {
      var entry = index[i];
      if (!entry || !entry.id) continue;
      var data = await rawGet(PREFIX + "agente:sheet:" + entry.id);
      if (!data) continue;
      sheets.push({ entry: entry, data: data, inventory: await rawGet(PREFIX + "agente:inventario:" + entry.id) });
    }
    return { sheets: sheets, customConnections: parseArray(await rawGet(PREFIX + "conexoes:personalizadas")) };
  }
  function hasSnapshot(snapshot) { return !!(snapshot && (snapshot.sheets.length || snapshot.customConnections.length)); }
  function setGuestBar(visible) {
    var bar = document.getElementById("guest_bar");
    if (bar) bar.style.display = visible ? "flex" : "none";
    var campTab = document.getElementById("tab_btn_campanhas");
    if (campTab) {
      campTab.classList.toggle("is-guest-locked", !!visible);
      campTab.setAttribute("aria-label", visible ? "Campanhas — requer login" : "Campanhas");
      campTab.textContent = visible ? "Campanhas 🔒" : "Campanhas";
    }
    var welcomeCampaigns = document.getElementById("btn_welcome_campanhas");
    if (welcomeCampaigns) welcomeCampaigns.textContent = visible ? "🗺 Campanhas 🔒" : "🗺 Campanhas";
  }
  function showLoading() { var el = document.getElementById("loading_screen"); if (el) el.style.display = "flex"; }
  async function prepareForAccountLogin() { pendingSnapshot = await readSnapshot(); return pendingSnapshot; }
  function leaveForAccount() {
    active = false;
    setGuestBar(false);
    if (typeof window.crisResetAppState === "function") window.crisResetAppState();
  }
  async function enter() {
    if (active) return;
    if (typeof window.crisResetAppState === "function") window.crisResetAppState();
    active = true;
    var auth = document.getElementById("auth_screen");
    if (auth) auth.classList.remove("is-visible");
    var account = document.getElementById("account_bar");
    if (account) account.style.display = "none";
    setGuestBar(true);
    showLoading();
    if (typeof window.crisStartGuestApp === "function") await window.crisStartGuestApp();
  }
  async function leaveToAuth() {
    await prepareForAccountLogin();
    leaveForAccount();
    var app = document.getElementById("app_screen");
    var welcome = document.getElementById("welcome_screen");
    var auth = document.getElementById("auth_screen");
    if (app) app.style.display = "none";
    if (welcome) welcome.style.display = "none";
    if (auth) auth.classList.add("is-visible");
  }
  function ensureCampaignModal() {
    var modal = document.getElementById("guest_campaign_modal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "guest_campaign_modal";
    modal.className = "guest-campaign-modal";
    modal.innerHTML = '<section class="guest-campaign-card" role="dialog" aria-modal="true" aria-labelledby="guest_campaign_title"><h2 id="guest_campaign_title">Campanhas exigem uma conta</h2><p>Como visitante, suas fichas ficam somente neste aparelho. Entre ou crie uma conta para participar de campanhas, receber convites e sincronizar suas fichas na nuvem.</p><div class="guest-campaign-actions"><button type="button" data-guest-campaign="close">Agora não</button><button type="button" class="guest-campaign-login" data-guest-campaign="login">Entrar / Criar conta</button></div></section>';
    modal.addEventListener("click", function (event) {
      if (event.target === modal || event.target.closest('[data-guest-campaign="close"]')) modal.classList.remove("is-open");
      if (event.target.closest('[data-guest-campaign="login"]')) { modal.classList.remove("is-open"); leaveToAuth(); }
    });
    document.body.appendChild(modal);
    return modal;
  }
  function requireLoginForCampaigns() { ensureCampaignModal().classList.add("is-open"); }
  function ensureImportModal() {
    var modal = document.getElementById("guest_import_modal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "guest_import_modal";
    modal.className = "guest-campaign-modal";
    modal.innerHTML = '<section class="guest-campaign-card" role="dialog" aria-modal="true" aria-labelledby="guest_import_title"><h2 id="guest_import_title">Fichas deste aparelho encontradas</h2><p id="guest_import_text"></p><div class="guest-campaign-actions"><button type="button" data-guest-import="keep">Agora não</button><button type="button" class="guest-campaign-login" data-guest-import="import">Importar para minha conta</button></div></section>';
    modal.addEventListener("click", function (event) {
      if (event.target.closest('[data-guest-import="keep"]') || event.target === modal) modal.classList.remove("is-open");
      if (event.target.closest('[data-guest-import="import"]')) importPending();
    });
    document.body.appendChild(modal);
    return modal;
  }
  async function importPending() {
    var snapshot = pendingSnapshot || await readSnapshot();
    if (!hasSnapshot(snapshot)) return;
    var imported = 0;
    var importedSheets = [];
    for (var i = 0; i < snapshot.sheets.length; i++) {
      var item = snapshot.sheets[i];
      var id = item.entry.id;
      if (typeof sheetsIndex !== "undefined" && sheetsIndex.some(function (entry) { return entry.id === id; })) id = genSheetId();
      var ok = await storageSet(sheetStorageKey(id), item.data, 1, true);
      if (!ok) continue;
      if (item.inventory) await storageSet(inventoryStorageKey(id), item.inventory, 1, true);
      sheetsIndex.push({ id: id, nome: item.entry.nome || "Ficha sem nome", updatedAt: item.entry.updatedAt || Date.now() });
      imported++;
      var dataForCloud = {};
      try { dataForCloud = JSON.parse(item.data); } catch (_) { dataForCloud = {}; }
      importedSheets.push({ id: id, data: dataForCloud });
    }
    if (imported) await saveSheetsIndex();
    for (var s = 0; s < importedSheets.length; s++) {
      if (window.CRISSync && typeof window.CRISSync.syncSheetToCloud === "function") {
        try { await window.CRISSync.syncSheetToCloud(importedSheets[s].id, importedSheets[s].data); } catch (_) { /* a ficha local continua segura */ }
      }
    }
    if (snapshot.customConnections.length && window.CharacterConnections && typeof window.CharacterConnections.importLibrary === "function") {
      await window.CharacterConnections.importLibrary(snapshot.customConnections);
    }
    pendingSnapshot = null;
    var modal = document.getElementById("guest_import_modal");
    if (modal) modal.classList.remove("is-open");
    if (typeof renderSheetCards === "function") renderSheetCards();
    if (typeof flashIndicator === "function") flashIndicator(imported ? "✓ Fichas de visitante importadas para sua conta." : "Nenhuma ficha nova foi importada.", false, 3400);
  }
  async function onAccountReady() {
    if (active) return;
    var snapshot = pendingSnapshot || await readSnapshot();
    if (!hasSnapshot(snapshot)) return;
    pendingSnapshot = snapshot;
    var modal = ensureImportModal();
    var text = document.getElementById("guest_import_text");
    var total = snapshot.sheets.length;
    if (text) text.textContent = total ? (total + (total === 1 ? " ficha criada" : " fichas criadas") + " como visitante foram encontradas. Deseja copiá-las para esta conta e sincronizá-las?") : "Conexões personalizadas criadas como visitante foram encontradas. Deseja copiá-las para esta conta?";
    modal.classList.add("is-open");
  }

  window.CRISGuest = {
    isGuest: function () { return active; },
    mapStorageKey: mapKey,
    mapStoragePrefix: mapPrefix,
    unmapStorageKeys: unmapKeys,
    enter: enter,
    leaveToAuth: leaveToAuth,
    leaveForAccount: leaveForAccount,
    prepareForAccountLogin: prepareForAccountLogin,
    requireLoginForCampaigns: requireLoginForCampaigns,
    onAccountReady: onAccountReady
  };
  var loginButton = document.getElementById("btn_guest_login");
  if (loginButton) loginButton.addEventListener("click", leaveToAuth);
})();
