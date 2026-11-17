/**
 * The game's sound system. Every sound is generated in code with the browser's Web Audio API,
 * so all audio is 100% original and nothing needs to be downloaded.
 *
 * Signal path:  sounds → effects bus ─┐
 *               music  → music bus ───┴→ master (mute) → speakers
 *
 * Browser rules: sound may only start after the player interacts with the page,
 * so `unlock()` is called from the tap/click/key that starts a game mode.
 */

export interface AudioSettings {
  muted: boolean;
  /** 0..1 */
  musicVolume: number;
  /** 0..1 */
  sfxVolume: number;
}

const STORAGE_KEY = 'racing-game-audio';
const DEFAULTS: AudioSettings = { muted: false, musicVolume: 0.6, sfxVolume: 0.8 };

/** Counts of sounds played, so automated tests can check the right sounds happen. */
export interface AudioStats {
  beep: number;
  go: number;
  impact: number;
  finish: number;
}

export class AudioManager {
  ctx: AudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  sfx!: GainNode;
  /** One second of white noise, shared by all noise-based sounds (tyres, drums, impacts). */
  noise!: AudioBuffer;
  readonly settings: AudioSettings;
  readonly stats: AudioStats = { beep: 0, go: 0, impact: 0, finish: 0 };
  private readonly listeners: (() => void)[] = [];

  constructor() {
    this.settings = loadSettings();

    // iPhone: an "ambient" audio session follows the silent switch and mixes with other apps' audio.
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) {
      try {
        session.type = 'ambient';
      } catch {
        /* not supported: the default already follows the silent switch */
      }
    }

    // Pause sound while the page is hidden (other tab, phone locked); resume when back.
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => undefined);
      else this.ctx.resume().catch(() => undefined);
    });
    // iPhone can interrupt audio (phone call, Siri); the next touch brings it back.
    const wake = () => {
      if (this.ctx && this.ctx.state !== 'running' && !document.hidden) this.ctx.resume().catch(() => undefined);
    };
    document.addEventListener('pointerdown', wake, true);
    document.addEventListener('keydown', wake, true);
  }

  get isReady() {
    return this.ctx !== null;
  }

  /** Must be called from inside a tap, click or key press (browser rule). Safe to call many times. */
  unlock() {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return; // very old browser: the game simply runs silently
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.music = ctx.createGain();
      this.music.connect(this.master);
      this.sfx = ctx.createGain();
      this.sfx.connect(this.master);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.applySettings(true);
      // Older iPhones need a sound to be started inside the tap to fully unlock audio.
      const silent = ctx.createBufferSource();
      silent.buffer = ctx.createBuffer(1, 1, 22050);
      silent.connect(ctx.destination);
      silent.start(0);
      this.listeners.forEach((fn) => fn());
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => undefined);
  }

  /** Called once audio is ready (so sounds can be created then). */
  onReady(fn: () => void) {
    this.listeners.push(fn);
    if (this.ctx) fn();
  }

  setMuted(muted: boolean) {
    this.settings.muted = muted;
    this.applySettings();
  }

  setMusicVolume(volume: number) {
    this.settings.musicVolume = clamp01(volume);
    this.applySettings();
  }

  setSfxVolume(volume: number) {
    this.settings.sfxVolume = clamp01(volume);
    this.applySettings();
  }

  private applySettings(immediate = false) {
    saveSettings(this.settings);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (param: AudioParam, value: number) => {
      if (immediate) param.value = value;
      else param.setTargetAtTime(value, t, 0.03);
    };
    set(this.master.gain, this.settings.muted ? 0 : 1);
    // Squared so the sliders feel even (our ears hear volume on a curve).
    set(this.music.gain, this.settings.musicVolume ** 2);
    set(this.sfx.gain, this.settings.sfxVolume ** 2);
  }
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
}

function loadSettings(): AudioSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<AudioSettings>;
    return {
      muted: typeof saved.muted === 'boolean' ? saved.muted : DEFAULTS.muted,
      musicVolume: typeof saved.musicVolume === 'number' ? clamp01(saved.musicVolume) : DEFAULTS.musicVolume,
      sfxVolume: typeof saved.sfxVolume === 'number' ? clamp01(saved.sfxVolume) : DEFAULTS.sfxVolume,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(settings: AudioSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* private browsing: settings just aren't remembered */
  }
}
