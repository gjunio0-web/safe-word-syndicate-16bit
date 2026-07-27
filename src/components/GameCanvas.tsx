import React, { useRef, useEffect, useCallback, useSyncExternalStore } from 'react';
import { GameEngine } from '../game/engine';
import { renderStageBackground } from '../game/stageData';
import { subscribeGamepadConnection, connectedGamepadCount } from '../game/gamepad';
import { renderEntitySprite } from '../game/spriteRenderer';
import { CHARACTERS, ENEMIES } from '../game/characterData';
import { ATTACKER_STANDOFF_X, PLAYER_KICK_REACH } from '../game/constants';

interface GameCanvasProps {
  engine: GameEngine;
  crtFilter: boolean;
  showHitboxes?: boolean;
}

// Stable across renders: useSyncExternalStore resubscribes when handed
// freshly created functions.
const subscribeGamepads = (onChange: () => void) => subscribeGamepadConnection(onChange);
const getGamepadCount = () => connectedGamepadCount();

export const GameCanvas: React.FC<GameCanvasProps> = ({ engine, crtFilter, showHitboxes = false }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let animationFrameId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // 1. Render Parallax Stage Background
      // Hard edges are the point of the art. Without this the browser smooths
      // every scaled draw, softening exactly the outlines and emissives the
      // sprite work spent its effort on.
      ctx.imageSmoothingEnabled = false;

      renderStageBackground(ctx, engine.stage.bgType, engine.cameraX, width, height);

      // 2. Render Ground Item Pickups
      engine.items.forEach((item) => {
        const renderX = item.x - engine.cameraX;
        const renderY = item.y;
        ctx.save();
        ctx.translate(renderX, renderY);
        if (item.type === 'HEALTH_TACO') {
          // Vegan Taco icon
          ctx.fillStyle = '#f5a623';
          ctx.beginPath();
          ctx.arc(0, -10, 12, Math.PI, 0);
          ctx.fill();
          ctx.fillStyle = '#34c759'; // Lettuce
          ctx.fillRect(-8, -10, 16, 4);
        } else {
          // Energy Drink
          ctx.fillStyle = '#00f0ff';
          ctx.fillRect(-6, -18, 12, 18);
          ctx.fillStyle = '#ff007f';
          ctx.fillRect(-4, -14, 8, 8);
        }
        ctx.restore();
      });

      // 2b. Render Hazards
      //
      // These were created and simulated by the engine but never drawn: the
      // Conversion Therapist's guilt vials crossed the screen invisibly and the
      // player lost health to nothing at all.
      engine.hazards.forEach((hazard) => {
        if (!hazard.active) return;
        const hx = hazard.x - engine.cameraX;

        ctx.save();

        // Ground shadow, so the arc reads as height rather than distance.
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(hx, hazard.y, 9, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.translate(hx, hazard.y - hazard.z);

        // Motion trail behind the direction of travel.
        const dir = hazard.vx >= 0 ? -1 : 1;
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = hazard.type === 'LASER_CROSS' ? '#d63031' : '#a855f7';
        for (let t = 1; t <= 3; t++) {
          ctx.globalAlpha = 0.35 / t;
          ctx.beginPath();
          ctx.arc(dir * t * 9, 0, 5 - t, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        if (hazard.type === 'LASER_CROSS') {
          // Excommunication wave: a crimson cross, the boss's censure made
          // visible. She used to land this damage with nothing on screen.
          ctx.rotate(Date.now() / 200);
          ctx.fillStyle = '#d63031';
          ctx.fillRect(-3.5, -14, 7, 28);
          ctx.fillRect(-11, -3.5, 22, 7);
          ctx.strokeStyle = '#ff7675';
          ctx.lineWidth = 2;
          ctx.strokeRect(-3.5, -14, 7, 28);
          ctx.strokeRect(-11, -3.5, 22, 7);

          ctx.globalAlpha = 0.35;
          ctx.fillStyle = '#ff7675';
          ctx.beginPath();
          ctx.arc(0, 0, 16, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Vial: glass body, glowing contents, cork.
          ctx.rotate(Date.now() / 90);
          ctx.fillStyle = '#22d3ee';
          ctx.beginPath();
          ctx.arc(0, 0, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#0e7490';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = '#a855f7';
          ctx.beginPath();
          ctx.arc(0, 1.5, 4.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#78350f';
          ctx.fillRect(-2.5, -10, 5, 4);
        }

        ctx.restore();
      });

      // 3. Render Shadows & Entity Sprites (Sorted by Y-depth for 2.5D layering)
      const sortedEntities = [...engine.entities].sort((a, b) => a.y - b.y);

      sortedEntities.forEach((entity) => {
        const renderX = entity.x - engine.cameraX;
        const renderY = entity.y - entity.z; // Y depth minus Z jump vertical height

        // Ground shadow. Stays on the ground plane at entity.y and shrinks as
        // the fighter rises, which is what sells the jump in a 2.5D brawler.
        const shadowScale = Math.max(0.2, 1 - entity.z / 180);
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(
          renderX,
          entity.y,
          (entity.width / 1.8) * shadowScale,
          (entity.width / 3.5) * shadowScale,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.restore();

        // Sprite
        renderEntitySprite(ctx, entity, renderX, renderY);
      });

      // 3b. Hitbox overlay
      //
      // `showHitboxes` was declared in GameSettings and read nowhere, so the
      // setting could not do anything at all. It draws what is otherwise
      // invisible: body boxes, the reach each fighter actually attacks with,
      // and the standoff ring enemies hold while waiting for an attack slot.
      if (showHitboxes) {
        ctx.save();
        ctx.lineWidth = 1;
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';

        for (const entity of engine.entities) {
          if (entity.hp <= 0) continue;
          const ex = entity.x - engine.cameraX;
          const top = entity.y - entity.z - entity.height;

          ctx.strokeStyle = entity.isPlayer ? '#00ff88' : '#ff5555';
          ctx.strokeRect(ex - entity.width / 2, top, entity.width, entity.height);

          // Feet marker: the depth position collisions and sorting actually use
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fillRect(ex - 2, entity.y - 2, 4, 4);

          // Reach. Enemies declare attackRange in their data; heroes do not —
          // their punch and kick reach are constants inside the engine, so the
          // wider of the two is what the overlay shows.
          const reach = entity.isPlayer
            ? PLAYER_KICK_REACH
            : entity.enemyType
              ? ENEMIES[entity.enemyType].attackRange
              : 0;
          if (reach > 0) {
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.ellipse(ex, entity.y, reach, reach / 3, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }

          ctx.fillStyle = '#ffffff';
          ctx.fillText(`${Math.round(entity.hp)} ${entity.action}`, ex, top - 4);
        }

        // Standoff ring, around whichever player the enemies converge on
        const target = engine.player1 && engine.player1.hp > 0 ? engine.player1 : engine.player2;
        if (target && target.hp > 0) {
          const tx = target.x - engine.cameraX;
          ctx.strokeStyle = '#ffff00';
          ctx.globalAlpha = 0.4;
          ctx.setLineDash([6, 6]);
          for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(tx + side * ATTACKER_STANDOFF_X, target.y - 120);
            ctx.lineTo(tx + side * ATTACKER_STANDOFF_X, target.y + 20);
            ctx.stroke();
          }
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }

        ctx.restore();
      }

      // 4. Render Particle Effects & Floating Combat Text
      engine.particles.forEach((p) => {
        const px = p.x - engine.cameraX;
        const py = p.y - p.z;
        ctx.save();
        ctx.globalAlpha = p.life / p.maxLife;

        if (p.type === 'TEXT' && p.text) {
          ctx.fillStyle = p.color;
          // 'black' is not a valid weight in the CSS font shorthand, so the
          // whole assignment was discarded and damage numbers fell back to the
          // canvas default of 10px sans-serif.
          ctx.font = '900 16px monospace';
          ctx.shadowColor = '#000000';
          ctx.shadowBlur = 4;
          ctx.fillText(p.text, px - 12, py);
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [engine]);

  // The engine mutates outside the React cycle, so reading its fields straight
  // from the JSX left the HUD frozen: it only refreshed when some unrelated
  // state happened to change — a keypress, a pause. Standing still while taking
  // damage left the health bar stuck. Subscribing fixes that at the source.
  const subscribeHud = useCallback((onChange: () => void) => engine.subscribeHud(onChange), [engine]);
  const getHudSnapshot = useCallback(() => engine.getHudSnapshot(), [engine]);
  const hud = useSyncExternalStore(subscribeHud, getHudSnapshot, getHudSnapshot);

  const { p1, p2, boss } = hud;

  const gamepadCount = useSyncExternalStore(subscribeGamepads, getGamepadCount, getGamepadCount);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center">
      {/* HTML5 Canvas */}
      <canvas
        ref={canvasRef}
        width={800}
        height={450}
        className="w-full h-full object-contain [image-rendering:pixelated]"
      />

      {/* Retro Arcade CRT Scanline & Curved Glass Shader Overlay */}
      {crtFilter && (
        <>
          {/* Scanline Grid.
              Opacity used to be 0.35 — with the canvas rendering blurred (the
              pixelated image-rendering class was dead), that softened into a
              faint texture. Now that sprites render crisp, the same value read
              as opaque black bars cutting across character art. Lowered to
              read as a classic CRT sheen instead of stripes on top of it. */}
          <div
            className="absolute inset-0 pointer-events-none z-20"
            style={{
              background:
                'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.12) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.03), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.03))',
              backgroundSize: '100% 4px, 6px 100%',
            }}
          />
          {/* CRT Glass Curved Vignette & Phosphor Corner Reflection */}
          <div
            className="absolute inset-0 pointer-events-none z-25 rounded-[12px]"
            style={{
              boxShadow: 'inset 0 0 90px rgba(0, 0, 0, 0.85), inset 0 0 15px rgba(255, 0, 255, 0.1)',
              background: 'radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.05) 0%, transparent 40%)',
            }}
          />
        </>
      )}

      {/* Arcade HUD Overlay (Top Health Bars matching reference image layout!) */}
      <div className="absolute top-3 left-4 right-4 flex justify-between items-start pointer-events-none z-30 font-mono select-none">
        {/* Player 1 Health & Meter */}
        {p1 && p1.charId && (
          <div className="bg-zinc-950/90 backdrop-blur-md border-2 border-[#ff00ff] p-2.5 rounded-xl shadow-2xl min-w-[240px] flex items-center gap-3">
            {/* P1 Arcade Portrait Badge */}
            {CHARACTERS[p1.charId].portraitUrl && (
              <div className="relative w-14 h-14 rounded-lg overflow-hidden border-2 border-[#00ffff] bg-black shrink-0 shadow-lg">
                <img
                  src={CHARACTERS[p1.charId].portraitUrl}
                  alt={CHARACTERS[p1.charId].name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-top filter brightness-110"
                />
                <div
                  className="absolute inset-0 pointer-events-none opacity-40"
                  style={{
                    background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.4) 50%)',
                    backgroundSize: '100% 4px',
                  }}
                />
                <div className="absolute bottom-0 left-0 right-0 bg-[#ff00ff] text-black text-[8px] font-black text-center tracking-tighter uppercase">
                  1P
                </div>
              </div>
            )}

            <div className="flex-1">
              <div className="flex justify-between items-center mb-1">
                <span className="font-black text-xs text-amber-400 uppercase tracking-wide">
                  {CHARACTERS[p1.charId].name}
                </span>
                <span className="text-[10px] text-zinc-400 font-bold">{Math.ceil(p1.hp)} HP</span>
              </div>

              {/* Health Bar Grid Blocks */}
              <div className="w-full h-4 bg-zinc-900 rounded-sm p-0.5 flex gap-0.5 border border-zinc-700">
                {Array.from({ length: 10 }).map((_, idx) => {
                  const filled = p1.hp / 10 > idx;
                  return (
                    <div
                      key={idx}
                      className={`h-full flex-1 rounded-xs transition-colors ${
                        filled ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-zinc-800'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Special Meter Bar */}
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[9px] font-bold text-amber-300">POWER</span>
                <div className="flex-1 h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                  <div
                    className="h-full bg-amber-400 transition-all"
                    style={{ width: `${p1.powerMeter}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Player 2 / AI Companion HUD */}
        {p2 && p2.charId && (
          <div className="bg-zinc-950/90 backdrop-blur-md border-2 border-[#00ffff] p-2.5 rounded-xl shadow-2xl min-w-[240px] flex items-center gap-3">
            <div className="flex-1 text-right">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] text-zinc-400 font-bold">{Math.ceil(p2.hp)} HP</span>
                <span className="font-black text-xs text-cyan-400 uppercase tracking-wide">
                  {CHARACTERS[p2.charId].name}
                </span>
              </div>

              <div className="w-full h-4 bg-zinc-900 rounded-sm p-0.5 flex gap-0.5 border border-zinc-700">
                {Array.from({ length: 10 }).map((_, idx) => {
                  const filled = p2.hp / 10 > idx;
                  return (
                    <div
                      key={idx}
                      className={`h-full flex-1 rounded-xs transition-colors ${
                        filled ? 'bg-cyan-500 shadow-sm shadow-cyan-500/50' : 'bg-zinc-800'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* P2 Arcade Portrait Badge */}
            {CHARACTERS[p2.charId].portraitUrl && (
              <div className="relative w-14 h-14 rounded-lg overflow-hidden border-2 border-[#ff00ff] bg-black shrink-0 shadow-lg">
                <img
                  src={CHARACTERS[p2.charId].portraitUrl}
                  alt={CHARACTERS[p2.charId].name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-top filter brightness-110"
                />
                <div
                  className="absolute inset-0 pointer-events-none opacity-40"
                  style={{
                    background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.4) 50%)',
                    backgroundSize: '100% 4px',
                  }}
                />
                <div className="absolute bottom-0 left-0 right-0 bg-[#00ffff] text-black text-[8px] font-black text-center tracking-tighter uppercase">
                  2P
                </div>
              </div>
            )}
          </div>
        )}

        {/* Combo Counter Display */}
        {p1 && p1.comboHits > 1 && (
          <div className="absolute top-16 left-4 bg-amber-500 text-black px-3 py-1 rounded-lg font-black text-sm italic shadow-xl animate-bounce">
            🔥 {p1.comboHits} HIT SQUAD COMBO!
          </div>
        )}
      </div>

      {/* Stage Start Banner Overlay */}
      {hud.showStageBanner && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-30 font-mono select-none px-4">
          <div className="bg-black/90 border-y-4 border-[#ff00ff] py-6 px-10 shadow-[0_0_50px_rgba(255,0,255,0.7)] flex flex-col items-center text-center animate-pulse backdrop-blur-md max-w-xl w-full">
            <span className="text-[#00ffff] text-xs font-black tracking-widest uppercase mb-1">
              ✦ STAGE {engine.stage.id} START ✦
            </span>
            <h1 className="text-xl md:text-2xl font-black text-[#ffff00] uppercase tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,0,0.8)]">
              {engine.stage.name}
            </h1>
            <p className="text-zinc-300 text-xs italic font-bold mt-1 mb-4">
              "{engine.stage.subtitle}"
            </p>
            <div className="bg-[#ff00ff] text-black font-black text-xs md:text-sm px-6 py-1.5 uppercase tracking-widest animate-bounce shadow-lg">
              READY... GO!!
            </div>
          </div>
        </div>
      )}

      {/* Boss Warning Banner Overlay */}
      {hud.showBossWarning && (
        <div className="absolute top-1/3 left-0 right-0 pointer-events-none z-30 font-mono select-none flex justify-center px-2">
          <div className="w-full bg-gradient-to-r from-red-950 via-red-600 to-red-950 border-y-4 border-amber-400 py-3 text-center shadow-[0_0_40px_rgba(255,0,0,0.8)] animate-pulse">
            <span className="text-white font-black text-sm md:text-lg tracking-widest uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              {hud.bossWarningTitle || '⚠️ WARNING: ENEMY SURGE ENCOUNTER ⚠️'}
            </span>
          </div>
        </div>
      )}

      {/* Arcade "GO! ➔" Navigation Prompt when wave is cleared */}
      {!hud.isWaveActive &&
        hud.currentWaveIndex < engine.stage.waves.length &&
        !hud.stageCleared && (
          <div className="absolute top-1/2 right-4 -translate-y-1/2 pointer-events-none z-30 font-mono select-none flex flex-col items-end gap-1.5 animate-bounce">
            <div className="bg-gradient-to-r from-[#ff00ff] via-[#00ffff] to-[#ffff00] text-black font-black text-sm md:text-base px-4 py-2 rounded-xl border-2 border-white shadow-[0_0_25px_rgba(0,255,255,0.9)] flex items-center gap-2">
              <span className="tracking-widest">GO!</span>
              <span className="text-xl animate-ping">➔</span>
              <span className="text-xl">➔</span>
            </div>
            <div className="bg-black/90 border border-[#00ffff] px-2.5 py-1 rounded-md text-[10px] font-bold text-[#ffff00] shadow-md">
              MARCH FORWARD → (SECTOR {hud.currentWaveIndex + 1}/{engine.stage.waves.length})
            </div>
          </div>
        )}

      {/* Gamepad connection badge */}
      {/* Sat in the bottom-right corner, where the on-screen D-pad covers it and
          nobody looks. Moved under the health bars, which is where a player
          checks whether their controller registered. */}
      {gamepadCount > 0 && (
        <div className="absolute top-24 left-4 pointer-events-none z-30 bg-black/85 border-2 border-[#00ffff] px-2.5 py-1 rounded-lg text-xs font-mono font-black text-[#00ffff] shadow-[0_0_12px_rgba(0,255,255,0.5)]">
          🎮 {gamepadCount === 1 ? 'PAD 1' : `PAD 1-${gamepadCount}`}
        </div>
      )}

      {/* Boss Health Bar Display */}
      {boss && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-4/5 max-w-lg bg-black/95 border-2 border-red-600 p-3 rounded-xl shadow-[0_0_30px_rgba(255,0,0,0.7)] pointer-events-none z-30 font-mono text-center">
          <div className="flex justify-between items-center mb-1 text-xs">
            <span className="font-black text-red-500 uppercase tracking-widest flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping inline-block" />
              ⚠️ BOSS: {boss.enemyType === 'BOSS_MADAM_MIZYDIA' ? 'MADAM MIZYDIA' : boss.enemyType === 'BOSS_SAYONARA' ? 'SAYONARA' : 'PURITY COMMANDER'}
            </span>
            <span className="text-amber-300 font-bold">{Math.ceil(boss.hp)} / {boss.maxHp} HP</span>
          </div>

          <div className="w-full h-3.5 bg-zinc-950 rounded-full overflow-hidden border border-red-900 p-0.5">
            <div
              className="h-full bg-gradient-to-r from-red-700 via-red-500 to-amber-500 rounded-full transition-all duration-150 shadow-sm shadow-red-500"
              style={{ width: `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%` }}
            />
          </div>

          {/* Shield status */}
          {boss.shieldHp !== undefined && boss.shieldHp > 0 && (
            <div className="mt-1 text-[10px] text-cyan-400 font-bold tracking-wide">
              🛡️ CENSURE BARRIER SHIELD ACTIVE ({boss.shieldHp} HP)
            </div>
          )}
        </div>
      )}
    </div>
  );
};
