export type KeyAction = 'gas' | 'brake' | 'left' | 'right' | 'handbrake';

/** Which keys do what. Both arrow keys and WASD work. */
const KEY_MAP: Record<string, KeyAction> = {
  ArrowUp: 'gas',
  KeyW: 'gas',
  ArrowDown: 'brake',
  KeyS: 'brake',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'handbrake',
};

export class KeyboardInput {
  onReset: (() => void) | null = null;
  private readonly pressed = new Set<KeyAction>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      const action = KEY_MAP[e.code];
      if (action) {
        this.pressed.add(action);
        e.preventDefault(); // stop arrow keys / space from scrolling the page
      } else if (e.code === 'KeyR' && !e.repeat) {
        this.onReset?.();
      }
    });
    window.addEventListener('keyup', (e) => {
      const action = KEY_MAP[e.code];
      if (action) this.pressed.delete(action);
    });
    // Release everything if the window loses focus, so the car doesn't keep driving.
    window.addEventListener('blur', () => this.pressed.clear());
  }

  isDown(action: KeyAction) {
    return this.pressed.has(action);
  }
}
