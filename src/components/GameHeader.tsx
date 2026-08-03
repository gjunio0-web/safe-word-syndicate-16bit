import React from 'react';
import { GameSettings } from '../types';
import { Volume2, VolumeX, Tv, BookOpen, Pause, Play, Disc, Home, RotateCcw, Crosshair } from 'lucide-react';
import { sound } from '../game/sound';
import { useIsMobileDevice } from '../hooks/useDeviceType';
import { useIsPortrait } from '../hooks/useOrientation';
import { currentPlatformHasRingerSwitch } from '../game/ringerSwitch';

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
  /* Whether to show the header's own reset shortcut. See the button below —
   * on a touch device it is a 32px unlabelled icon that throws the run away,
   * and the pause menu already offers the same action with a full label. */
  const isMobile = useIsMobileDevice();

  /* 44px minimum on anything a finger has to hit. Empty on desktop, where the
   * pointer is precise and the header has other things to fit. */
  const touchFloor = isMobile ? 'min-w-11 min-h-11' : '';

  /* Whether to offer the silent-switch line in the pause menu below. The same
   * sentence exists on the attract screen, but it lands there before audio has
   * unlocked — nobody has sound yet at that point, on any platform, so it
   * cannot mean anything. This is the copy that has to do the work: pausing is
   * what a person does when something seems off, and it is the first moment
   * where silence is genuinely diagnostic. */
  const ringerSwitch = currentPlatformHasRingerSwitch();

  /* Whether the pause card runs in its tight form.
   *
   * Device and orientation, not the orientation-based Tailwind variant. That
   * variant is a media query on the viewport's aspect, so it matches every
   * desktop monitor ever made — the card would have shrunk on machines that
   * never had the problem. The problem is a phone held sideways, which is a
   * fact about the device, and this file already asks that question for the
   * touch floor above. (Describing the variant rather than writing it: the
   * scanner reads comment text.)
   *
   * Both hooks are read into locals before they are combined. Written as
   * `useIsMobileDevice() && !useIsPortrait()` the && short-circuits, so the
   * orientation hook goes uncalled on desktop — and the moment the pointer
   * modality changes at runtime and the first hook flips to true, React sees a
   * different number of hooks than it saw last render and tears the tree down.
   * A conditional hook call reads as harmless right up until it is not. */
  const isPortrait = useIsPortrait();
  const compact = isMobile && !isPortrait;

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

  const toggleHitboxes = () => {
    onUpdateSettings({ showHitboxes: !settings.showHitboxes });
  };

  const changeVolume = (next: number) => {
    onUpdateSettings({ volume: next });
    sound.setVolume(next);
  };

  return (
    <>
      <div className="w-full bg-[#1a1a1a] border-b-4 border-[#ff00ff] px-2 sm:px-4 py-2.5 flex justify-between items-center text-white font-mono select-none z-30 gap-2">
        {/* Stage Info. min-w-0 + truncate: without a width to shrink into, a
            long stage name (e.g. "Neon Nightlife District") wrapped one or
            two words per line on a narrow phone, some six lines of the
            header eaten by a label nobody needed to re-read every frame. The
            "STAGE STATUS:" prefix drops first on narrow screens since the
            name alone still says the same thing. */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="w-2.5 h-2.5 bg-[#00ffff] animate-pulse shrink-0" />
          <span className="text-xs font-black text-[#00ffff] uppercase tracking-tighter truncate">
            <span className="hidden sm:inline">STAGE STATUS: </span>
            <span className="text-[#ffff00]">{stageName}</span>
          </span>
        </div>

        {/* Control Buttons
          *
          * touchFloor is 44px, the smallest target any platform guideline
          * accepts; the padding alone gave 32px in portrait and 36 in
          * landscape. It lifts rather than resizes, so the icons and the
          * desktop layout are untouched.
          *
          * Gated on the device, not on `sm:`. A first attempt used the width
          * breakpoint, which meant a phone held sideways — 852px wide, past
          * the 640px threshold — dropped the floor and kept its 36px targets,
          * in the orientation the game actually asks for. That is the same
          * mistake as the keyboard hint two files over: viewport width is not
          * a question about fingers.
          *
          * The width this costs is the width the reset shortcut above used to
          * take, which is why the two changes belong in the same patch: six
          * targets at 44px take about the same room as seven at 32px, and the
          * stage name keeps its min-w-0/truncate either way.
          */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Reset / Home Button — desktop only.
            *
            * This discards the run. There is no save and no confirmation, and
            * on a phone the word RESET is hidden (it only appears at md), so
            * what is left is an unlabelled red icon in a 32px box, first in a
            * row of seven identical 32px boxes, none of which meets any
            * touch-target minimum. One mistap while reaching for the pause
            * button next to it costs the whole campaign.
            *
            * Nothing is lost by dropping it here: the pause menu below offers
            * MAIN MENU / TITLE SCREEN as a full-width labelled button, which
            * is the same call with the deliberation the action deserves. A
            * shortcut to destroy progress is not a convenience.
            *
            * Kept on desktop, where the pointer is precise, the label shows,
            * and a mistap is a different kind of unlikely. If it should go
            * everywhere, delete the condition rather than the block.
            */}
          {!isMobile && (
            <button
              onClick={() => {
                sound.stopAll();
                onReturnToTitle();
              }}
              className="p-1.5 sm:p-2 bg-red-950/80 hover:bg-red-900 border-2 border-red-600 hover:border-red-400 text-red-200 transition-colors flex items-center gap-1.5 text-xs font-black shadow-md"
              title="Reset Game & Return to Title Screen"
            >
              <Home className="w-4 h-4 text-red-400" />
              <span className="hidden md:inline">RESET</span>
            </button>
          )}

          {/* Jukebox / Custom Music Button */}
          {onOpenAudioModal && (
            <button
              onClick={onOpenAudioModal}
              className={`${touchFloor} justify-center p-1.5 sm:p-2 bg-[#111] hover:bg-[#222] border-2 border-[#333] hover:border-[#ff00ff] text-[#ff00ff] transition-colors flex items-center gap-1.5 text-xs font-black`}
              title="Open Jukebox / Custom Audio Tracks"
            >
              <Disc className="w-4 h-4 animate-spin-slow text-[#ff00ff]" />
              <span className="hidden sm:inline">MUSIC</span>
            </button>
          )}

          {/* Pause Button */}
          <button
            onClick={onTogglePause}
            className={`${touchFloor} flex items-center justify-center p-1.5 sm:p-2 bg-[#111] hover:bg-[#222] border-2 border-[#333] hover:border-[#ffff00] text-zinc-300 transition-colors`}
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? <Play className="w-4 h-4 text-[#ffff00]" /> : <Pause className="w-4 h-4" />}
          </button>

          {/* Mute Toggle */}
          <button
            onClick={toggleSound}
            className={`${touchFloor} flex items-center justify-center p-1.5 sm:p-2 bg-[#111] hover:bg-[#222] border-2 border-[#333] hover:border-[#00ffff] text-zinc-300 transition-colors`}
            title="Toggle Sound"
          >
            {settings.soundEnabled ? (
              <Volume2 className="w-4 h-4 text-[#00ffff]" />
            ) : (
              <VolumeX className="w-4 h-4 text-[#ff00ff]" />
            )}
          </button>

          {/* Volume. The setting existed with no control anywhere, so only the
              mute button ever did anything. Hidden on narrow screens, where the
              header is already tight.

              App's global keydown handler ignores every key while an <input>
              has focus, so leaving this slider focused after use silently
              disabled every game control — movement, pause, attacks — until
              the player happened to click elsewhere. Blurring on change
              handles a drag or an arrow-key nudge; blurring on mouse-up/touch-
              end also covers a plain click that leaves the value unchanged,
              which fires no change event at all. None of these interrupt an
              in-progress drag, since the browser tracks that by pointer
              capture, not by DOM focus. tabIndex={-1} closes the remaining
              gap — landing here via Tab alone, with no click or drag to
              trigger any of the above — the same tradeoff the audio modal's
              file picker already makes for mouse/touch-only controls. */}
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(settings.volume * 100)}
            onChange={(e) => {
              changeVolume(Number(e.target.value) / 100);
              e.currentTarget.blur();
            }}
            onMouseUp={(e) => e.currentTarget.blur()}
            onTouchEnd={(e) => e.currentTarget.blur()}
            tabIndex={-1}
            disabled={!settings.soundEnabled}
            title={`Volume: ${Math.round(settings.volume * 100)}%`}
            aria-label="Volume"
            className="hidden sm:block w-20 accent-[#00ffff] disabled:opacity-30 cursor-pointer"
          />

          {/* Hitbox overlay. Debug aid for attack ranges and for the standoff
              ring enemies hold while waiting for an attack slot. */}
          <button
            onClick={toggleHitboxes}
            className={`${touchFloor} flex items-center justify-center p-1.5 sm:p-2 border-2 transition-colors ${
              settings.showHitboxes
                ? 'bg-[#00ff88]/20 border-[#00ff88] text-[#00ff88]'
                : 'bg-[#111] border-[#333] text-zinc-500'
            }`}
            title="Toggle Hitbox Overlay"
          >
            <Crosshair className="w-4 h-4" />
          </button>

          {/* CRT Scanlines Toggle */}
          <button
            onClick={toggleCrt}
            className={`${touchFloor} flex items-center justify-center p-1.5 sm:p-2 border-2 transition-colors ${
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
            className={`${touchFloor} flex items-center justify-center p-1.5 sm:p-2 bg-[#111] hover:bg-[#222] border-2 border-[#333] hover:border-[#ffff00] text-[#ffff00] transition-colors`}
            title="Open Lore Codex"
          >
            <BookOpen className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pause Menu Modal Overlay */}
      {/* Pause Overlay.
        *
        * overflow-y-auto with m-auto on the card, rather than items-center. A
        * centred flex child that outgrows its container gets clipped at the
        * top and cannot be scrolled back to — and this card outgrows a
        * 300px-tall landscape window even with nothing added to it, which put
        * MAIN MENU / TITLE SCREEN off the bottom with no way to reach it. That
        * is the escape route from a paused game, so it cannot be the thing
        * that falls off the edge. Auto margins centre it while it fits and let
        * it scroll once it does not.
        */}
      {isPaused && (
        <div className={`absolute inset-0 bg-black/85 backdrop-blur-md z-50 flex overflow-y-auto ${compact ? 'p-2' : 'p-6'} text-white font-mono select-none`} data-gamepad-scope>
          {/* Tighter in landscape, where the vertical budget is the whole problem.
              * The card is 348px and a phone held sideways behind a software
              * nav bar leaves about 300 — so it needed scrolling to reach
              * MAIN MENU, and a mobile browser hides its scrollbar until you
              * already scrolled. The only signal that more existed was a
              * button clipped by the screen edge, which is not a signal, it
              * is a coincidence of where the cut landed. Trimming padding and
              * gaps brings it to roughly 284px and removes the need. The
              * overflow-y-auto above stays as a net for anything shorter
              * still, but it is no longer the plan. */}
            <div className={`m-auto bg-[#111] border-4 border-[#ffff00] max-w-sm w-full text-center shadow-[0_0_40px_rgba(255,255,0,0.4)] ${compact ? 'p-4 space-y-3' : 'p-6 space-y-5'}`}>
            <h2 className="text-3xl font-black italic text-[#ffff00] tracking-tighter uppercase">
              GAME PAUSED
            </h2>
            <p className="text-xs text-zinc-400 font-mono">Select an option to proceed</p>

            {ringerSwitch && (
              <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider leading-relaxed">
                No music? The silent switch mutes this page too.
              </p>
            )}

            <div className={compact ? 'space-y-2' : 'space-y-3 pt-2'}>
              <button
                onClick={onTogglePause}
                className={`w-full ${compact ? 'py-2.5 min-h-11' : 'py-3'} bg-[#ffff00] hover:bg-amber-300 text-black font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all`}
              >
                <Play className="w-4 h-4 fill-black" /> RESUME GAME
              </button>

              {onRestartStage && (
                <button
                  onClick={() => {
                    onTogglePause();
                    onRestartStage();
                  }}
                  className={`w-full ${compact ? 'py-2.5 min-h-11' : 'py-3'} bg-[#1a1a1a] hover:bg-[#222] border-2 border-[#ff00ff] text-[#ff00ff] font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors`}
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
                className={`w-full ${compact ? 'py-2.5 min-h-11' : 'py-3'} bg-red-950/80 hover:bg-red-900 border-2 border-red-600 text-red-200 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors`}
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

