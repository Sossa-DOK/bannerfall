/**
 * Player vs AI economy check: your side is flown by a Normal bot, the enemy plays at the
 * given difficulty (with its income multiplier). Prints average gold EARNED per side
 * (income + bounties + cards) by minute, across every faction pairing.
 *   npx tsx scripts/income-trace.ts [easy|normal|hard]
 */
import { Bot, type Difficulty } from '../src/ai/bot';
import { FACTION_IDS } from '../src/data/factions';
import { Match } from '../src/game/match';

const args = (globalThis as unknown as { process: { argv: string[] } }).process.argv.slice(2);
const diff = (args[0] ?? 'normal') as Difficulty;
const N = 5;
const MIN = 8;
const earned = [Array(MIN).fill(0), Array(MIN).fill(0)];
const running = Array(MIN).fill(0);
let blueWins = 0;
let redWins = 0;
for (const a of FACTION_IDS)
  for (const b of FACTION_IDS)
    for (let k = 0; k < N; k++) {
      const m = new Match({ mode: '1v1', playerFaction: a, enemyFaction: b, difficulty: diff, seed: 5 + k * 17, human: true });
      const w = m.world;
      const bots = [new Bot(w, 0, 'normal'), ...m.bots];
      const e = [0, 0];
      let lastMin = 0;
      while (w.winner === null && w.time < 1500) {
        for (const bot of bots) bot.update(1 / 20);
        const g = w.players.map((p) => p.gold);
        w.step();
        for (const p of w.players) e[p.id] += p.gold - g[p.id];
        const minute = Math.floor(w.time / 60);
        if (minute > lastMin && minute <= MIN) {
          lastMin = minute;
          earned[0][minute - 1] += e[0];
          earned[1][minute - 1] += e[1];
          running[minute - 1]++;
        }
      }
      if (w.winner === 0) blueWins++;
      else if (w.winner === 1) redWins++;
    }
console.log(`AI difficulty ${diff} (your side flown by a Normal bot)`);
for (let i = 0; i < MIN; i++)
  if (running[i])
    console.log(
      `min ${i + 1}: you earned ${Math.round(earned[0][i] / running[i])}  AI earned ${Math.round(earned[1][i] / running[i])}  ` +
        `AI/you ${(earned[1][i] / earned[0][i]).toFixed(2)}  (${running[i]} games still running)`,
    );
console.log(`wins: you ${blueWins}, AI ${redWins}`);
