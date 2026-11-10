export type TouchAction = 'gas' | 'brake' | 'left' | 'right';

/**
 * On-screen buttons for phones and tablets.
 * Supports several fingers at once (steer with the left thumb, pedals with the right),
 * and sliding a finger from one button to another (e.g. left → right steering).
 */
export class TouchControls {
  onReset: (() => void) | null = null;
  /** Which button each finger is currently on. */
  private readonly fingers = new Map<number, TouchAction>();
  private readonly buttons: HTMLElement[];

  constructor(private readonly root: HTMLElement, visible: boolean) {
    root.hidden = !visible;
    this.buttons = Array.from(root.querySelectorAll<HTMLElement>('[data-action]'));

    root.addEventListener('pointerdown', (e) => this.onPointer(e), { passive: false });
    // Moves and releases are watched on the whole window, because a finger
    // that started on a button may be lifted anywhere on the screen.
    window.addEventListener('pointermove', (e) => this.onPointer(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.release(e));
    window.addEventListener('pointercancel', (e) => this.release(e));
    // If the page is hidden (e.g. the phone locks), let go of all buttons.
    document.addEventListener('visibilitychange', () => {
      this.fingers.clear();
      this.refresh();
    });

    root.querySelector('[data-reset]')?.addEventListener('click', () => this.onReset?.());
  }

  isDown(action: TouchAction) {
    for (const a of this.fingers.values()) if (a === action) return true;
    return false;
  }

  private onPointer(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.buttons === 0) return;
    if (e.type === 'pointermove' && !this.fingers.has(e.pointerId)) return;
    e.preventDefault();
    // Let the finger keep sending events even when it slides off the button it started on.
    if (e.type === 'pointerdown' && e.target instanceof Element && e.target.hasPointerCapture?.(e.pointerId)) {
      e.target.releasePointerCapture(e.pointerId);
    }
    const action = this.actionAt(e.clientX, e.clientY);
    if (action) this.fingers.set(e.pointerId, action);
    else if (e.type === 'pointermove') this.fingers.delete(e.pointerId);
    this.refresh();
  }

  private release(e: PointerEvent) {
    this.fingers.delete(e.pointerId);
    this.refresh();
  }

  private actionAt(x: number, y: number): TouchAction | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-action]');
    return el && this.root.contains(el) ? (el.dataset.action as TouchAction) : null;
  }

  /** Highlights the buttons that are being pressed. */
  private refresh() {
    for (const button of this.buttons) {
      button.classList.toggle('pressed', this.isDown(button.dataset.action as TouchAction));
    }
  }
}
