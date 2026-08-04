import React, { useState, useEffect } from 'react';
import { DialogueLine } from '../types';
import { sound } from '../game/sound';
import { portraitFor } from '../game/portraits';
import { useGamepadMenu } from '../hooks/useGamepadMenu';
import { useIsMobileDevice } from '../hooks/useDeviceType';
import { ArrowRight, MessageSquareQuote } from 'lucide-react';

interface DialogueOverlayProps {
  dialogue: DialogueLine[];
  onComplete: () => void;
}

export const DialogueOverlay: React.FC<DialogueOverlayProps> = ({ dialogue, onComplete }) => {
  const [index, setIndex] = useState(0);

  const line = dialogue[index];

  const handleNext = () => {
    sound.playPunch();
    if (index < dialogue.length - 1) {
      setIndex(index + 1);
    } else {
      onComplete();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 'space' never matched here: that is an `e.code` value, not `e.key`.
      const isAdvanceKey = e.code === 'Space' || ['enter', ' ', 'j', 'k', 'z', 'x'].includes(e.key.toLowerCase());

      if (isAdvanceKey) {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [index, dialogue]);

  // Gameplay's own gamepad handling only reads START (it toggles pause) while
  // this overlay is up, so a controller had no way to advance the dialogue —
  // the face buttons still went straight to the engine as combat input, which
  // update() ignores while a dialogue is active. CONFIRM only: START stays
  // reserved for pause, so a player can still back out mid-cutscene.
  useGamepadMenu((action) => {
    if (action === 'CONFIRM') handleNext();
  });

  /* Above the early return, and it has to stay above it.
   *
   * This sat after `if (!line) return null`, so it was only reached on renders
   * where a line existed. React tracks hooks by call order: if the count
   * changes between two renders of the same mounted instance it cannot match
   * old state to new, and it tears the tree down.
   *
   * Unreachable today, one data edit away. Four things currently stand between
   * this and a crash, and all four were checked rather than assumed:
   *   1. the overlay only mounts when activeDialogue is non-null (App.tsx:656);
   *   2. `index` never runs past the last entry — handleNext calls onComplete
   *      instead, which clears activeDialogue and unmounts the component, so
   *      the state dies with it;
   *   3. `dialogue` cannot change while mounted, because the engine is frozen
   *      for the duration of a dialogue, so no wave can queue another beneath;
   *   4. none of the seven dialogueBefore arrays in stageData is empty — and
   *      `[]` is truthy, so an empty one would pass the guard and mount this
   *      with `line` undefined.
   * Remove any one of those and the latent bug becomes an active one. Saying
   * so plainly is stronger than implying a crash that does not happen,
   * because it is checkable.
   *
   * The reasoning behind the hook itself was right and is unchanged: the
   * keyboard hint below asks whether the player has a keyboard, which is a
   * device question rather than a viewport one. Only the placement was wrong.
   *
   * Caught by the lint rule added alongside this, and by nothing else. The
   * type checker passes on the broken version and so does the whole suite —
   * verified by putting the bug back and running all three. */
  const isMobile = useIsMobileDevice();

  if (!line) return null;

  // Undefined for every villain until their art exists, which is the whole
  // point of looking it up instead of assuming it.
  const face = portraitFor(line.portrait);

  return (
    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent z-40 flex flex-col justify-end p-6 select-none">
      {/* Cutscene Dialog Container */}
      <div className="bg-[#111] border-4 border-[#ff00ff] p-6 shadow-[0_0_30px_rgba(255,0,255,0.4)] max-w-2xl mx-auto w-full relative">
        <div className="flex items-start gap-4">
          {face && (
            <img
              src={face}
              alt=""
              aria-hidden="true"
              className="w-16 h-16 sm:w-24 sm:h-24 shrink-0 object-cover border-2 border-[#00ffff] bg-black"
              style={{ imageRendering: 'pixelated' }}
            />
          )}

          <div className="min-w-0 flex-1">
            {/* Speaker Name Tag */}
            <div className="inline-block bg-[#00ffff] text-black px-3 py-1 font-black text-xs uppercase tracking-wider mb-3">
              {line.speaker}
            </div>

            {/* Text Speech Bubble */}
            <p className="text-white font-mono text-sm md:text-base leading-relaxed flex items-start gap-2">
              <MessageSquareQuote className="w-5 h-5 text-[#ff00ff] shrink-0 mt-0.5" />
              <span>"{line.text}"</span>
            </p>
          </div>
        </div>

        {/* Continue Button & Keyboard Hint */}
        <div className="mt-5 flex flex-wrap justify-between items-center gap-2 text-xs text-gray-400 font-mono pt-3 border-t border-[#333]">
          <span className="text-[#00ffff]">
            DIALOGUE {index + 1} / {dialogue.length}
            {/* Gated on device, not on width. `hidden sm:inline` meant this
              * appeared on any viewport past 640px — which includes every
              * phone held sideways, the orientation the game asks for. Touch
              * players were being told to press keys they do not have, next
              * to a NEXT button that is the actual way through. */}
            {!isMobile && (
              <span className="ml-3 text-[#ffff00] hidden sm:inline font-bold">[PRESS ENTER / SPACE / J]</span>
            )}
          </span>
          <button
            onClick={handleNext}
            className="px-5 py-2.5 bg-[#ffff00] hover:bg-[#e6e600] text-black font-black flex items-center gap-1.5 shadow-md active:scale-95 transition-all uppercase tracking-wider text-xs cursor-pointer"
          >
            {index < dialogue.length - 1 ? 'NEXT' : 'FIGHT!'} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
