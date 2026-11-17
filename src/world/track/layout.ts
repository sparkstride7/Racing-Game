/**
 * Track layouts are just data: a list of centre-line points that a smooth curve passes through.
 * To add a new track later, add another layout here; the same builder turns it into a 3D circuit.
 */
export interface TrackLayout {
  name: string;
  /** Centre-line points (x, z) in metres, in driving order. The curve loops back to the first point. */
  points: [number, number][];
  /** Where the start/finish line goes (it snaps to the nearest point on the track). */
  startLine: [number, number];
}

/**
 * "Greenfield Circuit": 1.76 km.
 * Long main straight → sweeping Turn 1 → S-bends → fast right-hander →
 * long left sweeper → tight chicane → flowing esses back onto the straight.
 */
export const GREENFIELD_CIRCUIT: TrackLayout = {
  name: 'Greenfield Circuit',
  points: [
    [0, -180],
    [0, 200],
    [15, 250],
    [60, 275],
    [115, 265],
    [150, 225],
    [150, 175],
    [175, 130],
    [230, 120],
    [290, 150],
    [340, 190],
    [395, 190],
    [430, 145],
    [430, 40],
    [405, -40],
    [345, -95],
    [270, -105],
    [215, -75],
    [165, -100],
    [130, -170],
    [85, -235],
    [35, -245],
    [5, -220],
  ],
  startLine: [0, -60],
};
