import React, { useState, useEffect } from 'react';
import { RotateCcw, Coins } from 'lucide-react';
import { sound } from '../game/sound';

interface GameOverModalProps {
  onRetry: () => void;
  onQuit: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({ onRetry, onQuit }) => {
  const [countdown, setCountdown] = useState(9);

  useEffect(() => {
    sound.playBossAlarm();
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onQuit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [onQuit]);

  const handleContinue = () => {
    sound.playStageClear();
    onRetry();
  };

  return (
    <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6 text-white font-mono select-none">
      <div className="bg-[#111] border-4 border-[#ff4e00] p-8 max-w-sm w-full text-center space-y-6 shadow-[0_0_30px_rgba(255,78,0,0.4)]">
        <h2 className="text-4xl font-black italic text-[#ff4e00] tracking-tighter uppercase">
          GAME OVER<span className="text-[#ff00ff]">.</span>
        </h2>

        <div className="bg-[#0a0a0a] p-4 border border-[#333]">
          <p className="text-xs text-gray-400 uppercase tracking-widest">CONTINUE?</p>
          <div className="text-6xl font-black text-[#ffff00] my-2 animate-pulse drop-shadow-[0_0_15px_rgba(255,255,0,0.5)]">
            0{countdown}
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleContinue}
            className="w-full py-3.5 bg-[#ff00ff] hover:bg-[#d400d4] text-black font-black text-sm italic uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,0,255,0.4)] active:scale-95 transition-all"
          >
            <Coins className="w-5 h-5" /> INSERT COIN / CONTINUE
          </button>

          <button
            onClick={onQuit}
            className="w-full py-2.5 bg-[#1a1a1a] hover:bg-[#222] border-2 border-[#333] hover:border-gray-500 text-gray-300 font-bold text-xs flex items-center justify-center gap-1.5 uppercase tracking-wider transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> QUIT TO MAIN MENU
          </button>
        </div>
      </div>
    </div>
  );
};
