/* ==========================================================
   EQUIPAMENTOS PERSONALIZADOS — DESTAQUE VISUAL NO INVENTÁRIO
   Módulo isolado, somado por cima de js/equipamentos-custom.js
   (que já marca cada item personalizado com a classe ".eqinv-card"
   e torna o título clicável — ver enhanceCustomCards() lá).

   NÃO cria nenhum array/armazenamento novo, NÃO refaz
   renderInventory(): só embrulha a função global mais uma vez
   (mesmo padrão de "wrap" já usado por js/equipamentos-custom.js e
   js/equipamentos-agente.js) para, depois que o card de cada item
   já existe no DOM, somar:

     1) um selo "Personalizado" no título do card;
     2) uma miniatura da imagem do item (item.imagem, dataURL — ver
        js/equipamentos-custom.js), quando o item tiver uma.

   Nada aqui lê/escreve campos novos em invItems — usa só
   "custom"/"imagem", que já são gravados por
   js/equipamentos-custom.js. Nenhuma linha de index.html precisou
   ser tocada além de UMA tag <script> (e um <link> para o CSS
   correspondente, css/equipamentos-custom-destaque.css) para
   carregar este módulo.

   Requer que este arquivo seja carregado DEPOIS de
   js/equipamentos-custom.js (para embrulhar renderInventory()
   depois daquele arquivo e assim rodar depois de
   enhanceCustomCards()).
   ========================================================== */
(function () {
  "use strict";

  function decorateCard(card, item){
    if (!card) return;

    // Selo "Personalizado" — só soma uma vez por card (cada render
    // recria os cards do zero, então não há risco de duplicar entre
    // uma chamada e outra, só dentro da mesma).
    var titleEl = card.querySelector(".entry-title");
    if (titleEl && !titleEl.querySelector(".eqinv-custom-badge")){
      var badge = document.createElement("span");
      badge.className = "eqinv-custom-badge";
      badge.textContent = "Personalizado";
      titleEl.appendChild(badge);
    }

    // Miniatura da imagem do item, quando existir — inserida como
    // primeiro filho do card (".entry-card" já é flex, ver CSS
    // principal: a miniatura só soma uma coluna à esquerda do corpo
    // do card já existente, sem alterar o layout dele).
    if (item.imagem && !card.querySelector(".eqinv-custom-thumb")){
      var thumb = document.createElement("div");
      thumb.className = "eqinv-custom-thumb";
      var img = document.createElement("img");
      img.src = item.imagem;
      img.alt = "";
      thumb.appendChild(img);
      card.insertAdjacentElement("afterbegin", thumb);
    }
  }

  function enhance(){
    var list = document.getElementById("inv_list");
    if (!list || typeof invItems === "undefined") return;

    invItems.forEach(function (item, idx){
      if (!item || !item.custom) return;
      var card = list.children[idx];
      decorateCard(card, item);
    });
  }

  // Mesmo padrão de encadeamento já usado por js/equipamentos-custom.js:
  // embrulha a versão ATUAL de renderInventory (que, a esta altura, já é
  // a versão embrulhada por equipamentos-custom.js, pois este arquivo é
  // carregado depois) — nenhuma das duas responsabilidades se perde.
  function wrapRenderInventory(){
    if (typeof renderInventory !== "function") return;
    var _orig = renderInventory;
    renderInventory = function () {
      _orig();
      enhance();
    };
  }

  function init(){
    wrapRenderInventory();
    enhance();
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
