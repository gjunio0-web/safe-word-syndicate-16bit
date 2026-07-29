import { useEffect, useRef } from 'react';
import {
  MENU_ACTIONS,
  MENU_REPEATS,
  MenuAction,
  MenuState,
  readMenuState,
  readPlayerMenuStates,
} from '../game/gamepad';

/** Frames a direction must be held before it starts repeating. */
export const REPEAT_DELAY_FRAMES = 26;

/** Frames between repeats once auto-repeat has started. */
export const REPEAT_INTERVAL_FRAMES = 7;

/**
 * Turns per-frame gamepad state into discrete menu actions.
 *
 * A pure factory rather than logic buried in the hook, so the edge and repeat
 * behaviour can be exercised frame by frame without React or hardware.
 *
 * Two behaviours the raw state does not give:
 *
 * - **Edges.** Firing on held state would run through a four-item list in a
 *   few frames. Actions fire on the false-to-true transition.
 * - **Auto-repeat.** Directions still need to repeat when held, or navigating
 *   a long list means one tap per item. Buttons never repeat: nobody wants a
 *   confirm firing sixty times a second.
 */
export function createMenuDispatcher() {
  const heldFrames: Partial<Record<MenuAction, number>> = {};

  return function step(state: MenuState): MenuAction[] {
    const fired: MenuAction[] = [];

    for (const action of MENU_ACTIONS) {
      if (!state[action]) {
        delete heldFrames[action];
        continue;
      }

      const frames = (heldFrames[action] ?? -1) + 1;
      heldFrames[action] = frames;

      if (frames === 0) {
        fired.push(action);
      } else if (
        MENU_REPEATS[action] &&
        frames >= REPEAT_DELAY_FRAMES &&
        (frames - REPEAT_DELAY_FRAMES) % REPEAT_INTERVAL_FRAMES === 0
      ) {
        fired.push(action);
      }
    }

    return fired;
  };
}

/**
 * Drives menu navigation from a gamepad.
 *
 * Polls on its own animation frame: the Gamepad API has no button events, and
 * the game loop only runs during gameplay, while menus need input before a
 * match has started.
 *
 * Browsers only expose gamepads after the page has received a user gesture, so
 * a controller cannot start the very first interaction of a session. The title
 * screen's tappable INSERT COIN covers that.
 */
/**
 * One dispatcher for the whole application, deliberately at module scope.
 *
 * It used to be created inside the effect, so every consumer got a fresh one
 * with no memory of what was already held. Confirming on the title screen
 * mounted the character select's hook while A was still down, that hook saw
 * the button as a brand-new press, and the match started before the player
 * ever saw the roster.
 *
 * Held state has to outlive the components that listen to it.
 */
const step = createMenuDispatcher();
const listeners = new Set<(action: MenuAction) => void>();
let frameId = 0;

function poll() {
  const fired = step(readMenuState());
  for (const action of fired) {
    // Copied because a handler may unsubscribe others mid-dispatch.
    for (const listener of [...listeners]) listener(action);
  }
  frameId = requestAnimationFrame(poll);
}

function subscribe(listener: (action: MenuAction) => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== 'undefined') {
    frameId = requestAnimationFrame(poll);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
  };
}

export function useGamepadMenu(onAction: (action: MenuAction) => void, enabled: boolean = true) {
  // Held in a ref so a caller passing an inline arrow does not resubscribe on
  // every render.
  const handlerRef = useRef(onAction);
  handlerRef.current = onAction;

  useEffect(() => {
    if (!enabled) return;
    return subscribe((action) => handlerRef.current(action));
  }, [enabled]);
}

/**
 * Menu actions delivered per player, each with its own press-edge tracking.
 *
 * `useGamepadMenu` merges every controller into one stream, which is what a
 * single-cursor screen wants. Character select needs the opposite: two people
 * choosing at the same time need a cursor each, and edges have to be tracked
 * separately or one player's press would swallow the other's.
 */
export function useGamepadPlayerMenus(
  onAction: (player: 1 | 2, action: MenuAction) => void,
  coop: boolean,
  enabled: boolean = true
) {
  const handlerRef = useRef(onAction);
  handlerRef.current = onAction;

  useEffect(() => {
    if (!enabled) return;

    const steps = { 1: createMenuDispatcher(), 2: createMenuDispatcher() };
    let frameId = 0;

    const poll = () => {
      const states = readPlayerMenuStates(coop);
      for (const player of [1, 2] as const) {
        const state = player === 1 ? states.p1 : states.p2;
        if (!state) continue;
        for (const action of steps[player](state)) {
          handlerRef.current(player, action);
        }
      }
      frameId = requestAnimationFrame(poll);
    };

    frameId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frameId);
  }, [coop, enabled]);
}
