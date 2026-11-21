export type AttackType = 'pierce' | 'normal' | 'siege' | 'magic';
export type ArmorType = 'light' | 'heavy' | 'fortified' | 'arcane';
export type FactionId = 'union' | 'bloomkin' | 'aerie' | 'choir';
export type BuildingKind = 'barracks' | 'tower' | 'econ';
export type Tier = 1 | 2 | 3;

export interface UnitDef {
  id: string;
  name: string;
  hp: number;
  dmg: number;
  /** seconds between attacks */
  cooldown: number;
  /** attack range in px, edge to edge */
  range: number;
  /** px per second */
  speed: number;
  attack: AttackType;
  armor: ArmorType;
  bounty: number;
  /** draw/collision radius in px */
  size: number;
  flying?: boolean;
  hitsAir?: boolean;
  /** defaults to true */
  hitsGround?: boolean;
  splash?: number;
  /** total targets hit, including the first */
  chain?: number;
  /** hp per second while out of combat for 3 s */
  regen?: number;
  root?: { radius: number; duration: number; every: number };
  preferRanged?: boolean;
  /** support unit: no attack, heals the most-hurt ally in range */
  heal?: number;
  /** first attack deals double damage */
  dive?: boolean;
  /** periodically stuns (lifts) its current ground target */
  stun?: { duration: number; every: number };
  /** hits make the target take extra damage for a while */
  curse?: { mult: number; dur: number };
  slowOnHit?: { pct: number; dur: number };
  /** periodically stops enemy towers near it from firing */
  silence?: { radius: number; duration: number; every: number };
  /** always returns as an Echo once (Choir) */
  alwaysEcho?: boolean;
}

export interface TowerDef {
  dmg: number;
  cooldown: number;
  range: number;
  attack: AttackType;
  hitsAir: boolean;
  splash?: number;
  minRange?: number;
  slow?: { pct: number; dur: number };
  /** extra damage per consecutive hit on the same target */
  ramp?: { perHit: number; max: number };
  chain?: number;
  /** hit every eligible enemy in range at once */
  pulse?: boolean;
  /** px the target is pushed back toward its own side */
  knockback?: number;
  /** heal own Heartstone by this fraction of damage dealt */
  coreHeal?: number;
}

export interface BuildingDef {
  id: string;
  name: string;
  /** 2-letter label used by the gray-box renderer */
  short: string;
  tier: Tier;
  kind: BuildingKind;
  cost: number;
  hp: number;
  desc: string;
  spawn?: { unit: UnitDef; interval: number; count?: number };
  tower?: TowerDef;
  /** gold added per income tick */
  income?: number;
  incomeGrowth?: { perMin: number; max: number };
  /** extra income while no enemy unit is within radius */
  incomeCalm?: { bonus: number; radius: number };
  /** gold per enemy unit dying within radius */
  soulFont?: { radius: number; gold: number };
}

export interface FactionDef {
  id: FactionId;
  name: string;
  tagline: string;
  color: string;
  dark: string;
  shape: 'square' | 'circle' | 'diamond' | 'hex';
  mechanic: 'overclock' | 'bloom' | 'gale' | 'echo';
  mechanicText: string;
  buildings: BuildingDef[];
}
