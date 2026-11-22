import { applyCommand, worldHash, type Command } from '../game/commands';
import type { Match } from '../game/match';
import { TICK } from '../sim/world';

/**
 * Deterministic lockstep for online 1v1.
 *
 * Both players run the same simulation. Time is cut into turns of TURN_TICKS
 * ticks. Each player sends their commands for a turn DELAY_TURNS turns ahead
 * (≈ input delay), and a turn only runs once both players' commands for it
 * have arrived. Every HASH_EVERY turns the state fingerprint is exchanged to
 * catch desyncs.
 */
export const TURN_TICKS = 2; // 100 ms per turn
export const DELAY_TURNS = 3; // ≈300 ms input delay
const HASH_EVERY = 20; // every 2 s
const TURN_TIME = TURN_TICKS * TICK;

export type NetMsg =
  | { t: 'turn'; n: number; cmds: Command[]; hash?: [number, number] }
  | { t: 'ping'; ts: number }
  | { t: 'pong'; ts: number }
  | { t: 'bye' };

export interface Link {
  send(msg: unknown): void;
}

export class Lockstep {
  /** next turn to execute */
  turn = 0;
  private remote = new Map<number, Command[]>();
  private pending: Command[] = [];
  private myHashes = new Map<number, number>();
  private acc = 0;
  /** seconds we've been waiting for the opponent's next turn */
  stalled = 0;
  desync: string | null = null;
  rtt = 0;
  private pingT = 0;

  constructor(
    private m: Match,
    private link: Link,
    private seat: 0 | 1,
    private onTick: () => void,
  ) {
    // the first DELAY_TURNS turns are empty for both players by definition
    for (let n = 0; n < DELAY_TURNS; n++) this.remote.set(n, []);
  }

  /** Queue a local command; it runs DELAY_TURNS turns from now on both machines. */
  queue(c: Command) {
    this.pending.push(c);
  }

  receive(msg: NetMsg) {
    switch (msg.t) {
      case 'turn':
        this.remote.set(msg.n, msg.cmds);
        if (msg.hash) {
          const [n, h] = msg.hash;
          const mine = this.myHashes.get(n);
          if (mine !== undefined && mine !== h) this.desync = `turn ${n}`;
          else if (mine === undefined) this.theirHashes.set(n, h);
        }
        break;
      case 'ping':
        this.link.send({ t: 'pong', ts: msg.ts });
        break;
      case 'pong':
        this.rtt = performance.now() - msg.ts;
        break;
    }
  }

  private theirHashes = new Map<number, number>();

  /** Advance as far as real time and the opponent allow. */
  update(dt: number) {
    if (this.m.world.winner !== null || this.desync) return;
    this.pingT -= dt;
    if (this.pingT <= 0) {
      this.pingT = 2;
      this.link.send({ t: 'ping', ts: performance.now() });
    }
    this.acc = Math.min(this.acc + dt, TURN_TIME * 6);
    // catch up faster if the opponent is well ahead of us
    const ahead = this.remote.size > DELAY_TURNS + 3;
    let ran = 0;
    while ((this.acc >= TURN_TIME || (ahead && ran < 3)) && this.m.world.winner === null) {
      if (!this.remote.has(this.turn)) {
        this.stalled += dt;
        return;
      }
      this.runTurn();
      this.acc = Math.max(0, this.acc - TURN_TIME);
      ran++;
      if (ran >= 6) break;
    }
    if (ran > 0) this.stalled = 0;
  }

  private runTurn() {
    const n = this.turn;
    const theirs = this.remote.get(n)!;
    this.remote.delete(n);
    const mine = this.mine.get(n) ?? [];
    this.mine.delete(n);

    // send our commands for a future turn (one message per turn, even if empty)
    const future = n + DELAY_TURNS;
    const out: NetMsg = { t: 'turn', n: future, cmds: this.pending };
    this.mine.set(future, this.pending);
    this.pending = [];
    if (n > 0 && n % HASH_EVERY === 0 && this.myHashes.has(n)) out.hash = [n, this.myHashes.get(n)!];
    this.link.send(out);

    // apply both players' commands in a fixed order: seat 0 first, then seat 1
    const w = this.m.world;
    const [c0, c1] = this.seat === 0 ? [mine, theirs] : [theirs, mine];
    for (const c of c0) applyCommand(w, 0, c);
    for (const c of c1) applyCommand(w, 1, c);
    for (let i = 0; i < TURN_TICKS && w.winner === null; i++) {
      this.m.step();
      this.onTick();
    }
    this.turn++;
    if (this.turn % HASH_EVERY === 0) {
      const h = worldHash(w);
      this.myHashes.set(this.turn, h);
      const theirsH = this.theirHashes.get(this.turn);
      if (theirsH !== undefined && theirsH !== h) this.desync = `turn ${this.turn}`;
      if (this.myHashes.size > 50) this.myHashes.delete(Math.min(...this.myHashes.keys()));
    }
  }

  private mine = new Map<number, Command[]>();
}
