/**
 * Quick faction matchup check: Union vs Bloomkin, both sides of the map.
 *   npx tsx scripts/matchup.ts [matchesPerSide] [mode]
 */
import { Match, type Mode } from '../src/game/match';

const args = (globalThis as unknown as { process: { argv: string[] } }).process.argv.slice(2);
const N = Number(args[0] ?? 8);
const mode = (args[1] ?? '1v1') as Mode;
let union = 0, bloom = 0, draws = 0, time = 0;
for (const side of [0, 1]) {
  for (let i = 0; i < N; i++) {
    const blue = side === 0 ? 'union' : 'bloomkin';
    const red = side === 0 ? 'bloomkin' : 'union';
    const m = new Match({ mode, playerFaction: blue, enemyFaction: red, difficulty: 'normal', seed: 500 + i * 7 + side, human: false });
    while (m.world.winner === null && m.world.time < 1500) m.step();
    time += m.world.time;
    if (m.world.winner === null) draws++;
    else if ((m.world.winner === 0) === (blue === 'union')) union++;
    else bloom++;
  }
}
const avg = time / (2 * N);
console.log(`${mode}: Union ${union} – Bloomkin ${bloom} – draws ${draws} · avg ${Math.floor(avg / 60)}:${String(Math.round(avg % 60)).padStart(2, '0')}`);
