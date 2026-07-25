import { GameEngine } from '../game/engine';
import { STAGES } from '../game/stageData';
import { CharacterId, EnemyType, PlayerInput } from '../types';

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
