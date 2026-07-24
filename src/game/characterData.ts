import { CharacterInfo, CharacterId, EnemyType } from '../types';
import feetMasterImg from '../assets/images/feet_master_portrait_1784833325496.jpg';
import funMakerImg from '../assets/images/fun_maker_portrait_1784833339232.jpg';
import omegaBikerImg from '../assets/images/omega_biker_portrait_1784833348944.jpg';
import angryCorsoImg from '../assets/images/angry_corso_portrait_1784833357693.jpg';

export const CHARACTERS: Record<CharacterId, CharacterInfo> = {
  FEET_MASTER: {
    id: 'FEET_MASTER',
    name: 'Feet Master',
    title: 'The Unbreakable Grappler',
    archetype: 'Tank / Grappler',
    visualDesc: 'Brown hair, full beard, specs, plain black shirt, blue jeans, black combat boots.',
    origin: 'Name inspired by his feet fetish. Unleashes devastating ground slams and human bat swings.',
    powerMoveName: 'Human Bat Swing',
    powerMoveDesc: 'Grabs enemies by their feet and swings them in a 360° whirlpool, wiping out all nearby foes with massive AoE damage!',
    portraitUrl: feetMasterImg,
    stats: {
      speed: 2,
      power: 5,
      defense: 5,
      combo: 2,
      range: 4,
    },
    colorTheme: {
      primary: '#3b629b',   // Denim blue
      secondary: '#1c1c1e', // Black tee
      accent: '#f5a623',    // Gold highlight
      glow: 'rgba(59, 98, 155, 0.6)',
    },
    quote: "You're stepping on the wrong turf! Time for a feet-first beatdown!",
  },
  FUN_MAKER: {
    id: 'FUN_MAKER',
    name: 'Fun Maker',
    title: 'The Aerial Hurricane',
    archetype: 'Combo / Aerial Specialist',
    visualDesc: 'Muscular blonde hair, black leather chest harness with silver O-rings, blue jeans, brown shoes.',
    origin: 'Inspired by his love for European Fun Fairs. Combines flashiness with airborne juggling combos.',
    powerMoveName: 'Rollercoaster Hurricane',
    powerMoveDesc: 'Soars into the air in a spinning corkscrew dive, dragging enemies into a high-speed skyward juggling cyclone!',
    portraitUrl: funMakerImg,
    stats: {
      speed: 5,
      power: 3,
      defense: 3,
      combo: 5,
      range: 3,
    },
    colorTheme: {
      primary: '#e2b036',   // Blonde hair yellow
      secondary: '#1e1e24', // Harness black
      accent: '#00e5ff',    // Cyan neon
      glow: 'rgba(226, 176, 54, 0.6)',
    },
    quote: "Hold on tight! This ride has no safety bar!",
  },
  OMEGA_BIKER: {
    id: 'OMEGA_BIKER',
    name: 'Omega Biker',
    title: 'The Heavy Armor Striker',
    archetype: 'Striker / Guard Breaker',
    visualDesc: 'Sleek black motorcycle armor, full-face helmet with dark reflective visor, armored gloves & boots.',
    origin: 'Leather and biker enthusiast. "Omega" represents absolute finality and brutal martial arts impact.',
    powerMoveName: 'Omega Knockback Boot',
    powerMoveDesc: 'Delivers a high-velocity armoured kick accompanied by a kinetic shockwave that smashes through guards and launches enemies across the stage!',
    portraitUrl: omegaBikerImg,
    stats: {
      speed: 3,
      power: 4,
      defense: 4,
      combo: 4,
      range: 3,
    },
    colorTheme: {
      primary: '#17171a',   // Armor dark charcoal
      secondary: '#8899a6', // Visor reflection tint
      accent: '#ff3b30',    // Red brake light glow
      glow: 'rgba(255, 59, 48, 0.6)',
    },
    quote: "The road ends here for your status quo.",
  },
  ANGRY_CORSO: {
    id: 'ANGRY_CORSO',
    name: 'Angry Corso',
    title: 'The Feral Pup Berserker',
    archetype: 'Berserker / Rushdown',
    visualDesc: 'Grey camo dog mask, black leather harness with dog tags, bronzed muscular build, olive shorts, tall camo boots.',
    origin: 'Dedicated PupPlay enthusiast of the powerful Cani Corso breed. Fast gap-closing bites that leech health.',
    powerMoveName: 'Feral Pup Rush & Bite',
    powerMoveDesc: 'Leaps over target enemy with aggressive speed, pinning them down for a ferocious bite attack that leeches health back to Corso!',
    portraitUrl: angryCorsoImg,
    stats: {
      speed: 4,
      power: 4,
      defense: 3,
      combo: 4,
      range: 2,
    },
    colorTheme: {
      primary: '#52575d',   // Camo grey
      secondary: '#3a4233', // Tactical olive shorts
      accent: '#34c759',    // Health leech green
      glow: 'rgba(52, 199, 89, 0.6)',
    },
    quote: "Grrr! You can't leash our freedom!",
  },
};

export interface EnemyInfo {
  type: EnemyType;
  name: string;
  role: string;
  maxHp: number;
  speed: number;
  power: number;
  attackRange: number;
  color: string;
  weaponName?: string;
  description: string;
}

export const ENEMIES: Record<EnemyType, EnemyInfo> = {
  PURITY_PATROL: {
    type: 'PURITY_PATROL',
    name: 'Purity Patrol Grunt',
    role: 'Low-Level Infantry',
    maxHp: 80,
    speed: 1.8,
    power: 10,
    attackRange: 80,
    color: '#e5e5ea',
    weaponName: 'Picket Sign',
    description: 'Pressed khakis and polo shirts. March with synchronized, robotic stiffness wielding heavy picket signs.',
  },
  CONVERSION_THERAPIST: {
    type: 'CONVERSION_THERAPIST',
    name: 'Conversion Therapist',
    role: 'Mid-Tier Ranged Suppressor',
    maxHp: 110,
    speed: 1.4,
    power: 14,
    attackRange: 300,
    color: '#a29bfe',
    weaponName: 'Guilt Vials / Repression Darts',
    description: 'Throws slowing splash vials and repression darts that disable hero Power Moves temporarily.',
  },
  TRAD_WIFE_STRIKER: {
    type: 'TRAD_WIFE_STRIKER',
    name: 'Trad-Wife Striker',
    role: 'Agile Counter-Attacker',
    maxHp: 95,
    speed: 2.7,
    power: 16,
    attackRange: 65,
    color: '#ff7675',
    weaponName: 'Cast-Iron Skillet & Rolling Pin',
    description: 'Fast and nimble. Uses cast-iron skillets to parry heavy attacks and counter with swift rolling pin strikes.',
  },
  BOSS_MADAM_MIZYDIA: {
    type: 'BOSS_MADAM_MIZYDIA',
    name: 'Madam Mizydia',
    role: 'The Ultimate Matriarch (Boss Phase 1 & 2)',
    maxHp: 600,
    speed: 1.2,
    power: 25,
    attackRange: 250,
    color: '#d63031',
    weaponName: 'Status Quo Magic & Censure Barriers',
    description: 'Fights behind a mahogany boardroom altar table. Summons Censure Shields and Excommunication waves.',
  },
  BOSS_SAYONARA: {
    type: 'BOSS_SAYONARA',
    name: 'Sayonara',
    role: 'The Old Guard Guard Dog (Boss Sub-Target)',
    maxHp: 350,
    speed: 2.8,
    power: 20,
    attackRange: 90,
    color: '#6c5ce7',
    weaponName: 'Heavy Knockback Tackle',
    description: 'An old female dog under Mizydia\'s control. Knocking out Mizydia\'s spell breaks her leash so she walks away freely!',
  },
};
