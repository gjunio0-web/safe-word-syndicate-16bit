import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { renderEntitySprite } from '../game/spriteRenderer';
import { renderStageBackground } from '../game/stageData';
import { CHARACTERS } from '../game/characterData';
import { CharacterId, StageConfig } from '../types';
import { spriteHero } from './helpers';

/**
 * Silhouette legibility.
 *
 * Omega Biker disappeared into the dark stages: near-black armour, a near-black
 * outline, and a near-black background. Feet Master was worse on Suburbia, and
 * on the Mega-Church every hero was illegible — nobody had noticed because that
 * stage was unreachable until the softlock was fixed.
 *
 * What the eye uses is the step in brightness at the edge of the shape, not the
 * average brightness of the body: a bright character on a bright background is
 * as unreadable as a dark one on dark. So the measurement samples only the
 * pixels where the sprite meets what is behind it.
 *
 * The threshold guards against regression, not against a particular palette.
 * Recolouring a character freely is fine; making one vanish is not.
 */

const STAGE_TYPES: StageConfig['bgType'][] = [
  'STAGE_1_NEON',
  'STAGE_2_SUBURB',
  'STAGE_3_CHURCH',
];

const HEROES = Object.keys(CHARACTERS) as CharacterId[];

/** Below this, tested by eye, the outline stops separating the figure. */
const MIN_EDGE_CONTRAST = 20;

const WIDTH = 300;
const HEIGHT = 300;
const GROUND_Y = 250;

const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Mean brightness step along the silhouette edge.
 *
 * A pixel belongs to the sprite when the two renders differ there. For each
 * such pixel touching a non-sprite neighbour, the difference between the
 * sprite's brightness and the background's is one sample of the edge.
 */
function edgeContrast(charId: CharacterId, stageType: StageConfig['bgType']): number {
  const background = createCanvas(WIDTH, HEIGHT);
  const backgroundCtx = background.getContext('2d');
  renderStageBackground(
    backgroundCtx as unknown as CanvasRenderingContext2D,
    stageType,
    400,
    WIDTH,
    HEIGHT
  );

  const composed = createCanvas(WIDTH, HEIGHT);
  const composedCtx = composed.getContext('2d');
  composedCtx.drawImage(background, 0, 0);
  composedCtx.save();
  composedCtx.translate(WIDTH / 2, GROUND_Y);
  renderEntitySprite(
    composedCtx as unknown as CanvasRenderingContext2D,
    spriteHero(charId),
    0,
    0
  );
  composedCtx.restore();

  const before = backgroundCtx.getImageData(0, 0, WIDTH, HEIGHT).data;
  const after = composedCtx.getImageData(0, 0, WIDTH, HEIGHT).data;

  const painted = (i: number) =>
    Math.abs(after[i] - before[i]) > 3 ||
    Math.abs(after[i + 1] - before[i + 1]) > 3 ||
    Math.abs(after[i + 2] - before[i + 2]) > 3;

  let total = 0;
  let samples = 0;

  for (let y = 1; y < HEIGHT - 1; y++) {
    for (let x = 1; x < WIDTH - 1; x++) {
      const i = (y * WIDTH + x) * 4;
      if (!painted(i)) continue;

      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const j = ((y + dy) * WIDTH + (x + dx)) * 4;
        if (painted(j)) continue;

        total += Math.abs(
          luminance(after[i], after[i + 1], after[i + 2]) -
            luminance(before[j], before[j + 1], before[j + 2])
        );
        samples++;
      }
    }
  }

  return samples === 0 ? 0 : total / samples;
}

describe('hero legibility against stage backgrounds', () => {
  for (const stageType of STAGE_TYPES) {
    for (const charId of HEROES) {
      it(`${charId} reads against ${stageType}`, () => {
        const contrast = edgeContrast(charId, stageType);
        expect(
          contrast,
          `${charId} on ${stageType} measured ${contrast.toFixed(1)}`
        ).toBeGreaterThan(MIN_EDGE_CONTRAST);
      });
    }
  }

  it('draws something in every case, so a zero reading means invisible not absent', () => {
    for (const stageType of STAGE_TYPES) {
      for (const charId of HEROES) {
        expect(edgeContrast(charId, stageType)).toBeGreaterThan(0);
      }
    }
  });
});
