import * as THREE from "three";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";

type PlanetCloudAnchor = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
};

const CLOUD_TANGENT_HINT_UP = new THREE.Vector3(0, 1, 0);
const CLOUD_TANGENT_HINT_RIGHT = new THREE.Vector3(1, 0, 0);

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

export class CloudSystem {
  private readonly layers: THREE.Group[] = [];
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private material: THREE.MeshBasicMaterial | null = null;
  private texture: THREE.CanvasTexture | null = null;

  constructor(private readonly scene: THREE.Scene) {}

  addPlanetClouds(planet: PlanetCloudAnchor): void {
    const cfg = GAME_CONFIG.shaders.clouds;
    const layer = new THREE.Group();
    layer.position.set(planet.x, planet.y, planet.z);

    const material = this.getMaterial();
    const maxInstances = cfg.patches * cfg.maxLobesPerPatch;
    const clouds = new THREE.InstancedMesh(this.geometry, material, maxInstances);
    clouds.renderOrder = 3;

    const basis = new THREE.Matrix4();
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const normal = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const bitangent = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const planetSeed = seedFromString(planet.id);
    let instanceIndex = 0;

    for (let patch = 0; patch < cfg.patches; patch++) {
      const seed = planetSeed + patch * 101;
      const y = seededRandom(seed + 1) * 2 - 1;
      const theta = seededRandom(seed + 2) * Math.PI * 2;
      const radial = Math.sqrt(Math.max(0, 1 - y * y));
      normal.set(Math.cos(theta) * radial, y, Math.sin(theta) * radial).normalize();

      const cloudRadius =
        planet.radius + cfg.altitude + (seededRandom(seed + 3) - 0.5) * cfg.altitudeVariation;
      const width = cfg.minWidth + seededRandom(seed + 4) * (cfg.maxWidth - cfg.minWidth);
      const height = cfg.minHeight + seededRandom(seed + 5) * (cfg.maxHeight - cfg.minHeight);
      const tangentHint =
        Math.abs(normal.y) > 0.92 ? CLOUD_TANGENT_HINT_RIGHT : CLOUD_TANGENT_HINT_UP;
      const lobeCount =
        cfg.minLobesPerPatch +
        Math.floor(seededRandom(seed + 6) * (cfg.maxLobesPerPatch - cfg.minLobesPerPatch + 1));

      tangent.crossVectors(tangentHint, normal).normalize();
      bitangent.crossVectors(normal, tangent).normalize();
      basis.makeBasis(tangent, bitangent, normal);
      rotation.setFromRotationMatrix(basis);

      for (let lobe = 0; lobe < lobeCount; lobe++) {
        const lobeSeed = seed * 37 + lobe * 17;
        const centered = lobeCount === 1 ? 0 : lobe / (lobeCount - 1) - 0.5;
        const lateral = centered * width * 0.58 + (seededRandom(lobeSeed + 1) - 0.5) * width * 0.12;
        const vertical = (seededRandom(lobeSeed + 2) - 0.5) * height * 0.42;
        const lift = (seededRandom(lobeSeed + 3) - 0.5) * 0.4;
        const lobeWidth = width * (0.34 + seededRandom(lobeSeed + 4) * 0.22);
        const lobeHeight = height * (0.74 + seededRandom(lobeSeed + 5) * 0.36);

        position
          .copy(normal)
          .multiplyScalar(cloudRadius + lift)
          .addScaledVector(tangent, lateral)
          .addScaledVector(bitangent, vertical);
        scale.set(lobeWidth, lobeHeight, 1);
        matrix.compose(position, rotation, scale);
        clouds.setMatrixAt(instanceIndex, matrix);
        instanceIndex++;
      }
    }

    clouds.count = instanceIndex;
    clouds.instanceMatrix.needsUpdate = true;
    clouds.computeBoundingSphere();
    layer.add(clouds);
    this.scene.add(layer);
    this.layers.push(layer);
  }

  update(dt: number): void {
    for (const layer of this.layers) {
      layer.rotation.y += GAME_CONFIG.shaders.clouds.driftSpeed * dt;
    }
  }

  dispose(): void {
    for (const layer of this.layers) {
      this.scene.remove(layer);
    }
    this.layers.length = 0;
    this.geometry.dispose();
    this.material?.dispose();
    this.material = null;
    this.texture?.dispose();
    this.texture = null;
  }

  private getMaterial(): THREE.MeshBasicMaterial {
    this.material ??= new THREE.MeshBasicMaterial({
      map: this.getTexture(),
      color: GAME_CONFIG.shaders.clouds.color,
      opacity: GAME_CONFIG.shaders.clouds.opacity,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      alphaTest: 0.01,
      fog: true,
      side: THREE.DoubleSide,
    });
    return this.material;
  }

  private getTexture(): THREE.CanvasTexture {
    if (this.texture) return this.texture;

    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Unable to create cloud texture canvas context");
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width * 0.5, canvas.height * 0.5);
    ctx.scale(canvas.width * 0.42, canvas.height * 0.34);

    const core = ctx.createRadialGradient(0, 0, 0.06, 0, 0, 1);
    core.addColorStop(0, "rgba(255, 255, 255, 0.46)");
    core.addColorStop(0.42, "rgba(246, 253, 255, 0.3)");
    core.addColorStop(0.76, "rgba(238, 249, 255, 0.1)");
    core.addColorStop(1, "rgba(238, 249, 255, 0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    return this.texture;
  }
}
