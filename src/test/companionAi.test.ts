import { describe, it, expect } from 'vitest';
import {
  decideCompanionInput,
  nearestTarget,
  canStrike,
  STRIKE_MAX_DX,
  STRIKE_MAX_DY,
} from '../game/companionAi';
import { PLAYER_BODY_SEPARATION_X } from '../game/constants';
import { EntityState } from '../types';
import { startEngine, stageEnemies, NEUTRAL } from './helpers';

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

  it('holds fire past the punch hitbox', () => {
    const self = buddy();
    expect(canStrike(self, at(self.x + STRIKE_MAX_DX + 2, self.y))).toBe(false);
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

  it('presses nothing on an empty street', () => {
    expect(decideCompanionInput(buddy(), [])).toEqual(NEUTRAL);
  });
});

describe('companion movement intent', () => {
  it('walks toward a target that is out of reach', () => {
    const self = buddy();
    const input = decideCompanionInput(self, [at(self.x + 400, self.y)]);
    expect(input.right).toBe(true);
    expect(input.left).toBe(false);
    expect(input.punch).toBe(false);
  });

  it('closes the depth gap', () => {
    const self = buddy();
    const input = decideCompanionInput(self, [at(self.x + 400, self.y - 60)]);
    expect(input.up).toBe(true);
    expect(input.down).toBe(false);
  });

  it('keeps pressing into a target it is already hitting, to hold facing', () => {
    const self = buddy();
    const input = decideCompanionInput(self, [at(self.x - 80, self.y)]);
    expect(input.left).toBe(true);
    expect(input.punch).toBe(true);
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
