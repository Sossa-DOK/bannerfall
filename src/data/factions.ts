import type { BuildingDef, FactionDef, FactionId } from './types';

// ---------- Brasswright Union ----------
const union: FactionDef = {
  id: 'union',
  name: 'Brasswright Union',
  tagline: 'Tough, expensive, unstoppable late.',
  color: '#d39242',
  dark: '#6b4519',
  shape: 'square',
  mechanic: 'overclock',
  mechanicText: 'Overclock: select a barracks or Steam Pump and press O. It works 2× faster for 20 s but loses 25% HP.',
  buildings: [
    {
      id: 'rivet_yard', name: 'Rivet Yard', short: 'RY', tier: 1, kind: 'barracks', cost: 60, hp: 420,
      desc: 'Spawns Rivetmen: slow, sturdy brawlers.',
      spawn: { interval: 9, unit: { id: 'rivetman', name: 'Rivetman', hp: 175, dmg: 13, cooldown: 1.0, range: 6, speed: 38, attack: 'normal', armor: 'heavy', bounty: 6, size: 9 } },
    },
    {
      id: 'bolt_nest', name: 'Bolt Nest', short: 'BN', tier: 1, kind: 'barracks', cost: 70, hp: 380,
      desc: 'Spawns Boltcasters: ranged crossbow gnomes. Hit air.',
      spawn: { interval: 9, unit: { id: 'boltcaster', name: 'Boltcaster', hp: 85, dmg: 9, cooldown: 0.9, range: 120, speed: 42, attack: 'pierce', armor: 'light', bounty: 6, size: 7, hitsAir: true } },
    },
    {
      id: 'steam_turret', name: 'Steam Turret', short: 'ST', tier: 1, kind: 'tower', cost: 80, hp: 520,
      desc: 'Tower. Rapid bolts, good against swarms. Hits air.',
      tower: { dmg: 10, cooldown: 0.5, range: 170, attack: 'pierce', hitsAir: true },
    },
    {
      id: 'foundry', name: 'Foundry', short: 'FO', tier: 2, kind: 'barracks', cost: 150, hp: 600,
      desc: 'Spawns Ironclad Walkers: siege tanks that wreck towers and cores.',
      spawn: { interval: 16, unit: { id: 'walker', name: 'Ironclad Walker', hp: 540, dmg: 40, cooldown: 1.8, range: 8, speed: 28, attack: 'siege', armor: 'fortified', bounty: 14, size: 14 } },
    },
    {
      id: 'arc_lab', name: 'Arc Lab', short: 'AL', tier: 2, kind: 'barracks', cost: 140, hp: 480,
      desc: 'Spawns Sparkwrights: chain shocks that jump to 3 targets. Hit air.',
      spawn: { interval: 14, unit: { id: 'sparkwright', name: 'Sparkwright', hp: 110, dmg: 20, cooldown: 1.4, range: 115, speed: 40, attack: 'magic', armor: 'light', bounty: 10, size: 8, hitsAir: true, chain: 3 } },
    },
    {
      id: 'steam_pump', name: 'Steam Pump', short: 'SP', tier: 2, kind: 'econ', cost: 120, hp: 450,
      desc: 'Economy: +5 gold per income tick. Overclock doubles it.',
      income: 5,
    },
    {
      id: 'sky_dock', name: 'Sky Dock', short: 'SD', tier: 3, kind: 'barracks', cost: 260, hp: 800,
      desc: 'Spawns Thunderhulls: flying airships that bomb the ground.',
      spawn: { interval: 22, unit: { id: 'thunderhull', name: 'Thunderhull', hp: 620, dmg: 34, cooldown: 2.0, range: 70, speed: 24, attack: 'siege', armor: 'heavy', bounty: 25, size: 15, flying: true, splash: 45 } },
    },
    {
      id: 'grand_mortar', name: 'Grand Mortar', short: 'GM', tier: 3, kind: 'tower', cost: 240, hp: 750,
      desc: 'Tower. Huge-range splash shells. Ground only, has a minimum range.',
      tower: { dmg: 45, cooldown: 3.0, range: 300, attack: 'siege', hitsAir: false, splash: 55, minRange: 70 },
    },
  ],
};

// ---------- Bloomkin Grove ----------
const bloomkin: FactionDef = {
  id: 'bloomkin',
  name: 'Bloomkin Grove',
  tagline: 'Cheap swarms that grow stronger.',
  color: '#62c25a',
  dark: '#24521f',
  shape: 'circle',
  mechanic: 'bloom',
  mechanicText: 'Bloom: every building upgrades itself one rank for free after standing 95 s (max rank 3).',
  buildings: [
    {
      id: 'sprout_patch', name: 'Sprout Patch', short: 'SP', tier: 1, kind: 'barracks', cost: 50, hp: 340,
      desc: 'Spawns 2 Thornlings at a time: a cheap melee swarm.',
      spawn: { interval: 9, count: 2, unit: { id: 'thornling', name: 'Thornling', hp: 82, dmg: 8, cooldown: 0.8, range: 6, speed: 50, attack: 'normal', armor: 'light', bounty: 3, size: 6 } },
    },
    {
      id: 'spore_hollow', name: 'Spore Hollow', short: 'SH', tier: 1, kind: 'barracks', cost: 65, hp: 360,
      desc: 'Spawns Puffcaps: ranged spore lobbers with a small splash. Hit air.',
      spawn: { interval: 10, unit: { id: 'puffcap', name: 'Puffcap', hp: 85, dmg: 14, cooldown: 1.3, range: 115, speed: 40, attack: 'magic', armor: 'light', bounty: 6, size: 7, hitsAir: true, splash: 26 } },
    },
    {
      id: 'bramble_spitter', name: 'Bramble Spitter', short: 'BS', tier: 1, kind: 'tower', cost: 70, hp: 460,
      desc: 'Tower. Thorn volleys that slow enemies. Hits air.',
      tower: { dmg: 8, cooldown: 0.6, range: 160, attack: 'pierce', hitsAir: true, slow: { pct: 0.3, dur: 1.5 } },
    },
    {
      id: 'mossheart_den', name: 'Mossheart Den', short: 'MD', tier: 2, kind: 'barracks', cost: 130, hp: 520,
      desc: 'Spawns Moss Golems: tanks that heal out of combat.',
      spawn: { interval: 15, unit: { id: 'moss_golem', name: 'Moss Golem', hp: 480, dmg: 22, cooldown: 1.3, range: 7, speed: 30, attack: 'normal', armor: 'heavy', bounty: 12, size: 13, regen: 12 } },
    },
    {
      id: 'hive_stump', name: 'Hive Stump', short: 'HS', tier: 2, kind: 'barracks', cost: 130, hp: 440,
      desc: 'Spawns 3 Stingers: a flying swarm that hunts ranged units.',
      spawn: { interval: 13, count: 3, unit: { id: 'stinger', name: 'Stinger', hp: 52, dmg: 8, cooldown: 0.7, range: 40, speed: 60, attack: 'pierce', armor: 'light', bounty: 4, size: 5, flying: true, hitsAir: true, preferRanged: true } },
    },
    {
      id: 'sap_grove', name: 'Sap Grove', short: 'SG', tier: 2, kind: 'econ', cost: 100, hp: 380,
      desc: 'Economy: +3 gold per tick, +1 more for every minute it survives (up to +8).',
      income: 3, incomeGrowth: { perMin: 1, max: 5 },
    },
    {
      id: 'elder_root', name: 'Elder Root', short: 'ER', tier: 3, kind: 'barracks', cost: 260, hp: 820,
      desc: 'Spawns Rootwardens: elite tree-spirits that root groups of enemies in place.',
      spawn: { interval: 22, unit: { id: 'rootwarden', name: 'Rootwarden', hp: 900, dmg: 34, cooldown: 1.6, range: 10, speed: 26, attack: 'siege', armor: 'arcane', bounty: 25, size: 16, root: { radius: 90, duration: 2, every: 8 } } },
    },
    {
      id: 'bloom_spire', name: 'Bloom Spire', short: 'BL', tier: 3, kind: 'tower', cost: 230, hp: 680,
      desc: 'Tower. Pollen beam that ramps up damage on one target. Melts tanks. Hits air.',
      tower: { dmg: 10, cooldown: 0.5, range: 200, attack: 'magic', hitsAir: true, ramp: { perHit: 6, max: 50 } },
    },
  ],
};

export const FACTIONS: Record<FactionId, FactionDef> = { union, bloomkin };

const byId = new Map<string, BuildingDef>();
for (const f of Object.values(FACTIONS)) for (const b of f.buildings) byId.set(`${f.id}:${b.id}`, b);

export function getBuildingDef(faction: FactionId, id: string): BuildingDef | undefined {
  return byId.get(`${faction}:${id}`);
}
