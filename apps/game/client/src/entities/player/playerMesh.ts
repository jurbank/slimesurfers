import * as THREE from "three";
import { getWeaponDefinition, WeaponId } from "@splat/content/combat/weaponDefs.ts";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { createSlimeMaterial } from "../../materials/slimeMaterial.ts";
import { createOutlineMaterial } from "../../materials/outlineMaterial.ts";
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
}

export interface PlayerPoseRig {
  leftArm: PlayerPosePart;
  rightArm: PlayerPosePart;
  frontFoot: PlayerPosePart;
  rearFoot: PlayerPosePart;
}

type AppendageKey = keyof PlayerPoseRig;

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
    { mesh: THREE.Mesh; outline?: THREE.Mesh; jsrOutline?: THREE.Mesh }
  > = {} as Record<
    AppendageKey,
    { mesh: THREE.Mesh; outline?: THREE.Mesh; jsrOutline?: THREE.Mesh }
  >;

  for (const pos of appendagePositions) {
    const appendage = new THREE.Mesh(appendageGeom, appendageMat);
    appendage.position.set(pos.x, pos.y, pos.z);
    appendages[pos.key] = { mesh: appendage };
    liveVisualMesh.add(appendage);
  }

  // 4. 4 Alien Eyes
  const eyeGeom = new THREE.SphereGeometry(0.05, 8, 8);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

  const eyePositions = [
    { x: -0.15, y: 0.15, z: 0.4 }, // Top left
    { x: 0.15, y: 0.15, z: 0.4 }, // Top right
    { x: -0.12, y: -0.05, z: 0.45 }, // Bottom left
    { x: 0.12, y: -0.05, z: 0.45 }, // Bottom right
  ];

  for (const pos of eyePositions) {
    const eye = new THREE.Mesh(eyeGeom, eyeMat);
    eye.position.set(pos.x, pos.y, pos.z);
    liveVisualMesh.add(eye);
  }

  // 5. Tiny Mouth
  const mouthGeom = new THREE.SphereGeometry(0.03, 8, 8);
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const mouth = new THREE.Mesh(mouthGeom, mouthMat);
  mouth.position.set(0, -0.2, 0.45);
  liveVisualMesh.add(mouth);

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

  const poseRig: PlayerPoseRig = {
    leftArm: {
      mesh: appendages.leftArm.mesh,
      outline: appendages.leftArm.outline!,
      jsrOutline: appendages.leftArm.jsrOutline!,
    },
    rightArm: {
      mesh: appendages.rightArm.mesh,
      outline: appendages.rightArm.outline!,
      jsrOutline: appendages.rightArm.jsrOutline!,
    },
    frontFoot: {
      mesh: appendages.frontFoot.mesh,
      outline: appendages.frontFoot.outline!,
      jsrOutline: appendages.frontFoot.jsrOutline!,
    },
    rearFoot: {
      mesh: appendages.rearFoot.mesh,
      outline: appendages.rearFoot.outline!,
      jsrOutline: appendages.rearFoot.jsrOutline!,
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

  const trickChargeAura = new THREE.Group();
  trickChargeAura.visible = false;

  const auraShell = new THREE.Mesh(
    new THREE.SphereGeometry(bodyRadius * 1.32, 24, 18),
    new THREE.MeshBasicMaterial({
      color: slimeColor,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    }),
  );
  trickChargeAura.add(auraShell);

  const ringGeometry = new THREE.TorusGeometry(bodyRadius * 1.2, 0.055, 10, 42);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: slimeColor,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const horizontalRing = new THREE.Mesh(ringGeometry, ringMaterial);
  horizontalRing.rotation.x = Math.PI / 2;
  trickChargeAura.add(horizontalRing);

  const verticalRing = new THREE.Mesh(
    ringGeometry,
    new THREE.MeshBasicMaterial({
      color: slimeColor,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  verticalRing.rotation.y = Math.PI / 2;
  trickChargeAura.add(verticalRing);

  liveVisualMesh.add(trickChargeAura);

  return {
    group,
    liveMesh,
    deadMesh,
    deathParticles,
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
