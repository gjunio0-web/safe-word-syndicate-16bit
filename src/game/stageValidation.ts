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
 * Verifica se toda onda de uma fase é alcançável pela câmera.
 *
 * O motor dispara uma onda quando `cameraX >= triggerX - WAVE_TRIGGER_LOOKAHEAD`,
 * mas a câmera nunca passa de `stage.length - VIEWPORT_WIDTH`. Se o gatilho ficar
 * acima desse teto, a onda nunca acontece — e, como `stageCleared` só ocorre
 * depois que todas as ondas foram limpas, a fase se torna impossível de concluir.
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
 * Em desenvolvimento, estoura na carga do módulo. Falhar alto é intencional:
 * um softlock só aparece depois de vários minutos de jogo, então o erro
 * precisa acontecer antes de alguém abrir o jogo, não durante.
 *
 * Em produção não estoura — o motor limita o gatilho ao máximo alcançável,
 * então uma fase mal desenhada fica com o ritmo errado, mas continua jogável.
 */
export function assertStagesAreCompletable(stages: StageConfig[]): void {
  const issues = validateStages(stages);
  if (issues.length === 0) return;

  const report = issues.map((i) => `  - ${i.message}`).join('\n');
  throw new Error(`[stageData] ${issues.length} onda(s) inalcançável(is):\n${report}`);
}
