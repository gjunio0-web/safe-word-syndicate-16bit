import React from 'react';
import { DialogueLine } from '../types';
import { portraitFor } from '../game/portraits';
import { BARK_TOP_CLEAR_OF_CARDS } from '../game/hudLayout';

interface BarkOverlayProps {
  line: DialogueLine;
  /**
   * Offset from the top of the gameplay container, in CSS pixels. Defaults to
   * the offset that clears the player cards; overridable so a future caller
   * with different HUD above it can say so.
   */
  top?: number;
}

/**
 * A line shouted over the fight. Deliberately not a smaller DialogueOverlay:
 * no index, no NEXT, no keyboard handler, no gamepad claim. It cannot be
 * advanced or dismissed because it is not waiting for anybody, and
 * `pointer-events-none` keeps it from eating a tap meant for the on-screen
 * controls underneath it.
 *
 * Sits at the top of the field rather than the bottom, where the dialogue box
 * and the mobile pad both live — but not at a fixed offset any more. The 64px
 * it used to open at is inside the 80px-tall player cards, so on a narrow
 * screen the balloon covered P1's health bar with a line of dialogue. The
 * offset comes from hudLayout now, which knows where the cards end.
 *
 * It shows the speaker's face when there is one. It did not, which quietly
 * made every bark portrait a bundled asset with no render path — the exact
 * dead-field pattern this codebase keeps growing. Small enough not to crowd
 * the strip, big enough to tell four heroes apart mid-fight.
 */
export const BarkOverlay: React.FC<BarkOverlayProps> = ({ line, top }) => {
  const face = portraitFor(line.portrait);
  return (
  <div
    className="absolute top-0 left-0 right-0 z-30 flex justify-center px-3 pointer-events-none select-none"
    style={{ paddingTop: top ?? BARK_TOP_CLEAR_OF_CARDS }}
    aria-live="polite"
  >
    <div className="bg-black/85 border-2 border-[#00ffff] px-3 py-2 max-w-md shadow-[0_0_18px_rgba(0,255,255,0.35)] animate-[fadeIn_120ms_ease-out] flex items-start gap-2">
      {face && (
        <img
          src={face}
          alt=""
          aria-hidden="true"
          className="w-8 h-8 shrink-0 border border-[#00ffff]/70 bg-black object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
      )}
      <div className="min-w-0">
      <span className="inline-block bg-[#00ffff] text-black px-2 py-0.5 font-black text-[10px] uppercase tracking-wider mr-2 align-middle">
        {line.speaker}
      </span>
      <span className="text-white font-mono text-xs sm:text-sm leading-snug align-middle">
        "{line.text}"
      </span>
      </div>
    </div>
  </div>
  );
};
