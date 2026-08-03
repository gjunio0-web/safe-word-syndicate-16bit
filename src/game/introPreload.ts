import type { IntroAssets } from '../components/IntroSequence';

/**
 * The order the intro's images should be fetched in, and when each is due.
 *
 * The sequence has a 59-second runway and used none of it. Every scene mounts
 * its own <img> only while that scene is on screen, so the browser learns a
 * file exists at the exact instant it has to be painted — 03_alley_neon is
 * 3.8MB and is discovered 0.0 seconds before it is needed, and the heroes
 * overlay behind the drop is another 1.2MB with the same zero notice. On
 * anything short of a fast connection the picture simply is not there yet, and
 * because the clock is driven by the music it does not wait: the scene plays
 * as its fallback colour and moves on. A first-time player on a slow link
 * watches a nearly black minute.
 *
 * The fix is not to block on loading — the sequence is deliberately built to
 * degrade rather than stall, and a loading gate would trade a bad minute for a
 * worse wait. It is simply to tell the browser about the files at mount, in
 * the order they come due, so the runway that already exists gets used.
 *
 * Deadlines below are in seconds from the start of the sequence, derived from
 * the same bar grid the scene table uses. They are documentation as much as
 * ordering: if a scene moves, the number that stops matching is visible here.
 */

const BPM = 130;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

export interface PreloadItem {
  url: string;
  /** Seconds from the start of the sequence at which this must be on screen. */
  dueAt: number;
}

/**
 * Builds the fetch plan, earliest deadline first.
 *
 * Close-ups are expanded individually and share the deadline of the scene they
 * cut into, since any of the four can be first depending on nothing the player
 * controls.
 *
 * Deliberately excludes the music. That is fetched and decoded by the
 * sequence's own audio path, which already has a silent-clock fallback for
 * when it is late; adding it here would put a 1.2MB download in front of the
 * first image for no gain.
 */
export function introPreloadPlan(assets: IntroAssets): PreloadItem[] {
  const plan: PreloadItem[] = [
    { url: assets.scene1, dueAt: 0 },
    { url: assets.scene2, dueAt: 12 * BAR },
    { url: assets.scene3, dueAt: 17 * BAR },
    ...assets.closeups.map((url) => ({ url, dueAt: 17 * BAR })),
    { url: assets.scene3Neon, dueAt: 17 * BAR },
    { url: assets.scene4Plate, dueAt: 23 * BAR },
    { url: assets.scene4Heroes, dueAt: 24 * BAR },
  ];

  /*
   * Stable sort by deadline, and within a deadline the array order above
   * stands. That ordering is not arbitrary: the four close-ups total 0.75MB
   * and the neon plate alone is 3.8MB, all due at the same instant, so putting
   * the small ones first means five of the six assets for that scene are
   * ready even when the largest is not. A scene missing its glow layer still
   * reads; a scene missing everything is a black rectangle.
   */
  return plan
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.dueAt - b.item.dueAt || a.index - b.index)
    .map(({ item }) => item);
}

/**
 * Starts every fetch in plan order and resolves when they have all settled.
 *
 * Resolves rather than rejects on a failed image: a missing file should cost
 * that one scene its picture, not take down the sequence. The caller does not
 * wait on this — the return value exists so a test can.
 */
export function warmIntroAssets(
  assets: IntroAssets,
  load: (url: string) => Promise<unknown> = defaultLoad
): Promise<void> {
  return Promise.all(
    introPreloadPlan(assets).map((item) => load(item.url).catch(() => undefined))
  ).then(() => undefined);
}

function defaultLoad(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(undefined);
    img.onerror = reject;
    img.src = url;
  });
}
