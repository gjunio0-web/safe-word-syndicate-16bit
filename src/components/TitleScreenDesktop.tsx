import React from 'react';
import { Play, Gauge, Disc, BookOpen } from 'lucide-react';
import { TitleScreenProps } from './TitleScreen';

/**
 * The title screen as desktop has always wanted it: three direct children
 * under a `justify-between` column, so the header pins to the top, the logo
 * block centres itself with `my-auto`, and the actions anchor to the bottom
 * of the window however tall it is.
 *
 * This structure was briefly lost. A landscape layout added for phones held
 * sideways wrapped the logo and the actions into one shared flex row — the
 * arrangement a 400px-tall phone needs — and Tailwind's `landscape:` variant
 * is a pure orientation query, so every desktop monitor (wider than tall)
 * matched it too. Desktop inherited both the phone's wrapper and the phone's
 * sizing, stranding a compact little card mid-screen with dead space beneath.
 *
 * Splitting the screen by device rather than by orientation is what keeps
 * the two from interfering: this file has no orientation variants at all,
 * and TitleScreenMobile owns the sideways-phone layout outright.
 */
export const TitleScreenDesktop: React.FC<TitleScreenProps> = ({
  audioUnlocked,
  difficulty,
  onStartBrawl,
  onOpenDifficulty,
  onOpenJukebox,
  onOpenCodex,
}) => {
  return (
    <div className="relative w-full h-full bg-[#0a0a0a] flex flex-col justify-between overflow-y-auto p-8 text-white text-center">
      {/* Header — no panel, no rule, no width cap: the two halves sit at the
          screen's own left and right edges rather than inside a centred
          banner box. */}
      <div className="flex flex-col md:flex-row justify-between items-center px-6 py-4 rounded-none w-full gap-2">
        <div className="text-left">
          <span className="text-[#00ffff] font-mono text-xs md:text-[clamp(0.75rem,0.95vw,1.2rem)] tracking-tighter block">SYSTEM STATUS: RADICAL</span>
          <span className="text-xl md:text-[clamp(1.25rem,1.58vw,2rem)] font-black italic uppercase text-white">THE SAFE-WORD SYNDICATE<span className="text-[#ff00ff]">.</span></span>
        </div>
        <div className="text-right">
          <div className="text-xs md:text-[clamp(0.75rem,0.95vw,1.2rem)] font-mono text-gray-400">VS ULTRA EVIL LEAGUE OF CONSERVATIVE CHRISTIANS</div>
          <button
            onClick={onStartBrawl}
            className={`bg-transparent border-0 py-2.5 px-0 -my-2.5 cursor-pointer text-lg md:text-[clamp(1.125rem,1.42vw,1.8rem)] font-black animate-pulse ${audioUnlocked ? 'text-[#ffff00]' : 'text-[#00ffff]'}`}
          >
            CREDIT 99 ► PRESS START
          </button>
        </div>
      </div>

      {/* Main Title Logo
        *
        * The 3xl cap now sits on the h1 alone rather than on this wrapper.
        * It is what breaks the logo across two lines, so keeping it there
        * leaves the logo exactly as it was — while the subtitle, no longer
        * boxed in by it, gets the full width it needs to sit on one line at
        * its existing size. Nothing here shrinks; the line only closes up
        * because it was given more room, not less type. */}
      <div className="my-auto space-y-4">
        <h1 className="text-4xl md:text-[clamp(3.75rem,4.74vw,6rem)] font-black italic tracking-tighter uppercase leading-none text-white drop-shadow-[0_0_25px_rgba(255,0,255,0.5)] max-w-3xl md:max-w-[min(72rem,max(48rem,60vw))] mx-auto">
          THE SAFE-WORD SYNDICATE<span className="text-[#ff00ff]">.</span>
        </h1>
        <p className="text-lg md:text-[clamp(1.5rem,1.9vw,2.4rem)] font-black italic text-[#00ffff] font-mono uppercase tracking-wider">
          VS THE ULTRA EVIL LEAGUE OF CONSERVATIVE CHRISTIANS
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
      <div className="flex flex-col gap-3 max-w-lg mx-auto w-full pb-4">
        <button
          onClick={onStartBrawl}
          className="w-full py-4 bg-[#ff00ff] hover:bg-[#d400d4] text-black font-black text-base sm:text-lg md:text-[clamp(1.125rem,1.42vw,1.8rem)] italic uppercase tracking-wider shadow-[0_0_20px_rgba(255,0,255,0.4)] flex items-center justify-center gap-2 active:scale-95 transition-[background-color,transform]"
        >
          <Play className="w-5 h-5 fill-current" /> START BRAWL
        </button>

        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button
            onClick={onOpenDifficulty}
            className="w-full sm:flex-1 px-3 py-3 bg-[#1a1a1a] hover:bg-[#222] border-2 border-[#333] hover:border-[#ffff00] text-[#ffff00] font-black text-[11px] md:text-[clamp(11px,0.87vw,17.6px)] uppercase tracking-wider flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Gauge className="w-4 h-4 shrink-0 text-[#ffff00]" />
            {difficulty === 'PUNK_HARD' ? 'PUNK HARD' : difficulty === 'EASY' ? 'EASY' : 'NORMAL'}
          </button>

          <button
            onClick={onOpenJukebox}
            className="w-full sm:flex-1 px-3 py-3 bg-[#110826] hover:bg-[#1f103f] border-2 border-[#00ffff] text-[#00ffff] font-black text-[11px] md:text-[clamp(11px,0.87vw,17.6px)] uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,255,255,0.3)] transition-colors whitespace-nowrap"
          >
            <Disc className="w-4 h-4 shrink-0 text-[#00ffff] animate-spin-slow" /> JUKEBOX
          </button>

          <button
            onClick={onOpenCodex}
            className="w-full sm:flex-1 px-3 py-3 bg-[#1a1a1a] hover:bg-[#222] border-2 border-[#333] hover:border-[#ffff00] text-[#ffff00] font-black text-[11px] md:text-[clamp(11px,0.87vw,17.6px)] uppercase tracking-wider flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <BookOpen className="w-4 h-4 shrink-0 text-[#ffff00]" /> CODEX
          </button>
        </div>
      </div>
    </div>
  );
};
