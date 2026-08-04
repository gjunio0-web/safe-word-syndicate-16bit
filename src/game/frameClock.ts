/**
 * Fixed-step clock for the simulation.
 *
 * The loop used to decide "has enough time passed?" and, if so, run exactly one
 * update — throwing away whatever time was left over. On a display that does
 * not land precisely on the step boundary that remainder is lost every frame,
 * so the game ran slower than it was written to run: measured against a 60Hz
 * signal with ordinary jitter it managed 57.6 steps per second, and at 45fps it
 * simply played in slow motion.
 *
 * An accumulator fixes that by banking the leftover instead of discarding it.
 * Real time goes in, whole steps come out, and the fraction that did not add up
 * to a step this frame is still there for the next one.
 */

/** Milliseconds of simulated time per step. Sixty steps to the second. */
export const STEP_MS = 1000 / 60;

/**
 * Longest real interval a single frame may contribute.
 *
 * A backgrounded tab, a breakpoint, or a laptop lid produces a gap of seconds.
 * Feeding that in whole would ask for hundreds of steps at once, which freezes
 * the page trying to catch up on time the player was not there for. Past this
 * ceiling the missing time is abandoned rather than simulated: the game resumes
 * where it left off instead of fast-forwarding.
 *
 * This also sets a floor on sustained frame rate: 1000 / MAX_FRAME_MS = 20fps.
 * Below that, every frame's clamp discards a growing slice of real time and
 * the game runs in slow motion rather than skipping simulated time — measured
 * at 100% speed at 20fps, 95% at 19fps, 75% at 15fps, 50% at 10fps. That is the
 * deliberate trade-off stated above (resume, don't fast-forward), not a bug;
 * it just wasn't written down as a number before.
 */
export const MAX_FRAME_MS = 50;

/**
 * Steps a single frame may run before the rest is dropped.
 *
 * With MAX_FRAME_MS = 50, the accumulator can never hold more than one step's
 * worth going in, so the most a frame can produce is
 * floor((MAX_FRAME_MS + STEP_MS) / STEP_MS) minus the sliver already spent —
 * 3 in practice, verified by sweeping every reachable accumulator state
 * against every delta from 0 to 5000ms. This constant is set well above that,
 * so the branch that uses it never runs today: it exists as a second line of
 * defence if MAX_FRAME_MS is ever loosened, not because the current pair of
 * constants needs one.
 */
export const MAX_STEPS_PER_FRAME = 5;

export interface FrameClock {
  /** Unspent real time, in milliseconds, carried between frames. */
  accumulator: number;
}

export function createFrameClock(): FrameClock {
  return { accumulator: 0 };
}

export interface FrameResult {
  /** How many fixed steps this frame should run. */
  steps: number;
  /** True when time was abandoned, either by the clamp or the step cap. */
  discarded: boolean;
}

/**
 * Banks the elapsed real time and reports how many steps it bought.
 *
 * `elapsedMs` is wall time since the previous frame. Negative or non-finite
 * values are treated as zero: `performance.now()` should never go backwards,
 * but a clock adjustment mid-frame is not worth crashing the game over.
 */
export function advanceClock(clock: FrameClock, elapsedMs: number): FrameResult {
  const safe = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const clamped = Math.min(safe, MAX_FRAME_MS);
  let discarded = clamped < safe;

  clock.accumulator += clamped;

  let steps = Math.floor(clock.accumulator / STEP_MS);
  if (steps > MAX_STEPS_PER_FRAME) {
    steps = MAX_STEPS_PER_FRAME;
    // Drop the backlog rather than carry it: keeping it guarantees the next
    // frame is over budget too, and the frame after that by more.
    clock.accumulator = 0;
    discarded = true;
  } else {
    clock.accumulator -= steps * STEP_MS;
  }

  return { steps, discarded };
}

/**
 * Forgets any banked time.
 *
 * Called when the simulation stops and restarts — a pause, a new stage — so the
 * gap does not arrive as a burst of steps the moment play resumes.
 */
export function resetClock(clock: FrameClock): void {
  clock.accumulator = 0;
}
