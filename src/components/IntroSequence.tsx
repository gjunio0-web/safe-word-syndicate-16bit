import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sound } from '../game/sound';
import { useGamepadMenu } from '../hooks/useGamepadMenu';

/**
 * THE SAFE-WORD SYNDICATE — attract-mode intro.
 *
 * No video file: static pixel art layered up and driven by CSS, so the artwork
 * stays pixel-exact and the bundle stays small.
 *
 * Everything here is a pure function of one number — how far into the track we
 * are. Timers were the obvious way to write this and the wrong one: browsers
 * throttle setTimeout, especially on a backgrounded tab, so after 44 seconds the
 * picture had drifted off the music. Reading the AudioContext clock instead means
 * the visuals cannot drift, because they are being measured against the same
 * clock that is playing the audio.
 */

/* ---------- Tempo grid ---------- */
const BPM = 130;
const BEAT = 60 / BPM;          // 0.4615s
const BAR = BEAT * 4;           // 1.8462s

/** The drop lands here, on the downbeat of bar 25. */
const DROP_AT = 24 * BAR;       // 44.308s
/** End of the title-theme loop, bar 33. */
const LOOP_END = 32 * BAR;      // 59.077s

/** One character per 1/48 note — readable, and still on the grid. */
const CHAR_TIME = BEAT / 12;

/**
 * Exactly the `.sws-rotate` CSS trigger below, duplicated in JS. Kept as one
 * named constant rather than two hand-copied strings so the gate that holds
 * playback and the overlay that explains why can't drift out of sync with
 * each other.
 */
const ROTATE_QUERY = '(orientation: portrait) and (max-width: 900px)';

/* ---------- Assets ---------- */
export interface IntroAssets {
  scene1: string;
  scene2: string;
  scene3: string;
  scene3Neon: string;
  scene4Plate: string;
  scene4Heroes: string;
  closeups: string[];
  music: string;
}

const DEFAULT_ASSETS: IntroAssets = {
  scene1: '/assets/intro/01_neon_district.webp',
  scene2: '/assets/intro/02_boardroom.webp',
  scene3: '/assets/intro/03_alley_bw.webp',
  scene3Neon: '/assets/intro/03_alley_neon.webp',
  scene4Plate: '/assets/intro/04_street_plate.webp',
  scene4Heroes: '/assets/intro/04_heroes_overlay.webp',
  closeups: [
    '/assets/intro/cu_feet_master.webp',
    '/assets/intro/cu_fun_maker.webp',
    '/assets/intro/cu_omega_biker.webp',
    '/assets/intro/cu_angry_corso.webp',
  ],
  music: '/assets/intro/intro_theme.ogg',
};

/* ---------- Scene table ---------- */
type SceneKey = 'threat' | 'matriarch' | 'resistance' | 'shock';

interface Scene {
  key: SceneKey;
  /** Bar this scene starts on, counting from zero. */
  startBar: number;
  textBar: number | null;
  text: string;
  fallback: string;
}

const SCENES: Scene[] = [
  {
    key: 'threat',
    startBar: 0,
    textBar: 5,
    text:
      'IN THE YEAR 20XX...\n' +
      'THE ULTRA EVIL LEAGUE DEPLOYED THE CENSURE PROTOCOL.\n' +
      'THE WORLD WAS FORCED INTO A DULL, GRAY STATUS QUO.',
    fallback: '#2a0b3d',
  },
  {
    key: 'matriarch',
    startBar: 12,
    textBar: 13,
    text: 'ALL DIVERSITY WAS BANNED.\nALL NOISE WAS SILENCED.',
    fallback: '#1c1c1f',
  },
  {
    key: 'resistance',
    startBar: 17,
    textBar: 22,
    text: 'BUT FOUR REBELS REFUSED TO FADE AWAY.',
    fallback: '#0d0d10',
  },
  /*
   * Starts a bar before the drop, on the enemy street with nobody in it. The
   * heroes were composited into this plate before, which meant scene 4 opened
   * with them already standing there — the drop landed on a still frame and the
   * Purity Patrol formation behind them was 71% hidden. Holding on the empty
   * street first gives the enemies a beat of their own and turns the drop into
   * an arrival.
   */
  { key: 'shock', startBar: 23, textBar: null, text: '', fallback: '#12002b' },
];

function sceneAt(elapsed: number): Scene {
  let current = SCENES[0];
  for (const scene of SCENES) {
    if (elapsed >= scene.startBar * BAR) current = scene;
  }
  return current;
}

/** Which hero close-up is on screen, or -1 for the wide alley shot. */
function closeupAt(elapsed: number, count: number): number {
  const scene = sceneAt(elapsed);
  if (scene.key !== 'resistance') return -1;
  const into = elapsed - scene.startBar * BAR;
  const index = Math.floor((into - 2 * BAR) / (2 * BEAT));
  return index >= 0 && index < count ? index : -1;
}

/** 0 before the drop, then 1 blast, 2 title, 3 prompt. */
function climaxAt(elapsed: number): number {
  if (elapsed < DROP_AT) return 0;
  const into = elapsed - DROP_AT;
  if (into >= 2 * BAR) return 3;
  if (into >= 2 * BEAT) return 2;
  return 1;
}

interface Props {
  onComplete: () => void;
  assets?: Partial<IntroAssets>;
}

export default function IntroSequence({ onComplete, assets: overrides }: Props) {
  const assets = useMemo(() => ({ ...DEFAULT_ASSETS, ...overrides }), [overrides]);

  /**
   * Nothing about the intro starts - audio doesn't fetch or play, no timer
   * ticks, no input is read - while the device still needs to be rotated.
   * There is no sync to protect by starting early: the audio clock the rest
   * of the sequence reads doesn't exist until playback begins, so waiting
   * costs nothing and arriving mid-scene (the old behaviour) is strictly
   * worse than arriving at the top once the picture can actually be seen.
   *
   * One-way, and matched exactly to `.sws-rotate`'s CSS trigger below: once
   * unlocked by a landscape/wide-enough viewport, a later rotate back to
   * portrait doesn't re-pause a sequence already underway, the same as the
   * overlay itself has always just re-covered whatever's still running.
   */
  const [waitingForRotation, setWaitingForRotation] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(ROTATE_QUERY).matches
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(ROTATE_QUERY);
    const onChange = () => {
      if (!mql.matches) setWaitingForRotation(false);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const [elapsed, setElapsed] = useState(0);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const finishedRef = useRef(false);

  // Backing state for the tick loop and for a skip-ahead reseek, both of which
  // need to read or rewrite "what time is it" outside of React's render cycle.
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const headStartRef = useRef(0);
  const startedAtRef = useRef(0);
  /** True once real playback has begun; false while running the silent clock. */
  const usingAudioClockRef = useRef(false);
  /** Mirrors `elapsed` outside React state, for the decode that resolves after a skip. */
  const elapsedRef = useRef(0);

  /**
   * (Re)starts playback from `offsetSeconds` into the track and snaps the
   * displayed clock to match immediately.
   *
   * This used to be a bare `setElapsed(...)` call, which looked like a skip for
   * exactly one frame: the tick loop below reads the real clock every frame
   * regardless of what React state says, and the underlying
   * AudioBufferSourceNode was still playing from wherever it actually was. The
   * visual jump was overwritten on the very next requestAnimationFrame, so no
   * key press before the drop ever did anything — every playthrough sat
   * through the full ~48s intro with no way out.
   */
  const playFrom = useCallback((offsetSeconds: number) => {
    const ctx = ctxRef.current;
    const buffer = bufferRef.current;
    if (ctx && buffer) {
      try {
        sourceRef.current?.stop();
      } catch {
        /* already stopped */
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = headStartRef.current + DROP_AT;
      source.loopEnd = Math.min(headStartRef.current + LOOP_END, buffer.duration);
      source.connect(ctx.destination);
      source.start(0, headStartRef.current + offsetSeconds);
      sourceRef.current = source;
      startedAtRef.current = ctx.currentTime - offsetSeconds;
      usingAudioClockRef.current = true;
    } else {
      // The track hasn't finished decoding yet. Advance the silent clock the
      // tick loop is reading, and leave a note for `run()` below: when the real
      // buffer does arrive, it starts from here instead of from the top, or the
      // skip would be visibly undone a moment later.
      startedAtRef.current = performance.now() / 1000 - offsetSeconds;
      usingAudioClockRef.current = false;
    }
    elapsedRef.current = offsetSeconds;
    setElapsed(offsetSeconds);
  }, []);

  /* ---- Audio, and the clock that comes with it ---- */
  useEffect(() => {
    if (waitingForRotation) return;

    let cancelled = false;
    let frame = 0;

    sound.initCtx();
    const ctx = sound.getContext();
    ctxRef.current = ctx;

    const tick = () => {
      if (cancelled) return;
      const now = usingAudioClockRef.current && ctxRef.current
        ? ctxRef.current.currentTime
        : performance.now() / 1000;
      const next = now - startedAtRef.current;
      elapsedRef.current = next;
      setElapsed(next);
      frame = requestAnimationFrame(tick);
    };

    /** Fallback clock, for a failed fetch or a browser still holding audio shut. */
    const runSilent = () => {
      startedAtRef.current = performance.now() / 1000 - elapsedRef.current;
      usingAudioClockRef.current = false;
      frame = requestAnimationFrame(tick);
    };

    const run = async () => {
      if (!ctx) {
        runSilent();
        return;
      }
      try {
        const response = await fetch(assets.music);
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        if (cancelled) return;

        // Encoders pad the head of a file — MP3 always, others sometimes — and
        // that padding would shift every cut in the sequence. Find the first
        // sample that actually carries signal and treat that as zero.
        const samples = buffer.getChannelData(0);
        let offset = 0;
        while (offset < samples.length && Math.abs(samples[offset]) < 0.003) offset += 1;
        const headStart = offset / buffer.sampleRate;

        bufferRef.current = buffer;
        headStartRef.current = headStart;

        // The last eight bars are a self-contained title theme, so playback loops
        // back to the drop rather than to the top: the sequence holds on the final
        // frame for as long as the player leaves it there, and the music carries on
        // under it instead of running out. Nothing here advances the screen — only
        // a keypress does.
        //
        // Starts from elapsedRef rather than unconditionally from the top: a skip
        // pressed in the window before decode finishes already moved the silent
        // clock ahead, and starting the real track from 0 here would snap the
        // picture back to scene one a moment after the player skipped past it.
        const startOffset = elapsedRef.current;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.loopStart = headStart + DROP_AT;
        // Clamped because a re-encode can leave the head detection an instant late,
        // and a loopEnd past the buffer silently disables looping altogether.
        source.loopEnd = Math.min(headStart + LOOP_END, buffer.duration);
        source.connect(ctx.destination);
        source.start(0, headStart + startOffset);
        sourceRef.current = source;

        startedAtRef.current = ctx.currentTime - startOffset;
        usingAudioClockRef.current = true;
        frame = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) runSilent();
      }
    };

    void run();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      try {
        sourceRef.current?.stop();
      } catch {
        /* already stopped */
      }
      sourceRef.current = null;
    };
  }, [assets.music, waitingForRotation]);

  /* ---- Input ---- */
  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    try {
      sourceRef.current?.stop();
    } catch {
      /* already stopped */
    }
    onComplete();
  }, [onComplete]);

  const scene = sceneAt(elapsed);
  const climax = climaxAt(elapsed);

  /**
   * Advances the sequence: skips to the prompt before the drop, finishes
   * after it. Shared by keyboard, mouse/touch, and gamepad so all three
   * answer to the same "press any key" prompt — a controller-only player
   * had no way to leave this screen before this was wired in, since the
   * keydown/pointerdown listeners below never covered the Gamepad API.
   */
  const handle = useCallback(() => {
    if (climax >= 3) finish();
    else playFrom(DROP_AT + 2 * BAR);
  }, [climax, finish, playFrom]);

  useEffect(() => {
    // A tap on the "TURN YOUR DEVICE" overlay itself still reaches this
    // window-level listener, and `handle` calls `playFrom`, which starts
    // real playback directly - bypassing the gate above entirely if left
    // wired up while still waiting.
    if (waitingForRotation) return;
    window.addEventListener('keydown', handle);
    window.addEventListener('pointerdown', handle);
    return () => {
      window.removeEventListener('keydown', handle);
      window.removeEventListener('pointerdown', handle);
    };
  }, [handle, waitingForRotation]);

  // Any button or direction, matching the breadth of the keyboard/pointer
  // listeners above — the prompt says "press ANY key", not "press confirm".
  useGamepadMenu(() => handle(), !waitingForRotation);

  /* ---- Narration ---- */
  const narration = useMemo(() => {
    if (scene.textBar === null) return '';
    const since = elapsed - scene.textBar * BAR;
    if (since < 0) return '';
    return scene.text.slice(0, Math.floor(since / CHAR_TIME));
  }, [scene, elapsed]);

  const closeup = closeupAt(elapsed, assets.closeups.length);

  const style = {
    '--beat': `${BEAT}s`,
    '--bar': `${BAR}s`,
  } as React.CSSProperties;

  return (
    <div className="sws-intro" style={style} data-scene={scene.key} data-climax={climax}>
      <style>{INTRO_CSS}</style>
      <div className="sws-frame">

      {scene.key === 'threat' && (
        <div className="sws-stage" style={{ background: scene.fallback }}>
          <img className="sws-layer sws-pan" src={assets.scene1} alt="" />
          <img className="sws-layer sws-pan sws-drain" src={assets.scene1} alt="" />
          <div className="sws-pulse" />
        </div>
      )}

      {scene.key === 'matriarch' && (
        <div className="sws-stage" style={{ background: scene.fallback }}>
          <img className="sws-layer sws-gray" src={assets.scene2} alt="" />
          <div className="sws-gavel-flash" />
        </div>
      )}

      {scene.key === 'resistance' && (
        <div className="sws-stage" style={{ background: scene.fallback }}>
          {closeup < 0 ? (
            <>
              <img className="sws-layer sws-gray" src={assets.scene3} alt="" />
              <img className="sws-layer sws-neon-burst" src={assets.scene3Neon} alt="" />
            </>
          ) : (
            <img key={closeup} className="sws-layer sws-cut" src={assets.closeups[closeup]} alt="" />
          )}
        </div>
      )}

      {scene.key === 'shock' && (
        <div className="sws-stage" style={{ background: scene.fallback }}>
          <img className="sws-layer sws-dead" src={assets.scene4Plate} alt="" />
          <img className="sws-layer sws-chroma" src={assets.scene4Plate} alt="" />
          {climax > 0 && <img className="sws-layer sws-heroes" src={assets.scene4Heroes} alt="" />}
          <div className="sws-title-block">
            <h1 className="sws-title">
              THE SAFE-WORD
              <span>SYNDICATE</span>
            </h1>
            <p className="sws-prompt">PRESS ANY KEY TO BRAWL</p>
          </div>
        </div>
      )}

      {narration && (
        <div className="sws-narration">
          {narration.split('\n').map((line, i) => (
            <span key={i}>{line}</span>
          ))}
          <b className="sws-caret" />
        </div>
      )}

        <div className="sws-scanlines" aria-hidden="true" />
        <div className="sws-vignette" aria-hidden="true" />
      </div>

      <div className="sws-rotate" aria-hidden="true">
        <span>&#8635;</span>
        <p>TURN YOUR DEVICE</p>
      </div>
    </div>
  );
}

/**
 * Every animation runs on steps() rather than an easing curve. Smooth
 * interpolation is what makes CSS over pixel art look like CSS over pixel art:
 * the colour drain reads as a wipe in 20 discrete bands, not as a soft fade.
 */
const INTRO_CSS = `
.sws-intro {
  position: fixed;
  inset: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  color: #f4f4f4;
  font-family: "Press Start 2P", "VT323", ui-monospace, monospace;
  cursor: none;
  user-select: none;
  z-index: 50;
}
/*
 * The art is 1641x958, and object-fit: cover fills the viewport by throwing away
 * whatever does not fit. In a window that is not maximised — 1440x760 is typical
 * — that is 10% of the height, 20% at 1280x600, and the bottom of scene 4 is
 * exactly where the boots and their contact shadows are. So the sequence gets a
 * stage locked to the art's own aspect ratio and letterboxed inside the viewport,
 * the way a cabinet has a fixed screen. Nothing is ever cropped.
 *
 * Scene 1 still needs cover: its plate is a tall 1080x1457 canvas and the camera
 * pan works by sliding object-position through the overflow. Inside a 1.713 frame
 * there is plenty of overflow to pan through.
 */
.sws-frame {
  position: relative;
  overflow: hidden;
  width: min(100vw, calc(100vh * 1641 / 958));
  height: min(100vh, calc(100vw * 958 / 1641));
}
.sws-stage { position: absolute; inset: 0; }
.sws-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated;
}

/* --- Scene 1: hold, pan up, then the pulse drains the colour ---
 *
 * This scene establishes the world the Censure Protocol takes away, and it kept
 * failing to. First the drained city sat still four times longer than the living
 * one. Then, with that fixed, the camera was already moving at t=0 — the noodle
 * stall, the crowd, the club doorway and the reflections all slid past the lens
 * before anyone could read them.
 *
 * So it now opens on three bars of nothing but the street, holding still at the
 * bottom of the plate. Only then does the camera climb, and the pulse waits until
 * bar 6. The city is alive for the first 11.1s and dead for the last 3.7.
 *
 * Paying for that meant taking two bars off scenes 2 and 3, because the drop is
 * pinned to bar 25 by the music and the budget before it does not move.
 */
.sws-pan {
  object-position: 50% 100%;
  animation: sws-pan-up calc(var(--bar) * 2) steps(20) calc(var(--bar) * 3) forwards;
}
/* Tuned against the actual scene 1 plate, which is dark: 82% of its pixels sit
   below luminance 40 once desaturated, and a straight grayscale leaves the drained
   city as mud with a 95th percentile of 123 — the neon stops reading as signage.
   These values put it back at 223 while keeping 72% of the frame dark, so the dead
   street stays legible without stopping looking dead.

   The numbers belong to this plate. Swap the artwork and they need re-measuring:
   the previous plate wanted 1.15/1.35, this one needs 1.75/1.65. */
.sws-drain {
  filter: grayscale(100%) brightness(1.75) contrast(1.65);
  clip-path: inset(0 0 100% 0);
  animation: sws-drain-sweep calc(var(--bar) * 4) steps(20) calc(var(--bar) * 6) forwards,
             sws-pan-up calc(var(--bar) * 2) steps(20) calc(var(--bar) * 3) forwards;
}
.sws-pulse {
  position: absolute; left: 0; right: 0; height: 6vh; top: -6vh;
  background: linear-gradient(180deg, transparent, #ffffff 60%, #7df9ff);
  mix-blend-mode: screen; opacity: 0;
  animation: sws-pulse-fall calc(var(--bar) * 4) steps(20) calc(var(--bar) * 6) forwards;
}
@keyframes sws-pan-up { to { object-position: 50% 0%; } }
@keyframes sws-drain-sweep { to { clip-path: inset(0 0 0 0); } }
@keyframes sws-pulse-fall {
  0%   { opacity: 0.95; top: -6vh; }
  95%  { opacity: 0.95; top: 100%; }
  100% { opacity: 0; top: 100%; }
}

/* --- Scenes 2 and 3 ship monochrome already; scene 4 does not --- */
.sws-gray { filter: grayscale(100%) contrast(1.1); }
.sws-dead { filter: grayscale(100%) brightness(1.15) contrast(1.35); }
.sws-gavel-flash {
  position: absolute; inset: 0; background: #fff; opacity: 0;
  animation: sws-flash calc(var(--beat) * 1.5) steps(3) calc(var(--bar) * 3.5) forwards;
}
@keyframes sws-flash { 0% { opacity: 1; } 100% { opacity: 0; } }

/* --- Scene 3 --- */
.sws-neon-burst {
  filter: saturate(1.4); opacity: 0; transform-origin: 50% 60%;
  animation: sws-burst calc(var(--bar) * 2) steps(6) forwards;
}
.sws-cut { filter: grayscale(35%) contrast(1.25); animation: sws-hard-cut calc(var(--beat) / 4) steps(2); }
@keyframes sws-burst {
  0%   { opacity: 0; transform: scale(1.06); }
  25%  { opacity: 1; transform: scale(1); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes sws-hard-cut { from { opacity: 0.2; filter: brightness(2.2) grayscale(35%); } }

/* The heroes arrive in full colour over a street that is still grey, and the
   colour spreads outward from where Feet Master's boot lands. They break the
   status quo by existing in the frame, which is what the scene is for. */
.sws-heroes { animation: sws-slam calc(var(--beat) / 2) steps(3) forwards; }
@keyframes sws-slam {
  0%   { transform: scale(1.05); opacity: 0.35; }
  100% { transform: scale(1); opacity: 1; }
}

/* --- Scene 4: colour detonates from Feet Master's boot.
       32.2% / 95.5% is where his sole actually lands in the composed plate. --- */
.sws-chroma { clip-path: circle(0% at 32.2% 95.5%); opacity: 0; }
[data-climax="1"] .sws-chroma,
[data-climax="2"] .sws-chroma,
[data-climax="3"] .sws-chroma {
  opacity: 1;
  animation: sws-chroma-blast calc(var(--beat) * 2) steps(12) forwards;
}
[data-climax="1"] .sws-stage { animation: sws-shake calc(var(--beat) / 2) steps(2) 3; }
@keyframes sws-chroma-blast { to { clip-path: circle(150% at 32.2% 95.5%); } }
@keyframes sws-shake {
  0%   { transform: translate(0, 0); }
  50%  { transform: translate(-4px, 3px); }
  100% { transform: translate(0, 0); }
}

.sws-title-block {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 4vh;
  text-align: center; pointer-events: none;
}
.sws-title {
  margin: 0; display: none;
  font-size: clamp(1.4rem, 5.2vw, 4rem);
  line-height: 1.35; letter-spacing: 0.06em;
  color: #ff2fb9; text-shadow: 4px 4px 0 #06f7ff, 8px 8px 0 #120024;
}
.sws-title span { display: block; color: #ffe600; text-shadow: 4px 4px 0 #ff2fb9, 8px 8px 0 #120024; }
[data-climax="2"] .sws-title,
[data-climax="3"] .sws-title { display: block; animation: sws-title-pulse calc(var(--beat) * 2) steps(2) infinite; }
.sws-prompt { margin: 0; display: none; font-size: clamp(0.6rem, 1.6vw, 1.1rem); color: #f4f4f4; }
[data-climax="3"] .sws-prompt { display: block; animation: sws-blink calc(var(--beat) * 2) steps(1) infinite; }
@keyframes sws-title-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
@keyframes sws-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }

.sws-narration {
  position: absolute; left: 6vw; right: 6vw; bottom: 8vh;
  display: flex; flex-direction: column; gap: 0.9em;
  font-size: clamp(0.55rem, 1.5vw, 1rem); line-height: 1.5;
  letter-spacing: 0.04em; text-shadow: 3px 3px 0 #000;
}
.sws-caret { width: 0.7em; height: 1em; background: #ffe600; animation: sws-blink var(--beat) steps(1) infinite; }

/*
 * Portrait leaves the letterbox 73% empty on a phone: a 390px-wide screen gives a
 * band 228px tall. The art is landscape and a brawler is a landscape game, so the
 * honest answer is to ask for the rotation rather than crop the composition down
 * to a vertical slice. The sequence keeps running behind this, so rotating
 * part-way through reveals it already in sync rather than restarting it.
 */
.sws-rotate {
  position: absolute;
  inset: 0;
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2vh;
  background: #000;
  color: #ffe600;
  letter-spacing: 0.12em;
}
.sws-rotate span { font-size: 14vw; line-height: 1; }
.sws-rotate p { font-size: 4vw; margin: 0; }
@media (orientation: portrait) and (max-width: 900px) {
  .sws-rotate { display: flex; }
}

.sws-scanlines {
  position: absolute; inset: 0; pointer-events: none; mix-blend-mode: multiply;
  background: repeating-linear-gradient(180deg, rgba(0,0,0,0.28) 0 2px, transparent 2px 4px);
}
.sws-vignette { position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 14vh rgba(0,0,0,0.85); }

@media (prefers-reduced-motion: reduce) {
  .sws-intro *, .sws-intro *::before, .sws-intro *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
  }
  [data-climax="2"] .sws-title, [data-climax="3"] .sws-title,
  [data-climax="3"] .sws-prompt { display: block; opacity: 1; }
  .sws-chroma { clip-path: circle(150% at 32.2% 95.5%); }
}
`;
