import './style.css';
import type { Difficulty } from './ai/bot';
import type { BuildingDef, FactionId } from './data/types';
import { FACTIONS } from './data/factions';
import { Match, type MatchSetup, type Mode } from './game/match';
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
const choice = { faction: 'union' as FactionId, enemy: 'other', mode: '1v1' as Mode, difficulty: 'normal' as Difficulty };
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
});

// ---------- game state ----------
let match: Match | null = null;
let buildDef: BuildingDef | null = null;
let selected: Building | null = null;
let hover: { col: number; row: number } | null = null;
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
    legend.show(match.world.players[match.humanId].faction);
  } else legend.show(choice.faction);
}

const hud = new Hud(stage, {
  selectBuild: (d) => {
    buildDef = buildDef === d ? null : d;
    selected = null;
  },
  upgrade: () => doUpgrade(),
  overclock: () => doOverclock(),
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
  const enemy: FactionId = choice.enemy === 'other' ? (choice.faction === 'union' ? 'bloomkin' : 'union') : (choice.enemy as FactionId);
  const setup: MatchSetup = {
    mode: asTutorial ? '1v1' : choice.mode, playerFaction: choice.faction, enemyFaction: asTutorial ? (choice.faction === 'union' ? 'bloomkin' : 'union') : enemy,
    difficulty: asTutorial ? 'easy' : choice.difficulty,
    seed: (Date.now() ^ (matchCount * 2654435761)) >>> 0, human: true,
  };
  matchCount++;
  currentIsTutorial = asTutorial;
  match = new Match(setup);
  buildDef = null;
  selected = null;
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
});
canvas.addEventListener('pointerleave', () => (hover = null));
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  buildDef = null;
  selected = null;
});
canvas.addEventListener('pointerdown', (e) => {
  if (!match || match.world.winner !== null || e.button !== 0) return;
  const w = match.world;
  const p = toWorld(e);
  const t = tileAt(p.x, p.y);
  if (buildDef && t) {
    const res = w.canPlace(match.humanId, buildDef.id, t.col, t.row);
    if (res.ok) {
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
  if (n >= 1 && n <= fac.buildings.length) {
    const d = fac.buildings[n - 1];
    buildDef = buildDef === d ? null : d;
    selected = null;
  } else if (e.key === 'Escape') {
    if (buildDef || selected) {
      buildDef = null;
      selected = null;
    } else setPaused(true);
  } else if (e.key === 'u' || e.key === 'U') doUpgrade();
  else if (e.key === 'o' || e.key === 'O') doOverclock();
});

// Don't fast-forward after the tab was hidden. (No gameplayStop on focus loss, per CrazyGames rules.)
document.addEventListener('visibilitychange', () => {
  lastFrame = performance.now();
});

// ---------- layout ----------
function fit() {
  const s = Math.min(window.innerWidth / L.W, window.innerHeight / L.H);
  stage.style.transform = `translate(${(window.innerWidth - L.W * s) / 2}px, ${(window.innerHeight - L.H * s) / 2}px) scale(${s})`;
  renderer.resize(s);
}
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
    if (!paused && w.winner === null) {
      acc += dt * speed;
      let steps = 0;
      while (acc >= TICK && steps < 40) {
        match.step();
        renderer.ingest(w.events, match.humanId, now);
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
    renderer.draw(w, { humanId: match.humanId, hover, buildDef, selected, highlight }, now);
    hud.update(w, match.humanId, buildDef, selected, speed, paused);
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
