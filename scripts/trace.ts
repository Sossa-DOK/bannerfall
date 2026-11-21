import { Match } from '../src/game/match';
const m = new Match({ mode: '1v1', playerFaction: 'union', enemyFaction: 'bloomkin', difficulty: 'normal', seed: 1003, human: false });
const w = m.world;
while (w.winner === null && w.time < 1500) {
  m.step();
  if (w.tick % 300 === 0) {
    const row = [0, 1].map((t) => {
      const b = w.buildings.filter((x) => x.team === t);
      const u = w.units.filter((x) => x.team === t);
      return `T${t} core ${Math.round(w.cores[t].hp)} bld ${b.length} units ${u.length} gold ${w.players.filter(p=>p.team===t).map(p=>p.gold).join('/')}`;
    });
    const xs = w.units.map((u) => u.x);
    console.log(`${Math.round(w.time)}s | ${row.join(' | ')} | front x ${Math.round(Math.min(...xs))}-${Math.round(Math.max(...xs))}`);
  }
}
console.log('winner', w.winner, 'at', Math.round(w.time));
