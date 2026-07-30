/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  GameScreen,
  CharacterId,
  GameMode,
  PlayerInput,
  GameSettings,
  DialogueLine,
} from './types';
import { STAGES } from './game/stageData';
import { GameEngine } from './game/engine';
import { GameCanvas } from './components/GameCanvas';
import { OnScreenControls } from './components/OnScreenControls';
import { KeyboardHints } from './components/KeyboardHints';
import { RotateDevicePrompt } from './components/RotateDevicePrompt';
import { AttractMode } from './components/AttractMode';
import IntroSequence from './components/IntroSequence';
import { readPlayerPads, resetPadAssignments, mergeInputs } from './game/gamepad';
import { resolveKeyBinding } from './game/keyboard';
import { useGamepadMenu } from './hooks/useGamepadMenu';
import { applyMenuNavigation, useMenuFocusReset } from './hooks/useMenuNavigation';
import { CharacterSelect } from './components/CharacterSelect';
import { useIsMobileDevice } from './hooks/useDeviceType';
import { useIsPortrait } from './hooks/useOrientation';
import { DialogueOverlay } from './components/DialogueOverlay';
import { BarkOverlay } from './components/BarkOverlay';
import { StageClearScreen } from './components/StageClearScreen';
import { GameOverModal } from './components/GameOverModal';
import { GameHeader } from './components/GameHeader';
import { LoreCodex } from './components/LoreCodex';
import { CustomAudioModal } from './components/CustomAudioModal';
import { DifficultyModal } from './components/DifficultyModal';
import { sound } from './game/sound';
import { Play, BookOpen, Award, Disc, Gauge } from 'lucide-react';

// Kept module-level: useSyncExternalStore resubscribes on every render if the
// accessors are recreated.
const subscribeAudioUnlock = (onChange: () => void) => sound.subscribeUnlock(onChange);
const getAudioUnlocked = () => sound.isAudioUnlocked();

/** Idle time on the title screen before the cabinet returns to attract mode. */
const IDLE_RETURN_MS = 45_000;

const NEUTRAL_INPUT: PlayerInput = {
  left: false,
  right: false,
  up: false,
  down: false,
  punch: false,
  kick: false,
  special: false,
  jump: false,
  grab: false,
};

export default function App() {
  const [screen, setScreen] = useState<GameScreen>('ATTRACT');
  const [currentStageIdx, setCurrentStageIdx] = useState(0);

  const [p1Char, setP1Char] = useState<CharacterId>('FEET_MASTER');
  const [p2Char, setP2Char] = useState<CharacterId | undefined>(undefined);
  const [gameMode, setGameMode] = useState<GameMode>('SINGLE');

  const [settings, setSettings] = useState<GameSettings>({
    soundEnabled: true,
    musicEnabled: true,
    volume: 0.5,
    crtFilter: true,
    showHitboxes: false,
    difficulty: 'NORMAL',
  });

  const audioUnlocked = useSyncExternalStore(subscribeAudioUnlock, getAudioUnlocked, getAudioUnlocked);

  // Engine instance counter. engineRef is a ref, so replacing it neither
  // triggers a render nor re-runs effects. Restarting the current stage leaves
  // both `screen` and `currentStageIdx` untouched, so without this the
  // subscription below would stay attached to the discarded engine.
  const [engineVersion, setEngineVersion] = useState(0);
  const [activeDialogue, setActiveDialogue] = useState<DialogueLine[] | null>(null);
  const [activeBark, setActiveBark] = useState<DialogueLine | null>(null);

  const [isPaused, setIsPaused] = useState(false);
  const [showCodex, setShowCodex] = useState(false);
  // Touch controls exist for phones without a keyboard. On desktop the
  // fighter is keyboard-only — the D-pad and action buttons duplicated keys
  // that were already there, cluttering the corner with clickable circles
  // nobody used, since a mouse cannot hold a direction and press an attack at
  // once. Everything else on screen — the header buttons, pause, codex,
  // jukebox — stays mouse-operable; only the fighter's own controls move to
  // keyboard alone.
  const isMobile = useIsMobileDevice();
  const isPortrait = useIsPortrait();
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [showDifficultyModal, setShowDifficultyModal] = useState(false);

  const engineRef = useRef<GameEngine | null>(null);

  // Keyboard controls state
  const [inputP1, setInputP1] = useState<PlayerInput>(NEUTRAL_INPUT);
  const [inputP2, setInputP2] = useState<PlayerInput>(NEUTRAL_INPUT);
  // Captured when the campaign ends: the victory screen outlives the engine
  // instance that recorded it.
  const [sayonaraKilled, setSayonaraKilled] = useState(false);

  // Handle Keyboard Listener
  useEffect(() => {
    // One dispatch for press and release, so a binding can never exist on one
    // side and be missing from the other.
    const applyKey = (e: KeyboardEvent, held: boolean) => {
      const binding = resolveKeyBinding(e.code, e.key, gameModeRef.current === 'COOP');
      if (!binding) return;

      const setter = binding.player === 1 ? setInputP1 : setInputP2;
      setter((prev) => ({ ...prev, [binding.field]: held }));
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      sound.initCtx(); // Unlock web audio context on keyboard interaction
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      const k = e.key.toLowerCase();
      if (k === 'p' || e.key === 'Escape') {
        setIsPaused((prev) => !prev);
        return;
      }

      const isArrow = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k);
      const inMatch = screenRef.current === 'GAMEPLAY' && !isPausedRef.current;

      // Suppress the browser's own handling of the game keys while a match is
      // running: the arrows scroll the page and Space activates whatever button
      // holds focus, and both belong to the document rather than to a game
      // using those keys to move and jump.
      if (inMatch) {
        if (e.code === 'Space' || isArrow) e.preventDefault();
      }

      // Off the field, the arrows drive menu navigation.
      //
      // This was gamepad-only: `applyMenuNavigation` was wired to the pad
      // poller and nothing ever called it from a key event, so a player without
      // a controller was left with Tab and Enter — which the browser provides
      // for free and which nobody expects to be the whole story on an arcade
      // title screen. Character select is excluded because it owns the arrows
      // for its own purpose there, changing the highlighted fighter rather than
      // moving a focus ring between buttons.
      if (!inMatch && isArrow && screenRef.current !== 'CHAR_SELECT') {
        e.preventDefault();
        const action =
          k === 'arrowup'
            ? 'UP'
            : k === 'arrowdown'
              ? 'DOWN'
              : k === 'arrowleft'
                ? 'LEFT'
                : 'RIGHT';
        applyMenuNavigation(action);
        return;
      }

      applyKey(e, true);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      applyKey(e, false);
    };

    const handleBlur = () => {
      setInputP1(NEUTRAL_INPUT);
      setInputP2(NEUTRAL_INPUT);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Mirror the engine's dialogue into React state. The engine lives outside the
  // React cycle, so clearing the field there does not unmount the overlay.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) {
      setActiveDialogue(null);
      return;
    }
    setActiveDialogue(engine.activeDialogue);
    return engine.subscribeDialogue(() => setActiveDialogue(engine.activeDialogue));
  }, [engineVersion]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) {
      setActiveBark(null);
      return;
    }
    setActiveBark(engine.activeBark);
    return engine.subscribeBark(() => setActiveBark(engine.activeBark));
  }, [engineVersion]);

  // Requests fullscreen on the first real user gesture, then stops
  // listening. Deliberately not inside AttractMode's own insert-coin
  // handler: that screen unmounts on the very same tap, tearing its
  // listeners down before a touch's pointerup fires. Mounted here instead,
  // for the whole app's lifetime, so that natural pointerup still lands.
  //
  // pointerup rather than pointerdown: per the HTML spec, pointerdown only
  // counts as an activation-triggering event for mouse pointerType — touch
  // needs pointerup (or touchend). Using pointerdown here, matching how
  // AttractMode's own coin-insert and the audio-unlock arm() below listen,
  // is what silently failed on Android Chrome. keydown covers keyboard.
  useEffect(() => {
    const requestFs = () => {
      window.removeEventListener('pointerup', requestFs);
      window.removeEventListener('keydown', requestFs);
      document.documentElement.requestFullscreen?.().catch(() => {});
    };
    window.addEventListener('pointerup', requestFs);
    window.addEventListener('keydown', requestFs);
    return () => {
      window.removeEventListener('pointerup', requestFs);
      window.removeEventListener('keydown', requestFs);
    };
  }, []);

  // An abandoned cabinet goes back to attracting. Without this the attract
  // sequence would only ever be seen once per session.
  useEffect(() => {
    if (screen !== 'TITLE') return;

    let timerId = 0;
    const arm = () => {
      window.clearTimeout(timerId);
      timerId = window.setTimeout(() => setScreen('ATTRACT'), IDLE_RETURN_MS);
    };

    arm();
    window.addEventListener('pointerdown', arm);
    window.addEventListener('keydown', arm);
    return () => {
      window.clearTimeout(timerId);
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
    };
  }, [screen]);

  // Release every controller slot whenever the game comes back to a menu.
  //
  // Assignments are already cleared when a match starts, but a slot held by a
  // controller that was switched off mid-session survived until then. Clearing
  // on the way out as well means returning to the title is enough to start
  // over: whatever is switched on and pressed next claims a slot fresh.
  useEffect(() => {
    if (screen === 'TITLE' || screen === 'ATTRACT') {
      resetPadAssignments();
    }
  }, [screen]);

  // Modals change the navigable set; drop stale focus when that happens.
  // Every overlay that carries `data-gamepad-scope` has to appear in this key.
  //
  // It used to be screen and pause state only, so opening the codex or the
  // jukebox changed which elements were navigable without the effect noticing:
  // focus stayed on the button behind the overlay, `applyMenuNavigation` could
  // not find it in the new scope, and confirm spent itself moving focus instead
  // of pressing anything. Closing them left focus on an element that no longer
  // existed, costing another press.
  useMenuFocusReset(
    `${screen}:${isPaused}:${showCodex}:${showAudioModal}:${showDifficultyModal}`,
    screen !== 'GAMEPLAY' || isPaused || showCodex || showAudioModal || showDifficultyModal
  );

  const gameRootRef = useRef<HTMLDivElement>(null);

  const focusContainer = () => {
    if (gameRootRef.current) {
      gameRootRef.current.focus();
    }
    try {
      window.focus();
    } catch {
      // ignore
    }
  };

  // Ensure focus when entering GAMEPLAY or screen change
  useEffect(() => {
    focusContainer();
  }, [screen]);

  // Screen background music.
  //
  // GAME_OVER and VICTORY had no branch here, and stopBgm only ran when the
  // player clicked away — so the boss theme kept hammering underneath the defeat
  // screen while they decided whether to continue.
  useEffect(() => {
    if (screen === 'INTRO') {
      // The sequence plays its own track through the shared AudioContext; the
      // screen theme would sit on top of it at a different tempo.
      sound.stopBgm();
      return;
    }
    if (screen === 'ATTRACT' || screen === 'TITLE') {
      // Asking for the theme on ATTRACT costs nothing while audio is still
      // locked: playBgm arms the unlock and stays silent. Once a coin has been
      // inserted earlier in the session, the same call brings the music back —
      // so the first attract loop is silent and later ones are not.
      sound.playBgm('INTRO');
    } else if (screen === 'CHAR_SELECT') {
      sound.playBgm('CHAR_SELECT');
    } else if (screen === 'GAME_OVER') {
      sound.playBgm('GAME_OVER');
    } else if (screen === 'VICTORY') {
      sound.playBgm('VICTORY');
    }
  }, [screen]);

  const inputRef = useRef<PlayerInput>(inputP1);
  const inputP2Ref = useRef<PlayerInput>(inputP2);
  // The key handler is installed once, so it reads the current mode through a
  // ref rather than closing over a value from the render it was created in.
  const gameModeRef = useRef<GameMode>(gameMode);
  // The key handler is installed once and runs on every screen, so it reads the
  // current one through a ref to know when the game keys are in play.
  const screenRef = useRef<GameScreen>(screen);
  const isPausedRef = useRef<boolean>(isPaused);
  useEffect(() => {
    inputRef.current = inputP1;
  }, [inputP1]);

  useEffect(() => {
    inputP2Ref.current = inputP2;
  }, [inputP2]);

  useEffect(() => {
    gameModeRef.current = gameMode;
  }, [gameMode]);

  useEffect(() => {
    screenRef.current = screen;
    isPausedRef.current = isPaused;
  }, [screen, isPaused]);

  // Main Gameplay Update Loop using requestAnimationFrame for smooth 60fps execution
  useEffect(() => {
    if (screen !== 'GAMEPLAY' || isPaused) return;

    let animFrameId: number;
    let lastTime = performance.now();
    const targetFps = 60;
    const interval = 1000 / targetFps;

    const gameLoop = (currentTime: number) => {
      animFrameId = requestAnimationFrame(gameLoop);
      const delta = currentTime - lastTime;

      if (delta >= interval) {
        lastTime = currentTime - (delta % interval);

        if (engineRef.current) {
          // Pause physics updates if active dialogue overlay is open
          if (!engineRef.current.activeDialogue) {
            // Polled here rather than in React state: the Gamepad API reports
            // no button events, so reading it through setState would re-render
            // the tree every frame.
            // Assignment is stable across frames and keyed by the browser's
            // pad index, so a device announcing itself late or briefly idling
            // no longer swaps which fighter each person is driving.
            const pads = readPlayerPads(gameMode === 'COOP');

            // In co-op, player two is always a person: the keyboard half plus
            // whichever controller holds that slot. Passing an input object
            // rather than undefined is what stops the engine falling through to
            // the AI companion — which is the difference between "2P CO-OP" and
            // "1P + AI BUDDY", and until now the two modes played identically
            // whenever a second controller was missing.
            const coop = gameMode === 'COOP';
            const p2Input = coop
              ? mergeInputs(inputP2Ref.current, pads.p2)
              : (pads.p2 ?? undefined);

            engineRef.current.update(mergeInputs(inputRef.current, pads.p1), p2Input);
          }

          // Victory is checked before stage clear.
          //
          // On the final stage both flags can rise on the same frame, and stage
          // clear winning meant the campaign ended on a screen offering a NEXT
          // STAGE that does not exist.
          if (engineRef.current.bossDefeated) {
            setSayonaraKilled(engineRef.current.sayonaraKilled);
            setScreen('VICTORY');
          } else if (engineRef.current.stageCleared) {
            setScreen('STAGE_CLEAR');
          } else if (engineRef.current.gameOver) {
            setScreen('GAME_OVER');
          }
        }
      }
    };

    animFrameId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animFrameId);
  }, [screen, isPaused, gameMode]);

  const startStage = (
    stageIdx: number,
    p1Override?: CharacterId,
    p2Override?: CharacterId,
    settingsOverride?: GameSettings
  ) => {
    const p1 = p1Override ?? p1Char;
    const p2 = p2Override !== undefined ? p2Override : p2Char;
    const stage = STAGES[stageIdx];
    engineRef.current = new GameEngine(
      stage,
      p1,
      p2,
      settingsOverride ?? settings,
      gameMode === 'COOP'
    );
    // Slots are not inherited between matches: co-op and solo assign them
    // differently, and a stale assignment would survive the mode change.
    resetPadAssignments();
    setEngineVersion((v) => v + 1);
    setCurrentStageIdx(stageIdx);
    setScreen('GAMEPLAY');
  };

  const handleSelectFighter = (p1: CharacterId, p2?: CharacterId, mode?: GameMode) => {
    setP1Char(p1);
    setP2Char(p2);
    if (mode) setGameMode(mode);
    // Difficulty is chosen from the title screen's own modal now, not passed
    // through this screen, so `settings` already holds whatever the player
    // picked and there is nothing left to reconcile here.
    startStage(0, p1, p2, settings);
  };

  const handleNextStage = () => {
    if (currentStageIdx < STAGES.length - 1) {
      startStage(currentStageIdx + 1);
    } else {
      setScreen('VICTORY');
    }
  };

  // Inserting the coin and starting the match are separate actions, as on a
  // cabinet. The coin leaves attract mode; START begins the match.
  const handleInsertCoin = () => {
    sound.playCoin();
    // The coin is the user gesture that unlocks audio, which is why the intro
    // sits here rather than ahead of it: run before the gesture and the browser
    // refuses to start the track, and the whole sequence plays silent.
    setScreen('INTRO');
  };

  const handleStartBrawl = () => {
    sound.playStart();
    setScreen('CHAR_SELECT');
  };

  // Gamepad navigation for every screen except CHAR_SELECT, which owns its own
  // cursor and handles it internally.
  useGamepadMenu(
    (action) => {
      // An open overlay owns the controller.
      //
      // Without this the screen-level shortcuts below fired straight through
      // it: pressing start with the codex open began the match behind the
      // codex, and confirm fell through to the same handler whenever focus was
      // not on one of the overlay's own buttons.
      if (showCodex || showAudioModal || showDifficultyModal) {
        if (action === 'BACK') {
          setShowCodex(false);
          setShowAudioModal(false);
          setShowDifficultyModal(false);
          return;
        }
        applyMenuNavigation(action);
        return;
      }

      if (screen === 'ATTRACT') {
        // Every button is the coin slot here, matching keyboard and touch.
        handleInsertCoin();
        return;
      }
      if (screen === 'TITLE') {
        // START always begins the match; the rest walks the buttons, so the
        // jukebox and the codex are reachable with a controller.
        if (action === 'START') return handleStartBrawl();
        if (!applyMenuNavigation(action) && action === 'CONFIRM') handleStartBrawl();
        return;
      }
      if (screen === 'GAMEPLAY') {
        // Only START pauses. The face buttons are live gameplay input — until
        // the pause modal is up, when the generic navigation takes over so its
        // buttons can be reached.
        if (action === 'START') {
          setIsPaused((prev) => !prev);
          return;
        }
        if (isPaused) applyMenuNavigation(action);
        return;
      }
      if (screen === 'STAGE_CLEAR') {
        if (action === 'START') return handleNextStage();
        if (!applyMenuNavigation(action) && action === 'CONFIRM') handleNextStage();
        return;
      }
      if (screen === 'GAME_OVER') {
        if (action === 'START') return startStage(currentStageIdx);
        if (action === 'BACK') return setScreen('TITLE');
        if (!applyMenuNavigation(action) && action === 'CONFIRM') startStage(currentStageIdx);
        return;
      }
      if (screen === 'VICTORY') {
        if (action === 'START' || action === 'BACK') return setScreen('TITLE');
        if (!applyMenuNavigation(action) && action === 'CONFIRM') setScreen('TITLE');
      }
    },
    screen !== 'CHAR_SELECT'
  );

  return (
    <div className="relative w-screen h-screen bg-[#0a0a0a] overflow-hidden font-sans select-none flex flex-col">
      {/* 0. ATTRACT MODE */}
      {screen === 'ATTRACT' && <AttractMode onInsertCoin={handleInsertCoin} />}

      {/* 0.5 INTRO SEQUENCE */}
      {screen === 'INTRO' && <IntroSequence onComplete={() => setScreen('TITLE')} />}

      {/* 1. TITLE SCREEN */}
      {screen === 'TITLE' && (
        <div className="relative w-full h-full bg-[#0a0a0a] flex flex-col justify-between p-8 text-white text-center border-[12px] border-[#ff00ff]/10">
          {/* Header Banner - Artistic Flair */}
          <div className="flex flex-col md:flex-row justify-between items-center bg-[#1a1a1a] border-b-4 border-[#ff00ff] px-6 py-4 rounded-none max-w-4xl mx-auto w-full gap-2">
            <div className="text-left">
              <span className="text-[#00ffff] font-mono text-xs tracking-tighter block">SYSTEM STATUS: RADICAL</span>
              <span className="text-xl font-black italic uppercase text-white">THE SAFE-WORD SYNDICATE<span className="text-[#ff00ff]">.</span></span>
            </div>
            <div className="text-right">
              <div className="text-xs font-mono text-gray-400">VS ULTRA EVIL LEAGUE OF CONSERVATIVE CHRISTIANS</div>
              <button
                onClick={handleStartBrawl}
                className={`bg-transparent border-0 py-2.5 px-0 -my-2.5 cursor-pointer text-lg font-black animate-pulse ${audioUnlocked ? 'text-[#ffff00]' : 'text-[#00ffff]'}`}
              >
                CREDIT 99 ► PRESS START
              </button>
            </div>
          </div>

          {/* Main Title Logo */}
          <div className="my-auto space-y-4 max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-6xl font-black italic tracking-tighter uppercase leading-none text-white drop-shadow-[0_0_25px_rgba(255,0,255,0.5)]">
              THE SAFE-WORD SYNDICATE<span className="text-[#ff00ff]">.</span>
            </h1>
            <p className="text-lg md:text-2xl font-black italic text-[#00ffff] font-mono uppercase tracking-wider">
              VS THE ULTRA EVIL LEAGUE OF CONSERVATIVE CHRISTIANS
            </p>
            <p className="text-xs md:text-sm text-gray-300 max-w-lg mx-auto font-mono leading-relaxed border-2 border-[#333] p-4 bg-[#111]">
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
          <div className="flex flex-col gap-3 max-w-lg mx-auto w-full pb-4">
            <button
              onClick={handleStartBrawl}
              className="w-full py-4 bg-[#ff00ff] hover:bg-[#d400d4] text-black font-black text-base sm:text-lg italic uppercase tracking-wider shadow-[0_0_20px_rgba(255,0,255,0.4)] flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <Play className="w-5 h-5 fill-current" /> START BRAWL
            </button>

            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <button
                onClick={() => setShowDifficultyModal(true)}
                className="w-full sm:flex-1 px-3 py-3 bg-[#1a1a1a] hover:bg-[#222] border-2 border-[#333] hover:border-[#ffff00] text-[#ffff00] font-black text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Gauge className="w-4 h-4 shrink-0 text-[#ffff00]" />
                {settings.difficulty === 'PUNK_HARD'
                  ? 'PUNK HARD'
                  : settings.difficulty === 'EASY'
                    ? 'EASY'
                    : 'NORMAL'}
              </button>

              <button
                onClick={() => setShowAudioModal(true)}
                className="w-full sm:flex-1 px-3 py-3 bg-[#110826] hover:bg-[#1f103f] border-2 border-[#00ffff] text-[#00ffff] font-black text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,255,255,0.3)] transition-all whitespace-nowrap"
              >
                <Disc className="w-4 h-4 shrink-0 text-[#00ffff] animate-spin-slow" /> JUKEBOX
              </button>

              <button
                onClick={() => setShowCodex(true)}
                className="w-full sm:flex-1 px-3 py-3 bg-[#1a1a1a] hover:bg-[#222] border-2 border-[#333] hover:border-[#ffff00] text-[#ffff00] font-black text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <BookOpen className="w-4 h-4 shrink-0 text-[#ffff00]" /> CODEX
              </button>
            </div>
          </div>
        </div>
      )}

      {showDifficultyModal && (
        <DifficultyModal
          difficulty={settings.difficulty}
          onSelect={(difficulty) => setSettings((prev) => ({ ...prev, difficulty }))}
          onClose={() => setShowDifficultyModal(false)}
        />
      )}

      {/* 2. CHARACTER SELECT SCREEN */}
      {screen === 'CHAR_SELECT' && (
        <CharacterSelect
          onSelect={handleSelectFighter}
          onBack={() => {
            sound.stopBgm();
            setScreen('TITLE');
          }}
        />
      )}

      {/* 3. DIALOGUE OVERLAY */}
      {screen === 'GAMEPLAY' && activeDialogue && (
        <DialogueOverlay
          dialogue={activeDialogue}
          onComplete={() => {
            engineRef.current?.setActiveDialogue(null);
            // The key that dismisses the dialogue (space, J, K) also feeds the
            // game input. Without clearing it the player jumps or punches on
            // the first frame after the overlay closes.
            setInputP1(NEUTRAL_INPUT);
          }}
        />
      )}

      {/* 4. GAMEPLAY SCREEN */}
      {screen === 'GAMEPLAY' && engineRef.current && (
        <div className="relative w-full h-full flex flex-col">
          <GameHeader
            settings={settings}
            onUpdateSettings={(s) => setSettings((prev) => ({ ...prev, ...s }))}
            isPaused={isPaused}
            onTogglePause={() => setIsPaused(!isPaused)}
            onOpenCodex={() => setShowCodex(true)}
            onOpenAudioModal={() => setShowAudioModal(true)}
            onReturnToTitle={() => {
              sound.stopAll();
              setScreen('TITLE');
            }}
            onRestartStage={() => startStage(currentStageIdx)}
            stageName={STAGES[currentStageIdx].name}
          />

          <div className="relative flex-1 w-full h-full">
            <GameCanvas
              engine={engineRef.current}
              crtFilter={settings.crtFilter}
              showHitboxes={settings.showHitboxes}
            />

            {activeBark && !activeDialogue && <BarkOverlay line={activeBark} />}

            {isMobile && isPortrait && <RotateDevicePrompt />}

            {isMobile ? (
              <OnScreenControls
                input={inputP1}
                setInput={setInputP1}
                powerMeter={engineRef.current.player1?.powerMeter || 0}
              />
            ) : (
              <KeyboardHints mode={gameMode} />
            )}
          </div>
        </div>
      )}

      {/* 5. STAGE CLEAR SCREEN */}
      {screen === 'STAGE_CLEAR' && engineRef.current && (
        <StageClearScreen
          stageName={STAGES[currentStageIdx].name}
          stats={engineRef.current.stats}
          onNextStage={handleNextStage}
        />
      )}

      {/* 6. GAME OVER SCREEN */}
      {screen === 'GAME_OVER' && (
        <GameOverModal
          onRetry={() => startStage(currentStageIdx)}
          onQuit={() => {
            sound.stopBgm();
            setScreen('TITLE');
          }}
        />
      )}

      {/* 7. VICTORY ENDING SCREEN */}
      {screen === 'VICTORY' && (
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950 via-amber-950/40 to-zinc-950 text-white z-50 p-8 flex flex-col justify-between text-center select-none overflow-y-auto">
          <div className="my-auto space-y-6 max-w-2xl mx-auto">
            <div className="inline-flex p-4 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/30">
              <Award className="w-12 h-12" />
            </div>

            <h1 className="text-3xl md:text-5xl font-black italic text-amber-400 uppercase tracking-wider">
              {sayonaraKilled
                ? 'VICTORY — BUT NOT FOR EVERYONE'
                : 'VICTORY! THE SAFE-WORD SYNDICATE TRIUMPHS!'}
            </h1>

            <p className="text-sm md:text-base font-mono text-zinc-300 leading-relaxed">
              {sayonaraKilled
                ? "Madam Mizydia's corporate broadcast signal has been permanently dismantled, and the gray status quo is shattered forever. But the collar came off too late. Sayonara never got to walk out on her own terms. The city is loud again — one voice short."
                : "Madam Mizydia's corporate broadcast signal has been permanently dismantled! Sayonara broke free from her leash and walked away into freedom! The Ultra Evil League of Conservative Christians' gray status quo is shattered forever, restoring vibrant punk joy to the world!"}
            </p>
          </div>

          <button
            onClick={() => {
              sound.stopBgm();
              setScreen('TITLE');
            }}
            className="px-8 py-3 bg-amber-500 hover:bg-amber-400 text-black font-black rounded-xl text-sm italic uppercase tracking-wider mx-auto shadow-xl"
          >
            RETURN TO TITLE SCREEN
          </button>
        </div>
      )}

      {/* LORE CODEX MODAL */}
      {showCodex && <LoreCodex onClose={() => setShowCodex(false)} />}

      {/* JUKEBOX & CUSTOM AUDIO MODAL */}
      <CustomAudioModal isOpen={showAudioModal} onClose={() => setShowAudioModal(false)} />
    </div>
  );
}
