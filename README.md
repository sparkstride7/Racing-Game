# Racing Game (working title)

An original 3D arcade racing game for iPhone, built with web technology so it can be
developed entirely in the cloud and played in any browser. It will later be packaged
as an App Store app.

## Current state: starter project

- A placeholder sports car built entirely from code, with working suspension, steering and spinning wheels
- Arcade driving physics: smooth acceleration, braking, reversing, a handbrake, and steering that gets calmer at high speed
- A third-person chase camera that swings round smoothly and pulls back as you speed up
- **Greenfield Circuit**: a 1.76 km racing circuit with a long main straight and varied corners
  - Red-and-white kerbs on every corner, concrete safety barriers along both sides
  - Chequered start/finish line, start gantry with lights, painted grid slots
  - 300/200/100 m braking boards, pit building, covered grandstand, about 1000 trees and distant hills
- Keyboard controls (desktop) and multi-touch buttons (iPhone)
- A start screen and a speedometer

## Game modes

- **Race**: you against 5 AI opponents over 3 laps, with a 3-2-1-GO countdown, live positions, lap counter and a results screen.
- **Free drive**: practise alone on the circuit (the original mode).

### The opponents

| # | Driver | Car | Skill |
|---|---|---|---|
| 7 | Nova | Violet, GT wing | Fastest |
| 22 | Ember | Orange, ducktail | |
| 3 | Frost | White & blue, GT wing | |
| 11 | Volt | Yellow, no wing | |
| 45 | Jade | Matte green & gold, ducktail | Slowest |

Opponents drive **the same car as you**, with the same grip and power, using the same controls
(gas, brake, steering). Only their driving skill differs. Even the fastest opponent laps about
1.5 s slower than the car's limit, so a good driver can beat everyone. Tune them in `src/race/roster.ts`.

## Controls

| Action | Keyboard | Touchscreen |
|---|---|---|
| Accelerate | W or ↑ | GAS |
| Brake / reverse | S or ↓ | BRAKE (hold after stopping to reverse) |
| Steer | A D or ← → | ◀ ▶ buttons |
| Handbrake | Space | — |
| Reset car | R | ↺ button (top right) |
| Main menu | Esc | ☰ button (top right) |
| Start a race / free drive | Enter / F | RACE / FREE DRIVE buttons |

## Technology

| Part | Tool |
|---|---|
| 3D graphics | [Three.js](https://threejs.org) |
| Physics | [Rapier](https://rapier.rs) (ray-cast vehicle) |
| Language | TypeScript |
| Build tool | Vite |
| iOS app (later) | Capacitor |

## Project structure

```
index.html               Page layout: start screen, speedometer, touch buttons
src/
  main.ts                Starts the game
  config.ts              ALL tuning numbers (car handling, camera, track) in one place
  style.css              Look of the menus and buttons
  core/Game.ts           Main loop: input → physics → camera → draw
  core/Physics.ts        Physics engine setup (fixed 60 steps per second)
  vehicle/Car.ts         Car physics and arcade driving helpers
  vehicle/CarModel.ts    The 3D car model (built from code)
  camera/ChaseCamera.ts  Third-person camera
  input/                 Keyboard and touchscreen controls
  world/Environment.ts   Sky, sun, shadows, fog
  world/Circuit.ts       Builds a complete circuit: road, kerbs, barriers, start line, scenery
  world/track/layout.ts  Track layouts as data (add new tracks here)
  world/track/TrackPath.ts  The track's centre line: sampling, curvature, distances
  world/track/geometry.ts   Shapes that follow the track (road strips, kerbs, walls)
  world/track/scenery.ts    Grandstand, pit building, trees, hills
  world/textures.ts      Road, grass, kerb and barrier textures (drawn by code)
  race/Race.ts           Race rules: grid, countdown, positions, laps, finish, results
  race/AIDriver.ts       How opponents drive: racing line, braking, steering, overtaking
  race/RacingLine.ts     The ideal path round the track and a speed plan for every corner
  race/TrackProgress.ts  Tracks each car's lap and distance (for positions)
  race/roster.ts         The 5 opponents: names, car looks, skill levels
  ui/Hud.ts              Main menu and speedometer
  ui/RaceHud.ts          Race position, lap, timer, running order, countdown, results
tests/smoke.cjs          Automated test: drives the car and races in a real browser
tests/sim/race-sim.ts    Runs complete 6-car races without graphics to check the AI
.github/workflows/       Publishes the game to GitHub Pages automatically
```

## Running it yourself (optional)

You don't need to run anything locally: every push is published to GitHub Pages.
If you want to, install [Node.js](https://nodejs.org) 22+, then:

```bash
npm install        # download the libraries (first time only)
npm run dev        # play at http://localhost:5173
npm run build      # create the final version in dist/
npm test           # everything: build, race simulation, browser tests
npm run test:race  # race simulation only (fast, no browser needed)
npm run test:e2e   # browser tests (needs Playwright + Chromium)
```

Add `?touch=1` to the address to see the touch controls on a computer.
