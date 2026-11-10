import { KeyboardInput } from './KeyboardInput';
import { TouchControls } from './TouchControls';

/** What the player wants the car to do this frame. Every input method produces this. */
export interface DriveControls {
  /** 0..1 */
  throttle: number;
  /** 0..1 (also reverses once the car has stopped) */
  brake: number;
  /** -1 (left) .. +1 (right) */
  steer: number;
  handbrake: boolean;
}

/**
 * Combines keyboard and touchscreen input into one set of driving controls.
 * A gamepad can be added here later in the same way.
 */
export class Input {
  readonly keyboard = new KeyboardInput();
  readonly touch: TouchControls;
  private resetListeners: (() => void)[] = [];

  constructor(touchRoot: HTMLElement, showTouch: boolean) {
    this.touch = new TouchControls(touchRoot, showTouch);
    this.keyboard.onReset = () => this.resetListeners.forEach((fn) => fn());
    this.touch.onReset = () => this.resetListeners.forEach((fn) => fn());
  }

  onReset(listener: () => void) {
    this.resetListeners.push(listener);
  }

  read(): DriveControls {
    const k = this.keyboard;
    const t = this.touch;
    const left = k.isDown('left') || t.isDown('left');
    const right = k.isDown('right') || t.isDown('right');
    return {
      throttle: k.isDown('gas') || t.isDown('gas') ? 1 : 0,
      brake: k.isDown('brake') || t.isDown('brake') ? 1 : 0,
      steer: (right ? 1 : 0) - (left ? 1 : 0),
      handbrake: k.isDown('handbrake'),
    };
  }
}
