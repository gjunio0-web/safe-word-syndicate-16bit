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
 * How much closer a new enemy must be before the buddy drops the one it is
 * already fighting.
 *
 * Straight nearest-first flips target every frame between two enemies at
 * roughly equal distance, and a fighter that changes its mind sixty times a
 * second walks nowhere. A quarter closer is a real difference; anything less
 * is noise.
 */
export const TARGET_SWITCH_RATIO = 0.75;

/**
 * Where the buddy stands when there is nothing to fight.
 *
 * Comfortably past the 72px both players are held apart by, so following the
 * hero around does not turn into shoving them down the street.
 */
export const LEASH_X = 120;

/**
 * Slack around the leash before the buddy corrects.
 *
 * Without it the buddy oscillates across the exact leash distance. With it,
 * the follow band is 95 to 145px and it simply stands there.
 */
export const LEASH_TOLERANCE_X = 25;

/**
 * What the buddy is doing this frame.
 *
 * Named because "the companion is stuck" is a sentence someone will say about
 * this code one day, and a state is easier to test and to read in a debugger
 * than a chain of conditions rebuilt from velocities after the fact.
 */
export type CompanionState = 'RECOVER' | 'STRIKE' | 'ENGAGE' | 'FOLLOW';

/** Actions during which no input is read anyway. Pressing buttons is theatre. */
const BUSY_ACTIONS = ['HURT', 'KNOCKDOWN', 'POWER_MOVE', 'BITING', 'RECOVERY'];

/** What the buddy remembers between frames. Owned by the engine. */
export interface CompanionMemory {
  targetId: string | null;
}

export const newCompanionMemory = (): CompanionMemory => ({ targetId: null });

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
 * The enemy the buddy commits to this frame.
 *
 * Sticky by design: the enemy held last frame is kept unless it stopped being
 * a target or something got materially closer. Pure — the caller decides what
 * to do with the answer.
 */
export function selectTarget(
  self: EntityState,
  entities: EntityState[],
  previousId: string | null
): EntityState | null {
  const nearest = nearestTarget(self, entities);
  if (!nearest) return null;

  const previous = entities.find((e) => e.id === previousId);
  if (!previous || !isEngageable(previous)) return nearest;

  const previousDist = Math.hypot(previous.x - self.x, previous.y - self.y);
  const nearestDist = Math.hypot(nearest.x - self.x, nearest.y - self.y);

  return nearestDist < previousDist * TARGET_SWITCH_RATIO ? nearest : previous;
}

/** Which of the four behaviours applies, given what the buddy can see. */
export function companionState(self: EntityState, target: EntityState | null): CompanionState {
  if (self.stunTimer > 0 || BUSY_ACTIONS.includes(self.action)) return 'RECOVER';
  if (!target) return 'FOLLOW';
  return canStrike(self, target) ? 'STRIKE' : 'ENGAGE';
}

/** Walk toward a point, pressing only the axes that are actually off. */
function walkToward(dx: number, dy: number, holdX: boolean): PlayerInput {
  return {
    ...IDLE_INPUT,
    left: holdX && dx < -FACING_DEADZONE_X,
    right: holdX && dx > FACING_DEADZONE_X,
    up: dy < -DEPTH_DEADZONE_Y,
    down: dy > DEPTH_DEADZONE_Y,
  };
}

/**
 * The buttons the buddy holds this frame.
 *
 * Four behaviours, checked in order of how much they override each other:
 *
 *   RECOVER — hurt, floored, mid-power-move or stunned. Hands off the pad.
 *   STRIKE  — a punch thrown now would land. Throw it, and keep pressing into
 *             the target: holding the direction through a swing is what keeps
 *             the buddy facing an enemy the punch just knocked backwards.
 *   ENGAGE  — an enemy exists but is out of reach. Close the distance.
 *   FOLLOW  — street is clear. Walk to a spot behind the hero rather than
 *             standing still, which is what made the old companion look like
 *             scenery being towed by the camera. Walking the hero's line also
 *             sweeps up dropped tacos on the way, since pickups are proximity
 *             based and need no seeking of their own.
 *
 * `updatePlayer` owns the cadence. An attack occupies the fighter for 18
 * frames and ignores the punch input until it ends, so a held button reads as
 * a combo rather than a blur.
 */
export function decideCompanionInput(
  self: EntityState,
  entities: EntityState[],
  ally: EntityState | null,
  memory: CompanionMemory
): PlayerInput {
  const target = selectTarget(self, entities, memory.targetId);
  memory.targetId = target?.id ?? null;

  switch (companionState(self, target)) {
    case 'RECOVER':
      return { ...IDLE_INPUT };

    case 'STRIKE':
      return { ...walkToward(target!.x - self.x, target!.y - self.y, true), punch: true };

    case 'ENGAGE':
      return walkToward(target!.x - self.x, target!.y - self.y, true);

    case 'FOLLOW': {
      if (!ally || ally.hp <= 0) return { ...IDLE_INPUT };
      // Behind the hero, on the side they came from, so the buddy does not
      // wander into the next wave ahead of the player who is steering.
      const anchorX = ally.x - LEASH_X;
      const dx = anchorX - self.x;
      return walkToward(dx, ally.y - self.y, Math.abs(dx) > LEASH_TOLERANCE_X);
    }
  }
}
