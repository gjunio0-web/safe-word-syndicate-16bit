import { EntityState, PlayerInput } from '../types';
import { PLAYER_PUNCH_REACH } from './constants';

/**
 * The AI buddy's brain.
 *
 * It decides nothing about the world — it reads a snapshot and returns the
 * buttons a player would be holding this frame. The engine then runs that
 * through `updatePlayer`, the same function a human's controller feeds.
 *
 * That indirection is the point. The previous companion mutated the entity
 * directly: its own movement code, its own attack trigger, its own idea of
 * when a hit connects. None of it saw stun, slow, suppression, the power
 * meter, or the attack-cancel rules, and its strike gate of 45px sat inside a
 * body separation of 72px that the collision pass re-enforced every frame — a
 * branch that could never run. Routing through the player path means the buddy
 * inherits every rule the hero already obeys, and inherits fixes to them too.
 */

/**
 * Every button released. The buddy's resting state, and the fallback whenever
 * the policy decides to do nothing at all.
 */
export const IDLE_INPUT: PlayerInput = {
  left: false,
  right: false,
  up: false,
  down: false,
  punch: false,
  kick: false,
  special: false,
  jump: false,
  grab: false,
};

/**
 * Horizontal slack before the buddy bothers turning.
 *
 * Facing follows the left/right input in `updatePlayer`, so a deadzone that is
 * too small has it flipping back and forth across an enemy standing dead
 * centre, which reads as a twitch rather than a fighter.
 */
export const FACING_DEADZONE_X = 8;

/** Depth slack before the buddy walks up or down the lane. */
export const DEPTH_DEADZONE_Y = 10;

/**
 * How far off in depth a target may be and still be worth swinging at.
 *
 * The punch itself lands inside 55px of depth (`performPunchCombo`), so 40
 * leaves room for both fighters to drift a little between the decision and the
 * hit without the swing whiffing.
 */
export const STRIKE_MAX_DY = 40;

/**
 * Furthest a punch may be thrown from.
 *
 * Derived, never typed as a number: 12px of margin under the real hitbox so an
 * enemy stepping back on the same frame does not turn the swing into air. If
 * combat tuning moves the reach, this moves with it.
 */
export const STRIKE_MAX_DX = PLAYER_PUNCH_REACH - 12;

/**
 * A target the buddy is allowed to hit.
 *
 * `downed` and `freed` are excluded for the same reason `updateEnemyAi` skips
 * them: a fighter on the floor has stopped fighting. It also keeps the buddy
 * away from a knocked-down Sayonara in the final room. Finishing her off is
 * what separates the two endings, and that choice belongs to the player, not
 * to a routine running beside them.
 */
export function isEngageable(entity: EntityState): boolean {
  return !entity.isPlayer && entity.hp > 0 && !entity.downed && !entity.freed;
}

/** Nearest engageable enemy, or null when the street is clear. */
export function nearestTarget(self: EntityState, entities: EntityState[]): EntityState | null {
  let best: EntityState | null = null;
  let bestDist = Infinity;

  for (const entity of entities) {
    if (!isEngageable(entity)) continue;
    const dist = Math.hypot(entity.x - self.x, entity.y - self.y);
    if (dist < bestDist) {
      best = entity;
      bestDist = dist;
    }
  }

  return best;
}

/** Whether a punch thrown this frame would reach `target`. */
export function canStrike(self: EntityState, target: EntityState): boolean {
  return (
    Math.abs(target.x - self.x) <= STRIKE_MAX_DX && Math.abs(target.y - self.y) <= STRIKE_MAX_DY
  );
}

/**
 * The buttons the buddy holds this frame.
 *
 * Walk toward the nearest enemy, keep pressing into it once there — holding
 * the direction through a swing is what keeps the buddy facing its target and
 * stepping after an enemy the punch knocked back — and throw a punch whenever
 * one would land. `updatePlayer` handles the cadence: an attack occupies the
 * fighter for 18 frames and the punch input is ignored until it ends, so a
 * held button is a combo, not a blur.
 */
export function decideCompanionInput(self: EntityState, entities: EntityState[]): PlayerInput {
  const target = nearestTarget(self, entities);
  if (!target) return { ...IDLE_INPUT };

  const dx = target.x - self.x;
  const dy = target.y - self.y;

  return {
    ...IDLE_INPUT,
    left: dx < -FACING_DEADZONE_X,
    right: dx > FACING_DEADZONE_X,
    up: dy < -DEPTH_DEADZONE_Y,
    down: dy > DEPTH_DEADZONE_Y,
    punch: canStrike(self, target),
  };
}
