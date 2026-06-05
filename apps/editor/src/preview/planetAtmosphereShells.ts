import * as THREE from "three";
import { createPuffyCloudGeometry } from "@splat/client-runtime/geometry/puffyCloudGeometry.ts";
import { createAtmosphereMaterial } from "@splat/client-runtime/materials/atmosphereMaterial.ts";
import {
  createGravityRingMaterial,
  DEFAULT_GRAVITY_RADIUS_MULTIPLIER,
} from "@splat/client-runtime/materials/gravityRingMaterial.ts";
import {
  createPuffyCloudMaterial,
  createWispyCloudMaterial,
} from "@splat/client-runtime/materials/cloudMaterial.ts";
import type { EditorPlanet, ShaderBlendMode } from "../types.ts";

export interface PlanetAtmosphereShells {
  atmosphereMesh: THREE.Mesh | null;
  cloudMesh: THREE.Mesh | null;
  puffyCloudMesh: THREE.Points | null;
  gravityRingMesh: THREE.Mesh | null;
  atmosphereMaterial: THREE.ShaderMaterial | null;
  cloudMaterial: THREE.ShaderMaterial | null;
  puffyCloudMaterial: THREE.ShaderMaterial | null;
  gravityRingMaterial: THREE.ShaderMaterial | null;
}

function toThreeBlending(mode: ShaderBlendMode): THREE.Blending {
  if (mode === "additive") return THREE.AdditiveBlending;
  if (mode === "multiply") return THREE.MultiplyBlending;
  return THREE.NormalBlending;
}

function createEditorWispyCloudMaterial(
  clouds: EditorPlanet["atmosphere"]["clouds"],
): THREE.ShaderMaterial {
  return createWispyCloudMaterial({
    color: clouds.color,
    density: clouds.density,
    opacity: clouds.opacity,
    thickness: clouds.thickness,
    coverageScale: clouds.coverageScale,
    movementSpeed: clouds.movementSpeed,
    blending: toThreeBlending(clouds.blendMode),
  });
}

function createEditorPuffyCloudMaterial(
  puffs: EditorPlanet["atmosphere"]["clouds"]["puffs"],
): THREE.ShaderMaterial {
  return createPuffyCloudMaterial({
    color: puffs.color,
    density: puffs.density,
    opacity: puffs.opacity,
    thickness: puffs.thickness,
    size: puffs.size,
    movementSpeed: puffs.movementSpeed,
    blending: toThreeBlending(puffs.blendMode),
  });
}

export function createPlanetAtmosphereShells(
  group: THREE.Group,
  planet: EditorPlanet,
): PlanetAtmosphereShells {
  const shells: PlanetAtmosphereShells = {
    atmosphereMesh: null,
    cloudMesh: null,
    puffyCloudMesh: null,
    gravityRingMesh: null,
    atmosphereMaterial: null,
    cloudMaterial: null,
    puffyCloudMaterial: null,
    gravityRingMaterial: null,
  };

  syncPlanetAtmosphereShells(group, planet, shells);
  return shells;
}

export function disposePlanetAtmosphereShells(shells: PlanetAtmosphereShells): void {
  shells.atmosphereMesh?.geometry.dispose();
  shells.atmosphereMaterial?.dispose();
  shells.cloudMesh?.geometry.dispose();
  shells.cloudMaterial?.dispose();
  shells.puffyCloudMesh?.geometry.dispose();
  shells.puffyCloudMaterial?.dispose();
  shells.gravityRingMesh?.geometry.dispose();
  shells.gravityRingMaterial?.dispose();
}

export function syncPlanetAtmosphereShells(
  group: THREE.Group,
  planet: EditorPlanet,
  shells: PlanetAtmosphereShells,
): void {
  if (planet.atmosphere.enabled && !shells.atmosphereMesh) {
    shells.atmosphereMaterial = createAtmosphereMaterial(planet.atmosphere);
    shells.atmosphereMaterial.blending = toThreeBlending(planet.atmosphere.blendMode);
    shells.atmosphereMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 48),
      shells.atmosphereMaterial,
    );
    shells.atmosphereMesh.renderOrder = 2;
    group.add(shells.atmosphereMesh);
  } else if (!planet.atmosphere.enabled && shells.atmosphereMesh) {
    group.remove(shells.atmosphereMesh);
    shells.atmosphereMesh.geometry.dispose();
    shells.atmosphereMaterial?.dispose();
    shells.atmosphereMesh = null;
    shells.atmosphereMaterial = null;
  }

  if (shells.atmosphereMesh) {
    shells.atmosphereMesh.scale.setScalar(planet.radius + planet.atmosphere.height);
  }

  if (planet.atmosphere.clouds.enabled && !shells.cloudMesh) {
    shells.cloudMaterial = createEditorWispyCloudMaterial(planet.atmosphere.clouds);
    shells.cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), shells.cloudMaterial);
    shells.cloudMesh.renderOrder = 1.5;
    group.add(shells.cloudMesh);
  } else if (!planet.atmosphere.clouds.enabled && shells.cloudMesh) {
    group.remove(shells.cloudMesh);
    shells.cloudMesh.geometry.dispose();
    shells.cloudMaterial?.dispose();
    shells.cloudMesh = null;
    shells.cloudMaterial = null;
  }

  if (shells.cloudMesh) {
    shells.cloudMesh.scale.setScalar(planet.radius + planet.atmosphere.clouds.height);
  }

  if (planet.atmosphere.clouds.puffs.enabled && !shells.puffyCloudMesh) {
    shells.puffyCloudMaterial = createEditorPuffyCloudMaterial(planet.atmosphere.clouds.puffs);
    shells.puffyCloudMesh = new THREE.Points(createPuffyCloudGeometry(), shells.puffyCloudMaterial);
    shells.puffyCloudMesh.renderOrder = 1.6;
    group.add(shells.puffyCloudMesh);
  } else if (!planet.atmosphere.clouds.puffs.enabled && shells.puffyCloudMesh) {
    group.remove(shells.puffyCloudMesh);
    shells.puffyCloudMesh.geometry.dispose();
    shells.puffyCloudMaterial?.dispose();
    shells.puffyCloudMesh = null;
    shells.puffyCloudMaterial = null;
  }

  if (shells.puffyCloudMesh) {
    shells.puffyCloudMesh.scale.setScalar(planet.radius + planet.atmosphere.clouds.puffs.height);
  }

  // Gravity ring — shows the radius at which the planet's gravity starts pulling
  // a player. Always on so editors can spot overlap problems while authoring.
  // EditorPlanet has no per-planet override yet, so we use the simulation default
  // (radius * DEFAULT_GRAVITY_RADIUS_MULTIPLIER).
  if (!shells.gravityRingMesh) {
    const gravityRingMaterial = createGravityRingMaterial();
    shells.gravityRingMaterial = gravityRingMaterial;
    shells.gravityRingMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 48),
      gravityRingMaterial,
    );
    shells.gravityRingMesh.renderOrder = 3;
    group.add(shells.gravityRingMesh);
  }
  shells.gravityRingMesh.scale.setScalar(planet.radius * DEFAULT_GRAVITY_RADIUS_MULTIPLIER);
}

export function updatePlanetAtmosphereUniforms(
  planet: EditorPlanet,
  shells: PlanetAtmosphereShells,
  sunDirection: THREE.Vector3,
): void {
  if (shells.atmosphereMaterial) {
    const au = shells.atmosphereMaterial.uniforms;
    au.atmosphereColor.value = new THREE.Color(planet.atmosphere.color);
    au.intensity.value = planet.atmosphere.intensity;
    au.opacity.value = planet.atmosphere.opacity;
    au.fresnelPower.value = planet.atmosphere.fresnelPower;
    au.falloffPower.value = planet.atmosphere.falloffPower;
    shells.atmosphereMaterial.blending = toThreeBlending(planet.atmosphere.blendMode);
    shells.atmosphereMaterial.needsUpdate = true;
  }

  if (shells.cloudMaterial) {
    const cu = shells.cloudMaterial.uniforms;
    cu.cloudColor.value = new THREE.Color(planet.atmosphere.clouds.color);
    cu.density.value = planet.atmosphere.clouds.density;
    cu.opacity.value = planet.atmosphere.clouds.opacity;
    cu.thickness.value = planet.atmosphere.clouds.thickness;
    cu.coverageScale.value = planet.atmosphere.clouds.coverageScale;
    cu.movementSpeed.value = planet.atmosphere.clouds.movementSpeed;
    cu.sunDirection.value.copy(sunDirection);
    shells.cloudMaterial.blending = toThreeBlending(planet.atmosphere.clouds.blendMode);
    shells.cloudMaterial.needsUpdate = true;
  }

  if (shells.puffyCloudMaterial) {
    const { puffs } = planet.atmosphere.clouds;
    const pu = shells.puffyCloudMaterial.uniforms;
    pu.cloudColor.value = new THREE.Color(puffs.color);
    pu.density.value = puffs.density;
    pu.opacity.value = puffs.opacity;
    pu.thickness.value = puffs.thickness;
    pu.size.value = puffs.size;
    pu.movementSpeed.value = puffs.movementSpeed;
    pu.sunDirection.value.copy(sunDirection);
    shells.puffyCloudMaterial.blending = toThreeBlending(puffs.blendMode);
    shells.puffyCloudMaterial.needsUpdate = true;
  }
}

export function updatePlanetAtmosphereTime(shells: PlanetAtmosphereShells, time: number): void {
  if (shells.cloudMaterial) shells.cloudMaterial.uniforms.time.value = time;
  if (shells.puffyCloudMaterial) shells.puffyCloudMaterial.uniforms.time.value = time;
}
