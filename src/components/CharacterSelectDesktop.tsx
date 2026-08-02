import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { useGamepadMenu, useGamepadPlayerMenus } from '../hooks/useGamepadMenu';
import { MenuAction, connectedGamepadCount, subscribeGamepadConnection } from '../game/gamepad';
import { CharacterId, GameMode } from '../types';
import { CHARACTERS } from '../game/characterData';
import { Users, Bot, UserCheck, Play, User } from 'lucide-react';
import { sound } from '../game/sound';

interface CharacterSelectDesktopProps {
  onSelect: (p1: CharacterId, p2?: CharacterId, mode?: GameMode) => void;
  onBack: () => void;
}

export const CharacterSelectDesktop: React.FC<CharacterSelectDesktopProps> = ({ onSelect, onBack }) => {
  const [selectedP1, setSelectedP1] = useState<CharacterId>('FEET_MASTER');
  const [selectedP2, setSelectedP2] = useState<CharacterId | null>(null);
  const [mode, setMode] = useState<GameMode>('SINGLE');
  const [activeSlot, setActiveSlot] = useState<'P1' | 'P2'>('P1');

  const charColors: Record<CharacterId, { border: string; text: string; shadow: string; bar: string }> = {
    FEET_MASTER: {
      border: 'border-[#00ffff]',
      text: 'text-[#00ffff]',
      shadow: 'shadow-[0_0_20px_rgba(0,255,255,0.3)]',
      bar: 'bg-[#00ffff]',
    },
    FUN_MAKER: {
      border: 'border-[#ff00ff]',
      text: 'text-[#ff00ff]',
      shadow: 'shadow-[0_0_20px_rgba(255,0,255,0.3)]',
      bar: 'bg-[#ff00ff]',
    },
    OMEGA_BIKER: {
      border: 'border-[#ffff00]',
      text: 'text-[#ffff00]',
      shadow: 'shadow-[0_0_20px_rgba(255,255,0,0.3)]',
      bar: 'bg-[#ffff00]',
    },
    ANGRY_CORSO: {
      border: 'border-[#ff4e00]',
      text: 'text-[#ff4e00]',
      shadow: 'shadow-[0_0_20px_rgba(255,78,0,0.3)]',
      bar: 'bg-[#ff4e00]',
    },
  };

  const charList = Object.values(CHARACTERS);

  // Keyboard navigation support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === '1' && charList[0]) selectCharacterForActiveSlot(charList[0].id);
      if (k === '2' && charList[1]) selectCharacterForActiveSlot(charList[1].id);
      if (k === '3' && charList[2]) selectCharacterForActiveSlot(charList[2].id);
      if (k === '4' && charList[3]) selectCharacterForActiveSlot(charList[3].id);
      // Arrows mirror the pad axes described below — left/right walks the
      // roster, up/down changes mode — rather than moving a focus ring between
      // buttons the way they do on every other screen. Here the arrows already
      // mean something, and a player switching between keyboard and controller
      // should not have to learn two different answers for the same key.
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
        e.preventDefault();
        const action =
          k === 'ArrowLeft'
            ? 'LEFT'
            : k === 'ArrowRight'
              ? 'RIGHT'
              : k === 'ArrowUp'
                ? 'UP'
                : 'DOWN';
        applyMenuAction(action, mode === 'SINGLE' ? 'P1' : activeSlot, true);
      }
      if (k === 'Tab' && mode !== 'SINGLE') {
        e.preventDefault();
        setActiveSlot((prev) => (prev === 'P1' ? 'P2' : 'P1'));
      }
      if (k === 'Enter') {
        handleStart();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, activeSlot, selectedP1, selectedP2]);

  // Gamepad navigation. There is no separate cursor: moving the stick changes
  // the active slot's selection directly, mirroring how the number keys work.
  // Every axis on this screen is spoken for, so the assignment is declared in
  // one place rather than grown a case at a time:
  //
  //   left / right   roster
  //   up / down      game mode — previously unreachable with a controller
  //   LB / RB        active player slot, the keyboard's Tab
  //   A / Start      begin
  //   B              back
  //
  // Slot switching moved off the vertical axis because mode has three values
  // and slot has two: cycling the longer list deserves the stick, and the
  // binary toggle fits a button.
  const MODE_ORDER: GameMode[] = ['SINGLE', 'AI_COMPANION', 'COOP'];

  // Two controllers means two people choosing at once; below that there is one
  // cursor and everything drives it.
  const padCount = useSyncExternalStore(subscribeGamepadConnection, connectedGamepadCount, () => 0);
  const twoPadsConnected = padCount >= 2;

  /**
   * One menu action, applied to a named slot.
   *
   * Pulled out of the hook so the same logic can serve two callers: the shared
   * cursor, driven by the keyboard and by a lone controller, and one stream per
   * player when two controllers are connected.
   */
  const applyMenuAction = (action: MenuAction, slot: 'P1' | 'P2', shared: boolean) => {
    if (action === 'LEFT' || action === 'RIGHT') {
      const current = slot === 'P1' ? selectedP1 : selectedP2;
      const at = charList.findIndex((c) => c.id === current);
      const step = action === 'RIGHT' ? 1 : -1;
      const next = charList[(at + step + charList.length) % charList.length];
      if (next) selectCharacterForSlot(next.id, slot, shared);
      return;
    }
    if (action === 'UP' || action === 'DOWN') {
      const at = MODE_ORDER.indexOf(mode);
      const step = action === 'DOWN' ? 1 : -1;
      const next = MODE_ORDER[(at + step + MODE_ORDER.length) % MODE_ORDER.length];
      setMode(next);
      // Leaving a two-player mode must not strand the cursor on P2, nor leave a
      // stale P2 highlight on the roster card.
      if (next === 'SINGLE') {
        setActiveSlot('P1');
        setSelectedP2(null);
      }
      sound.playSelect();
      return;
    }
    if (action === 'TOGGLE') {
      // Only meaningful for the shared cursor. A player with their own pad is
      // already locked to their own slot.
      if (shared && mode !== 'SINGLE') {
        setActiveSlot((prev) => (prev === 'P1' ? 'P2' : 'P1'));
        sound.playSelect();
      }
      return;
    }
    if (action === 'CONFIRM' || action === 'START') {
      handleStart();
      return;
    }
    if (action === 'BACK') {
      if (shared && mode !== 'SINGLE' && activeSlot === 'P2') {
        setActiveSlot('P1');
        sound.playSelect();
      } else {
        onBack();
      }
    }
  };

  // Shared cursor: keyboard, and any controller while there is only one.
  useGamepadMenu(
    (action) => applyMenuAction(action, mode === 'SINGLE' ? 'P1' : activeSlot, true),
    !twoPadsConnected
  );

  // One stream per player once both controllers are present, so each person
  // moves their own selection instead of both fighting over one cursor.
  useGamepadPlayerMenus(
    (player, action) => applyMenuAction(action, player === 2 ? 'P2' : 'P1', false),
    mode === 'COOP',
    twoPadsConnected && mode !== 'SINGLE'
  );

  /**
   * Sets a fighter for a named slot.
   *
   * `advanceCursor` is what makes one-input selection flow: choosing P1 moves
   * the shared cursor on to P2. A player with their own controller must not
   * trigger it — they are only ever choosing their own fighter, and moving the
   * cursor would drag the other person's selection with it.
   */
  const selectCharacterForSlot = (
    charId: CharacterId,
    slot: 'P1' | 'P2',
    advanceCursor = false
  ) => {
    sound.playPunch();
    if (mode === 'SINGLE' || slot === 'P1') {
      setSelectedP1(charId);
      if (advanceCursor && mode !== 'SINGLE') setActiveSlot('P2');
    } else {
      setSelectedP2(charId);
    }
  };

  const selectCharacterForActiveSlot = (charId: CharacterId) =>
    selectCharacterForSlot(charId, mode === 'SINGLE' ? 'P1' : activeSlot, true);

  const handleStart = () => {
    sound.playStageClear();
    onSelect(selectedP1, selectedP2 || undefined, mode);
  };

  /* The 100vh minimum-height utility that used to sit on this element is
   * gone. It was inert here: this file only ever renders on desktop —
   * CharacterSelect picks between it and CharacterSelectMobile by device,
   * not by width — and on a desktop browser 100vh and the h-dvh root it
   * lives inside resolve to the same number.
   *
   * Removed anyway, because inert is not the same as harmless. The one
   * device that can reach this file *and* has an address bar that retracts
   * is a tablet the device test reads as desktop; there a 100vh minimum
   * would force this screen taller than its own container and push the
   * footer under the browser chrome. h-full against a definite parent is
   * the honest height either way, and overflow-y-auto still catches
   * anything genuinely too tall.
   *
   * (Described rather than named: Tailwind's scanner reads comment text as
   * eagerly as className strings, so spelling the class out here would emit
   * it straight back into the bundle it was just removed from.) */
  /* The bottom inset is a shrinkable child rather than padding on this
   * element, and the reason is a scrollbar that scrolled to nothing.
   *
   * Padding on a scroll container counts toward scrollHeight but sits below
   * every child, so on a viewport where the content ends a few pixels short
   * of the fold the browser still offered a scrollbar — and everything it
   * scrolled to was blank. Measured on a 1920x1200 panel at the 125% scaling
   * Windows defaults to for a 16in screen, which is a 1536x960 viewport: 16px
   * of scroll, all of it inside 24px of bottom padding, with the footer
   * already fully visible.
   *
   * As the last flex child the same 24px is content, so it can shrink when
   * the space is not there and stay put when it is. Nothing is smaller at any
   * size that fitted before; the inset simply stops manufacturing scroll it
   * has nothing to show. */
  return (
    <div className="relative w-full h-full bg-[#0a0a0a] text-white flex flex-col justify-between px-2 pt-2 sm:px-4 sm:pt-4 md:px-6 md:pt-6 select-none font-sans overflow-y-auto border-2 sm:border-8 md:border-[12px] border-[#ff00ff]/10">
      {/* Top Header - Controls & Mode Selector */}
      <header className="flex flex-col md:flex-row justify-between items-center px-3 py-2.5 sm:px-6 sm:py-4 bg-[#1a1a1a] border-b-4 border-[#ff00ff] gap-3 sm:gap-4">
        <div>
          <span className="text-[#00ffff] font-mono text-[10px] sm:text-xs tracking-tighter uppercase">
            SYSTEM STATUS: RADICAL REBEL SELECT
          </span>
          <h1 className="text-xl sm:text-2xl md:text-4xl font-black italic uppercase tracking-tighter leading-none mt-0.5">
            SELECT YOUR FIGHTERS<span className="text-[#ff00ff]">.</span>
          </h1>
        </div>

        {/* Game Mode Selector */}
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
          <div className="flex bg-[#111] p-1 border-2 border-[#333] gap-1 w-full sm:w-auto justify-center">
            <button
              onClick={() => {
                sound.playPunch();
                setMode('SINGLE');
                setSelectedP2(null);
                setActiveSlot('P1');
              }}
              className={`px-2.5 sm:px-3 py-1.5 text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer ${
                mode === 'SINGLE' ? 'bg-[#ff00ff] text-black shadow-md' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" /> 1P SOLO
            </button>
            <button
              onClick={() => {
                sound.playPunch();
                setMode('AI_COMPANION');
                if (!selectedP2) setSelectedP2('FUN_MAKER');
                setActiveSlot('P2');
              }}
              className={`px-2.5 sm:px-3 py-1.5 text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer ${
                mode === 'AI_COMPANION' ? 'bg-[#00ffff] text-black shadow-md' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Bot className="w-3.5 h-3.5" /> 1P + AI BUDDY
            </button>
            <button
              onClick={() => {
                sound.playPunch();
                setMode('COOP');
                if (!selectedP2) setSelectedP2('OMEGA_BIKER');
                setActiveSlot('P2');
              }}
              className={`px-2.5 sm:px-3 py-1.5 text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer ${
                mode === 'COOP' ? 'bg-[#ffff00] text-black shadow-md' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" /> 2P CO-OP
            </button>
          </div>
        </div>
      </header>


      {/* Active Selection Target Tabs (Only shown in 2P / AI companion modes) */}
      {mode !== 'SINGLE' && (
        <div className="mt-3 bg-[#141414] border-2 border-[#333] p-2 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 text-[10px] sm:text-xs font-mono text-zinc-400">
            <span className="text-[#00ffff] font-bold">CLICK TAB TO SWITCH SELECTING SLOT:</span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => {
                sound.playPunch();
                setActiveSlot('P1');
              }}
              className={`flex-1 sm:flex-none px-3 py-1.5 text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 border-2 transition-all cursor-pointer ${
                activeSlot === 'P1'
                  ? 'bg-[#ff00ff] text-black border-white shadow-[0_0_15px_rgba(255,0,255,0.6)] animate-pulse'
                  : 'bg-[#1a1a1a] text-zinc-300 border-[#ff00ff]/40 hover:border-[#ff00ff]'
              }`}
            >
              <User className="w-3.5 h-3.5" /> P1: {CHARACTERS[selectedP1].name}{' '}
              {activeSlot === 'P1' && <span className="bg-black text-white text-[9px] px-1 py-0.5 rounded font-mono">CHOOSING</span>}
            </button>

            <button
              onClick={() => {
                sound.playPunch();
                setActiveSlot('P2');
              }}
              className={`flex-1 sm:flex-none px-3 py-1.5 text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 border-2 transition-all cursor-pointer ${
                activeSlot === 'P2'
                  ? 'bg-[#00ffff] text-black border-white shadow-[0_0_15px_rgba(0,255,255,0.6)] animate-pulse'
                  : 'bg-[#1a1a1a] text-zinc-300 border-[#00ffff]/40 hover:border-[#00ffff]'
              }`}
            >
              {mode === 'AI_COMPANION' ? <Bot className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
              {mode === 'AI_COMPANION' ? 'AI BUDDY' : 'P2'}: {selectedP2 ? CHARACTERS[selectedP2].name : 'NONE'}{' '}
              {activeSlot === 'P2' && <span className="bg-black text-white text-[9px] px-1 py-0.5 rounded font-mono">CHOOSING</span>}
            </button>
          </div>
        </div>
      )}

      {/* Hero Fighter Showcase Banner (Expanded Vertical Height Arcade Dossier) */}
      {(() => {
        const featuredChar = CHARACTERS[selectedP1];
        const theme = charColors[selectedP1];
        const p2Char = selectedP2 ? CHARACTERS[selectedP2] : CHARACTERS['FUN_MAKER'];

        return (
          <div
            id="selected-fighter-banner"
            className="mt-4 shrink-0 bg-[#0d0718] border-3 sm:border-4 border-[#ff00ff] rounded-xl shadow-[0_0_30px_rgba(255,0,255,0.5)] p-4 sm:p-5 relative overflow-hidden flex flex-col justify-between gap-3"
          >
            {/* Banner Main Body — horizontal strip
              *
              * Laid across rather than stacked. The dossier and the roster
              * cards below carry the same six facts about the same fighter,
              * and stacking both meant the page ran past one screen while the
              * portraits were squeezed to fit. Reading in columns keeps every
              * text and returns the height to the cards.
              */}
            {mode === 'SINGLE' ? (
              <div className="flex flex-col md:flex-row items-center md:items-stretch gap-4 w-full py-1">
                {/* Large Fighter Portrait Stage */}
                <div className="relative shrink-0 flex flex-col items-center justify-center">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-[#00ffff] p-1.5 bg-black shadow-[0_0_25px_rgba(0,255,255,0.6)] overflow-hidden relative">
                    {featuredChar.portraitUrl && (
                      <img
                        src={featuredChar.portraitUrl}
                        alt={featuredChar.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover object-top rounded-full filter brightness-110"
                      />
                    )}
                  </div>
                  <span className="mt-2 bg-[#ff00ff] text-black text-[10px] font-black px-2.5 py-0.5 rounded-full border border-white font-mono shadow-md uppercase tracking-wider">
                    1P CHAMPION
                  </span>
                </div>

                {/* Character Meta & Stats */}
                <div className="flex-1 min-w-0 w-full flex flex-col justify-center gap-2 text-center md:text-left">
                  <div>
                    <h2 className={`text-2xl sm:text-3xl font-black italic uppercase tracking-tight leading-none ${theme.text}`}>
                      {featuredChar.name}
                    </h2>
                    <p className="text-xs text-amber-400 font-mono font-bold italic mt-0.5">{featuredChar.archetype}</p>
                  </div>

                  {/* Stat Progress Bars */}
                  <div className="bg-[#120a21] border border-[#ff00ff]/50 p-2.5 rounded-lg space-y-1.5 shadow-inner">
                    <div className="flex justify-between items-center gap-3 text-[11px] font-mono text-zinc-300">
                      <span className="font-bold text-[#ff00ff]">POWER</span>
                      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
                        <div className="h-full bg-[#ff00ff]" style={{ width: `${(featuredChar.stats.power / 5) * 100}%` }} />
                      </div>
                    </div>
                    <div className="flex justify-between items-center gap-3 text-[11px] font-mono text-zinc-300">
                      <span className="font-bold text-[#00ffff]">DEFENSE</span>
                      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
                        <div className="h-full bg-[#00ffff]" style={{ width: `${(featuredChar.stats.defense / 5) * 100}%` }} />
                      </div>
                    </div>
                    <div className="flex justify-between items-center gap-3 text-[11px] font-mono text-zinc-300">
                      <span className="font-bold text-[#ffff00]">SPEED</span>
                      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
                        <div className="h-full bg-[#ffff00]" style={{ width: `${(featuredChar.stats.speed / 5) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quote and Special Move, side by side with the stats */}
                <div className="flex-[1.2] min-w-0 w-full flex flex-col justify-center gap-2">
                  {/* Character Quote Box */}
                  <p className="text-xs text-zinc-200 font-mono italic bg-[#170c2a] p-2.5 border border-[#3b1e5d] rounded-md text-left leading-relaxed">
                    "{featuredChar.quote}"
                  </p>

                  {/* Special Move Banner */}
                  <div className="bg-[#18092a] p-2.5 border-l-4 border-[#00ffff] rounded-r-md text-left">
                    <span className="text-[10px] text-[#00ffff] font-mono font-bold uppercase block tracking-wider">SPECIAL OVERDRIVE ATTACK</span>
                    <span className="font-black text-sm text-white uppercase font-mono">{featuredChar.powerMoveName}</span>
                    <p className="text-[11px] text-zinc-300 font-mono leading-normal mt-1">{featuredChar.powerMoveDesc}</p>
                  </div>
                </div>
              </div>
            ) : (
              /* Dual Matchup Header for 2P / AI Companion mode */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 items-center py-2">
                {/* P1 Slot Box */}
                <div
                  onClick={() => setActiveSlot('P1')}
                  className={`bg-[#180829] border-2 ${
                    activeSlot === 'P1' ? 'border-[#ff00ff] shadow-[0_0_20px_rgba(255,0,255,0.4)]' : 'border-[#333]'
                  } p-4 flex items-center gap-4 rounded-lg cursor-pointer transition-all min-h-[120px]`}
                >
                  <div className="w-20 h-20 rounded-full border-2 border-[#ff00ff] bg-black overflow-hidden shrink-0 shadow-md">
                    {featuredChar.portraitUrl && <img src={featuredChar.portraitUrl} alt={featuredChar.name} className="w-full h-full object-cover object-top" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-mono font-bold text-[#ff00ff]">PLAYER 1</span>
                      {activeSlot === 'P1' && <span className="text-[10px] bg-[#ff00ff] text-black font-bold px-2 py-0.5 rounded uppercase">SELECTING</span>}
                    </div>
                    <h3 className="text-xl font-black text-[#00ffff] italic uppercase truncate">{featuredChar.name}</h3>
                    <p className="text-xs text-zinc-300 font-mono truncate mt-1">Special: {featuredChar.powerMoveName}</p>
                  </div>
                </div>

                {/* P2 / AI Slot Box */}
                <div
                  onClick={() => setActiveSlot('P2')}
                  className={`bg-[#180829] border-2 ${
                    activeSlot === 'P2' ? 'border-[#00ffff] shadow-[0_0_20px_rgba(0,255,255,0.4)]' : 'border-[#333]'
                  } p-4 flex items-center gap-4 rounded-lg cursor-pointer transition-all min-h-[120px]`}
                >
                  <div className="w-20 h-20 rounded-full border-2 border-[#00ffff] bg-black overflow-hidden shrink-0 shadow-md">
                    {p2Char.portraitUrl && <img src={p2Char.portraitUrl} alt={p2Char.name} className="w-full h-full object-cover object-top" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-mono font-bold text-[#00ffff]">
                        {mode === 'AI_COMPANION' ? 'AI BUDDY' : 'PLAYER 2'}
                      </span>
                      {activeSlot === 'P2' && <span className="text-[10px] bg-[#00ffff] text-black font-bold px-2 py-0.5 rounded uppercase">SELECTING</span>}
                    </div>
                    <h3 className="text-xl font-black text-[#ffff00] italic uppercase truncate">{p2Char.name}</h3>
                    <p className="text-xs text-zinc-300 font-mono truncate mt-1">Special: {p2Char.powerMoveName}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Main Character Cards Grid
        *
        * The "CHOOSE FROM ROSTER BELOW" divider that used to sit here was
        * removed: with the dossier immediately above and the cards immediately
        * below, it labelled something already obvious and cost a row of height
        * the cards needed.
        */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 mb-1">
        {charList.map((char, index) => {
          const isP1 = selectedP1 === char.id;
          const isP2 = selectedP2 === char.id;
          const theme = charColors[char.id];

          return (
            <div
              key={char.id}
              onClick={() => selectCharacterForActiveSlot(char.id)}
              className={`relative flex flex-col group border-4 bg-[#111] p-4 transition-all cursor-pointer overflow-hidden ${
                isP1 && isP2
                  ? 'border-purple-400 shadow-[0_0_25px_rgba(255,0,255,0.6)]'
                  : isP1
                  ? 'border-[#ff00ff] shadow-[0_0_20px_rgba(255,0,255,0.4)]'
                  : isP2
                  ? 'border-[#00ffff] shadow-[0_0_20px_rgba(0,255,255,0.4)]'
                  : 'border-[#333] hover:border-zinc-400'
              }`}
            >
              {/* Badge Indicators for P1 & P2 */}
              <div className="absolute top-2 right-2 flex flex-col gap-1 items-end z-20">
                {isP1 && (
                  <div className="px-2 py-0.5 bg-[#ff00ff] text-black text-[10px] font-black tracking-widest uppercase shadow">
                    P1 SELECTED
                  </div>
                )}
                {isP2 && (
                  <div className="px-2 py-0.5 bg-[#00ffff] text-black text-[10px] font-black tracking-widest uppercase shadow">
                    {mode === 'AI_COMPANION' ? 'AI BUDDY' : 'P2 SELECTED'}
                  </div>
                )}
              </div>

              {/* Character Card Header with Large Arcade Portrait Banner
                *
                * Square, because the art is square. A fixed 144px band against
                * a 512x512 source meant object-cover filled the width and threw
                * the rest away, and object-top anchored the crop so everything
                * below the face was the part discarded. Matching the frame to
                * the source shows the whole illustration and spends the empty
                * vertical space the screen already had.
                */}
              <div className="relative w-full aspect-square bg-[#000] border-b-2 border-[#333] group-hover:border-[#ff00ff] overflow-hidden mb-3 transition-colors">
                {char.portraitUrl ? (
                  <img
                    src={char.portraitUrl}
                    alt={char.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover filter brightness-95 group-hover:brightness-110 group-hover:scale-105 transition-all duration-300"
                  />
                ) : (
                  <div className="w-full h-full bg-[#1a1a1a] flex items-center justify-center text-zinc-600 font-mono text-xs">
                    NO PORTRAIT
                  </div>
                )}

                <div
                  className="absolute inset-0 pointer-events-none opacity-40"
                  style={{
                    background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.4) 50%)',
                    backgroundSize: '100% 4px',
                  }}
                />

                <div className="absolute inset-0 bg-gradient-to-t from-[#111] via-transparent to-transparent opacity-90" />

                <div className="absolute bottom-2 left-2 right-2">
                  <h2 className={`text-2xl font-black italic uppercase leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] ${theme.text}`}>
                    {char.name}
                  </h2>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-300 font-mono font-bold mt-0.5">
                    {char.archetype}
                  </div>
                </div>
              </div>

              {/* Explicit Assign Buttons in 2P / AI Mode */}
              {mode !== 'SINGLE' ? (
                <div className="flex gap-2 mb-3 z-20">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      sound.playPunch();
                      setSelectedP1(char.id);
                    }}
                    className={`flex-1 py-1 px-1.5 text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                      isP1
                        ? 'bg-[#ff00ff] text-black border-white'
                        : 'bg-black text-[#ff00ff] border-[#ff00ff]/50 hover:border-[#ff00ff] hover:bg-[#ff00ff]/20'
                    }`}
                  >
                    {isP1 ? '✓ P1 SET' : 'SET P1'}
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      sound.playPunch();
                      setSelectedP2(char.id);
                    }}
                    className={`flex-1 py-1 px-1.5 text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                      isP2
                        ? 'bg-[#00ffff] text-black border-white'
                        : 'bg-black text-[#00ffff] border-[#00ffff]/50 hover:border-[#00ffff] hover:bg-[#00ffff]/20'
                    }`}
                  >
                    {isP2 ? (mode === 'AI_COMPANION' ? '✓ AI SET' : '✓ P2 SET') : mode === 'AI_COMPANION' ? 'SET AI' : 'SET P2'}
                  </button>
                </div>
              ) : (
                <p className="text-xs leading-relaxed text-gray-300 italic mb-3 line-clamp-3">
                  {char.origin}
                </p>
              )}

              {/* Stats Bars */}
              <div className="flex-1 space-y-2 font-mono text-xs mb-3">
                <div className="flex justify-between items-end">
                  <span className="text-[10px] text-gray-400">POWER</span>
                  <div className="w-28 h-2 bg-[#222] border border-zinc-800 flex">
                    <div className={`h-full ${theme.bar}`} style={{ width: `${(char.stats.power / 5) * 100}%` }} />
                  </div>
                </div>

                <div className="flex justify-between items-end">
                  <span className="text-[10px] text-gray-400">DEFENSE</span>
                  <div className="w-28 h-2 bg-[#222] border border-zinc-800 flex">
                    <div className={`h-full ${theme.bar}`} style={{ width: `${(char.stats.defense / 5) * 100}%` }} />
                  </div>
                </div>

                <div className="flex justify-between items-end">
                  <span className="text-[10px] text-gray-400">SPEED</span>
                  <div className="w-28 h-2 bg-[#222] border border-zinc-800 flex">
                    <div className={`h-full ${theme.bar}`} style={{ width: `${(char.stats.speed / 5) * 100}%` }} />
                  </div>
                </div>
              </div>

              {/* Numbering */}
              <div className="absolute bottom-1 right-2 text-4xl font-black text-zinc-800 select-none pointer-events-none opacity-20">
                0{index + 1}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Action Footer */}
      <div className="flex flex-col min-h-0">
        <footer className="bg-black px-4 pb-4 pt-1 flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
        <button
          onClick={onBack}
          className="px-5 py-2.5 bg-[#1a1a1a] hover:bg-[#222] border-2 border-[#333] text-zinc-300 font-black text-xs uppercase tracking-wider transition-colors cursor-pointer"
        >
          ◄ BACK TO TITLE
        </button>

        <div className="text-xs font-mono text-zinc-400 text-center">
          {mode !== 'SINGLE' ? (
            <span>💡 Click <strong className="text-[#ff00ff]">SET P1</strong> or <strong className="text-[#00ffff]">SET P2</strong> on any character card, or press <kbd className="bg-zinc-800 px-1 py-0.5 text-white">TAB</kbd> to switch target player</span>
          ) : (
            <span>💡 Click any character or press keys <kbd className="bg-zinc-800 px-1 py-0.5 text-white">1-4</kbd> to select</span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleStart}
            className="px-8 py-3 bg-[#ff00ff] hover:bg-[#d400d4] text-black font-black text-sm uppercase italic tracking-wider flex items-center gap-2 shadow-[0_0_15px_rgba(255,0,255,0.4)] active:scale-95 transition-all cursor-pointer"
          >
            START BRAWL <Play className="w-4 h-4 fill-current" />
          </button>
        </div>
        </footer>

        {/* The bottom inset. See the note above the container. It lives inside
          * this wrapper rather than as a sibling of the footer because the
          * container distributes its slack with justify-between: a fifth child
          * would have divided that slack across four gaps instead of three and
          * pulled every section 14px closer together. Wrapped, the container
          * still sees four children and the arrangement above is untouched. */}
        <div aria-hidden="true" className="h-2 sm:h-4 md:h-6 shrink min-h-0" />
      </div>
    </div>
  );
};


