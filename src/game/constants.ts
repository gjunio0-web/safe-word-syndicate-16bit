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
