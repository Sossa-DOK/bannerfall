import { Bot, INCOME_MULT, type Difficulty } from '../ai/bot';
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
}

const other = (f: FactionId): FactionId => (f === 'union' ? 'bloomkin' : 'union');

/** Wraps a World with its bots. Same setup + same commands => same result. */
export class Match {
  readonly world: World;
  readonly bots: Bot[];
  readonly humanId: number;

  constructor(readonly setup: MatchSetup) {
    const enemyMult = INCOME_MULT[setup.difficulty];
    const players: PlayerConfig[] = [
      { team: 0, slot: 0, faction: setup.playerFaction, isHuman: setup.human, name: setup.human ? 'You' : 'Blue bot' },
    ];
    if (setup.mode === '2v2') players.push({ team: 0, slot: 1, faction: other(setup.playerFaction), isHuman: false, name: 'Ally bot' });
    players.push({ team: 1, slot: 0, faction: setup.enemyFaction, isHuman: false, name: 'Red bot', incomeMult: enemyMult });
    if (setup.mode === '2v2') players.push({ team: 1, slot: 1, faction: other(setup.enemyFaction), isHuman: false, name: 'Red bot 2', incomeMult: enemyMult });

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
