import { expect, it } from "vite-plus/test";
import * as THREE from "three";
import { WeaponId } from "@splat/content/combat/weaponDefs.ts";
import { PickupSystem } from "./pickupSystem.ts";

it("returns removed pickup positions", () => {
  const scene = new THREE.Scene();
  const system = new PickupSystem(scene);

  system.syncPickup(
    {
      id: "pickup-1",
      weaponId: WeaponId.Bazooka,
      pos: { x: 1, y: 2, z: 3 },
    },
    1000,
  );

  const removed = system.removeMissing(new Set());

  expect(removed).toHaveLength(1);
  expect(removed[0]?.position.x).toBe(1);
  expect(removed[0]?.position.y).toBe(2);
  expect(removed[0]?.position.z).toBe(3);
  expect(scene.children).toHaveLength(0);
});
