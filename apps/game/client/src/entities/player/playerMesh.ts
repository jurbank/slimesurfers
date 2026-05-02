import * as THREE from "three";
import { getWeaponDefinition, WeaponId } from "@splat/content/combat/weaponDefs.ts";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { createSlimeMaterial } from "../../materials/slimeMaterial.ts";
import { createOutlineMaterial } from "@splat/client-runtime/materials/outlineMaterial.ts";
import { createPlayerDeathParticles, type PlayerDeathParticles } from "./playerDeath.ts";

function buildSnowboardGeom(
  halfW: number,
  halfLen: number,
  halfT: number,
  upturnPeak: number,
  tipTaper: number,
  N: number,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];

  const hwAt = (z: number) => Math.max(halfW * 0.33, halfW - tipTaper * (z / halfLen) ** 2);
  const yAt = (z: number) => upturnPeak * Math.abs(z / halfLen) ** 2.6;

  for (let i = 0; i <= N; i++) {
    const z = -halfLen + (2 * halfLen * i) / N;
    const hw = hwAt(z);
    const yo = yAt(z);
    pos.push(-hw, yo + halfT, z); // 4i   TL
    pos.push(+hw, yo + halfT, z); // 4i+1 TR
    pos.push(+hw, yo - halfT, z); // 4i+2 BR
    pos.push(-hw, yo - halfT, z); // 4i+3 BL
  }

  for (let i = 0; i < N; i++) {
    const a = 4 * i;
    const b = 4 * (i + 1);
    idx.push(a, a + 1, b + 1, a, b + 1, b); // top
    idx.push(a + 3, b + 3, b + 2, a + 3, b + 2, a + 2); // bottom
    idx.push(a, a + 3, b + 3, a, b + 3, b); // left
    idx.push(a + 1, b + 1, b + 2, a + 1, b + 2, a + 2); // right
  }

  const f = 4 * N;
  idx.push(f, f + 1, f + 2, f, f + 2, f + 3); // front cap
  idx.push(0, 3, 2, 0, 2, 1); // back cap

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildStripeGeom(
  halfW: number,
  halfLen: number,
  boardHalfT: number,
  upturnPeak: number,
  N: number,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];

  for (let i = 0; i <= N; i++) {
    const z = -halfLen + (2 * halfLen * i) / N;
    const t = Math.abs(z / halfLen);
    const yo = upturnPeak * t ** 2.6 + boardHalfT + 0.004;
    pos.push(-halfW, yo, z);
    pos.push(+halfW, yo, z);
  }

  for (let i = 0; i < N; i++) {
    const a = 2 * i;
    const b = 2 * (i + 1);
    idx.push(a, a + 1, b + 1, a, b + 1, b);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface PlayerMeshRig {
  group: THREE.Group;
  liveMesh: THREE.Group;
  deadMesh: THREE.Group;
  deathParticles: PlayerDeathParticles;
  face: PlayerFaceRig;
  poseRig: PlayerPoseRig;
  weaponMesh: THREE.Group;
  weaponFallbackMesh: THREE.Mesh;
  snowboardMesh: THREE.Group;
  outlineMesh: THREE.Group;
  jsrOutline: THREE.Group;
  disturbanceMesh: THREE.Mesh;
  trickChargeAura: THREE.Group;
  slimeMaterials: THREE.ShaderMaterial[];
}

export interface PlayerPosePart {
  mesh: THREE.Mesh;
  outline: THREE.Mesh;
  jsrOutline: THREE.Mesh;
  trickOutline: THREE.Mesh;
}

export interface PlayerPoseRig {
  leftArm: PlayerPosePart;
  rightArm: PlayerPosePart;
  frontFoot: PlayerPosePart;
  rearFoot: PlayerPosePart;
}

type AppendageKey = keyof PlayerPoseRig;
export type PlayerFaceExpression = "normal" | "spewing";

export interface PlayerFaceRig {
  mesh: THREE.Group;
  material: THREE.MeshBasicMaterial;
  setExpression: (expression: PlayerFaceExpression) => void;
}

const FACE_IMAGE_PATHS: Record<PlayerFaceExpression, string> = {
  normal: "/images/player-faces/normal.png",
  spewing: "/images/player-faces/spewing.png",
};
const FACE_IMAGE_ASPECT = 179 / 135;
const FACE_SURFACE_OFFSET = 0.006;
const faceTextureCache: Partial<Record<PlayerFaceExpression, THREE.Texture>> = {};

function getFaceTexture(expression: PlayerFaceExpression): THREE.Texture {
  const cached = faceTextureCache[expression];
  if (cached) return cached;

  if (typeof window === "undefined") {
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    texture.needsUpdate = true;
    faceTextureCache[expression] = texture;
    return texture;
  }

  const texture = new THREE.TextureLoader().load(FACE_IMAGE_PATHS[expression]);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  faceTextureCache[expression] = texture;
  return texture;
}

function buildCurvedRectPatchGeometry(
  width: number,
  height: number,
  bodyRadius: number,
  yOffset: number,
  surfaceOffset: number,
  columns = 16,
  rows = 12,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= rows; row++) {
    const v = row / rows;
    const y = yOffset + (0.5 - v) * height;
    for (let column = 0; column <= columns; column++) {
      const u = column / columns;
      const x = (u - 0.5) * width;
      const z = Math.sqrt(Math.max(0, bodyRadius * bodyRadius - x * x - y * y)) + surfaceOffset;
      positions.push(x, y, z);
      uvs.push(u, 1 - v);
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildCurvedCirclePatchGeometry(
  radius: number,
  bodyRadius: number,
  yOffset: number,
  surfaceOffset: number,
  radialSegments = 8,
  angularSegments = 48,
): THREE.BufferGeometry {
  const positions: number[] = [0, yOffset, bodyRadius + surfaceOffset];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];

  for (let ring = 1; ring <= radialSegments; ring++) {
    const r = (radius * ring) / radialSegments;
    for (let segment = 0; segment < angularSegments; segment++) {
      const theta = (segment / angularSegments) * Math.PI * 2;
      const x = Math.cos(theta) * r;
      const y = yOffset + Math.sin(theta) * r;
      const z = Math.sqrt(Math.max(0, bodyRadius * bodyRadius - x * x - y * y)) + surfaceOffset;
      positions.push(x, y, z);
      uvs.push(0.5 + x / (radius * 2), 0.5 + (y - yOffset) / (radius * 2));
    }
  }

  for (let segment = 0; segment < angularSegments; segment++) {
    indices.push(0, 1 + segment, 1 + ((segment + 1) % angularSegments));
  }

  for (let ring = 1; ring < radialSegments; ring++) {
    const innerStart = 1 + (ring - 1) * angularSegments;
    const outerStart = 1 + ring * angularSegments;
    for (let segment = 0; segment < angularSegments; segment++) {
      const next = (segment + 1) % angularSegments;
      const a = innerStart + segment;
      const b = innerStart + next;
      const c = outerStart + segment;
      const d = outerStart + next;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createPlayerFace(bodyRadius: number): PlayerFaceRig {
  let currentExpression: PlayerFaceExpression = "normal";
  const faceHeight = bodyRadius * 1.08;
  const faceWidth = faceHeight * FACE_IMAGE_ASPECT;
  const faceYOffset = -bodyRadius * 0.03;
  const group = new THREE.Group();

  const backing = new THREE.Mesh(
    buildCurvedCirclePatchGeometry(faceWidth * 0.52, bodyRadius, faceYOffset, FACE_SURFACE_OFFSET),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  backing.renderOrder = 2;
  group.add(backing);

  const material = new THREE.MeshBasicMaterial({
    map: getFaceTexture(currentExpression),
    transparent: true,
    alphaTest: 0.02,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(
    buildCurvedRectPatchGeometry(
      faceWidth,
      faceHeight,
      bodyRadius,
      faceYOffset,
      FACE_SURFACE_OFFSET * 1.8,
    ),
    material,
  );
  mesh.renderOrder = 3;
  group.add(mesh);

  return {
    mesh: group,
    material,
    setExpression(expression: PlayerFaceExpression): void {
      if (expression === currentExpression) return;
      currentExpression = expression;
      material.map = getFaceTexture(expression);
      material.needsUpdate = true;
    },
  };
}

export function createPlayerMesh(slimeColor: number, patternId = 0): PlayerMeshRig {
  const group = new THREE.Group();
  const liveMesh = new THREE.Group();
  const liveVisualMesh = new THREE.Group();
  const deadMesh = new THREE.Group();
  const slimeMaterials: THREE.ShaderMaterial[] = [];
  liveVisualMesh.scale.setScalar(GAME_CONFIG.player.visualScale);
  liveMesh.add(liveVisualMesh);
  deadMesh.scale.setScalar(GAME_CONFIG.player.visualScale);
  group.add(liveMesh);
  group.add(deadMesh);

  // 1. Body (the blob)
  const bodyRadius = GAME_CONFIG.movement.collisionRadius / GAME_CONFIG.player.visualScale;
  const bodyGeom = new THREE.SphereGeometry(bodyRadius, 32, 24);
  const bodyMat = createSlimeMaterial(slimeColor, patternId);
  slimeMaterials.push(bodyMat);
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  liveVisualMesh.add(body);

  // 2. Bunny Ears
  const earGeom = new THREE.CapsuleGeometry(0.08, 0.3, 4, 8);
  const earMat = createSlimeMaterial(slimeColor, patternId);
  slimeMaterials.push(earMat);

  const leftEar = new THREE.Mesh(earGeom, earMat);
  leftEar.position.set(-0.2, 0.4, 0);
  leftEar.rotation.z = Math.PI / 10;
  liveVisualMesh.add(leftEar);

  const rightEar = new THREE.Mesh(earGeom, earMat);
  rightEar.position.set(0.2, 0.4, 0);
  rightEar.rotation.z = -Math.PI / 10;
  liveVisualMesh.add(rightEar);

  // 3. Arms and Feet
  const appendageRadius = bodyRadius * 0.28;
  const appendageGeom = new THREE.SphereGeometry(appendageRadius, 16, 12);
  const appendageMat = createSlimeMaterial(slimeColor, patternId);
  slimeMaterials.push(appendageMat);

  const appendagePositions: Array<{ key: AppendageKey; x: number; y: number; z: number }> = [
    { key: "leftArm", x: -bodyRadius * 0.92, y: -bodyRadius * 0.04, z: bodyRadius * 0.04 },
    { key: "rightArm", x: bodyRadius * 0.92, y: -bodyRadius * 0.04, z: bodyRadius * 0.04 },
    { key: "frontFoot", x: -bodyRadius * 0.38, y: -bodyRadius * 0.9, z: bodyRadius * 0.2 },
    { key: "rearFoot", x: bodyRadius * 0.38, y: -bodyRadius * 0.9, z: bodyRadius * 0.2 },
  ];
  const appendages: Record<
    AppendageKey,
    { mesh: THREE.Mesh; outline?: THREE.Mesh; jsrOutline?: THREE.Mesh; trickOutline?: THREE.Mesh }
  > = {} as Record<
    AppendageKey,
    { mesh: THREE.Mesh; outline?: THREE.Mesh; jsrOutline?: THREE.Mesh; trickOutline?: THREE.Mesh }
  >;

  for (const pos of appendagePositions) {
    const appendage = new THREE.Mesh(appendageGeom, appendageMat);
    appendage.position.set(pos.x, pos.y, pos.z);
    appendages[pos.key] = { mesh: appendage };
    liveVisualMesh.add(appendage);
  }

  const face = createPlayerFace(bodyRadius);
  liveVisualMesh.add(face.mesh);

  const snowboardMesh = new THREE.Group();

  const BOARD_HALF_W = 0.39;
  const BOARD_HALF_LEN = 0.675;
  const BOARD_HALF_T = 0.04;
  const BOARD_UPTURN = 0.14;
  const BOARD_SEGS = 20;

  const boardGeom = buildSnowboardGeom(
    BOARD_HALF_W,
    BOARD_HALF_LEN,
    BOARD_HALF_T,
    BOARD_UPTURN,
    0.13,
    BOARD_SEGS,
  );
  const boardMat = new THREE.MeshLambertMaterial({
    color: 0x1f2430,
    emissive: 0x080a10,
    emissiveIntensity: 0.18,
  });
  const board = new THREE.Mesh(boardGeom, boardMat);
  snowboardMesh.add(board);

  const stripeGeom = buildStripeGeom(0.04, BOARD_HALF_LEN, BOARD_HALF_T, BOARD_UPTURN, BOARD_SEGS);
  const stripeMat = new THREE.MeshBasicMaterial({ color: slimeColor });
  const stripe = new THREE.Mesh(stripeGeom, stripeMat);
  snowboardMesh.add(stripe);

  // Bindings
  const boardTopAt = (z: number) =>
    BOARD_UPTURN * Math.abs(z / BOARD_HALF_LEN) ** 2.6 + BOARD_HALF_T;
  const bindingMat = new THREE.MeshLambertMaterial({
    color: 0x3a3a44,
    emissive: 0x0a0a10,
    emissiveIntensity: 0.2,
  });
  const bindingGeom = new THREE.BoxGeometry(0.3, 0.026, 0.21);
  const frontBinding = new THREE.Mesh(bindingGeom, bindingMat);
  frontBinding.position.set(0, boardTopAt(0.27) + 0.013, 0.27);
  snowboardMesh.add(frontBinding);
  const rearBinding = new THREE.Mesh(bindingGeom, bindingMat);
  rearBinding.position.set(0, boardTopAt(-0.23) + 0.013, -0.23);
  snowboardMesh.add(rearBinding);

  snowboardMesh.position.set(0, -0.58, 0);
  snowboardMesh.visible = false;
  liveVisualMesh.add(snowboardMesh);

  // 6. Debug Collider
  if (GAME_CONFIG.debug.showColliders) {
    const colliderGeom = new THREE.SphereGeometry(GAME_CONFIG.movement.collisionRadius, 16, 16);
    const colliderMat = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
    });
    const colliderMesh = new THREE.Mesh(colliderGeom, colliderMat);
    liveMesh.add(colliderMesh);
  }

  const deathParticles = createPlayerDeathParticles(slimeColor, bodyRadius);
  deadMesh.add(deathParticles.root);
  deadMesh.visible = false;

  const weaponGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.95, 12);
  const weaponMat = new THREE.MeshLambertMaterial({
    color: getWeaponDefinition(WeaponId.Bazooka).pickupColor,
    emissive: getWeaponDefinition(WeaponId.Bazooka).pickupColor,
    emissiveIntensity: 0.4,
  });
  const weaponMesh = new THREE.Group();
  const weaponFallbackMesh = new THREE.Mesh(weaponGeom, weaponMat);
  weaponMesh.add(weaponFallbackMesh);
  weaponMesh.position.set(0.52, -0.02, 0.28);
  weaponMesh.rotation.x = Math.PI / 2;
  weaponMesh.rotation.y = Math.PI / 18;
  weaponMesh.visible = false;
  liveVisualMesh.add(weaponMesh);

  // Inverted-hull outline
  const outlineMat = new THREE.MeshBasicMaterial({
    color: slimeColor,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });
  const outlineMesh = new THREE.Group();
  outlineMesh.scale.setScalar(GAME_CONFIG.player.visualScale);
  outlineMesh.visible = false;

  const bodyOutline = new THREE.Mesh(bodyGeom, outlineMat);
  bodyOutline.scale.setScalar(1.18);
  outlineMesh.add(bodyOutline);

  const leftEarOutline = new THREE.Mesh(earGeom, outlineMat);
  leftEarOutline.position.copy(leftEar.position);
  leftEarOutline.rotation.copy(leftEar.rotation);
  leftEarOutline.scale.setScalar(1.18);
  outlineMesh.add(leftEarOutline);

  const rightEarOutline = new THREE.Mesh(earGeom, outlineMat);
  rightEarOutline.position.copy(rightEar.position);
  rightEarOutline.rotation.copy(rightEar.rotation);
  rightEarOutline.scale.setScalar(1.18);
  outlineMesh.add(rightEarOutline);

  for (const appendage of Object.values(appendages)) {
    const appendageOutline = new THREE.Mesh(appendageGeom, outlineMat);
    appendageOutline.position.copy(appendage.mesh.position);
    appendageOutline.scale.setScalar(1.18);
    appendage.outline = appendageOutline;
    outlineMesh.add(appendageOutline);
  }

  group.add(outlineMesh);

  // 6. JSR Style Permanent Outline
  const jsrOutline = new THREE.Group();
  const jsrOutlineMat = createOutlineMaterial();

  const bodyJsr = new THREE.Mesh(bodyGeom, jsrOutlineMat);
  jsrOutline.add(bodyJsr);

  const leftEarJsr = new THREE.Mesh(earGeom, jsrOutlineMat);
  leftEarJsr.position.copy(leftEar.position);
  leftEarJsr.rotation.copy(leftEar.rotation);
  jsrOutline.add(leftEarJsr);

  const rightEarJsr = new THREE.Mesh(earGeom, jsrOutlineMat);
  rightEarJsr.position.copy(rightEar.position);
  rightEarJsr.rotation.copy(rightEar.rotation);
  jsrOutline.add(rightEarJsr);

  for (const appendage of Object.values(appendages)) {
    const appendageJsr = new THREE.Mesh(appendageGeom, jsrOutlineMat);
    appendageJsr.position.copy(appendage.mesh.position);
    appendage.jsrOutline = appendageJsr;
    jsrOutline.add(appendageJsr);
  }

  liveVisualMesh.add(jsrOutline);

  // 7. Trick Charge Aura (Inverted Hull)
  const trickOutlineMat = new THREE.MeshBasicMaterial({
    color: slimeColor,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const trickChargeAura = new THREE.Group();
  trickChargeAura.visible = false;

  const bodyTrick = new THREE.Mesh(bodyGeom, trickOutlineMat);
  bodyTrick.scale.setScalar(1.25);
  trickChargeAura.add(bodyTrick);

  const leftEarTrick = new THREE.Mesh(earGeom, trickOutlineMat);
  leftEarTrick.position.copy(leftEar.position);
  leftEarTrick.rotation.copy(leftEar.rotation);
  leftEarTrick.scale.setScalar(1.25);
  trickChargeAura.add(leftEarTrick);

  const rightEarTrick = new THREE.Mesh(earGeom, trickOutlineMat);
  rightEarTrick.position.copy(rightEar.position);
  rightEarTrick.rotation.copy(rightEar.rotation);
  rightEarTrick.scale.setScalar(1.25);
  trickChargeAura.add(rightEarTrick);

  for (const appendage of Object.values(appendages)) {
    const appendageTrick = new THREE.Mesh(appendageGeom, trickOutlineMat);
    appendageTrick.position.copy(appendage.mesh.position);
    appendageTrick.scale.setScalar(1.25);
    appendage.trickOutline = appendageTrick;
    trickChargeAura.add(appendageTrick);
  }

  liveVisualMesh.add(trickChargeAura);

  const poseRig: PlayerPoseRig = {
    leftArm: {
      mesh: appendages.leftArm.mesh,
      outline: appendages.leftArm.outline!,
      jsrOutline: appendages.leftArm.jsrOutline!,
      trickOutline: appendages.leftArm.trickOutline!,
    },
    rightArm: {
      mesh: appendages.rightArm.mesh,
      outline: appendages.rightArm.outline!,
      jsrOutline: appendages.rightArm.jsrOutline!,
      trickOutline: appendages.rightArm.trickOutline!,
    },
    frontFoot: {
      mesh: appendages.frontFoot.mesh,
      outline: appendages.frontFoot.outline!,
      jsrOutline: appendages.frontFoot.jsrOutline!,
      trickOutline: appendages.frontFoot.trickOutline!,
    },
    rearFoot: {
      mesh: appendages.rearFoot.mesh,
      outline: appendages.rearFoot.outline!,
      jsrOutline: appendages.rearFoot.jsrOutline!,
      trickOutline: appendages.rearFoot.trickOutline!,
    },
  };

  const disturbanceMat = new THREE.MeshBasicMaterial({
    color: slimeColor,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const disturbanceMesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.055, 6, 28),
    disturbanceMat,
  );
  disturbanceMesh.rotation.x = Math.PI / 2;
  disturbanceMesh.position.y = -0.3;
  disturbanceMesh.visible = false;
  group.add(disturbanceMesh);

  return {
    group,
    liveMesh,
    deadMesh,
    deathParticles,
    face,
    poseRig,
    weaponMesh,
    weaponFallbackMesh,
    snowboardMesh,
    outlineMesh,
    jsrOutline,
    disturbanceMesh,
    trickChargeAura,
    slimeMaterials,
  };
}
