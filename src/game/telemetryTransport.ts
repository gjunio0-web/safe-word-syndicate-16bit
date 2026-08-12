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
 * A session that never got past the first wave is almost always someone who
 * opened the link, saw the attract loop, and left — a click, not a play. They
 * would otherwise dominate a run of forty sessions and drag every average
 * toward zero, and the questions being asked are about people who played.
 *
 * The threshold is on progress rather than on time, because time is the thing
 * being measured and a rule that discards short sessions would guarantee the
 * answer it was meant to discover.
 */
export function isWorthSending(session: SessionSnapshot): boolean {
  if (!session.outcome) return false;
  return session.furthestStage > 0 || session.furthestWave > 0;
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
