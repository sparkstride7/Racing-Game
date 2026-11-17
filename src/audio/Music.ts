import type { AudioManager } from './AudioManager';

/**
 * Original background music, composed in code: an upbeat electronic racing loop at 128 BPM in A minor.
 *
 * Instruments (all synthesised): kick drum, clap, hi-hats, a pumping bass line, a 16th-note synth
 * arpeggio and a lead melody on alternate passes. Chord progression: Am – F – C – G (8-bar sections).
 *
 * Notes are scheduled slightly ahead of time on the audio clock, so the music stays perfectly
 * in time even if the game's frame rate dips.
 */

const BPM = 128;
const SIXTEENTH = 60 / BPM / 4;
const LOOKAHEAD = 0.15; // seconds of music scheduled in advance

/** Chord per bar, as MIDI note numbers (root, third, fifth). Two 4-bar phrases. */
const CHORDS = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62], // G
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [55, 59, 62], // G
  [52, 56, 59], // E (leads back to Am)
];

/** Lead melody (MIDI, null = rest), one note per 8th, for 8 bars. Played on every second pass. */
const MELODY: (number | null)[] = [
  76, null, 72, 76, 79, null, 76, null,   72, null, 69, 72, 77, null, 76, 72,
  72, null, 67, 72, 76, null, 79, null,   74, null, 71, 74, 79, 76, 74, null,
  76, null, 72, 76, 81, null, 79, 76,     77, null, 76, 72, 69, null, 72, null,
  74, null, 79, 77, 76, 74, 72, null,     71, null, 68, 71, 76, null, null, null,
];

const ARP_PATTERN = [0, 1, 2, 1, 2, 0, 1, 2, 0, 2, 1, 2, 0, 1, 2, 1];
const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export class Music {
  private readonly out: GainNode;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  playing = false;

  constructor(private readonly audio: AudioManager) {
    this.out = audio.ctx!.createGain();
    this.out.gain.value = 0;
    this.out.connect(audio.music);
  }

  /** Starts from the beginning. */
  start() {
    const ctx = this.audio.ctx!;
    this.stopTimer();
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.05;
    this.out.gain.cancelScheduledValues(ctx.currentTime);
    this.out.gain.setTargetAtTime(0.55, ctx.currentTime, 0.05);
    this.playing = true;
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  /** Turns the music down (e.g. after the finish line) without stopping it. */
  duck(level = 0.25) {
    this.out.gain.setTargetAtTime(0.55 * level, this.audio.ctx!.currentTime, 0.6);
  }

  /** Fades out and stops. */
  stop() {
    if (!this.playing) return;
    this.playing = false;
    this.out.gain.setTargetAtTime(0, this.audio.ctx!.currentTime, 0.25);
    this.stopTimer();
  }

  private stopTimer() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private schedule() {
    const ctx = this.audio.ctx!;
    // If the page was in the background, skip ahead instead of playing a burst of late notes.
    if (this.nextTime < ctx.currentTime - 0.05) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += SIXTEENTH;
      this.step++;
    }
  }

  /** One 16th-note step of the song. */
  private playStep(step: number, t: number) {
    const inBar = step % 16;
    const bar = Math.floor(step / 16);
    const pass = Math.floor(bar / CHORDS.length);
    const chord = CHORDS[bar % CHORDS.length];
    const intro = bar < 2; // first two bars: drums and bass only

    // Drums.
    if (inBar % 4 === 0) this.kick(t);
    if (inBar === 4 || inBar === 12) this.clap(t);
    if (inBar % 4 === 2) this.hat(t, 0.09);
    else if (inBar % 2 === 1) this.hat(t, 0.035);

    // Bass: pumping 8ths on the root, jumping an octave on the off-beats.
    if (inBar % 2 === 0) {
      const octave = inBar % 4 === 2 ? 12 : 0;
      this.bass(freq(chord[0] - 24 + octave), t, SIXTEENTH * 1.7);
    }
    if (intro) return;

    // Arpeggio: chord notes an octave up, every 16th.
    this.synth(freq(chord[ARP_PATTERN[inBar]] + 12), t, SIXTEENTH * 0.9, 0.035, 'square', 2600);

    // Lead melody on every second pass through the progression.
    if (pass % 2 === 1 && inBar % 2 === 0) {
      const m = MELODY[(bar % CHORDS.length) * 8 + inBar / 2];
      if (m !== null && m !== undefined) this.synth(freq(m), t, SIXTEENTH * 1.8, 0.06, 'sawtooth', 3200);
    }
  }

  private kick(t: number) {
    const ctx = this.audio.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.9, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  private clap(t: number) {
    this.noiseHit(t, 'bandpass', 1500, 0.4, 0.12);
  }

  private hat(t: number, volume: number) {
    this.noiseHit(t, 'highpass', 7500, volume, 0.04);
  }

  private noiseHit(t: number, type: BiquadFilterType, frequency: number, volume: number, length: number) {
    const ctx = this.audio.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.audio.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + length);
    src.connect(filter).connect(gain).connect(this.out);
    src.start(t, Math.random() * 0.8);
    src.stop(t + length + 0.02);
  }

  private bass(frequency: number, t: number, length: number) {
    const ctx = this.audio.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = frequency;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(220, t + length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.32, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + length);
    osc.connect(filter).connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + length + 0.02);
  }

  private synth(frequency: number, t: number, length: number, volume: number, type: OscillatorType, cutoff: number) {
    const ctx = this.audio.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, t + length);
    osc.connect(filter).connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + length + 0.02);
  }
}
