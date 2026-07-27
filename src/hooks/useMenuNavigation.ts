import { useEffect, useRef } from 'react';
import { MenuAction } from '../game/gamepad';

/**
 * Generic gamepad navigation for anything rendered as DOM.
 *
 * Works off real focus rather than a bespoke cursor: the direction keys call
 * `focus()` and the confirm button calls `click()`. That means every screen,
 * modal and future addition is navigable without declaring option lists, and
 * the browser draws the focus ring for us.
 *
 * Scope is the topmost element carrying `data-gamepad-scope`, falling back to
 * the document. Without that, a pause modal and the header buttons underneath
 * it would be part of the same ring and the cursor would wander behind the
 * overlay.
 */
const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function isVisible(el: HTMLElement): boolean {
  if (el.hidden) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

function currentScope(): ParentNode {
  const scopes = document.querySelectorAll<HTMLElement>('[data-gamepad-scope]');
  // Last in DOM order is the one painted on top.
  return scopes.length ? scopes[scopes.length - 1] : document;
}

function focusableItems(): HTMLElement[] {
  return Array.from(currentScope().querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible);
}

/** How far one press scrolls a panel, in pixels. */
const SCROLL_STEP = 120;

/**
 * A scrollable panel in the current scope that the focus ring cannot reach.
 *
 * Focus navigation only moves between focusable elements, so a panel of pure
 * prose is unreachable: the lore codex has four tabs and a body of text, and
 * with a controller the text could not be scrolled at all.
 *
 * The panel only qualifies when it holds no focusable items of its own. The
 * jukebox also scrolls, but its list is made of buttons — there, moving focus
 * is the right behaviour and the browser scrolls them into view for free.
 */
function unreachableScrollPanel(): HTMLElement | null {
  const scope = currentScope();
  const candidates = Array.from(scope.querySelectorAll<HTMLElement>('*')).filter((el) => {
    if (el.scrollHeight <= el.clientHeight + 4) return false;
    const overflow = window.getComputedStyle(el).overflowY;
    if (overflow !== 'auto' && overflow !== 'scroll') return false;
    return el.querySelectorAll(FOCUSABLE).length === 0;
  });
  return candidates[0] ?? null;
}

/**
 * Applies one menu action to whatever is on screen.
 *
 * Returns true when the action was consumed, so callers can fall back to
 * screen-specific behaviour for the actions this does not handle.
 */
export function applyMenuNavigation(action: MenuAction): boolean {
  const items = focusableItems();
  if (items.length === 0) {
    // No buttons at all: a scroll panel may still be the whole point of the screen.
    const only = unreachableScrollPanel();
    if (only && (action === 'UP' || action === 'DOWN')) {
      only.scrollBy({ top: action === 'DOWN' ? SCROLL_STEP : -SCROLL_STEP, behavior: 'smooth' });
      return true;
    }
    return false;
  }

  const active = document.activeElement as HTMLElement | null;
  const at = active ? items.indexOf(active) : -1;

  // Vertical presses scroll an unreachable panel rather than cycling the ring,
  // which in the codex means the four tabs stay on the horizontal axis and the
  // text becomes readable.
  const panel = unreachableScrollPanel();
  if (panel && (action === 'UP' || action === 'DOWN')) {
    panel.scrollBy({ top: action === 'DOWN' ? SCROLL_STEP : -SCROLL_STEP, behavior: 'smooth' });
    return true;
  }

  switch (action) {
    case 'UP':
    case 'LEFT': {
      const next = at <= 0 ? items.length - 1 : at - 1;
      items[next].focus();
      return true;
    }
    case 'DOWN':
    case 'RIGHT': {
      const next = at === -1 || at === items.length - 1 ? 0 : at + 1;
      items[next].focus();
      return true;
    }
    case 'CONFIRM': {
      // Nothing focused yet means the player pressed confirm before moving:
      // treat it as entering the menu rather than activating a random item.
      if (at === -1) {
        items[0].focus();
        return true;
      }
      items[at].click();
      return true;
    }
    default:
      return false;
  }
}

/**
 * Keeps focus inside the current scope.
 *
 * A modal opening leaves focus on whatever button was behind it, so the first
 * direction press would move through elements the player cannot see.
 *
 * It also pre-focuses the first item in the new scope. Without this, arriving
 * on a fresh screen has nothing focused, so `applyMenuNavigation`'s CONFIRM
 * case only focuses the first item rather than activating it — a correct
 * safeguard against firing a random action, but with no focus ring to explain
 * why the first press did nothing, it reads as the controller not working at
 * all. Pre-focusing removes that dead first press while keeping the same
 * safeguard: nothing activates until the player actually presses confirm.
 */
export function useMenuFocusReset(scopeKey: unknown, enabled: boolean = true) {
  const previous = useRef<unknown>(null);

  useEffect(() => {
    // Never while the game is running.
    //
    // Focus exists here to drive menu navigation, and gameplay has no menu —
    // but it does have the header buttons, and during play the navigable scope
    // is the whole document, so the first focusable element is RESET. Browsers
    // activate a focused button on Space, so pre-focusing it meant that
    // jumping also returned the player to the title screen.
    if (!enabled) {
      previous.current = scopeKey;
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body) active.blur();
      return;
    }

    if (previous.current === scopeKey) return;
    previous.current = scopeKey;

    const active = document.activeElement as HTMLElement | null;
    if (active && focusableItems().includes(active)) return;
    if (active && active !== document.body) active.blur();

    const items = focusableItems();
    if (items.length > 0) items[0].focus();
  }, [scopeKey]);
}
