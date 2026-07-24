/**
 * Constantes espaciais do motor.
 *
 * Estes valores estavam espalhados como números mágicos entre `engine.ts` e
 * `stageData.ts`, sem nenhuma relação declarada entre eles. Como o alcance
 * máximo da câmera é derivado do comprimento da fase, e o disparo de uma onda
 * depende da posição da câmera, o design de fase e o motor estão acoplados —
 * e esse acoplamento precisa ser explícito para não voltar a quebrar.
 */

/** Largura do viewport do canvas, em unidades de mundo. */
export const VIEWPORT_WIDTH = 800;

/** Quanto antes do `triggerX` a onda dispara. */
export const WAVE_TRIGGER_LOOKAHEAD = 100;

/**
 * Folga exigida além do mínimo teórico.
 *
 * Sem ela, a onda dispararia exatamente no frame em que a câmera atinge seu
 * limite — sem margem para arredondamento ou para o jogador parar um pixel
 * antes. A folga garante que o gatilho aconteça com a câmera ainda em curso.
 */
export const WAVE_TRIGGER_SAFETY_MARGIN = 100;

/** Posição máxima que a câmera pode alcançar numa fase. */
export function maxCameraX(stageLength: number): number {
  return stageLength - VIEWPORT_WIDTH;
}

/**
 * Maior `triggerX` que ainda é alcançável numa fase deste comprimento.
 *
 * Qualquer onda acima disso nunca dispara: a câmera para antes, o
 * `currentWaveIndex` nunca avança e a fase fica impossível de concluir.
 */
export function maxWaveTriggerX(stageLength: number): number {
  return maxCameraX(stageLength) + WAVE_TRIGGER_LOOKAHEAD - WAVE_TRIGGER_SAFETY_MARGIN;
}

/**
 * Comprimento mínimo de fase para acomodar um dado `triggerX`.
 * Útil ao desenhar uma fase nova: escolha os gatilhos e derive o comprimento.
 */
export function minStageLengthFor(triggerX: number): number {
  return triggerX + VIEWPORT_WIDTH - WAVE_TRIGGER_LOOKAHEAD + WAVE_TRIGGER_SAFETY_MARGIN;
}
