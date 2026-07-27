import { describe, expect, it } from 'vitest';
import { STAGES } from '../game/stageData';
import { assertStagesAreCompletable, validateStages } from '../game/stageValidation';
import { maxCameraX, maxWaveTriggerX, minStageLengthFor } from '../game/constants';
import { StageConfig } from '../types';

/**
 * The softlock family.
 *
 * The final wave of every stage was unreachable: the camera stops at
 * `length - VIEWPORT_WIDTH`, and each boss trigger sat beyond it, so no stage
 * could be completed and the victory screen was dead code. The numbers lived
 * in one file and the limit in another, with nothing tying them together.
 */
describe('stage design', () => {
  it('keeps every wave inside the camera reach', () => {
    expect(validateStages(STAGES)).toEqual([]);
  });

  it('flags a wave placed beyond the camera limit', () => {
    const broken: StageConfig[] = [
      { ...STAGES[0], waves: [{ ...STAGES[0].waves[0], triggerX: STAGES[0].length }] },
    ];
    const issues = validateStages(broken);
    expect(issues).toHaveLength(1);
    expect(issues[0].maxTriggerX).toBe(maxWaveTriggerX(STAGES[0].length));
  });

  it('derives a stage length that makes a trigger reachable', () => {
    const triggerX = 1800;
    const length = minStageLengthFor(triggerX);
    expect(triggerX).toBeLessThanOrEqual(maxWaveTriggerX(length));
  });

  it('leaves the trigger below the camera limit, not exactly on it', () => {
    for (const stage of STAGES) {
      const last = stage.waves[stage.waves.length - 1];
      expect(last.triggerX).toBeLessThanOrEqual(maxCameraX(stage.length));
    }
  });

  /**
   * Madam Mizydia is the boss of two stages. Treating "Mizydia died" as "the
   * campaign is won" ended the game one stage early.
   */
  describe('final stage flag', () => {
    it('marks exactly one stage as final', () => {
      expect(STAGES.filter((s) => s.isFinalStage)).toHaveLength(1);
    });

    it('rejects a campaign with no ending', () => {
      const noFinal = STAGES.map((s) => ({ ...s, isFinalStage: false }));
      expect(() => assertStagesAreCompletable(noFinal)).toThrow(/isFinalStage/);
    });

    it('rejects a campaign with two endings', () => {
      const twoFinals = STAGES.map((s) => ({ ...s, isFinalStage: true }));
      expect(() => assertStagesAreCompletable(twoFinals)).toThrow(/isFinalStage/);
    });
  });
});
