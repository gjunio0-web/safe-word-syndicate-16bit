/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import {
  GameScreen,
  CharacterId,
  GameMode,
  PlayerInput,
  GameSettings,
  DialogueLine,
} from './types';
import { ACTIVE_STAGES } from './game/campaign';
import { GameEngine } from './game/engine';
import { GameCanvas } from './components/GameCanvas';
import { OnScreenControls } from './components/OnScreenControls';
import { KeyboardHints } from './components/KeyboardHints';
import { RotateDevicePrompt } from './components/RotateDevicePrompt';
import { AttractMode } from './components/AttractMode';
import { BootSplash } from './components/BootSplash';
import IntroSequence from './components/IntroSequence';
import { readPlayerPads, resetPadAssignments, mergeInputs } from './game/gamepad';
import { advanceClock, createFrameClock, resetClock } from './game/frameClock';
import { resolveKeyBinding } from './game/keyboard';
import { secondFighterFor, secondPlayerInputFor, secondSlotIsHuman } from './game/modes';
import { useGamepadMenu } from './hooks/useGamepadMenu';
import { applyMenuNavigation, useMenuFocusReset } from './hooks/useMenuNavigation';
import { CharacterSelect } from './components/CharacterSelect';
import { TitleScreen } from './components/TitleScreen';
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
import { CREDIT_LINE, CREDIT_ROLES, STUDIO_NAME, STUDIO_SUFFIX } from './game/credits';
// Award icon removed — see SignalCrash below for why.

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

/**
 * Mizydia's own signage, switched off for good.
 *
 * The victory screen used to open on a circular badge and the word
 * "VICTORY" in amber — an achievement-unlock icon borrowed from mobile
 * gamification, unrelated to anything this game is about, in a color that
 * appears nowhere else in it (title, codex, boot, and the fight itself are
 * all magenta/cyan/yellow neon on near-black).
 *
 * This replaces it with the villain's own broadcast, caught mid-collapse.
 * The team's own outro proposal already scripts this exact beat — the
 * corporate telón's live sin metrics glitching into CENSURE PROTOCOL:
 * OFFLINE — for a future <OutroSequence/> that doesn't exist yet. This is
 * that beat, compressed into the screen that exists today. When the outro
 * lands, this component moves into it wholesale.
 *
 * Red and green are Mizydia's colors here on purpose, not the hero
 * palette — the telón was scripted red-framed with a green stock line, and
 * a sign in the hero's own magenta/cyan would read as the heroes' victory
 * lap starting a beat too early, before her signal has actually died.
 */
const SignalCrash: React.FC = () => {
  const [dead, setDead] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setDead(true), 700);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="inline-block border border-red-900/50 bg-black/40 px-4 py-2 text-left font-mono text-[10px] md:text-xs uppercase tracking-widest">
      {dead ? (
        <div className="sws-signal-crash text-red-500">CENSURE PROTOCOL: OFFLINE</div>
      ) : (
        <>
          <div className="text-red-500/70">[LIVE SIN METRICS]</div>
          <div className="text-zinc-500">
            DIVERSITY: <span className="text-red-400">0.00%</span>
          </div>
          <div className="text-zinc-500">
            PROFIT: <span className="text-[#00ff88]">+999.9%</span>
          </div>
        </>
      )}
      <style>{`
        @keyframes sws-signal-crash-flicker {
          0%, 100% { opacity: 1; }
          10% { opacity: 0.2; }
          20% { opacity: 1; }
          35% { opacity: 0.1; }
          45% { opacity: 1; }
          60% { opacity: 0.3; }
        }
        .sws-signal-crash {
          animation: sws-signal-crash-flicker 0.5s steps(2, jump-none) 1;
        }
        @media (prefers-reduced-motion: reduce) {
          .sws-signal-crash { animation-duration: 1ms; }
        }
      `}</style>
    </div>
  );
};

export default function App() {
  // Boots into the studio splash, which hands over to the attract loop on its
  // own after a beat or on the first input, whichever lands first.
  const [screen, setScreen] = useState<GameScreen>('BOOT');
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
      // Escape used to double as pause, but the Fullscreen API reserves it as
      // the one key a page can never override: pressing it always exits
      // fullscreen first, browser-side, no matter what a keydown handler
      // does. Binding it here meant every pause kicked the player out of
      // fullscreen along with it. 'p' remains, plus the on-screen pause button.
      if (k === 'p') {
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

  /**
   * Asks for fullscreen, and stays armed until an attempt actually succeeds.
   *
   * It used to disarm on the first gesture, before knowing whether the
   * request was honoured — fine while the only callers were pointer and key
   * events, which the browser accepts, and wrong the moment a caller might be
   * refused: one rejected attempt would have spent the single try and left a
   * player who then reached for the keyboard with no fullscreen at all.
   *
   * Disarming on success rather than on attempt also means a player who
   * deliberately leaves fullscreen is not dragged back in by their next
   * keypress.
   */
  const fullscreenSettled = useRef(false);
  const requestFullscreen = useCallback(() => {
    if (fullscreenSettled.current || document.fullscreenElement) return;
    const request = document.documentElement.requestFullscreen?.();
    if (!request) return;
    request.then(
      () => {
        fullscreenSettled.current = true;
      },
      () => {
        // Refused. Stay armed: another kind of input may be accepted.
      }
    );
  }, []);

  // Requests fullscreen on the first real user gesture. Deliberately not
  // inside AttractMode's own insert-coin handler: that screen unmounts on the
  // very same tap, tearing its listeners down before a touch's pointerup
  // fires. Mounted here instead, for the whole app's lifetime, so that
  // natural pointerup still lands.
  //
  // pointerup rather than pointerdown: per the HTML spec, pointerdown only
  // counts as an activation-triggering event for mouse pointerType — touch
  // needs pointerup (or touchend). Using pointerdown here, matching how
  // AttractMode's own coin-insert and the audio-unlock arm() below listen,
  // is what silently failed on Android Chrome. keydown covers keyboard.
  useEffect(() => {
    window.addEventListener('pointerup', requestFullscreen);
    window.addEventListener('keydown', requestFullscreen);
    return () => {
      window.removeEventListener('pointerup', requestFullscreen);
      window.removeEventListener('keydown', requestFullscreen);
    };
  }, [requestFullscreen]);

  // The controller, which fires no DOM events at all.
  //
  // Reported from play: starting the game from the pad never went fullscreen.
  // The two listeners above are the only callers, and the Gamepad API has no
  // button events — the pads are polled inside an animation frame — so a
  // player who only touches the controller never reached the request. It was
  // not being refused; it was never being made.
  //
  // Whether the browser honours a request whose activation came from a pad is
  // a separate question this does not answer, and the retry above is what
  // keeps a refusal from costing the keyboard its turn.
  useGamepadMenu(requestFullscreen);

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
  /**
   * One name for "something is covering the screen", because four places need
   * to agree on it: focus restoration, the gameplay loop's gate, that effect's
   * dependency list, and the keyboard handler that must not fire through an
   * overlay. Spelled out at each site, a fifth modal added later gets wired
   * into some of them and not the others, and the one it misses decides
   * whether the fight keeps running behind it. No test covers any of the four
   * — the gate lives in a React effect and this project has no DOM test
   * environment — so the single name is the guard.
   */
  const anyModalOpen = showCodex || showAudioModal || showDifficultyModal;

  useMenuFocusReset(`${screen}:${isPaused}:${anyModalOpen}`, screen !== 'GAMEPLAY' || isPaused || anyModalOpen);

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

  // Main Gameplay Update Loop, driven by a fixed-step clock
  useEffect(() => {
    // Codex, jukebox, and difficulty share this gate with isPaused: opening
    // any of them used to leave the fight running behind the overlay, so a
    // boss's projectile could land on a player reading the bestiary. Tearing
    // the effect down (rather than checking per frame) matches how isPaused
    // already works — no rAF gets scheduled at all until every one of these
    // closes, and reopening starts a fresh clock rather than replaying
    // whatever time was banked while the modal was up.
    if (screen !== 'GAMEPLAY' || isPaused || anyModalOpen) return;

    let animFrameId: number;
    let lastTime = performance.now();
    const clock = createFrameClock();

    const gameLoop = (currentTime: number) => {
      animFrameId = requestAnimationFrame(gameLoop);

      const { steps } = advanceClock(clock, currentTime - lastTime);
      lastTime = currentTime;
      if (!engineRef.current) return;

      // Input is read, and the step loop runs, only on frames that actually
      // have a step to spend — not on every video frame.
      //
      // This guard exists because of a real bug the first version of this
      // loop had: readPlayerPads does more than read. It calls trackActivity,
      // which increments a frame counter used to decide when a stale
      // controller's slot can be handed to someone else — STALE_AFTER_FRAMES
      // in gamepad.ts, calibrated as "three seconds" at the counter's original
      // call rate of once per simulated step, roughly 60 times a second on any
      // 60Hz-or-faster display.
      //
      // Calling it once per video frame instead moves that counter to the
      // display's refresh rate. At 240Hz the counter now advances four times
      // for every step the simulation takes, so 180 counted "frames" stops
      // meaning three seconds and starts meaning 180/240 = 0.75s — a
      // controller resting on the table for less than a second could be
      // treated as abandoned. That is the exact class of bug this whole clock
      // exists to remove, reintroduced one call site downstream of the fix.
      //
      // Gating on `steps > 0` puts the call back at simulation rate — the rate
      // the 180 was calibrated against — regardless of how fast the display
      // refreshes.
      if (steps > 0) {
        const pads = readPlayerPads();
        const p1Input = mergeInputs(inputRef.current, pads.p1);
        // Who drives player two is a question about the mode, not about how
        // many controllers happen to be listed, and the rule lives in
        // `secondPlayerInputFor` with the rest of the mode questions — this
        // file has no test environment and that one does.
        const p2Input = secondPlayerInputFor(gameMode, inputP2Ref.current, pads.p2, mergeInputs);

        for (let i = 0; i < steps; i++) {
          // Dialogue holds the simulation without holding the clock: the overlay
          // is meant to pause the fight, not to bank time and replay it in a
          // burst the moment the player presses NEXT.
          if (engineRef.current.activeDialogue) {
            resetClock(clock);
            break;
          }
          engineRef.current.update(p1Input, p2Input);
        }
      }

      // Screen transitions are read once per frame, after stepping.
      //
      // Inside the step loop they would fire mid-catch-up, setting React state
      // several times for one frame and letting the remaining steps run after
      // the match was already decided.
      //
      // "Once per frame" now means once per video frame, not once per frame
      // that actually stepped: this check sits outside the step loop, so on a
      // 240Hz display it runs about four times for every step the simulation
      // takes — most of those checks see nothing changed and call `setScreen`
      // with the same value the screen already holds. That is not wasted work
      // in any way that matters: React's setState bails out on an
      // Object.is-equal value before re-rendering or re-running an effect that
      // depends on it, so a redundant `setScreen('VICTORY')` while already on
      // VICTORY is a no-op past the comparison.
      //
      // Victory is checked before stage clear: on the final stage both flags
      // can rise on the same step, and stage clear winning meant the campaign
      // ended on a screen offering a NEXT STAGE that does not exist.
      if (engineRef.current.bossDefeated) {
        setSayonaraKilled(engineRef.current.sayonaraKilled);
        setScreen('VICTORY');
      } else if (engineRef.current.stageCleared) {
        setScreen('STAGE_CLEAR');
      } else if (engineRef.current.gameOver) {
        setScreen('GAME_OVER');
      }
    };

    animFrameId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animFrameId);
  }, [screen, isPaused, gameMode, anyModalOpen]);

  const startStage = (
    stageIdx: number,
    p1Override?: CharacterId,
    p2Override?: CharacterId,
    settingsOverride?: GameSettings,
    modeOverride?: GameMode
  ) => {
    // The mode has to travel as an argument for the same reason the fighters
    // do: `setGameMode` has not landed yet when the selection screen starts
    // the match in the same tick, so reading the state here reads the previous
    // match's mode.
    const mode = modeOverride ?? gameMode;
    const p1 = p1Override ?? p1Char;
    const p2 = secondFighterFor(mode, p2Override ?? p2Char);
    const stage = ACTIVE_STAGES[stageIdx];
    engineRef.current = new GameEngine(
      stage,
      p1,
      p2,
      settingsOverride ?? settings,
      secondSlotIsHuman(mode)
    );
    // Slots are deliberately *not* released here any more.
    //
    // They used to be, on the grounds that co-op and solo assigned them
    // differently and a stale assignment would survive a mode change. One order
    // now serves every mode, so there is nothing left to go stale — and the
    // rebuild that followed the release was itself a defect: it handed player
    // one to whichever pad had been touched most recently, so two people in
    // co-op swapped fighters at every stage boundary.
    //
    // What the release was covering for is fixed at its source in gamepad.ts:
    // a pad nobody has ever touched no longer holds a slot against one that is
    // in someone's hands. Returning to the title still clears everything.
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
    startStage(0, p1, p2, settings, mode);
  };

  const handleNextStage = () => {
    if (currentStageIdx < ACTIVE_STAGES.length - 1) {
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

  /**
   * Leaves a match (or its GAME_OVER/VICTORY aftermath) for the title
   * screen. The mute toggle only exists on GameHeader, reachable during
   * GAMEPLAY — so it is scoped to the match: walking away un-mutes rather
   * than leaving the rest of the game silently stuck the way the player
   * left it, with no control anywhere else to undo it.
   */
  const returnToTitle = () => {
    setSettings((prev) => ({ ...prev, soundEnabled: true, musicEnabled: true }));
    sound.setEnabled(true, true);
    setScreen('TITLE');
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
      if (anyModalOpen) {
        if (action === 'BACK') {
          setShowCodex(false);
          setShowAudioModal(false);
          setShowDifficultyModal(false);
          return;
        }
        applyMenuNavigation(action);
        return;
      }

      if (screen === 'BOOT') {
        // The splash owns its own skip, on its own listener. Swallowing the
        // action here keeps a controller press from falling through to the
        // attract screen's coin slot in the same frame the splash leaves.
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
        if (action === 'BACK') return returnToTitle();
        if (!applyMenuNavigation(action) && action === 'CONFIRM') startStage(currentStageIdx);
        return;
      }
      if (screen === 'VICTORY') {
        if (action === 'START' || action === 'BACK') return returnToTitle();
        if (!applyMenuNavigation(action) && action === 'CONFIRM') returnToTitle();
      }
    },
    screen !== 'CHAR_SELECT'
  );

  return (
    // h-dvh, not h-screen: 100vh is computed as if the browser's address/nav
    // bar didn't exist, so in landscape on a real phone (a shorter viewport
    // to begin with) the bottom-anchored touch controls rendered below the
    // actually-visible area and were cropped. dvh tracks the real visible
    // height as that chrome shows/hides.
    <div className="relative w-screen h-dvh bg-[#0a0a0a] overflow-hidden font-sans select-none flex flex-col">
      {/* 0.0 BOOT SPLASH */}
      {screen === 'BOOT' && <BootSplash onComplete={() => setScreen('ATTRACT')} />}

      {/* 0. ATTRACT MODE */}
      {screen === 'ATTRACT' && <AttractMode onInsertCoin={handleInsertCoin} />}

      {/* 0.5 INTRO SEQUENCE */}
      {screen === 'INTRO' && <IntroSequence onComplete={() => setScreen('TITLE')} />}

      {/* 1. TITLE SCREEN
        *
        * Split into TitleScreenDesktop / TitleScreenMobile behind a device
        * check, rather than one shared block differentiated by Tailwind's
        * `landscape:` variant. That variant is a pure orientation query, so
        * it matched every desktop monitor too and handed desktop the layout
        * built for a phone held sideways. See TitleScreen.tsx.
        */}
      {screen === 'TITLE' && (
        <TitleScreen
          audioUnlocked={audioUnlocked}
          difficulty={settings.difficulty}
          onStartBrawl={handleStartBrawl}
          onOpenDifficulty={() => setShowDifficultyModal(true)}
          onOpenJukebox={() => setShowAudioModal(true)}
          onOpenCodex={() => setShowCodex(true)}
        />
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
            returnToTitle();
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
              returnToTitle();
            }}
            onRestartStage={() => startStage(currentStageIdx)}
            stageName={ACTIVE_STAGES[currentStageIdx].name}
          />

          {/* min-h-0: a flex item's default minimum main size is 'auto' —
            * effectively its content's size — not 0, so flex-1 alone
            * couldn't actually shrink this below GameCanvas's natural
            * height even though the header above it needed some of that
            * space too. It rendered at the full screen height instead of
            * "screen minus header", so its absolutely-positioned bottom
            * controls (D-pad, action buttons) sat below the actually
            * visible area on short landscape screens and got clipped by
            * the root's overflow-hidden. Same fix, same underlying
            * flexbox default, as the char-select dossier's min-w-0 case. */}
          <div className="relative flex-1 min-h-0 w-full h-full">
            <GameCanvas
              engine={engineRef.current}
              crtFilter={settings.crtFilter}
              showHitboxes={settings.showHitboxes}
              touchControls={isMobile}
              // Same source as the touch controls today, deliberately passed
              // as its own question: a tablet, or a compact desktop layout,
              // can answer these two differently later without either flag
              // having to be untangled from the other first.
              compactHud={isMobile}
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
          stageName={ACTIVE_STAGES[currentStageIdx].name}
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
            returnToTitle();
          }}
        />
      )}

      {/* 7. VICTORY ENDING SCREEN */}
      {screen === 'VICTORY' && (
        <div
          className={`absolute inset-0 text-white z-50 flex flex-col text-center select-none bg-[#0a0a0a] ${
            sayonaraKilled ? '' : 'sws-victory-glow'
          }`}
        >
          {/* Scroll owns the story, not the exit.
            *
            * Header and RETURN used to share one scrolling flex column, so
            * preventScroll on the initial focus could only pick a winner: the
            * header at the top or the button at the bottom, never both once
            * total content ran past the viewport. Measured at 844x390 with
            * the credit roster included: button top=687 against a 390px
            * viewport, off screen by nearly 300px, on the only route a
            * touch player has to leave this screen.
            *
            * Splitting the button out of the scroll container and pinning it
            * to the bottom of the screen — not of the content — removes the
            * competition. The story scrolls under it; RETURN does not move. */}
          <div className="flex-1 overflow-y-auto p-8 pb-4">
          <div className="my-auto space-y-6 max-w-2xl mx-auto">
            <div className="space-y-2">
              <SignalCrash />
              {/* Omega Biker's line from the team's own outro script (Cena 1:
                * O Colapso da Matriarca). Reused rather than invented — the
                * broadcast dying is the same beat in both endings, only
                * Sayonara's fate differs below. */}
              <p
                className={`text-[10px] md:text-xs font-mono uppercase tracking-widest ${
                  sayonaraKilled ? 'text-zinc-400' : 'text-[#00ffff]'
                }`}
              >
                Omega Biker: "The broadcast is dead. Let's get our colors back."
              </p>
            </div>

            {/* Headline and body used to be quoted verbatim from the
              * project's own script document (Roteiro Completo, "Tela de
              * vitória" — Final A / Final B). Sayonara-freed's headline is
              * no longer that line — replaced on explicit instruction with
              * "Kinky is the new black. Again!" — so it now diverges from
              * the script doc; flagging it here in case the doc itself
              * should be updated to match, or this should stay a
              * screen-only line the script never sees.
              *
              * Sayonara-killed's headline was replaced too, and for a reason
              * that only appeared once the freed one had changed. The old pair
              * hinged on a shared word: "VICTORY! ... TRIUMPHS!" answered by
              * "VICTORY — BUT NOT FOR EVERYONE". Replacing the first half left
              * the second answering a line no longer in the game — it still
              * read, but it had stopped being a reply. The new pair rebuilds
              * the hinge on BLACK, which carries both senses on its own: the
              * fashion cliché the slogan borrows, and the funeral. One ending
              * says the colour came back; the other says what colour.
              *
              * The body paragraphs are untouched canon on both branches, word
              * for word, only restyled — verified against the pre-credits
              * revision.
              *
              * Sayonara-freed gets a neon accent on the last word, the same
              * device the title screen uses on its own name. Sayonara-killed
              * gets none — and that is enforced across the whole screen, not
              * just here, because the point of that ending is that the colour
              * did not fully come back and a screen that says so in one place
              * while glowing magenta in four others says nothing.
              *
              * Five things switch on sayonaraKilled: this accent, the radial
              * glow behind everything, Omega Biker's line, the dot after the
              * studio name, and the RETURN button. The button is the one worth
              * flagging — an exit that looks different between two endings can
              * read as an interface bug rather than a decision, so: it is a
              * decision. In the ending where the colour came back it is the
              * game's magenta with the game's glow; in the ending where it did
              * not, it is grey.
              *
              * Omega Biker's line loses its cyan in that variant while still
              * reading "let's get our colors back". That irony is the point,
              * and it only lands if the line is not itself in colour. */}
            <h1 className="text-3xl md:text-5xl font-black italic uppercase tracking-tighter">
              {sayonaraKilled ? (
                <span className="text-zinc-300">KINKY IS THE NEW BLACK. SO IS MOURNING.</span>
              ) : (
                <span className="text-white">
                  KINKY IS THE NEW BLACK. <span className="text-[#ff00ff]">AGAIN!</span>
                </span>
              )}
            </h1>

            <p className="text-sm md:text-base font-mono text-zinc-300 leading-relaxed">
              {sayonaraKilled
                ? "Madam Mizydia's corporate broadcast signal has been permanently dismantled, and the gray status quo is shattered forever. But the collar came off too late. Sayonara never got to walk out on her own terms. The city is loud again — one voice short."
                : "Madam Mizydia's corporate broadcast signal has been permanently dismantled! Sayonara broke free from her leash and walked away into freedom! The Ultra Evil League of Conservative Christians' gray status quo is shattered forever, restoring vibrant punk joy to the world!"}
            </p>

            {/* The credit roll.
              *
              * Restyled to match the codex's own STAFF panel — same white
              * name, cyan dot, magenta suffix, same table — so the two
              * places crediting the studio share one visual language
              * instead of the codex's neon sitting next to this screen's
              * old amber like they belonged to different apps.
              *
              * Short, and here rather than on a screen of its own: the outro
              * sequence that will eventually carry a full roll does not exist
              * yet, and a roster nobody ever reaches is the same as no
              * roster. When the outro lands this block moves into it
              * wholesale — it reads the same table. */}
            <div className="pt-4 border-t border-zinc-700/60 space-y-3">
              <div className="space-y-1">
                <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-zinc-500">
                  MADE IN A BUNKER BY
                </div>
                <div className="text-lg md:text-2xl font-black italic uppercase tracking-tighter text-white">
                  {STUDIO_NAME}
                  <span className={sayonaraKilled ? 'text-zinc-500' : 'text-[#00ffff]'}>.</span>
                </div>
                <div
                  className={`text-xs md:text-sm font-mono uppercase tracking-[0.3em] ${
                    sayonaraKilled ? 'text-zinc-400' : 'text-[#ff00ff]'
                  }`}
                >
                  {STUDIO_SUFFIX}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-1 max-w-md mx-auto font-mono text-[10px] md:text-xs uppercase tracking-wider">
                {CREDIT_ROLES.map((entry) => (
                  <React.Fragment key={entry.role}>
                    <div className="text-right text-zinc-500">{entry.role}</div>
                    <div className="text-left text-white">{entry.name}</div>
                  </React.Fragment>
                ))}
              </div>

              <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600">
                {CREDIT_LINE}
              </p>
            </div>
          </div>
          </div>

          <div className="shrink-0 px-8 pb-8 pt-3 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/95 to-transparent">
            <button
              onClick={() => {
                sound.stopBgm();
                returnToTitle();
              }}
              className={`px-8 py-3 text-black font-black rounded-xl text-sm italic uppercase tracking-wider mx-auto block ${
                sayonaraKilled
                  ? 'bg-zinc-300 hover:bg-zinc-200 shadow-xl'
                  : 'bg-[#ff00ff] hover:bg-[#ff33ff] shadow-[0_0_25px_rgba(255,0,255,0.4)]'
              }`}
            >
              RETURN TO TITLE SCREEN
            </button>
          </div>

          {/* The color the rest of the game already has, arriving here too.
            * A quiet radial glow, not an animation — the loud version of
            * "color returns" belongs to the future outro sequence; this is
            * the version that costs nothing and never plays for the ending
            * where color didn't come all the way back. */}
          <style>{`
            .sws-victory-glow {
              background-image:
                radial-gradient(ellipse 60% 40% at 20% 0%, rgba(255,0,255,0.10), transparent 60%),
                radial-gradient(ellipse 60% 40% at 80% 100%, rgba(0,255,255,0.08), transparent 60%);
            }
          `}</style>
        </div>
      )}

      {/* LORE CODEX MODAL */}
      {showCodex && <LoreCodex onClose={() => setShowCodex(false)} />}

      {/* JUKEBOX & CUSTOM AUDIO MODAL */}
      <CustomAudioModal isOpen={showAudioModal} onClose={() => setShowAudioModal(false)} />
    </div>
  );
}
