import {
  EntityState,
  CharacterId,
  EnemyType,
  GroundItem,
  HazardEntity,
  ParticleEffect,
  StageConfig,
  PlayerInput,
  StageStats,
  GameSettings,
} from '../types';
import { heroLine, resolveDialogue } from './dialogue';
import { CHARACTERS, ENEMIES } from './characterData';
import {
  maxCameraX,
  maxWaveTriggerX,
  WAVE_TRIGGER_LOOKAHEAD,
  BARK_DURATION_FRAMES,
  OUTRO_MAX_FRAMES,
  VIEWPORT_WIDTH,
  PLAYER_BODY_SEPARATION_Y,
  ENEMY_BODY_SEPARATION_X,
  ENEMY_BODY_SEPARATION_Y,
  PLAYER_PUSH_SHARE,
  ATTACKERS_BY_DIFFICULTY,
  PLAYER_KICK_REACH,
  PLAYER_PUNCH_REACH,
  POWER_MOVE_FRAMES,
  POWER_MOVE_ACTIVE_FRAMES,
  CASTING_DAMAGE_MULTIPLIER,
  ARENA_MIN_Y,
  CAMERA_LEAD_X,
  PLAYER_CLAMP_MARGIN_X,
  ARENA_MAX_Y,
  ATTACKER_STANDOFF_X,
  ATTACKER_STANDOFF_TOLERANCE,
  SAYONARA_TELEGRAPH_FRAMES,
  SAYONARA_CHARGE_FRAMES,
  SAYONARA_RECOVER_FRAMES,
  SAYONARA_CHARGE_COOLDOWN,
  SAYONARA_CHARGE_SPEED,
  SAYONARA_CHARGE_MIN_RANGE,
  SAYONARA_CHARGE_MAX_RANGE,
  SAYONARA_TACKLE_DEPTH,
  SAYONARA_TACKLE_DAMAGE_MULTIPLIER,
  SAYONARA_TACKLE_KNOCKBACK,
  SAYONARA_TACKLE_KNOCKDOWN_FRAMES,
  SAYONARA_BITE_FRAMES,
  SAYONARA_BITE_COOLDOWN,
  SAYONARA_BITE_RANGE,
  SAYONARA_BITE_KNOCKDOWN_FRAMES,
  SAYONARA_BITE_KNOCKBACK,
  SAYONARA_RETREAT_PATIENCE,
  SAYONARA_PRESSURE_MEMORY,
  PLAYER_KO_FRAMES,
} from './constants';
import {
  COMPANION_TUNING,
  CATCH_UP_MULTIPLIER,
  CompanionMemory,
  decideCompanionInput,
  newCompanionMemory,
} from './companionAi';
import { sound } from './sound';
import { STEP_MS } from './frameClock';
import { restingSeparationX } from './spacing';

/**
 * What the HUD actually shows, in display form.
 *
 * Every field is discrete: it changes only when the HUD would look different.
 * That is what makes the equality check below meaningful — the React subtree
 * re-renders when the numbers move, not once per frame.
 */
export interface HudFighter {
  charId: CharacterId;
  hp: number;
  powerMeter: number;
  comboHits: number;
}

export interface HudBoss {
  enemyType: EnemyType;
  hp: number;
  maxHp: number;
  shieldHp?: number;
}

export interface HudSnapshot {
  p1: HudFighter | null;
  p2: HudFighter | null;
  boss: HudBoss | null;
  showStageBanner: boolean;
  showBossWarning: boolean;
  bossWarningTitle: string;
  isWaveActive: boolean;
  currentWaveIndex: number;
  stageCleared: boolean;
  /**
   * Whether a hostage is on the field, whoever owns the boss bar.
   *
   * `boss` above is one entity — the first one found — and the final stage
   * fields two. Mizydia wins that search, so a HUD reading `boss` alone cannot
   * tell that Sayonara is standing next to her, and the one screen where the
   * player has to know she is savable is the one screen that could not say so.
   *
   * Separate from `boss.enemyType === 'BOSS_SAYONARA'` for exactly that
   * reason: this answers "is there someone here to free", which is a fact
   * about the field, not about whichever entity the bar happens to be drawing.
   */
  hostageOnField: boolean;
  /**
   * Whether the hostage has yet to be touched by anyone.
   *
   * The pair exists because the two facts expire at different moments. She is
   * on the field until she is freed or finished; she is untouched only until
   * the first damage lands. A HUD that has to say something once, at the start
   * of the fight, needs the second one, and deriving it from her HP at the
   * call site would put the same comparison in every reader.
   *
   * First damage rather than a timer, because the boss dialogue freezes the
   * simulation and not the wall clock — a timer would burn down while the
   * player reads the overlay and expire before a single frame of fighting.
   */
  hostageUntouched: boolean;
}

function sameFighter(a: HudFighter | null, b: HudFighter | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.charId === b.charId &&
    a.hp === b.hp &&
    a.powerMeter === b.powerMeter &&
    a.comboHits === b.comboHits
  );
}

function sameBoss(a: HudBoss | null, b: HudBoss | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.enemyType === b.enemyType &&
    a.hp === b.hp &&
    a.maxHp === b.maxHp &&
    a.shieldHp === b.shieldHp
  );
}

export class GameEngine {
  public entities: EntityState[] = [];
  public items: GroundItem[] = [];
  public hazards: HazardEntity[] = [];
  public particles: ParticleEffect[] = [];

  public cameraX: number = 0;
  public stage: StageConfig;
  public currentWaveIndex: number = 0;
  public isWaveActive: boolean = false;
  public stageCleared: boolean = false;
  public gameOver: boolean = false;
  public bossDefeated: boolean = false;

  /**
   * Whether Sayonara was struck while already on the floor.
   *
   * The campaign has two endings and this is the only thing separating them:
   * knocking her out is unavoidable, finishing her off is a choice.
   */
  public sayonaraKilled: boolean = false;

  /**
   * What the AI buddy carries between frames — currently the enemy it has
   * committed to. Lives on the engine rather than inside the policy so the
   * policy stays a pure function of the world it is handed.
   */
  private companionMemory: CompanionMemory = newCompanionMemory();

  /**
   * Whether the AI buddy is sprinting to close a gap it cannot walk off.
   *
   * Exposed because the gait is visible on screen and nothing else reveals it:
   * the position it settles at is the same either way.
   */
  public get buddyIsCatchingUp(): boolean {
    return this.companionMemory.catchingUp;
  }

  /**
   * Who each in-flight power move has already caught, keyed by the fighter
   * swinging it.
   *
   * The move stays dangerous for a stretch of frames rather than a single
   * one, so something has to remember that the grunt already thrown across
   * the street does not get thrown again on the next frame. Kept on the
   * engine instead of on `EntityState` because it is bookkeeping for one
   * action, not something the HUD, the renderer or a save has any business
   * seeing.
   */
  private powerMoveHits: Map<string, Set<string>> = new Map();

  public stageStartBannerTimer: number = 210;
  public bossWarningTimer: number = 0;
  public bossWarningTitle: string = '';
  private _activeDialogue: import('../types').DialogueLine[] | null = null;
  private dialogueListeners: Set<() => void> = new Set();
  /**
   * The bark channel. Same shape as the dialogue channel above, deliberately:
   * one line instead of a list, and a frame counter instead of a player press.
   * The timer lives here rather than in React so it pauses when the fight
   * pauses and cannot drift away from the frame the line was fired on.
   */
  private _activeBark: import('../types').DialogueLine | null = null;
  private barkListeners: Set<() => void> = new Set();
  private barkTimer = 0;
  /** Lines still waiting behind the one on screen. */
  private barkQueue: import('../types').DialogueLine[] = [];
  /**
   * Counts down while Sayonara walks out. Zero means no outro is running; the
   * campaign is only declared won when it lapses or she leaves the field.
   */
  private outroTimer = 0;

  private hudSnapshot: HudSnapshot;
  private hudListeners: Set<() => void> = new Set();

  /** Ids of the melee enemies currently allowed to engage. */
  private attackSlots: Set<string> = new Set();
  private shownWaveDialogues: Set<number> = new Set();

  public player1: EntityState | null = null;
  public player2: EntityState | null = null;
  /**
   * Whether the second fighter is a person. Until now the difference between
   * "2P CO-OP" and "1P + AI BUDDY" lived entirely in whether App passed a p2
   * input object each frame, which the dialogue resolver cannot see. It needs
   * to: the AI companion should never be the one answering the villains.
   */
  private p2IsHuman: boolean;

  public stats: StageStats = {
    score: 0,
    maxCombo: 0,
    enemiesDefeated: 0,
    timeSeconds: 0,
    damageTaken: 0,
  };

  private frameCount: number = 0;

  /**
   * Simulated milliseconds elapsed, for animation.
   *
   * Derived from `frameCount * STEP_MS` rather than `Date.now()`, which is
   * what every animation in spriteRenderer.ts and GameCanvas.tsx used to read
   * directly. That tied their motion to the system clock instead of the
   * simulation: pausing the engine — a dialogue box, a menu — left walk
   * cycles, glows, and jets animating over a frozen fight. This only advances
   * when `update()` runs, so freezing the engine now freezes what it looks
   * like too.
   */
  public get simTimeMs(): number {
    return this.frameCount * STEP_MS;
  }
  private settings: GameSettings;

  /**
   * Dialogue currently on screen. Read-only: writing goes through
   * `setActiveDialogue`, which notifies subscribers.
   *
   * This used to be a public mutable field. Since the engine lives outside the
   * React cycle, clearing it did not unmount the overlay — it only disappeared
   * when some unrelated state happened to change. That is why the FIGHT button
   * responded solely to keys that also fed the game input.
   */
  public get activeDialogue(): import('../types').DialogueLine[] | null {
    return this._activeDialogue;
  }

  public setActiveDialogue(next: import('../types').DialogueLine[] | null) {
    if (this._activeDialogue === next) return;
    this._activeDialogue = next;
    this.dialogueListeners.forEach((listener) => listener());
  }

  /**
   * Current HUD state. The returned object is referentially stable until
   * something visible changes — `useSyncExternalStore` compares by identity and
   * would loop forever on a freshly built object every call.
   */
  public getHudSnapshot(): HudSnapshot {
    return this.hudSnapshot;
  }

  /** Subscribes to HUD changes. Returns the unsubscribe function. */
  public subscribeHud(listener: () => void): () => void {
    this.hudListeners.add(listener);
    return () => {
      this.hudListeners.delete(listener);
    };
  }

  private buildHudSnapshot(): HudSnapshot {
    const toFighter = (ent: EntityState | null): HudFighter | null =>
      ent && ent.charId
        ? {
            charId: ent.charId,
            hp: ent.hp,
            // The only continuous value in the HUD: it regenerates every frame.
            // Rounding to the percent actually rendered keeps the snapshot from
            // changing 60 times a second for a sub-pixel difference.
            powerMeter: Math.round(ent.powerMeter),
            comboHits: ent.comboHits,
          }
        : null;

    const bossEntity = this.entities.find((e) => e.enemyType?.startsWith('BOSS'));

    return {
      p1: toFighter(this.player1),
      p2: toFighter(this.player2),
      boss: bossEntity
        ? {
            enemyType: bossEntity.enemyType!,
            hp: bossEntity.hp,
            maxHp: bossEntity.maxHp,
            shieldHp: bossEntity.shieldHp,
          }
        : null,
      showStageBanner: this.stageStartBannerTimer > 0,
      showBossWarning: this.bossWarningTimer > 0,
      bossWarningTitle: this.bossWarningTitle,
      isWaveActive: this.isWaveActive,
      currentWaveIndex: this.currentWaveIndex,
      stageCleared: this.stageCleared,
      // Alive and still collared. A freed Sayonara is walking out of the
      // scene under her own power and there is nothing left to instruct the
      // player about; a dead one is the ending that already went wrong.
      hostageOnField: this.entities.some(
        (e) => e.enemyType === 'BOSS_SAYONARA' && e.hp > 0 && !e.freed
      ),
      hostageUntouched: this.entities.some(
        (e) => e.enemyType === 'BOSS_SAYONARA' && e.hp >= e.maxHp && !e.freed
      ),
    };
  }

  private notifyHud() {
    const next = this.buildHudSnapshot();
    const prev = this.hudSnapshot;

    const unchanged =
      sameFighter(prev.p1, next.p1) &&
      sameFighter(prev.p2, next.p2) &&
      sameBoss(prev.boss, next.boss) &&
      prev.showStageBanner === next.showStageBanner &&
      prev.showBossWarning === next.showBossWarning &&
      prev.bossWarningTitle === next.bossWarningTitle &&
      prev.isWaveActive === next.isWaveActive &&
      prev.currentWaveIndex === next.currentWaveIndex &&
      prev.stageCleared === next.stageCleared &&
      prev.hostageOnField === next.hostageOnField &&
      prev.hostageUntouched === next.hostageUntouched;

    if (unchanged) return;

    this.hudSnapshot = next;
    this.hudListeners.forEach((listener) => listener());
  }

  /** Subscribes to dialogue changes. Returns the unsubscribe function. */
  public subscribeDialogue(listener: () => void): () => void {
    this.dialogueListeners.add(listener);
    return () => {
      this.dialogueListeners.delete(listener);
    };
  }

  public get activeBark(): import('../types').DialogueLine | null {
    return this._activeBark;
  }

  private setActiveBark(next: import('../types').DialogueLine | null) {
    if (this._activeBark === next) return;
    this._activeBark = next;
    this.barkListeners.forEach((listener) => listener());
  }

  /** Subscribes to bark changes. Returns the unsubscribe function. */
  public subscribeBark(listener: () => void): () => void {
    this.barkListeners.add(listener);
    return () => {
      this.barkListeners.delete(listener);
    };
  }

  constructor(
    stage: StageConfig,
    p1Char: CharacterId,
    p2Char?: CharacterId,
    settings?: GameSettings,
    p2IsHuman = false
  ) {
    this.stage = stage;
    this.p2IsHuman = p2IsHuman;
    this.settings = settings || {
      soundEnabled: true,
      musicEnabled: true,
      volume: 0.5,
      crtFilter: true,
      showHitboxes: false,
      difficulty: 'NORMAL',
    };

    this.stageStartBannerTimer = 90;

    // Spawn Player 1
    this.player1 = this.createPlayerEntity('p1', 1, p1Char, 100, 300);
    this.entities.push(this.player1);

    // Spawn Player 2 or AI Companion if requested
    if (p2Char) {
      this.player2 = this.createPlayerEntity('p2', 2, p2Char, 80, 340);
      this.entities.push(this.player2);
    }

    // Wave one's dialogue is published after the fighters exist, not before.
    // Hero lines resolve against whoever is on the roster, and resolving that
    // against an empty arena silently handed every stage opener to the default
    // hero no matter who the player picked.
    if (stage.waves[0]?.dialogueBefore) {
      this.setActiveDialogue(resolveDialogue(stage.waves[0].dialogueBefore, this.roster()));
      this.shownWaveDialogues.add(0);
    }

    // Stage one used to be special-cased here because its declared musicTrack,
    // NEON_BEAT, was an alias nothing could reach. The stage now names its own
    // track like the other two.
    sound.playBgm(stage.musicTrack);

    this.hudSnapshot = this.buildHudSnapshot();
  }

  /**
   * Who may answer a hero line, in priority order. Player 1 first, then a human
   * player 2. The AI companion is omitted: it fights, it does not talk back.
   */
  private roster(): CharacterId[] {
    const ids: CharacterId[] = [];
    if (this.player1?.charId) ids.push(this.player1.charId);
    if (this.p2IsHuman && this.player2?.charId) ids.push(this.player2.charId);
    return ids;
  }

  private createPlayerEntity(
    id: string,
    playerNum: 1 | 2,
    charId: CharacterId,
    x: number,
    y: number
  ): EntityState {
    return {
      id,
      isPlayer: true,
      playerNum,
      charId,
      x,
      y,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      facing: 'RIGHT',
      hp: 100,
      maxHp: 100,
      powerMeter: 100, // Start stage fully charged for special moves!
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
    };
  }

  public spawnEnemy(type: EnemyType, x: number, y: number): EntityState {
    const info = ENEMIES[type];
    const isBoss = type === 'BOSS_MADAM_MIZYDIA' || type === 'BOSS_SAYONARA';
    const enemy: EntityState = {
      id: 'enemy_' + Math.random().toString(36).substring(2, 9),
      isPlayer: false,
      enemyType: type,
      x,
      y,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      facing: 'LEFT',
      hp: info.maxHp,
      maxHp: info.maxHp,
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
      width: info.hitbox.width,
      height: info.hitbox.height,
      aiState: 'PATROL',
      aiTimer: 0,
      bossPhase: isBoss ? 1 : undefined,
      shieldHp: type === 'BOSS_MADAM_MIZYDIA' ? 150 : undefined,
      maxShieldHp: type === 'BOSS_MADAM_MIZYDIA' ? 150 : undefined,
    };
    this.entities.push(enemy);
    return enemy;
  }

  public update(p1Input: PlayerInput, p2Input?: PlayerInput) {
    if (this.gameOver || this.stageCleared) return;

    if (this.stageStartBannerTimer > 0) {
      this.stageStartBannerTimer--;
    }

    // Read before decrementing, on purpose: the frame that raises the banner
    // — inside updateWaveTriggers below, when it spawns the surge and sets
    // bossWarningTimer to 180 — has to run in full, spawn included. Only the
    // frames after that one, where the banner is already up, freeze.
    const bossWarningWasShowing = this.bossWarningTimer > 0;
    if (this.bossWarningTimer > 0) {
      this.bossWarningTimer--;
    }

    if (bossWarningWasShowing) {
      // Nothing else advances: no frameCount, so the animation clock derived
      // from it holds too, and no player, enemy, or wave logic runs. The
      // banner used to sit over a fight that kept going underneath it —
      // dodgeable damage the player could not see coming because the warning
      // covered the middle of the screen.
      return;
    }

    this.frameCount++;
    if (this.frameCount % 60 === 0) {
      this.stats.timeSeconds++;
    }

    if (this.barkTimer > 0) {
      this.barkTimer--;
      if (this.barkTimer === 0) {
        const next = this.barkQueue.shift();
        this.setActiveBark(next ?? null);
        if (next) this.barkTimer = BARK_DURATION_FRAMES;
      }
    }
    if (this.outroTimer > 0) {
      this.outroTimer--;
      const sayonara = this.entities.find((e) => e.enemyType === 'BOSS_SAYONARA');
      // Off the right edge of the camera, or out of patience. The ceiling
      // matters: an outro that can hang is worse than one that ends early.
      if (!sayonara || sayonara.x > this.cameraX + VIEWPORT_WIDTH + 80 || this.outroTimer === 0) {
        this.outroTimer = 0;
        this.bossDefeated = true;
      }
    }

    // Check wave triggers based on camera position
    this.updateWaveTriggers();

    // Update Player 1
    //
    // The match ends when every *human* is down, which is not the same as
    // every fighter. The condition here used to ask whether player two still
    // had health, and the AI companion answers yes: a solo player who died
    // with the buddy alive lost the keyboard and never got a game over. No
    // input was routed anywhere, nothing revived them, and the fight carried
    // on around a body — measured at ninety seconds with the stage no closer
    // to finished, and with the camera anchored to the corpse it never even
    // started, no wave ever triggering.
    //
    // A human second player is different and deliberately unchanged: co-op
    // continues while either of them is standing.
    if (this.player1 && this.player1.hp > 0) {
      this.updatePlayer(this.player1, p1Input);
    } else if (this.player1 && this.player1.hp <= 0 && !this.aHumanIsStanding()) {
      this.gameOver = true;
    }

    // Update Player 2 / AI
    //
    // Both halves now end in the same call. A missing p2Input means nobody is
    // holding a controller, so the policy supplies one — the buddy is a player
    // whose buttons are pressed by code, not a second kind of entity with its
    // own physics.
    if (this.player2 && this.player2.hp > 0) {
      if (p2Input) {
        this.updatePlayer(this.player2, p2Input);
      } else {
        // The policy decides direction and pace in the same pass: it already
        // knows whether there is anything to fight, and the pace depends on
        // that answer. It leaves the pace on the memory it was handed.
        const aiInput = decideCompanionInput(
          this.player2,
          this.entities,
          this.player1,
          this.companionMemory,
          COMPANION_TUNING
        );
        const scale = this.companionMemory.catchingUp ? CATCH_UP_MULTIPLIER : 1;
        this.updatePlayer(this.player2, aiInput, scale);
      }
    }

    // Update Camera position
    //
    // Led by whoever is still standing. A dead player one used to keep his
    // place in this maximum, which pinned the camera to where he fell: with a
    // companion still fighting, the stage could not scroll, so no wave ever
    // triggered and nothing at all happened for as long as anyone waited.
    const leaders = [this.player1, this.player2].filter(
      (p): p is EntityState => !!p && p.hp > 0
    );
    const leadX = leaders.length
      ? Math.max(...leaders.map((p) => p.x))
      : this.cameraX + CAMERA_LEAD_X;
    const targetCameraX = Math.max(this.cameraX, leadX - CAMERA_LEAD_X);

    // Limit camera scrolling during locked wave battles
    if (this.isWaveActive) {
      const currentWave = this.stage.waves[this.currentWaveIndex];
      const maxCamX = this.effectiveTriggerX(currentWave) - 50;
      this.cameraX = Math.min(targetCameraX, maxCamX);
    } else {
      this.cameraX = Math.min(targetCameraX, maxCameraX(this.stage.length));
    }

    // Keep players inside camera viewport bounds
    //
    // Living players only. This had no health check, so a fallen fighter was
    // shoved along by the viewport's left edge for the rest of the stage — the
    // body followed the survivor down the street instead of staying where it
    // went down. A body belongs to the ground it fell on.
    this.entities.forEach((ent) => {
      if (ent.isPlayer && ent.hp > 0) {
        ent.x = Math.max(
          this.cameraX + PLAYER_CLAMP_MARGIN_X,
          Math.min(this.cameraX + 760, ent.x)
        );
        ent.y = Math.max(ARENA_MIN_Y, Math.min(ARENA_MAX_Y, ent.y)); // Y depth bounds
      } else if (ent.hp > 0 && !ent.freed) {
        // Enforce hard arena boundaries for active enemies: pull inside if knocked/pushed too far out.
        //
        // A freed Sayonara is exempt: she is not being knocked around, she is
        // making a scripted exit, and this clamp used to catch her at cameraX
        // + 830 -- short of the outro's own cameraX + VIEWPORT_WIDTH + 80 exit
        // threshold -- reversing her vx and sending her walking back in.
        // Every ending hit the outro's timeout ceiling because of it; none of
        // them ever actually saw her leave.
        const minX = this.cameraX - 30;
        const maxX = this.cameraX + 830;
        if (ent.x < minX) {
          ent.x = minX + 60;
          ent.vx = 4;
        } else if (ent.x > maxX) {
          ent.x = maxX - 60;
          ent.vx = -4;
        }
        ent.y = Math.max(ARENA_MIN_Y, Math.min(ARENA_MAX_Y, ent.y));
      } else if (ent.hp > 0) {
        ent.y = Math.max(ARENA_MIN_Y, Math.min(ARENA_MAX_Y, ent.y));
      }
    });

    // Grant attack slots before the AI runs, so each enemy knows this frame
    // whether it is engaging or waiting.
    this.updateAttackSlots();

    // Update Enemies & AI
    this.entities.forEach((ent) => {
      // A downed fighter has stopped fighting: no AI, no attacks, no chasing.
      if (!ent.isPlayer && ent.hp > 0 && !ent.downed && !ent.freed) {
        this.updateEnemyAi(ent);
      }
      this.updateEntityPhysics(ent);
    });

    // Body collisions: Keep entities separated at arm's length
    this.resolveBodyCollisions();

    // Update Hazards & Drops
    this.updateHazards();
    this.updateItems();
    this.updateParticles();

    this.updateFallenPlayers();

    // Remove dead bodies once their death animation has run out.
    //
    // The condition used to be `actionTimer < 60`, which is always true for a
    // corpse — death sets actionTimer to 18 and it counts down to 0 — so the
    // filter preserved exactly what it was meant to discard. Bodies piled up
    // in the arena and kept being drawn.
    //
    // It also read `ent.isPlayer || ...`, which exempted players from the
    // clear-up entirely. One rule for everybody now; `updateFallenPlayers`
    // above is what gives a fallen player the animation this filter waits for.
    this.entities = this.entities.filter((ent) => ent.hp > 0 || ent.actionTimer > 0);

    // Check wave clear status
    // A downed Sayonara is out of the fight without being dead, so she must
    // not hold the wave open — otherwise sparing her would soft-lock the stage.
    const remainingEnemies = this.entities.filter(
      (ent) => !ent.isPlayer && ent.hp > 0 && !ent.downed && !ent.freed
    );
    if (this.isWaveActive && remainingEnemies.length === 0) {
      this.isWaveActive = false;
      this.currentWaveIndex++;
      if (this.currentWaveIndex >= this.stage.waves.length) {
        this.stageCleared = true;
        sound.playStageClear();
      }
    }

    this.notifyHud();
  }

  /**
   * Wave trigger clamped to what the camera can actually reach.
   *
   * Production safety net: a badly designed stage loses its intended pacing but
   * never locks up. In dev, `assertStagesAreCompletable` would have thrown long
   * before execution got here.
   */
  private effectiveTriggerX(wave: import('../types').WaveConfig): number {
    return Math.min(wave.triggerX, maxWaveTriggerX(this.stage.length));
  }

  /**
   * Whether anyone holding a controller is still on their feet.
   *
   * The AI companion is not a life. It fights, and it keeps fighting after the
   * player goes down, but it cannot be the reason the match refuses to end.
   */
  private aHumanIsStanding(): boolean {
    if (this.player1 && this.player1.hp > 0) return true;
    return this.p2IsHuman && !!this.player2 && this.player2.hp > 0;
  }

  /** Player the enemies are currently converging on. */
  private currentTarget(): EntityState | null {
    if (this.player1 && this.player1.hp > 0) return this.player1;
    if (this.player2 && this.player2.hp > 0) return this.player2;
    return null;
  }

  /**
   * Whether an attack aimed at this frame should land on `target`.
   *
   * A fighter on the floor is only hit when nothing else is within reach.
   * Without that, punches thrown past a downed Sayonara on the way to Mizydia
   * finished her off by accident — which is the same failure the floor state
   * exists to remove, one level down. Reaching her now takes standing over her
   * with nothing else to swing at.
   */
  private isValidTarget(target: EntityState, candidates: EntityState[]): boolean {
    if (!target.downed) return true;
    return !candidates.some((other) => other !== target && !other.downed);
  }

  /**
   * Whether this enemy queues for an attack slot.
   *
   * The question is not whether a fighter swings up close but whether it waits
   * its turn. The slot is permission to walk into the player's face; the ones
   * who never do that should not be holding one.
   *
   * The predicate used to ask only whether the enemy was melee, which read as
   * true for the Matriarch — so she took a slot on spawn and kept it for the
   * whole fight, while her own branch returns long before the queue is ever
   * consulted. On EASY, where there is exactly one slot, that left whoever
   * fought beside her permanently parked on the standoff ring. In the final
   * wave that is Sayonara: the fastest fighter in the game, waiting out the
   * boss fight 190px away.
   *
   * A downed or freed fighter has stopped fighting too, so the slot returns to
   * the queue instead of being buried with her.
   */
  private queuesForAttackSlot(enemy: EntityState): boolean {
    if (enemy.hp <= 0 || enemy.downed || enemy.freed) return false;
    return enemy.enemyType !== 'CONVERSION_THERAPIST' && !this.isBossEntity(enemy);
  }

  /**
   * Hands out the attack slots, closest queueing enemy first.
   *
   * Holders keep their slot while they are still fighting, so an engaged enemy
   * is not swapped out mid-swing. Everyone else waits on the standoff ring in
   * `updateEnemyAi`.
   */
  private updateAttackSlots() {
    for (const id of this.attackSlots) {
      const holder = this.entities.find((e) => e.id === id);
      if (!holder || !this.queuesForAttackSlot(holder)) this.attackSlots.delete(id);
    }

    const free = ATTACKERS_BY_DIFFICULTY[this.settings.difficulty] - this.attackSlots.size;
    if (free <= 0) return;

    const target = this.currentTarget();
    if (!target) return;

    this.entities
      .filter((e) => !e.isPlayer && this.queuesForAttackSlot(e) && !this.attackSlots.has(e.id))
      .sort(
        (a, b) =>
          Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y)
      )
      .slice(0, free)
      .forEach((e) => this.attackSlots.add(e.id));
  }

  private updateWaveTriggers() {
    if (this.isWaveActive || this.currentWaveIndex >= this.stage.waves.length) return;

    const wave = this.stage.waves[this.currentWaveIndex];
    if (this.cameraX >= this.effectiveTriggerX(wave) - WAVE_TRIGGER_LOOKAHEAD) {
      // Check if wave has dialogue that hasn't been shown yet
      if (wave.dialogueBefore && !this.shownWaveDialogues.has(this.currentWaveIndex)) {
        this.setActiveDialogue(resolveDialogue(wave.dialogueBefore, this.roster()));
        this.shownWaveDialogues.add(this.currentWaveIndex);
        return; // wait until dialogue is dismissed before spawning enemies
      }

      this.isWaveActive = true;
      if (wave.barkOnSpawn?.length) {
        // Fired as the wave lands, not before it. A bark is a reaction to
        // enemies arriving, so it wants them on screen behind it.
        const [first, ...rest] = resolveDialogue(wave.barkOnSpawn, this.roster());
        this.barkQueue = rest;
        this.setActiveBark(first);
        this.barkTimer = BARK_DURATION_FRAMES;
      }
      // Spawn wave enemies
      wave.enemies.forEach((spawnGroup) => {
        for (let i = 0; i < spawnGroup.count; i++) {
          // 'BOTH' used to fall through to the RIGHT branch, so every wave
          // meant to surround the player arrived as a single-file queue from
          // one side. Alternate instead, and count each side separately so the
          // stagger offset does not gap.
          const fromLeft =
            spawnGroup.spawnSide === 'LEFT' ||
            (spawnGroup.spawnSide === 'BOTH' && i % 2 === 0);
          const indexOnSide = spawnGroup.spawnSide === 'BOTH' ? Math.floor(i / 2) : i;

          const spawnX = fromLeft
            ? this.cameraX - 40 - indexOnSide * 30
            : this.cameraX + 820 + indexOnSide * 40;
          const spawnY = 240 + Math.random() * 160;
          this.spawnEnemy(spawnGroup.type, spawnX, spawnY);
        }
      });

      const bosses = wave.enemies.filter((e) => e.type.startsWith('BOSS'));
      const hasBoss = bosses.length > 0;
      const isFinalWave = this.currentWaveIndex === this.stage.waves.length - 1;

      if (hasBoss || isFinalWave) {
        sound.playBossAlarm();
        if (hasBoss) {
          sound.playBgm(this.stage.bossTrack);
          // Named off the field rather than hardcoded. The old banner told the
          // player to destroy the Purity Leaders, who are not in this game:
          // the bosses are Sayonara and the Matriarch, and one of them is
          // supposed to be rescued.
          const names = bosses.map((e) => ENEMIES[e.type].name.toUpperCase()).join(' & ');
          this.bossWarningTitle = `⚠️ BOSS ENCOUNTER: ${names} ⚠️`;
        } else {
          this.bossWarningTitle = '⚠️ WARNING: HEAVY ENEMY SURGE ⚠️';
        }
        this.bossWarningTimer = 180; // 3 second banner
      }
    }
  }

  /**
   * `speedScale` is 1 for anyone holding a controller. The AI buddy is the
   * only caller that passes anything else, and only while it is following with
   * nothing to fight — see CATCH_UP_MULTIPLIER for why that exception exists.
   */
  private updatePlayer(player: EntityState, input: PlayerInput, speedScale: number = 1) {
    if (player.stunTimer > 0) {
      player.stunTimer--;
      return;
    }

    if (player.slowTimer > 0) player.slowTimer--;
    if (player.suppressedTimer > 0) player.suppressedTimer--;
    // invulnerableTimer is ticked in updateEntityPhysics, which runs for every
    // entity. Decrementing it here too halved every invulnerability window.
    // The physics one is the survivor because this method returns early while
    // stunned, which would otherwise freeze the timer exactly when it matters.

    // Passive Power Meter Regeneration (+0.04 per frame = ~2.4%/sec)
    player.powerMeter = Math.min(100, player.powerMeter + 0.04);

    if (player.comboTimer > 0) {
      player.comboTimer--;
      if (player.comboTimer === 0) player.comboHits = 0;
    }

    // A power move already out stays out.
    //
    // It keeps connecting for its active window and then spends what is left
    // of the animation recovering. Returning here rather than falling through
    // costs nothing — every branch below tests for some other action — and it
    // also freezes `facing` for the duration, which the directional moves
    // need: Omega's cone is recomputed every frame now, and a player who
    // taps back mid-swing should not get to sweep both halves of the street.
    if (player.action === 'POWER_MOVE' || player.action === 'BITING') {
      if (player.actionTimer > POWER_MOVE_FRAMES - POWER_MOVE_ACTIVE_FRAMES) {
        this.resolvePowerMove(player, false);
      } else {
        this.powerMoveHits.delete(player.id);
      }
      player.prevJumpInput = input.jump;
      return;
    }

    const moveSpeed =
      (player.slowTimer > 0 ? 1.5 : CHARACTERS[player.charId!].stats.speed * 0.9 + 2) * speedScale;

    // Direct Directional Facing Sync - Always align character facing with movement input
    if (input.left) {
      player.facing = 'LEFT';
    } else if (input.right) {
      player.facing = 'RIGHT';
    }

    // Special Move Trigger Check (Highest Priority: can execute from IDLE, WALK, JUMP, FLYING, or cancel PUNCH/KICK)
    if (input.special && !['POWER_MOVE', 'HURT', 'KNOCKDOWN', 'BITING'].includes(player.action)) {
      if (player.powerMeter >= 30 && player.suppressedTimer === 0) {
        this.performPowerMove(player);
        return;
      }
    }

    const jumpPressed = input.jump && !player.prevJumpInput;

    if (player.z === 0) {
      player.canDoubleJump = true;
    }

    // --- FUN MAKER SPECIAL FLYING ABILITY ---
    const isFunMaker = player.charId === 'FUN_MAKER';
    const isFlyingCurrently = player.action === 'FLYING';

    if (isFunMaker && player.powerMeter > 0 && player.suppressedTimer === 0) {
      // Initiate flying on DOUBLE JUMP (second jump press while airborne) or continue existing flight
      const wantsToStartFlight = !isFlyingCurrently && player.z > 0 && player.canDoubleJump && jumpPressed;

      if ((isFlyingCurrently || wantsToStartFlight) && !['PUNCH1', 'PUNCH2', 'KICK', 'POWER_MOVE', 'HURT', 'KNOCKDOWN'].includes(player.action)) {
        if (wantsToStartFlight) {
          player.action = 'FLYING';
          player.canDoubleJump = false;
          player.vz = Math.max(3.5, player.vz); // Lift off impulse into hover
          sound.playSpecial(sound.calculatePan(player.x, this.cameraX));

          // Burst of cyan shockwave & spark particles under feet on flight activation
          for (let i = 0; i < 6; i++) {
            this.addParticle(
              player.x + (Math.random() - 0.5) * 20,
              player.y - player.z - 10,
              0,
              '#00ffff',
              undefined,
              'SHOCKWAVE'
            );
          }
        }

        // Very slow special drain rate (0.02 per frame = ~1.2/sec -> 50s+ flight duration!)
        player.powerMeter = Math.max(0, player.powerMeter - 0.02);

        // Vertical Altitude Flight Control (Zero Gravity Hovering)
        if (input.jump || input.up) {
          player.vz = Math.min(4, player.vz + 0.4); // Soar higher
        } else if (input.down) {
          player.vz = Math.max(-4, player.vz - 0.4); // Glide lower
        } else {
          // Zero-Gravity Smooth Air Hover
          player.vz *= 0.75;
          if (Math.abs(player.vz) < 0.1) player.vz = 0;
        }

        // Flight ceiling cap
        if (player.z > 165) {
          player.z = 165;
          player.vz = Math.min(0, player.vz);
        }

        // 3D Air Movement Speed
        const flySpeed = moveSpeed * 1.35;
        if (input.left) {
          player.vx = -flySpeed;
        } else if (input.right) {
          player.vx = flySpeed;
        } else {
          player.vx *= 0.8;
        }

        if (input.up && !input.jump) {
          player.vy = -moveSpeed * 0.8;
        } else if (input.down) {
          player.vy = moveSpeed * 0.8;
        } else {
          player.vy *= 0.8;
        }

        // Cyan Flight Thruster Particles below boots
        if (this.frameCount % 2 === 0) {
          this.addParticle(
            player.x + (Math.random() - 0.5) * 14,
            player.y - player.z - 10,
            0,
            '#00ffff',
            undefined,
            'SHOCKWAVE'
          );
        }

        // Handle attacks while flying
        if (input.punch) {
          this.performPunchCombo(player, input);
        } else if (input.kick) {
          this.performKick(player, input);
        }
      } else if (isFlyingCurrently && player.powerMeter <= 0) {
        player.action = 'JUMP';
      }
    }

    // Standard Ground Movement & Idle State handling (when not flying)
    if (player.action === 'IDLE' || player.action === 'WALK' || player.action === 'JUMP') {
      let isMoving = false;
      if (player.z === 0) {
        player.vx = 0;
        player.vy = 0;
      }

      if (input.left) {
        player.vx = -moveSpeed;
        isMoving = true;
      } else if (input.right) {
        player.vx = moveSpeed;
        isMoving = true;
      }

      if (input.up) {
        player.vy = -moveSpeed * 0.7;
        isMoving = true;
      } else if (input.down) {
        player.vy = moveSpeed * 0.7;
        isMoving = true;
      }

      if (player.z === 0) {
        player.action = isMoving ? 'WALK' : 'IDLE';
      }

      // Ground Jump trigger
      if (input.jump && player.z === 0) {
        player.vz = 8.5;
        player.action = 'JUMP';
        sound.playKick(sound.calculatePan(player.x, this.cameraX));
      }

      // Attacks - can execute ground or air
      if (input.punch) {
        this.performPunchCombo(player, input);
      } else if (input.kick) {
        this.performKick(player, input);
      }
    } else if (player.action === 'PUNCH1' || player.action === 'PUNCH2' || player.action === 'KICK') {
      // Move during attack ONLY if directional keys are actively held
      if (input.left) {
        player.facing = 'LEFT';
        player.vx = -moveSpeed * 0.5;
      } else if (input.right) {
        player.facing = 'RIGHT';
        player.vx = moveSpeed * 0.5;
      } else {
        player.vx = 0;
      }

      if (input.up) {
        player.vy = -moveSpeed * 0.4;
      } else if (input.down) {
        player.vy = moveSpeed * 0.4;
      } else {
        player.vy = 0;
      }
    }

    player.prevJumpInput = input.jump;
  }

  /**
   * Whether this fighter is one of the two bosses.
   *
   * Written against `enemyType` rather than a flag on the entity so it stays
   * true for a boss spawned by a test as well as by a wave.
   */
  private isBossEntity(entity: EntityState): boolean {
    return entity.enemyType?.startsWith('BOSS') ?? false;
  }

  /**
   * How far apart two bodies rest, horizontally.
   *
   * The rule and everything behind it live in `spacing.ts`, which is the only
   * place that answers this — reach floors elsewhere in the engine and in the
   * companion policy read the same function. This stays a method so the call
   * sites below read as they always have.
   */
  private minSeparationX(a: EntityState, b: EntityState): number {
    return restingSeparationX(a, b);
  }

  /**
   * Puts a fighter who has run out of health on the ground, and counts the
   * body down to removal.
   *
   * Runs after everything that can damage or reposition a fighter this frame,
   * which is why it is a pass of its own rather than a branch inside
   * `damageEntity`. Several attacks set a pose *after* calling that — the
   * Sayonara tackle and bite both follow the damage with `KNOCKDOWN` — so a
   * pose written at the moment of the fatal hit would be overwritten by the
   * same attack that caused it. Deciding here means the last word each frame
   * belongs to death.
   *
   * The body's velocity is zeroed on the way down. Nothing integrates a dead
   * player's movement — `updatePlayer` is guarded on health — so a leftover
   * knockback would never decay, and the walk cycle keys off `vx`: the corpse
   * would lie on the ground running.
   */
  private updateFallenPlayers() {
    for (const ent of this.entities) {
      if (!ent.isPlayer || ent.hp > 0) continue;

      if (ent.action !== 'KO') {
        ent.action = 'KO';
        ent.actionFrame = 0;
        ent.actionTimer = PLAYER_KO_FRAMES;
        ent.vx = 0;
        ent.vy = 0;
        ent.vz = 0;
        ent.z = 0;
      } else if (ent.actionTimer > 0) {
        ent.actionTimer--;
      }
    }
  }

  private resolveBodyCollisions() {
    const activeEntities = this.entities.filter((e) => e.hp > 0);
    for (let i = 0; i < activeEntities.length; i++) {
      for (let j = i + 1; j < activeEntities.length; j++) {
        const a = activeEntities[i];
        const b = activeEntities[j];

        // Skip airborne flying/jumping entities high in air
        if (a.z > 25 || b.z > 25) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        // Enemies crowd each other more tightly than they crowd the player.
        // A single shared spacing put every attacker outside its own reach.
        const betweenEnemies = !a.isPlayer && !b.isPlayer;
        const minDx = this.minSeparationX(a, b);
        const minDy = betweenEnemies ? ENEMY_BODY_SEPARATION_Y : PLAYER_BODY_SEPARATION_Y;

        if (absDx < minDx && absDy < minDy) {
          // Split the correction by weight instead of evenly. An even split
          // meant each neighbouring enemy displaced the player once per frame,
          // and a crowd halved their walking speed.
          let aShare = 0.5;
          if (a.isPlayer !== b.isPlayer) {
            aShare = a.isPlayer ? PLAYER_PUSH_SHARE : 1 - PLAYER_PUSH_SHARE;
          }
          const bShare = 1 - aShare;

          const overlapX = minDx - absDx;
          if (dx >= 0) {
            a.x -= overlapX * aShare;
            b.x += overlapX * bShare;
          } else {
            a.x += overlapX * aShare;
            b.x -= overlapX * bShare;
          }

          if (absDy < minDy) {
            // 0.6 of the vertical overlap, as before: a softer correction on
            // this axis keeps fighters from snapping apart in depth.
            const overlapY = (minDy - absDy) * 0.6;
            if (dy >= 0) {
              a.y -= overlapY * aShare;
              b.y += overlapY * bShare;
            } else {
              a.y += overlapY * aShare;
              b.y -= overlapY * bShare;
            }
          }
        }
      }
    }
  }

  private performPunchCombo(player: EntityState, input?: PlayerInput) {
    if (input?.left) player.facing = 'LEFT';
    if (input?.right) player.facing = 'RIGHT';

    player.action = player.action === 'PUNCH1' ? 'PUNCH2' : 'PUNCH1';
    player.actionTimer = 18;
    // Only step forward if directional input is actively held
    const isHoldingForward = input?.left || input?.right;
    player.vx = isHoldingForward ? (player.facing === 'RIGHT' ? 3 : -3) : 0;
    if (!input?.up && !input?.down) player.vy = 0;

    sound.playPunch(sound.calculatePan(player.x, this.cameraX));

    // Generous Hitbox check (scaled for 1.5x character dimensions)
    const reach = PLAYER_PUNCH_REACH;
    const inRange = this.entities.filter((e) => !e.isPlayer && e.hp > 0 && Math.abs(e.y - player.y) < 55);
    this.entities.forEach((target) => {
      if (!target.isPlayer && target.hp > 0 && this.isValidTarget(target, inRange) && Math.abs(target.y - player.y) < 55) {
        const dx = target.x - player.x;
        const inHitbox =
          player.facing === 'RIGHT'
            ? dx >= -25 && dx <= reach
            : dx <= 25 && dx >= -reach;

        if (inHitbox) {
          const charPower = CHARACTERS[player.charId!].stats.power;
          const dmg = 12 + charPower * 2;
          const pushDist = player.action === 'PUNCH2' ? 14 : 9;
          target.vx = player.facing === 'RIGHT' ? pushDist : -pushDist;
          if (player.action === 'PUNCH2') target.vz = 2; // Small lift on combo finisher
          this.damageEntity(target, dmg, player);
        }
      }
    });
  }

  private performKick(player: EntityState, input?: PlayerInput) {
    if (input?.left) player.facing = 'LEFT';
    if (input?.right) player.facing = 'RIGHT';

    player.action = 'KICK';
    player.actionTimer = 28; // Increased duration so kick is clearly visible!
    // Step forward into kick ONLY if directional input is actively held
    const isHoldingForward = input?.left || input?.right;
    player.vx = isHoldingForward ? (player.facing === 'RIGHT' ? 5 : -5) : 0;
    if (!input?.up && !input?.down) player.vy = 0;
    sound.playKick(sound.calculatePan(player.x, this.cameraX));

    // Kick visual particle impact flash
    const kx = player.x + (player.facing === 'RIGHT' ? 65 : -65);
    const ky = player.y - player.z - 50;
    this.addParticle(kx, ky, 0, '#ffff00', undefined, 'SHOCKWAVE');

    const reach = PLAYER_KICK_REACH;
    const inRange = this.entities.filter((e) => !e.isPlayer && e.hp > 0 && Math.abs(e.y - player.y) < 60);
    this.entities.forEach((target) => {
      if (!target.isPlayer && target.hp > 0 && this.isValidTarget(target, inRange) && Math.abs(target.y - player.y) < 60) {
        const dx = target.x - player.x;
        const inHitbox =
          player.facing === 'RIGHT'
            ? dx >= -25 && dx <= reach
            : dx <= 25 && dx >= -reach;

        if (inHitbox) {
          const charPower = CHARACTERS[player.charId!].stats.power;
          const dmg = 18 + charPower * 3;
          target.vx = player.facing === 'RIGHT' ? 16 : -16; // Strong knockback
          target.vz = 3.5; // Lift enemy on heavy kick
          this.damageEntity(target, dmg, player);
        }
      }
    });
  }

  private performPowerMove(player: EntityState) {
    player.powerMeter -= 30;
    player.action = 'POWER_MOVE';
    player.actionTimer = POWER_MOVE_FRAMES;
    player.invulnerableTimer = 40;

    // A super is a commitment, and it never read as one.
    //
    // Nothing here used to touch velocity, and the movement branch in
    // `updatePlayer` only covers IDLE, WALK and JUMP — so whatever speed the
    // fighter carried into the move survived all forty-five frames of it.
    // Pressing the button mid-stride sent Feet Master 232 world pixels down
    // the street and Fun Maker 397, and because the renderer decides it is
    // walking from `vx` alone, the walk cycle played on top of the aura: a
    // 360-degree whirlpool performed by a man strolling.
    player.vx = 0;
    player.vy = 0;

    sound.playSpecial(sound.calculatePan(player.x, this.cameraX));

    const charId = player.charId!;

    // A fresh ledger per activation: the window below hits each body once.
    this.powerMoveHits.set(player.id, new Set());

    if (charId === 'FUN_MAKER') {
      player.vz = 10; // Skyward launch — the cyclone rises with him.
    } else if (charId === 'ANGRY_CORSO') {
      player.action = 'BITING';
      sound.playBite();
    }

    this.resolvePowerMove(player, true);

    if (charId === 'FEET_MASTER') {
      this.createShockwave(player.x, player.y, '#f5a623');
    } else if (charId === 'FUN_MAKER') {
      this.createShockwave(player.x, player.y, '#e2b036');
    } else if (charId === 'OMEGA_BIKER') {
      const shockDir = player.facing === 'RIGHT' ? 1 : -1;
      this.createShockwave(player.x + shockDir * 60, player.y, '#ff3b30');
    }
  }

  /**
   * One frame of an active power move.
   *
   * Called on the frame the button is pressed and on every frame of the
   * active window after it, so a fighter who walks into the swing late is
   * still swept up by it. The hit ledger is what keeps that from meaning
   * "damaged once per frame": anyone already in it is skipped.
   *
   * A fighter already on the floor can only be caught by the opening frame.
   * The downed rule — she is hit only when there is nothing else to swing at
   * — reads the field, and an open swing changes the field it is reading:
   * the grunt standing over Sayonara is thrown clear of the radius by the
   * first frame of the same move, and four frames later she is the only one
   * left in it. Asking the question once, when the button is pressed, keeps
   * the rule meaning what it was written to mean.
   */
  private resolvePowerMove(player: EntityState, opening = false) {
    const alreadyHit = this.powerMoveHits.get(player.id);
    if (!alreadyHit) return;

    const charId = player.charId!;
    const connect = (target: EntityState) => {
      alreadyHit.add(target.id);
    };
    const catchable = (target: EntityState, candidates: EntityState[]) =>
      !alreadyHit.has(target.id) &&
      (opening ? this.isValidTarget(target, candidates) : !target.downed);

    if (charId === 'FEET_MASTER') {
      // Feet Master: Human Bat Swing (Massive 360 AoE)
      //
      // Same downed-Sayonara exclusivity as punch/kick: a wide AoE special is
      // if anything more likely to catch her by accident, not less.
      const swingRange = this.entities.filter(
        (e) => !e.isPlayer && e.hp > 0 && Math.hypot(e.x - player.x, e.y - player.y) < 200
      );
      this.entities.forEach((target) => {
        if (
          !target.isPlayer &&
          target.hp > 0 &&
          catchable(target, swingRange) &&
          Math.hypot(target.x - player.x, target.y - player.y) < 200
        ) {
          connect(target);
          this.damageEntity(target, 45, player);
          target.vx = target.x > player.x ? 12 : -12;
          target.vz = 6;
        }
      });

    } else if (charId === 'FUN_MAKER') {
      // Fun Maker: Rollercoaster Hurricane (Spin skyward cyclone)
      const cycloneRange = this.entities.filter(
        (e) => !e.isPlayer && e.hp > 0 && Math.hypot(e.x - player.x, e.y - player.y) < 180
      );
      this.entities.forEach((target) => {
        if (
          !target.isPlayer &&
          target.hp > 0 &&
          catchable(target, cycloneRange) &&
          Math.hypot(target.x - player.x, target.y - player.y) < 180
        ) {
          connect(target);
          this.damageEntity(target, 40, player);
          target.vz = 9; // Juggle enemies into the air!
        }
      });

    } else if (charId === 'OMEGA_BIKER') {
      // Omega Biker: Heavy Shockwave Kick (Destroys shields & heavy knockback)
      const shockDir = player.facing === 'RIGHT' ? 1 : -1;
      const shockRange = this.entities.filter(
        (e) =>
          !e.isPlayer &&
          e.hp > 0 &&
          Math.abs(e.y - player.y) < 60 &&
          ((shockDir === 1 && e.x > player.x) || (shockDir === -1 && e.x < player.x))
      );
      this.entities.forEach((target) => {
        if (
          !target.isPlayer &&
          target.hp > 0 &&
          catchable(target, shockRange) &&
          Math.abs(target.y - player.y) < 60
        ) {
          if ((shockDir === 1 && target.x > player.x) || (shockDir === -1 && target.x < player.x)) {
            connect(target);
            if (target.shieldHp) target.shieldHp = 0; // Guard breaker!
            this.damageEntity(target, 50, player);
            target.vx = shockDir * 18; // Massive screen kick
          }
        }
      });

    } else if (charId === 'ANGRY_CORSO') {
      // Angry Corso: Feral Pup Rush & Bite (Pin down, bite, leech health!)
      const biteRange = this.entities.filter(
        (e) => !e.isPlayer && e.hp > 0 && Math.hypot(e.x - player.x, e.y - player.y) < 150
      );
      this.entities.forEach((target) => {
        if (
          !target.isPlayer &&
          target.hp > 0 &&
          catchable(target, biteRange) &&
          Math.hypot(target.x - player.x, target.y - player.y) < 150
        ) {
          connect(target);
          this.damageEntity(target, 55, player);
          // Leech health back!
          player.hp = Math.min(player.maxHp, player.hp + 25);
          this.addParticle(player.x, player.y - 40, 0, '#34c759', '+25 HP LEECH', 'TEXT');
        }
      });
    }
  }

  private damageEntity(target: EntityState, damage: number, attacker: EntityState) {
    if (target.invulnerableTimer > 0) return;

    // Remember being hit, so the fighter can tell pressure from pursuit.
    if (target.enemyType === 'BOSS_SAYONARA' && attacker.isPlayer) {
      target.pressureTimer = SAYONARA_PRESSURE_MEMORY;
    }

    // Casting leaves the Matriarch open.
    //
    // She already roots herself for the half second a wave takes to leave her
    // hands — she has to, or the projectile would trail behind her — but there
    // was no reason to exploit it. Reaching her costs the player a chase past
    // a faster dog, and the payoff has to be worth that. The extra damage is
    // what turns her retreat from a wall into a rhythm to read.
    if (
      attacker.isPlayer &&
      target.enemyType === 'BOSS_MADAM_MIZYDIA' &&
      target.action === 'PUNCH1'
    ) {
      damage = Math.round(damage * CASTING_DAMAGE_MULTIPLIER);
      this.addParticle(target.x, target.y - 80, 0, '#ffe066', 'PUNISHED!', 'TEXT');
    }

    // Boss shield protection check
    if (target.shieldHp && target.shieldHp > 0) {
      target.shieldHp = Math.max(0, target.shieldHp - damage);
      this.addParticle(target.x, target.y - 60, 0, '#74b9ff', 'SHIELD BLOCK', 'TEXT');
      sound.playBlock(sound.calculatePan(target.x, this.cameraX));
      target.invulnerableTimer = 6;
      return;
    }

    target.hp -= damage;
    target.action = 'HURT';
    target.actionTimer = 18;
    target.invulnerableTimer = 6;

    if (attacker && attacker.facing) {
      const dir = attacker.facing === 'RIGHT' ? 1 : -1;
      if (!target.vx) {
        target.vx = dir * 8;
      }
    }

    // Floating Damage Number
    this.addParticle(target.x, target.y - 75, 0, '#ff3b30', `${damage}`, 'TEXT');

    sound.playHitHurt(sound.calculatePan(target.x, this.cameraX));

    if (attacker.isPlayer) {
      attacker.powerMeter = Math.min(100, attacker.powerMeter + 8);
      attacker.comboHits++;
      attacker.comboTimer = 90;
      this.stats.score += damage * 10 * attacker.comboHits;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, attacker.comboHits);
    } else {
      this.stats.damageTaken += damage;
    }

    // Sayonara goes down rather than dying.
    //
    // She is the one fighter the heroes are trying to save, and also the one
    // attacking them, so killing her was the path of least resistance rather
    // than a decision. Zero health now drops her: the collar loses its grip,
    // she stops fighting, and the wave counts her as handled. Striking her from
    // there kills her for real.
    // Hitting the hostage reads differently from hitting an enemy.
    if (target.enemyType === 'BOSS_SAYONARA' && !target.freed && Math.random() < 0.25) {
      this.addParticle(target.x, target.y - 70, 0, '#ffb347', "SHE'S NOT THE ENEMY", 'TEXT');
    }

    if (target.enemyType === 'BOSS_SAYONARA' && target.hp <= 0) {
      if (target.downed) {
        this.sayonaraKilled = true;
        target.downed = false;
        target.hp = 0;
      } else {
        // Held at one hit point rather than zero. Zero would make her
        // unhittable, since attacks only look for living targets, and an
        // unkillable hostage is not a choice either.
        target.downed = true;
        target.hp = 1;
        target.vx = 0;
        target.vy = 0;
        target.action = 'KNOCKDOWN';
        target.actionTimer = 30;
      }
    }

    // Check Boss Sayonara Defeat Resolution
    if (target.enemyType === 'BOSS_MADAM_MIZYDIA' && target.hp <= 0) {
      // Mizydia is the boss of stage 2 as well, where the fiction calls her a
      // hologram. Without this gate, beating her there set bossDefeated and the
      // campaign ended two stages early — the final stage was unreachable.
      // Free Sayonara!
      // The collar breaks whether she is standing or on the floor. Only a
      // killing blow puts her past saving, and that takes her off the field —
      // so finding nobody here is itself the failed outcome.
      const sayonara = this.entities.find((e) => e.enemyType === 'BOSS_SAYONARA');
      if (sayonara) {
        sayonara.downed = false;
        sayonara.freed = true;
        sayonara.action = 'WALK';
        sayonara.facing = 'RIGHT';
        sayonara.vx = 4; // Sayonara breaks control and walks away freely!
        sayonara.actionTimer = 0;
      }

      if (this.stage.isFinalStage) {
        // She has walked away since the day this was written and nobody has
        // ever seen it: bossDefeated used to be set right here, App routed to
        // the victory screen on the same frame, and the walk rendered on
        // exactly zero of them. Hold the ending open until she is gone.
        if (sayonara) {
          this.outroTimer = OUTRO_MAX_FRAMES;
          this.setActiveDialogue(
            resolveDialogue(
              [
                {
                  speaker: 'Sayonara',
                  // Not the collared face. She is saying the collar is quiet;
                  // wearing it lit while she says so undoes the whole beat.
                  portrait: 'SAYONARA_FREED',
                  text: "The collar... it's quiet. Her voice is gone from my head.",
                  side: 'RIGHT',
                },
                heroLine('ANGRY_CORSO', {
                  ANGRY_CORSO: "Go on, girl. Nobody's holding your leash now.",
                  FEET_MASTER: 'Walk, Sayonara. Nobody gives you orders ever again.',
                  FUN_MAKER: 'There she is. Go find somewhere loud, sweetheart.',
                  OMEGA_BIKER: "Road's open, girl. Take it.",
                }),
              ],
              this.roster()
            )
          );
        } else {
          // Nobody left to free. The victory is mechanical, and the screen
          // that follows says so.
          this.bossDefeated = true;
        }
      }
    }

    if (target.hp <= 0 && !target.isPlayer) {
      this.stats.enemiesDefeated++;
      // Drop health tacos or energy drinks
      if (Math.random() > 0.4) {
        this.items.push({
          id: 'item_' + Math.random(),
          type: Math.random() > 0.5 ? 'HEALTH_TACO' : 'ENERGY_DRINK',
          x: target.x,
          y: target.y,
          z: 0,
          value: 30,
        });
      }
    }
  }

  private updateEnemyAi(enemy: EntityState) {
    // Phase describes the state of the fight, not what the boss is doing this
    // frame, so it is computed before the early returns below — otherwise it
    // would freeze for the whole duration of a cast.
    if (enemy.enemyType === 'BOSS_MADAM_MIZYDIA') {
      enemy.bossPhase = (enemy.shieldHp ?? 0) <= 0 && enemy.hp < enemy.maxHp * 0.5 ? 2 : 1;
    }

    if (enemy.stunTimer > 0) {
      enemy.stunTimer--;
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }

    // Do not override movement/action if enemy is performing an attack, hurt, or power move
    if (enemy.action !== 'IDLE' && enemy.action !== 'WALK') {
      // Cooldowns keep running while she is busy or being hit.
      //
      // Everything below this line is a decision, and a fighter mid-swing or
      // mid-flinch has no decision to make — but the countdown to her next one
      // is not a decision, and freezing it here meant every punch the player
      // landed also bought them a longer wait for her reply.
      //
      // The cost is not mostly the flinch. Against a player attacking in
      // bursts she spends 34 frames of 1800 in HURT — two per cent — and 562
      // in this branch altogether, thirty-one per cent, nearly all of it her
      // own bite. So what the freeze charged her for was chiefly acting at
      // all, and secondarily being hit. An earlier draft of this comment put
      // 255 frames and fourteen per cent on HURT alone, which is the whole
      // branch's share misattributed to one state inside it.
      //
      // Action timers are untouched. What ticks is only the wait between one
      // move and the next.
      if (enemy.enemyType === 'BOSS_SAYONARA') {
        enemy.chargeCooldown = Math.max(0, (enemy.chargeCooldown ?? 0) - 1);
        enemy.biteCooldown = Math.max(0, (enemy.biteCooldown ?? 0) - 1);
        enemy.pressureTimer = Math.max(0, (enemy.pressureTimer ?? 0) - 1);
      }
      return;
    }

    const targetPlayer = this.player1 && this.player1.hp > 0 ? this.player1 : this.player2;
    if (!targetPlayer) {
      enemy.vx = 0;
      enemy.vy = 0;
      enemy.action = 'IDLE';
      return;
    }

    const dx = targetPlayer.x - enemy.x;
    const dy = targetPlayer.y - enemy.y;
    const dist = Math.hypot(dx, dy);
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    enemy.facing = dx > 0 ? 'RIGHT' : 'LEFT';

    const info = ENEMIES[enemy.enemyType!];

    // Arena Entry Check: If enemy is off-screen, FORCE them to march into the visible fighting arena first
    const arenaMinX = this.cameraX + 40;
    const arenaMaxX = this.cameraX + 760;
    const isOffScreen = enemy.x < arenaMinX || enemy.x > arenaMaxX;

    // Once she has fought inside the arena, being outside it is not the same
    // question any more.
    //
    // This branch exists to walk a freshly spawned enemy in from off-screen,
    // and it seized control of anyone outside the band for any reason —
    // including a boss who had backed off to buy herself a run-up. Between the
    // arena the AI reads (cameraX + 760) and the clamp the engine actually
    // enforces (cameraX + 830) there is a seventy-pixel strip where a fighter
    // is physically legal but has no say, and Sayonara spent 902 frames of
    // 1800 parked in it, marched back and forth, deciding nothing. It is why
    // the hardest difficulty played as the easiest: the more bodies pushing
    // her, the more of the fight she spent there.
    //
    // So arrival is remembered. Enemies that have never been in the arena
    // still get walked in; enemies that have carry on making their own
    // decisions, and the position clamp is what keeps them on the field.
    if (!isOffScreen) enemy.hasEnteredArena = true;

    if (isOffScreen && !enemy.hasEnteredArena) {
      const targetX = enemy.x < arenaMinX ? arenaMinX + 70 : arenaMaxX - 70;
      enemy.vx = targetX > enemy.x ? info.speed : -info.speed;
      enemy.vy = Math.abs(dy) > 10 ? (dy > 0 ? 1 : -1) * info.speed * 0.5 : 0;
      enemy.action = 'WALK';
      enemy.facing = enemy.vx > 0 ? 'RIGHT' : 'LEFT';
      return;
    }

    if (enemy.enemyType === 'BOSS_MADAM_MIZYDIA') {
      // The Matriarch is a caster, not a brawler.
      //
      // She fell into the generic melee branch with attackRange 250, so she
      // stood a quarter of the screen away and "punched" — damage landed at
      // 275px with nothing drawn between her and the player. Her own data says
      // Status Quo Magic and Excommunication waves; this is that.
      //
      // `bossPhase` was written at spawn and never read anywhere. It now marks
      // the turn of the fight: once the barrier is down and she is below half
      // health, the censure comes in threes.
      const enraged = enemy.bossPhase === 2;

      const holdAt = info.attackRange * 0.8;
      if (dist > holdAt + 40) {
        enemy.vx = (dx > 0 ? 1 : -1) * info.speed;
        enemy.action = 'WALK';
      } else if (dist < holdAt - 60) {
        enemy.vx = (dx > 0 ? -1 : 1) * info.speed * 0.7;
        enemy.action = 'WALK';
      } else {
        enemy.vx = 0;
        enemy.action = enemy.actionTimer > 0 ? enemy.action : 'IDLE';
      }
      enemy.vy = Math.abs(dy) > 12 ? (dy > 0 ? 1 : -1) * info.speed * 0.4 : 0;
      enemy.facing = dx > 0 ? 'RIGHT' : 'LEFT';

      // The cast check used to ignore the holding band entirely: it only
      // required `dist < attackRange`, so a wave could be cast from as close
      // as point-blank while she was mid-retreat. At that range the hazard's
      // ~48px hit radius already reaches the player, so it landed in a
      // handful of frames — far below human reaction time, and effectively
      // unavoidable for a player pressing the attack, which is the natural
      // way to play a brawler. Requiring the same minimum distance her own
      // positioning already tries to hold makes every cast a real, dodgeable
      // projectile instead of an occasional instant hit.
      const castChance = enraged ? 0.03 : 0.016;
      if (
        dist >= holdAt - 60 &&
        dist < info.attackRange &&
        enemy.actionTimer === 0 &&
        Math.random() < castChance
      ) {
        enemy.action = 'PUNCH1';
        enemy.actionTimer = 30;
        enemy.vx = 0;
        enemy.vy = 0;
        sound.playBossAlarm();

        // Excommunication wave. Phase two fans three of them.
        const spread = enraged ? [-26, 0, 26] : [0];
        for (const offset of spread) {
          this.hazards.push({
            id: 'censure_' + Math.random(),
            type: 'LASER_CROSS',
            x: enemy.x,
            y: enemy.y + offset,
            z: 34,
            vx: dx > 0 ? 6.5 : -6.5,
            vy: offset * 0.02,
            timer: 90,
            active: true,
          });
        }
      }
      return;
    }

    if (enemy.enemyType === 'BOSS_SAYONARA') {
      // The Old Guard runs at you.
      //
      // Her data said Heavy Knockback Tackle for a long time and the engine
      // never built one: she shared the generic melee branch with the Purity
      // Patrol, so the fastest fighter in the game walked into punching
      // distance and threw a grunt's punch with a grunt's push of nine. What
      // follows is the rush her codex entry — now Collared Rush & Bite —
      // promises, and the bite below is the other half.
      //
      // It runs as a small state machine rather than a damage roll, because a
      // charge that cannot be seen coming is not a fight, it is a tax. She
      // drops into a crouch where the player can read it, commits to a
      // direction she cannot then steer, and if she misses she is on the floor
      // of her own recovery with nothing to do about it.
      //
      // She takes no attack slot. The shared queue exists to stop a crowd
      // swinging at once, and her own cooldown already paces her — leaving her
      // in it meant the two grunts who spawn beside the player in wave 1.4
      // took both slots on the first frame and held them, which measured as
      // zero engagement from the stage's boss across thirty seconds on EASY
      // and NORMAL. The first boss of the game watched her own fight.
      const phase = enemy.chargeState ?? 'READY';
      enemy.chargeCooldown = Math.max(0, (enemy.chargeCooldown ?? 0) - 1);
      enemy.chargeTimer = Math.max(0, (enemy.chargeTimer ?? 0) - 1);

      if (phase === 'TELEGRAPH') {
        // Planted. She still turns to track, so the player cannot simply walk
        // around behind her during the wind-up, but she does not close.
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.action = 'IDLE';
        enemy.facing = dx > 0 ? 'RIGHT' : 'LEFT';

        if (enemy.chargeTimer === 0) {
          enemy.chargeState = 'CHARGE';
          enemy.chargeTimer = SAYONARA_CHARGE_FRAMES;
          enemy.chargeDir = dx > 0 ? 1 : -1;
          enemy.chargeHasHit = false;
          sound.playBossAlarm();
        }
        return;
      }

      if (phase === 'CHARGE') {
        const dir = enemy.chargeDir ?? (dx > 0 ? 1 : -1);
        enemy.vx = dir * SAYONARA_CHARGE_SPEED;
        enemy.vy = 0;
        enemy.action = 'WALK';
        enemy.facing = dir > 0 ? 'RIGHT' : 'LEFT';

        // Contact is body against body, not a reach: half of each build plus a
        // little, which is why she had to be given a build in the first place.
        //
        // She does not stop on impact — a charge that ends the moment it lands
        // is a lunge — but she does not pass through either, and it is worth
        // being exact about why. Contact reaches 110px; body separation holds
        // her at 100. Separation is the tighter of the two, so the frame after
        // she connects she is being pushed back out to that ring, and she runs
        // the rest of the charge along it rather than crossing to the far
        // side. Measured at four starting distances: the gap after a hit is
        // 100px every time and she never changes sides.
        //
        // The 10px of slack between the two is exactly what `chargeHasHit`
        // covers. The bodies stay inside contact range for one to ten frames
        // while separation does its work, and without the flag that single
        // commitment lands two or three times.
        const contactX = (enemy.width + targetPlayer.width) / 2 + 10;
        if (
          !enemy.chargeHasHit &&
          Math.abs(dx) < contactX &&
          Math.abs(dy) < SAYONARA_TACKLE_DEPTH
        ) {
          enemy.chargeHasHit = true;
          this.damageEntity(targetPlayer, Math.round(info.power * SAYONARA_TACKLE_DAMAGE_MULTIPLIER), enemy);
          targetPlayer.vx = dir * SAYONARA_TACKLE_KNOCKBACK;
          targetPlayer.action = 'KNOCKDOWN';
          targetPlayer.actionTimer = SAYONARA_TACKLE_KNOCKDOWN_FRAMES;
          this.addParticle(targetPlayer.x, targetPlayer.y - 40, 0, '#f97316', undefined, 'SHOCKWAVE');
        }

        if (enemy.chargeTimer === 0) {
          enemy.chargeState = 'RECOVER';
          enemy.chargeTimer = SAYONARA_RECOVER_FRAMES;
        }
        return;
      }

      if (phase === 'RECOVER') {
        // Pulling up. Momentum bleeds off rather than stopping dead, and she
        // cannot turn, wind up, or walk out of it — this is the window the
        // read is worth.
        enemy.vx *= 0.86;
        enemy.vy = 0;
        enemy.action = 'IDLE';

        if (enemy.chargeTimer === 0) {
          enemy.chargeState = 'READY';
          enemy.chargeCooldown = SAYONARA_CHARGE_COOLDOWN;
        }
        return;
      }

      // READY: close to the band she can commit from, and hold there.
      enemy.facing = dx > 0 ? 'RIGHT' : 'LEFT';
      enemy.vy = Math.abs(dy) > 10 ? (dy > 0 ? 1 : -1) * info.speed * 0.5 : 0;
      enemy.biteCooldown = Math.max(0, (enemy.biteCooldown ?? 0) - 1);
      enemy.pressureTimer = Math.max(0, (enemy.pressureTimer ?? 0) - 1);

      if (absDx > SAYONARA_CHARGE_MAX_RANGE) {
        enemy.vx = (dx > 0 ? 1 : -1) * info.speed;
        enemy.action = 'WALK';
      } else if (absDx < SAYONARA_CHARGE_MIN_RANGE) {
        // Too close to run. Either she goes and gets the room, or she fights
        // where she stands.
        //
        // She used to always retreat here, which was written up as
        // counter-play: give up the ground, deny the tackle. Against the arena
        // edge there is no ground left to give, and a player who walked into
        // her simply turned her off — nine hundred frames cornered, never once
        // leaving the approach state, no damage at all. A boss with an off
        // switch is not a trade.
        //
        // Then she always bit, and that was worse in a quieter way: measured
        // over thirty seconds she threw twenty-four bites and one charge. The
        // whole telegraphed move — crouch where the player can read it, commit
        // to a direction, pay for missing — fired once, and a boss whose
        // offence is an unannounced bite is the tax this engine's own comment
        // warns against three branches up.
        //
        // So the retreat is conditional on having something to retreat for. If
        // the charge is off cooldown she goes and fetches the ground for it;
        // if it is not, or if there is no ground behind her, she fights with
        // what she has. The bite becomes the filler between charges rather
        // than a replacement for them: eight and eight over the same thirty
        // seconds, against eleven and zero if she only ever retreated.
        //
        // The bite stays the lesser half of her either way — less damage, half
        // the time on the floor, no run-up to read.
        // The wall is the edge of the screen, and it is nearer than the edge
        // itself: step past `arenaMaxX` and the arena-entry branch at the top
        // of this method takes over before any of her own logic runs, marching
        // her back to seventy pixels inside. Retreating into that is not
        // retreating, it is handing the decision to another branch, so the
        // margin here matches the one that branch uses to put her back — a
        // retreat now ends somewhere she can still act from.
        //
        // It does not buy back the time itself. Chased across open ground she
        // spends roughly the same share of the fight outside the arena either
        // way — 1602 frames of 1800 before this patch, 1348 after — because
        // that is the camera's doing and not hers. What changes is what
        // happens in the frames she does get: nothing at all before, 120
        // damage after. The camera behaviour is its own defect and is not
        // fixed here.
        const roomBehind = enemy.x + (dx > 0 ? -1 : 1) * info.speed * 0.75;
        const cornered = roomBehind <= arenaMinX + 70 || roomBehind >= arenaMaxX - 70;

        // Judged over a window, not frame by frame: the question is whether
        // backing away is earning her anything, and a single good frame is not
        // an answer.
        //
        // A player who simply walks after her holds the gap at the resting
        // distance, so without a limit she retreats for the whole fight and
        // never reaches the band she is retreating towards. The first version
        // of this compared the gap against the previous frame's and reset the
        // count the moment it grew, which any real player does constantly —
        // step in, swing, drift back, step in again. Against a stationary test
        // player it looked fine; against someone actually playing she managed
        // one charge and two bites in thirty seconds.
        //
        // So she remembers the gap she started backing away from and gives up
        // if the whole attempt has not bought her the ground it needed.
        enemy.retreatFrames = (enemy.retreatFrames ?? 0) + 1;

        // One second of backing away is all she gets. If the charge band is not
        // reached by then it is not going to be, and she fights with what she
        // has.
        //
        // An earlier version also asked whether the retreat had bought ground,
        // reopening the window when it had. It was removed rather than tested:
        // across every scenario that could be built, the difference between
        // judging that and not judging it sat inside the noise of the engine's
        // own dice — small enough that a test pinning it would have been
        // pinning a seed. A constant that cannot be shown to do anything is
        // better deleted than documented.
        const givingUp = enemy.retreatFrames >= SAYONARA_RETREAT_PATIENCE;

        // Someone hitting her is not the same as someone walking after her.
        //
        // Both used to end with her backing away, which is the right answer to
        // exactly one of them: ground bought from a player who is chasing gets
        // her the run-up, and ground bought from a player who is swinging just
        // means taking the hits while facing the wrong way. So a recent hit
        // holds her in the fight — she stops looking for the charge and works
        // with the jaws until the pressure lets up.
        const underAttack = (enemy.pressureTimer ?? 0) > 0;

        if (!cornered && !givingUp && !underAttack && enemy.chargeCooldown === 0) {
          enemy.vx = (dx > 0 ? -1 : 1) * info.speed * 0.75;
          enemy.action = 'WALK';
        } else if (
          enemy.biteCooldown === 0 &&
          absDx < SAYONARA_BITE_RANGE &&
          Math.abs(dy) < SAYONARA_TACKLE_DEPTH
        ) {
          enemy.vx = 0;
          enemy.vy = 0;
          enemy.action = 'PUNCH1';
          enemy.actionTimer = SAYONARA_BITE_FRAMES;
          enemy.biteCooldown = SAYONARA_BITE_FRAMES + SAYONARA_BITE_COOLDOWN;
          enemy.retreatFrames = 0;
          sound.playPunch(sound.calculatePan(enemy.x, this.cameraX));

          this.damageEntity(targetPlayer, info.power, enemy);
          targetPlayer.vx = (dx > 0 ? 1 : -1) * SAYONARA_BITE_KNOCKBACK;
          targetPlayer.action = 'KNOCKDOWN';
          targetPlayer.actionTimer = SAYONARA_BITE_KNOCKDOWN_FRAMES;
        } else if (absDx > SAYONARA_BITE_RANGE - 20) {
          // Between the jaws and the run-up there would otherwise be a band
          // where she neither bites nor charges, which is the same dead zone
          // in a different place. She closes it.
          enemy.vx = (dx > 0 ? 1 : -1) * info.speed * 0.6;
          enemy.action = 'WALK';
        } else {
          enemy.vx = 0;
          enemy.action = 'IDLE';
        }
      } else {
        enemy.vx = 0;
        enemy.action = 'IDLE';
        enemy.retreatFrames = 0;

        if (enemy.chargeCooldown === 0 && Math.abs(dy) < SAYONARA_TACKLE_DEPTH) {
          enemy.chargeState = 'TELEGRAPH';
          enemy.chargeTimer = SAYONARA_TELEGRAPH_FRAMES;
        }
      }
      return;
    }

    if (enemy.enemyType === 'CONVERSION_THERAPIST') {
      // Ranged enemy: Throws Guilt Vials / Repression Darts
      // Was hardcoded to 220 while characterData declares attackRange: 300 —
      // two numbers for the same thing, one of them decorative.
      if (dist < info.attackRange && Math.random() < 0.02 && enemy.actionTimer === 0) {
        enemy.action = 'PUNCH1';
        enemy.actionTimer = 30;
        enemy.vx = 0;
        enemy.vy = 0;
        // Launch slowing Guilt Vial
        this.hazards.push({
          id: 'vial_' + Math.random(),
          type: 'OFFERING_DRONE', // reused projectile logic
          x: enemy.x,
          y: enemy.y,
          z: 20,
          vx: dx > 0 ? 5 : -5,
          vy: 0,
          timer: 60,
          active: true,
        });
      } else if (dist < 140) {
        // Back away to keep ranged distance ONLY if staying safely within visible screen
        const backVx = dx > 0 ? -info.speed : info.speed;
        const nextX = enemy.x + backVx;
        if (nextX >= arenaMinX + 20 && nextX <= arenaMaxX - 20) {
          enemy.vx = backVx;
        } else {
          enemy.vx = 0;
        }
        enemy.vy = 0;
        enemy.action = 'WALK';
      } else {
        // Approach towards player when far away or to maintain active presence
        enemy.vx = (dx > 0 ? 1 : -1) * info.speed * 0.7;
        enemy.vy = Math.abs(dy) > 12 ? (dy > 0 ? 1 : -1) * info.speed * 0.5 : 0;
        enemy.action = 'WALK';
      }
    } else {
      // Melee AI (Purity Patrol, Trad-Wife Striker, Bosses)
      // Reach has to clear the distance bodies actually rest at.
      //
      // This branch is only entered once the enemy is inside `idealRange`, and
      // separation decides how close it can ever get. Sayonara declares a
      // 140px build, which holds her 100px from the player, against an
      // attackRange of 90: she approached forever and never once swung.
      // Silently — nothing threw, nothing logged, the suite stayed green.
      //
      // The floor keeps a fighter's reach at least as long as its own body
      // keeps it away, so a build wider than its arm is a shorter fight rather
      // than a mute one. It is the same trap the spacing comment below already
      // records: a single shared number put every attacker outside its reach.
      const idealRange = Math.max(
        75,
        info.attackRange,
        this.minSeparationX(enemy, targetPlayer) + 4
      );

      // No attack slot: hold the standoff ring and wait for one to open.
      // This is what keeps the crowd from shoving the committed attackers out
      // of their own reach.
      if (!this.attackSlots.has(enemy.id)) {
        const desiredX = targetPlayer.x + (dx > 0 ? -ATTACKER_STANDOFF_X : ATTACKER_STANDOFF_X);
        const gap = desiredX - enemy.x;

        if (Math.abs(gap) > ATTACKER_STANDOFF_TOLERANCE) {
          const stepVx = Math.sign(gap) * info.speed * 0.6;
          const nextX = enemy.x + stepVx;
          enemy.vx = nextX >= arenaMinX + 10 && nextX <= arenaMaxX - 10 ? stepVx : 0;
          enemy.action = 'WALK';
        } else {
          enemy.vx = 0;
          enemy.action = 'IDLE';
        }

        // Line up vertically while waiting, so taking a slot means committing
        // immediately instead of spending it closing the gap.
        enemy.vy = absDy > 12 ? (dy > 0 ? 1 : -1) * info.speed * 0.35 : 0;
        return;
      }

      if (absDx < 55) {
        // Too close! Step back slightly to maintain arm's length distance
        const backVx = (dx > 0 ? -1 : 1) * info.speed * 0.7;
        const nextX = enemy.x + backVx;
        if (nextX >= arenaMinX + 10 && nextX <= arenaMaxX - 10) {
          enemy.vx = backVx;
        } else {
          enemy.vx = 0;
        }
        enemy.vy = absDy > 12 ? (dy > 0 ? 1 : -1) * info.speed * 0.5 : 0;
        enemy.action = 'WALK';
      } else if (absDx > idealRange || absDy > 16) {
        // Approach towards target. Each axis moves only if IT is the one out
        // of range — otherwise an enemy already at ideal X range keeps
        // walking horizontally into the player just because Y is still
        // misaligned, feeding the body-collision push a fresh overlap every
        // frame and dragging the (unmoving) player across the arena.
        //
        // Also hold if a teammate already occupies the space ahead: walking
        // into them doesn't get this enemy any closer (resolveBodyCollisions
        // only refunds half the overlap per frame), but it does relay a
        // steady shove through the teammate onto whoever is at the front of
        // the queue — usually the player, dragging them across the arena
        // with no way to stop it since they never even took a hit.
        // resolveBodyCollisions rests touching entities at exactly
        // ENEMY_BODY_SEPARATION_X apart, so a strict "<" here never
        // triggers at that resting distance — add a few px of slack so
        // "in contact" reliably reads as blocked instead of flickering.
        const wantsAdvanceX = absDx > idealRange;
        const blockedAhead =
          wantsAdvanceX &&
          this.entities.some(
            (other) =>
              other !== enemy &&
              other.hp > 0 &&
              (dx > 0 ? other.x > enemy.x : other.x < enemy.x) &&
              Math.abs(other.x - enemy.x) < ENEMY_BODY_SEPARATION_X + 4 &&
              Math.abs(other.y - enemy.y) < ENEMY_BODY_SEPARATION_Y + 4
          );
        enemy.vx = wantsAdvanceX && !blockedAhead ? (dx > 0 ? 1 : -1) * info.speed * 0.8 : 0;
        enemy.vy = absDy > 16 ? (dy > 0 ? 1 : -1) * info.speed * 0.5 : 0;
        enemy.action = 'WALK';
      } else {
        // Perfect arm's length position! Stop moving and attack
        enemy.vx = 0;
        enemy.vy = 0;
        if (enemy.actionTimer === 0 && Math.random() < 0.04) {
          enemy.action = 'PUNCH1';
          enemy.actionTimer = 25;
          sound.playPunch(sound.calculatePan(enemy.x, this.cameraX));

          if (Math.abs(targetPlayer.y - enemy.y) < 36 && Math.abs(targetPlayer.x - enemy.x) < idealRange + 25) {
            this.damageEntity(targetPlayer, info.power, enemy);
            targetPlayer.vx = enemy.facing === 'RIGHT' ? 9 : -9; // Push player back when hit
          }
        } else {
          enemy.action = 'IDLE';
        }
      }
    }
  }

  private updateEntityPhysics(ent: EntityState) {
    // A body is not physics.
    //
    // Measured in the browser before this line existed: the death timer fell
    // by two every frame, because the generic tick below runs on every entity
    // and `updateFallenPlayers` ticks it as well. The body left the field in
    // half the time it was given. Worse, the tick that reaches zero here puts
    // the entity back into `IDLE` — a fallen fighter standing up again, for
    // the one frame before death reclaimed it.
    //
    // The whole death animation has one owner.
    if (ent.action === 'KO') return;

    ent.x += ent.vx;
    ent.y += ent.vy;

    // Clamped here, right after the position is integrated, rather than only
    // at the top of the frame. Clamping before movement leaves every entity a
    // full frame's velocity outside the band when the frame ends — about three
    // pixels, which is what the render then draws.
    ent.y = Math.max(ARENA_MIN_Y, Math.min(ARENA_MAX_Y, ent.y));

    // Apply smooth friction decay when in HURT/KNOCKDOWN state
    if (ent.action === 'HURT' || ent.action === 'KNOCKDOWN' || ent.action === 'RECOVERY') {
      ent.vx *= 0.83;
      ent.vy *= 0.83;
      if (Math.abs(ent.vx) < 0.2) ent.vx = 0;
      if (Math.abs(ent.vy) < 0.2) ent.vy = 0;
    }

    // Vertical jump & flight physics
    if (ent.z > 0 || ent.vz !== 0) {
      ent.z += ent.vz;
      if (ent.action !== 'FLYING') {
        ent.vz -= 0.5; // Gravity only applies when NOT flying!
      }
      if (ent.z <= 0) {
        ent.z = 0;
        ent.vz = 0;
        ent.canDoubleJump = true;
        if (ent.action === 'JUMP' || ent.action === 'FLYING' || ent.action === 'HURT') ent.action = 'IDLE';
      }
    }

    // Invulnerability timer tick down
    if (ent.invulnerableTimer > 0) {
      ent.invulnerableTimer--;
    }

    // Action timer tick down
    if (ent.actionTimer > 0) {
      ent.actionTimer--;
      if (ent.actionTimer === 0) {
        if (ent.action !== 'WALK' && ent.action !== 'FLYING') {
          ent.action = 'IDLE';
          ent.vx = 0;
          ent.vy = 0;
        }
      }
    }
  }

  private updateItems() {
    this.items.forEach((item) => {
      this.entities.forEach((player) => {
        if (player.isPlayer && Math.hypot(player.x - item.x, player.y - item.y) < 50) {
          if (item.type === 'HEALTH_TACO' || item.type === 'ENERGY_DRINK') {
            player.hp = Math.min(player.maxHp, player.hp + item.value);
            this.addParticle(player.x, player.y - 70, 0, '#34c759', '+30 HP', 'TEXT');
            sound.playHeal();
          }
          item.value = 0; // Consumed
        }
      });
    });
    this.items = this.items.filter((i) => i.value > 0);
  }

  private updateHazards() {
    this.hazards.forEach((hazard) => {
      hazard.x += hazard.vx;
      hazard.y += hazard.vy;
      hazard.timer--;

      // Remove hazards that travel off-screen
      if (hazard.x < this.cameraX - 40 || hazard.x > this.cameraX + 840) {
        hazard.active = false;
        return;
      }

      // Hit detection ONLY when the hazard is inside the visible arena.
      //
      // This used to name `this.player1` directly, so player two was immune to
      // every projectile in the game. Harmless while P2 was an AI companion;
      // once a second person could hold a controller it meant one player took
      // ranged damage and the other did not.
      const inArena = hazard.x >= this.cameraX + 10 && hazard.x <= this.cameraX + 790;
      if (inArena) {
        for (const target of [this.player1, this.player2]) {
          if (!target || target.hp <= 0) continue;
          if (Math.hypot(target.x - hazard.x, target.y - hazard.y) >= 48) continue;

          const isCensure = hazard.type === 'LASER_CROSS';
          this.damageEntity(target, isCensure ? 22 : 15, { isPlayer: false } as EntityState);
          target.slowTimer = isCensure ? 90 : 120;
          target.suppressedTimer = isCensure ? 240 : 180;
          this.addParticle(
            target.x,
            target.y - 70,
            0,
            isCensure ? '#d63031' : '#a29bfe',
            isCensure ? 'CENSURED!' : 'GUILT VIAL SUPPRESSED!',
            'TEXT'
          );
          hazard.active = false;
          break;
        }
      }
    });
    this.hazards = this.hazards.filter((h) => h.timer > 0 && h.active);
  }

  private createShockwave(x: number, y: number, color: string) {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      this.particles.push({
        id: 'p_' + Math.random(),
        x,
        y,
        z: 0,
        vx: Math.cos(angle) * 6,
        vy: Math.sin(angle) * 3,
        vz: 2,
        color,
        size: 6,
        life: 20,
        maxLife: 20,
        type: 'SHOCKWAVE',
      });
    }
  }

  private addParticle(x: number, y: number, z: number, color: string, text?: string, type?: ParticleEffect['type']) {
    this.particles.push({
      id: 'p_' + Math.random(),
      x,
      y,
      z,
      vx: (Math.random() - 0.5) * 2,
      vy: -2,
      vz: 1,
      color,
      size: 14,
      life: 30,
      maxLife: 30,
      text,
      type: type || 'TEXT',
    });
  }

  private updateParticles() {
    this.particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
    });
    this.particles = this.particles.filter((p) => p.life > 0);
  }
}
