import React from 'react';
import { Play, Gauge, Disc, BookOpen } from 'lucide-react';
import { TitleScreenProps } from './TitleScreen';
import { COPYRIGHT_NOTICE, CREDIT_SLOGAN } from '../game/credits';

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
        {/* The banner's own VS line is gone.
          *
          * It was already hidden in landscape, and in portrait it said what
          * the logo block below says in full — twice on one screen, the
          * second time in grey at the size of a footnote. Removing it takes
          * two wrapped lines off the tallest block on the shortest phone. */}
        <div className="text-right">
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
      {/* Portrait spacing, in two rules, because a short phone and a tall one
        * are two different problems.
        *
        * The gap itself is the hole the flavour panel left. That panel was the
        * only thing separating the VS line from START BRAWL — the two halves
        * of this block are siblings in a column with no gap of their own — so
        * removing it left the subtitle sitting directly on the button, at 0px
        * on all three phone shapes.
        *
        * Where the column fits, `my-auto` centres the whole body and the space
        * above the logo comes out of the leftover on its own; gap-10 is then
        * just the distance between the two halves.
        *
        * Where it does not fit there is no leftover to place, `my-auto`
        * collapses to zero, and the logo ends up against the banner's magenta
        * rule with the entire gap below it. At 375x667 the column measures 732
        * against 643 of visible height. There the space has to be written
        * rather than left over, so the same total is split in half: 20 above
        * the text block and 20 under it. Same total either way, so balancing
        * the short screen costs it no extra overflow.
        *
        * The threshold is where the two rules cross. The column is 756px tall
        * including the root's border, so the leftover above the body is
        * (h - 756) / 2; the written halves are always 20 and 20. The two are
        * equally far from even when |leftover - 40| equals leftover, which is
        * leftover = 20, so h = 796.
        *
        * That figure is a correction: this first shipped at 836 from the same
        * algebra solved wrongly, and the sweep caught it — at 830 the written
        * halves gave 57 and 20 where the leftover alone gives 37 and 40.
        * Measured after the fix at 640, 667, 699, 760, 790, 800, 830, 844 and
        * 900.
        *
        * Landscape has its own row layout and is untouched by both. */}
      <div className="flex flex-col gap-10 [@media(max-height:796px)]:pt-5 [@media(max-height:796px)]:gap-5 landscape:pt-0 landscape:flex-row landscape:flex-1 landscape:min-h-0 landscape:items-center landscape:justify-center landscape:gap-6 my-auto landscape:my-0">
        {/* Main Title Logo */}
        <div className="space-y-4 landscape:space-y-1.5 max-w-3xl landscape:max-w-none mx-auto landscape:mx-0 landscape:flex-1 landscape:text-left">
          <h1 className="text-4xl md:text-6xl landscape:text-5xl font-black italic tracking-tighter uppercase leading-none text-white drop-shadow-[0_0_25px_rgba(255,0,255,0.5)]">
            THE SAFE-WORD SYNDICATE<span className="text-[#ff00ff]">.</span>
          </h1>
          <p className="text-lg md:text-2xl landscape:text-xl font-black italic text-[#00ffff] font-mono uppercase tracking-wider">
            VS THE ULTRA EVIL LEAGUE OF CONSERVATIVE CHRISTIANS
          </p>
          {/* The flavour text that used to sit here is gone.
            *
            * It was already hidden in landscape as the first thing to drop
            * when there was no room; portrait kept it, and it was the tallest
            * block on the screen — a bordered panel of prose between the logo
            * and the only button that starts the game. What it said, the
            * roster names included, the player meets on the next screen
            * anyway.
            *
            * The height it gave back is spent on the elements that stayed,
            * not reclaimed: see the spacing below. */}
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
            className="w-full py-4 landscape:py-2 landscape:min-h-11 bg-[#ff00ff] hover:bg-[#d400d4] text-black font-black text-base sm:text-lg landscape:text-sm italic uppercase tracking-wider shadow-[0_0_20px_rgba(255,0,255,0.4)] flex items-center justify-center gap-2 active:scale-95 transition-[background-color,transform]"
          >
            <Play className="w-5 h-5 landscape:w-4 landscape:h-4 fill-current" /> START BRAWL
          </button>

          {/* Three rows in landscape, not one.
          *
          * The three secondary buttons used to share a row and came out
          * 103x30 — under any touch-target minimum, on a screen where the
          * primary action was 36px tall. Height was the reason given for
          * leaving them alone, and measuring killed that argument: the whole
          * action block ends before the halfway mark of the viewport, and
          * this arrangement costs 36px against at least 49px of slack on the
          * worst landscape shape tested (740x300, standing in for a phone
          * with a software nav bar).
          *
          * Grid rather than flex because the difficulty button spans both
          * columns, and it spans them because it is the only one of the three
          * that changes how the match plays. Its label is also live —
          * NORMAL / EASY / PUNK HARD — so a full row turns it into a readout
          * of what you are about to start on, not just a way in.
          *
          * Portrait on a phone now uses those same two columns rather than
          * one. Stacked, the three buttons read as a list of equals under
          * START BRAWL; paired, the ranking is visible in the shape — one
          * full-width row that changes the fight, one row of two that only
          * open a panel. It also gives the block back a row of height on the
          * shortest phone, which is the one that does not fit.
          *
          * The sm: overrides keep a tablet exactly as it was. At 640px and up
          * the grid is still three across with difficulty in a single column,
          * because there the row has the width for it and this component
          * serves tablets too.
          *
          * Colour carries the same ranking: magenta to begin, cyan for the
          * choice that changes the fight, grey for the two that only show you
          * things. The jukebox gave up its cyan glow here — with difficulty
          * lit, two glowing buttons would have been two focal points and no
          * hierarchy at all.
          *
          * DOM order follows visual order, so keyboard and gamepad traversal
          * matches what the eye does. Portrait is untouched: every change is
          * behind landscape:, and the grid collapses to one column there,
          * which is what the flex row already did.
          */}
          <div className="grid grid-cols-2 sm:grid-cols-3 landscape:grid-cols-2 gap-3 landscape:gap-1.5 w-full">
            <button
              onClick={onOpenDifficulty}
              className="w-full px-3 py-3 landscape:py-1.5 landscape:min-h-11 col-span-2 sm:col-span-1 landscape:col-span-2 bg-[#0a1826] hover:bg-[#10243a] border-2 border-[#00ffff] text-[#00ffff] shadow-[0_0_15px_rgba(0,255,255,0.3)] transition-colors font-black text-[11px] landscape:text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 landscape:gap-1 whitespace-nowrap"
            >
              <Gauge className="w-4 h-4 landscape:w-3 landscape:h-3 shrink-0 text-[#00ffff]" />
              {difficulty === 'PUNK_HARD' ? 'PUNK HARD' : difficulty === 'EASY' ? 'EASY' : 'NORMAL'}
            </button>

            <button
              onClick={onOpenJukebox}
              className="w-full px-3 py-3 landscape:py-1.5 landscape:min-h-11 bg-[#1a1a1a] hover:bg-[#222] border-2 border-[#333] hover:border-zinc-500 text-zinc-300 transition-colors font-black text-[11px] landscape:text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 landscape:gap-1 whitespace-nowrap"
            >
              <Disc className="w-4 h-4 landscape:w-3 landscape:h-3 shrink-0 text-zinc-400 animate-spin-slow" /> JUKEBOX
            </button>

            <button
              onClick={onOpenCodex}
              className="w-full px-3 py-3 landscape:py-1.5 landscape:min-h-11 bg-[#1a1a1a] hover:bg-[#222] border-2 border-[#333] hover:border-zinc-500 text-zinc-300 transition-colors font-black text-[11px] landscape:text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 landscape:gap-1 whitespace-nowrap"
            >
              <BookOpen className="w-4 h-4 landscape:w-3 landscape:h-3 shrink-0 text-zinc-400" /> CODEX
            </button>
          </div>
        </div>
      </div>

      {/* Studio credit.
        *
        * Anchored to the whole screen rather than to the action column. In
        * landscape that column is 20rem wide and the line broke in two inside
        * it; out here it clears both columns and sits on one line under them.
        *
        * Portrait keeps the two halves stacked — 390px never fits the pair on
        * one line at any size that stays legible, so the stack is the design
        * rather than the failure mode. */}
      <p className="shrink-0 pt-2 pb-1 text-center text-[10px] landscape:text-[8px] font-mono uppercase tracking-widest text-gray-500">
        <span className="block landscape:inline text-gray-300">{COPYRIGHT_NOTICE}</span>
        <span className="hidden landscape:inline"> · </span>
        <span className="block landscape:inline">{CREDIT_SLOGAN}</span>
      </p>
    </div>
  );
};
