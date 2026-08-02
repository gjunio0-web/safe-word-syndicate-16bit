import { describe, it, expect } from 'vitest';
import { resolveMobileDevice, type DeviceSignals } from '../game/deviceInput';

/**
 * Real devices, with the signals each one actually reports.
 *
 * `uaMobile: undefined` means the browser has no userAgentData at all — every
 * Safari, and Firefox everywhere.
 */
const DEVICES: Array<[string, DeviceSignals, boolean]> = [
  ['Android phone, Chrome', { uaMobile: true, touchModality: true }, true],
  ['Android tablet, Chrome', { uaMobile: false, touchModality: true }, true],
  ['iPhone, Safari', { uaMobile: undefined, touchModality: true }, true],
  ['iPad, Safari', { uaMobile: undefined, touchModality: true }, true],
  ['Desktop, Chrome', { uaMobile: false, touchModality: false }, false],
  ['Desktop, Firefox', { uaMobile: undefined, touchModality: false }, false],
  ['Touchscreen laptop with a mouse', { uaMobile: false, touchModality: false }, false],
  ['Touch-only kiosk', { uaMobile: false, touchModality: true }, true],
];

describe('resolveMobileDevice', () => {
  it.each(DEVICES)('%s', (_name, signals, expected) => {
    expect(resolveMobileDevice(signals)).toBe(expected);
  });

  it('is the whole truth table, exhaustively', () => {
    const table: Array<[boolean | undefined, boolean, boolean]> = [
      [true, true, true],
      [true, false, true],
      [false, true, true],
      [false, false, false],
      [undefined, true, true],
      [undefined, false, false],
    ];
    for (const [uaMobile, touchModality, expected] of table) {
      expect(resolveMobileDevice({ uaMobile, touchModality })).toBe(expected);
    }
  });
});

describe('the tablet regression this replaced', () => {
  it('a device reporting uaMobile:false but touch-only modality is mobile', () => {
    // The old rule returned uaMobile directly whenever it was a boolean, so
    // this case resolved to desktop: keyboard hints, keyboard-only character
    // select, and no movement controls at all on a device with no keyboard.
    expect(resolveMobileDevice({ uaMobile: false, touchModality: true })).toBe(true);
  });

  it('the hint can only ever add mobile, never remove it', () => {
    // The asymmetry the whole rule is built on: showing touch controls to a
    // mouse user is clutter, hiding them from a touch user is unplayable. So
    // whatever the hint carries, it cannot overrule a touch-only modality.
    //
    // This is also what makes the tablet premise safe to be wrong about. That
    // the hint reads false on Android tablets comes from the specification's
    // wording and from emulated testing, not from a physical device — and if
    // it turns out to read true there, this assertion still holds and the fix
    // still works, because the hint would simply be agreeing with the query
    // instead of overruling it.
    for (const uaMobile of [true, false, undefined]) {
      expect(resolveMobileDevice({ uaMobile, touchModality: true })).toBe(true);
    }
  });

  it('a hovering pointer alone is not enough to be called mobile', () => {
    // The other direction still has to hold, or every desktop gets a D-pad.
    expect(resolveMobileDevice({ uaMobile: false, touchModality: false })).toBe(false);
    expect(resolveMobileDevice({ uaMobile: undefined, touchModality: false })).toBe(false);
  });
});
