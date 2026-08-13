import { EntityState, CharacterId, EnemyType } from '../types';
import { CHARACTERS } from './characterData';
import { POWER_MOVE_FRAMES, PLAYER_KO_FALL_FRAMES, PLAYER_KO_FRAMES } from './constants';
import feetMasterImg from '../assets/images/feet_master_portrait.webp';
import funMakerImg from '../assets/images/fun_maker_portrait.webp';
import omegaBikerImg from '../assets/images/omega_biker_portrait.webp';
import angryCorsoImg from '../assets/images/angry_corso_portrait.webp';

// Pre-cached Roster Portrait Images for In-Game Cut-Ins
const portraitImages: Partial<Record<CharacterId, HTMLImageElement>> = {};

if (typeof window !== 'undefined') {
  const loadPortrait = (id: CharacterId, src: string) => {
    const img = new Image();
    img.src = src;
    portraitImages[id] = img;
  };
  loadPortrait('FEET_MASTER', feetMasterImg);
  loadPortrait('FUN_MAKER', funMakerImg);
  loadPortrait('OMEGA_BIKER', omegaBikerImg);
  loadPortrait('ANGRY_CORSO', angryCorsoImg);
}

// ============================================================================
// 16-BIT HIGH-FIDELITY ARCADE CHARACTER & ENEMY SPRITE RENDERER
// Realistic grounded walking physics, articulated leg steps, arm swinging,
// un-obscured face visuals & arcade P1 overhead indicator.
// ============================================================================

export function renderEntitySprite(
  ctx: CanvasRenderingContext2D,
  entity: EntityState,
  renderX: number,
  renderY: number,
  simTimeMs: number
) {
  ctx.save();
  ctx.translate(renderX, renderY);
  // Scale characters to 1.5x their original size
  ctx.scale(1.5, 1.5);

  // The ground shadow used to be drawn here as well as in GameCanvas — two
  // shadows per entity every frame. This one also claimed to be glued to the
  // ground while sitting inside a transform translated by `entity.y - entity.z`,
  // so it climbed with the jump. GameCanvas keeps the one at ground level and
  // took over the height scaling.

  // 2. Facing Direction Flip
  if (entity.facing === 'LEFT') {
    ctx.scale(-1, 1);
  }

  // 3. Invulnerability / Damage Flashing Effect
  //
  // simTimeMs comes from the engine's step count, not Date.now(). This flash,
  // the walk cycle, and every other animation in this file used to run on
  // the system clock regardless of whether the game was actually stepping —
  // pausing the simulation left a knocked-back fighter flickering and the
  // ground still scrolling. Deriving animation time from the same clock that
  // gates simulation means freezing one freezes both.
  if (entity.invulnerableTimer > 0 && Math.floor(simTimeMs / 60) % 2 === 0) {
    ctx.globalAlpha = 0.45;
  }

  // 4. Slow Debuff Purple Aura
  if (entity.slowTimer > 0) {
    ctx.fillStyle = 'rgba(162, 155, 254, 0.35)';
    ctx.beginPath();
    ctx.arc(0, -entity.height / 2, entity.width / 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. Power Move Cut-In Banner with Full Roster Portrait Artwork
  if (entity.isPlayer && entity.charId && isPowerMovePose(entity.action)) {
    renderPowerMoveCutIn(ctx, entity.charId, entity.facing);
  }

  // 6. Motion Trail After-Images for Special Moves & Heavy Attacks
  if (isPowerMovePose(entity.action) || entity.action === 'KICK') {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.translate(-18, 0);
    if (entity.isPlayer && entity.charId) {
      renderPlayerSprite(ctx, entity.charId, entity, simTimeMs);
    }
    ctx.restore();
  }

  // 7. Main Sprite Rendering
  if (entity.isPlayer && entity.charId) {
    /*
     * Going down.
     *
     * One transform rather than a fallen pose drawn four times: every hero is
     * built from the same standing skeleton in the switch below, and rotating
     * that skeleton about the feet lays it out on the ground for all of them.
     * A hand-drawn corpse per fighter would read better and is four times the
     * surface to keep in step with every future change to the roster's art —
     * this is the honest trade, not the ideal one.
     *
     * The pivot is the origin, which is where the feet are: the sprite is
     * drawn upward in negative y. Rotating by a quarter turn towards negative
     * x therefore drops the head *behind* the fighter, and since the facing
     * flip is already applied above, falling backwards is automatic in both
     * directions.
     *
     * The last stretch fades, so the body is gone before the engine takes it
     * off the field rather than blinking out at full opacity.
     */
    if (entity.action === 'KO') {
      const remaining = Math.max(0, Math.min(1, entity.actionTimer / PLAYER_KO_FRAMES));
      const fallen = Math.min(1, (1 - remaining) * (PLAYER_KO_FRAMES / PLAYER_KO_FALL_FRAMES));
      // Eased so the fall accelerates into the ground instead of sweeping
      // round at a constant rate, which reads as a hinge rather than a fall.
      const tipped = fallen * fallen;
      ctx.rotate(-tipped * Math.PI * 0.5);
      const fadeFrames = PLAYER_KO_FRAMES * 0.2;
      if (entity.actionTimer < fadeFrames) {
        ctx.globalAlpha *= Math.max(0, entity.actionTimer / fadeFrames);
      }
    }
    renderPlayerSprite(ctx, entity.charId, entity, simTimeMs);
    // Unobtrusive Arcade Player Arrow Indicator high above head (never covers face!)
    // Not over a body: the arrow says "this one is yours to drive".
    if (entity.action !== 'KO') renderPlayerIndicator(ctx, entity);
  } else if (entity.enemyType) {
    renderEnemySprite(ctx, entity.enemyType, entity, simTimeMs);
    // Render Overhead Arcade Health Bar for Enemies
    renderEnemyHealthBar(ctx, entity);
  }

  ctx.restore();
}

/**
 * Whether this pose is a hero's super.
 *
 * Angry Corso's is filed under BITING rather than POWER_MOVE — the engine
 * overwrites the action so his bite reads as its own animation — and both the
 * cut-in banner and the motion trail used to ask for POWER_MOVE by name. The
 * result was that the one hero whose super moves him nowhere was also the one
 * who never got the banner announcing it.
 */
export function isPowerMovePose(action: EntityState['action']): boolean {
  return action === 'POWER_MOVE' || action === 'BITING';
}

/**
 * How far off the ground Angry Corso's pounce has carried him, in sprite units.
 *
 * His super is the only one in the roster that promises a jump — leaps over
 * the target, pins it, bites — and the engine deliberately does not give him
 * one: the move is a radius around where he already stands, and putting real
 * height on him would change who it catches. So the leap lives here, in the
 * drawing only, and the hitbox stays exactly where it was.
 *
 * Up over the first third and down across the rest, landing at zero on the
 * final frame so the pose hands back to idle without a step.
 */
function pounceHeight(phase: number): number {
  const rise = phase < 1 / 3 ? phase * 3 : 1 - (phase - 1 / 3) * 1.5;
  return Math.max(0, rise) * 44;
}

// ----------------------------------------------------------------------------
// POWER MOVE ROSTER PORTRAIT CUT-IN BANNER (Arcade Super Attack Flash)
// ----------------------------------------------------------------------------

function renderPowerMoveCutIn(
  ctx: CanvasRenderingContext2D,
  charId: CharacterId,
  facing: EntityState['facing']
) {
  const img = portraitImages[charId];
  if (!img || !img.complete) return;

  ctx.save();

  // Undo the sprite's facing flip. This banner is interface, not part of the
  // body: without this its two labels render mirrored whenever the fighter
  // faces left. renderPlayerIndicator and renderEnemyHealthBar already do the
  // same counter-scale; this one and the picket sign were missed.
  if (facing === 'LEFT') {
    ctx.scale(-1, 1);
  }
  // Floats high above the character head (y = -145) to prevent obscuring facial features
  ctx.translate(0, -145);

  // Background Banner Box
  ctx.fillStyle = 'rgba(10, 10, 15, 0.85)';
  ctx.fillRect(-120, -50, 240, 60);

  // Theme Colors
  //
  // Read from the roster rather than restated here. The four literals this
  // replaces were a fifth palette in a game that already had four: the banner
  // announced Omega Biker in yellow while everything else about him is the red
  // of a brake light.
  const borderCol = CHARACTERS[charId].colorTheme.accent;

  ctx.strokeStyle = borderCol;
  ctx.lineWidth = 3;
  ctx.strokeRect(-120, -50, 240, 60);

  // Portrait Cutout Image
  ctx.save();
  ctx.beginPath();
  ctx.arc(-80, -20, 24, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, -104, -44, 48, 48);
  ctx.restore();

  // Portrait Ring
  ctx.beginPath();
  ctx.arc(-80, -20, 24, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // OVERDRIVE text
  ctx.fillStyle = borderCol;
  // 'black' is not a valid weight in the CSS font shorthand, so the whole
  // assignment was discarded and the banner's own headline fell back to the
  // canvas default of 10px sans-serif -- the same bug the damage numbers had.
  ctx.font = '900 12px monospace';
  ctx.fillText('OVERDRIVE SPECIAL!', -45, -28);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('ROSTER POWER MOVE', -45, -12);

  ctx.restore();
}

// ----------------------------------------------------------------------------
// CLEAN ARCADE PLAYER INDICATOR (Floats high above character head, keeping face 100% visible)
// ----------------------------------------------------------------------------

/**
 * Player badge above the head.
 *
 * `playerNum` was already on EntityState and already set correctly by the
 * engine, but nothing read it: this function hardcoded '1P' and ran for every
 * entity with isPlayer, so the second fighter was labelled as the first.
 *
 * Colour follows arcade convention — yellow for 1P, cyan for 2P — so the two
 * are distinguishable in a crowd without reading the text.
 */
function renderPlayerIndicator(ctx: CanvasRenderingContext2D, entity: EntityState) {
  // Spaced at y = -entity.height - 45 so badge & arrow sit completely above tall hair & helmets
  const indicatorY = -entity.height - 45;

  const playerNum = entity.playerNum ?? 1;
  const label = `${playerNum}P`;
  const badgeColor = playerNum === 2 ? '#22d3ee' : '#facc15';

  ctx.save();
  ctx.translate(0, indicatorY);

  // Counter-scale if flipped so text stays readable
  if (entity.facing === 'LEFT') {
    ctx.scale(-1, 1);
  }

  // Arcade Arrow
  ctx.fillStyle = badgeColor;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-7, -8);
  ctx.lineTo(7, -8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Player Badge Box
  ctx.fillStyle = badgeColor;
  ctx.fillRect(-10, -18, 20, 10);
  ctx.strokeStyle = '#000000';
  ctx.strokeRect(-10, -18, 20, 10);

  ctx.fillStyle = '#000000';
  ctx.font = '900 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 0, -10);

  ctx.restore();
}

// ----------------------------------------------------------------------------
// ARCADE OVERHEAD ENEMY HEALTH BAR & NAME BADGE
// ----------------------------------------------------------------------------

function renderEnemyHealthBar(ctx: CanvasRenderingContext2D, entity: EntityState) {
  if (entity.hp <= 0) return;

  // Position high above character head so it never obscures facial features
  const barY = -entity.height - 25;
  const isBoss = entity.enemyType?.startsWith('BOSS');
  const barWidth = isBoss ? 56 : 42;
  const barHeight = isBoss ? 6 : 5;

  ctx.save();
  ctx.translate(0, barY);

  // Counter-scale if entity is flipped left so text and health bar draw normally
  if (entity.facing === 'LEFT') {
    ctx.scale(-1, 1);
  }

  const hpRatio = Math.max(0, Math.min(1, entity.hp / entity.maxHp));

  // Enemy Name Label
  let enemyName = 'TARGET';
  if (entity.enemyType === 'PURITY_PATROL') enemyName = 'PURITY PATROL';
  else if (entity.enemyType === 'TRAD_WIFE_STRIKER') enemyName = 'TRAD-WIFE';
  else if (entity.enemyType === 'CONVERSION_THERAPIST') enemyName = 'THERAPIST';
  else if (entity.enemyType === 'BOSS_MADAM_MIZYDIA') enemyName = 'MADAM MIZYDIA';
  else if (entity.enemyType === 'BOSS_SAYONARA') enemyName = 'SAYONARA';

  ctx.fillStyle = isBoss ? '#ff4d4d' : '#f3f4f6';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 4;
  ctx.fillText(enemyName, 0, -6);

  // Health Bar Frame Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillRect(-barWidth / 2 - 1, -1, barWidth + 2, barHeight + 2);

  // Border Frame
  ctx.strokeStyle = isBoss ? '#ff0055' : '#374151';
  ctx.lineWidth = 1;
  ctx.strokeRect(-barWidth / 2 - 1, -1, barWidth + 2, barHeight + 2);

  // Health Bar Fill
  let fillColor = '#ef4444'; // Red
  if (hpRatio > 0.5) fillColor = '#f59e0b'; // Amber
  if (hpRatio > 0.75) fillColor = '#10b981'; // Emerald Green
  if (isBoss) fillColor = '#e11d48'; // Boss crimson

  ctx.fillStyle = fillColor;
  ctx.fillRect(-barWidth / 2, 0, barWidth * hpRatio, barHeight);

  // Boss Shield Bar overlay
  if (entity.shieldHp && entity.shieldHp > 0) {
    const shieldMax = 100;
    const shieldRatio = Math.max(0, Math.min(1, entity.shieldHp / shieldMax));
    ctx.fillStyle = '#06b6d4'; // Cyan Barrier
    ctx.fillRect(-barWidth / 2, barHeight + 2, barWidth * shieldRatio, 3);
  }

  ctx.restore();
}

// ----------------------------------------------------------------------------
// PLAYER SPRITES (FEET MASTER, FUN MAKER, OMEGA BIKER, ANGRY CORSO)
// Articulated leg-stepping walk cycles with foot lifts & knee bends
// ----------------------------------------------------------------------------

/**
 * Per-hero outline colour.
 *
 * The outline used to be #090812 for everyone — luminance 9, effectively
 * black. An outline exists to guarantee separation whatever is behind it, and
 * a black one only does that over a light background. Measured against the
 * three stage backgrounds, Omega Biker cleared his by 12 of 255 and Feet
 * Master cleared Suburbia by 0.3: the silhouettes dissolved.
 *
 * The previous set sat around luminance 105 and was chosen as a compromise
 * across all three stages. Re-measured against the stages' area colours only —
 * sky, buildings, ground, with the few-pixel accent neons excluded — that
 * compromise turned out to be the worst of both: Suburbia's mid-greys sit at
 * luminance 99-152, so an outline at 105 cleared its nearest backdrop by 1.
 * The silhouette held over the two dark stages and vanished over the pale one.
 *
 * Suburbia's area colours leave two gaps, around luminance 168 and 206. These
 * values land in them, which also puts them 79-181 clear of the dark stages.
 * Worst-case separation per hero went from 1-9 to 10-22.
 *
 * The hues follow the character portraits, so the line reinforces identity
 * instead of looking like a generic halo. Magenta and cyan are deliberately
 * kept off the low-luminance end: they are the two most common neon hues in
 * the Neon Nightlife District, and a dim outline in either disappears there.
 *
 * Enemies keep the near-black outline on purpose: the heroes should be the
 * things that pop out of a crowd.
 */
/**
 * Stroke for anything drawn on top of the body.
 *
 * `HERO_OUTLINE` is set once before the character switch, so every stroke that
 * follows inherits it — including the ones that trace shapes sitting inside the
 * silhouette. A shirt drawn as its own shape has a top and a bottom edge, and
 * both fall in the middle of the figure: they showed as two glowing bands
 * across the chest. Same for the beard, the pec contours and the muzzle.
 *
 * The tint belongs to the parts that form the outer edge — limbs, head, boots,
 * hair. Everything layered over them uses this instead.
 */
const DETAIL_STROKE = '#141118';

const HERO_OUTLINE: Record<CharacterId, string> = {
  FEET_MASTER: '#e8a83e',  // Amber, from the specs glint and belt buckle
  FUN_MAKER: '#ff86e4',    // Hot pink, from the portrait's aura
  OMEGA_BIKER: '#ff9a45',  // Orange, from the armour's energy lines
  ANGRY_CORSO: '#56ff47',  // Acid green, sampled from the portrait's aura (hue 115°)
};

function renderPlayerSprite(
  ctx: CanvasRenderingContext2D,
  charId: CharacterId,
  entity: EntityState,
  simTimeMs: number
) {
  const isPunch = entity.action === 'PUNCH1' || entity.action === 'PUNCH2' || entity.action === 'PUNCH3';
  const isKick = entity.action === 'KICK';
  const isSpecial = entity.action === 'POWER_MOVE';
  const isBiting = entity.action === 'BITING';
  const isJumping = entity.z > 0;

  /**
   * How far through a super this frame is: 0 on the frame it commits, 1 as the
   * animation runs out.
   *
   * Every hero used to hold its idle stance for the whole forty-five frames,
   * with the aura circle doing all the work. The roster promises a whirlwind,
   * a corkscrew, an armoured kick and a pounce, and a body that never leaves
   * its standing pose delivers none of them. Driven by `actionTimer` rather
   * than simulated time so the pose is a function of the move's own progress:
   * pausing holds it, and two fighters mid-super are each at their own point.
   */
  const specialPhase =
    isSpecial || isBiting
      ? 1 - Math.max(0, Math.min(1, entity.actionTimer / POWER_MOVE_FRAMES))
      : 0;
  const isHurt = entity.action === 'HURT' || entity.action === 'KNOCKDOWN';

  // WALKING & GROUNDED MOTION CALCULATIONS
  const isMoving = (entity.action === 'WALK' || Math.abs(entity.vx) > 0.1 || Math.abs(entity.vy) > 0.1) && !isJumping && !isHurt;

  let stepPhase = 0;
  let stride1 = 0;
  let stride2 = 0;
  let lift1 = 0;
  let lift2 = 0;
  let armSwing = 0;
  let bodyY = 0;

  if (isMoving) {
    const stepTime = simTimeMs / 80;
    stepPhase = Math.sin(stepTime);
    stride1 = stepPhase * 14;              // Back leg horizontal stride
    stride2 = -stepPhase * 14;             // Front leg horizontal stride
    lift1 = Math.max(0, -stepPhase) * 9;   // Back foot lifts off ground during step
    lift2 = Math.max(0, stepPhase) * 9;    // Front foot lifts off ground during step
    armSwing = stepPhase * 12;             // Natural arm swinging in opposition
    bodyY = Math.abs(Math.sin(stepTime * 2)) * -3; // Ground step weight-transfer bounce
  } else {
    // Idle stance: rock-solid planted feet and stationary hips
    bodyY = 0;
  }

  // Crisp 16-Bit Arcade Dark Outline
  const outline = HERO_OUTLINE[charId] ?? '#090812';
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  switch (charId) {
    case 'FEET_MASTER': {
      // FEET MASTER: Brown styled pompadour hair, full brown beard, specs with blue glint, fitted black tee, denim jeans, combat boots
      ctx.save();
      if (isHurt) ctx.rotate(0.2);

      // Human Bat Swing: two full turns about the hips over the animation.
      //
      // Pivoted at the waist rather than the feet, because a whirlwind that
      // rotates about the soles reads as a body tipping over rather than one
      // spinning in place.
      if (isSpecial) {
        ctx.translate(0, -42);
        ctx.rotate(specialPhase * Math.PI * 4);
        ctx.translate(0, 42);
      }

      // Special Aura Energy Burst
      if (isSpecial) {
        const auraGrad = ctx.createRadialGradient(0, -42, 10, 0, -42, 70);
        auraGrad.addColorStop(0, 'rgba(0, 255, 255, 0.8)');
        auraGrad.addColorStop(0.6, 'rgba(255, 159, 67, 0.4)');
        auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(0, -42, 70, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, -42, 55 + Math.sin(simTimeMs / 50) * 8, 0, Math.PI * 2);
        ctx.stroke();

        // The swept edge of the swing, trailing the arms.
        ctx.strokeStyle = 'rgba(245, 166, 35, 0.9)';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.arc(0, -60, 62, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();

        // Effects own their own stroke; the body does not inherit it.
        ctx.strokeStyle = outline;
        ctx.lineWidth = 2.5;
      }

      // 1. COMBAT BOOTS (Worn Brown Leather, sampled from the character art)
      if (isKick) {
        drawArcadeBoot(ctx, -20, -10, 16, 12, '#54483c');
        drawArcadeBoot(ctx, 10, -52, 42, 22, '#54483c');
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(46, -50, 5, 5);

        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(8, -42, 44, -0.6, 0.6);
        ctx.stroke();

        // Effects own their own stroke; the body does not inherit it.
        ctx.strokeStyle = outline;
        ctx.lineWidth = 2.5;
      } else if (isJumping) {
        drawArcadeBoot(ctx, -18, -26, 16, 14, '#54483c');
        drawArcadeBoot(ctx, 6, -18, 16, 14, '#54483c');
      } else {
        // Leg 1 (Back) & Leg 2 (Front) Boots stepping on ground
        drawArcadeBoot(ctx, -18 + stride1, -12 - lift1, 16, 13, '#54483c');
        drawArcadeBoot(ctx, 4 + stride2, -12 - lift2, 16, 13, '#54483c');
      }

      // 2. DENIM JEANS (Indigo Blue with Faded Thigh Wash & Rolled Cuffs)
      ctx.fillStyle = '#2b4c7e';
      if (isKick) {
        ctx.beginPath();
        ctx.moveTo(-20, -40);
        ctx.lineTo(-2, -40);
        ctx.lineTo(-4, -12);
        ctx.lineTo(-22, -12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-2, -48);
        ctx.lineTo(40, -48);
        ctx.lineTo(38, -30);
        ctx.lineTo(-2, -32);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        // Articulated Jeans Legs from Hips down to Boots
        ctx.beginPath();
        ctx.moveTo(-16, -42 + bodyY);
        ctx.lineTo(-18 + stride1, -12 - lift1);
        ctx.lineTo(-2 + stride1, -12 - lift1);
        ctx.lineTo(-2, -42 + bodyY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(2, -42 + bodyY);
        ctx.lineTo(4 + stride2, -12 - lift2);
        ctx.lineTo(20 + stride2, -12 - lift2);
        ctx.lineTo(16, -42 + bodyY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Rolled Jean Cuffs
        ctx.fillStyle = '#89b0e3';
        ctx.fillRect(-18 + stride1, -14 - lift1, 16, 4);
        ctx.fillRect(4 + stride2, -14 - lift2, 16, 4);
      }

      // UPPER BODY (Pecan, Torso, Arms & Head translate with step bounce bodyY)
      ctx.save();
      ctx.translate(0, bodyY);

      // Belt & Silver Buckle
      ctx.fillStyle = '#1e1b18';
      ctx.fillRect(-20, -44, 42, 6);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-3, -45, 8, 8);

      ctx.strokeStyle = DETAIL_STROKE;

      // 3. FITTED BLACK T-SHIRT
      ctx.fillStyle = '#18181c';
      ctx.beginPath();
      ctx.moveTo(-22, -74);
      ctx.quadraticCurveTo(0, -78, 22, -74);
      ctx.lineTo(20, -44);
      ctx.quadraticCurveTo(0, -42, -20, -44);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Pec Contours
      ctx.fillStyle = '#282832';
      ctx.beginPath();
      ctx.ellipse(-10, -64, 9, 7, 0, 0, Math.PI * 2);
      ctx.ellipse(10, -64, 9, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // Skull-over-boot tee print, the shirt graphic from the character art.
      ctx.fillStyle = '#f1f5f9';
      ctx.beginPath();
      ctx.roundRect(-5, -68, 10, 8, 3);
      ctx.fill();
      ctx.fillRect(-3, -61, 6, 2);

      ctx.fillStyle = '#18181c';
      ctx.fillRect(-3, -66, 2, 3);
      ctx.fillRect(1, -66, 2, 3);
      ctx.fillRect(-1, -60, 1, 2);

      // Boot silhouette beneath the skull
      ctx.fillStyle = '#f1f5f9';
      ctx.beginPath();
      ctx.moveTo(-3, -57);
      ctx.lineTo(1, -57);
      ctx.lineTo(1, -52);
      ctx.lineTo(5, -52);
      ctx.lineTo(5, -50);
      ctx.lineTo(-3, -50);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = outline;

      // 4. MUSCULAR ARMS & BLACK GRAPPLING GLOVES
      ctx.fillStyle = '#e8a87c'; // Tan skin

      if (isSpecial) {
        // Both arms locked out straight: he is holding somebody by the ankles
        // and the ankles are the far end of the swing.
        ctx.beginPath();
        ctx.roundRect(-56, -70, 46, 15, 7);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.roundRect(10, -70, 46, 15, 7);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#18181e';
        ctx.beginPath();
        ctx.arc(-58, -62, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(58, -62, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (isPunch) {
        ctx.beginPath();
        ctx.ellipse(-20, -64, 7, 14, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.roundRect(10, -72, 38, 16, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#18181e';
        ctx.fillRect(38, -74, 14, 20);

        ctx.fillStyle = '#00ffff';
        ctx.beginPath();
        ctx.arc(54, -64, 18, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Arm swinging when walking
        // One path per limb.
        //
        // Two ellipses in a single path are joined by a straight line running
        // from the end of the first to the start of the second, and stroking
        // the path draws that join along with the shapes. Both arms sit at the
        // same height, so the join ran horizontally across the chest — one of
        // the two bands that crossed the shirt. The fill hid it; the stroke
        // did not, and it only became obvious once the stroke was a bright
        // colour. `moveTo` would also break the join, but a path per limb says
        // what is meant.
        ctx.beginPath();
        ctx.ellipse(-22 - armSwing, -64, 7, 15, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(18 + armSwing, -64, 7, 15, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#18181e';
        ctx.beginPath();
        ctx.arc(-22 - armSwing, -50, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(18 + armSwing, -50, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // 5. HEAD, POMPADOUR HAIR, BEARD & SPECS (100% UN-OBSCURED FACE!)
      ctx.fillStyle = '#e8a87c';
      ctx.beginPath();
      ctx.ellipse(0, -88, 14, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Facial eyes under glasses
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(-6, -90, 2, 0, Math.PI * 2);
      ctx.arc(6, -90, 2, 0, Math.PI * 2);
      ctx.fill();

      // Styled Brown Pompadour Hair
      ctx.fillStyle = '#4a2e1b';
      ctx.beginPath();
      ctx.moveTo(-15, -92);
      ctx.quadraticCurveTo(-18, -108, 0, -108);
      ctx.quadraticCurveTo(18, -108, 15, -92);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Hair Highlight Strands
      ctx.fillStyle = '#8c5835';
      ctx.beginPath();
      ctx.ellipse(-4, -102, 10, 4, -0.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = DETAIL_STROKE;

      // Beard, sitting on the jaw instead of swallowing the head.
      // It used to be arc(0, -84, 14), which met the bottom edge of the
      // glasses with no gap: hair, lenses and beard tiled the whole skull and
      // no skin was ever visible, despite the comment above claiming otherwise.
      ctx.fillStyle = '#3a2213';
      ctx.beginPath();
      ctx.arc(0, -80, 12, 0.1, Math.PI - 0.1);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -80, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Rectangular Black Glasses with a dim glass highlight
      ctx.fillStyle = '#0b0b0f';
      ctx.beginPath();
      ctx.roundRect(-13, -92, 12, 7, 2);
      ctx.roundRect(1, -92, 12, 7, 2);
      ctx.fill();
      ctx.fillRect(-2, -90, 4, 3);

      ctx.fillStyle = '#39404d';
      ctx.fillRect(-10, -90, 4, 4);
      ctx.fillRect(4, -90, 4, 4);

      ctx.restore(); // end upper body
      ctx.restore(); // end character
      break;
    }

    case 'FUN_MAKER': {
      // FUN MAKER: Spiky Blonde Hair, Bare Muscular Torso, Leather Harness with Silver O-Ring, Blue Cargo Pants
      const isFlying = entity.action === 'FLYING';
      ctx.save();
      if (isHurt) ctx.rotate(-0.2);
      if (isFlying) ctx.rotate(0.12); // Forward soaring angle in flight

      // Rollercoaster Hurricane: a corkscrew, spun about the vertical axis.
      //
      // Horizontal squash carries the spin, because a body turning away from
      // the camera and back is what a corkscrew looks like from the side; the
      // tilt only rocks, since rotating him a full turn in the picture plane
      // read as a man falling over rather than one drilling upward. Squash is
      // floored at a third rather than allowed to reach zero, because a frame
      // where the hero is one pixel wide reads as a dropped frame.
      if (isSpecial) {
        ctx.translate(0, -46);
        ctx.rotate(0.3 * Math.sin(specialPhase * Math.PI * 4));
        ctx.scale(0.3 + 0.7 * Math.abs(Math.cos(specialPhase * Math.PI * 3)), 1);
        ctx.translate(0, 46);
      }

      if (isFlying || isJumping || isSpecial) {
        const jetGlow = 18 + Math.sin(simTimeMs / 30) * 6;
        ctx.fillStyle = '#ff00ff';
        ctx.beginPath();
        ctx.arc(-12, 6, jetGlow, 0, Math.PI * 2);
        ctx.arc(12, 6, jetGlow, 0, Math.PI * 2);
        ctx.fill();

        if (isFlying) {
          // Bright cyan/white vertical flame thruster plumes shooting down from boot soles
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(-18, 0);
          ctx.lineTo(-12, 32 + Math.sin(simTimeMs / 20) * 8);
          ctx.lineTo(-6, 0);
          ctx.moveTo(6, 0);
          ctx.lineTo(12, 32 + Math.cos(simTimeMs / 20) * 8);
          ctx.lineTo(18, 0);
          ctx.fill();

          // Flight Energy Ring Aura
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.7)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(0, -60, 42, 22, 0, 0, Math.PI * 2);
          ctx.stroke();

          // Effects own their own stroke; the body does not inherit it.
          ctx.strokeStyle = outline;
          ctx.lineWidth = 2.5;
        }
      }

      // 1. BOOTS (Rugged Dark Brown Leather Boots)
      if (isKick) {
        drawArcadeBoot(ctx, -18, -10, 16, 13, '#422817');
        drawArcadeBoot(ctx, 12, -52, 40, 22, '#422817');
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(10, -42, 44, -0.7, 0.7);
        ctx.stroke();

        // Effects own their own stroke; the body does not inherit it.
        ctx.strokeStyle = outline;
        ctx.lineWidth = 2.5;
      } else if (isFlying) {
        // Streamlined flying boot angle
        drawArcadeBoot(ctx, -20, -10, 16, 13, '#422817');
        drawArcadeBoot(ctx, 4, -10, 16, 13, '#422817');
      } else {
        drawArcadeBoot(ctx, -18 + stride1, -12 - lift1, 16, 13, '#422817');
        drawArcadeBoot(ctx, 4 + stride2, -12 - lift2, 16, 13, '#422817');
      }

      // 2. ROYAL BLUE CARGO PANTS
      ctx.fillStyle = '#1e3a60';
      if (isKick) {
        ctx.fillRect(-18, -40, 16, 32);
        ctx.strokeRect(-18, -40, 16, 32);
        ctx.fillRect(-2, -50, 38, 20);
        ctx.strokeRect(-2, -50, 38, 20);
      } else {
        ctx.beginPath();
        ctx.moveTo(-16, -42 + bodyY);
        ctx.lineTo(-18 + stride1, -12 - lift1);
        ctx.lineTo(-2 + stride1, -12 - lift1);
        ctx.lineTo(-2, -42 + bodyY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(2, -42 + bodyY);
        ctx.lineTo(4 + stride2, -12 - lift2);
        ctx.lineTo(20 + stride2, -12 - lift2);
        ctx.lineTo(16, -42 + bodyY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // UPPER BODY
      ctx.save();
      ctx.translate(0, bodyY);

      ctx.strokeStyle = DETAIL_STROKE;

      // 3. BARE MUSCULAR TORSO
      ctx.fillStyle = '#f5b082';
      ctx.beginPath();
      ctx.moveTo(-20, -74);
      ctx.quadraticCurveTo(0, -78, 20, -74);
      ctx.lineTo(18, -44);
      ctx.quadraticCurveTo(0, -42, -18, -44);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Leather harness.
      ctx.fillStyle = '#121216';

      ctx.fillRect(-16, -76, 32, 6);

      // One strap per side, chest to hip in a single run: pinched at the ring,
      // flaring above and below it. Drawn as four separate pieces this left a
      // two-pixel band of skin straight across the harness where the upper
      // pieces stopped and the lower ones started.
      ctx.beginPath();
      ctx.moveTo(-14, -71);
      ctx.lineTo(-11, -68);
      ctx.lineTo(-8, -66);
      ctx.lineTo(-7, -64);
      ctx.lineTo(-6, -61);
      ctx.lineTo(-9, -59);
      ctx.lineTo(-18, -44);
      ctx.lineTo(-11, -43.2);
      ctx.lineTo(2, -59);
      ctx.lineTo(-2, -61.5);
      ctx.lineTo(-4, -63.5);
      ctx.lineTo(-5, -66);
      ctx.lineTo(-4.5, -68);
      ctx.lineTo(-3, -71);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(14, -71);
      ctx.lineTo(11, -68);
      ctx.lineTo(8, -66);
      ctx.lineTo(7, -64);
      ctx.lineTo(6, -61);
      ctx.lineTo(9, -59);
      ctx.lineTo(18, -44);
      ctx.lineTo(11, -43.2);
      ctx.lineTo(-2, -59);
      ctx.lineTo(2, -61.5);
      ctx.lineTo(4, -63.5);
      ctx.lineTo(5, -66);
      ctx.lineTo(4.5, -68);
      ctx.lineTo(3, -71);
      ctx.closePath();
      ctx.fill();

      // The leather closes all the way around the ring rather than pinching to
      // nothing at three and nine o'clock.
      ctx.beginPath();
      ctx.arc(0, -66, 7.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(0, -66, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f5b082';
      ctx.beginPath();
      ctx.arc(0, -66, 2.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#94a3b8';
      for (const [sx, sy] of [[-6, -72.5], [6, -72.5], [13, -72.5],
                              [-5.8, -56.5], [5.8, -56.5], [-10.5, -50.5], [10.5, -50.5]]) {
        ctx.fillRect(sx - 1, sy, 2, 2);
      }

      ctx.strokeStyle = outline;

      // 4. MUSCULAR ARMS WITH CYAN WRIST CUFFS
      ctx.fillStyle = '#f5b082';
      if (isPunch) {
        ctx.beginPath();
        ctx.roundRect(10, -72, 38, 16, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(36, -74, 8, 20);
      } else if (isFlying) {
        // Outstretched Superhero Flight Arms
        ctx.beginPath();
        ctx.roundRect(8, -74, 32, 14, 6);
        ctx.roundRect(-22, -74, 32, 14, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(30, -76, 8, 18);
        ctx.fillRect(-20, -76, 8, 18);
      } else {
        ctx.beginPath();
        ctx.ellipse(-22 - armSwing, -66, 7, 15, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(18 + armSwing, -66, 7, 15, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(-24 - armSwing, -54, 6, 8);
        ctx.fillRect(18 + armSwing, -54, 6, 8);
      }

      // 5. HEAD & FACIAL FEATURES (Clean Z-index layer order)
      ctx.fillStyle = '#f5b082';
      ctx.beginPath();
      ctx.ellipse(0, -88, 13, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Eyebrows
      ctx.fillStyle = '#854d0e';
      ctx.fillRect(-8, -96, 6, 2);
      ctx.fillRect(2, -96, 6, 2);

      // Energetic Anime Eyes
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-7, -93, 5, 5);
      ctx.fillRect(2, -93, 5, 5);
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(-5, -92, 3, 4);
      ctx.fillRect(4, -92, 3, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-5, -92, 1, 1);
      ctx.fillRect(4, -92, 1, 1);

      // Confident Smirk
      ctx.strokeStyle = '#9a3412';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -83, 4, 0.2, Math.PI - 0.2);
      ctx.stroke();

      // 6. SPIKED GOLDEN BLONDE HAIR
      //
      // This used to be a band across the forehead with points on top and
      // nothing wrapping the skull, so the scalp showed above the notch at
      // x = 4 and all around the sides. Gold points, a straight rim, and a
      // bare head under it: a player asked whether he was wearing a crown.
      //
      // What kills that reading is coverage, not the points. The mass now owns
      // the whole top of the skull and runs down past the temples, tapering to
      // a tip at jaw height on both sides — hair frames a face, a crown sits on
      // one. The stroke is spelled out here too: it used to inherit whatever
      // the smirk left behind, which outlined the hair in a colour belonging to
      // nothing else on the sprite and made it read as a separate object.
      ctx.strokeStyle = '#8a5a10';
      ctx.lineWidth = 2;
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(-12, -82);
      ctx.lineTo(-15, -88);
      ctx.lineTo(-16, -100);
      ctx.lineTo(-18, -107);
      ctx.lineTo(-12, -103);
      ctx.lineTo(-8, -112);
      ctx.lineTo(-3, -105);
      ctx.lineTo(2, -111);
      ctx.lineTo(7, -104);
      ctx.lineTo(13, -109);
      ctx.lineTo(16, -100);
      ctx.lineTo(15, -88);
      ctx.lineTo(12, -82);
      ctx.lineTo(11, -91);
      ctx.lineTo(8, -97);
      ctx.lineTo(3, -101);
      ctx.lineTo(0, -99);
      ctx.lineTo(-3, -101);
      ctx.lineTo(-8, -97);
      ctx.lineTo(-11, -91);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
      ctx.restore();
      break;
    }

    case 'OMEGA_BIKER': {
      // OMEGA BIKER: Matte Black Helmet with Glowing Red LED Visor, Biker Jacket, Kevlar Pants
      ctx.save();
      if (isHurt) ctx.rotate(0.2);

      /**
       * The Omega Knockback Boot is a kick, and the super was the one action
       * in which he did not kick: the extended-leg pose lives behind `isKick`
       * and the power move never reached it. It does now, so the move that
       * breaks censure shields has a boot at the end of it.
       */
      const kickPose = isKick || isSpecial;

      if (isSpecial) {
        // Red, which is his: the amber this used to be is Feet Master's accent.
        ctx.fillStyle = 'rgba(255, 59, 48, 0.18)';
        ctx.beginPath();
        ctx.arc(0, -42, 75, 0, Math.PI * 2);
        ctx.fill();

        // The kinetic wave, thrown ahead of the boot and widening as the move
        // runs out.
        ctx.strokeStyle = 'rgba(255, 59, 48, 0.7)';
        ctx.lineWidth = 4;
        for (let ring = 0; ring < 3; ring++) {
          const reach = 52 + ring * 18 + specialPhase * 22;
          ctx.beginPath();
          ctx.arc(30, -48, reach, -0.75, 0.75);
          ctx.stroke();
        }

        // Effects own their own stroke; the body does not inherit it.
        ctx.strokeStyle = outline;
        ctx.lineWidth = 2.5;
      }

      // 1. CYBERNETIC ARMORED BIKER BOOTS
      if (kickPose) {
        drawArcadeBoot(ctx, -18, -12, 16, 14, '#0f0f14');
        drawArcadeBoot(ctx, 12, -54, 44, 24, '#0f0f14');
        ctx.fillStyle = '#f5a623';
        ctx.fillRect(46, -54, 8, 24);
      } else {
        drawArcadeBoot(ctx, -18 + stride1, -12 - lift1, 16, 14, '#0f0f14');
        drawArcadeBoot(ctx, 4 + stride2, -12 - lift2, 16, 14, '#0f0f14');
      }

      // 2. KEVLAR TROUSERS
      ctx.fillStyle = '#1e1e24';
      if (kickPose) {
        ctx.fillRect(-18, -44, 16, 34);
        ctx.fillRect(4, -44, 16, 34);
      } else {
        ctx.beginPath();
        ctx.moveTo(-16, -44 + bodyY);
        ctx.lineTo(-18 + stride1, -12 - lift1);
        ctx.lineTo(-2 + stride1, -12 - lift1);
        ctx.lineTo(-2, -44 + bodyY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(2, -44 + bodyY);
        ctx.lineTo(4 + stride2, -12 - lift2);
        ctx.lineTo(20 + stride2, -12 - lift2);
        ctx.lineTo(16, -44 + bodyY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Steel Knee Guards
        ctx.fillStyle = '#3f3f46';
        ctx.fillRect(-16 + stride1 / 2, -32 - lift1 / 2, 14, 10);
        ctx.fillRect(4 + stride2 / 2, -32 - lift2 / 2, 14, 10);
      }

      // UPPER BODY
      ctx.save();
      ctx.translate(0, bodyY);

      ctx.strokeStyle = DETAIL_STROKE;

      // 3. BIKER LEATHER JACKET WITH RED NEON PIPING
      ctx.fillStyle = '#18181e';
      ctx.beginPath();
      ctx.roundRect(-22, -76, 44, 36, [8, 8, 2, 2]);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f5a623';
      ctx.fillRect(-22, -76, 4, 34);
      ctx.fillRect(18, -76, 4, 34);

      // Reactor core, now bearing the omega the character is named after.
      ctx.fillStyle = '#0d0d11';
      ctx.beginPath();
      ctx.arc(0, -63, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(245, 166, 35, 0.35)';
      ctx.beginPath();
      ctx.arc(0, -63, 7, 0, Math.PI * 2);
      ctx.fill();

      drawOmegaSigil(ctx, 0, -64, 5.5, '#f5a623');

      // Shoulder lamps, belt strip and knee bars. Small emissive accents
      // spread across the silhouette so the shape reads even when the
      // background is as dark as the armour.
      ctx.fillStyle = '#f5a623';
      ctx.fillRect(-24, -74, 6, 4);
      ctx.fillRect(18, -74, 6, 4);
      ctx.fillRect(-16, -44, 32, 2);

      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillRect(-19, -30 - lift1 / 2 + stride1 / 2, 12, 2);
      ctx.fillRect(3, -30 - lift2 / 2 + stride2 / 2, 12, 2);
      ctx.restore();

      // Back to the silhouette stroke for the arms.
      //
      // The switch to DETAIL_STROKE above covers the jacket, whose own top and
      // bottom edges fall inside the figure. It used to stay in force until the
      // helmet, so the gauntlets were caught by it too and the arms lost their
      // outline — on the one fighter the outline exists for. Measured against
      // the neon and church stages, that cost him a third of his edge contrast:
      // 54.6 and 42.6 where the arms outlined score 72.6 and 63.1.
      ctx.strokeStyle = outline;

      // 4. ARMORED GAUNTLETS
      ctx.fillStyle = '#121217';
      if (isPunch) {
        ctx.fillRect(10, -72, 38, 18);
        ctx.strokeRect(10, -72, 38, 18);
      } else {
        ctx.fillRect(-28 - armSwing, -72, 14, 28);
        ctx.fillRect(16 + armSwing, -72, 14, 28);
        ctx.strokeRect(-28 - armSwing, -72, 14, 28);
        ctx.strokeRect(16 + armSwing, -72, 14, 28);
      }

      ctx.strokeStyle = outline;

      // 5. MOTORCYCLE HELMET WITH RED VISOR (Un-obscured)
      ctx.fillStyle = '#141418';
      ctx.beginPath();
      ctx.arc(0, -90, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f5a623';
      // Visor widened and given a bloom. Emissive area is what lifts this
      // character off a dark background, and it is on-concept: he is neon-lit
      // armour, not a shadow.
      ctx.fillRect(-5, -95, 23, 11);
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillRect(-8, -97, 29, 15);
      ctx.restore();

      ctx.restore();
      ctx.restore();
      break;
    }

    case 'ANGRY_CORSO': {
      // ANGRY CORSO: Grey Camo Dog Mask, Pointed Ears, Amber Eyes, Harness
      ctx.save();
      if (isHurt) ctx.rotate(0.2);

      if (isSpecial || isBiting) {
        ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
        ctx.beginPath();
        ctx.arc(0, -42, 70, 0, Math.PI * 2);
        ctx.fill();

        // Feral Pup Rush & Bite: he leaves the ground and comes down on the
        // target rather than leaning at it. Drawn after the aura so the glow
        // stays a ring on the floor instead of travelling up with him.
        const lunge = 0.5 - specialPhase * 0.28;
        ctx.translate(0, -34);
        ctx.rotate(lunge);
        ctx.translate(0, 34);
        ctx.translate(0, -pounceHeight(specialPhase));
      }

      /**
       * Height reached this frame, and whether the legs should be under him.
       *
       * A leap read as a leap needs the hind legs to stop pretending there is
       * floor beneath them — a body at head height still standing on two
       * planted boots reads as a bug, not a pounce.
       */
      const pounceLift = isSpecial || isBiting ? pounceHeight(specialPhase) : 0;
      const airborne = pounceLift > 1;
      const tuck = pounceLift * 0.45;

      // 1. TACTICAL CAMO BOOTS
      if (airborne) {
        // Folded under the body, trailing paw slightly higher than the lead.
        drawArcadeBoot(ctx, -14, -18 - tuck, 16, 14, '#333338');
        drawArcadeBoot(ctx, 8, -24 - tuck, 16, 14, '#333338');
      } else if (isKick) {
        drawArcadeBoot(ctx, -18, -12, 16, 14, '#333338');
        drawArcadeBoot(ctx, 12, -52, 40, 22, '#333338');
      } else {
        drawArcadeBoot(ctx, -18 + stride1, -12 - lift1, 16, 14, '#333338');
        drawArcadeBoot(ctx, 4 + stride2, -12 - lift2, 16, 14, '#333338');
      }

      // 2. OLIVE TACTICAL CARGO SHORTS
      ctx.fillStyle = '#3f4e38';
      if (airborne) {
        // Thighs drawn short and folded to meet the tucked boots.
        ctx.beginPath();
        ctx.moveTo(-16, -44);
        ctx.lineTo(-14, -18 - tuck);
        ctx.lineTo(2, -18 - tuck);
        ctx.lineTo(-2, -44);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(2, -44);
        ctx.lineTo(8, -24 - tuck);
        ctx.lineTo(24, -24 - tuck);
        ctx.lineTo(16, -44);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (isKick) {
        ctx.fillRect(-18, -44, 16, 34);
        ctx.fillRect(4, -44, 16, 34);
      } else {
        ctx.beginPath();
        ctx.moveTo(-16, -44 + bodyY);
        ctx.lineTo(-18 + stride1, -12 - lift1);
        ctx.lineTo(-2 + stride1, -12 - lift1);
        ctx.lineTo(-2, -44 + bodyY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(2, -44 + bodyY);
        ctx.lineTo(4 + stride2, -12 - lift2);
        ctx.lineTo(20 + stride2, -12 - lift2);
        ctx.lineTo(16, -44 + bodyY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // UPPER BODY
      ctx.save();
      ctx.translate(0, bodyY);

      // 3. BRONZED MUSCULAR TORSO
      ctx.fillStyle = '#c27c4d';
      ctx.beginPath();
      ctx.roundRect(-20, -76, 40, 36, [8, 8, 2, 2]);
      ctx.fill();
      ctx.stroke();

      // Studded harness crossing the chest, matching the character art.
      ctx.fillStyle = '#141414';
      ctx.beginPath();
      ctx.moveTo(-19, -76);
      ctx.lineTo(-13, -76);
      ctx.lineTo(6, -58);
      ctx.lineTo(1, -55);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(19, -76);
      ctx.lineTo(13, -76);
      ctx.lineTo(-6, -58);
      ctx.lineTo(-1, -55);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-18, -74, 36, 4);

      ctx.fillStyle = '#94a3b8';
      for (let sx = -15; sx <= 13; sx += 7) {
        ctx.fillRect(sx, -73, 2, 2);
      }

      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-2, -60, 5, 9);

      // 4. ARMS & SPIKED WRISTBANDS
      ctx.fillStyle = '#c27c4d';
      if (isBiting) {
        // Both arms out in front, reaching for what he is about to land on.
        //
        // This used to be one unstroked 30x24 rectangle sitting at hip height,
        // below the torso it was supposed to hang from, with neither outline
        // nor tattoos. Standing upright it passed for shadow across the
        // thighs; airborne, with the legs folded away, it was a bare patch of
        // skin colour floating over his shorts.
        //
        // Drawn as two limbs on their own transforms so each carries a flame,
        // because the bite was the one action in the game where he lost them.
        const reachingArm = (shoulderX: number, shoulderY: number, angle: number) => {
          ctx.save();
          ctx.translate(shoulderX, shoulderY);
          ctx.rotate(angle);

          ctx.fillStyle = '#c27c4d';
          ctx.beginPath();
          ctx.roundRect(0, -7, 42, 14, 7);
          ctx.fill();
          ctx.stroke();

          // Flame tattoo on the forearm, riding the limb like the standing
          // ones ride the arm swing.
          drawFlameMark(ctx, 24, 4, 11, '#ea580c', '#fbbf24');

          // Fist, thrown open into a grab.
          ctx.fillStyle = '#141414';
          ctx.beginPath();
          ctx.arc(43, 0, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.restore();
        };

        // Far arm first so the near one overlaps it, and pitched slightly
        // higher: two limbs at identical heights read as one thick one.
        reachingArm(2, -74, -0.2);
        reachingArm(-2, -62, 0.12);
      } else if (isPunch) {
        ctx.fillRect(10, -72, 36, 16);
      } else {
        ctx.fillRect(-26 - armSwing, -72, 14, 28);
        ctx.fillRect(14 + armSwing, -72, 14, 28);
        ctx.strokeRect(-26 - armSwing, -72, 14, 28);
        ctx.strokeRect(14 + armSwing, -72, 14, 28);

        // Flame tattoos. Drawn after the arms and offset by the same armSwing,
        // so they ride the limb instead of floating over the torso.
        drawFlameMark(ctx, -19 - armSwing, -50, 11, '#ea580c', '#fbbf24');
        drawFlameMark(ctx, 21 + armSwing, -50, 11, '#ea580c', '#fbbf24');
      }

      ctx.strokeStyle = outline;

      // 5. DOG MASK & FACIAL FEATURES (Clean Z-index layer order)
      ctx.fillStyle = '#4b5563';
      ctx.beginPath();
      ctx.arc(0, -90, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Pointed Canine Ears
      ctx.fillStyle = '#1f2937';
      ctx.beginPath();
      ctx.moveTo(-12, -96);
      ctx.lineTo(-22, -116);
      ctx.lineTo(-6, -102);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(12, -96);
      ctx.lineTo(22, -116);
      ctx.lineTo(6, -102);
      ctx.fill();

      ctx.strokeStyle = DETAIL_STROKE;

      // Snarling muzzle. Drawn along +x, which the facing flip at the top of
      // renderEntitySprite mirrors automatically.
      ctx.fillStyle = '#5b6673';
      ctx.beginPath();
      ctx.ellipse(9, -85, 13, 8, -0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Open jaw
      ctx.fillStyle = '#3f1d2b';
      ctx.beginPath();
      ctx.ellipse(11, -81, 9, 4, -0.08, 0, Math.PI * 2);
      ctx.fill();

      // Upper and lower fangs
      ctx.fillStyle = '#f8fafc';
      for (const [fx, fw] of [[4, 2], [9, 2.5], [15, 2]] as const) {
        ctx.beginPath();
        ctx.moveTo(fx, -84);
        ctx.lineTo(fx + fw, -84);
        ctx.lineTo(fx + fw / 2, -80);
        ctx.closePath();
        ctx.fill();
      }
      for (const [fx, fw] of [[6, 2], [13, 2]] as const) {
        ctx.beginPath();
        ctx.moveTo(fx, -78);
        ctx.lineTo(fx + fw, -78);
        ctx.lineTo(fx + fw / 2, -82);
        ctx.closePath();
        ctx.fill();
      }

      // Nose
      ctx.fillStyle = '#111318';
      ctx.beginPath();
      ctx.ellipse(19, -88, 4, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Dual Glowing Amber Predator Eyes
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(-7, -93, 5, 4);
      ctx.fillRect(2, -93, 5, 4);
      ctx.fillStyle = '#000000'; // Slit pupils
      ctx.fillRect(-5, -93, 1, 4);
      ctx.fillRect(4, -93, 1, 4);

      // Tactical Dog Snout & Snarl Line
      ctx.fillStyle = '#111827';
      ctx.fillRect(-3, -88, 7, 5);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-2, -83, 5, 2);

      ctx.restore();
      ctx.restore();
      break;
    }
  }
}

// ----------------------------------------------------------------------------
// ENEMY & BOSS SPRITES
// Grounded leg articulation & step mechanics
// ----------------------------------------------------------------------------

/**
 * Per-enemy outline colour, defaulting to the near-black every grunt shares.
 *
 * The dark line is policy, not accident: heroes carry the bright outlines and
 * the crowd is meant to sit behind them. But the line only works where there
 * is something behind it to work against, and the Trad-Wife Striker is a dark
 * figure in a dark dress traced in near-black, standing in a nave rendered in
 * black. Measured through `edgeContrastOf`, she read 11.7 on the Mega-Church
 * against a threshold of 20, and cleared Suburbia by 0.3. She was a rumour on
 * one stage and nearly one on another.
 *
 * The rose here follows her own dress rather than introducing a new hue, and
 * is deliberately dim: it lifts her to 44.0 / 35.0 / 41.3. An earlier draft of
 * this comment claimed that put her in with the other two grunts, and that was
 * wrong twice over — their range is 30.4 to 41.8, not 32.8 to 41.8, and 44.0
 * clears all nine of their readings. She is now the brightest grunt in the
 * game, which was a choice and should read as one.
 *
 * What holds is the part that matters: no enemy outshines the dimmest hero on
 * the stage they share. Against Fun Maker she keeps 6.9 points of headroom on
 * the Neon stage, where her 44.0 is measured. That rule is no longer a promise
 * in a comment — `spriteLegibility.test.ts` asserts it for every enemy on
 * every stage, because a comment is what a palette tweak walks straight
 * through without anything saying a word.
 */
const ENEMY_OUTLINE: Partial<Record<EnemyType, string>> = {
  TRAD_WIFE_STRIKER: '#e8829a',
};

function renderEnemySprite(
  ctx: CanvasRenderingContext2D,
  type: EnemyType,
  entity: EntityState,
  simTimeMs: number
) {
  ctx.strokeStyle = ENEMY_OUTLINE[type] ?? '#090810';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';

  const isMoving = Math.abs(entity.vx) > 0.1 || Math.abs(entity.vy) > 0.1 || entity.action === 'WALK';
  let stepPhase = 0;
  let stride1 = 0;
  let stride2 = 0;
  let lift1 = 0;
  let lift2 = 0;
  let bodyY = 0;

  if (isMoving) {
    const stepTime = simTimeMs / 90;
    stepPhase = Math.sin(stepTime);
    stride1 = stepPhase * 12;
    stride2 = -stepPhase * 12;
    lift1 = Math.max(0, -stepPhase) * 8;
    lift2 = Math.max(0, stepPhase) * 8;
    bodyY = Math.abs(Math.sin(stepTime * 2)) * -2.5;
  } else {
    bodyY = 0;
  }

  // Attack state.
  //
  // Enemies had no arms drawn at all and no branch on `action`: they walked,
  // and damage simply appeared. The AI already sets PUNCH1 with a countdown,
  // so the pose only needed reading.
  //
  // `attackSwing` runs 0 → 1 → 0 across the action: a wind-up, a strike at the
  // peak, and a recovery. Melee actions run 25 frames, the thrown vial 30.
  const isAttacking = entity.action === 'PUNCH1' || entity.action === 'PUNCH2' || entity.action === 'KICK';
  const attackFrames = type === 'CONVERSION_THERAPIST' ? 30 : 25;
  const attackProgress = isAttacking
    ? 1 - Math.max(0, Math.min(1, entity.actionTimer / attackFrames))
    : 0;
  const attackSwing = isAttacking ? Math.sin(attackProgress * Math.PI) : 0;

  // Arms rest at the sides and swing while walking, opposite to the legs.
  const armSwing = isMoving ? -stepPhase * 9 : 0;

  switch (type) {
    case 'PURITY_PATROL': {
      // Khaki pants, light blue polo, wooden picket protest sign
      drawArcadeBoot(ctx, -16 + stride1, -10 - lift1, 15, 12, '#1c1917');
      drawArcadeBoot(ctx, 4 + stride2, -10 - lift2, 15, 12, '#1c1917');

      // Khakis legs
      ctx.fillStyle = '#d4a373';
      ctx.beginPath();
      ctx.moveTo(-16, -40 + bodyY);
      ctx.lineTo(-16 + stride1, -10 - lift1);
      ctx.lineTo(-2 + stride1, -10 - lift1);
      ctx.lineTo(-2, -40 + bodyY);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(2, -40 + bodyY);
      ctx.lineTo(4 + stride2, -10 - lift2);
      ctx.lineTo(18 + stride2, -10 - lift2);
      ctx.lineTo(16, -40 + bodyY);
      ctx.fill();
      ctx.stroke();

      // Upper Body
      ctx.save();
      ctx.translate(0, bodyY);

      // Light Blue Polo Shirt
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.roundRect(-18, -72, 36, 34, [6, 6, 2, 2]);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-7, -72, 14, 7);

      // Head & Hair
      ctx.fillStyle = '#fde047';
      ctx.fillRect(-12, -96, 24, 12);
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(-10, -88, 20, 18);
      ctx.strokeRect(-10, -88, 20, 18);

      // Facial Features (Sunglasses & Angry Mouth)
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-8, -84, 16, 5);
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(-5, -75, 10, 2);

      // Arms. The rear arm swings with the walk; the front one grips the sign.
      ctx.fillStyle = '#f0c8a0';
      ctx.fillRect(-16 - armSwing * 0.5, -88 + armSwing, 8, 22);

      // Picket sign, swung down like a club on attack.
      ctx.save();
      ctx.translate(19, -92);
      ctx.rotate(attackSwing * 1.1);
      ctx.translate(-19, 92);

      // Front arm follows the sign
      ctx.fillStyle = '#f0c8a0';
      ctx.fillRect(10, -90, 8, 20);

      ctx.fillStyle = '#b45309';
      ctx.fillRect(16, -104, 6, 74);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-2, -126, 38, 30);
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(-2, -126, 38, 30);
      ctx.fillStyle = '#dc2626';
      ctx.font = 'bold 12px sans-serif';
      // The board follows the body, but the lettering must not: mirrored text
      // on a protest sign read as "!ON".
      ctx.save();
      ctx.translate(17, -106);
      if (entity.facing === 'LEFT') {
        ctx.scale(-1, 1);
      }
      // Without this the default 'start' alignment draws the text growing
      // rightward from this point instead of centered on it, leaving it
      // pinned to the right half of the board.
      ctx.textAlign = 'center';
      ctx.fillText('NO!', 0, 0);
      ctx.restore();

      ctx.restore(); // sign swing
      ctx.restore(); // upper body
      break;
    }

    case 'CONVERSION_THERAPIST': {
      drawArcadeBoot(ctx, -16 + stride1, -10 - lift1, 15, 12, '#0f172a');
      drawArcadeBoot(ctx, 4 + stride2, -10 - lift2, 15, 12, '#0f172a');

      ctx.fillStyle = '#6b21a8';
      ctx.fillRect(-16, -40 + bodyY, 14, 32);
      ctx.fillRect(4, -40 + bodyY, 14, 32);

      ctx.save();
      ctx.translate(0, bodyY);

      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.roundRect(-18, -74, 36, 36, [6, 6, 2, 2]);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(-10, -92, 20, 20);
      ctx.strokeRect(-10, -92, 20, 20);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-12, -98, 24, 8);

      // Glasses & Mouth
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-8, -88, 6, 5);
      ctx.strokeRect(2, -88, 6, 5);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-4, -77, 8, 2);

      // Throwing arm: cocked back, then whipped forward and up, ending where
      // the vial leaves the hand.
      ctx.fillStyle = '#e8c39e';
      ctx.save();
      ctx.translate(10, -70);
      ctx.rotate(-0.6 + attackSwing * 2.0);
      ctx.fillRect(0, -5, 22, 9);
      ctx.strokeRect(0, -5, 22, 9);
      ctx.restore();

      // Rear arm holding the case of vials
      ctx.fillStyle = '#e8c39e';
      ctx.fillRect(-20 - armSwing * 0.4, -70 + armSwing, 8, 20);

      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(20 + attackSwing * 16, -54 - attackSwing * 22, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      break;
    }

    case 'TRAD_WIFE_STRIKER': {
      drawArcadeBoot(ctx, -14 + stride1, -10 - lift1, 12, 10, '#be185d');
      drawArcadeBoot(ctx, 2 + stride2, -10 - lift2, 12, 10, '#be185d');

      ctx.save();
      ctx.translate(0, bodyY);

      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(-16, -50, 32, 44);
      ctx.strokeRect(-16, -50, 32, 44);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-12, -46, 24, 32);

      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(-9, -74, 18, 24);
      ctx.strokeRect(-9, -74, 18, 24);
      ctx.fillStyle = '#b91c1c';
      ctx.beginPath();
      ctx.arc(0, -80, 12, 0, Math.PI * 2);
      ctx.fill();

      // Eyes & Red Lipstick Mouth
      ctx.fillStyle = '#1e1b18';
      ctx.fillRect(-6, -68, 3, 3);
      ctx.fillRect(3, -68, 3, 3);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(-4, -58, 8, 3);

      // Skillet arm. Raised overhead on the wind-up and brought down in an arc:
      // the swing the description promises and the sprite never showed.
      ctx.save();
      ctx.translate(12, -52);
      ctx.rotate(-2.2 + attackSwing * 2.6);

      ctx.fillStyle = '#f0c8a0';
      ctx.fillRect(0, -4, 18, 8);
      ctx.strokeRect(0, -4, 18, 8);

      ctx.fillStyle = '#3f3f46';
      ctx.beginPath();
      ctx.arc(26, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#18181b';
      ctx.beginPath();
      ctx.arc(20, -44, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(20, -46, 20, 6);

      ctx.restore();
      break;
    }

    case 'BOSS_MADAM_MIZYDIA': {
      ctx.fillStyle = '#451a03';
      ctx.fillRect(-60, -42, 120, 42);
      ctx.strokeRect(-60, -42, 120, 42);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(-56, -38, 112, 8);

      ctx.save();
      ctx.translate(0, bodyY);

      ctx.fillStyle = '#9f1239';
      ctx.fillRect(-28, -96, 56, 56);
      ctx.strokeRect(-28, -96, 56, 56);

      ctx.fillStyle = '#eab308';
      ctx.fillRect(-30, -98, 14, 12);
      ctx.fillRect(16, -98, 14, 12);

      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(-14, -118, 28, 26);
      ctx.strokeRect(-14, -118, 28, 26);
      ctx.fillStyle = '#eab308';
      ctx.fillRect(-13, -132, 26, 16);

      // Glowing Purple Boss Eyes & Crimson Lipstick
      ctx.fillStyle = '#a855f7';
      ctx.fillRect(-10, -110, 6, 5);
      ctx.fillRect(4, -110, 6, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-8, -109, 2, 2);
      ctx.fillRect(6, -109, 2, 2);
      ctx.fillStyle = '#be123c';
      ctx.fillRect(-6, -98, 12, 4);

      // Casting arms. She fights from behind a table, so the tell has to be
      // the arms: they rise and the censure light gathers between the palms.
      ctx.fillStyle = '#7a1f3d';
      ctx.save();
      ctx.translate(-26, -84);
      ctx.rotate(-attackSwing * 1.2);
      ctx.fillRect(-18, -6, 20, 12);
      ctx.strokeRect(-18, -6, 20, 12);
      ctx.restore();

      ctx.save();
      ctx.translate(26, -84);
      ctx.rotate(attackSwing * 1.2);
      ctx.fillRect(-2, -6, 20, 12);
      ctx.strokeRect(-2, -6, 20, 12);
      ctx.restore();

      if (attackSwing > 0.05) {
        ctx.save();
        ctx.globalAlpha = attackSwing;
        ctx.fillStyle = '#d63031';
        ctx.beginPath();
        ctx.arc(0, -100 - attackSwing * 14, 6 + attackSwing * 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (entity.shieldHp && entity.shieldHp > 0) {
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(0, -64, 80, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
      break;
    }

    case 'BOSS_SAYONARA': {
      // The Old Guard, in the armour her handler put on her.
      //
      // She used to be drawn at roughly half the height of her own hitbox and
      // less mass than a grunt in a polo shirt, which is a strange thing for
      // the fight the dialogue builds up to. The build here fills the box she
      // now declares: long and low, weight carried across the floor rather
      // than above it, because a quadruped never gets to be tall and should
      // not try.
      //
      // The outline is deliberately not the near-black every other enemy uses.
      // A black dog outlined in black, on a nave rendered in black, measured
      // 10.4 on the edge-contrast probe against a threshold of 20 — she was
      // already a rumour on the final stage before anyone made her bigger.
      const HIDE = '#1c1c20';
      const HIDE_LOW = '#141418';
      const TAN = '#8a4b1e';
      const PLATE = '#2b2b33';
      const SEAM = '#c2410c';
      const RIM = '#585866';
      // Detail pass, all of it inside the silhouette she already had. At this
      // size what reads as mass is density, not extra pixels: a plain block of
      // hide is a shape, and the same block with a seam, a highlight and a
      // shadow under it is an animal in armour.
      const EDGE = '#6f6f80';
      const SEAM_DIM = '#7c2d12';
      const TAN_DARK = '#5c3113';

      // Every coordinate below was hand-placed against the 140x95 box. Scaling
      // the whole build keeps drawing and box in step by construction: one
      // number, and no chance of a limb that grew while its strap did not.
      // It scales about her feet, so she grows up and out and stays standing
      // on the floor rather than sinking into it.
      //
      // The matching number is on her hitbox in characterData, with the
      // measurements that make a tenth the ceiling rather than a preference.
      const SIZE = 1.11;
      ctx.save();
      ctx.scale(SIZE, SIZE);

      // Down means down. The walk cycle stops, the legs fold, and the whole
      // body sinks — nothing else in the renderer reads `downed`, so a spared
      // Sayonara used to stand there looking exactly like one still fighting.
      const isDown = entity.downed === true;

      // The tackle, drawn.
      //
      // A charge that cannot be seen coming is a tax rather than a fight, so
      // the wind-up has to be legible from across the arena: she drops, hauls
      // her weight back over the hind legs, and pins her ears. The run is the
      // opposite shape — flat, stretched, head down and level with the
      // shoulders. The recovery leaves her splayed and off balance, which is
      // the window a player who read it has earned.
      const winding = entity.chargeState === 'TELEGRAPH';
      const running = entity.chargeState === 'CHARGE';
      const spent = entity.chargeState === 'RECOVER';

      // Drawn at a comfortable working size, then fitted to the box she
      // declares in characterData. Without it she is built 175px across while
      // resting 100px from the player, so her muzzle ends up inside him — a
      // silhouette that lies about where the fight actually is.
      ctx.save();
      ctx.scale(0.8, 0.8);
      const gait = isDown || winding ? 0 : 1;
      // Leg length alone decides how low she sits, and the paws stay welded
      // to the floor at zero.
      //
      // A second sink term used to be applied to the legs as well as the body,
      // so instead of the body settling onto folded legs the whole animal
      // lifted: 6px of daylight under her during the wind-up, 8px during the
      // recovery, and 15.6px while down — the worst of the three, and the pose
      // she holds motionless for longest, so the easiest to catch. Together
      // with the height snapping between phases, what that read as in play was
      // a dog that hops.
      const legLen = isDown ? 7 : winding ? 12 : running ? 15 : spent ? 10 : 18;

      // Weight shifts back to load the charge, forward to spend it.
      const lean = winding ? -9 : running ? 12 : spent ? -5 : 0;
      const p1 = stride1 * 0.8 * gait;
      const p2 = stride2 * 0.8 * gait;
      const l1 = lift1 * gait;
      const l2 = lift2 * gait;
      const sway = isDown ? 0 : bodyY;

      // The collar is the plot. It keeps its light until Mizydia falls, and
      // goes dead the moment she does.
      const collarLit = !entity.freed;

      ctx.strokeStyle = RIM;
      ctx.lineWidth = 2.5;

      // Hind legs, then fore legs: the far pair sits a shade darker so the
      // body reads as having two sides at this size.
      ctx.fillStyle = HIDE_LOW;
      ctx.fillRect(-40 + p2, -legLen - l2, 13, legLen + l2);
      ctx.strokeRect(-40 + p2, -legLen - l2, 13, legLen + l2);
      ctx.fillRect(8 + p1, -legLen - l1, 13, legLen + l1);
      ctx.strokeRect(8 + p1, -legLen - l1, 13, legLen + l1);

      ctx.fillStyle = HIDE;
      ctx.fillRect(-30 + p1, -legLen - l1, 14, legLen + l1);
      ctx.strokeRect(-30 + p1, -legLen - l1, 14, legLen + l1);
      ctx.fillRect(20 + p2, -legLen - l2, 14, legLen + l2);
      ctx.strokeRect(20 + p2, -legLen - l2, 14, legLen + l2);

      // Tan points on the paws, the way the breed wears them.
      ctx.fillStyle = TAN;
      ctx.fillRect(-40 + p2, -4 - l2, 13, 4);
      ctx.fillRect(8 + p1, -4 - l1, 13, 4);
      ctx.fillRect(-30 + p1, -4 - l1, 14, 4);
      ctx.fillRect(20 + p2, -4 - l2, 14, 4);

      // Toes. Two dark splits in each paw, which is what stops the foot from
      // reading as a peg.
      ctx.fillStyle = TAN_DARK;
      for (const [px, pl, pw] of [
        [-40 + p2, l2, 13],
        [8 + p1, l1, 13],
        [-30 + p1, l1, 14],
        [20 + p2, l2, 14],
      ] as Array<[number, number, number]>) {
        ctx.fillRect(px + pw / 3, -3 - pl, 1.5, 3);
        ctx.fillRect(px + (pw * 2) / 3, -3 - pl, 1.5, 3);
      }

      ctx.save();
      ctx.translate(lean, sway);

      // Docked stub, back where the tail would be.
      ctx.fillStyle = HIDE_LOW;
      ctx.fillRect(-52, -legLen - 26, 10, 9);
      ctx.strokeRect(-52, -legLen - 26, 10, 9);

      // Barrel. Deeper at the chest end, which is where she puts the weight.
      ctx.fillStyle = HIDE;
      ctx.fillRect(-44, -legLen - 30, 72, 30);
      ctx.strokeRect(-44, -legLen - 30, 72, 30);
      ctx.fillStyle = HIDE_LOW;
      ctx.fillRect(-44, -legLen - 10, 72, 10);

      // Light along the spine and a rib break across the flank. The spine
      // catches the neon on stage one and the church red on stage three; it is
      // the same trick that got her over the contrast threshold, used again
      // for shape instead of legibility.
      ctx.fillStyle = EDGE;
      ctx.fillRect(-42, -legLen - 29, 68, 2);
      ctx.fillStyle = HIDE_LOW;
      ctx.fillRect(-8, -legLen - 26, 2, 14);
      ctx.fillRect(2, -legLen - 24, 2, 11);

      // Haunch. The back was one flat plank without it, and a Rottweiler is
      // mostly rear end and shoulder.
      ctx.fillStyle = HIDE_LOW;
      ctx.fillRect(-46, -legLen - 34, 22, 26);
      ctx.strokeRect(-46, -legLen - 34, 22, 26);
      // The curve of the haunch, in two steps rather than a curve.
      ctx.fillStyle = EDGE;
      ctx.fillRect(-44, -legLen - 32, 12, 2);
      ctx.fillRect(-44, -legLen - 30, 6, 2);

      // Chest and belly tan.
      ctx.fillStyle = TAN;
      ctx.fillRect(16, -legLen - 20, 12, 18);

      // Body armour: plates over the shoulders and flank, seams lit the same
      // rust the rest of her kit is lit with.
      ctx.fillStyle = PLATE;
      ctx.fillRect(-24, -legLen - 34, 44, 16);
      ctx.strokeRect(-24, -legLen - 34, 44, 16);
      ctx.fillStyle = SEAM;
      ctx.fillRect(-20, -legLen - 30, 36, 3);
      ctx.fillStyle = SEAM_DIM;
      ctx.fillRect(-20, -legLen - 22, 36, 2);
      // Rivets down the plate. Four is enough to say bolted; more turns to
      // noise at this size.
      ctx.fillStyle = EDGE;
      for (const rx of [-21, -8, 5, 16]) ctx.fillRect(rx, -legLen - 33, 2, 2);
      ctx.fillStyle = PLATE;
      ctx.fillRect(-40, -legLen - 26, 14, 20);
      ctx.strokeRect(-40, -legLen - 26, 14, 20);
      ctx.fillStyle = EDGE;
      ctx.fillRect(-38, -legLen - 22, 10, 2);

      // Harness strap running from the shoulder plate down under the chest.
      ctx.fillStyle = PLATE;
      ctx.fillRect(12, -legLen - 26, 5, 20);
      ctx.fillStyle = EDGE;
      ctx.fillRect(12, -legLen - 18, 5, 2);

      // Head, neck and collar ride forward on a lunge.
      const reach = attackSwing * 20 + (running ? 16 : winding ? -6 : 0);
      const nod = isDown ? 16 : winding ? 7 : running ? 9 : spent ? 5 : attackSwing * 5;

      ctx.save();
      ctx.translate(reach, nod);

      // Neck. Stretches instead of travelling, so the head can be thrown
      // forward on a lunge without tearing away from the shoulders.
      ctx.fillStyle = HIDE;
      ctx.fillRect(20 - reach, -legLen - 40, 22 + reach, 24);
      ctx.strokeRect(20 - reach, -legLen - 40, 22 + reach, 24);

      // The collar itself: a heavy band with a housing at the throat.
      ctx.fillStyle = PLATE;
      ctx.fillRect(18, -legLen - 32, 26, 10);
      ctx.strokeRect(18, -legLen - 32, 26, 10);
      ctx.fillStyle = EDGE;
      for (const rx of [20, 24, 37, 41]) ctx.fillRect(rx, -legLen - 31, 2, 2);
      ctx.fillStyle = collarLit ? '#eab308' : '#3f3f46';
      ctx.fillRect(26, -legLen - 30, 9, 6);

      // The tag. It hangs whether or not the collar is still lit, because the
      // tag is hers and the light is Mizydia's.
      ctx.fillStyle = PLATE;
      ctx.fillRect(29, -legLen - 22, 6, 5);
      ctx.strokeRect(29, -legLen - 22, 6, 5);
      ctx.fillStyle = EDGE;
      ctx.fillRect(30, -legLen - 21, 4, 1);
      if (collarLit) {
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(19, -legLen - 29, 5, 4);
        ctx.fillRect(38, -legLen - 29, 5, 4);
      }

      // Skull, muzzle, ears.
      ctx.fillStyle = HIDE;
      ctx.fillRect(28, -legLen - 58, 26, 22);
      ctx.strokeRect(28, -legLen - 58, 26, 22);
      ctx.fillRect(50, -legLen - 51, 19, 16);
      ctx.strokeRect(50, -legLen - 51, 19, 16);
      ctx.fillStyle = TAN;
      ctx.fillRect(50, -legLen - 42, 19, 7);
      // Cheek points and the shadow under the jaw, which is what gives the
      // head a near side and a far side.
      ctx.fillRect(30, -legLen - 44, 8, 5);
      ctx.fillStyle = HIDE_LOW;
      ctx.fillRect(28, -legLen - 40, 24, 4);
      ctx.fillStyle = EDGE;
      ctx.fillRect(30, -legLen - 57, 22, 2);
      ctx.fillStyle = HIDE_LOW;
      ctx.fillRect(64, -legLen - 51, 5, 6);

      // Teeth, and only on the lunge. A dog that is always snarling is a
      // decoration; one that snarls when it commits is a warning.
      if (attackSwing > 0.15 || running) {
        ctx.fillStyle = '#f4f4f5';
        ctx.fillRect(52, -legLen - 42, 15, 4);
        ctx.fillStyle = HIDE_LOW;
        ctx.fillRect(56, -legLen - 42, 2, 4);
        ctx.fillRect(62, -legLen - 42, 2, 4);
      }

      ctx.fillStyle = HIDE_LOW;
      ctx.fillRect(28, -legLen - 63, 10, 10);
      ctx.strokeRect(28, -legLen - 63, 10, 10);
      ctx.fillRect(44, -legLen - 63, 10, 10);
      ctx.strokeRect(44, -legLen - 63, 10, 10);
      // Inner ear, a shade warmer than the hide.
      ctx.fillStyle = TAN_DARK;
      ctx.fillRect(31, -legLen - 60, 4, 5);
      ctx.fillRect(47, -legLen - 60, 4, 5);

      // Tan brow points, and under them the eye. Shut when she is down.
      ctx.fillStyle = TAN;
      ctx.fillRect(32, -legLen - 52, 7, 4);
      ctx.fillRect(45, -legLen - 52, 7, 4);
      if (isDown) {
        ctx.fillStyle = HIDE_LOW;
        ctx.fillRect(42, -legLen - 47, 8, 2);
      } else {
        ctx.fillStyle = collarLit ? '#f97316' : '#fef3c7';
        ctx.fillRect(42, -legLen - 48, 6, 5);
        ctx.fillStyle = '#0b0b0f';
        ctx.fillRect(44, -legLen - 47, 2, 3);
        // A single lit pixel in the eye. It is the difference between a marble
        // and something looking at you.
        ctx.fillStyle = '#fff7ed';
        ctx.fillRect(43, -legLen - 48, 1.5, 1.5);
      }

      ctx.restore();
      ctx.restore();
      ctx.restore();
      ctx.restore();
      break;
    }
  }
}

// Helper: 16-Bit Arcade Boot Drawing with Sole & Tread
/**
 * Omega sigil: a bowl open at the bottom with two outward feet.
 *
 * Stroked from primitives rather than `fillText` so it stays crisp at sprite
 * scale — canvas text antialiases and reads as a smudge next to hard-edged
 * pixel work.
 */
function drawOmegaSigil(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'butt';

  // 0.8pi -> 0.2pi clockwise sweeps left, top and right, leaving the bottom open.
  ctx.beginPath();
  ctx.arc(cx, cy, radius, Math.PI * 0.8, Math.PI * 0.2);
  ctx.stroke();

  const footY = cy + radius * 0.62;
  const footW = radius * 0.75;
  ctx.fillStyle = color;
  ctx.fillRect(cx - radius * 1.15, footY, footW, 2.5);
  ctx.fillRect(cx + radius * 0.4, footY, footW, 2.5);
  ctx.restore();
}

/** Small upward flame, used for arm tattoos. */
function drawFlameMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  outer: string,
  inner: string
) {
  ctx.save();
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x - height * 0.45, y - height * 0.5, x - height * 0.15, y - height);
  ctx.quadraticCurveTo(x + height * 0.1, y - height * 0.55, x + height * 0.35, y - height * 0.85);
  ctx.quadraticCurveTo(x + height * 0.5, y - height * 0.3, x, y);
  ctx.fill();

  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.moveTo(x, y - height * 0.1);
  ctx.quadraticCurveTo(x - height * 0.2, y - height * 0.45, x - height * 0.05, y - height * 0.7);
  ctx.quadraticCurveTo(x + height * 0.2, y - height * 0.4, x, y - height * 0.1);
  ctx.fill();
  ctx.restore();
}

function drawArcadeBoot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, [4, 4, 1, 1]);
  ctx.fill();
  ctx.stroke();

  // Rubber Sole Base
  ctx.fillStyle = '#333338';
  ctx.fillRect(x, y + h - 3, w, 3);
}
