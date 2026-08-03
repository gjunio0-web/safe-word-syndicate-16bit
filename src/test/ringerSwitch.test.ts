import { describe, it, expect } from 'vitest';
import { hasRingerSwitch, type PlatformSignals } from '../game/ringerSwitch';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ipadLegacy: 'Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1',
  ipadOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

const CASES: Array<[string, PlatformSignals, boolean]> = [
  ['iPhone', { userAgent: UA.iphone, platform: 'iPhone', maxTouchPoints: 5 }, true],
  ['iPad, pre-iPadOS 13', { userAgent: UA.ipadLegacy, platform: 'iPad', maxTouchPoints: 5 }, true],
  ['iPad, iPadOS in desktop disguise', { userAgent: UA.ipadOS, platform: 'MacIntel', maxTouchPoints: 5 }, true],
  ['Mac, no touchscreen', { userAgent: UA.mac, platform: 'MacIntel', maxTouchPoints: 0 }, false],
  ['Android phone', { userAgent: UA.android, platform: 'Linux armv8l', maxTouchPoints: 5 }, false],
  ['Windows desktop', { userAgent: UA.windows, platform: 'Win32', maxTouchPoints: 0 }, false],
];

describe('hasRingerSwitch', () => {
  it.each(CASES)('%s', (_name, signals, expected) => {
    expect(hasRingerSwitch(signals)).toBe(expected);
  });

  it('separates an iPad from a Mac purely by the touchscreen', () => {
    // Since iPadOS 13 the two send the same platform string and near-identical
    // user agents. Touch points are the only tell, so this is the assertion
    // that decides whether a desktop Mac gets an irrelevant hint about a
    // switch it does not have.
    const shared = { userAgent: UA.ipadOS, platform: 'MacIntel' };
    expect(hasRingerSwitch({ ...shared, maxTouchPoints: 5 })).toBe(true);
    expect(hasRingerSwitch({ ...shared, maxTouchPoints: 0 })).toBe(false);
  });

  it('survives missing fields rather than throwing', () => {
    // navigator.platform is deprecated and some browsers may stop shipping it.
    expect(hasRingerSwitch({ userAgent: UA.iphone })).toBe(true);
    expect(hasRingerSwitch({ userAgent: UA.windows })).toBe(false);
    expect(hasRingerSwitch({ userAgent: '' })).toBe(false);
  });

  it('does not fire for Android, which has no such switch', () => {
    // A volume-down Android phone was muted by someone who knows where the
    // control is. Showing the hint there would be noise.
    expect(hasRingerSwitch({ userAgent: UA.android, platform: 'Linux armv8l', maxTouchPoints: 5 })).toBe(false);
  });
});
