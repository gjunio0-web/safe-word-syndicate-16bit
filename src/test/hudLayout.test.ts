import { describe, it, expect } from 'vitest';
import {
  BARK_RESTING_TOP,
  BARK_TOP_CLEAR_OF_CARDS,
  BOSS_BAR_COMPACT_RESTING_BOTTOM,
  BOSS_BAR_RESTING_BOTTOM,
  barkBox,
  bossBarBox,
  controlBoxes,
  hudCardBox,
  hudLayout,
  type Box,
  type HudLayoutInput,
} from '../game/hudLayout';

/** Real container shapes, minus the ~52px game header above it. */
const SHAPES: Array<[string, number, number, boolean]> = [
  ['iPhone 14 landscape', 852, 341, true],
  ['iPhone SE landscape', 667, 323, true],
  ['Galaxy S8 landscape', 740, 308, true],
  ['Pixel 7 portrait', 412, 863, false],
  ['iPhone 14 portrait', 393, 800, false],
  ['iPad mini landscape', 1133, 692, true],
];

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const at = (w: number, h: number, landscape: boolean, touchControls = true): HudLayoutInput => ({
  areaWidth: w,
  areaHeight: h,
  landscape,
  touchControls,
});

/** The same shape, asking for the compact bar. */
const compactAt = (
  w: number,
  h: number,
  landscape: boolean,
  touchControls = true
): HudLayoutInput => ({ ...at(w, h, landscape, touchControls), compact: true });

describe('boss bar vs touch controls', () => {
  it.each(SHAPES)('clears both clusters on %s', (_name, w, h, landscape) => {
    const input = at(w, h, landscape);
    const bar = bossBarBox(input, hudLayout(input).bossBarBottom);
    for (const cluster of controlBoxes(input)) {
      expect(overlaps(bar, cluster)).toBe(false);
    }
  });

  it('leaves the bar where it was designed to sit when nothing is in the way', () => {
    // A wide landscape phone: max-w-lg already caps the bar short of the
    // corners, so lifting it would spend scene height for nothing.
    expect(hudLayout(at(852, 341, true)).bossBarBottom).toBe(BOSS_BAR_RESTING_BOTTOM);
    expect(hudLayout(at(1133, 692, true)).bossBarBottom).toBe(BOSS_BAR_RESTING_BOTTOM);
  });

  it('lifts the bar on the shapes that actually collide', () => {
    for (const [w, h, landscape] of [
      [667, 323, true],
      [740, 308, true],
      [393, 800, false],
    ] as const) {
      expect(hudLayout(at(w, h, landscape)).bossBarBottom).toBeGreaterThan(BOSS_BAR_RESTING_BOTTOM);
    }
  });

  it('never lifts the bar off the top of the container', () => {
    for (const [, w, h, landscape] of SHAPES) {
      const { bossBarBottom } = hudLayout(at(w, h, landscape));
      expect(bossBarBox(at(w, h, landscape), bossBarBottom).top).toBeGreaterThanOrEqual(0);
    }
  });

  it('ignores the controls entirely on desktop', () => {
    const input = at(1400, 700, true, false);
    expect(controlBoxes(input)).toHaveLength(0);
    expect(hudLayout(input).bossBarBottom).toBe(BOSS_BAR_RESTING_BOTTOM);
  });

  it('respects a display cutout by treating it as extra padding', () => {
    const plain = controlBoxes(at(852, 341, true));
    const notched = controlBoxes({ ...at(852, 341, true), safeArea: { left: 59, right: 59, bottom: 21 } });
    expect(notched[0].left).toBeGreaterThan(plain[0].left);
    expect(notched[1].right).toBeLessThan(plain[1].right);
    expect(notched[0].bottom).toBeLessThan(plain[0].bottom);
  });

  it('a cutout can only ever push the bar further out of the way, never less', () => {
    const shape = at(667, 323, true);
    const plain = hudLayout(shape).bossBarBottom;
    const notched = hudLayout({ ...shape, safeArea: { bottom: 21 } }).bossBarBottom;
    expect(notched).toBeGreaterThanOrEqual(plain);
  });
});

describe('bark vs player cards', () => {
  // BarkOverlay reads BARK_TOP_CLEAR_OF_CARDS directly rather than taking a
  // resolved offset, so the constant is what these have to hold against.
  it.each(SHAPES)('clears the cards on %s', (_name, w, h, landscape) => {
    const input = at(w, h, landscape);
    expect(overlaps(barkBox(input, BARK_TOP_CLEAR_OF_CARDS), hudCardBox(input))).toBe(false);
  });

  it('the old resting position was inside the cards — this is the regression', () => {
    const input = at(740, 308, true);
    expect(overlaps(barkBox(input, BARK_RESTING_TOP), hudCardBox(input))).toBe(true);
  });

  it('moves down, not up', () => {
    expect(BARK_TOP_CLEAR_OF_CARDS).toBeGreaterThan(BARK_RESTING_TOP);
  });

  it('leaves the constant no tighter than one clearance below the cards', () => {
    // Pins the constant to the geometry it was derived from, so shrinking the
    // cards without revisiting it shows up here rather than on a phone.
    for (const [, w, h, landscape] of SHAPES) {
      expect(BARK_TOP_CLEAR_OF_CARDS).toBeGreaterThanOrEqual(hudCardBox(at(w, h, landscape)).bottom);
    }
  });
});

describe('bark and boss bar are not coordinated, and do not need to be', () => {
  // Nothing arbitrates between these two, which is safe only because no boss
  // wave carries a barkOnSpawn. If that ever changes, the shortest landscape
  // containers will not fit both and this is where it will show.
  it('they clear each other wherever the vertical budget allows', () => {
    for (const [w, h, landscape] of [
      [852, 341, true],
      [412, 863, false],
      [393, 800, false],
      [1133, 692, true],
    ] as const) {
      const input = at(w, h, landscape);
      expect(
        overlaps(bossBarBox(input, hudLayout(input).bossBarBottom), barkBox(input, BARK_TOP_CLEAR_OF_CARDS))
      ).toBe(false);
    }
  });
});

describe('the boss bar stays on screen — swept, not sampled', () => {
  /*
   * This replaces five hand-picked pathological shapes.
   *
   * Those five passed while the clamp had a hole one pixel wide at 200x125,
   * because none of them was short enough to reach it — the same failure the
   * six realistic shapes had before them, at a different scale. Picking
   * shapes tests the picker's imagination. A sweep does not have one.
   *
   * The grid deliberately runs far below anything a real device produces (the
   * smallest realistic landscape gameplay container is around 268px tall).
   * The point is not that 100px containers happen; it is that an invariant
   * stated without qualification should hold without qualification, and that
   * a boundary bug is cheapest to find when the boundary is inside the tested
   * range rather than just past its edge.
   */
  const WIDTHS = Array.from({ length: 25 }, (_, i) => 200 + i * 50);
  const HEIGHTS = Array.from({ length: 41 }, (_, i) => 100 + i * 20);

  it('holds across the whole sweep, with and without touch controls', () => {
    const failures: string[] = [];

    for (const areaWidth of WIDTHS) {
      for (const areaHeight of HEIGHTS) {
        for (const touchControls of [true, false]) {
          const input: HudLayoutInput = {
            areaWidth,
            areaHeight,
            landscape: areaWidth >= areaHeight,
            touchControls,
          };
          const bar = bossBarBox(input, hudLayout(input).bossBarBottom);
          if (bar.top < 0) {
            failures.push(`${areaWidth}x${areaHeight} touch=${touchControls} top=${bar.top}`);
          }
        }
      }
    }

    // Reported as a list rather than an early expect: knowing it fails at one
    // shape is far less useful than seeing the whole band that fails, which is
    // what points at the cause.
    expect(failures.slice(0, 10)).toEqual([]);
    expect(failures).toHaveLength(0);
  });

  it('never lifts the bar so far that it leaves the bottom of the container', () => {
    for (const areaWidth of WIDTHS) {
      for (const areaHeight of HEIGHTS) {
        const input: HudLayoutInput = {
          areaWidth,
          areaHeight,
          landscape: areaWidth >= areaHeight,
          touchControls: true,
        };
        expect(bossBarBox(input, hudLayout(input).bossBarBottom).bottom).toBeLessThanOrEqual(areaHeight);
      }
    }
  });

  it('clears the touch controls everywhere the container is tall enough to allow it', () => {
    // The module promises the overlap stands only when there is genuinely no
    // room. Measured, that envelope ends at 249px of height — above it, the
    // bar always clears. Pinning the number means a regression that quietly
    // widens the envelope shows up here.
    const ENVELOPE = 249;
    for (const areaWidth of WIDTHS) {
      for (const areaHeight of HEIGHTS.filter((h) => h > ENVELOPE)) {
        const input: HudLayoutInput = {
          areaWidth,
          areaHeight,
          landscape: areaWidth >= areaHeight,
          touchControls: true,
        };
        const bar = bossBarBox(input, hudLayout(input).bossBarBottom);
        for (const cluster of controlBoxes(input)) {
          expect(overlaps(bar, cluster)).toBe(false);
        }
      }
    }
  });

  it('produces finite offsets even when nothing can fit', () => {
    const input: HudLayoutInput = { areaWidth: 320, areaHeight: 200, landscape: true, touchControls: true };
    expect(Number.isFinite(hudLayout(input).bossBarBottom)).toBe(true);
  });
});


describe('the compact bar', () => {
  /*
   * Stated as behaviour, not as measurements. Asserting the constants back at
   * themselves would be the constant-to-constant test this project has already
   * thrown out once.
   */

  it('clears the thumb clusters on the phones the full bar collides with', () => {
    for (const [w, h] of [
      [667, 323],
      [740, 308],
    ] as const) {
      const input = compactAt(w, h, true);
      expect(hudLayout(input).bossBarBottom).toBe(BOSS_BAR_COMPACT_RESTING_BOTTOM);
      for (const cluster of controlBoxes(input)) {
        expect(overlaps(bossBarBox(input, hudLayout(input).bossBarBottom), cluster)).toBe(false);
      }
    }
  });

  it('rests level with the thumb controls, not above them', () => {
    // The point of the compact bar is the scene height it hands back, and the
    // offset is part of that: 48px of clearance is furniture the phone form
    // does not need. Stated against the full bar's resting offset rather than
    // against its own constant, so a compact bar that quietly went back to
    // floating fails here.
    const input = compactAt(667, 323, true);
    expect(hudLayout(input).bossBarBottom).toBeLessThan(BOSS_BAR_RESTING_BOTTOM);
  });

  it('stays clear of the clusters at the lower offset, on every phone shape', () => {
    // Lowering a box can only create an overlap through the vertical axis, and
    // the reason this is safe is that the horizontal axis already separates
    // them on a landscape phone. That is the property worth pinning: it is
    // what makes the offset a free choice rather than a lucky one.
    for (const [name, w, h, landscape] of SHAPES) {
      if (!landscape) continue;
      const input = compactAt(w, h, landscape);
      const bar = bossBarBox(input, hudLayout(input).bossBarBottom);
      for (const cluster of controlBoxes(input)) {
        expect(bar.left < cluster.right && cluster.left < bar.right, name).toBe(false);
      }
    }
  });

  it('is the narrowing that stops the lift — the full bar lifts on the same shapes', () => {
    for (const [w, h] of [
      [667, 323],
      [740, 308],
    ] as const) {
      expect(hudLayout(at(w, h, true)).bossBarBottom).toBeGreaterThan(BOSS_BAR_RESTING_BOTTOM);
    }
  });

  it('takes less of the container than the full bar, everywhere', () => {
    for (const [, w, h, landscape] of SHAPES) {
      const full = bossBarBox(at(w, h, landscape), hudLayout(at(w, h, landscape)).bossBarBottom);
      const small = bossBarBox(
        compactAt(w, h, landscape),
        hudLayout(compactAt(w, h, landscape)).bossBarBottom
      );
      const area = (b: Box) => (b.right - b.left) * (b.bottom - b.top);
      expect(area(small)).toBeLessThan(area(full));
    }
  });

  it('stays on screen under the same sweep the full bar is held to', () => {
    // The height in play here is the compact bar's tallest form — the one
    // carrying the hostage instruction — so a container that only fits the
    // resting form cannot push the taller one off the top for a few seconds
    // at the start of the fight and then look fine in every screenshot taken
    // afterwards.
    for (let w = 320; w <= 1200; w += 20) {
      for (let h = 140; h <= 900; h += 20) {
        const input = compactAt(w, h, w >= h);
        const bar = bossBarBox(input, hudLayout(input).bossBarBottom);
        expect(bar.top).toBeGreaterThanOrEqual(0);
        expect(bar.bottom).toBeLessThanOrEqual(h);
      }
    }
  });

  it('is a bar with a body, not a line the collision arithmetic can ignore', () => {
    // A height of zero passes every other test here — narrower still clears the
    // clusters, a zero-area box is smaller than the full one, and a bar with no
    // height cannot be pushed off the top by the sweep. It would also switch
    // off the collision avoidance this whole module exists for, silently. The
    // floor is an absolute number rather than the constant: any bar carrying a
    // line of text over a track is taller than this.
    const input = compactAt(667, 323, true);
    const bar = bossBarBox(input, hudLayout(input).bossBarBottom);
    expect(bar.bottom - bar.top).toBeGreaterThan(20);
  });

  it('reports the width cap it was measured against, not the full one', () => {
    const input = compactAt(1200, 600, true);
    const bar = bossBarBox(input, hudLayout(input).bossBarBottom);
    expect(bar.right - bar.left).toBe(hudLayout(input).bossBarMaxWidth);
    expect(hudLayout(input).bossBarMaxWidth).toBeLessThan(
      hudLayout(at(1200, 600, true)).bossBarMaxWidth
    );
  });
});
