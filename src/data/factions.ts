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

// ---------- Galewing Aerie ----------
const aerie: FactionDef = {
  id: 'aerie',
  name: 'Galewing Aerie',
  tagline: 'Fast, fragile, mostly airborne.',
  color: '#7fd3c8',
  dark: '#1f4f55',
  shape: 'diamond',
  mechanic: 'gale',
  mechanicText: 'Gale: press G (or the Gale button) to blow every enemy ground unit back and slow it. 60 s cooldown.',
  buildings: [
    {
      id: 'perch_roost', name: 'Perch Roost', short: 'PR', tier: 1, kind: 'barracks', cost: 65, hp: 340,
      desc: 'Spawns 2 Skimmers: fast flying darts. Hit air.',
      spawn: { interval: 8, count: 2, unit: { id: 'skimmer', name: 'Skimmer', hp: 62, dmg: 8, cooldown: 0.8, range: 95, speed: 70, attack: 'pierce', armor: 'light', bounty: 4, size: 6, flying: true, hitsAir: true } },
    },
    {
      id: 'talon_lodge', name: 'Talon Lodge', short: 'TL', tier: 1, kind: 'barracks', cost: 60, hp: 400,
      desc: 'Spawns Talonguard: ground spear-fighters. Their first strike (Dive) deals double damage.',
      spawn: { interval: 9, unit: { id: 'talonguard', name: 'Talonguard', hp: 200, dmg: 14, cooldown: 1.0, range: 8, speed: 42, attack: 'normal', armor: 'heavy', bounty: 6, size: 9, dive: true } },
    },
    {
      id: 'wind_spire', name: 'Wind Spire', short: 'WS', tier: 1, kind: 'tower', cost: 75, hp: 480,
      desc: 'Tower. Fast gusts that knock enemies back. Hits air.',
      tower: { dmg: 9, cooldown: 0.5, range: 165, attack: 'pierce', hitsAir: true, knockback: 8 },
    },
    {
      id: 'thunder_eyrie', name: 'Thunder Eyrie', short: 'TE', tier: 2, kind: 'barracks', cost: 140, hp: 560,
      desc: 'Spawns Thunderbirds: flying storm-callers with splash lightning. Hit air.',
      spawn: { interval: 16, unit: { id: 'thunderbird', name: 'Thunderbird', hp: 450, dmg: 24, cooldown: 1.5, range: 95, speed: 36, attack: 'magic', armor: 'heavy', bounty: 14, size: 12, flying: true, hitsAir: true, splash: 30 } },
    },
    {
      id: 'kite_shrine', name: 'Kite Shrine', short: 'KS', tier: 2, kind: 'barracks', cost: 120, hp: 420,
      desc: 'Spawns Mender Kites: flying healers. No attack — they heal the most-hurt ally nearby.',
      spawn: { interval: 15, unit: { id: 'mender_kite', name: 'Mender Kite', hp: 95, dmg: 0, cooldown: 1.0, range: 70, speed: 50, attack: 'normal', armor: 'light', bounty: 8, size: 8, flying: true, heal: 20 } },
    },
    {
      id: 'updraft_mill', name: 'Updraft Mill', short: 'UM', tier: 2, kind: 'econ', cost: 110, hp: 420,
      desc: 'Economy: +5 gold per tick, +3 more while no enemy unit is within 200 px (calm skies).',
      income: 5, incomeCalm: { bonus: 3, radius: 200 },
    },
    {
      id: 'roc_nest', name: 'Roc Nest', short: 'RN', tier: 3, kind: 'barracks', cost: 270, hp: 820,
      desc: 'Spawns Storm Rocs: huge flying raptors that wreck buildings and snatch ground units out of the fight.',
      spawn: { interval: 22, unit: { id: 'storm_roc', name: 'Storm Roc', hp: 750, dmg: 38, cooldown: 1.8, range: 14, speed: 30, attack: 'siege', armor: 'heavy', bounty: 25, size: 16, flying: true, stun: { duration: 2, every: 7 } } },
    },
    {
      id: 'eye_of_storm', name: 'Eye of the Storm', short: 'ES', tier: 3, kind: 'tower', cost: 235, hp: 680,
      desc: 'Tower. Lightning that chains to 3 targets. Hits air.',
      tower: { dmg: 24, cooldown: 1.2, range: 210, attack: 'magic', hitsAir: true, chain: 3 },
    },
  ],
};

// ---------- Hollow Choir ----------
const choir: FactionDef = {
  id: 'choir',
  name: 'Hollow Choir',
  tagline: 'Arcane spirits that rise again.',
  color: '#8b80f0',
  dark: '#2a2560',
  shape: 'hex',
  mechanic: 'echo',
  mechanicText: 'Echo: a fallen unit has a 25% chance to rise as a ghostly Echo (40% HP, fades after 15 s, no bounty). Revenants always return once.',
  buildings: [
    {
      id: 'lantern_hall', name: 'Lantern Hall', short: 'LH', tier: 1, kind: 'barracks', cost: 60, hp: 400,
      desc: 'Spawns Shades: hooded melee spirits with Arcane armor.',
      spawn: { interval: 9, unit: { id: 'shade', name: 'Shade', hp: 160, dmg: 13, cooldown: 1.0, range: 6, speed: 40, attack: 'normal', armor: 'arcane', bounty: 6, size: 9 } },
    },
    {
      id: 'hymn_loft', name: 'Hymn Loft', short: 'HL', tier: 1, kind: 'barracks', cost: 70, hp: 380,
      desc: 'Spawns Cantors: ranged singers whose song slows. Hit air.',
      spawn: { interval: 10, unit: { id: 'cantor', name: 'Cantor', hp: 100, dmg: 12, cooldown: 1.1, range: 125, speed: 40, attack: 'magic', armor: 'light', bounty: 6, size: 7, hitsAir: true, slowOnHit: { pct: 0.2, dur: 1 } } },
    },
    {
      id: 'bell_tower', name: 'Bell Tower', short: 'BT', tier: 1, kind: 'tower', cost: 80, hp: 500,
      desc: 'Tower. Rings every 2 s, hitting ALL enemies in range. Great vs swarms. Hits air.',
      tower: { dmg: 11, cooldown: 2.0, range: 150, attack: 'magic', hitsAir: true, pulse: true },
    },
    {
      id: 'crypt_of_echoes', name: 'Crypt of Echoes', short: 'CE', tier: 2, kind: 'barracks', cost: 150, hp: 600,
      desc: 'Spawns Revenants: armored dead knights that always return once as an Echo.',
      spawn: { interval: 16, unit: { id: 'revenant', name: 'Revenant', hp: 480, dmg: 26, cooldown: 1.4, range: 8, speed: 30, attack: 'normal', armor: 'heavy', bounty: 14, size: 13, alwaysEcho: true } },
    },
    {
      id: 'hex_chapel', name: 'Hex Chapel', short: 'HC', tier: 2, kind: 'barracks', cost: 140, hp: 480,
      desc: 'Spawns Hexers: cursers whose hits make the target take +25% damage for 4 s. Hit air.',
      spawn: { interval: 14, unit: { id: 'hexer', name: 'Hexer', hp: 105, dmg: 14, cooldown: 1.3, range: 115, speed: 40, attack: 'magic', armor: 'arcane', bounty: 10, size: 8, hitsAir: true, curse: { mult: 1.25, dur: 4 } } },
    },
    {
      id: 'soul_font', name: 'Soul Font', short: 'SF', tier: 2, kind: 'econ', cost: 110, hp: 420,
      desc: 'Economy: +2 gold per tick, plus 1 gold for every enemy unit that dies within 250 px.',
      income: 2, soulFont: { radius: 250, gold: 1 },
    },
    {
      id: 'requiem_organ', name: 'Requiem Organ', short: 'RO', tier: 3, kind: 'barracks', cost: 260, hp: 800,
      desc: 'Spawns the Dirge: a flying banshee whose scream silences nearby enemy towers for 3 s. Hits air.',
      spawn: { interval: 22, unit: { id: 'dirge', name: 'Dirge', hp: 560, dmg: 26, cooldown: 1.4, range: 95, speed: 28, attack: 'magic', armor: 'arcane', bounty: 25, size: 15, flying: true, hitsAir: true, silence: { radius: 130, duration: 3, every: 9 } } },
    },
    {
      id: 'choir_obelisk', name: 'Choir Obelisk', short: 'CO', tier: 3, kind: 'tower', cost: 235, hp: 680,
      desc: 'Tower. Draining beam that heals your Heartstone by 20% of the damage it deals. Hits air.',
      tower: { dmg: 30, cooldown: 1.0, range: 210, attack: 'magic', hitsAir: true, coreHeal: 0.2 },
    },
  ],
};

export const FACTIONS: Record<FactionId, FactionDef> = { union, bloomkin, aerie, choir };
export const FACTION_IDS: FactionId[] = ['union', 'bloomkin', 'aerie', 'choir'];

const byId = new Map<string, BuildingDef>();
for (const f of Object.values(FACTIONS)) for (const b of f.buildings) byId.set(`${f.id}:${b.id}`, b);

export function getBuildingDef(faction: FactionId, id: string): BuildingDef | undefined {
  return byId.get(`${faction}:${id}`);
}
