import * as THREE from "three";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { DEFAULT_RUNTIME_PLANET_TERRAIN, DEV_MAP } from "@splat/content/map/runtimeMapData.ts";
import { createPlanetMaterial } from "@splat/client-runtime/materials/planetMaterial.ts";
import { createAtmosphereMaterial } from "@splat/client-runtime/materials/atmosphereMaterial.ts";
import { createWaterMaterial } from "@splat/client-runtime/materials/waterMaterial.ts";
import { createOutlineMaterial } from "@splat/client-runtime/materials/outlineMaterial.ts";
import {
  createTerrainConfig,
  getTerrainHeight,
  getTerrainNormal,
  getTerrainRadius,
  type TerrainConfig,
} from "@splat/simulation/terrain/planetTerrain.ts";
import type { MapDataMessage } from "@splat/protocol/network/serverMessages.ts";
import type { SlimeSystem } from "../systems/slimeSystem.ts";

type MapPlanet = MapDataMessage["planets"][number];
type MapCel = MapDataMessage["cel"];

function toMapDataPlanets(planets: typeof DEV_MAP.planets): MapDataMessage["planets"] {
  return planets.map((planet) => ({ ...planet, terrainFeatures: planet.terrainFeatures ?? [] }));
}

function hexToVec3(hex: number): THREE.Vector3 {
  return new THREE.Vector3(
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255,
  );
}

export class PlanetRenderer {
  private _mapPlanets: MapDataMessage["planets"] = toMapDataPlanets(DEV_MAP.planets);
  private mapCel: MapCel = DEV_MAP.cel;
  private readonly planetTerrainCfgs = new Map<string, TerrainConfig>();
  private readonly planetMaterials: THREE.ShaderMaterial[] = [];
  private readonly planetMeshes: THREE.Mesh[] = [];
  private readonly planetOutlines: THREE.Mesh[] = [];
  private readonly atmosphereMaterials: (THREE.ShaderMaterial | null)[] = [];
  private readonly waterMaterials: (THREE.ShaderMaterial | null)[] = [];
  private readonly waterMeshes: (THREE.Mesh | null)[] = [];

  get mapPlanets(): MapDataMessage["planets"] {
    return this._mapPlanets;
  }

  constructor(
    private readonly scene: THREE.Scene,
    private readonly slime: SlimeSystem,
  ) {}

  applyMapData(msg: MapDataMessage): boolean {
    this._mapPlanets = msg.planets;
    this.mapCel = msg.cel;
    for (const p of msg.planets) {
      this.planetTerrainCfgs.set(p.id, createTerrainConfig(p));
    }

    if (this.planetMeshes.length === 0) {
      this.buildPlanets();
      return true;
    }

    for (let i = 0; i < this.planetMeshes.length; i++) {
      const mapPlanet = this._mapPlanets[i];
      if (!mapPlanet) continue;

      const planetCfg = this.getTerrainCfg(mapPlanet.id);
      const terrain = planetCfg.terrain;
      const waterRadius = mapPlanet.radius + terrain.waterLevel;
      const newTerrainGeo = this.buildTerrainGeometry(planetCfg);

      const planet = this.planetMeshes[i];
      const outline = this.planetOutlines[i];
      if (planet) {
        planet.geometry.dispose();
        planet.geometry = newTerrainGeo;
      }
      if (outline) outline.geometry = newTerrainGeo;

      const mat = this.planetMaterials[i];
      if (mat) this.applyPlanetMaterialConfig(mat, mapPlanet);

      const water = this.waterMeshes[i];
      if (water) {
        water.geometry.dispose();
        water.geometry = this.buildWaterGeometry(waterRadius, planetCfg);
      }

      const waterMaterial = this.waterMaterials[i];
      if (waterMaterial) this.applyWaterMaterialConfig(waterMaterial, mapPlanet);

      const atmosphere = this.atmosphereMaterials[i];
      if (atmosphere) this.applyAtmosphereMaterialConfig(atmosphere, mapPlanet);
    }

    return false;
  }

  getTerrainCfg(planetId: string): TerrainConfig {
    return this.planetTerrainCfgs.get(planetId) ?? GAME_CONFIG;
  }

  updateTimeUniforms(nowSec: number): void {
    for (const mat of this.planetMaterials) {
      mat.uniforms.time.value = nowSec;
    }
    for (const mat of this.waterMaterials) {
      if (mat) mat.uniforms.time.value = nowSec;
    }
  }

  private buildPlanets(): void {
    for (const p of this._mapPlanets) {
      const cfg = this.getTerrainCfg(p.id);
      const terrain = cfg.terrain;
      const waterRadius = p.radius + terrain.waterLevel;
      const atmosphereRadius = p.radius + p.atmosphere.height;
      const { x, y, z } = p.center;

      const slimeMask = this.slime.getRenderTarget(p.id);
      const planetMaterial = createPlanetMaterial({
        slimeMask: slimeMask.texture,
        planetCenter: new THREE.Vector3(x, y, z),
        planetRadius: p.radius,
        waterRadius,
        waterLevel: terrain.waterLevel,
        sandBand: terrain.sandBand,
        snowLevel: terrain.snowLevel,
        rockLevel: terrain.rockLevel,
        colors: p.colors,
        cel: this.mapCel,
        lighting: p.lighting,
      });
      this.applyPlanetMaterialConfig(planetMaterial, p);

      const geometry = this.buildTerrainGeometry(cfg);
      const planet = new THREE.Mesh(geometry, planetMaterial);
      planet.position.set(x, y, z);
      this.scene.add(planet);
      this.planetMaterials.push(planetMaterial);
      this.planetMeshes.push(planet);

      const planetOutline = new THREE.Mesh(geometry, createOutlineMaterial());
      planetOutline.position.set(x, y, z);
      this.scene.add(planetOutline);
      this.planetOutlines.push(planetOutline);

      if (p.atmosphere.enabled) {
        const atmosphereMat = createAtmosphereMaterial(p.atmosphere);
        this.applyAtmosphereMaterialConfig(atmosphereMat, p);
        const atmosphere = new THREE.Mesh(
          new THREE.SphereGeometry(atmosphereRadius, 48, 48),
          atmosphereMat,
        );
        atmosphere.position.set(x, y, z);
        atmosphere.renderOrder = 2;
        this.scene.add(atmosphere);
        this.atmosphereMaterials.push(atmosphereMat);
      } else {
        this.atmosphereMaterials.push(null);
      }

      if (p.hasWater) {
        const waterMat = createWaterMaterial({
          deepColor: p.colors.waterDeep,
          cel: this.mapCel,
        });
        const water = new THREE.Mesh(this.buildWaterGeometry(waterRadius, cfg), waterMat);
        water.position.set(x, y, z);
        water.renderOrder = 1;
        this.scene.add(water);
        this.waterMaterials.push(waterMat);
        this.waterMeshes.push(water);
      } else {
        this.waterMaterials.push(null);
        this.waterMeshes.push(null);
      }
    }
  }

  private buildTerrainGeometry(cfg: TerrainConfig): THREE.BufferGeometry {
    const detail =
      cfg.terrain.icosahedronDetail ?? DEFAULT_RUNTIME_PLANET_TERRAIN.icosahedronDetail;
    const indexed = new THREE.IcosahedronGeometry(cfg.planet.radius, detail);

    // toNonIndexed gives each triangle its own vertices → flat shading
    const geometry = indexed.toNonIndexed();
    indexed.dispose();

    const posAttr = geometry.getAttribute("position");
    const vertexCount = posAttr.count;
    const faceCount = vertexCount / 3;
    const smoothNormals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);

    for (let i = 0; i < vertexCount; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);

      const len = Math.sqrt(x * x + y * y + z * z);
      const nx = x / len;
      const ny = y / len;
      const nz = z / len;

      const radius = getTerrainRadius(nx, ny, nz, cfg);
      posAttr.setXYZ(i, nx * radius, ny * radius, nz * radius);
      const terrainNormal = getTerrainNormal(nx, ny, nz, cfg);
      smoothNormals[i * 3] = terrainNormal.nx;
      smoothNormals[i * 3 + 1] = terrainNormal.ny;
      smoothNormals[i * 3 + 2] = terrainNormal.nz;

      // Spherical UVs from undisplaced normal — must match stampShader.ts
      const theta = Math.acos(Math.max(-1, Math.min(1, -ny)));
      const phi = Math.atan2(nz, nx);
      uvs[i * 2] = 0.5 - phi / (2 * Math.PI);
      uvs[i * 2 + 1] = theta / Math.PI;
    }

    // Fix seam-crossing triangles so UV interpolation wraps the short way around
    // the sphere instead of stretching across the full slime mask.
    for (let f = 0; f < faceCount; f++) {
      const i0 = f * 3;
      const i1 = f * 3 + 1;
      const i2 = f * 3 + 2;
      const u0 = uvs[i0 * 2];
      const u1 = uvs[i1 * 2];
      const u2 = uvs[i2 * 2];
      const minU = Math.min(u0, u1, u2);
      const maxU = Math.max(u0, u1, u2);

      if (maxU - minU > 0.5) {
        if (u0 < 0.5) uvs[i0 * 2] = u0 + 1.0;
        if (u1 < 0.5) uvs[i1 * 2] = u1 + 1.0;
        if (u2 < 0.5) uvs[i2 * 2] = u2 + 1.0;
      }
    }

    geometry.setAttribute("smoothNormal", new THREE.Float32BufferAttribute(smoothNormals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();

    return geometry;
  }

  private buildWaterGeometry(waterRadius: number, cfg: TerrainConfig): THREE.BufferGeometry {
    const geometry = new THREE.SphereGeometry(waterRadius, 64, 64);
    const posAttr = geometry.getAttribute("position");
    const waterDepths = new Float32Array(posAttr.count);

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const len = Math.sqrt(x * x + y * y + z * z);
      const nx = x / len;
      const ny = y / len;
      const nz = z / len;
      waterDepths[i] = cfg.terrain.waterLevel - getTerrainHeight(nx, ny, nz, cfg);
    }

    geometry.setAttribute("waterDepth", new THREE.Float32BufferAttribute(waterDepths, 1));
    return geometry;
  }

  private applyPlanetMaterialConfig(material: THREE.ShaderMaterial, planet: MapPlanet): void {
    const { terrain, colors, lighting } = planet;
    const waterRadius = planet.radius + terrain.waterLevel;
    const uniforms = material.uniforms;

    uniforms.waterRadius.value = waterRadius;
    uniforms.waterLevel.value = terrain.waterLevel;
    uniforms.sandBand.value = terrain.sandBand;
    uniforms.snowLevel.value = terrain.snowLevel;
    uniforms.rockLevel.value = terrain.rockLevel;
    uniforms.waterDeepColor.value = hexToVec3(colors.waterDeep);
    uniforms.sandColor.value = new THREE.Color(colors.sand);
    uniforms.grassColor.value = new THREE.Color(colors.grass);
    uniforms.rockColor.value = new THREE.Color(colors.rock);
    uniforms.snowColor.value = new THREE.Color(colors.snow);
    uniforms.celBands.value = this.mapCel.bands;
    uniforms.celSoftness.value = this.mapCel.softness;
    uniforms.celHatchStrength.value = this.mapCel.hatchStrength;
    uniforms.celHatchScale.value = this.mapCel.hatchScale;

    const azRad = (lighting.sunAzimuth * Math.PI) / 180;
    const elRad = (lighting.sunElevation * Math.PI) / 180;
    uniforms.sunDirection.value = new THREE.Vector3(
      Math.cos(elRad) * Math.sin(azRad),
      Math.sin(elRad),
      Math.cos(elRad) * Math.cos(azRad),
    );
    uniforms.sunIntensity.value = lighting.sunIntensity;
    uniforms.ambientIntensity.value = lighting.ambientIntensity;
    uniforms.rimColor.value = new THREE.Color(lighting.rimColor);
    uniforms.rimStrength.value = lighting.rimStrength;
    uniforms.rimPower.value = lighting.rimPower;
  }

  private applyAtmosphereMaterialConfig(material: THREE.ShaderMaterial, planet: MapPlanet): void {
    const uniforms = material.uniforms;
    uniforms.atmosphereColor.value = new THREE.Color(planet.atmosphere.color);
    uniforms.intensity.value = planet.atmosphere.intensity;
    uniforms.opacity.value = planet.atmosphere.opacity;
    uniforms.fresnelPower.value = planet.atmosphere.fresnelPower;
    uniforms.falloffPower.value = planet.atmosphere.falloffPower;
  }

  private applyWaterMaterialConfig(material: THREE.ShaderMaterial, planet: MapPlanet): void {
    const uniforms = material.uniforms;
    uniforms.deepColor.value = hexToVec3(planet.colors.waterDeep);
    uniforms.celBands.value = this.mapCel.bands;
    uniforms.celSoftness.value = this.mapCel.softness;
    uniforms.celHatchStrength.value = this.mapCel.hatchStrength;
    uniforms.celHatchScale.value = this.mapCel.hatchScale;
  }
}
