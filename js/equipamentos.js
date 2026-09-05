/* ==========================================================
   EQUIPAMENTOS
   Módulo independente e autocontido, adicionado sobre a
   arquitetura já existente. NÃO reescreve o projeto, NÃO cria uma
   segunda estrutura de Compêndio e NÃO integra com o Inventário
   nesta etapa:

     COMPÊNDIO → "Equipamentos"   (nova sub-aba, biblioteca fixa,
                                    extraída do PDF do Sistema de
                                    OdC — 1ª Ed., págs. 186–197)

   Segue EXATAMENTE o mesmo padrão já usado por Marcos de Corrupção
   (js/marcos-corrupcao.js): nova sub-aba dentro de #tab-compendio
   (mesma barra ".subtab-row"/".subtab-btn"/".subtab-panel" já
   existente), filtros no mesmo padrão (".cx-filters"/".cx-filter-btn"
   já existentes), grid de cards no mesmo estilo visual do Compêndio
   (".cx-grid"/".cx-card"/".cx-body"/".cx-arrow"/".cx-empty"), e um
   modal de detalhes próprio, reaproveitando a MESMA estrutura
   genérica de modal (".modal-overlay"/".modal-box"/".cx-modal-box"/
   ".cx-modal-section"/".modal-actions"/".fonte-tag") já usada por
   todos os outros modais do projeto — nenhum sistema de popup novo
   é criado.

   CATEGORIAS: o próprio livro organiza os equipamentos das páginas
   186–197 em blocos com cabeçalho próprio — "LÂMINAS" (pág. 194),
   "MADEIRA" (pág. 195), "METAL"/"VIDRO" (pág. 196) e "PROTEÇÃO"
   (pág. 197) — além do bloco de armas de fogo, nomeado assim no
   texto introdutório da pág. 186 ("armas de fogo (pequeno, médio e
   grande porte)") e do bloco "EXPLOSIVOS" (pág. 192). Essa é a
   organização preservada aqui — nenhuma categoria foi inventada e
   nenhuma foi reduzida a menos do que o livro realmente separa.

   ESCOPO DESTA ETAPA: apenas COMPÊNDIO → EQUIPAMENTOS (biblioteca de
   consulta). Nenhuma integração com o Inventário, nenhum botão de
   adicionar à ficha, nenhuma referência dentro de #tab-agentes —
   exatamente como pedido. Isso fica para uma etapa futura.

   FONTE: Sistema de OdC — 1ª Edição (V1.0.3), págs. 186–197. Cada
   item preserva o texto do livro (nome, dano/efeito, munição,
   distância, porte, proteção, peso e observações), sem resumir,
   reescrever ou completar informações por conhecimento externo.
   Onde a própria fonte é inconsistente entre a tabela e a lista
   descritiva (ver OBS. nos itens "TLM"/"TBLM" e "Flecha (Arco)"/
   "Flecha (Besta)"), ambas as grafias/valores foram preservados,
   sem que este módulo tentasse "corrigir" o livro.

   Namespace: window.Equipamentos
   ========================================================== */
(function () {
  "use strict";

  /* ---------------------------------------------------------
     BIBLIOTECA OFICIAL — Equipamentos (págs. 186–197).

     Campos (estrutura genérica, comum a todas as categorias —
     cada item usa só os campos que fazem sentido para ele, o
     restante fica null/omitido, exatamente como a informação
     aparece ou não aparece no livro para aquele item):
       id         — identificador único e estável
       categoria  — "armas-fogo" | "explosivos" | "laminas" |
                    "madeira" | "metal" | "vidro" | "protecao"
       subtipo    — a coluna "Tipo" do livro (Revólver, Pistola,
                    Fuzil, Escopeta, Espingarda, RPG, TRPG, Lâmina,
                    Madeira) ou a subseção do livro (Equipamento,
                    Item, Objeto — dentro de Proteção)
       nome       — nome do item, exatamente como no livro
       dano       — fórmula/efeito de dano, exatamente como no livro
       protecao   — valor de Proteção ("X/X"), só para a categoria
                    "protecao"
       municao    — "X/X", só para armas de fogo
       distancia  — Curta/Média/Longa (ou combinações), só para
                    Lâminas e Madeira
       porte      — "P"/"M"/"G", quando o livro define
       peso       — texto exatamente como no livro (a maioria é um
                    número, mas alguns itens têm peso descrito em
                    texto — ex.: "metade do peso original da
                    garrafa" — preservado como está, sem inventar
                    um número)
       detalhes   — texto complementar (habilidades especiais,
                    durabilidade, área de efeito, duração etc.),
                    quando o livro traz essa informação separada da
                    tabela principal
       obs        — nota sobre alguma divergência da própria fonte
                    entre páginas/seções (só quando aplicável)
       pagina     — página(s) do livro de onde o item foi extraído
     --------------------------------------------------------- */
  var EQUIPAMENTOS_DATA = [

    /* ================= ARMAS DE FOGO — PEQUENO PORTE (pág. 187) =================
       Tabela da pág. 187. O livro não traz uma lista de habilidades
       especiais por item para Pistola/Revólver (só as regras gerais
       de Pistola vs. Revólver, que não são específicas de um item). */
    { id:"arma-fogo-colt-commander", categoria:"armas-fogo", subtipo:"Revólver", nome:"Colt Commander",
      dano:"1d12+2d4", municao:"9/9", porte:"P", peso:"0.8", pagina:187 },
    { id:"arma-fogo-bren-ten", categoria:"armas-fogo", subtipo:"Pistola", nome:"Bren Ten",
      dano:"1d8+2d4", municao:"10/10", porte:"P", peso:"0.8", pagina:187 },
    { id:"arma-fogo-colt-officers-acp", categoria:"armas-fogo", subtipo:"Revólver", nome:"Colt Officer's ACP",
      dano:"1d12+2d4", municao:"7/7", porte:"P", peso:"0.8", pagina:187 },
    { id:"arma-fogo-amt-automag-iii", categoria:"armas-fogo", subtipo:"Pistola", nome:"AMT AutoMag III",
      dano:"1d12+1d4", municao:"8/8", porte:"P", peso:"0.8", pagina:187 },
    { id:"arma-fogo-2mm-kolibri", categoria:"armas-fogo", subtipo:"Pistola", nome:"2mm Kolibri",
      dano:"1d4+1d6", municao:"8/8", porte:"P", peso:"0.5", pagina:187 },
    { id:"arma-fogo-charter-arms-bulldog", categoria:"armas-fogo", subtipo:"Revólver", nome:"Charter Arms Bulldog",
      dano:"1d12+1d6+2d4", municao:"6/6", porte:"P", peso:"0.5", pagina:187 },
    { id:"arma-fogo-arsenal-firearms-af1", categoria:"armas-fogo", subtipo:"Pistola", nome:"Arsenal Firearms AF1 \"Strike One\"",
      dano:"1d20", municao:"15/15", porte:"P", peso:"0.8", pagina:187 },
    { id:"arma-fogo-automag", categoria:"armas-fogo", subtipo:"Pistola", nome:"AutoMag",
      dano:"1d12+3d4", municao:"7/7", porte:"P", peso:"0.8", pagina:187 },
    { id:"arma-fogo-dan-wesson-m1911-acp", categoria:"armas-fogo", subtipo:"Pistola", nome:"Dan Wesson M1911 ACP",
      dano:"1d20", municao:"8/8", porte:"P", peso:"0.8", pagina:187 },
    { id:"arma-fogo-desert-eagle", categoria:"armas-fogo", subtipo:"Pistola", nome:"Desert Eagle",
      dano:"1d20", municao:"9/9", porte:"P", peso:"0.8", pagina:187 },
    { id:"arma-fogo-colt-anaconda", categoria:"armas-fogo", subtipo:"Revólver", nome:"Colt Anaconda",
      dano:"1d20+1d8", municao:"6/6", porte:"P", peso:"0.8", pagina:187 },
    { id:"arma-fogo-colt-diamondback", categoria:"armas-fogo", subtipo:"Revólver", nome:"Colt Diamondback",
      dano:"1d20+1d6", municao:"6/6", porte:"P", peso:"0.8", pagina:187 },
    { id:"arma-fogo-colt-king-cobra", categoria:"armas-fogo", subtipo:"Revólver", nome:"Colt King Cobra",
      dano:"1d20+1d6", municao:"6/6", porte:"P", peso:"0.8", pagina:187 },

    /* ================= ARMAS DE FOGO — MÉDIO PORTE (págs. 188–190) =================
       Tabela da pág. 188 + "Lista de Fuzis/Escopetas/Espingardas e
       suas habilidades especiais" (págs. 188–190), mescladas por
       nome — o "detalhes" de cada item vem literalmente dessa lista. */
    { id:"arma-fogo-acr", categoria:"armas-fogo", subtipo:"Fuzil", nome:"ACR",
      dano:"1d20+1d4", municao:"30/30", porte:"M", peso:"4.0",
      detalhes:"Possui gatilho de alteração do modo de disparo | 4 tiros por disparo rápido (Vantagem)", pagina:"188–189" },
    { id:"arma-fogo-aek-971", categoria:"armas-fogo", subtipo:"Fuzil", nome:"AEK-971",
      dano:"1d20+2d4", municao:"30/30", porte:"M", peso:"4.5",
      detalhes:"Possui gatilho de alteração do modo de disparo | 4 tiros por disparo rápido (Vantagem)", pagina:"188–189" },
    { id:"arma-fogo-ak-74", categoria:"armas-fogo", subtipo:"Fuzil", nome:"AK-74",
      dano:"1d20+1d8", municao:"30/30", porte:"M", peso:"4.5",
      detalhes:"Possui gatilho de alteração do modo de disparo | 4 tiros por disparo rápido (Vantagem)", pagina:"188–189" },
    { id:"arma-fogo-akm", categoria:"armas-fogo", subtipo:"Fuzil", nome:"AKM",
      dano:"1d20+1d6", municao:"30/30", porte:"M", peso:"4.5",
      detalhes:"Possui gatilho de alteração do modo de disparo | 4 tiros por disparo rápido (Vantagem)", pagina:"188–189" },
    { id:"arma-fogo-aps-95", categoria:"armas-fogo", subtipo:"Fuzil", nome:"APS-95",
      dano:"1d20+1d4", municao:"30/30", porte:"M", peso:"4.0",
      detalhes:"Possui gatilho de alteração do modo de disparo | 4 tiros por disparo rápido (Vantagem)", pagina:"188–189" },
    { id:"arma-fogo-hk33", categoria:"armas-fogo", subtipo:"Fuzil", nome:"HK33",
      dano:"1d20+1d6", municao:"40/40", porte:"M", peso:"4.0",
      detalhes:"Possui gatilho de alteração do modo de disparo | 4 tiros por disparo rápido (Vantagem)", pagina:"188–189" },
    { id:"arma-fogo-hk416", categoria:"armas-fogo", subtipo:"Fuzil", nome:"HK416",
      dano:"1d20+3d4", municao:"50/50", porte:"M", peso:"3.5",
      detalhes:"Possui gatilho de alteração do modo de disparo | 4 tiros por disparo rápido (Vantagem)", pagina:"188–189" },
    { id:"arma-fogo-m16", categoria:"armas-fogo", subtipo:"Fuzil", nome:"M16",
      dano:"1d20+2d4", municao:"20/20", porte:"M", peso:"4.0",
      detalhes:"Possui gatilho de alteração do modo de disparo | 4 tiros por disparo rápido (Vantagem)", pagina:"188–189" },
    { id:"arma-fogo-imbel-ia2", categoria:"armas-fogo", subtipo:"Fuzil", nome:"IMBEL IA2",
      dano:"1d20+1d4", municao:"30/30", porte:"M", peso:"4.0",
      detalhes:"Possui gatilho de alteração do modo de disparo | 4 tiros por disparo rápido (Vantagem) / costuma travar (desvantagem se utilizado em disparo rápido 2x no mesmo combate)", pagina:"188–189" },
    { id:"arma-fogo-ak-47", categoria:"armas-fogo", subtipo:"Fuzil", nome:"AK-47",
      dano:"1d20+2d6", municao:"75/75", porte:"M", peso:"4.5",
      detalhes:"Possui gatilho de alteração do modo de disparo | 6 tiros por disparo rápido (Vantagem x2)", pagina:"188–189" },

    { id:"arma-fogo-m1887", categoria:"armas-fogo", subtipo:"Escopeta", nome:"M1887",
      dano:"1d20+3d4", municao:"2/2", porte:"M", peso:"4.0",
      detalhes:"1d20+3d4 de dano à 4m / 1d20 de dano à 8m / 1d12+1d6 de dano à 12m / 1d12 de dano à 15m / 1d8 de dano à 20m", pagina:"188,189" },
    { id:"arma-fogo-m1873", categoria:"armas-fogo", subtipo:"Escopeta", nome:"M1873",
      dano:"1d20+1d8", municao:"2/2", porte:"M", peso:"4.0",
      detalhes:"1d20+1d8 de dano à 4m / 1d12 de dano à 8m", pagina:"188,189" },
    { id:"arma-fogo-m1014", categoria:"armas-fogo", subtipo:"Escopeta", nome:"M1014",
      dano:"1d20+1d12", municao:"6/6", porte:"M", peso:"4.0",
      detalhes:"1d20+1d12 de dano à 4m / 1d12+1d6 de dano à 8m / 1d6+1d4 de dano à 12m", pagina:"188,189" },

    { id:"arma-fogo-benelli-m3-super-90", categoria:"armas-fogo", subtipo:"Espingarda", nome:"Benelli M3 Super 90",
      dano:"1d20+4d6", municao:"8/8", porte:"M", peso:"4.0",
      detalhes:"1d20+4d6 de dano à 4m / 1d12+1d8 de dano à 8m / 1d8+1d4 de dano à 15m | Gatilho semiautomático fornece Desvantagem por disparo, porém, perde o atraso", pagina:"188,189" },
    { id:"arma-fogo-fabarm-sdass", categoria:"armas-fogo", subtipo:"Espingarda", nome:"FABARM SDASS",
      dano:"2d20", municao:"12/12", porte:"M", peso:"4.0",
      detalhes:"2d20 de dano à 4m / 1d20+1d12 de dano à 8m / 1d12 de dano à 15m", pagina:"188,190" },
    { id:"arma-fogo-spas12", categoria:"armas-fogo", subtipo:"Espingarda", nome:"SPAS12",
      dano:"1d20+6d6", municao:"12/12", porte:"M", peso:"4.0",
      detalhes:"1d20+6d6 de dano à 4m / 1d12+1d8 de dano à 8m / 1d12 de dano à 12m / 1d4+1d6 de dano à 15m", pagina:"188,190" },
    { id:"arma-fogo-mossberg-500", categoria:"armas-fogo", subtipo:"Espingarda", nome:"Mossberg 500",
      dano:"1d20+2d8", municao:"12/12", porte:"M", peso:"4.0",
      detalhes:"1d20+2d8 de dano à 4m / 1d20 de dano à 8m / 1d4+1d6 de dano à 12m / 2d4 de dano à 15m", pagina:"188,190" },

    /* ================= ARMAS DE FOGO — GRANDE PORTE (págs. 191–192) =================
       Tabela da pág. 191 + "Lista de Fuzis de Precisão"/"Lista de
       Lança-Foguetes" (págs. 191–192), mescladas por nome. */
    { id:"arma-fogo-m24", categoria:"armas-fogo", subtipo:"Fuzil", nome:"M24",
      dano:"1d20+1d12", municao:"15/15", porte:"G", peso:"6.0",
      detalhes:"Alcance inferior à 10m dão dano inteiro: 32. Caso dispare a menos de 10m, se houver um personagem em até 3m de distância atrás do alvo, a munição também o acertará, causando 1d12 de dano. 1d20+1d12 de dano entre 11 à 40m. Alcance entre 41 à 50m rola o ATK AF com uma Desvantagem. Disparos com distância superior à 50m: 1d20 de dano", pagina:191 },
    { id:"arma-fogo-m82b", categoria:"armas-fogo", subtipo:"Fuzil", nome:"M82B",
      dano:"1d20+3d8", municao:"8/8", porte:"G", peso:"13.0",
      detalhes:"Alcance inferior à 10m dão dano inteiro: 40. Caso dispare a menos de 10m, se houver um personagem em até 10m de distância atrás do alvo, a munição também o acertará, causando 1d20 de dano. 1d20+3d8 de dano até 50m. Disparos acima de 50m: ATK com uma Desvantagem e dano: 1d20", pagina:191 },
    { id:"arma-fogo-kar98k", categoria:"armas-fogo", subtipo:"Fuzil", nome:"KAR98K",
      dano:"1d20+1d12", municao:"5/5", porte:"G", peso:"4.5",
      detalhes:"Alcance inferior à 10m dão dano inteiro: 32. Caso dispare a menos de 10m, se houver um personagem em até 3m de distância atrás do alvo, a munição também o acertará, causando 1d12 de dano. 1d20+1d12 de dano até 50m. Alcance entre 11 à 50m possui Vantagem. Distância superior à 50m dano é: 1d20", pagina:191 },
    { id:"arma-fogo-awm", categoria:"armas-fogo", subtipo:"Fuzil", nome:"AWM",
      dano:"1d20+3d4", municao:"5/5", porte:"G", peso:"7.0",
      detalhes:"Alcance inferior à 10m dão dano inteiro: 44. Caso dispare a menos de 10m, se houver um personagem em até 10m de distância atrás do alvo, a munição também o acertará, causando 1d20+1d8 de dano. 1d20+2d12 de dano até 50m, possui Vantagem. Disparos efetuados a mais de 50m, rola-se com uma Desvantagem e dano: 1d20+1d8", pagina:"191–192" },
    { id:"arma-fogo-aiaw", categoria:"armas-fogo", subtipo:"Fuzil", nome:"AIAW",
      dano:"1d20+2d12", municao:"5/5", porte:"G", peso:"7.0",
      detalhes:"Alcance inferior à 10m dão dano inteiro: 32. Caso dispare a menos de 10m, se houver um personagem em até 2m de distância atrás do alvo, a munição também o acertará, causando 1d8 de dano. 1d20+3d4 de dano até 70m. Disparos efetuados a mais de 70m, rola-se com uma Desvantagem e dano: 1d12+2d4", pagina:192 },
    { id:"arma-fogo-armalite-ar-50", categoria:"armas-fogo", subtipo:"Fuzil", nome:"ArmaLite AR-50",
      dano:"2d20", municao:"1/1", porte:"G", peso:"15.0",
      detalhes:"Alcance inferior à 10m dão dano inteiro: 40. Caso dispare a menos de 10m, se houver um personagem em até 15m de distância atrás do alvo, a munição também o acertará, causando 1d20+3d4 de dano. 2d20 de dano até 70m. Disparos efetuados a mais de 70m, rola-se com uma Desvantagem e dano: 1d20", pagina:192 },
    { id:"arma-fogo-barrett-m95", categoria:"armas-fogo", subtipo:"Fuzil", nome:"Barrett M95",
      dano:"1d20+3d4", municao:"10/10", porte:"G", peso:"10.0",
      detalhes:"Alcance inferior à 10m dão dano inteiro: 32. Caso dispare a menos de 10m, se houver um personagem em até 3m de distância atrás do alvo, a munição também o acertará, causando 1d12+1d8 de dano. 1d20+1d12 de dano até 50m, possui Vantagem. Disparos efetuados a mais de 50m, rola-se com uma Desvantagem e dano: 1d20", pagina:192 },
    { id:"arma-fogo-blm", categoria:"armas-fogo", subtipo:"RPG", nome:"BLM",
      dano:"2D20", municao:"1/1", porte:"G", peso:"7.0",
      detalhes:"Alcance de até 20m. Dano em área de círculo, cobre um raio de 3m. Dano: 1d12. Causa: INCENDIAR no alvo. Disparos à mais de 20m de distância obtém 1 Desvantagem a cada 5m", pagina:192 },
    { id:"arma-fogo-tlm", categoria:"armas-fogo", subtipo:"TRPG", nome:"TLM",
      dano:"2D20", municao:"1/1", porte:"G", peso:"15.0",
      detalhes:"Alcance de até 20m. Dano em área de círculo, cobre um raio de 3m. Dano: 1d12. Causa: INCENDIAR no alvo. Disparos de até 20m possuem Vantagem. Disparos à mais de 20m de distância obtém 1 Desvantagem a cada 10m",
      obs:"Na tabela (pág. 191) o livro nomeia esta arma \"TLM\"; na \"Lista de Lança-Foguetes\" (pág. 192), o mesmo item é chamado de \"TBLM\". Divergência da própria fonte, preservada sem correção — não foi inventada uma grafia única.",
      pagina:"191–192" },

    /* ================= EXPLOSIVOS (págs. 192–193) =================
       Sem tabela — cada item vem da "Lista" descritiva entre
       parênteses/chaves do livro, preservada literalmente. */
    { id:"explosivo-granada-fragmentacao", categoria:"explosivos", subtipo:"Explosivo", nome:"Granada de fragmentação",
      dano:"1d20+1d8 de dano em uma área de 5m / 1d12+1d4 de dano em uma área de 10m", peso:"0.5", pagina:193 },
    { id:"explosivo-granada-incendiaria", categoria:"explosivos", subtipo:"Explosivo", nome:"Granada incendiária",
      dano:"1d20 de dano inicial, depois 1d6 de QUEIMAR de dano por rodada",
      detalhes:"Duração: 1d12 rodadas ou até que o fogo seja apagado | Área de Impacto: 3m", peso:"0.5", pagina:193 },
    { id:"explosivo-granada-de-luz", categoria:"explosivos", subtipo:"Explosivo", nome:"Granada de luz",
      dano:"Gera 2 desvantagens em todas as ações do oponente e uma penalidade de -10 em dados de combate por 2 rodadas",
      detalhes:"Área de Impacto: 3m", peso:"0.5", pagina:193 },
    { id:"explosivo-molotov", categoria:"explosivos", subtipo:"Explosivo", nome:"Molotov",
      dano:"1d12+1d4 de dano inicial, depois 1d6 de QUEIMAR de dano por rodada",
      detalhes:"Duração: 1d12 rodadas ou até que o fogo seja apagado | Em uma área de 3m", peso:"1.0", pagina:193 },
    { id:"explosivo-dinamite", categoria:"explosivos", subtipo:"Explosivo", nome:"Dinamite",
      dano:"1d20+1d8 de dano em uma área de 8m", detalhes:"Precisa ser acionada", peso:"0.1", pagina:193 },
    { id:"explosivo-granada-de-fumaca", categoria:"explosivos", subtipo:"Explosivo", nome:"Granada de fumaça",
      dano:"Todos devem rolar Percepção+Observador+Inteligência, quem obtiver menos de 15, terá 1 desvantagem",
      detalhes:"Duração: 1d6 rodadas ou até que a fumaça seja dissipada | Área de Impacto: 5m", peso:"0.5", pagina:193 },

    /* ================= LÂMINAS (pág. 194) =================
       Tabela única — o livro não traz lista de habilidades
       especiais por Lâmina individual (só a regra geral de Sucesso
       Extremo/SANGRAR, aplicável a toda a categoria, não específica
       de um item). */
    { id:"lamina-faca-de-pao", categoria:"laminas", subtipo:"Lâmina", nome:"Faca de Pão", dano:"1", distancia:"Curta", porte:"P", peso:"0.3", pagina:194 },
    { id:"lamina-canivete", categoria:"laminas", subtipo:"Lâmina", nome:"Canivete", dano:"1d4+1/3FF", distancia:"Curta", porte:"P", peso:"0.3", pagina:194 },
    { id:"lamina-estilete", categoria:"laminas", subtipo:"Lâmina", nome:"Estilete", dano:"1d4+1/3FF", distancia:"Curta", porte:"P", peso:"0.3", pagina:194 },
    { id:"lamina-faca-pequena", categoria:"laminas", subtipo:"Lâmina", nome:"Faca Pequena", dano:"1d6+1/3FF", distancia:"Curta", porte:"P", peso:"0.6", pagina:194 },
    { id:"lamina-faca-grande", categoria:"laminas", subtipo:"Lâmina", nome:"Faca Grande", dano:"1d6+1d4+1/3FF", distancia:"Curta", porte:"P", peso:"0.8", pagina:194 },
    { id:"lamina-faca-de-caca", categoria:"laminas", subtipo:"Lâmina", nome:"Faca de Caça", dano:"1d12+1d4+1/3FF", distancia:"Curta", porte:"P", peso:"0.8", pagina:194 },
    { id:"lamina-facao", categoria:"laminas", subtipo:"Lâmina", nome:"Facão", dano:"1d12+1d4+1/3FF", distancia:"Curta", porte:"P", peso:"1.0", pagina:194 },
    { id:"lamina-cutelo", categoria:"laminas", subtipo:"Lâmina", nome:"Cutelo", dano:"1d12+1d4+1/3FF", distancia:"Curta", porte:"P", peso:"1.0", pagina:194 },
    { id:"lamina-machadinha", categoria:"laminas", subtipo:"Lâmina", nome:"Machadinha", dano:"1d12+1d4+1/3FF", distancia:"Curta", porte:"P", peso:"1.5", pagina:194 },
    { id:"lamina-bisturi", categoria:"laminas", subtipo:"Lâmina", nome:"Bisturi", dano:"2d6+1/3FF", distancia:"Curta", porte:"P", peso:"0.02", pagina:194 },
    { id:"lamina-punhal", categoria:"laminas", subtipo:"Lâmina", nome:"Punhal", dano:"1d6+2d4+1/3FF", distancia:"Curta", porte:"P", peso:"0.4", pagina:194 },
    { id:"lamina-foice-de-punho", categoria:"laminas", subtipo:"Lâmina", nome:"Foice de Punho", dano:"1d12+1d6+1/3FF", distancia:"Curta", porte:"P", peso:"1.0", pagina:194 },
    { id:"lamina-adaga", categoria:"laminas", subtipo:"Lâmina", nome:"Adaga", dano:"1d6+4d4+1/3FF", distancia:"Curta", porte:"P", peso:"0.5", pagina:194 },
    { id:"lamina-kunai", categoria:"laminas", subtipo:"Lâmina", nome:"Kunai", dano:"1d4+1/3FF", distancia:"Longa/Curta", porte:"P", peso:"0.1", pagina:194 },
    { id:"lamina-faca-de-arremesso", categoria:"laminas", subtipo:"Lâmina", nome:"Faca de Arremesso", dano:"1d6+1/3FF", distancia:"Longa/Curta", porte:"P", peso:"0.2", pagina:194 },
    { id:"lamina-katana", categoria:"laminas", subtipo:"Lâmina", nome:"Katana", dano:"1d20+1/3FF", distancia:"Média", porte:"M", peso:"2.0", pagina:194 },
    { id:"lamina-machado", categoria:"laminas", subtipo:"Lâmina", nome:"Machado", dano:"1d12+1d8+1/3FF", distancia:"Média", porte:"M", peso:"2.5", pagina:194 },
    { id:"lamina-espada-de-cavaleiro", categoria:"laminas", subtipo:"Lâmina", nome:"Espada de Cavaleiro", dano:"2d6+4d4+1/3FF", distancia:"Média", porte:"M", peso:"3.5", pagina:194 },
    { id:"lamina-espada-de-esgrima", categoria:"laminas", subtipo:"Lâmina", nome:"Espada de Esgrima", dano:"1d6+6d4+1/3FF", distancia:"Média", porte:"M", peso:"1.0", pagina:194 },
    { id:"lamina-serra-eletrica", categoria:"laminas", subtipo:"Lâmina", nome:"Serra Elétrica", dano:"1d20+1d6+1/3FF", distancia:"Média", porte:"G", peso:"4.0", pagina:194 },
    { id:"lamina-estaca-corrente", categoria:"laminas", subtipo:"Lâmina", nome:"Estaca-Corrente", dano:"1d6+1d4+1/3FF", distancia:"Média/Longa", porte:"M", peso:"2.0", pagina:194 },
    { id:"lamina-lanca-lamina-curta", categoria:"laminas", subtipo:"Lâmina", nome:"Lança - Lâmina Curta", dano:"1d6+5d4+1/3FF", distancia:"Longa", porte:"G", peso:"2.5", pagina:194 },
    { id:"lamina-lanca-lamina-longa", categoria:"laminas", subtipo:"Lâmina", nome:"Lança - Lâmina Longa", dano:"1d12+4d4+1/3FF", distancia:"Longa", porte:"G", peso:"3.0", pagina:194 },
    { id:"lamina-foice", categoria:"laminas", subtipo:"Lâmina", nome:"Foice", dano:"1d20+1d4+1/3FF", distancia:"Longa", porte:"G", peso:"3.5", pagina:194 },
    { id:"lamina-machado-de-guerra", categoria:"laminas", subtipo:"Lâmina", nome:"Machado de Guerra", dano:"1d20+1d8+1/3FF", distancia:"Longa", porte:"G", peso:"8.0", pagina:194 },
    { id:"lamina-lanca-de-cavaleiro", categoria:"laminas", subtipo:"Lâmina", nome:"Lança de Cavaleiro", dano:"1d20+1/3FF", distancia:"Longa", porte:"G", peso:"4.5", pagina:194 },

    /* ================= MADEIRA (págs. 195–196) =================
       Tabela da pág. 195 + "Lista de Armamentos de Madeira"
       (págs. 195–196), mescladas por nome. */
    { id:"madeira-flecha-arco", categoria:"madeira", subtipo:"Madeira", nome:"Flecha (Arco)",
      dano:"5d4", distancia:"Longa", porte:"M", peso:"0.5",
      detalhes:"5m por ponto de FF",
      obs:"A \"Lista de Armamentos de Madeira\" (pág. 196) descreve este conjunto como \"Arco e Flechas\", com peso separado do disparador e do projétil: {Peso: Arco: 1.5 | Cada flecha pesa 0.1} — valor diferente do Peso 0.5 informado na tabela da pág. 195 para \"Flecha (Arco)\". Ambos os valores foram preservados exatamente como aparecem no livro, sem reconciliação.",
      pagina:"195–196" },
    { id:"madeira-flecha-besta", categoria:"madeira", subtipo:"Madeira", nome:"Flecha (Besta)",
      dano:"8d4", distancia:"Longa", porte:"M", peso:"0.8",
      detalhes:"Alcança até 40m",
      obs:"A \"Lista de Armamentos de Madeira\" (pág. 196) descreve este conjunto como \"Besta e Flechas\", com peso separado do disparador e do projétil: {Peso: Besta: 2.0 | Cada flecha pesa 0.1} — valor diferente do Peso 0.8 informado na tabela da pág. 195 para \"Flecha (Besta)\". Ambos os valores foram preservados exatamente como aparecem no livro, sem reconciliação.",
      pagina:"195–196" },
    { id:"madeira-bastao-de-baseball", categoria:"madeira", subtipo:"Madeira", nome:"Bastão de Baseball",
      dano:"3d4+1/3FF", distancia:"Média", porte:"M", peso:"2.0",
      detalhes:"Durabilidade: 12 acertos | Se crítico causa ESMAGAR: +1d8 de dano", pagina:"195–196" },
    { id:"madeira-bastao-de-baseball-com-arame", categoria:"madeira", subtipo:"Madeira", nome:"Bastão de Baseball com arame",
      dano:"1d6+2d4+1/3FF", distancia:"Média", porte:"M", peso:"2.0",
      detalhes:"Durabilidade: 18 acertos | Se 1 crítico causa: ESMAGAR: +1d8 de dano; Se 2 críticos causa: SANGRAR: 1d4 de dano por rodada", pagina:"195–196" },
    { id:"madeira-tonfa-de-madeira", categoria:"madeira", subtipo:"Madeira", nome:"Tonfa de Madeira",
      dano:"2d4+1/3FF", distancia:"Média", porte:"M", peso:"1.0",
      detalhes:"Durabilidade: 25 acertos", pagina:"195–196" },
    { id:"madeira-espada-de-madeira", categoria:"madeira", subtipo:"Madeira", nome:"Espada de Madeira",
      dano:"3d4+1/3FF", distancia:"Média", porte:"M", peso:"2.0",
      detalhes:"Durabilidade: 25 acertos", pagina:"195–196" },
    { id:"madeira-cassetete", categoria:"madeira", subtipo:"Madeira", nome:"Cassetete",
      dano:"2d4+1/3FF", distancia:"Média", porte:"M", peso:"1.0",
      detalhes:"Durabilidade: 30 acertos", pagina:"195–196" },
    { id:"madeira-bastao", categoria:"madeira", subtipo:"Madeira", nome:"Bastão",
      dano:"2d4+1/3FF", distancia:"Longa", porte:"G", peso:"3.0",
      detalhes:"Durabilidade: 40 acertos", pagina:"195–196" },

    /* ================= METAL (pág. 196) =================
       Sem tabela — cada item vem da lista descritiva do livro. */
    { id:"metal-soqueira", categoria:"metal", subtipo:"Metal", nome:"Soqueira",
      dano:"+1d4 de dano em ATK N", peso:"0.2", pagina:196 },
    { id:"metal-pe-de-cabra", categoria:"metal", subtipo:"Metal", nome:"Pé de cabra",
      dano:"2d4+1/3FF de dano", detalhes:"+1d4 pontos em ação de arrombamento", peso:"1.5", pagina:196 },
    { id:"metal-morning-star", categoria:"metal", subtipo:"Metal", nome:"Morning Star",
      dano:"1d12+1d4+1/3FF", peso:"2.0", pagina:196 },
    { id:"metal-cano-barra", categoria:"metal", subtipo:"Metal", nome:"Cano/Barra",
      dano:"1d4+1d6+1/3FF", detalhes:"Durabilidade: 40 acertos", peso:"1.0", pagina:196 },

    /* ================= VIDRO (págs. 196–197) =================
       Sem tabela — cada item vem da lista descritiva do livro. */
    { id:"vidro-caco-de-vidro", categoria:"vidro", subtipo:"Vidro", nome:"Caco de Vidro",
      dano:"1d4+1/3FF", peso:"0.01", pagina:197 },
    { id:"vidro-garrafa-quebrada", categoria:"vidro", subtipo:"Vidro", nome:"Garrafa Quebrada",
      dano:"2d4+1/3FF", detalhes:"Durabilidade: 5", peso:"Metade do peso original da garrafa", pagina:197 },
    { id:"vidro-garrafa-inteira", categoria:"vidro", subtipo:"Vidro", nome:"Garrafa Inteira",
      dano:"1d4+1/3FF", detalhes:"Possui um limite de uso único antes de quebrar; após quebrada, torna-se automaticamente uma \"Garrafa Quebrada\"", peso:"1.5 (o peso pode variar segundo critério do mestre da mesa)", pagina:197 },

    /* ================= PROTEÇÃO (pág. 197) =================
       Sem tabela — três subseções do próprio livro: Equipamentos,
       Itens e Objetos. Preservadas como subtipo de cada item. */
    { id:"protecao-colete-balistico", categoria:"protecao", subtipo:"Equipamento", nome:"Colete Balístico",
      protecao:"30/30", peso:"2.0", pagina:197 },
    { id:"protecao-capacete-militar", categoria:"protecao", subtipo:"Equipamento", nome:"Capacete Militar",
      protecao:"10/10", peso:"0.5", pagina:197 },
    { id:"protecao-roupa-de-protecao-contra-fogo", categoria:"protecao", subtipo:"Equipamento", nome:"Roupa de proteção contra fogo",
      detalhes:"-1d8 contra fogo e danos de QUEIMADURA", peso:"2.0", pagina:197 },
    { id:"protecao-malha-de-ferro", categoria:"protecao", subtipo:"Equipamento", nome:"Malha de Ferro",
      protecao:"15/15", peso:"1.5", pagina:197 },
    { id:"protecao-tecido-balistico", categoria:"protecao", subtipo:"Equipamento", nome:"Tecido Balístico",
      protecao:"10/10", peso:"0.5", pagina:197 },

    { id:"protecao-escudo-militar-de-contencao-civil", categoria:"protecao", subtipo:"Item", nome:"Escudo Militar de Contenção Civil",
      protecao:"20/20", detalhes:"Inutiliza 1 braço durante o uso", peso:"5.0", pagina:197 },
    { id:"protecao-escudo-militar-de-resistencia-balistica", categoria:"protecao", subtipo:"Item", nome:"Escudo Militar de Resistência Balística",
      protecao:"40/40", detalhes:"Inutiliza 1 braço durante o uso", peso:"8.0", pagina:197 },
    { id:"protecao-escudo-barreira-de-metal", categoria:"protecao", subtipo:"Item", nome:"Escudo-Barreira de Metal",
      protecao:"80/80", detalhes:"Inutiliza ambos os braços. O usuário do escudo não terá ação principal ou de movimento enquanto o escudo estiver aberto e sendo utilizado", peso:"15.0", pagina:197 },

    { id:"protecao-pilastras-comuns", categoria:"protecao", subtipo:"Objeto", nome:"Pilastras Comuns", protecao:"35/35", pagina:197 },
    { id:"protecao-pilastras-de-metal", categoria:"protecao", subtipo:"Objeto", nome:"Pilastras de Metal", protecao:"60/60", pagina:197 },
    { id:"protecao-porta-do-carro", categoria:"protecao", subtipo:"Objeto", nome:"Porta do Carro", protecao:"15/15", pagina:197 },
    { id:"protecao-carro", categoria:"protecao", subtipo:"Objeto", nome:"Carro", protecao:"80/80", pagina:197 },
    { id:"protecao-onibus", categoria:"protecao", subtipo:"Objeto", nome:"Ônibus", protecao:"150/150", pagina:197 },
    { id:"protecao-mesa-de-madeira", categoria:"protecao", subtipo:"Objeto", nome:"Mesa de Madeira", protecao:"10/10", pagina:197 },
    { id:"protecao-mesa-de-metal", categoria:"protecao", subtipo:"Objeto", nome:"Mesa de Metal", protecao:"20/20", pagina:197 },
    { id:"protecao-arvores", categoria:"protecao", subtipo:"Objeto", nome:"Árvores", protecao:"30/30", pagina:197 },

    /* ================= ITENS MÉDICOS (págs. 248–249) =================
       Lista de itens médicos e o tempo médio do processo de utilização,
       conforme a seção "ITENS MÉDICOS" (pág. 248) e sua continuação na
       pág. 249. O livro não subdivide esta categoria em "Tipo" (não há
       coluna equivalente à de Armas de Fogo/Proteção), por isso nenhum
       "subtipo" foi atribuído a estes itens. */
    { id:"medico-bandagens", categoria:"medicos", nome:"Bandagens",
      detalhes:"Efeito: +2 HP | Encerra SANGRAR. Tempo de tratamento: +5 minutos por unidade.", peso:"0.1", pagina:248 },
    { id:"medico-medicamentos", categoria:"medicos", nome:"Medicamentos",
      detalhes:"Efeito: +1 HP | Encerra FEBRE e Desvantagens por dor ou HEMORRAGIA. Tempo de tratamento: +2 minutos por unidade.", peso:"0.01", pagina:248 },
    { id:"medico-soro", categoria:"medicos", nome:"Soro",
      detalhes:"Efeito: +5 HP | Encerra narrativas de inconsciência por HEMORRAGIA. Tempo de tratamento: +40 minutos por unidade.", peso:"0.5", pagina:248 },
    { id:"medico-primeiros-socorros", categoria:"medicos", nome:"Primeiros Socorros",
      detalhes:"Efeito: +1d12 de HP | Retira de MORRENDO. Tempo de tratamento: +30 minutos por unidade.", peso:"1.0", pagina:248 },
    { id:"medico-primeiros-socorros-queimadura", categoria:"medicos", nome:"Primeiros Socorros para Queimadura",
      detalhes:"Efeito: +1d12 de HP | Retira desvantagens e penalidades de INCENDIADO. Tempo de tratamento: +30 minutos por unidade.", peso:"1.0", pagina:249 },
    { id:"medico-antidoto", categoria:"medicos", nome:"Antídoto",
      detalhes:"Efeito: Encerra ENVENENADO. Tempo de tratamento: +5 minutos por unidade.", peso:"0.1", pagina:249 },

    /* ================= ITENS PSICOATIVOS (pág. 251) =================
       Lista de itens psicoativos, sob o cabeçalho "ITENS PSICOATIVOS"
       (pág. 251). "subtipo" recebe o nível do psicoativo ("Psicoativo
       Nível 1"/"Nível 2") exatamente quando o próprio item traz essa
       informação entre chaves no livro — Amorelofeliz e Nautolokin NÃO
       trazem essa tag no item (ver "obs" de cada um), então nestes dois
       o subtipo foi deixado em branco em vez de presumido. */
    { id:"psicoativo-calmante-estressodine", categoria:"psicoativos", subtipo:"Psicoativo Nível 1", nome:"Calmante \"Estressodine\"",
      detalhes:"Efeito: +1d4 de SAN | Diminui 1/2 de efeitos causados por ansiedade, nervosismo, medo ou raiva. Tempo de tratamento: +2 minutos por unidade.", peso:"0.01", pagina:251 },
    { id:"psicoativo-calmante-tanervous", categoria:"psicoativos", subtipo:"Psicoativo Nível 1", nome:"Calmante \"Tanervous\"",
      detalhes:"Efeito: +1d6 de SAN | Diminui 1/2 de efeitos causados por ansiedade, nervosismo, medo ou raiva. Tempo de tratamento: +2 minutos por unidade.", peso:"0.01", pagina:251 },
    { id:"psicoativo-estimulante-azul", categoria:"psicoativos", subtipo:"Psicoativo Nível 2", nome:"Estimulante \"Azul\"",
      detalhes:"Efeito: +1d8 de SAN | Diminui 1/2 efeitos de paralisia que tenham relação psicológica; elimina desvantagens por dor física; concede mais disposição física e psicológica. Tempo de tratamento: +5 minutos por unidade.", peso:"0.01", pagina:251 },
    { id:"psicoativo-estimulante-vermelho", categoria:"psicoativos", subtipo:"Psicoativo Nível 2", nome:"Estimulante \"Vermelho\"",
      detalhes:"Efeito: +1d4+1d6 de SAN | Diminui 1/2 efeitos de paralisia que tenham relação psicológica; elimina desvantagens por dor física; concede mais disposição física e psicológica. Tempo de tratamento: +5 minutos por unidade.", peso:"0.01", pagina:251 },
    { id:"psicoativo-antidepressivo-amorelofeliz", categoria:"psicoativos", nome:"Antidepressivo \"Amorelofeliz\"",
      detalhes:"Efeito: +1d20 de SAN | Remove qualquer estado de paralisia causado por condições que afetem o psicológico, exceto se for um efeito colateral nível 3; encerra sentimentos depressivos de personagens por 1d4 dias. Tempo de tratamento: +10 minutos por unidade.",
      obs:"O livro não indica um \"Psicoativo Nível X\" para este item (diferente dos demais desta lista, que trazem essa tag entre chaves). A recuperação de 1d20 de SAN está na faixa descrita para Psicoativo NV3 no texto das págs. 248–249, mas isso não é afirmado no próprio item — por isso o campo de nível/subtipo foi deixado em branco em vez de presumido.",
      peso:"0.5", pagina:251 },
    { id:"psicoativo-antipsicotico-nautolokin", categoria:"psicoativos", nome:"Antipsicótico \"Nautolokin\"",
      detalhes:"Efeito: +1d20 de SAN | Remove 1 doença psicológica ou 1 problema psicológico à vontade do jogador. Tempo de tratamento: +10 minutos por unidade.",
      obs:"O livro não indica um \"Psicoativo Nível X\" para este item (diferente dos demais desta lista, que trazem essa tag entre chaves). A recuperação de 1d20 de SAN está na faixa descrita para Psicoativo NV3 no texto das págs. 248–249, mas isso não é afirmado no próprio item — por isso o campo de nível/subtipo foi deixado em branco em vez de presumido.",
      peso:"0.5", pagina:251 },

    /* ================= ESTIMULANTES CONECTADOS (pág. 252) =================
       "Lista de Estimulantes Conectados" (pág. 252). Categoria tratada
       aqui como "itens-conectados", correspondendo ao nome pedido para
       esta etapa ("Itens Conectados"); o próprio livro nomeia a seção
       como "Estimulantes Conectados". */
    { id:"item-conectado-ampola-sangue-carnical", categoria:"itens-conectados", nome:"Ampola de Sangue Carniçal",
      detalhes:"Efeito: Beba para ganhar +1d4 em ATK C para Conexões Carniçais. Duração: 1 rodada.", peso:"0.1", pagina:252 },
    { id:"item-conectado-garrafa-sangue-carnical", categoria:"itens-conectados", nome:"Garrafa de Sangue Carniçal",
      detalhes:"Efeito: Beba para ganhar +2d4+1 Vantagem em ATK C para Conexões Carniçais. Duração: 3 rodadas.", peso:"0.8", pagina:252 },
    { id:"item-conectado-frasco-oleo-seiva-conectada", categoria:"itens-conectados", nome:"Frasco com Óleo de Seiva Conectada Diluída",
      detalhes:"Efeito: Beba para ganhar +1d6 em ATK C para Conexões Terrenas. Duração: 1 rodada.", peso:"0.2", pagina:252 },
    { id:"item-conectado-frasco-carne-infernacula", categoria:"itens-conectados", nome:"Frasco com Carne Infernácula Diluída",
      detalhes:"Efeito: Beba para ganhar +2d4 em dano de Conexões Infernais. Duração: 2 rodadas.", peso:"0.2", pagina:252 },
    { id:"item-conectado-frasco-gelo-sagrado", categoria:"itens-conectados", nome:"Frasco de Gelo Sagrado",
      detalhes:"Efeito: Beba e diminua danos de Conexões Terrenas de fogo ou calor em -1d12. Duração: 1 ataque.", peso:"0.2", pagina:252 },
    { id:"item-conectado-frasco-materia-sombria", categoria:"itens-conectados", nome:"Frasco Matéria Sombria",
      detalhes:"Efeito: Beba para ganhar 1d4 de dano em ATK C de Conexões Sombrias; não realizará Consumo e nem Corrupção. Duração: 1 rodada.", peso:"0.8", pagina:252 },
    { id:"item-conectado-pilula-fortalecimento", categoria:"itens-conectados", nome:"Pílula de Fortalecimento",
      detalhes:"Efeito: Coma para ganhar 1 Vantagem e +1d4 em todos os ATKs; -5 de HP. Duração: 3 rodadas.", peso:"0.01", pagina:252 }
  ];

  /* ---------------------------------------------------------
     Categorias — ordem/rótulo em que este módulo organiza os
     equipamentos, seguindo a própria divisão do livro (ver
     comentário no topo do arquivo). Não é uma segunda fonte: é só
     a lista de valores já usados no campo "categoria" acima.
     --------------------------------------------------------- */
  var EQ_CAT_ORDER = ["armas-fogo", "laminas", "madeira", "metal", "vidro", "explosivos", "protecao", "medicos", "psicoativos", "itens-conectados"];
  var EQ_CAT_LABELS = {
    "armas-fogo": "Armas de Fogo",
    "laminas": "Lâminas",
    "madeira": "Madeira",
    "metal": "Metal",
    "vidro": "Vidro",
    "explosivos": "Explosivos",
    "protecao": "Proteção",
    "medicos": "Médicos",
    "psicoativos": "Psicoativos",
    "itens-conectados": "Itens Conectados"
  };

  function catLabel(key){ return EQ_CAT_LABELS[key] || key; }

  var eq_activeCat = "todas";
  var eq_searchQuery = "";

  function esc(s){
    if (typeof escapeHtml === "function") return escapeHtml(s);
    var d = document.createElement("div");
    d.textContent = (s === undefined || s === null) ? "" : String(s);
    return d.innerHTML;
  }

  function findItemById(id){
    for (var i = 0; i < EQUIPAMENTOS_DATA.length; i++){
      if (EQUIPAMENTOS_DATA[i].id === id) return EQUIPAMENTOS_DATA[i];
    }
    return null;
  }

  /* linha curta de estatísticas para o card (só mostra o que o item tem) */
  function statLine(it){
    var parts = [];
    if (it.dano) parts.push("Dano: " + it.dano);
    if (it.protecao) parts.push("Proteção: " + it.protecao);
    if (it.municao) parts.push("Munição: " + it.municao);
    if (it.distancia) parts.push("Distância: " + it.distancia);
    if (it.porte) parts.push("Porte: " + it.porte);
    if (it.peso) parts.push("Peso: " + it.peso);
    return parts.join(" · ");
  }

  /* ==========================================================
     COMPÊNDIO → "EQUIPAMENTOS"
     Nova sub-aba dentro do Compêndio já existente, seguindo
     exatamente o mesmo padrão de integração já usado por Marcos de
     Corrupção: mesma barra de sub-abas (".subtab-row" dentro de
     #tab-compendio), mesmas classes ".subtab-btn"/".subtab-panel"
     para herdar o estilo, mesmos ".cx-filters"/".cx-filter-btn" já
     existentes para os filtros por categoria. O campo de pesquisa
     por nome reaproveita a classe genérica ".field" já usada em
     outros formulários do projeto (ver character-connections.js).
     ========================================================== */

  function ensureCompendioTab(){
    if (document.getElementById("sub-comp-equipamentos")) return;
    var subtabRow = document.querySelector("#tab-compendio .subtab-row");
    var compPanel = document.querySelector("#tab-compendio .panel");
    if (!subtabRow || !compPanel) return;

    var btn = document.createElement("button");
    btn.className = "subtab-btn";
    btn.setAttribute("data-sub", "comp-equipamentos");
    btn.textContent = "Equipamentos";
    subtabRow.appendChild(btn);

    var panel = document.createElement("div");
    panel.className = "subtab-panel";
    panel.id = "sub-comp-equipamentos";
    panel.innerHTML =
      '<p class="note" style="text-align:left; margin:0 0 14px;">Armas de fogo, lâminas, armamentos de madeira e metal, vidro, explosivos e itens de proteção (Sistema de OdC, págs. 186–197). Filtre por categoria, pesquise por nome ou clique em um equipamento para ver a descrição completa.</p>' +
      '<div class="field" style="max-width:320px; margin-bottom:12px;"><label>Pesquisar</label>' +
        '<input type="text" id="eq_search" placeholder="Nome do equipamento…"></div>' +
      '<div id="eq_filters" class="cx-filters"></div>' +
      '<div id="eq_count" class="note" style="text-align:left;"></div>' +
      '<div id="eq_grid" class="cx-grid"></div>';
    compPanel.appendChild(panel);

    btn.addEventListener("click", function(){
      document.querySelectorAll(".subtab-btn").forEach(function(b){ b.classList.remove("active"); });
      document.querySelectorAll(".subtab-panel").forEach(function(p){ p.classList.remove("active"); });
      btn.classList.add("active");
      panel.classList.add("active");
    });

    var searchEl = document.getElementById("eq_search");
    searchEl.addEventListener("input", function(){
      eq_searchQuery = (searchEl.value || "").toLowerCase().trim();
      renderGrid();
    });
  }

  function renderFilters(){
    var wrap = document.getElementById("eq_filters");
    if (!wrap || wrap.dataset.built) return;
    var html = '<button class="cx-filter-btn cx-filter-all active" data-eqfilter="todas">Todas</button>';
    EQ_CAT_ORDER.forEach(function(key){
      html += '<button class="cx-filter-btn cx-equipamento" data-eqfilter="' + key + '"><span class="dot"></span>' + esc(catLabel(key)) + '</button>';
    });
    wrap.innerHTML = html;
    wrap.dataset.built = "1";
    wrap.querySelectorAll("[data-eqfilter]").forEach(function(b){
      b.addEventListener("click", function(){
        eq_activeCat = b.getAttribute("data-eqfilter");
        wrap.querySelectorAll("[data-eqfilter]").forEach(function(x){ x.classList.remove("active"); });
        b.classList.add("active");
        renderGrid();
      });
    });
  }

  function renderGrid(){
    var grid = document.getElementById("eq_grid");
    var countEl = document.getElementById("eq_count");
    if (!grid) return;

    var list = EQUIPAMENTOS_DATA;
    if (eq_activeCat !== "todas"){
      list = list.filter(function(it){ return it.categoria === eq_activeCat; });
    }
    if (eq_searchQuery){
      list = list.filter(function(it){ return it.nome.toLowerCase().indexOf(eq_searchQuery) !== -1; });
    }
    // Dentro de cada categoria, mantém a ordem crescente definida em EQ_CAT_ORDER,
    // e dentro da categoria a ordem em que os itens aparecem no livro.
    list = list.slice().sort(function(a, b){
      if (a.categoria === b.categoria) return 0;
      return EQ_CAT_ORDER.indexOf(a.categoria) - EQ_CAT_ORDER.indexOf(b.categoria);
    });

    if (countEl) countEl.textContent = list.length + " equipamento" + (list.length === 1 ? "" : "s");

    grid.innerHTML = "";
    if (list.length === 0){
      grid.innerHTML = '<div class="cx-empty">Nenhum equipamento encontrado para este filtro.</div>';
      return;
    }

    list.forEach(function(it){
      var card = document.createElement("div");
      card.className = "cx-card cx-equipamento";
      var stats = statLine(it);
      card.innerHTML =
        '<div class="cx-body">' +
          '<h4>' + esc(it.nome) + '</h4>' +
          '<div class="cx-dimlabel">' + esc(catLabel(it.categoria)) + (it.subtipo ? " · " + esc(it.subtipo) : "") + '</div>' +
          (stats ? '<p style="margin:6px 0 0; font-size:11.5px; line-height:1.55; color:var(--paper-dim);">' + esc(stats) + '</p>' : '') +
        '</div>' +
        '<div class="cx-arrow">&rsaquo;</div>';
      card.addEventListener("click", function(){ openItemModal(it.id); });
      grid.appendChild(card);
    });
  }

  /* ==========================================================
     MODAL DE DETALHES
     Modal próprio, dedicado aos Equipamentos, reaproveitando a
     MESMA estrutura genérica de modal (".modal-overlay"/
     ".modal-box"/".cx-modal-box"/".cx-modal-section"/
     ".modal-actions"/".fonte-tag") já usada pelos demais modais do
     projeto (mesmo padrão já seguido por marcos-corrupcao.js) —
     nenhum sistema de popup novo é criado.
     ========================================================== */

  function ensureModal(){
    if (document.getElementById("eq_modal")) return;
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "eq_modal";
    overlay.innerHTML =
      '<div class="modal-box cx-modal-box cx-equipamento" id="eq_modal_box">' +
        '<h3 id="eq_modal_title"></h3>' +
        '<div class="cx-modal-dim" id="eq_modal_cat"></div>' +
        '<div class="cx-modal-section" id="eq_modal_stats"></div>' +
        '<div class="cx-modal-section" id="eq_modal_detalhes_wrap" style="display:none;"><p id="eq_modal_detalhes" style="white-space:pre-wrap;"></p></div>' +
        '<div class="cx-modal-section" id="eq_modal_obs_wrap" style="display:none;"><p id="eq_modal_obs" style="white-space:pre-wrap; font-style:italic;"></p></div>' +
        '<div class="fonte-tag" id="eq_modal_page" style="margin-top:10px;"></div>' +
        '<div class="modal-actions" style="margin-top:14px; justify-content:flex-end;">' +
          '<button type="button" id="eq_modal_close">Fechar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById("eq_modal_close").addEventListener("click", closeItemModal);
    overlay.addEventListener("click", function(e){
      if (e.target.id === "eq_modal") closeItemModal();
    });
  }

  function openItemModal(id){
    var it = findItemById(id);
    if (!it) return;
    ensureModal();
    document.getElementById("eq_modal_title").textContent = it.nome;
    document.getElementById("eq_modal_cat").textContent = catLabel(it.categoria) + (it.subtipo ? " · " + it.subtipo : "");

    var statsHtml = "";
    if (it.dano) statsHtml += '<p><strong>Dano:</strong> ' + esc(it.dano) + '</p>';
    if (it.protecao) statsHtml += '<p><strong>Proteção:</strong> ' + esc(it.protecao) + '</p>';
    if (it.municao) statsHtml += '<p><strong>Munição:</strong> ' + esc(it.municao) + '</p>';
    if (it.distancia) statsHtml += '<p><strong>Distância:</strong> ' + esc(it.distancia) + '</p>';
    if (it.porte) statsHtml += '<p><strong>Porte:</strong> ' + esc(it.porte) + '</p>';
    if (it.peso) statsHtml += '<p><strong>Peso:</strong> ' + esc(it.peso) + '</p>';
    document.getElementById("eq_modal_stats").innerHTML = statsHtml;

    var detalhesWrap = document.getElementById("eq_modal_detalhes_wrap");
    if (it.detalhes){
      document.getElementById("eq_modal_detalhes").textContent = it.detalhes;
      detalhesWrap.style.display = "";
    } else {
      detalhesWrap.style.display = "none";
    }

    var obsWrap = document.getElementById("eq_modal_obs_wrap");
    if (it.obs){
      document.getElementById("eq_modal_obs").textContent = "OBS.: " + it.obs;
      obsWrap.style.display = "";
    } else {
      obsWrap.style.display = "none";
    }

    document.getElementById("eq_modal_page").textContent = "Sistema de OdC — pág. " + it.pagina;
    document.getElementById("eq_modal").style.display = "flex";
  }

  function closeItemModal(){
    var m = document.getElementById("eq_modal");
    if (m) m.style.display = "none";
  }

  /* ---------- boot ---------- */
  function init(){
    ensureCompendioTab();
    renderFilters();
    renderGrid();
  }

  window.Equipamentos = {
    init: init,
    refresh: renderGrid,
    data: EQUIPAMENTOS_DATA,
    openItemModal: openItemModal,
    /* ---------------------------------------------------------
       Helpers mínimos, expostos só para permitir a integração do
       Inventário (js/equipamentos-agente.js) sem duplicar dados nem
       recriar a lógica de categorias/busca por ID já existentes
       acima — nada aqui muda o comportamento do Compêndio em si.
       --------------------------------------------------------- */
    findItemById: findItemById,
    catOrder: EQ_CAT_ORDER,
    catLabels: EQ_CAT_LABELS,
    catLabel: catLabel
  };

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
