import { useSyncExternalStore } from 'react';

const PORTRAIT_QUERY = '(orientation: portrait)';

function isPortrait(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(PORTRAIT_QUERY).matches;
}

function subscribePortrait(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const mql = window.matchMedia(PORTRAIT_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/**
 * The design resolution (800x450, ~16:9) is landscape. In portrait it gets
 * letterboxed down to a thin horizontal strip, so this is what
 * RotateDevicePrompt watches to know when to say something about it.
 */
export function useIsPortrait(): boolean {
  return useSyncExternalStore(subscribePortrait, isPortrait, () => false);
}
