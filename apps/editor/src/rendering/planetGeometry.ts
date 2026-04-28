import * as THREE from "three";
import {
  getTerrainRadius,
  getTerrainNormal,
  getTerrainHeight,
} from "@splat/simulation/terrain/planetTerrain.ts";
import type { EditorConfig } from "../types.ts";

export function buildPlanetGeometry(
  config: EditorConfig,
  sculptDisplacements?: Float32Array | null,
): THREE.BufferGeometry {
  const detail = config.terrain.icosahedronDetail;
  const indexed = new THREE.IcosahedronGeometry(config.planet.radius, detail);
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

    const radius =
      getTerrainRadius(nx, ny, nz, config) +
      (sculptDisplacements ? (sculptDisplacements[i] ?? 0) : 0);
    posAttr.setXYZ(i, nx * radius, ny * radius, nz * radius);

    const terrainNormal = getTerrainNormal(nx, ny, nz, config);
    smoothNormals[i * 3] = terrainNormal.nx;
    smoothNormals[i * 3 + 1] = terrainNormal.ny;
    smoothNormals[i * 3 + 2] = terrainNormal.nz;

    const theta = Math.acos(Math.max(-1, Math.min(1, -ny)));
    const phi = Math.atan2(nz, nx);
    uvs[i * 2] = 0.5 - phi / (2 * Math.PI);
    uvs[i * 2 + 1] = theta / Math.PI;
  }

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

export function buildWaterGeometry(
  waterRadius: number,
  config: EditorConfig,
): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(waterRadius, 64, 64);
  const posAttr = geometry.getAttribute("position");
  const waterDepths = new Float32Array(posAttr.count);

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const len = Math.sqrt(x * x + y * y + z * z);
    waterDepths[i] =
      config.terrain.waterLevel - getTerrainHeight(x / len, y / len, z / len, config);
  }

  geometry.setAttribute("waterDepth", new THREE.Float32BufferAttribute(waterDepths, 1));
  return geometry;
}
