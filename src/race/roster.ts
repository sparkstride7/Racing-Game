import type { CarStyle } from '../vehicle/CarModel';
import type { DriverSkill } from './AIDriver';

/** An AI opponent: a name, a car look, and a driving skill. All names, colours and numbers are original. */
export interface Opponent {
  name: string;
  /** Short colour name for the results screen. */
  colorName: string;
  style: CarStyle;
  skill: Omit<DriverSkill, 'reaction'>;
}

/**
 * The five opponents, from fastest to slowest.
 * They all drive the same car as the player; only their driving skill differs.
 * The car's real cornering limit is about 24 (measured with the race simulator), so even the
 * fastest opponent leaves some speed on the table: a skilled player can beat everyone.
 * Tune `cornerGrip` (m/s² of sideways grip they dare to use) to make the field faster or slower.
 */
export const OPPONENTS: Opponent[] = [
  {
    name: 'Nova',
    colorName: 'Violet',
    style: { paint: 0x6b2fd6, accent: 0xf2f2f2, wing: 'gt', rim: 0x2a2d31, caliper: 0xffffff, finish: 'metallic', number: 1, body: 'exotic' },
    skill: { cornerGrip: 21, braking: 10, lane: 1.2 },
  },
  {
    name: 'Ember',
    colorName: 'Orange',
    style: { paint: 0xff6a00, accent: 0x15171a, wing: 'ducktail', rim: 0x15171a, caliper: 0xe3262f, finish: 'gloss', number: 22, body: 'exotic' },
    skill: { cornerGrip: 20, braking: 9.5, lane: -1.2 },
  },
  {
    name: 'Frost',
    colorName: 'White',
    style: { paint: 0xe9eef3, accent: 0x1f6fd1, wing: 'gt', rim: 0x1f6fd1, caliper: 0x1f6fd1, finish: 'gloss', number: 3, body: 'exotic' },
    skill: { cornerGrip: 19, braking: 9.5, lane: 0.8 },
  },
  {
    name: 'Volt',
    colorName: 'Yellow',
    style: { paint: 0xffc400, accent: 0x15171a, wing: 'none', rim: 0x15171a, caliper: 0x15171a, finish: 'gloss', number: 11, body: 'exotic' },
    skill: { cornerGrip: 18, braking: 9, lane: -0.8 },
  },
  {
    name: 'Jade',
    colorName: 'Green',
    style: { paint: 0x0f8a5f, accent: 0xd8b25a, wing: 'ducktail', rim: 0xd8b25a, caliper: 0xd8b25a, finish: 'matte', number: 45, body: 'exotic' },
    skill: { cornerGrip: 16.5, braking: 8.5, lane: 0 },
  },
];
