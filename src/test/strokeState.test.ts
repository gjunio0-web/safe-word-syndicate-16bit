import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { renderEntitySprite } from '../game/spriteRenderer';
import { spriteHero } from './helpers';
import { CharacterId, EntityState } from '../types';

/**
 * Effects must not lend their brush to the body.
 *
 * Every fighter is outlined at 2.5px, set once before the character switch.
 * The flashy bits — a kick arc, a power move aura, a flight ring — set a much
 * heavier width for themselves and used to leave it set. Everything drawn after
 * them inherited it: in the kick pose Fun Maker's legs were outlined at 6px and
 * the outline swallowed the jeans, leaving a sliver of denim inside a slab of
 * pink. Feet Master's whole body went to 7px mid power move.
 *
 * Nothing caught it because nothing looked. The reading here counts strokes
 * heavier than the base width and pins the number to the effects that are meant
 * to be heavy, so a width that escapes into the body shows up as a count.
 */

const BASE_WIDTH = 2.5;

/** Renders a pose and reports the width of every stroke the sprite laid down. */
function strokeWidths(charId: CharacterId, over: Partial<EntityState> = {}): number[] {
  const canvas = createCanvas(300, 300);
  const real = canvas.getContext('2d');
  const widths: number[] = [];

  const spy = new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === 'stroke') {
        return (...args: unknown[]) => {
          widths.push(Number((target as unknown as { lineWidth: number }).lineWidth));
          return (Reflect.get(target, prop, receiver) as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, prop, value) {
      return Reflect.set(target, prop, value);
    },
  }) as unknown as CanvasRenderingContext2D;

  renderEntitySprite(spy, spriteHero(charId, over), 150, 250, 0);
  return widths;
}

const heavy = (widths: number[]) => widths.filter((w) => w > BASE_WIDTH);

describe('effect stroke widths stay with the effect', () => {
  it('outlines an idle fighter at the base width and nothing else', () => {
    for (const charId of ['FEET_MASTER', 'FUN_MAKER', 'OMEGA_BIKER', 'ANGRY_CORSO'] as CharacterId[]) {
      const widths = strokeWidths(charId);
      expect(widths.length, `${charId} should draw something`).toBeGreaterThan(0);
      expect(heavy(widths), `${charId} idle has no effects to be heavy for`).toHaveLength(0);
    }
  });

  it('spends the heavy brush on the kick arc alone', () => {
    // Two, not one: a KICK pose is drawn twice, once as the motion trail behind
    // the fighter and once as the fighter. One arc per pass.
    for (const charId of ['FEET_MASTER', 'FUN_MAKER'] as CharacterId[]) {
      expect(heavy(strokeWidths(charId, { action: 'KICK', actionTimer: 8 })), `${charId} kick`).toEqual([6, 6]);
    }
  });

  it('spends it on the power move aura alone', () => {
    // Also trailed, so also doubled: a cyan ring and an amber sweep per pass
    // for Feet Master, three kinetic rings per pass for Omega.
    expect(heavy(strokeWidths('FEET_MASTER', { action: 'POWER_MOVE', actionTimer: 27 }))).toEqual([3, 7, 3, 7]);
    expect(heavy(strokeWidths('OMEGA_BIKER', { action: 'POWER_MOVE', actionTimer: 27 }))).toEqual([4, 4, 4, 4, 4, 4]);
  });

  it('spends it on the flight ring alone', () => {
    expect(heavy(strokeWidths('FUN_MAKER', { action: 'FLYING', z: 90 }))).toEqual([3]);
  });

  it('leaves the two fighters with no effect at that pose entirely at base width', () => {
    expect(heavy(strokeWidths('ANGRY_CORSO', { action: 'POWER_MOVE', actionTimer: 27 }))).toHaveLength(0);
    expect(heavy(strokeWidths('OMEGA_BIKER', { action: 'KICK', actionTimer: 8 }))).toHaveLength(0);
  });
});
