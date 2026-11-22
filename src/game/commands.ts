import type { World } from '../sim/world';

/**
 * Everything a player can do, as plain data. Local games apply these at once;
 * online games send them to the other player and both apply them on the same tick.
 */
export type Command =
  | { k: 'place'; def: string; col: number; row: number }
  | { k: 'upgrade'; bid: number }
  | { k: 'overclock'; bid: number }
  | { k: 'gale' }
  | { k: 'cast'; idx: number; x: number; y: number };

export function applyCommand(w: World, pid: number, c: Command): boolean {
  switch (c.k) {
    case 'place':
      return w.place(pid, c.def, c.col, c.row);
    case 'upgrade':
      return w.upgrade(pid, c.bid);
    case 'overclock':
      return w.overclock(pid, c.bid);
    case 'gale':
      return w.gale(pid);
    case 'cast':
      return w.cast(pid, c.idx, c.x, c.y);
  }
}

/** Cheap fingerprint of the simulation state, compared between peers to detect desyncs. */
export function worldHash(w: World): number {
  let h = 2166136261 >>> 0;
  const mix = (v: number) => {
    h ^= Math.round(v * 16) | 0;
    h = Math.imul(h, 16777619) >>> 0;
  };
  mix(w.tick);
  for (const u of w.units) {
    mix(u.id);
    mix(u.x);
    mix(u.y);
    mix(u.hp);
  }
  for (const b of w.buildings) {
    mix(b.id);
    mix(b.hp);
    mix(b.rank);
  }
  for (const c of w.cores) mix(c.hp);
  for (const p of w.players) mix(p.gold);
  return h;
}
