/**
 * Procedural audio: every sound effect and the music are synthesized with the
 * Web Audio API, so there are no audio files to download.
 *
 * - The AudioContext is created/resumed only from a user gesture (required by
 *   browsers, and by iOS after the app comes back from the background).
 * - Volume = user toggles (Sound / Music / Mute), overridden by the
 *   CrazyGames SDK `muteAudio` setting when present.
 */
import type { SimEvent } from '../sim/world';

export type TrackId = 'menu' | 'union' | 'bloomkin' | 'aerie' | 'choir';

type Sfx =
  | 'click' | 'error' | 'build' | 'upgrade' | 'bloom' | 'coin' | 'tier' | 'card' | 'cardEnemy' | 'gale' | 'heal'
  | 'echo' | 'silence' | 'root' | 'stun' | 'alarm' | 'victory' | 'defeat' | 'start' | 'death' | 'bigDeath'
  | 'pierce' | 'normal' | 'siege' | 'magic';

interface Settings {
  sound: boolean;
  music: boolean;
  muted: boolean;
}

const SETTINGS_KEY = 'bannerfall.audio';
const MAX_VOICES = 32;

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------- music definitions ----------------

interface Track {
  bpm: number;
  /** MIDI note of the key's root */
  root: number;
  /** one chord per bar, as semitone offsets from root */
  chords: number[][];
  arpWave: OscillatorType;
  /** chord-tone index per 16th step (-1 = rest), 8 steps repeating */
  arp: number[];
  arpOctave: number;
  padCutoff: number;
  padVoices: number;
  drums: 'none' | 'soft' | 'full';
}

const TRACKS: Record<TrackId, Track> = {
  // A minor: Am F C G — calm, no drums
  menu: { bpm: 78, root: 57, chords: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]], arpWave: 'triangle', arp: [0, -1, 1, -1, 2, -1, 1, -1], arpOctave: 12, padCutoff: 900, padVoices: 2, drums: 'none' },
  // D minor, brassy square arps, marching
  union: { bpm: 104, root: 50, chords: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-2, 2, 5]], arpWave: 'square', arp: [0, 1, 2, 1, 0, 2, 1, 2], arpOctave: 12, padCutoff: 1100, padVoices: 2, drums: 'full' },
  // G major, bright plucks
  bloomkin: { bpm: 96, root: 55, chords: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], arpWave: 'triangle', arp: [0, 2, 1, 2, 0, 2, 1, 3], arpOctave: 12, padCutoff: 1300, padVoices: 2, drums: 'full' },
  // E lydian, airy and fast
  aerie: { bpm: 112, root: 52, chords: [[0, 4, 7], [2, 6, 9], [5, 9, 12], [7, 11, 14]], arpWave: 'sine', arp: [0, 1, 2, 3, 2, 1, 0, 2], arpOctave: 24, padCutoff: 1600, padVoices: 2, drums: 'soft' },
  // C minor, slow choral pad
  choir: { bpm: 80, root: 48, chords: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-5, -1, 2]], arpWave: 'sine', arp: [0, -1, 2, -1, 1, -1, 2, -1], arpOctave: 12, padCutoff: 750, padVoices: 3, drums: 'soft' },
};

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private settings: Settings = { sound: true, music: true, muted: false };
  private sdkMuted = false;
  private ducked = false;
  private last: Record<string, number> = {};
  private voices = 0;

  // music sequencer
  private track: TrackId | null = null;
  private pendingTrack: TrackId | null = 'menu';
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;

  constructor() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as Partial<Settings> | null;
      if (s) this.settings = { ...this.settings, ...s };
    } catch {
      /* ignore */
    }
  }

  get state(): Readonly<Settings> {
    return this.settings;
  }

  /** Call from any user gesture. Creates or resumes the AudioContext. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes(true);
      this.timer = window.setInterval(() => this.schedule(), 25);
    }
    if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume();
  }

  /** Suspend while the tab is hidden; resume (if unlocked) when visible again. */
  setHidden(hidden: boolean) {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  setSdkMuted(m: boolean) {
    this.sdkMuted = m;
    this.applyVolumes();
  }

  toggle(key: keyof Settings) {
    this.settings[key] = !this.settings[key];
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* ignore */
    }
    this.applyVolumes();
  }

  /** Quieter music while paused or on the end screen. */
  setDucked(d: boolean) {
    if (this.ducked === d) return;
    this.ducked = d;
    this.applyVolumes();
  }

  get effectivelyMuted() {
    return this.settings.muted || this.sdkMuted;
  }

  private applyVolumes(instant = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (g: GainNode, v: number) => (instant ? g.gain.setValueAtTime(v, t) : g.gain.setTargetAtTime(v, t, 0.08));
    set(this.master, this.effectivelyMuted ? 0 : 1);
    set(this.sfxBus, this.settings.sound ? 0.9 : 0);
    set(this.musicBus, this.settings.music ? (this.ducked ? 0.14 : 0.32) : 0);
  }

  // ---------------- music ----------------

  setMusic(t: TrackId) {
    if (this.track === t && this.pendingTrack === null) return;
    this.pendingTrack = t; // switches at the next bar
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.15) {
      if (this.step % 16 === 0 && this.pendingTrack) {
        this.track = this.pendingTrack;
        this.pendingTrack = null;
      }
      if (this.track) this.playStep(TRACKS[this.track], this.step, this.nextTime);
      const tr = TRACKS[this.track ?? 'menu'];
      this.nextTime += 60 / tr.bpm / 4; // 16th note
      this.step++;
    }
  }

  private playStep(tr: Track, step: number, t: number) {
    const sixteenth = 60 / tr.bpm / 4;
    const bar = Math.floor(step / 16) % tr.chords.length;
    const s = step % 16;
    const chord = tr.chords[bar];
    const bus = this.musicBus;
    if (s === 0) {
      // pad: whole bar
      for (const n of chord)
        for (let v = 0; v < tr.padVoices; v++)
          this.tone(midi(tr.root + n), sixteenth * 16, { type: 'sawtooth', vol: 0.03, attack: 0.5, release: 0.6, detune: (v - (tr.padVoices - 1) / 2) * 9, cutoff: tr.padCutoff, at: t, bus, important: true });
    }
    if (s === 0 || s === 8 || (tr.drums === 'full' && s === 14)) {
      this.tone(midi(tr.root + chord[0] - 12), sixteenth * (s === 14 ? 2 : 6), { type: 'triangle', vol: 0.16, attack: 0.01, at: t, bus, important: true });
    }
    // arpeggio (sparser on the 2nd half of every other loop for variation)
    const idx = tr.arp[s % 8];
    const alt = Math.floor(step / (16 * tr.chords.length)) % 2 === 1;
    if (idx >= 0 && !(alt && s >= 8 && s % 4 === 2)) {
      const notes = [...chord, chord[0] + 12];
      this.tone(midi(tr.root + notes[idx % notes.length] + tr.arpOctave), sixteenth * 1.8, { type: tr.arpWave, vol: tr.arpWave === 'square' ? 0.025 : 0.05, attack: 0.005, cutoff: 2600, at: t, bus, important: true });
    }
    if (tr.drums !== 'none') {
      if (s === 0 || s === 8 || (tr.drums === 'full' && s === 10)) this.kick(t, tr.drums === 'full' ? 0.32 : 0.2);
      if (tr.drums === 'full' && (s === 4 || s === 12)) this.noise(0.09, { vol: 0.07, filter: 'bandpass', freq: 1800, at: t, bus, important: true }); // snare-ish
      if (s % 4 === 2) this.noise(0.03, { vol: tr.drums === 'full' ? 0.04 : 0.025, filter: 'highpass', freq: 7000, at: t, bus, important: true });
    }
  }

  private kick(t: number, vol: number) {
    this.tone(120, 0.22, { type: 'sine', vol, attack: 0.002, slideTo: 40, at: t, bus: this.musicBus, important: true });
  }

  // ---------------- synthesis primitives ----------------

  private tone(
    freq: number,
    dur: number,
    o: { type?: OscillatorType; vol?: number; attack?: number; release?: number; slideTo?: number; pan?: number; at?: number; delay?: number; detune?: number; cutoff?: number; bus?: GainNode; important?: boolean } = {},
  ) {
    const ctx = this.ctx;
    if (!ctx || (!o.important && this.voices >= MAX_VOICES)) return;
    const t = (o.at ?? ctx.currentTime) + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), t + dur);
    if (o.detune) osc.detune.setValueAtTime(o.detune, t);
    const g = ctx.createGain();
    const vol = o.vol ?? 0.1;
    const a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + (o.release ?? 0));
    let node: AudioNode = osc;
    if (o.cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.cutoff;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    this.out(g, o.pan, o.bus);
    osc.start(t);
    osc.stop(t + dur + (o.release ?? 0) + 0.05);
    this.voices++;
    osc.onended = () => this.voices--;
  }

  private noise(dur: number, o: { vol?: number; filter?: BiquadFilterType; freq?: number; slideTo?: number; q?: number; pan?: number; at?: number; delay?: number; bus?: GainNode; important?: boolean } = {}) {
    const ctx = this.ctx;
    if (!ctx || (!o.important && this.voices >= MAX_VOICES)) return;
    const t = (o.at ?? ctx.currentTime) + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.filter ?? 'lowpass';
    f.frequency.setValueAtTime(o.freq ?? 1000, t);
    if (o.slideTo) f.frequency.exponentialRampToValueAtTime(o.slideTo, t + dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol ?? 0.1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g);
    this.out(g, o.pan, o.bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
    this.voices++;
    src.onended = () => this.voices--;
  }

  private out(node: AudioNode, pan = 0, bus?: GainNode) {
    const ctx = this.ctx!;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p).connect(bus ?? this.sfxBus);
    } else node.connect(bus ?? this.sfxBus);
  }

  /** Rate limit per sound so hundreds of shots don't turn into noise. */
  private ok(key: string, gap: number) {
    const now = this.ctx!.currentTime;
    if (now - (this.last[key] ?? -9) < gap) return false;
    this.last[key] = now;
    return true;
  }

  // ---------------- sound effects ----------------

  play(name: Sfx, x?: number) {
    if (!this.ctx || this.ctx.state !== 'running' || !this.settings.sound || this.effectivelyMuted) return;
    const pan = x === undefined ? 0 : ((x - 640) / 640) * 0.7;
    const r = 1 + (Math.random() - 0.5) * 0.08; // slight pitch variation
    switch (name) {
      case 'click':
        if (this.ok(name, 0.03)) this.tone(900, 0.04, { vol: 0.08, important: true });
        break;
      case 'error':
        if (this.ok(name, 0.15)) this.tone(190, 0.14, { type: 'square', vol: 0.05, slideTo: 140, cutoff: 1200, important: true });
        break;
      case 'build':
        this.noise(0.14, { vol: 0.25, freq: 450, important: true });
        this.tone(220, 0.12, { type: 'triangle', vol: 0.15, slideTo: 160, important: true });
        this.tone(660, 0.18, { type: 'triangle', vol: 0.06, delay: 0.07, important: true });
        break;
      case 'upgrade':
        [523, 659, 784].forEach((f, i) => this.tone(f, 0.14, { type: 'triangle', vol: 0.08, delay: i * 0.07, important: true }));
        break;
      case 'bloom':
        [587, 740, 880].forEach((f, i) => this.tone(f, 0.2, { type: 'sine', vol: 0.07, delay: i * 0.08, important: true }));
        break;
      case 'coin':
        if (this.ok(name, 0.09)) {
          this.tone(1320 * r, 0.06, { vol: 0.03 });
          this.tone(1760 * r, 0.08, { vol: 0.025, delay: 0.04 });
        }
        break;
      case 'tier':
        [392, 523, 659, 784].forEach((f, i) => this.tone(f, i === 3 ? 0.5 : 0.16, { type: 'square', vol: 0.05, cutoff: 2000, delay: i * 0.11, important: true }));
        break;
      case 'card':
      case 'cardEnemy': {
        const v = name === 'card' ? 1 : 0.6;
        this.noise(0.4, { vol: 0.14 * v, filter: 'bandpass', freq: 400, slideTo: 3200, q: 2, pan, important: true });
        [523, 659, 784].forEach((f) => this.tone(f * (name === 'card' ? 1 : 0.84), 0.5, { type: 'triangle', vol: 0.05 * v, attack: 0.03, delay: 0.1, pan, important: true }));
        break;
      }
      case 'gale':
        this.noise(1.1, { vol: 0.32, filter: 'bandpass', freq: 300, slideTo: 1400, q: 1.5, important: true });
        this.noise(1.3, { vol: 0.18, filter: 'bandpass', freq: 1200, slideTo: 300, q: 1, delay: 0.2, important: true });
        break;
      case 'heal':
        if (this.ok(name, 0.18)) this.tone(880 * r, 0.16, { vol: 0.03, slideTo: 1320, pan });
        break;
      case 'echo':
        if (this.ok(name, 0.25)) {
          this.tone(440 * r, 0.6, { vol: 0.04, slideTo: 330, attack: 0.05, pan });
          this.tone(446 * r, 0.6, { vol: 0.04, slideTo: 333, attack: 0.05, pan });
        }
        break;
      case 'silence':
        this.tone(220, 0.9, { vol: 0.08, pan, important: true });
        this.tone(233, 0.9, { vol: 0.06, pan, important: true });
        break;
      case 'root':
        if (this.ok(name, 0.3)) {
          this.noise(0.35, { vol: 0.18, freq: 260, pan });
          this.tone(90, 0.3, { type: 'triangle', vol: 0.12, slideTo: 60, pan });
        }
        break;
      case 'stun':
        if (this.ok(name, 0.2)) this.noise(0.25, { vol: 0.12, filter: 'bandpass', freq: 800, slideTo: 2400, q: 3, pan });
        break;
      case 'alarm':
        if (this.ok(name, 2.5)) {
          this.tone(660, 0.1, { type: 'square', vol: 0.05, cutoff: 1800, important: true });
          this.tone(520, 0.14, { type: 'square', vol: 0.05, cutoff: 1800, delay: 0.13, important: true });
        }
        break;
      case 'victory':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i === 3 ? 0.9 : 0.2, { type: 'triangle', vol: 0.1, delay: i * 0.14, important: true }));
        break;
      case 'defeat':
        [392, 349, 311, 262].forEach((f, i) => this.tone(f, i === 3 ? 1.0 : 0.3, { type: 'sine', vol: 0.1, delay: i * 0.22, important: true }));
        break;
      case 'start':
        this.tone(262, 0.35, { type: 'sawtooth', vol: 0.06, cutoff: 1400, attack: 0.03, important: true });
        this.tone(392, 0.6, { type: 'sawtooth', vol: 0.06, cutoff: 1400, attack: 0.03, delay: 0.3, important: true });
        break;
      case 'death':
        if (this.ok(name, 0.05)) this.noise(0.08, { vol: 0.06, freq: 1300 * r, pan });
        break;
      case 'bigDeath':
        if (this.ok(name, 0.15)) {
          this.noise(0.45, { vol: 0.28, freq: 320, pan, important: true });
          this.tone(85, 0.4, { vol: 0.18, slideTo: 38, pan, important: true });
        }
        break;
      case 'pierce':
        if (this.ok(name, 0.05)) this.noise(0.035, { vol: 0.045, filter: 'highpass', freq: 3200 * r, pan });
        break;
      case 'normal':
        if (this.ok(name, 0.065)) this.tone(180 * r, 0.07, { type: 'triangle', vol: 0.07, slideTo: 90, pan });
        break;
      case 'siege':
        if (this.ok(name, 0.13)) {
          this.noise(0.25, { vol: 0.13, freq: 480, pan });
          this.tone(70 * r, 0.25, { vol: 0.12, slideTo: 35, pan });
        }
        break;
      case 'magic':
        if (this.ok(name, 0.075)) this.tone(600 * r, 0.09, { type: 'sawtooth', vol: 0.025, slideTo: 1400, cutoff: 2400, pan });
        break;
    }
  }

  /** Map simulation events to sounds. Only the human's own gold/upgrades make UI-style sounds. */
  event(e: SimEvent, humanId: number) {
    switch (e.type) {
      case 'shot':
        this.play(e.attack, (e.x1 + e.x2) / 2);
        break;
      case 'death':
        this.play(e.big ? 'bigDeath' : 'death', e.x);
        break;
      case 'bounty':
        if (e.owner === humanId && e.amount > 0) this.play('coin', e.x);
        break;
      case 'rank':
        if (e.owner === humanId) this.play(e.bloom ? 'bloom' : 'upgrade', e.x);
        break;
      case 'gale':
        this.play('gale');
        break;
      case 'heal':
        this.play('heal', e.x);
        break;
      case 'echo':
        this.play('echo', e.x);
        break;
      case 'silence':
        this.play('silence', e.x);
        break;
      case 'root':
        this.play('root', e.x);
        break;
      case 'stun':
        this.play('stun', e.x);
        break;
      case 'card':
        this.play(e.owner === humanId ? 'card' : 'cardEnemy', e.x);
        break;
    }
  }

  dispose() {
    if (this.timer !== null) clearInterval(this.timer);
  }
}

export const audio = new AudioEngine();
