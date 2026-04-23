import * as THREE from "three";
import { getWeaponDefinition, WeaponId } from "@splat/content/combat/weaponDefs.ts";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { createSlimeMaterial } from "../../materials/slimeMaterial.ts";
import { createOutlineMaterial } from "../../materials/outlineMaterial.ts";

export interface PlayerMeshRig {
  group: THREE.Group;
  liveMesh: THREE.Group;
  deadMesh: THREE.Group;
  weaponMesh: THREE.Mesh;
  snowboardMesh: THREE.Group;
  outlineMesh: THREE.Group;
  jsrOutline: THREE.Group;
  disturbanceMesh: THREE.Mesh;
  trickChargeAura: THREE.Group;
  slimeMaterials: THREE.ShaderMaterial[];
}

export function createPlayerMesh(slimeColor: number, patternId = 0): PlayerMeshRig {
  const group = new THREE.Group();
  const liveMesh = new THREE.Group();
  const deadMesh = new THREE.Group();
  const slimeMaterials: THREE.ShaderMaterial[] = [];
  group.add(liveMesh);
  group.add(deadMesh);

  // 1. Body (the blob)
  const bodyRadius = GAME_CONFIG.movement.collisionRadius;
  const bodyGeom = new THREE.SphereGeometry(bodyRadius, 32, 24);
  const bodyMat = createSlimeMaterial(slimeColor, patternId);
  slimeMaterials.push(bodyMat);
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  liveMesh.add(body);

  // 2. Bunny Ears
  const earGeom = new THREE.CapsuleGeometry(0.08, 0.3, 4, 8);
  const earMat = createSlimeMaterial(slimeColor, patternId);
  slimeMaterials.push(earMat);

  const leftEar = new THREE.Mesh(earGeom, earMat);
  leftEar.position.set(-0.2, 0.4, 0);
  leftEar.rotation.z = Math.PI / 10;
  liveMesh.add(leftEar);

  const rightEar = new THREE.Mesh(earGeom, earMat);
  rightEar.position.set(0.2, 0.4, 0);
  rightEar.rotation.z = -Math.PI / 10;
  liveMesh.add(rightEar);

  // 3. 4 Alien Eyes
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
    liveMesh.add(eye);
  }

  // 4. Tiny Mouth
  const mouthGeom = new THREE.SphereGeometry(0.03, 8, 8);
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const mouth = new THREE.Mesh(mouthGeom, mouthMat);
  mouth.position.set(0, -0.2, 0.45);
  liveMesh.add(mouth);

  const snowboardMesh = new THREE.Group();
  const boardGeom = new THREE.BoxGeometry(0.78, 0.08, 1.35);
  const boardMat = new THREE.MeshLambertMaterial({
    color: 0x1f2430,
    emissive: 0x080a10,
    emissiveIntensity: 0.18,
  });
  const board = new THREE.Mesh(boardGeom, boardMat);
  snowboardMesh.add(board);

  const stripeGeom = new THREE.BoxGeometry(0.08, 0.012, 1.18);
  const stripeMat = new THREE.MeshBasicMaterial({ color: slimeColor });
  const stripe = new THREE.Mesh(stripeGeom, stripeMat);
  stripe.position.y = 0.048;
  snowboardMesh.add(stripe);

  snowboardMesh.position.set(0, -0.58, 0);
  snowboardMesh.visible = false;
  liveMesh.add(snowboardMesh);

  // 5. Debug Collider
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

  const deadMat = new THREE.MeshLambertMaterial({
    color: slimeColor,
    emissive: slimeColor,
    emissiveIntensity: 0.25,
    transparent: true,
    opacity: 0.65,
  });
  const chunkGeom = new THREE.IcosahedronGeometry(0.14, 0);
  const chunkPositions = [
    { x: 0, y: -0.22, z: 0 },
    { x: 0.28, y: -0.26, z: 0.08 },
    { x: -0.3, y: -0.24, z: -0.04 },
    { x: 0.12, y: -0.18, z: 0.3 },
    { x: -0.08, y: -0.28, z: -0.31 },
    { x: 0.42, y: -0.3, z: -0.22 },
    { x: -0.38, y: -0.2, z: 0.24 },
  ];
  chunkPositions.forEach((pos, index) => {
    const chunk = new THREE.Mesh(chunkGeom, deadMat);
    chunk.position.set(pos.x, pos.y, pos.z);
    const scale = index === 0 ? 1.25 : 0.75 + (index % 3) * 0.15;
    chunk.scale.set(scale * 1.25, scale * 0.35, scale * 1.25);
    chunk.rotation.set(index * 0.9, index * 0.45, index * 0.7);
    deadMesh.add(chunk);
  });
  deadMesh.visible = false;

  const weaponGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.95, 12);
  const weaponMat = new THREE.MeshLambertMaterial({
    color: getWeaponDefinition(WeaponId.Bazooka).pickupColor,
    emissive: getWeaponDefinition(WeaponId.Bazooka).pickupColor,
    emissiveIntensity: 0.4,
  });
  const weaponMesh = new THREE.Mesh(weaponGeom, weaponMat);
  weaponMesh.position.set(0.52, -0.02, 0.28);
  weaponMesh.rotation.x = Math.PI / 2;
  weaponMesh.rotation.y = Math.PI / 18;
  weaponMesh.visible = false;
  liveMesh.add(weaponMesh);

  // Inverted-hull outline
  const outlineMat = new THREE.MeshBasicMaterial({
    color: slimeColor,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  });
  const outlineMesh = new THREE.Group();
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

  liveMesh.add(jsrOutline);

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

  liveMesh.add(trickChargeAura);

  return {
    group,
    liveMesh,
    deadMesh,
    weaponMesh,
    snowboardMesh,
    outlineMesh,
    jsrOutline,
    disturbanceMesh,
    trickChargeAura,
    slimeMaterials,
  };
}
