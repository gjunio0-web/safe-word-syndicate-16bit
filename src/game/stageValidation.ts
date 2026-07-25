import { StageConfig } from '../types';
import { maxWaveTriggerX, minStageLengthFor } from './constants';

export interface StageValidationIssue {
  stageId: number;
  stageName: string;
  waveIndex: number;
  triggerX: number;
  maxTriggerX: number;
  minStageLength: number;
  message: string;
}

/**
 * Checks that every wave in a stage is reachable by the camera.
 *
 * The engine fires a wave when `cameraX >= triggerX - WAVE_TRIGGER_LOOKAHEAD`,
 * but the camera never goes past `stage.length - VIEWPORT_WIDTH`. A trigger
 * above that ceiling never happens — and since `stageCleared` only occurs once
 * every wave has been cleared, the stage becomes impossible to complete.
 */
export function validateStage(stage: StageConfig): StageValidationIssue[] {
  const limit = maxWaveTriggerX(stage.length);

  return stage.waves.flatMap((wave, waveIndex) => {
    if (wave.triggerX <= limit) return [];

    return [
      {
        stageId: stage.id,
        stageName: stage.name,
        waveIndex,
        triggerX: wave.triggerX,
        maxTriggerX: limit,
        minStageLength: minStageLengthFor(wave.triggerX),
        message:
          `Onda ${waveIndex + 1} da fase ${stage.id} ("${stage.name}") é inalcançável: ` +
          `triggerX=${wave.triggerX}, mas o máximo para length=${stage.length} é ${limit}. ` +
          `Reduza o triggerX para <= ${limit} ou aumente o length para >= ${minStageLengthFor(wave.triggerX)}.`,
      },
    ];
  });
}

export function validateStages(stages: StageConfig[]): StageValidationIssue[] {
  return stages.flatMap(validateStage);
}

/**
 * Throws at module load in development. Failing loudly is deliberate: a
 * softlock only shows up after several minutes of play, so the error has to
 * surface before anyone opens the game, not during.
 *
 * It does not throw in production — the engine clamps the trigger to the
 * reachable maximum, so a badly designed stage loses its intended pacing but
 * stays playable.
 */
export function assertStagesAreCompletable(stages: StageConfig[]): void {
  // Exactly one stage ends the campaign. Zero means victory is unreachable;
  // more than one means it fires early, which is precisely what happened when
  // Madam Mizydia — the boss of two stages — was treated as the final boss
  // wherever she appeared.
  const finals = stages.filter((s) => s.isFinalStage);
  if (finals.length !== 1) {
    throw new Error(
      `[stageData] expected exactly one stage flagged isFinalStage, found ${finals.length}` +
        (finals.length ? `: ${finals.map((s) => s.id).join(', ')}` : '')
    );
  }

  const issues = validateStages(stages);
  if (issues.length === 0) return;

  const report = issues.map((i) => `  - ${i.message}`).join('\n');
  throw new Error(`[stageData] ${issues.length} onda(s) inalcançável(is):\n${report}`);
}
