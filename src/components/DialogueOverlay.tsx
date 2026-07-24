import React, { useState, useEffect } from 'react';
import { DialogueLine } from '../types';
import { sound } from '../game/sound';
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

  if (!line) return null;

  return (
    <div className="absolute inset-0 bg-black/85 backdrop-blur-md z-40 flex flex-col justify-end p-6 select-none">
      {/* Cutscene Dialog Container */}
      <div className="bg-[#111] border-4 border-[#ff00ff] p-6 shadow-[0_0_30px_rgba(255,0,255,0.4)] max-w-2xl mx-auto w-full relative">
        {/* Speaker Name Tag */}
        <div className="inline-block bg-[#00ffff] text-black px-3 py-1 font-black text-xs uppercase tracking-wider mb-3">
          {line.speaker}
        </div>

        {/* Text Speech Bubble */}
        <p className="text-white font-mono text-sm md:text-base leading-relaxed flex items-start gap-2">
          <MessageSquareQuote className="w-5 h-5 text-[#ff00ff] shrink-0 mt-0.5" />
          <span>"{line.text}"</span>
        </p>

        {/* Continue Button & Keyboard Hint */}
        <div className="mt-5 flex flex-wrap justify-between items-center gap-2 text-xs text-gray-400 font-mono pt-3 border-t border-[#333]">
          <span className="text-[#00ffff]">
            DIALOGUE {index + 1} / {dialogue.length}
            <span className="ml-3 text-[#ffff00] hidden sm:inline font-bold">[PRESS ENTER / SPACE / J]</span>
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
