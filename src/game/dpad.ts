/**
 * Direction resolution for the on-screen D-pad.
 *
 * The pad used to be four separate buttons pinned at north/south/east/west.
 * A touch can only be inside one rectangle at a time, so that layout could
 * never report two axes at once — and this is a 2.5D brawler where landing a
 * hit means standing on the enemy's Y line first. engine.ts reads the axes
 * independently (two `if` blocks, not a switch), so it has always been able
 * to walk a diagonal; there was simply no input capable of asking for one.
 * Closing distance on something that is both ahead and further back meant
 * alternating — walk, stop, step up, stop — while the wave closed in.
 *
 * The fix is one continuous surface: any point on the pad resolves to a
 * direction, and two axes can be live together.
 *
 * Resolution is a threshold per axis rather than an angular sector, because
 * the axes are what the caller actually wants. Sectors would need a table of
 * angular ranges, boundary handling, and then a translation back into these
 * four booleans anyway. Here each axis is one comparison, the diagonal falls
 * out of both passing at once (there is no `else` to prevent it), opposite
 * pairs are mutually exclusive by construction, and the neutral zone is just
 * the case where neither passes — no separate deadzone radius to keep in
 * sync.
 *
 * Kept out of the component so the geometry can be exercised without a DOM.
 */

export interface DpadDirections {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/**
 * Fraction of the pad radius a touch must clear on an axis before that axis
 * registers.
 *
 * A fraction, not a pixel count: the pad is 112px across in landscape and
 * 144px in portrait, so a fixed threshold would make the same thumb travel
 * mean different things in each orientation and the control would feel like
 * it changed when the phone was turned.
 *
 * Above 1/√2 (~0.707) the four cardinal bands meet at the rim and the corners
 * where both axes clear disappear entirely — that is the old four-button
 * behaviour expressed as a number, and DIAGONAL_LIMIT below exists so a
 * future tweak cannot walk back into it by accident.
 *
 * 0.36 splits the rim roughly evenly between cardinal and diagonal (about 42°
 * each). It is a starting point chosen for that symmetry, not a value derived
 * from play — worth revisiting against a real thumb.
 */
export const DEFAULT_THRESHOLD = 0.36;

/** Thresholds at or above this leave no reachable diagonal. */
export const DIAGONAL_LIMIT = Math.SQRT1_2;

const NEUTRAL: DpadDirections = { up: false, down: false, left: false, right: false };

/**
 * Resolves a touch offset from the pad centre into per-axis directions.
 *
 * @param dx      Horizontal offset from centre, in CSS pixels. Positive is right.
 * @param dy      Vertical offset from centre, in CSS pixels. Positive is down,
 *                matching client coordinates, so `up` is the negative side.
 * @param radius  Pad radius in CSS pixels. Non-finite or non-positive radii
 *                resolve to neutral rather than dividing by zero: a pad that
 *                has not been measured yet must not report input.
 * @param threshold Fraction of `radius` an axis must clear. Values at or above
 *                DIAGONAL_LIMIT are clamped just below it, so no configuration
 *                can reintroduce the unreachable-diagonal bug this replaced.
 */
export function directionFromTouch(
  dx: number,
  dy: number,
  radius: number,
  threshold: number = DEFAULT_THRESHOLD
): DpadDirections {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { ...NEUTRAL };
  if (!Number.isFinite(radius) || radius <= 0) return { ...NEUTRAL };

  const safeThreshold = Number.isFinite(threshold)
    ? Math.min(Math.max(threshold, 0), DIAGONAL_LIMIT - Number.EPSILON)
    : DEFAULT_THRESHOLD;

  const cutoff = radius * safeThreshold;

  return {
    up: dy < -cutoff,
    down: dy > cutoff,
    left: dx < -cutoff,
    right: dx > cutoff,
  };
}

/** True when any axis is live. Used to drive the pad's own pressed styling. */
export function isNeutral(dirs: DpadDirections): boolean {
  return !dirs.up && !dirs.down && !dirs.left && !dirs.right;
}

/**
 * Midpoint angle, in degrees clockwise from east, of the wedge a direction
 * set points at — or null when neutral.
 *
 * Only the highlight overlay consumes this. Resolution above stays in axis
 * space; this converts the result for drawing, rather than the geometry being
 * angular in the first place.
 */
export function wedgeAngle(dirs: DpadDirections): number | null {
  if (isNeutral(dirs)) return null;

  const x = (dirs.right ? 1 : 0) - (dirs.left ? 1 : 0);
  const y = (dirs.down ? 1 : 0) - (dirs.up ? 1 : 0);

  return (Math.atan2(y, x) * 180) / Math.PI;
}
