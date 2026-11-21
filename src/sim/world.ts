import { DAMAGE } from '../data/damage';
import { FACTIONS, getBuildingDef } from '../data/factions';
import type { ArmorType, AttackType, BuildingDef, FactionId, TowerDef, UnitDef } from '../data/types';
import * as L from './layout';
import { Rng } from './rng';

/** Fixed simulation step: 20 ticks per second, independent of display refresh rate. */
export const TICK = 1 / 20;
export const TIER_TIMES: Record<number, number> = { 1: 0, 2: 90, 3: 240 };
export const INCOME_INTERVAL = 2;
export const BASE_INCOME = 6;
export const START_GOLD = 160;
export const MAX_RANK = 3;
export const BLOOM_TIME = 95;
export const OVERCLOCK_TIME = 20;
export const OVERCLOCK_COOLDOWN = 45;
export const CORE_HP = 10000;
/** Buildings are sturdy so one lost fight doesn't wipe a whole grid. */
export const BUILDING_HP_MULT = 2;
const AGGRO = 150;
const UNIT_CAP_PER_PLAYER = 55;
/** After this many seconds, all damage ramps up +15% per minute so stalemates end. */
export const OVERTIME_AT = 12 * 60;
const CORE_TOWER: TowerDef = { dmg: 32, cooldown: 0.8, range: 210, attack: 'normal', hitsAir: true, splash: 30 };

export const rankMult = (r: number) => 1 + 0.3 * (r - 1);

export interface Entity {
  id: number;
  kind: 'unit' | 'building' | 'core';
  team: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  armor: ArmorType;
  flying: boolean;
  alive: boolean;
}

export interface Unit extends Entity {
  kind: 'unit';
  owner: number;
  def: UnitDef;
  mult: number;
  cd: number;
  target: Entity | null;
  retarget: number;
  slowT: number;
  slowPct: number;
  rootT: number;
  lastHurt: number;
  abilityT: number;
}

export interface Building extends Entity {
  kind: 'building';
  owner: number;
  def: BuildingDef;
  col: number;
  row: number;
  rank: number;
  spawnT: number;
  cd: number;
  bloomT: number;
  ocT: number;
  ocCd: number;
  age: number;
  target: Entity | null;
  ramp: number;
}

export interface Core extends Entity {
  kind: 'core';
  cd: number;
  target: Entity | null;
}

export interface PlayerState {
  id: number;
  team: number;
  slot: number;
  faction: FactionId;
  gold: number;
  isHuman: boolean;
  incomeMult: number;
  name: string;
  kills: number;
  built: number;
}

export interface PlayerConfig {
  team: number;
  slot: number;
  faction: FactionId;
  isHuman: boolean;
  name: string;
  incomeMult?: number;
}

export interface MatchConfig {
  seed: number;
  players: PlayerConfig[];
}

export type SimEvent =
  | { type: 'shot'; x1: number; y1: number; x2: number; y2: number; attack: AttackType }
  | { type: 'splash'; x: number; y: number; r: number }
  | { type: 'death'; x: number; y: number; team: number; big: boolean }
  | { type: 'bounty'; x: number; y: number; amount: number; owner: number }
  | { type: 'root'; x: number; y: number; r: number }
  | { type: 'rank'; x: number; y: number; owner: number; bloom: boolean };

interface AttackOpts {
  splash?: number;
  chain?: number;
  hitsAir: boolean;
  hitsGround: boolean;
  slow?: { pct: number; dur: number };
}

export class World {
  time = 0;
  tick = 0;
  rng: Rng;
  players: PlayerState[];
  units: Unit[] = [];
  buildings: Building[] = [];
  cores: Core[];
  events: SimEvent[] = [];
  winner: number | null = null;
  private nextId = 1;
  private teamCap = [0, 0];
  private incomeT = 0;

  constructor(cfg: MatchConfig) {
    this.rng = new Rng(cfg.seed);
    this.players = cfg.players.map((p, i) => ({
      id: i, team: p.team, slot: p.slot, faction: p.faction, gold: START_GOLD, isHuman: p.isHuman,
      incomeMult: p.incomeMult ?? 1, name: p.name, kills: 0, built: 0,
    }));
    this.cores = [0, 1].map((team) => ({
      id: this.nextId++, kind: 'core' as const, team, x: L.CORE_X[team], y: L.LANE_Y,
      hp: CORE_HP, maxHp: CORE_HP, radius: L.CORE_R, armor: 'fortified' as const, flying: false, alive: true, cd: 0, target: null,
    }));
  }

  // ---------------- queries ----------------

  grid(pid: number) {
    const p = this.players[pid];
    return L.gridRect(p.team, p.slot);
  }

  tierUnlocked(tier: number) {
    return this.time >= TIER_TIMES[tier];
  }

  buildingAt(pid: number, col: number, row: number) {
    return this.buildings.find((b) => b.owner === pid && b.col === col && b.row === row);
  }

  freeTiles(pid: number) {
    const g = this.grid(pid);
    const out: { col: number; row: number }[] = [];
    for (let row = 0; row < g.rows; row++)
      for (let col = 0; col < g.cols; col++) if (!this.buildingAt(pid, col, row)) out.push({ col, row });
    return out;
  }

  income(pid: number) {
    const p = this.players[pid];
    let inc = BASE_INCOME;
    for (const b of this.buildings) {
      if (b.owner !== pid || b.def.kind !== 'econ') continue;
      let v = (b.def.income ?? 0) * rankMult(b.rank);
      if (b.def.incomeGrowth) v += Math.min(Math.floor(b.age / 60) * b.def.incomeGrowth.perMin, b.def.incomeGrowth.max);
      if (b.ocT > 0) v *= 2;
      inc += v;
    }
    return Math.round(inc * p.incomeMult * this.comebackMult(p.team));
  }

  /** Losing team (core HP 20+ points behind) earns +40% income. */
  comebackMult(team: number) {
    const mine = this.cores[team].hp / this.cores[team].maxHp;
    const theirs = this.cores[1 - team].hp / this.cores[1 - team].maxHp;
    return theirs - mine >= 0.2 ? 1.4 : 1;
  }

  upgradeCost(b: Building) {
    return Math.round(b.def.cost * 0.6 * b.rank);
  }

  overtimeMult() {
    return this.time > OVERTIME_AT ? 1 + (0.15 * (this.time - OVERTIME_AT)) / 60 : 1;
  }

  canPlace(pid: number, defId: string, col: number, row: number): { ok: boolean; reason?: string } {
    const p = this.players[pid];
    const def = getBuildingDef(p.faction, defId);
    if (!def) return { ok: false, reason: 'Unknown building' };
    if (!this.tierUnlocked(def.tier)) return { ok: false, reason: `Tier ${def.tier} locked` };
    if (p.gold < def.cost) return { ok: false, reason: 'Not enough gold' };
    const g = this.grid(pid);
    if (col < 0 || row < 0 || col >= g.cols || row >= g.rows) return { ok: false, reason: 'Outside your grid' };
    if (this.buildingAt(pid, col, row)) return { ok: false, reason: 'Tile taken' };
    return { ok: true };
  }

  canUpgrade(pid: number, b: Building) {
    return b.owner === pid && b.alive && b.rank < MAX_RANK && this.players[pid].gold >= this.upgradeCost(b);
  }

  canOverclock(pid: number, b: Building) {
    const p = this.players[pid];
    return b.owner === pid && b.alive && FACTIONS[p.faction].mechanic === 'overclock' && b.def.kind !== 'tower' && b.ocCd <= 0;
  }

  // ---------------- commands ----------------

  place(pid: number, defId: string, col: number, row: number): boolean {
    if (!this.canPlace(pid, defId, col, row).ok) return false;
    const p = this.players[pid];
    const def = getBuildingDef(p.faction, defId)!;
    const c = L.tileCenter(this.grid(pid), col, row);
    p.gold -= def.cost;
    p.built++;
    this.buildings.push({
      id: this.nextId++, kind: 'building', team: p.team, owner: pid, def, col, row, x: c.x, y: c.y,
      hp: def.hp * BUILDING_HP_MULT, maxHp: def.hp * BUILDING_HP_MULT, radius: L.BUILDING_R, armor: 'fortified', flying: false, alive: true,
      rank: 1, spawnT: def.spawn ? def.spawn.interval * 0.5 : 0, cd: 0, bloomT: 0, ocT: 0, ocCd: 0, age: 0, target: null, ramp: 0,
    });
    return true;
  }

  upgrade(pid: number, bid: number): boolean {
    const b = this.buildings.find((x) => x.id === bid);
    if (!b || !this.canUpgrade(pid, b)) return false;
    this.players[pid].gold -= this.upgradeCost(b);
    this.rankUp(b, false);
    return true;
  }

  overclock(pid: number, bid: number): boolean {
    const b = this.buildings.find((x) => x.id === bid);
    if (!b || !this.canOverclock(pid, b)) return false;
    b.ocT = OVERCLOCK_TIME;
    b.ocCd = OVERCLOCK_COOLDOWN;
    b.hp = Math.max(1, b.hp - b.maxHp * 0.25);
    return true;
  }

  private rankUp(b: Building, bloom: boolean) {
    const old = b.maxHp;
    b.rank++;
    b.bloomT = 0;
    b.maxHp = b.def.hp * BUILDING_HP_MULT * rankMult(b.rank);
    b.hp += b.maxHp - old;
    this.events.push({ type: 'rank', x: b.x, y: b.y, owner: b.owner, bloom });
  }

  // ---------------- simulation ----------------

  step() {
    if (this.winner !== null) return;
    const dt = TICK;
    this.events = [];
    this.time += dt;
    this.tick++;

    this.incomeT += dt;
    if (this.incomeT >= INCOME_INTERVAL) {
      this.incomeT -= INCOME_INTERVAL;
      for (const p of this.players) p.gold += this.income(p.id);
    }

    const teamCount = [0, 0];
    this.teamCap = [0, 1].map((t) => UNIT_CAP_PER_PLAYER * this.players.filter((p) => p.team === t).length);
    for (const u of this.units) teamCount[u.team]++;

    for (const b of this.buildings) this.updateBuilding(b, dt, teamCount);
    for (const c of this.cores) this.updateTower(c, CORE_TOWER, c.team, -1, 1, dt);
    for (const u of this.units) if (u.alive) this.updateUnit(u, dt);
    this.separate();

    this.units = this.units.filter((u) => u.alive);
    this.buildings = this.buildings.filter((b) => b.alive);
    for (const c of this.cores) if (c.hp <= 0 && this.winner === null) this.winner = 1 - c.team;
  }

  private updateBuilding(b: Building, dt: number, teamCount: number[]) {
    if (!b.alive) return;
    b.age += dt;
    if (b.ocT > 0) b.ocT -= dt;
    if (b.ocCd > 0) b.ocCd -= dt;
    const fac = FACTIONS[this.players[b.owner].faction];
    if (fac.mechanic === 'bloom' && b.rank < MAX_RANK) {
      b.bloomT += dt;
      if (b.bloomT >= BLOOM_TIME) this.rankUp(b, true);
    }
    const sp = b.def.spawn;
    if (sp) {
      b.spawnT -= dt * (b.ocT > 0 ? 2 : 1);
      if (b.spawnT <= 0) {
        b.spawnT += sp.interval;
        const n = sp.count ?? 1;
        for (let i = 0; i < n && teamCount[b.team] < this.teamCap[b.team]; i++) {
          this.spawnUnit(b, sp.unit);
          teamCount[b.team]++;
        }
      }
    }
    if (b.def.tower) this.updateTower(b, b.def.tower, b.team, b.owner, rankMult(b.rank), dt);
  }

  private spawnUnit(b: Building, def: UnitDef) {
    const m = rankMult(b.rank);
    const hp = def.hp * m;
    this.units.push({
      id: this.nextId++, kind: 'unit', team: b.team, owner: b.owner, def,
      x: b.x + this.rng.range(-8, 8), y: b.y + this.rng.range(-8, 8),
      hp, maxHp: hp, radius: def.size, armor: def.armor, flying: !!def.flying, alive: true,
      mult: m, cd: 0, target: null, retarget: 0, slowT: 0, slowPct: 0, rootT: 0, lastHurt: -99,
      abilityT: def.root ? def.root.every * 0.5 : 0,
    });
  }

  private updateTower(t: Building | Core, tw: TowerDef, team: number, owner: number, mult: number, dt: number) {
    if (!t.alive) return;
    t.cd -= dt;
    if (t.cd > 0) return;
    const prev = t.target;
    const keep = prev && prev.alive && this.inRange(t, prev, tw.range, tw.minRange ?? 0);
    const target = keep ? prev : this.findTarget(team, t.x, t.y, tw.range, tw.hitsAir, true, tw.minRange ?? 0, false);
    if (!target) {
      t.target = null;
      return;
    }
    let dmg = tw.dmg * mult;
    if (t.kind === 'building' && tw.ramp) {
      t.ramp = target === prev ? t.ramp + 1 : 0;
      dmg += Math.min(t.ramp * tw.ramp.perHit, tw.ramp.max);
    }
    t.target = target;
    t.cd = tw.cooldown;
    this.attack(team, owner, t.x, t.y, target, dmg, tw.attack, {
      splash: tw.splash, hitsAir: tw.hitsAir, hitsGround: true, slow: tw.slow,
    });
  }

  private updateUnit(u: Unit, dt: number) {
    const d = u.def;
    u.cd -= dt;
    if (u.slowT > 0) u.slowT -= dt;
    if (u.rootT > 0) u.rootT -= dt;
    if (d.regen && this.time - u.lastHurt > 3) u.hp = Math.min(u.maxHp, u.hp + d.regen * u.mult * dt);

    if (d.root) {
      u.abilityT -= dt;
      if (u.abilityT <= 0) {
        const victims = this.units.filter((e) => e.alive && e.team !== u.team && !e.flying && dist(u, e) <= d.root!.radius);
        if (victims.length > 0) {
          for (const v of victims) v.rootT = d.root.duration;
          u.abilityT = d.root.every;
          this.events.push({ type: 'root', x: u.x, y: u.y, r: d.root.radius });
        }
      }
    }

    u.retarget -= dt;
    if (!u.target || !u.target.alive || u.retarget <= 0) {
      u.target = this.findTarget(u.team, u.x, u.y, AGGRO + d.range, !!d.hitsAir, d.hitsGround ?? true, 0, !!d.preferRanged);
      u.retarget = 0.3;
    }

    const speed = u.rootT > 0 ? 0 : d.speed * (u.slowT > 0 ? 1 - u.slowPct : 1);
    const step = speed * dt;
    const t = u.target;
    if (t) {
      const gap = dist(u, t) - t.radius - u.radius;
      if (gap <= d.range) {
        if (u.cd <= 0) {
          u.cd = d.cooldown;
          this.attack(u.team, u.owner, u.x, u.y, t, d.dmg * u.mult, d.attack, {
            splash: d.splash, chain: d.chain, hitsAir: !!d.hitsAir, hitsGround: d.hitsGround ?? true,
          });
        }
      } else {
        moveToward(u, t.x, t.y, Math.min(step, gap - d.range + 0.5));
      }
      return;
    }

    // No target: march along the lane toward the enemy core.
    const core = this.cores[1 - u.team];
    const dir = u.team === 0 ? 1 : -1;
    const band = L.LANE_HALF - u.radius;
    if (!u.flying && Math.abs(u.y - L.LANE_Y) > band) {
      moveToward(u, u.x + dir * 12, L.LANE_Y, step);
    } else {
      moveToward(u, core.x, u.flying ? core.y : u.y + (L.LANE_Y - u.y) * 0.03, step);
    }
  }

  private separate() {
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j];
        if (!b.alive || a.flying !== b.flying) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = (min - d) * 0.5;
        const nx = d2 === 0 ? (i % 2 ? 1 : -1) : dx / d;
        const ny = d2 === 0 ? 0 : dy / d;
        const wa = a.rootT > 0 ? 0 : 1;
        const wb = b.rootT > 0 ? 0 : 1;
        a.x -= nx * push * wa;
        a.y -= ny * push * wa;
        b.x += nx * push * wb;
        b.y += ny * push * wb;
      }
    }
  }

  private inRange(from: { x: number; y: number }, t: Entity, range: number, minRange: number) {
    const d = dist(from, t) - t.radius;
    return d <= range && d >= minRange;
  }

  private eligible(e: Entity, hitsAir: boolean, hitsGround: boolean) {
    return e.alive && (e.flying ? hitsAir : hitsGround);
  }

  private *enemies(team: number): Iterable<Entity> {
    for (const u of this.units) if (u.team !== team) yield u;
    for (const b of this.buildings) if (b.team !== team) yield b;
    const c = this.cores[1 - team];
    yield c;
  }

  findTarget(team: number, x: number, y: number, range: number, hitsAir: boolean, hitsGround: boolean, minRange: number, preferRanged: boolean): Entity | null {
    let best: Entity | null = null;
    let bestScore = Infinity;
    for (const e of this.enemies(team)) {
      if (!this.eligible(e, hitsAir, hitsGround)) continue;
      const d = Math.hypot(e.x - x, e.y - y) - e.radius;
      if (d > range || d < minRange) continue;
      let score = d;
      if (e.kind !== 'unit') score += 40; // units engage units first
      if (preferRanged && e.kind === 'unit' && (e as Unit).def.range > 60) score *= 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  private attack(team: number, owner: number, x: number, y: number, target: Entity, dmg: number, attack: AttackType, o: AttackOpts) {
    this.events.push({ type: 'shot', x1: x, y1: y, x2: target.x, y2: target.y, attack });
    this.hurt(target, dmg, attack, owner);
    if (o.slow && target.kind === 'unit') {
      const u = target as Unit;
      u.slowT = o.slow.dur;
      u.slowPct = o.slow.pct;
    }
    if (o.splash) {
      this.events.push({ type: 'splash', x: target.x, y: target.y, r: o.splash });
      for (const e of this.enemies(team)) {
        if (e === target || !this.eligible(e, o.hitsAir, o.hitsGround)) continue;
        if (dist(e, target) - e.radius <= o.splash) this.hurt(e, dmg * 0.6, attack, owner);
      }
    }
    if (o.chain && o.chain > 1) {
      const hit = new Set<Entity>([target]);
      let last: Entity = target;
      for (let i = 1; i < o.chain; i++) {
        let next: Entity | null = null;
        let nd = 80;
        for (const u of this.units) {
          if (u.team === team || hit.has(u) || !this.eligible(u, o.hitsAir, o.hitsGround)) continue;
          const d = dist(u, last);
          if (d < nd) {
            nd = d;
            next = u;
          }
        }
        if (!next) break;
        this.events.push({ type: 'shot', x1: last.x, y1: last.y, x2: next.x, y2: next.y, attack });
        this.hurt(next, dmg * 0.7, attack, owner);
        hit.add(next);
        last = next;
      }
    }
  }

  private hurt(e: Entity, base: number, attack: AttackType, owner: number) {
    if (!e.alive) return;
    e.hp -= base * DAMAGE[attack][e.armor] * this.overtimeMult();
    if (e.kind === 'unit') (e as Unit).lastHurt = this.time;
    if (e.hp > 0) return;
    e.alive = false;
    if (e.kind === 'core') {
      this.events.push({ type: 'death', x: e.x, y: e.y, team: e.team, big: true });
      return;
    }
    const bounty = e.kind === 'unit' ? (e as Unit).def.bounty : Math.floor((e as Building).def.cost * 0.1);
    this.events.push({ type: 'death', x: e.x, y: e.y, team: e.team, big: e.kind === 'building' || e.radius >= 13 });
    const killerTeam = 1 - e.team;
    if (owner >= 0) {
      this.players[owner].gold += bounty;
      this.players[owner].kills++;
      this.events.push({ type: 'bounty', x: e.x, y: e.y, amount: bounty, owner });
    } else {
      const team = this.players.filter((p) => p.team === killerTeam);
      const share = Math.floor(bounty / team.length);
      for (const p of team) {
        p.gold += share;
        this.events.push({ type: 'bounty', x: e.x, y: e.y, amount: share, owner: p.id });
      }
    }
  }
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function moveToward(u: { x: number; y: number }, tx: number, ty: number, step: number) {
  if (step <= 0) return;
  const dx = tx - u.x;
  const dy = ty - u.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.001) return;
  const s = Math.min(step, d);
  u.x += (dx / d) * s;
  u.y += (dy / d) * s;
}
