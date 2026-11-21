/**
 * Headless balance run: bot vs bot, no rendering.
 *   npm run sim            -> 8 matches per matchup
 */
import type { FactionId } from '../src/data/types';
import { Match, type Mode } from '../src/game/match';

const N = 8;
const MAX_TIME = 25 * 60;
const factions: FactionId[] = ['union', 'bloomkin'];

function run(mode: Mode, blue: FactionId, red: FactionId) {
  let blueWins = 0;
  let redWins = 0;
  let timeouts = 0;
  let totalTime = 0;
  let peakUnits = 0;
  for (let i = 0; i < N; i++) {
    const m = new Match({ mode, playerFaction: blue, enemyFaction: red, difficulty: 'normal', seed: 1000 + i, human: false });
    while (m.world.winner === null && m.world.time < MAX_TIME) {
      m.step();
      peakUnits = Math.max(peakUnits, m.world.units.length);
    }
    totalTime += m.world.time;
    if (m.world.winner === 0) blueWins++;
    else if (m.world.winner === 1) redWins++;
    else timeouts++;
  }
  const avg = totalTime / N;
  console.log(
    `${mode}  ${blue.padEnd(8)} vs ${red.padEnd(8)}  blue ${String(blueWins).padStart(2)}  red ${String(redWins).padStart(2)}  timeouts ${timeouts}  ` +
      `avg ${Math.floor(avg / 60)}:${String(Math.round(avg % 60)).padStart(2, '0')}  peak units ${peakUnits}`,
  );
}

const t0 = Date.now();
for (const mode of ['1v1', '2v2'] as Mode[]) for (const a of factions) for (const b of factions) run(mode, a, b);
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
