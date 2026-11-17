import { CAR } from '../config';
import { clamp } from '../utils/math';
import type { AudioManager } from './AudioManager';

/**
 * Synthesised engine: a sawtooth tone plus a sub-octave square wave, through a filter.
 * Pitch follows simulated engine revs: it rises with speed within each gear and
 * drops when the (imaginary) gearbox shifts up. Pressing the gas makes it louder and brighter.
 */

/** Speeds (m/s) where the virtual gearbox changes up. */
const GEAR_SHIFTS = [0, 13, 23, 33, 43, CAR.topSpeed + 1];

export class EngineSound {
  private readonly saw: OscillatorNode;
  private readonly sub: OscillatorNode;
  private readonly filter: BiquadFilterNode;
  private readonly out: GainNode;
  /** Current tone frequency (Hz), for tests. */
  frequency = 0;
  level = 0;

  constructor(
    private readonly audio: AudioManager,
    /** Overall loudness of this engine (the player's is louder than a rival's). */
    private readonly loudness: number,
  ) {
    const ctx = audio.ctx!;
    this.saw = ctx.createOscillator();
    this.saw.type = 'sawtooth';
    this.sub = ctx.createOscillator();
    this.sub.type = 'square';
    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 3;
    this.out = ctx.createGain();
    this.out.gain.value = 0;

    this.saw.connect(this.filter);
    this.sub.connect(subGain).connect(this.filter);
    this.filter.connect(this.out).connect(audio.sfx);
    this.saw.start();
    this.sub.start();
  }

  /**
   * `speed` in m/s, `throttle` 0..1, `volume` 0..1 (e.g. fades with distance).
   */
  update(speed: number, throttle: number, volume = 1) {
    const ctx = this.audio.ctx!;
    const v = Math.abs(speed);
    let gear = 0;
    while (gear < GEAR_SHIFTS.length - 2 && v >= GEAR_SHIFTS[gear + 1]) gear++;
    const from = GEAR_SHIFTS[gear];
    const to = GEAR_SHIFTS[gear + 1];
    const inGear = clamp((v - from) / (to - from), 0, 1);
    // First gear starts at idle; higher gears start lower in the rev range after each shift.
    const rpm = gear === 0 ? 900 + inGear * 5600 : 3400 + inGear * 3100;
    const revRatio = (rpm - 900) / 5600;
    this.frequency = 30 + rpm * 0.028;

    const t = ctx.currentTime;
    this.saw.frequency.setTargetAtTime(this.frequency, t, 0.025);
    this.sub.frequency.setTargetAtTime(this.frequency * 0.5, t, 0.025);
    this.filter.frequency.setTargetAtTime(500 + throttle * 1400 + revRatio * 1500, t, 0.05);
    this.level = this.loudness * volume * (0.55 + 0.45 * throttle) * (0.75 + 0.25 * revRatio);
    this.out.gain.setTargetAtTime(this.level, t, 0.05);
  }

  /** Fades out (e.g. back to the menu). */
  silence() {
    this.level = 0;
    this.out.gain.setTargetAtTime(0, this.audio.ctx!.currentTime, 0.08);
  }
}
