/**
 * Thin wrapper over the CrazyGames HTML5 SDK v3.
 * The SDK script is NOT included yet (prototype). When it is added to index.html:
 *   <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
 * these calls go live; until then every call is a safe no-op.
 */
interface CgSdk {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  game: { gameplayStart(): void; gameplayStop(): void; happytime(): void };
}

let sdk: CgSdk | null = null;

export const platform = {
  async init() {
    const s = (window as unknown as { CrazyGames?: { SDK?: CgSdk } }).CrazyGames?.SDK;
    if (!s) return;
    try {
      await s.init();
      if (s.environment !== 'disabled') sdk = s;
    } catch (e) {
      console.warn('CrazyGames SDK init failed', e);
    }
  },
  gameplayStart() {
    sdk?.game.gameplayStart();
  },
  gameplayStop() {
    sdk?.game.gameplayStop();
  },
  happytime() {
    sdk?.game.happytime();
  },
};
