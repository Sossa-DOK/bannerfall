import './style.css';
import type { Difficulty } from './ai/bot';
import type { BuildingDef, FactionId } from './data/types';
import { CARDS_PER_PLAYER, cardOptions, defaultCards, getCard } from './data/cards';
import { FACTIONS } from './data/factions';
import { Match, otherFaction, type MatchSetup, type Mode } from './game/match';
import { platform } from './platform/sdk';
import { Renderer } from './render/renderer';
import * as L from './sim/layout';
import { TICK, type Building } from './sim/world';
import { Hud } from './ui/hud';
import { Legend, scoutHint } from './ui/legend';
import { Tutorial, highlightTiles, tutorialDone } from './ui/tutorial';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const stage = $('#stage');
const canvas = $<HTMLCanvasElement>('#game');
const renderer = new Renderer(canvas);

// ---------- menu state ----------
const choice = { faction: 'union' as FactionId, enemy: 'random', mode: '1v1' as Mode, difficulty: 'normal' as Difficulty };
document.querySelectorAll<HTMLElement>('.choices').forEach((group) => {
  const key = group.dataset.group as keyof typeof choice;
  const sync = () => group.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('sel', b.dataset.value === choice[key]));
  group.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    (choice as Record<string, string>)[key] = b.dataset.value!;
    sync();
  });
  sync();
  if (key === 'faction') group.addEventListener('click', () => renderCardPick());
});

// ---------- Commander Card picker (remembered per faction) ----------
const CARD_KEY = (f: FactionId) => `bannerfall.cards.${f}`;
function loadCards(f: FactionId): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(CARD_KEY(f)) ?? 'null') as string[] | null;
    const valid = new Set(cardOptions(f).map((c) => c.id));
    if (saved && saved.length === CARDS_PER_PLAYER && saved.every((id) => valid.has(id))) return saved;
  } catch {
    /* ignore bad saves */
  }
  return defaultCards(f);
}
let pickedCards = loadCards(choice.faction);
let lastCardDesc = 'Tap or hover a card to see what it does.';

function renderCardPick() {
  const f = choice.faction;
  if (!cardOptions(f).some((c) => c.id === pickedCards[0])) pickedCards = loadCards(f);
  const box = $('#card-pick');
  box.innerHTML = '';
  for (const c of cardOptions(f)) {
    const b = document.createElement('button');
    b.className = pickedCards.includes(c.id) ? 'sel' : '';
    b.title = c.desc;
    b.innerHTML = `${c.icon} <b>${c.name}</b>${c.faction === 'any' ? '<span class="any">any faction</span>' : ''}`;
    b.addEventListener('click', () => {
      lastCardDesc = `${c.icon} ${c.name}: ${c.desc}`;
      if (pickedCards.includes(c.id)) {
        if (pickedCards.length > 1) pickedCards = pickedCards.filter((x) => x !== c.id);
      } else {
        pickedCards = [...pickedCards, c.id];
        if (pickedCards.length > CARDS_PER_PLAYER) pickedCards.shift(); // swap out the oldest pick
      }
      try {
        if (pickedCards.length === CARDS_PER_PLAYER) localStorage.setItem(CARD_KEY(f), JSON.stringify(pickedCards));
      } catch {
        /* storage blocked */
      }
      renderCardPick();
    });
    box.appendChild(b);
  }
  $('#card-desc').textContent = lastCardDesc;
  $('#card-count').textContent = `(${pickedCards.length}/${CARDS_PER_PLAYER} picked · hover for details · usable once each from 1:00)`;
}
renderCardPick();

// ---------- game state ----------
let match: Match | null = null;
let buildDef: BuildingDef | null = null;
let selected: Building | null = null;
let hover: { col: number; row: number } | null = null;
let hoverPos: { x: number; y: number } | null = null;
/** card slot being aimed, if any */
let aiming: number | null = null;

// ---------- touch support ----------
/** Touch play uses "tap to preview, tap again to confirm" for building and aiming. */
let lastPointer: string = 'mouse';
let pendingTile: { col: number; row: number } | null = null;
let pendingAim: { x: number; y: number } | null = null;
/** card slot armed by a first tap on touch (tap again to play) */
let armedCard: { idx: number; until: number } | null = null;
const isTouch = () => lastPointer === 'touch';
window.addEventListener(
  'pointerdown',
  (e) => {
    if (e.pointerType && e.pointerType !== lastPointer) {
      lastPointer = e.pointerType;
      fit();
    }
  },
  true,
);
function clearPending() {
  pendingTile = null;
  pendingAim = null;
}
let speed = 1;
let paused = false;
let acc = 0;
let lastFrame = performance.now();
let matchCount = 0;
let toastT = 0;
let scoutT = 0;
let pausedBeforeLegend = false;
let tutorial: Tutorial | null = null;
let currentIsTutorial = false;
let legendOpened = false;

const legend = new Legend(stage, () => {
  if (match && match.world.winner === null) setPaused(pausedBeforeLegend);
});

function toggleLegend() {
  if (legend.open) {
    legend.hide();
    return;
  }
  legendOpened = true;
  if (match && match.world.winner === null) {
    pausedBeforeLegend = paused;
    setPaused(true);
    const w = match.world;
    const me = w.players[match.humanId];
    legend.show(me.faction, w.players.find((p) => p.team !== me.team)?.faction);
  } else legend.show(choice.faction, choice.enemy === 'random' ? undefined : (choice.enemy as FactionId));
}

const hud = new Hud(stage, {
  selectBuild: (d) => {
    buildDef = buildDef === d ? null : d;
    selected = null;
    aiming = null;
    clearPending();
  },
  upgrade: () => doUpgrade(),
  overclock: () => doOverclock(),
  ability: () => doAbility(),
  card: (i) => useCard(i),
  setSpeed: (n) => (speed = n),
  togglePause: () => setPaused(!paused),
});

function toast(msg: string) {
  const el = $('#toast');
  el.textContent = msg;
  el.style.opacity = '1';
  toastT = 2.2;
}

function startMatch(asTutorial = false) {
  tutorial?.finish();
  tutorial = null;
  legendOpened = false;
  const seed = (Date.now() ^ (matchCount * 2654435761)) >>> 0;
  const enemy: FactionId = choice.enemy === 'random' ? otherFaction(choice.faction, seed >>> 5) : (choice.enemy as FactionId);
  const setup: MatchSetup = {
    mode: asTutorial ? '1v1' : choice.mode, playerFaction: choice.faction, enemyFaction: asTutorial ? (choice.faction === 'union' ? 'bloomkin' : 'union') : enemy,
    difficulty: asTutorial ? 'easy' : choice.difficulty,
    seed, human: true, playerCards: pickedCards.length === CARDS_PER_PLAYER ? pickedCards : loadCards(choice.faction),
  };
  matchCount++;
  currentIsTutorial = asTutorial;
  match = new Match(setup);
  buildDef = null;
  selected = null;
  aiming = null;
  paused = false;
  acc = 0;
  renderer.clearFx();
  hud.setup(match.world, match.humanId);
  $('#menu').classList.add('hidden');
  $('#end').classList.add('hidden');
  if (asTutorial) tutorial = new Tutorial(match, stage, () => (tutorial = null));
  else toast(`You are ${FACTIONS[choice.faction].name}. Press 1 and click a tile on your grid. Press L for the unit legend.`);
  $('#scout').innerHTML = '';
  platform.gameplayStart();
}

function endMatch() {
  if (!match) return;
  const w = match.world;
  const won = w.winner === w.players[match.humanId].team;
  platform.gameplayStop();
  if (won) platform.happytime();
  $('#end-title').textContent = won ? 'Victory!' : 'Defeat';
  const me = w.players[match.humanId];
  $('#end-stats').textContent = `Match time ${Math.floor(w.time / 60)}:${String(Math.floor(w.time % 60)).padStart(2, '0')} · buildings placed ${me.built} · kills ${me.kills}`;
  $('#end').classList.remove('hidden');
}

function setPaused(p: boolean) {
  if (!match || match.world.winner !== null) return;
  paused = p;
  if (paused) platform.gameplayStop();
  else platform.gameplayStart();
}

function doUpgrade() {
  if (!match || !selected) return;
  if (!match.world.upgrade(match.humanId, selected.id)) toast(selected.rank >= 3 ? 'Already max rank' : 'Not enough gold');
}

function useCard(i: number) {
  if (!match || paused || match.world.winner !== null) return;
  const w = match.world;
  const slot = w.players[match.humanId].cards[i];
  if (!slot) return;
  if (aiming === i) {
    aiming = null;
    return;
  }
  const ok = w.canCast(match.humanId, i);
  if (!ok.ok) {
    toast(ok.reason!);
    return;
  }
  const card = getCard(slot.id);
  if (card.target === 'none') {
    // touch: the first tap explains the card, the second plays it (no hover tooltips on phones)
    if (isTouch() && !(armedCard && armedCard.idx === i && performance.now() < armedCard.until)) {
      armedCard = { idx: i, until: performance.now() + 3000 };
      toast(`${card.icon} ${card.name}: ${card.desc} Tap again to play.`);
      return;
    }
    armedCard = null;
    w.cast(match.humanId, i);
    return;
  }
  aiming = i;
  buildDef = null;
  selected = null;
  clearPending();
  const where = card.target === 'ownBuilding' ? 'one of your buildings' : card.target === 'ownHalf' ? 'a spot on your half of the bridge' : 'the battlefield';
  toast(`${card.icon} ${card.name}: click ${where} · Esc to cancel`);
}

function doAbility() {
  if (!match || paused) return;
  if (!match.world.gale(match.humanId)) {
    const p = match.world.players[match.humanId];
    if (FACTIONS[p.faction].mechanic === 'gale') toast(`Gale recharging (${Math.ceil(p.abilityCd)}s)`);
  }
}

function doOverclock() {
  if (!match || !selected) return;
  if (!match.world.overclock(match.humanId, selected.id)) toast('Overclock not ready');
}

$('#start').addEventListener('click', () => startMatch());
$('#tutorial-btn').addEventListener('click', () => startMatch(true));
$('#menu-legend').addEventListener('click', toggleLegend);
$('#legend-btn').addEventListener('click', toggleLegend);
$('#again').addEventListener('click', () => startMatch());
$('#to-menu').addEventListener('click', () => exitToMenu());
$('#pm-resume').addEventListener('click', () => setPaused(false));
$('#pm-legend').addEventListener('click', toggleLegend);
$('#pm-restart').addEventListener('click', () => startMatch(currentIsTutorial));
$('#pm-exit').addEventListener('click', () => exitToMenu());

function exitToMenu() {
  tutorial?.finish();
  tutorial = null;
  if (match) platform.gameplayStop();
  match = null;
  paused = false;
  buildDef = null;
  selected = null;
  $('#scout').innerHTML = '';
  $('#toast').style.opacity = '0';
  $('#end').classList.add('hidden');
  $('#pause-menu').classList.add('hidden');
  $('#menu').classList.remove('hidden');
}

// HUD buttons must never keep keyboard focus: otherwise Space/Enter would
// "click" the focused button as well as trigger the hotkey (double pause toggle).
stage.addEventListener('mousedown', (e) => {
  if ((e.target as HTMLElement).closest('button')) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  if (e.key === ' ' || e.key === 'Enter') e.preventDefault();
});

// ---------- input ----------
function toWorld(e: PointerEvent) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * L.W, y: ((e.clientY - r.top) / r.height) * L.H };
}

function tileAt(x: number, y: number) {
  if (!match) return null;
  const g = match.world.grid(match.humanId);
  const col = Math.floor((x - g.x) / L.TILE);
  const row = Math.floor((y - g.y) / L.TILE);
  return col >= 0 && row >= 0 && col < g.cols && row < g.rows ? { col, row } : null;
}

canvas.addEventListener('pointermove', (e) => {
  const p = toWorld(e);
  hover = tileAt(p.x, p.y);
  hoverPos = p;
});
canvas.addEventListener('pointerleave', () => {
  hover = null;
  hoverPos = null;
});
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  cancelAll();
});

function cancelAll() {
  buildDef = null;
  selected = null;
  aiming = null;
  armedCard = null;
  clearPending();
}
$('#cancel-btn').addEventListener('click', cancelAll);
canvas.addEventListener('pointerdown', (e) => {
  if (!match || match.world.winner !== null || e.button !== 0) return;
  const w = match.world;
  const p = toWorld(e);
  const t = tileAt(p.x, p.y);
  if (aiming !== null) {
    if (w.validCardTarget(match.humanId, aiming, p.x, p.y)) {
      if (e.pointerType === 'touch' && !(pendingAim && Math.hypot(pendingAim.x - p.x, pendingAim.y - p.y) < 40)) {
        pendingAim = p; // first tap: preview the circle here
        toast('Tap the same spot again to drop it · ✕ Cancel to stop');
        return;
      }
      w.cast(match.humanId, aiming, p.x, p.y);
      aiming = null;
      clearPending();
    } else {
      const c = getCard(w.players[match.humanId].cards[aiming].id);
      toast(c.target === 'ownBuilding' ? 'Click one of your buildings below rank 3' : 'Aim on your own half of the bridge');
    }
    return;
  }
  if (buildDef && t) {
    const res = w.canPlace(match.humanId, buildDef.id, t.col, t.row);
    if (res.ok && e.pointerType === 'touch' && !(pendingTile && pendingTile.col === t.col && pendingTile.row === t.row)) {
      pendingTile = t; // first tap: show the ghost and range; tap the same tile again to build
      toast(`Tap the same tile again to build ${buildDef.name}`);
      return;
    }
    if (res.ok) {
      pendingTile = null;
      w.place(match.humanId, buildDef.id, t.col, t.row);
      if (!e.shiftKey) buildDef = null; // shift-click to place several
    } else if (res.reason === 'Tile taken') {
      buildDef = null;
      selected = w.buildingAt(match.humanId, t.col, t.row) ?? null;
    } else toast(res.reason!);
    return;
  }
  // select any building under the cursor (yours or not, for info)
  selected = w.buildings.find((b) => Math.abs(b.x - p.x) < L.TILE / 2 && Math.abs(b.y - p.y) < L.TILE / 2) ?? null;
  buildDef = null;
});

window.addEventListener('keydown', (e) => {
  if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
  if (e.key === ' ' || e.key === 'Enter') e.preventDefault();
  if (e.repeat) return;
  if (e.key === 'l' || e.key === 'L') {
    toggleLegend();
    return;
  }
  if (legend.open) {
    if (e.key === 'Escape') legend.hide();
    return;
  }
  if (!match) {
    if (e.key === 'Enter' && !$('#menu').classList.contains('hidden')) startMatch();
    return;
  }
  if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
    setPaused(!paused);
    return;
  }
  if (paused) {
    if (e.key === 'Escape') setPaused(false);
    return;
  }
  const fac = FACTIONS[match.world.players[match.humanId].faction];
  const n = Number(e.key);
  const cardKey = 'qwe'.indexOf(e.key.toLowerCase());
  if (n >= 1 && n <= fac.buildings.length) {
    const d = fac.buildings[n - 1];
    buildDef = buildDef === d ? null : d;
    selected = null;
    aiming = null;
  } else if (cardKey >= 0 && e.key.length === 1) {
    useCard(cardKey);
  } else if (e.key === 'Escape') {
    if (aiming !== null) {
      aiming = null;
      clearPending();
    }
    else if (buildDef || selected) {
      buildDef = null;
      selected = null;
    } else setPaused(true);
  } else if (e.key === 'u' || e.key === 'U') doUpgrade();
  else if (e.key === 'o' || e.key === 'O') doOverclock();
  else if (e.key === 'g' || e.key === 'G') doAbility();
});

// Don't fast-forward after the tab was hidden. (No gameplayStop on focus loss, per CrazyGames rules.)
document.addEventListener('visibilitychange', () => {
  lastFrame = performance.now();
});

// ---------- layout ----------
function touchDevice() {
  const t = platform.deviceType();
  if (t) return t !== 'desktop';
  return lastPointer === 'touch' || window.matchMedia('(pointer: coarse)').matches;
}

function fit() {
  // fit the 16:9 stage inside the safe area (phone notches / home indicator)
  const r = $('#safe').getBoundingClientRect();
  const w = r.width || window.innerWidth;
  const h = r.height || window.innerHeight;
  const s = Math.min(w / L.W, h / L.H);
  stage.style.transform = `translate(${r.left + (w - L.W * s) / 2}px, ${r.top + (h - L.H * s) / 2}px) scale(${s})`;
  renderer.resize(s);
  const touch = touchDevice();
  // bigger HUD when the stage is shrunk (phones, small iframes like 821x462) or on touch screens
  document.body.classList.toggle('compact', s < 0.8 || touch);
  document.body.classList.toggle('touch', touch);
}
window.addEventListener('orientationchange', () => setTimeout(fit, 200));
window.addEventListener('resize', fit);
fit();

// ---------- loop ----------
function frame(nowMs: number) {
  const dt = Math.min(0.1, (nowMs - lastFrame) / 1000);
  lastFrame = nowMs;
  const now = nowMs / 1000;

  if (toastT > 0) {
    toastT -= dt;
    if (toastT <= 0) $('#toast').style.opacity = '0';
  }

  if (match) {
    const w = match.world;
    const portrait = window.matchMedia('(orientation: portrait) and (pointer: coarse)').matches;
    $('#cancel-btn').classList.toggle('hidden', !(buildDef || aiming !== null || selected));
    if (!paused && !portrait && w.winner === null) {
      acc += dt * speed;
      let steps = 0;
      while (acc >= TICK && steps < 40) {
        match.step();
        renderer.ingest(w.events, match.humanId, now);
        for (const ev of w.events)
          if (ev.type === 'card' && ev.owner !== match.humanId) {
            const c = getCard(ev.card);
            toast(`${w.players[ev.owner].name} played ${c.icon} ${c.name}`);
          }
        acc -= TICK;
        steps++;
        if (w.winner !== null) {
          endMatch();
          break;
        }
      }
    }
    if (selected && !selected.alive) selected = null;
    $('#pause-menu').classList.toggle('hidden', !(paused && !legend.open && w.winner === null));
    tutorial?.update(paused ? 0 : dt, { buildDef, legendOpened });
    const highlight = tutorial ? highlightTiles(match, tutorial.gridHighlight) : null;
    if (isTouch()) {
      hover = pendingTile;
      hoverPos = pendingAim;
    }
    let aim = null;
    if (aiming !== null && hoverPos) {
      const c = getCard(w.players[match.humanId].cards[aiming].id);
      aim = { x: hoverPos.x, y: hoverPos.y, r: c.radius ?? 22, valid: w.validCardTarget(match.humanId, aiming, hoverPos.x, hoverPos.y) };
    }
    renderer.draw(w, { humanId: match.humanId, hover, buildDef, selected, highlight, aim }, now);
    hud.update(w, match.humanId, buildDef, selected, speed, paused, aiming);
    scoutT -= dt;
    if (scoutT <= 0) {
      scoutT = 1;
      $('#scout').innerHTML = w.winner === null && !tutorial ? scoutHint(w, match.humanId) : '';
    }
  } else {
    // menu backdrop: bots fighting a 2v2 in the background
    let idle = idleWorld;
    if (idle.world.winner !== null) idle = idleWorld = newIdle();
    idle.step();
    renderer.ingest(idle.world.events, -1, now);
    renderer.draw(idle.world, { humanId: -1, hover: null, buildDef: null, selected: null }, now);
  }
  requestAnimationFrame(frame);
}

const newIdle = () => new Match({ mode: '2v2', playerFaction: 'union', enemyFaction: 'bloomkin', difficulty: 'normal', seed: (Math.random() * 1e9) >>> 0, human: false });
let idleWorld = newIdle();

platform.init().finally(() => {
  // First visit: skip the menu and go straight into the guided tutorial (max 1 click to gameplay).
  if (!tutorialDone()) startMatch(true);
  requestAnimationFrame(frame);
});
