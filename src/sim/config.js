// Machine geometry and physics tuning.
// World units: 1 unit = 2.5 cm, so a 25 mm medal has a radius of 0.5.
// Axes: +x right, +y up, +z toward the player.

export const COIN = {
  radius: 0.5,
  halfHeight: 0.055,
  density: 1,
  friction: 0.45,
  restitution: 0.12,
  linearDamping: 0.08,
  angularDamping: 0.35,
};

export const GOLD_COIN = {
  radius: 0.62,
  halfHeight: 0.07,
  density: 1.1,
};

export const BALL = {
  radius: 0.62,
  density: 1.4,
  friction: 0.35,
  restitution: 0.2,
};

export const WORLD = {
  gravity: -55,
  fixedDt: 1 / 60,
  solverIterations: 5,
  softCcd: 0.3,
};

// Half width of the playfield between the side walls.
export const HALF_W = 6;
// Front edge of the lower field. Medals that fall past it are paid out.
export const FRONT_Z = 4;
// Side walls stop here; medals pushed off the sides beyond this point are lost.
export const SIDE_WALL_END_Z = 1.2;

export const PUSHER = {
  halfWidth: HALF_W - 0.02,
  height: 0.9,
  depth: 11,
  frontMin: -5.3, // fully retracted
  frontMax: -2.8, // fully extended
  period: 5.0, // seconds per full stroke
  friction: 0.32,
};

export const BACK_WALL = {
  front: -7.0,
  back: -7.8,
  bottom: PUSHER.height + 0.03,
  top: 3.3,
};

// The inclined stage: medals land here, bounce through pins and fall
// onto the pusher table over the lip.
const STAGE_TOP = { z: -11.6, y: 6.25 };
const STAGE_LIP = { z: -6.9, y: 3.4 };
export const STAGE = {
  top: STAGE_TOP,
  lip: STAGE_LIP,
  thickness: 0.3,
  angle: Math.atan2(STAGE_TOP.y - STAGE_LIP.y, STAGE_LIP.z - STAGE_TOP.z),
  length: Math.hypot(STAGE_TOP.y - STAGE_LIP.y, STAGE_LIP.z - STAGE_TOP.z),
  friction: 0.06,
  pinRadius: 0.13,
  pinHeight: 1.1,
  // Checker gate: two posts at the lip; medals passing between them
  // trigger a slot spin.
  checkerHalfGap: 0.66,
  checkerPostRadius: 0.14,
};

export const DROP = {
  y: 8.2,
  z: -10.6,
  minX: -HALF_W + 0.75,
  maxX: HALF_W - 0.75,
};

// Where payout rain and bonus medals are released.
export const RAIN = {
  y: 7.5,
  minX: -HALF_W + 0.8,
  maxX: HALF_W - 0.8,
  minZ: -1.8,
  maxZ: 2.6,
};

// Removal thresholds.
export const KILL_Y = -1.6;

export const LAYERS = {
  NON_MOVING: 0,
  MOVING: 1,
};

// Material ids reported in contact events (used for sound).
export const MAT = {
  METAL: 1,
  WOOD: 2,
  GLASS: 3,
  PIN: 4,
  COIN: 10,
  GOLD: 11,
  BALL: 12,
  PUSHER: 13,
};

// Stage-local coordinates: s runs down the slope from the top (0) to the lip
// (STAGE.length), x runs across. Returns world-space surface point.
export function stagePoint(x, s, lift = 0) {
  const t = s / STAGE.length;
  const z = STAGE.top.z + (STAGE.lip.z - STAGE.top.z) * t;
  const y = STAGE.top.y + (STAGE.lip.y - STAGE.top.y) * t;
  // Surface normal points up and toward the player.
  const nz = Math.sin(STAGE.angle);
  const ny = Math.cos(STAGE.angle);
  return { x, y: y + ny * lift, z: z + nz * lift };
}

// Pins on the stage, in stage-local coordinates.
export function stagePins() {
  const pins = [];
  // Sparse and staggered: gaps of 3+ medal widths so medals cannot arch
  // between pins and clog the stage.
  const rows = [
    { s: 2.1, xs: [-3.4, 3.4] },
    { s: 3.3, xs: [-1.7, 0, 1.7] },
    { s: 4.35, xs: [-3.6, 3.6] },
  ];
  for (const r of rows) for (const x of r.xs) pins.push({ x, s: r.s });
  return pins;
}
