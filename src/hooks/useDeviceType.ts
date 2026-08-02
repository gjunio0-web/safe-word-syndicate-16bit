import { useSyncExternalStore } from 'react';
import { resolveMobileDevice } from '../game/deviceInput';

/**
 * `pointer: coarse` + `hover: none` is the standards-based way to ask "is the
 * primary input touch, with no way to hover" — it describes input modality,
 * not screen size, so a touchscreen laptop with a mouse attached (hover:hover)
 * correctly reads as desktop. This is the fallback for browsers that don't
 * expose `navigator.userAgentData`.
 */
const MOBILE_INPUT_QUERY = '(pointer: coarse) and (hover: none)';

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  // Chromium's User-Agent Client Hints answer a question adjacent to the one
  // being asked: `mobile` is specified as a mobile device *or a preference for
  // a mobile experience*, which is a product question rather than an input
  // one, and is understood to be false for Android tablets. Read as
  // authoritative, that would ship a tablet — no keyboard, no mouse — into the
  // desktop branch, which has no movement controls in it. Used as a positive
  // signal and ORed with the modality query, it cannot.
  // See resolveMobileDevice for the full reasoning, including why being wrong
  // about the tablet behaviour costs nothing under this rule.
  return resolveMobileDevice({
    uaMobile: (navigator as { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile,
    touchModality: window.matchMedia(MOBILE_INPUT_QUERY).matches,
  });
}

function subscribeMobileDevice(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const mql = window.matchMedia(MOBILE_INPUT_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/** Module-level: a fresh subscribe/getSnapshot pair every render would
 * resubscribe useSyncExternalStore on every render. */
export function useIsMobileDevice(): boolean {
  return useSyncExternalStore(subscribeMobileDevice, isMobileDevice, () => false);
}
