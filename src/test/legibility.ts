/**
 * Silhouette legibility, measured.
 *
 * What the eye uses is the step in brightness at the edge of a shape, not the
 * average brightness of the body: a bright character on a bright background is
 * as unreadable as a dark one on dark. So the measurement samples only the
 * pixels where the sprite meets what is behind it.
 *
 * This lives in its own file rather than inside the test that asserts on it,
 * because the reading is only meaningful if everyone takes it the same way and
 * the arrangement has already been reinvented three times by three people
 * chasing three different answers. One measured a sprite at a stand-in size,
 * which left the name plate — hung off `height`, far above the head — inside
 * the sampled region. One cropped the frame by declared height, which the
 * arrangement here does not do. One marked a pixel as belonging to the sprite
 * by exact inequality rather than the tolerance below, counting antialiasing
 * as body and dragging every mean down. All three reported numbers in good
 * faith and all three were measuring something else.
 *
 * A probe that imports this is comparable with the suite and with every other
 * probe. A probe that reimplements it is a fourth answer.
 *
 * The threshold guards against regression, not against a particular palette.
 * Recolouring a character freely is fine; making one vanish is not.
 */

import { createCanvas } from '@napi-rs/canvas';
import { renderEntitySprite } from '../game/spriteRenderer';
import { renderStageBackground } from '../game/stageData';
import { CharacterId, EntityState, StageConfig } from '../types';
import { spriteHero } from './helpers';

/** Every backdrop a fighter can be caught against. */
export const STAGE_TYPES: StageConfig['bgType'][] = [
  'STAGE_1_NEON',
  'STAGE_2_SUBURB',
  'STAGE_3_CHURCH',
];

/** Below this, tested by eye, the outline stops separating the figure. */
export const MIN_EDGE_CONTRAST = 20;

const WIDTH = 300;
const HEIGHT = 300;
const GROUND_Y = 250;

/**
 * Per-channel difference at which a pixel counts as belonging to the sprite.
 *
 * Not zero: canvas antialiases, so an exact comparison sweeps the soft fringe
 * around every edge into the body and averages the reading down.
 */
const PAINTED_TOLERANCE = 3;

const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Mean brightness step along the silhouette edge.
 *
 * A pixel belongs to the sprite when the two renders differ there. For each
 * such pixel touching a non-sprite neighbour, the difference between the
 * sprite's brightness and the background's is one sample of the edge.
 *
 * The whole frame is sampled, including anything the renderer hangs above the
 * head. Pass the fighter at the size it actually declares and that furniture
 * sits where it does in play; pass a stand-in size and it lands somewhere else,
 * which is a different measurement wearing the same name.
 */
export function edgeContrastOf(subject: EntityState, stageType: StageConfig['bgType']): number {
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
  renderEntitySprite(composedCtx as unknown as CanvasRenderingContext2D, subject, 0, 0, 0);
  composedCtx.restore();

  const before = backgroundCtx.getImageData(0, 0, WIDTH, HEIGHT).data;
  const after = composedCtx.getImageData(0, 0, WIDTH, HEIGHT).data;

  const painted = (i: number) =>
    Math.abs(after[i] - before[i]) > PAINTED_TOLERANCE ||
    Math.abs(after[i + 1] - before[i + 1]) > PAINTED_TOLERANCE ||
    Math.abs(after[i + 2] - before[i + 2]) > PAINTED_TOLERANCE;

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

/** The hero reading, since a hero carries no size of its own to get wrong. */
export const edgeContrast = (charId: CharacterId, stageType: StageConfig['bgType']) =>
  edgeContrastOf(spriteHero(charId), stageType);
