import { getElement, type GameMode } from './Hud';

export interface PauseMenuActions {
  /** The pause button (or Esc / P) was pressed while driving. */
  pause(): void;
  resume(): void;
  /** Confirmed: start the race (or free drive) again from the beginning. */
  restart(): void;
  /** Confirmed: leave to the main menu. */
  mainMenu(): void;
}

type Pending = 'restart' | 'menu';

/**
 * The pause button shown while driving, and the pause menu it opens:
 * Resume, Restart Race, Settings (the sound settings) and Main Menu.
 * Restarting and leaving ask "are you sure?" first. The game itself does the freezing (see Game).
 */
export class PauseMenu {
  private readonly button = getElement('pause-button');
  private readonly overlay = getElement('pause-menu');
  private readonly main = getElement('pause-main');
  private readonly confirm = getElement('pause-confirm');
  private readonly restartButton = getElement('pause-restart');
  private readonly soundPanel = getElement('sound-panel');
  private mode: GameMode = 'race';
  private pending: Pending | null = null;

  constructor(actions: PauseMenuActions) {
    this.button.addEventListener('click', () => {
      this.button.blur(); // so Space (handbrake) or Enter can't press it again later
      actions.pause();
    });
    getElement('pause-resume').addEventListener('click', () => actions.resume());
    this.restartButton.addEventListener('click', () => this.ask('restart'));
    getElement('pause-main-menu').addEventListener('click', () => this.ask('menu'));
    getElement('pause-settings').addEventListener('click', () => (this.soundPanel.hidden = false));
    getElement('confirm-cancel').addEventListener('click', () => this.showMain());
    getElement('confirm-ok').addEventListener('click', () => {
      const pending = this.pending;
      this.showMain();
      if (pending === 'restart') actions.restart();
      else if (pending === 'menu') actions.mainMenu();
    });

    // Keyboard: Esc or P pauses; while paused it steps back (closes Settings, cancels a question) or resumes.
    window.addEventListener('keydown', (e) => {
      if ((e.code !== 'Escape' && e.code !== 'KeyP') || e.repeat) return;
      if (this.isOpen) {
        e.preventDefault();
        if (!this.soundPanel.hidden) this.soundPanel.hidden = true;
        else if (this.pending) this.showMain();
        else actions.resume();
      } else if (!this.button.hidden) {
        e.preventDefault();
        actions.pause();
      }
    });
  }

  get isOpen() {
    return !this.overlay.hidden;
  }

  /** Shows the pause menu (the game must already be frozen). */
  open(mode: GameMode) {
    this.mode = mode;
    this.restartButton.textContent = mode === 'race' ? 'Restart Race' : 'Restart Drive';
    this.showMain();
    this.overlay.hidden = false;
    this.button.hidden = true;
  }

  /** Hides the pause menu (and the settings, if they were opened from it) and brings the pause button back. */
  close() {
    const wasOpen = this.isOpen;
    this.overlay.hidden = true;
    this.showMain();
    if (wasOpen) {
      this.soundPanel.hidden = true;
      this.button.hidden = false; // (the main menu hides it again when leaving)
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
  }

  private ask(what: Pending) {
    this.pending = what;
    const race = this.mode === 'race';
    const text =
      what === 'restart'
        ? {
            title: race ? 'Restart the race?' : 'Restart free drive?',
            body: race ? 'Your progress in this race will be lost.' : 'Your car goes back to the start line.',
            ok: 'Restart',
          }
        : {
            title: race ? 'Leave the race?' : 'Leave free drive?',
            body: race ? 'Your progress in this race will be lost.' : 'You will return to the main menu.',
            ok: 'Leave',
          };
    getElement('confirm-title').textContent = text.title;
    getElement('confirm-text').textContent = text.body;
    getElement('confirm-ok').textContent = text.ok;
    this.main.hidden = true;
    this.confirm.hidden = false;
  }

  private showMain() {
    this.pending = null;
    this.main.hidden = false;
    this.confirm.hidden = true;
  }
}
