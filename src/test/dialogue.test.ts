import { describe, expect, it } from 'vitest';
import { GameEngine } from '../game/engine';
import { heroLine, isHeroLine, resolveDialogue } from '../game/dialogue';
import { STAGES } from '../game/stageData';
import { BARK_DURATION_FRAMES } from '../game/constants';
import { portraitFor } from '../game/portraits';
import { CharacterId, DialogueLine, HeroLine, ScriptEntry } from '../types';

const FIXED: DialogueLine = {
  speaker: 'Purity Patrol',
  portrait: 'PURITY_PATROL',
  text: 'Halt, degenerate heathens!',
  side: 'RIGHT',
};

/** A hero line whose text names its speaker, so assertions stay obvious. */
function variantLine(prefer?: CharacterId): HeroLine {
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
    expect(isHeroLine(variantLine())).toBe(true);
  });
});

describe('resolveDialogue', () => {
  it('passes fixed lines through untouched', () => {
    const [line] = resolveDialogue([FIXED], ['ANGRY_CORSO']);
    expect(line).toEqual(FIXED);
  });

  it('gives the line to the only hero in play', () => {
    const [line] = resolveDialogue([variantLine('FEET_MASTER')], ['OMEGA_BIKER']);
    expect(line.text).toBe('line for OMEGA_BIKER');
  });

  it('gives the line to the preferred hero when they turned up', () => {
    const [line] = resolveDialogue([variantLine('ANGRY_CORSO')], ['FUN_MAKER', 'ANGRY_CORSO']);
    expect(line.text).toBe('line for ANGRY_CORSO');
  });

  it('falls back to player one when the preferred hero is absent', () => {
    const [line] = resolveDialogue([variantLine('ANGRY_CORSO')], ['FUN_MAKER', 'OMEGA_BIKER']);
    expect(line.text).toBe('line for FUN_MAKER');
  });

  it('resolves without a roster rather than throwing', () => {
    const [line] = resolveDialogue([variantLine('OMEGA_BIKER')], []);
    expect(line.text).toBe('line for OMEGA_BIKER');
  });

  it('always answers from stage left', () => {
    const [line] = resolveDialogue([variantLine()], ['FEET_MASTER']);
    expect(line.side).toBe('LEFT');
  });

  it('keeps a wave in order when fixed and hero lines are mixed', () => {
    const script: ScriptEntry[] = [FIXED, variantLine('FUN_MAKER')];
    const lines = resolveDialogue(script, ['FUN_MAKER']);
    expect(lines.map((l) => l.speaker)).toEqual(['Purity Patrol', 'FUN_MAKER']);
  });
});

describe('engine roster', () => {
  it('resolves the stage opener against the chosen hero, not a default', () => {
    const stage = { ...STAGES[0], waves: [{ ...STAGES[0].waves[0], dialogueBefore: [variantLine()] }] };
    const engine = new GameEngine(stage, 'OMEGA_BIKER');
    expect(engine.activeDialogue?.[0].text).toBe('line for OMEGA_BIKER');
  });

  it('lets a human player two take a line written for them', () => {
    const stage = {
      ...STAGES[0],
      waves: [{ ...STAGES[0].waves[0], dialogueBefore: [variantLine('ANGRY_CORSO')] }],
    };
    const engine = new GameEngine(stage, 'FEET_MASTER', 'ANGRY_CORSO', undefined, true);
    expect(engine.activeDialogue?.[0].text).toBe('line for ANGRY_CORSO');
  });

  it('never hands a line to the AI companion', () => {
    const stage = {
      ...STAGES[0],
      waves: [{ ...STAGES[0].waves[0], dialogueBefore: [variantLine('ANGRY_CORSO')] }],
    };
    const engine = new GameEngine(stage, 'FEET_MASTER', 'ANGRY_CORSO', undefined, false);
    expect(engine.activeDialogue?.[0].text).toBe('line for FEET_MASTER');
  });
});

describe('migrated campaign script', () => {
  const heroLines = STAGES.flatMap((stage) =>
    stage.waves.flatMap((wave) =>
      [...(wave.dialogueBefore ?? []), ...(wave.barkOnSpawn ? [wave.barkOnSpawn] : [])].filter(
        isHeroLine
      )
    )
  );

  it('leaves no wave in the campaign without a line', () => {
    const waves = STAGES.flatMap((stage) => stage.waves);
    expect(waves).toHaveLength(11);
    for (const wave of waves) {
      expect(Boolean(wave.dialogueBefore || wave.barkOnSpawn)).toBe(true);
    }
  });

  it('gives every hero a variant everywhere a hero speaks', () => {
    expect(heroLines).toHaveLength(11);
    for (const line of heroLines) {
      expect(Object.keys(line.variants).sort()).toEqual([
        'ANGRY_CORSO', 'FEET_MASTER', 'FUN_MAKER', 'OMEGA_BIKER',
      ]);
    }
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

describe('bark channel', () => {
  const NEUTRAL = {
    left: false, right: false, up: false, down: false,
    punch: false, kick: false, special: false, jump: false, grab: false,
  };

  /** A one-wave stage that barks the moment the wave lands. */
  function barkingStage(entry: ScriptEntry = heroLine('FUN_MAKER', {
    FEET_MASTER: 'feet', FUN_MAKER: 'fun', OMEGA_BIKER: 'omega', ANGRY_CORSO: 'corso',
  })) {
    return {
      ...STAGES[0],
      waves: [{ triggerX: 0, enemies: [{ type: 'PURITY_PATROL' as const, count: 1 }], barkOnSpawn: entry }],
    };
  }

  function run(engine: GameEngine, frames: number) {
    for (let i = 0; i < frames; i++) engine.update(NEUTRAL);
  }

  it('starts with nothing on screen', () => {
    expect(new GameEngine(barkingStage(), 'FEET_MASTER').activeBark).toBeNull();
  });

  it('fires the line when the wave lands, resolved for the hero in play', () => {
    const engine = new GameEngine(barkingStage(), 'OMEGA_BIKER');
    run(engine, 1);
    expect(engine.activeBark?.text).toBe('omega');
  });

  it('does not hold the spawn the way a blocking dialogue does', () => {
    const engine = new GameEngine(barkingStage(), 'FEET_MASTER');
    run(engine, 1);
    expect(engine.entities.some((e) => e.enemyType === 'PURITY_PATROL')).toBe(true);
    expect(engine.activeDialogue).toBeNull();
  });

  it('clears itself without anyone dismissing it', () => {
    const engine = new GameEngine(barkingStage(), 'FEET_MASTER');
    run(engine, 1);
    expect(engine.activeBark).not.toBeNull();
    run(engine, BARK_DURATION_FRAMES);
    expect(engine.activeBark).toBeNull();
  });

  it('carries a fixed line through unchanged', () => {
    const engine = new GameEngine(barkingStage(FIXED), 'FEET_MASTER');
    run(engine, 1);
    expect(engine.activeBark).toEqual(FIXED);
  });

  it('notifies subscribers when the line appears and when it goes', () => {
    const engine = new GameEngine(barkingStage(), 'FEET_MASTER');
    let calls = 0;
    engine.subscribeBark(() => calls++);
    run(engine, 1);
    expect(calls).toBe(1);
    run(engine, BARK_DURATION_FRAMES);
    expect(calls).toBe(2);
  });
});

describe('portraits', () => {
  it('has a face for every hero, since their art already existed', () => {
    for (const id of ['FEET_MASTER', 'FUN_MAKER', 'OMEGA_BIKER', 'ANGRY_CORSO'] as CharacterId[]) {
      expect(portraitFor(id)).toBeTruthy();
    }
  });

  it('has a face for every villain who speaks', () => {
    for (const id of ['MADAM_MIZYDIA', 'SAYONARA', 'PURITY_PATROL', 'TRAD_WIFE_STRIKER'] as const) {
      expect(portraitFor(id)).toBeTruthy();
    }
  });

  it('leaves nobody in the campaign faceless', () => {
    const speakers = STAGES.flatMap((stage) =>
      stage.waves.flatMap((wave) =>
        [...(wave.dialogueBefore ?? []), ...(wave.barkOnSpawn ? [wave.barkOnSpawn] : [])].flatMap(
          (entry) =>
            isHeroLine(entry)
              ? Object.values(entry.variants).map((v) => v.portrait)
              : [entry.portrait]
        )
      )
    );
    for (const id of speakers) expect(portraitFor(id), id).toBeTruthy();
  });

  it('gives the player their own face when a hero line resolves', () => {
    const line = resolveDialogue([variantLine('FEET_MASTER')], ['ANGRY_CORSO'])[0];
    expect(portraitFor(line.portrait)).toBe(portraitFor('ANGRY_CORSO'));
  });
});
