import { describe, expect, it } from 'vitest';
import { isSession, toDocument } from '../../netlify/functions/sessionDocument.mts';

/**
 * What the public endpoint accepts, and the shape it files.
 *
 * Both used to live inside the handler, where this suite cannot reach them —
 * it imports `node:crypto` and the tests run without Node types. That was not
 * a theoretical gap: a mutation writing the expiry as a string rather than a
 * timestamp, which would leave every session in the collection for ever with
 * the TTL policy silently doing nothing, survived all 558 tests.
 */

const valid = () => ({
  sessionId: 'abc',
  build: 'FULL',
  channel: 'PRODUCTION',
  hero: 'FUN_MAKER',
  partner: null,
  mode: 'SINGLE',
  difficulty: 'NORMAL',
  touch: true,
  furthestStage: 0,
  furthestWave: 2,
  deaths: [{ stage: 0, wave: 2 }],
  seconds: 90,
  score: 1200,
  enemiesDefeated: 7,
  outcome: 'GAME_OVER',
});

describe('what the endpoint accepts', () => {
  it('takes a well-formed session', () => {
    expect(isSession(valid())).toBe(true);
  });

  it('takes a co-op session with a partner named', () => {
    expect(isSession({ ...valid(), partner: 'ANGRY_CORSO' })).toBe(true);
  });

  it('still takes a session from a tab that has not reloaded since the release', () => {
    // The page and the function ship together; browser caches do not. For a
    // while after any release a tab opened before it posts a body with no
    // channel in it. That is a real player's run, and rejecting it to enforce
    // a label would trade an observation for a tidy column.
    const { channel, ...older } = valid();
    void channel;
    expect(isSession(older)).toBe(true);
  });

  it('refuses a channel that is present and absurd', () => {
    // Optional is not the same as unchecked. A megabyte under this key is junk
    // whether or not the key had to be there.
    expect(isSession({ ...valid(), channel: 'x'.repeat(200) })).toBe(false);
    expect(isSession({ ...valid(), channel: 42 })).toBe(false);
  });

  it('refuses anything that is not an object', () => {
    for (const junk of [null, undefined, 'session', 42, []]) {
      expect(isSession(junk), String(junk)).toBe(false);
    }
  });

  it('refuses a missing field rather than storing a hole', () => {
    const { hero, ...withoutHero } = valid();
    void hero;
    expect(isSession(withoutHero)).toBe(false);
  });

  it('refuses a partner that is neither absent nor a name', () => {
    // `null` is how a solo run says "nobody", and the only other thing this
    // field may be is a name. Without the check a number, an object or a
    // payload-sized string would be filed as a fighter.
    expect(isSession({ ...valid(), partner: 42 })).toBe(false);
    expect(isSession({ ...valid(), partner: 'x'.repeat(64) })).toBe(false);
    expect(isSession({ ...valid(), partner: undefined })).toBe(false);
  });

  it('refuses a negative count, which no run can produce', () => {
    expect(isSession({ ...valid(), seconds: -1 })).toBe(false);
    expect(isSession({ ...valid(), furthestWave: -3 })).toBe(false);
  });

  it('refuses a number that is not one', () => {
    expect(isSession({ ...valid(), score: Number.NaN })).toBe(false);
    expect(isSession({ ...valid(), score: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it('refuses a string long enough to be a payload rather than a name', () => {
    // A public endpoint takes whatever the internet sends it. This is not
    // security — anyone can post a well-formed lie — but it keeps junk out of
    // the collection, which is the realistic failure mode.
    expect(isSession({ ...valid(), hero: 'x'.repeat(64) })).toBe(false);
  });

  it('refuses hundreds of deaths, which eleven waves cannot produce', () => {
    const many = Array.from({ length: 201 }, () => ({ stage: 0, wave: 1 }));
    expect(isSession({ ...valid(), deaths: many })).toBe(false);
  });

  it('refuses a death that is not a place', () => {
    expect(isSession({ ...valid(), deaths: [{ stage: 'one', wave: 1 }] })).toBe(false);
  });
});

describe('the document that gets filed', () => {
  const doc = () => toDocument(valid() as never, '2026-08-19T12:00:00.000Z');

  it('marks the expiry as a timestamp, which is the only kind TTL deletes', () => {
    // As a string it is stored happily, read back happily, and never deleted.
    // Nothing would look wrong until the retention promise came due.
    expect(doc().expiresAt.timestampValue).toBe('2027-02-18T12:00:00.000Z');
    expect(doc().expiresAt.stringValue).toBeUndefined();
  });

  it('records which deploy the session was played on', () => {
    // Without it a run played while testing a branch sits in the collection
    // beside a stranger's and nothing tells them apart. The first document
    // ever stored was exactly that, and would have counted as a player.
    expect(doc().channel).toEqual({ stringValue: 'PRODUCTION' });
  });

  it('writes UNKNOWN rather than leaving the field off', () => {
    // A field that is sometimes absent makes every reader decide what absence
    // means, and they will not all decide the same way. It is said once here.
    const { channel, ...older } = valid();
    void channel;
    const filed = toDocument(older as never, '2026-08-19T12:00:00.000Z');
    expect(filed.channel).toEqual({ stringValue: 'UNKNOWN' });
  });

  it('stamps the arrival server-side', () => {
    // The browser clock is whatever the player set it to, and a session dated
    // 2019 would be indistinguishable from a real one.
    expect(doc().receivedAt.stringValue).toBe('2026-08-19T12:00:00.000Z');
  });

  it('carries the counts as integers', () => {
    expect(doc().seconds.integerValue).toBe('90');
    expect(doc().furthestWave.integerValue).toBe('2');
  });

  it('keeps an absent partner as null rather than as the word null', () => {
    expect(doc().partner).toEqual({ nullValue: null });
    const coop = toDocument(
      { ...valid(), partner: 'ANGRY_CORSO' } as never,
      '2026-08-19T12:00:00.000Z'
    );
    expect(coop.partner).toEqual({ stringValue: 'ANGRY_CORSO' });
  });

  it('files each death as a place, not as a count', () => {
    expect(doc().deaths.arrayValue?.values).toEqual([
      { mapValue: { fields: { stage: { integerValue: '0' }, wave: { integerValue: '2' } } } },
    ]);
  });

  it('files nothing the session did not carry', () => {
    // The guard is on the shape rather than on a reviewer remembering. A field
    // added later that names a person or an address fails here first.
    const keys = Object.keys(doc());
    for (const forbidden of ['ip', 'address', 'agent', 'referer', 'name', 'email', 'user']) {
      expect(keys.some((k) => k.toLowerCase().includes(forbidden)), forbidden).toBe(false);
    }
  });
});
