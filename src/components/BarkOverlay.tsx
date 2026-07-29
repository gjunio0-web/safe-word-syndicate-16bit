import React from 'react';
import { DialogueLine } from '../types';

interface BarkOverlayProps {
  line: DialogueLine;
}

/**
 * A line shouted over the fight. Deliberately not a smaller DialogueOverlay:
 * no index, no NEXT, no keyboard handler, no gamepad claim. It cannot be
 * advanced or dismissed because it is not waiting for anybody, and
 * `pointer-events-none` keeps it from eating a tap meant for the on-screen
 * controls underneath it.
 *
 * Sits at the top of the field rather than the bottom, where the dialogue box
 * and the mobile pad both live.
 */
export const BarkOverlay: React.FC<BarkOverlayProps> = ({ line }) => (
  <div
    className="absolute top-0 left-0 right-0 z-30 flex justify-center px-3 pt-16 sm:pt-20 pointer-events-none select-none"
    aria-live="polite"
  >
    <div className="bg-black/85 border-2 border-[#00ffff] px-3 py-2 max-w-md shadow-[0_0_18px_rgba(0,255,255,0.35)] animate-[fadeIn_120ms_ease-out]">
      <span className="inline-block bg-[#00ffff] text-black px-2 py-0.5 font-black text-[10px] uppercase tracking-wider mr-2 align-middle">
        {line.speaker}
      </span>
      <span className="text-white font-mono text-xs sm:text-sm leading-snug align-middle">
        "{line.text}"
      </span>
    </div>
  </div>
);
