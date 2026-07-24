import React from 'react';
import { GameSettings } from '../types';
import { Volume2, VolumeX, Tv, BookOpen, Pause, Play, Disc, Home, RotateCcw } from 'lucide-react';
import { sound } from '../game/sound';

interface GameHeaderProps {
  settings: GameSettings;
  onUpdateSettings: (newSettings: Partial<GameSettings>) => void;
  isPaused: boolean;
  onTogglePause: () => void;
  onOpenCodex: () => void;
  onOpenAudioModal?: () => void;
  onReturnToTitle: () => void;
  onRestartStage?: () => void;
  stageName: string;
}

export const GameHeader: React.FC<GameHeaderProps> = ({
  settings,
  onUpdateSettings,
  isPaused,
  onTogglePause,
  onOpenCodex,
  onOpenAudioModal,
  onReturnToTitle,
  onRestartStage,
  stageName,
}) => {
  const toggleSound = () => {
    const nextSound = !settings.soundEnabled;
    onUpdateSettings({ soundEnabled: nextSound, musicEnabled: nextSound });
    sound.setEnabled(nextSound, nextSound);
    if (nextSound) {
      sound.playPunch();
    }
  };

  const toggleCrt = () => {
    onUpdateSettings({ crtFilter: !settings.crtFilter });
  };

  return (
    <>
      <div className="w-full bg-[#1a1a1a] border-b-4 border-[#ff00ff] px-4 py-2.5 flex justify-between items-center text-white font-mono select-none z-30">
        {/* Stage Info */}
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-[#00ffff] animate-pulse" />
          <span className="text-xs font-black text-[#00ffff] uppercase tracking-tighter">
            STAGE STATUS: <span className="text-[#ffff00]">{stageName}</span>
          </span>
        </div>

        {/* Control Buttons */}
        <div className="flex items-center gap-2">
          {/* Reset / Home Button */}
          <button
            onClick={() => {
              sound.stopAll();
              onReturnToTitle();
            }}
            className="p-2 bg-red-950/80 hover:bg-red-900 border-2 border-red-600 hover:border-red-400 text-red-200 transition-colors flex items-center gap-1.5 text-xs font-black shadow-md"
            title="Reset Game & Return to Title Screen"
          >
            <Home className="w-4 h-4 text-red-400" />
            <span className="hidden md:inline">RESET</span>
          </button>

          {/* Jukebox / Custom Music Button */}
          {onOpenAudioModal && (
            <button
              onClick={onOpenAudioModal}
              className="p-2 bg-[#111] hover:bg-[#222] border-2 border-[#333] hover:border-[#ff00ff] text-[#ff00ff] transition-colors flex items-center gap-1.5 text-xs font-black"
              title="Open Jukebox / Custom Audio Tracks"
            >
              <Disc className="w-4 h-4 animate-spin-slow text-[#ff00ff]" />
              <span className="hidden sm:inline">MUSIC</span>
            </button>
          )}

          {/* Pause Button */}
          <button
            onClick={onTogglePause}
            className="p-2 bg-[#111] hover:bg-[#222] border-2 border-[#333] hover:border-[#ffff00] text-zinc-300 transition-colors"
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? <Play className="w-4 h-4 text-[#ffff00]" /> : <Pause className="w-4 h-4" />}
          </button>

          {/* Mute Toggle */}
          <button
            onClick={toggleSound}
            className="p-2 bg-[#111] hover:bg-[#222] border-2 border-[#333] hover:border-[#00ffff] text-zinc-300 transition-colors"
            title="Toggle Sound"
          >
            {settings.soundEnabled ? (
              <Volume2 className="w-4 h-4 text-[#00ffff]" />
            ) : (
              <VolumeX className="w-4 h-4 text-[#ff00ff]" />
            )}
          </button>

          {/* CRT Scanlines Toggle */}
          <button
            onClick={toggleCrt}
            className={`p-2 border-2 transition-colors ${
              settings.crtFilter
                ? 'bg-[#ff00ff]/20 border-[#ff00ff] text-[#ff00ff]'
                : 'bg-[#111] border-[#333] text-zinc-500'
            }`}
            title="Toggle CRT Filter"
          >
            <Tv className="w-4 h-4" />
          </button>

          {/* Codex Button */}
          <button
            onClick={onOpenCodex}
            className="p-2 bg-[#111] hover:bg-[#222] border-2 border-[#333] hover:border-[#ffff00] text-[#ffff00] transition-colors"
            title="Open Lore Codex"
          >
            <BookOpen className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pause Menu Modal Overlay */}
      {isPaused && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-6 text-white font-mono select-none">
          <div className="bg-[#111] border-4 border-[#ffff00] p-6 max-w-sm w-full text-center space-y-5 shadow-[0_0_40px_rgba(255,255,0,0.4)]">
            <h2 className="text-3xl font-black italic text-[#ffff00] tracking-tighter uppercase">
              GAME PAUSED
            </h2>
            <p className="text-xs text-zinc-400 font-mono">Select an option to proceed</p>

            <div className="space-y-3 pt-2">
              <button
                onClick={onTogglePause}
                className="w-full py-3 bg-[#ffff00] hover:bg-amber-300 text-black font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
              >
                <Play className="w-4 h-4 fill-black" /> RESUME GAME
              </button>

              {onRestartStage && (
                <button
                  onClick={() => {
                    onTogglePause();
                    onRestartStage();
                  }}
                  className="w-full py-2.5 bg-[#1a1a1a] hover:bg-[#222] border-2 border-[#ff00ff] text-[#ff00ff] font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" /> RESTART STAGE
                </button>
              )}

              <button
                onClick={() => {
                  sound.stopAll();
                  onTogglePause();
                  onReturnToTitle();
                }}
                className="w-full py-2.5 bg-red-950/80 hover:bg-red-900 border-2 border-red-600 text-red-200 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
              >
                <Home className="w-4 h-4 text-red-400" /> MAIN MENU / TITLE SCREEN
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

