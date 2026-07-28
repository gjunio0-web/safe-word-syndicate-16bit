import type { BgmTrack } from './game/bgmTracks';
export type GameScreen =
  | 'ATTRACT'
  | 'INTRO'
  | 'TITLE'
  | 'CHAR_SELECT'
  | 'DIALOGUE'
  | 'GAMEPLAY'
  | 'STAGE_CLEAR'
  | 'GAME_OVER'
  | 'VICTORY'
  | 'CODEX';

export type CharacterId = 'FEET_MASTER' | 'FUN_MAKER' | 'OMEGA_BIKER' | 'ANGRY_CORSO';

export type GameMode = 'SINGLE' | 'COOP' | 'AI_COMPANION' | 'PRACTICE';

export interface CharacterInfo {
  id: CharacterId;
  name: string;
  title: string;
  archetype: string;
  visualDesc: string;
  origin: string;
  powerMoveName: string;
  powerMoveDesc: string;
  stats: {
    speed: number;  // 1-5
    power: number;  // 1-5
    defense: number;// 1-5
    combo: number;  // 1-5
    range: number;  // 1-5
  };
  colorTheme: {
    primary: string;
    secondary: string;
    accent: string;
    glow: string;
  };
  quote: string;
  portraitUrl?: string;
}

export type EnemyType = 
  | 'PURITY_PATROL'
  | 'CONVERSION_THERAPIST'
  | 'TRAD_WIFE_STRIKER'
  | 'BOSS_MADAM_MIZYDIA'
  | 'BOSS_SAYONARA';

export interface EntityState {
  id: string;
  isPlayer: boolean;
  playerNum?: 1 | 2;
  charId?: CharacterId;
  enemyType?: EnemyType;
  
  // 3D Position in Beat 'em up plane
  x: number;       // Horizontal world coordinate
  y: number;       // Depth coordinate (ground plane height, e.g. 200 to 450)
  z: number;       // Jump / Vertical elevation above ground
  vx: number;
  vy: number;
  vz: number;
  
  facing: 'LEFT' | 'RIGHT';
  
  // Health & Meters
  hp: number;
  maxHp: number;
  powerMeter: number; // 0 to 100 for Power Move
  
  // Animation & Action state
  action: 'IDLE' | 'WALK' | 'PUNCH1' | 'PUNCH2' | 'PUNCH3' | 'KICK' | 'POWER_MOVE' | 'JUMP' | 'JUMP_ATTACK' | 'GRAB' | 'THROW' | 'HURT' | 'KNOCKDOWN' | 'RECOVERY' | 'BITING' | 'FLYING';
  actionFrame: number;
  actionTimer: number;
  invulnerableTimer: number;
  stunTimer: number;
  slowTimer: number;       // From Conversion Therapist Guilt Vials
  suppressedTimer: number; // Power Move locked
  
  // Combo & Stats tracking
  comboHits: number;
  comboTimer: number;

  // Jump & Flight state
  canDoubleJump?: boolean;
  prevJumpInput?: boolean;
  
  // Collision box dimensions
  width: number;
  height: number;
  
  // Enemy specific
  aiTargetX?: number;
  aiTargetY?: number;
  aiState?: 'PATROL' | 'APPROACH' | 'ATTACK' | 'RETREAT' | 'SPECIAL';
  aiTimer?: number;

  /**
   * Sayonara only. She is not an enemy but a hostage, so reaching zero health
   * puts her on the floor instead of killing her: the collar stops driving her
   * and she stops fighting. Striking her again from there is what kills her,
   * and that is a separate, deliberate act rather than the natural end of the
   * fight.
   */
  downed?: boolean;

  /**
   * Sayonara after the collar breaks. She is neither an enemy nor a corpse:
   * the AI must stop steering her or she turns round and resumes the fight,
   * and the wave must not wait on her.
   */
  freed?: boolean;
  
  // Boss Phase state
  bossPhase?: number;
  shieldHp?: number;
  maxShieldHp?: number;
}

export interface GroundItem {
  id: string;
  type: 'HEALTH_TACO' | 'ENERGY_DRINK' | 'WEAPON_SIGN' | 'WEAPON_SKILLET' | 'WEAPON_PEW_CHAIR';
  x: number;
  y: number;
  z: number;
  value: number;
}

export interface HazardEntity {
  id: string;
  type: 'OFFERING_DRONE' | 'ERGONOMIC_PEW' | 'LASER_CROSS';
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  timer: number;
  active: boolean;
  warning?: boolean;
}

export interface ParticleEffect {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  text?: string;
  type?: 'SPARK' | 'BLOOD' | 'FEATHER' | 'TEXT' | 'SHOCKWAVE' | 'HEAL' | 'LIGHTNING';
}

export interface StageConfig {
  id: number;
  name: string;
  subtitle: string;
  location: string;
  bgType: 'STAGE_1_NEON' | 'STAGE_2_SUBURB' | 'STAGE_3_CHURCH';
  length: number; // World width in pixels
  waves: WaveConfig[];
  /** Gameplay music for this stage. */
  musicTrack: BgmTrack;
  /**
   * Music for this stage's boss wave. Every boss in the game used to play
   * STAGE1_BOSS, a name left over from when stage one was the only stage, so
   * Sayonara in the alley and the two-boss finale in the tower sounded identical.
   */
  bossTrack: BgmTrack;
  /**
   * Marks the stage that ends the campaign. Madam Mizydia is the boss of two
   * stages, so "Mizydia died" cannot mean "the game is won" on its own.
   */
  isFinalStage?: boolean;
}

export interface WaveConfig {
  triggerX: number; // Camera position that triggers this wave
  enemies: {
    type: EnemyType;
    count: number;
    spawnSide?: 'LEFT' | 'RIGHT' | 'BOTH';
  }[];
  dialogueBefore?: DialogueLine[];
}

export interface DialogueLine {
  speaker: string;
  portrait: 'FEET_MASTER' | 'FUN_MAKER' | 'OMEGA_BIKER' | 'ANGRY_CORSO' | 'PURITY_LEADER' | 'MADAM_MIZYDIA' | 'SAYONARA';
  text: string;
  side: 'LEFT' | 'RIGHT';
}

export interface PlayerInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  punch: boolean;
  kick: boolean;
  special: boolean;
  jump: boolean;
  grab: boolean;
}

export interface GameSettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
  volume: number;
  crtFilter: boolean;
  showHitboxes: boolean;
  difficulty: 'EASY' | 'NORMAL' | 'PUNK_HARD';
}

export interface StageStats {
  score: number;
  maxCombo: number;
  enemiesDefeated: number;
  timeSeconds: number;
  damageTaken: number;
}
