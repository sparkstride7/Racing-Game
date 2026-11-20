import type { CarLook } from '../vehicle/playerCar';
import { getElement } from './Hud';

export interface CarSelectActions {
  /** A car was picked on the screen (not yet confirmed): show it. */
  preview(look: CarLook): void;
  /** START RACE with this car. */
  start(look: CarLook): void;
  /** Back to the main menu without changing the car. */
  back(): void;
}

/**
 * The "Choose your car" screen shown after RACE on the main menu:
 * Original Car (V1) or New Sports Car, then START RACE (or Back).
 * The car circling behind the menu changes as you pick, so you see the real car before racing.
 */
export class CarSelect {
  private readonly panel = getElement('car-select');
  private readonly options = Array.from(this.panel.querySelectorAll<HTMLButtonElement>('[data-car]'));
  private selected: CarLook = 'v1';
  private actions: CarSelectActions | null = null;

  constructor() {
    for (const option of this.options) option.addEventListener('click', () => this.pick(option.dataset.car as CarLook));
    getElement('car-start').addEventListener('click', () => this.actions?.start(this.selected));
    getElement('car-back').addEventListener('click', () => this.actions?.back());
  }

  get isOpen() {
    return !this.panel.hidden;
  }

  /** Shows the screen with `current` (the player's last choice) already selected. */
  open(current: CarLook, actions: CarSelectActions) {
    this.actions = actions;
    this.panel.hidden = false;
    this.pick(current);
  }

  close() {
    this.panel.hidden = true;
    this.actions = null;
  }

  /** Keyboard: ← → ↑ ↓ (or A / D) switch cars, Enter starts, Esc goes back. */
  handleKey(e: KeyboardEvent) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD'].includes(e.code)) {
      e.preventDefault();
      this.pick(this.selected === 'v1' ? 'sports' : 'v1');
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      this.actions?.start(this.selected);
    } else if (e.code === 'Escape') {
      e.preventDefault();
      this.actions?.back();
    }
  }

  private pick(look: CarLook) {
    this.selected = look;
    for (const option of this.options) option.setAttribute('aria-checked', String(option.dataset.car === look));
    this.actions?.preview(look);
  }
}
