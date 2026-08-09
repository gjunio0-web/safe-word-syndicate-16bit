/**
 * Placement for two of the HUD overlays that float above the scene.
 *
 * The gameplay container holds more absolutely-positioned children than this
 * module governs, and the count matters, so here is the full census: the
 * player cards (top-3), the combo counter (top-16), the gamepad badge
 * (top-24), the bark balloon, the wave banner (top-1/3), the GO! prompt
 * (top-1/2 right), the boss bar, and — on a phone — the touch controls in the
 * bottom corners. Every one of them picked its offset from a literal Tailwind
 * class, so overlap was decided by whatever the viewport happened to be.
 *
 * This module resolves exactly two of those: the boss bar and the bark. The
 * rest keep their fixed offsets, and one known overlap survives untreated —
 * see KNOWN_GAPS at the bottom of this file. Claiming otherwise would be
 * worse than the fixed classes it replaces, because a layout module that is
 * trusted to know everything and doesn't is harder to debug than one that
 * never claimed to.
 *
 * Two overlaps were real. The boss bar sat at a fixed 48px from the bottom,
 * straight through the D-pad and the action cluster on any screen narrower
 * than about 800px — which is every phone in portrait and the shorter ones in
 * landscape. What went under the controls was the two ends of the bar: the
 * name label on the left, where SAYONARA — UNDER CONTROL is what tells you
 * the thing you are hitting is a hostage rather than an enemy, and the HP
 * readout on the right. And the bark balloon opened at 64px from the top,
 * inside the 80px-tall player cards, covering a health bar with a line of
 * dialogue.
 *
 * Resolving that here, as arithmetic over boxes, means the arrangement can be
 * checked against viewport shapes that are awkward to reproduce by hand — the
 * same reason fitViewport lives outside its component.
 *
 * A caveat worth keeping in view: the constants below mirror Tailwind classes
 * written in OnScreenControls and GameCanvas rather than being read from the
 * DOM, so they are the layout as specified, not as measured. If those classes
 * change, these have to follow. The tests will catch a collision under these
 * numbers; they cannot catch these numbers drifting from the markup.
 */

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface HudLayoutInput {
  /** Gameplay container size in CSS pixels. */
  areaWidth: number;
  areaHeight: number;
  /** Which set of size variants the controls are rendering at. */
  landscape: boolean;
  /** Whether the on-screen touch controls are mounted at all. */
  touchControls: boolean;
  /**
   * Whether the boss bar is rendering in its compact form.
   *
   * Separate from `touchControls` on purpose. That one answers "are there
   * thumb clusters in the way"; this one answers "is the screen small enough
   * that a panel is too much furniture". They are true together on every
   * device shipping today, and folding them into one flag is how a tablet —
   * touch controls, plenty of room — would lose its full bar without anyone
   * having asked for that.
   */
  compact?: boolean;
  /** Display-cutout insets, if known. Only ever push the controls inward. */
  safeArea?: { left?: number; right?: number; bottom?: number };
}

export interface HudLayout {
  /** Boss bar offset from the bottom of the container, in CSS pixels. */
  bossBarBottom: number;
  /** Boss bar width cap, in CSS pixels. */
  bossBarMaxWidth: number;
}

/*
 * The bark's offset is deliberately not here. It was, briefly, and nothing
 * read it: BarkOverlay takes BARK_TOP_CLEAR_OF_CARDS directly, because the
 * clearance is width-independent — the two player cards sit at opposite edges
 * of a full-width row, so their combined band spans the container at every
 * size and there is no width at which the balloon could slip between them.
 *
 * A returned field that only the tests consume is exactly the dead-field
 * pattern already logged twice against this codebase. Better to export the
 * constant the component actually uses and test that.
 */

/* ---- Geometry mirrored from the markup ------------------------------- */

/** OnScreenControls: container padding, then the row's own bottom padding. */
const CONTROL_PAD = { portrait: 16, landscape: 8 };
const CONTROL_ROW_PAD = { portrait: 8, landscape: 4 };
/** D-pad circle: w-36 / landscape:w-28. */
const DPAD_SIZE = { portrait: 144, landscape: 112 };
/** Action grid: two columns of w-16 with gap-3 / w-[52px] with gap-2. */
const ACTION_SIZE = { portrait: 64 * 2 + 12, landscape: 52 * 2 + 8 };

/**
 * Boss bar: w-4/5, and the two shapes it comes in, each at its tallest.
 *
 * `full` is the panel this game has always drawn — max-w-lg, measured with the
 * second line that the hostage and the shielded Matriarch both carry.
 *
 * `compact` is the phone form: one row of text over a thin track, no panel.
 * Its own tallest is the hostage variant, which keeps the instruction line
 * until the fight is joined; the resting form underneath it is 30px.
 *
 * Width matters as much as height here, and for a different reason. Height is
 * what the player loses to the HUD. Width is what decides whether the bar
 * collides with the thumb clusters at all — at 512 it does, on every phone
 * measured, and is lifted 132px into the middle of the fight. At 384 it clears
 * them and stays at the resting offset. Narrowing the bar is what gets it out
 * of the way; shortening it is what makes it small.
 *
 * The compact heights were read off the rendered elements in a browser at
 * 667x375. Everything else in this file is the markup as specified, and the
 * distance between the two kinds of number is worth recording: the full bar is
 * written as 78 and measures 81. That optimism predates this change and is
 * left alone rather than corrected in passing, because it moves the ceiling
 * clamp, which is a separate behaviour with its own tests.
 */
const BOSS_BAR_WIDTH_FRACTION = 0.8;
const BOSS_BAR = {
  full: { maxWidth: 512, height: 78 },
  compact: { maxWidth: 384, height: 44 },
} as const;

/** The shape the given input is asking for. */
function bossBarShape(input: HudLayoutInput) {
  return input.compact ? BOSS_BAR.compact : BOSS_BAR.full;
}
/** Where it sat before this module existed, and still sits when nothing is in the way. */
export const BOSS_BAR_RESTING_BOTTOM = 48;

/**
 * Where the compact bar rests instead: level with the thumb controls.
 *
 * 12 is the controls' own distance from the bottom in landscape — CONTROL_PAD
 * plus CONTROL_ROW_PAD — so the bar becomes the middle of the same bottom row
 * rather than a third thing floating above it, and the 36px it gives back go
 * to the fight.
 *
 * It can go this low because on a phone the compact bar never crosses a
 * cluster horizontally, and two boxes that do not overlap on one axis cannot
 * overlap at all. Measured on every landscape shape in the test set: at 384
 * wide the bar spans [142,526] of 667 while the clusters end at 120 and start
 * at 547, and the gap only widens on larger phones. Portrait is the exception
 * — there the bar does cross both clusters — and it needs no exception here,
 * because the lift below still fires and still clears them.
 *
 * Kept apart from BOSS_BAR_RESTING_BOTTOM rather than lowering that one: the
 * full bar is a panel with a border and a glow, and putting it against the
 * bottom edge of a desktop window is a different question nobody has asked.
 */
export const BOSS_BAR_COMPACT_RESTING_BOTTOM = 12;

/** Where the given shape rests when nothing is in its way. */
function restingBottom(input: HudLayoutInput): number {
  return input.compact ? BOSS_BAR_COMPACT_RESTING_BOTTOM : BOSS_BAR_RESTING_BOTTOM;
}

/** Player cards: top-3, and p-2.5 around a 56px portrait inside a 2px border. */
const HUD_CARD_TOP = 12;
const HUD_CARD_HEIGHT = 80;
const HUD_CARD_MIN_WIDTH = 240;
/** left-4 / right-4 on the row holding them. */
const HUD_CARD_INSET = 16;

/** Bark: px-3 on the row, max-w-md on the balloon. */
const BARK_INSET = 12;
const BARK_MAX_WIDTH = 448;
/** Where it sat before this module existed. */
export const BARK_RESTING_TOP = 64;

/**
 * Tallest form of the balloon, in CSS pixels.
 *
 * Measured in a browser, not derived from the class values like everything
 * else in this file — the balloon's height depends on how its text wraps, and
 * wrapping is not something class arithmetic can predict. It is 68px on a wide
 * container and 92px on a phone in portrait, where the narrower box wraps the
 * line further. 96 is the portrait figure with a margin.
 *
 * An earlier revision put this at 64 while its own comment claimed to be
 * rounding up. It was rounding down, by 28px in the worst case, which made
 * every clearance computed from it optimistic.
 */
const BARK_HEIGHT = 96;

/**
 * Where the bark has to open to clear the player cards.
 *
 * Width-independent on purpose: the two cards sit at opposite edges of a
 * full-width row, so their combined band spans the container at every size
 * and there is no width at which the balloon could slip between them. That
 * makes this a constant rather than something App has to measure.
 */
export const BARK_TOP_CLEAR_OF_CARDS = 100;

/** Breathing room kept between two boxes that would otherwise touch. */
const CLEARANCE = 8;

/** How close to the top of the container a lifted boss bar may come. */
const MIN_TOP_MARGIN = 4;

function variant<T>(pair: { portrait: T; landscape: T }, landscape: boolean): T {
  return landscape ? pair.landscape : pair.portrait;
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * The two touch-control clusters, in container coordinates.
 *
 * Empty when the controls are not mounted — a desktop player has nothing down
 * there, and the boss bar should stay where it was designed to sit.
 */
export function controlBoxes(input: HudLayoutInput): Box[] {
  if (!input.touchControls) return [];

  const { areaWidth, areaHeight, landscape } = input;
  const safe = input.safeArea ?? {};
  const basePad = variant(CONTROL_PAD, landscape);
  const padLeft = Math.max(basePad, safe.left ?? 0);
  const padRight = Math.max(basePad, safe.right ?? 0);
  const padBottom = Math.max(basePad, safe.bottom ?? 0);

  const bottomOffset = padBottom + variant(CONTROL_ROW_PAD, landscape);
  const dpad = variant(DPAD_SIZE, landscape);
  const action = variant(ACTION_SIZE, landscape);

  return [
    {
      left: padLeft,
      right: padLeft + dpad,
      top: areaHeight - bottomOffset - dpad,
      bottom: areaHeight - bottomOffset,
    },
    {
      left: areaWidth - padRight - action,
      right: areaWidth - padRight,
      top: areaHeight - bottomOffset - action,
      bottom: areaHeight - bottomOffset,
    },
  ];
}

/** The boss bar's box for a given offset from the bottom. */
export function bossBarBox(input: HudLayoutInput, bottom: number): Box {
  const shape = bossBarShape(input);
  const width = Math.min(input.areaWidth * BOSS_BAR_WIDTH_FRACTION, shape.maxWidth);
  return {
    left: (input.areaWidth - width) / 2,
    right: (input.areaWidth + width) / 2,
    bottom: input.areaHeight - bottom,
    top: input.areaHeight - bottom - shape.height,
  };
}

/** The player cards' combined box, or null when there is nothing at the top. */
export function hudCardBox(input: HudLayoutInput): Box {
  return {
    left: HUD_CARD_INSET,
    right: Math.max(HUD_CARD_INSET + HUD_CARD_MIN_WIDTH, input.areaWidth - HUD_CARD_INSET),
    top: HUD_CARD_TOP,
    bottom: HUD_CARD_TOP + HUD_CARD_HEIGHT,
  };
}

/** The bark balloon's box for a given offset from the top. */
export function barkBox(input: HudLayoutInput, top: number): Box {
  const width = Math.min(input.areaWidth - BARK_INSET * 2, BARK_MAX_WIDTH);
  return {
    left: (input.areaWidth - width) / 2,
    right: (input.areaWidth + width) / 2,
    top,
    bottom: top + BARK_HEIGHT,
  };
}

/**
 * Resolves where the boss bar and the bark should sit.
 *
 * Neither is moved unless it has to be. A wide landscape phone already clears
 * the controls — max-w-lg caps the bar well short of them — and lifting it
 * there would spend scene height to solve a problem that isn't present.
 *
 * The boss bar and the bark are resolved independently of each other, and
 * nothing here arbitrates between them. That is safe only because they cannot
 * co-occur: barkOnSpawn appears on four waves and none of them is a boss wave.
 * If a bark is ever written onto a boss wave, a short landscape container will
 * not fit both and this function will have to choose — the bark should be the
 * one that yields, being transient and already pointer-events-none, but that
 * rule is deliberately not written as code today, because untested code for an
 * unreachable case is a liability rather than preparation.
 */
export function hudLayout(input: HudLayoutInput): HudLayout {
  const clusters = controlBoxes(input);

  let bossBarBottom = restingBottom(input);
  const resting = bossBarBox(input, bossBarBottom);
  const hit = clusters.filter((cluster) => overlaps(resting, cluster));

  if (hit.length > 0) {
    // Lift to just above whichever cluster reaches highest — but not past the
    // top of the container. Unclamped, a very short container pushed the bar
    // straight off the screen: at 320x200 the controls start 76px down, which
    // asked for a 132px offset and put the bar's own top at -10. The bar
    // showing partly behind a thumb is bad; the bar being invisible is worse,
    // and it is the boss fight's only HP readout.
    //
    // The ceiling stands on its own. A first attempt wrote it as
    // Math.max(ceiling, BOSS_BAR_RESTING_BOTTOM), meaning to say "never end up
    // lower than where it started" — but below about 130px of container the
    // ceiling itself falls under the resting offset, and that floor then
    // overrode the very limit it was sitting next to. The clamp failed in
    // precisely the range it was written for. There is no floor here now: if
    // the container is short enough that the ceiling lands below the resting
    // offset, the ceiling is the honest answer, because the alternative is the
    // bar leaving the screen.
    //
    // When even the clamped position still overlaps, the container is simply
    // too short for both and the overlap stands — measured, that is anything
    // under 249px of height. Nothing here can conjure vertical space that does
    // not exist.
    const highest = Math.min(...hit.map((cluster) => cluster.top));
    const wanted = input.areaHeight - highest + CLEARANCE;
    bossBarBottom = wanted;
  }

  // Applied to both branches, not just the lift. The first version clamped
  // only inside the collision branch, which left the resting offset itself
  // unchecked — and the resting offset plus the bar's own height is taller
  // than a container under ~126px, so the bar walked off the top there
  // without any lift having happened at all. The ceiling is a property of the
  // container, so it belongs outside the branch that happens to move things.
  bossBarBottom = Math.min(
    bossBarBottom,
    input.areaHeight - bossBarShape(input).height - MIN_TOP_MARGIN
  );

  return {
    bossBarBottom,
    bossBarMaxWidth: bossBarShape(input).maxWidth,
  };
}

/*
 * KNOWN_GAPS
 *
 * The gamepad badge sits at top-24 and runs to roughly 124px down. The bark
 * opens at 100, so the two overlap whenever a controller is connected on a
 * container narrow enough for the balloon to reach the left edge. This
 * predates the module and is not made worse by it, and it is left alone
 * deliberately: pushing the bark below the badge would move it down another
 * 32px for every player, to fix a case that needs a gamepad plugged into a
 * phone, and on a 308px-tall landscape container that extra 32px is what
 * would put the balloon into the boss bar instead. Trading a rare overlap for
 * a common one is not a fix.
 *
 * The combo counter at top-16 runs to about 96px and clears the bark by 4px.
 * That is closer than anything here should be by accident — it holds because
 * BARK_TOP_CLEAR_OF_CARDS happens to land just past it. If the cards ever get
 * shorter, check this before trusting it.
 */
