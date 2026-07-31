import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { CharacterId, CharacterInfo } from '../types';
import { CHARACTERS } from '../game/characterData';
import { ChevronLeft, ChevronRight, Crosshair, Play } from 'lucide-react';
import { sound } from '../game/sound';

// One accent per fighter, applied to the name and to the two rings that
// frame them: the portrait's own circle and the navigation arrows either
// side of it. Written as whole class strings rather than assembled from a
// hex value at runtime — Tailwind only emits classes it can see spelled
// out in the source, so an interpolated `border-[${hex}]` would compile to
// nothing at all.
const charColors: Record<
  CharacterId,
  { text: string; border: string; portraitGlow: string; arrowGlow: string }
> = {
  FEET_MASTER: {
    text: 'text-[#00ffff]',
    border: 'border-[#00ffff]',
    portraitGlow: 'shadow-[0_0_25px_rgba(0,255,255,0.6)]',
    arrowGlow: 'shadow-[0_0_15px_rgba(0,255,255,0.4)]',
  },
  FUN_MAKER: {
    text: 'text-[#ff00ff]',
    border: 'border-[#ff00ff]',
    portraitGlow: 'shadow-[0_0_25px_rgba(255,0,255,0.6)]',
    arrowGlow: 'shadow-[0_0_15px_rgba(255,0,255,0.4)]',
  },
  OMEGA_BIKER: {
    text: 'text-[#ffff00]',
    border: 'border-[#ffff00]',
    portraitGlow: 'shadow-[0_0_25px_rgba(255,255,0,0.6)]',
    arrowGlow: 'shadow-[0_0_15px_rgba(255,255,0,0.4)]',
  },
  ANGRY_CORSO: {
    text: 'text-[#ff4e00]',
    border: 'border-[#ff4e00]',
    portraitGlow: 'shadow-[0_0_25px_rgba(255,78,0,0.6)]',
    arrowGlow: 'shadow-[0_0_15px_rgba(255,78,0,0.4)]',
  },
};

interface CharacterSelectMobileProps {
  onSelect: (p1: CharacterId, p2: undefined, mode: 'SINGLE') => void;
  onBack: () => void;
}

const SLIDE_MS = 260;

type SpacingTier = 'tight' | 'medium' | 'roomy';

// Every non-font spacing value in the portrait dossier, per tier. The
// portrait's own size is decided first and locked (see the effect below,
// and the DIRETIVA MÁXIMA it's built around) — these tiers only ever
// spend room that's genuinely left over afterward, never room the
// portrait needed. Landscape is untouched throughout: every value here
// only ever lands on a base (unprefixed) class, never a `landscape:` one.
const DOSSIER_SPACING: Record<SpacingTier, {
  padding: string;
  rowGap: string;
  portraitBlockGap: string;
  portraitWrapPy: string;
  badgePy: string;
  infoColumnGap: string;
  topRowGap: string;
  statsPadding: string;
  statsSpaceY: string;
  quotePadding: string;
  quoteLeading: string;
  specialPadding: string;
  specialLeading: string;
}> = {
  tight: {
    padding: 'p-2',
    rowGap: 'gap-2',
    portraitBlockGap: 'gap-1',
    portraitWrapPy: 'py-0',
    badgePy: 'py-0.5',
    infoColumnGap: 'gap-1',
    topRowGap: 'gap-2',
    statsPadding: 'p-1.5',
    statsSpaceY: 'space-y-0.5',
    quotePadding: 'p-1',
    quoteLeading: 'leading-tight',
    specialPadding: 'p-1',
    specialLeading: 'leading-tight',
  },
  medium: {
    padding: 'p-3',
    rowGap: 'gap-3',
    portraitBlockGap: 'gap-1.5',
    portraitWrapPy: 'py-0.5',
    badgePy: 'py-1',
    infoColumnGap: 'gap-2',
    topRowGap: 'gap-2',
    statsPadding: 'p-2',
    statsSpaceY: 'space-y-1',
    quotePadding: 'p-1.5',
    quoteLeading: 'leading-snug',
    specialPadding: 'p-1.5',
    specialLeading: 'leading-snug',
  },
  roomy: {
    padding: 'p-4',
    rowGap: 'gap-4',
    portraitBlockGap: 'gap-3',
    portraitWrapPy: 'py-1',
    badgePy: 'py-1.5',
    infoColumnGap: 'gap-3',
    topRowGap: 'gap-3',
    statsPadding: 'p-3',
    statsSpaceY: 'space-y-2',
    quotePadding: 'p-3',
    quoteLeading: 'leading-relaxed',
    specialPadding: 'p-3',
    specialLeading: 'leading-normal',
  },
};

const ROOT_SPACING: Record<SpacingTier, {
  rootPadding: string;
  headerPy: string;
  headerBorder: string;
  dotsMt: string;
  dotsButtonP: string;
  trackMt: string;
  footerMt: string;
  footerPadding: string;
  footerGap: string;
  startBrawlPy: string;
  backToTitlePy: string;
}> = {
  tight: {
    rootPadding: 'px-2 py-1.5',
    headerPy: 'py-1',
    headerBorder: 'border-b-2',
    dotsMt: 'mt-1',
    dotsButtonP: 'p-1.5',
    trackMt: 'mt-1',
    footerMt: 'mt-1',
    footerPadding: 'p-1',
    footerGap: 'gap-1',
    startBrawlPy: 'py-1.5',
    backToTitlePy: 'py-1',
  },
  medium: {
    rootPadding: 'px-2 py-2',
    headerPy: 'py-2',
    headerBorder: 'border-b-2',
    dotsMt: 'mt-2',
    dotsButtonP: 'p-2',
    trackMt: 'mt-2',
    footerMt: 'mt-2',
    footerPadding: 'p-2',
    footerGap: 'gap-1.5',
    startBrawlPy: 'py-2',
    backToTitlePy: 'py-1.5',
  },
  roomy: {
    rootPadding: 'px-3 py-3',
    headerPy: 'py-3',
    headerBorder: 'border-b-4',
    dotsMt: 'mt-4',
    dotsButtonP: 'p-2.5',
    trackMt: 'mt-4',
    footerMt: 'mt-4',
    footerPadding: 'p-3',
    footerGap: 'gap-3',
    startBrawlPy: 'py-3',
    backToTitlePy: 'py-2.5',
  },
};

interface DossierProps {
  char: CharacterInfo;
  id?: string;
  portraitWrapRef?: React.Ref<HTMLDivElement>;
  portraitSize?: number | null;
  tier: SpacingTier;
  extraSpacing?: number;
}

// The px equivalents of each tier's own padding/gap classes above. Phase 4
// grows continuously from whichever tier actually settled, rather than
// treating the roomiest tier as a ceiling — the tiers are three coarse
// steps, and a screen with real slack left over usually can't afford the
// whole next step but can easily afford part of one. Growing from the
// settled tier's own baseline is what turns those three fixed choices
// into continuous, measured growth of the same real properties.
const TIER_BASE_PX: Record<SpacingTier, { pad: number; gap: number; leading: number }> = {
  tight: { pad: 4, gap: 4, leading: 1.25 },
  medium: { pad: 6, gap: 8, leading: 1.375 },
  roomy: { pad: 12, gap: 12, leading: 1.625 },
};
const STATS_PAD_PX: Record<SpacingTier, number> = { tight: 6, medium: 8, roomy: 12 };

/**
 * One fighter's dossier card. Rendered three at a time (previous / current /
 * next) side by side inside the sliding track below, so a drag reveals the
 * neighboring fighter's *actual* card rather than a static decoration.
 *
 * `portraitSize` (portrait orientation only) is a measured pixel value, not
 * a CSS trick: nested flexbox "shrink to fill whatever's left, but never
 * below a sibling's content size" turns out to need the shrinkable item's
 * automatic minimum removed at exactly the right ancestor level — get that
 * wrong and either the image balloons past its parent (clipped invisibly
 * by the card's overflow-hidden, so quote/special-move/footer just vanish)
 * or a fixed-size sibling (the badge) overflows the image's shrunk box and
 * prints on top of the name below it. Measuring the real leftover space in
 * JS and setting a plain pixel size sidesteps both failure modes.
 */
const Dossier: React.FC<DossierProps> = ({ char, id, portraitWrapRef, portraitSize, tier, extraSpacing }) => {
  const theme = charColors[char.id];
  const sp = DOSSIER_SPACING[tier];
  const circleStyle: React.CSSProperties | undefined =
    portraitSize != null ? { width: portraitSize, height: portraitSize } : undefined;
  // Continuous growth on top of whichever tier settled — the same real
  // padding/gap/line-height the tiers themselves grow, never a separate
  // blank space. Vertical padding only, so no box's width changes and
  // text wrapping stays exactly as the tier left it.
  const extra = extraSpacing ?? 0;
  const base = TIER_BASE_PX[tier];
  const extraLineHeight = Math.min(extra * 0.004, 0.35);
  const infoColumnGapStyle: React.CSSProperties | undefined = extra > 0 ? { gap: base.gap + extra } : undefined;
  const statsPadStyle: React.CSSProperties | undefined =
    extra > 0 ? { paddingTop: STATS_PAD_PX[tier] + extra, paddingBottom: STATS_PAD_PX[tier] + extra } : undefined;
  const quoteStyle: React.CSSProperties | undefined =
    extra > 0
      ? { paddingTop: base.pad + extra, paddingBottom: base.pad + extra, lineHeight: base.leading + extraLineHeight }
      : undefined;
  const specialPadStyle: React.CSSProperties | undefined =
    extra > 0 ? { paddingTop: base.pad + extra, paddingBottom: base.pad + extra } : undefined;
  const specialDescStyle: React.CSSProperties | undefined =
    extra > 0 ? { lineHeight: base.leading + extraLineHeight } : undefined;
  return (
    <div
      id={id}
      className={`w-full flex flex-col bg-[#0d0718] portrait:bg-transparent border-3 portrait:border-0 border-[#ff00ff] rounded-xl portrait:rounded-none shadow-[0_0_30px_rgba(255,0,255,0.5)] portrait:shadow-none ${sp.padding} landscape:p-2 relative overflow-hidden gap-4 landscape:gap-2`}
    >
      {/* Top Arcade Marquee Header Bar — dropped in portrait per the
          redesign mockup; the landscape dossier keeps it. */}
      <div className="portrait:hidden flex justify-between items-center bg-[#240038] border-b-2 border-[#ff00ff] -mx-4 landscape:-mx-2 -mt-4 landscape:-mt-2 p-2.5 landscape:p-1 px-4 landscape:px-2 mb-1 landscape:mb-0">
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

      <div className={`flex flex-col landscape:flex-row items-center ${sp.rowGap} landscape:gap-4 w-full`}>
        {/* Portrait column — landscape gives it a dedicated column with
            nothing else in it; the nav arrows live at the screen's own
            edges (rendered by the parent, aligned to this column). */}
        <div className={`flex flex-col items-center ${sp.portraitBlockGap} landscape:gap-1.5 landscape:shrink-0 landscape:w-36`}>
          <div ref={portraitWrapRef} className={`relative flex items-center justify-center w-full ${sp.portraitWrapPy} landscape:py-0`}>
            <div
              style={circleStyle}
              className={`landscape:w-28 landscape:h-28 w-44 h-44 rounded-full border-4 landscape:border-2 ${theme.border} p-1.5 landscape:p-1 bg-black ${theme.portraitGlow} overflow-hidden relative`}
            >
              {char.portraitUrl && (
                <img
                  src={char.portraitUrl}
                  alt={char.name}
                  referrerPolicy="no-referrer"
                  draggable={false}
                  className="w-full h-full object-cover object-top rounded-full filter brightness-110 pointer-events-none"
                />
              )}
            </div>
          </div>
          <span className={`shrink-0 bg-[#ff00ff] text-black text-xs landscape:text-[9px] font-black px-3 landscape:px-2 ${sp.badgePy} landscape:py-0.5 rounded-full border border-white font-mono shadow-md uppercase tracking-wider landscape:mt-0 whitespace-nowrap`}>
            1P CHAMPION
          </span>
        </div>

        {/* Info column — name/archetype, stats, quote, special move.
            landscape:flex-row on the top row puts the name+archetype
            beside the stat bars instead of stacking them above; portrait
            keeps the original vertical stack. */}
        <div
          className={`flex flex-col ${sp.infoColumnGap} landscape:gap-1.5 w-full landscape:flex-1 landscape:min-w-0`}
          style={infoColumnGapStyle}
        >
          <div className={`flex flex-col landscape:flex-row landscape:items-center ${sp.topRowGap} landscape:gap-3 w-full`}>
            <div className="text-center landscape:text-left landscape:shrink-0">
              <h2 className={`text-3xl landscape:text-lg font-black italic uppercase tracking-tight landscape:whitespace-nowrap ${theme.text}`}>{char.name}</h2>
              <p className="text-sm landscape:text-[10px] text-amber-400 font-mono font-bold italic mt-0.5 landscape:mt-0 landscape:whitespace-nowrap">{char.archetype}</p>
            </div>

            {/* Stat Progress Bars — same bars, same math, as desktop */}
            <div
              className={`bg-[#120a21] border border-[#ff00ff]/50 ${sp.statsPadding} landscape:p-1.5 rounded-lg ${sp.statsSpaceY} landscape:space-y-1 w-full landscape:flex-1 landscape:min-w-0 shadow-inner`}
              style={statsPadStyle}
            >
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
          </div>

          {/* Character Quote Box */}
          <p
            className={`text-xs landscape:text-[10px] text-zinc-200 font-mono italic bg-[#170c2a] ${sp.quotePadding} landscape:p-1.5 border border-[#3b1e5d] rounded-md text-left ${sp.quoteLeading} landscape:leading-snug w-full`}
            style={quoteStyle}
          >
            "{char.quote}"
          </p>

          {/* Special Move Banner */}
          <div className={`bg-[#18092a] ${sp.specialPadding} landscape:p-1.5 border-l-4 landscape:border-l-2 border-[#00ffff] rounded-r-md text-left w-full`} style={specialPadStyle}>
            <span className="text-[10px] landscape:text-[8px] text-[#00ffff] font-mono font-bold uppercase block tracking-wider">SPECIAL OVERDRIVE ATTACK</span>
            <span className="font-black text-sm landscape:text-xs text-white uppercase font-mono block">{char.powerMoveName}</span>
            <p
              className={`text-xs landscape:text-[10px] text-zinc-300 font-mono ${sp.specialLeading} landscape:leading-snug mt-0.5 landscape:mt-0.5`}
              style={specialDescStyle}
            >
              {char.powerMoveDesc}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Mobile is SOLO-only (see the desktop CharacterSelect's own breakpoint
 * gate), so this reuses every piece of that screen's dossier as-is — the
 * marquee bar, the stat bars, the quote box, the special move banner, the
 * footer buttons — down to the same class strings. The one thing that
 * actually needs to differ for a phone is how the roster is browsed: the
 * desktop's grid-of-four-cards-below-the-dossier costs a full extra
 * screen's height of scrolling here. A carousel puts browsing and the
 * dossier in the same place — dragging the dossier itself, or tapping the
 * arrows at the screen's edges, changes which fighter is in it.
 */
export const CharacterSelectMobile: React.FC<CharacterSelectMobileProps> = ({ onSelect, onBack }) => {
  const roster = Object.values(CHARACTERS);
  const [index, setIndex] = useState(0);

  const char = roster[index];
  const prevChar = roster[(index - 1 + roster.length) % roster.length];
  const nextChar = roster[(index + 1) % roster.length];

  const go = useCallback(
    (delta: number) => {
      sound.playSelect();
      setIndex((prev) => (prev + delta + roster.length) % roster.length);
    },
    [roster.length],
  );

  const handleStart = () => {
    sound.playStageClear();
    onSelect(char.id, undefined, 'SINGLE');
  };

  // ---- Carousel: real drag tracking + a slide animation for both swipes
  // and arrow taps, instead of an instant content swap.
  //
  // The transform transition below is armed ONLY for the duration of a
  // deliberate slide (a released swipe or an arrow tap) via `animate` +
  // onTransitionEnd — never left on by default. It used to be "on unless
  // dragging", which also fired it on a bare viewport resize (trackWidth
  // changing when the phone rotates): the whole track would visibly glide
  // to its new position over 260ms instead of snapping there, and the
  // arrow-alignment measurement below would sample mid-glide and settle on
  // the wrong number. ----
  const trackWrapRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [instant, setInstant] = useState(false);
  const dragStartX = useRef(0);
  const dragXRef = useRef(0);
  const activePointer = useRef<number | null>(null);
  const busyRef = useRef(false);
  const pendingCommit = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = trackWrapRef.current;
    if (!el) return;
    const measure = () => setTrackWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const settle = useCallback(
    (direction: number | null) => {
      if (!trackWidth) {
        if (direction) go(direction);
        setDragX(0);
        return;
      }
      if (direction === null) {
        busyRef.current = true;
        pendingCommit.current = null;
        setAnimate(true);
        setDragX(0);
        return;
      }
      busyRef.current = true;
      pendingCommit.current = direction;
      setAnimate(true);
      setDragX(-direction * trackWidth);
    },
    [trackWidth, go],
  );

  const onTrackTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.propertyName !== 'transform') return;
    setAnimate(false);
    const direction = pendingCommit.current;
    pendingCommit.current = null;
    if (direction !== null) {
      setInstant(true);
      go(direction);
      setDragX(0);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setInstant(false);
          busyRef.current = false;
        });
      });
    } else {
      busyRef.current = false;
    }
  };

  const handleArrow = (direction: number) => {
    if (busyRef.current) return;
    settle(direction);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (busyRef.current || !trackWidth) return;
    activePointer.current = e.pointerId;
    dragStartX.current = e.clientX;
    dragXRef.current = 0;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== e.pointerId) return;
    dragXRef.current = e.clientX - dragStartX.current;
    setDragX(dragXRef.current);
  };

  // Reads dragXRef (not the `dragX` state) — consecutive pointer events can
  // be dispatched faster than React re-renders between them (seen with
  // high-frequency touch sampling, and with synthetic test events fired
  // back-to-back), which would otherwise leave this closure holding a
  // stale, pre-drag `dragX` and silently drop the swipe.
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
    setDragging(false);
    const finalDragX = dragXRef.current;
    const threshold = Math.max(48, trackWidth * 0.15);
    if (finalDragX <= -threshold) {
      settle(1);
    } else if (finalDragX >= threshold) {
      settle(-1);
    } else {
      settle(null);
    }
  };

  const trackOffset = trackWidth ? -trackWidth + dragX : 0;
  const slideStyle: React.CSSProperties = { width: trackWidth || '100%' };

  // ---- Nav arrows: pinned to the screen's own edges, vertically centered
  // on the portrait image regardless of orientation. ----
  const rootRef = useRef<HTMLDivElement>(null);
  const portraitWrapRef = useRef<HTMLDivElement>(null);
  const [arrowTop, setArrowTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    const wrap = portraitWrapRef.current;
    const root = rootRef.current;
    if (!wrap || !root) return;
    let rafA = 0;
    let rafB = 0;
    const recalc = () => {
      const p = wrap.getBoundingClientRect();
      const r = root.getBoundingClientRect();
      setArrowTop(p.top - r.top + p.height / 2);
    };
    // A ResizeObserver on the portrait wrapper itself (rather than piggy-
    // backing on trackWidth) is what catches the landscape/portrait swap —
    // its own size changes the instant the orientation media query flips.
    // Two follow-up measurements on later frames guard against any other
    // layout still settling in the same tick (e.g. a sibling reflow).
    const recalcSettled = () => {
      recalc();
      cancelAnimationFrame(rafA);
      cancelAnimationFrame(rafB);
      rafA = requestAnimationFrame(() => {
        recalc();
        rafB = requestAnimationFrame(recalc);
      });
    };
    const ro = new ResizeObserver(recalcSettled);
    ro.observe(wrap);
    ro.observe(root);
    recalcSettled();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafA);
      cancelAnimationFrame(rafB);
    };
  }, []);

  // ---- Portrait-mode hero size: measured, not guessed — and, per the
  // DIRETIVA MÁXIMA, decided ONCE and never revisited downward.
  //
  // Every other size in this screen is fixed (the fonts are a floor that
  // must not shrink); the portrait image is the one element that's free to
  // grow or shrink, and it needs to land on whatever value makes the whole
  // card's natural height exactly match the root's available height. A
  // real phone's visible height varies enormously with the browser chrome
  // (the address bar never auto-hides here, since the page itself never
  // scrolls) — sizing the image for one assumed viewport height is what
  // caused this to still overflow on shorter/chrome-visible viewports.
  //
  // The relationship between the circle's size and the card's total
  // natural height is a simple 1:1 addition (nothing else in the layout
  // reacts to the circle's size), so a single measurement converges
  // exactly: available - (current total height - current circle size)
  // gives the exact circle size that makes the total height fit.
  //
  // Spacing is dynamic too (see the tiers above), and that's exactly what
  // went wrong the first time this was tried: growing the spacing shrinks
  // how much height is left for everything else, including the portrait,
  // if both are solved for at once. So they aren't solved at once, and now
  // there's a third phase besides — a spacing tier only ever spends room
  // in small, discrete jumps, so on a screen tall enough it can settle on
  // "roomy" (the most generous tier) while a large, genuinely dead gap
  // still sits below the footer. Phase 3 below closes exactly that gap by
  // growing the portrait again — never spacing — since spacing tiers are
  // meant to read as deliberate breathing room, not stretch to arbitrary
  // amounts, while a bigger hero image only ever looks better.
  //
  // Phase 1 computes portraitSize against the tightest spacing tier ONLY —
  // the same value this screen already shipped with — and locks it as a
  // FLOOR via portraitLockedRef. Phase 2 then tries roomier spacing tiers
  // against that floor, falling back a tier at a time if one doesn't fit.
  // Phase 3 takes whatever tier phase 2 settled on and, if there's still
  // slack beyond it, grows the (already-floored) portrait to absorb it.
  // Every phase can only push portraitSize up from here on — never down.
  const PORTRAIT_SIZE_MIN = 48;
  const PORTRAIT_SIZE_SOFT_MAX = 240; // phase 1's cap, before spacing gets a turn
  const PORTRAIT_SIZE_HARD_MAX = 640; // phase 3's cap, once spacing is maxed too
  const PORTRAIT_SIZE_DEFAULT = 176; // matches the landscape/desktop w-44 fallback
  const [portraitSize, setPortraitSize] = useState<number | null>(null);
  const portraitSizeRef = useRef<number | null>(null);
  portraitSizeRef.current = portraitSize;
  const portraitLockedRef = useRef(false);
  const tierSettledRef = useRef(false);
  const filledRef = useRef(false);
  const lastSizeRef = useRef<{ w: number; h: number } | null>(null);

  // Phase 4: once the portrait is capped by its own width safety limit
  // (see below) with the spacing tier already at 'roomy', real vertical
  // slack can still be unspent — a tall-but-narrow phone has far more
  // spare height than width. That slack keeps growing the same real
  // properties the tiers already grow (box padding, the gap between
  // boxes, line-height) rather than stopping at 'roomy' as a hard
  // ceiling. Never a separate blank spacer — always more room inside
  // elements that already exist.
  const [extraSpacing, setExtraSpacing] = useState(0);
  const extraSpacingRef = useRef(0);
  extraSpacingRef.current = extraSpacing;
  const spacingFilledRef = useRef(false);

  const TIER_FALLBACK: SpacingTier[] = ['roomy', 'medium', 'tight'];
  const [tier, setTier] = useState<SpacingTier>('tight');
  const tierRef = useRef<SpacingTier>('tight');
  tierRef.current = tier;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let rafA = 0;
    let rafB = 0;
    const recalc = () => {
      if (!window.matchMedia('(orientation: portrait)').matches) {
        if (portraitSizeRef.current !== null) setPortraitSize(null);
        if (tierRef.current !== 'tight') setTier('tight');
        if (extraSpacingRef.current !== 0) setExtraSpacing(0);
        portraitLockedRef.current = false;
        tierSettledRef.current = false;
        filledRef.current = false;
        spacingFilledRef.current = false;
        return;
      }
      const footer = root.querySelector('footer');
      if (!footer) return;
      // root.scrollHeight is the wrong signal here: per spec it's
      // max(content height, clientHeight) — when the content is SHORTER
      // than the box (exactly the case we're fixing towards), it silently
      // reports clientHeight instead of the true, tighter content extent,
      // which made this always converge back to the CSS default. The
      // footer's own bottom edge relative to root's top is the real
      // end-of-content measurement regardless of which side it falls on.
      // root.clientHeight is the content-box height (border excluded); the
      // footer's rect is border-box/viewport-relative, so it has to be
      // measured from root's content-box top (root's own top border offset
      // by root.clientTop), not root's border-box top, or every reading is
      // off by the border width.
      const available = root.clientHeight;
      const rootContentTop = root.getBoundingClientRect().top + root.clientTop;
      const totalNow = footer.getBoundingClientRect().bottom - rootContentTop;
      // A few px of deliberate slack: sub-pixel layout rounding (fractional
      // font metrics, border/content-box conversions) means this can land
      // a couple of px optimistic. Erring small avoids a scroll; erring
      // big defeats the entire point of measuring in the first place.
      const SAFETY_MARGIN = 16;

      if (!portraitLockedRef.current) {
        // Phase 1: establish the portrait's floor under the tightest
        // spacing — from here on it is a floor, never a fixed value.
        if (tierRef.current !== 'tight') {
          setTier('tight');
          return;
        }
        const currentCircle = portraitSizeRef.current ?? PORTRAIT_SIZE_DEFAULT;
        const fixedHeight = totalNow - currentCircle;
        const next = Math.min(PORTRAIT_SIZE_SOFT_MAX, Math.max(PORTRAIT_SIZE_MIN, Math.round(available - fixedHeight - SAFETY_MARGIN)));
        if (portraitSizeRef.current === null || Math.abs(portraitSizeRef.current - next) > 1) {
          setPortraitSize(next);
          return;
        }
        portraitLockedRef.current = true;
        if (next < PORTRAIT_SIZE_SOFT_MAX - 1) {
          // The portrait absorbed every bit of available room on its own —
          // nothing left over for spacing or further growth to spend.
          tierSettledRef.current = true;
          filledRef.current = true;
          return;
        }
        // The portrait capped out with room to spare; let phase 2 try to
        // spend it on breathing room, roomiest first.
        setTier('roomy');
        return;
      }

      if (!tierSettledRef.current) {
        // Phase 2: the portrait floor is locked. Confirm the current
        // tier's spacing still fits above it; if not, fall back a tier
        // and re-check — never touching the portrait floor itself.
        if (totalNow <= available - SAFETY_MARGIN) {
          tierSettledRef.current = true;
        } else {
          const idx = TIER_FALLBACK.indexOf(tierRef.current);
          if (idx >= 0 && idx < TIER_FALLBACK.length - 1) {
            setTier(TIER_FALLBACK[idx + 1]);
          } else {
            tierSettledRef.current = true; // already at 'tight'; nothing further to fall back to
          }
          return;
        }
      }

      if (!filledRef.current) {
        // Phase 3: the spacing tier is settled. Spend whatever's still
        // left over by growing the (already-floored) portrait further —
        // this is what actually closes a large dead gap at the bottom
        // instead of just leaving it once a tier happens to "fit". Capped
        // by width too, not just PORTRAIT_SIZE_HARD_MAX: a tall-but-narrow
        // phone has plenty of vertical slack but nowhere near 640px of
        // width, and letting the circle outgrow the screen's width sends
        // the card into horizontal overflow — which then measures as an
        // ever-changing footer position, so this never converges at all.
        const current = portraitSizeRef.current ?? PORTRAIT_SIZE_DEFAULT;
        const widthCap = Math.floor(root.clientWidth * 0.62);
        const hardMax = Math.min(PORTRAIT_SIZE_HARD_MAX, widthCap);
        const slack = available - totalNow - SAFETY_MARGIN;
        const next = Math.min(hardMax, Math.max(current, Math.round(current + slack)));
        if (next - current > 1) {
          setPortraitSize(next);
          return;
        }
        filledRef.current = true;
      }

      if (filledRef.current && !spacingFilledRef.current) {
        // Phase 4: the portrait hit its own width-safety ceiling (phase 3
        // above) before the vertical slack that produced it ran out — a
        // tall-but-narrow phone has far more spare height than width.
        // Keep growing the same real padding/gap/line-height the tiers
        // themselves grow, continuously from whichever tier settled,
        // rather than treating the tiers' three coarse steps as a
        // ceiling: a screen with slack left usually can't afford a whole
        // next step but can easily afford part of one. Vertical padding
        // only (top/bottom, never left/right) so it can't change any
        // box's width and perturb text wrapping — that keeps the
        // relationship between extraSpacing and height exact: 3 boxes'
        // padding-top + padding-bottom (6) plus 2 gaps between them (2)
        // = 8px of height per 1px of extraSpacing, solvable directly
        // instead of creeping toward it.
        const remainingSlack = available - totalNow - SAFETY_MARGIN;
        if (remainingSlack > 1) {
          const nextExtra = extraSpacingRef.current + Math.round(remainingSlack / 8);
          if (nextExtra > extraSpacingRef.current) {
            setExtraSpacing(nextExtra);
            return;
          }
        }
        spacingFilledRef.current = true;
      }
    };
    const recalcSettled = () => {
      recalc();
      cancelAnimationFrame(rafA);
      cancelAnimationFrame(rafB);
      rafA = requestAnimationFrame(() => {
        recalc();
        rafB = requestAnimationFrame(recalc);
      });
    };
    // A genuine resize (rotation, address bar showing/hiding) invalidates
    // every phase above — re-derive from scratch for the new available
    // height. Re-runs of this same effect triggered by its OWN setTier
    // calls (the [tier] dependency below) must NOT reset any of them, or
    // phase 2's tier search would restart phase 1 on every attempt.
    //
    // ResizeObserver is not a reliable enough signal for "did it change"
    // on its own here: observed in practice re-firing on root every frame
    // with the exact same contentRect, seemingly triggered by this same
    // effect's own setState-driven layout passes rather than any genuine
    // size change — which reset every phase back to phase 1 each time and
    // produced a permanent oscillation between two portrait sizes instead
    // of ever settling. Comparing against the last actually-seen size
    // filters that out; a real resize still updates it and still resets.
    const lastSize = lastSizeRef;
    const checkForResize = () => {
      const w = root.clientWidth;
      const h = root.clientHeight;
      const last = lastSize.current;
      if (last && Math.abs(last.w - w) < 1 && Math.abs(last.h - h) < 1) {
        return;
      }
      lastSize.current = { w, h };
      portraitLockedRef.current = false;
      tierSettledRef.current = false;
      filledRef.current = false;
      spacingFilledRef.current = false;
      recalcSettled();
    };
    const ro = new ResizeObserver(checkForResize);
    ro.observe(root);
    lastSize.current = { w: root.clientWidth, h: root.clientHeight };
    recalcSettled();
    // Real fullscreen on Android Chrome isn't atomic: the address bar
    // animates out over the following few hundred ms as it engages, and
    // ResizeObserver doesn't reliably fire for every step of that
    // animation on every device — root.clientHeight can end up read (and
    // locked in) mid-transition, before the space it actually settles
    // into exists yet. A few delayed re-checks after mount, plus one right
    // on the Fullscreen API's own change event, catch whatever the
    // observer missed; checkForResize is a no-op if the size genuinely
    // hasn't moved, so this doesn't add jank on a device where the first
    // reading was already final.
    const settleTimers = [150, 400, 800, 1500].map((delay) => window.setTimeout(checkForResize, delay));
    document.addEventListener('fullscreenchange', checkForResize);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafA);
      cancelAnimationFrame(rafB);
      settleTimers.forEach((id) => window.clearTimeout(id));
      document.removeEventListener('fullscreenchange', checkForResize);
    };
  }, [tier]);

  const rs = ROOT_SPACING[tier];
  // The arrows sit outside the sliding track, so they take their accent from
  // whichever fighter is currently centred rather than from a card of their own.
  const arrowTheme = charColors[char.id];

  return (
    // landscape:justify-start pairs with overflow-y-auto (the safety net -
    // present regardless, matching the title screen) so a device where the
    // landscape sizing below still doesn't quite fit falls back to a scroll
    // instead of hiding content, rather than justify-between spreading
    // things across a height that isn't really there.
    //
    // h-full only, with no minimum-height utility alongside it. The one that
    // used to be here resolved to a 100vh minimum — the large viewport, which
    // ignores the browser's address bar. The parent screen container is sized
    // with h-dvh (the address-bar-aware height); a 100vh *minimum* on top of
    // that forced this root taller than the actually-visible viewport on a
    // real phone whenever the address bar was showing, producing a vertical
    // scroll that a headless viewport (which has no address bar to shrink)
    // never reproduces.
    //
    // Described rather than named on purpose: Tailwind's scanner reads comment
    // text as eagerly as it reads className strings, so spelling the class out
    // here put it straight back into the bundle it had just been removed from.
    <div
      ref={rootRef}
      className={`relative w-full h-full bg-[#0a0a0a] text-white flex flex-col justify-start ${rs.rootPadding} landscape:px-1.5 landscape:py-1.5 select-none font-sans overflow-y-auto border-2 border-[#ff00ff]/10`}
    >
      {/* Top Header — identical to desktop's, minus the mode selector: mobile
          has nothing to choose there, it is always SOLO. */}
      <header className={`shrink-0 flex flex-col justify-between items-center px-3 landscape:px-2 ${rs.headerPy} landscape:py-1 bg-[#1a1a1a] ${rs.headerBorder} landscape:border-b-2 border-[#ff00ff] gap-2 landscape:gap-0`}>
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
      <div className={`shrink-0 flex justify-center gap-0.5 ${rs.dotsMt} landscape:mt-1`}>
        {roster.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setIndex(i)}
            className={`${rs.dotsButtonP} landscape:p-1.5 flex items-center justify-center`}
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

      {/* Fighter Dossier carousel track — three cards wide (prev / current /
        * next), dragged or tapped one card at a time. overflow-hidden here
        * is what turns "three cards side by side" into "one visible card
        * with the others revealed by motion". */}
      <div
        ref={trackWrapRef}
        className={`shrink-0 ${rs.trackMt} landscape:mt-1 overflow-hidden touch-pan-y cursor-grab active:cursor-grabbing`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="flex items-stretch"
          onTransitionEnd={onTrackTransitionEnd}
          style={{
            width: trackWidth ? trackWidth * 3 : '300%',
            transform: `translate3d(${trackOffset}px,0,0)`,
            transition: animate && !dragging && !instant ? `transform ${SLIDE_MS}ms cubic-bezier(0.22,1,0.36,1)` : 'none',
          }}
        >
          <div className="shrink-0" style={slideStyle}>
            <Dossier char={prevChar} portraitSize={portraitSize} tier={tier} extraSpacing={extraSpacing} />
          </div>
          <div className="shrink-0" style={slideStyle}>
            <Dossier
              char={char}
              id="selected-fighter-banner"
              portraitWrapRef={portraitWrapRef}
              portraitSize={portraitSize}
              tier={tier}
              extraSpacing={extraSpacing}
            />
          </div>
          <div className="shrink-0" style={slideStyle}>
            <Dossier char={nextChar} portraitSize={portraitSize} tier={tier} extraSpacing={extraSpacing} />
          </div>
        </div>
      </div>

      {/* Bottom Action Footer — same buttons/classes as desktop's, minus the
          bottom accent line in portrait, to reclaim vertical room for the
          hero art above. */}
      <footer className={`shrink-0 ${rs.footerMt} landscape:mt-1 bg-black ${rs.footerPadding} landscape:p-1.5 border-t-4 landscape:border-t-2 portrait:border-t-0 border-[#00ffff] flex flex-col landscape:flex-row ${rs.footerGap} landscape:gap-1.5`}>
        <button
          onClick={handleStart}
          className={`w-full px-8 ${rs.startBrawlPy} landscape:py-1.5 bg-[#ff00ff] hover:bg-[#d400d4] text-black font-black text-sm landscape:text-xs uppercase italic tracking-wider flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(255,0,255,0.4)] active:scale-95 transition-[background-color,transform] cursor-pointer`}
        >
          START BRAWL <Play className="w-4 h-4 landscape:w-3.5 landscape:h-3.5 fill-current" />
        </button>
        <button
          onClick={onBack}
          className={`w-full px-5 ${rs.backToTitlePy} landscape:py-1.5 bg-[#1a1a1a] hover:bg-[#222] border-2 border-[#333] text-zinc-300 font-black text-xs landscape:text-[10px] uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap`}
        >
          ◄ BACK TO TITLE
        </button>
      </footer>

      {/* Carousel nav — arrows at the screen's own edges, vertically
          centered on the portrait, styled like the rest of the game's UI
          (cyan neon border + glow) instead of a generic overlay button. */}
      <button
        onClick={() => handleArrow(-1)}
        aria-label="Previous fighter"
        style={arrowTop === null ? undefined : { top: arrowTop }}
        className={`absolute left-1.5 landscape:left-1 -translate-y-1/2 z-30 p-2.5 landscape:p-1.5 rounded-full bg-[#110826]/90 border-2 ${arrowTheme.border} ${arrowTheme.text} ${arrowTheme.arrowGlow} active:scale-90 active:bg-[#1f103f] transition-[background-color,transform]`}
      >
        <ChevronLeft className="w-6 h-6 landscape:w-4 landscape:h-4" />
      </button>
      <button
        onClick={() => handleArrow(1)}
        aria-label="Next fighter"
        style={arrowTop === null ? undefined : { top: arrowTop }}
        className={`absolute right-1.5 landscape:right-1 -translate-y-1/2 z-30 p-2.5 landscape:p-1.5 rounded-full bg-[#110826]/90 border-2 ${arrowTheme.border} ${arrowTheme.text} ${arrowTheme.arrowGlow} active:scale-90 active:bg-[#1f103f] transition-[background-color,transform]`}
      >
        <ChevronRight className="w-6 h-6 landscape:w-4 landscape:h-4" />
      </button>
    </div>
  );
};
