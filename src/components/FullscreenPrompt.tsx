import React from 'react';
import { currentPlatformHasRingerSwitch } from '../game/ringerSwitch';

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
  /* Second line, iOS only. The hardware silent switch mutes Web Audio and
   * <audio> alike with no reliable way around it, so a player with the switch
   * flipped gets ten scored tracks, a jukebox screen and a game about noise
   * versus silence, in silence, with nothing on screen suggesting why. The
   * header's own mute toggle still reads as on, which makes it worse.
   *
   * Phrased as something to check, not as a diagnosis, because the state is
   * genuinely unreadable: with the switch on, the audio element still reports
   * itself as playing. It advances and fires events; it just makes no sound.
   * See ringerSwitch.ts.
   *
   * Note this line is early, not timely. Audio does not unlock until the
   * gesture that inserts the coin, so at this moment nobody has sound on any
   * platform — the sentence lands before it can mean anything, and is gone by
   * the time silence becomes a symptom. It stays because this is the most-read
   * screen in the game and planting the idea costs nothing; the copy that
   * actually has to reach someone already playing lives in the pause menu,
   * which is where a person goes when something seems wrong. */
  const ringerSwitch = currentPlatformHasRingerSwitch();

  return (
    <div
      className={`absolute left-0 right-0 text-center px-6 pointer-events-none ${
        position === 'middle' ? 'bottom-44' : 'top-3 md:top-4'
      }`}
    >
      <span className="text-[10px] md:text-xs font-mono uppercase tracking-wider text-zinc-500">
        (Fullscreen turns on automatically, if your browser supports it)
      </span>
      {ringerSwitch && (
        <span className="block mt-1 text-[10px] md:text-xs font-mono uppercase tracking-wider text-zinc-500">
          (No sound? Check the silent switch — this one is meant to be loud)
        </span>
      )}
    </div>
  );
};
