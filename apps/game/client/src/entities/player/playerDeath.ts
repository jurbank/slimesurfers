import * as THREE from "three";

interface DeathFoot {
  mesh: THREE.Mesh;
  basePosition: THREE.Vector3;
  baseRotation: THREE.Euler;
}

export interface PlayerDeathParticles {
  root: THREE.Group;
  points: THREE.Points;
  positionAttr: THREE.BufferAttribute;
  colorAttr: THREE.BufferAttribute;
  origin: Float32Array;
  velocity: Float32Array;
  settleDelay: Float32Array;
  shockwave: THREE.Mesh;
  feet: DeathFoot[];
}

const DEATH_PARTICLE_COUNT = 100;
const DEATH_PARTICLE_SPEED_MULTIPLIER = 9;
const DEATH_PARTICLE_SIZE = 0.35;
const DEATH_PARTICLE_GRAVITY = 120.75;

const deathTmpColor = new THREE.Color();
const deathWhiteColor = new THREE.Color(0xffffff);

function seededUnit(index: number): number {
  const x = Math.sin(index * 127.1 + 19.7) * 43758.5453;
  return x - Math.floor(x);
}

export function createPlayerDeathParticles(
  slimeColor: number,
  bodyRadius: number,
): PlayerDeathParticles {
  const root = new THREE.Group();
  const feet: DeathFoot[] = [];
  const origin = new Float32Array(DEATH_PARTICLE_COUNT * 3);
  const positions = new Float32Array(DEATH_PARTICLE_COUNT * 3);
  const colors = new Float32Array(DEATH_PARTICLE_COUNT * 3);
  const velocity = new Float32Array(DEATH_PARTICLE_COUNT * 3);
  const settleDelay = new Float32Array(DEATH_PARTICLE_COUNT);

  const footGeom = new THREE.SphereGeometry(bodyRadius * 0.23, 14, 10);
  const footMat = new THREE.MeshLambertMaterial({
    color: slimeColor,
    emissive: slimeColor,
    emissiveIntensity: 0.22,
  });

  for (let i = 0; i < DEATH_PARTICLE_COUNT; i++) {
    const p = i * 3;
    const angle = seededUnit(i) * Math.PI * 2;
    const shell = seededUnit(i + 17) ** 0.35;
    const startRadius = bodyRadius * (0.05 + seededUnit(i + 31) * 0.42);
    const speed = 0.8 + seededUnit(i + 43) * 1.75;
    const upwardBias = 0.42 + seededUnit(i + 59) * 1.45;

    origin[p] = Math.cos(angle) * startRadius;
    origin[p + 1] = -bodyRadius * 0.08 + seededUnit(i + 71) * bodyRadius * 0.72;
    origin[p + 2] = Math.sin(angle) * startRadius;
    positions[p] = origin[p];
    positions[p + 1] = origin[p + 1];
    positions[p + 2] = origin[p + 2];

    velocity[p] = Math.cos(angle) * speed * shell * DEATH_PARTICLE_SPEED_MULTIPLIER;
    velocity[p + 1] = upwardBias * DEATH_PARTICLE_SPEED_MULTIPLIER;
    velocity[p + 2] = Math.sin(angle) * speed * shell * DEATH_PARTICLE_SPEED_MULTIPLIER;
    settleDelay[i] = seededUnit(i + 83) * 0.16;

    deathTmpColor.setHex(slimeColor).lerp(deathWhiteColor, 0.12 + seededUnit(i + 97) * 0.35);
    colors[p] = deathTmpColor.r;
    colors[p + 1] = deathTmpColor.g;
    colors[p + 2] = deathTmpColor.b;
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttr = new THREE.BufferAttribute(positions, 3);
  const colorAttr = new THREE.BufferAttribute(colors, 3);
  positionAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("color", colorAttr);
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: DEATH_PARTICLE_SIZE,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    }),
  );
  root.add(points);

  const shockwave = new THREE.Mesh(
    new THREE.TorusGeometry(bodyRadius * 0.62, 0.035, 8, 42),
    new THREE.MeshBasicMaterial({
      color: slimeColor,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  shockwave.rotation.x = Math.PI / 2;
  shockwave.position.y = -bodyRadius * 0.38;
  root.add(shockwave);

  for (const [index, x] of [-bodyRadius * 0.32, bodyRadius * 0.32].entries()) {
    const mesh = new THREE.Mesh(footGeom, footMat);
    const basePosition = new THREE.Vector3(x, -bodyRadius * 0.9, bodyRadius * 0.12);
    const baseRotation = new THREE.Euler(0.14, 0, index === 0 ? -0.18 : 0.18);
    mesh.position.copy(basePosition);
    mesh.rotation.copy(baseRotation);
    mesh.scale.set(1.25, 0.48, 1.08);
    feet.push({ mesh, basePosition, baseRotation });
    root.add(mesh);
  }

  root.visible = false;
  return { root, points, positionAttr, colorAttr, origin, velocity, settleDelay, shockwave, feet };
}

export function resetPlayerDeathParticles(particles: PlayerDeathParticles): void {
  particles.root.visible = true;
  particles.root.scale.setScalar(1);
  const positions = particles.positionAttr.array as Float32Array;
  for (let i = 0; i < DEATH_PARTICLE_COUNT * 3; i++) {
    positions[i] = particles.origin[i] ?? 0;
  }
  particles.positionAttr.needsUpdate = true;
  const mat = particles.points.material as THREE.PointsMaterial;
  mat.opacity = 0.95;
  particles.points.visible = true;
  const shockMat = particles.shockwave.material as THREE.MeshBasicMaterial;
  shockMat.opacity = 0.3;
  particles.shockwave.scale.setScalar(0.3);
  for (const foot of particles.feet) {
    foot.mesh.position.copy(foot.basePosition);
    foot.mesh.rotation.copy(foot.baseRotation);
  }
}

export function updatePlayerDeathParticles(particles: PlayerDeathParticles, age: number): void {
  particles.root.visible = true;
  const positions = particles.positionAttr.array as Float32Array;
  const fadeT = Math.min(1, Math.max(0, (age - 0.18) / 1.0));

  for (let i = 0; i < DEATH_PARTICLE_COUNT; i++) {
    const p = i * 3;
    const t = Math.max(0, age - particles.settleDelay[i]);
    positions[p] = (particles.origin[p] ?? 0) + (particles.velocity[p] ?? 0) * t;
    positions[p + 1] =
      (particles.origin[p + 1] ?? 0) +
      (particles.velocity[p + 1] ?? 0) * t -
      0.5 * DEATH_PARTICLE_GRAVITY * t * t;
    positions[p + 2] = (particles.origin[p + 2] ?? 0) + (particles.velocity[p + 2] ?? 0) * t;
    const floorY = -0.52;
    if ((positions[p + 1] ?? 0) < floorY) {
      positions[p + 1] = floorY + seededUnit(i + 127) * 0.045;
    }
  }
  particles.positionAttr.needsUpdate = true;

  const particleMat = particles.points.material as THREE.PointsMaterial;
  particleMat.opacity = Math.max(0.18, 0.95 * (1 - fadeT * 0.72));

  const shockMat = particles.shockwave.material as THREE.MeshBasicMaterial;
  const shockT = Math.min(1, age / 0.34);
  particles.shockwave.scale.setScalar(0.35 + shockT * 2.5);
  shockMat.opacity = Math.max(0, 0.8 * (1 - shockT));

  const footKick = Math.max(0, 1 - age / 0.24);
  for (const [index, foot] of particles.feet.entries()) {
    foot.mesh.position.copy(foot.basePosition);
    foot.mesh.position.x += (index === 0 ? -1 : 1) * 0.04 * footKick;
    foot.mesh.rotation.copy(foot.baseRotation);
    foot.mesh.rotation.z += (index === 0 ? -1 : 1) * 0.38 * footKick;
  }
}
