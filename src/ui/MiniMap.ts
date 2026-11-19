import * as THREE from 'three';
import type { TrackPath } from '../world/track/TrackPath';

/** One car on the map. */
export interface MapCar {
  name: string;
  /** The car's on-screen 3D object (its position and rotation are what you see). */
  object: THREE.Object3D;
  /** Paint colour, e.g. 0xe3262f. */
  colour: number;
  isPlayer: boolean;
}

/** Where a marker was drawn (CSS pixels inside the map), for the automated tests. */
export interface MapMarker {
  name: string;
  x: number;
  y: number;
  /** Direction of travel on the map, radians (0 = right, π/2 = down). */
  angle: number;
  colour: string;
  isPlayer: boolean;
}

/** Empty space around the track inside the map (CSS pixels). */
const PADDING = 11;
/** Track line width on the map (CSS pixels): much wider than to scale, so it is easy to see. */
const TRACK_WIDTH = 5;

const FORWARD = new THREE.Vector3(0, 0, 1);

/**
 * A small map of the whole circuit, seen from above with the main straight on the left,
 * showing every car as an arrow in its own colour, pointing the way it is driving.
 * Your car is bigger, outlined in white and drawn on top.
 * Drawn with a 2D canvas: the track once (whenever the map changes size), the arrows every frame.
 */
export class MiniMap {
  private readonly ctx: CanvasRenderingContext2D;
  /** The track, drawn once at the current size and copied onto the map every frame. */
  private readonly trackLayer = document.createElement('canvas');
  private width = 0;
  private height = 0;
  private dpr = 1;
  /** Map projection: canvas x = (worldX − minX)·scale + offsetX, canvas y = (worldZ − minZ)·scale + offsetY. */
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private readonly bounds: THREE.Box3;
  private cars: MapCar[] = [];
  markers: MapMarker[] = [];
  private readonly forward = new THREE.Vector3();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly path: TrackPath,
    private readonly startLineDistance: number,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.bounds = path.bounds();
    // Redraw at the right sharpness whenever the map changes size (phone turned, map shown).
    new ResizeObserver(() => this.resize()).observe(canvas);
    window.addEventListener('resize', () => this.resize());
  }

  /** Which cars to show (all six in a race, just yours in free drive). */
  setCars(cars: MapCar[]) {
    this.cars = cars;
    this.draw();
  }

  /** Call once per frame: moves the arrows to where the cars are now. */
  draw() {
    if (!this.width) return;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.trackLayer, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.markers = this.cars.map((car) => {
      const p = car.object.position;
      this.forward.copy(FORWARD).applyQuaternion(car.object.quaternion);
      return {
        name: car.name,
        x: (p.x - this.bounds.min.x) * this.scale + this.offsetX,
        y: (p.z - this.bounds.min.z) * this.scale + this.offsetY,
        angle: Math.atan2(this.forward.z, this.forward.x),
        colour: `#${car.colour.toString(16).padStart(6, '0')}`,
        isPlayer: car.isPlayer,
      };
    });
    // Opponents first, so your own arrow is always on top.
    for (const m of this.markers) if (!m.isPlayer) this.arrow(m, 1, 'rgba(8, 10, 16, 0.9)', 1.5);
    for (const m of this.markers) {
      if (!m.isPlayer) continue;
      // A soft glow, then a bigger arrow with a white outline.
      ctx.beginPath();
      ctx.arc(m.x, m.y, 8.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.fill();
      this.arrow(m, 1.3, '#ffffff', 2);
    }
  }

  /** Projection details and markers, for the automated tests. */
  debugState() {
    return {
      width: this.width,
      height: this.height,
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      minX: this.bounds.min.x,
      minZ: this.bounds.min.z,
      markers: this.markers,
    };
  }

  /** An arrowhead pointing the way the car is going. */
  private arrow(m: MapMarker, size: number, outline: string, outlineWidth: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.angle);
    ctx.scale(size, size);
    ctx.beginPath();
    ctx.moveTo(6.5, 0);
    ctx.lineTo(-4.5, 4.6);
    ctx.lineTo(-2.2, 0);
    ctx.lineTo(-4.5, -4.6);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = outlineWidth / size;
    ctx.strokeStyle = outline;
    ctx.stroke();
    ctx.fillStyle = m.colour;
    ctx.fill();
    ctx.restore();
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (rect.width === this.width && rect.height === this.height && dpr === this.dpr) return;
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = dpr;
    if (!this.width || !this.height) return; // hidden (e.g. on the main menu)
    this.canvas.width = this.trackLayer.width = Math.round(this.width * dpr);
    this.canvas.height = this.trackLayer.height = Math.round(this.height * dpr);

    // Fit the whole circuit inside, centred, without stretching it.
    const size = this.bounds.getSize(new THREE.Vector3());
    this.scale = Math.min((this.width - PADDING * 2) / size.x, (this.height - PADDING * 2) / size.z);
    this.offsetX = (this.width - size.x * this.scale) / 2;
    this.offsetY = (this.height - size.z * this.scale) / 2;
    this.drawTrack();
    this.draw();
  }

  /** The circuit: a light road with a dark edge, and the start/finish line. */
  private drawTrack() {
    const ctx = this.trackLayer.getContext('2d')!;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    const toMap = (p: THREE.Vector3): [number, number] => [
      (p.x - this.bounds.min.x) * this.scale + this.offsetX,
      (p.z - this.bounds.min.z) * this.scale + this.offsetY,
    ];
    ctx.beginPath();
    this.path.samples.forEach((s, i) => {
      const [x, y] = toMap(s.point);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = TRACK_WIDTH + 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.stroke();
    ctx.lineWidth = TRACK_WIDTH;
    ctx.strokeStyle = 'rgba(214, 220, 230, 0.9)';
    ctx.stroke();

    // Start/finish line: a short dark-edged white bar across the road.
    const n = this.path.samples.length - 1;
    const step = this.path.length / n;
    const start = this.path.samples[Math.round(this.startLineDistance / step) % n];
    const [sx, sy] = toMap(start.point);
    const angle = Math.atan2(start.tangent.z, start.tangent.x) + Math.PI / 2;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(-6, -2.5, 12, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-5, -1.5, 10, 3);
    ctx.restore();
  }
}
