import React, { useState } from 'react';
import { CharacterId } from '../types';
import { CHARACTERS } from '../game/characterData';
import { ChevronLeft, ChevronRight, Crosshair, Play } from 'lucide-react';
import { sound } from '../game/sound';

const charColors: Record<CharacterId, { text: string }> = {
  FEET_MASTER: { text: 'text-[#00ffff]' },
  FUN_MAKER: { text: 'text-[#ff00ff]' },
  OMEGA_BIKER: { text: 'text-[#ffff00]' },
  ANGRY_CORSO: { text: 'text-[#ff4e00]' },
};

interface CharacterSelectMobileProps {
  onSelect: (p1: CharacterId, p2: undefined, mode: 'SINGLE') => void;
  onBack: () => void;
}

/**
 * Mobile is SOLO-only (see the desktop CharacterSelect's own breakpoint
 * gate), so this reuses every piece of that screen's dossier as-is — the
 * marquee bar, the stat bars, the quote box, the special move banner, the
 * footer buttons — down to the same class strings. The one thing that
 * actually needs to differ for a phone is how the roster is browsed: the
 * desktop's grid-of-four-cards-below-the-dossier costs a full extra
 * screen's height of scrolling here. A carousel puts browsing and the
 * dossier in the same place — tapping the dossier's own edges changes
 * which fighter is in it, so there is nothing else to scroll to.
 */
export const CharacterSelectMobile: React.FC<CharacterSelectMobileProps> = ({ onSelect, onBack }) => {
  const roster = Object.values(CHARACTERS);
  const [index, setIndex] = useState(0);

  const char = roster[index];
  const theme = charColors[char.id];

  const go = (delta: number) => {
    sound.playSelect();
    setIndex((prev) => (prev + delta + roster.length) % roster.length);
  };

  const handleStart = () => {
    sound.playStageClear();
    onSelect(char.id, undefined, 'SINGLE');
  };

  return (
    <div className="relative w-full h-full min-h-screen bg-[#0a0a0a] text-white flex flex-col justify-between p-2 select-none font-sans overflow-y-auto border-2 border-[#ff00ff]/10">
      {/* Top Header — identical to desktop's, minus the mode selector: mobile
          has nothing to choose there, it is always SOLO. */}
      <header className="shrink-0 flex flex-col justify-between items-center px-3 py-2.5 bg-[#1a1a1a] border-b-4 border-[#ff00ff] gap-2">
        <div className="text-center">
          <span className="text-[#00ffff] font-mono text-[10px] tracking-tighter uppercase">
            SYSTEM STATUS: RADICAL REBEL SELECT
          </span>
          <h1 className="text-xl font-black italic uppercase tracking-tighter leading-none mt-0.5">
            SELECT YOUR FIGHTER<span className="text-[#ff00ff]">.</span>
          </h1>
        </div>
      </header>

      {/* Roster position, above the dossier it now doubles for.
        * The visual pill stays a thin 6px dot, but the button around it
        * carries real padding so the tap target isn't the same 6x6px box —
        * a hit area that small on a phone means missing the dot more often
        * than hitting it. */}
      <div className="shrink-0 flex justify-center gap-0.5 mt-3">
        {roster.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setIndex(i)}
            className="p-2.5 flex items-center justify-center"
            aria-label={c.name}
          >
            <span
              className={`h-1.5 rounded-full transition-all block ${
                i === index ? `w-6 ${charColors[c.id].text.replace('text-', 'bg-')}` : 'w-1.5 bg-zinc-700'
              }`}
            />
          </button>
        ))}
      </div>

      {/* Fighter Dossier — identical structure/classes to the desktop
          version's SINGLE-mode body; only the portrait/name/stats/quote/
          special-move content swaps per `char`, and arrows sit over its
          edges to change which fighter that is. */}
      <div
        id="selected-fighter-banner"
        className="shrink-0 mt-3 bg-[#0d0718] border-3 border-[#ff00ff] rounded-xl shadow-[0_0_30px_rgba(255,0,255,0.5)] p-4 relative overflow-hidden flex flex-col gap-4"
      >
        {/* Top Arcade Marquee Header Bar */}
        <div className="flex justify-between items-center bg-[#240038] border-b-2 border-[#ff00ff] -mx-4 -mt-4 p-2.5 px-4 mb-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00ffff] animate-pulse" />
            <span className="text-xs font-mono font-black text-[#00ffff] tracking-widest uppercase flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5 text-[#ff00ff]" /> DOSSIER
            </span>
          </div>
          <span className="text-[10px] font-mono font-black text-black bg-[#ff00ff] px-2.5 py-1 rounded italic uppercase shadow">
            READY FOR BRAWL
          </span>
        </div>

        <div className="flex flex-col items-center gap-3 w-full">
          {/* Portrait, with tap zones on either side to browse the roster —
              this is the one genuinely new interaction; everything it
              contains is the existing portrait treatment. */}
          <div className="relative flex items-center justify-center w-full py-1">
            <button
              onClick={() => go(-1)}
              className="absolute left-0 z-20 p-2 text-zinc-500 active:text-white"
              aria-label="Previous fighter"
            >
              <ChevronLeft className="w-7 h-7" />
            </button>
            <button
              onClick={() => go(1)}
              className="absolute right-0 z-20 p-2 text-zinc-500 active:text-white"
              aria-label="Next fighter"
            >
              <ChevronRight className="w-7 h-7" />
            </button>

            <div className="w-32 h-32 rounded-full border-4 border-[#00ffff] p-1.5 bg-black shadow-[0_0_25px_rgba(0,255,255,0.6)] overflow-hidden relative">
              {char.portraitUrl && (
                <img
                  src={char.portraitUrl}
                  alt={char.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-top rounded-full filter brightness-110"
                />
              )}
            </div>
          </div>
          <span className="bg-[#ff00ff] text-black text-xs font-black px-3 py-1 rounded-full border border-white font-mono shadow-md uppercase tracking-wider -mt-1">
            1P CHAMPION
          </span>

          <div className="text-center">
            <h2 className={`text-3xl font-black italic uppercase tracking-tight ${theme.text}`}>{char.name}</h2>
            <p className="text-sm text-amber-400 font-mono font-bold italic mt-0.5">{char.archetype}</p>
          </div>

          {/* Stat Progress Bars — same bars, same math, as desktop */}
          <div className="bg-[#120a21] border border-[#ff00ff]/50 p-3 rounded-lg space-y-2 w-full shadow-inner">
            <div className="flex justify-between items-center text-xs font-mono text-zinc-300">
              <span className="font-bold text-[#ff00ff]">POWER</span>
              <div className="w-28 h-2 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
                <div className="h-full bg-[#ff00ff]" style={{ width: `${(char.stats.power / 5) * 100}%` }} />
              </div>
            </div>
            <div className="flex justify-between items-center text-xs font-mono text-zinc-300">
              <span className="font-bold text-[#00ffff]">DEFENSE</span>
              <div className="w-28 h-2 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
                <div className="h-full bg-[#00ffff]" style={{ width: `${(char.stats.defense / 5) * 100}%` }} />
              </div>
            </div>
            <div className="flex justify-between items-center text-xs font-mono text-zinc-300">
              <span className="font-bold text-[#ffff00]">SPEED</span>
              <div className="w-28 h-2 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
                <div className="h-full bg-[#ffff00]" style={{ width: `${(char.stats.speed / 5) * 100}%` }} />
              </div>
            </div>
          </div>

          {/* Character Quote Box */}
          <p className="text-xs text-zinc-200 font-mono italic bg-[#170c2a] p-3 border border-[#3b1e5d] rounded-md text-left leading-relaxed w-full">
            "{char.quote}"
          </p>

          {/* Special Move Banner */}
          <div className="bg-[#18092a] p-3 border-l-4 border-[#00ffff] rounded-r-md text-left w-full">
            <span className="text-[10px] text-[#00ffff] font-mono font-bold uppercase block tracking-wider">SPECIAL OVERDRIVE ATTACK</span>
            <span className="font-black text-sm text-white uppercase font-mono block">{char.powerMoveName}</span>
            <p className="text-xs text-zinc-300 font-mono leading-normal mt-1">{char.powerMoveDesc}</p>
          </div>
        </div>
      </div>

      {/* Bottom Action Footer — same buttons/classes as desktop's */}
      <footer className="shrink-0 mt-3 bg-black p-4 border-t-4 border-[#00ffff] flex flex-col gap-3">
        <button
          onClick={handleStart}
          className="w-full px-8 py-3 bg-[#ff00ff] hover:bg-[#d400d4] text-black font-black text-sm uppercase italic tracking-wider flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(255,0,255,0.4)] active:scale-95 transition-all cursor-pointer"
        >
          START BRAWL <Play className="w-4 h-4 fill-current" />
        </button>
        <button
          onClick={onBack}
          className="w-full px-5 py-2.5 bg-[#1a1a1a] hover:bg-[#222] border-2 border-[#333] text-zinc-300 font-black text-xs uppercase tracking-wider transition-colors cursor-pointer"
        >
          ◄ BACK TO TITLE
        </button>
      </footer>
    </div>
  );
};
