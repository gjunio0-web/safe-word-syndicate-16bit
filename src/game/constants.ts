/**
 * Spatial constants for the engine.
 *
 * These used to be magic numbers scattered between `engine.ts` and
 * `stageData.ts` with no declared relationship. The camera's maximum reach is
 * derived from the stage length, and wave triggering depends on the camera
 * position, so stage design and the engine are coupled. That coupling has to
 * be explicit, or it silently breaks again.
 */

/** Canvas viewport width, in world units. */
export const VIEWPORT_WIDTH = 800;

/** How far ahead of `triggerX` a wave fires. */
export const WAVE_TRIGGER_LOOKAHEAD = 100;

/**
 * Slack required beyond the theoretical minimum.
 *
 * Without it a wave would fire on the exact frame the camera hits its limit,
 * leaving no room for rounding or for the player stopping one pixel short.
 * The margin guarantees the trigger lands while the camera is still moving.
 */
export const WAVE_TRIGGER_SAFETY_MARGIN = 100;

/** Furthest position the camera can reach in a stage. */
export function maxCameraX(stageLength: number): number {
  return stageLength - VIEWPORT_WIDTH;
}

/**
 * Largest `triggerX` still reachable in a stage of this length.
 *
 * Any wave above this never fires: the camera stops short, `currentWaveIndex`
 * never advances, and the stage becomes impossible to complete.
 */
export function maxWaveTriggerX(stageLength: number): number {
  return maxCameraX(stageLength) + WAVE_TRIGGER_LOOKAHEAD - WAVE_TRIGGER_SAFETY_MARGIN;
}

/**
 * Minimum stage length that accommodates a given `triggerX`.
 * Useful when designing a new stage: pick the triggers, derive the length.
 */
export function minStageLengthFor(triggerX: number): number {
  return triggerX + VIEWPORT_WIDTH - WAVE_TRIGGER_LOOKAHEAD + WAVE_TRIGGER_SAFETY_MARGIN;
}

/**
 * Body separation enforced by `resolveBodyCollisions`.
 *
 * These used to be a single pair applied to every entity pair. Because the
 * spacing (72px) is roughly the melee attack range (65-90px), only one enemy
 * could ever occupy the attack band; the others shoved whoever was there back
 * out of it. In waves with two or more melee enemies — which is every wave —
 * nobody ever landed a hit.
 *
 * Enemies now keep less distance from each other than from the player, so a
 * granted attacker is not ejected by the crowd behind it.
 */
export const PLAYER_BODY_SEPARATION_X = 72;
export const PLAYER_BODY_SEPARATION_Y = 27;
export const ENEMY_BODY_SEPARATION_X = 34;
export const ENEMY_BODY_SEPARATION_Y = 14;

/**
 * How far the camera trails the fighter furthest along the stage.
 *
 * The whole stage advances by this rule: waves trigger off cameraX, and the
 * camera never rewinds. Whoever is in front is steering.
 */
export const CAMERA_LEAD_X = 250;

/**
 * How close to the left edge of the view a player may be pushed.
 *
 * Nobody leaves the screen backwards. A fighter slower than the leader is
 * dragged along this edge rather than left behind, which is what caps how far
 * apart two fighters can get while the camera is rolling.
 */
export const PLAYER_CLAMP_MARGIN_X = 20;

/**
 * How many melee enemies may engage the player at once.
 *
 * Standard beat 'em up pacing: a couple of attackers commit while the rest
 * circle deliberately. Without a cap, every enemy crowds in, and the collision
 * spacing above turns the pile into a stalemate.
 *
 * Ranged enemies are exempt — keeping distance is already their behaviour.
 */
export const MAX_SIMULTANEOUS_ATTACKERS = 2;

/**
 * Attacker cap per difficulty.
 *
 * `difficulty` was written into the engine at construction and never read, so
 * the setting did nothing at all. The attack-slot system gave it something
 * honest to mean: how many enemies may engage at once is exactly the dial that
 * separates a manageable fight from an overwhelming one.
 */
export const ATTACKERS_BY_DIFFICULTY: Record<'EASY' | 'NORMAL' | 'PUNK_HARD', number> = {
  EASY: 1,
  NORMAL: MAX_SIMULTANEOUS_ATTACKERS,
  PUNK_HARD: 3,
};

/**
 * The build every ordinary fighter is cut to.
 *
 * Anyone at or under this keeps the flat, tuned spacing; anyone wider claims
 * half of their own body instead. Named rather than written as 60 in the
 * engine so the two places that mean "a normal-sized fighter" say so.
 */
export const DEFAULT_BUILD_WIDTH = 60;

/**
 * How far off the player's line a melee enemy may stand and still swing.
 *
 * Named rather than written twice in the engine — the branch that decides to
 * attack and the one that walks the enemy back into line have to agree, and
 * two literals cannot be relied on to.
 */
export const MELEE_DEPTH_WINDOW = 16;

/** Horizontal distance kept by melee enemies waiting for an attack slot. */
export const ATTACKER_STANDOFF_X = 190;

/** Tolerance around the standoff ring, so waiting enemies do not jitter. */
export const ATTACKER_STANDOFF_TOLERANCE = 30;

/**
 * Share of a body overlap absorbed by the player when colliding with an enemy.
 *
 * The correction used to be split evenly, so every adjacent enemy shoved the
 * player once per frame. Measured walking into a crowd, that cost 27% of the
 * player's speed with one enemy alongside and 50% with two or more — the
 * fighter appeared to wade through mud exactly when the fight got busy.
 *
 * Beat 'em ups resolve this by weight: the hero pushes through and the crowd
 * yields. A small non-zero share keeps contact readable without dragging.
 */
export const PLAYER_PUSH_SHARE = 0.15;

/**
 * Reach of a player kick, the longer of the two melee attacks.
 *
 * Heroes have no `attackRange` in their data — unlike enemies, their reach is a
 * constant inside the engine. Named here so the hitbox overlay can draw the
 * same number the combat code uses instead of guessing one.
 */
export const PLAYER_KICK_REACH = 135;

/**
 * Reach of a player punch, the shorter of the two melee attacks.
 *
 * Lived as a bare `110` inside `performPunchCombo`. It is named here because
 * the companion AI has to decide when a punch would land, and a policy that
 * hardcodes its own copy of the number goes stale the moment combat is tuned —
 * which is exactly how the old companion ended up with a strike gate of 45px
 * against a body separation of 72, swinging at nothing for the whole campaign.
 */
export const PLAYER_PUNCH_REACH = 110;

/**
 * Depth band the fighters may occupy.
 *
 * `STREET_TOP_Y` mirrors where `renderStageBackground` starts drawing the road:
 * `canvasHeight - 210` against a 450-tall design space. The walkable band used
 * to begin at 220, twenty pixels above that line, so a fighter who walked all
 * the way back stood on the strip between the buildings and the kerb — feet
 * planted on nothing, hovering over the edge of the road. Twenty design pixels
 * is a 46-pixel gap once the game is scaled onto a real display, which is large
 * enough to read as a bug rather than as perspective.
 *
 * The lower bound keeps a small margin above the bottom of the road so the
 * near kerb stays visible behind the closest fighter.
 */
export const STREET_TOP_Y = 240;
export const ARENA_MIN_Y = STREET_TOP_Y;
export const ARENA_MAX_Y = 440;

/**
 * Damage multiplier while Madam Mizydia is locked into a cast.
 *
 * Her standoff makes reaching her expensive: the player crosses two hundred
 * pixels with a faster enemy in the way. Without a payoff for arriving during
 * the one window she cannot move, the fight is a chase rather than a read.
 */
export const CASTING_DAMAGE_MULTIPLIER = 1.75;

/** How long a bark stays up. Long enough to read mid-fight, short enough to
 *  not still be hanging there when the next one lands. */
export const BARK_DURATION_FRAMES = 200;

/** Ceiling on the ending walk. She normally clears the screen well before
 *  this; the cap is here so a missing entity can never hang the victory. */
export const OUTRO_MAX_FRAMES = 420;

/**
 * Sayonara's rush, the first half of the Collared Rush & Bite.
 *
 * History: her data named a Heavy Knockback Tackle from the beginning and the
 * move was never built. She used the generic melee branch, so the fastest
 * fighter in the game closed to punching distance and threw a grunt's punch. A
 * charge is the shape her own description asks for, and a charge is only fair
 * if the player can see it coming, so the numbers below are a sequence rather
 * than a damage figure.
 *
 * The wind-up is the whole contract. Half a second of a dog dropping into a
 * crouch is enough time to move, and if the player does move, the recovery is
 * long enough to make her pay for committing. Shorten the telegraph and the
 * move stops being readable; shorten the recovery and there is no reward for
 * reading it.
 */
export const SAYONARA_TELEGRAPH_FRAMES = 32;
/** Frames she runs for before pulling up, hit or miss. */
export const SAYONARA_CHARGE_FRAMES = 34;
/** Frames spent skidding to a stop, unable to act. */
export const SAYONARA_RECOVER_FRAMES = 42;
/**
 * Frames before she may wind up again, counted from the end of a recovery.
 *
 * Was 72, which put a full three seconds between attempts once the wind-up,
 * the run and the recovery were added on. In play that read as a boss who was
 * mostly waiting.
 */
export const SAYONARA_CHARGE_COOLDOWN = 40;
/** Ground speed of the charge itself — roughly three times her walk. */
export const SAYONARA_CHARGE_SPEED = 8.5;
/**
 * The band she will commit from.
 *
 * Too close and there is no run-up to read; too far and she is charging at
 * where the player used to be.
 *
 * The floor is not arbitrary. Contact happens at half of each build plus a
 * little — 110px against the hero's — so committing from 135 gave a run of
 * twenty-five pixels: three frames, measured, which reads as the wind-up
 * teleporting into a hit rather than a dog crossing ground. From here the run
 * is long enough to be a run.
 */
export const SAYONARA_CHARGE_MIN_RANGE = 230;
export const SAYONARA_CHARGE_MAX_RANGE = 430;
/** Depth tolerance for a connection — a shoulder, not a laser. */
export const SAYONARA_TACKLE_DEPTH = 44;
/** What the tackle multiplies her listed power by. */
export const SAYONARA_TACKLE_DAMAGE_MULTIPLIER = 1.6;
/** Horizontal launch on a connection, against a grunt's punch of nine. */
export const SAYONARA_TACKLE_KNOCKBACK = 22;
/** Frames the player spends on the floor afterwards. */
export const SAYONARA_TACKLE_KNOCKDOWN_FRAMES = 46;


/**
 * The bite, for when there is no room to run.
 *
 * The charge needs two hundred pixels of ground and she had no answer without
 * them, so a player who simply walked into her switched her off: cornered
 * against the arena edge with someone standing on her, she spent nine hundred
 * frames in the approach state and dealt nothing at all. That was documented
 * as counter-play — give up the ground, deny the tackle — but against a wall
 * there is no ground left to give, and the trade stopped being a trade.
 *
 * She now fights at close quarters instead of retreating out of them. It is a
 * smaller hit than the tackle and it puts the player down for half as long,
 * because the charge has to stay the thing worth being afraid of.
 */
export const SAYONARA_BITE_FRAMES = 25;
/** Frames between bites, on top of the bite itself. */
export const SAYONARA_BITE_COOLDOWN = 26;
/** How far the jaws reach, measured from body centre to body centre. */
export const SAYONARA_BITE_RANGE = 125;
/** Frames the player spends down — against 46 for the tackle. */
export const SAYONARA_BITE_KNOCKDOWN_FRAMES = 24;
/** Horizontal shove from a bite, against 22 for the tackle. */
export const SAYONARA_BITE_KNOCKBACK = 11;

/**
 * How long she will try to buy herself a run-up before giving up on it.
 *
 * Retreating only works if the ground is actually being gained. A player who
 * simply walks after her keeps pace, so without a limit she backs away for the
 * whole fight and never fights: measured at one bite and no charges across
 * fifteen seconds of being chased, which is the same boss-with-an-off-switch
 * the bite was added to fix, wearing a different hat.
 */
export const SAYONARA_RETREAT_PATIENCE = 60;
/**
 * How long a hit keeps her in the fight rather than looking for a run-up.
 *
 * Backing away is the right answer to being followed and the wrong one to
 * being hit: ground bought from a player who is chasing gets her the charge,
 * ground bought from a player who is swinging is just taking the hits while
 * facing away. A second and a half of memory means a player who keeps landing
 * blows keeps her at close quarters, and one who stops gives her the room
 * back.
 */
export const SAYONARA_PRESSURE_MEMORY = 90;

/**
 * How long a power move owns the fighter.
 *
 * The number is not new — it is the `actionTimer` the move has always been
 * given. It is declared here because the active window below is measured
 * against it, and two frame counts that have to agree should not be a
 * literal in one file and a literal in another.
 */
export const POWER_MOVE_FRAMES = 45;

/**
 * How many of those frames the move can still connect for.
 *
 * A super used to resolve entirely on the frame it was pressed: one pass over
 * the entity list, then forty-four frames of animation with no hitbox behind
 * it. Every verb in the roster's own descriptions — dragging enemies into a
 * cyclone, pinning one down to bite it, sweeping the ones nearby — needs
 * duration to be true, and a crowd that walks into the swing halfway through
 * should be swept up by it.
 *
 * Each fighter is still hit at most once per activation, so this widens who
 * the move catches without changing what it costs any single body. The
 * remaining twenty frames are recovery: committed, no longer dangerous.
 */
export const POWER_MOVE_ACTIVE_FRAMES = 25;

/**
 * How long a fallen fighter takes to reach the ground.
 *
 * A player who ran out of health used to be left exactly as the fatal hit
 * found them: `HURT` for eighteen frames, then back to `IDLE`, standing.
 * Nothing removed them either — the filter that clears bodies from the arena
 * excluded `isPlayer` by name — and the clamp that keeps players inside the
 * viewport has no health check, so the corpse was dragged along at the screen's
 * left margin, on its feet, for the rest of the stage. Measured: still in
 * `entities` at frame 900, pose `IDLE`, screen x pinned at
 * PLAYER_CLAMP_MARGIN_X, while an enemy killed in the same run left after 18.
 */
export const PLAYER_KO_FALL_FRAMES = 18;

/** Frames the body lies there before it is taken off the field. */
export const PLAYER_KO_LINGER_FRAMES = 72;

/**
 * The whole life of a body, from the fatal hit to removal.
 *
 * Long enough to be read as "your partner is down" rather than as a fighter
 * blinking out of existence, and short enough that the arena is clear again
 * before the next wave arrives.
 */
export const PLAYER_KO_FRAMES = PLAYER_KO_FALL_FRAMES + PLAYER_KO_LINGER_FRAMES;
