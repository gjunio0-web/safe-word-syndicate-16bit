import React, { useState } from 'react';
import { CHARACTERS } from '../game/characterData';
import { KEYBOARD_LAYOUT } from '../game/keyboard';
import { BookOpen, X, Shield, Zap, Skull, Award } from 'lucide-react';

interface LoreCodexProps {
  onClose: () => void;
}

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

          {tab === 'ENEMIES' && (
            <div className="space-y-3 font-mono text-xs">
              <div className="bg-[#111] p-4 border-2 border-[#ff00ff]">
                <h4 className="font-black text-[#ff00ff] text-sm uppercase">Purity Patrols (Low-Level Grunts)</h4>
                <p className="text-gray-300 mt-1">
                  March in pressed khakis and polo shirts with synchronized, robotic stiffness wielding heavy picket signs.
                </p>
              </div>

              <div className="bg-[#111] p-4 border-2 border-[#00ffff]">
                <h4 className="font-black text-[#00ffff] text-sm uppercase">Conversion Therapists (Ranged Suppressors)</h4>
                <p className="text-gray-300 mt-1">
                  Throw splash Guilt Vials and Repression Darts that temporarily slow down fighters and lock out Power Moves!
                </p>
              </div>

              <div className="bg-[#111] p-4 border-2 border-[#ffff00]">
                <h4 className="font-black text-[#ffff00] text-sm uppercase">Trad-Wife Strikers (Agile Counter-Attackers)</h4>
                <p className="text-gray-300 mt-1">
                  Nimble fighters wielding weaponized cast-iron skillets and rolling pins. Capable of parrying heavy hits.
                </p>
              </div>
            </div>
          )}

          {tab === 'BOSSES' && (
            <div className="space-y-4 font-mono text-xs">
              <div className="bg-[#111] p-4 border-2 border-[#ff4e00] space-y-2">
                <h4 className="font-black text-[#ff4e00] text-base uppercase">Madam Mizydia (The Ultimate Matriarch)</h4>
                <p className="text-gray-300 leading-relaxed">
                  Fights coldly from behind her mahogany altar-table in the Mega-Church Corporate Tower. Summons "Censure" barrier shields that absorb damage and projects sweeping Excommunication waves that lock out hero Power Moves.
                </p>
              </div>

              <div className="bg-[#111] p-4 border-2 border-[#ff00ff] space-y-2">
                <h4 className="font-black text-[#ff00ff] text-base uppercase">Sayonara (The Old Guard)</h4>
                <p className="text-gray-300 leading-relaxed">
                  Madam Mizydia's loyal guard dog. Performs screen-clearing knockback tackles. Depleting Mizydia's health breaks the mind control spell, allowing Sayonara to turn her back on Mizydia and walk away into freedom!
                </p>
              </div>
            </div>
          )}

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
              <div className="bg-[#111] p-3 border border-[#333]">
                <span className="text-[#ff4e00] font-black uppercase block">SPECIAL POWER MOVE</span>
                Press [L] when your Power Meter reaches at least 30% to trigger your character's signature devastation move!
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
