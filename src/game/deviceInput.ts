/**
 * Deciding whether the player is on a touch device.
 *
 * Four components ask this directly — App, TitleScreen, CharacterSelect and
 * GameOverModal — and inside App the same flag feeds three more places: which
 * control layer mounts, the rotate prompt, and the touchControls input to
 * hudLayout that decides where the boss bar sits. So getting it wrong is not a
 * styling problem. A device wrongly read as desktop is handed a keyboard
 * layout, a keyboard-only character select, and no movement controls of any
 * kind, with a banner telling it to press W A S D. There is no recovery from
 * inside the game.
 *
 * The old rule treated `navigator.userAgentData.mobile` as authoritative and
 * returned it directly, media query untouched. That reads well until you look
 * at what the field is specified to mean: whether the user is on a mobile
 * device *or prefers a mobile experience* — a product question, not an input
 * one. Chromium is understood to answer false for Android tablets, which have
 * neither keyboard nor mouse and would land in the unplayable branch above.
 *
 * Stated as understanding rather than fact on purpose. That behaviour comes
 * from the specification's wording and from emulated testing; nobody has run
 * this against a physical Android tablet. The rule below is built so that
 * being wrong about it costs nothing: if Chromium does report true there, the
 * hint simply agrees with the modality query instead of overruling it.
 *
 * So the hint is used as a positive signal only. When it says mobile, that is
 * the answer. When it says otherwise — or says nothing, as on iPadOS Safari,
 * which has no userAgentData at all — the question falls to the media query,
 * which asks about input modality rather than about product categories.
 *
 * The two errors here are not symmetric, and the rule leans accordingly. A
 * false positive shows touch controls to someone holding a mouse: visible
 * clutter, everything still works. A false negative leaves a player with no
 * way to move. When the signals disagree, err toward the recoverable mistake.
 */

export interface DeviceSignals {
  /**
   * `navigator.userAgentData.mobile`, when the browser exposes it. Undefined
   * everywhere else, which includes every Safari.
   */
  uaMobile?: boolean;
  /**
   * Whether `(pointer: coarse) and (hover: none)` matches — a primary input
   * that is a finger, with no way to hover. A touchscreen laptop with a mouse
   * attached reports hover:hover and correctly fails this.
   */
  touchModality: boolean;
}

/**
 * Resolves the signals into the single boolean the app routes on.
 *
 * Kept separate from the hook so the truth table can be exercised directly;
 * the suite runs under node, where neither navigator nor matchMedia exists.
 */
export function resolveMobileDevice({ uaMobile, touchModality }: DeviceSignals): boolean {
  return uaMobile === true || touchModality;
}
