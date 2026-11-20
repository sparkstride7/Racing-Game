import type { CarLook } from '../vehicle/playerCar';
import { CarSelect } from './CarSelect';

export type GameMode = 'race' | 'free';

/** What the main menu needs to know about the player's car choice. */
export interface CarMenu {
  /** The car chosen last (shown first on the car-selection screen). */
  current(): CarLook;
  /** Show this car behind the menu while choosing. */
  preview(look: CarLook): void;
  /** START RACE was pressed with this car: use and remember it. */
  confirm(look: CarLook): void;
}

/**
 * The on-screen interface drawn with HTML on top of the 3D view:
 * the start screen (main menu) and the speedometer.
 */
export class Hud {
  private readonly startScreen = getElement('start-screen');
  private readonly startPrompt = getElement('start-prompt');
  private readonly modeButtons = getElement('mode-buttons');
  private readonly hud = getElement('hud');
  private readonly pauseButton = getElement('pause-button');
  private readonly speedValue = getElement('speed-value');
  private readonly speedBar = getElement('speed-bar');
  private lastSpeed = -1;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private readonly carSelect = new CarSelect();

  constructor(isTouch: boolean) {
    document.body.classList.toggle('touch', isTouch);
    getElement('help-keyboard').hidden = isTouch;
    getElement('help-touch').hidden = !isTouch;
  }

  /**
   * Shows the main menu. RACE opens the car-selection screen first; FREE DRIVE starts straight away with the
   * car chosen last. `onSelect` is called with the mode once the player starts.
   */
  showMenu(onSelect: (mode: GameMode) => void, cars: CarMenu) {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.startScreen.classList.remove('hidden');
    this.startScreen.classList.add('ready');
    const soundSettings = getElement('sound-settings-button');
    const showModes = () => {
      this.carSelect.close();
      this.startScreen.classList.remove('choosing');
      this.modeButtons.hidden = false;
      soundSettings.hidden = false;
    };
    showModes();
    this.hud.hidden = true;
    this.pauseButton.hidden = true;
    document.body.classList.remove('playing');

    const choose = (mode: GameMode) => {
      if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
      getElement('mode-race').onclick = null;
      getElement('mode-free').onclick = null;
      this.carSelect.close();
      this.startScreen.classList.remove('choosing');
      this.startScreen.classList.add('hidden');
      this.hud.hidden = false;
      this.pauseButton.hidden = false;
      document.body.classList.add('playing');
      onSelect(mode);
    };
    const chooseCar = () => {
      this.modeButtons.hidden = true;
      soundSettings.hidden = true;
      this.startScreen.classList.add('choosing');
      this.carSelect.open(cars.current(), {
        preview: (look) => cars.preview(look),
        start: (look) => {
          cars.confirm(look);
          choose('race');
        },
        back: () => {
          cars.preview(cars.current()); // back to the car chosen before
          showModes();
        },
      });
    };
    getElement('mode-race').onclick = chooseCar;
    getElement('mode-free').onclick = () => choose('free');
    this.keyHandler = (e: KeyboardEvent) => {
      if (!getElement('sound-panel').hidden) return;
      if (this.carSelect.isOpen) this.carSelect.handleKey(e);
      else if (e.code === 'Enter' || e.code === 'NumpadEnter') chooseCar();
      else if (e.code === 'KeyF') choose('free');
    };
    window.addEventListener('keydown', this.keyHandler);
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
