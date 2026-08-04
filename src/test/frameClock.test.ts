import { describe, expect, it } from 'vitest';
import {
  advanceClock,
  createFrameClock,
  MAX_FRAME_MS,
  MAX_STEPS_PER_FRAME,
  resetClock,
  STEP_MS,
} from '../game/frameClock';

/** Runs a sequence of frame intervals and reports what the clock produced. */
function run(deltas: number[]) {
  const clock = createFrameClock();
  let steps = 0;
  let discarded = 0;
  for (const d of deltas) {
    const r = advanceClock(clock, d);
    steps += r.steps;
    if (r.discarded) discarded++;
  }
  return { steps, discarded, left: clock.accumulator };
}

/** Frame intervals for `seconds` of a display running at `hz`, with optional jitter. */
function display(hz: number, seconds: number, jitterMs = 0) {
  const frames = Math.round(hz * seconds);
  const base = 1000 / hz;
  return Array.from({ length: frames }, (_, i) => base + Math.sin(i * 1.7) * jitterMs);
}

describe('fixed-step clock', () => {
  it('turns one second of a perfect 60Hz signal into sixty steps', () => {
    expect(run(display(60, 1)).steps).toBe(60);
  });

  /**
   * The reason this module exists. The previous loop ran at most one step per
   * frame and discarded the remainder, so ordinary jitter cost it real time:
   * 57.6 steps per second measured, against the 60 it was written for.
   */
  it('keeps full speed through the jitter a real display has', () => {
    const { steps } = run(display(60, 10, 2));
    expect(steps).toBeGreaterThanOrEqual(597);
    expect(steps).toBeLessThanOrEqual(603);
  });

  it('runs the simulation at full speed on a display that cannot keep up', () => {
    // 45fps for ten seconds is still ten seconds of game.
    const { steps } = run(display(45, 10));
    expect(steps).toBeGreaterThanOrEqual(595);
    expect(steps).toBeLessThanOrEqual(600);
  });

  it('does not overrun on a display faster than the simulation', () => {
    // 144Hz must not run the game two and a bit times too fast.
    const { steps } = run(display(144, 10));
    expect(steps).toBeGreaterThanOrEqual(597);
    expect(steps).toBeLessThanOrEqual(601);
  });

  it('banks the remainder instead of dropping it', () => {
    const clock = createFrameClock();
    // Ten milliseconds buys no step on its own.
    expect(advanceClock(clock, 10).steps).toBe(0);
    expect(clock.accumulator).toBeCloseTo(10, 5);
    // The next ten pushes past one step and keeps the change.
    expect(advanceClock(clock, 10).steps).toBe(1);
    expect(clock.accumulator).toBeCloseTo(20 - STEP_MS, 5);
  });

  describe('when a frame is very late', () => {
    it('abandons the gap rather than simulating it', () => {
      const clock = createFrameClock();
      // Three seconds away from the tab.
      const r = advanceClock(clock, 3000);
      expect(r.discarded).toBe(true);
      expect(r.steps).toBeLessThanOrEqual(MAX_STEPS_PER_FRAME);
    });

    it('never spirals: a run of slow frames cannot keep growing the backlog', () => {
      const clock = createFrameClock();
      let worst = 0;
      for (let i = 0; i < 200; i++) {
        worst = Math.max(worst, advanceClock(clock, 500).steps);
      }
      expect(worst).toBeLessThanOrEqual(MAX_STEPS_PER_FRAME);
      expect(clock.accumulator).toBeLessThan(STEP_MS);
    });

    it('is back to normal on the next ordinary frame', () => {
      const clock = createFrameClock();
      advanceClock(clock, 3000);
      expect(advanceClock(clock, STEP_MS).steps).toBe(1);
    });
  });

  describe('hostile input', () => {
    it('treats a backwards clock as no time passing', () => {
      const clock = createFrameClock();
      expect(advanceClock(clock, -100).steps).toBe(0);
      expect(clock.accumulator).toBe(0);
    });

    it('treats a non-finite interval as no time passing', () => {
      const clock = createFrameClock();
      expect(advanceClock(clock, NaN).steps).toBe(0);
      expect(advanceClock(clock, Infinity).steps).toBeLessThanOrEqual(MAX_STEPS_PER_FRAME);
    });

    it('reports the clamp when a frame exceeds the ceiling', () => {
      const clock = createFrameClock();
      expect(advanceClock(clock, MAX_FRAME_MS + 1).discarded).toBe(true);
      expect(advanceClock(createFrameClock(), MAX_FRAME_MS - 1).discarded).toBe(false);
    });
  });

  it('forgets banked time on reset, so resuming does not burst', () => {
    const clock = createFrameClock();
    advanceClock(clock, 10);
    resetClock(clock);
    expect(clock.accumulator).toBe(0);
    expect(advanceClock(clock, 10).steps).toBe(0);
  });

  /**
   * Drift is the whole point: over a long run the number of steps has to track
   * real time, not merely stay close for a second or two.
   */
  it('stays true to real time over a long run', () => {
    for (const hz of [50, 60, 75, 90, 120, 144]) {
      const seconds = 60;
      const { steps } = run(display(hz, seconds, 1.5));
      const expected = seconds * 60;
      const driftPercent = Math.abs(steps - expected) / expected * 100;
      expect(driftPercent, `${hz}Hz drifted ${driftPercent.toFixed(2)}%`).toBeLessThan(1);
    }
  });
});

/**
 * These pin two facts about the current constants that used to live only in
 * comments: the true reachable ceiling on steps per frame, and the exact
 * slow-motion curve below 20fps. Both are consequences of MAX_FRAME_MS and
 * STEP_MS, not independent behaviour — if either constant changes, these are
 * meant to fail and force the comments above to be re-checked against them.
 */
describe('documented consequences of the current constants', () => {
  it('never produces more than 3 steps in a single frame, not the 5 the cap allows', () => {
    let worst = 0;
    for (let accStart = 0; accStart < STEP_MS; accStart += 0.1) {
      const clock = createFrameClock();
      clock.accumulator = accStart;
      for (let delta = 0; delta <= 5000; delta += 25) {
        worst = Math.max(worst, advanceClock(clock, delta).steps);
        clock.accumulator = accStart; // each delta tested from the same start
      }
    }
    expect(worst).toBe(3);
    expect(worst).toBeLessThan(MAX_STEPS_PER_FRAME);
  });

  it('matches the measured slow-motion curve below 20fps', () => {
    const speedPercent = (hz: number) => {
      const clock = createFrameClock();
      const dt = 1000 / hz;
      const seconds = 20;
      const frames = Math.round(hz * seconds);
      let steps = 0;
      for (let i = 0; i < frames; i++) steps += advanceClock(clock, dt).steps;
      return Math.round((steps / (frames * dt / 1000) / 60) * 100);
    };
    expect(speedPercent(20)).toBe(100);
    expect(speedPercent(19)).toBe(95);
    expect(speedPercent(15)).toBe(75);
    expect(speedPercent(10)).toBe(50);
  });
});
