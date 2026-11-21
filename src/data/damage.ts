import type { ArmorType, AttackType } from './types';

/** Starting damage table — tune with `npm run sim`. */
export const DAMAGE: Record<AttackType, Record<ArmorType, number>> = {
  pierce: { light: 1.5, heavy: 0.75, fortified: 0.5, arcane: 1.25 },
  normal: { light: 1.0, heavy: 1.25, fortified: 0.75, arcane: 1.0 },
  siege: { light: 0.75, heavy: 1.0, fortified: 1.5, arcane: 0.75 },
  magic: { light: 1.0, heavy: 1.5, fortified: 0.75, arcane: 0.5 },
};

export const ARMORS: ArmorType[] = ['light', 'heavy', 'fortified', 'arcane'];

export function strongVs(attack: AttackType): ArmorType[] {
  return ARMORS.filter((a) => DAMAGE[attack][a] >= 1.25);
}

export function weakVs(attack: AttackType): ArmorType[] {
  return ARMORS.filter((a) => DAMAGE[attack][a] <= 0.75);
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
