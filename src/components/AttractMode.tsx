import React, { useEffect, useRef, useState } from 'react';
import { CHARACTERS } from '../game/characterData';
import { STAGES, renderStageBackground } from '../game/stageData';
import { CharacterId } from '../types';

/**
 * Attract mode: what the cabinet shows before anyone puts money in.
 *
 * Deliberately not a menu — a menu with a single button is a confirmation
 * dialog. This loops content worth looking at, with INSERT COIN blinking over
 * it, and any input at all inserts the coin.
 *
 * Nothing here needs new art. The character portraits are already mock arcade
 * screens, complete with painted-on HUD and PRESS START — framing that reads
 * as noise next to the real HUD but belongs exactly here. The stage panels
 * reuse `renderStageBackground`, the same parallax the game draws.
 */

type Panel =
  | { kind: 'TITLE'; durationMs: number }
  | { kind: 'CHARACTER'; charId: CharacterId; durationMs: number }
  | { kind: 'STAGE'; stageIndex: number; durationMs: number };

const TITLE_MS = 4000;
const CHARACTER_MS = 3000;
const STAGE_MS = 4000;

/** Built from the game data, so new characters or stages join the loop. */
function buildSequence(): Panel[] {
  return [
    { kind: 'TITLE', durationMs: TITLE_MS },
    ...Object.values(CHARACTERS).map(
      (c): Panel => ({ kind: 'CHARACTER', charId: c.id, durationMs: CHARACTER_MS })
    ),
    ...STAGES.map((_, i): Panel => ({ kind: 'STAGE', stageIndex: i, durationMs: STAGE_MS })),
  ];
}

/** Parallax scroll speed for stage panels, in world units per second. */
const STAGE_SCROLL_SPEED = 90;

/**
 * Cap on a single frame's delta. Returning from a background tab hands back one
 * enormous timestamp gap, which would skip several panels at once.
 */
const MAX_FRAME_MS = 100;

interface AttractModeProps {
  onInsertCoin: () => void;
}

export const AttractMode: React.FC<AttractModeProps> = ({ onInsertCoin }) => {
  const sequence = useRef<Panel[]>(buildSequence());
  const [panelIndex, setPanelIndex] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const panel = sequence.current[panelIndex];

  // Held in a ref, not a effect dependency: onInsertCoin calls setScreen,
  // which (via the audio-unlock listener also firing on this same keydown)
  // can trigger a re-render before this event finishes dispatching. An
  // effect keyed on the callback's identity would tear down and rebuild the
  // listener mid-dispatch and miss the very event that triggered it —
  // keydown would silently stop inserting the coin while pointerdown, timed
  // differently, kept working. Registering once on mount sidesteps that.
  const onInsertCoinRef = useRef(onInsertCoin);
  onInsertCoinRef.current = onInsertCoin;

  // Any input is the coin slot. No per-key mapping: on a cabinet every coin
  // fits, and this removes the ambiguity of a button meaning two things.
  useEffect(() => {
    // preventDefault on pointerdown suppresses the compatibility mouse events
    // that would follow, including click. Without it the same tap that inserts
    // the coin can land on a button of the screen that just replaced this one.
    const insert = (event: Event) => {
      event.preventDefault();
      onInsertCoinRef.current();
    };
    window.addEventListener('keydown', insert);
    window.addEventListener('pointerdown', insert);
    return () => {
      window.removeEventListener('keydown', insert);
      window.removeEventListener('pointerdown', insert);
    };
  }, []);

  // Panel timing and stage parallax share one animation frame. requestAnimationFrame
  // stops in background tabs on its own, so the loop pauses without extra wiring.
  useEffect(() => {
    let frameId = 0;
    let last = performance.now();
    let elapsed = 0;
    let cameraX = 0;

    const tick = (now: number) => {
      const delta = Math.min(now - last, MAX_FRAME_MS);
      last = now;
      elapsed += delta;
      cameraX += (delta / 1000) * STAGE_SCROLL_SPEED;

      const current = sequence.current[panelIndex];
      if (current && elapsed >= current.durationMs) {
        elapsed = 0;
        setPanelIndex((prev) => (prev + 1) % sequence.current.length);
      }

      const canvas = canvasRef.current;
      if (canvas && current?.kind === 'STAGE') {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          renderStageBackground(
            ctx,
            STAGES[current.stageIndex].bgType,
            cameraX,
            canvas.width,
            canvas.height
          );
        }
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [panelIndex]);

  const character = panel?.kind === 'CHARACTER' ? CHARACTERS[panel.charId] : null;
  const stage = panel?.kind === 'STAGE' ? STAGES[panel.stageIndex] : null;

  return (
    <div className="relative w-full h-full bg-[#0a0a0a] overflow-hidden flex items-center justify-center">
      {panel?.kind === 'TITLE' && (
        <div className="text-center px-6">
          <h1 className="text-4xl md:text-7xl font-black italic tracking-tighter uppercase leading-none text-white drop-shadow-[0_0_25px_rgba(255,0,255,0.5)]">
            THE SAFE-WORD SYNDICATE<span className="text-[#ff00ff]">.</span>
          </h1>
          <p className="mt-4 text-sm md:text-lg font-mono uppercase tracking-widest text-[#00ffff]">
            VS ULTRA EVIL LEAGUE OF CONSERVATIVE CHRISTIANS
          </p>
        </div>
      )}

      {character && (
        <div className="absolute inset-0 flex items-center justify-center">
          {character.portraitUrl && (
            <img
              src={character.portraitUrl}
              alt={character.name}
              className="max-h-full max-w-full object-contain"
            />
          )}
          <div className="absolute bottom-16 left-0 right-0 text-center px-6">
            <div className="inline-block bg-black/80 border-2 border-[#ff00ff] px-5 py-2">
              <div className="text-2xl md:text-4xl font-black italic uppercase text-white">
                {character.name}
              </div>
              <div className="text-xs md:text-sm font-mono uppercase tracking-widest text-[#00ffff]">
                {character.title} · {character.archetype}
              </div>
              <div className="mt-1 text-[10px] md:text-xs font-mono uppercase tracking-wider text-[#ffff00]">
                ★ {character.powerMoveName}
              </div>
            </div>
          </div>
        </div>
      )}

      {stage && (
        <div className="absolute inset-0">
          <canvas ref={canvasRef} width={800} height={450} className="w-full h-full object-cover" />
          <div className="absolute bottom-16 left-0 right-0 text-center px-6">
            <div className="inline-block bg-black/80 border-2 border-[#00ffff] px-5 py-2">
              <div className="text-lg md:text-3xl font-black italic uppercase text-white">
                {stage.name}
              </div>
              <div className="text-[10px] md:text-sm font-mono uppercase tracking-wider text-[#00ffff]">
                {stage.subtitle}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Always on top of whatever panel is showing, never part of it. */}
      <div className="absolute bottom-5 left-0 right-0 text-center pointer-events-none">
        <span className="text-xl md:text-2xl font-black text-[#ffff00] animate-pulse tracking-widest">
          INSERT COIN
        </span>
      </div>
    </div>
  );
};
