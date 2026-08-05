import React, { useEffect, useRef } from 'react';
import { COPYRIGHT_NOTICE, STUDIO_NAME, STUDIO_SUFFIX } from '../game/credits';

/**
 * The boot ROM. Whose machine this is, before it is anybody's game.
 *
 * Two rules keep a splash from being a tax on every session:
 *
 * 1. It is short. BOOT_MS is under a second and a half — long enough to read
 *    a name, too short to be waited on.
 * 2. It is skippable by the same gesture that does everything else on the
 *    attract screen behind it. Nobody has to learn which key.
 *
 * No audio here on purpose. Nothing has unlocked the AudioContext yet — the
 * coin does that on the attract screen — so a splash with a sting would play
 * silent on first load and loud on a reload, which is worse than silence.
 */

const BOOT_MS = 1400;

interface BootSplashProps {
  onComplete: () => void;
}

export const BootSplash: React.FC<BootSplashProps> = ({ onComplete }) => {
  // Held in a ref for the same reason AttractMode holds its coin callback in
  // one: onComplete calls setScreen, and a re-render mid-dispatch would tear
  // down the listener that is still delivering the event that triggered it.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    let done = false;
    const finish = (event?: Event) => {
      if (done) return;
      done = true;
      // Suppresses the compatibility mouse events that would otherwise follow
      // this tap onto the screen that replaces this one.
      event?.preventDefault();
      onCompleteRef.current();
    };

    const timerId = window.setTimeout(finish, BOOT_MS);
    window.addEventListener('keydown', finish);
    window.addEventListener('pointerdown', finish);
    return () => {
      window.clearTimeout(timerId);
      window.removeEventListener('keydown', finish);
      window.removeEventListener('pointerdown', finish);
    };
  }, []);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center select-none">
      <div className="text-center px-6">
        <div className="mx-auto mb-4 landscape:mb-3 w-20 h-20 landscape:w-14 landscape:h-14 border-4 border-[#00ffff] flex items-center justify-center shadow-[0_0_30px_rgba(0,255,255,0.5)]">
          <span className="text-3xl landscape:text-xl font-black italic text-[#00ffff]">AO</span>
        </div>
        <h1 className="text-3xl md:text-5xl landscape:text-2xl font-black italic tracking-tighter uppercase text-white">
          {STUDIO_NAME}
        </h1>
        <p className="mt-2 text-xs md:text-sm landscape:text-[10px] font-mono uppercase tracking-[0.4em] text-gray-400">
          {STUDIO_SUFFIX}
        </p>
      </div>

      <p className="absolute bottom-4 left-0 right-0 text-center text-[10px] font-mono uppercase tracking-widest text-gray-600">
        {COPYRIGHT_NOTICE}
      </p>
    </div>
  );
};
