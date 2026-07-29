import React from 'react';
import { PlayerInput } from '../types';

interface OnScreenControlsProps {
  input: PlayerInput;
  setInput: React.Dispatch<React.SetStateAction<PlayerInput>>;
  powerMeter: number;
}

export const OnScreenControls: React.FC<OnScreenControlsProps> = ({
  input,
  setInput,
  powerMeter,
}) => {
  const handleTouchStart = (key: keyof PlayerInput) => (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    setInput((prev) => ({ ...prev, [key]: true }));
  };

  const handleTouchEnd = (key: keyof PlayerInput) => (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    setInput((prev) => ({ ...prev, [key]: false }));
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-end p-4 select-none z-30">
      {/* The keyboard reference that used to sit here moved to KeyboardHints.
        * It was never a touch control: it tells a keyboard player which keys
        * do what, so gating it behind the touch layer hid it from the only
        * people it was written for.
        */}

      {/* Touch D-Pad and Action Buttons for Mobile / Touch Screen */}
      <div className="flex justify-between items-end w-full pb-2">
        {/* Virtual D-Pad */}
        <div className="pointer-events-auto relative w-36 h-36 bg-zinc-900/80 backdrop-blur-md rounded-full border-2 border-zinc-700 p-2 shadow-2xl flex items-center justify-center">
          {/* Up */}
          <button
            id="btn-dpad-up"
            onTouchStart={handleTouchStart('up')}
            onTouchEnd={handleTouchEnd('up')}
            onMouseDown={handleTouchStart('up')}
            onMouseUp={handleTouchEnd('up')}
            className={`absolute top-1 left-1/2 -translate-x-1/2 w-10 h-10 rounded-t-lg bg-zinc-800 border border-zinc-600 flex items-center justify-center text-white font-bold text-lg active:bg-amber-500 active:scale-95 transition-all ${
              input.up ? 'bg-amber-500 text-black' : ''
            }`}
          >
            ▲
          </button>
          {/* Down */}
          <button
            id="btn-dpad-down"
            onTouchStart={handleTouchStart('down')}
            onTouchEnd={handleTouchEnd('down')}
            onMouseDown={handleTouchStart('down')}
            onMouseUp={handleTouchEnd('down')}
            className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-10 h-10 rounded-b-lg bg-zinc-800 border border-zinc-600 flex items-center justify-center text-white font-bold text-lg active:bg-amber-500 active:scale-95 transition-all ${
              input.down ? 'bg-amber-500 text-black' : ''
            }`}
          >
            ▼
          </button>
          {/* Left */}
          <button
            id="btn-dpad-left"
            onTouchStart={handleTouchStart('left')}
            onTouchEnd={handleTouchEnd('left')}
            onMouseDown={handleTouchStart('left')}
            onMouseUp={handleTouchEnd('left')}
            className={`absolute left-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-l-lg bg-zinc-800 border border-zinc-600 flex items-center justify-center text-white font-bold text-lg active:bg-amber-500 active:scale-95 transition-all ${
              input.left ? 'bg-amber-500 text-black' : ''
            }`}
          >
            ◄
          </button>
          {/* Right */}
          <button
            id="btn-dpad-right"
            onTouchStart={handleTouchStart('right')}
            onTouchEnd={handleTouchEnd('right')}
            onMouseDown={handleTouchStart('right')}
            onMouseUp={handleTouchEnd('right')}
            className={`absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-r-lg bg-zinc-800 border border-zinc-600 flex items-center justify-center text-white font-bold text-lg active:bg-amber-500 active:scale-95 transition-all ${
              input.right ? 'bg-amber-500 text-black' : ''
            }`}
          >
            ►
          </button>
          {/* Center Hub */}
          <div className="w-8 h-8 bg-zinc-950 rounded-full border border-zinc-800" />
        </div>

        {/* Action Buttons */}
        <div className="pointer-events-auto grid grid-cols-2 gap-3">
          {/* Punch (J) */}
          <button
            id="btn-action-punch"
            onTouchStart={handleTouchStart('punch')}
            onTouchEnd={handleTouchEnd('punch')}
            onMouseDown={handleTouchStart('punch')}
            onMouseUp={handleTouchEnd('punch')}
            className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-lg border-2 border-rose-400 flex flex-col items-center justify-center active:scale-90 transition-transform"
          >
            <span>PUNCH</span>
            <span className="text-[10px] text-rose-200">[J]</span>
          </button>

          {/* Kick (K) */}
          <button
            id="btn-action-kick"
            onTouchStart={handleTouchStart('kick')}
            onTouchEnd={handleTouchEnd('kick')}
            onMouseDown={handleTouchStart('kick')}
            onMouseUp={handleTouchEnd('kick')}
            className="w-16 h-16 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow-lg border-2 border-blue-400 flex flex-col items-center justify-center active:scale-90 transition-transform"
          >
            <span>KICK</span>
            <span className="text-[10px] text-blue-200">[K]</span>
          </button>

          {/* Power Move (L) */}
          <button
            id="btn-action-special"
            onTouchStart={handleTouchStart('special')}
            onTouchEnd={handleTouchEnd('special')}
            onMouseDown={handleTouchStart('special')}
            onMouseUp={handleTouchEnd('special')}
            className={`w-16 h-16 rounded-full font-black text-xs shadow-lg border-2 flex flex-col items-center justify-center active:scale-90 transition-all cursor-pointer ${
              powerMeter >= 30
                ? 'bg-amber-500 hover:bg-amber-400 text-black border-amber-300 animate-pulse'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700 opacity-70'
            }`}
          >
            <span>SPECIAL</span>
            <span className="text-[10px]">{powerMeter >= 30 ? '[L/E/F]' : `${Math.floor(powerMeter)}/30`}</span>
          </button>

          {/* Jump (Space) */}
          <button
            id="btn-action-jump"
            onTouchStart={handleTouchStart('jump')}
            onTouchEnd={handleTouchEnd('jump')}
            onMouseDown={handleTouchStart('jump')}
            onMouseUp={handleTouchEnd('jump')}
            className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-lg border-2 border-emerald-400 flex flex-col items-center justify-center active:scale-90 transition-transform"
          >
            <span>JUMP</span>
            <span className="text-[10px] text-emerald-200">[SPACE]</span>
          </button>
        </div>
      </div>
    </div>
  );
};
