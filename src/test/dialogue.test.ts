import { describe, expect, it } from 'vitest';
import { GameEngine } from '../game/engine';
import { isHeroLine, resolveDialogue } from '../game/dialogue';
import { STAGES } from '../game/stageData';
import { CharacterId, DialogueLine, HeroLine, ScriptEntry } from '../types';

const FIXED: DialogueLine = {
  speaker: 'Purity Patrol',
  portrait: 'PURITY_PATROL',
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

describe('migrated campaign script', () => {
  const heroLines = STAGES.flatMap((stage) =>
    stage.waves.flatMap((wave) => (wave.dialogueBefore ?? []).filter(isHeroLine))
  );

  it('carries a hero line in every wave that already spoke', () => {
    expect(heroLines).toHaveLength(6);
  });

  it('never makes the same hero answer twice in one wave', () => {
    for (const stage of STAGES) {
      for (const wave of stage.waves) {
        const spoken = resolveDialogue(wave.dialogueBefore ?? [], ['FEET_MASTER']);
        const heroes = spoken.filter((l) => l.side === 'LEFT').map((l) => l.speaker);
        expect(new Set(heroes).size).toBe(heroes.length);
      }
    }
  });

  it('lets every hero answer the final boss, since the appeal is plot-critical', () => {
    const final = STAGES[2].waves[2].dialogueBefore ?? [];
    for (const id of ['FEET_MASTER', 'FUN_MAKER', 'OMEGA_BIKER', 'ANGRY_CORSO'] as CharacterId[]) {
      const spoken = resolveDialogue(final, [id]);
      expect(spoken.some((l) => l.text.includes('Sayonara'))).toBe(true);
    }
  });

  it('has retired the speaker who never appeared on the field', () => {
    const speakers = STAGES.flatMap((stage) =>
      stage.waves.flatMap((wave) =>
        resolveDialogue(wave.dialogueBefore ?? [], ['FEET_MASTER']).map((l) => l.speaker)
      )
    );
    expect(speakers).not.toContain('Purity Captain');
  });
});
