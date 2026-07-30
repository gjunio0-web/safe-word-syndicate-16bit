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
    // landscape:justify-start pairs with overflow-y-auto (the safety net -
    // present regardless, matching the title screen) so a device where the
    // landscape sizing below still doesn't quite fit falls back to a scroll
    // instead of hiding content, rather than justify-between spreading
    // things across a height that isn't really there.
    <div className="relative w-full h-full min-h-screen bg-[#0a0a0a] text-white flex flex-col justify-between landscape:justify-start p-2 landscape:p-1.5 select-none font-sans overflow-y-auto border-2 border-[#ff00ff]/10">
      {/* Top Header — identical to desktop's, minus the mode selector: mobile
          has nothing to choose there, it is always SOLO. */}
      <header className="shrink-0 flex flex-col justify-between items-center px-3 landscape:px-2 py-2.5 landscape:py-1 bg-[#1a1a1a] border-b-4 landscape:border-b-2 border-[#ff00ff] gap-2 landscape:gap-0">
        <div className="text-center">
          <span className="text-[#00ffff] font-mono text-[10px] landscape:text-[8px] tracking-tighter uppercase">
            SYSTEM STATUS: RADICAL REBEL SELECT
          </span>
          <h1 className="text-xl landscape:text-sm font-black italic uppercase tracking-tighter leading-none mt-0.5 landscape:mt-0">
            SELECT YOUR FIGHTER<span className="text-[#ff00ff]">.</span>
          </h1>
        </div>
      </header>

      {/* Roster position, above the dossier it now doubles for.
        * The visual pill stays a thin 6px dot, but the button around it
        * carries real padding so the tap target isn't the same 6x6px box —
        * a hit area that small on a phone means missing the dot more often
        * than hitting it. */}
      <div className="shrink-0 flex justify-center gap-0.5 mt-3 landscape:mt-1">
        {roster.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setIndex(i)}
            className="p-2.5 landscape:p-1.5 flex items-center justify-center"
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

      {/* Fighter Dossier.
        *
        * landscape:flex-row on the body below turns the stacked portrait /
        * badge / name / stats / quote / special-move column into two side
        * by side — portrait+identity on the left, everything else on the
        * right — trading the vertical space landscape doesn't have for the
        * horizontal space it does, the same move as the title screen.
        */}
      <div
        id="selected-fighter-banner"
        className="shrink-0 mt-3 landscape:mt-1 bg-[#0d0718] border-3 border-[#ff00ff] rounded-xl shadow-[0_0_30px_rgba(255,0,255,0.5)] p-4 landscape:p-2 relative overflow-hidden flex flex-col gap-4 landscape:gap-2"
      >
        {/* Top Arcade Marquee Header Bar */}
        <div className="flex justify-between items-center bg-[#240038] border-b-2 border-[#ff00ff] -mx-4 landscape:-mx-2 -mt-4 landscape:-mt-2 p-2.5 landscape:p-1 px-4 landscape:px-2 mb-1 landscape:mb-0">
          <div className="flex items-center gap-2 landscape:gap-1">
            <span className="w-2.5 h-2.5 landscape:w-2 landscape:h-2 rounded-full bg-[#00ffff] animate-pulse" />
            <span className="text-xs landscape:text-[9px] font-mono font-black text-[#00ffff] tracking-widest uppercase flex items-center gap-1.5 landscape:gap-1">
              <Crosshair className="w-3.5 h-3.5 landscape:w-3 landscape:h-3 text-[#ff00ff]" /> DOSSIER
            </span>
          </div>
          <span className="text-[10px] landscape:text-[8px] font-mono font-black text-black bg-[#ff00ff] px-2.5 landscape:px-1.5 py-1 landscape:py-0.5 rounded italic uppercase shadow">
            READY FOR BRAWL
          </span>
        </div>

        <div className="flex flex-col landscape:flex-row items-center gap-3 landscape:gap-4 w-full">
          {/* Left column in landscape: portrait, identity badge, name. */}
          <div className="flex flex-col items-center gap-3 landscape:gap-1.5 landscape:shrink-0 landscape:w-32">
            {/* Portrait, with tap zones on either side to browse the roster —
                this is the one genuinely new interaction; everything it
                contains is the existing portrait treatment. */}
            <div className="relative flex items-center justify-center w-full py-1 landscape:py-0">
              <button
                onClick={() => go(-1)}
                className="absolute left-0 z-20 p-2 landscape:p-1 text-zinc-500 active:text-white"
                aria-label="Previous fighter"
              >
                <ChevronLeft className="w-7 h-7 landscape:w-5 landscape:h-5" />
              </button>
              <button
                onClick={() => go(1)}
                className="absolute right-0 z-20 p-2 landscape:p-1 text-zinc-500 active:text-white"
                aria-label="Next fighter"
              >
                <ChevronRight className="w-7 h-7 landscape:w-5 landscape:h-5" />
              </button>

              <div className="w-32 h-32 landscape:w-20 landscape:h-20 rounded-full border-4 landscape:border-2 border-[#00ffff] p-1.5 landscape:p-1 bg-black shadow-[0_0_25px_rgba(0,255,255,0.6)] overflow-hidden relative">
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
            <span className="bg-[#ff00ff] text-black text-xs landscape:text-[9px] font-black px-3 landscape:px-2 py-1 landscape:py-0.5 rounded-full border border-white font-mono shadow-md uppercase tracking-wider -mt-1 landscape:mt-0 whitespace-nowrap">
              1P CHAMPION
            </span>

            <div className="text-center">
              <h2 className={`text-3xl landscape:text-lg font-black italic uppercase tracking-tight ${theme.text}`}>{char.name}</h2>
              <p className="text-sm landscape:text-[10px] text-amber-400 font-mono font-bold italic mt-0.5 landscape:mt-0">{char.archetype}</p>
            </div>
          </div>

          {/* Right column in landscape: stats, quote, special move. */}
          <div className="flex flex-col gap-3 landscape:gap-1.5 w-full landscape:flex-1 landscape:min-w-0">
            {/* Stat Progress Bars — same bars, same math, as desktop */}
            <div className="bg-[#120a21] border border-[#ff00ff]/50 p-3 landscape:p-1.5 rounded-lg space-y-2 landscape:space-y-1 w-full shadow-inner">
              <div className="flex justify-between items-center text-xs landscape:text-[10px] font-mono text-zinc-300">
                <span className="font-bold text-[#ff00ff]">POWER</span>
                <div className="w-28 landscape:w-24 h-2 landscape:h-1.5 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
                  <div className="h-full bg-[#ff00ff]" style={{ width: `${(char.stats.power / 5) * 100}%` }} />
                </div>
              </div>
              <div className="flex justify-between items-center text-xs landscape:text-[10px] font-mono text-zinc-300">
                <span className="font-bold text-[#00ffff]">DEFENSE</span>
                <div className="w-28 landscape:w-24 h-2 landscape:h-1.5 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
                  <div className="h-full bg-[#00ffff]" style={{ width: `${(char.stats.defense / 5) * 100}%` }} />
                </div>
              </div>
              <div className="flex justify-between items-center text-xs landscape:text-[10px] font-mono text-zinc-300">
                <span className="font-bold text-[#ffff00]">SPEED</span>
                <div className="w-28 landscape:w-24 h-2 landscape:h-1.5 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
                  <div className="h-full bg-[#ffff00]" style={{ width: `${(char.stats.speed / 5) * 100}%` }} />
                </div>
              </div>
            </div>

            {/* Character Quote Box */}
            <p className="text-xs landscape:text-[10px] text-zinc-200 font-mono italic bg-[#170c2a] p-3 landscape:p-1.5 border border-[#3b1e5d] rounded-md text-left leading-relaxed landscape:leading-snug w-full">
              "{char.quote}"
            </p>

            {/* Special Move Banner */}
            <div className="bg-[#18092a] p-3 landscape:p-1.5 border-l-4 landscape:border-l-2 border-[#00ffff] rounded-r-md text-left w-full">
              <span className="text-[10px] landscape:text-[8px] text-[#00ffff] font-mono font-bold uppercase block tracking-wider">SPECIAL OVERDRIVE ATTACK</span>
              <span className="font-black text-sm landscape:text-xs text-white uppercase font-mono block">{char.powerMoveName}</span>
              <p className="text-xs landscape:text-[10px] text-zinc-300 font-mono leading-normal landscape:leading-snug mt-1 landscape:mt-0.5">{char.powerMoveDesc}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Footer — same buttons/classes as desktop's */}
      <footer className="shrink-0 mt-3 landscape:mt-1 bg-black p-4 landscape:p-1.5 border-t-4 landscape:border-t-2 border-[#00ffff] flex flex-col landscape:flex-row gap-3 landscape:gap-1.5">
        <button
          onClick={handleStart}
          className="w-full px-8 py-3 landscape:py-1.5 bg-[#ff00ff] hover:bg-[#d400d4] text-black font-black text-sm landscape:text-xs uppercase italic tracking-wider flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(255,0,255,0.4)] active:scale-95 transition-all cursor-pointer"
        >
          START BRAWL <Play className="w-4 h-4 landscape:w-3.5 landscape:h-3.5 fill-current" />
        </button>
        <button
          onClick={onBack}
          className="w-full px-5 py-2.5 landscape:py-1.5 bg-[#1a1a1a] hover:bg-[#222] border-2 border-[#333] text-zinc-300 font-black text-xs landscape:text-[10px] uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap"
        >
          ◄ BACK TO TITLE
        </button>
      </footer>
    </div>
  );
};
