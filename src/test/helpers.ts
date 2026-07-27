import { GameEngine } from '../game/engine';
import { STAGES } from '../game/stageData';
import { CharacterId, EnemyType, EntityState, PlayerInput } from '../types';

/** Every input released. */
export const NEUTRAL: PlayerInput = {
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

export const input = (over: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL, ...over });

/**
 * A running engine with the opening dialogue dismissed.
 *
 * The constructor queues wave one's dialogue, and the app pauses updates while
 * one is showing, so tests would otherwise simulate a paused game.
 */
export function startEngine(stageIndex = 0, p1: CharacterId = 'FEET_MASTER', p2?: CharacterId) {
  const engine = new GameEngine(STAGES[stageIndex], p1, p2, undefined);
  engine.setActiveDialogue(null);
  return engine;
}

export function advance(engine: GameEngine, frames: number, p1: PlayerInput = NEUTRAL) {
  for (let i = 0; i < frames; i++) engine.update(p1);
}

/** Clears the arena and drops in exactly the enemies a scenario needs. */
export function stageEnemies(
  engine: GameEngine,
  specs: Array<{ type: EnemyType; dx: number; dy?: number }>
) {
  engine.entities = engine.entities.filter((e) => e.isPlayer);
  const player = engine.player1!;
  for (const spec of specs) {
    engine.spawnEnemy(spec.type, player.x + spec.dx, player.y + (spec.dy ?? 0));
  }
}

export const livingEnemies = (engine: GameEngine) =>
  engine.entities.filter((e) => !e.isPlayer && e.hp > 0);

export const corpses = (engine: GameEngine) =>
  engine.entities.filter((e) => !e.isPlayer && e.hp <= 0);

/** Counts frames spent in an attack pose across every enemy. */
export function countAttackFrames(engine: GameEngine, frames: number): number {
  let total = 0;
  for (let i = 0; i < frames; i++) {
    engine.update(NEUTRAL);
    for (const e of engine.entities) {
      if (!e.isPlayer && e.action === 'PUNCH1') total++;
    }
  }
  return total;
}

/**
 * A fighter in a chosen pose, for renderer tests.
 *
 * Kept here rather than in each test file so the shape only has to track
 * EntityState in one place.
 */
export function spriteEntity(over: Partial<EntityState> = {}): EntityState {
  return {
    id: 'e',
    isPlayer: false,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    hp: 100,
    maxHp: 100,
    action: 'IDLE',
    actionFrame: 0,
    actionTimer: 0,
    facing: 'RIGHT',
    width: 60,
    height: 90,
    invulnerableTimer: 0,
    stunTimer: 0,
    comboHits: 0,
    comboTimer: 0,
    powerMeter: 50,
    slowTimer: 0,
    suppressedTimer: 0,
    canDoubleJump: true,
    aiState: 'PATROL',
    aiTimer: 0,
    ...over,
  };
}

export const spriteHero = (charId: CharacterId, over: Partial<EntityState> = {}) =>
  spriteEntity({ isPlayer: true, playerNum: 1, charId, ...over });

export const spriteEnemy = (enemyType: EnemyType, over: Partial<EntityState> = {}) =>
  spriteEntity({ enemyType, ...over });
