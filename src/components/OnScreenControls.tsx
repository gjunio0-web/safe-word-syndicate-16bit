import React, { useCallback, useRef } from 'react';
import { PlayerInput } from '../types';
import { directionFromTouch, isNeutral, wedgeAngle, DpadDirections } from '../game/dpad';

interface OnScreenControlsProps {
  input: PlayerInput;
  setInput: React.Dispatch<React.SetStateAction<PlayerInput>>;
  powerMeter: number;
}

const NEUTRAL: DpadDirections = { up: false, down: false, left: false, right: false };

/** Half-width of the highlight wedge, in degrees. 45 makes the eight wedges tile the pad exactly. */
const WEDGE_HALF = 45;

/** Builds the SVG path for the wedge pointing at `angle`, on a unit circle centred at (50,50). */
function wedgePath(angle: number): string {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const a1 = rad(angle - WEDGE_HALF);
  const a2 = rad(angle + WEDGE_HALF);
  const r = 50;
  const x1 = 50 + r * Math.cos(a1);
  const y1 = 50 + r * Math.sin(a1);
  const x2 = 50 + r * Math.cos(a2);
  const y2 = 50 + r * Math.sin(a2);
  return `M50 50 L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

export const OnScreenControls: React.FC<OnScreenControlsProps> = ({
  input,
  setInput,
  powerMeter,
}) => {
  /* ---- Action buttons -------------------------------------------------
   *
   * Pointer events rather than the touch/mouse pairs these used to carry.
   * The old wiring had no cancel handler of any kind, and touchcancel is not
   * exotic: a notification, a system edge-swipe, or the browser deciding a
   * touch became a scroll all fire it instead of touchend. The matching
   * handler never ran and the key stayed true — a direction that walked on
   * its own, or a PUNCH stuck in a loop, with no way back except finding and
   * tapping that exact button again. The window blur reset in App.tsx only
   * covers leaving the app entirely, which is the rarer case.
   *
   * setPointerCapture also fixes the quieter half: a thumb that slides off
   * the button mid-press still delivers its release here instead of
   * stranding the key.
   */
  const pressHandlers = useCallback(
    (key: keyof PlayerInput) => ({
      onPointerDown: (e: React.PointerEvent) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setInput((prev) => ({ ...prev, [key]: true }));
      },
      onPointerUp: (e: React.PointerEvent) => {
        e.preventDefault();
        setInput((prev) => ({ ...prev, [key]: false }));
      },
      onPointerCancel: () => setInput((prev) => ({ ...prev, [key]: false })),
      onLostPointerCapture: () => setInput((prev) => ({ ...prev, [key]: false })),
    }),
    [setInput]
  );

  /* ---- D-pad ----------------------------------------------------------
   *
   * One surface, not four buttons. See src/game/dpad.ts for why the axes are
   * resolved by threshold rather than by which rectangle was hit.
   *
   * The rect is measured once per press and reused for the drag: the pad
   * cannot move while a finger is on it, and re-measuring on every move
   * event forces layout on a path that runs at touch sampling rate.
   */
  const padRef = useRef<HTMLDivElement>(null);
  const padRect = useRef<DOMRect | null>(null);
  const activePointer = useRef<number | null>(null);

  const applyDirections = useCallback(
    (dirs: DpadDirections) => {
      setInput((prev) => {
        if (
          prev.up === dirs.up &&
          prev.down === dirs.down &&
          prev.left === dirs.left &&
          prev.right === dirs.right
        ) {
          return prev;
        }
        return { ...prev, ...dirs };
      });
    },
    [setInput]
  );

  const resolve = useCallback(
    (clientX: number, clientY: number) => {
      const rect = padRect.current;
      if (!rect) return;
      const radius = Math.min(rect.width, rect.height) / 2;
      applyDirections(
        directionFromTouch(clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2), radius)
      );
    },
    [applyDirections]
  );

  const onPadDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    padRect.current = padRef.current?.getBoundingClientRect() ?? null;
    activePointer.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    resolve(e.clientX, e.clientY);
  };

  const onPadMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== e.pointerId) return;
    resolve(e.clientX, e.clientY);
  };

  const releasePad = () => {
    activePointer.current = null;
    padRect.current = null;
    applyDirections(NEUTRAL);
  };

  const live: DpadDirections = {
    up: input.up,
    down: input.down,
    left: input.left,
    right: input.right,
  };
  const angle = wedgeAngle(live);

  const arrow = (on: boolean) =>
    `pointer-events-none absolute font-bold text-lg leading-none transition-colors ${
      on ? 'text-amber-400' : 'text-zinc-500'
    }`;

  return (
    /* Padding respects the display cutout. index.html declares
     * viewport-fit=cover, which extends the page under the notch and the home
     * indicator, and nothing ever compensated for it — in landscape, the
     * orientation this game asks for, the cutout sits on one of the short
     * edges, which is exactly where these controls live. The playfield still
     * bleeds to the edge; only the controls step back. */
    <div
      className="absolute inset-0 pointer-events-none flex flex-col justify-end select-none z-30
        pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]
        pb-[max(1rem,env(safe-area-inset-bottom))] pt-4
        landscape:pl-[max(0.5rem,env(safe-area-inset-left))] landscape:pr-[max(0.5rem,env(safe-area-inset-right))]
        landscape:pb-[max(0.5rem,env(safe-area-inset-bottom))] landscape:pt-2"
    >
      {/* The keyboard reference that used to sit here moved to KeyboardHints.
        * It was never a touch control: it tells a keyboard player which keys
        * do what, so gating it behind the touch layer hid it from the only
        * people it was written for.
        */}

      {/* landscape: sizes are a deliberate second line of defense on top of
        * the layout fix (App.tsx's min-h-0) that made these fit their
        * allotted space in the first place - extra headroom for shorter
        * real-device landscape viewports the layout fix alone might not
        * cover (e.g. a taller header, a software nav bar). Portrait is
        * untouched; only orientation, not screen width, gates this. */}
      <div className="flex justify-between items-end w-full pb-2 landscape:pb-1">
        {/* Virtual D-Pad — a single continuous surface.
          *
          * The four separate buttons this replaces could not report two axes
          * at once, so no diagonal existed, and their fixed 4px insets did
          * not scale with the circle: shrinking the pad for landscape made
          * them overlap at the corners, which was answered by shrinking the
          * buttons to 32px — below any touch-target minimum, in the
          * orientation the game recommends. A continuous surface has no
          * insets to collide and no discrete target to undersize: every
          * point outside the neutral centre is live, which is roughly 80%
          * more usable area inside the same circle.
          *
          * touch-action: none, not the document-wide `manipulation`: this
          * surface is dragged, and the browser must not be able to reinterpret
          * that drag as a pan partway through.
          */}
        <div
          id="dpad-surface"
          ref={padRef}
          role="application"
          aria-label="Movement pad"
          onPointerDown={onPadDown}
          onPointerMove={onPadMove}
          onPointerUp={releasePad}
          onPointerCancel={releasePad}
          onLostPointerCapture={releasePad}
          className="pointer-events-auto relative w-36 h-36 landscape:w-28 landscape:h-28 touch-none
            bg-zinc-900/80 backdrop-blur-md rounded-full border-2 border-zinc-700 shadow-2xl
            flex items-center justify-center"
        >
          {/* Direction highlight. Drawn under the glyphs so a lit arrow still
            * reads against it. */}
          <svg
            viewBox="0 0 100 100"
            className="pointer-events-none absolute inset-0 w-full h-full rounded-full overflow-hidden"
            aria-hidden="true"
          >
            {angle !== null && <path d={wedgePath(angle)} className="fill-amber-500/25" />}
          </svg>

          {/* Glyphs are affordance, not hit area — they say "this is a D-pad"
            * and light per axis, so a diagonal shows as two lit arrows rather
            * than needing a new symbol. */}
          <span className={`${arrow(input.up)} top-1.5 left-1/2 -translate-x-1/2`}>▲</span>
          <span className={`${arrow(input.down)} bottom-1.5 left-1/2 -translate-x-1/2`}>▼</span>
          <span className={`${arrow(input.left)} left-1.5 top-1/2 -translate-y-1/2`}>◄</span>
          <span className={`${arrow(input.right)} right-1.5 top-1/2 -translate-y-1/2`}>►</span>

          {/* Centre hub. Visual only, and it marks the neutral zone: a thumb
            * resting here reports nothing, which is what stops the fighter
            * from drifting between deliberate inputs. */}
          <div
            className={`pointer-events-none w-8 h-8 landscape:w-6 landscape:h-6 rounded-full border transition-colors ${
              isNeutral(live) ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-800 border-amber-500/60'
            }`}
          />
        </div>

        {/* Action Buttons */}
        <div className="pointer-events-auto grid grid-cols-2 gap-3 landscape:gap-2">
          {/* Punch. No keybind label: a touch player has no keyboard to read
              it against, so it used to just print noise ("[J]") on a button
              whose only real affordance is being tapped. */}
          <button
            id="btn-action-punch"
            {...pressHandlers('punch')}
            className="w-16 h-16 landscape:w-[52px] landscape:h-[52px] touch-none rounded-full bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-lg border-2 border-rose-400 flex flex-col items-center justify-center active:scale-90 transition-transform"
          >
            <span>PUNCH</span>
          </button>

          {/* Kick */}
          <button
            id="btn-action-kick"
            {...pressHandlers('kick')}
            className="w-16 h-16 landscape:w-[52px] landscape:h-[52px] touch-none rounded-full bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow-lg border-2 border-blue-400 flex flex-col items-center justify-center active:scale-90 transition-transform"
          >
            <span>KICK</span>
          </button>

          {/* Power Move. The sub-label still earns its space here: charging,
              it counts up toward 30; ready, it says so, rather than naming
              keys a touch player never presses. */}
          <button
            id="btn-action-special"
            {...pressHandlers('special')}
            className={`w-16 h-16 landscape:w-[52px] landscape:h-[52px] touch-none rounded-full font-black text-xs shadow-lg border-2 flex flex-col items-center justify-center active:scale-90 transition-all cursor-pointer ${
              powerMeter >= 30
                ? 'bg-amber-500 hover:bg-amber-400 text-black border-amber-300 animate-pulse'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700 opacity-70'
            }`}
          >
            <span>SPECIAL</span>
            <span className="text-[10px]">{powerMeter >= 30 ? 'READY!' : `${Math.floor(powerMeter)}/30`}</span>
          </button>

          {/* Jump */}
          <button
            id="btn-action-jump"
            {...pressHandlers('jump')}
            className="w-16 h-16 landscape:w-[52px] landscape:h-[52px] touch-none rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-lg border-2 border-emerald-400 flex flex-col items-center justify-center active:scale-90 transition-transform"
          >
            <span>JUMP</span>
          </button>
        </div>
      </div>
    </div>
  );
};
