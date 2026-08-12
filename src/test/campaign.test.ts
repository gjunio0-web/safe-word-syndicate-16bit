import { describe, expect, it } from 'vitest';
import { ACTIVE_STAGES, IS_DEMO, LAST_ACTIVE_STAGE, isLastActiveStage } from '../game/campaign';
import { STAGES } from '../game/stageData';
import { assertStagesAreCompletable } from '../game/stageValidation';

describe('the active cut', () => {
  /*
   * The demo path is only exercised when someone remembers it exists, which is
   * how a cut quietly becomes the default. These run on every build instead.
   */

  it('is the whole campaign when nothing asked for a cut', () => {
    // Written to hold in both configurations on purpose. A test that only
    // passes without the flag makes `VITE_DEMO=true vitest` red, and a red
    // suite in the demo configuration is a suite nobody will run there.
    if (IS_DEMO) {
      expect(ACTIVE_STAGES.length).toBeLessThan(STAGES.length);
      expect(ACTIVE_STAGES).toEqual(STAGES.slice(0, ACTIVE_STAGES.length));
    } else {
      expect(ACTIVE_STAGES).toBe(STAGES);
      expect(LAST_ACTIVE_STAGE).toBe(STAGES[STAGES.length - 1]);
    }
  });

  it('ends the story only when the cut reaches the end of it', () => {
    expect(LAST_ACTIVE_STAGE.isFinalStage ?? false).toBe(!IS_DEMO);
  });

  it('knows which index ends the run', () => {
    expect(isLastActiveStage(ACTIVE_STAGES.length - 1)).toBe(true);
    expect(isLastActiveStage(0)).toBe(ACTIVE_STAGES.length === 1);
  });
});

describe('a cut that stops before the end of the story', () => {
  const cut = STAGES.slice(0, 1);

  it('is accepted even though nothing in it is the final stage', () => {
    expect(cut.some((s) => s.isFinalStage)).toBe(false);
    expect(() => assertStagesAreCompletable(cut)).not.toThrow();
  });

  it('still refuses two endings', () => {
    const twoFinals = [{ ...STAGES[0], isFinalStage: true }, STAGES[STAGES.length - 1]];
    expect(() => assertStagesAreCompletable(twoFinals)).toThrow(/at most one/);
  });

  it('still refuses a full campaign with no ending at all', () => {
    const noFinal = STAGES.map((s) => ({ ...s, isFinalStage: false }));
    expect(() => assertStagesAreCompletable(noFinal)).toThrow(/none/);
  });
});
