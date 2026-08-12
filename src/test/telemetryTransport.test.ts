import { describe, expect, it, vi, afterEach } from 'vitest';
import { encodeSession, isWorthSending, sendSession } from '../game/telemetryTransport';
import { finishSession, recordProgress, startSession } from '../game/telemetry';

const played = () => {
  let s = startSession({
    build: 'FULL',
    hero: 'OMEGA_BIKER',
    mode: 'SINGLE',
    difficulty: 'NORMAL',
    touch: true,
  });
  s = recordProgress(s, 0, 2);
  return finishSession(s, 'GAME_OVER');
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('deciding what to send', () => {
  it('sends a session where someone actually played', () => {
    expect(isWorthSending(played())).toBe(true);
  });

  it('drops a click that never reached a wave', () => {
    const bounced = finishSession(
      startSession({
        build: 'FULL',
        hero: 'FUN_MAKER',
        mode: 'SINGLE',
        difficulty: 'NORMAL',
        touch: false,
      }),
      'LEFT'
    );
    expect(isWorthSending(bounced)).toBe(false);
  });

  it('drops a session that has not ended yet', () => {
    let s = startSession({
      build: 'FULL',
      hero: 'FUN_MAKER',
      mode: 'SINGLE',
      difficulty: 'NORMAL',
      touch: false,
    });
    s = recordProgress(s, 0, 3);
    expect(s.outcome).toBeNull();
    expect(isWorthSending(s)).toBe(false);
  });

  it('keeps a short session that reached a wave, since time is what is being measured', () => {
    let s = startSession({
      build: 'FULL',
      hero: 'ANGRY_CORSO',
      mode: 'SINGLE',
      difficulty: 'NORMAL',
      touch: true,
    });
    s = recordProgress(s, 0, 1);
    expect(isWorthSending(finishSession(s, 'LEFT'))).toBe(true);
  });
});

describe('what goes on the wire', () => {
  it('carries the session and nothing added to it', () => {
    const session = played();
    expect(JSON.parse(encodeSession(session))).toEqual(session);
  });

  it('hands the browser a beacon rather than a request', () => {
    const beacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { sendBeacon: beacon });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    expect(sendSession(played())).toBe(true);
    expect(beacon).toHaveBeenCalledOnce();
    // A normal request would be cancelled by the closing page, which is the
    // session most worth having.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not send a session it decided against', () => {
    const beacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { sendBeacon: beacon });
    const bounced = finishSession(
      startSession({
        build: 'FULL',
        hero: 'FEET_MASTER',
        mode: 'SINGLE',
        difficulty: 'NORMAL',
        touch: false,
      }),
      'LEFT'
    );
    expect(sendSession(bounced)).toBe(false);
    expect(beacon).not.toHaveBeenCalled();
  });

  it('falls back to a request where beacons do not exist', () => {
    vi.stubGlobal('navigator', {});
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal('fetch', fetchSpy);

    expect(sendSession(played())).toBe(true);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('gives up quietly when the browser refuses', () => {
    vi.stubGlobal('navigator', {
      sendBeacon: () => {
        throw new Error('nope');
      },
    });
    // A player who cannot report is still a player finishing a game. Nothing
    // here is allowed to surface.
    expect(() => sendSession(played())).not.toThrow();
    expect(sendSession(played())).toBe(false);
  });
});
