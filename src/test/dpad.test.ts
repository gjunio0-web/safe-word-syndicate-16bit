import { describe, it, expect } from 'vitest';
import {
  DEFAULT_THRESHOLD,
  DIAGONAL_LIMIT,
  directionFromTouch,
  isNeutral,
  wedgeAngle,
} from '../game/dpad';

const R = 56; // landscape pad radius: 112px across

describe('directionFromTouch', () => {
  it('reports neutral at the centre', () => {
    expect(directionFromTouch(0, 0, R)).toEqual({
      up: false,
      down: false,
      left: false,
      right: false,
    });
  });

  it('stays neutral anywhere inside the threshold square', () => {
    const inside = R * DEFAULT_THRESHOLD - 1;
    for (const [dx, dy] of [
      [inside, 0],
      [0, inside],
      [-inside, -inside],
      [inside, -inside],
    ]) {
      expect(isNeutral(directionFromTouch(dx, dy, R))).toBe(true);
    }
  });

  it('lights exactly one axis on a pure cardinal push', () => {
    expect(directionFromTouch(R, 0, R)).toMatchObject({ right: true, left: false, up: false, down: false });
    expect(directionFromTouch(-R, 0, R)).toMatchObject({ left: true, right: false, up: false, down: false });
    expect(directionFromTouch(0, -R, R)).toMatchObject({ up: true, down: false, left: false, right: false });
    expect(directionFromTouch(0, R, R)).toMatchObject({ down: true, up: false, left: false, right: false });
  });

  it('lights exactly two axes in a corner — the whole point of the rewrite', () => {
    const d = R * 0.7;
    expect(directionFromTouch(d, -d, R)).toMatchObject({ right: true, up: true, left: false, down: false });
    expect(directionFromTouch(-d, -d, R)).toMatchObject({ left: true, up: true, right: false, down: false });
    expect(directionFromTouch(d, d, R)).toMatchObject({ right: true, down: true, left: false, up: false });
    expect(directionFromTouch(-d, d, R)).toMatchObject({ left: true, down: true, right: false, up: false });
  });

  it('never reports opposing directions together, at any offset', () => {
    for (let dx = -R * 2; dx <= R * 2; dx += 7) {
      for (let dy = -R * 2; dy <= R * 2; dy += 7) {
        const dirs = directionFromTouch(dx, dy, R);
        expect(dirs.left && dirs.right).toBe(false);
        expect(dirs.up && dirs.down).toBe(false);
      }
    }
  });

  it('treats positive dy as down, matching client coordinates', () => {
    // Guards against a sign flip: in client space y grows downward, so a touch
    // below the centre must walk into the scene, not out of it.
    expect(directionFromTouch(0, R * 0.9, R).down).toBe(true);
    expect(directionFromTouch(0, R * 0.9, R).up).toBe(false);
  });

  it('scales with the pad, so the same relative reach means the same thing in both orientations', () => {
    const landscape = directionFromTouch(56 * 0.5, 0, 56);
    const portrait = directionFromTouch(72 * 0.5, 0, 72);
    expect(landscape).toEqual(portrait);
  });

  it('resolves to neutral for an unmeasured or nonsense pad', () => {
    expect(isNeutral(directionFromTouch(30, 30, 0))).toBe(true);
    expect(isNeutral(directionFromTouch(30, 30, -10))).toBe(true);
    expect(isNeutral(directionFromTouch(30, 30, Number.NaN))).toBe(true);
    expect(isNeutral(directionFromTouch(Number.NaN, 30, R))).toBe(true);
    expect(isNeutral(directionFromTouch(30, Number.POSITIVE_INFINITY, R))).toBe(true);
  });
});

describe('threshold guard', () => {
  it('keeps a diagonal reachable even when handed the value that would remove it', () => {
    // At or above 1/√2 the corners vanish and the pad degenerates into the
    // four-button behaviour this module replaced. The clamp is what stops a
    // later tweak from silently restoring that bug.
    const corner = R * 0.71;
    const dirs = directionFromTouch(corner, -corner, R, DIAGONAL_LIMIT);
    expect(dirs.right && dirs.up).toBe(true);
  });

  it('clamps absurd thresholds instead of trusting them', () => {
    const corner = R * 0.99;
    expect(directionFromTouch(corner, -corner, R, 99).right).toBe(true);
    expect(directionFromTouch(corner, -corner, R, Number.NaN).right).toBe(true);
  });

  it('a zero threshold makes every off-centre touch directional', () => {
    expect(directionFromTouch(0.5, 0, R, 0).right).toBe(true);
    expect(isNeutral(directionFromTouch(0, 0, R, 0))).toBe(true);
  });

  it('the default leaves both cardinal and diagonal reachable', () => {
    expect(DEFAULT_THRESHOLD).toBeGreaterThan(0);
    expect(DEFAULT_THRESHOLD).toBeLessThan(DIAGONAL_LIMIT);
  });
});

describe('wedgeAngle', () => {
  it('has no angle when neutral', () => {
    expect(wedgeAngle(directionFromTouch(0, 0, R))).toBeNull();
  });

  it('points east for right and north for up', () => {
    expect(wedgeAngle(directionFromTouch(R, 0, R))).toBe(0);
    expect(wedgeAngle(directionFromTouch(0, -R, R))).toBe(-90);
  });

  it('splits the difference on a diagonal', () => {
    const d = R * 0.7;
    expect(wedgeAngle(directionFromTouch(d, -d, R))).toBe(-45);
    expect(wedgeAngle(directionFromTouch(-d, d, R))).toBe(135);
  });
});
