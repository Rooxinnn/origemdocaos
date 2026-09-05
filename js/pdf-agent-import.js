/* ==========================================================
   IMPORTAR FICHA PDF — módulo separado (pdf-agent-import.js)

   OBJETIVO (conforme pedido): ler um PDF real e preenchido da ficha
   de Agente (o mesmo template original usado pelo botão "Exportar
   PDF" já existente — ver bloco "EXPORTAÇÃO EM PDF" no index.html) e
   transformá-lo numa ficha NORMAL do sistema, usando a estrutura de
   dados já existente (agentFieldIds / saveAgent-like flow), sem criar
   nenhum formato novo de personagem, nenhuma segunda biblioteca de
   habilidades, nenhum storage paralelo.

   REGRA DE OURO deste módulo: NÃO reimplementa o mapeamento de campos
   do zero. O próprio index.html já contém, no exportador de PDF, o
   mapeamento campo-do-PDF ⇄ campo-da-ficha, construído a partir da
   inspeção geométrica do PDF original (PAGE1_FIELD_MAP, SKILL_PDF_MAP,
   COMBINED_FIELD_MAP, PAGE2_FOOTER_MAP, LONGTEXT_FIELD_MAP). Este
   módulo apenas INVERTE essas mesmas constantes globais (lidas em
   runtime, nunca duplicadas aqui) para ir de PDF -> ficha, em vez de
   ficha -> PDF. Se algum dia o mapeamento de exportação for corrigido
   ou expandido, a importação acompanha automaticamente.

   BIBLIOTECA: reaproveita o pdf-lib já carregado pelo index.html (ver
   <script src=".../pdf-lib.min.js"> no <head>) — não adiciona nenhuma
   dependência nova. Todo o processamento acontece no navegador; o PDF
   nunca é enviado a nenhum servidor.

   DUAS DIVERGÊNCIAS CONHECIDAS em relação ao mapeamento de EXPORTAÇÃO,
   tratadas deliberadamente diferente aqui (documentadas também na
   resposta ao usuário, não escondidas):

   1) "def_i"/"def_c" (DEF I / DEF C): esses campos da ficha HTML são
      somente-leitura ("Calculado automaticamente" — ver placeholder
      no HTML). O PAGE1_FIELD_MAP usado na exportação aponta def_c
      para "Texto14", mas a posição geométrica REAL desse campo no
      PDF original (conferida nas coordenadas /Rect do próprio arquivo
      enviado) fica ALINHADA COM A CAIXA "FADIGA" da arte do template
      (mesma linha/altura de Descanso e Reest.), não com o círculo
      "DEF C" do diagrama de combate. Isso é uma inconsistência já
      existente no exportador (não introduzida por este módulo) — para
      a IMPORTAÇÃO, em vez de repetir o mesmo engano, "Texto14" é
      tratado como FADIGA (ver FADIGA_PDF_FIELD abaixo).

      Na verdade, TODO o bloco ATK N/AB/AF/C, DEF N/AB/I/C e DESV N/O é
      "Calculado automaticamente" na própria ficha HTML (ver o atributo
      placeholder="auto" e title="Calculado automaticamente" em cada um
      desses 10 campos no index.html) — não só DEF I/DEF C. Confirmado
      lendo js/combat-dice-auto.js (recebido): esse módulo já os deixa
      "readonly" e os recalcula sozinho, a cada ~400ms, a partir dos
      valores "Máx." de Marcial/Combate/Força Física/etc. — os mesmos
      campos que este importador já preenche. Ou seja, basta importar
      Marcial/Combate/Força Física/Agilidade/etc. corretamente (como já
      fazemos) que o combat-dice-auto.js recalcula ATK/DEF/DESV sozinho
      assim que a ficha importada é aberta — nenhuma ação extra é
      necessária aqui, e escrever nesses 10 campos a partir do PDF só
      geraria um valor "congelado" imediatamente substituído. Os valores
      que o PDF trouxer para esses campos são apenas informados na
      pré-visualização (categoria "Revisar"), nunca aplicados.

   2) FADIGA MÁXIMA e SAN MÁXIMA: a ficha recalcula Fadiga Máxima
      automaticamente toda vez que uma ficha é aberta (updateFatigue(),
      chamado sem condição em openSheet()) a partir de Fôlego +
      Atletismo + Marcial + Resistência + Resistência Psíquica + 5. Por
      isso este módulo NÃO grava um valor manual de fadiga_max vindo do
      PDF — deixa o próprio sistema recalcular, exatamente como já
      aconteceria com qualquer ficha normal ao ser aberta (instrução:
      não duplicar uma lógica que já existe). Já SAN MÁXIMA não é
      recalculada incondicionalmente em openSheet(), então esse valor É
      importado tal como está no PDF.

   3) DIMENSÃO / ABORTO LÍMBICO (campo "Conexão" do PDF): recebido
      js/marcos-corrupcao-agente.js, agora sei que ensureDimensaoOptions()
      só cria <option> para 7 chaves (Infernal, Arkanjerial, Terrena,
      Carniçal, Sombria, Perdição, Límbica) — "tecnica" (Aborto Límbico),
      "superior" e "especial" são deliberadamente excluídas desse
      <select>. Por isso um valor como "ABORTO" no PDF nunca é tratado
      como Dimensão: é interpretado como o jogador indicando que o
      Aborto Límbico está ativo (#aborto_limbico_ativo), sempre marcado
      para revisão manual, nunca aplicado como certeza.

      Os campos ocultos #marcos_corrupcao_conquistados e
      #marcos_infeccao_conquistados (vistos em marcos-corrupcao-agente.js
      e marcos-infeccao-agente.js) são detectados automaticamente por
      polling a partir de Corrupção/Infecção/Dimensão já importados —
      igual a Habilidades em 50 (checkHabilidades50Unlock()), este
      importador nunca escreve neles diretamente.
   ========================================================== */

(function(){

  /* ---------- Campos ignorados deliberadamente (ver nota acima) ----------
     Os 10 campos de combate abaixo são "Calculado automaticamente" na
     própria ficha (placeholder="auto" / title="Calculado automaticamente"
     em cada um deles no index.html) — nunca são preenchidos a partir do
     PDF, só informados na pré-visualização. */
  const SKIP_HTML_IDS = new Set([
    "atk_n", "atk_ab", "atk_af", "atk_c",
    "def_n", "def_ab", "def_i", "def_c",
    "desv_n", "desv_o"
  ]);
  // Posição real (por coordenadas) do campo de FADIGA no PDF original —
  // ver item (1) da nota acima. Não existe no PAGE1_FIELD_MAP porque o
  // exportador atual não escreve Fadiga nessa caixa (ela vai para uma
  // página extra do PDF exportado); ao IMPORTAR, se o valor estiver lá
  // (como no PDF de referência enviado), aproveitamos.
  const FADIGA_PDF_FIELD = "Texto14";

  /* ---------- Rótulos legíveis para a pré-visualização ---------- */
  const PAGE1_LABELS = {
    nome: "Nome do Agente", profissao: "Profissão", idade: "Idade",
    exp: "EXP", nivel: "Nível",
    atk_n: "ATK N", atk_ab: "ATK AB", atk_af: "ATK AF", atk_c: "ATK C",
    def_n: "DEF N", def_ab: "DEF AB",
    protecao: "Proteção", descanso: "Descanso", reest: "Reestruturação",
    peso_total: "Peso Total"
  };
  const FOOTER_LABELS = {
    pontos_acumulados: "Pontos Acumulados",
    nivel_mov: "Nível de Movimentação",
    dinheiro: "Dinheiro"
  };
  const LONGTEXT_LABELS = {
    cond_psi: "Condições Psicológicas", cond_fis: "Condições Físicas",
    itens: "Itens do Agente", conexoes: "Conexões", anotacoes: "Anotações"
  };

  // id -> {label, categoria} a partir dos arrays já existentes na ficha
  // (nenhuma lista nova é criada — só um índice de consulta em memória
  // para exibir a pré-visualização).
  function buildSkillLabelIndex(){
    const idx = {};
    (typeof HABILIDADES !== "undefined" ? HABILIDADES : []).forEach(([id, label]) => idx[id] = { label, categoria: "Habilidades" });
    (typeof TALENTOS !== "undefined" ? TALENTOS : []).forEach(([id, label]) => idx[id] = { label, categoria: "Talentos" });
    (typeof ATRIBUTOS !== "undefined" ? ATRIBUTOS : []).forEach(([id, label]) => idx[id] = { label, categoria: "Atributos" });
    (typeof PERICIAS !== "undefined" ? PERICIAS : []).forEach(([id, label]) => idx[id] = { label, categoria: "Perícias" });
    return idx;
  }

  /* ---------- Leitura do PDF (campos de texto do AcroForm) ---------- */
  async function readPdfTextFields(fileBytes){
    const pdfDoc = await PDFLib.PDFDocument.load(fileBytes, { ignoreEncryption: true });
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    const raw = {}; // nome do campo PDF -> valor de texto (string)
    const consumedNames = new Set();
    fields.forEach(f => {
      const name = f.getName();
      // Só nos interessam campos de TEXTO (Pontos, Nome, Itens, etc.).
      // Os campos de botão/rádio (círculos D4/D6/D8/D12/D20, "Group18",
      // checkboxes numerados) só existem para a aparência impressa do
      // PDF e não têm equivalente na ficha HTML (que calcula a
      // progressão de dado sozinha a partir do valor Máx. — ver
      // updateDiceTiers()) — por isso são ignorados aqui de propósito,
      // não por descuido.
      if(typeof f.getText === "function"){
        let value = "";
        try{ value = (f.getText() || "").toString(); }catch(e){ value = ""; }
        raw[name] = value;
      }
    });
    return { raw, consumedNames };
  }

  /* ---------- Comparação aproximada de nomes (Conexões) ----------
     Tolera: abreviação (menos palavras), pequenos erros de digitação,
     diferenças de acento/caixa, singular/plural — sem "inventar"
     correspondência: quando mais de uma Conexão é igualmente plausível,
     isso é sinalizado em vez de escolhido silenciosamente. */
  const CONN_STOPWORDS = new Set(["de","da","do","das","dos","e","a","o","as","os","em","com","para","um","uma","à","ao"]);

  function significantTokens(normText){
    return (normText || "").split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !CONN_STOPWORDS.has(t));
  }

  function levenshtein(a, b){
    const m = a.length, n = b.length;
    if(m === 0) return n;
    if(n === 0) return m;
    let prev = [];
    for(let j = 0; j <= n; j++) prev[j] = j;
    for(let i = 1; i <= m; i++){
      const cur = [i];
      for(let j = 1; j <= n; j++){
        const cost = a[i-1] === b[j-1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + cost);
      }
      prev = cur;
    }
    return prev[n];
  }

  // Duas palavras "batem" se forem iguais, uma for prefixo da outra
  // (abreviação/plural: "infernal"/"infernais") ou a distância de edição
  // for pequena o bastante para o tamanho da palavra (erro de digitação).
  function tokensMatch(t1, t2){
    if(t1 === t2) return true;
    if(t1.length >= 4 && t2.length >= 4 && (t1.startsWith(t2) || t2.startsWith(t1))) return true;
    const maxLen = Math.max(t1.length, t2.length);
    const tolerance = maxLen <= 4 ? 1 : (maxLen <= 8 ? 2 : 3);
    return levenshtein(t1, t2) <= tolerance;
  }

  // Fração dos tokens significativos do CANDIDATO (texto do PDF) que
  // encontram correspondência no nome oficial — permite que o PDF tenha
  // MENOS palavras que o nome oficial (abreviação) sem penalizar.
  function connectionMatchScore(candidateTokens, officialTokens){
    if(candidateTokens.length === 0 || officialTokens.length === 0) return 0;
    let matched = 0;
    candidateTokens.forEach(ct => { if(officialTokens.some(ot => tokensMatch(ct, ot))) matched++; });
    return matched / candidateTokens.length;
  }

  function buildOfficialConnectionIndex(){
    if(typeof CONEXOES_DATA === "undefined") return [];
    return CONEXOES_DATA.map(c => ({ name: c.n, norm: normalizeText(c.n), tokens: significantTokens(normalizeText(c.n)) }));
  }

  // Para um texto candidato já normalizado, retorna as Conexões oficiais
  // plausíveis, da mais para a menos provável. score=1 com exact=true
  // quando o texto bate normalizado 100% (só acento/caixa de diferença).
  function findConnectionCandidates(candidateNorm, officialIndex){
    if(!candidateNorm) return [];
    const cTokens = significantTokens(candidateNorm);
    const scored = [];
    officialIndex.forEach(o => {
      if(o.norm === candidateNorm){ scored.push({ name: o.name, score: 1, exact: true }); return; }
      const score = connectionMatchScore(cTokens, o.tokens);
      if(score >= 0.6) scored.push({ name: o.name, score, exact: false });
    });
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  /* ---------- Divide "12/12" -> {atual:"12", max:"12"} ---------- */
  function splitAtualMax(value){
    const v = (value || "").toString().trim();
    if(!v) return { atual: "", max: "" };
    const parts = v.split("/");
    if(parts.length >= 2){
      return { atual: parts[0].trim(), max: parts.slice(1).join("/").trim() };
    }
    return { atual: "", max: v }; // valor único (ex.: "1") -> só Máx., como já pedido
  }

  // Restaura o sufixo fixo que o exportador remove ao escrever no PDF
  // (ver stripFixedSuffix() no bloco de exportação) — só adiciona de
  // volta se o valor lido do PDF ainda não o contiver.
  function restoreFixedSuffix(value, suffixNumber){
    const v = (value || "").toString().trim();
    if(!v) return "";
    if(new RegExp("/\\s*" + suffixNumber + "\\s*$").test(v)) return v;
    return v + "/" + suffixNumber;
  }

  /* ---------- Comparação de texto tolerante a acentos/caixa ---------- */
  function normalizeText(s){
    return (s || "").toString()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().trim();
  }

  // Corta qualquer texto antes de ir para a tela — nenhuma linha do
  // relatório deve conseguir despejar um parágrafo inteiro (é exatamente
  // o problema relatado: telas cheias de blocos de texto gigantes).
  function truncateForDisplay(s, maxLen){
    const str = (s === undefined || s === null) ? "" : String(s);
    if(str.length <= maxLen) return str;
    return str.slice(0, maxLen).trim() + "…";
  }

  /* ==========================================================
     ANÁLISE PRINCIPAL: PDF (bytes) -> relatório de importação
     { agentData, ok:[], revisar:[], naoMapeado:[], erroFatal }
     ========================================================== */
  async function analyzePdf(fileBytes, fileName){
    const report = { fileName, ok: [], revisar: [], naoMapeado: [], agentData: null, nomeFicha: "", errorFatal: null };

    let raw, formOk = true;
    try{
      const res = await readPdfTextFields(fileBytes);
      raw = res.raw;
    }catch(e){
      report.errorFatal = "Não foi possível ler este arquivo como um PDF de formulário válido. Verifique se o arquivo não está corrompido e se é o PDF de ficha de Agente (com campos preenchíveis).";
      return report;
    }
    if(!raw || Object.keys(raw).length === 0){
      report.errorFatal = "Este PDF não possui campos de formulário (AcroForm). Ele pode ser um PDF apenas visual (ficha \"achatada\"/escaneada), que este importador ainda não sabe ler. Envie o PDF original preenchível.";
      return report;
    }

    const consumed = new Set(); // nomes de campo do PDF já usados por algum mapeamento
    const agentData = {};
    // Começa com TODOS os campos da ficha em branco — a ficha importada
    // deve ser equivalente a "Criar Nova Ficha" + preenchimento (instrução
    // 26), nunca herdar sujeira de outra ficha.
    (typeof agentFieldIds === "function" ? agentFieldIds() : []).forEach(id => { agentData[id] = ""; });

    function markOk(categoria, label, value){ report.ok.push({ categoria, label, value }); }
    function markRevisar(categoria, label, value, motivo){ report.revisar.push({ categoria, label, value, motivo }); }

    /* ---- Identificação + combate (PAGE1_FIELD_MAP) ----
       Campos em SKIP_HTML_IDS (ATK/DEF/DESV) são "Calculado
       automaticamente" na ficha — funcionam sozinhos, não é um problema
       nem precisa de revisão, então nem entram no relatório (evita
       repetir o mesmo aviso 10 vezes). */
    if(typeof PAGE1_FIELD_MAP === "object"){
      Object.entries(PAGE1_FIELD_MAP).forEach(([htmlId, pdfField]) => {
        consumed.add(pdfField);
        if(SKIP_HTML_IDS.has(htmlId)) return;
        const value = raw[pdfField];
        if(value === undefined || value === "") return;
        agentData[htmlId] = value;
        markOk("Identificação/Combate", PAGE1_LABELS[htmlId] || htmlId, value);
      });
    }
    if(agentData.nome) report.nomeFicha = agentData.nome;

    /* ---- HP e Sanidade (campo único "atual / máx." no PDF original) ---- */
    if(typeof COMBINED_FIELD_MAP !== "undefined"){
      COMBINED_FIELD_MAP.forEach(combo => {
        consumed.add(combo.pdfField);
        const value = raw[combo.pdfField];
        if(value === undefined || value === "") return;
        const { atual, max } = splitAtualMax(value);
        agentData[combo.atualId] = atual;
        agentData[combo.maxId] = max;
        const label = combo.pdfField === "HP" ? "HP" : "Sanidade";
        markOk("Identificação/Combate", label, value);
      });
    }

    /* ---- Infecção / Corrupção (o template imprime "/70" e "/200" como
       arte fixa; a ficha guarda o valor completo "atual/limite") ---- */
    ["Infecção", "Corrupção"].forEach(pdfField => {
      consumed.add(pdfField);
      const raw_v = raw[pdfField];
      if(raw_v === undefined || raw_v === "") return;
      const htmlId = pdfField === "Infecção" ? "infeccao" : "corrupcao";
      const limite = pdfField === "Infecção" ? 70 : 200;
      const full = restoreFixedSuffix(raw_v, limite);
      agentData[htmlId] = full;
      markOk("Identificação/Combate", pdfField, full);
    });

    /* ---- Fadiga (ver nota (1)/(2) no topo do arquivo) ---- */
    consumed.add(FADIGA_PDF_FIELD);
    const fadigaRaw = raw[FADIGA_PDF_FIELD];
    if(fadigaRaw){
      const { atual, max } = splitAtualMax(fadigaRaw);
      if(atual) agentData.fadiga_atual = atual;
      // fadiga_max é deliberadamente OMITIDO — ver nota (2): o sistema
      // recalcula sozinho ao abrir a ficha (updateFatigue()).
      markRevisar(
        "Identificação/Combate", "Fadiga Máxima", max || "—",
        "Recalculada automaticamente pela ficha ao abrir — pode não bater com o valor do PDF."
      );
    }

    /* ---- Rodapé da página 2 ---- */
    if(typeof PAGE2_FOOTER_MAP === "object"){
      Object.entries(PAGE2_FOOTER_MAP).forEach(([htmlId, pdfField]) => {
        consumed.add(pdfField);
        const value = raw[pdfField];
        if(value === undefined || value === "") return;
        agentData[htmlId] = value;
        markOk("Identificação/Combate", FOOTER_LABELS[htmlId] || htmlId, value);
      });
    }

    /* ---- Textos longos: Condições, Itens, Conexões, Anotações ---- */
    if(typeof LONGTEXT_FIELD_MAP === "object"){
      Object.entries(LONGTEXT_FIELD_MAP).forEach(([htmlId, pdfField]) => {
        consumed.add(pdfField);
        const value = raw[pdfField];
        if(value === undefined || value === "") return;
        agentData[htmlId] = value; // preservado integralmente, sem resumir/reescrever
        markOk("Textos", LONGTEXT_LABELS[htmlId] || htmlId, value.length > 60 ? (value.slice(0, 60) + "…") : value);
      });
    }

    /* ---- Conexões: vincular ao Compêndio (js/character-connections.js) ----
       O texto de "conexoes" (acima) já preserva tudo integralmente — isto
       aqui é ADICIONAL: procura, DENTRO DESSE MESMO CAMPO (só o que a
       ficha realmente lista como Conexões — nada de outras páginas,
       Itens ou Anotações), linhas que provavelmente são o nome de uma
       Conexão oficial já cadastrada em CONEXOES_DATA, e vincula de
       verdade usando exatamente o mesmo mecanismo que o próprio módulo
       já expõe para isso: o array de nomes gravado em
       #agente_conexoes_ids. Nenhuma biblioteca nova, nenhum campo novo.

       IMPORTANTE (ajuste depois de um relato de falso positivo): uma
       versão anterior também vasculhava Itens/Condições/Anotações e o
       texto de todas as páginas do PDF (via pdf.js) atrás de nomes de
       Conexão soltos em qualquer lugar. Isso causava um problema sério:
       texto solto sem relação nenhuma com Conexões podia coincidir com
       palavras de uma Conexão de OUTRA Dimensão (ex.: uma ficha só com
       Conexões de Perdição acabava ganhando uma Conexão Infernal, só por
       semelhança de palavras em texto que não tinha nada a ver com
       Conexões). Para eliminar esse risco, a busca agora fica restrita
       SOMENTE ao campo "Conexões" da própria ficha — é o único lugar
       onde temos certeza de que o texto realmente pretende listar
       Conexões. O pdf.js (extração de todas as páginas) não é mais
       usado para isto.

       Comparação TOLERANTE (não exige texto idêntico): ignora acentos/
       caixa, ignora artigos ("do"/"da"/"e"...), tolera abreviação (menos
       palavras que o nome oficial, ex. "Selamento Infernal" ->
       "Círculo do Selamento Infernal") e pequenos erros de digitação
       (distância de edição pequena por palavra). Nunca escolhe "às
       cegas": quando mais de uma Conexão fica igualmente plausível, isso
       vai para "Revisar" como ambíguo, sem vincular nenhuma das duas. */
    agentData.agente_conexoes_ids = "[]";
    const officialConnIndex = buildOfficialConnectionIndex();
    if(officialConnIndex.length){
      const matchedNamesSet = new Set();
      const seenNormLines = new Set();
      const conexoesRawText = raw[LONGTEXT_FIELD_MAP && LONGTEXT_FIELD_MAP.conexoes] || "";
      // Blocos de descrição longa (itens/habilidades personalizadas com
      // "Corrupção:", "Consumo:", "Efeito:" etc.) não são nomes de
      // Conexão — em vez de despejar cada um inteiro como uma linha de
      // "não mapeado" (tela cheia de parágrafos gigantes), só CONTAMOS
      // quantos apareceram e mostramos UMA linha resumida no final.
      let longBlockCount = 0;

      function processCandidateLine(rawLine){
        // Normaliza espaço não separável (comum em texto colado do Word)
        // e afins antes de aparar — .trim() sozinho não remove isso.
        const trimmed = (rawLine || "").replace(/[\u00A0\u200B]/g, " ").trim();
        if(!trimmed) return;
        // Bloco de descrição longa (item/arma/habilidade com mecânicas
        // próprias, frase corrida etc.) não é uma linha de "nome".
        if(trimmed.length > 70 || trimmed.includes("{") || trimmed.includes(":")){
          longBlockCount++;
          return;
        }
        const nameOnly = trimmed.replace(/\(\s*\d+\s*\)\s*$/, "").trim();
        const norm = normalizeText(nameOnly);
        if(!norm || seenNormLines.has(norm)) return;
        seenNormLines.add(norm);

        const scored = findConnectionCandidates(norm, officialConnIndex);
        if(scored.length === 0){
          report.naoMapeado.push({ campo: "Conexão", valor: truncateForDisplay(trimmed, 60), motivo: "Não encontrada no Compêndio — o texto completo continua preservado no campo Conexões." });
          return;
        }
        const top = scored[0];
        if(top.exact){
          if(!matchedNamesSet.has(top.name)){
            matchedNamesSet.add(top.name);
            markOk("Conexões", top.name, "vinculada ao Compêndio");
          }
          return;
        }
        const second = scored[1];
        const ambiguous = !!second && (top.score - second.score) < 0.15;
        if(ambiguous){
          const opts = scored.slice(0, 3).map(s => s.name).join(", ");
          markRevisar("Conexões", truncateForDisplay(trimmed, 40), "?", "Mais de uma parecida (" + opts + ") — nenhuma vinculada automaticamente; verifique qual é a correta.");
        } else if(top.score >= 0.85){
          // Limiar alto de propósito: só vincula por aproximação quando
          // (quase) todas as palavras relevantes do texto do PDF batem
          // com o nome oficial — reduz o risco de "coincidência" com uma
          // Conexão de outra Dimensão.
          if(!matchedNamesSet.has(top.name)){
            matchedNamesSet.add(top.name);
            markRevisar("Conexões", top.name, "PDF: \"" + truncateForDisplay(trimmed, 30) + "\"", "Correspondência aproximada (não é o nome exato) — confirme se é essa mesmo a Conexão pretendida.");
          }
        } else {
          report.naoMapeado.push({ campo: "Conexão", valor: truncateForDisplay(trimmed, 60), motivo: "Não encontrada no Compêndio — o texto completo continua preservado no campo Conexões." });
        }
      }

      conexoesRawText.split(/\r\n|\r|\n/).forEach(processCandidateLine);

      if(matchedNamesSet.size){
        agentData.agente_conexoes_ids = JSON.stringify(Array.from(matchedNamesSet));
      }
      if(longBlockCount > 0){
        report.naoMapeado.push({
          campo: "Conexões (texto longo)",
          valor: longBlockCount + " bloco" + (longBlockCount === 1 ? "" : "s"),
          motivo: "Parecem ser itens/habilidades personalizadas (têm \"Corrupção:\", \"Consumo:\", \"Efeito:\" etc.), não nomes de Conexão — não foram comparados ao Compêndio. O texto completo continua preservado no campo Conexões."
        });
      }
    }

    /* ---- Habilidades / Talentos / Atributos / Perícias ---- */
    const labelIdx = buildSkillLabelIndex();
    if(typeof SKILL_PDF_MAP === "object"){
      Object.entries(SKILL_PDF_MAP).forEach(([skillId, info]) => {
        consumed.add(info.pontos);
        // Os campos de "tiers" (círculos D4/D6/D8/D12/D20) são só para a
        // aparência do PDF impresso — a ficha HTML calcula isso sozinha
        // a partir do valor Máx. (updateDiceTiers()), então não são lidos.
        (info.tiers || []).forEach(t => consumed.add(t.field));
        const pontosRaw = raw[info.pontos];
        if(pontosRaw === undefined || pontosRaw === "") return; // perícia vazia -> continua vazia (instrução 11)
        const { atual, max } = splitAtualMax(pontosRaw);
        agentData[skillId] = max;
        agentData[skillId + "_atual"] = atual;
        const info2 = labelIdx[skillId] || { label: skillId, categoria: "Outros" };
        markOk(info2.categoria, info2.label, pontosRaw);
      });
    }

    /* ---- Dimensão / Aborto Límbico (campo "Conexão" no PDF) ----
       Agora que recebi js/marcos-corrupcao-agente.js, sei exatamente
       como o <select id="dimensao"> é montado (ensureDimensaoOptions()):
       as ÚNICAS <option> que ele cria vêm de CONEXOES_DIM_ORDER MENOS
       "tecnica"/"superior"/"especial" — ou seja, só as 7 Dimensões de
       Corrupção de verdade (Infernal, Arkanjerial, Terrena, Carniçal,
       Sombria, Perdição, Límbica). "Aborto Límbico" (chave "tecnica")
       NUNCA aparece nesse <select> — é um mecanismo à parte, com seu
       próprio interruptor (#aborto_limbico_ativo).
       Por isso o texto "ABORTO" que o PDF traz no campo Conexão não é
       uma Dimensão: é o jogador indicando que o Aborto Límbico está
       ativo. Nunca escrevo em #dimensao usando a chave "tecnica" (essa
       opção não existe de verdade na tela); no máximo sugiro ligar
       #aborto_limbico_ativo, sempre para revisão manual — nunca como
       "identificado" com certeza, já que é uma inferência sobre uma
       palavra solta escrita à mão. */
    const REAL_DIM_KEYS = ["infernal", "arkanjerial", "terrena", "carnical", "sombria", "perdicao", "limbica"];
    consumed.add("Conexão");
    const conexaoRaw = raw["Conexão"];
    if(conexaoRaw){
      const norm = normalizeText(conexaoRaw);
      let candidateDimKey = null;
      REAL_DIM_KEYS.forEach(key => {
        if(candidateDimKey) return;
        const normLabel = normalizeText((typeof CONEXOES_DIM_LABELS === "object" && CONEXOES_DIM_LABELS[key]) || key);
        if(normLabel === norm || normLabel.includes(norm) || norm.includes(normLabel)) candidateDimKey = key;
      });
      const looksLikeAborto = /aborto|limbic/.test(norm);

      if(candidateDimKey){
        agentData.dimensao = candidateDimKey;
        markRevisar("Identificação/Combate", "Dimensão", conexaoRaw,
          "Palpite a partir do campo Conexão do PDF — confirme no menu Dimensão da ficha.");
      } else if(looksLikeAborto){
        agentData.aborto_limbico_ativo = "1";
        markRevisar("Identificação/Combate", "Aborto Límbico", conexaoRaw,
          "Ativado a partir do campo Conexão do PDF — confirme manualmente na ficha.");
      } else {
        report.naoMapeado.push({ campo: "Conexão", valor: conexaoRaw, motivo: "Não foi possível relacionar este texto a nenhuma Dimensão nem ao Aborto Límbico." });
      }
    }

    /* ---- Foto: só é importada se existir um campo de FORMULÁRIO com
       esse propósito explícito no PDF. Este template não tem um campo
       de foto no AcroForm — isso é normal para esta ficha, então não
       gera aviso (só entra em Revisar se um campo de foto for encontrado
       mas não puder ser extraído, que aí sim é algo que pode precisar
       de atenção). */
    const fotoFieldNames = Object.keys(raw).filter(n => /foto|photo|imagem/i.test(n));
    fotoFieldNames.forEach(n => {
      consumed.add(n);
      markRevisar("Outros", "Foto", n, "Campo de foto encontrado no PDF, mas este módulo ainda não extrai imagens automaticamente — adicione a foto manualmente na ficha.");
    });

    /* ---- Campos do PDF não consumidos por nenhum mapeamento acima ---- */
    Object.entries(raw).forEach(([name, value]) => {
      if(consumed.has(name)) return;
      if(value === "") return; // campo vazio e desconhecido não interessa
      report.naoMapeado.push({ campo: name, valor: value, motivo: "Campo presente no PDF sem correspondência conhecida na ficha." });
    });

    // Filtra agentData só para ids que realmente existem na ficha atual
    // (mesma proteção já usada pela importação de JSON existente).
    const validIds = new Set(typeof agentFieldIds === "function" ? agentFieldIds() : []);
    Object.keys(agentData).forEach(k => { if(!validIds.has(k)) delete agentData[k]; });

    report.agentData = agentData;
    return report;
  }

  /* ==========================================================
     UI — MODAL DE IMPORTAÇÃO
     ========================================================== */
  const STATUS_ICON = { ok: "✓", warn: "⚠", unmapped: "?" };

  function rowHtml(kind, label, value){
    const cls = kind === "ok" ? "pdfimp-ok" : kind === "warn" ? "pdfimp-warn" : "pdfimp-unmapped";
    const icon = kind === "ok" ? STATUS_ICON.ok : kind === "warn" ? STATUS_ICON.warn : STATUS_ICON.unmapped;
    const safeLabel = truncateForDisplay(label, 70);
    const safeValue = value === undefined || value === null || value === "" ? "" : truncateForDisplay(value, 70);
    return '<div class="pdfimp-row ' + cls + '">' +
      '<span class="pdfimp-icon">' + icon + '</span>' +
      '<span class="pdfimp-label">' + escapeHtml(safeLabel) + '</span>' +
      '<span class="pdfimp-value">' + escapeHtml(safeValue) + '</span>' +
      '</div>';
  }

  function groupBy(list, keyFn){
    const groups = {};
    list.forEach(item => {
      const k = keyFn(item);
      (groups[k] = groups[k] || []).push(item);
    });
    return groups;
  }

  // Evita listas gigantes dentro de uma seção já aberta (ex.: muitas
  // Conexões não localizadas): mostra os primeiros N e esconde o resto
  // atrás de um "Mostrar mais", em vez de despejar tudo de uma vez.
  const PDFIMP_PAGE_SIZE = 8;
  function renderRowsPaginated(items, renderOneFn){
    let html = "";
    const head = items.slice(0, PDFIMP_PAGE_SIZE);
    const rest = items.slice(PDFIMP_PAGE_SIZE);
    head.forEach(i => { html += renderOneFn(i); });
    if(rest.length){
      html += '<details class="pdfimp-subgroup"><summary>Mostrar mais <span class="pdfimp-count">' + rest.length + '</span></summary>';
      rest.forEach(i => { html += renderOneFn(i); });
      html += '</details>';
    }
    return html;
  }

  function renderReport(report){
    const body = document.getElementById("pdfimp_body");
    if(report.errorFatal){
      body.innerHTML = '<div class="pdfimp-error">✕ ' + escapeHtml(report.errorFatal) + '</div>';
      document.getElementById("pdfimp_confirm").style.display = "none";
      return;
    }
    document.getElementById("pdfimp_confirm").style.display = "";

    let html = '<div class="pdfimp-summary">Arquivo: <span class="pdfimp-filename">' + escapeHtml(report.fileName) + '</span>'
      + (report.nomeFicha ? (' — Agente: <span class="pdfimp-filename">' + escapeHtml(report.nomeFicha) + '</span>') : '')
      + '</div>';

    // "Revisar" vem primeiro e já aberto — é a parte que precisa de atenção.
    // "Identificados" e "Não mapeados" ficam fechados por padrão (um clique
    // no cabeçalho abre) para não afundar o que importa numa lista enorme.
    if(report.revisar.length){
      html += '<details class="pdfimp-section pdfimp-section-warn" open>' +
        '<summary>⚠ Revisar <span class="pdfimp-count">' + report.revisar.length + '</span></summary>' +
        '<div class="pdfimp-section-body">';
      html += renderRowsPaginated(report.revisar, i =>
        rowHtml("warn", i.label, i.value) +
        '<div style="font-size:11px; opacity:.65; margin:-2px 0 8px 26px;">' + escapeHtml(i.motivo) + '</div>'
      );
      html += '</div></details>';
    }

    if(report.naoMapeado.length){
      html += '<details class="pdfimp-section pdfimp-section-unmapped">' +
        '<summary>? Não mapeados <span class="pdfimp-count">' + report.naoMapeado.length + '</span></summary>' +
        '<div class="pdfimp-section-body">';
      html += renderRowsPaginated(report.naoMapeado, i =>
        rowHtml("unmapped", i.campo, i.valor) +
        (i.motivo ? '<div style="font-size:11px; opacity:.65; margin:-2px 0 8px 26px;">' + escapeHtml(i.motivo) + '</div>' : '')
      );
      html += '</div></details>';
    }

    if(report.ok.length){
      const groups = groupBy(report.ok, i => i.categoria);
      html += '<details class="pdfimp-section pdfimp-section-ok">' +
        '<summary>✓ Identificados <span class="pdfimp-count">' + report.ok.length + '</span></summary>' +
        '<div class="pdfimp-section-body">';
      Object.keys(groups).forEach(cat => {
        html += '<details class="pdfimp-subgroup"><summary>' + escapeHtml(cat) + ' <span class="pdfimp-count">' + groups[cat].length + '</span></summary>';
        groups[cat].forEach(i => { html += rowHtml("ok", i.label, i.value); });
        html += '</details>';
      });
      html += '</div></details>';
    }

    if(!report.ok.length && !report.revisar.length && !report.naoMapeado.length){
      html += '<div class="pdfimp-empty-note">Nenhum dado reconhecível foi encontrado neste PDF.</div>';
    }

    body.innerHTML = html;
  }

  let __pdfimpCurrentReport = null;

  function openPdfImportModal(){
    document.getElementById("pdfimp_modal").style.display = "flex";
    document.getElementById("pdfimp_body").innerHTML = '<div class="pdfimp-loading">Selecione um arquivo PDF para começar.</div>';
    document.getElementById("pdfimp_confirm").style.display = "none";
    __pdfimpCurrentReport = null;
  }
  function closePdfImportModal(){
    document.getElementById("pdfimp_modal").style.display = "none";
    __pdfimpCurrentReport = null;
  }

  async function handleFileChosen(file){
    const body = document.getElementById("pdfimp_body");
    document.getElementById("pdfimp_confirm").style.display = "none";
    body.innerHTML = '<div class="pdfimp-loading">Lendo PDF…</div>';
    if(typeof PDFLib === "undefined"){
      body.innerHTML = '<div class="pdfimp-error">✕ A biblioteca de PDF (pdf-lib) não carregou. Verifique sua conexão com a internet e tente novamente.</div>';
      return;
    }
    if(!file || !/\.pdf$/i.test(file.name)){
      body.innerHTML = '<div class="pdfimp-error">✕ Selecione um arquivo .pdf.</div>';
      return;
    }
    try{
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const report = await analyzePdf(bytes, file.name);
      __pdfimpCurrentReport = report;
      renderReport(report);
    }catch(e){
      console.error("[Importar Ficha PDF]", e);
      body.innerHTML = '<div class="pdfimp-error">✕ Não foi possível processar este PDF agora. Verifique o console para detalhes e tente de novo.</div>';
    }
  }

  async function confirmImport(){
    if(!__pdfimpCurrentReport || !__pdfimpCurrentReport.agentData) return;
    const btn = document.getElementById("pdfimp_confirm");
    btn.disabled = true;
    const originalLabel = btn.textContent;
    btn.textContent = "Importando…";
    try{
      const agentData = __pdfimpCurrentReport.agentData;
      const id = genSheetId();
      const nomeBase = (agentData.nome || "").trim() || "Ficha sem nome";
      const res = await storageSet(sheetStorageKey(id), JSON.stringify(agentData), 1, true);
      if(!res){
        alert("Não foi possível salvar a ficha importada. Tente novamente.");
        return;
      }
      sheetsIndex.push({ id, nome: nomeBase + " (Importada de PDF)", updatedAt: Date.now() });
      await saveSheetsIndex();
      closePdfImportModal();
      renderSheetCards();
      await openSheet(id);
      flashIndicator("✓ Ficha importada do PDF com sucesso!", false, 2800);
    }catch(e){
      console.error("[Importar Ficha PDF]", e);
      alert("Não foi possível importar esta ficha agora. Tente novamente.");
    }finally{
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }

  /* ---------- Ligações de eventos (executa quando o DOM já existe) ---------- */
  function init(){
    const btnOpen = document.getElementById("btn_import_pdf_welcome");
    const input = document.getElementById("input_import_pdf");
    const btnClose = document.getElementById("pdfimp_close");
    const btnCancel = document.getElementById("pdfimp_cancel");
    const btnConfirm = document.getElementById("pdfimp_confirm");
    if(!btnOpen || !input || !btnClose || !btnCancel || !btnConfirm) return; // integração mínima ausente no HTML

    btnOpen.addEventListener("click", () => {
      openPdfImportModal();
      input.value = "";
      input.click();
    });
    input.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if(file) handleFileChosen(file);
    });
    btnClose.addEventListener("click", closePdfImportModal);
    btnCancel.addEventListener("click", closePdfImportModal);
    btnConfirm.addEventListener("click", confirmImport);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
