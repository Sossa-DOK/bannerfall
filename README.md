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

Before each match you pick **3 Commander Cards**: one-shot powers usable once each from 1:00. Each faction has 3 of its own (for example Gearstorm, Pollen Cloud, Feather Storm, Funeral Bell), plus 2 that any faction can take (Rally Banner, Heartstone Pulse). Your picks are remembered per faction. Bots bring and play cards too.

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

### Publishing a playable build to itch.io

```sh
npm run package:itch    # builds and writes release/bannerfall-web.zip
```

On itch.io: **Upload new project** → Kind of project **HTML** → upload the zip and tick **"This file will be played in the browser"** → Embed options: **1280 × 720**, tick **Mobile friendly** (landscape) and **Fullscreen button**. Set Visibility to **Draft** (only you) or **Restricted** (password-protected) for private playtesting.

For repeat uploads you can use itch's [butler](https://itch.io/docs/butler/) command-line tool once it's installed and logged in:

```sh
ITCH_TARGET=yourname/bannerfall:html5 npm run itch
```

### Store art

With the dev server running (`npm run dev`) and Firefox installed:

```sh
npm run cover          # marketing/itch-cover.png (630×500), drawn in marketing/cover.html
npm run screenshots    # marketing/screenshots/*.png (1280×720)
npm run gif            # marketing/battle.gif: animated battle clip (needs Python 3 + Pillow)
```

Screenshots use **screenshot mode**: open `/?shot&f=union&e=bloomkin&mode=1v1&t=200&seed=36&sel=1` to fast-forward a real match (your side played by an autopilot) and freeze it. Options: `f` / `e` factions, `mode`, `t` seconds, `seed`, `sel=1` select a barracks, `gale=1`, `card=<id>`, `legend=1`. Add `gif` (plus `frames`, `every`, `w`, `crop`, `galeAt`, `cardAt`) to record frames for the GIF; see `scripts/gif.py`. The match is deterministic, so the same URL always gives the same frame.

## Controls

| Key | Action |
|---|---|
| **1–8** | Pick a building (or click it in the bottom bar) |
| **Click** a tile on your grid | Place the selected building (**Shift**-click to place several) |
| **Click** a building | Select it (shows its info and upgrade options) |
| **U** | Upgrade the selected building |
| **O** | Overclock (Union) |
| **G** | Gale (Aerie) |
| **Q / W / E** | Play Commander Card 1 / 2 / 3. Aimed cards: click the battlefield; Esc or right-click cancels |
| **L** | Unit legend and counters |
| **Space** / **P** | Pause |
| **Esc** | Cancel, or open the pause menu (Resume, Restart, Exit to main menu) |
| **Right-click** | Cancel |

The top bar also has 1× / 2× / 4× game speed.

### Online 1v1

**🌐 Online 1v1** on the main menu: one player clicks **Create game** and shares the 5-letter room code; the other types it under **Join**. Each player uses the faction and Commander Cards picked on the menu. Works anywhere the game is hosted, including itch.io — there is no game server.

How it works: the two browsers connect directly over WebRTC (the free [PeerJS](https://peerjs.com) service only introduces them, and relays traffic if a direct path is blocked). The simulation is deterministic, so only player commands are sent (**lockstep**): each command runs on the same tick on both machines, ~300 ms after it's issued. State fingerprints are compared every 2 s to detect desyncs. Online matches can't be paused or sped up, and leaving counts as a forfeit.

Tests:

```sh
npx tsx scripts/lockstep-test.ts 6   # two simulated peers over a fake laggy network
python3 scripts/nettest.py 300        # two real headless Firefox browsers over PeerJS (needs dev server + internet)
```

### Sound

All sound effects and music are **synthesized in code** with the Web Audio API, so there are no audio files to download. Each faction has its own music loop, plus a calm menu theme. Toggle sound effects and music from the main menu or the pause menu; **M** or the 🔊 button mutes everything. Settings are remembered. When the CrazyGames SDK is loaded, its mute setting overrides these toggles.

### Touch (phones and tablets)

Play in landscape; in portrait the game pauses and asks you to rotate.

- **Build:** tap a building in the bottom bar, then tap a tile. The ghost and its range appear first; tap the **same tile again** to build.
- **Cards:** tap a card to read what it does, then tap it again to play it. For cards that need aiming, tap a spot to preview the circle, then tap the same spot again to drop it.
- **✕ Cancel** (above the bottom bar) backs out of placing, aiming or a selection. Every keyboard action has an on-screen button.

On small screens (phones, or browser windows smaller than about 1024×576) the HUD switches to a **compact layout** with bigger text and buttons. The game also keeps clear of phone notches and the home bar.

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
  data/       factions, units, buildings, Commander Cards, damage table (pure data)
  sim/        deterministic game simulation at 20 ticks/s: no rendering, seeded RNG
  ai/         build-order bots (counter-picking, Easy / Normal / Hard)
  game/       Match: wires the world and its bots together
  render/     canvas renderer and unit silhouettes
  ui/         HUD, unit legend, scout hint, tutorial
  audio/      procedural sound effects and music (Web Audio)
  net/        online 1v1: PeerJS link, deterministic lockstep
  platform/   CrazyGames SDK v3 wrapper (incl. muteAudio)
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
  - real art (audio is procedural for now)
