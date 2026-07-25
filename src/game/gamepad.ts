import { PlayerInput } from '../types';

/**
 * Gamepad support.
 *
 * Wireless is not a concern here: Bluetooth and 2.4GHz controllers are paired
 * by the operating system and reach the browser as ordinary gamepads. The API
 * draws no distinction.
 *
 * The API also emits no events for button state — only connection and
 * disconnection. Button state has to be polled every frame, which is why
 * `readConnectedGamepads` is called from the game loop and never from React
 * state. Polling into `setState` would re-render the tree 60 times a second.
 */

/** Left stick travel required before it counts as a direction. */
const STICK_DEADZONE = 0.4;

/** Analog trigger travel required before it counts as pressed. */
const TRIGGER_THRESHOLD = 0.5;

/**
 * Button indices for `mapping === 'standard'`.
 *
 * Face buttons follow the beat 'em up convention rather than the platformer
 * one: the bottom button jumps, the left button is the fast attack.
 */
const BUTTON = {
  JUMP: 0, // A / Cross
  KICK: 1, // B / Circle
  PUNCH: 2, // X / Square
  SPECIAL: 3, // Y / Triangle
  SPECIAL_ALT: 5, // RB / R1
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
} as const;

function neutral(): PlayerInput {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    punch: false,
    kick: false,
    special: false,
    jump: false,
    grab: false,
  };
}

function pressed(pad: Gamepad, index: number): boolean {
  const button = pad.buttons[index];
  if (!button) return false;
  return button.pressed || button.value > TRIGGER_THRESHOLD;
}

/**
 * Translates one gamepad into the game's input shape.
 *
 * Pure and exported so it can be exercised against synthetic pads without
 * hardware or a browser.
 *
 * Controllers reporting a non-standard mapping are read with the same indices.
 * Most follow the layout closely enough to be playable, and a wrong guess is
 * better than ignoring the device outright — remapping is its own feature.
 */
export function mapGamepadToInput(pad: Gamepad): PlayerInput {
  const input = neutral();

  const [axisX = 0, axisY = 0] = pad.axes;

  input.left = pressed(pad, BUTTON.DPAD_LEFT) || axisX < -STICK_DEADZONE;
  input.right = pressed(pad, BUTTON.DPAD_RIGHT) || axisX > STICK_DEADZONE;
  input.up = pressed(pad, BUTTON.DPAD_UP) || axisY < -STICK_DEADZONE;
  input.down = pressed(pad, BUTTON.DPAD_DOWN) || axisY > STICK_DEADZONE;

  input.punch = pressed(pad, BUTTON.PUNCH);
  input.kick = pressed(pad, BUTTON.KICK);
  input.jump = pressed(pad, BUTTON.JUMP);
  input.special = pressed(pad, BUTTON.SPECIAL) || pressed(pad, BUTTON.SPECIAL_ALT);

  return input;
}

/** Combines two input sources. A button held on either one counts as held. */
export function mergeInputs(a: PlayerInput, b: PlayerInput | null): PlayerInput {
  if (!b) return a;
  return {
    left: a.left || b.left,
    right: a.right || b.right,
    up: a.up || b.up,
    down: a.down || b.down,
    punch: a.punch || b.punch,
    kick: a.kick || b.kick,
    special: a.special || b.special,
    jump: a.jump || b.jump,
    grab: a.grab || b.grab,
  };
}

/**
 * Connected pads, in slot order, gaps removed.
 *
 * Browsers leave holes in the list when a controller disconnects, so the raw
 * indices are not stable enough to assign players from.
 */
export function readConnectedGamepads(): PlayerInput[] {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];

  const pads: PlayerInput[] = [];
  for (const pad of navigator.getGamepads()) {
    if (pad && pad.connected) pads.push(mapGamepadToInput(pad));
  }
  return pads;
}

/**
 * Stable mapping of pads to players.
 *
 * The previous version derived the assignment from `pads.length` on every
 * frame, and that list is volatile: a browser only announces a pad after its
 * first button press, drops idle devices, and some controllers register twice
 * (Bluetooth plus a wired or dongle identity). Each flip silently reassigned
 * who the keyboard and the controller were driving — the reported symptom of
 * one player's input dying for a while and coming back.
 *
 * Assignment is now keyed by `gamepad.index`, which the browser keeps stable
 * for the life of a connection, and only changes when a pad genuinely appears
 * or disappears.
 */
export interface PlayerPadInputs {
  p1: PlayerInput | null;
  p2: PlayerInput | null;
}

let assignedP1Index: number | null = null;
let assignedP2Index: number | null = null;

/** Live pads keyed by their stable browser index. */
function livePads(): Map<number, Gamepad> {
  const map = new Map<number, Gamepad>();
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return map;
  for (const pad of navigator.getGamepads()) {
    if (pad && pad.connected) map.set(pad.index, pad);
  }
  return map;
}

export function readPlayerPads(coop: boolean): PlayerPadInputs {
  const pads = livePads();

  // Release slots whose pad went away.
  if (assignedP1Index !== null && !pads.has(assignedP1Index)) assignedP1Index = null;
  if (assignedP2Index !== null && !pads.has(assignedP2Index)) assignedP2Index = null;

  const unassigned = [...pads.keys()]
    .filter((i) => i !== assignedP1Index && i !== assignedP2Index)
    .sort((a, b) => a - b);

  // In co-op the first controller joins as player two: the keyboard player
  // already holds player one, and handing the pad to P1 would put both people
  // on the same fighter.
  for (const index of unassigned) {
    if (coop) {
      if (assignedP2Index === null) assignedP2Index = index;
      else if (assignedP1Index === null) assignedP1Index = index;
    } else {
      if (assignedP1Index === null) assignedP1Index = index;
      else if (assignedP2Index === null) assignedP2Index = index;
    }
  }

  const read = (index: number | null) => {
    if (index === null) return null;
    const pad = pads.get(index);
    return pad ? mapGamepadToInput(pad) : null;
  };

  return { p1: read(assignedP1Index), p2: read(assignedP2Index) };
}

/** Drops every assignment. Called when a match starts, so slots are not inherited. */
export function resetPadAssignments() {
  assignedP1Index = null;
  assignedP2Index = null;
}

/** How many pads are currently connected. */
export function connectedGamepadCount(): number {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return 0;

  let count = 0;
  for (const pad of navigator.getGamepads()) {
    if (pad && pad.connected) count++;
  }
  return count;
}

const connectionListeners: Set<() => void> = new Set();
let listenersInstalled = false;

function installConnectionListeners() {
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;

  const notify = () => connectionListeners.forEach((listener) => listener());
  window.addEventListener('gamepadconnected', notify);
  window.addEventListener('gamepaddisconnected', notify);
}

/**
 * Subscribes to controllers being plugged in or removed. Built for
 * `useSyncExternalStore`, so the UI can show a connection badge without
 * polling from React.
 *
 * Note that Chrome and Safari only expose gamepads after the page has received
 * a user gesture — the same gate the audio unlock deals with. A controller
 * paired before the first click stays invisible until that click happens.
 */
export function subscribeGamepadConnection(listener: () => void): () => void {
  installConnectionListeners();
  connectionListeners.add(listener);
  return () => {
    connectionListeners.delete(listener);
  };
}

/**
 * Menu navigation.
 *
 * Kept separate from `mapGamepadToInput` because menus need press *edges*, not
 * held state — reading "held" would scroll a four-item list off the end in a
 * fraction of a second. Edge detection and auto-repeat live in the React hook;
 * this function only reports the raw per-frame state.
 */
export type MenuAction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'CONFIRM' | 'BACK' | 'START';

const MENU_BUTTON = {
  CONFIRM: 0, // A / Cross
  BACK: 1, // B / Circle
  START: 9, // Start / Options
} as const;

export type MenuState = Record<MenuAction, boolean>;

function emptyMenuState(): MenuState {
  return {
    UP: false,
    DOWN: false,
    LEFT: false,
    RIGHT: false,
    CONFIRM: false,
    BACK: false,
    START: false,
  };
}

/**
 * Menu state merged across every connected pad, so either player can drive the
 * menus without the game caring which slot they hold.
 */
export function readMenuState(): MenuState {
  const state = emptyMenuState();
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return state;

  for (const pad of navigator.getGamepads()) {
    if (!pad || !pad.connected) continue;

    const dir = mapGamepadToInput(pad);
    state.UP = state.UP || dir.up;
    state.DOWN = state.DOWN || dir.down;
    state.LEFT = state.LEFT || dir.left;
    state.RIGHT = state.RIGHT || dir.right;

    state.CONFIRM = state.CONFIRM || pressed(pad, MENU_BUTTON.CONFIRM);
    state.BACK = state.BACK || pressed(pad, MENU_BUTTON.BACK);
    state.START = state.START || pressed(pad, MENU_BUTTON.START);
  }
  return state;
}

export const MENU_ACTIONS: MenuAction[] = [
  'UP',
  'DOWN',
  'LEFT',
  'RIGHT',
  'CONFIRM',
  'BACK',
  'START',
];

/** Directions auto-repeat while held; buttons fire once per press. */
export const MENU_REPEATS: Record<MenuAction, boolean> = {
  UP: true,
  DOWN: true,
  LEFT: true,
  RIGHT: true,
  CONFIRM: false,
  BACK: false,
  START: false,
};
