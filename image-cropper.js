/* ==========================================================
   C.R.I.S. — EDITOR DE IMAGEM GLOBAL (CROP + ZOOM + POSIÇÃO)
   ==========================================================
   Módulo isolado e reutilizável, no mesmo espírito dos outros
   add-ons do projeto (js/character-image.js, js/text-view-mode.js):
   não mexe em nenhum sistema já existente, só se OFERECE para
   quem quiser chamá-lo.

   Objetivo: qualquer lugar do projeto que hoje deixa o CSS
   (object-fit:cover) decidir sozinho qual parte de uma imagem
   aparece pode, em vez disso, abrir este editor e deixar o
   usuário escolher exatamente o enquadramento — sem duplicar a
   lógica de canvas/redimensionamento em cada lugar.

   NÃO faz upload, NÃO grava em nenhum campo, NÃO conhece
   Supabase/localStorage. Só recebe um arquivo/imagem, devolve um
   canvas com o recorte escolhido (via onConfirm) e não faz mais
   nada — cada chamador decide o que fazer com o resultado
   (dataURL local, blob para upload, etc.), exatamente como cada
   um já fazia antes.

   API:
     window.CRISImageCropper.open({
       file: File,               // OU dataUrl: "data:image/..."
       aspectRatio: 1,           // largura/altura da área de corte (padrão 1:1)
       title: "AJUSTAR IMAGEM",  // opcional
       outputMax: 512,           // maior lado da imagem de saída, em px
       mimeType: "image/jpeg",   // formato de saída
       quality: 0.85,            // qualidade (0–1) quando mimeType for jpeg/webp
       onConfirm: function (result) { ... },
         // result = { canvas, dataUrl, width, height }
       onCancel: function () { ... } // opcional
     });

   Se o arquivo não puder ser aberto, mostra um aviso amigável
   dentro do próprio editor (nunca stack trace/erro técnico) e
   chama onCancel — a imagem anterior nunca é tocada nesse caso.
   ========================================================== */
(function () {
  "use strict";

  if (window.CRISImageCropper) return; // não duplica se já existir (hot reload etc.)

  var ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
  var MIN_ZOOM = 1;    // 1x = "cover" inicial (área de corte inteira preenchida)
  var MAX_ZOOM = 4;

  var active = null; // estado da sessão de edição aberta no momento (uma por vez)

  function friendlyError(e, fallback) {
    if (typeof window.CRISFriendlyError === "function") {
      try { return window.CRISFriendlyError(e, fallback); } catch (_e) { /* ignore */ }
    }
    return fallback || "Não foi possível processar essa imagem.";
  }

  function isAcceptedFile(file) {
    if (!file) return false;
    if (file.type && ACCEPTED_TYPES.indexOf(file.type) !== -1) return true;
    return /\.(png|jpe?g|webp|gif)$/i.test(file.name || "");
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  /* ---------------------------------------------------------
     Construção da UI (uma vez só; reaproveitada em toda chamada)
     --------------------------------------------------------- */
  var ui = null;

  function buildUiOnce() {
    if (ui) return ui;

    var overlay = document.createElement("div");
    overlay.className = "modal-overlay imgcrop-overlay";

    var box = document.createElement("div");
    box.className = "imgcrop-box";
    overlay.appendChild(box);

    var header = document.createElement("div");
    header.className = "imgcrop-header";
    var title = document.createElement("span");
    title.className = "imgcrop-title";
    header.appendChild(title);
    box.appendChild(header);

    var stage = document.createElement("div");
    stage.className = "imgcrop-stage";
    var canvas = document.createElement("canvas");
    canvas.className = "imgcrop-canvas";
    stage.appendChild(canvas);
    box.appendChild(stage);

    var zoomRow = document.createElement("div");
    zoomRow.className = "imgcrop-zoom-row";
    var zoomOut = document.createElement("button");
    zoomOut.type = "button";
    zoomOut.className = "imgcrop-zoom-btn";
    zoomOut.textContent = "−";
    zoomOut.setAttribute("aria-label", "Diminuir zoom");
    var zoomSlider = document.createElement("input");
    zoomSlider.type = "range";
    zoomSlider.className = "imgcrop-zoom-slider";
    zoomSlider.min = "0";
    zoomSlider.max = "100";
    zoomSlider.value = "0";
    var zoomIn = document.createElement("button");
    zoomIn.type = "button";
    zoomIn.className = "imgcrop-zoom-btn";
    zoomIn.textContent = "+";
    zoomIn.setAttribute("aria-label", "Aumentar zoom");
    zoomRow.appendChild(zoomOut);
    zoomRow.appendChild(zoomSlider);
    zoomRow.appendChild(zoomIn);
    box.appendChild(zoomRow);

    var status = document.createElement("div");
    status.className = "imgcrop-status";
    status.setAttribute("aria-live", "polite");
    box.appendChild(status);

    var actions = document.createElement("div");
    actions.className = "imgcrop-actions";
    var btnReset = document.createElement("button");
    btnReset.type = "button";
    btnReset.className = "imgcrop-btn imgcrop-btn-reset";
    btnReset.textContent = "Redefinir";
    var btnCancel = document.createElement("button");
    btnCancel.type = "button";
    btnCancel.className = "imgcrop-btn imgcrop-btn-cancel";
    btnCancel.textContent = "Cancelar";
    var btnConfirm = document.createElement("button");
    btnConfirm.type = "button";
    btnConfirm.className = "imgcrop-btn imgcrop-btn-confirm primary";
    btnConfirm.textContent = "Confirmar";
    actions.appendChild(btnReset);
    actions.appendChild(btnCancel);
    actions.appendChild(btnConfirm);
    box.appendChild(actions);

    document.body.appendChild(overlay);

    ui = {
      overlay: overlay, box: box, title: title, stage: stage, canvas: canvas,
      zoomOut: zoomOut, zoomSlider: zoomSlider, zoomIn: zoomIn,
      status: status, btnReset: btnReset, btnCancel: btnCancel, btnConfirm: btnConfirm
    };
    return ui;
  }

  /* ---------------------------------------------------------
     Sessão de edição — matemática de encaixe/zoom/arraste
     --------------------------------------------------------- */
  function computeStageSize(aspectRatio) {
    var vw = window.innerWidth || 360;
    var vh = window.innerHeight || 640;
    var maxW = Math.min(vw * 0.86, 420);
    var maxH = Math.min(vh * 0.46, 420);
    var w = maxW;
    var h = w / aspectRatio;
    if (h > maxH) {
      h = maxH;
      w = h * aspectRatio;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }

  function setStatus(msg, isError) {
    if (!ui) return;
    ui.status.textContent = msg || "";
    ui.status.classList.toggle("is-error", !!isError);
  }

  function baseScaleFor(sess) {
    // "cover": a área de corte inteira fica preenchida, sem distorcer.
    return Math.max(sess.stageW / sess.naturalW, sess.stageH / sess.naturalH);
  }

  function clampOffset(sess) {
    var scale = sess.baseScale * sess.zoom;
    var drawW = sess.naturalW * scale;
    var drawH = sess.naturalH * scale;
    var minX = sess.stageW - drawW;
    var minY = sess.stageH - drawH;
    sess.offsetX = clamp(sess.offsetX, Math.min(minX, 0), 0);
    sess.offsetY = clamp(sess.offsetY, Math.min(minY, 0), 0);
  }

  function draw(sess) {
    var canvas = ui.canvas;
    var ctx = canvas.getContext("2d");
    var dpr = Math.max(1, window.devicePixelRatio || 1);
    var pxW = Math.round(sess.stageW * dpr);
    var pxH = Math.round(sess.stageH * dpr);
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
      canvas.style.width = sess.stageW + "px";
      canvas.style.height = sess.stageH + "px";
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, sess.stageW, sess.stageH);
    var scale = sess.baseScale * sess.zoom;
    var drawW = sess.naturalW * scale;
    var drawH = sess.naturalH * scale;
    ctx.drawImage(sess.img, 0, 0, sess.naturalW, sess.naturalH, sess.offsetX, sess.offsetY, drawW, drawH);
  }

  function resetFraming(sess) {
    sess.zoom = MIN_ZOOM;
    sess.baseScale = baseScaleFor(sess);
    var scale = sess.baseScale * sess.zoom;
    sess.offsetX = (sess.stageW - sess.naturalW * scale) / 2;
    sess.offsetY = (sess.stageH - sess.naturalH * scale) / 2;
    ui.zoomSlider.value = "0";
    draw(sess);
  }

  function applyZoom(sess, zoom, anchorX, anchorY) {
    var oldScale = sess.baseScale * sess.zoom;
    var newZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    var newScale = sess.baseScale * newZoom;
    var ax = (anchorX === undefined) ? sess.stageW / 2 : anchorX;
    var ay = (anchorY === undefined) ? sess.stageH / 2 : anchorY;
    // mantém o ponto (ax,ay) da área de corte apontando para o mesmo
    // pixel da imagem antes e depois do zoom (zoom "centrado").
    var imgX = (ax - sess.offsetX) / oldScale;
    var imgY = (ay - sess.offsetY) / oldScale;
    sess.zoom = newZoom;
    sess.offsetX = ax - imgX * newScale;
    sess.offsetY = ay - imgY * newScale;
    clampOffset(sess);
    ui.zoomSlider.value = String(Math.round(((newZoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100));
    draw(sess);
  }

  function zoomFromSlider(sess) {
    var pct = Number(ui.zoomSlider.value) / 100;
    var zoom = MIN_ZOOM + pct * (MAX_ZOOM - MIN_ZOOM);
    applyZoom(sess, zoom);
  }

  /* ---------------------------------------------------------
     Interação: arraste (mouse/touch unificados via Pointer Events)
     e pinch-to-zoom (dois toques)
     --------------------------------------------------------- */
  function distanceBetween(t1, t2) {
    var dx = t1.clientX - t2.clientX;
    var dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function wireInteraction(sess) {
    var canvas = ui.canvas;
    var pointers = {}; // pointerId -> {x,y}
    var dragLast = null;
    var pinchStartDist = null;
    var pinchStartZoom = null;

    function stageRectPoint(evt) {
      var rect = canvas.getBoundingClientRect();
      return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
    }

    function onPointerDown(e) {
      canvas.setPointerCapture(e.pointerId);
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);
      if (ids.length === 1) {
        dragLast = { x: e.clientX, y: e.clientY };
      } else if (ids.length === 2) {
        var p1 = pointers[ids[0]], p2 = pointers[ids[1]];
        pinchStartDist = distanceBetween(p1, p2);
        pinchStartZoom = sess.zoom;
        dragLast = null;
      }
      e.preventDefault();
    }

    function onPointerMove(e) {
      if (!pointers[e.pointerId]) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        var p1 = pointers[ids[0]], p2 = pointers[ids[1]];
        var dist = distanceBetween(p1, p2);
        if (pinchStartDist) {
          var ratio = dist / pinchStartDist;
          var midClient = { clientX: (p1.x + p2.x) / 2, clientY: (p1.y + p2.y) / 2 };
          var pt = stageRectPoint(midClient);
          applyZoom(sess, pinchStartZoom * ratio, pt.x, pt.y);
        }
        e.preventDefault();
        return;
      }
      if (dragLast) {
        var dx = e.clientX - dragLast.x;
        var dy = e.clientY - dragLast.y;
        dragLast = { x: e.clientX, y: e.clientY };
        sess.offsetX += dx;
        sess.offsetY += dy;
        clampOffset(sess);
        draw(sess);
        e.preventDefault();
      }
    }

    function onPointerUp(e) {
      delete pointers[e.pointerId];
      var ids = Object.keys(pointers);
      if (ids.length === 1) {
        dragLast = { x: pointers[ids[0]].x, y: pointers[ids[0]].y };
        pinchStartDist = null;
      } else if (ids.length === 0) {
        dragLast = null;
        pinchStartDist = null;
      }
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", function (e) {
      if (Object.keys(pointers).length <= 1) onPointerUp(e);
    });

    // Scroll do mouse = zoom (desktop), sem rolar a página atrás do editor.
    function onWheel(e) {
      e.preventDefault();
      var pt = stageRectPoint(e);
      var delta = -e.deltaY * 0.0015;
      applyZoom(sess, sess.zoom * (1 + delta), pt.x, pt.y);
    }
    canvas.addEventListener("wheel", onWheel, { passive: false });

    sess._cleanupInteraction = function () {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }

  /* ---------------------------------------------------------
     Bloqueio de scroll da página enquanto o editor está aberto
     --------------------------------------------------------- */
  var scrollLockY = 0;
  function lockPageScroll() {
    scrollLockY = window.scrollY || 0;
    document.body.classList.add("imgcrop-noscroll");
    document.body.style.top = (-scrollLockY) + "px";
  }
  function unlockPageScroll() {
    document.body.classList.remove("imgcrop-noscroll");
    document.body.style.top = "";
    window.scrollTo(0, scrollLockY);
  }

  /* ---------------------------------------------------------
     Carregamento da imagem de origem (File ou dataURL)
     --------------------------------------------------------- */
  function loadImage(opts) {
    return new Promise(function (resolve, reject) {
      if (opts.file) {
        if (!isAcceptedFile(opts.file)) {
          reject({ kind: "formato" });
          return;
        }
        var reader = new FileReader();
        reader.onerror = function () { reject({ kind: "leitura" }); };
        reader.onload = function () { decodeDataUrl(reader.result, resolve, reject); };
        reader.readAsDataURL(opts.file);
      } else if (opts.dataUrl) {
        decodeDataUrl(opts.dataUrl, resolve, reject);
      } else {
        reject({ kind: "sem-imagem" });
      }
    });
  }

  function decodeDataUrl(dataUrl, resolve, reject) {
    var img = new Image();
    img.onerror = function () { reject({ kind: "decodificacao" }); };
    img.onload = function () {
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      if (!w || !h) { reject({ kind: "decodificacao" }); return; }
      resolve({ img: img, naturalW: w, naturalH: h });
    };
    img.src = dataUrl;
  }

  /* ---------------------------------------------------------
     Geração da imagem final (mesma proporção exibida, em maior
     resolução quando fizer sentido — sem distorcer, sem recortar
     de um jeito diferente do que o usuário escolheu)
     --------------------------------------------------------- */
  function renderOutput(sess, opts) {
    var aspectRatio = opts.aspectRatio || 1;
    var outputMax = opts.outputMax || 512;
    var outW, outH;
    if (aspectRatio >= 1) { outW = outputMax; outH = Math.round(outputMax / aspectRatio); }
    else { outH = outputMax; outW = Math.round(outputMax * aspectRatio); }

    var factor = outW / sess.stageW;
    var scale = sess.baseScale * sess.zoom * factor;
    var canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    var ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      sess.img, 0, 0, sess.naturalW, sess.naturalH,
      sess.offsetX * factor, sess.offsetY * factor,
      sess.naturalW * scale, sess.naturalH * scale
    );

    var mimeType = opts.mimeType || "image/jpeg";
    var quality = (typeof opts.quality === "number") ? opts.quality : 0.85;
    var dataUrl = canvas.toDataURL(mimeType, quality);
    return { canvas: canvas, dataUrl: dataUrl, width: outW, height: outH };
  }

  /* ---------------------------------------------------------
     Abertura/fechamento da sessão
     --------------------------------------------------------- */
  function close(sess, calledCancel) {
    if (!ui || active !== sess) return;
    if (sess._cleanupInteraction) sess._cleanupInteraction();
    ui.overlay.classList.remove("is-open");
    unlockPageScroll();
    active = null;
    if (calledCancel && typeof sess.opts.onCancel === "function") {
      try { sess.opts.onCancel(); } catch (e) { /* ignore erro do chamador */ }
    }
  }

  function open(opts) {
    opts = opts || {};
    if (active) return; // uma edição por vez — evita sobreposição de popovers

    buildUiOnce();

    var aspectRatio = opts.aspectRatio || 1;
    var stageSize = computeStageSize(aspectRatio);

    var sess = {
      opts: opts,
      stageW: stageSize.w,
      stageH: stageSize.h,
      zoom: MIN_ZOOM,
      offsetX: 0,
      offsetY: 0
    };
    active = sess;

    ui.title.textContent = opts.title || "AJUSTAR IMAGEM";
    ui.stage.style.width = stageSize.w + "px";
    ui.stage.style.height = stageSize.h + "px";
    setStatus("Carregando imagem…", false);
    ui.btnConfirm.disabled = true;

    ui.overlay.classList.add("is-open");
    lockPageScroll();

    loadImage(opts).then(function (loaded) {
      if (active !== sess) return; // fechado antes de terminar de carregar
      sess.img = loaded.img;
      sess.naturalW = loaded.naturalW;
      sess.naturalH = loaded.naturalH;
      resetFraming(sess);
      wireInteraction(sess);
      setStatus("", false);
      ui.btnConfirm.disabled = false;
    }).catch(function (err) {
      var msg = err && err.kind === "formato"
        ? "Formato de imagem não suportado. Use PNG, JPG ou WebP."
        : friendlyError(err, "Não foi possível carregar essa imagem.");
      setStatus(msg, true);
      ui.btnConfirm.disabled = true;
      // Não fecha sozinho: deixa a pessoa ler o aviso e cancelar/tentar
      // outro arquivo pelo botão Cancelar, sem alterar nada até lá.
    });

    function onReset() { if (sess.img) resetFraming(sess); }
    function onZoomOut() { applyZoom(sess, sess.zoom - 0.25); }
    function onZoomIn() { applyZoom(sess, sess.zoom + 0.25); }
    function onSlider() { zoomFromSlider(sess); }
    function onCancel() { teardown(); close(sess, true); }
    function onConfirm() {
      if (!sess.img) return;
      try {
        var result = renderOutput(sess, opts);
        teardown();
        close(sess, false);
        if (typeof opts.onConfirm === "function") opts.onConfirm(result);
      } catch (e) {
        setStatus(friendlyError(e, "Não foi possível processar essa imagem."), true);
      }
    }

    function teardown() {
      ui.btnReset.removeEventListener("click", onReset);
      ui.zoomOut.removeEventListener("click", onZoomOut);
      ui.zoomIn.removeEventListener("click", onZoomIn);
      ui.zoomSlider.removeEventListener("input", onSlider);
      ui.btnCancel.removeEventListener("click", onCancel);
      ui.btnConfirm.removeEventListener("click", onConfirm);
    }

    ui.btnReset.addEventListener("click", onReset);
    ui.zoomOut.addEventListener("click", onZoomOut);
    ui.zoomIn.addEventListener("click", onZoomIn);
    ui.zoomSlider.addEventListener("input", onSlider);
    ui.btnCancel.addEventListener("click", onCancel);
    ui.btnConfirm.addEventListener("click", onConfirm);
  }

  window.CRISImageCropper = {
    open: open,
    isSupported: function () {
      var c = document.createElement("canvas");
      return !!(c.getContext && c.getContext("2d"));
    }
  };
})();
