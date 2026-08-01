import React, { useState, useEffect } from 'react';
import { RotateCcw, Coins } from 'lucide-react';
import { sound } from '../game/sound';
import { useIsMobileDevice } from '../hooks/useDeviceType';
import { useIsPortrait } from '../hooks/useOrientation';

interface GameOverModalProps {
  onRetry: () => void;
  onQuit: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({ onRetry, onQuit }) => {
  const [countdown, setCountdown] = useState(9);

  /**
   * A phone held sideways has around 360-430px of height, and this card is
   * 386px tall in its stacked form — so on every landscape phone measured it
   * overflowed, and with the overlay centred and unscrollable the excess was
   * clipped off both ends at once: the heading above the top edge, QUIT below
   * the bottom one.
   *
   * The fix trades height for width, which landscape has plenty of: the
   * heading and the countdown take the left column, the two buttons the right.
   * Nothing shrinks — same type sizes, same buttons, same padding.
   *
   * Gated on device AND orientation rather than on Tailwind's `landscape:`
   * variant, which is a pure orientation query and therefore also true of
   * every desktop monitor. Desktop has the height for the stacked card and
   * should keep it.
   */
  const isMobile = useIsMobileDevice();
  const isPortrait = useIsPortrait();
  const sideBySide = isMobile && !isPortrait;

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

  /* Not wrapped in a div for the stacked case, not even a `display: contents`
   * one. The card spaces its children with space-y-6, which is a margin on
   * every direct child after the first; a wrapper is one child no matter how
   * many boxes it generates, so the two 24px gaps became one and the stacked
   * card lost 48px of height on desktop and in portrait. As a fragment the
   * stacked tree is the one that was already there. */
  const heading = (
    <>
      <h2 className="text-4xl font-black italic text-[#ff4e00] tracking-tighter uppercase">
        GAME OVER<span className="text-[#ff00ff]">.</span>
      </h2>

      <div className="bg-[#0a0a0a] p-4 border border-[#333]">
        <p className="text-xs text-gray-400 uppercase tracking-widest">CONTINUE?</p>
        <div className="text-6xl font-black text-[#ffff00] my-2 animate-pulse drop-shadow-[0_0_15px_rgba(255,255,0,0.5)]">
          0{countdown}
        </div>
      </div>
    </>
  );

  return (
    <div
      className={`absolute inset-0 bg-black/90 backdrop-blur-md z-50 flex justify-center overflow-y-auto p-6 text-white font-mono select-none ${
        sideBySide ? 'items-start' : 'items-center'
      }`}
      data-gamepad-scope
    >
      <div
        className={`bg-[#111] border-4 border-[#ff4e00] p-8 w-full shadow-[0_0_30px_rgba(255,78,0,0.4)] ${
          sideBySide
            ? 'max-w-3xl flex flex-row items-center gap-8'
            : 'max-w-sm text-center space-y-6'
        }`}
      >
        {sideBySide ? (
          <div className="flex-1 text-center space-y-6">{heading}</div>
        ) : (
          heading
        )}

        <div className={sideBySide ? 'flex-1 space-y-3' : 'space-y-3'}>
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
