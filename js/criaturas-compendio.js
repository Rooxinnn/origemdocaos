/* ==========================================================
   COMPÊNDIO DE CRIATURAS — Etapa 1 (catálogo visual)

   Módulo isolado. Não reescreve, não refatora e não altera nenhum
   sistema já existente do Origem do Caos (Agentes, Backup, Ficha
   de Criatura, Minhas Criaturas, Habilidades de Criaturas). Não
   depende de storageGet/storageSet — nesta etapa o Compêndio é
   somente leitura, então os dados vivem em CPD_CREATURES, abaixo.

   Reaproveita apenas o padrão visual genérico já usado pelos
   Arquivos Secretos (.secret-wrap/.secret-header/.secret-eyebrow/
   .secret-divider/.secret-back-btn, já definidos em index.html).
   Toda classe nova é prefixada com "cpd-" para nunca colidir com
   nada existente (inclusive com ".compendio-*", já usado pelo
   Compêndio de Regras — são módulos diferentes, propositalmente
   isolados).

   O card "Compêndio de Criaturas" do lobby de Arquivos Secretos
   (#secret_card_compendio) teve somente o atributo data-secret-msg
   removido em index.html, para não ser mais capturado pelo aviso
   genérico de placeholder — nenhum outro elemento do lobby foi
   alterado. Habilidades de Criaturas continua como placeholder,
   sem nenhuma mudança.

   ---------------------------------------------------------------
   DIMENSÕES DO ORIGEM DO CAOS (não são as dimensões de Ordem
   Paranormal — nunca usar Conhecimento/Energia/Morte/Sangue/
   Medo/Realidade aqui).
   ---------------------------------------------------------------

   ESTRUTURA DE CADA CRIATURA (genérica, preparada para o futuro):
     id             -> identificador único, estável
     nome           -> nome da criatura
     dimensao       -> uma das chaves de CPD_DIMENSOES
     tipo           -> tipo/categoria (ex.: "Raposa")
     imagem         -> caminho da imagem (img/...) ou null
     descricao      -> texto livre ou null (mostra placeholder)
     fichaCompleta  -> reservado para etapa futura (ficha completa)

   Nenhuma informação foi inventada: Solis usa somente os dados
   confirmados (nome, dimensão, tipo). Descrição e ficha completa
   ficam como "Em desenvolvimento" até serem fornecidas.
   ========================================================== */
(function(){
  "use strict";

  const CPD_DIMENSOES = [
    { key:"infernal",    label:"Infernal",    emoji:"🔵" },
    { key:"arkanjerial", label:"Arkanjerial",  emoji:"⚪" },
    { key:"terrena",     label:"Terrena",      emoji:"🟢" },
    { key:"carnical",    label:"Carnical",     emoji:"🔴" },
    { key:"sombria",     label:"Sombria",      emoji:"⚫" },
    { key:"perdicao",    label:"Perdição",     emoji:"🟣" },
    { key:"limbica",     label:"Límbica",      emoji:"⚪" }
  ];

  // Dado real de cada criatura. Novas criaturas entram aqui, no
  // mesmo formato — nenhum outro arquivo precisa ser tocado.
  const CPD_CREATURES = [
    {
      id: "solis",
      nome: "Solis",
      dimensao: "terrena",
      tipo: "Raposa",
      imagem: "img/solis.png",
      descricao: null,
      fichaCompleta: null,

      /* ---- registro completo (Etapa 2 — Ficha de Criatura) ----
         Todos os valores abaixo vêm exclusivamente da ficha em PDF
         enviada para a Solis. Nada foi inventado: campos sem dado
         legível no documento original (ex.: valores numéricos de
         ATK/DEF/DESV, que só aparecem em um gráfico sem números
         legíveis, e os blocos de Descrição, para os quais nenhum
         texto de lore foi enviado ainda) ficam como "—" ou "Em
         desenvolvimento.", no mesmo padrão já usado pelo restante
         do Compêndio. Esta estrutura é lida por js/criaturas-ficha.js
         — nenhum outro arquivo depende deste campo.
         Fonte: Solis.pdf ("Ficha do RPG Ordem do Caos"). */
      ficha: {
        periculosidade: "7",
        nivel: "8",
        impactoSanidade: "3",
        raca: "Ignifay",
        pontos: {
          vida:      { atual: 194, max: 194 },
          sanidade:  { atual: 80,  max: 80  },
          protecao:  { atual: 50,  max: 50  },
          resistenciaNatural: 6,
          pb:        { atual: 0,   max: 15  }
        },
        combate: {
          movs: 9,
          valores: [
            ["ATK N","—"], ["ATK AB","—"], ["ATK AF","—"], ["ATK C","—"],
            ["DEF N","—"], ["DEF AB","—"], ["DEF C","—"],
            ["DESV N","—"], ["DESV O","—"]
          ]
        },
        // Habilidades / Talentos / Atributos / Perícias — só os campos
        // que tinham valor preenchido na ficha original entram aqui.
        habilidades: [
          ["Arrombamento",1], ["Flexibilidade",6], ["Sentido Paranormal",50],
          ["Ilusionismo",6], ["Roubo",1], ["Atletismo",8], ["Manipulação",1]
        ],
        talentos: [
          ["Intimidação",6], ["Rastrear",8], ["Trabalho em Equipe",50],
          ["Combate",20], ["Silencioso",1], ["Observador",6], ["Percepção",8]
        ],
        atributos: [
          ["Agilidade",50], ["Inteligência",1], ["Ocultismo",12], ["Velocidade",8],
          ["Força Física",6], ["Assimilação",6], ["Resistência",8],
          ["Resistência Psíquica",6], ["Saúde",12]
        ],
        pericias: [
          ["Idiomas",1], ["Perícia Investigativa",6], ["Idioma Antigo",1],
          ["Perícia em Radar",1]
        ],
        sentidos: null,
        resistencias: {
          imunidades: ["Sangrar","Hemorragia","Fraturar","Envenenar","Corroendo","Agarrado*","Imobilizado**","Febril","Doente","Enjoado"],
          observacoes: "Regras de benefícios, punições, resistências e agravantes do elemento fogo são utilizadas para esta criatura. Danos elétricos são dobrados e causam uma explosão que arremessa a criatura 1d4m de distância."
        },
        acoes: [
          { nome: "Mordida", corpo: "Dano: 5d4+1/3FF | Sucesso Extremo causa QUEIMAR." },
          { nome: "Derrubar", corpo: "Dano: 1d4 + CAÍDO." },
          { nome: "Atropelar", corpo: "Dano: 2d4 + Desvantagem na próxima ação. Se sucesso Extremo: CAÍDO." },
          { nome: "Corrida de Chamas", corpo: "ATK N | P.B.: 3 | Efeito: a criatura corre em um movimento de costura (zigue-zague) por 10m, até localizar o seu alvo e então mordê-lo com a ferocidade de um caçador. Todo o caminho percorrido por esta criatura fica em chamas por 1d6 rodadas, e todos no caminho desta trilha de costura deverão realizar um teste (trecho final ilegível no documento original)." }
        ],
        habilidadesPassivas: [
          { nome: "Forma Corpórea", corpo: "PASSIVA | Efeito: a criatura é capaz de controlar suas chamas para que, embora ainda quentes, não causem QUEIMAR a um personagem, objeto ou cenário." },
          { nome: "Imortalidade do Fogo", corpo: "PASSIVA | Efeito: quando a criatura alcança 0 de HP, ela não morre ou entra em MORRENDO — ela apenas se desfaz e se perde no ar para se recuperar e regenerar sua forma. Ficará ausente por 24h." },
          { nome: "Ataque Surpresa", corpo: "PASSIVA | Efeito: assim que esta criatura é invocada, ela é capaz de imediatamente realizar um ataque, e seu alvo terá Desvantagem em sua reação." },
          { nome: "Rastreamento Caçador", corpo: "PASSIVA | Efeito: uma vez por invocação, esta criatura é capaz de dobrar 1 rolagem de: Perícia em Radar, Perícia Investigativa, Rastrear, Observador ou Percepção." },
          { nome: "Cria do Paranormal", corpo: "ATK C, DEF C e DESV O possuem Vantagem. É capaz de identificar e sentir com perfeição qualquer personagem ou criatura dentro de um raio de 50m." },
          { nome: "Caçada Conjunta", corpo: "É capaz de gastar 1 P.B. + 1 Ponto de Trabalho em Equipe para realizar um ataque junto de outra criatura. O alvo do ataque estará Flanqueado e terá -5 em sua rolagem de reação." },
          { nome: "Paranormal Inatingível", corpo: "Ações que envolvam Agilidade têm Vantagem — isso inclui ATK N, DEF N, DEF AB, DEF C, DESV N e DESV O (trecho final ilegível no documento original)." }
        ],
        condicoesFisicas: {
          tamanhoPeso: "60cm (1,60m quando de pé nas patas traseiras) | 7,1"
        },
        descricao: {
          aparencia: null,
          comportamento: null,
          origem: null,
          curiosidades: null,
          relacaoDimensao: null
        }
      }
    },

    /* ---- placeholders de teste visual (etapa de design) ----
       Fictícios, sem ficha/habilidades/regras — apenas para testar
       a identidade visual das 7 dimensões. Podem ser removidos
       futuramente sem afetar nenhum outro sistema. */
    {
      id: "teste_infernal",
      nome: "Criatura Infernal",
      dimensao: "infernal",
      tipo: "Entidade Infernal",
      imagem: null,
      descricao: null,
      fichaCompleta: null
    },
    {
      id: "teste_arkanjerial",
      nome: "Entidade Arkanjerial",
      dimensao: "arkanjerial",
      tipo: "Ser Celestial",
      imagem: null,
      descricao: null,
      fichaCompleta: null
    },
    {
      id: "teste_carnical",
      nome: "Aberração Carnical",
      dimensao: "carnical",
      tipo: "Aberração",
      imagem: null,
      descricao: null,
      fichaCompleta: null
    },
    {
      id: "teste_sombria",
      nome: "Anomalia Sombria",
      dimensao: "sombria",
      tipo: "Anomalia",
      imagem: null,
      descricao: null,
      fichaCompleta: null
    },
    {
      id: "teste_perdicao",
      nome: "Fragmento da Perdição",
      dimensao: "perdicao",
      tipo: "Fragmento",
      imagem: null,
      descricao: null,
      fichaCompleta: null
    },
    {
      id: "teste_limbica",
      nome: "Falha Límbica",
      dimensao: "limbica",
      tipo: "Falha",
      imagem: null,
      descricao: null,
      fichaCompleta: null
    }
  ];

  function esc(s){
    if(typeof window.escapeHtml === "function") return window.escapeHtml(s);
    const d = document.createElement("div");
    d.textContent = (s === undefined || s === null) ? "" : String(s);
    return d.innerHTML;
  }

  function dimInfo(key){
    return CPD_DIMENSOES.find(d => d.key === key) || null;
  }

  let cpdActiveFilter = "todas";
  let cpdSearchTerm = "";

  /* ---------- navegação entre telas ----------
     Mesmo padrão (display none/block) já usado por showWelcomeScreen/
     showAppScreen/showSecretFilesScreen e pelas telas de Criatura —
     nenhuma dessas funções existentes é alterada ou chamada aqui de
     forma que mude seu comportamento. */
  function hideAllCpdAndOtherScreens(){
    [
      "welcome_screen",
      "secret_files_screen",
      "creature_list_screen",
      "creature_sheet_screen",
      "creature_compendio_screen",
      "creature_registro_screen",
      "creature_ficha_completa_screen"
    ].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.style.display = "none";
    });
  }

  function showCompendioScreen(){
    hideAllCpdAndOtherScreens();
    cpdActiveFilter = "todas";
    cpdSearchTerm = "";
    const search = document.getElementById("cpd_search");
    if(search) search.value = "";
    renderCpdFilters();
    renderCpdGrid();
    document.getElementById("creature_compendio_screen").style.display = "block";
  }

  function backToSecretFilesFromCpd(){
    hideAllCpdAndOtherScreens();
    document.getElementById("secret_files_screen").style.display = "block";
  }

  /* ---------- filtro por dimensão ---------- */
  function renderCpdFilters(){
    const wrap = document.getElementById("cpd_filters");
    if(!wrap) return;
    if(wrap.dataset.cpdBuilt === "1"){ updateCpdFilterActive(); return; }

    wrap.innerHTML = "";

    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "cpd-filter-btn";
    allBtn.dataset.cpdFilter = "todas";
    allBtn.textContent = "Todas";
    wrap.appendChild(allBtn);

    CPD_DIMENSOES.forEach(d => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cpd-filter-btn cpd-dim-" + d.key;
      btn.dataset.cpdFilter = d.key;
      btn.innerHTML = `<span class="cpd-filter-dot"></span>${d.emoji} ${esc(d.label)}`;
      wrap.appendChild(btn);
    });

    wrap.querySelectorAll(".cpd-filter-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        cpdActiveFilter = btn.dataset.cpdFilter;
        updateCpdFilterActive();
        renderCpdGrid();
      });
    });

    wrap.dataset.cpdBuilt = "1";
    updateCpdFilterActive();
  }
  function updateCpdFilterActive(){
    document.querySelectorAll(".cpd-filter-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.cpdFilter === cpdActiveFilter);
    });
  }

  /* ---------- card da criatura ----------
     Etapa de design: só o MARKUP/CSS do card muda (imagem à esquerda,
     informações ao centro, botão "Ficha" à direita, com identidade
     visual da dimensão no fundo). Os dados usados continuam sendo
     exatamente os mesmos campos de sempre (nome/dimensao/tipo/imagem/
     id) — nenhum campo novo, nenhuma estrutura de registro alterada.
     "Criatura - {tipo}" é só o texto exibido nesta linha do card
     (mesmo padrão de referência "Criatura - Grande" citado no pedido);
     o dado bruto salvo continua sendo somente o tipo (ex.: "Raposa"). */
  function cpdTipoLabel(tipo){
    return tipo ? "Criatura - " + tipo : "Tipo não catalogado";
  }
  function buildCpdCard(c){
    const dim = dimInfo(c.dimensao);
    const card = document.createElement("div");
    card.className = "cpd-card" + (dim ? " cpd-dim-" + dim.key : "");
    card.innerHTML = `
      <div class="cpd-card-texture" aria-hidden="true"></div>
      <div class="cpd-card-photo">
        ${c.imagem ? `<img src="${esc(c.imagem)}" alt="${esc(c.nome)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">` : ""}
        <div class="cpd-card-photo-fallback" style="${c.imagem ? "display:none;" : ""}">Sem Registro Visual</div>
      </div>
      <div class="cpd-card-body">
        <div class="cpd-card-name">${esc(c.nome)}</div>
        <div class="cpd-card-dim">${dim ? dim.emoji + " " + esc(dim.label) : "Dimensão não catalogada"}</div>
        <div class="cpd-card-tipo">${esc(cpdTipoLabel(c.tipo))}</div>
      </div>
      <div class="cpd-card-action">
        <button type="button" class="cpd-card-btn" data-cpd-open="${esc(c.id)}">Ficha</button>
      </div>
    `;
    return card;
  }
  function wireCpdCardButtons(scope){
    scope.querySelectorAll("[data-cpd-open]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.cpdOpen;
        const c = CPD_CREATURES.find(x => x.id === id);
        // Só criaturas com registro completo (Etapa 2 — ver campo "ficha")
        // abrem a nova Ficha de Criatura; as demais continuam exatamente
        // como antes, no registro simples (placeholder).
        if(c && c.ficha && typeof window.CPD_showFichaCompleta === "function"){
          window.CPD_showFichaCompleta(id);
        } else {
          showCpdRegistro(id);
        }
      });
    });
  }
  function buildCpdSection(dim, list){
    const section = document.createElement("div");
    section.className = "cpd-section" + (dim ? " cpd-dim-" + dim.key : "");
    section.innerHTML = `
      <div class="cpd-section-header">
        <span class="cpd-section-dot"></span>
        <h3>${dim ? dim.emoji + " " + esc(dim.label) : ""}</h3>
        <span class="cpd-section-count">${list.length} registro(s)</span>
      </div>
    `;
    const body = document.createElement("div");
    body.className = "cpd-flat-grid";
    if(list.length === 0){
      body.innerHTML = '<div class="cpd-empty cpd-empty-inline">Nenhum registro catalogado nesta dimensão.</div>';
    } else {
      list.forEach(c => body.appendChild(buildCpdCard(c)));
    }
    section.appendChild(body);
    return section;
  }

  /* ---------- grade principal ----------
     Sem busca: "Todas" agrupa por dimensão (todas as sete, mesmo
     vazias — estrutura preparada para futuras criaturas); uma
     dimensão específica mostra só a seção dela.
     Com busca: grade única (nome), respeitando o filtro de
     dimensão ativo; sem resultado -> "Nenhuma criatura encontrada." */
  function renderCpdGrid(){
    const container = document.getElementById("cpd_grid");
    if(!container) return;
    container.innerHTML = "";

    const term = cpdSearchTerm.trim().toLowerCase();

    if(term){
      const results = CPD_CREATURES.filter(c => {
        if(cpdActiveFilter !== "todas" && c.dimensao !== cpdActiveFilter) return false;
        return c.nome.toLowerCase().includes(term);
      });
      if(results.length === 0){
        container.innerHTML = '<div class="cpd-empty">Nenhuma criatura encontrada.</div>';
        return;
      }
      const flat = document.createElement("div");
      flat.className = "cpd-flat-grid";
      results.forEach(c => flat.appendChild(buildCpdCard(c)));
      container.appendChild(flat);
      wireCpdCardButtons(container);
      return;
    }

    if(cpdActiveFilter === "todas"){
      CPD_DIMENSOES.forEach(dim => {
        const list = CPD_CREATURES.filter(c => c.dimensao === dim.key);
        container.appendChild(buildCpdSection(dim, list));
      });
      wireCpdCardButtons(container);
      return;
    }

    const dim = dimInfo(cpdActiveFilter);
    const list = CPD_CREATURES.filter(c => c.dimensao === cpdActiveFilter);
    container.appendChild(buildCpdSection(dim, list));
    wireCpdCardButtons(container);
  }

  /* ---------- registro da criatura (placeholder, sem ficha completa) ---------- */
  function showCpdRegistro(id){
    const c = CPD_CREATURES.find(x => x.id === id);
    if(!c) return;
    const dim = dimInfo(c.dimensao);

    document.getElementById("cpd_reg_nome").textContent = c.nome || "Não catalogado";
    document.getElementById("cpd_reg_dim").innerHTML = dim ? dim.emoji + " " + esc(dim.label) : "Dimensão não catalogada";
    document.getElementById("cpd_reg_tipo").textContent = c.tipo || "Tipo não catalogado";
    document.getElementById("cpd_reg_desc").textContent = c.descricao || "Em desenvolvimento.";
    document.getElementById("cpd_reg_ficha").textContent = c.fichaCompleta || "Em desenvolvimento.";

    const photo = document.getElementById("cpd_reg_photo");
    const fallback = document.getElementById("cpd_reg_photo_fallback");
    if(photo && fallback){
      if(c.imagem){
        photo.onerror = () => { photo.style.display = "none"; fallback.style.display = "flex"; };
        photo.src = c.imagem;
        photo.alt = c.nome || "";
        photo.style.display = "block";
        fallback.style.display = "none";
      } else {
        photo.removeAttribute("src");
        photo.style.display = "none";
        fallback.style.display = "flex";
      }
    }

    const regScreen = document.getElementById("creature_registro_screen");
    if(regScreen){
      regScreen.className = regScreen.className.replace(/\bcpd-dim-\S+/g, "").trim();
      if(dim) regScreen.classList.add("cpd-dim-" + dim.key);
    }

    hideAllCpdAndOtherScreens();
    if(regScreen) regScreen.style.display = "block";
  }

  /* ---------- wiring geral ---------- */
  function wireCompendioModule(){
    const card = document.getElementById("secret_card_compendio");
    if(card) card.addEventListener("click", showCompendioScreen);

    const backBtn = document.getElementById("cpd_back_btn");
    if(backBtn) backBtn.addEventListener("click", backToSecretFilesFromCpd);

    const regBackBtn = document.getElementById("cpd_reg_back_btn");
    if(regBackBtn) regBackBtn.addEventListener("click", showCompendioScreen);

    const search = document.getElementById("cpd_search");
    if(search){
      search.addEventListener("input", () => {
        cpdSearchTerm = search.value || "";
        renderCpdGrid();
      });
    }
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", wireCompendioModule);
  } else {
    wireCompendioModule();
  }

  /* ---------- ponte somente-leitura para js/criaturas-ficha.js ----------
     Não expõe CPD_CREATURES/CPD_DIMENSOES diretamente (evita qualquer
     módulo externo mutá-los por engano) — apenas getters e a navegação
     de volta, reaproveitando showCompendioScreen já existente. */
  window.__cpdGetCreature = function(id){ return CPD_CREATURES.find(x => x.id === id) || null; };
  window.__cpdGetDimInfo = dimInfo;
  window.__cpdBackToCompendioScreen = function(){
    hideAllCpdAndOtherScreens();
    const el = document.getElementById("creature_compendio_screen");
    if(el) el.style.display = "block";
  };
})();
