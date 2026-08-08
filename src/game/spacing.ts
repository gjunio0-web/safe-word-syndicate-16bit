import { EntityState } from '../types';
import {
  DEFAULT_BUILD_WIDTH,
  ENEMY_BODY_SEPARATION_X,
  PLAYER_BODY_SEPARATION_X,
} from './constants';

/**
 * How far apart two bodies come to rest, and the only place that answers it.
 *
 * The number governs more than collision. Every reach in the game is measured
 * from it, because a fighter can only swing at what its own body lets it stand
 * next to: resting distance is the floor under every attack range in the
 * project, and a range written under that floor is a fighter that approaches
 * forever and never swings.
 *
 * That failure has now happened twice, in opposite directions, and neither time
 * did anything break loudly. Sayonara declared a 140px build against an attack
 * range of 90 and stood mute in front of the player with the suite green. The
 * AI buddy committed to punching at 98 while her build held it 107.5 away, and
 * it went unnoticed because the kick still reached and her charge closed the
 * gap on its own — the behaviour looked fine and was arriving by accident.
 *
 * Both were fixed where they were found, which left the formula written out in
 * three places. This module exists so the next reach that needs a floor reads
 * it rather than restating it. The precedent is src/test/legibility.ts: the
 * same measure reimplemented three times gave three different answers, and the
 * cure was one ruler everybody holds.
 *
 * Everyone at the default build keeps the flat spacing this has always used:
 * one number for two enemies, a wider one when a player is involved. Those are
 * tuned values, and widening them across the board would loosen every crowd in
 * the game. Anyone built wider claims half of their own body instead.
 *
 * The rule used to ask whether the fighter was a boss, which happened to be
 * true of everyone unusually wide and was the wrong question: it left the only
 * subject as Sayonara, and once she stopped using the melee branch there was
 * no way left to exercise it at all. Asking about the build keeps it reachable
 * and changes nothing today — every current fighter lands on the same number
 * either way. The flat value stays a floor, so this can only push bodies
 * apart, never let them overlap further than they already do.
 *
 * What it actually moves, because "bosses take up more room" hides how much:
 *
 *     player to Sayonara        72  ->  107.5
 *     player to the Matriarch   72  ->   82.5
 *     the two bosses            34  ->  130
 *     grunt to grunt, player to grunt   unchanged
 *
 * The Sayonara figures moved again when she was widened to 155 in e4aaad2;
 * an earlier version of this note, written while she was 140, said 100 and
 * 122.5 and went stale where it sat, above a method in the engine, which is
 * part of why the rule was worth pulling out to one place.
 *
 * Depth is deliberately left alone. The walkable band is a couple of hundred
 * pixels deep and `height` does not measure it, so feeding height in here
 * would space fighters by a number that describes the wrong axis.
 */
export function restingSeparationX(a: EntityState, b: EntityState): number {
  const betweenEnemies = !a.isPlayer && !b.isPlayer;
  const base = betweenEnemies ? ENEMY_BODY_SEPARATION_X : PLAYER_BODY_SEPARATION_X;

  // A default build is already accounted for in the base numbers. Anything
  // wider claims half of its own body, so a boss is not standing inside the
  // fighter hitting it.
  if (a.width <= DEFAULT_BUILD_WIDTH && b.width <= DEFAULT_BUILD_WIDTH) return base;
  return Math.max(base, (a.width + b.width) / 2);
}
