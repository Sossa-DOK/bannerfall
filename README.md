# Bannerfall

A browser **lane-battler** prototype aimed at [CrazyGames](https://www.crazygames.com). You never control units directly: you **build** barracks, towers and economy buildings on your grid, and your armies march across a glowing lightbridge and fight on their own. Destroy the enemy **Heartstone** to win.

Set in the **Shardlands**, a shattered world of floating islands. This is a gray-box prototype: simple shapes, no art assets, built to test whether the game is fun.

## Factions

| Faction | Style | Ability |
|---|---|---|
| ⚙️ **Brasswright Union** | Tough, expensive, strong late | **Overclock** (O): a building works 2× faster for 20 s, at the cost of 25% of its HP |
| 🌱 **Bloomkin Grove** | Cheap swarms, strong early | **Bloom** (passive): buildings upgrade themselves for free over time |
| 🪶 **Galewing Aerie** | Fast, fragile, mostly flying | **Gale** (G): blows enemy ground units back and slows them |
| 🕯️ **Hollow Choir** | Arcane spirits, win long fights | **Echo** (passive): fallen units can rise again as temporary ghosts |

Every unit has an **attack type** (Pierce, Normal, Siege, Magic) and an **armor type** (Light, Heavy, Fortified, Arcane), and a damage table decides who beats whom. Press **L** in game for the full legend and suggested counters.

## Running it

Requires **Node.js 18+**.

```sh
npm install
npm run dev
```

Then open http://localhost:5173.

On a first visit the game drops you straight into a short guided tutorial. You can replay it any time from the **🎓 Tutorial** button on the main menu.

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Type-check, then build a production bundle into `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run typecheck` | Type-check only |

## Controls

| Key | Action |
|---|---|
| **1–8** | Pick a building (or click it in the bottom bar) |
| **Click** a tile on your grid | Place the selected building (**Shift**-click to place several) |
| **Click** a building | Select it (shows its info and upgrade options) |
| **U** | Upgrade the selected building |
| **O** | Overclock (Union) |
| **G** | Gale (Aerie) |
| **L** | Unit legend and counters |
| **Space** / **P** | Pause |
| **Esc** | Cancel, or open the pause menu (Resume, Restart, Exit to main menu) |
| **Right-click** | Cancel |

The top bar also has 1× / 2× / 4× game speed.

## Balance tools

The simulation runs headless, with no browser needed, so bots can play thousands of matches to check balance.

```sh
npx tsx scripts/matrix.ts 14          # 4×4 faction win-rate matrix (1v1, ~2–3 min)
npx tsx scripts/matrix.ts 10 aerie    # only the matchups involving one faction
npx tsx scripts/matchup.ts 40 1v1     # Union vs Bloomkin only
npm run sim                           # older 2-faction run, 1v1 and 2v2
```

All unit and building stats live in [`src/data/factions.ts`](src/data/factions.ts), and the damage table in [`src/data/damage.ts`](src/data/damage.ts).

## Project structure

```
src/
  data/       factions, units, buildings, damage table (pure data)
  sim/        deterministic game simulation at 20 ticks/s: no rendering, seeded RNG
  ai/         build-order bots (counter-picking, Easy / Normal / Hard)
  game/       Match: wires the world and its bots together
  render/     canvas renderer and unit silhouettes
  ui/         HUD, unit legend, scout hint, tutorial
  platform/   CrazyGames SDK v3 wrapper
  main.ts     menus, input, game loop
scripts/      headless balance and debugging scripts
```

The simulation is kept separate from rendering and is **deterministic**: the same seed and the same commands always produce the same match. That's what makes headless balance testing possible, and later replays and online multiplayer.

## CrazyGames status

- [`src/platform/sdk.ts`](src/platform/sdk.ts) wraps the CrazyGames HTML5 SDK v3 (`gameplayStart`, `gameplayStop`, `happytime`). Until the SDK script is added to `index.html`, every call does nothing.
- The build uses relative paths and is currently about 66 KB of JavaScript, well under CrazyGames' size limits.
- Not done yet:
  - ads
  - saving through the CrazyGames Data Module (the "tutorial done" flag is in `localStorage` for now)
  - the SDK's mute setting
  - mobile touch layout
  - Commander Cards
  - real art and audio
