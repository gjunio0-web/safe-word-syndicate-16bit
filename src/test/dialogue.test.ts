import { describe, expect, it } from 'vitest';
import { GameEngine } from '../game/engine';
import { isHeroLine, resolveDialogue } from '../game/dialogue';
import { STAGES } from '../game/stageData';
import { CharacterId, DialogueLine, HeroLine, ScriptEntry } from '../types';

const FIXED: DialogueLine = {
  speaker: 'Purity Patrol',
  portrait: 'PURITY_LEADER',
  text: 'Halt, degenerate heathens!',
  side: 'RIGHT',
};

/** A hero line whose text names its speaker, so assertions stay obvious. */
function heroLine(prefer?: CharacterId): HeroLine {
  const variant = (id: CharacterId) => ({ speaker: id, portrait: id, text: `line for ${id}` });
  return {
    prefer,
    variants: {
      FEET_MASTER: variant('FEET_MASTER'),
      FUN_MAKER: variant('FUN_MAKER'),
      OMEGA_BIKER: variant('OMEGA_BIKER'),
      ANGRY_CORSO: variant('ANGRY_CORSO'),
    },
  };
}

describe('script entry discrimination', () => {
  it('tells hero lines from fixed lines', () => {
    expect(isHeroLine(FIXED)).toBe(false);
    expect(isHeroLine(heroLine())).toBe(true);
  });
});

describe('resolveDialogue', () => {
  it('passes fixed lines through untouched', () => {
    const [line] = resolveDialogue([FIXED], ['ANGRY_CORSO']);
    expect(line).toEqual(FIXED);
  });

  it('gives the line to the only hero in play', () => {
    const [line] = resolveDialogue([heroLine('FEET_MASTER')], ['OMEGA_BIKER']);
    expect(line.text).toBe('line for OMEGA_BIKER');
  });

  it('gives the line to the preferred hero when they turned up', () => {
    const [line] = resolveDialogue([heroLine('ANGRY_CORSO')], ['FUN_MAKER', 'ANGRY_CORSO']);
    expect(line.text).toBe('line for ANGRY_CORSO');
  });

  it('falls back to player one when the preferred hero is absent', () => {
    const [line] = resolveDialogue([heroLine('ANGRY_CORSO')], ['FUN_MAKER', 'OMEGA_BIKER']);
    expect(line.text).toBe('line for FUN_MAKER');
  });

  it('resolves without a roster rather than throwing', () => {
    const [line] = resolveDialogue([heroLine('OMEGA_BIKER')], []);
    expect(line.text).toBe('line for OMEGA_BIKER');
  });

  it('always answers from stage left', () => {
    const [line] = resolveDialogue([heroLine()], ['FEET_MASTER']);
    expect(line.side).toBe('LEFT');
  });

  it('keeps a wave in order when fixed and hero lines are mixed', () => {
    const script: ScriptEntry[] = [FIXED, heroLine('FUN_MAKER')];
    const lines = resolveDialogue(script, ['FUN_MAKER']);
    expect(lines.map((l) => l.speaker)).toEqual(['Purity Patrol', 'FUN_MAKER']);
  });
});

describe('engine roster', () => {
  it('resolves the stage opener against the chosen hero, not a default', () => {
    const stage = { ...STAGES[0], waves: [{ ...STAGES[0].waves[0], dialogueBefore: [heroLine()] }] };
    const engine = new GameEngine(stage, 'OMEGA_BIKER');
    expect(engine.activeDialogue?.[0].text).toBe('line for OMEGA_BIKER');
  });

  it('lets a human player two take a line written for them', () => {
    const stage = {
      ...STAGES[0],
      waves: [{ ...STAGES[0].waves[0], dialogueBefore: [heroLine('ANGRY_CORSO')] }],
    };
    const engine = new GameEngine(stage, 'FEET_MASTER', 'ANGRY_CORSO', undefined, true);
    expect(engine.activeDialogue?.[0].text).toBe('line for ANGRY_CORSO');
  });

  it('never hands a line to the AI companion', () => {
    const stage = {
      ...STAGES[0],
      waves: [{ ...STAGES[0].waves[0], dialogueBefore: [heroLine('ANGRY_CORSO')] }],
    };
    const engine = new GameEngine(stage, 'FEET_MASTER', 'ANGRY_CORSO', undefined, false);
    expect(engine.activeDialogue?.[0].text).toBe('line for FEET_MASTER');
  });
});
