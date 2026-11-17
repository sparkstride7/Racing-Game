import type { AudioManager } from '../audio/AudioManager';
import { countdownBeep } from '../audio/effects';
import { getElement } from './Hud';

/**
 * Sound controls: the 🔊 on/off button shown while driving (also the M key),
 * and the "Sound settings" panel on the main menu with separate Music and Effects volumes.
 */
export class SoundControls {
  private readonly button = getElement('sound-button');
  private readonly panel = getElement('sound-panel');
  private readonly toggle = getElement('sound-toggle');
  private readonly music = getElement('music-volume') as HTMLInputElement;
  private readonly sfx = getElement('sfx-volume') as HTMLInputElement;
  private readonly status = getElement('sound-save-status');
  private lastPreview = 0;

  constructor(private readonly audio: AudioManager) {
    this.button.addEventListener('click', () => this.setMuted(!audio.settings.muted));
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && !e.repeat) this.setMuted(!audio.settings.muted);
    });

    getElement('sound-settings-button').addEventListener('click', () => {
      audio.unlock(); // lets the player hear the volume they pick
      this.panel.hidden = false;
    });
    getElement('sound-done').addEventListener('click', () => (this.panel.hidden = true));
    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.panel.hidden = true; // tap outside the card closes it
    });
    this.toggle.addEventListener('click', () => this.setMuted(!audio.settings.muted));

    // Finger and pen drags are handled directly, so the sliders work on iPhone Safari however it treats touches.
    followFinger(this.music);
    followFinger(this.sfx);

    this.music.addEventListener('input', () => {
      audio.setMusicVolume(Number(this.music.value) / 100);
      this.showStatus();
    });
    this.sfx.addEventListener('input', () => {
      audio.setSfxVolume(Number(this.sfx.value) / 100);
      this.showStatus();
      // A short beep so the player hears the new effects volume (at most a few per second).
      if (audio.isReady && !audio.settings.muted && performance.now() - this.lastPreview > 250) {
        this.lastPreview = performance.now();
        countdownBeep(audio, false);
      }
    });
    this.refresh();
  }

  private setMuted(muted: boolean) {
    this.audio.setMuted(muted);
    this.refresh();
  }

  /** Makes the buttons and sliders show the current settings. */
  private refresh() {
    const { muted, musicVolume, sfxVolume } = this.audio.settings;
    this.button.classList.toggle('muted', muted);
    this.button.setAttribute('aria-pressed', String(!muted));
    this.button.setAttribute('aria-label', muted ? 'Sound off (tap to turn on)' : 'Sound on (tap to turn off)');
    this.toggle.textContent = muted ? 'Off' : 'On';
    this.toggle.setAttribute('aria-pressed', String(!muted));
    this.music.value = String(Math.round(musicVolume * 100));
    this.sfx.value = String(Math.round(sfxVolume * 100));
    this.showStatus();
  }

  /** Tells the player whether their settings are being kept on this device. */
  private showStatus() {
    const messages = {
      restored: '✓ Your saved settings were restored',
      defaults: 'Default settings (your changes will be saved on this device)',
      saved: '✓ Saved on this device',
      unavailable: '⚠ This browser is not letting the game save settings',
    };
    const status = this.audio.storageStatus;
    this.status.textContent = messages[status];
    this.status.classList.toggle('warn', status === 'unavailable');
  }
}

/**
 * Makes a range slider follow a finger (or pen) directly: touching or dragging anywhere on it sets the value
 * to that position. Mouse use is left to the browser's normal slider behaviour.
 */
function followFinger(slider: HTMLInputElement) {
  let activePointer: number | null = null;
  const setFromX = (clientX: number) => {
    const rect = slider.getBoundingClientRect();
    const min = Number(slider.min || 0);
    const max = Number(slider.max || 100);
    const step = Number(slider.step || 1);
    // The thumb's centre can't reach the very ends of the track, so leave half a thumb at each side.
    const inset = Math.min(14, rect.width / 4);
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left - inset) / (rect.width - inset * 2)));
    const value = Math.round((min + ratio * (max - min)) / step) * step;
    if (String(value) !== slider.value) {
      slider.value = String(value);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  slider.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    activePointer = e.pointerId;
    slider.setPointerCapture?.(e.pointerId);
    setFromX(e.clientX);
  });
  slider.addEventListener('pointermove', (e) => {
    if (e.pointerId === activePointer) setFromX(e.clientX);
  });
  const release = (e: PointerEvent) => {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    slider.dispatchEvent(new Event('change', { bubbles: true }));
  };
  slider.addEventListener('pointerup', release);
  slider.addEventListener('pointercancel', release);
}
