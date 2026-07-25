import { EntityState, CharacterId, EnemyType } from '../types';
import feetMasterImg from '../assets/images/feet_master_portrait_1784833325496.jpg';
import funMakerImg from '../assets/images/fun_maker_portrait_1784833339232.jpg';
import omegaBikerImg from '../assets/images/omega_biker_portrait_1784833348944.jpg';
import angryCorsoImg from '../assets/images/angry_corso_portrait_1784833357693.jpg';

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
  renderY: number
) {
  ctx.save();
  ctx.translate(renderX, renderY);
  // Scale characters to 1.5x their original size
  ctx.scale(1.5, 1.5);

  // 1. Dynamic Ground Oval Shadow (glued flat to ground plane y=0)
  const shadowScale = Math.max(0.2, 1 - entity.z / 180);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(0, 0, (entity.width / 1.6) * shadowScale, 9 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Facing Direction Flip
  if (entity.facing === 'LEFT') {
    ctx.scale(-1, 1);
  }

  // 3. Invulnerability / Damage Flashing Effect
  if (entity.invulnerableTimer > 0 && Math.floor(Date.now() / 60) % 2 === 0) {
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
  if (entity.isPlayer && entity.charId && entity.action === 'POWER_MOVE') {
    renderPowerMoveCutIn(ctx, entity.charId);
  }

  // 6. Motion Trail After-Images for Special Moves & Heavy Attacks
  if (entity.action === 'POWER_MOVE' || entity.action === 'KICK') {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.translate(-18, 0);
    if (entity.isPlayer && entity.charId) {
      renderPlayerSprite(ctx, entity.charId, entity);
    }
    ctx.restore();
  }

  // 7. Main Sprite Rendering
  if (entity.isPlayer && entity.charId) {
    renderPlayerSprite(ctx, entity.charId, entity);
    // Unobtrusive Arcade Player Arrow Indicator high above head (never covers face!)
    renderPlayerIndicator(ctx, entity);
  } else if (entity.enemyType) {
    renderEnemySprite(ctx, entity.enemyType, entity);
    // Render Overhead Arcade Health Bar for Enemies
    renderEnemyHealthBar(ctx, entity);
  }

  ctx.restore();
}

// ----------------------------------------------------------------------------
// POWER MOVE ROSTER PORTRAIT CUT-IN BANNER (Arcade Super Attack Flash)
// ----------------------------------------------------------------------------

function renderPowerMoveCutIn(ctx: CanvasRenderingContext2D, charId: CharacterId) {
  const img = portraitImages[charId];
  if (!img || !img.complete) return;

  ctx.save();
  // Floats high above the character head (y = -145) to prevent obscuring facial features
  ctx.translate(0, -145);

  // Background Banner Box
  ctx.fillStyle = 'rgba(10, 10, 15, 0.85)';
  ctx.fillRect(-120, -50, 240, 60);

  // Theme Colors
  let borderCol = '#00ffff';
  if (charId === 'FUN_MAKER') borderCol = '#ff00ff';
  if (charId === 'OMEGA_BIKER') borderCol = '#ffff00';
  if (charId === 'ANGRY_CORSO') borderCol = '#ff4e00';

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
  ctx.font = 'black 12px monospace';
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

function renderPlayerSprite(
  ctx: CanvasRenderingContext2D,
  charId: CharacterId,
  entity: EntityState
) {
  const isPunch = entity.action === 'PUNCH1' || entity.action === 'PUNCH2' || entity.action === 'PUNCH3';
  const isKick = entity.action === 'KICK';
  const isSpecial = entity.action === 'POWER_MOVE';
  const isBiting = entity.action === 'BITING';
  const isJumping = entity.z > 0;
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
    const stepTime = Date.now() / 80;
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
  ctx.strokeStyle = '#090812';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  switch (charId) {
    case 'FEET_MASTER': {
      // FEET MASTER: Brown styled pompadour hair, full brown beard, specs with blue glint, fitted black tee, denim jeans, combat boots
      ctx.save();
      if (isHurt) ctx.rotate(0.2);

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
        ctx.arc(0, -42, 55 + Math.sin(Date.now() / 50) * 8, 0, Math.PI * 2);
        ctx.stroke();
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

      // 4. MUSCULAR ARMS & BLACK GRAPPLING GLOVES
      ctx.fillStyle = '#e8a87c'; // Tan skin

      if (isPunch) {
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
        ctx.beginPath();
        ctx.ellipse(-22 - armSwing, -64, 7, 15, -0.2, 0, Math.PI * 2);
        ctx.ellipse(18 + armSwing, -64, 7, 15, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#18181e';
        ctx.beginPath();
        ctx.arc(-22 - armSwing, -50, 7, 0, Math.PI * 2);
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

      if (isFlying || isJumping || isSpecial) {
        const jetGlow = 18 + Math.sin(Date.now() / 30) * 6;
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
          ctx.lineTo(-12, 32 + Math.sin(Date.now() / 20) * 8);
          ctx.lineTo(-6, 0);
          ctx.moveTo(6, 0);
          ctx.lineTo(12, 32 + Math.cos(Date.now() / 20) * 8);
          ctx.lineTo(18, 0);
          ctx.fill();

          // Flight Energy Ring Aura
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.7)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(0, -60, 42, 22, 0, 0, Math.PI * 2);
          ctx.stroke();
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

      // Leather harness. The straps used to be two horizontal bars; the
      // character art has them crossing from the shoulders into the O-ring.
      ctx.fillStyle = '#121216';
      ctx.beginPath();
      ctx.moveTo(-19, -75);
      ctx.lineTo(-13, -75);
      ctx.lineTo(6, -60);
      ctx.lineTo(1, -57);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(19, -75);
      ctx.lineTo(13, -75);
      ctx.lineTo(-6, -60);
      ctx.lineTo(-1, -57);
      ctx.closePath();
      ctx.fill();

      ctx.fillRect(-18, -73, 36, 4);

      // Studs along the chest strap
      ctx.fillStyle = '#94a3b8';
      for (let sx = -14; sx <= 14; sx += 7) {
        ctx.fillRect(sx, -72, 2, 2);
      }

      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(0, -66, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

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
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(-16, -92);
      ctx.lineTo(-21, -105);
      ctx.lineTo(-13, -99);
      ctx.lineTo(-5, -108);
      ctx.lineTo(4, -99);
      ctx.lineTo(13, -107);
      ctx.lineTo(19, -96);
      ctx.lineTo(14, -86);
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

      if (isSpecial) {
        ctx.fillStyle = 'rgba(245, 166, 35, 0.4)';
        ctx.beginPath();
        ctx.arc(0, -42, 75, 0, Math.PI * 2);
        ctx.fill();
      }

      // 1. CYBERNETIC ARMORED BIKER BOOTS
      if (isKick) {
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
      if (isKick) {
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

      // 5. MOTORCYCLE HELMET WITH RED VISOR (Un-obscured)
      ctx.fillStyle = '#141418';
      ctx.beginPath();
      ctx.arc(0, -90, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f5a623';
      ctx.fillRect(-3, -94, 19, 9);

      ctx.restore();
      ctx.restore();
      break;
    }

    case 'ANGRY_CORSO': {
      // ANGRY CORSO: Grey Camo Dog Mask, Pointed Ears, Amber Eyes, Harness
      ctx.save();
      if (isHurt) ctx.rotate(0.2);

      if (isSpecial || isBiting) {
        ctx.fillStyle = 'rgba(34, 197, 94, 0.35)';
        ctx.beginPath();
        ctx.arc(0, -42, 70, 0, Math.PI * 2);
        ctx.fill();
      }

      // 1. TACTICAL CAMO BOOTS
      if (isKick) {
        drawArcadeBoot(ctx, -18, -12, 16, 14, '#333338');
        drawArcadeBoot(ctx, 12, -52, 40, 22, '#333338');
      } else {
        drawArcadeBoot(ctx, -18 + stride1, -12 - lift1, 16, 14, '#333338');
        drawArcadeBoot(ctx, 4 + stride2, -12 - lift2, 16, 14, '#333338');
      }

      // 2. OLIVE TACTICAL CARGO SHORTS
      ctx.fillStyle = '#3f4e38';
      if (isKick) {
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
        ctx.fillRect(-10, -46, 30, 24);
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

function renderEnemySprite(
  ctx: CanvasRenderingContext2D,
  type: EnemyType,
  entity: EntityState
) {
  ctx.strokeStyle = '#090810';
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
    const stepTime = Date.now() / 90;
    stepPhase = Math.sin(stepTime);
    stride1 = stepPhase * 12;
    stride2 = -stepPhase * 12;
    lift1 = Math.max(0, -stepPhase) * 8;
    lift2 = Math.max(0, stepPhase) * 8;
    bodyY = Math.abs(Math.sin(stepTime * 2)) * -2.5;
  } else {
    bodyY = 0;
  }

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

      // Wooden Picket Sign
      ctx.fillStyle = '#b45309';
      ctx.fillRect(16, -104, 6, 74);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-2, -126, 38, 30);
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(-2, -126, 38, 30);
      ctx.fillStyle = '#dc2626';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('NO!', 8, -106);

      ctx.restore();
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

      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(20, -54, 10, 0, Math.PI * 2);
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
      // Armored Rottweiler walking steps
      const p1 = stride1 * 0.8;
      const p2 = stride2 * 0.8;

      ctx.fillStyle = '#27272a';
      ctx.fillRect(-26 + p1, -10 - lift1, 11, 10);
      ctx.fillRect(-13 + p2, -10 - lift2, 11, 10);
      ctx.fillRect(2 + p1, -10 - lift1, 11, 10);
      ctx.fillRect(15 + p2, -10 - lift2, 11, 10);

      ctx.save();
      ctx.translate(0, bodyY);

      ctx.fillStyle = '#18181b';
      ctx.fillRect(-30, -32, 60, 28);
      ctx.strokeRect(-30, -32, 60, 28);

      ctx.fillRect(20, -46, 24, 24);
      ctx.strokeRect(20, -46, 24, 24);
      ctx.fillStyle = '#c2410c';
      ctx.fillRect(30, -38, 14, 16);

      ctx.fillStyle = '#eab308';
      ctx.fillRect(16, -40, 7, 20);

      ctx.fillStyle = '#dc2626';
      ctx.fillRect(26, -42, 16, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(32, -32, 10, 4);

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
