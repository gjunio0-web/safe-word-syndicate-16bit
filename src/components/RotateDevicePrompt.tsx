import React, { useState } from 'react';
import { RotateCcw, X } from 'lucide-react';

/**
 * Nudges a mobile player toward landscape during actual gameplay.
 *
 * The design resolution is 800x450 (~16:9) and gets letterboxed to fit
 * whatever the canvas container's shape is (see viewport.ts). In portrait
 * that container is much taller than it is wide, so the playable scene
 * shrinks to a thin horizontal strip with most of the screen left black,
 * while landscape lets it fill almost the whole viewport. Portrait still
 * works — this is a nudge, not a gate — but nothing told the player that
 * turning the phone sideways would look and play dramatically better.
 *
 * Dismissible and re-shown per stage/game rather than persisted: a player
 * who genuinely prefers portrait (one-handed play, a case that blocks
 * rotation) shouldn't have to re-dismiss it every frame, but a fresh run is
 * a fair place to ask again.
 */
export const RotateDevicePrompt: React.FC = () => {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    // top-40 clears the player HUD card (absolute top-3, ~148px tall)
    // GameCanvas already draws above this point — top-2 sat right on top of
    // it, covering the name and HP bar.
    <div className="absolute top-40 left-1/2 -translate-x-1/2 z-40 max-w-[90%] pointer-events-auto">
      <div className="flex items-center gap-2 bg-black/90 border border-amber-400/70 rounded-full pl-3 pr-1.5 py-1.5 shadow-lg backdrop-blur-sm">
        <RotateCcw className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
        <span className="text-[10px] font-mono text-amber-200 uppercase tracking-wide">
          Turn your phone sideways for a bigger view
        </span>
        <button
          onClick={() => setDismissed(true)}
          /* 44px, not the 22px the padding alone produced. This is the button
           * that dismisses an advisory banner — if it is hard to hit, the
           * banner stops being advice and becomes an obstruction. */
          className="shrink-0 min-w-11 min-h-11 flex items-center justify-center -m-1 text-zinc-400 hover:text-white transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
