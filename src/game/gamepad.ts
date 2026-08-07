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

/**
 * Frames a pad may go without its data being refreshed before its slot becomes
 * reclaimable. Three seconds at 60fps.
 */
const STALE_AFTER_FRAMES = 180;

interface PadActivity {
  /** Last `Gamepad.timestamp` seen for this index. */
  timestamp: number;
  /** Frame at which that timestamp last changed. */
  lastChangeFrame: number;
  /**
   * Whether this entry's data has moved even once since it was first seen.
   *
   * Separate from staleness on purpose. Staleness says "quiet lately", which a
   * controller resting on the table also says. This says "never once alive",
   * which only a phantom says: an entry the browser lists for a device it is
   * already listing under another index — a pad paired over Bluetooth and also
   * seen over its cable — reports the same frozen timestamp forever.
   */
  everChanged: boolean;
}

const padActivity = new Map<number, PadActivity>();
let assignmentFrame = 0;

/**
 * Records whether each pad's data is still being refreshed.
 *
 * A wireless controller that is switched off — rather than unpaired — often
 * stays in `navigator.getGamepads()` with `connected` still true: the browser
 * has no way to tell "idle" from "powered down" until the OS reports the
 * disconnect, which can take a long time or never happen. `Gamepad.timestamp`
 * does tell them apart: it stops advancing the moment the data stops arriving.
 */
function trackActivity(pads: Map<number, Gamepad>) {
  assignmentFrame++;

  for (const [index, pad] of pads) {
    const previous = padActivity.get(index);
    if (!previous) {
      padActivity.set(index, {
        timestamp: pad.timestamp,
        lastChangeFrame: assignmentFrame,
        everChanged: false,
      });
    } else if (previous.timestamp !== pad.timestamp) {
      padActivity.set(index, {
        timestamp: pad.timestamp,
        lastChangeFrame: assignmentFrame,
        everChanged: true,
      });
    }
  }

  for (const index of [...padActivity.keys()]) {
    if (!pads.has(index)) padActivity.delete(index);
  }
}

function isResponsive(index: number | null): boolean {
  if (index === null) return false;
  const activity = padActivity.get(index);
  if (!activity) return false;
  return assignmentFrame - activity.lastChangeFrame < STALE_AFTER_FRAMES;
}

/** Any control off its resting position. Used to mean "this player is here". */
function hasActivity(pad: Gamepad): boolean {
  for (const button of pad.buttons) {
    if (button && (button.pressed || button.value > TRIGGER_THRESHOLD)) return true;
  }
  return pad.axes.some((axis) => Math.abs(axis) > STICK_DEADZONE);
}

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

  trackActivity(pads);

  // Release slots whose pad left the list entirely.
  if (assignedP1Index !== null && !pads.has(assignedP1Index)) assignedP1Index = null;
  if (assignedP2Index !== null && !pads.has(assignedP2Index)) assignedP2Index = null;

  const unassigned = [...pads.keys()]
    .filter((i) => i !== assignedP1Index && i !== assignedP2Index)
    .sort((a, b) => a - b);

  // Assign each unclaimed pad to the first slot it may take.
  //
  // Two situations look alike from here and need opposite outcomes, so the
  // preference order settles both instead of separate passes:
  //
  //   a pad whose signal dropped for a frame returns, and its own slot is now
  //   empty — it must go back there, not take the other player's;
  //
  //   a replacement is plugged in because the previous controller died, and
  //   that dead pad is still listed as holding a slot — it must take that one,
  //   not the empty slot the keyboard is already covering.
  //
  // Both are "the first slot in preference order that is free or held by a pad
  // that stopped reporting". Ordering the passes the other way broke whichever
  // case ran second: an earlier version filled free slots first, and a pad
  // returning from a dropout then stole an idle player's controller.
  //
  // Taking over from a live holder still requires the newcomer to be pressing
  // something. Staleness alone cannot mean "gone": Firefox only advances
  // `timestamp` on state change, so a controller resting on the table looks
  // exactly like one switched off.
  const slotOrder: Array<'p1' | 'p2'> = coop ? ['p2', 'p1'] : ['p1', 'p2'];
  const held = (slot: 'p1' | 'p2') => (slot === 'p1' ? assignedP1Index : assignedP2Index);
  const assign = (slot: 'p1' | 'p2', index: number | null) => {
    if (slot === 'p1') assignedP1Index = index;
    else assignedP2Index = index;
  };

  for (const index of unassigned) {
    const pad = pads.get(index);
    if (!pad) continue;
    const active = hasActivity(pad);

    for (const slot of slotOrder) {
      const current = held(slot);
      const livre = current === null;
      const abandonado = current !== null && active && !isResponsive(current);
      if (livre || abandonado) {
        assign(slot, index);
        break;
      }
    }
  }

  // Evict a phantom from an earlier slot in favour of a pad that is alive.
  //
  // The loop above hands a free slot to whichever unclaimed pad has the lowest
  // index, and "lowest index" is not "the one in someone's hands". A DualSense
  // paired over Bluetooth and also seen over its cable is listed twice, and
  // nothing says the live entry comes first. The phantom took player one on
  // the opening frame and kept it: the only route into an occupied slot is the
  // takeover above, and the real pad — already holding player two — is never
  // in `unassigned` to attempt it. The player kept a controller the match
  // would not read, while the title screen worked, because `readMenuState`
  // merges every pad and never notices a dead one.
  //
  // The test is `everChanged`, not staleness. Staleness would evict a player
  // who set their controller down for three seconds and hand their slot to
  // player two mid-match. Never having moved at all is something only a
  // phantom does — a real pad reports the moment it is touched, and the
  // browser only lists it after a first press in the first place.
  for (let earlier = 0; earlier < slotOrder.length; earlier++) {
    const earlierIndex = held(slotOrder[earlier]);
    if (earlierIndex !== null && padActivity.get(earlierIndex)?.everChanged) continue;

    for (let later = earlier + 1; later < slotOrder.length; later++) {
      const laterIndex = held(slotOrder[later]);
      if (laterIndex === null || !padActivity.get(laterIndex)?.everChanged) continue;
      assign(slotOrder[earlier], laterIndex);
      if (earlierIndex === null) assign(slotOrder[later], null);
      else assign(slotOrder[later], earlierIndex);
      break;
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
  padActivity.clear();
  assignmentFrame = 0;
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
let lastKnownCount = -1;
let pollFrameId = 0;

/**
 * Falls back to polling `connectedGamepadCount()` every frame and notifying on
 * a change, rather than trusting `gamepaddisconnected` alone.
 *
 * That event is unreliable across browsers and controllers — a Bluetooth pad
 * going out of range in particular often updates `Gamepad.connected` on the
 * object `getGamepads()` returns without the DOM event ever firing. The badge
 * relied solely on the event, so it kept reporting a pad as connected
 * indefinitely after the physical disconnect: input handling elsewhere
 * already polls every frame and stopped reading the dead pad correctly, so
 * only this badge — the thing telling the player what the game currently
 * sees — was wrong.
 */
function pollConnectionCount() {
  const count = connectedGamepadCount();
  if (count !== lastKnownCount) {
    lastKnownCount = count;
    connectionListeners.forEach((listener) => listener());
  }
  pollFrameId = requestAnimationFrame(pollConnectionCount);
}

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
  if (connectionListeners.size === 1 && typeof window !== 'undefined') {
    lastKnownCount = connectedGamepadCount();
    pollFrameId = requestAnimationFrame(pollConnectionCount);
  }
  return () => {
    connectionListeners.delete(listener);
    if (connectionListeners.size === 0) {
      cancelAnimationFrame(pollFrameId);
      pollFrameId = 0;
    }
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
export type MenuAction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'CONFIRM' | 'BACK' | 'START' | 'TOGGLE';

const MENU_BUTTON = {
  CONFIRM: 0, // A / Cross
  BACK: 1, // B / Circle
  START: 9, // Start / Options
  // Shoulders. The character select screen already spends both sticks — one
  // axis on the roster, one on the game mode — so switching the active player
  // slot needed a button of its own.
  TOGGLE_L: 4, // LB / L1
  TOGGLE_R: 5, // RB / R1
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
    TOGGLE: false,
  };
}

/**
 * Menu state merged across every connected pad, so either player can drive the
 * menus without the game caring which slot they hold.
 */
/** Menu state from one pad, without merging in the others. */
function menuStateFromPad(pad: Gamepad): MenuState {
  const state = emptyMenuState();
  const dir = mapGamepadToInput(pad);

  state.UP = dir.up;
  state.DOWN = dir.down;
  state.LEFT = dir.left;
  state.RIGHT = dir.right;
  state.CONFIRM = pressed(pad, MENU_BUTTON.CONFIRM);
  state.BACK = pressed(pad, MENU_BUTTON.BACK);
  state.START = pressed(pad, MENU_BUTTON.START);
  state.TOGGLE =
    pressed(pad, MENU_BUTTON.TOGGLE_L) || pressed(pad, MENU_BUTTON.TOGGLE_R);

  return state;
}

/**
 * Menu input kept separate per player.
 *
 * `readMenuState` merges every pad into one, which is right for a screen with a
 * single cursor: any controller can drive it. Character select is the exception
 * — two people choosing at once need a cursor each, and a merged state gives
 * them one cursor that both fight over.
 *
 * The slots come from the same assignment the match uses, so whoever is player
 * two on the fighting screen is player two while picking.
 */
export function readPlayerMenuStates(coop: boolean): {
  p1: MenuState | null;
  p2: MenuState | null;
} {
  const pads = livePads();
  readPlayerPads(coop);

  const at = (index: number | null) => {
    if (index === null) return null;
    const pad = pads.get(index);
    return pad ? menuStateFromPad(pad) : null;
  };

  return { p1: at(assignedP1Index), p2: at(assignedP2Index) };
}

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
    state.TOGGLE =
      state.TOGGLE ||
      pressed(pad, MENU_BUTTON.TOGGLE_L) ||
      pressed(pad, MENU_BUTTON.TOGGLE_R);
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
  'TOGGLE',
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
  TOGGLE: false,
};
