/**
 * The on-screen interface drawn with HTML on top of the 3D view:
 * the start screen and the speedometer.
 */
export class Hud {
  private readonly startScreen = getElement('start-screen');
  private readonly startPrompt = getElement('start-prompt');
  private readonly hud = getElement('hud');
  private readonly speedValue = getElement('speed-value');
  private readonly speedBar = getElement('speed-bar');
  private lastSpeed = -1;

  constructor(isTouch: boolean) {
    document.body.classList.toggle('touch', isTouch);
    getElement('help-keyboard').hidden = isTouch;
    getElement('help-touch').hidden = !isTouch;
  }

  /** Shows "Tap to start" and calls `onStart` once the player taps, clicks or presses a key. */
  waitForStart(isTouch: boolean, onStart: () => void) {
    this.startPrompt.textContent = isTouch ? 'Tap to start' : 'Click or press any key to start';
    this.startScreen.classList.add('ready');
    const start = (e: Event) => {
      e.preventDefault();
      window.removeEventListener('keydown', start);
      this.startScreen.removeEventListener('pointerup', start);
      this.startScreen.classList.add('hidden');
      this.hud.hidden = false;
      document.body.classList.add('playing');
      onStart();
    };
    window.addEventListener('keydown', start);
    this.startScreen.addEventListener('pointerup', start);
  }

  setSpeed(kmh: number, ratio: number) {
    const rounded = Math.round(kmh);
    if (rounded === this.lastSpeed) return;
    this.lastSpeed = rounded;
    this.speedValue.textContent = String(rounded);
    this.speedBar.style.transform = `scaleX(${Math.min(1, ratio).toFixed(3)})`;
  }
}

function getElement(id: string) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id} in index.html`);
  return el;
}
