import { DAMAGE } from '../data/damage';
import { CARD_UNLOCK, getCard } from '../data/cards';
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
export const GALE_COOLDOWN = 60;
const GALE_PUSH = 80;
export const ECHO_CHANCE = 0.25;
const ECHO_HP = 0.4;
const ECHO_LIFE = 15;
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
  stunT: number;
  curseT: number;
  curseMult: number;
  attacks: number;
  /** Choir Echo: temporary ghost copy */
  echo: boolean;
  life: number;
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
  silenceT: number;
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
  /** faction active ability (Gale) cooldown */
  abilityCd: number;
  /** Commander Cards brought to this match (single use each) */
  cards: { id: string; used: boolean }[];
  /** Lament: this many upcoming deaths become Echoes */
  lament: number;
}

export interface PlayerConfig {
  team: number;
  slot: number;
  faction: FactionId;
  isHuman: boolean;
  name: string;
  incomeMult?: number;
  cards?: string[];
}

/** Timed team-wide effect from a Commander Card. */
export interface TeamBuff {
  kind: 'plating' | 'rally' | 'tailwind';
  team: number;
  t: number;
}

/** Ground effect from a Commander Card. */
export interface Zone {
  kind: 'pollen' | 'feathers';
  team: number;
  owner: number;
  x: number;
  y: number;
  r: number;
  t: number;
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
  | { type: 'rank'; x: number; y: number; owner: number; bloom: boolean }
  | { type: 'gale'; team: number }
  | { type: 'heal'; x: number; y: number }
  | { type: 'silence'; x: number; y: number; r: number }
  | { type: 'echo'; x: number; y: number }
  | { type: 'stun'; x: number; y: number }
  | { type: 'card'; owner: number; card: string; x: number; y: number; r: number };

interface AttackOpts {
  splash?: number;
  chain?: number;
  hitsAir: boolean;
  hitsGround: boolean;
  slow?: { pct: number; dur: number };
  curse?: { mult: number; dur: number };
  knockback?: number;
  /** heal this core by fraction of damage dealt */
  coreHeal?: { core: Core; frac: number };
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
  private pendingEchoes: Unit[] = [];
  buffs: TeamBuff[] = [];
  zones: Zone[] = [];
  /** events raised by commands between steps (e.g. Gale, manual upgrade) */
  private cmdEvents: SimEvent[] = [];
  private inStep = false;

  private emit(e: SimEvent) {
    (this.inStep ? this.events : this.cmdEvents).push(e);
  }

  constructor(cfg: MatchConfig) {
    this.rng = new Rng(cfg.seed);
    this.players = cfg.players.map((p, i) => ({
      id: i, team: p.team, slot: p.slot, faction: p.faction, gold: START_GOLD, isHuman: p.isHuman,
      incomeMult: p.incomeMult ?? 1, name: p.name, kills: 0, built: 0, abilityCd: 20,
      cards: (p.cards ?? []).map((id) => ({ id, used: false })), lament: 0,
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
      if (b.def.incomeCalm && !this.units.some((u) => u.team !== b.team && dist(u, b) <= b.def.incomeCalm!.radius)) v += b.def.incomeCalm.bonus;
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

  canGale(pid: number) {
    const p = this.players[pid];
    return FACTIONS[p.faction].mechanic === 'gale' && p.abilityCd <= 0 && this.winner === null;
  }

  hasBuff(team: number, kind: TeamBuff['kind']) {
    return this.buffs.some((b) => b.team === team && b.kind === kind);
  }

  private inEnemyZone(u: Unit, kind: Zone['kind']) {
    return this.zones.some((z) => z.kind === kind && z.team !== u.team && dist(u, z) <= z.r);
  }

  /** Can card slot `idx` be played (ignoring the aim point)? */
  canCast(pid: number, idx: number): { ok: boolean; reason?: string } {
    const p = this.players[pid];
    const slot = p?.cards[idx];
    if (!slot) return { ok: false, reason: 'No card' };
    if (slot.used) return { ok: false, reason: 'Already used' };
    if (this.time < CARD_UNLOCK) return { ok: false, reason: `Cards unlock at ${Math.floor(CARD_UNLOCK / 60)}:${String(CARD_UNLOCK % 60).padStart(2, '0')}` };
    if (slot.id === 'second_gale' && p.abilityCd <= 0) return { ok: false, reason: 'Gale is already ready' };
    if (slot.id === 'double_shift' && !this.buildings.some((b) => b.owner === pid && b.def.kind !== 'tower')) return { ok: false, reason: 'No buildings to overclock' };
    if (slot.id === 'heart_pulse' && this.cores[p.team].hp >= this.cores[p.team].maxHp) return { ok: false, reason: 'Heartstone is at full HP' };
    return { ok: true };
  }

  /** Is (x, y) a valid aim point for this card? */
  validCardTarget(pid: number, idx: number, x: number, y: number): boolean {
    const p = this.players[pid];
    const card = getCard(p.cards[idx].id);
    if (card.target === 'none' || card.target === 'area') return true;
    if (card.target === 'ownHalf') return p.team === 0 ? x < L.W / 2 && x > L.CORE_X[0] : x > L.W / 2 && x < L.CORE_X[1];
    return !!this.cardBuildingAt(pid, x, y);
  }

  private cardBuildingAt(pid: number, x: number, y: number) {
    return this.buildings.find((b) => b.owner === pid && b.alive && b.rank < MAX_RANK && Math.abs(b.x - x) <= L.TILE / 2 && Math.abs(b.y - y) <= L.TILE / 2);
  }

  /** Play a Commander Card. (x, y) is the aim point for targeted cards. */
  cast(pid: number, idx: number, x = 0, y = 0): boolean {
    if (!this.canCast(pid, idx).ok || !this.validCardTarget(pid, idx, x, y)) return false;
    const p = this.players[pid];
    const slot = p.cards[idx];
    const card = getCard(slot.id);
    const enemyUnits = this.units.filter((u) => u.alive && u.team !== p.team);
    const core = this.cores[p.team];
    let fx = { x, y, r: card.radius ?? 0 };
    switch (card.id) {
      case 'gearstorm':
        for (const u of enemyUnits) if (dist(u, { x, y }) - u.radius <= card.radius!) this.hurt(u, 100, 'pierce', pid);
        break;
      case 'plating':
      case 'rally':
        this.buffs.push({ kind: card.id, team: p.team, t: card.id === 'plating' ? 8 : 10 });
        fx = { x: core.x, y: core.y, r: 60 };
        break;
      case 'tailwind':
        this.buffs.push({ kind: 'tailwind', team: p.team, t: 10 });
        fx = { x: core.x, y: core.y, r: 60 };
        break;
      case 'double_shift':
        for (const b of this.buildings) if (b.owner === pid && b.alive && b.def.kind !== 'tower') b.ocT = 20;
        fx = { x: core.x, y: core.y, r: 60 };
        break;
      case 'overgrowth': {
        const b = this.cardBuildingAt(pid, x, y)!;
        while (b.rank < MAX_RANK) this.rankUp(b, true);
        fx = { x: b.x, y: b.y, r: 30 };
        break;
      }
      case 'pollen':
        this.zones.push({ kind: 'pollen', team: p.team, owner: pid, x, y, r: card.radius!, t: 6 });
        break;
      case 'feather_storm':
        this.zones.push({ kind: 'feathers', team: p.team, owner: pid, x, y, r: card.radius!, t: 3 });
        break;
      case 'seedfall': {
        const def = getBuildingDef('bloomkin', 'sprout_patch')!.spawn!.unit;
        const cy = Math.max(L.LANE_Y - L.LANE_HALF + 10, Math.min(L.LANE_Y + L.LANE_HALF - 10, y));
        for (let i = 0; i < 6; i++) this.spawnAt(pid, def, x + this.rng.range(-20, 20), cy + this.rng.range(-20, 20), 1);
        fx = { x, y: cy, r: 30 };
        break;
      }
      case 'second_gale':
        p.abilityCd = 0;
        fx = { x: core.x, y: core.y, r: 60 };
        break;
      case 'lament':
        p.lament += 6;
        fx = { x: core.x, y: core.y, r: 60 };
        break;
      case 'funeral_bell':
        for (const b of this.buildings) if (b.team !== p.team && b.def.tower) b.silenceT = 4;
        fx = { x: this.cores[1 - p.team].x, y: L.LANE_Y, r: 80 };
        break;
      case 'soul_harvest':
        p.gold += Math.min(240, enemyUnits.length * 3);
        fx = { x: core.x, y: core.y, r: 60 };
        break;
      case 'heart_pulse':
        core.hp = Math.min(core.maxHp, core.hp + core.maxHp * 0.15);
        fx = { x: core.x, y: core.y, r: 60 };
        break;
    }
    slot.used = true;
    this.emit({ type: 'card', owner: pid, card: card.id, ...fx });
    return true;
  }

  // ---------------- commands ----------------

  /** Aerie: push every enemy ground unit back toward its own side and slow it. */
  gale(pid: number): boolean {
    if (!this.canGale(pid)) return false;
    const p = this.players[pid];
    p.abilityCd = GALE_COOLDOWN;
    const dir = p.team === 0 ? 1 : -1; // push direction (away from caster)
    for (const u of this.units) {
      if (u.team === p.team || u.flying || !u.alive) continue;
      u.x = Math.max(L.CORE_X[0], Math.min(L.CORE_X[1], u.x + dir * GALE_PUSH));
      u.slowT = 2;
      u.slowPct = 0.4;
      u.target = null;
    }
    this.emit({ type: 'gale', team: p.team });
    return true;
  }

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
      rank: 1, spawnT: def.spawn ? def.spawn.interval * 0.5 : 0, cd: 0, bloomT: 0, ocT: 0, ocCd: 0, age: 0, target: null, ramp: 0, silenceT: 0,
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
    this.emit({ type: 'rank', x: b.x, y: b.y, owner: b.owner, bloom });
  }

  // ---------------- simulation ----------------

  step() {
    if (this.winner !== null) return;
    const dt = TICK;
    this.events = this.cmdEvents;
    this.cmdEvents = [];
    this.inStep = true;
    this.time += dt;
    this.tick++;

    this.incomeT += dt;
    if (this.incomeT >= INCOME_INTERVAL) {
      this.incomeT -= INCOME_INTERVAL;
      for (const p of this.players) p.gold += this.income(p.id);
    }
    for (const p of this.players) if (p.abilityCd > 0) p.abilityCd -= dt;

    const teamCount = [0, 0];
    this.teamCap = [0, 1].map((t) => UNIT_CAP_PER_PLAYER * this.players.filter((p) => p.team === t).length);
    for (const u of this.units) teamCount[u.team]++;

    for (const b of this.buildings) this.updateBuilding(b, dt, teamCount);
    for (const c of this.cores) this.updateTower(c, CORE_TOWER, c.team, -1, 1, dt);
    for (const b of this.buffs) b.t -= dt;
    this.buffs = this.buffs.filter((b) => b.t > 0);
    for (const z of this.zones) {
      z.t -= dt;
      if (z.kind === 'feathers')
        for (const u of this.units) if (u.alive && u.team !== z.team && dist(u, z) - u.radius <= z.r) this.hurt(u, 30 * dt, 'normal', z.owner, true);
    }
    this.zones = this.zones.filter((z) => z.t > 0);

    for (const u of this.units) if (u.alive) this.updateUnit(u, dt);
    this.separate();

    this.units = this.units.filter((u) => u.alive);
    if (this.pendingEchoes.length) {
      for (const e of this.pendingEchoes) this.units.push(e);
      this.pendingEchoes = [];
    }
    this.buildings = this.buildings.filter((b) => b.alive);
    for (const c of this.cores) if (c.hp <= 0 && this.winner === null) this.winner = 1 - c.team;
    this.inStep = false;
  }

  private updateBuilding(b: Building, dt: number, teamCount: number[]) {
    if (!b.alive) return;
    b.age += dt;
    if (b.silenceT > 0) b.silenceT -= dt;
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
    this.spawnAt(b.owner, def, b.x + this.rng.range(-8, 8), b.y + this.rng.range(-8, 8), rankMult(b.rank));
  }

  private spawnAt(owner: number, def: UnitDef, x: number, y: number, m: number) {
    const hp = def.hp * m;
    const team = this.players[owner].team;
    this.units.push({
      id: this.nextId++, kind: 'unit', team, owner, def,
      x, y,
      hp, maxHp: hp, radius: def.size, armor: def.armor, flying: !!def.flying, alive: true,
      mult: m, cd: 0, target: null, retarget: 0, slowT: 0, slowPct: 0, rootT: 0, lastHurt: -99,
      abilityT: (def.root?.every ?? def.silence?.every ?? 0) * 0.5,
      stunT: 0, curseT: 0, curseMult: 1, attacks: 0, echo: false, life: 0,
    });
  }

  private updateTower(t: Building | Core, tw: TowerDef, team: number, owner: number, mult: number, dt: number) {
    if (!t.alive) return;
    t.cd -= dt;
    if (t.cd > 0) return;
    if (t.kind === 'building' && t.silenceT > 0) return;
    if (tw.pulse) {
      const hit = [...this.enemies(team)].filter((e) => this.eligible(e, tw.hitsAir, true) && this.inRange(t, e, tw.range, 0));
      if (!hit.length) return;
      t.cd = tw.cooldown;
      this.emit({ type: 'splash', x: t.x, y: t.y, r: tw.range });
      for (const e of hit) this.hurt(e, tw.dmg * mult, tw.attack, owner);
      return;
    }
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
      splash: tw.splash, chain: tw.chain, hitsAir: tw.hitsAir, hitsGround: true, slow: tw.slow, knockback: tw.knockback,
      coreHeal: tw.coreHeal ? { core: this.cores[team], frac: tw.coreHeal } : undefined,
    });
  }

  private updateUnit(u: Unit, dt: number) {
    const d = u.def;
    if (u.echo) {
      u.life -= dt;
      if (u.life <= 0) {
        u.alive = false;
        this.emit({ type: 'death', x: u.x, y: u.y, team: u.team, big: false });
        return;
      }
    }
    u.cd -= dt;
    if (u.slowT > 0) u.slowT -= dt;
    if (u.rootT > 0) u.rootT -= dt;
    if (u.curseT > 0) u.curseT -= dt;
    if (u.stunT > 0) {
      u.stunT -= dt;
      return;
    }
    if (d.regen && this.time - u.lastHurt > 3) u.hp = Math.min(u.maxHp, u.hp + d.regen * u.mult * dt);

    if (d.root) {
      u.abilityT -= dt;
      if (u.abilityT <= 0) {
        const victims = this.units.filter((e) => e.alive && e.team !== u.team && !e.flying && dist(u, e) <= d.root!.radius);
        if (victims.length > 0) {
          for (const v of victims) v.rootT = d.root.duration;
          u.abilityT = d.root.every;
          this.emit({ type: 'root', x: u.x, y: u.y, r: d.root.radius });
        }
      }
    }

    if (d.silence) {
      u.abilityT -= dt;
      if (u.abilityT <= 0) {
        const r = d.silence.radius;
        const near = this.buildings.filter((b) => b.alive && b.team !== u.team && dist(u, b) <= r);
        if (near.some((b) => b.def.tower)) {
          for (const b of near) b.silenceT = d.silence.duration;
          u.abilityT = d.silence.every;
          this.emit({ type: 'silence', x: u.x, y: u.y, r });
        }
      }
    }
    if (d.stun) u.abilityT -= dt;

    if (d.heal) {
      this.updateHealer(u, dt);
      return;
    }

    u.retarget -= dt;
    if (!u.target || !u.target.alive || u.retarget <= 0) {
      u.target = this.findTarget(u.team, u.x, u.y, AGGRO + d.range, !!d.hitsAir, d.hitsGround ?? true, 0, !!d.preferRanged);
      u.retarget = 0.3;
    }

    const speed = u.rootT > 0 ? 0 : d.speed * (u.slowT > 0 ? 1 - u.slowPct : 1) * this.speedMult(u);
    const step = speed * dt;
    const t = u.target;
    if (t) {
      const gap = dist(u, t) - t.radius - u.radius;
      if (gap <= d.range) {
        if (u.cd <= 0) {
          u.cd = d.cooldown / this.attackSpeedMult(u);
          const dmg = d.dmg * u.mult * (d.dive && u.attacks === 0 ? 2 : 1);
          u.attacks++;
          // Pollen Cloud: 40% of attacks miss
          if (this.zones.length && this.inEnemyZone(u, 'pollen') && this.rng.next() < 0.4) return;
          this.attack(u.team, u.owner, u.x, u.y, t, dmg, d.attack, {
            splash: d.splash, chain: d.chain, hitsAir: !!d.hitsAir, hitsGround: d.hitsGround ?? true,
            slow: d.slowOnHit, curse: d.curse,
          });
          if (d.stun && u.abilityT <= 0 && t.kind === 'unit' && !t.flying && t.alive) {
            (t as Unit).stunT = d.stun.duration;
            u.abilityT = d.stun.every;
            this.emit({ type: 'stun', x: t.x, y: t.y });
          }
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

  private speedMult(u: Unit) {
    let m = 1;
    if (this.buffs.length) {
      if (this.hasBuff(u.team, 'rally')) m *= 1.25;
      if (u.flying && this.hasBuff(u.team, 'tailwind')) m *= 1.4;
    }
    return m;
  }

  private attackSpeedMult(u: Unit) {
    let m = 1;
    if (this.buffs.length) {
      if (this.hasBuff(u.team, 'rally')) m *= 1.25;
    }
    return m;
  }

  /** Support unit: heal the most-hurt ally nearby, otherwise tag along behind the army. */
  private updateHealer(u: Unit, dt: number) {
    const d = u.def;
    const step = d.speed * (u.slowT > 0 ? 1 - u.slowPct : 1) * (u.rootT > 0 ? 0 : 1) * this.speedMult(u) * dt;
    let best: Unit | null = null;
    let bf = 0.999;
    for (const a of this.units) {
      if (a === u || !a.alive || a.team !== u.team || a.def.heal) continue;
      const f = a.hp / a.maxHp;
      if (f < bf && dist(u, a) <= 220) {
        bf = f;
        best = a;
      }
    }
    if (best) {
      const gap = dist(u, best) - best.radius - u.radius;
      if (gap <= d.range) {
        if (u.cd <= 0) {
          u.cd = d.cooldown;
          best.hp = Math.min(best.maxHp, best.hp + (d.heal ?? 0) * u.mult);
          this.emit({ type: 'heal', x: best.x, y: best.y });
        }
      } else moveToward(u, best.x, best.y, step);
      return;
    }
    // follow the friendly unit furthest toward the enemy, staying a little behind it
    const dir = u.team === 0 ? 1 : -1;
    let lead: Unit | null = null;
    for (const a of this.units) if (a !== u && a.alive && a.team === u.team && !a.def.heal && (!lead || a.x * dir > lead.x * dir)) lead = a;
    if (lead) {
      const tx = lead.x - dir * 40;
      if (Math.hypot(tx - u.x, lead.y - u.y) > 10) moveToward(u, tx, lead.y, step);
    }
    void dt;
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
    this.emit({ type: 'shot', x1: x, y1: y, x2: target.x, y2: target.y, attack });
    const dealt = this.hurt(target, dmg, attack, owner);
    if (o.coreHeal && dealt > 0) {
      const c = o.coreHeal.core;
      if (c.alive) c.hp = Math.min(c.maxHp, c.hp + dealt * o.coreHeal.frac);
    }
    if (target.kind === 'unit' && target.alive) {
      const u = target as Unit;
      if (o.slow) {
        u.slowT = o.slow.dur;
        u.slowPct = o.slow.pct;
      }
      if (o.curse) {
        u.curseT = o.curse.dur;
        u.curseMult = o.curse.mult;
      }
      if (o.knockback && !u.flying) u.x += (u.team === 0 ? -1 : 1) * o.knockback;
    }
    if (o.splash) {
      this.emit({ type: 'splash', x: target.x, y: target.y, r: o.splash });
      for (const e of this.enemies(team)) {
        if (e === target || !this.eligible(e, o.hitsAir, o.hitsGround)) continue;
        // flyers are spread out: splash only does half to them
        if (dist(e, target) - e.radius <= o.splash) this.hurt(e, dmg * 0.6 * (e.flying ? 0.5 : 1), attack, owner);
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
        this.emit({ type: 'shot', x1: last.x, y1: last.y, x2: next.x, y2: next.y, attack });
        this.hurt(next, dmg * 0.7, attack, owner);
        hit.add(next);
        last = next;
      }
    }
  }

  /** Returns damage actually dealt. */
  private hurt(e: Entity, base: number, attack: AttackType, owner: number, ignoreArmor = false): number {
    if (!e.alive) return 0;
    let amt = base * (ignoreArmor ? 1 : DAMAGE[attack][e.armor]) * this.overtimeMult();
    if (e.kind === 'unit') {
      const u = e as Unit;
      if (u.curseT > 0) amt *= u.curseMult;
      if (this.buffs.length && this.hasBuff(u.team, 'plating')) amt *= 0.7;
      u.lastHurt = this.time;
    }
    const dealt = Math.min(amt, e.hp);
    e.hp -= amt;
    if (e.hp > 0) return dealt;
    e.alive = false;
    if (e.kind === 'core') {
      this.emit({ type: 'death', x: e.x, y: e.y, team: e.team, big: true });
      return dealt;
    }
    this.emit({ type: 'death', x: e.x, y: e.y, team: e.team, big: e.kind === 'building' || e.radius >= 13 });
    if (e.kind === 'unit') {
      const u = e as Unit;
      this.onUnitDeath(u);
      if (u.echo) return dealt; // Echoes give no bounty
    }
    const bounty = e.kind === 'unit' ? (e as Unit).def.bounty : Math.floor((e as Building).def.cost * 0.1);
    const killerTeam = 1 - e.team;
    if (owner >= 0) {
      this.players[owner].gold += bounty;
      this.players[owner].kills++;
      this.emit({ type: 'bounty', x: e.x, y: e.y, amount: bounty, owner });
    } else {
      const team = this.players.filter((p) => p.team === killerTeam);
      const share = Math.floor(bounty / team.length);
      for (const p of team) {
        p.gold += share;
        this.emit({ type: 'bounty', x: e.x, y: e.y, amount: share, owner: p.id });
      }
    }
    return dealt;
  }

  private onUnitDeath(u: Unit) {
    // Soul Font: enemy deaths nearby pay out
    for (const b of this.buildings) {
      if (!b.alive || b.team === u.team || !b.def.soulFont || u.echo) continue;
      if (dist(b, u) <= b.def.soulFont.radius) this.players[b.owner].gold += b.def.soulFont.gold;
    }
    // Choir Echo
    if (u.echo || FACTIONS[this.players[u.owner].faction].mechanic !== 'echo') return;
    const owner = this.players[u.owner];
    if (owner.lament > 0) owner.lament--;
    else if (!u.def.alwaysEcho && this.rng.next() >= ECHO_CHANCE) return;
    this.pendingEchoes.push({
      ...u, id: this.nextId++, alive: true, hp: u.maxHp * ECHO_HP, echo: true, life: ECHO_LIFE,
      target: null, retarget: 0, cd: 0.5, slowT: 0, rootT: 0, stunT: 0, curseT: 0, attacks: 1,
    });
    this.emit({ type: 'echo', x: u.x, y: u.y });
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
