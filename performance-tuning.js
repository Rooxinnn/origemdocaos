(function () {
  "use strict";
  // Em dispositivos móveis/mais modestos, mantém a atmosfera e reduz apenas
  // efeitos contínuos ou de filtros, que são os mais caros durante a rolagem.
  var coarse = window.matchMedia && window.matchMedia("(hover: none), (max-width: 700px)").matches;
  var modest = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;
  if (coarse || modest) document.documentElement.classList.add("oc-performance-lite");
})();

/* Pausa apenas verificações periódicas de interface, nunca autosave/rede.
   Não redefine setInterval global nem interfere nos timers de autenticação. */
(function(){
  'use strict';
  const jobs = new Set();
  function run(job){
    try { job.fn(); } catch(error) { console.error('[Interface periódica]', error); }
  }
  function start(job){
    if(job.timer !== null || document.hidden) return;
    job.timer = window.setInterval(function(){ if(!document.hidden) run(job); }, job.ms);
  }
  function pause(job){
    if(job.timer !== null) window.clearInterval(job.timer);
    job.timer = null;
  }
  function every(fn,ms){
    const job={fn:fn,ms:ms,timer:null};jobs.add(job);start(job);
    return {stop:function(){pause(job);jobs.delete(job);}};
  }
  function visibility(){
    document.documentElement.classList.toggle('oc-tab-hidden',document.hidden);
    if(document.hidden){
      // Último cálculo antes de suspender: um autosave pendente recebe os
      // valores derivados atuais, mesmo se a aba for ocultada durante a edição.
      jobs.forEach(function(job){run(job);pause(job);});
    }else{
      jobs.forEach(function(job){run(job);start(job);});
    }
  }
  window.CRISPerformance={every:every};
  document.documentElement.classList.toggle('oc-tab-hidden',document.hidden);
  document.addEventListener('visibilitychange',visibility);
})();
