import { Bot, INCOME_MULT, type Difficulty } from '../ai/bot';
import { CARDS_PER_PLAYER, cardOptions } from '../data/cards';
import { FACTION_IDS } from '../data/factions';
import { Rng } from '../sim/rng';
import type { FactionId } from '../data/types';
import { World, type PlayerConfig } from '../sim/world';

export type Mode = '1v1' | '2v2';

export interface MatchSetup {
  mode: Mode;
  playerFaction: FactionId;
  enemyFaction: FactionId;
  difficulty: Difficulty;
  seed: number;
  /** false = every seat is a bot (headless balance runs) */
  human: boolean;
  /** the human's Commander Cards (bots pick their own) */
  playerCards?: string[];
  /** Online 1v1: two humans, no bots. Seat 0 = host (blue, left), seat 1 = guest (red, right). */
  online?: OnlineSeats;
}

export interface OnlineSeats {
  localSeat: 0 | 1;
  host: { faction: FactionId; cards: string[] };
  guest: { faction: FactionId; cards: string[] };
}

/** Bots bring a random hand of cards (deterministic from the seed). */
function botCards(f: FactionId, rng: Rng): string[] {
  const pool = cardOptions(f).map((c) => c.id);
  const out: string[] = [];
  while (out.length < CARDS_PER_PLAYER && pool.length) out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
  return out;
}

/** A different faction than `f`, picked deterministically from the seed. */
export function otherFaction(f: FactionId, seed: number, avoid: FactionId[] = []): FactionId {
  const pool = FACTION_IDS.filter((x) => x !== f && !avoid.includes(x));
  const list = pool.length ? pool : FACTION_IDS.filter((x) => x !== f);
  return list[(seed >>> 0) % list.length];
}

/** Wraps a World with its bots. Same setup + same commands => same result. */
export class Match {
  readonly world: World;
  readonly bots: Bot[];
  readonly humanId: number;

  constructor(readonly setup: MatchSetup) {
    if (setup.online) {
      const o = setup.online;
      const players: PlayerConfig[] = [
        { team: 0, slot: 0, faction: o.host.faction, isHuman: true, name: o.localSeat === 0 ? 'You' : 'Opponent', cards: o.host.cards },
        { team: 1, slot: 0, faction: o.guest.faction, isHuman: true, name: o.localSeat === 1 ? 'You' : 'Opponent', cards: o.guest.cards },
      ];
      this.world = new World({ seed: setup.seed, players });
      this.humanId = o.localSeat;
      this.bots = [];
      return;
    }
    // The income handicap only applies against a person; bot-vs-bot balance runs stay even.
    const enemyMult = setup.human ? INCOME_MULT[setup.difficulty] : 1;
    const players: PlayerConfig[] = [
      { team: 0, slot: 0, faction: setup.playerFaction, isHuman: setup.human, name: setup.human ? 'You' : 'Blue bot' },
    ];
    const ally = otherFaction(setup.playerFaction, setup.seed);
    if (setup.mode === '2v2') players.push({ team: 0, slot: 1, faction: ally, isHuman: false, name: 'Ally bot' });
    players.push({ team: 1, slot: 0, faction: setup.enemyFaction, isHuman: false, name: 'Red bot', incomeMult: enemyMult });
    if (setup.mode === '2v2') players.push({ team: 1, slot: 1, faction: otherFaction(setup.enemyFaction, setup.seed >>> 3), isHuman: false, name: 'Red bot 2', incomeMult: enemyMult });

    const cardRng = new Rng(setup.seed ^ 0x5eed);
    for (const p of players) p.cards = p.isHuman && setup.playerCards ? setup.playerCards : botCards(p.faction, cardRng);

    this.world = new World({ seed: setup.seed, players });
    this.humanId = setup.human ? 0 : -1;
    this.bots = this.world.players
      .filter((p) => !p.isHuman)
      .map((p) => new Bot(this.world, p.id, p.team === 1 ? setup.difficulty : 'normal'));
  }

  step() {
    for (const b of this.bots) b.update(1 / 20);
    this.world.step();
  }
}
