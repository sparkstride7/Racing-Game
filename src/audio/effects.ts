import type { AudioManager } from './AudioManager';

/**
 * Short one-off sounds, all synthesised: countdown beeps, collision thuds and the finish fanfares.
 * Each call builds a few tiny audio nodes that clean themselves up when the sound ends.
 */

/** Plays a tone with a quick attack and a smooth fade. */
function tone(
  audio: AudioManager,
  frequency: number,
  start: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'square',
) {
  const ctx = audio.ctx!;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.01);
  gain.gain.setTargetAtTime(0, start + duration * 0.6, duration * 0.2);
  osc.connect(gain).connect(audio.sfx);
  osc.start(start);
  osc.stop(start + duration + 0.3);
}

/** "3", "2", "1": a short mid beep.  "GO!": a higher, longer beep. */
export function countdownBeep(audio: AudioManager, go: boolean) {
  if (!audio.ctx) return;
  const t = audio.ctx.currentTime;
  if (go) {
    tone(audio, 1318.5, t, 0.55, 0.16, 'square');
    tone(audio, 659.3, t, 0.55, 0.1, 'triangle');
    audio.stats.go++;
  } else {
    tone(audio, 659.3, t, 0.18, 0.15, 'square');
    audio.stats.beep++;
  }
}

/**
 * Collision: a low "thud" (falling sine) plus a burst of filtered noise for the metallic crunch.
 * `strength` 0..1 sets the loudness; `volume` 0..1 fades it with distance from the player.
 */
export function impact(audio: AudioManager, strength: number, volume = 1) {
  if (!audio.ctx) return;
  const ctx = audio.ctx;
  const t = ctx.currentTime;
  const loud = (0.25 + 0.75 * strength) * volume;

  const thud = ctx.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(140, t);
  thud.frequency.exponentialRampToValueAtTime(45, t + 0.25);
  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.9 * loud, t);
  thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  thud.connect(thudGain).connect(audio.sfx);
  thud.start(t);
  thud.stop(t + 0.35);

  const crunch = ctx.createBufferSource();
  crunch.buffer = audio.noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 900 + strength * 1500;
  filter.Q.value = 1.2;
  const crunchGain = ctx.createGain();
  crunchGain.gain.setValueAtTime(0.7 * loud, t);
  crunchGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  crunch.connect(filter).connect(crunchGain).connect(audio.sfx);
  crunch.start(t, Math.random() * 0.5);
  crunch.stop(t + 0.25);

  audio.stats.impact++;
}

const note = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Finish fanfare: a bright rising arpeggio for a win, a shorter, calmer one otherwise. */
export function finishFanfare(audio: AudioManager, won: boolean) {
  if (!audio.ctx) return;
  const t = audio.ctx.currentTime + 0.05;
  const melody = won ? [72, 76, 79, 84, 79, 84] : [67, 72, 76];
  const step = won ? 0.13 : 0.16;
  melody.forEach((m, i) => {
    const last = i === melody.length - 1;
    const length = last ? (won ? 1.1 : 0.8) : step * 1.4;
    tone(audio, note(m), t + i * step, length, 0.12, 'square');
    tone(audio, note(m - 12), t + i * step, length, 0.08, 'triangle');
  });
  if (won) {
    // A final major chord under the last note.
    const end = t + (melody.length - 1) * step;
    for (const m of [60, 64, 67]) tone(audio, note(m), end, 1.1, 0.06, 'sawtooth');
  }
  audio.stats.finish++;
}
