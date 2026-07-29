import React from 'react';
import { StageStats } from '../types';
import { Trophy, ArrowRight, Zap, Target, ShieldAlert } from 'lucide-react';
import { sound } from '../game/sound';

interface StageClearScreenProps {
  stageName: string;
  stats: StageStats;
  onNextStage: () => void;
}

export const StageClearScreen: React.FC<StageClearScreenProps> = ({
  stageName,
  stats,
  onNextStage,
}) => {
  const handleNext = () => {
    sound.playStageClear();
    onNextStage();
  };

  const getRank = () => {
    if (stats.score > 15000 && stats.damageTaken < 100) return 'S+ PUNK LEGEND';
    if (stats.score > 10000) return 'A REBEL MASTER';
    if (stats.score > 5000) return 'B BRAWLER';
    return 'C ROOKIE';
  };

  return (
    <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-40 flex items-center justify-center p-6 text-white font-sans select-none" data-gamepad-scope>
      <div className="bg-[#111] border-4 border-[#00ffff] p-6 max-w-md w-full shadow-[0_0_30px_rgba(0,255,255,0.4)] text-center space-y-6">
        {/* Title Header */}
        <div>
          <div className="inline-flex p-3 bg-[#00ffff]/10 text-[#00ffff] border border-[#00ffff]/30 mb-2">
            <Trophy className="w-8 h-8" />
          </div>
          <h2 className="text-3xl font-black italic uppercase text-[#00ffff] tracking-tighter">
            STAGE CLEARED<span className="text-[#ff00ff]">!</span>
          </h2>
          <p className="text-xs text-gray-400 font-mono mt-1 uppercase tracking-widest">{stageName}</p>
        </div>

        {/* Rank Evaluation */}
        <div className="bg-[#0a0a0a] p-3 border border-[#333]">
          <span className="text-[10px] text-gray-500 font-mono uppercase block">RANK EVALUATION</span>
          <span className="text-2xl font-black italic text-[#ffff00] tracking-widest uppercase">
            {getRank()}
          </span>
        </div>

        {/* Score Breakdown */}
        <div className="space-y-2 text-xs font-mono text-zinc-300">
          <div className="flex justify-between p-2.5 bg-[#0a0a0a] border border-[#333]">
            <span className="flex items-center gap-1.5 text-gray-400">
              <Zap className="w-3.5 h-3.5 text-[#ffff00]" /> TOTAL SCORE
            </span>
            <span className="font-black text-[#ffff00]">{stats.score.toLocaleString()} PTS</span>
          </div>

          <div className="flex justify-between p-2.5 bg-[#0a0a0a] border border-[#333]">
            <span className="flex items-center gap-1.5 text-gray-400">
              <Target className="w-3.5 h-3.5 text-[#ff00ff]" /> MAX COMBO
            </span>
            <span className="font-bold text-white">{stats.maxCombo} HITS</span>
          </div>

          <div className="flex justify-between p-2.5 bg-[#0a0a0a] border border-[#333]">
            <span className="flex items-center gap-1.5 text-gray-400">
              <ShieldAlert className="w-3.5 h-3.5 text-[#00ffff]" /> ENEMIES DEFEATED
            </span>
            <span className="font-bold text-white">{stats.enemiesDefeated} KO</span>
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="space-y-2">
          <button
            onClick={handleNext}
            className="w-full py-3.5 bg-[#ff00ff] hover:bg-[#d400d4] text-black font-black text-sm italic uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(255,0,255,0.4)] active:scale-95 transition-all"
          >
            NEXT STAGE <ArrowRight className="w-4 h-4" />
          </button>

        </div>
      </div>
    </div>
  );
};
