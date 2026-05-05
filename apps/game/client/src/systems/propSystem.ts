import * as THREE from "three";
import { RENDER_CONFIG } from "@splat/content/config/renderConfig.ts";
import {
  BiomeType,
  getBiome,
  getTerrainHeight,
  getTerrainNormal,
  type TerrainConfig,
} from "@splat/simulation/terrain/planetTerrain.ts";

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function seedFromString(value: string): number {
  let seed = 0;
  for (let i = 0; i < value.length; i++) {
    seed = (seed * 31 + value.charCodeAt(i)) % 100000;
  }
  return seed;
}

export class PropSystem {
  private readonly planetProps: THREE.Group[] = [];
  private treeMaterial: THREE.MeshStandardMaterial | null = null;
  private treeTexture: THREE.CanvasTexture | null = null;

  // Intersecting planes geometry for billboards
  private readonly billboardGeometry: THREE.BufferGeometry;

  constructor(private readonly scene: THREE.Scene) {
    // Create geometry for intersecting planes (X-billboard)
    const plane1 = new THREE.PlaneGeometry(1, 1).toNonIndexed();
    const plane2 = new THREE.PlaneGeometry(1, 1).toNonIndexed();
    plane2.rotateY(Math.PI / 2);

    const merged = new THREE.BufferGeometry();
    const pos1 = plane1.getAttribute("position").array;
    const pos2 = plane2.getAttribute("position").array;
    const positions = new Float32Array(pos1.length + pos2.length);
    positions.set(pos1);
    positions.set(pos2, pos1.length);
    merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const uv1 = plane1.getAttribute("uv").array;
    const uv2 = plane2.getAttribute("uv").array;
    const uvs = new Float32Array(uv1.length + uv2.length);
    uvs.set(uv1);
    uvs.set(uv2, uv1.length);
    merged.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

    const norm1 = plane1.getAttribute("normal").array;
    const norm2 = plane2.getAttribute("normal").array;
    const normals = new Float32Array(norm1.length + norm2.length);
    normals.set(norm1);
    normals.set(norm2, norm1.length);
    merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));

    this.billboardGeometry = merged;
  }

  addPlanetProps(planet: {
    id: string;
    x: number;
    y: number;
    z: number;
    radius: number;
    terrain: TerrainConfig["terrain"];
    props: {
      treeDensity: number;
      cactusDensity: number;
      seed: number;
      rocketEnabled: boolean;
    };
  }): void {
    if (!RENDER_CONFIG.props.enabled) return;

    const group = new THREE.Group();
    group.position.set(planet.x, planet.y, planet.z);
    this.scene.add(group);
    this.planetProps.push(group);

    const planetSeed = seedFromString(planet.id) + planet.props.seed;
    const terrainCfg = { planet: { radius: planet.radius }, terrain: planet.terrain };

    if (planet.props.treeDensity > 0) {
      this.scatterTreeGroves(group, planetSeed, terrainCfg, planet.props.treeDensity, {
        minScale: 4,
        maxScale: 7,
        heightOffset: 0.45,
      });
    }

    if (planet.props.rocketEnabled) {
      this.spawnRocket(group, planetSeed + 1000, terrainCfg);
    }
  }

  private scatterTreeGroves(
    group: THREE.Group,
    baseSeed: number,
    terrainCfg: TerrainConfig,
    density: number,
    opts: { minScale: number; maxScale: number; heightOffset: number },
  ): void {
    const instances = new THREE.InstancedMesh(
      this.billboardGeometry,
      this.getTreeMaterial(),
      density,
    );
    instances.castShadow = true;
    instances.receiveShadow = true;

    const matrix = new THREE.Matrix4();
    const centerDirection = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const position = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const bitangent = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion();

    let count = 0;
    const groveCount = Math.max(3, Math.min(6, Math.round(density / 9)));
    const centerDirections: THREE.Vector3[] = [];

    for (let i = 0; i < groveCount; i++) {
      const center = this.findTreeGroveCenter(baseSeed + i * 97, terrainCfg);
      if (center) {
        centerDirections.push(center);
      }
    }

    if (centerDirections.length === 0) {
      group.add(instances);
      instances.count = 0;
      return;
    }

    for (let i = 0; i < density * 10 && count < density; i++) {
      const seed = baseSeed + i * 13;
      const groveIndex = Math.floor(seededRandom(seed + 20) * centerDirections.length);
      centerDirection.copy(centerDirections[groveIndex]);

      tangent.crossVectors(up, centerDirection);
      if (tangent.lengthSq() < 0.001) {
        tangent.set(1, 0, 0);
      } else {
        tangent.normalize();
      }
      bitangent.crossVectors(centerDirection, tangent).normalize();

      const spread = 0.12 + seededRandom(seed + 1) * 0.16;
      const angle = seededRandom(seed + 2) * Math.PI * 2;
      const distance = spread * Math.sqrt(seededRandom(seed + 3));

      direction
        .copy(centerDirection)
        .addScaledVector(tangent, Math.cos(angle) * distance)
        .addScaledVector(bitangent, Math.sin(angle) * distance)
        .normalize();

      const height = getTerrainHeight(direction.x, direction.y, direction.z, terrainCfg);
      const biome = getBiome(height, terrainCfg);
      if (biome.type !== BiomeType.Grass) continue;

      const surfNormal = getTerrainNormal(direction.x, direction.y, direction.z, terrainCfg);
      const dot =
        surfNormal.nx * direction.x + surfNormal.ny * direction.y + surfNormal.nz * direction.z;
      if (dot < 0.86) continue;

      const radius = terrainCfg.planet.radius + height;
      position.set(direction.x * radius, direction.y * radius, direction.z * radius);

      quaternion.setFromUnitVectors(up, direction);

      const s = opts.minScale + seededRandom(seed + 5) * (opts.maxScale - opts.minScale);
      scale.set(s, s, s);
      position.addScaledVector(direction, s * opts.heightOffset);

      matrix.compose(position, quaternion, scale);
      instances.setMatrixAt(count, matrix);
      count++;
    }

    instances.count = count;
    instances.instanceMatrix.needsUpdate = true;
    group.add(instances);
  }

  private findTreeGroveCenter(seed: number, terrainCfg: TerrainConfig): THREE.Vector3 | null {
    for (let i = 0; i < 80; i++) {
      const sampleSeed = seed + i * 41;
      const y = 0.15 + seededRandom(sampleSeed) * 0.75;
      const theta = seededRandom(sampleSeed + 1) * Math.PI * 2;
      const radial = Math.sqrt(Math.max(0, 1 - y * y));
      const nx = Math.cos(theta) * radial;
      const ny = y;
      const nz = Math.sin(theta) * radial;

      const height = getTerrainHeight(nx, ny, nz, terrainCfg);
      const biome = getBiome(height, terrainCfg);
      if (biome.type !== BiomeType.Grass) continue;

      const surfNormal = getTerrainNormal(nx, ny, nz, terrainCfg);
      const dot = surfNormal.nx * nx + surfNormal.ny * ny + surfNormal.nz * nz;
      if (dot < 0.9) continue;

      return new THREE.Vector3(nx, ny, nz);
    }

    return null;
  }

  private spawnRocket(group: THREE.Group, seed: number, terrainCfg: TerrainConfig): void {
    // Find a valid spot (Sand biome preferably)
    let found = false;
    const pos = new THREE.Vector3();
    const normal = new THREE.Vector3();

    for (let i = 0; i < 100; i++) {
      const s = seed + i * 42;
      const y = seededRandom(s) * 2 - 1;
      const theta = seededRandom(s + 1) * Math.PI * 2;
      const radial = Math.sqrt(Math.max(0, 1 - y * y));
      const nx = Math.cos(theta) * radial;
      const ny = y;
      const nz = Math.sin(theta) * radial;

      const height = getTerrainHeight(nx, ny, nz, terrainCfg);
      const biome = getBiome(height, terrainCfg);

      if (biome.type === BiomeType.Sand || biome.type === BiomeType.Grass) {
        const radius = terrainCfg.planet.radius + height;
        const surfNormal = getTerrainNormal(nx, ny, nz, terrainCfg);
        if (surfNormal.nx * nx + surfNormal.ny * ny + surfNormal.nz * nz > 0.9) {
          pos.set(nx * radius, ny * radius, nz * radius);
          normal.set(surfNormal.nx, surfNormal.ny, surfNormal.nz);
          found = true;
          break;
        }
      }
    }

    if (!found) return;

    const rocket = new THREE.Group();

    // Rocket Body (Cylinder)
    const bodyGeom = new THREE.CylinderGeometry(2, 3, 12, 6);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, flatShading: true });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 6;
    rocket.add(body);

    // Rocket Nose (Cone)
    const noseGeom = new THREE.ConeGeometry(2, 4, 6);
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xff4444, flatShading: true });
    const nose = new THREE.Mesh(noseGeom, noseMat);
    nose.position.y = 14;
    rocket.add(nose);

    // Fins
    const finGeom = new THREE.BoxGeometry(4, 4, 0.5);
    const finMat = new THREE.MeshStandardMaterial({ color: 0xff4444, flatShading: true });
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(finGeom, finMat);
      const angle = (i / 3) * Math.PI * 2;
      fin.position.set(Math.cos(angle) * 2.5, 2, Math.sin(angle) * 2.5);
      fin.rotation.y = -angle;
      rocket.add(fin);
    }

    // Crash it! Tilt it slightly
    rocket.rotation.x = Math.PI * 0.15;
    rocket.rotation.z = Math.PI * 0.05;

    const finalWrapper = new THREE.Group();
    finalWrapper.position.copy(pos);
    finalWrapper.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    finalWrapper.add(rocket);

    group.add(finalWrapper);
  }

  private getTreeMaterial(): THREE.MeshStandardMaterial {
    if (this.treeMaterial) return this.treeMaterial;
    this.treeMaterial = new THREE.MeshStandardMaterial({
      map: this.getTreeTexture(),
      transparent: true,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      roughness: 0.95,
      metalness: 0,
      dithering: true,
    });
    return this.treeMaterial;
  }

  private getTreeTexture(): THREE.CanvasTexture {
    if (this.treeTexture) return this.treeTexture;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const trunkGradient = ctx.createLinearGradient(118, 110, 138, 256);
    trunkGradient.addColorStop(0, "#7f5831");
    trunkGradient.addColorStop(1, "#4d2f17");
    ctx.fillStyle = trunkGradient;
    ctx.beginPath();
    ctx.moveTo(114, 122);
    ctx.lineTo(142, 122);
    ctx.lineTo(150, 256);
    ctx.lineTo(106, 256);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#2f8b43";
    ctx.beginPath();
    ctx.moveTo(126, 20);
    ctx.lineTo(194, 82);
    ctx.lineTo(160, 90);
    ctx.lineTo(220, 140);
    ctx.lineTo(150, 146);
    ctx.lineTo(182, 198);
    ctx.lineTo(74, 198);
    ctx.lineTo(102, 146);
    ctx.lineTo(32, 140);
    ctx.lineTo(92, 90);
    ctx.lineTo(58, 82);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#46aa57";
    ctx.beginPath();
    ctx.moveTo(126, 34);
    ctx.lineTo(174, 82);
    ctx.lineTo(146, 86);
    ctx.lineTo(190, 126);
    ctx.lineTo(152, 132);
    ctx.lineTo(174, 172);
    ctx.lineTo(78, 172);
    ctx.lineTo(100, 132);
    ctx.lineTo(62, 126);
    ctx.lineTo(106, 86);
    ctx.lineTo(78, 82);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255, 248, 220, 0.18)";
    ctx.beginPath();
    ctx.moveTo(116, 46);
    ctx.lineTo(152, 78);
    ctx.lineTo(132, 84);
    ctx.lineTo(162, 112);
    ctx.lineTo(136, 116);
    ctx.lineTo(150, 146);
    ctx.lineTo(102, 146);
    ctx.lineTo(114, 118);
    ctx.lineTo(92, 112);
    ctx.lineTo(120, 84);
    ctx.lineTo(104, 80);
    ctx.closePath();
    ctx.fill();

    this.treeTexture = new THREE.CanvasTexture(canvas);
    this.treeTexture.colorSpace = THREE.SRGBColorSpace;
    this.treeTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.treeTexture.magFilter = THREE.LinearFilter;
    this.treeTexture.generateMipmaps = true;
    this.treeTexture.needsUpdate = true;
    return this.treeTexture;
  }

  dispose(): void {
    for (const group of this.planetProps) {
      this.scene.remove(group);
    }
    this.planetProps.length = 0;
    this.treeMaterial?.dispose();
    this.treeTexture?.dispose();
    this.billboardGeometry.dispose();
  }
}
