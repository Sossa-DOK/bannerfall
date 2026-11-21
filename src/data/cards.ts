import type { FactionId } from './types';

/** How a card is aimed. */
export type CardTarget = 'none' | 'area' | 'ownHalf' | 'ownBuilding';

export interface CardDef {
  id: string;
  name: string;
  icon: string;
  faction: FactionId | 'any';
  target: CardTarget;
  /** effect radius for area / ownHalf cards (px) */
  radius?: number;
  desc: string;
}

/** Cards become usable this many seconds into a match. */
export const CARD_UNLOCK = 60;
export const CARDS_PER_PLAYER = 3;

export const CARDS: CardDef[] = [
  // Union
  { id: 'gearstorm', name: 'Gearstorm', icon: '⚙️', faction: 'union', target: 'area', radius: 90, desc: 'Rain gears on an area: 100 Pierce damage to every enemy in it (shreds Light armor).' },
  { id: 'plating', name: 'Emergency Plating', icon: '🛡️', faction: 'union', target: 'none', desc: 'Your units take 30% less damage for 8 s.' },
  { id: 'double_shift', name: 'Double Shift', icon: '⏩', faction: 'union', target: 'none', desc: 'Overclock all your barracks and Steam Pumps at once, with no HP cost.' },
  // Bloomkin
  { id: 'overgrowth', name: 'Overgrowth', icon: '🌳', faction: 'bloomkin', target: 'ownBuilding', desc: 'Instantly Bloom one of your buildings to rank 3.' },
  { id: 'pollen', name: 'Pollen Cloud', icon: '🌼', faction: 'bloomkin', target: 'area', radius: 100, desc: 'Enemy units in the cloud miss 40% of their attacks for 6 s.' },
  { id: 'seedfall', name: 'Seedfall', icon: '🌱', faction: 'bloomkin', target: 'ownHalf', radius: 30, desc: 'Drop 6 Thornlings anywhere on your half of the bridge.' },
  // Aerie
  { id: 'tailwind', name: 'Tailwind', icon: '💨', faction: 'aerie', target: 'none', desc: 'Your flying units move 40% faster for 10 s.' },
  { id: 'feather_storm', name: 'Feather Storm', icon: '🪶', faction: 'aerie', target: 'area', radius: 80, desc: 'A storm of feathers deals 30 damage per second for 3 s to enemies in the area, ignoring armor.' },
  { id: 'second_gale', name: 'Second Gale', icon: '🌬️', faction: 'aerie', target: 'none', desc: 'Instantly recharge Gale.' },
  // Choir
  { id: 'lament', name: 'Lament', icon: '🎶', faction: 'choir', target: 'none', desc: 'Your next 6 units to die all return as Echoes.' },
  { id: 'funeral_bell', name: 'Funeral Bell', icon: '🔔', faction: 'choir', target: 'none', desc: 'Silence every enemy tower for 4 s.' },
  { id: 'soul_harvest', name: 'Soul Harvest', icon: '💀', faction: 'choir', target: 'none', desc: 'Gain 3 gold for every enemy unit alive right now (max 240).' },
  // Any faction
  { id: 'rally', name: 'Rally Banner', icon: '🚩', faction: 'any', target: 'none', desc: 'Your units move and attack 25% faster for 10 s.' },
  { id: 'heart_pulse', name: 'Heartstone Pulse', icon: '💎', faction: 'any', target: 'none', desc: 'Heal your Heartstone by 15% of its max HP.' },
];

const byId = new Map(CARDS.map((c) => [c.id, c]));
export const getCard = (id: string) => byId.get(id)!;

/** The cards a faction can bring: its own 3 plus the neutral ones. */
export function cardOptions(f: FactionId): CardDef[] {
  return CARDS.filter((c) => c.faction === f || c.faction === 'any');
}

export function defaultCards(f: FactionId): string[] {
  return cardOptions(f)
    .slice(0, CARDS_PER_PLAYER)
    .map((c) => c.id);
}
