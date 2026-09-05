/* ==========================================================
   IMAGEM DO PERSONAGEM
   Módulo independente que permite associar uma imagem a cada
   ficha e exibi-la, pequena e discreta, no card da ficha dentro
   do gerenciador/tela inicial (#sheet_list).

   IMPORTANTE — este módulo:
   - NÃO cria um segundo sistema de armazenamento. A imagem (em
     Data URL, já redimensionada/comprimida) é guardada dentro do
     próprio campo oculto #foto, que existe dentro de #tab-agentes.
     Por já estar dentro de #tab-agentes, esse campo é coletado e
     restaurado automaticamente pelos mecanismos GENÉRICOS que já
     existem no projeto (agentFieldIds(), saveAgent(), loadAgent(),
     createNewSheet(), duplicateSheet()) — nenhuma dessas funções
     precisou ser alterada ou reescrita para isso.
   - NÃO altera o layout da aba AGENTES além de acrescentar um
     controle pequeno e discreto (escolher/remover imagem) no
     cabeçalho da ficha, no mesmo ponto de integração já usado por
     TextViewMode (js/text-view-mode.js).
   - NÃO altera renderSheetCards() nem qualquer outra função do
     gerenciador de fichas. Em vez disso, "decora" os cards já
     renderizados por fora, por leitura periódica (mesmo padrão de
     espelhamento por polling já usado em TextViewMode), inserindo
     apenas uma pequena miniatura ao lado do nome da ficha.
   - Usa exclusivamente as funções de armazenamento que o projeto
     já expõe globalmente (window.storageGet / window.sheetStorageKey)
     para ler a imagem de cada ficha ao montar as miniaturas do
     gerenciador — sem criar nenhuma rota de armazenamento nova.

   Namespace: window.CharacterImage
   ========================================================== */
(function () {
  "use strict";

  var FIELD_ID = "foto";                 // <input type="hidden" id="foto"> dentro de #tab-agentes
  var ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
  var MAX_DIMENSION = 256;                // px — miniatura já é pequena, não precisa de resolução alta
  var JPEG_QUALITY = 0.82;

  var EDITOR_POLL_MS = 400;               // mesmo intervalo usado por TextViewMode
  var MANAGER_POLL_MS = 500;

  var editorState = {
    initialized: false,
    fileInput: null,
    thumbEl: null,
    removeBtn: null,
    lastValue: null
  };

  /* ---------------------------------------------------------
     Utilitários de campo (leitura/escrita do #foto existente)
     --------------------------------------------------------- */
  function getFotoField() {
    return document.getElementById(FIELD_ID);
  }

  function getCurrentValue() {
    var el = getFotoField();
    return el ? (el.value || "") : "";
  }

  function setCurrentValue(dataUrl) {
    var el = getFotoField();
    if (!el) return;
    el.value = dataUrl || "";
    // Dispara "input" para que o listener genérico já existente em
    // #tab-agentes (que chama markAgentDirty() para qualquer
    // input/textarea) perceba a mudança — sem precisar chamar
    // markAgentDirty() diretamente nem duplicar essa lógica aqui.
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /* ---------------------------------------------------------
     Redimensionamento/compressão da imagem selecionada
     --------------------------------------------------------- */
  function isAcceptedFile(file) {
    if (!file) return false;
    if (file.type && ACCEPTED_TYPES.indexOf(file.type) !== -1) return true;
    // Alguns navegadores podem não reportar o mime corretamente para
    // .webp; aceita também pela extensão como reforço.
    return /\.(png|jpe?g|webp)$/i.test(file.name || "");
  }

  function resizeImageFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("read-error")); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error("decode-error")); };
        img.onload = function () {
          try {
            var w = img.naturalWidth || img.width;
            var h = img.naturalHeight || img.height;
            var scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));
            var outW = Math.max(1, Math.round(w * scale));
            var outH = Math.max(1, Math.round(h * scale));

            var canvas = document.createElement("canvas");
            canvas.width = outW;
            canvas.height = outH;
            var ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, outW, outH);

            resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
          } catch (e) {
            reject(e);
          }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---------------------------------------------------------
     Controle na tela de edição da ficha (aba Agentes)
     --------------------------------------------------------- */
  function updateEditorPreview(value) {
    if (!editorState.thumbEl) return;
    if (value) {
      editorState.thumbEl.innerHTML = "";
      var img = document.createElement("img");
      img.src = value;
      img.alt = "";
      editorState.thumbEl.appendChild(img);
      editorState.thumbEl.classList.remove("is-empty");
      if (editorState.removeBtn) editorState.removeBtn.style.display = "";
    } else {
      editorState.thumbEl.innerHTML = "";
      editorState.thumbEl.classList.add("is-empty");
      if (editorState.removeBtn) editorState.removeBtn.style.display = "none";
    }
  }

  function handleFileChosen(file) {
    if (!file) return;
    if (!isAcceptedFile(file)) {
      alert("Selecione um arquivo de imagem PNG, JPG ou WebP.");
      return;
    }
    resizeImageFile(file).then(function (dataUrl) {
      setCurrentValue(dataUrl);
      updateEditorPreview(dataUrl);
      editorState.lastValue = dataUrl;
    }).catch(function () {
      alert("Não foi possível carregar essa imagem. Tente outro arquivo.");
    });
  }

  function createEditorControl() {
    var wrap = document.createElement("div");
    wrap.className = "cimg-picker";

    var thumb = document.createElement("div");
    thumb.className = "cimg-picker-thumb is-empty";
    wrap.appendChild(thumb);

    var buttons = document.createElement("div");
    buttons.className = "cimg-picker-buttons";

    var fileId = "cimg_file_input";
    var label = document.createElement("label");
    label.className = "cimg-choose-btn";
    label.setAttribute("for", fileId);
    label.textContent = "Imagem do Personagem";

    var input = document.createElement("input");
    input.type = "file";
    input.id = fileId;
    input.accept = "image/png,image/jpeg,image/jpg,image/webp";
    input.className = "cimg-file-input";
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      handleFileChosen(file);
      input.value = "";
    });

    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "cimg-remove-btn";
    removeBtn.textContent = "Remover";
    removeBtn.style.display = "none";
    removeBtn.addEventListener("click", function () {
      setCurrentValue("");
      updateEditorPreview("");
      editorState.lastValue = "";
    });

    buttons.appendChild(label);
    buttons.appendChild(input);
    buttons.appendChild(removeBtn);
    wrap.appendChild(buttons);

    editorState.fileInput = input;
    editorState.thumbEl = thumb;
    editorState.removeBtn = removeBtn;

    // Mesmo ponto de integração já usado por TextViewMode: cabeçalho
    // da ficha (titlebar-head) e, se não existir, a barra de ações.
    var host = document.querySelector("#tab-agentes .titlebar-head");
    if (host) {
      host.appendChild(wrap);
      return;
    }
    var actionBar = document.querySelector("#tab-agentes .action-bar");
    if (actionBar) {
      actionBar.insertBefore(wrap, actionBar.firstChild);
    }
  }

  function pollEditorField() {
    var current = getCurrentValue();
    if (current !== editorState.lastValue) {
      editorState.lastValue = current;
      updateEditorPreview(current);
    }
  }

  function initEditor() {
    if (editorState.initialized) return;
    if (!document.getElementById("tab-agentes")) return;
    if (!getFotoField()) return; // campo ainda não existe no HTML: nada a fazer
    editorState.initialized = true;

    createEditorControl();
    editorState.lastValue = getCurrentValue();
    updateEditorPreview(editorState.lastValue);
    setInterval(pollEditorField, EDITOR_POLL_MS);
  }

  /* ---------------------------------------------------------
     Miniatura nos cards do gerenciador de fichas (#sheet_list)
     --------------------------------------------------------- */
  function sheetKeyFor(id) {
    // Reaproveita exatamente a mesma chave de armazenamento já usada
    // pelo projeto para a ficha (sheetStorageKey), sem criar nenhuma
    // convenção nova. Fallback local apenas por segurança, caso essa
    // função global não esteja disponível por algum motivo.
    if (typeof window.sheetStorageKey === "function") {
      return window.sheetStorageKey(id);
    }
    return "agente:sheet:" + id;
  }

  function fetchFotoForSheet(id) {
    if (typeof window.storageGet !== "function") {
      return Promise.resolve(null);
    }
    return window.storageGet(sheetKeyFor(id)).then(function (raw) {
      if (!raw) return null;
      try {
        var data = JSON.parse(raw);
        return data && data[FIELD_ID] ? data[FIELD_ID] : null;
      } catch (e) {
        return null;
      }
    }).catch(function () { return null; });
  }

  function decorateCard(card) {
    var openBtn = card.querySelector("[data-open]");
    var nameEl = card.querySelector(".sheet-card-name");
    if (!openBtn || !nameEl) return;
    var id = openBtn.getAttribute("data-open");
    if (!id) return;

    var head = document.createElement("div");
    head.className = "cimg-card-head";

    var thumb = document.createElement("div");
    thumb.className = "cimg-card-thumb is-empty";
    head.appendChild(thumb);

    // Move o elemento de nome já existente (sem clonar, sem alterar
    // suas classes/conteúdo) para dentro do novo agrupador, mantendo
    // toda a formatação original do nome intacta.
    card.insertBefore(head, nameEl);
    head.appendChild(nameEl);

    fetchFotoForSheet(id).then(function (foto) {
      if (!foto) return;
      thumb.innerHTML = "";
      var img = document.createElement("img");
      img.src = foto;
      img.alt = "";
      thumb.appendChild(img);
      thumb.classList.remove("is-empty");
    });
  }

  function decorateManagerCards() {
    var list = document.getElementById("sheet_list");
    if (!list) return;
    var cards = list.querySelectorAll(".sheet-card:not([data-cimg-done])");
    cards.forEach(function (card) {
      card.setAttribute("data-cimg-done", "1");
      decorateCard(card);
    });
  }

  function initManagerWatcher() {
    setInterval(decorateManagerCards, MANAGER_POLL_MS);
  }

  /* ---------------------------------------------------------
     Inicialização
     --------------------------------------------------------- */
  function init() {
    initEditor();
    initManagerWatcher();
  }

  window.CharacterImage = {
    init: init,
    refreshEditorPreview: function () { updateEditorPreview(getCurrentValue()); },
    refreshManagerCards: decorateManagerCards
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
