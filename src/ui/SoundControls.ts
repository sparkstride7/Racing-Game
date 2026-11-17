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

    this.music.addEventListener('input', () => audio.setMusicVolume(Number(this.music.value) / 100));
    this.sfx.addEventListener('input', () => {
      audio.setSfxVolume(Number(this.sfx.value) / 100);
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
  }
}
