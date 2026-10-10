// Static parts of the cabinet. Shared by the physics world (colliders)
// and the renderer (meshes), so both always agree on the geometry.
import {
  HALF_W, FRONT_Z, SIDE_WALL_END_Z, BACK_WALL, STAGE, MAT,
  stagePoint, stagePins,
} from './config.js';

function quatX(angle) {
  return [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)];
}

const IDENTITY = [0, 0, 0, 1];

export const CHECKER_POST_HALF = 0.5;
export const CHECKER_POST_S = STAGE.length - 0.3;

// Centre of a torii post standing upright on the stage near the lip.
export function checkerPostPos(side, halfGap) {
  const w = stagePoint(side * (halfGap + STAGE.checkerPostRadius), CHECKER_POST_S, 0);
  return { x: w.x, y: w.y + CHECKER_POST_HALF - 0.05, z: w.z };
}

export function buildMachineParts() {
  const parts = [];
  const box = (name, pos, half, opts = {}) =>
    parts.push({ shape: 'box', name, pos, half, quat: opts.quat || IDENTITY, mat: MAT.METAL, friction: 0.3, restitution: 0.1, ...opts });
  const cyl = (name, pos, radius, halfHeight, opts = {}) =>
    parts.push({ shape: 'cyl', name, pos, radius, halfHeight, quat: opts.quat || IDENTITY, mat: MAT.PIN, friction: 0.2, restitution: 0.35, ...opts });

  const backZ = -14;
  // Lower field, running under the pusher.
  box('floor', [0, -0.5, (backZ + FRONT_Z) / 2], [HALF_W, 0.5, (FRONT_Z - backZ) / 2], { friction: 0.5 });

  // Side walls. The front segment can be removed (the oni boss night).
  const cut = SIDE_WALL_END_Z - 2.2;
  const wallLen = cut - backZ;
  for (const side of [-1, 1]) {
    box('wall', [side * (HALF_W + 0.3), 4.25, backZ + wallLen / 2], [0.3, 4.75, wallLen / 2], { mat: MAT.WOOD, friction: 0.1, slick: true });
    box('wallFront', [side * (HALF_W + 0.3), 0.75, (cut + SIDE_WALL_END_Z) / 2], [0.3, 1.25, (SIDE_WALL_END_Z - cut) / 2], { mat: MAT.WOOD, friction: 0.2 });
  }

  // Extra side guards toward the front; only switched on by a charm.
  for (const side of [-1, 1]) {
    box('sideGuard', [side * (HALF_W + 0.15), 0.6, SIDE_WALL_END_Z + 1.1], [0.15, 0.6, 1.1], { mat: MAT.WOOD, friction: 0.2, enabled: false });
  }

  // Wall above the pusher that scrapes medals off the pusher table.
  box('backWall',
    [0, (BACK_WALL.bottom + BACK_WALL.top) / 2, (BACK_WALL.front + BACK_WALL.back) / 2],
    [HALF_W, (BACK_WALL.top - BACK_WALL.bottom) / 2, (BACK_WALL.front - BACK_WALL.back) / 2]);

  // Inclined stage plate.
  const q = quatX(STAGE.angle);
  const ext = 0.4; // run the plate a little past the top into the back wall
  const c = stagePoint(0, STAGE.length / 2 - ext / 2, -STAGE.thickness / 2);
  box('stage', [c.x, c.y, c.z], [HALF_W, STAGE.thickness / 2, STAGE.length / 2 + ext / 2], { quat: q, friction: STAGE.friction, mat: MAT.METAL, slick: true });

  // Back board behind the stage.
  box('stageBack', [0, 8.5, STAGE.top.z - 0.4], [HALF_W, 4.5, 0.4], { mat: MAT.WOOD, friction: 0.05, slick: true });

  // Pins, perpendicular to the stage surface.
  for (const p of stagePins()) {
    const w = stagePoint(p.x, p.s, STAGE.pinHeight / 2);
    cyl('pin', [w.x, w.y, w.z], STAGE.pinRadius, STAGE.pinHeight / 2, { quat: q, friction: 0.05, slick: true });
  }

  // Checker gate (the torii) at the lip: two upright posts.
  for (const side of [-1, 1]) {
    const w = checkerPostPos(side, STAGE.checkerHalfGap);
    cyl('checkerPost', [w.x, w.y, w.z], STAGE.checkerPostRadius, CHECKER_POST_HALF, { restitution: 0.3, friction: 0.05, slick: true });
  }

  // Front glass. Keeps medals from flying at the player during payout rain.
  box('glass', [0, 6.3, FRONT_Z + 0.75], [HALF_W + 0.6, 4.6, 0.05], { mat: MAT.GLASS, friction: 0.1, visual: false });

  return parts;
}
