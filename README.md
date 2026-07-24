# The Safe-Word Syndicate — 16-bit

A retro arcade beat 'em up side-scroller running entirely in the browser: React shell, HTML5 canvas renderer, and a hand-rolled game engine with a Web Audio chiptune synthesizer.

## Stack

| Camada | Tecnologia |
|---|---|
| Build | Vite 6 |
| UI / telas | React 19 + Tailwind CSS 4 |
| Renderização do jogo | Canvas 2D (`src/game/spriteRenderer.ts`) |
| Lógica do jogo | TypeScript puro, sem dependências (`src/game/engine.ts`) |
| Áudio | Web Audio API (synth FM/PCM) + HTML5 Audio para trilhas customizadas |
| Persistência | IndexedDB (trilhas do jukebox) |

## Rodando localmente

**Pré-requisito:** Node.js 20+

```bash
npm install
npm run dev      # http://localhost:3000
```

Não há variáveis de ambiente nem chaves de API. O projeto é 100% client-side.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento com HMR |
| `npm run build` | Typecheck + build de produção em `dist/` |
| `npm run preview` | Serve o build de produção localmente |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run clean` | Remove `dist/` |

## Controles

| Ação | Tecla |
|---|---|
| Mover | `WASD` ou setas |
| Soco | `J` |
| Chute | `K` |
| Power Move | `L` / `E` / `F` / `U` |
| Pulo | `Espaço` |
| Pausar | `P` ou `Esc` |

Há também um D-pad virtual na tela para toque/mobile.

## Estrutura

```
src/
├── App.tsx                 # Máquina de estados de telas + loop principal
├── types.ts                # Contratos de domínio (entidades, fases, input)
├── components/             # Telas e overlays (React)
│   ├── GameCanvas.tsx      # Canvas + HUD
│   ├── CharacterSelect.tsx
│   ├── DialogueOverlay.tsx
│   ├── CustomAudioModal.tsx
│   └── ...
└── game/                   # Núcleo do jogo (TypeScript puro)
    ├── engine.ts           # Física, IA, combate, ondas
    ├── spriteRenderer.ts   # Desenho procedural dos sprites
    ├── stageData.ts        # Definição das fases e diálogos
    ├── characterData.ts    # Stats de heróis e inimigos
    ├── sound.ts            # Synth chiptune + player de trilhas
    └── audioStore.ts       # Persistência IndexedDB
```

`src/game/` não importa nada de React — é lógica pura e testável isoladamente.

## Trilha sonora

O jogo tem quatro slots de música (intro, seleção de personagem, fase 1, boss da fase 1). Cada slot cai no synth 16-bit embutido quando não há arquivo configurado.

Para trocar as trilhas há duas rotas:

1. **Jukebox in-game** — botão `JUKEBOX / MUSIC` na tela de título. Os arquivos ficam no IndexedDB do navegador e sobrevivem a reloads. Funciona em dev e em produção.
2. **Arquivos em `public/audio/`** — descobertos automaticamente via `/audio/manifest.json`. Funciona em dev e em produção: em desenvolvimento o manifesto é servido dinamicamente (basta colocar o arquivo na pasta e recarregar); no build ele é gerado como asset estático.

   O mapeamento para os slots é por palavra-chave no nome do arquivo (`intro`, `select`, `stage1`, `boss`), com fallback pela ordem alfabética. Os nomes sugeridos em `public/audio/README.md` cobrem todos os casos.

## Deploy

Build estático puro — qualquer host de arquivos serve.

```bash
npm run build    # gera dist/
```

Netlify: build command `npm run build`, publish directory `dist`.
