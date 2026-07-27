/**
 * Design resolution every draw call is written against.
 *
 * cameraX, arena bounds and spawn positions in engine.ts all assume an
 * 800-wide viewport, so this is a fixed logical size rather than whatever the
 * canvas backing buffer happens to be.
 */
export const DESIGN_WIDTH = 800;
export const DESIGN_HEIGHT = 450;

export interface ViewportFit {
  scale: number;
  offsetX: number;
  offsetY: number;
  drawnWidth: number;
  drawnHeight: number;
}

/**
 * Fits the design resolution inside a backing buffer of any shape.
 *
 * The scale has to come from whichever axis runs out first. Deriving it from
 * the width alone worked only while the canvas element happened to be 16:9 —
 * its container is `flex-1 w-full h-full` with no aspect lock, so on a wide
 * window a width-driven scale needs more height than the buffer has, and the
 * bottom of the scene is drawn past the edge and never seen. What goes missing
 * there is the near edge of the street, which is what visually grounds the
 * fighters: without it they read as hovering.
 *
 * This is what `object-contain` used to do for free, and it stopped applying
 * once the backing buffer started matching the element exactly — there is no
 * longer a smaller bitmap for the browser to fit inside a larger box.
 *
 * Kept out of the component so it can be exercised against container shapes
 * that are awkward to reproduce in a browser.
 */
export function fitViewport(bufferWidth: number, bufferHeight: number): ViewportFit {
  const scale = Math.min(bufferWidth / DESIGN_WIDTH, bufferHeight / DESIGN_HEIGHT);
  const drawnWidth = DESIGN_WIDTH * scale;
  const drawnHeight = DESIGN_HEIGHT * scale;

  return {
    scale,
    drawnWidth,
    drawnHeight,
    offsetX: (bufferWidth - drawnWidth) / 2,
    offsetY: (bufferHeight - drawnHeight) / 2,
  };
}
