export type AttackType = 'pierce' | 'normal' | 'siege' | 'magic';
export type ArmorType = 'light' | 'heavy' | 'fortified' | 'arcane';
export type FactionId = 'union' | 'bloomkin';
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
}

export interface FactionDef {
  id: FactionId;
  name: string;
  tagline: string;
  color: string;
  dark: string;
  shape: 'square' | 'circle';
  mechanic: 'overclock' | 'bloom';
  mechanicText: string;
  buildings: BuildingDef[];
}
