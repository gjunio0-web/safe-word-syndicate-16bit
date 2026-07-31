import React from 'react';
import { Play, Gauge, Disc, BookOpen } from 'lucide-react';
import { TitleScreenProps } from './TitleScreen';

/**
 * The title screen for phones. Portrait keeps the tall stack; landscape —
 * a phone held sideways, roughly 400px of height — trades that stack for
 * the width it does have, putting the logo block beside the actions.
 *
 * Before landscape had a layout of its own, the portrait stack ran well
 * past the viewport and START BRAWL landed entirely off-screen with no way
 * to scroll to it. overflow-y-auto is the standing safety net for that
 * regardless of what else changes; the landscape:flex-row split below is
 * the actual fix.
 *
 * `landscape:` is safe here, even though it is a pure orientation query
 * that any desktop monitor also matches, because this component only ever
 * renders on a mobile device — TitleScreen picks between this file and
 * TitleScreenDesktop before orientation is ever consulted.
 */
export const TitleScreenMobile: React.FC<TitleScreenProps> = ({
  audioUnlocked,
  difficulty,
  onStartBrawl,
  onOpenDifficulty,
  onOpenJukebox,
  onOpenCodex,
}) => {
  return (
    <div className="relative w-full h-full bg-[#0a0a0a] flex flex-col justify-between landscape:justify-start overflow-y-auto p-8 landscape:p-3 text-white text-center border-[12px] border-[#ff00ff]/10">
      {/* Header Banner - Artistic Flair */}
      <div className="flex flex-col md:flex-row landscape:flex-row justify-between items-center bg-[#1a1a1a] border-b-4 border-[#ff00ff] px-6 landscape:px-4 py-4 landscape:py-2 rounded-none max-w-4xl mx-auto w-full gap-2 landscape:shrink-0">
        <div className="text-left">
          <span className="text-[#00ffff] font-mono text-xs landscape:text-[10px] tracking-tighter block">SYSTEM STATUS: RADICAL</span>
          <span className="text-xl landscape:text-sm font-black italic uppercase text-white">THE SAFE-WORD SYNDICATE<span className="text-[#ff00ff]">.</span></span>
        </div>
        <div className="text-right">
          <div className="text-xs landscape:hidden font-mono text-gray-400">VS ULTRA EVIL LEAGUE OF CONSERVATIVE CHRISTIANS</div>
          <button
            onClick={onStartBrawl}
            className={`bg-transparent border-0 py-2.5 landscape:py-1 px-0 -my-2.5 landscape:my-0 cursor-pointer text-lg landscape:text-xs font-black animate-pulse ${audioUnlocked ? 'text-[#ffff00]' : 'text-[#00ffff]'}`}
          >
            CREDIT 99 ► PRESS START
          </button>
        </div>
      </div>

      {/* Body: stacked in portrait (unchanged), side-by-side in
        * landscape - the logo block on the left, actions on the right,
        * both vertically centered against each other so neither reads
        * as an afterthought. */}
      <div className="flex flex-col landscape:flex-row landscape:flex-1 landscape:min-h-0 landscape:items-center landscape:justify-center landscape:gap-6 my-auto landscape:my-0">
        {/* Main Title Logo */}
        <div className="space-y-4 landscape:space-y-1.5 max-w-3xl landscape:max-w-none mx-auto landscape:mx-0 landscape:flex-1 landscape:text-left">
          <h1 className="text-4xl md:text-6xl landscape:text-5xl font-black italic tracking-tighter uppercase leading-none text-white drop-shadow-[0_0_25px_rgba(255,0,255,0.5)]">
            THE SAFE-WORD SYNDICATE<span className="text-[#ff00ff]">.</span>
          </h1>
          <p className="text-lg md:text-2xl landscape:text-xl font-black italic text-[#00ffff] font-mono uppercase tracking-wider">
            VS THE ULTRA EVIL LEAGUE OF CONSERVATIVE CHRISTIANS
          </p>
          {/* Flavor text, not information the player needs to start -
              the first thing to drop when landscape has no room. */}
          <p className="text-xs md:text-sm landscape:hidden text-gray-300 max-w-lg mx-auto font-mono leading-relaxed border-2 border-[#333] p-4 bg-[#111]">
            Defeat the monochromatic syndicate enforcing a dull gray status quo! Play as Feet Master, Fun Maker, Omega Biker, or Angry Corso!
          </p>
        </div>

        {/* Actions
          *
          * START BRAWL sits on its own row rather than sharing one with the
          * rest. It used to be one row of three, and adding difficulty as a
          * fourth squeezed every label until the words wrapped mid-button —
          * "START / BRAWL" stacked into a magenta square, "JUKEBOX / MUSIC"
          * broken across two lines. Splitting by importance keeps the
          * primary action full width and lets the three secondary buttons
          * divide the row evenly, so they stay the same size as each other.
          */}
        <div className="flex flex-col gap-3 landscape:gap-1.5 max-w-lg landscape:max-w-xs mx-auto landscape:mx-0 landscape:shrink-0 w-full pb-4 landscape:pb-0">
          <button
            onClick={onStartBrawl}
            className="w-full py-4 landscape:py-2 bg-[#ff00ff] hover:bg-[#d400d4] text-black font-black text-base sm:text-lg landscape:text-sm italic uppercase tracking-wider shadow-[0_0_20px_rgba(255,0,255,0.4)] flex items-center justify-center gap-2 active:scale-95 transition-[background-color,transform]"
          >
            <Play className="w-5 h-5 landscape:w-4 landscape:h-4 fill-current" /> START BRAWL
          </button>

          <div className="flex flex-col sm:flex-row landscape:flex-row gap-3 landscape:gap-1.5 w-full">
            <button
              onClick={onOpenDifficulty}
              className="w-full sm:flex-1 px-3 py-3 landscape:py-1.5 bg-[#1a1a1a] hover:bg-[#222] border-2 border-[#333] hover:border-[#ffff00] text-[#ffff00] font-black text-[11px] landscape:text-[9px] uppercase tracking-wider flex items-center justify-center gap-2 landscape:gap-1 whitespace-nowrap"
            >
              <Gauge className="w-4 h-4 landscape:w-3 landscape:h-3 shrink-0 text-[#ffff00]" />
              {difficulty === 'PUNK_HARD' ? 'PUNK HARD' : difficulty === 'EASY' ? 'EASY' : 'NORMAL'}
            </button>

            <button
              onClick={onOpenJukebox}
              className="w-full sm:flex-1 px-3 py-3 landscape:py-1.5 bg-[#110826] hover:bg-[#1f103f] border-2 border-[#00ffff] text-[#00ffff] font-black text-[11px] landscape:text-[9px] uppercase tracking-wider flex items-center justify-center gap-2 landscape:gap-1 shadow-[0_0_15px_rgba(0,255,255,0.3)] transition-colors whitespace-nowrap"
            >
              <Disc className="w-4 h-4 landscape:w-3 landscape:h-3 shrink-0 text-[#00ffff] animate-spin-slow" /> JUKEBOX
            </button>

            <button
              onClick={onOpenCodex}
              className="w-full sm:flex-1 px-3 py-3 landscape:py-1.5 bg-[#1a1a1a] hover:bg-[#222] border-2 border-[#333] hover:border-[#ffff00] text-[#ffff00] font-black text-[11px] landscape:text-[9px] uppercase tracking-wider flex items-center justify-center gap-2 landscape:gap-1 whitespace-nowrap"
            >
              <BookOpen className="w-4 h-4 landscape:w-3 landscape:h-3 shrink-0 text-[#ffff00]" /> CODEX
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
