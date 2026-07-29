import { StageConfig } from '../types';
import { heroLine } from './dialogue';
import { assertStagesAreCompletable } from './stageValidation';

export const STAGES: StageConfig[] = [
  {
    id: 1,
    name: 'STAGE 1: NEON NIGHTLIFE DISTRICT',
    subtitle: 'Defend the Sanctuary from the Purity Raid',
    location: 'Downtown Queer Nightlife Quarter',
    bgType: 'STAGE_1_NEON',
    length: 2600,
    musicTrack: 'STAGE1',
    bossTrack: 'STAGE1_BOSS',
    waves: [
      {
        triggerX: 200,
        enemies: [
          { type: 'PURITY_PATROL', count: 3, spawnSide: 'RIGHT' },
        ],
        dialogueBefore: [
          {
            // Was a "Purity Captain" who never existed in the fight. The
            // ultimatum belongs to the patrol that actually walks on screen.
            speaker: 'Purity Patrol',
            portrait: 'PURITY_PATROL',
            text: 'Halt, degenerate heathens! This district is hereby impounded by order of the Ultra Evil League of Conservative Christians!',
            side: 'RIGHT',
          },
          heroLine('FEET_MASTER', {
            FEET_MASTER:
              'You picked the wrong club to raid, khaki boy! Prepare for a boots-first eviction!',
            FUN_MAKER:
              "Impounded? Sweetheart, this block doesn't even close. Let me show you the ride!",
            OMEGA_BIKER: 'Read the room, khakis. Nobody here signed your paperwork.',
            ANGRY_CORSO: 'Woof! Nobody impounds MY street! Grrr!',
          }),
        ],
      },
      {
        triggerX: 700,
        enemies: [
          { type: 'PURITY_PATROL', count: 3, spawnSide: 'BOTH' },
          { type: 'CONVERSION_THERAPIST', count: 1, spawnSide: 'RIGHT' },
        ],
      },
      {
        triggerX: 1300,
        enemies: [
          { type: 'PURITY_PATROL', count: 2, spawnSide: 'LEFT' },
          { type: 'TRAD_WIFE_STRIKER', count: 2, spawnSide: 'RIGHT' },
        ],
        dialogueBefore: [
          {
            // The skillet parry used to be explained by a hero. It belongs to
            // the woman holding the skillet, which frees the hero line to react
            // instead of narrate.
            speaker: 'Trad-Wife Striker',
            portrait: 'TRAD_WIFE_STRIKER',
            text: 'Off the street! We keep a clean block — and I keep a heavy skillet!',
            side: 'RIGHT',
          },
          heroLine('FUN_MAKER', {
            FUN_MAKER: 'Careful! Those cast-iron skillets parry anything heavy!',
            ANGRY_CORSO:
              "Woof! Their skillets are no match for our feral strength! Let me at 'em!",
            FEET_MASTER: 'Cast iron parries the heavy stuff. Go light, go fast, or go around.',
            OMEGA_BIKER: 'Skillets. Of course. Break the guard first, hit second.',
          }),
        ],
      },
      {
        triggerX: 1800, // STAGE 1 BOSS WAVE
        enemies: [
          { type: 'BOSS_SAYONARA', count: 1, spawnSide: 'RIGHT' },
          { type: 'PURITY_PATROL', count: 2, spawnSide: 'LEFT' },
        ],
        dialogueBefore: [
          {
            speaker: 'Sayonara',
            portrait: 'SAYONARA',
            text: 'I am Sayonara... under Madam Mizydia\'s censorship protocol. None shall pass!',
            side: 'RIGHT',
          },
          heroLine('ANGRY_CORSO', {
            FEET_MASTER:
              "Sayonara, snap out of it! We'll knock that mind-control censorship right off you!",
            FUN_MAKER: "Sayonara, it's me! Whatever she put on you, we're taking it off!",
            OMEGA_BIKER: "That's not your voice, girl. That's her collar talking.",
            ANGRY_CORSO: "Sayonara?! No — no, she's OURS! Get that thing off her neck!",
          }),
        ],
      },
    ],
  },
  {
    id: 2,
    name: 'STAGE 2: MONOCHROMATIC SUBURBIA',
    subtitle: 'Smash through the Cookie-Cutter Cul-de-Sac',
    location: 'Cul-de-sac Training Grounds',
    bgType: 'STAGE_2_SUBURB',
    length: 2700,
    musicTrack: 'SUBURBAN_GRAY',
    bossTrack: 'STAGE2_BOSS',
    waves: [
      {
        triggerX: 200,
        enemies: [
          { type: 'PURITY_PATROL', count: 4, spawnSide: 'RIGHT' },
        ],
        dialogueBefore: [
          // Two heroes used to talk to each other here, which meant the wave
          // played as a scene between characters the player might not have
          // picked. One hero reacts now, whoever they are.
          heroLine('OMEGA_BIKER', {
            OMEGA_BIKER:
              "Ugh... look at this place. Pure, soulless gray conformity. Let's leave some skid marks.",
            FEET_MASTER:
              'Gray lawns, gray houses, gray people. Time to paint these picket fences with some vibrant rebellion!',
            FUN_MAKER:
              "Not one balloon on this whole street. That's a crime scene, not a neighborhood.",
            ANGRY_CORSO: 'Every yard smells the same. No dogs. No noise. I hate it here!',
          }),
        ],
      },
      {
        triggerX: 800,
        enemies: [
          { type: 'CONVERSION_THERAPIST', count: 2, spawnSide: 'BOTH' },
          { type: 'TRAD_WIFE_STRIKER', count: 2, spawnSide: 'RIGHT' },
        ],
      },
      {
        triggerX: 1400,
        enemies: [
          { type: 'PURITY_PATROL', count: 3, spawnSide: 'LEFT' },
          { type: 'CONVERSION_THERAPIST', count: 2, spawnSide: 'RIGHT' },
          { type: 'TRAD_WIFE_STRIKER', count: 3, spawnSide: 'RIGHT' },
        ],
      },
      {
        triggerX: 1900, // STAGE 2 BOSS WAVE
        enemies: [
          { type: 'BOSS_MADAM_MIZYDIA', count: 1, spawnSide: 'RIGHT' },
          { type: 'TRAD_WIFE_STRIKER', count: 2, spawnSide: 'BOTH' },
        ],
        dialogueBefore: [
          {
            speaker: 'Madam Mizydia (Hologram)',
            portrait: 'MADAM_MIZYDIA',
            text: 'Impressive work reaching Suburbia. But my Censure Shield is impenetrable! Prepare for corporate purification!',
            side: 'RIGHT',
          },
          heroLine('OMEGA_BIKER', {
            OMEGA_BIKER:
              "Save your speech, Mizydia! We're smashing through your shield and taking down your whole corporate grid!",
            FEET_MASTER: "A hologram with a force field. She won't even show up in person.",
            FUN_MAKER: "Impenetrable? Everything's penetrable from the air, honey.",
            ANGRY_CORSO: "You took Sayonara! I'm biting through that shield to get to you!",
          }),
        ],
      },
    ],
  },
  {
    id: 3,
    isFinalStage: true,
    name: 'FINAL STAGE: MEGA-CHURCH CORPORATE HQ',
    subtitle: 'Dismantle the Global Broadcasting Signal',
    location: 'Pinnacle Tower & Executive Boardroom',
    bgType: 'STAGE_3_CHURCH',
    length: 2000,
    musicTrack: 'SACRED_METAL',
    bossTrack: 'FINAL_BOSS',
    waves: [
      {
        triggerX: 200,
        enemies: [
          { type: 'PURITY_PATROL', count: 3, spawnSide: 'RIGHT' },
          { type: 'TRAD_WIFE_STRIKER', count: 2, spawnSide: 'RIGHT' },
        ],
      },
      {
        triggerX: 600,
        enemies: [
          { type: 'CONVERSION_THERAPIST', count: 3, spawnSide: 'BOTH' },
          { type: 'TRAD_WIFE_STRIKER', count: 3, spawnSide: 'RIGHT' },
        ],
      },
      {
        triggerX: 1200, // FINAL BOSS ENCOUNTER
        enemies: [
          { type: 'BOSS_MADAM_MIZYDIA', count: 1, spawnSide: 'RIGHT' },
          { type: 'BOSS_SAYONARA', count: 1, spawnSide: 'RIGHT' },
        ],
        dialogueBefore: [
          {
            speaker: 'Madam Mizydia',
            portrait: 'MADAM_MIZYDIA',
            text: 'Insolent rabble! You dare bring your loud, colorful chaos into my sacred corporate altar?!',
            side: 'RIGHT',
          },
          // The defiance and the appeal to Sayonara were two lines by two
          // fixed heroes. Merged, because the appeal is plot-critical and had
          // to be made by whoever the player actually brought to the altar.
          heroLine('ANGRY_CORSO', {
            ANGRY_CORSO: "Grrr... Sayonara! Break free from her spell! She's just using you!",
            FEET_MASTER:
              "Your gray empire ends today, Mizydia! Sayonara — snap out of it, she's just using you!",
            FUN_MAKER:
              "Loud and colorful is the whole point! Sayonara, listen to me — that collar isn't you!",
            OMEGA_BIKER:
              'The road ends here for your status quo. Sayonara — drop the leash, girl.',
          }),
          {
            speaker: 'Madam Mizydia',
            portrait: 'MADAM_MIZYDIA',
            text: 'Silence! Sayonara, fetch me their souls! Censure protocol activated!',
            side: 'RIGHT',
          },
        ],
      },
    ],
  },
];

// Fails at module load, in dev, if any wave falls outside the camera's reach.
// In production the engine clamps the trigger and the stage stays playable.
if (import.meta.env.DEV) {
  assertStagesAreCompletable(STAGES);
}

// 16-Bit Multi-Layer Parallax Background Engine
export function renderStageBackground(
  ctx: CanvasRenderingContext2D,
  stageType: StageConfig['bgType'],
  cameraX: number,
  canvasWidth: number,
  canvasHeight: number
) {
  ctx.save();

  if (stageType === 'STAGE_1_NEON') {
    // Stage 1: Nighttime Neon District (16-Bit Cyber-Arcade Aesthetics)
    
    // Layer 1: Distant Sky Gradient & Stars
    const skyGradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    skyGradient.addColorStop(0, '#090514');
    skyGradient.addColorStop(0.4, '#1a0d2e');
    skyGradient.addColorStop(1, '#08020d');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Distant Stars (Slowest Parallax)
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 25; i++) {
      const sx = (i * 90 - cameraX * 0.05) % canvasWidth;
      const sy = 15 + (i * 17) % 80;
      ctx.fillRect(sx < 0 ? sx + canvasWidth : sx, sy, 2, 2);
    }

    // Layer 2: Deep Skyline (0.15x Parallax)
    const farBuildingWidth = 120;
    const farOffset = -(cameraX * 0.15) % farBuildingWidth;
    for (let x = farOffset - farBuildingWidth; x < canvasWidth + farBuildingWidth; x += farBuildingWidth) {
      ctx.fillStyle = '#110a21';
      ctx.fillRect(x, 60, 95, canvasHeight - 60);
      // Windows
      ctx.fillStyle = '#f39c12';
      for (let wy = 80; wy < canvasHeight - 220; wy += 20) {
        if ((Math.floor(x) + wy) % 5 === 0) {
          ctx.fillRect(x + 12, wy, 14, 8);
          ctx.fillRect(x + 36, wy, 14, 8);
          ctx.fillRect(x + 60, wy, 14, 8);
        }
      }
    }

    // Layer 3: Midground Club Fronts & Neon Billboards (0.4x Parallax)
    const neonX = 280 - cameraX * 0.4;
    if (neonX > -350 && neonX < canvasWidth + 350) {
      // Building Structure
      ctx.fillStyle = '#1d1230';
      ctx.fillRect(neonX, 100, 260, 180);
      ctx.fillStyle = '#2d1c47'; // Roof ledge
      ctx.fillRect(neonX - 10, 95, 280, 10);

      // Rainbow Lounge Neon Sign with 16-Bit Glow & Drop Shadows
      ctx.shadowColor = '#ff007f';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#ff007f';
      ctx.font = 'black 20px monospace';
      ctx.fillText('★ RAINBOW LOUNGE ★', neonX + 15, 138);
      ctx.shadowColor = '#00ffff';
      ctx.fillStyle = '#00ffff';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('LIVE PUNK ROCK & REBELLION', neonX + 20, 168);
      ctx.shadowBlur = 0;

      // Neon Brickwork Lines
      ctx.strokeStyle = 'rgba(255, 0, 127, 0.2)';
      ctx.lineWidth = 1;
      for (let by = 180; by < 280; by += 16) {
        ctx.beginPath();
        ctx.moveTo(neonX, by);
        ctx.lineTo(neonX + 260, by);
        ctx.stroke();
      }
    }

    // Layer 4: Foreground Wet Asphalt & Sidewalk (1.0x Full Camera Motion)
    const streetTop = canvasHeight - 210;
    const streetGradient = ctx.createLinearGradient(0, streetTop, 0, canvasHeight);
    streetGradient.addColorStop(0, '#151020');
    streetGradient.addColorStop(0.3, '#0b0812');
    streetGradient.addColorStop(1, '#050408');
    ctx.fillStyle = streetGradient;
    ctx.fillRect(0, streetTop, canvasWidth, 210);

    // Sidewalk Curb with Metallic Trim
    ctx.fillStyle = '#3a2c4d';
    ctx.fillRect(0, streetTop, canvasWidth, 10);
    ctx.fillStyle = '#5c467a';
    ctx.fillRect(0, streetTop, canvasWidth, 3);

    // Sidewalk Paving Blocks
    ctx.strokeStyle = '#281e36';
    ctx.lineWidth = 2;
    for (let cx = -(cameraX) % 40; cx < canvasWidth; cx += 40) {
      ctx.beginPath();
      ctx.moveTo(cx, streetTop);
      ctx.lineTo(cx, streetTop + 10);
      ctx.stroke();
    }

    // Wet Street Neon Reflections (Glossy 16-Bit Streaks)
    ctx.fillStyle = 'rgba(255, 0, 127, 0.22)';
    ctx.fillRect(0, streetTop + 35, canvasWidth, 18);
    ctx.fillStyle = 'rgba(0, 240, 255, 0.20)';
    ctx.fillRect(0, streetTop + 95, canvasWidth, 24);
    ctx.fillStyle = 'rgba(255, 238, 0, 0.15)';
    ctx.fillRect(0, streetTop + 150, canvasWidth, 15);

  } else if (stageType === 'STAGE_2_SUBURB') {
    // Stage 2: Monochromatic Suburbia (16-bit Dystopian Palette)
    
    // Layer 1: Overcast Clouded Sky
    const skyGradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    skyGradient.addColorStop(0, '#5a6268');
    skyGradient.addColorStop(0.6, '#8d99ae');
    skyGradient.addColorStop(1, '#b0b9c6');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Moving Clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    for (let i = 0; i < 4; i++) {
      const cx = ((i * 220) - cameraX * 0.1) % (canvasWidth + 200);
      ctx.beginPath();
      ctx.arc(cx - 50, 60, 40, 0, Math.PI * 2);
      ctx.arc(cx, 50, 50, 0, Math.PI * 2);
      ctx.arc(cx + 50, 60, 40, 0, Math.PI * 2);
      ctx.fill();
    }

    // Layer 2: Cookie-Cutter Houses (0.35x Parallax)
    const houseWidth = 180;
    const houseOffset = -(cameraX * 0.35) % houseWidth;
    for (let x = houseOffset - houseWidth; x < canvasWidth + houseWidth; x += houseWidth) {
      // House Body
      ctx.fillStyle = '#7f8c8d';
      ctx.fillRect(x, 120, 160, 130);
      // Roof
      ctx.fillStyle = '#2c3e50';
      ctx.beginPath();
      ctx.moveTo(x - 12, 120);
      ctx.lineTo(x + 80, 65);
      ctx.lineTo(x + 172, 120);
      ctx.fill();
      // Propaganda Sign Banner
      ctx.fillStyle = '#34495e';
      ctx.fillRect(x + 20, 150, 120, 45);
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('⚡ GRAY IS VIRTUE ⚡', x + 23, 177);
    }

    // Layer 3: Lawn & Picket Fence (0.7x Parallax)
    const streetTop = canvasHeight - 210;
    ctx.fillStyle = '#5c6b73'; // Dull Lawn
    ctx.fillRect(0, streetTop - 25, canvasWidth, 25);

    // Picket Fence
    ctx.fillStyle = '#e0e6ed';
    for (let fx = -(cameraX * 0.7) % 20; fx < canvasWidth; fx += 20) {
      ctx.fillRect(fx, streetTop - 42, 8, 25);
      // Fence post tip triangle
      ctx.beginPath();
      ctx.moveTo(fx, streetTop - 42);
      ctx.lineTo(fx + 4, streetTop - 48);
      ctx.lineTo(fx + 8, streetTop - 42);
      ctx.fill();
    }

    // Layer 4: Asphalt Road & Dashed Centerline (1.0x Full Motion)
    ctx.fillStyle = '#2b3a4a';
    ctx.fillRect(0, streetTop, canvasWidth, 210);

    ctx.fillStyle = '#f1c40f';
    for (let rx = -(cameraX) % 70; rx < canvasWidth; rx += 70) {
      ctx.fillRect(rx, streetTop + 95, 38, 7);
    }

  } else if (stageType === 'STAGE_3_CHURCH') {
    // Stage 3: Mega-Church Corporate HQ Boardroom
    
    // Layer 1: Vaulted Cathedral Ceiling & Dark Background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    bgGradient.addColorStop(0, '#0a0812');
    bgGradient.addColorStop(0.5, '#161324');
    bgGradient.addColorStop(1, '#08060d');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Stained-Glass Glass Windows (0.2x Parallax)
    const glassX = 180 - cameraX * 0.2;
    ctx.fillStyle = 'rgba(231, 76, 60, 0.25)';
    ctx.fillRect(glassX, 35, 140, 200);
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 4;
    ctx.strokeRect(glassX, 35, 140, 200);

    // Stained Glass Stock Market Line Graph
    ctx.strokeStyle = '#2ecc71';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(glassX + 10, 200);
    ctx.lineTo(glassX + 50, 160);
    ctx.lineTo(glassX + 90, 110);
    ctx.lineTo(glassX + 130, 50);
    ctx.stroke();

    // Jumbo Corporate LED Ticker Screen (0.4x Parallax)
    const screenX = 580 - cameraX * 0.4;
    ctx.fillStyle = '#050508';
    ctx.fillRect(screenX, 45, 220, 130);
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 3;
    ctx.strokeRect(screenX, 45, 220, 130);

    ctx.fillStyle = '#ff7675';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('[LIVE SIN METRICS]', screenX + 20, 75);
    ctx.fillStyle = '#00ffff';
    ctx.fillText('DIVERSITY: 0.00%', screenX + 20, 100);
    ctx.fillText('PROFIT: +999.9%', screenX + 20, 125);

    // Layer 2: Polished Marble Floor with Reflective Tile Grid (1.0x Full Motion)
    const floorTop = canvasHeight - 210;
    const floorGradient = ctx.createLinearGradient(0, floorTop, 0, canvasHeight);
    floorGradient.addColorStop(0, '#1a1b22');
    floorGradient.addColorStop(1, '#090a0d');
    ctx.fillStyle = floorGradient;
    ctx.fillRect(0, floorTop, canvasWidth, 210);

    // Tile Grid Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    for (let gx = -(cameraX) % 90; gx < canvasWidth; gx += 90) {
      ctx.beginPath();
      ctx.moveTo(gx, floorTop);
      ctx.lineTo(gx - 110, canvasHeight);
      ctx.stroke();
    }
  }

  ctx.restore();
}

