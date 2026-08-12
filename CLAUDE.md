# Safe-Word Syndicate — notas de projeto

Este arquivo é lido no início de cada sessão. Contém o que se aprendeu
trabalhando neste repositório e que não está óbvio no código — em particular,
onde a suíte **não** protege nada e como medir sem se enganar.

## Comandos

```
npm test          vitest run
npm run build     eslint . && tsc --noEmit && vite build
npm run dev       vite, porta 3000
```

O `build` é o portão completo: lint, tipos e bundle. Rodar os três antes de
propor qualquer mudança.

## Testes

`vitest` roda em `environment: 'node'`. Não há jsdom. O `src/test/setup.ts`
stub-a explicitamente a superfície de browser que o módulo de som alcança
(Web Audio, HTMLAudioElement, IndexedDB) e instala um `Math.random` semeado
antes de cada teste, para que a ordem dos arquivos não decida o que os dados
mostram.

### Lacuna conhecida: componentes React não são testáveis hoje

Não existe jsdom, nem `@testing-library/react`, nem um único teste de
componente em `src/test/`. Tudo o que é testado é motor, política pura ou
renderização em canvas via `@napi-rs/canvas`.

Consequência prática: correções em `src/components/` e em `src/App.tsx` são
verificadas por leitura, não por teste. **Os dois defeitos encontrados jogando,
e não pela suíte, saíram exatamente dessa faixa:**

- `ac8a34f` — a tela de seleção ficava surda ao controle com dois pads listados
  no modo solo. A regra foi extraída para `src/game/modes.ts` justamente para
  poder ser testada fora do React.
- `38b9993` — o preview do jukebox continuava tocando quando o overlay era
  fechado pelo BACK do gamepad. Sem teste; verificado por leitura.

Fechar a lacuna custa `jsdom` e `@testing-library/react` em `devDependencies`
mais um segundo ambiente no `vitest.config.ts`, mantendo os testes de motor em
`node`. É decisão de projeto, não pendência de nenhum patch.

### Segunda lacuna: o canvas de teste é mais permissivo que o navegador

`@napi-rs/canvas` **aceita** atalhos de fonte que o CSS rejeita, e o
`RecordingContext` guarda `font` como string crua. Medido lado a lado:

```
@napi-rs/canvas   aceita  'black 12px monospace'  ->  black 12px monospace
Chromium          rejeita 'black 12px monospace'  ->  30px serif
```

`black` não é peso válido no atalho `font` (válidos: `normal`, `bold`,
`bolder`, `lighter`, 100–900). No navegador a atribuição inteira é
descartada e o texto sai na fonte anterior — defeito silencioso, já
encontrado duas vezes: nos números de dano e no cabeçalho do banner de
super (`02cd0cf`). **Nenhum teste rodando em `node` consegue enxergá-lo**:
reinstalar a string quebrada deixa a suíte inteira verde.

São treze `ctx.font` no projeto. Os doze restantes estão corretos hoje, e
a próxima linha errada também não será pega. Fechar isso é validar o
atalho no `RecordingContext`, ou uma sonda Playwright — o Chromium do
ambiente está em `/opt/pw-browsers/chromium`.

### Terceira lacuna: a tela de título não sabe distinguir um pad fantasma

O navegador lista um mesmo controle duas vezes, sob dois índices com a mesma
identidade. Uma das entradas às vezes **congela**: vira uma fotografia que nunca
mais muda. Se ela congelar num instante em que uma direção estava apertada,
passa a relatar aquela direção para sempre, e o jogo tem de ignorá-la. Por que o
navegador duplica a entrada não é coisa que este projeto tenha estabelecido —
uma versão anterior deste parágrafo afirmava uma causa (o mesmo pad visto pela
conexão sem fio e pelo cabo) que era palpite e estava **errada** para a
instalação que reportou o defeito: um controle só, sem fio, listado duas vezes.

Quem sabe distinguir a foto do controle é `trackActivity`, e ela só roda a
partir de `readPlayerPads` — ou seja, durante a partida e na tela de seleção de
personagem. A tela de título usa só `readMenuState`, que **funde todas as
entradas** e não anota nada. Resultado: até a primeira ida à seleção de
personagem da sessão, não há registro e o filtro de `67b5611` não tem em que se
apoiar.

O registro **não** é apagado ao voltar ao título — `resetPadAssignments` solta
apenas os slots. Então a janela desprotegida é estreita: splash, attract, intro
e a primeira visita ao título. Para morder, a foto precisa congelar ali dentro
*e* com uma direção apertada, o que é plausível porque são justamente as telas
em que se martela botão para pular. O efeito é uma direção surda no cursor do
título; as outras e o confirmar seguem funcionando.

**Por que não está fechada.** O caderninho guarda dois fatos no mesmo lugar: "é
um aparelho real?" (não depende de tempo) e "há quanto tempo não muda?" (contado
em quadros da simulação, e é o que dá `STALE_AFTER_FRAMES = 180`). Deixar um
segundo leitor escrever ali quebra o segundo fato de duas maneiras: se ele
atualizar só a leitura guardada, a partida depois vê "não mudou" e dá o controle
por morto; se atualizar o contador também, o relógio anda em dobro nas telas em
que os dois leitores rodam juntos, e três segundos viram um e meio. Os dois
desfechos são a mesma coisa na prática — **o jogador perde o controle no meio da
luta**, que é a classe de defeito já corrigida duas vezes neste arquivo.

**O que fechar exige, nesta ordem.** Primeiro um teste que **intercale** os dois
leitores e crave que a janela de staleness continua disparando no mesmo chamado
— os três testes que já vigiavam isso (`does not steal a slot from a holder that
is still reporting`, `leaves a resting controller alone`, e o que crava o
chamado 181) exercitam só o caminho da partida e não veriam a interferência.
Depois a mutação. Só então a mudança: dar ao fato "é real ou é foto?" um campo
próprio, para os dois escritores nunca se cruzarem.

**O primeiro passo está feito.** `the menu reader does not move the staleness
window` roda `readMenuState` duas vezes por quadro entre chamados de
`readPlayerPads` e crava que a troca de slot acontece no chamado 181 nos dois
cenários — número absoluto, não a constante. A mutação `STALE_AFTER_FRAMES = 1`
o reprova. Os passos dois e três seguem por fazer; enquanto seguirem, o leitor
de menus continua **sem caneta** sobre `padActivity`.

**Registro de acerto neste assunto,** porque ele deve pesar na decisão de mexer:
das três mudanças feitas na atribuição de controles nesta faixa, uma chegou ao
jogador como defeito novo (a regra do "nunca tocado", que consertou a troca de
personagens na virada de fase e abriu o buraco pelo qual a foto congelada
segurou o P1). Conviver com a lacuna foi julgado mais barato que arriscar de
novo sem o teste de intercalação pronto.

### A cópia que congelou depois de funcionar, e o que a regra dela custa

`everChanged` pergunta se a entrada já se mexeu **alguma vez**, e por isso só
pega a cópia que nasceu morta. A que foi reportada trabalhou uma fase inteira e
só então congelou — para ela `everChanged` responde "sim, é um aparelho", e ela
ficou com o P1 segurando uma direção. O primeiro conserto filtrou apenas
`readMenuState`, então o modal parou de segurar a direção e **o lutador
continuou andando**, porque a partida lê um slot atribuído e não o estado
fundido.

O que separa uma cópia de um segundo controle **não** é obsolescência sozinha:
dois pads do mesmo modelo relatam o mesmo `id`, e num navegador que só atualiza
o relógio do pad quando o estado muda, ficar parado é indistinguível de estar
congelado. Demitir por obsolescência tiraria o controle de um jogador de co-op
três segundos depois de ele parar — a classe de defeito já corrigida duas vezes.

A regra espera **prova** de que são dois aparelhos: um aparelho listado duas
vezes mostra a mesma coisa nas duas entradas; duas pessoas não, e discordam por
trechos longos. Só contam quadros em que **as duas** entradas foram atualizadas,
senão a cópia congelada discordaria da gêmea para sempre e argumentaria a
própria saída.

Três limites, todos medidos:

- **179 quadros ≈ 3 s** de lutador andando sozinho antes de a regra disparar.
  Medido na suíte e repetido no Chromium com o laço real da página; contra o
  código anterior, 600 quadros e 10,5 s depois ainda andava.
- **Um par julgado "dois aparelhos" nunca é rejulgado.** É a direção escolhida
  para errar: um par julgado errado significa que o andar sozinho não é pego —
  visível e recuperável — em vez de um jogador perder o controle na luta.
- **Entrada sem `id` nunca é cópia de nada.** Navegador real sempre preenche;
  pad sintético de teste, não.

### Enquanto a lacuna existir

Quando uma regra de UI puder morar num módulo puro, vale movê-la para lá. É o
que tornou o defeito de `ac8a34f` testável sem harness de React. Precedentes:
`src/game/modes.ts` (modo → segundo lutador, modo → leitor de menu),
`src/game/keyboard.ts` (tecla → jogador e campo), `src/game/companionAi.ts`
(política do parceiro, separada do motor que a executa).

## Como se verifica uma mudança aqui

Três hábitos que pegaram defeitos reais nesta base, em ordem de retorno.

### 1. Mutação antes de aceitar um teste

Um teste verde não prova nada até que se quebre aquilo que ele diz proteger e
ele reprove. O modo de falha recorrente neste repositório é o **teste
auto-referente**: a asserção é escrita em termos da própria constante que
deveria vigiar, e nenhum valor a reprova.

Casos reais, todos com a suíte verde:

- o telegraph da Sayonara afirmado contra `SAYONARA_TELEGRAPH_FRAMES - 1`;
  um wind-up de 1 quadro passava;
- a coleira do parceiro afirmada contra `LEASH_X`; zerar a constante deixava o
  parceiro dentro do herói, empurrando-o 502px rua abaixo, e os três testes
  passavam;
- a histerese de corrida afirmada no ponto médio entre as duas constantes;
  igualá-las passava;
- `TRAIL_CEILING_X` comparado só contra a coleira, nunca contra o motor.

O conserto é sempre a mesma forma: afirmar contra algo que a constante não
pode arrastar consigo — um número absoluto, uma medição do motor, ou a
comparação com outra constante independente.

Ao rodar mutações por script, **verificar que o texto casou**. Uma mutação que
não se aplica parece um mutante sobrevivente e leva a conclusões erradas — já
aconteceu aqui, por indentação.

### 2. Medir com o motor, não com geometria montada

Armadilhas já pagas nesta base:

- **Teleportar o jogador a cada quadro move a câmera.** O inimigo sai de
  `cameraX + 760`, o ramo de entrada de arena assume o controle antes da lógica
  dele, e cooldowns param de correr. Dirigir o jogador por `input()`, não por
  atribuição de `x`.
- **Deixar os outros inimigos da onda em campo contamina a atribuição.** Para
  medir o dano de um lutador específico, interceptar `damageEntity` na
  instância e ler o atacante, ou varrer os demais do campo.
- **Jogador parado não é jogador jogando.** A Sayonara mediu 8 investidas
  contra alvo imóvel e 1 contra alguém que anda para cima dela e bate. Medir
  os dois, mais um padrão de troca (bate alguns segundos, recua alguns).
- **Onda real ≠ inimigos posicionados à mão.** Vários números só aparecem
  dirigindo a onda pelo motor, com a câmera e os spawns reais.

### 3. Comentário é inventário

Comentários aqui carregam medições, e o próximo leitor vai confiar neles em vez
de refazer a conta. Portanto:

- todo número num comentário tem de ser reproduzível;
- quando um número se revela errado, corrigir **e dizer que estava errado** —
  há várias erratas explícitas no histórico, e elas valem mais que o número
  certo sozinho;
- quando uma constante não puder ser demonstrada, é melhor apagá-la que
  documentá-la. Precedente: `SAYONARA_RETREAT_PROGRESS`, removida porque o
  efeito dela ficava dentro do ruído.

## Harnesses que já existem — importar, não reimplementar

- **`src/test/legibility.ts`** — contraste de silhueta contra os fundos de
  fase. Exporta `edgeContrastOf`, `edgeContrast`, `STAGE_TYPES`,
  `MIN_EDGE_CONTRAST`. Existe como módulo próprio porque três pessoas
  reimplementaram a medição de três jeitos e reportaram três números
  incompatíveis, todos de boa-fé. Uma sonda que importa daqui é comparável com
  a suíte; uma que reimplementa é a quarta resposta.
- **`src/test/helpers.ts`** — `startEngine`, `advance`, `stageEnemies`,
  `input`, `NEUTRAL`, `spriteHero`, `spriteEnemy`.

## Convenções

- Todo texto que o jogador vê é em inglês. Comentários e mensagens de commit
  também.
- Desenvolvimento na branch `quality_env`.
- Mensagem de commit descreve o defeito, a medição e o que ficou sem guarda —
  não só a mudança.
