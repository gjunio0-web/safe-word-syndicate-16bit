import React, { useState } from 'react';
import { CHARACTERS, ENEMIES } from '../game/characterData';
import { KEYBOARD_LAYOUT } from '../game/keyboard';
import { portraitFor } from '../game/portraits';
import { PortraitId } from '../types';
import { BookOpen, X, Shield, Zap, Skull, Award } from 'lucide-react';

interface LoreCodexProps {
  onClose: () => void;
}

/** Rank and file, in the order the campaign first sends them at you. */
const GRUNTS = ['PURITY_PATROL', 'CONVERSION_THERAPIST', 'TRAD_WIFE_STRIKER'] as const;

/** The two that end a stage. Sayonara stays collared here — see PortraitFrame. */
const BOSSES = ['BOSS_SAYONARA', 'BOSS_MADAM_MIZYDIA'] as const;

/** EnemyType and PortraitId are separate vocabularies; this is the bridge. */
const ENEMY_PORTRAITS: Record<(typeof GRUNTS | typeof BOSSES)[number], PortraitId> = {
  PURITY_PATROL: 'PURITY_PATROL',
  CONVERSION_THERAPIST: 'CONVERSION_THERAPIST',
  TRAD_WIFE_STRIKER: 'TRAD_WIFE_STRIKER',
  // Not SAYONARA_FREED. That face is the last beat of the campaign and this
  // book opens from the title screen, before a single punch is thrown.
  BOSS_SAYONARA: 'SAYONARA',
  BOSS_MADAM_MIZYDIA: 'MADAM_MIZYDIA',
};

/**
 * The portrait frame the HEROES tab already used: 112x144, magenta border, CRT
 * scanline. Pulled out so the tabs cannot drift — a codex that presents faces
 * two different ways reads as two different books.
 *
 * The frame is taller than it is wide while every source image is square, so
 * object-cover trims roughly 16px from each side rather than squashing the
 * subject, and object-top spends that budget at the bottom of the image before
 * it ever reaches a face.
 */
const PortraitFrame: React.FC<{ src?: string; alt: string }> = ({ src, alt }) =>
  src ? (
    <div className="relative w-full sm:w-28 h-36 bg-black border-2 border-[#ff00ff] overflow-hidden shrink-0 shadow-lg">
      <img src={src} alt={alt} className="w-full h-full object-cover object-top" />
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.4) 50%)',
          backgroundSize: '100% 4px',
        }}
      />
    </div>
  ) : null;

/**
 * ENEMIES and BOSSES, in the layout the HEROES tab established: a two-column
 * grid of cards, each a face beside a profile with a stat block underneath
 * where a hero card carries its Power Move.
 *
 * Read from the ENEMIES table rather than written out in JSX. The two tabs
 * this replaces held their own hand-typed copies of names and descriptions
 * that had already drifted from the table the fight itself runs on — the
 * codex called them "Purity Patrols" while the game called them "Purity
 * Patrol Grunt", and the numbers appeared nowhere at all.
 */
const Bestiary: React.FC<{ types: readonly (keyof typeof ENEMY_PORTRAITS)[] }> = ({ types }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {types.map((type) => {
      const e = ENEMIES[type];
      return (
        <div
          key={type}
          className="bg-[#111] p-4 border-2 border-[#333] hover:border-[#ff00ff] transition-colors space-y-3"
        >
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <PortraitFrame src={portraitFor(ENEMY_PORTRAITS[type])} alt={e.name} />
            <div className="flex-1 space-y-1">
              <h4
                className="font-black text-xl uppercase italic leading-none"
                style={{ color: e.color }}
              >
                {e.name}
              </h4>
              <span className="text-[10px] text-amber-400 font-mono block uppercase tracking-widest font-bold">
                {e.role}
              </span>
              <p className="text-xs text-gray-300 leading-relaxed font-mono mt-2">{e.origin}</p>
            </div>
          </div>

          <div className="bg-[#0a0a0a] p-2.5 border border-[#333] text-xs font-mono">
            <span className="font-bold text-[#ff00ff] block mb-1">⚡ {e.weaponName}</span>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              {([
                ['HEALTH', String(e.maxHp)],
                ['DAMAGE', String(e.power)],
                ['REACH', String(e.attackRange)],
                ['SPEED', e.speed.toFixed(1)],
              ] as const).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="text-zinc-300">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      );
    })}
  </div>
);

/**
 * Written out here rather than imported because the engine holds these
 * numbers inline at the point of use — performPowerMove() in engine.ts
 * branches on charId and passes the damage straight to damageEntity(). There
 * is no table to read from, so if that function changes, this one has to
 * change with it.
 *
 * Reach is described by shape rather than by pixel radius: the radii are real
 * (200, 180, 150 and a 60px-deep frontal band) but they mean nothing to
 * someone holding a controller, and the useful distinction between these four
 * moves is whether they hit all around you or only ahead.
 */
const POWER_MOVES = [
  {
    hero: 'Feet Master',
    move: 'Human Bat Swing',
    colour: '#f5a623',
    text: '45 damage to everything in a wide circle around you, no facing required. Survivors are thrown outward and lifted off their feet.',
  },
  {
    hero: 'Fun Maker',
    move: 'Rollercoaster Hurricane',
    colour: '#e2b036',
    text: '40 damage in a slightly tighter circle. Everything caught is juggled skyward — and so are you, which sets up an air chase.',
  },
  {
    hero: 'Omega Biker',
    move: 'Heavy Shockwave Kick',
    colour: '#ff3b30',
    text: '50 damage in a straight line ahead of you only. Breaks a shield outright rather than wearing it down, and kicks what it hits across the screen.',
  },
  {
    hero: 'Angry Corso',
    move: 'Feral Pup Rush & Bite',
    colour: '#34c759',
    text: '55 damage, the heaviest in the roster, in a short circle around you. Every enemy bitten returns 25 HP to you, so a crowd is a full heal.',
  },
] as const;

export const LoreCodex: React.FC<LoreCodexProps> = ({ onClose }) => {
  const [tab, setTab] = useState<'HEROES' | 'ENEMIES' | 'BOSSES' | 'COMBOS'>('HEROES');

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none font-sans text-white" data-gamepad-scope>
      <div className="bg-[#111] border-4 border-[#ff00ff] w-full max-w-3xl h-[80vh] flex flex-col overflow-hidden shadow-[0_0_30px_rgba(255,0,255,0.4)]">
        {/* Top Header */}
        <div className="p-4 border-b-4 border-[#ff00ff] flex justify-between items-center bg-[#1a1a1a]">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#ffff00]" />
            <h2 className="text-lg font-black italic text-[#ffff00] tracking-tighter uppercase">
              PUNK REBEL CODEX & DOSSIER<span className="text-[#00ffff]">.</span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 bg-[#111] hover:bg-[#222] border-2 border-[#333] hover:border-[#ff00ff] text-zinc-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap border-b-2 border-[#333] bg-[#0a0a0a] p-2 gap-2 text-xs font-mono">
          <button
            onClick={() => setTab('HEROES')}
            className={`px-3 py-1.5 font-black uppercase tracking-wider flex items-center gap-1 transition-all ${
              tab === 'HEROES' ? 'bg-[#00ffff] text-black shadow-md' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5" /> THE SAFE-WORD SYNDICATE
          </button>
          <button
            onClick={() => setTab('ENEMIES')}
            className={`px-3 py-1.5 font-black uppercase tracking-wider flex items-center gap-1 transition-all ${
              tab === 'ENEMIES' ? 'bg-[#ff00ff] text-black shadow-md' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Skull className="w-3.5 h-3.5" /> THE LEAGUE OF CONSERVATIVE CHRISTIANS
          </button>
          <button
            onClick={() => setTab('BOSSES')}
            className={`px-3 py-1.5 font-black uppercase tracking-wider flex items-center gap-1 transition-all ${
              tab === 'BOSSES' ? 'bg-[#ffff00] text-black shadow-md' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Award className="w-3.5 h-3.5" /> BOSS DOSSIERS
          </button>
          <button
            onClick={() => setTab('COMBOS')}
            className={`px-3 py-1.5 font-black uppercase tracking-wider flex items-center gap-1 transition-all ${
              tab === 'COMBOS' ? 'bg-[#ff4e00] text-black shadow-md' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5" /> COMBOS & MOVES
          </button>
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-[#0a0a0a]">
          {tab === 'HEROES' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.values(CHARACTERS).map((hero) => (
                <div key={hero.id} className="bg-[#111] p-4 border-2 border-[#333] hover:border-[#00ffff] transition-colors space-y-3">
                  <div className="flex flex-col sm:flex-row gap-4 items-start">
                    {hero.portraitUrl && (
                      <div className="relative w-full sm:w-28 h-36 bg-black border-2 border-[#ff00ff] overflow-hidden shrink-0 shadow-lg">
                        <img
                          src={hero.portraitUrl}
                          alt={hero.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover object-top"
                        />
                        <div
                          className="absolute inset-0 pointer-events-none opacity-40"
                          style={{
                            background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.4) 50%)',
                            backgroundSize: '100% 4px',
                          }}
                        />
                      </div>
                    )}
                    <div className="flex-1 space-y-1">
                      <h4 className="font-black text-[#00ffff] text-xl uppercase italic leading-none">{hero.name}</h4>
                      <span className="text-[10px] text-amber-400 font-mono block uppercase tracking-widest font-bold">{hero.archetype}</span>
                      <p className="text-xs text-gray-300 leading-relaxed font-mono mt-2">{hero.origin}</p>
                    </div>
                  </div>

                  <div className="bg-[#0a0a0a] p-2.5 border border-[#333] text-xs text-[#ffff00] font-mono">
                    <span className="font-bold text-[#ff00ff] block mb-0.5">⚡ {hero.powerMoveName}</span>
                    <span className="text-zinc-300 text-[11px]">{hero.powerMoveDesc}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'ENEMIES' && <Bestiary types={GRUNTS} />}

          {tab === 'BOSSES' && <Bestiary types={BOSSES} />}

          {tab === 'COMBOS' && (
            <div className="space-y-3 font-mono text-xs text-gray-300">
              <div className="bg-[#111] p-3 border border-[#333]">
                <span className="text-[#ffff00] font-black uppercase block">3-HIT PUNCH COMBO</span>
                Tap [J] rapidly to perform a swift 3-hit jab combination ending in a heavy finisher.
              </div>
              <div className="bg-[#111] p-3 border border-[#333]">
                <span className="text-[#00ffff] font-black uppercase block">HEAVY KNOCKBACK KICK</span>
                Press [K] to perform a kick that launches enemies backward and opens defensive guards.
              </div>
              <div className="bg-[#111] p-3 border border-[#333]">
                <span className="text-[#ff00ff] font-black uppercase block">JUMP ATTACK</span>
                Press [SPACE] to jump, then press [J] or [K] in mid-air to land a flying dive kick!
              </div>
              <div className="bg-[#111] p-3 border-2 border-[#ff4e00] space-y-2">
                <span className="text-[#ff4e00] font-black uppercase block">SPECIAL POWER MOVE</span>
                <p>
                  Press [L] with at least 30 points on the Power Meter to trigger your
                  fighter's signature move. It spends exactly 30 of the 100 the meter
                  holds, so a full bar is three of them.
                </p>
                <p>
                  The meter fills by itself at about 2.4 points a second, and every
                  hit you land adds 8 more. Standing still, that is roughly twelve
                  seconds between moves; fighting, far less. Each stage starts you at
                  full.
                </p>
                <p>
                  The first two thirds of a second are invulnerable, so the move
                  trades through an attack already coming at you. Start it standing,
                  walking, jumping or flying — it also cancels a punch or kick you
                  have already thrown.
                </p>
                <p>
                  It can be locked out. A Conversion Therapist's guilt vial suppresses
                  it for three seconds, Madam Mizydia's Excommunication cross for four.
                </p>

                <dl className="pt-1 space-y-1.5">
                  {POWER_MOVES.map(({ hero, move, colour, text }) => (
                    <div key={hero}>
                      <dt className="font-black uppercase" style={{ color: colour }}>
                        {hero} — {move}
                      </dt>
                      <dd className="text-gray-400">{text}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="bg-[#111] p-3 border border-[#333]">
                <span className="text-[#00ffff] font-black uppercase block">FLIGHT (FUN MAKER ONLY)</span>
                Jump, then press [SPACE] again in mid-air to hover. Climb with [SPACE]
                or up, drop with down, and keep punching and kicking the whole time.
                Flight sips the Power Meter instead of spending it in a lump — about
                1.2 points a second, so a full bar is over a minute aloft — and ends
                the moment the meter runs dry. A guilt vial grounds it too.
              </div>

              {/* The only place the controls are written down inside the game,
                  and it documented player one alone. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {([
                  ['PLAYER 1', '#00ffff', KEYBOARD_LAYOUT.playerOne],
                  ['PLAYER 2', '#ff00ff', KEYBOARD_LAYOUT.playerTwo],
                ] as const).map(([title, colour, layout]) => (
                  <div key={title} className="bg-[#111] p-4 border-2 border-[#333]">
                    <span className="font-black uppercase block mb-2" style={{ color: colour }}>
                      {title}
                    </span>
                    <dl className="text-xs font-mono space-y-1 text-gray-300">
                      {Object.entries(layout).map(([action, keys]) => (
                        <div key={action} className="flex justify-between gap-3">
                          <dt className="uppercase text-gray-500">
                            {action.replace(/([A-Z])/g, ' $1')}
                          </dt>
                          <dd className="text-right text-white">{keys}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-gray-500 font-mono">
                Player two's keys are live in 2P CO-OP only. A connected controller
                takes that slot instead, and the arrow keys stay with player one
                in every other mode.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
