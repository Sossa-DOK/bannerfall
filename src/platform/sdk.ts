/**
 * Thin wrapper over the CrazyGames HTML5 SDK v3.
 * The SDK script is NOT included yet (prototype). When it is added to index.html:
 *   <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
 * these calls go live; until then every call is a safe no-op.
 */
interface CgSdk {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  game: {
    gameplayStart(): void;
    gameplayStop(): void;
    happytime(): void;
    settings?: { muteAudio?: boolean };
    addSettingsChangeListener?(cb: (s: { muteAudio?: boolean }) => void): void;
  };
  user?: { systemInfo?: { device?: { type?: 'desktop' | 'tablet' | 'mobile' } } };
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
  /** 'mobile' | 'tablet' | 'desktop' from the SDK when available (CrazyGames asks games to use this, not touch sniffing). */
  deviceType(): string | null {
    return sdk?.user?.systemInfo?.device?.type ?? null;
  },
  /** CrazyGames' muteAudio setting must override in-game audio toggles. Calls cb now and on every change. */
  watchMute(cb: (muted: boolean) => void) {
    if (!sdk) return;
    cb(!!sdk.game.settings?.muteAudio);
    sdk.game.addSettingsChangeListener?.((s) => cb(!!s.muteAudio));
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
