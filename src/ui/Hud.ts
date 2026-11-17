export type GameMode = 'race' | 'free';

/**
 * The on-screen interface drawn with HTML on top of the 3D view:
 * the start screen (main menu) and the speedometer.
 */
export class Hud {
  private readonly startScreen = getElement('start-screen');
  private readonly startPrompt = getElement('start-prompt');
  private readonly modeButtons = getElement('mode-buttons');
  private readonly hud = getElement('hud');
  private readonly menuButton = getElement('menu-button');
  private readonly speedValue = getElement('speed-value');
  private readonly speedBar = getElement('speed-bar');
  private lastSpeed = -1;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(isTouch: boolean) {
    document.body.classList.toggle('touch', isTouch);
    getElement('help-keyboard').hidden = isTouch;
    getElement('help-touch').hidden = !isTouch;
  }

  /** Shows the main menu. `onSelect` is called with the mode the player picks. */
  showMenu(onSelect: (mode: GameMode) => void) {
    this.startScreen.classList.remove('hidden');
    this.startScreen.classList.add('ready');
    this.modeButtons.hidden = false;
    this.hud.hidden = true;
    this.menuButton.hidden = true;
    document.body.classList.remove('playing');

    const choose = (mode: GameMode) => {
      if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
      getElement('mode-race').onclick = null;
      getElement('mode-free').onclick = null;
      this.startScreen.classList.add('hidden');
      this.hud.hidden = false;
      this.menuButton.hidden = false;
      document.body.classList.add('playing');
      onSelect(mode);
    };
    getElement('mode-race').onclick = () => choose('race');
    getElement('mode-free').onclick = () => choose('free');
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') choose('race');
      else if (e.code === 'KeyF') choose('free');
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  /** Called when the menu button (or Esc) is pressed while driving. */
  onMenuButton(listener: () => void) {
    this.menuButton.addEventListener('click', listener);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && !this.menuButton.hidden) listener();
    });
  }

  showError(message: string) {
    this.startPrompt.textContent = message;
  }

  setSpeed(kmh: number, ratio: number) {
    const rounded = Math.round(kmh);
    if (rounded === this.lastSpeed) return;
    this.lastSpeed = rounded;
    this.speedValue.textContent = String(rounded);
    this.speedBar.style.transform = `scaleX(${Math.min(1, ratio).toFixed(3)})`;
  }
}

export function getElement(id: string) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id} in index.html`);
  return el;
}
