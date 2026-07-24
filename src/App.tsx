/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  GameScreen,
  CharacterId,
  GameMode,
  PlayerInput,
  GameSettings,
} from './types';
import { STAGES } from './game/stageData';
import { GameEngine } from './game/engine';
import { GameCanvas } from './components/GameCanvas';
import { OnScreenControls } from './components/OnScreenControls';
import { CharacterSelect } from './components/CharacterSelect';
import { DialogueOverlay } from './components/DialogueOverlay';
import { StageClearScreen } from './components/StageClearScreen';
import { GameOverModal } from './components/GameOverModal';
import { GameHeader } from './components/GameHeader';
import { LoreCodex } from './components/LoreCodex';
import { CustomAudioModal } from './components/CustomAudioModal';
import { sound } from './game/sound';
import { Play, BookOpen, Shield, Flame, RotateCcw, Award, Disc } from 'lucide-react';

const subscribeAudioUnlock = (onChange: () => void) => sound.subscribeUnlock(onChange);
const getAudioUnlocked = () => sound.isAudioUnlocked();

export default function App() {
  const [screen, setScreen] = useState<GameScreen>('TITLE');
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

  const [isPaused, setIsPaused] = useState(false);
  const [showCodex, setShowCodex] = useState(false);
  const [showAudioModal, setShowAudioModal] = useState(false);

  const engineRef = useRef<GameEngine | null>(null);

  // Keyboard controls state
  const [inputP1, setInputP1] = useState<PlayerInput>({
    left: false,
    right: false,
    up: false,
    down: false,
    punch: false,
    kick: false,
    special: false,
    jump: false,
    grab: false,
  });

  // Handle Keyboard Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      sound.initCtx(); // Unlock web audio context on keyboard interaction
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      const k = e.key.toLowerCase();
      if (k === 'p' || e.key === 'Escape') {
        setIsPaused((prev) => !prev);
        return;
      }

      if (['arrowup', 'w'].includes(k)) setInputP1((prev) => ({ ...prev, up: true }));
      if (['arrowdown', 's'].includes(k)) setInputP1((prev) => ({ ...prev, down: true }));
      if (['arrowleft', 'a'].includes(k)) setInputP1((prev) => ({ ...prev, left: true }));
      if (['arrowright', 'd'].includes(k)) setInputP1((prev) => ({ ...prev, right: true }));
      if (k === 'j') setInputP1((prev) => ({ ...prev, punch: true }));
      if (k === 'k') setInputP1((prev) => ({ ...prev, kick: true }));
      if (['l', 'e', 'f', 'u'].includes(k)) setInputP1((prev) => ({ ...prev, special: true }));
      if (e.code === 'Space') setInputP1((prev) => ({ ...prev, jump: true }));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'w'].includes(k)) setInputP1((prev) => ({ ...prev, up: false }));
      if (['arrowdown', 's'].includes(k)) setInputP1((prev) => ({ ...prev, down: false }));
      if (['arrowleft', 'a'].includes(k)) setInputP1((prev) => ({ ...prev, left: false }));
      if (['arrowright', 'd'].includes(k)) setInputP1((prev) => ({ ...prev, right: false }));
      if (k === 'j') setInputP1((prev) => ({ ...prev, punch: false }));
      if (k === 'k') setInputP1((prev) => ({ ...prev, kick: false }));
      if (['l', 'e', 'f', 'u'].includes(k)) setInputP1((prev) => ({ ...prev, special: false }));
      if (e.code === 'Space') setInputP1((prev) => ({ ...prev, jump: false }));
    };

    const handleBlur = () => {
      setInputP1({
        left: false,
        right: false,
        up: false,
        down: false,
        punch: false,
        kick: false,
        special: false,
        jump: false,
        grab: false,
      });
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

  // Manage Screen Background Music (Intro, Char Select)
  useEffect(() => {
    if (screen === 'TITLE') {
      sound.playBgm('INTRO');
    } else if (screen === 'CHAR_SELECT') {
      sound.playBgm('CHAR_SELECT');
    }
  }, [screen]);

  const inputRef = useRef<PlayerInput>(inputP1);
  useEffect(() => {
    inputRef.current = inputP1;
  }, [inputP1]);

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
            engineRef.current.update(inputRef.current);
          }

          if (engineRef.current.stageCleared) {
            setScreen('STAGE_CLEAR');
          } else if (engineRef.current.gameOver) {
            setScreen('GAME_OVER');
          } else if (engineRef.current.bossDefeated) {
            setScreen('VICTORY');
          }
        }
      }
    };

    animFrameId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animFrameId);
  }, [screen, isPaused]);

  const startStage = (stageIdx: number, p1Override?: CharacterId, p2Override?: CharacterId) => {
    const p1 = p1Override ?? p1Char;
    const p2 = p2Override !== undefined ? p2Override : p2Char;
    const stage = STAGES[stageIdx];
    engineRef.current = new GameEngine(stage, p1, p2, settings);
    setCurrentStageIdx(stageIdx);
    setScreen('GAMEPLAY');
  };

  const handleSelectFighter = (p1: CharacterId, p2?: CharacterId, mode?: GameMode) => {
    setP1Char(p1);
    setP2Char(p2);
    if (mode) setGameMode(mode);
    startStage(0, p1, p2);
  };

  const handleNextStage = () => {
    if (currentStageIdx < STAGES.length - 1) {
      startStage(currentStageIdx + 1);
    } else {
      setScreen('VICTORY');
    }
  };

  return (
    <div className="relative w-screen h-screen bg-[#0a0a0a] overflow-hidden font-sans select-none flex flex-col">
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
              <div
                className={`text-lg font-black animate-pulse ${audioUnlocked ? 'text-[#ffff00]' : 'text-[#00ffff]'}`}
              >
                {audioUnlocked ? 'INSERT COIN [99]' : 'INSERT COIN ► PRESS ANY KEY'}
              </div>
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

          {/* Actions */}
          <div className="flex flex-col sm:flex-row justify-center items-center gap-3 max-w-lg mx-auto w-full pb-4">
            <button
              onClick={() => {
                sound.playPunch();
                setScreen('CHAR_SELECT');
              }}
              className="w-full sm:flex-1 py-4 bg-[#ff00ff] hover:bg-[#d400d4] text-black font-black text-base sm:text-lg italic uppercase tracking-wider shadow-[0_0_20px_rgba(255,0,255,0.4)] flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <Play className="w-5 h-5 fill-current" /> START BRAWL
            </button>

            <button
              onClick={() => setShowAudioModal(true)}
              className="w-full sm:w-auto px-5 py-4 bg-[#110826] hover:bg-[#1f103f] border-2 border-[#00ffff] text-[#00ffff] font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,255,255,0.3)] transition-all"
            >
              <Disc className="w-4 h-4 text-[#00ffff] animate-spin-slow" /> JUKEBOX / MUSIC
            </button>

            <button
              onClick={() => setShowCodex(true)}
              className="w-full sm:w-auto px-5 py-4 bg-[#1a1a1a] hover:bg-[#222] border-2 border-[#333] hover:border-[#ffff00] text-[#ffff00] font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2"
            >
              <BookOpen className="w-4 h-4 text-[#ffff00]" /> CODEX
            </button>
          </div>
        </div>
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
      {engineRef.current?.activeDialogue && (
        <DialogueOverlay
          dialogue={engineRef.current.activeDialogue}
          onComplete={() => {
            if (engineRef.current) {
              engineRef.current.setActiveDialogue(null);
            }
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
            <GameCanvas engine={engineRef.current} crtFilter={settings.crtFilter} />

            <OnScreenControls
              input={inputP1}
              setInput={setInputP1}
              powerMeter={engineRef.current.player1?.powerMeter || 0}
            />
          </div>
        </div>
      )}

      {/* 5. STAGE CLEAR SCREEN */}
      {screen === 'STAGE_CLEAR' && engineRef.current && (
        <StageClearScreen
          stageName={STAGES[currentStageIdx].name}
          stats={engineRef.current.stats}
          onNextStage={handleNextStage}
          onReturnToTitle={() => {
            sound.stopAll();
            setScreen('TITLE');
          }}
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
              VICTORY! THE SAFE-WORD SYNDICATE TRIUMPHS!
            </h1>

            <p className="text-sm md:text-base font-mono text-zinc-300 leading-relaxed">
              Madam Mizydia's corporate broadcast signal has been permanently dismantled! Sayonara broke free from her leash and walked away into freedom! The Ultra Evil League of Conservative Christians' gray status quo is shattered forever, restoring vibrant punk joy to the world!
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
