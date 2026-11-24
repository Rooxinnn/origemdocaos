/* Importação do formulário PDF oficial de criatura para a ficha existente.
   As caixas "Texto..." foram conferidas por posição no PDF de criatura;
   nunca se usa o mapa da ficha de Agente, que tem nomes parecidos. */
(function(){
  "use strict";

  const BASIC = [
    ["cr_nome", "Texto1", "Nome"],
    ["cr_periculosidade", "Texto2", "Periculosidade"],
    ["cr_nivel", "Texto4", "Nível"],
    ["cr_impacto_sanidade", "Texto5", "Impacto de Sanidade"],
    ["cr_raca", "Texto14", "Raça"],
    ["cr_atk_n", "Texto7", "ATK N"],
    ["cr_atk_ab", "Texto8", "ATK AB"],
    ["cr_atk_af", "Texto9", "ATK AF"],
    ["cr_atk_c", "Texto10", "ATK C"],
    ["cr_def_n", "Texto11", "DEF N"],
    ["cr_def_ab", "Texto12", "DEF AB"],
    ["cr_def_c", "Texto13", "DEF C"],
    ["cr_desv_n", "Texto15", "DESV N"],
    ["cr_desv_o", "Texto16", "DESV O"],
    ["cr_movs", "MOVS", "MOVS"],
    ["cr_res_n", "Resistência Natural", "RES N"],
    ["cr_peso_total", "Peso Total", "Peso Total"],
    ["cr_condicoes", "Condições Físicas", "Condições Físicas"],
    ["cr_itens", "Itens da criatura", "Itens da Criatura"],
    ["cr_movimentos", "Texto67", "Movimentos, Conexões e Habilidades"]
  ];
  const COMBINED = [
    ["HP", "cr_hp_atual", "cr_hp_max"],
    ["Sanidade", "cr_san_atual", "cr_san_max"],
    ["Proteção", "cr_protecao_atual", "cr_protecao_max"],
    ["Pontos de Batalha", "cr_pb_atual", "cr_pb_max"]
  ];
  // Cada coluna do formulário agrupa as linhas na ordem visual indicada.
  // As lacunas em Texto39/52 não são pontos: pertencem a outros widgets.
  const SKILLS = [
    ["Habilidades", [
      ["cr_hab_arrombamento",21,"Arrombamento"], ["cr_hab_ferramenta",22,"Ferramenta"],
      ["cr_hab_roubo",23,"Roubo"], ["cr_hab_flexibilidade",24,"Flexibilidade"],
      ["cr_hab_natacao",25,"Natação"], ["cr_hab_atletismo",26,"Atletismo"],
      ["cr_hab_sentido_paranormal",27,"Sentido Paranormal"],
      ["cr_hab_ilusionismo",28,"Ilusionismo"], ["cr_hab_manipulacao",29,"Manipulação"]
    ]],
    ["Talentos", [
      ["cr_tal_intimidacao",30,"Intimidação"], ["cr_tal_trabalho_equipe",31,"Trabalho em Equipe"],
      ["cr_tal_silencioso",32,"Silencioso"], ["cr_tal_percepcao",33,"Percepção"],
      ["cr_tal_rastrear",34,"Rastrear"], ["cr_tal_mirar",35,"Mirar"],
      ["cr_tal_observador",36,"Observador"], ["cr_tal_lideranca",37,"Liderança"],
      ["cr_tal_folego",38,"Fôlego"], ["cr_tal_combate",40,"Combate"],
      ["cr_tal_criminalidade",41,"Criminalidade"], ["cr_tal_adaptacao",42,"Adaptação"]
    ]],
    ["Atributos", [
      ["cr_atr_agilidade",43,"Agilidade"], ["cr_atr_velocidade",44,"Velocidade"],
      ["cr_atr_forca_fisica",45,"Força Física"], ["cr_atr_resistencia",46,"Resistência"],
      ["cr_atr_inteligencia",47,"Inteligência"], ["cr_atr_logica",48,"Lógica"],
      ["cr_atr_assimilacao",49,"Assimilação"], ["cr_atr_resistencia_psiquica",50,"Resistência Psíquica"],
      ["cr_atr_ocultismo",51,"Ocultismo"], ["cr_atr_aparencia",53,"Aparência"],
      ["cr_atr_carisma",54,"Carisma"], ["cr_atr_saude",55,"Saúde"]
    ]],
    ["Perícias", [
      ["cr_per_obediencia",56,"Obediência"], ["cr_per_investigativa",57,"Perícia Investigativa"],
      ["cr_per_radar",58,"Perícia em Radar"], ["cr_per_memorizacao",59,"Perícia em Memorização"],
      ["cr_per_idiomas",60,"Idiomas"], ["cr_per_idioma_antigo",61,"Idioma Antigo"],
      ["cr_per_armas_brancas",62,"Perícia em Armas Brancas"],
      ["cr_per_armas_fogo",63,"Perícia em Armas de Fogo"],
      ["cr_per_explosivos",64,"Perícia em Explosivos"],
      ["cr_per_tortura",65,"Perícia em Tortura"], ["cr_per_montaria",66,"Perícia em Montaria"]
    ]]
  ];

  function normalize(s){
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }
  function readField(fields, name){
    if(Object.prototype.hasOwnProperty.call(fields, name)) return { name, value:String(fields[name] || "").trim() };
    const needle = normalize(name);
    const matches = Object.keys(fields).filter(key => normalize(key) === needle);
    return matches.length === 1 ? { name:matches[0], value:String(fields[matches[0]] || "").trim() } : null;
  }
  function splitValue(value){
    const pieces = value.split("/").map(v => v.trim());
    if(pieces.length === 2) return { atual:pieces[0], max:pieces[1], inferred:false };
    return { atual:value.trim(), max:value.trim(), inferred:true };
  }

  // O campo de movimentos do PDF mistura ações, conexões e habilidades.
  // Preserva-se o texto original; cada entrada reconhecida também ganha um card.
  function parseSpecialAbilities(source){
    const text = String(source || "").replace(/\r\n?/g, "\n");
    const sectionHeading = /^(?:a[çc][õo]es|movimentos|conex[õo]es|habilidades(?:\s+(?:especiais|conectadas|passivas|em\s+50\s+pontos))?|passivas)(?:\s*:)?$/i;
    const entryStart = /^(?:[*•-]\s*)?([^|:\n]{2,100}?)\s*\|\s*(?=(?:ATK|DEF|DESV|P\.?B\.?|PASSIVA|EFEITO)\b|\d+\s*P\.?B\.?\b)/i;
    const dashStart = /^(?:[*•-]\s*)?([^\n:—–]{2,90}?)\s+[—–]\s+(?=\S)/;
    const chunks = [];
    let current = "";
    function flush(){ if(current.trim()) chunks.push(current.trim()); current = ""; }
    for(const rawLine of text.split("\n")){
      const line = rawLine.trim();
      if(!line) { flush(); continue; }
      if(sectionHeading.test(line)){ flush(); continue; }
      const starts = entryStart.test(line) || dashStart.test(line) || /^[*•]\s+\S/.test(line);
      if(starts) flush();
      if(starts || current){
        current += (current ? "\n" : "") + line;
      }
    }
    flush();
    const abilities = [];
    let unparsed = 0;
    chunks.forEach((chunk, i) => {
      const clean = chunk.replace(/^[*•-]\s*/, "");
      const match = clean.match(/^([^\n:—–]{2,90}\s+[—–]\s*50\s+[—–]\s*[^\n:—–|]{2,90}?)\s+[—–]\s+(?=(?:ATK|DEF|DESV|PASSIVA|EFEITO|P\.?B\.?)\b)([\s\S]+)$/i) ||
        clean.match(/^([^|:\n]{2,100}?)\s*\|\s*([\s\S]+)$/) ||
        clean.match(/^([^\n:—–]{2,90}?)\s+[—–]\s+([\s\S]+)$/) ||
        clean.match(/^([^\n:]{2,90}?)\s*:\s*([\s\S]+)$/) ||
        clean.match(/^([^\n]{2,90})\n([\s\S]+)$/);
      if(!match){ unparsed++; return; }
      const nome = match[1].trim();
      const body = match[2].trim();
      // Evita transformar linhas internas da descrição em habilidades.
      if(/^(?:efeito|dano|consumo|condi[çc][ãa]o|consequ[êe]ncia|aprimorar|origem|sentidos|imunidades|resist[êe]ncias)$/i.test(nome) || !body){ unparsed++; return; }
      const pbMatch = body.match(/\bP\.?B\.?\s*[:=]?\s*(\d+)\b|(?<!\+)\b(\d+)\s*P\.?B\.?\b/i);
      const pb = pbMatch ? (pbMatch[1] || pbMatch[2]) : "";
      const atkMatch = body.match(/\b(?:ATK|DEF|DESV)\s*(?:N|AB|AF|C|O)\b|\bPASSIVA\b/i);
      const atk = atkMatch ? atkMatch[0].toUpperCase() : "";
      const parts = body.split(/\s*\|\s*/);
      while(parts.length > 1 && /^(?:(?:ATK|DEF|DESV)\s*(?:N|AB|AF|C|O)|PASSIVA|P\.?B\.?\s*:?\s*\d+|\d+\s*P\.?B\.?)$/i.test(parts[0].trim())) parts.shift();
      const descricao = parts.join(" | ").replace(/^Efeito\s*:\s*/i, "").trim() || body;
      abilities.push({ id:"cfhab_pdf_" + (i + 1), nome:typeof window.CRRCreature50Name === "function" ? window.CRRCreature50Name(nome) : nome, atk, pb, descricao });
    });
    return { abilities, unparsed };
  }

  function analyzeFields(fields, fileName){
    const result = { fileName, data:{}, ok:[], revisar:[], unused:[], error:null };
    const used = new Set();
    const signature = ["Pontos de Batalha", "Resistência Natural", "Itens da criatura", "Texto67"]
      .filter(name => readField(fields, name)).length;
    if(signature < 2){
      result.error = "Este PDF não parece ser a ficha de criatura compatível. Use a ficha preenchível do modelo Origem do Caos.";
      return result;
    }
    function put(id, field, label){
      const found = readField(fields, field);
      if(!found) return;
      used.add(found.name);
      if(!found.value) return;
      result.data[id] = found.value;
      result.ok.push({label, value:found.value});
    }
    BASIC.forEach(([id, field, label]) => put(id, field, label));
    COMBINED.forEach(([field, atualId, maxId]) => {
      const found = readField(fields, field);
      if(!found) return;
      used.add(found.name);
      if(!found.value) return;
      const { atual, max, inferred } = splitValue(found.value);
      if((maxId === "cr_hp_max" || maxId === "cr_protecao_max" || maxId === "cr_pb_max") && !/^\d+(?:[.,]\d+)?$/.test(max)){
        result.revisar.push({label:field, value:found.value, reason:"Valor máximo inválido para o campo numérico; confira manualmente."});
        return;
      }
      result.data[atualId] = atual;
      result.data[maxId] = max.replace(",", ".");
      result.ok.push({label:field, value:found.value});
      if(inferred) result.revisar.push({label:field, value:found.value, reason:"O PDF traz um valor único; foi aplicado como atual e máximo."});
    });
    SKILLS.forEach(([category, list]) => list.forEach(([id, number, label]) => {
      const found = readField(fields, "Texto" + number);
      if(!found) return;
      used.add(found.name);
      if(!found.value) return;
      const { atual, max, inferred } = splitValue(found.value);
      if(!/^\d+(?:[.,]\d+)?$/.test(max)){
        result.revisar.push({label:category + " — " + label, value:found.value, reason:"Os pontos precisam ser numéricos; campo ignorado."});
        return;
      }
      result.data[id] = max.replace(",", ".");
      result.data[id + "_atual"] = atual.replace(",", ".");
      result.ok.push({label:category + " — " + label, value:found.value});
      // Nesse modelo um número solto em PONTOS representa o total disponível.
      if(!inferred && atual && !/^\d+(?:[.,]\d+)?$/.test(atual)){
        result.data[id + "_atual"] = max.replace(",", ".");
        result.revisar.push({label, value:found.value, reason:"Pontos atuais inválidos; aplicado o máximo."});
      }
    }));
    const origem = readField(fields, "Origem");
    if(origem){
      used.add(origem.name);
      if(origem.value){
        result.data.cr_movimentos = "Origem: " + origem.value + "\n\n" + (result.data.cr_movimentos || "");
        result.revisar.push({label:"Origem", value:origem.value, reason:"A ficha do site não tem um campo de Origem; o valor foi preservado em Movimentos, Conexões e Habilidades."});
      }
    }
    const movement = readField(fields, "Texto67");
    const parsed = parseSpecialAbilities(movement ? movement.value : "");
    if(parsed.abilities.length){
      result.data.cf_habilidades_data = JSON.stringify(parsed.abilities);
      result.ok.push({label:"Cards de habilidades especiais", value:parsed.abilities.length + " habilidade(s)"});
    }
    if(parsed.unparsed) result.revisar.push({label:"Habilidades especiais", value:parsed.unparsed + " bloco(s)", reason:"Não foi possível dividir estes blocos em cards. O texto original está preservado em Movimentos."});
    Object.entries(fields).forEach(([name, value]) => {
      if(used.has(name) || !String(value || "").trim()) return;
      // Widgets de dado e marcação são ignorados pelo leitor do formulário.
      result.unused.push({label:name, value:String(value)});
    });
    if(!Object.keys(result.data).length){
      result.error = "Nenhum dado preenchido foi encontrado nos campos compatíveis desta ficha.";
    }
    return result;
  }

  async function readPdf(file){
    if(typeof window.ensurePdfLibLoaded !== "function") throw new Error("Leitor de PDF indisponível.");
    await window.ensurePdfLibLoaded();
    const doc = await PDFLib.PDFDocument.load(await file.arrayBuffer(), {ignoreEncryption:true});
    const fields = {};
    doc.getForm().getFields().forEach(field => {
      if(typeof field.getText !== "function") return;
      try{ fields[field.getName()] = field.getText() || ""; }catch(e){}
    });
    return analyzeFields(fields, file.name);
  }
  function esc(s){
    if(typeof window.escapeHtml === "function") return window.escapeHtml(String(s));
    const span = document.createElement("span"); span.textContent = String(s); return span.innerHTML;
  }
  function row(item){
    const value = String(item.value || "");
    return '<div class="pdfimp-row"><span class="pdfimp-label">' + esc(item.label) +
      '</span><span class="pdfimp-value">' + esc(value.length > 75 ? value.slice(0,75) + "…" : value) + '</span></div>' +
      (item.reason ? '<div class="pdfimp-empty-note">' + esc(item.reason) + '</div>' : '');
  }
  function section(title, items, open){
    if(!items.length) return "";
    return '<details class="pdfimp-section"' + (open ? ' open' : '') + '><summary>' + esc(title) +
      ' <span class="pdfimp-count">' + items.length + '</span></summary><div class="pdfimp-section-body">' +
      items.map(row).join("") + '</div></details>';
  }
  let current = null;
  function close(){
    document.getElementById("cr_pdfimp_modal").style.display = "none";
    current = null;
  }
  function render(report){
    const body = document.getElementById("cr_pdfimp_body");
    const confirm = document.getElementById("cr_pdfimp_confirm");
    confirm.style.display = report.error ? "none" : "";
    if(report.error){ body.innerHTML = '<div class="pdfimp-error">' + esc(report.error) + '</div>'; return; }
    body.innerHTML = '<div class="pdfimp-summary">Arquivo: ' + esc(report.fileName) + '</div>' +
      section("⚠ Revisar", report.revisar, true) + section("✓ Identificados", report.ok, false) +
      section("? Sem correspondência", report.unused, false);
  }
  function init(){
    const button = document.getElementById("cr_import_pdf_btn");
    const input = document.getElementById("cr_import_pdf_file");
    const modal = document.getElementById("cr_pdfimp_modal");
    const body = document.getElementById("cr_pdfimp_body");
    const confirm = document.getElementById("cr_pdfimp_confirm");
    if(!button || !input || !modal || !body || !confirm) return;
    button.addEventListener("click", () => { input.value = ""; input.click(); });
    document.getElementById("cr_pdfimp_cancel").addEventListener("click", close);
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if(!file) return;
      current = null;
      modal.style.display = "flex";
      confirm.style.display = "none";
      body.innerHTML = '<div class="pdfimp-loading">Lendo PDF…</div>';
      if(!/\.pdf$/i.test(file.name)){
        body.innerHTML = '<div class="pdfimp-error">Selecione um arquivo PDF.</div>';
        return;
      }
      try{ current = await readPdf(file); render(current); }
      catch(e){
        console.error("[Importar Criatura PDF]", e);
        body.innerHTML = '<div class="pdfimp-error">Não foi possível ler o PDF. Use o arquivo original preenchível e verifique a conexão.</div>';
      }
    });
    confirm.addEventListener("click", async () => {
      if(!current || current.error || !window.CRISCreatureSheets) return;
      confirm.disabled = true;
      confirm.textContent = "Importando…";
      try{
        const imported = await window.CRISCreatureSheets.importFromPdf(current.data);
        close();
        if(typeof flashIndicator === "function") flashIndicator(imported.previousPending ?
          "✓ Criatura importada. Alterações da ficha anterior estão pendentes; salve-as antes de fechar a página." :
          "✓ Criatura importada do PDF!", false, imported.previousPending ? 5000 : 2800);
      }catch(e){
        console.error("[Importar Criatura PDF]", e);
        body.insertAdjacentHTML("afterbegin", '<div class="pdfimp-error">' + esc(e.message || "Falha ao salvar a criatura.") + '</div>');
      }finally{
        confirm.disabled = false;
        confirm.textContent = "Importar Criatura";
      }
    });
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  // Utilizado apenas para conferir o mapeamento com arquivos de formulário.
  window.CRISCreaturePdfImport = { analyzeFields, parseSpecialAbilities };
})();
