import { DAMAGE } from '../data/damage';
import { FACTIONS } from '../data/factions';
import type { ArmorType, BuildingDef } from '../data/types';
import * as L from '../sim/layout';
import { MAX_RANK, type Building, type World } from '../sim/world';

export type Difficulty = 'easy' | 'normal' | 'hard';

const THINK: Record<Difficulty, number> = { easy: 2.6, normal: 1.4, hard: 0.7 };
/** How much randomness drowns out counter-picking (higher = dumber). */
const NOISE: Record<Difficulty, number> = { easy: 1.2, normal: 0.35, hard: 0.1 };
export const INCOME_MULT: Record<Difficulty, number> = { easy: 0.85, normal: 1, hard: 1.15 };

type Plan = { type: 'build'; def: BuildingDef; since: number } | { type: 'upgrade'; bid: number; since: number };

/**
 * Build-order bot. Deterministic: uses only the world's seeded RNG.
 */
export class Bot {
  private t: number;
  private plan: Plan | null = null;
  /** false = bot does nothing (used by the tutorial) */
  enabled = true;
  /** false = never plays Commander Cards (screenshot autopilot) */
  useCards = true;

  constructor(private w: World, readonly pid: number, readonly difficulty: Difficulty) {
    this.t = THINK[difficulty] * (0.3 + 0.1 * pid);
  }

  update(dt: number) {
    if (!this.enabled) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = THINK[this.difficulty];
    this.think();
  }

  private think() {
    const w = this.w;
    const p = w.players[this.pid];
    const fac = FACTIONS[p.faction];
    const mine = w.buildings.filter((b) => b.owner === p.id);

    if (fac.mechanic === 'overclock') {
      const threat = this.threatLevel() > 2;
      for (const b of mine) {
        if (!w.canOverclock(p.id, b)) continue;
        const want = b.def.kind === 'econ' ? b.hp > b.maxHp * 0.8 : b.hp > b.maxHp * 0.65 && (threat || w.rng.next() < 0.25);
        if (want) w.overclock(p.id, b.id);
      }
    }

    if (fac.mechanic === 'gale' && w.canGale(p.id) && this.threatLevel() >= 6) w.gale(p.id);
    if (this.useCards) this.playCards();

    if (!this.plan) this.plan = this.choose(mine);
    const plan = this.plan;
    if (!plan) return;

    if (plan.type === 'build') {
      if (p.gold >= plan.def.cost) {
        const tile = this.pickTile(plan.def);
        if (tile) w.place(p.id, plan.def.id, tile.col, tile.row);
        this.plan = null;
      } else if (w.time - plan.since > 18) {
        this.plan = null;
      }
    } else {
      const b = mine.find((x) => x.id === plan.bid);
      if (!b || b.rank >= MAX_RANK) this.plan = null;
      else if (w.upgrade(p.id, b.id)) this.plan = null;
      else if (w.time - plan.since > 18) this.plan = null;
    }
  }

  /** Simple, readable rules for when to play each Commander Card. */
  private playCards() {
    const w = this.w;
    const p = w.players[this.pid];
    const myUnits = w.units.filter((u) => u.team === p.team);
    const enemyUnits = w.units.filter((u) => u.team !== p.team);
    for (let i = 0; i < p.cards.length; i++) {
      if (!w.canCast(p.id, i).ok) continue;
      const id = p.cards[i].id;
      const cluster = this.densestEnemy(90);
      const fighting = cluster.n >= 6 && myUnits.length >= 8;
      const core = w.cores[p.team];
      let cast = false;
      switch (id) {
        case 'gearstorm':
        case 'pollen':
        case 'feather_storm':
          if (cluster.n >= 7) cast = w.cast(p.id, i, cluster.x, cluster.y);
          break;
        case 'plating':
        case 'rally':
        case 'lament':
          if (fighting) cast = w.cast(p.id, i);
          break;
        case 'tailwind':
          if (fighting && myUnits.filter((u) => u.flying).length >= 5) cast = w.cast(p.id, i);
          break;
        case 'heart_pulse':
          if (core.hp < core.maxHp * 0.55) cast = w.cast(p.id, i);
          break;
        case 'double_shift':
          if (w.buildings.filter((b) => b.owner === p.id && b.def.kind === 'barracks').length >= 4) cast = w.cast(p.id, i);
          break;
        case 'overgrowth': {
          const b = w.buildings
            .filter((x) => x.owner === p.id && x.rank < MAX_RANK && x.def.kind === 'barracks')
            .sort((a, b2) => b2.def.tier - a.def.tier)[0];
          if (b && w.time > 150) cast = w.cast(p.id, i, b.x, b.y);
          break;
        }
        case 'seedfall':
          if (this.threatLevel() >= 8) {
            const g = w.grid(p.id);
            cast = w.cast(p.id, i, g.x + g.w / 2, L.LANE_Y);
          }
          break;
        case 'second_gale':
          if (p.abilityCd > 20 && this.threatLevel() >= 6) cast = w.cast(p.id, i);
          break;
        case 'funeral_bell': {
          const towers = w.buildings.filter((b) => b.team !== p.team && b.def.tower);
          const pushing = myUnits.filter((u) => towers.some((t) => Math.hypot(t.x - u.x, t.y - u.y) < 200)).length;
          if (pushing >= 8) cast = w.cast(p.id, i);
          break;
        }
        case 'soul_harvest':
          if (enemyUnits.length >= 20) cast = w.cast(p.id, i);
          break;
      }
      if (cast) return; // one card per think
    }
  }

  /** Enemy unit with the most other enemies within r (a good place to drop an area card). */
  private densestEnemy(r: number) {
    const team = this.w.players[this.pid].team;
    const es = this.w.units.filter((u) => u.team !== team);
    let best = { x: 0, y: 0, n: 0 };
    for (const a of es) {
      let n = 0;
      for (const b of es) if (Math.abs(a.x - b.x) < r && Math.hypot(a.x - b.x, a.y - b.y) < r) n++;
      if (n > best.n) best = { x: a.x, y: a.y, n };
    }
    return best;
  }

  private threatLevel() {
    const g = this.w.grid(this.pid);
    const cx = g.x + g.w / 2;
    const team = this.w.players[this.pid].team;
    let n = 0;
    for (const u of this.w.units) if (u.team !== team && Math.abs(u.x - cx) < 260) n += u.radius >= 13 ? 3 : 1;
    return n;
  }

  private choose(mine: Building[]): Plan | null {
    const w = this.w;
    const p = w.players[this.pid];
    const fac = FACTIONS[p.faction];
    const now = w.time;
    const free = w.freeTiles(p.id).length;
    const avail = fac.buildings.filter((d) => w.tierUnlocked(d.tier));
    const count = (k: string) => mine.filter((b) => b.def.kind === k).length;
    const towers = count('tower');
    const econ = count('econ');
    const barracks = count('barracks');

    const upgradable = mine.filter((b) => b.rank < MAX_RANK).sort((a, b) => w.upgradeCost(a) - w.upgradeCost(b));
    if (free === 0) return upgradable[0] ? { type: 'upgrade', bid: upgradable[0].id, since: now } : null;

    const best = (kind: string) => {
      const opts = avail.filter((d) => d.kind === kind);
      return opts.length ? opts.reduce((a, b) => (b.tier > a.tier ? b : a)) : null;
    };

    const threat = this.threatLevel();
    const towerWant = 1 + Math.floor(now / 150);
    if (towers < towerWant && (threat > 4 || (barracks >= 3 && towers === 0))) {
      const t = best('tower');
      if (t) return { type: 'build', def: t, since: now };
    }

    const econWant = now > 220 ? 2 : 1;
    if (econ < econWant && barracks >= 2) {
      const e = best('econ');
      if (e) return { type: 'build', def: e, since: now };
    }

    if (upgradable.length && p.gold > 380 && w.rng.next() < 0.4) {
      // Prefer upgrading the strongest barracks.
      const pick = upgradable.filter((b) => b.def.kind === 'barracks').sort((a, b) => b.def.tier - a.def.tier)[0] ?? upgradable[0];
      return { type: 'upgrade', bid: pick.id, since: now };
    }

    const armor = this.enemyArmorMix();
    const options = avail.filter((d) => d.kind === 'barracks' && d.spawn);
    let pick: BuildingDef | null = null;
    let bestScore = -Infinity;
    for (const d of options) {
      const atk = d.spawn!.unit.attack;
      let counter = 1;
      if (armor.total > 0) {
        counter = 0;
        for (const [a, n] of Object.entries(armor.mix) as [ArmorType, number][]) counter += (DAMAGE[atk][a] * n) / armor.total;
      }
      const same = mine.filter((b) => b.def.id === d.id).length;
      // healers are support: only worth it once there's an army to heal
      const support = d.spawn!.unit.heal ? (barracks < 3 ? -3 : -0.4 - same * 0.5) : 0;
      const score = support + counter * 1.5 + d.tier * 0.35 - same * 0.18 + w.rng.next() * NOISE[this.difficulty] * 2;
      if (score > bestScore) {
        bestScore = score;
        pick = d;
      }
    }
    return pick ? { type: 'build', def: pick, since: now } : null;
  }

  /** What armor the enemy is fielding (live units + what their barracks will make). */
  private enemyArmorMix() {
    const team = this.w.players[this.pid].team;
    const mix: Partial<Record<ArmorType, number>> = {};
    let total = 0;
    const add = (a: ArmorType, n: number) => {
      mix[a] = (mix[a] ?? 0) + n;
      total += n;
    };
    for (const u of this.w.units) if (u.team !== team) add(u.armor, u.radius >= 13 ? 3 : 1);
    for (const b of this.w.buildings) if (b.team !== team && b.def.spawn) add(b.def.spawn.unit.armor, 2 * (b.def.spawn.count ?? 1));
    return { mix, total };
  }

  private pickTile(def: BuildingDef) {
    const w = this.w;
    const p = w.players[this.pid];
    const g = w.grid(p.id);
    const tiles = w.freeTiles(p.id);
    let best: { col: number; row: number } | null = null;
    let bestScore = -Infinity;
    for (const t of tiles) {
      const c = L.tileCenter(g, t.col, t.row);
      const laneDist = Math.abs(c.y - L.LANE_Y) / g.h; // ~0.3 .. 1
      const front = (p.team === 0 ? c.x - g.x : g.x + g.w - c.x) / g.w; // 0 back .. 1 front
      let s: number;
      if (def.kind === 'tower') s = -laneDist * 2 + front * 0.6;
      else if (def.kind === 'econ') s = laneDist * 2 - front;
      else s = laneDist - front * 0.4;
      s += w.rng.next() * 0.05;
      if (s > bestScore) {
        bestScore = s;
        best = t;
      }
    }
    return best;
  }
}
