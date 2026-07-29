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
export const ENEMY_BODY_SEPARATION_X = 34;
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

/**
 * Attacker cap per difficulty.
 *
 * `difficulty` was written into the engine at construction and never read, so
 * the setting did nothing at all. The attack-slot system gave it something
 * honest to mean: how many enemies may engage at once is exactly the dial that
 * separates a manageable fight from an overwhelming one.
 */
export const ATTACKERS_BY_DIFFICULTY: Record<'EASY' | 'NORMAL' | 'PUNK_HARD', number> = {
  EASY: 1,
  NORMAL: MAX_SIMULTANEOUS_ATTACKERS,
  PUNK_HARD: 3,
};

/** Horizontal distance kept by melee enemies waiting for an attack slot. */
export const ATTACKER_STANDOFF_X = 190;

/** Tolerance around the standoff ring, so waiting enemies do not jitter. */
export const ATTACKER_STANDOFF_TOLERANCE = 30;

/**
 * Share of a body overlap absorbed by the player when colliding with an enemy.
 *
 * The correction used to be split evenly, so every adjacent enemy shoved the
 * player once per frame. Measured walking into a crowd, that cost 27% of the
 * player's speed with one enemy alongside and 50% with two or more — the
 * fighter appeared to wade through mud exactly when the fight got busy.
 *
 * Beat 'em ups resolve this by weight: the hero pushes through and the crowd
 * yields. A small non-zero share keeps contact readable without dragging.
 */
export const PLAYER_PUSH_SHARE = 0.15;

/**
 * Reach of a player kick, the longer of the two melee attacks.
 *
 * Heroes have no `attackRange` in their data — unlike enemies, their reach is a
 * constant inside the engine. Named here so the hitbox overlay can draw the
 * same number the combat code uses instead of guessing one.
 */
export const PLAYER_KICK_REACH = 135;

/**
 * Depth band the fighters may occupy.
 *
 * `STREET_TOP_Y` mirrors where `renderStageBackground` starts drawing the road:
 * `canvasHeight - 210` against a 450-tall design space. The walkable band used
 * to begin at 220, twenty pixels above that line, so a fighter who walked all
 * the way back stood on the strip between the buildings and the kerb — feet
 * planted on nothing, hovering over the edge of the road. Twenty design pixels
 * is a 46-pixel gap once the game is scaled onto a real display, which is large
 * enough to read as a bug rather than as perspective.
 *
 * The lower bound keeps a small margin above the bottom of the road so the
 * near kerb stays visible behind the closest fighter.
 */
export const STREET_TOP_Y = 240;
export const ARENA_MIN_Y = STREET_TOP_Y;
export const ARENA_MAX_Y = 440;

/**
 * Damage multiplier while Madam Mizydia is locked into a cast.
 *
 * Her standoff makes reaching her expensive: the player crosses two hundred
 * pixels with a faster enemy in the way. Without a payoff for arriving during
 * the one window she cannot move, the fight is a chase rather than a read.
 */
export const CASTING_DAMAGE_MULTIPLIER = 1.75;

/** How long a bark stays up. Long enough to read mid-fight, short enough to
 *  not still be hanging there when the next one lands. */
export const BARK_DURATION_FRAMES = 200;
