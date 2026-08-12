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
 * (two entries carrying the same identity). Each flip silently reassigned
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
   * already listing under another index — reports the same frozen timestamp
   * forever.
   *
   * Why a browser does that is not something this file knows. Earlier revisions
   * of these comments asserted a cause — a pad seen over Bluetooth and over its
   * cable — which was a guess, never observed, and wrong for the setup that
   * reported the defect: one controller, wireless only, listed twice. What is
   * observed is the duplication and the frozen clock, and that is all these
   * rules are allowed to lean on.
   */
  everChanged: boolean;
  /**
   * Coarse snapshot of this entry's controls, as of the last poll.
   *
   * Kept so two entries carrying the same identity can be compared. Buttons
   * are recorded as pressed or not and axes are rounded to a tenth, because
   * the question is whether two entries are showing the same thing, and stick
   * noise in the third decimal is not two people doing different things.
   */
  signature: string;
  /**
   * Frame at which a control on this pad was last off its resting position.
   *
   * This is the record of "somebody is holding this one", and it is a
   * different question from both of the above. `timestamp` advances on a pad
   * nobody has touched — Chrome refreshes it every poll — so it cannot tell an
   * idle controller apart from one in use; only an actual button or stick can.
   *
   * `-1` means never touched since the entry appeared.
   */
  lastActiveFrame: number;
}

const padActivity = new Map<number, PadActivity>();
let assignmentFrame = 0;

/**
 * Frames of unbroken disagreement before two entries carrying the same
 * identity are taken to be two devices rather than one device listed twice.
 *
 * Unbroken rather than cumulative on purpose. A browser can refresh one of the
 * two entries a frame before the other, which shows up as a single frame of
 * disagreement at every press and release; counting those up would eventually
 * reach any total and throw the answer away. Two people playing disagree for
 * long stretches — one walks while the other stands — so a fifth of a second
 * of continuous disagreement is reached almost at once and a one-frame skew
 * never is.
 */
const DISTINCT_DEVICE_FRAMES = 12;

/** Pairs of indices shown to be separate devices. Keyed by identity and pair. */
const distinctDevices = new Set<string>();
/** How long each undecided pair has been disagreeing without a break. */
const divergingFrames = new Map<string, number>();

const pairKey = (id: string, a: number, b: number) =>
  `${id}#${Math.min(a, b)}:${Math.max(a, b)}`;

/** Indices grouped by the identity string the browser reports for them. */
function groupsById(pads: Map<number, Gamepad>): Map<string, number[]> {
  const byId = new Map<string, number[]>();
  for (const [index, pad] of pads) {
    // An entry with no identity cannot be shown to be a copy of anything.
    // Real browsers always fill this in; synthetic pads in tests may not.
    if (typeof pad.id !== 'string' || pad.id === '') continue;
    const group = byId.get(pad.id);
    if (group) group.push(index);
    else byId.set(pad.id, [index]);
  }
  return byId;
}

/**
 * Records which same-identity pairs have proved to be two separate devices.
 *
 * This is the fact that makes the rule below safe to run during a match. Two
 * controllers of the same model report the same `id`, so identity alone cannot
 * say whether a second entry is a second player or a second listing of the
 * same pad — and the two want opposite treatment. Guessing wrong in one
 * direction leaves a fighter walking on its own; guessing wrong in the other
 * takes a controller away from somebody mid-fight, which is the defect this
 * file has already had to fix twice.
 *
 * There is a positive test for it. A device listed twice reports the *same*
 * thing on both entries; two people never do for long. So disagreement is
 * evidence of two devices, and agreement is evidence of nothing either way.
 *
 * Only frames on which both entries were refreshed are counted. Once a copy
 * freezes it disagrees with its live twin forever, and that disagreement is
 * the defect rather than evidence against it — counting it would let the copy
 * argue its own way out of being caught.
 *
 * A verdict of "two devices" is never withdrawn. Withdrawing it would restore
 * a rule that can take a live player's controller away, and this is the
 * direction to fail in: a pair wrongly judged separate only means the walking
 * fighter is not caught, which is visible and recoverable.
 */
function trackDivergence(pads: Map<number, Gamepad>) {
  for (const [id, group] of groupsById(pads)) {
    for (let a = 0; a < group.length; a++) {
      for (let b = a + 1; b < group.length; b++) {
        const key = pairKey(id, group[a], group[b]);
        if (distinctDevices.has(key)) continue;

        const first = padActivity.get(group[a]);
        const second = padActivity.get(group[b]);
        if (!first || !second) continue;

        const bothRefreshed =
          first.lastChangeFrame === assignmentFrame && second.lastChangeFrame === assignmentFrame;
        const run =
          bothRefreshed && first.signature !== second.signature
            ? (divergingFrames.get(key) ?? 0) + 1
            : 0;

        if (run >= DISTINCT_DEVICE_FRAMES) {
          distinctDevices.add(key);
          divergingFrames.delete(key);
        } else {
          divergingFrames.set(key, run);
        }
      }
    }
  }
}

/** See `PadActivity.signature`. */
function controlSignature(pad: Gamepad): string {
  let signature = '';
  for (const button of pad.buttons) {
    signature += button && (button.pressed || button.value > TRIGGER_THRESHOLD) ? '1' : '0';
  }
  signature += '|';
  for (const axis of pad.axes) signature += `${Math.round(axis * 10)},`;
  return signature;
}

/**
 * Records whether each pad's data is still being refreshed.
 *
 * A wireless controller that is switched off — rather than unpaired — often
 * stays in `navigator.getGamepads()` with `connected` still true: the browser
 * has no way to tell "idle" from "powered down" until the OS reports the
 * disconnect, which can take a long time or never happen. `Gamepad.timestamp`
 * does tell them apart: it stops advancing the moment the data stops arriving.
 *
 * It also records when each pad was last actually touched, which is what
 * decides who gets player one below.
 */
function trackActivity(pads: Map<number, Gamepad>) {
  assignmentFrame++;

  for (const [index, pad] of pads) {
    const previous = padActivity.get(index);
    const entry: PadActivity = previous
      ? previous.timestamp !== pad.timestamp
        ? { ...previous, timestamp: pad.timestamp, lastChangeFrame: assignmentFrame, everChanged: true }
        : previous
      : {
          timestamp: pad.timestamp,
          lastChangeFrame: assignmentFrame,
          everChanged: false,
          signature: '',
          lastActiveFrame: -1,
        };

    entry.signature = controlSignature(pad);
    if (hasActivity(pad)) entry.lastActiveFrame = assignmentFrame;
    padActivity.set(index, entry);
  }

  for (const index of [...padActivity.keys()]) {
    if (!pads.has(index)) padActivity.delete(index);
  }

  trackDivergence(pads);
}

function isResponsive(index: number | null): boolean {
  if (index === null) return false;
  const activity = padActivity.get(index);
  if (!activity) return false;
  return assignmentFrame - activity.lastChangeFrame < STALE_AFTER_FRAMES;
}

/**
 * Entries that a twin of the same device has outlived.
 *
 * The browser sometimes lists one controller twice under two indices carrying
 * the same identity, and one of the two copies can stop being refreshed while
 * the other goes on working. Frozen mid-direction, the dead copy reports that
 * direction on every frame forever — which is the fighter walking off on its
 * own with nobody touching anything.
 *
 * `everChanged` cannot see this one. It asks whether an entry has moved even
 * once since it appeared, which is true of a copy that worked for a whole stage
 * and then stopped. The question that separates them is not about the entry's
 * whole life but about now: has it gone quiet while a twin of the same device
 * kept reporting?
 *
 * Three conditions, and all three are needed:
 *
 *   *a twin exists* — same `id`, another index. A lone controller has nothing
 *   to fall behind and is never touched by this rule, which matters because on
 *   a browser that only refreshes a pad's clock when its state changes, a
 *   direction held steady looks exactly like a frozen one;
 *
 *   *this entry is stale* — unchanged for the whole staleness window, counted
 *   in simulation frames by the same clock `isResponsive` uses, not in the
 *   browser's milliseconds. Three seconds, so a controller resting on the table
 *   between waves is not enough;
 *
 *   *a twin is not stale* — something carrying this identity is still
 *   reporting. Two quiet entries are two quiet entries; neither is evidence
 *   about the other.
 *
 *   *the twin has not been shown to be a different device* — `trackDivergence`
 *   above. Without this the rule cannot tell a copy from a second controller of
 *   the same model resting on the table, and would hand one co-op player the
 *   other's fighter three seconds after they set their pad down.
 *
 * Entries the browser gives no identity string are skipped: a twin is a claim
 * about identity, and nothing can be shown to be a copy of something else
 * without one. Real browsers always fill `id` in.
 */
function outlivedTwins(pads: Map<number, Gamepad>): Set<number> {
  const outlived = new Set<number>();

  for (const [id, group] of groupsById(pads)) {
    for (const index of group) {
      if (isResponsive(index)) continue;
      const outlivedBy = group.some(
        (other) =>
          other !== index &&
          isResponsive(other) &&
          !distinctDevices.has(pairKey(id, index, other))
      );
      if (outlivedBy) outlived.add(index);
    }
  }
  return outlived;
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

export function readPlayerPads(): PlayerPadInputs {
  const pads = livePads();

  trackActivity(pads);

  // Computed once per frame, after the activity record is up to date and
  // before anything reads a slot.
  const outlived = outlivedTwins(pads);

  // Release slots whose pad left the list entirely.
  if (assignedP1Index !== null && !pads.has(assignedP1Index)) assignedP1Index = null;
  if (assignedP2Index !== null && !pads.has(assignedP2Index)) assignedP2Index = null;

  // Unclaimed pads, most recently touched first.
  //
  // Sorting by index instead was the reported defect: the player drove the
  // menus and picked their fighter with one controller, the match started, and
  // the *other* controller — idle on the table, but listed first — was handed
  // player one. Nothing about a browser's ordering says which device is in
  // somebody's hands; the only evidence of that is a control having moved.
  //
  // Index remains the tie-break, so a world where nothing has been touched yet
  // assigns exactly as it did before.
  const touchedAt = (index: number) => padActivity.get(index)?.lastActiveFrame ?? -1;
  const unassigned = [...pads.keys()]
    .filter((i) => i !== assignedP1Index && i !== assignedP2Index)
    .sort((a, b) => touchedAt(b) - touchedAt(a) || a - b);

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
  // Pads fill player one first, then player two, in every mode.
  //
  // Co-op used to invert this, so the first pad took player two and left the
  // keyboard on player one — a sofa setup nobody has to configure. It read
  // well with one pad and badly with two: whoever switched on first ended up
  // driving the fighter on the left, the second the one on the right, and
  // nothing on screen said so. It also made which fighter you drive depend on
  // a mode toggle, which is not a thing a player expects to move their
  // character.
  //
  // One order for every mode. Whoever switches on first is player one; a
  // keyboard player joins on player two.
  const slotOrder: Array<'p1' | 'p2'> = ['p1', 'p2'];
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
  // index, and "lowest index" is not "the one in someone's hands". A pad the
  // browser lists twice under the same identity has no rule saying the live
  // entry comes first. The phantom took player one on
  // the opening frame and kept it: the only route into an occupied slot is the
  // takeover above, and the real pad — already holding player two — is never
  // in `unassigned` to attempt it. The player kept a controller the match
  // would not read, while the title screen worked, because `readMenuState`
  // merges every pad and never notices a dead one.
  //
  // The test is never staleness. Staleness would evict a player who set their
  // controller down for three seconds and hand their slot to player two
  // mid-match.
  //
  // It is two questions, and a slot is only defended when both answer yes.
  // `everChanged` asks whether the entry is a device at all: a phantom reports
  // the same frozen timestamp forever, which nothing real does. `touched` asks
  // whether anybody has ever pressed anything on it, which is the difference
  // between a controller in someone's hands and one that has sat on the table
  // since the page loaded.
  //
  // The second question is what lets this run without a reset between stages.
  // The reported defect was a player who picked their fighter with one
  // controller and drove it with the other: two pads listed, the untouched one
  // holding player one by index alone. That used to be corrected by wiping
  // every slot at the start of a match and rebuilding them, and the rebuild is
  // what swapped two people's fighters at every stage boundary. Correcting it
  // here instead means the assignment never has to be thrown away, so it can
  // survive the whole campaign.
  // The two questions are asked in two passes, weakest claim first, because a
  // single pass could not answer both. Demanding a challenger be *touched*
  // before it may take a slot from a phantom means a controller resting in
  // someone's hands can never take one back — nothing is pushed over on a
  // resting pad, so it reads as untouched, and the phantom keeps player one
  // for the rest of the match.
  //
  // A third question was added after the first two shipped and the defect came
  // back: is this entry still the one reporting for its device? `everChanged`
  // only catches a copy that was born dead, and the copy that was reported had
  // worked for a whole stage before it froze — so both of the questions above
  // answer yes for it, and it kept player one while holding a direction down.
  // `outlivedTwins` is that third question, and it is asked last because it is
  // the strongest claim of the three.
  const isDevice = (index: number | null) =>
    index !== null && !!padActivity.get(index)?.everChanged;
  const isHandled = (index: number | null) =>
    isDevice(index) && (padActivity.get(index!)?.lastActiveFrame ?? -1) >= 0;
  const isLive = (index: number | null) =>
    isHandled(index) && !outlived.has(index!);

  const promoteBy = (defended: (index: number | null) => boolean) => {
    for (let earlier = 0; earlier < slotOrder.length; earlier++) {
      const earlierIndex = held(slotOrder[earlier]);
      if (defended(earlierIndex)) continue;

      for (let later = earlier + 1; later < slotOrder.length; later++) {
        const laterIndex = held(slotOrder[later]);
        if (!defended(laterIndex)) continue;
        assign(slotOrder[earlier], laterIndex);
        if (earlierIndex === null) assign(slotOrder[later], null);
        else assign(slotOrder[later], earlierIndex);
        break;
      }
    }
  };

  // A real device outranks a phantom, whether or not anyone is pressing it.
  promoteBy(isDevice);
  // Among real devices, one in someone's hands outranks one nobody has touched.
  promoteBy(isHandled);
  // And among those, the entry still reporting outranks the copy that stopped.
  promoteBy(isLive);

  // Reading is refused as well as ranked, and both are needed.
  //
  // Ranking alone leaves the stopped copy holding player two, which is read in
  // co-op and would drive the second fighter. Refusing to read alone leaves it
  // squatting on player one with the live pad stranded on a slot that solo and
  // buddy modes never read, so the player's own controller would go dead.
  //
  // `null` is what the loop already gets when a slot is empty, so the keyboard
  // covers the slot exactly as it does with no pad in it.
  const read = (index: number | null) => {
    if (index === null || outlived.has(index)) return null;
    const pad = pads.get(index);
    return pad ? mapGamepadToInput(pad) : null;
  };

  return { p1: read(assignedP1Index), p2: read(assignedP2Index) };
}

/**
 * Drops every assignment. Called when a match starts, so slots are not
 * inherited, and again on the way back to the title screen.
 *
 * What it deliberately does *not* drop is `padActivity`. That map is knowledge
 * about the devices — which of them are phantoms, which are still reporting,
 * which one somebody has been using — and none of that stops being true
 * because a match began. Clearing it here is what made the reported defect
 * possible: the assignment was rebuilt on the first frame of gameplay with no
 * record of who had just been pressing buttons, so it fell back to browser
 * order and could hand player one to the controller lying on the table.
 *
 * Nothing needs to clear it: `trackActivity` already forgets any index that
 * leaves `navigator.getGamepads()`.
 */
export function resetPadAssignments() {
  assignedP1Index = null;
  assignedP2Index = null;
}

/**
 * Forgets the devices as well as the slots.
 *
 * Exists for tests, which need each case to start in a world where no
 * controller has ever been seen. The game has no such moment — a page load is
 * already that world.
 */
export function forgetPadDevices() {
  resetPadAssignments();
  padActivity.clear();
  distinctDevices.clear();
  divergingFrames.clear();
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
export function readPlayerMenuStates(): {
  p1: MenuState | null;
  p2: MenuState | null;
} {
  const pads = livePads();
  readPlayerPads();

  // Same refusal the match path makes, for the same reason: this screen reads
  // one slot per player, so a stopped copy holding a slot would hold that
  // player's cursor against a direction they cannot press.
  const outlived = outlivedTwins(pads);

  const at = (index: number | null) => {
    if (index === null || outlived.has(index)) return null;
    const pad = pads.get(index);
    return pad ? menuStateFromPad(pad) : null;
  };

  return { p1: at(assignedP1Index), p2: at(assignedP2Index) };
}

/**
 * Entries that are a stale copy of another entry for the same device.
 *
 * The browser sometimes lists one controller twice, under two indices carrying
 * the same identity, and one of the two can stop being refreshed while the
 * other goes on working. Frozen mid-direction, the dead copy reports that
 * direction on every frame forever.
 *
 * The test used to be "has this entry ever changed?", and that is the wrong
 * question. It catches a copy that was born dead and misses one that worked for
 * twenty minutes and then stopped — which is the case that was reported, and
 * which measurement confirmed slipped straight through: with the copy frozen
 * from the first frame the merged menu state read nothing, and with the copy
 * frozen after a while it read RIGHT with nobody touching anything.
 *
 * The right question needs no history at all. Timestamps come from one clock,
 * so a stopped entry falls further behind its working twin with every poll.
 *
 * The comparison is a gap rather than "smaller", and that is not a detail. Two
 * identical controllers report the identical `id` string — two DualSense pads
 * in co-op are indistinguishable by name — and their timestamps differ by a
 * fraction of a frame at any instant. Taking "smaller" as the test would drop
 * whichever of the two happened to be read second, alternating between them,
 * and cost a real player their input. A gap of a full second is something two
 * live pads never show and a stopped one passes within half a second.
 *
 * A single controller has no sibling to fall behind, so a player with one pad
 * is never affected — including on browsers that only refresh a pad's clock
 * when its state changes.
 */
const DUPLICATE_STALE_MS = 1000;

function shadowedDuplicates(pads: Gamepad[]): Set<number> {
  const freshestById = new Map<string, number>();
  for (const pad of pads) {
    if (typeof pad.id !== 'string' || pad.id === '') continue;
    const best = freshestById.get(pad.id);
    if (best === undefined || pad.timestamp > best) freshestById.set(pad.id, pad.timestamp);
  }

  const shadowed = new Set<number>();
  for (const pad of pads) {
    const freshest = freshestById.get(pad.id);
    if (freshest !== undefined && freshest - pad.timestamp > DUPLICATE_STALE_MS) {
      shadowed.add(pad.index);
    }
  }
  return shadowed;
}

/**
 * Whether this index is known to be a phantom.
 *
 * Read-only on purpose: this is consulted from `readMenuState`, which polls on
 * its own animation frame, and writing here would advance `assignmentFrame` at
 * a second rate. STALE_AFTER_FRAMES is calibrated against the simulation's
 * rate, so a second writer would quietly shorten the staleness window on any
 * screen where both pollers run.
 *
 * Nothing is known until `readPlayerPads` has seen the device at least once —
 * on the very first menus of a session there is no record and no filtering.
 * From the roster screen onwards there is: the record survives screens, since
 * the only thing that drops an entry is the pad leaving the browser's list.
 */
function isKnownPhantom(index: number): boolean {
  const activity = padActivity.get(index);
  return !!activity && !activity.everChanged;
}

export function readMenuState(): MenuState {
  const state = emptyMenuState();
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return state;

  const listed = navigator.getGamepads().filter((p): p is Gamepad => !!p && p.connected);
  const shadowed = shadowedDuplicates(listed);

  for (const pad of listed) {
    // A stale copy of a device that is still working elsewhere in the list.
    // Frozen mid-direction it would hold that direction true forever.
    if (shadowed.has(pad.index)) continue;
    // A phantom frozen mid-direction would hold that direction true forever,
    // and the dispatcher fires on the false-to-true edge — so the direction
    // has no edge left to give and the player's own press of it does nothing.
    // Reported from play as the d-pad going inert in the pause modal while
    // confirm still worked, which is the shape of exactly this: a button is
    // not a direction, so it still had its edge.
    //
    // The menus merge every listed pad rather than reading an assigned slot,
    // which is why the slot-level defence does not reach here.
    if (isKnownPhantom(pad.index)) continue;

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
