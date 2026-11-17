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

/**
 * Where the settings came from / whether saving works, shown in the Sound settings panel.
 * - restored: saved settings were found and loaded
 * - defaults: nothing saved yet on this device (first visit, or the browser cleared it)
 * - saved: the player's latest change was saved and read back successfully
 * - unavailable: this browser won't let the game store anything
 */
export type StorageStatus = 'restored' | 'defaults' | 'saved' | 'unavailable';

export class AudioManager {
  ctx: AudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  sfx!: GainNode;
  /** One second of white noise, shared by all noise-based sounds (tyres, drums, impacts). */
  noise!: AudioBuffer;
  readonly settings: AudioSettings;
  storageStatus: StorageStatus;
  readonly stats: AudioStats = { beep: 0, go: 0, impact: 0, finish: 0 };
  private readonly listeners: (() => void)[] = [];

  constructor() {
    const loaded = loadSettings();
    this.settings = loaded.settings;
    this.storageStatus = loaded.status;

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
      // Use the loaded settings. Nothing is saved here: only the player's own changes are saved,
      // so starting the game can never overwrite saved settings with the defaults.
      this.applySettings(true, false);
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

  private applySettings(immediate = false, save = true) {
    if (save) this.storageStatus = saveSettings(this.settings) ? 'saved' : 'unavailable';
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

/**
 * Reads saved settings. Defaults are used only for values that were never saved
 * (or are unreadable), so one damaged value can't reset the others.
 */
function loadSettings(): { settings: AudioSettings; status: StorageStatus } {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { settings: { ...DEFAULTS }, status: 'unavailable' };
  }
  if (raw === null) return { settings: { ...DEFAULTS }, status: 'defaults' };
  let saved: Partial<AudioSettings> = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') saved = parsed as Partial<AudioSettings>;
  } catch {
    /* damaged entry: fall back to defaults below */
  }
  const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const settings = {
    muted: typeof saved.muted === 'boolean' ? saved.muted : DEFAULTS.muted,
    musicVolume: valid(saved.musicVolume) ? clamp01(saved.musicVolume) : DEFAULTS.musicVolume,
    sfxVolume: valid(saved.sfxVolume) ? clamp01(saved.sfxVolume) : DEFAULTS.sfxVolume,
  };
  return { settings, status: 'restored' };
}

/** Saves the settings and reads them back to make sure they really were stored. */
function saveSettings(settings: AudioSettings): boolean {
  const json = JSON.stringify(settings);
  try {
    localStorage.setItem(STORAGE_KEY, json);
    return localStorage.getItem(STORAGE_KEY) === json;
  } catch {
    return false; // storage blocked or full
  }
}
