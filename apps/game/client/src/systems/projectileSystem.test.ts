import { expect, it } from "vite-plus/test";
import * as THREE from "three";
import { getWeaponDefinition } from "@splat/content/combat/weaponDefs.ts";
import type { ProjectileSnapshot } from "@splat/protocol/network/serverMessages.ts";
import { WeaponId } from "@splat/protocol/network/weaponIds.ts";
import { ProjectileSystem } from "./projectileSystem.ts";

it("renders newly observed projectiles from their inferred spawn point", () => {
  const scene = new THREE.Scene();
  const system = new ProjectileSystem(scene);
  const weapon = getWeaponDefinition(WeaponId.MachineGun);
  const ageMs = 100;
  const snapshot: ProjectileSnapshot = {
    id: "projectile-1",
    ownerId: "session-1",
    weaponId: WeaponId.MachineGun,
    paintGroupId: 0,
    slimeColor: 0x00ff00,
    patternId: 0,
    pos: { x: weapon.projectileSpeed * (ageMs / 1000), y: 1, z: 2 },
    vel: { x: weapon.projectileSpeed, y: 0, z: 0 },
    planetId: "planet-0",
    lifeMs: weapon.projectileLifetimeMs - ageMs,
  };

  system.syncProjectile(snapshot.id, snapshot, 0xffffff, 1000);

  expect(scene.children).toHaveLength(1);
  expect(scene.children[0]?.position.x).toBeCloseTo(0, 5);
  expect(scene.children[0]?.position.y).toBeCloseTo(1, 5);
  expect(scene.children[0]?.position.z).toBeCloseTo(2, 5);
});
