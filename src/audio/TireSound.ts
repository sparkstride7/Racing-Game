import { clamp } from '../utils/math';
import type { AudioManager } from './AudioManager';

/**
 * Tyre squeal: looping white noise through a narrow, resonant filter, which sounds like
 * rubber scrubbing on asphalt. It gets louder (and slightly higher) the faster the car slides sideways.
 */
export class TireSound {
  private readonly filter: BiquadFilterNode;
  private readonly out: GainNode;
  /** Current loudness 0..1, for tests. */
  level = 0;

  constructor(private readonly audio: AudioManager) {
    const ctx = audio.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = audio.noise;
    source.loop = true;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'bandpass';
    this.filter.frequency.value = 1700;
    this.filter.Q.value = 9;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    source.connect(this.filter).connect(this.out).connect(audio.sfx);
    source.start();
  }

  /** `slideSpeed`: sideways speed of the car in m/s. `speed`: forward speed in m/s. */
  update(slideSpeed: number, speed: number) {
    const ctx = this.audio.ctx!;
    const slide = clamp((Math.abs(slideSpeed) - 2.2) / 6, 0, 1);
    this.level = slide * clamp(Math.abs(speed) / 6, 0, 1);
    const t = ctx.currentTime;
    this.filter.frequency.setTargetAtTime(1500 + this.level * 700, t, 0.05);
    this.out.gain.setTargetAtTime(this.level * 0.5, t, 0.04);
  }

  silence() {
    this.level = 0;
    this.out.gain.setTargetAtTime(0, this.audio.ctx!.currentTime, 0.05);
  }
}
