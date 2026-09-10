(function () {
  "use strict";
  // Em dispositivos móveis/mais modestos, mantém a atmosfera e reduz apenas
  // efeitos contínuos ou de filtros, que são os mais caros durante a rolagem.
  var coarse = window.matchMedia && window.matchMedia("(hover: none), (max-width: 700px)").matches;
  var modest = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;
  if (coarse || modest) document.documentElement.classList.add("oc-performance-lite");
})();
