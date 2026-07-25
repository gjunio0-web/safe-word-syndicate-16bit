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

/**
 * Applies one menu action to whatever is on screen.
 *
 * Returns true when the action was consumed, so callers can fall back to
 * screen-specific behaviour for the actions this does not handle.
 */
export function applyMenuNavigation(action: MenuAction): boolean {
  const items = focusableItems();
  if (items.length === 0) return false;

  const active = document.activeElement as HTMLElement | null;
  const at = active ? items.indexOf(active) : -1;

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
 */
export function useMenuFocusReset(scopeKey: unknown) {
  const previous = useRef<unknown>(null);

  useEffect(() => {
    if (previous.current === scopeKey) return;
    previous.current = scopeKey;

    const active = document.activeElement as HTMLElement | null;
    if (active && focusableItems().includes(active)) return;
    if (active && active !== document.body) active.blur();
  }, [scopeKey]);
}
