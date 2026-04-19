import * as THREE from "three";
import { getWeaponDefinition, WeaponId } from "@splat/content/combat/weaponDefs.ts";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";

export interface PlayerMeshRig {
  group: THREE.Group;
  liveMesh: THREE.Group;
  deadMesh: THREE.Group;
  weaponMesh: THREE.Mesh;
}

export function createPlayerMesh(slimeColor: number): PlayerMeshRig {
  const group = new THREE.Group();
  const liveMesh = new THREE.Group();
  const deadMesh = new THREE.Group();
  group.add(liveMesh);
  group.add(deadMesh);

  // 1. Body (the blob)
  // We'll use a sphere slightly squashed on the Y axis if we wanted,
  // but for now a regular sphere is fine.
  const bodyRadius = GAME_CONFIG.player.collisionRadius;
  const bodyGeom = new THREE.SphereGeometry(bodyRadius, 32, 24);
  const bodyMat = new THREE.MeshLambertMaterial({ color: slimeColor });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  liveMesh.add(body);

  // 2. Bunny Ears
  const earGeom = new THREE.CapsuleGeometry(0.08, 0.3, 4, 8);
  const earMat = new THREE.MeshLambertMaterial({ color: slimeColor });

  const leftEar = new THREE.Mesh(earGeom, earMat);
  leftEar.position.set(-0.2, 0.4, 0);
  leftEar.rotation.z = Math.PI / 10;
  liveMesh.add(leftEar);

  const rightEar = new THREE.Mesh(earGeom, earMat);
  rightEar.position.set(0.2, 0.4, 0);
  rightEar.rotation.z = -Math.PI / 10;
  liveMesh.add(rightEar);

  // 3. 4 Alien Eyes
  // Arranged in two rows of two.
  // Local +Z is forward.
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

  // 5. Debug Collider
  if (GAME_CONFIG.debug.showColliders) {
    const colliderGeom = new THREE.SphereGeometry(GAME_CONFIG.player.collisionRadius, 16, 16);
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

  return { group, liveMesh, deadMesh, weaponMesh };
}
