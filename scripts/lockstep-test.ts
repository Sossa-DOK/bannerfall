/**
 * Headless lockstep test: two peers, a fake laggy network, random commands.
 * Both simulations must stay identical (same state hash) to the end.
 *   npx tsx scripts/lockstep-test.ts [games]
 */
import { defaultCards } from '../src/data/cards';
import { FACTIONS, FACTION_IDS } from '../src/data/factions';
import type { Command } from '../src/game/commands';
import { worldHash } from '../src/game/commands';
import { Match } from '../src/game/match';
import { Lockstep, type NetMsg } from '../src/net/lockstep';
import { Rng } from '../src/sim/rng';

const args = (globalThis as unknown as { process: { argv: string[] } }).process.argv.slice(2);
const GAMES = Number(args[0] ?? 6);
(globalThis as any).performance ??= { now: () => Date.now() };

let failures = 0;
for (let g = 0; g < GAMES; g++) {
  const rng = new Rng(1000 + g);
  const hostF = FACTION_IDS[g % 4];
  const guestF = FACTION_IDS[(g + 1 + (g >> 2)) % 4];
  const seats = { host: { faction: hostF, cards: defaultCards(hostF) }, guest: { faction: guestF, cards: defaultCards(guestF) } };
  const seed = 77 + g;
  const m = [0, 1].map((s) => new Match({ mode: '1v1', playerFaction: hostF, enemyFaction: guestF, difficulty: 'normal', seed, human: true, online: { localSeat: s as 0 | 1, ...seats } }));
  // fake network: messages arrive after a random 20–250 ms delay, in order
  let clock = 0;
  const inbox: { at: number; to: number; msg: NetMsg }[][] = [[], []];
  const ls = [0, 1].map((s) =>
    new Lockstep(m[s], { send: (msg) => {
      const q = inbox[1 - s];
      const last = q.length ? q[q.length - 1].at : 0;
      q.push({ at: Math.max(last, clock + 0.02 + rng.next() * 0.23), to: 1 - s, msg: JSON.parse(JSON.stringify(msg)) });
    } }, s as 0 | 1, () => {}),
  );
  let cmdsSent = 0;
  const randomCmd = (s: number): Command | null => {
    const w = m[s].world;
    const p = w.players[s];
    const r = rng.next();
    if (r < 0.55) {
      const defs = FACTIONS[p.faction].buildings;
      const g2 = w.grid(s);
      return { k: 'place', def: defs[Math.floor(rng.next() * defs.length)].id, col: Math.floor(rng.next() * g2.cols), row: Math.floor(rng.next() * g2.rows) };
    }
    const mine = w.buildings.filter((b) => b.owner === s);
    if (r < 0.75 && mine.length) return { k: 'upgrade', bid: mine[Math.floor(rng.next() * mine.length)].id };
    if (r < 0.85 && mine.length) return { k: 'overclock', bid: mine[Math.floor(rng.next() * mine.length)].id };
    if (r < 0.9) return { k: 'gale' };
    return { k: 'cast', idx: Math.floor(rng.next() * 3), x: 200 + rng.next() * 880, y: 300 + rng.next() * 120 };
  };
  // run up to 12 simulated minutes, frames of 1/60 s with jitter
  while (clock < 720 && m[0].world.winner === null) {
    const dt = 1 / 60 + (rng.next() - 0.5) * 0.01;
    clock += dt;
    for (const s of [0, 1]) {
      while (inbox[s].length && inbox[s][0].at <= clock) ls[s].receive(inbox[s].shift()!.msg);
      if (rng.next() < 0.03) {
        const c = randomCmd(s);
        if (c) {
          ls[s].queue(c);
          cmdsSent++;
        }
      }
      ls[s].update(dt);
    }
    if (ls[0].desync || ls[1].desync) break;
  }
  // let the trailing turn finish on both
  const h = [worldHash(m[0].world), worldHash(m[1].world)];
  const sameTick = m[0].world.tick === m[1].world.tick;
  const ok = !ls[0].desync && !ls[1].desync && (!sameTick || h[0] === h[1]);
  if (!ok) failures++;
  console.log(
    `game ${g}: ${hostF} vs ${guestF}  ${ok ? 'OK ' : 'FAIL'}  ticks ${m[0].world.tick}/${m[1].world.tick}  time ${Math.round(m[0].world.time)}s  cmds ${cmdsSent}  ` +
      `winner ${m[0].world.winner}/${m[1].world.winner}  desync ${ls[0].desync ?? '-'}/${ls[1].desync ?? '-'}  hash ${sameTick ? (h[0] === h[1] ? 'match' : 'DIFF') : 'n/a'}`,
  );
}
console.log(failures ? `${failures} FAILED` : 'all games stayed in sync');
