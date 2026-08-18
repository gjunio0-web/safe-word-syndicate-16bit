import { SessionSnapshot } from './telemetry';

/**
 * Getting a finished session off the machine.
 *
 * Split from the collector so the two can fail independently and be read
 * independently: if the numbers arriving are wrong, the question is whether
 * they were assembled wrong or shipped wrong, and one file each makes that a
 * five-minute answer instead of an afternoon.
 *
 * Everything here is deliberately unreliable in one direction only. A session
 * that fails to send is lost and nothing is retried, because the alternative —
 * queueing failures on the player's machine — means storing their play history
 * on their device, which is exactly the thing the collector was built to avoid.
 * Losing a few sessions is a rounding error on a run of forty. Keeping a
 * durable record of someone's attempts is a different product.
 */

/** Where the function lives. Netlify's default path, so the SPA redirect in
 * netlify.toml does not have to learn about an exception. */
const ENDPOINT = '/.netlify/functions/telemetry';

/**
 * Whether this session is worth reporting.
 *
 * Only one condition: it has to have ended. An unsealed session is a run still
 * in progress, and reporting one would put a half-finished row next to
 * finished ones with no way to tell them apart.
 *
 * There was a second condition here and it was wrong. It required progress
 * past the first wave, on the reasoning that people who open a link, watch the
 * attract loop and leave would swamp a run of forty sessions. They would — but
 * they never get a session at all, because one is only opened when a fighter
 * is chosen, several screens later. What the rule actually discarded was every
 * player who fought through wave one and stopped, on the first stage, which is
 * the exact population the whole exercise exists to observe. Wave indices are
 * zero-based, so those sessions read as stage 0, wave 0, and were silently
 * dropped as bounces.
 *
 * The lesson worth keeping: a filter defended by a story about who it excludes
 * needs a test that shows it excluding them, or it is just a story.
 */
export function isWorthSending(session: SessionSnapshot): boolean {
  return session.outcome !== null;
}

/** The body, as JSON. Separated so a test can read what would be sent. */
export function encodeSession(session: SessionSnapshot): string {
  return JSON.stringify(session);
}

/**
 * Sends, or gives up quietly.
 *
 * `sendBeacon` rather than `fetch`, and the reason is the whole point of this
 * function. The most informative session in the set is the one where somebody
 * closed the tab, and a normal request issued while the page is being torn
 * down is cancelled by the browser. Beacons are queued by the browser and
 * survive the page, which is what they exist for.
 *
 * Returns whether the browser accepted the beacon. That is not delivery — no
 * response ever comes back — and nothing here pretends otherwise.
 */
export function sendSession(session: SessionSnapshot): boolean {
  if (!isWorthSending(session)) return false;

  const body = encodeSession(session);

  const beacon = navigator?.sendBeacon?.bind(navigator);
  if (beacon) {
    try {
      // Sent as plain text rather than application/json on purpose: a JSON
      // content type makes this a cross-origin preflight in some browsers,
      // and a preflight is a round trip the closing page will not survive.
      // The function parses the body itself and does not trust the header.
      return beacon(ENDPOINT, new Blob([body], { type: 'text/plain' }));
    } catch {
      return false;
    }
  }

  // No beacon support. Try once, and let it fail silently — a session lost to
  // an old browser is a session lost, and there is nothing here worth
  // interrupting a player to recover.
  try {
    void fetch(ENDPOINT, { method: 'POST', body, keepalive: true }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
