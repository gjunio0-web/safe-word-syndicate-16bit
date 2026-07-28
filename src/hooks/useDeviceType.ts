import { useSyncExternalStore } from 'react';

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
  // Chromium's User-Agent Client Hints give an explicit, authoritative
  // "is this a mobile device" boolean when present — preferred over the
  // media-query heuristic, which the same browsers also support.
  const uaMobile = (navigator as { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile;
  if (typeof uaMobile === 'boolean') return uaMobile;
  return window.matchMedia(MOBILE_INPUT_QUERY).matches;
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
