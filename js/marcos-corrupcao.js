/* ==========================================================
   MARCOS DE CORRUPÇÃO
   Módulo independente e autocontido, adicionado sobre a
   arquitetura já existente. NÃO reescreve o projeto, NÃO cria uma
   segunda lista de Dimensões e NÃO cria um segundo Compêndio:

     COMPÊNDIO → "Marcos de Corrupção"   (nova sub-aba, biblioteca
                                           fixa, extraída do PDF do
                                           Sistema de OdC — 1ª Ed.)

   Segue exatamente o mesmo padrão já usado por Habilidades de Sede
   (js/sede-skills.js): nova sub-aba dentro de #tab-compendio
   (mesma barra ".subtab-row"/".subtab-btn"/".subtab-panel" já
   existente), grid de cards no mesmo estilo visual do Compêndio, e
   um modal de detalhes próprio, reaproveitando a MESMA estrutura
   genérica de modal (".modal-overlay"/".modal-box"/".modal-actions")
   já usada por todos os outros modais do projeto — não é criado
   nenhum sistema de popup novo.

   DIMENSÕES: este módulo NÃO cria uma segunda biblioteca de
   Dimensões. Reutiliza exatamente as mesmas chaves e nomes de
   Dimensão já usados pelo sistema de Conexões (CONEXOES_DIM_LABELS /
   classes .cx-<dimensao> do index.html): infernal, arkanjerial,
   terrena, sombria, carnical, limbica, perdicao. Nenhuma dessas
   chaves, nomes ou cores é redefinida aqui — os cards e o filtro
   apenas aplicam a classe "cx-<dimensao>" já existente para herdar a
   cor/identidade visual de cada Dimensão automaticamente.

   ARMAZENAMENTO / ESCOPO DESTA ETAPA: esta etapa cadastra e organiza
   os Marcos de Corrupção apenas dentro do Compêndio (biblioteca de
   consulta). Não há, nesta etapa, nenhuma leitura ou escrita de
   campos da ficha (Corrupção/Dimensão do Agente), nenhum popup
   automático, nenhuma detecção de progressão e nenhum registro na
   ficha — exatamente como pedido. A automação com a ficha (Agentes)
   fica para uma etapa futura.

   FONTE: Sistema de OdC — 1ª Edição (V1.0.3). Cada Marco preserva o
   texto do livro (Dimensão, valor de Corrupção, descrição/efeitos e
   página de origem), sem resumir, reescrever ou completar
   informações por conhecimento externo.

   Namespace: window.MarcosCorrupcao
   ========================================================== */
(function () {
  "use strict";

  /* ---------------------------------------------------------
     BIBLIOTECA OFICIAL — Marcos de Corrupção, por Dimensão.
     Extraídos do PDF fornecido (Sistema de OdC — 1ª Edição):
       Infernal:    pág. 114–116
       Terrena:     pág. 116–119
       Arkanjerial: pág. 119–121
       Sombria:     pág. 137–139
       Carniçal:    pág. 140–142
       Límbica:     pág. 144–146
       Perdição:    pág. 148–149

     Campo "dimensao" usa exatamente as mesmas chaves já existentes
     em CONEXOES_DATA/CONEXOES_DIM_LABELS (index.html) — infernal,
     arkanjerial, terrena, sombria, carnical, limbica, perdicao —
     nenhuma chave nova de Dimensão foi criada.

     Campo "titulo" preserva a redação literal do livro para o rótulo
     de cada Marco (a maioria segue o padrão "N de Corrupção", mas
     algumas entradas do livro usam "N Pontos" — preservado como está,
     sem padronizar/"corrigir" a fonte).

     Campo "corrupcao" é o valor numérico de Corrupção do Marco
     (usado para ordenação), e "pagina" é a página do livro onde
     aquele Marco especificamente aparece (não o intervalo inteiro da
     Dimensão).
     --------------------------------------------------------- */
  var MARCOS_CORRUPCAO_DATA = [

    /* ---------------- INFERNAL (pág. 114–116) ---------------- */
    { id:"infernal-020", dimensao:"infernal", corrupcao:20, titulo:"20 de Corrupção", pagina:115,
      descricao:`Íris dos olhos ficam azuis intensos e brilhantes quando usa a conexão, emitindo um brilho próprio. Adicione +1 em Sentido Paranormal.` },
    { id:"infernal-060", dimensao:"infernal", corrupcao:60, titulo:"60 de Corrupção", pagina:115,
      descricao:`Um único chifre de chamas azuis surge na testa do jogador quando usa a conexão, a Íris passa a ser vermelha intensa e brilhante, enquanto a esclera obtém um aspecto negro quando usa a Conexão. Adicione +1d4 em Sentido Paranormal.` },
    { id:"infernal-080", dimensao:"infernal", corrupcao:80, titulo:"80 de Corrupção", pagina:115,
      descricao:`Um segundo chifre de chamas azuis surge na testa do jogador quando usa a conexão. Distribua 1d6 pontos entre Sentido Paranormal e Força Física.` },
    { id:"infernal-110", dimensao:"infernal", corrupcao:110, titulo:"110 de Corrupção", pagina:115,
      descricao:`Os dentes se tornam mais afiados e as alterações duram até o final do combate. Mordida {2d4+1/3FF de dano}.` },
    { id:"infernal-140", dimensao:"infernal", corrupcao:140, titulo:"140 de Corrupção", pagina:115,
      descricao:`Os chifres azuis se tornam mais intensos, uma das íris se torna vermelha e a esclera negra permanentemente. Distribua +1d8 entre Força Física, Velocidade, Agilidade e Sentido Paranormal.` },
    { id:"infernal-165", dimensao:"infernal", corrupcao:165, titulo:"165 de Corrupção", pagina:115,
      descricao:`Os chifres azuis intensos agora são como chamas negras. A alteração dos dentes é permanente. Jogar 1d6 para tomar dano de Sanidade. O dano sofrido subtrai a Sanidade total também. O jogador perde um pouco de sua empatia, narrativamente e também em sua pontuação da ficha. -1d6 de Empatia. Ganha +1d6 de Resistência Natural e +1d6 em pontos de Força Física, +1d6 em pontos de Velocidade, +1d6 em pontos de Agilidade, +1d4 em pontos de Combate, +1d4 em pontos de Resistência, +1d6 em pontos de Ocultismo. Um vasto e poderoso conhecimento sobre a Dimensão Infernal passa a invadir a mente do utilitário corrompido, assim como conhecimento subconsciente sobre os círculos e símbolos de conexão.` },
    { id:"infernal-190", dimensao:"infernal", corrupcao:190, titulo:"190 de Corrupção", pagina:116,
      descricao:`Ambas as íris agora são permanentemente vermelhas com a esclera negra, as unhas estão maiores e afiadas permanentemente, ganha +1d4 pontos em Sentido Paranormal, +1d4 de pontos em Agilidade e Velocidade, +1d6 de pontos em Força Física, +1d6 de pontos em Combate e Resistência. -1d8 de Sanidade, sendo o dano também subtraído da Sanidade total do personagem.` },
    { id:"infernal-200", dimensao:"infernal", corrupcao:200, titulo:"200 de Corrupção", pagina:116,
      descricao:`O personagem passa a obter uma aparência mais Infernácula e macabra, sua empatia é zerada e seu espectro agora pertence ao Inferno, se tornando submisso ao ponto original de sua Dimensão conectada. O jogador perde seu personagem, cujo poderá ser utilizado pelo Mestre como acreditar ser mais relevante para a narrativa (o personagem receberá +1d20 em todos os conhecimentos que compõe os "Dados de Combate"). A ficha de personagem humano será convertida em uma ficha de criatura.` },

    /* ---------------- TERRENA (pág. 116–119) ---------------- */
    { id:"terrena-040", dimensao:"terrena", corrupcao:40, titulo:"40 de Corrupção", pagina:117,
      descricao:`O personagem passa a ouvir e ver com mais intensidade e até mesmo facilidade os sons e cores provenientes da natureza, sente-se estranhamente conectada a ela. Em rolagens de Percepção ou Observador, quando em uma cena que ocorra dentro de um ambiente natural, como florestas e lagos, o personagem obtém +2 em suas rolagens.` },
    { id:"terrena-085", dimensao:"terrena", corrupcao:85, titulo:"85 de Corrupção", pagina:117,
      descricao:`O personagem será capaz de sentir os sentimentos de animais e plantas próximas, adquirindo certo sentimentalismo pela natureza, e por vezes, os animais também sentirão suas emoções. O personagem poderá rolar Empatia animal+Observador para entender as emoções dos animais e plantas que observar, podendo, ao superar a DT determinada pelo Mestre, obter informações, ou Vantagem em sua próxima ação relativa ao observado. Sempre que um animal for morto, ou a natureza for danificada por ação humana, o personagem receberá 1d8 de dano de SAN.` },
    { id:"terrena-115", dimensao:"terrena", corrupcao:115, titulo:"115 de Corrupção", pagina:117,
      descricao:`O personagem descobre ser capaz de compreender certos comportamentos de animais, e por vezes, que estes agora são capazes de compreender o que este personagem os diz. Os animais podem escolher ajudar ou não este personagem em situações diversas, como: investigação, roubo, rastreamento, direcionamento ou combate. O personagem poderá rolar: Empatia Animal + Inteligência para tentar se comunicar com um animal, tendo de superar uma DT determinada pelo Mestre, e assim, obter informações ou ajuda deste animal. Caso veja um animal ser morto sem o objetivo de respeitar seu corpo, alimentando-se deste, ou testemunhe a natureza sendo danificada por ação humana egoísta, receberá -1d12 de SAN, e deverá realizar um teste de RESISTÊNCIA PSÍQUICA para superar a DT 12; caso falhe, obterá ÓDIO direcionado ao personagem humano agressor a natureza, por 1d6 rodadas, tentando matá-lo.` },
    { id:"terrena-165", dimensao:"terrena", corrupcao:165, titulo:"165 de Corrupção", pagina:117,
      descricao:`O personagem será acometido pelo entendimento do equilíbrio natural e o funcionamento dos elementos, das florestas, dos animais, da cadeia alimentar, entendendo o que é Gaia, sua importância real, sua magnitude e assim, tornando-se muito mais protetor para com este equilíbrio, com a natureza e todos os seres que nela vivem. Sua empatia com humanos diminui, enquanto seus laços com a natureza aumentam como nunca antes. O personagem perceberá ainda o como sua capacidade de manipular as Linhas de Conexões através dos círculos e símbolos de Conexões foi intensamente potencializada. O personagem passa a obter Vantagem em ações que envolvam Conexões Terrenas, e caso o elemento utilizado na Conexão advenha de um elemento existente no cenário, e não criado através das Linhas de Conexões, então o personagem obterá um bônus adicional de +5 em sua rolagem. Aumente Empatia Animal, Rastreamento, Sobrevivência, Natação, Sentido Paranormal, Ocultismo e Perícia em Adestramento em +1d6. Diminua sua Empatia e Psicologia em -1d4.` },
    { id:"terrena-190", dimensao:"terrena", corrupcao:190, titulo:"190 de Corrupção", pagina:118,
      descricao:`Durante situações de combate, as Linhas de Conexões Terrenas invadirão a sua pele, e o seu corpo, preparando-o para proteger aquilo que deseja, aquilo que ama, aquilo que é o seu dever, e com isso, sua pele passa a emitir um pequeno brilho esverdeado, enquanto as Linhas de Conexões Terrenas agora condensadas de maneira massiva em sua pele, formam uma pequena chama verde fluorescente que se espalha por seu corpo. Sua conexão com a Dimensão Terrena se encontra em um novo nível, e seu personagem agora é respeitado pelos animais e plantas da natureza. Seu coração, seu espectro, jura silenciosamente proteger o equilíbrio da natureza e cada pequeno ser vivente. Seus sentimentos se conectam com o menor ser existente, e a brisa do vento parece contar-lhe segredos. O personagem obtém 1d12 de Resistência Natural; aumente seu Sentido Paranormal, Velocidade, Força Física, Agilidade, Atletismo, Sobrevivência, Rastreamento, Observador, Percepção, Natação, Empatia Animal e Perícia em Adestramento em +1d8. Diminua sua pontuação total de Empatia, Psicologia, Resistência Psíquica e Assimilação em 1d6. Animais, ao estarem perante sua presença, caso tenham a intenção de atacar, deverão realizar um teste de Resistência Psíquica + Assimilação contra sua Empatia Animal + Intimidação; caso o seu personagem obtenha um Sucesso Crítico, diminua o valor obtido na rolagem do animal, pelo valor obtido em uma rolagem de Obediência do animal. Seu personagem sempre tentará proteger os animais em perigo na cena, e atacará qualquer um que represente uma ameaça a natureza.` },
    { id:"terrena-200", dimensao:"terrena", corrupcao:200, titulo:"200 de Corrupção", pagina:118,
      descricao:`O personagem abandonará sua vida comum como humano, sendo naturalmente guiado por Gaia à uma localidade no globo, aonde seja necessário um novo Guardião. As chamas esverdeadas, agora modificam suas células, e a corrupção transforma sua humanidade por completo, tornando-o parte da natureza. O Mestre deverá assumir o personagem do jogador, dando a ele um desfecho e um futuro como Guardião Terreno (entenda melhor sobre a raça dos Guardiões no Capítulo 11). O personagem têm seu corpo e existência alterada para algo que se adeque a sua nova função e raça. O jogador poderá escolher um dos seguintes conhecimentos, e então dobrar sua pontuação no momento de conversão da ficha humana, para ficha de Criatura: Sentido Paranormal, Ocultismo, Força Física, Agilidade, Rastrear, Sobrevivência, Observador, Resistência, Percepção, Empatia Animal ou Perícia em Adestramento.` },

    /* ---------------- ARKANJERIAL (pág. 119–121) ---------------- */
    { id:"arkanjerial-080", dimensao:"arkanjerial", corrupcao:80, titulo:"80 de Corrupção", pagina:120,
      descricao:`Uma linha em forma de aureola branca brilhante passa a aparecer sobre sua cabeça durante o combate. +1d6 de Proteção Natural; marque este valor permanente na aba de "Proteção", e ele se recuperará completamente a cada 24h dentro da lore, ou quando rolar "Descanso", de acordo com o valor obtido.` },
    { id:"arkanjerial-110", dimensao:"arkanjerial", corrupcao:110, titulo:"110 de Corrupção", pagina:120,
      descricao:`A aureola passa a se tornar mais grossa e mais brilhante enquanto em combate. +1d12 de Proteção Natural; marque este valor permanente na aba de "Proteção", e ele se recuperará completamente a cada 24h dentro da lore, ou quando rolar "Descanso", de acordo com o valor obtido.` },
    { id:"arkanjerial-140", dimensao:"arkanjerial", corrupcao:140, titulo:"140 de Corrupção", pagina:120,
      descricao:`Algumas palavras angelicais passam a rodear o personagem em diversos idiomas ao longo do combate como luz. Rolagens de DEF C e ATK C ganham +1d4; +1d12 de Proteção Natural; marque este valor permanente na aba de "Proteção", e ele se recuperará completamente a cada 24h dentro da lore, ou quando rolar "Descanso", de acordo com o valor obtido.` },
    { id:"arkanjerial-160", dimensao:"arkanjerial", corrupcao:160, titulo:"160 de Corrupção", pagina:120,
      descricao:`Um triângulo de pequenas chamas brancas passa a surgir flutuando atrás do personagem enquanto em combate. +1d12 de Proteção Natural; marque este valor permanente na aba de "Proteção", e ele se recuperará completamente a cada 24h dentro da lore, ou quando rolar "Descanso", de acordo com o valor obtido. O personagem receberá um propósito divino decidido pelo Mestre da mesa. Concluir o seu propósito divino concede 100 de XP, porém, ir contra o seu propósito causará dano de Sanidade (este dano de Sanidade e o que exatamente o causará deverá ser decidido pelo Mestre).` },
    { id:"arkanjerial-165", dimensao:"arkanjerial", corrupcao:165, titulo:"165 de Corrupção", pagina:120,
      descricao:`Um vasto e poderoso conhecimento sobre a Dimensão Arkanjerial passa a invadir a mente do utilitário corrompido, assim como conhecimento subconsciente sobre os círculos e símbolos de Conexão. Se próximo, ou perante o seu propósito divino, deverá realizar um teste de RESISTÊNCIA PSÍQUICA, contra a DT 20, e caso falhe, será obrigado a concluir o seu propósito, porém, caso supere a DT, poderá optar por concluir ou não este propósito imposto. Distribua 1d12 entre Sentido Paranormal e Ocultismo.` },
    { id:"arkanjerial-180", dimensao:"arkanjerial", corrupcao:180, titulo:"180 de Corrupção", pagina:120,
      descricao:`A aureola passa a ser permanente. O triângulo agora é um círculo com 8 chamas brancas e brilhantes que surgem enquanto em combate. +1d20 de Proteção Natural; marque este valor permanente na aba de "Proteção", e ele se recuperará completamente a cada 24h dentro da lore, ou quando rolar "Descanso", de acordo com o valor obtido. Neste ponto, é quase impossível resistir às ordens dos Arkanjos, porém, ainda poderá tentar, dessa forma, quando um Arkanjo, ou o próprio Mekor'ha Inn der uma ordem ao personagem, o mesmo poderá realizar um teste de RESISTÊNCIA PSÍQUICA com a DT 30.` },
    { id:"arkanjerial-190", dimensao:"arkanjerial", corrupcao:190, titulo:"190 de Corrupção", pagina:121,
      descricao:`O personagem não toca mais o chão, ao invés disso, flutuará 5cm do chão permanentemente. As 8 chamas brancas que circulam suas costas passam a ser permanente. Deus passa a dar ordens específicas e não as seguir trará consequências tremendas, as quais deverão ser ditadas pelo Mestre. Perante o propósito divino, é impossível resistir à conclusão do mesmo. Distribua 1d20 entre Sentido Paranormal e Ocultismo.` },
    { id:"arkanjerial-200", dimensao:"arkanjerial", corrupcao:200, titulo:"200 de Corrupção", pagina:121,
      descricao:`O personagem se torna um Arkanjo de Deus, e deve jogar 1d6 para ver o seu futuro: 1 e 2 – Permanece na Terra, como protetor da humanidade. Outro resultado: Irá embora ao Paraíso. Escolha um dos dois seguintes conhecimentos para dobrar os pontos no momento da transição de ficha de personagem, para ficha de criatura: Sentido Paranormal ou Ocultismo.` },

    /* ---------------- SOMBRIA (pág. 137–139) ---------------- */
    { id:"sombria-020", dimensao:"sombria", corrupcao:20, titulo:"20 de Corrupção", pagina:137,
      descricao:`Os olhos ficam completamente negros quando está usando a conexão. Adicione +1 em sua pontuação de Sentido Paranormal.` },
    { id:"sombria-040", dimensao:"sombria", corrupcao:40, titulo:"40 de Corrupção", pagina:137,
      descricao:`Os olhos negros agora possuem um único círculo dourado no centro de cada olho, como uma Íris. Adicione +2 em Sentido Paranormal e +1 em Resistência, porém, diminua sua Sanidade Total e atual em -2.` },
    { id:"sombria-060", dimensao:"sombria", corrupcao:60, titulo:"60 de Corrupção", pagina:137,
      descricao:`Sua pele se torna um pouco mais pálida e acinzentada. Pequenas fibras negras brotam em sua pele para fechar pequenos ferimentos. Uma vez por rodada, role Sentido Paranormal + Saúde para superar a DT 12, caso sucesso: recupere +2 de HP. Diminua a Sanidade Total e atual em -1.` },
    { id:"sombria-090", dimensao:"sombria", corrupcao:90, titulo:"90 de Corrupção", pagina:138,
      descricao:`O sangue do personagem passa a ser negro e é impossível fazer transfusão de sangue, pois se assemelha à um tipo de gosma; caso o personagem sofra um ferimento onde tenha uma grande perda de sangue, ou seja, obtenha o Status de HEMORRAGIA, passará a receber um dano extra de 1d4 e este dano só irá parar após o personagem fechar o ferimento, recuperar o seu HP para um mínimo de 15 e perder o status de HEMORRAGIA. O personagem percebe que o seu corpo, suas células e o seu organismo está diferente, parece cada vez mais capaz de se adaptar a situações extremas. Aumente +1d4 pontos em Adaptação e +1d4 pontos em Resistência; caso alcance 0 ou menos de HP, o personagem terá 5 rodadas de morte, ao invés de 3.` },
    { id:"sombria-120", dimensao:"sombria", corrupcao:120, titulo:"120 de Corrupção", pagina:138,
      descricao:`Uma parte do seu rosto, braço e costas é tomado por uma sombra escura que ao toque mais parece uma gosma. Um segundo círculo dourado surge em seus olhos. O personagem obtém Res. N.: 3. Adicione +2 pontos em Sentido Paranormal; +1 pontos em Observador; +1 ponto em Resistência, e +1 em Rastrear. Diminua a Sanidade Total e atual em -2.` },
    { id:"sombria-140", dimensao:"sombria", corrupcao:140, titulo:"140 Pontos", pagina:138,
      descricao:`Dezenas de olhos negros com íris douradas começam a surgir nas partes que são tomadas por escuridão. Os olhos ficam permanentemente negros com duas íris douradas. Aumente a Res. N. para 6. Aumente o Sentido Paranormal do personagem em +1d8. Diminua a Sanidade Total e atual do personagem em -3.` },
    { id:"sombria-165", dimensao:"sombria", corrupcao:165, titulo:"165 de Corrupção", pagina:138,
      descricao:`70% do seu corpo se torna completamente negro durante o Combate, enquanto que suas mãos e parte do antebraço se torna permanentemente negra, perdendo boa parte de sua sensibilidade. Um vasto e poderoso conhecimento sobre a Dimensão Sombria passa a invadir a mente do utilitário corrompido, assim como conhecimento subconsciente sobre os círculos e símbolos de Conexão. O personagem perde 1d4 em suas pontuações de Ferramentas e Perícia Mecânica; o personagem perde -1d4 de sua Sanidade Total e atual, o personagem recebe 1d4 de dano de Sanidade; o personagem obtém: +1d4 em sua pontuação de Força Física; obtém: 10/10 de Proteção Natural; obtém +1d4 de pontos em Agilidade e Força Física.` },
    { id:"sombria-180", dimensao:"sombria", corrupcao:180, titulo:"180 de Corrupção", pagina:138,
      descricao:`Os braços até parte do peitoral e costas se tornam completamente negro permanentemente, seu sangue é permanentemente Sombrio, impedindo o uso de transfusões ou soro, toda ação de Medicina ou Perícia Médica realizada neste personagem, agora levará o dobro do tempo para ter efetividade e apenas metade do valor obtido será validado para recuperação do HP. Quando usar Conexões Sombrias durante um combate, pelo restante do mesmo, todo o seu corpo, exceto a face se torna negra e haverá uma certa disformidade, como líquidos e fios negros se movendo, sendo deixados no chão. O personagem perde 1d8 de Sanidade Total e atual; o personagem recebe um dano de Sanidade de 1d8; O personagem aumenta +2d4 em sua pontuação de Força Física; o personagem aumenta +1d6 em sua pontuação de agilidade. Aumente sua Res. N para 10.` },
    { id:"sombria-200", dimensao:"sombria", corrupcao:200, titulo:"200 Pontos", pagina:139,
      descricao:`A face antes ainda humana, agora se torna completamente negra, com apenas os dois olhos de íris dourada brilhando na escuridão, seu corpo completamente corrompido por fios e líquidos negros que parecem estruturar os músculos desse novo corpo se estabelecem em um preto opaco. Fios negros dançam e vazam por todo o corpo. Aquilo deixou de ser humano. O personagem receberá +1d12 de pontos em todos os conhecimentos de sua ficha. O jogador perderá o controle do personagem, cujo seu destino será decidido pelo Mestre da mesa, convertendo sua ficha de personagem para uma ficha de criatura.` },

    /* ---------------- CARNIÇAL (pág. 140–142) ---------------- */
    { id:"carnical-020", dimensao:"carnical", corrupcao:20, titulo:"20 de Corrupção", pagina:141,
      descricao:`Os olhos ficam completamente vermelhos até o final do combate, com apenas uma pequena pupila negra. Aumente sua pontuação de Agilidade e Observador em +1.` },
    { id:"carnical-080", dimensao:"carnical", corrupcao:80, titulo:"80 de Corrupção", pagina:141,
      descricao:`Alguns ferimentos permanentes surgem quando utiliza a conexão, deixando o músculo exposto. O personagem perde 1d6 de HP ao usar uma Conexão. O personagem obtém +1d6 de pontos em Resistência. O personagem obtém +1d4 pontos em: Agilidade, Força Física, Rastreamento e Intimidação.` },
    { id:"carnical-110", dimensao:"carnical", corrupcao:110, titulo:"110 Pontos", pagina:141,
      descricao:`Os olhos ficam completamente vermelhos permanentemente, apenas com a pupila aparente, porém, em combate sua pupila se torna estreita, como de um predador. Veias se tornam visíveis ao lado dos olhos, e pulsam em combate. Músculos expostos se sobressaem e endurecem durante o combate, tornando seu corpo maior e mais forte. O personagem obtém Res. N.: 6. Aumente em 1d6 a Força Física do personagem. Rolagens de ATK N e DEF N obtém um adicional de +1d4. Caso receba um dano maior que 15, adquire ÓDIO até o final do Combate.` },
    { id:"carnical-140", dimensao:"carnical", corrupcao:140, titulo:"140 de Corrupção", pagina:141,
      descricao:`Algumas partes do corpo ficam com sua carne, ossos e músculos expostos. Fibras musculares se comportam como pequenos vermes, ou mesmo pequenos tentáculos quando em combate. Parte da musculatura endurece em momentos de combate. O personagem perde 1d8 de sua Sanidade Total e atual. Aumente sua Res. N em +6 pontos. O personagem obtém 15/15 de Proteção Natural.` },
    { id:"carnical-165", dimensao:"carnical", corrupcao:165, titulo:"165 de Corrupção", pagina:142,
      descricao:`Um vasto e poderoso conhecimento sobre a Dimensão Carniçal passa a invadir a mente do utilitário corrompido, assim como conhecimento subconsciente sobre os círculos e símbolos de Conexão. O corpo se torna maior, seus músculos se expandem e tornam-se mais rígidos permanentemente. O personagem perde 1d8 de sua Sanidade Total e atual. O personagem recebe 1d8 de dano de Sanidade. O personagem obtém: +1d8 de Força Física e Resistência. O personagem obtém +1d6 de: Agilidade, Velocidade, Combate, Rastrear, Sobrevivência e Atletismo.` },
    { id:"carnical-190", dimensao:"carnical", corrupcao:190, titulo:"190 de Corrupção", pagina:142,
      descricao:`A maior parte do corpo têm seus músculos e ossos expostos, tornando sua aparência bem próxima de um Carniçal quando em combate. Sua aparência se torna mais animalesca e músculos passam a ficar expostos, assim como pequenos ossos sobrepõe sua pele e ossos expostos, permanentemente. O personagem perde 1d8 de Sanidade Total e atual. O personagem recebe um dano de Sanidade de 1d8. Aumente a Resistência Natural do personagem em +6. Aumente a Proteção Natural do personagem em +20/20.` },
    { id:"carnical-200", dimensao:"carnical", corrupcao:200, titulo:"200 de Corrupção", pagina:142,
      descricao:`O personagem se torna uma criatura Carniçal completa, deixando seu espectro e biologia humana para algo inimaginável e grotesco. Dobre os pontos de: Força Física e Resistência após a transição da ficha de personagem para criatura.` },

    /* ---------------- LÍMBICA (pág. 144–146) ---------------- */
    { id:"limbica-020", dimensao:"limbica", corrupcao:20, titulo:"20 de Corrupção", pagina:145,
      descricao:`Nenhuma alteração física. Diminua em 1d4 a Sanidade Total e atual; o personagem recebe 1d4 de dano na Sanidade atual. Aumente a pontuação de Ocultismo, Sentido Paranormal, Matemática e Lógica em +1.` },
    { id:"limbica-050", dimensao:"limbica", corrupcao:50, titulo:"50 de Corrupção", pagina:145,
      descricao:`Nenhuma alteração física. Diminua em 1d4 a Sanidade Total e atual; o personagem recebe 1d4 de dano na Sanidade atual. Aumente a pontuação de Ocultismo, Sentido Paranormal, Matemática e Lógica em +2.` },
    { id:"limbica-090", dimensao:"limbica", corrupcao:90, titulo:"90 de Corrupção", pagina:145,
      descricao:`Nenhuma alteração física. Diminua em 1d6 a Sanidade Total e atual; o personagem recebe 1d6 de dano na Sanidade atual. Distribua 1d12 pontos entre: Sentido Paranormal, Ocultismo, Matemática e Lógica. Uma vez por Combate é capaz de rerrolar uma rolagem de ATK C, DEF C ou DESV O.` },
    { id:"limbica-130", dimensao:"limbica", corrupcao:130, titulo:"130 de Corrupção", pagina:146,
      descricao:`Nenhuma alteração física. Diminua em 1d6+1d4 a Sanidade total e atual; o personagem recebe 1d6+1d4 de dano na Sanidade atual. Ações que envolvam Sentido Paranormal obtém Vantagem.` },
    { id:"limbica-150", dimensao:"limbica", corrupcao:150, titulo:"150 de Corrupção", pagina:146,
      descricao:`Nenhuma alteração física. Diminua em 1d8+1d4 a Sanidade Total e atual; o personagem recebe 1d8+1d4 de dano na Sanidade atual. Aumente o Sentido Paranormal em +1d6 pontos; aumente o Ocultismo em +1d6 pontos. Uma vez por sessão poderá rerrolar qualquer teste.` },
    { id:"limbica-165", dimensao:"limbica", corrupcao:165, titulo:"165 de Corrupção", pagina:146,
      descricao:`Nenhuma alteração física. Um vasto e poderoso conhecimento sobre a Dimensão original desta conexão, assim como sobre os círculos e símbolos de conexão, passam a invadir a mente do utilitário corrompido. O personagem conhecerá todos os símbolos e círculos de sua Dimensão. O personagem receberá: 1d20 de dano de Sanidade e diminuirá sua Sanidade Total e atual em: 1d6.` },
    { id:"limbica-190", dimensao:"limbica", corrupcao:190, titulo:"190 de Corrupção", pagina:146,
      descricao:`Nenhuma alteração física. Diminua em 1d20 a Sanidade Total e atual; o personagem recebe 1d20 de dano na Sanidade atual. Uma vez por sessão o personagem pode aumentar 5 de sua Corrupção ou sofrer 2d12 de dano de Sanidade para: 1. Anular as Vantagens de um personagem ou criatura, uma única vez. 2. Forçar uma Desvantagem a um alvo. 3. Rerrolar uma rolagem que o personagem acabou de realizar.` },
    { id:"limbica-200", dimensao:"limbica", corrupcao:200, titulo:"200 de Corrupção", pagina:146,
      descricao:`Quem alcança 200 de corrupção pela conexão Límbica têm seu espectro perdido no vazio eterno e sua existência apagada da história e da memória de todos, se tornando apenas um eco, uma pergunta, uma coceira, um borrão.` },

    /* ---------------- PERDIÇÃO (pág. 148–149) ---------------- */
    { id:"perdicao-020", dimensao:"perdicao", corrupcao:20, titulo:"20 de Corrupção", pagina:148,
      descricao:`Ao usar a Conexão, o local onde se localiza o símbolo ou círculo falhará como um glitch. Diminua a Sanidade Total e Atual do Personagem em -1. Aumente a pontuação de Sentido Paranormal em +1.` },
    { id:"perdicao-040", dimensao:"perdicao", corrupcao:40, titulo:"40 de Corrupção", pagina:148,
      descricao:`Ao usar uma Conexão, todo o braço que toca o símbolo treme e falha como um glitch. Sempre que usar uma Conexão, o personagem receberá 1 de dano de Sanidade. Aumente a pontuação de Sentido Paranormal em +2.` },
    { id:"perdicao-080", dimensao:"perdicao", corrupcao:80, titulo:"80 de Corrupção", pagina:148,
      descricao:`Todo o corpo falha como glitch ao usar uma Conexão. Sempre que utilizar uma Conexão, o personagem receberá 1d4 de dano de Sanidade. Aumente a pontuação de Sentido Paranormal em +1d4. Uma vez por sessão, você pode rolar um dado de sorte (1d6), caso o resultado seja 4 ou maior, então o personagem obterá um bônus de +2 em sua próxima rolagem.` },
    { id:"perdicao-110", dimensao:"perdicao", corrupcao:110, titulo:"110 de Corrupção", pagina:149,
      descricao:`Por 1 rodada, durante uma cena de combate após usar a Conexão, o personagem ficará PARALISADO como um glitch, porém, não poderá ser acertado. Perde 1d4 da Sanidade Total e atual. Não perde mais Sanidade ao ativar uma Conexão. Aumente a pontuação de Sentido Paranormal em +1d8.` },
    { id:"perdicao-140", dimensao:"perdicao", corrupcao:140, titulo:"140 de Corrupção", pagina:149,
      descricao:`Por 3 rodadas após usar a Conexão, o personagem ficará PARALISADO como um glitch, porém, não poderá ser acertado. O personagem perde 1d6 de Sanidade Total e atual. O personagem aumenta sua pontuação de Sentido Paranormal em +1d8. Uma vez por sessão, você pode rolar um dado de sorte (1d6), caso o resultado seja 4 ou mais, então o personagem obterá um bônus de +5 em sua próxima rolagem.` },
    { id:"perdicao-165", dimensao:"perdicao", corrupcao:165, titulo:"165 de Corrupção", pagina:149,
      descricao:`Um vasto e poderoso conhecimento sobre a Dimensão da Perdição passa a invadir a mente do utilitário corrompido, assim como conhecimento subconsciente sobre os círculos e símbolos de conexão. O personagem é capaz de compreender o funcionamento caótico da Perdição. Sempre que utilizar uma Conexão da Perdição, aumente o resultado da rolagem em +2. Aumente a Pontuação de Sentido Paranormal em +1d8.` },
    { id:"perdicao-190", dimensao:"perdicao", corrupcao:190, titulo:"190 de Corrupção", pagina:149,
      descricao:`O personagem não perde HP como Consumo de Conexões, porém, após três usos de Conexão, ele fica PARALISADO como Glitch por 1d8 Rodadas, reiniciando a contagem de três usos de Conexões ao fim das rodadas de paralisia, não podendo ser acertado ao longo deste período. A imagem do personagem fica oscilando como um glitch, ou estática permanentemente. O personagem perde 1d20 de sua Sanidade Total e Atual. O personagem aumenta a pontuação de Sentido Paranormal em +1d12. O personagem poderá rerrolar seus dados de Sorte.` },
    { id:"perdicao-200", dimensao:"perdicao", corrupcao:200, titulo:"200 de Corrupção", pagina:149,
      descricao:`O personagem se torna uma imagem corrompida, e sem sentido, que possui uma forma semelhante à um corpo humano, porém, irreconhecível, reduzido a pura estática, sendo puxado para a Perdição.` }
  ];

  /* ---------------------------------------------------------
     Dimensões — reaproveita EXATAMENTE as chaves/nomes já usados
     por CONEXOES_DIM_LABELS/CONEXOES_DIM_ORDER (index.html). Não é
     uma segunda lista: é só a ordem/rótulo em que este módulo
     percorre as mesmas 7 Dimensões que já existem no projeto para
     montar os filtros dos Marcos de Corrupção.
     --------------------------------------------------------- */
  var MARCOS_DIM_ORDER = ["infernal", "terrena", "arkanjerial", "sombria", "carnical", "limbica", "perdicao"];

  function dimLabel(key){
    if (typeof CONEXOES_DIM_LABELS === "object" && CONEXOES_DIM_LABELS && CONEXOES_DIM_LABELS[key]) {
      return CONEXOES_DIM_LABELS[key];
    }
    // Fallback só usado se, por algum motivo, CONEXOES_DIM_LABELS ainda
    // não tiver sido definido no momento da chamada — não é uma segunda
    // fonte de nomes, apenas evita quebrar a tela nesse cenário raro.
    var fallback = { infernal:"Infernal", terrena:"Terrena", arkanjerial:"Arkanjerial", sombria:"Sombria", carnical:"Carniçal", limbica:"Límbica", perdicao:"Perdição" };
    return fallback[key] || key;
  }

  var mc_activeDim = "todas";

  function esc(s){
    if (typeof escapeHtml === "function") return escapeHtml(s);
    var d = document.createElement("div");
    d.textContent = (s === undefined || s === null) ? "" : String(s);
    return d.innerHTML;
  }

  function findMarcoById(id){
    for (var i = 0; i < MARCOS_CORRUPCAO_DATA.length; i++){
      if (MARCOS_CORRUPCAO_DATA[i].id === id) return MARCOS_CORRUPCAO_DATA[i];
    }
    return null;
  }

  /* ==========================================================
     COMPÊNDIO → "MARCOS DE CORRUPÇÃO"
     Nova sub-aba dentro do Compêndio já existente, seguindo
     exatamente o mesmo padrão de integração já usado por
     Habilidades de Sede (js/sede-skills.js): mesma barra de
     sub-abas (".subtab-row" dentro de #tab-compendio), mesmas
     classes ".subtab-btn"/".subtab-panel" para herdar o estilo.
     ========================================================== */

  function ensureCompendioTab(){
    if (document.getElementById("sub-comp-marcos")) return;
    var subtabRow = document.querySelector("#tab-compendio .subtab-row");
    var compPanel = document.querySelector("#tab-compendio .panel");
    if (!subtabRow || !compPanel) return;

    var btn = document.createElement("button");
    btn.className = "subtab-btn";
    btn.setAttribute("data-sub", "comp-marcos");
    btn.textContent = "Marcos de Corrupção";
    subtabRow.appendChild(btn);

    var panel = document.createElement("div");
    panel.className = "subtab-panel";
    panel.id = "sub-comp-marcos";
    panel.innerHTML =
      '<p class="note" style="text-align:left; margin:0 0 14px;">Acontecimentos e efeitos que um personagem sofre ao atingir determinados níveis de Corrupção, organizados por Dimensão (Sistema de OdC, cap. Corrupção). Selecione uma Dimensão para ver seus Marcos, ou clique em um Marco para ver a descrição completa.</p>' +
      '<div id="mc_filters" class="cx-filters"></div>' +
      '<div id="mc_count" class="note" style="text-align:left;"></div>' +
      '<div id="mc_grid" class="cx-grid"></div>';
    compPanel.appendChild(panel);

    btn.addEventListener("click", function(){
      document.querySelectorAll(".subtab-btn").forEach(function(b){ b.classList.remove("active"); });
      document.querySelectorAll(".subtab-panel").forEach(function(p){ p.classList.remove("active"); });
      btn.classList.add("active");
      panel.classList.add("active");
    });
  }

  function renderFilters(){
    var wrap = document.getElementById("mc_filters");
    if (!wrap || wrap.dataset.built) return;
    var html = '<button class="cx-filter-btn cx-filter-all active" data-mcfilter="todas">Todas</button>';
    MARCOS_DIM_ORDER.forEach(function(key){
      html += '<button class="cx-filter-btn cx-' + key + '" data-mcfilter="' + key + '"><span class="dot"></span>' + esc(dimLabel(key)) + '</button>';
    });
    wrap.innerHTML = html;
    wrap.dataset.built = "1";
    wrap.querySelectorAll("[data-mcfilter]").forEach(function(b){
      b.addEventListener("click", function(){
        mc_activeDim = b.getAttribute("data-mcfilter");
        wrap.querySelectorAll("[data-mcfilter]").forEach(function(x){ x.classList.remove("active"); });
        b.classList.add("active");
        renderGrid();
      });
    });
  }

  function renderGrid(){
    var grid = document.getElementById("mc_grid");
    var countEl = document.getElementById("mc_count");
    if (!grid) return;

    var list = MARCOS_CORRUPCAO_DATA;
    if (mc_activeDim !== "todas"){
      list = list.filter(function(m){ return m.dimensao === mc_activeDim; });
    }
    // Dentro de cada Dimensão, mantém a ordem crescente de Corrupção.
    list = list.slice().sort(function(a, b){
      if (a.dimensao === b.dimensao) return a.corrupcao - b.corrupcao;
      return MARCOS_DIM_ORDER.indexOf(a.dimensao) - MARCOS_DIM_ORDER.indexOf(b.dimensao);
    });

    if (countEl) countEl.textContent = list.length + " marco" + (list.length === 1 ? "" : "s");

    grid.innerHTML = "";
    if (list.length === 0){
      grid.innerHTML = '<div class="cx-empty">Nenhum Marco de Corrupção encontrado para este filtro.</div>';
      return;
    }

    list.forEach(function(m){
      var card = document.createElement("div");
      card.className = "cx-card cx-" + m.dimensao;
      var shortDesc = m.descricao.length > 150 ? (m.descricao.slice(0, 150).trim() + "…") : m.descricao;
      card.innerHTML =
        '<div class="cx-body">' +
          '<h4>' + esc(m.titulo) + '</h4>' +
          '<div class="cx-dimlabel">' + esc(dimLabel(m.dimensao)) + '</div>' +
          '<p style="margin:6px 0 0; font-size:11.5px; line-height:1.55; color:var(--paper-dim);">' + esc(shortDesc) + '</p>' +
        '</div>' +
        '<div class="cx-arrow">&rsaquo;</div>';
      card.addEventListener("click", function(){ openMarcoModal(m.id); });
      grid.appendChild(card);
    });
  }

  /* ==========================================================
     MODAL DE DETALHES
     Modal próprio, dedicado aos Marcos de Corrupção, reaproveitando
     a MESMA estrutura genérica de modal (".modal-overlay"/
     ".modal-box"/".modal-actions") já usada pelos demais modais do
     projeto (mesmo padrão já seguido por sede-skills.js) — nenhum
     sistema de popup novo é criado.
     ========================================================== */

  function ensureModal(){
    if (document.getElementById("mc_modal")) return;
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "mc_modal";
    overlay.innerHTML =
      '<div class="modal-box cx-modal-box" id="mc_modal_box">' +
        '<h3 id="mc_modal_title"></h3>' +
        '<div class="cx-modal-dim" id="mc_modal_dim"></div>' +
        '<div class="cx-modal-section"><p id="mc_modal_desc" style="white-space:pre-wrap;"></p></div>' +
        '<div class="fonte-tag" id="mc_modal_page" style="margin-top:10px;"></div>' +
        '<div class="modal-actions" style="margin-top:14px; justify-content:flex-end;">' +
          '<button type="button" id="mc_modal_close">Fechar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById("mc_modal_close").addEventListener("click", closeMarcoModal);
    overlay.addEventListener("click", function(e){
      if (e.target.id === "mc_modal") closeMarcoModal();
    });
  }

  function openMarcoModal(id){
    var m = findMarcoById(id);
    if (!m) return;
    ensureModal();
    document.getElementById("mc_modal_title").textContent = m.titulo;
    document.getElementById("mc_modal_dim").textContent = dimLabel(m.dimensao);
    document.getElementById("mc_modal_desc").textContent = m.descricao;
    document.getElementById("mc_modal_page").textContent = "Sistema de OdC — pág. " + m.pagina;
    document.getElementById("mc_modal_box").className = "modal-box cx-modal-box cx-" + m.dimensao;
    document.getElementById("mc_modal").style.display = "flex";
  }

  function closeMarcoModal(){
    var m = document.getElementById("mc_modal");
    if (m) m.style.display = "none";
  }

  /* ---------- boot ---------- */
  function init(){
    ensureCompendioTab();
    renderFilters();
    renderGrid();
  }

  window.MarcosCorrupcao = {
    init: init,
    refresh: renderGrid,
    data: MARCOS_CORRUPCAO_DATA
  };

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
