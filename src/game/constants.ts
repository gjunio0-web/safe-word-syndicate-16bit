/**
 * Spatial constants for the engine.
 *
 * These used to be magic numbers scattered between `engine.ts` and
 * `stageData.ts` with no declared relationship. The camera's maximum reach is
 * derived from the stage length, and wave triggering depends on the camera
 * position, so stage design and the engine are coupled. That coupling has to
 * be explicit, or it silently breaks again.
 */

/** Canvas viewport width, in world units. */
export const VIEWPORT_WIDTH = 800;

/** How far ahead of `triggerX` a wave fires. */
export const WAVE_TRIGGER_LOOKAHEAD = 100;

/**
 * Slack required beyond the theoretical minimum.
 *
 * Without it a wave would fire on the exact frame the camera hits its limit,
 * leaving no room for rounding or for the player stopping one pixel short.
 * The margin guarantees the trigger lands while the camera is still moving.
 */
export const WAVE_TRIGGER_SAFETY_MARGIN = 100;

/** Furthest position the camera can reach in a stage. */
export function maxCameraX(stageLength: number): number {
  return stageLength - VIEWPORT_WIDTH;
}

/**
 * Largest `triggerX` still reachable in a stage of this length.
 *
 * Any wave above this never fires: the camera stops short, `currentWaveIndex`
 * never advances, and the stage becomes impossible to complete.
 */
export function maxWaveTriggerX(stageLength: number): number {
  return maxCameraX(stageLength) + WAVE_TRIGGER_LOOKAHEAD - WAVE_TRIGGER_SAFETY_MARGIN;
}

/**
 * Minimum stage length that accommodates a given `triggerX`.
 * Useful when designing a new stage: pick the triggers, derive the length.
 */
export function minStageLengthFor(triggerX: number): number {
  return triggerX + VIEWPORT_WIDTH - WAVE_TRIGGER_LOOKAHEAD + WAVE_TRIGGER_SAFETY_MARGIN;
}

/**
 * Body separation enforced by `resolveBodyCollisions`.
 *
 * These used to be a single pair applied to every entity pair. Because the
 * spacing (72px) is roughly the melee attack range (65-90px), only one enemy
 * could ever occupy the attack band; the others shoved whoever was there back
 * out of it. In waves with two or more melee enemies — which is every wave —
 * nobody ever landed a hit.
 *
 * Enemies now keep less distance from each other than from the player, so a
 * granted attacker is not ejected by the crowd behind it.
 */
export const PLAYER_BODY_SEPARATION_X = 72;
export const PLAYER_BODY_SEPARATION_Y = 27;
// Widened from 34: still far tighter than the player's 72 (so the crowd
// behavior above holds), but 34 was narrower than a grunt's overhead
// nameplate and picket sign, so two adjacent enemies at rest rendered their
// labels as one overlapping smear.
export const ENEMY_BODY_SEPARATION_X = 44;
export const ENEMY_BODY_SEPARATION_Y = 14;

/**
 * How many melee enemies may engage the player at once.
 *
 * Standard beat 'em up pacing: a couple of attackers commit while the rest
 * circle deliberately. Without a cap, every enemy crowds in, and the collision
 * spacing above turns the pile into a stalemate.
 *
 * Ranged enemies are exempt — keeping distance is already their behaviour.
 */
export const MAX_SIMULTANEOUS_ATTACKERS = 2;

/** Horizontal distance kept by melee enemies waiting for an attack slot. */
export const ATTACKER_STANDOFF_X = 190;

/** Tolerance around the standoff ring, so waiting enemies do not jitter. */
export const ATTACKER_STANDOFF_TOLERANCE = 30;
