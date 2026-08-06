import { CharacterId, EntityState, PlayerInput } from '../types';
import { CHARACTERS } from './characterData';
import { PLAYER_KICK_REACH, PLAYER_PUNCH_REACH } from './constants';

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
 * How far the camera runs ahead of the leader, minus the viewport clamp.
 *
 * The camera sits at `leader − 250` and no player may be left of
 * `cameraX + 20`, so a trailing fighter is dragged along that edge and can
 * never fall more than this far behind. It is the ceiling on any leash: ask
 * for more than this and the engine simply cannot deliver it.
 */
export const TRAIL_CEILING_X = 230;

/**
 * Gap at which the buddy stops walking and starts running.
 *
 * A buddy slower than the hero cannot close the leash on foot — the Feet
 * Master loses 2.7px a frame to a running Fun Maker and ends up pinned to the
 * screen edge for the whole traversal, animating a walk that goes nowhere.
 * The thresholds are the leash band itself: sprint the moment the band is
 * left behind, walk again once back inside it. Anything looser and the buddy
 * settles at the wrong distance — releasing at 150 left it yo-yoing between
 * 150 and the 230px ceiling, never reaching the position it was aiming for.
 */
export const CATCH_UP_ENGAGE_X = LEASH_X + LEASH_TOLERANCE_X;
export const CATCH_UP_RELEASE_X = LEASH_X;

/**
 * How much faster the buddy moves while catching up.
 *
 * This is the one place the buddy stops playing by the hero's rules, and it is
 * deliberate: no honest input can outrun a faster character. 2x clears the
 * widest speed gap in the roster (3.8 against 6.5) with room to actually gain
 * ground rather than merely hold station. It only ever applies while following
 * with nothing to fight, so it can never win a fight the player would lose.
 */
export const CATCH_UP_MULTIPLIER = 2;

/**
 * Whether the buddy should be sprinting this frame, with hysteresis.
 *
 * Only while following: a buddy that has something to punch is where it needs
 * to be already.
 */
export function catchUpScale(
  self: EntityState,
  ally: EntityState | null,
  following: boolean,
  memory: CompanionMemory
): number {
  if (!following || !ally || ally.hp <= 0) {
    memory.catchingUp = false;
    return 1;
  }

  const behind = ally.x - self.x;
  if (behind > CATCH_UP_ENGAGE_X) memory.catchingUp = true;
  else if (behind < CATCH_UP_RELEASE_X) memory.catchingUp = false;

  return memory.catchingUp ? CATCH_UP_MULTIPLIER : 1;
}

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
  strikeCooldown: number;
  /**
   * Whether the buddy is currently sprinting to close a gap it cannot walk off.
   *
   * Lives in memory rather than being recomputed because the engine reads it
   * after the policy has run: the decision of how fast to move belongs with
   * the decision of where to move, and both are made in one place per frame.
   */
  catchingUp: boolean;
}

export const newCompanionMemory = (): CompanionMemory => ({
  targetId: null,
  strikeCooldown: 0,
  catchingUp: false,
});

/** How sharp the buddy plays. */
export interface CompanionTuning {
  /** Frames of rest between attacks, on top of the animation's own recovery. */
  strikeCooldown: number;
  /** How far off in depth a target may be and still be swung at. */
  strikeMaxDy: number;
  /** Enemies inside the power move's radius before spending 30 meter is worth it. */
  powerMoveCrowd: number;
}

/**
 * How the buddy plays, everywhere, on every setting.
 *
 * Deliberately not indexed by difficulty. The enemy side already scales
 * through ATTACKERS_BY_DIFFICULTY, and moving the ally on the same dial means
 * the setting no longer says one thing: a player raising the difficulty would
 * be asking for more enemies and getting a worse partner in the same gesture,
 * or a better one, and either way the number on the menu stops mapping to
 * anything a player can predict. The buddy fights the same way at every level;
 * what changes is how much is coming at it.
 *
 * The numbers stay a parameter rather than literals inside the policy so a
 * test can hand it a different set, and so a future decision to scale — by
 * difficulty, by stage, by whatever — has one place to hook into.
 */
export const COMPANION_TUNING: CompanionTuning = {
  strikeCooldown: 9,
  strikeMaxDy: STRIKE_MAX_DY,
  powerMoveCrowd: 3,
};

/**
 * Furthest a kick may be thrown from, on the same margin as the punch.
 *
 * The kick reaches 135 against the punch's 110 and hits far harder, so the
 * band between the two is the buddy's opener: it arrives kicking and settles
 * into punches once it is inside.
 */
export const KICK_MAX_DX = PLAYER_KICK_REACH - 12;

/**
 * Radius each power move actually covers, per hero.
 *
 * Read off `performPowerMove`. Omega Biker's is a directional shockwave with
 * no distance bound of its own, so 200 stands in for "a screen-length ahead" —
 * an estimate, unlike the other three, which are the literal radii the engine
 * tests against.
 */
export const POWER_MOVE_RADIUS: Record<CharacterId, number> = {
  FEET_MASTER: 200,
  FUN_MAKER: 180,
  OMEGA_BIKER: 200,
  ANGRY_CORSO: 150,
};

/** Meter a power move costs, mirrored from `performPowerMove`. */
export const POWER_MOVE_COST = 30;

/** A boss worth spending the meter on rather than saving it for a crowd. */
function isPressingBoss(target: EntityState, self: EntityState): boolean {
  const isBoss = target.enemyType === 'BOSS_MADAM_MIZYDIA' || target.enemyType === 'BOSS_SAYONARA';
  if (!isBoss) return false;
  // Omega Biker is the only hero whose power move zeroes a censure shield, so
  // his is worth spending the moment one is up rather than saving for later.
  if (self.charId === 'OMEGA_BIKER' && (target.shieldHp ?? 0) > 0) return true;
  return target.hp / target.maxHp < 0.4;
}

/**
 * Whether the meter is better spent now than saved.
 *
 * `suppressedTimer` is checked here as well as in `updatePlayer` — a dart from
 * a Conversion Therapist locks the move out, and a buddy that keeps mashing a
 * button the engine is ignoring stops swinging with the ones it still has.
 */
export function shouldPowerMove(
  self: EntityState,
  target: EntityState,
  entities: EntityState[],
  tuning: CompanionTuning
): boolean {
  if (self.powerMeter < POWER_MOVE_COST || self.suppressedTimer > 0) return false;

  if (isPressingBoss(target, self)) return true;

  const radius = POWER_MOVE_RADIUS[self.charId as CharacterId] ?? 180;
  const crowd = entities.filter(
    (e) => isEngageable(e) && Math.hypot(e.x - self.x, e.y - self.y) <= radius
  ).length;

  return crowd >= tuning.powerMoveCrowd;
}

/**
 * Which melee attack the hero in question prefers when both would land.
 *
 * Read from the stats the character sheet already carries rather than
 * switched on hero id, so a future fighter inherits a preference without
 * touching this file: long reach favours the kick, high combo favours the
 * punch, and everyone else alternates by falling through to the punch.
 */
export function prefersKick(charId: CharacterId | undefined): boolean {
  if (!charId) return false;
  const stats = CHARACTERS[charId].stats;
  return stats.range >= 4 && stats.combo < 5;
}

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

/**
 * Whether an attack thrown this frame would reach `target`.
 *
 * Measured against the kick, the longer of the two: being in range at all is
 * what separates ENGAGE from STRIKE. Which attack to throw is decided after.
 */
export function canStrike(
  self: EntityState,
  target: EntityState,
  maxDy: number = STRIKE_MAX_DY
): boolean {
  return Math.abs(target.x - self.x) <= KICK_MAX_DX && Math.abs(target.y - self.y) <= maxDy;
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
export function companionState(
  self: EntityState,
  target: EntityState | null,
  maxDy: number = STRIKE_MAX_DY
): CompanionState {
  if (self.stunTimer > 0 || BUSY_ACTIONS.includes(self.action)) return 'RECOVER';
  if (!target) return 'FOLLOW';
  return canStrike(self, target, maxDy) ? 'STRIKE' : 'ENGAGE';
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
  memory: CompanionMemory,
  tuning: CompanionTuning = COMPANION_TUNING
): PlayerInput {
  const target = selectTarget(self, entities, memory.targetId);
  memory.targetId = target?.id ?? null;
  if (memory.strikeCooldown > 0) memory.strikeCooldown--;

  const state = companionState(self, target, tuning.strikeMaxDy);
  catchUpScale(self, ally, state === 'FOLLOW', memory);

  switch (state) {
    case 'RECOVER':
      return { ...IDLE_INPUT };

    case 'STRIKE': {
      const approach = walkToward(target!.x - self.x, target!.y - self.y, true);

      if (shouldPowerMove(self, target!, entities, tuning)) {
        memory.strikeCooldown = tuning.strikeCooldown;
        return { ...approach, special: true };
      }

      // Resting between swings is what makes the buddy read as a fighter
      // rather than a turret. It keeps walking through the pause.
      if (memory.strikeCooldown > 0) return approach;
      memory.strikeCooldown = tuning.strikeCooldown;

      // The kick reaches further and hits harder at the cost of ten more
      // frames of commitment, so it opens from the outer band; inside, it is
      // down to which the hero is built for.
      const outerBand = Math.abs(target!.x - self.x) > STRIKE_MAX_DX;
      const useKick = outerBand || prefersKick(self.charId);
      return { ...approach, punch: !useKick, kick: useKick };
    }

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
