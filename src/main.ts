import './style.css';
import { Game } from './core/Game';

/** Entry point: builds the game, then waits for the player to tap "start". */
async function main() {
  // Stop iOS Safari from zooming or scrolling the page while playing.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  // (Sliders are the exception: they need finger drags to move.)
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.target instanceof Element && e.target.closest('input[type="range"]')) return;
      e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener('dblclick', (e) => e.preventDefault());

  let game: Game;
  try {
    game = new Game(document.getElementById('game')!);
    await game.init();
  } catch (error) {
    console.error(error);
    const prompt = document.getElementById('start-prompt');
    if (prompt) prompt.textContent = 'Sorry, the game could not start on this device.';
    return;
  }
  game.showMenu();
}

main();
