/**
 * Dev-only: automated online test between two real browsers.
 * The page reports to a local collector (scripts/nettest.py) on port 5299.
 */
import { FACTIONS } from '../data/factions';
import { worldHash, type Command } from '../game/commands';
import type { Match } from '../game/match';
import type { Lockstep } from './lockstep';

interface Hooks {
  hostGame(): Promise<void>;
  joinGame(code: string): Promise<void>;
  act(c: Command): boolean;
  getMatch(): Match | null;
  getOnline(): { ls: Lockstep; seat: 0 | 1 } | null;
}

const report = (data: unknown) =>
  fetch('http://127.0.0.1:5299/report', { method: 'POST', body: JSON.stringify(data) }).catch(() => {});

export async function runNetTest(h: Hooks) {
  const q = new URLSearchParams(location.search);
  const role = q.get('nettest');
  const CHECK_TURN = Number(q.get('turns') ?? 400);
  if (role === 'host') {
    const timer = setInterval(() => {
      const code = document.getElementById('code-text')?.textContent;
      if (code) {
        clearInterval(timer);
        void report({ role, code });
      }
    }, 200);
    void h.hostGame();
  } else {
    await h.joinGame(q.get('code') ?? '');
  }
  // wait for the match, then play random commands and report at a fixed turn
  let sent = 0;
  let done = false;
  const tick = setInterval(() => {
    const o = h.getOnline();
    const m = h.getMatch();
    const status = document.getElementById('online-status')?.textContent;
    if (!o || !m) {
      if (status && /fail|No game|Could not|different/i.test(status)) void report({ role, error: status });
      return;
    }
    const w = m.world;
    const me = m.humanId;
    if (Math.random() < 0.25) {
      const defs = FACTIONS[w.players[me].faction].buildings;
      const g = w.grid(me);
      const r = Math.random();
      const mine = w.buildings.filter((b) => b.owner === me);
      const c: Command =
        r < 0.7 || !mine.length
          ? { k: 'place', def: defs[Math.floor(Math.random() * 6)].id, col: Math.floor(Math.random() * g.cols), row: Math.floor(Math.random() * g.rows) }
          : r < 0.9
            ? { k: 'upgrade', bid: mine[Math.floor(Math.random() * mine.length)].id }
            : { k: 'cast', idx: Math.floor(Math.random() * 3), x: 640, y: 360 };
      if (h.act(c)) sent++;
    }
    if (!done && (o.ls.turn >= CHECK_TURN || w.winner !== null || o.ls.desync)) {
      done = true;
      void report({
        role, seat: o.seat, turn: o.ls.turn, tick: w.tick, hash: worldHash(w), desync: o.ls.desync, rtt: Math.round(o.ls.rtt),
        sent, buildings: w.buildings.length, units: w.units.length, winner: w.winner, ua: navigator.userAgent.split(' ').pop(),
      });
    }
  }, 100);
  void tick;
}
