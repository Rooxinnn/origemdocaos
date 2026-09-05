/* ==========================================================
   COMPÊNDIO DE REGRAS DE CRIATURAS — Etapa 1 (Regras Gerais /
   Infecção / Sanidade Negativa / Habilidades de Criaturas /
   Habilidades em 50)

   Módulo isolado. Não reescreve, não refatora e não altera nenhum
   sistema já existente do Origem do Caos (Agentes, Compêndio de
   Regras dos Agentes — #tab-compendio/COMPENDIO_CATEGORIES —,
   Compêndio de Criaturas — bestiário, js/criaturas-compendio.js —,
   Ficha de Criatura, Minhas Criaturas, Backup, Conexões,
   Inventário, Corrupção, Infecção de Agentes).

   ATENÇÃO SOBRE O NOME DO ARQUIVO: o pedido original sugeria o
   nome "criaturas-compendio.js" para este módulo, mas esse nome já
   pertence a outro módulo existente no projeto (o catálogo visual
   de criaturas/bestiário — Solis, etc., organizado por Dimensão).
   Por isso este arquivo (e seu par CSS, caso um dia seja
   necessário) usa o nome "criaturas-regras.js", para não colidir
   nem sobrescrever aquele módulo. Ver aviso equivalente no
   relatório de entrega.

   IDENTIDADE VISUAL: este módulo NÃO define nenhuma classe CSS
   nova. Ele reaproveita, tal como estão, as classes GLOBAIS já
   definidas no <style> de index.html e usadas pelo Compêndio de
   Regras dos Agentes (#tab-compendio): .compendio-section/
   .compendio-section-header/.sec-arrow/.sec-count/
   .compendio-section-body/.compendio-grid/.compendio-card/
   .cat-tag/.fonte-tag/.expand-hint — e, para a moldura da tela,
   as mesmas classes genéricas dos Arquivos Secretos já usadas
   pelos outros módulos de Criaturas: .secret-wrap/.secret-header/
   .secret-eyebrow/.secret-divider/.secret-back-btn, além de
   .field/.list-add-row/.note já usados em toda a ficha. Como
   resultado, esta tela é visualmente idêntica ao Compêndio de
   Regras dos Agentes — mesmos accordions, cards, contagem,
   pesquisa e comportamento de expandir/recolher — sem precisar de
   nenhum arquivo CSS novo.

   CONTEÚDO: todo o conteúdo abaixo vem exclusivamente do
   levantamento já realizado no PDF (Sistema de OdC V1.0.3,
   Capítulo XI — Ficha de Criatura e Pet, p. 501–516 e p. 549–550).
   Nada foi inventado. Onde o PDF não trazia uma informação em
   texto legível nesta revisão (ex.: a matriz completa de qual
   elemento vence qual, no Sistema de Elementos), isso é indicado
   explicitamente na própria descrição, como nota, em vez de
   inventado ou omitido silenciosamente.

   CORREÇÃO DE CONTAGEM: o levantamento anterior (TIPO 1) apontou
   "30 entradas" para Habilidades em 50 — Criaturas. Ao reler o
   PDF página a página nesta etapa, o número real encontrado é 44
   entradas (p. 512–516). A contagem usada neste módulo, e exibida
   na tela, é sempre a real (length dos arrays abaixo) — nunca um
   número fixo digitado à mão.
   ========================================================== */
(function(){
  "use strict";

  function esc(s){
    if(typeof window.escapeHtml === "function") return window.escapeHtml(s);
    const d = document.createElement("div");
    d.textContent = (s === undefined || s === null) ? "" : String(s);
    return d.innerHTML;
  }

  /* ---------------------------------------------------------
     1) REGRAS GERAIS
     --------------------------------------------------------- */
  const CRR_REGRAS_GERAIS = [
    {
      nome: "Periculosidade & Nível",
      desc: "Cada criatura tem um Nível (1 a 10), que define quantos pontos ela recebe para distribuir na ficha, e uma Periculosidade, que define o dano máximo de sua habilidade especial, o Dano de Sanidade sofrido por quem a enfrenta e a base de sua Resistência Natural.\n\nNível | Periculosidade | Dano de Sanidade | Pontos para distribuir\n1 | 1 ou 2 | 1 | 40\n2 | 1 ou 2 | 1 | 65\n3 | 2 ou 3 | 1 | 85\n4 | 3 ou 4 | 1 | 100\n5 | 4 ou 5 | 2 | 120\n6 | 5 ou 6 | 2 | 180\n7 | 6 ou 7 | 2 | 230\n8 | 7 ou 8 | 3 | 280\n9 | 8 ou 9 | 5 | 350\n10 | 10 | 10 | 450\n\nA quantidade de vezes que um personagem sofre esse Impacto de Sanidade, até se acostumar com aquela criatura, depende da Periculosidade: 1 ou 2 → 1 encontro; 3 → 3 encontros; 4 a 6 → 5 encontros; 7 → 8 encontros; 8 a 10 → 10 encontros. Encontrar mais de uma criatura ao mesmo tempo conta como um único Impacto de Sanidade.",
      fonte: "OdC v1.0.3 — p. 501–502"
    },
    {
      nome: "Pontos de Batalha — P.B.",
      desc: "Mecânica exclusiva de criaturas. A cada ação principal, cada ação de resposta a um ataque sofrido e ao fim de cada turno, a criatura acumula 1 ponto de P.B., até o máximo de 15.\n\nA criatura pode gastar sua ação principal da rodada para consumir todo o P.B. acumulado e recuperar, na mesma proporção, pontos gastos de Habilidades, Talentos, Atributos e Perícias — ou, numa ação de ataque, consumir 15 pontos de uma vez para dobrar o dano causado. P.B. também é usado para ativar habilidades especiais ou Conexões da criatura. Uma criatura que não possui o sistema de Corrupção paga 3 P.B. para realizar um DESV O.",
      fonte: "OdC v1.0.3 — p. 505–506"
    },
    {
      nome: "Elementos de Criaturas",
      desc: "Criaturas Terrenas cujo corpo é formado inteiramente por um elemento — Primários: Fogo, Terra, Água, Ar, Eletricidade; Variados: Areia, Gelo, Lava, Metal, Cristal, Névoa, Madeira — podem ganhar ou sofrer efeitos ao enfrentar uma criatura ou Conexão de elemento oposto.\n\nRegras do Sistema de Elementos de Criaturas:\n• Benefício sobre outro elemento → +5 na rolagem de ATK e DEF.\n• Punição contra outro elemento → -5 na rolagem de ATK e DEF.\n• Resistência contra um elemento → -10 no dano recebido desse elemento.\n• Agravante contra um elemento → +10 no dano recebido desse elemento.\n\n[Nota: o PDF descreve estas quatro categorias (Benefícios/Punições/Resistências/Agravantes) e as regras acima, mas a tabela completa de qual elemento tem vantagem sobre qual não veio em texto legível nesta revisão — provavelmente é um diagrama/imagem. Fica como pendência para uma revisão futura, sem inventar a matriz.]",
      fonte: "OdC v1.0.3 — p. 549–550"
    }
  ];

  /* ---------------------------------------------------------
     2) INFECÇÃO
     --------------------------------------------------------- */
  const CRR_INFECCAO = [
    {
      nome: "Regras de Infecção em Criaturas",
      desc: "Criaturas não sofrem Corrupção, mas podem ser Infectadas — inclusive um Vagante, cuja contagem de Infecção reinicia ao alcançar essa forma. Só não podem ser infectadas criaturas formadas puramente por um elemento ou energia, sem corpo biológico (de qualquer Dimensão: Sombria, Carniçal, Terrena, Arkanjerial, Infernal ou Perdição).\n\nRegras específicas de criaturas:\n1. Elos Naturais são incapazes de infectar um ao outro.\n2. Elos de Repulsa causam mais Infecção que Elos de Incompetência (a diferença fica indicada na descrição de cada habilidade).\n3. Alcançar o ápice de Infecção não transforma a criatura (ver tabela).\n4. Criaturas Arkanjeriais infectadas pela Infecção Infernal se tornam Criaturas Infernais e são banidas do Paraíso — único caso de conversão ao alcançar o ápice.\n5. Criaturas não recebem Infecção só por estarem fora de sua Dimensão de origem, exceto Vagantes.\n6. A RES. N. de um Deus ou de um Grande Rei do Inferno também funciona contra Infecção.\n7. Os efeitos de Infecção são acumulativos.\n\nO limite de Infecção de uma criatura é 70 pontos. Não há campo próprio na ficha para isso — recomenda-se anotar na área de Registro das Condições Físicas da Criatura.",
      fonte: "OdC v1.0.3 — p. 510"
    },
    {
      nome: "Tabela de Infecção (5 a 70)",
      desc: "A cada marco de Infecção, uma nova consequência se soma às anteriores. Se a criatura alcançar um valor alto de uma só vez, todos os marcos anteriores são aplicados de uma vez.\n\n5 → 1d8 de dano de Sanidade + Desvantagem na próxima ação.\n10 → 1d8 de dano de Sanidade + 1d12 de dano de HP; por 1d4 rodadas, Desvantagem numa ação principal.\n20 → 1d12 de dano de Sanidade e HP; por 1d4 rodadas, Desvantagem numa ação principal e -5 nessa rolagem.\n30 → 1d20 de dano de Sanidade e HP; status FRACO por 1d4 rodadas, perdendo todas as Vantagens nesse período.\n35 → a criatura perde sua próxima rodada.\n40 → 1d20 de dano de Sanidade + 2d12 de dano de HP; perde todas as Vantagens permanentemente.\n55 → fica Paralisada na rodada seguinte; Movimentação cortada pela metade permanentemente.\n65 → 1d20 de dano de Sanidade + 2d20 de dano de HP; toda ação que usa P.B. passa a custar o dobro (limite 15); perde suas Passivas.\n70 → a criatura é completamente destruída.",
      fonte: "OdC v1.0.3 — p. 511"
    }
  ];

  /* ---------------------------------------------------------
     3) SANIDADE NEGATIVA
     --------------------------------------------------------- */
  const CRR_SANIDADE_NEGATIVA = [
    {
      nome: "Sanidade Negativa de Criaturas",
      desc: "Assim como personagens humanos, criaturas podem chegar à Sanidade Negativa, até o limite de -12. Porém, diferente de humanos, criaturas não desenvolvem problemas ou doenças psicológicas — em vez disso, acumulam Desvantagens, Penalidades e Consequências.\n\nQuanto mais próxima de zero (mais negativa) a Sanidade, mais cuidadosa, menos reativa e mais acuada a criatura se torna, podendo tentar fugir do combate para sobreviver ou passar a evitar atacar o personagem que lhe parece mais forte ou mais ameaçador.",
      fonte: "OdC v1.0.3 — p. 509"
    },
    {
      nome: "Tabela de Consequências (0 a -12)",
      desc: "0 → a criatura obtém uma Desvantagem.\n\n-3 → a criatura obtém uma Penalidade de -5 em suas rolagens.\n\n-5 → a criatura obtém ÓDIO e ataca qualquer personagem a até 5m de distância; a Penalidade aumenta para -8 e acumula +1 Desvantagem.\n\n-7 → a criatura passa a atacar qualquer personagem ou objeto próximo a até 5m; sua Movimentação é cortada pela metade.\n\n-10 → no início de seu turno, a criatura deve testar RESISTÊNCIA PSÍQUICA contra DT 12; se falhar, gasta a ação principal atacando o vazio e não pode se movimentar nesse turno, tentando se afastar e fugir; a Penalidade aumenta para -10.\n\n-12 → no início de seu turno, a criatura deve testar RESISTÊNCIA PSÍQUICA contra DT 15; se falhar, ataca a si mesma.",
      fonte: "OdC v1.0.3 — p. 509"
    }
  ];

  /* ---------------------------------------------------------
     4) HABILIDADES DE CRIATURAS
     (estrutura de construção — p. 506–508; as habilidades
     específicas de cada criatura do bestiário, como as de Solis
     ou Miguel, pertencem a uma etapa futura do Compêndio, fora do
     escopo desta implementação)
     --------------------------------------------------------- */
  const CRR_HABILIDADES_CRIATURAS = [
    {
      nome: "Nome + Dado",
      desc: "Primeira parte da descrição de qualquer Habilidade Especial de criatura: o anúncio do nome da habilidade e o dado (ação) que será utilizado. Exemplo: \"Névoa Sombria | ATK C\".",
      fonte: "OdC v1.0.3 — p. 507"
    },
    {
      nome: "Consumo",
      desc: "Algumas habilidades, para manter o balanceamento do jogo, cobram uma quantia de vida da criatura ou de P.B. (o tipo de consumo mais comum). Quanto mais forte ou arriscada a habilidade, mais justo deve ser o Consumo exigido. Exemplo: \"Névoa Sombria | ATK C | Consumo: 3 P.B.\".",
      fonte: "OdC v1.0.3 — p. 507"
    },
    {
      nome: "Condição",
      desc: "Define o momento em que uma ação pode ser realizada. Algumas ações exigem uma condição específica — por exemplo, \"Estrangular\" só pode ser usada se a ação \"Agarrar\" tiver sido bem-sucedida antes; outras ações não pedem condição alguma.",
      fonte: "OdC v1.0.3 — p. 507"
    },
    {
      nome: "Descrição",
      desc: "É a explicação de como a criatura executa aquela ação — o que deve ser narrado na cena. Diferenças grandes entre o dado de ataque da criatura e o de defesa/desvio do personagem (por exemplo, o dobro do valor) podem justificar uma ação composta e narrativamente mais rica, sem que isso conte como um segundo ataque — apenas uma consequência do ataque único.",
      fonte: "OdC v1.0.3 — p. 507"
    },
    {
      nome: "Consequência",
      desc: "Nem toda ação tem uma consequência, mas algumas causam uma Ativação: um efeito que aumenta o poder de um personagem, ou lhe causa dano, Desvantagem ou penalidade (por exemplo, o status ENVENENADO). Quando existir, a consequência — o status ou efeito causado, e o que ele acarreta — deve ser descrita claramente junto da ação.",
      fonte: "OdC v1.0.3 — p. 508"
    },
    {
      nome: "Aprimorar",
      desc: "Algumas habilidades podem ser aprimoradas, concedendo, em troca de um custo justo, um aumento de sua efetividade. Os critérios ou penalidades para ativar um Aprimoramento ficam a critério do Mestre, conforme a intenção de equilíbrio (ou desequilíbrio proposital) para a cena em que a criatura aparecer.",
      fonte: "OdC v1.0.3 — p. 508"
    },
    {
      nome: "Fórmula Completa da Habilidade",
      desc: "Juntando todas as partes acima, a construção completa da descrição de uma Habilidade Especial de criatura é:\n\nNome | Dado | Consumo | Efeito: Condição + Descrição + Consequência | Aprimorar\n\nNota: este é o formato/estrutura geral usado por qualquer habilidade de criatura no sistema. As habilidades específicas de cada criatura do bestiário (por exemplo, as de Solis, Miguel, Golgorem etc.) fazem parte de uma etapa futura do Compêndio — aqui está apenas a regra geral de como elas são construídas.",
      fonte: "OdC v1.0.3 — p. 506–508"
    }
  ];

  /* ---------------------------------------------------------
     5) HABILIDADES EM 50 — CRIATURAS
     44 entradas (levantamento integral do PDF, p. 512–516).
     Nomeadas no mesmo padrão já usado pelo Compêndio de Agentes
     ("<Conhecimento> — 50 — <Nome da Habilidade>").
     --------------------------------------------------------- */
  const CRR_HABILIDADES_50 = [
    {nome:"Arrombamento — 50 — Aberto a Força", desc:"A criatura pode adicionar +1d20 em sua rolagem de Arrombamento.", fonte:"OdC v1.0.3 — p. 512"},
    {nome:"Ferramenta — 50 — Criação Inteligente", desc:"A criatura obtém Vantagem ao rolar Ferramenta. Em Sucesso Extremo, o objeto que está criando ganha um efeito especial ou causa uma alteração de status.", fonte:"OdC v1.0.3 — p. 512"},
    {nome:"Roubo — 50 — Posse do Mais Forte", desc:"A criatura rola Roubo com bônus de +10. Ao desarmar um personagem, este deve testar Res. Psi. + Assimilação contra DT 15; se falhar, fica PARALISADO de Medo por 1 rodada.", fonte:"OdC v1.0.3 — p. 512"},
    {nome:"Flexibilidade — 50 — Corpo Anormal", desc:"Ações de Flexibilidade deixam de ser consideradas Ação Principal.", fonte:"OdC v1.0.3 — p. 512"},
    {nome:"Natação — 50 — Caçador Aquático", desc:"Enquanto na água, a movimentação da criatura é dobrada e ela ganha o direito a uma ação principal extra por turno.", fonte:"OdC v1.0.3 — p. 512"},
    {nome:"Sentido Paranormal — 50 — Cria do Paranormal", desc:"ATK C, DEF C e DESV O possuem Vantagem. A criatura identifica e sente com perfeição qualquer personagem ou criatura dentro de um raio de 50m.", fonte:"OdC v1.0.3 — p. 512"},
    {nome:"Ilusionismo — 50 — Iludir o Paranormal", desc:"A criatura engana um alvo, causando Desvantagem em sua próxima ação ou reação. Rolagens de Ilusionismo da criatura têm Vantagem e bônus de +10.", fonte:"OdC v1.0.3 — p. 512"},
    {nome:"Manipulação — 50 — Provocação do Paranormal", desc:"Ações de Manipulação da criatura são roladas com Vantagem e bônus de +10.", fonte:"OdC v1.0.3 — p. 512"},
    {nome:"Intimidação — 50 — Temam e Tremam", desc:"Quem encontra a criatura pela primeira vez testa Res. Psi. + Assimilação + Ocultismo contra DT 25; se falhar, fica PARALISADO por 1 rodada. Quem ataca esta criatura sofre 1 Desvantagem.", fonte:"OdC v1.0.3 — p. 512"},
    {nome:"Atletismo — 50 — Não Adianta Correr", desc:"A criatura obtém Vantagem em qualquer ação de Atletismo, e +5 de bônus quando precisa rolar Atletismo para alcançar um personagem.", fonte:"OdC v1.0.3 — p. 512"},
    {nome:"Trabalho em Equipe — 50 — Caçada Conjunta", desc:"Gastando 1 P.B. + 1 ponto de Trabalho em Equipe, a criatura realiza um ataque junto de outra criatura; o alvo fica Flanqueado e sofre -5 em sua rolagem de reação.", fonte:"OdC v1.0.3 — p. 513"},
    {nome:"Silencioso — 50 — Silêncio Paranormal", desc:"A criatura se move sem qualquer barulho. Ao se mover, pode forçar os personagens presentes a testarem Observador + Inteligência contra Silencioso + Agilidade da criatura (que tem Vantagem e +5); se vencer, sua próxima ação ganha Vantagem e +5.", fonte:"OdC v1.0.3 — p. 513"},
    {nome:"Percepção — 50 — Audição Paranormal", desc:"A criatura tem Vantagem em ações de Percepção. Se ficar cega, pode gastar 1 P.B. para remover qualquer Desvantagem causada por essa alteração de status.", fonte:"OdC v1.0.3 — p. 513"},
    {nome:"Rastrear — 50 — Perseguir Vítima", desc:"A criatura localiza seus alvos através dos sentidos ou do Paranormal, sem necessidade de rolagem — nenhum personagem consegue se esconder dela ou pegá-la desprevenida.", fonte:"OdC v1.0.3 — p. 513"},
    {nome:"Mirar — 50 — Não há como Fugir", desc:"Toda ação de mira da criatura ocorre com Vantagem e bônus de +5.", fonte:"OdC v1.0.3 — p. 513"},
    {nome:"Observador — 50 — Olhar Assassino", desc:"Gastando 2 P.B., a criatura foca em um alvo e obtém Vantagem e bônus de +5 em sua próxima ação envolvendo aquele alvo.", fonte:"OdC v1.0.3 — p. 513"},
    {nome:"Liderança — 50 — Mestre da Morte", desc:"Gastando 5 P.B. em sua ação principal, a criatura ordena um ataque a todas as outras criaturas de nível menor, da mesma Dimensão, presentes na cena, que atacam o personagem mais próximo (raio de até 2m quando possível). Não são afetadas: Originarius, Altares, Maternais, todas as Arkanjeriais, Rainha, Umbralumes, Ebonóides, Nyxodermos, os Elementos Originais, Deuses Menores, Deuses Maiores, Mãe, Vigilantes, Singularis e Abyzzar.", fonte:"OdC v1.0.3 — p. 513"},
    {nome:"Fôlego — 50 — Criatura Aquática", desc:"A criatura prende a respiração sem necessidade de rolagem, por até 1d12 rodadas ou 30 minutos. Ela não morre afogada — apenas fica inconsciente.", fonte:"OdC v1.0.3 — p. 513"},
    {nome:"Combate — 50 — Desejo de Morte", desc:"A criatura realiza um ataque a mais por turno e aumenta sua iniciativa em +5.", fonte:"OdC v1.0.3 — p. 513"},
    {nome:"Criminalidade — 50 — Ser Mal Engrandece", desc:"Sempre que causar SANGRAR, HEMORRAGIA, OSCILANTE, FRACO, INCONSCIENTE ou ESMAGADO em um alvo, a criatura ganha mais uma Ação Principal.", fonte:"OdC v1.0.3 — p. 514"},
    {nome:"Adaptação — 50 — Criatura Evolui", desc:"Ao sofrer o mesmo ataque duas vezes num mesmo combate, esse ataque passa a causar metade do dano, e quem o executa contra esta criatura passa a ter Desvantagem sempre que repeti-lo.", fonte:"OdC v1.0.3 — p. 514"},
    {nome:"Agilidade — 50 — Paranormal Inatingível", desc:"Ações que envolvem Agilidade têm Vantagem, incluindo ATK N, DEF N, DEF AB, DEF C, DESV N e DESV O. Se a rolagem de Agilidade for Extrema, a criatura pode contra-atacar imediatamente após uma DEF ou DESV.", fonte:"OdC v1.0.3 — p. 514"},
    {nome:"Força Física — 50 — Fraturar Inimigo", desc:"Após um ATK N bem-sucedido, o alvo deve testar Força Física + Resistência contra DT 15; se falhar, sofre uma fratura e recebe dano de Fratura.", fonte:"OdC v1.0.3 — p. 514"},
    {nome:"Resistência — 50 — Carapaça Resistente", desc:"Qualquer dano físico recebido pela criatura é dividido pela metade.", fonte:"OdC v1.0.3 — p. 514"},
    {nome:"Velocidade — 50 — Vítimas Não Podem Fugir", desc:"A criatura alcança Nível 4 de Movimentação. Gastando 4 P.B., realiza um desvio automático sem necessidade de rolagem. Se um personagem se afasta dela, a criatura ganha uma Vantagem não permanente contra esse personagem.", fonte:"OdC v1.0.3 — p. 514"},
    {nome:"Aparência — 50 — Beleza do Oculto", desc:"Quem olha para a criatura deve testar Res. Psi. + Assimilação + Ocultismo contra DT 15; se falhar, não consegue atacá-la por 1d4 rodadas. A criatura tem Vantagem e bônus de +10 em testes de Manipulação.", fonte:"OdC v1.0.3 — p. 515"},
    {nome:"Carisma — 50 — Criatura Interessante", desc:"A criatura tem Vantagem e bônus de +10 em testes de Manipulação. Quem falha em resistir fica enfeitiçado; se o enfeitiçado se voltar contra ela, recebe 1d12 de dano de Sanidade.", fonte:"OdC v1.0.3 — p. 515"},
    {nome:"Saúde — 50 — Regeneração Paranormal", desc:"A criatura ganha 50 pontos extras de HP máximo e regenera 1d20 de HP a cada rodada, em seu turno.", fonte:"OdC v1.0.3 — p. 515"},
    {nome:"Obediência — 50 — Servo do Mal", desc:"Uma vez por rodada, como ação extra, a criatura escolhe outra criatura em cena da mesma Dimensão para realizar uma Ação Principal e uma Ação de Movimento.", fonte:"OdC v1.0.3 — p. 515"},
    {nome:"Perícia Investigativa — 50 — Investigação Paranormal", desc:"Ao olhar nos olhos de um personagem ou observar uma cena, a criatura enxerga registros do passado. Ilusionismo, Manipulação e Silencioso não funcionam contra ela.", fonte:"OdC v1.0.3 — p. 515"},
    {nome:"Perícia em Tortura — 50 — Brinquedo Torturado", desc:"Todo dano de HP e Sanidade causado numa cena de tortura é convertido em ganho de HP e Sanidade para a criatura — ela parece se alimentar da dor e do medo.", fonte:"OdC v1.0.3 — p. 515"},
    {nome:"Perícia em Armas Brancas — 50 — Criatura Treinada", desc:"Rolagens de Perícia em Armas Brancas têm Vantagem. Qualquer ação com Perícia em Armas Brancas ganha bônus de +10 na rolagem de ATK ou no dano da arma.", fonte:"OdC v1.0.3 — p. 515"},
    {nome:"Perícia em Armas de Fogo — 50 — Atirador Cruel", desc:"Gastando 4 P.B., a criatura realiza uma segunda ação principal envolvendo arma de fogo (incluindo ATK AF) — repetível enquanto houver P.B. para consumir.", fonte:"OdC v1.0.3 — p. 515"},
    {nome:"Perícia em Explosivos — 50 — Criatura em Chamas", desc:"A criatura não é afetada por dano de explosivos. Quando um personagem usa um explosivo contra ela, pode gastar 2 P.B. para testar DEF C contra o ATK AF do personagem; em caso de sucesso, o explosivo detona ainda na mão do atacante.", fonte:"OdC v1.0.3 — p. 515"},
    {nome:"Perícia em Radar — 50 — Stalker Paranormal", desc:"A criatura localiza um personagem em raio de 50m sem necessidade de rolagem e passa a persegui-lo com Vantagem em qualquer ação relacionada. O alvo rastreado perde suas Vantagens no primeiro reencontro após o rastreamento e sofre -10 em qualquer ação reativa.", fonte:"OdC v1.0.3 — p. 515–516"},
    {nome:"Perícia em Memorização — 50 — Nunca Esquece um Rosto", desc:"Ao reencontrar um personagem que já viu antes, a criatura realiza uma ação principal extra contra ele, e o reencontro concede +2 P.B. à criatura.", fonte:"OdC v1.0.3 — p. 516"},
    {nome:"Idiomas — 50 — Todas as Línguas", desc:"A criatura compreende e fala qualquer idioma com fluência, e é capaz de imitar a voz de um personagem, ganhando +10 em ações de Manipulação.", fonte:"OdC v1.0.3 — p. 516"},
    {nome:"Idiomas Antigos — 50 — Falas Perdidas", desc:"Gastando um turno inteiro recitando frases antigas em um idioma incompreensível e esquecido, a criatura ganha +4 P.B. em sua próxima rodada.", fonte:"OdC v1.0.3 — p. 516"},
    {nome:"Perícia em Montaria — 50 — Montaria Monstruosa", desc:"O personagem montado nesta criatura não sofre Desvantagem em ações de Ataque ou Defesa, e pode rolar o dado de Montaria da criatura duas vezes para se locomover.", fonte:"OdC v1.0.3 — p. 516"},
    {nome:"Assimilação — 50 — Nunca Inconsciente", desc:"A criatura não sofre as alterações de status FRACO, OSCILANDO ou INCONSCIENTE. Ao chegar a 3 HP ou menos, entra em ÓDIO.", fonte:"OdC v1.0.3 — p. 514"},
    {nome:"Inteligência — 50 — Aquele que Sabe", desc:"A criatura compreende a fraqueza dos personagens na cena: todos, exceto ela, têm suas Vantagens anuladas e obtêm Desvantagem em todas as suas ações.", fonte:"OdC v1.0.3 — p. 514"},
    {nome:"Lógica — 50 — Criatura Inteligente", desc:"A criatura pode substituir qualquer dado de qualquer rolagem por Lógica, ganhando Vantagem nessa rolagem.", fonte:"OdC v1.0.3 — p. 514"},
    {nome:"Resistência Psíquica — 50 — Não Causa Medo ao que Teme", desc:"A criatura se torna imune a dano de Sanidade e a ações de Ilusionismo — não pode ser enganada ou manipulada por essas vias.", fonte:"OdC v1.0.3 — p. 514"},
    {nome:"Ocultismo — 50 — Paranormal Original", desc:"ATK C, DEF C e DESV O ganham bônus de +5. A criatura tem Vantagem em qualquer rolagem de Ocultismo, e qualquer ação de ATK C, DEF C ou DESV O consome apenas metade do P.B. necessário.", fonte:"OdC v1.0.3 — p. 514"}
  ];

  const CRR_CATEGORIES = [
    {key:"RegrasGerais",  label:"Regras Gerais",         items: CRR_REGRAS_GERAIS},
    {key:"Infeccao",      label:"Infecção",               items: CRR_INFECCAO},
    {key:"SanidadeNeg",   label:"Sanidade Negativa",      items: CRR_SANIDADE_NEGATIVA},
    {key:"HabCriaturas",  label:"Habilidades de Criaturas", items: CRR_HABILIDADES_CRIATURAS},
    {key:"HabCriaturas50",label:"Habilidades em 50",      items: CRR_HABILIDADES_50}
  ];

  /* ---------------------------------------------------------
     RENDERIZAÇÃO — mesmo comportamento do renderCompendio() dos
     Agentes (accordion de seção + card expansível), porém com
     estado próprio (crrOpenSections/crrExpandedCards) para nunca
     interferir no Compêndio de Regras dos Agentes.
     --------------------------------------------------------- */
  let crrOpenSections = new Set(["RegrasGerais"]); // Regras Gerais começa aberta
  let crrExpandedCards = new Set();
  let crrSearchTerm = "";

  function renderCrr(){
    const q = crrSearchTerm.toLowerCase().trim();
    const container = document.getElementById("crr_sections");
    if(!container) return;
    container.innerHTML = "";

    let totalResults = 0;
    const sectionsToRender = [];
    CRR_CATEGORIES.forEach(sec => {
      if(!sec.items || sec.items.length === 0) return;
      const matches = !q ? sec.items : sec.items.filter(item =>
        item.nome.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q)
      );
      if(q && matches.length === 0) return;
      if(q && matches.length > 0) crrOpenSections.add(sec.key);
      sectionsToRender.push({sec, matches});
      totalResults += matches.length;
    });

    const countEl = document.getElementById("crr_count");
    if(countEl){
      countEl.textContent = q
        ? `${totalResults} resultado(s) em ${sectionsToRender.length} categoria(s)`
        : `${totalResults} entrada(s) no Compêndio`;
    }

    if(sectionsToRender.length === 0){
      container.innerHTML = '<div class="empty-state">Nenhum resultado encontrado.</div>';
      return;
    }

    sectionsToRender.forEach(({sec, matches}) => {
      const isOpen = crrOpenSections.has(sec.key);
      const section = document.createElement("div");
      section.className = "compendio-section" + (isOpen ? " open" : "");

      const header = document.createElement("div");
      header.className = "compendio-section-header";
      header.innerHTML = `<h3><span class="sec-arrow">▶</span> ${esc(sec.label)}</h3><span class="sec-count">${matches.length}</span>`;
      header.addEventListener("click", () => {
        if(crrOpenSections.has(sec.key)) crrOpenSections.delete(sec.key); else crrOpenSections.add(sec.key);
        renderCrr();
      });
      section.appendChild(header);

      const body = document.createElement("div");
      body.className = "compendio-section-body";
      const grid = document.createElement("div");
      grid.className = "compendio-grid";

      matches.forEach(item => {
        const cardKey = sec.key + "::" + item.nome;
        const isExpanded = crrExpandedCards.has(cardKey);
        const card = document.createElement("div");
        card.className = "compendio-card";
        const shortDesc = item.desc.length > 150 && !isExpanded ? item.desc.slice(0, 150).trim() + "…" : item.desc;
        card.innerHTML = `<h3>${esc(item.nome)}<span class="cat-tag">${esc(sec.label)}</span></h3>` +
          `<p>${esc(shortDesc)}</p>` +
          (item.fonte ? `<div class="fonte-tag">Fonte: ${esc(item.fonte)}</div>` : "") +
          `<div class="expand-hint">${isExpanded ? "▲ recolher" : "▼ ver mais"}</div>`;
        card.addEventListener("click", () => {
          if(crrExpandedCards.has(cardKey)) crrExpandedCards.delete(cardKey); else crrExpandedCards.add(cardKey);
          renderCrr();
        });
        grid.appendChild(card);
      });

      body.appendChild(grid);
      section.appendChild(body);
      container.appendChild(section);
    });
  }

  /* ---------------------------------------------------------
     NAVEGAÇÃO — mesmo padrão (display none/block) já usado pelos
     outros módulos de Criaturas. Mantém sua própria lista de hide
     (padrão já existente no projeto: cada módulo mantém a sua).
     --------------------------------------------------------- */
  function hideAllCrrAndOtherScreens(){
    [
      "welcome_screen",
      "secret_files_screen",
      "creature_list_screen",
      "creature_sheet_screen",
      "creature_compendio_screen",
      "creature_registro_screen",
      "creature_ficha_completa_screen",
      "creature_regras_screen"
    ].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.style.display = "none";
    });
  }

  function showCrrScreen(){
    hideAllCrrAndOtherScreens();
    crrSearchTerm = "";
    const search = document.getElementById("crr_search");
    if(search) search.value = "";
    renderCrr();
    const screen = document.getElementById("creature_regras_screen");
    if(screen) screen.style.display = "block";
  }

  function backToSecretFilesFromCrr(){
    hideAllCrrAndOtherScreens();
    const el = document.getElementById("secret_files_screen");
    if(el) el.style.display = "block";
  }

  /* ---------------------------------------------------------
     WIRING
     --------------------------------------------------------- */
  function wireCrrModule(){
    // Card do lobby "Habilidades de Criaturas": em index.html o
    // atributo data-secret-msg foi removido deste card (mesma
    // técnica já usada para #secret_card_compendio), então o aviso
    // genérico de placeholder deixa de capturá-lo — o clique passa
    // a abrir esta tela.
    const card = document.getElementById("secret_card_habilidades");
    if(card) card.addEventListener("click", showCrrScreen);

    const backBtn = document.getElementById("crr_back_btn");
    if(backBtn) backBtn.addEventListener("click", backToSecretFilesFromCrr);

    const search = document.getElementById("crr_search");
    if(search){
      const handler = (typeof debounce === "function") ? debounce(() => {
        crrSearchTerm = search.value || "";
        renderCrr();
      }, 200) : () => { crrSearchTerm = search.value || ""; renderCrr(); };
      search.addEventListener("input", handler);
    }
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", wireCrrModule);
  } else {
    wireCrrModule();
  }
})();
