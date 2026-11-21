import { cap } from '../data/damage';
import { FACTIONS } from '../data/factions';
import type { BuildingDef, FactionId } from '../data/types';
import type { Match } from '../game/match';
import * as L from '../sim/layout';
import { armChip, countersFor } from './legend';

export const TUTORIAL_KEY = 'bannerfall.tutorialDone';

export function tutorialDone(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return false;
  }
}

function markDone() {
  try {
    localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    /* storage blocked: tutorial just shows again next time */
  }
}

export type GridHighlight = 'grid' | 'front' | null;

export interface TutorialInput {
  buildDef: BuildingDef | null;
  legendOpened: boolean;
}

interface Step {
  text: string;
  /** CSS selector of a HUD element to pulse */
  glow?: string;
  grid?: GridHighlight;
  /** shows a "Got it" button; step also advances when it's clicked */
  button?: string;
  enter?: () => void;
  done?: (inp: TutorialInput) => boolean;
  /** auto-advance after this many real seconds */
  auto?: number;
}

/**
 * First-match guided tutorial. Polls game state each frame; no sim changes needed
 * beyond holding the enemy bot back until the player has learned the basics.
 */
export class Tutorial {
  active = true;
  private i = -1;
  private t = 0;
  private steps: Step[];
  private box: HTMLElement;
  private glowEl: Element | null = null;

  constructor(private m: Match, root: HTMLElement, private onFinish: () => void) {
    const w = m.world;
    const me = w.players[m.humanId];
    const fac = FACTIONS[me.faction];
    const enemyPid = w.players.findIndex((p) => p.team !== me.team);
    const enemyFaction: FactionId = w.players[enemyPid].faction;
    const enemyLead = FACTIONS[enemyFaction].buildings[0];
    const enemyUnit = enemyLead.spawn!.unit;
    const melee = fac.buildings[0];
    const tower = fac.buildings.find((b) => b.kind === 'tower' && b.tier === 1)!;
    const counter = countersFor(me.faction, enemyUnit.armor, false).find((d) => d.tier === 1 && d.kind === 'barracks') ?? fac.buildings[1];
    const counterIdx = fac.buildings.indexOf(counter) + 1;
    const mine = (id?: string) => w.buildings.filter((b) => b.owner === me.id && (!id || b.def.id === id));
    const btn = (idx: number) => `#build-buttons .bbtn:nth-child(${idx})`;
    const topUp = (g: number) => {
      if (me.gold < g) me.gold = g;
    };
    for (const b of m.bots) b.enabled = false;

    this.steps = [
      {
        text: `<b>Welcome to the Shardlands!</b> You never control units directly — you build, and your armies fight on their own.<br>Your build grid is highlighted top-left. Press <b>1</b> or click <b>${melee.name}</b>.`,
        glow: btn(1),
        grid: 'grid',
        done: (inp) => inp.buildDef?.id === melee.id || mine(melee.id).length > 0,
      },
      {
        text: `Now click any tile on your highlighted grid to build the <b>${melee.name}</b>.`,
        grid: 'grid',
        enter: () => topUp(melee.cost),
        done: () => mine(melee.id).length > 0,
      },
      {
        text: `Barracks spawn units on a timer (the white bar under the building). Watch your <b>${melee.spawn!.unit.name}s</b> march across the bridge.`,
        done: () => w.units.some((u) => u.owner === me.id) && this.t > 4,
        auto: 14,
      },
      {
        text: `The enemy just built a <b>${enemyLead.name}</b>. It sends <b>${enemyUnit.name}s</b> with ${armChip(enemyUnit.armor)} armor.<br><b>${counter.name}</b> units deal extra damage to ${cap(enemyUnit.armor)} — press <b>${counterIdx}</b> and build one.`,
        glow: btn(counterIdx),
        grid: 'grid',
        enter: () => {
          const ep = w.players[enemyPid];
          ep.gold = Math.max(ep.gold, enemyLead.cost);
          const g = w.grid(enemyPid);
          w.place(enemyPid, enemyLead.id, 0, g.rows - 2);
          topUp(counter.cost);
        },
        done: () => mine(counter.id).length > 0,
      },
      {
        text: `Towers defend your half of the bridge. Build a <b>${tower.name}</b> (press <b>${fac.buildings.indexOf(tower) + 1}</b>) on the row closest to the bridge, so it's in range.`,
        glow: btn(fac.buildings.indexOf(tower) + 1),
        grid: 'front',
        enter: () => topUp(tower.cost),
        done: () => mine(tower.id).length > 0,
      },
      {
        text: `Upgrades make a building's units stronger. <b>Click one of your buildings</b>, then press <b>U</b> or the Upgrade button.`,
        glow: '#sel-panel',
        enter: () => topUp(120),
        done: () => mine().some((b) => b.rank >= 2),
      },
      fac.mechanic === 'gale'
        ? {
            text: `Aerie special — <b>Gale</b>: press <b>G</b> (or the 🌬 Gale button, bottom-left) to blow every enemy ground unit back down the bridge and slow it. Recharges in 60 s.`,
            glow: '#ability-btn',
            enter: () => (me.abilityCd = 0),
            done: () => me.abilityCd > 0,
          }
        : fac.mechanic === 'echo'
        ? {
            text: `Choir special — <b>Echo</b>: when one of your units falls, it sometimes rises again as a see-through Echo for 15 s. Revenants always return once. Enemies get no gold for killing Echoes.`,
            button: 'Got it',
          }
        : fac.mechanic === 'overclock'
        ? {
            text: `Union special — <b>Overclock</b>: select a barracks and press <b>O</b>. It spawns twice as fast for 20 s, but costs 25% of its HP.`,
            glow: '#sel-panel',
            done: () => mine().some((b) => b.ocT > 0),
          }
        : {
            text: `Bloomkin special — <b>Bloom</b>: the little green ring on each building fills up. When it's full, the building upgrades itself for free. Protect your buildings and they keep growing!`,
            button: 'Got it',
          },
      {
        text: `Not sure what beats what? Press <b>L</b> (or the 📖 button) for the unit legend. Once the match is on, a <b>Scout</b> line top-left also tells you what to build against the enemy's army.`,
        glow: '#legend-btn',
        button: 'Got it',
        done: (inp) => inp.legendOpened,
      },
      {
        text: `You're ready! The enemy is now building for real. Tier 2 unlocks at <b>1:30</b>, Tier 3 at <b>4:00</b>.<br><b>Destroy the enemy Heartstone</b> (far right) to win.`,
        button: "Let's fight",
        enter: () => this.releaseBots(),
      },
    ];

    this.box = document.createElement('div');
    this.box.id = 'tutorial';
    this.box.innerHTML = `<div class="tut-step"></div><div class="tut-text"></div>
      <div class="tut-actions"><button class="tut-next"></button><button class="tut-skip">Skip tutorial</button></div>`;
    root.appendChild(this.box);
    this.box.querySelector('.tut-next')!.addEventListener('click', () => this.advance());
    this.box.querySelector('.tut-skip')!.addEventListener('click', () => this.finish());
    this.advance();
  }

  get gridHighlight(): GridHighlight {
    return this.active ? this.steps[this.i]?.grid ?? null : null;
  }

  update(dt: number, inp: TutorialInput) {
    if (!this.active) return;
    this.t += dt;
    const s = this.steps[this.i];
    if ((s.done && s.done(inp)) || (s.auto && this.t >= s.auto)) this.advance();
  }

  private advance() {
    this.i++;
    this.t = 0;
    if (this.i >= this.steps.length) {
      this.finish();
      return;
    }
    const s = this.steps[this.i];
    s.enter?.();
    this.box.querySelector('.tut-step')!.textContent = `Tutorial · step ${this.i + 1} of ${this.steps.length}`;
    this.box.querySelector('.tut-text')!.innerHTML = s.text;
    const next = this.box.querySelector<HTMLButtonElement>('.tut-next')!;
    next.style.display = s.button ? '' : 'none';
    next.textContent = s.button ?? '';
    this.setGlow(s.glow ? document.querySelector(s.glow) : null);
  }

  private setGlow(el: Element | null) {
    this.glowEl?.classList.remove('tut-glow');
    this.glowEl = el;
    el?.classList.add('tut-glow');
  }

  /** Let the bots play. Cap their banked gold so they don't dump a huge wave at once. */
  private releaseBots() {
    const w = this.m.world;
    for (const b of this.m.bots) {
      if (b.enabled) continue;
      b.enabled = true;
      w.players[b.pid].gold = Math.min(w.players[b.pid].gold, 200);
    }
  }

  finish() {
    if (!this.active) return;
    this.active = false;
    this.releaseBots();
    this.setGlow(null);
    this.box.remove();
    markDone();
    this.onFinish();
  }
}

/** Tiles to outline for the current tutorial step. */
export function highlightTiles(m: Match, mode: GridHighlight): { x: number; y: number; w: number; h: number } | null {
  if (!mode) return null;
  const p = m.world.players[m.humanId];
  const g = L.gridRect(p.team, p.slot);
  if (mode === 'grid') return { x: g.x, y: g.y, w: g.w, h: g.h };
  const row = p.slot === 0 ? g.rows - 1 : 0;
  return { x: g.x, y: g.y + row * L.TILE, w: g.w, h: L.TILE };
}
