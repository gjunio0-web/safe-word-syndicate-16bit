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
import { CHARACTERS, ENEMIES } from './characterData';
import {
  maxCameraX,
  maxWaveTriggerX,
  WAVE_TRIGGER_LOOKAHEAD,
  PLAYER_BODY_SEPARATION_X,
  PLAYER_BODY_SEPARATION_Y,
  ENEMY_BODY_SEPARATION_X,
  ENEMY_BODY_SEPARATION_Y,
  PLAYER_PUSH_SHARE,
  ATTACKERS_BY_DIFFICULTY,
  ATTACKER_STANDOFF_X,
  ATTACKER_STANDOFF_TOLERANCE,
} from './constants';
import { sound } from './sound';

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

  public stageStartBannerTimer: number = 210;
  public bossWarningTimer: number = 0;
  public bossWarningTitle: string = '';
  private _activeDialogue: import('../types').DialogueLine[] | null = null;
  private dialogueListeners: Set<() => void> = new Set();

  private hudSnapshot: HudSnapshot;
  private hudListeners: Set<() => void> = new Set();

  /** Ids of the melee enemies currently allowed to engage. */
  private attackSlots: Set<string> = new Set();
  private shownWaveDialogues: Set<number> = new Set();

  public player1: EntityState | null = null;
  public player2: EntityState | null = null;

  public stats: StageStats = {
    score: 0,
    maxCombo: 0,
    enemiesDefeated: 0,
    timeSeconds: 0,
    damageTaken: 0,
  };

  private frameCount: number = 0;
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
      prev.stageCleared === next.stageCleared;

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

  constructor(
    stage: StageConfig,
    p1Char: CharacterId,
    p2Char?: CharacterId,
    settings?: GameSettings
  ) {
    this.stage = stage;
    this.settings = settings || {
      soundEnabled: true,
      musicEnabled: true,
      volume: 0.5,
      crtFilter: true,
      showHitboxes: false,
      difficulty: 'NORMAL',
    };

    this.stageStartBannerTimer = 90;
    if (stage.waves[0]?.dialogueBefore) {
      this.setActiveDialogue(stage.waves[0].dialogueBefore);
      this.shownWaveDialogues.add(0);
    }

    // Spawn Player 1
    this.player1 = this.createPlayerEntity('p1', 1, p1Char, 100, 300);
    this.entities.push(this.player1);

    // Spawn Player 2 or AI Companion if requested
    if (p2Char) {
      this.player2 = this.createPlayerEntity('p2', 2, p2Char, 80, 340);
      this.entities.push(this.player2);
    }

    // Trigger stage background music
    if (stage.id === 1) {
      sound.playBgm('STAGE1');
    } else {
      sound.playBgm(stage.musicTrack);
    }

    this.hudSnapshot = this.buildHudSnapshot();
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
      width: isBoss ? 105 : 60,
      height: isBoss ? 150 : 120,
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

    this.frameCount++;
    if (this.frameCount % 60 === 0) {
      this.stats.timeSeconds++;
    }

    if (this.stageStartBannerTimer > 0) {
      this.stageStartBannerTimer--;
    }
    if (this.bossWarningTimer > 0) {
      this.bossWarningTimer--;
    }

    // Check wave triggers based on camera position
    this.updateWaveTriggers();

    // Update Player 1
    if (this.player1 && this.player1.hp > 0) {
      this.updatePlayer(this.player1, p1Input);
    } else if (this.player1 && this.player1.hp <= 0 && (!this.player2 || this.player2.hp <= 0)) {
      this.gameOver = true;
    }

    // Update Player 2 / AI
    if (this.player2 && this.player2.hp > 0) {
      if (p2Input) {
        this.updatePlayer(this.player2, p2Input);
      } else {
        this.updateAiCompanion(this.player2);
      }
    }

    // Update Camera position
    let leadX = this.player1?.x || 100;
    if (this.player2 && this.player2.hp > 0 && this.player1) {
      leadX = Math.max(this.player1.x, this.player2.x);
    }
    const targetCameraX = Math.max(this.cameraX, leadX - 250);

    // Limit camera scrolling during locked wave battles
    if (this.isWaveActive) {
      const currentWave = this.stage.waves[this.currentWaveIndex];
      const maxCamX = this.effectiveTriggerX(currentWave) - 50;
      this.cameraX = Math.min(targetCameraX, maxCamX);
    } else {
      this.cameraX = Math.min(targetCameraX, maxCameraX(this.stage.length));
    }

    // Keep players inside camera viewport bounds
    this.entities.forEach((ent) => {
      if (ent.isPlayer) {
        ent.x = Math.max(this.cameraX + 20, Math.min(this.cameraX + 760, ent.x));
        ent.y = Math.max(220, Math.min(440, ent.y)); // Y depth bounds
      } else if (ent.hp > 0) {
        // Enforce hard arena boundaries for active enemies: pull inside if knocked/pushed too far out
        const minX = this.cameraX - 30;
        const maxX = this.cameraX + 830;
        if (ent.x < minX) {
          ent.x = minX + 60;
          ent.vx = 4;
        } else if (ent.x > maxX) {
          ent.x = maxX - 60;
          ent.vx = -4;
        }
        ent.y = Math.max(220, Math.min(440, ent.y));
      }
    });

    // Grant attack slots before the AI runs, so each enemy knows this frame
    // whether it is engaging or waiting.
    this.updateAttackSlots();

    // Update Enemies & AI
    this.entities.forEach((ent) => {
      if (!ent.isPlayer && ent.hp > 0) {
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

    // Remove dead non-boss enemies after animation
    // Keep the corpse only while its death animation still has frames left.
    // The condition used to be `actionTimer < 60`, which is always true for a
    // corpse — death sets actionTimer to 18 and it counts down to 0 — so the
    // filter preserved exactly what it was meant to discard. Bodies piled up
    // in the arena and kept being drawn.
    this.entities = this.entities.filter((ent) => ent.isPlayer || ent.hp > 0 || ent.actionTimer > 0);

    // Check wave clear status
    const remainingEnemies = this.entities.filter((ent) => !ent.isPlayer && ent.hp > 0);
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

  /** Player the enemies are currently converging on. */
  private currentTarget(): EntityState | null {
    if (this.player1 && this.player1.hp > 0) return this.player1;
    if (this.player2 && this.player2.hp > 0) return this.player2;
    return null;
  }

  private isMelee(enemy: EntityState): boolean {
    return enemy.enemyType !== 'CONVERSION_THERAPIST';
  }

  /**
   * Hands out the attack slots, closest melee enemy first.
   *
   * Holders keep their slot while alive, so an engaged enemy is not swapped out
   * mid-swing. Everyone else waits on the standoff ring in `updateEnemyAi`.
   */
  private updateAttackSlots() {
    for (const id of this.attackSlots) {
      const holder = this.entities.find((e) => e.id === id);
      if (!holder || holder.hp <= 0) this.attackSlots.delete(id);
    }

    const free = ATTACKERS_BY_DIFFICULTY[this.settings.difficulty] - this.attackSlots.size;
    if (free <= 0) return;

    const target = this.currentTarget();
    if (!target) return;

    this.entities
      .filter((e) => !e.isPlayer && e.hp > 0 && this.isMelee(e) && !this.attackSlots.has(e.id))
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
        this.setActiveDialogue(wave.dialogueBefore);
        this.shownWaveDialogues.add(this.currentWaveIndex);
        return; // wait until dialogue is dismissed before spawning enemies
      }

      this.isWaveActive = true;
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

      const hasBoss = wave.enemies.some((e) => e.type.startsWith('BOSS'));
      const isFinalWave = this.currentWaveIndex === this.stage.waves.length - 1;

      if (hasBoss || isFinalWave) {
        sound.playBossAlarm();
        if (hasBoss) {
          sound.playBgm('STAGE1_BOSS');
          this.bossWarningTitle = '⚠️ BOSS ENCOUNTER: DESTROY THE PURITY LEADERS ⚠️';
        } else {
          this.bossWarningTitle = '⚠️ WARNING: HEAVY ENEMY SURGE ⚠️';
        }
        this.bossWarningTimer = 180; // 3 second banner
      }
    }
  }

  private updatePlayer(player: EntityState, input: PlayerInput) {
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

    const moveSpeed = player.slowTimer > 0 ? 1.5 : CHARACTERS[player.charId!].stats.speed * 0.9 + 2;

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
        const minDx = betweenEnemies ? ENEMY_BODY_SEPARATION_X : PLAYER_BODY_SEPARATION_X;
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
    const reach = 110;
    this.entities.forEach((target) => {
      if (!target.isPlayer && target.hp > 0 && Math.abs(target.y - player.y) < 55) {
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

    const reach = 135;
    this.entities.forEach((target) => {
      if (!target.isPlayer && target.hp > 0 && Math.abs(target.y - player.y) < 60) {
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
    player.actionTimer = 45;
    player.invulnerableTimer = 40;

    sound.playSpecial(sound.calculatePan(player.x, this.cameraX));

    const charId = player.charId!;

    if (charId === 'FEET_MASTER') {
      // Feet Master: Human Bat Swing (Massive 360 AoE)
      this.entities.forEach((target) => {
        if (!target.isPlayer && target.hp > 0 && Math.hypot(target.x - player.x, target.y - player.y) < 200) {
          this.damageEntity(target, 45, player);
          target.vx = target.x > player.x ? 12 : -12;
          target.vz = 6;
        }
      });
      this.createShockwave(player.x, player.y, '#f5a623');

    } else if (charId === 'FUN_MAKER') {
      // Fun Maker: Rollercoaster Hurricane (Spin skyward cyclone)
      player.vz = 10;
      this.entities.forEach((target) => {
        if (!target.isPlayer && target.hp > 0 && Math.hypot(target.x - player.x, target.y - player.y) < 180) {
          this.damageEntity(target, 40, player);
          target.vz = 9; // Juggle enemies into the air!
        }
      });
      this.createShockwave(player.x, player.y, '#e2b036');

    } else if (charId === 'OMEGA_BIKER') {
      // Omega Biker: Heavy Shockwave Kick (Destroys shields & heavy knockback)
      const shockDir = player.facing === 'RIGHT' ? 1 : -1;
      this.entities.forEach((target) => {
        if (!target.isPlayer && target.hp > 0 && Math.abs(target.y - player.y) < 60) {
          if ((shockDir === 1 && target.x > player.x) || (shockDir === -1 && target.x < player.x)) {
            if (target.shieldHp) target.shieldHp = 0; // Guard breaker!
            this.damageEntity(target, 50, player);
            target.vx = shockDir * 18; // Massive screen kick
          }
        }
      });
      this.createShockwave(player.x + shockDir * 60, player.y, '#ff3b30');

    } else if (charId === 'ANGRY_CORSO') {
      // Angry Corso: Feral Pup Rush & Bite (Pin down, bite, leech health!)
      player.action = 'BITING';
      sound.playBite();
      this.entities.forEach((target) => {
        if (!target.isPlayer && target.hp > 0 && Math.hypot(target.x - player.x, target.y - player.y) < 150) {
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

    // Check Boss Sayonara Defeat Resolution
    if (target.enemyType === 'BOSS_MADAM_MIZYDIA' && target.hp <= 0) {
      // Mizydia is the boss of stage 2 as well, where the fiction calls her a
      // hologram. Without this gate, beating her there set bossDefeated and the
      // campaign ended two stages early — the final stage was unreachable.
      if (this.stage.isFinalStage) {
        this.bossDefeated = true;
      }
      // Free Sayonara!
      const sayonara = this.entities.find((e) => e.enemyType === 'BOSS_SAYONARA');
      if (sayonara) {
        sayonara.action = 'WALK';
        sayonara.facing = 'RIGHT';
        sayonara.vx = 4; // Sayonara breaks control and walks away freely!
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

    if (isOffScreen) {
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

      const castChance = enraged ? 0.03 : 0.016;
      if (dist < info.attackRange && enemy.actionTimer === 0 && Math.random() < castChance) {
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
      const idealRange = Math.max(75, info.attackRange);

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

  private updateAiCompanion(companion: EntityState) {
    if (companion.action !== 'IDLE' && companion.action !== 'WALK') {
      return;
    }

    const enemy = this.entities.find((e) => !e.isPlayer && e.hp > 0);
    if (enemy) {
      const dx = enemy.x - companion.x;
      const dy = enemy.y - companion.y;
      const dist = Math.hypot(dx, dy);

      companion.facing = dx > 0 ? 'RIGHT' : 'LEFT';
      if (dist > 45) {
        companion.vx = (dx / dist) * 3;
        companion.vy = (dy / dist) * 2;
        companion.action = 'WALK';
      } else {
        companion.vx = 0;
        companion.vy = 0;
        companion.action = 'IDLE';
        if (companion.actionTimer === 0) {
          this.performPunchCombo(companion);
        }
      }
    } else {
      companion.vx = 0;
      companion.vy = 0;
      companion.action = 'IDLE';
    }
  }

  private updateEntityPhysics(ent: EntityState) {
    ent.x += ent.vx;
    ent.y += ent.vy;

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
