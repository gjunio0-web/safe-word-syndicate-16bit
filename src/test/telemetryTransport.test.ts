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

  it('keeps a run that ended on the very first wave', () => {
    // Wave indices are zero-based and stage indices are too, so a player who
    // fought wave one of stage one and stopped reads as 0/0. That is the most
    // common shape a first-stage run can have and dropping it would empty the
    // dataset of exactly what it exists to measure.
    const firstWave = finishSession(
      startSession({
        build: 'FULL',
        hero: 'FUN_MAKER',
        mode: 'SINGLE',
        difficulty: 'NORMAL',
        touch: false,
      }),
      'LEFT'
    );
    expect(firstWave.furthestStage).toBe(0);
    expect(firstWave.furthestWave).toBe(0);
    expect(isWorthSending(firstWave)).toBe(true);
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

  it('does not send a session that has not ended', () => {
    const beacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { sendBeacon: beacon });
    const open = startSession({
      build: 'FULL',
      hero: 'FEET_MASTER',
      mode: 'SINGLE',
      difficulty: 'NORMAL',
      touch: false,
    });
    expect(sendSession(open)).toBe(false);
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
