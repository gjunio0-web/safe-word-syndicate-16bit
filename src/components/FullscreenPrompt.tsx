import React from 'react';

interface FullscreenPromptProps {
  /**
   * The title panel has real empty space between the logo and "INSERT
   * COIN" — this sits centered in it. The character/stage panels fill
   * that same band with full-bleed art and their own caption box, so
   * there it moves to the top edge instead, clear of both.
   */
  position: 'middle' | 'top';
}

/**
 * Purely informational — no button, no chrome. Reads as arcade flavor text,
 * not as a UI element of its own. The attract screen already treats any
 * keydown/pointerdown as "insert coin"; that same gesture is what will
 * request fullscreen, so this line only sets the expectation before it
 * happens.
 */
export const FullscreenPrompt: React.FC<FullscreenPromptProps> = ({ position }) => {
  return (
    <div
      className={`absolute left-0 right-0 text-center px-6 pointer-events-none ${
        position === 'middle' ? 'bottom-44' : 'top-3 md:top-4'
      }`}
    >
      <span className="text-[10px] md:text-xs font-mono uppercase tracking-wider text-zinc-500">
        (Fullscreen turns on automatically, if your browser supports it)
      </span>
    </div>
  );
};
