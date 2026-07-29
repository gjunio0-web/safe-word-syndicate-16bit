import React from 'react';
import { Gauge } from 'lucide-react';
import { GameSettings } from '../types';
import { sound } from '../game/sound';

type Difficulty = GameSettings['difficulty'];

const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: 'EASY', label: 'EASY' },
  { id: 'NORMAL', label: 'NORMAL' },
  { id: 'PUNK_HARD', label: 'PUNK HARD' },
];

interface DifficultyModalProps {
  difficulty: Difficulty;
  onSelect: (difficulty: Difficulty) => void;
  onClose: () => void;
}

/**
 * Difficulty picker, reached from the title screen.
 *
 * It used to live inside character select — a screen the player passes
 * through once per match — so choosing a fighter and choosing a challenge
 * level were mixed into the same flow. This is a setting, the way other games
 * treat it: a menu of its own, changed rarely, not re-decided every roster
 * screen.
 */
export const DifficultyModal: React.FC<DifficultyModalProps> = ({
  difficulty,
  onSelect,
  onClose,
}) => {
  return (
    <div
      data-gamepad-scope
      className="absolute inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-6"
    >
      <div className="bg-[#141414] border-2 border-[#ffff00] p-6 max-w-sm w-full">
        <div className="flex items-center gap-2 mb-5">
          <Gauge className="w-5 h-5 text-[#ffff00]" />
          <h2 className="text-lg font-black italic text-[#ffff00] uppercase tracking-wider">
            Difficulty
          </h2>
        </div>

        <div className="flex flex-col gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              onClick={() => {
                sound.playPunch();
                onSelect(d.id);
              }}
              className={`px-4 py-3 text-sm font-black uppercase tracking-wider text-left transition-all cursor-pointer border-2 ${
                difficulty === d.id
                  ? d.id === 'EASY'
                    ? 'bg-[#34c759] border-[#34c759] text-black'
                    : d.id === 'PUNK_HARD'
                      ? 'bg-[#ff3b30] border-[#ff3b30] text-black'
                      : 'bg-[#00ffff] border-[#00ffff] text-black'
                  : 'border-[#333] text-zinc-400 hover:text-white hover:border-gray-500'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full mt-5 py-2.5 bg-[#1a1a1a] hover:bg-[#222] border-2 border-[#333] hover:border-gray-500 text-gray-300 font-bold text-xs uppercase tracking-wider transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
};
