/**
 * Faction balance matrix: every pair of factions, 1v1, both sides of the map.
 *   npx tsx scripts/matrix.ts [matchesPerSide] [onlyFaction]
 * Prints each faction's win rate against every other faction, plus overall.
 */
import { FACTION_IDS } from '../src/data/factions';
import type { FactionId } from '../src/data/types';
import { Match } from '../src/game/match';

const args = (globalThis as unknown as { process: { argv: string[] } }).process.argv.slice(2);
const N = Number(args[0] ?? 10);
const only = args[1] as FactionId | undefined;
const wins: Record<string, number> = {};
const games: Record<string, number> = {};
let totalTime = 0;
let totalGames = 0;
const key = (a: FactionId, b: FactionId) => `${a}>${b}`;

for (let i = 0; i < FACTION_IDS.length; i++) {
  for (let j = i + 1; j < FACTION_IDS.length; j++) {
    const a = FACTION_IDS[i];
    const b = FACTION_IDS[j];
    if (only && a !== only && b !== only) continue;
    for (const [blue, red] of [[a, b], [b, a]] as const) {
      for (let k = 0; k < N; k++) {
        const m = new Match({ mode: '1v1', playerFaction: blue, enemyFaction: red, difficulty: 'normal', seed: 900 + k * 13 + i * 3 + j, human: false });
        while (m.world.winner === null && m.world.time < 1500) m.step();
        totalTime += m.world.time;
        totalGames++;
        games[key(a, b)] = (games[key(a, b)] ?? 0) + 1;
        if (m.world.winner === null) continue;
        const winner = m.world.winner === 0 ? blue : red;
        const loser = winner === a ? b : a;
        wins[key(winner, loser)] = (wins[key(winner, loser)] ?? 0) + 1;
      }
    }
  }
}

const pad = (s: string, n: number) => s.padEnd(n);
console.log(pad('win% (row vs col)', 18) + FACTION_IDS.map((f) => pad(f, 10)).join('') + 'overall');
for (const a of FACTION_IDS) {
  let w = 0;
  let g = 0;
  const cells = FACTION_IDS.map((b) => {
    if (a === b) return pad('—', 10);
    const games2 = games[key(a, b)] ?? games[key(b, a)] ?? 0;
    if (!games2) return pad('·', 10);
    const ww = wins[key(a, b)] ?? 0;
    w += ww;
    g += games2;
    return pad(`${Math.round((ww / games2) * 100)}%`, 10);
  });
  console.log(pad(a, 18) + cells.join('') + (g ? `${Math.round((w / g) * 100)}%` : '·'));
}
const avg = totalTime / totalGames;
console.log(`${totalGames} games, avg ${Math.floor(avg / 60)}:${String(Math.round(avg % 60)).padStart(2, '0')}`);
