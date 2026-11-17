import type { Race, Racer } from '../race/Race';
import { getElement } from './Hud';

/** Race screens: position/lap/time panel, running order, countdown, and the results table. */
export class RaceHud {
  private readonly panel = getElement('race-hud');
  private readonly pos = getElement('race-pos');
  private readonly posSuffix = getElement('race-pos-suffix');
  private readonly lap = getElement('race-lap');
  private readonly lapsTotal = getElement('race-laps');
  private readonly time = getElement('race-time');
  private readonly standings = getElement('standings');
  private readonly countdown = getElement('countdown');
  private readonly results = getElement('results');

  private rows: HTMLLIElement[] = [];
  private lastCountdown = '';
  private bannerUntil = 0;
  private lastLap = 1;
  private nextListUpdate = 0;
  private resultsShown = false;

  /** Shows the race panel for a new race. */
  show(race: Race) {
    this.panel.hidden = false;
    this.results.hidden = true;
    this.resultsShown = false;
    this.lapsTotal.textContent = String(race.laps);
    this.lastLap = 1;
    this.bannerUntil = 0;
    this.standings.replaceChildren();
    this.rows = race.racers.map(() => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="num"></span><span class="dot"></span><span class="name"></span><span class="done"></span>';
      this.standings.appendChild(li);
      return li;
    });
    this.setCountdown('');
  }

  hide() {
    this.panel.hidden = true;
    this.results.hidden = true;
    this.resultsShown = false;
    this.setCountdown('');
  }

  /** Call once per frame. */
  update(race: Race) {
    // Countdown, then a "FINAL LAP" banner.
    const lap = race.currentLap();
    if (lap > this.lastLap) {
      this.lastLap = lap;
      if (lap === race.laps && race.laps > 1) this.bannerUntil = race.time + 2.5;
    }
    if (race.countdownText) this.setCountdown(race.countdownText);
    else if (race.time < this.bannerUntil && race.player.finishTime === null) this.setCountdown('FINAL LAP', 'banner');
    else this.setCountdown('');

    // The rest only needs refreshing a few times per second.
    if (race.time < this.nextListUpdate && race.time > 0) return;
    this.nextListUpdate = race.time + 0.2;

    const order = race.standings();
    const position = order.indexOf(race.player) + 1;
    this.pos.textContent = String(position);
    this.posSuffix.textContent = ordinalSuffix(position);
    this.lap.textContent = String(lap);
    this.time.textContent = formatTime(Math.max(0, race.player.finishTime ?? race.time));

    order.forEach((racer, i) => {
      const li = this.rows[i];
      li.classList.toggle('me', racer.isPlayer);
      (li.children[0] as HTMLElement).textContent = String(i + 1);
      (li.children[1] as HTMLElement).style.background = cssColor(racer.style.paint);
      (li.children[2] as HTMLElement).textContent = racer.name;
      (li.children[3] as HTMLElement).textContent = racer.finishTime !== null ? '🏁' : '';
    });

    if (race.phase === 'finished' && !this.resultsShown) {
      this.resultsShown = true;
      this.results.hidden = false;
    }
    if (this.resultsShown) this.renderResults(race, order);
  }

  /** Wires up the results-screen buttons. */
  onResultsButtons(raceAgain: () => void, menu: () => void) {
    getElement('race-again').addEventListener('click', raceAgain);
    getElement('results-menu').addEventListener('click', menu);
    window.addEventListener('keydown', (e) => {
      if (!this.resultsShown) return;
      if (e.code === 'Enter' || e.code === 'NumpadEnter') raceAgain();
    });
  }

  private renderResults(race: Race, order: Racer[]) {
    const position = order.indexOf(race.player) + 1;
    getElement('results-title').textContent =
      position === 1 ? 'You won! 🏆' : `You finished ${position}${ordinalSuffix(position)}`;
    const winner = order[0].finishTime ?? 0;
    const body = getElement('results-body');
    body.replaceChildren(
      ...order.map((r, i) => {
        const tr = document.createElement('tr');
        tr.className = r.isPlayer ? 'me' : '';
        const best = r.lapTimes.length ? formatTime(Math.min(...r.lapTimes)) : '—';
        let time: string;
        if (r.finishTime === null) time = race.complete ? 'Did not finish' : `Lap ${race.currentLap(r)}…`;
        else if (i === 0) time = formatTime(r.finishTime);
        else time = `+${(r.finishTime - winner).toFixed(2)}s`;
        tr.innerHTML = `<td>${i + 1}</td><td><span class="dot" style="background:${cssColor(r.style.paint)}"></span>${r.name}</td><td>${best}</td><td>${time}</td>`;
        return tr;
      }),
    );
  }

  private setCountdown(text: string, kind: '' | 'banner' = '') {
    if (text === this.lastCountdown) return;
    this.lastCountdown = text;
    this.countdown.textContent = text;
    this.countdown.className = '';
    if (!text) return;
    // Restart the pop animation for each new number.
    void this.countdown.offsetWidth;
    this.countdown.classList.add('pop');
    if (text === 'GO!') this.countdown.classList.add('go');
    if (kind) this.countdown.classList.add(kind);
  }
}

export function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function ordinalSuffix(n: number) {
  if (n === 1) return 'st';
  if (n === 2) return 'nd';
  if (n === 3) return 'rd';
  return 'th';
}

function cssColor(hex: number) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}
