import * as THREE from "three";
import { getWeaponDefinition, WeaponId } from "@splat/content/combat/weaponDefs.ts";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";

export interface PlayerMeshRig {
  group: THREE.Group;
  weaponMesh: THREE.Mesh;
}

export function createPlayerMesh(slimeColor: number): PlayerMeshRig {
  const group = new THREE.Group();

  // 1. Body (the blob)
  // We'll use a sphere slightly squashed on the Y axis if we wanted,
  // but for now a regular sphere is fine.
  const bodyRadius = GAME_CONFIG.player.collisionRadius;
  const bodyGeom = new THREE.SphereGeometry(bodyRadius, 32, 24);
  const bodyMat = new THREE.MeshLambertMaterial({ color: slimeColor });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  group.add(body);

  // 2. Bunny Ears
  const earGeom = new THREE.CapsuleGeometry(0.08, 0.3, 4, 8);
  const earMat = new THREE.MeshLambertMaterial({ color: slimeColor });

  const leftEar = new THREE.Mesh(earGeom, earMat);
  leftEar.position.set(-0.2, 0.4, 0);
  leftEar.rotation.z = Math.PI / 10;
  group.add(leftEar);

  const rightEar = new THREE.Mesh(earGeom, earMat);
  rightEar.position.set(0.2, 0.4, 0);
  rightEar.rotation.z = -Math.PI / 10;
  group.add(rightEar);

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
    group.add(eye);
  }

  // 4. Tiny Mouth
  const mouthGeom = new THREE.SphereGeometry(0.03, 8, 8);
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const mouth = new THREE.Mesh(mouthGeom, mouthMat);
  mouth.position.set(0, -0.2, 0.45);
  group.add(mouth);

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
    group.add(colliderMesh);
  }

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
  group.add(weaponMesh);

  return { group, weaponMesh };
}
