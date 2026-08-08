import { describe, it, expect } from 'vitest';
import {
  companionState,
  decideCompanionInput,
  nearestTarget,
  newCompanionMemory,
  selectTarget,
  shouldPowerMove,
  prefersKick,
  canStrike,
  COMPANION_TUNING,
  catchUpScale,
  CATCH_UP_ENGAGE_X,
  CATCH_UP_RELEASE_X,
  CATCH_UP_MULTIPLIER,
  TRAIL_CEILING_X,
  strikeBandFor,
  POWER_MOVE_COST,
  KICK_MAX_DX,
  LEASH_X,
  LEASH_TOLERANCE_X,
  STRIKE_MAX_DX,
  STRIKE_MAX_DY,
} from '../game/companionAi';
import { PLAYER_BODY_SEPARATION_X, PLAYER_PUNCH_REACH } from '../game/constants';
import { EntityState, GameSettings } from '../types';
import { CHARACTERS } from '../game/characterData';
import { startEngine, stageEnemies, NEUTRAL, input } from './helpers';
import { GameEngine } from '../game/engine';
import { STAGES } from '../game/stageData';

/** A bare entity at a position, enough for the policy to read. */
function at(x: number, y: number, over: Partial<EntityState> = {}): EntityState {
  return {
    id: 'e' + x + '_' + y,
    isPlayer: false,
    x,
    y,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    facing: 'LEFT',
    hp: 80,
    maxHp: 80,
    powerMeter: 0,
    action: 'IDLE',
    actionFrame: 0,
    actionTimer: 0,
    invulnerableTimer: 0,
    stunTimer: 0,
    slowTimer: 0,
    suppressedTimer: 0,
    comboHits: 0,
    comboTimer: 0,
    width: 60,
    height: 120,
    ...over,
  } as EntityState;
}

const buddy = () => at(100, 300, { isPlayer: true, playerNum: 2, charId: 'FUN_MAKER' });

describe('companion strike band', () => {
  it('is reachable from where body separation parks the buddy', () => {
    // The bug this whole module replaces: the old gate was 45px while the
    // collision pass holds player and enemy at least 72px apart, so the
    // attack branch was dead code. The band has to clear that floor.
    expect(STRIKE_MAX_DX).toBeGreaterThan(PLAYER_BODY_SEPARATION_X);
  });

  it('swings at an enemy sitting on the separation floor', () => {
    const self = buddy();
    expect(canStrike(self, at(self.x + PLAYER_BODY_SEPARATION_X, self.y))).toBe(true);
  });

  it('holds fire past the longest hitbox it has', () => {
    // The band opened up when the kick joined the repertoire: in reach now
    // means in reach of the kick, and which attack to throw is decided after.
    const self = buddy();
    expect(canStrike(self, at(self.x + KICK_MAX_DX - 2, self.y))).toBe(true);
    expect(canStrike(self, at(self.x + KICK_MAX_DX + 2, self.y))).toBe(false);
  });

  it('holds fire on a target too far off in depth', () => {
    const self = buddy();
    expect(canStrike(self, at(self.x + 60, self.y + STRIKE_MAX_DY + 5))).toBe(false);
  });
});

describe('companion target selection', () => {
  it('takes the nearest enemy, not the first one spawned', () => {
    const self = buddy();
    const far = at(self.x + 500, self.y);
    const near = at(self.x + 90, self.y);
    expect(nearestTarget(self, [far, near])?.id).toBe(near.id);
  });

  it('ignores a downed fighter', () => {
    const self = buddy();
    expect(nearestTarget(self, [at(self.x + 80, self.y, { downed: true })])).toBeNull();
  });

  it('ignores a freed fighter', () => {
    const self = buddy();
    expect(nearestTarget(self, [at(self.x + 80, self.y, { freed: true })])).toBeNull();
  });

  it('presses nothing on an empty street with nobody to follow', () => {
    expect(decideCompanionInput(buddy(), [], null, newCompanionMemory())).toEqual(NEUTRAL);
  });

  it('keeps the enemy it is already fighting when another is barely closer', () => {
    const self = buddy();
    const held = at(self.x + 100, self.y);
    const rival = at(self.x + 90, self.y);
    expect(selectTarget(self, [held, rival], held.id)?.id).toBe(held.id);
  });

  it('switches when the new enemy is decisively closer', () => {
    const self = buddy();
    const held = at(self.x + 400, self.y);
    const rival = at(self.x + 80, self.y);
    expect(selectTarget(self, [held, rival], held.id)?.id).toBe(rival.id);
  });

  it('lets go of an enemy that goes down mid-fight', () => {
    const self = buddy();
    const held = at(self.x + 90, self.y, { downed: true });
    const other = at(self.x + 300, self.y);
    expect(selectTarget(self, [held, other], held.id)?.id).toBe(other.id);
  });
});

describe('companion movement intent', () => {
  it('walks toward a target that is out of reach', () => {
    const self = buddy();
    const input = decideCompanionInput(self, [at(self.x + 400, self.y)], null, newCompanionMemory());
    expect(input.right).toBe(true);
    expect(input.left).toBe(false);
    expect(input.punch).toBe(false);
  });

  it('closes the depth gap', () => {
    const self = buddy();
    const input = decideCompanionInput(
      self,
      [at(self.x + 400, self.y - 60)],
      null,
      newCompanionMemory()
    );
    expect(input.up).toBe(true);
    expect(input.down).toBe(false);
  });

  it('keeps pressing into a target it is already hitting, to hold facing', () => {
    const self = buddy();
    const input = decideCompanionInput(self, [at(self.x - 80, self.y)], null, newCompanionMemory());
    expect(input.left).toBe(true);
    expect(input.punch).toBe(true);
  });
});

describe('companion state machine', () => {
  it('hands off the pad while hurt', () => {
    const self = buddy();
    self.action = 'HURT';
    expect(companionState(self, at(self.x + 60, self.y))).toBe('RECOVER');
    expect(decideCompanionInput(self, [at(self.x + 60, self.y)], null, newCompanionMemory())).toEqual(
      NEUTRAL
    );
  });

  it('hands off the pad while stunned', () => {
    const self = buddy();
    self.stunTimer = 20;
    expect(companionState(self, at(self.x + 60, self.y))).toBe('RECOVER');
  });

  it('engages what it cannot yet reach and strikes what it can', () => {
    const self = buddy();
    expect(companionState(self, at(self.x + 400, self.y))).toBe('ENGAGE');
    expect(companionState(self, at(self.x + 80, self.y))).toBe('STRIKE');
  });

  it('follows the hero when the street is clear', () => {
    const self = buddy();
    expect(companionState(self, null)).toBe('FOLLOW');
  });
});

describe('companion leash', () => {
  const hero = (x: number, y = 300) =>
    at(x, y, { isPlayer: true, playerNum: 1, charId: 'FEET_MASTER', hp: 100, maxHp: 100 });

  it('parks the buddy outside the hero, not inside them', () => {
    // The leash tests below place the hero at LEASH_X, so every one of them
    // agrees with whatever LEASH_X happens to be — set it to 0 and they all
    // still pass while the buddy stands inside the hero and shoves them 500px
    // down the street. This is the assertion that cannot agree: the station
    // has to clear the distance the collision pass holds two players apart.
    expect(LEASH_X).toBeGreaterThan(PLAYER_BODY_SEPARATION_X);
  });

  it('walks up when the hero has left it behind', () => {
    const self = buddy();
    const input = decideCompanionInput(self, [], hero(self.x + 600), newCompanionMemory());
    expect(input.right).toBe(true);
  });

  it('stands its ground inside the follow band', () => {
    const self = buddy();
    const input = decideCompanionInput(self, [], hero(self.x + LEASH_X), newCompanionMemory());
    expect(input.right).toBe(false);
    expect(input.left).toBe(false);
  });

  it('backs off rather than shoving the hero', () => {
    const self = buddy();
    const ally = hero(self.x + LEASH_X - LEASH_TOLERANCE_X - 20);
    expect(decideCompanionInput(self, [], ally, newCompanionMemory()).left).toBe(true);
  });

  it('never leaves the leash for a downed hero', () => {
    const self = buddy();
    const ally = hero(self.x + 600);
    ally.hp = 0;
    expect(decideCompanionInput(self, [], ally, newCompanionMemory())).toEqual(NEUTRAL);
  });
});

describe('companion in the running engine', () => {
  it('damages an enemy it was previously only bumping into', () => {
    const engine = startEngine(0, 'FEET_MASTER', 'FUN_MAKER');
    stageEnemies(engine, [{ type: 'PURITY_PATROL', dx: 150 }]);
    const enemy = engine.entities.find((e) => !e.isPlayer)!;
    const startHp = enemy.hp;

    // Player one stands still: every hit landed here is the buddy's.
    for (let i = 0; i < 240; i++) engine.update(NEUTRAL);

    expect(enemy.hp).toBeLessThan(startHp);
  });

  it('leaves a knocked-down Sayonara alone', () => {
    const engine = startEngine(0, 'FEET_MASTER', 'ANGRY_CORSO');
    stageEnemies(engine, [{ type: 'BOSS_SAYONARA', dx: 120 }]);
    const sayonara = engine.entities.find((e) => e.enemyType === 'BOSS_SAYONARA')!;
    sayonara.downed = true;
    sayonara.hp = 40;
    const startHp = sayonara.hp;

    for (let i = 0; i < 240; i++) engine.update(NEUTRAL);

    // The second ending is the player's call. The buddy must not cast it.
    expect(sayonara.hp).toBe(startHp);
    expect(engine.sayonaraKilled).toBe(false);
  });
});

describe('companion repertoire', () => {
  const tuning = COMPANION_TUNING;

  it('opens with the kick from the band the punch cannot cover', () => {
    const self = buddy();
    const memory = newCompanionMemory();
    const input = decideCompanionInput(
      self,
      [at(self.x + STRIKE_MAX_DX + 10, self.y)],
      null,
      memory,
      tuning
    );
    expect(input.kick).toBe(true);
    expect(input.punch).toBe(false);
  });

  it('punches inside, for a combo hero', () => {
    // Fun Maker: combo 5, range 3.
    const self = buddy();
    const input = decideCompanionInput(self, [at(self.x + 80, self.y)], null, newCompanionMemory(), tuning);
    expect(input.punch).toBe(true);
    expect(input.kick).toBe(false);
  });

  it('kicks inside, for a long-reach hero', () => {
    // Feet Master: range 4, combo 2.
    expect(prefersKick('FEET_MASTER')).toBe(true);
    expect(prefersKick('FUN_MAKER')).toBe(false);
  });

  it('rests between swings and keeps walking through the pause', () => {
    const self = buddy();
    const memory = newCompanionMemory();
    const enemies = [at(self.x + 80, self.y)];

    const first = decideCompanionInput(self, enemies, null, memory, tuning);
    expect(first.punch).toBe(true);

    const second = decideCompanionInput(self, enemies, null, memory, tuning);
    expect(second.punch).toBe(false);
    expect(second.kick).toBe(false);
    expect(second.right).toBe(true);
  });

  it('plays the same way whatever the difficulty is set to', () => {
    // The buddy is deliberately off the difficulty dial: that setting moves
    // how much is coming at the players, not how good their partner is. A
    // future decision to scale it has to come through here.
    const settings = (difficulty: GameSettings['difficulty']): GameSettings => ({
      soundEnabled: false,
      musicEnabled: false,
      volume: 0,
      crtFilter: false,
      showHitboxes: false,
      difficulty,
    });

    const openingMove = (difficulty: GameSettings['difficulty']) => {
      const engine = new GameEngine(STAGES[0], 'FEET_MASTER', 'FUN_MAKER', settings(difficulty));
      engine.setActiveDialogue(null);
      engine.entities = engine.entities.filter((e) => e.isPlayer);
      const self = engine.player2!;
      engine.spawnEnemy('PURITY_PATROL', self.x + 80, self.y);
      engine.update(NEUTRAL);
      return self.action;
    };

    const difficulties: Array<GameSettings['difficulty']> = ['EASY', 'NORMAL', 'PUNK_HARD'];
    const moves = difficulties.map(openingMove);
    // Identical, and identically a swing — three IDLEs would agree too.
    expect(new Set(moves).size).toBe(1);
    expect(moves[0]).toBe('PUNCH1');
  });

  it('never narrows the horizontal band below the separation floor', () => {
    // The original bug, guarded at the one tuning that exists.
    const self = buddy();
    const enemy = at(self.x + PLAYER_BODY_SEPARATION_X, self.y);
    expect(companionState(self, enemy, COMPANION_TUNING.strikeMaxDy)).toBe('STRIKE');
  });
});

describe('companion power move', () => {
  const tuning = COMPANION_TUNING;
  const charged = () => {
    const self = buddy();
    self.powerMeter = 100;
    return self;
  };

  it('saves the meter for a lone grunt', () => {
    const self = charged();
    const enemies = [at(self.x + 80, self.y)];
    expect(shouldPowerMove(self, enemies[0], enemies, tuning)).toBe(false);
  });

  it('spends it on a crowd inside the radius', () => {
    const self = charged();
    const enemies = [at(self.x + 80, self.y), at(self.x + 120, self.y + 20), at(self.x + 150, self.y - 20)];
    expect(shouldPowerMove(self, enemies[0], enemies, tuning)).toBe(true);
  });

  it('spends it on a boss that is nearly down', () => {
    const self = charged();
    const boss = at(self.x + 90, self.y, { enemyType: 'BOSS_MADAM_MIZYDIA', hp: 100, maxHp: 600 });
    expect(shouldPowerMove(self, boss, [boss], tuning)).toBe(true);
  });

  it('holds the meter while suppressed by a therapist dart', () => {
    const self = charged();
    self.suppressedTimer = 60;
    const enemies = [at(self.x + 80, self.y), at(self.x + 120, self.y), at(self.x + 150, self.y)];
    expect(shouldPowerMove(self, enemies[0], enemies, tuning)).toBe(false);
  });

  it('holds the meter when it cannot afford the move', () => {
    const self = buddy();
    self.powerMeter = POWER_MOVE_COST - 1;
    const enemies = [at(self.x + 80, self.y), at(self.x + 120, self.y), at(self.x + 150, self.y)];
    expect(shouldPowerMove(self, enemies[0], enemies, tuning)).toBe(false);
  });

  it('lets Omega Biker break a censure shield on sight', () => {
    const self = buddy();
    self.charId = 'OMEGA_BIKER';
    self.powerMeter = 100;
    const boss = at(self.x + 90, self.y, {
      enemyType: 'BOSS_MADAM_MIZYDIA',
      hp: 600,
      maxHp: 600,
      shieldHp: 150,
    });
    expect(shouldPowerMove(self, boss, [boss], tuning)).toBe(true);
  });
});

describe('companion catch-up', () => {
  const ally = (x: number) => at(x, 300);

  it('sprints once the leash band is behind it', () => {
    const memory = newCompanionMemory();
    const self = buddy();
    const hero = ally(self.x + CATCH_UP_ENGAGE_X + 1);
    expect(catchUpScale(self, hero, true, memory)).toBe(CATCH_UP_MULTIPLIER);
  });

  it('walks again once back inside the band', () => {
    const memory = newCompanionMemory();
    const self = buddy();
    catchUpScale(self, ally(self.x + CATCH_UP_ENGAGE_X + 1), true, memory);
    expect(catchUpScale(self, ally(self.x + CATCH_UP_RELEASE_X - 1), true, memory)).toBe(1);
  });

  it('keeps sprinting between the two thresholds instead of stuttering', () => {
    // Releasing at the engage line would flip every frame across it. Once
    // running, it runs until the leash is actually reached.
    const memory = newCompanionMemory();
    const self = buddy();
    catchUpScale(self, ally(self.x + CATCH_UP_ENGAGE_X + 1), true, memory);
    const between = (CATCH_UP_ENGAGE_X + CATCH_UP_RELEASE_X) / 2;
    expect(catchUpScale(self, ally(self.x + between), true, memory)).toBe(CATCH_UP_MULTIPLIER);
  });

  it('never sprints with something to fight', () => {
    // The exception buys back a traversal the engine cannot walk off. It must
    // not buy speed in a fight the player would otherwise have to earn.
    const memory = newCompanionMemory();
    const self = buddy();
    expect(catchUpScale(self, ally(self.x + 400), false, memory)).toBe(1);
    expect(memory.catchingUp).toBe(false);
  });

  it('never sprints ahead of the hero', () => {
    const memory = newCompanionMemory();
    const self = buddy();
    expect(catchUpScale(self, ally(self.x - 400), true, memory)).toBe(1);
  });

  it('stands still when there is no hero left to follow', () => {
    const memory = newCompanionMemory();
    const self = buddy();
    expect(catchUpScale(self, null, true, memory)).toBe(1);
    expect(catchUpScale(self, at(self.x + 400, 300, { hp: 0 }), true, memory)).toBe(1);
  });

  it('asks for a leash the engine can actually deliver', () => {
    // The camera drags anyone further back than this to the screen edge, so a
    // leash beyond the ceiling is a promise no amount of speed can keep.
    expect(LEASH_X + LEASH_TOLERANCE_X).toBeLessThan(TRAIL_CEILING_X);
    expect(CATCH_UP_ENGAGE_X).toBeLessThan(TRAIL_CEILING_X);
  });

  it('declares a ceiling the engine actually enforces', () => {
    // The two assertions above only compare the leash against the constant.
    // This one compares the constant against the engine: two humans, the
    // slower one holding right and losing ground for the whole traversal, so
    // nothing but the camera and the clamp decides how far apart they get.
    // Change the camera lead or the clamp margin without changing the other,
    // and this is what notices.
    const engine = startEngine(0, 'FUN_MAKER', 'FEET_MASTER');
    const hero = engine.player1!;
    const trailer = engine.player2!;
    let widest = 0;
    for (let i = 0; i < 900; i++) {
      engine.entities = engine.entities.filter((e) => e.isPlayer);
      engine.update(input({ right: true }), input({ right: true }));
      widest = Math.max(widest, hero.x - trailer.x);
    }

    // The trailer is clamped against last frame's camera and measured after
    // this frame's, so the observed gap carries one frame of the hero's own
    // speed on top of the geometric ceiling. Anything beyond that slack means
    // the formula no longer describes the engine.
    const oneHeroStride = CHARACTERS.FUN_MAKER.stats.speed * 0.9 + 2;
    expect(widest).toBeGreaterThanOrEqual(TRAIL_CEILING_X);
    expect(widest).toBeLessThan(TRAIL_CEILING_X + 2 * oneHeroStride);
  });

  it('switches between walking and running rarely enough to watch', () => {
    // Collapsing the two thresholds into one leaves the gap where it is, so no
    // distance assertion can tell the versions apart. What changes is how
    // often the buddy flips gait: nine times across this traversal with the
    // band, seventy-nine without it — an animation change most seconds.
    const engine = startEngine(0, 'FUN_MAKER', 'FEET_MASTER');
    let flips = 0;
    let previous = false;
    for (let i = 0; i < 900; i++) {
      engine.entities = engine.entities.filter((e) => e.isPlayer);
      engine.update(input({ right: true }), undefined);
      if (engine.buddyIsCatchingUp !== previous) {
        flips++;
        previous = engine.buddyIsCatchingUp;
      }
    }
    expect(flips).toBeLessThan(25);
  });

  it('pulls the buddy off the screen edge in a running engine', () => {
    // The original symptom: a slow buddy behind a fast hero, pinned to the
    // clamp for the whole traversal.
    const engine = startEngine(0, 'FUN_MAKER', 'FEET_MASTER');
    const buddyEnt = engine.player2!;
    for (let i = 0; i < 400; i++) {
      engine.entities = engine.entities.filter((e) => e.isPlayer);
      engine.update(input({ right: true }), undefined);
    }
    expect(buddyEnt.x - (engine.cameraX + 20)).toBeGreaterThan(40);
  });
});

describe('companion reach against a wide build', () => {
  /**
   * Runs the buddy against one enemy and reports which of its moves actually
   * took health off. Damage is attributed to the action that just started,
   * because a move deals its damage on the frame it opens.
   *
   * The probe holds three things still, each of which has silently ruined a
   * measurement in this file's history: nobody is dragged by hand, so the
   * camera never scrolls and no other wave arrives to muddy who hit what; both
   * fighters are kept alive, so a mid-run death cannot read as "never
   * attacked"; and the target is kept off the floor, since a downed enemy
   * stops being a target at all.
   */
  function damageByMove(enemyType: 'BOSS_SAYONARA' | 'PURITY_PATROL'): Record<string, number> {
    const engine = startEngine(0, 'FEET_MASTER', 'OMEGA_BIKER');
    engine.entities = engine.entities.filter((e) => e.isPlayer);
    const hero = engine.player1!;
    const buddy = engine.player2!;
    engine.spawnEnemy(enemyType, buddy.x + 260, buddy.y);
    const target = engine.entities.find((e) => e.enemyType === enemyType)!;

    const hits: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      hero.hp = hero.maxHp;
      buddy.hp = buddy.maxHp;
      target.hp = Math.max(target.hp, Math.round(target.maxHp / 2));
      const before = target.hp;
      // The hero holds nothing, so every point of damage is the buddy's.
      engine.update(NEUTRAL, undefined);
      if (target.hp < before) hits[buddy.action] = (hits[buddy.action] ?? 0) + 1;
    }
    return hits;
  }

  it('lands punches on a boss whose build outreaches the flat band', () => {
    // Sayonara at 155 wide holds the buddy 107.5px off; the flat band commits
    // at 98. Before the floor this came back with every point of damage from
    // the kick and not one punch — and it looked fine in play, because the
    // kick reaches and her charge closes the gap by itself.
    const hits = damageByMove('BOSS_SAYONARA');
    const punches = (hits.PUNCH1 ?? 0) + (hits.PUNCH2 ?? 0);
    expect(punches, `damage by move: ${JSON.stringify(hits)}`).toBeGreaterThan(0);
  });

  it('still punches a default build, so the floor did not just widen everything', () => {
    const hits = damageByMove('PURITY_PATROL');
    const punches = (hits.PUNCH1 ?? 0) + (hits.PUNCH2 ?? 0);
    expect(punches, `damage by move: ${JSON.stringify(hits)}`).toBeGreaterThan(0);
  });

  it('gives up the punch rather than swinging at air it cannot reach', () => {
    // An opponent too wide to punch at all: the band stops at the real reach
    // instead of chasing the body, so the outer-band check hands it to the
    // kick. Without the cap the buddy would commit to a punch that is air.
    const self = buddy();
    const monster = at(self.x + 200, self.y, { width: 400 });
    expect(strikeBandFor(self, monster)).toBe(PLAYER_PUNCH_REACH);
  });
});
