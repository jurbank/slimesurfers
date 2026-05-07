import * as THREE from "three";

function random01(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

export function createPuffyCloudGeometry(): THREE.BufferGeometry {
  const cloudBankCount = 34;
  const lobesPerBank = 6;
  const cloudletsPerLobe = 7;
  const cloudletCount = cloudBankCount * lobesPerBank * cloudletsPerLobe;
  const positions = new Float32Array(cloudletCount * 3);
  const normals = new Float32Array(cloudletCount * 3);
  const randomness = new Float32Array(cloudletCount);
  const coverages = new Float32Array(cloudletCount);
  const radii = new Float32Array(cloudletCount);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const normal = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const bitangent = new THREE.Vector3();
  const pointNormal = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3(1, 0, 0);
  let index = 0;

  for (let bank = 0; bank < cloudBankCount; bank++) {
    const y = 1 - (bank / Math.max(1, cloudBankCount - 1)) * 2;
    const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = bank * goldenAngle;
    const bankSeed = bank * 23.71;
    const bankCoverage = random01(bankSeed + 0.3);
    const bankTwist = random01(bankSeed + 0.7) * Math.PI * 2;
    const bankWidth = 0.11 + random01(bankSeed + 1.3) * 0.08;
    const bankHeight = 0.05 + random01(bankSeed + 1.9) * 0.05;
    normal.set(Math.cos(theta) * ringRadius, y, Math.sin(theta) * ringRadius).normalize();
    tangent.crossVectors(Math.abs(normal.y) > 0.9 ? right : up, normal).normalize();
    bitangent.crossVectors(normal, tangent).normalize();

    for (let lobe = 0; lobe < lobesPerBank; lobe++) {
      const lobeSeed = bankSeed + lobe * 11.17;
      const lobeAngle =
        bankTwist +
        (lobe / Math.max(1, lobesPerBank - 1)) * Math.PI * 2 +
        random01(lobeSeed) * 0.55;
      const lobeReach = lobe === 0 ? 0 : 0.25 + random01(lobeSeed + 1.0) * 0.45;
      const lobeX = Math.cos(lobeAngle) * bankWidth * lobeReach;
      const lobeY = Math.sin(lobeAngle) * bankHeight * lobeReach;
      const lobeRadius = 0.9 + random01(lobeSeed + 2.0) * 0.58;

      for (let cloudlet = 0; cloudlet < cloudletsPerLobe; cloudlet++) {
        const seed = lobeSeed + cloudlet * 7.31;
        const angle = random01(seed + 3.0) * Math.PI * 2;
        const spread = Math.sqrt(random01(seed + 4.0)) * (0.014 + lobeRadius * 0.01);
        const localX = lobeX + Math.cos(angle) * spread;
        const localY = lobeY + Math.sin(angle) * spread * 0.62;
        const layer = -0.03 + random01(seed + 5.0) * 0.09;
        pointNormal
          .copy(normal)
          .addScaledVector(tangent, localX)
          .addScaledVector(bitangent, localY)
          .normalize();

        positions[index * 3] = pointNormal.x * (1 + layer);
        positions[index * 3 + 1] = pointNormal.y * (1 + layer);
        positions[index * 3 + 2] = pointNormal.z * (1 + layer);
        normals[index * 3] = pointNormal.x;
        normals[index * 3 + 1] = pointNormal.y;
        normals[index * 3 + 2] = pointNormal.z;
        randomness[index] = random01(seed + 6.0);
        coverages[index] = bankCoverage;
        radii[index] = lobeRadius * (0.88 + random01(seed + 7.0) * 0.34);
        index++;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("cloudNormal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("cloudRandom", new THREE.BufferAttribute(randomness, 1));
  geometry.setAttribute("cloudCoverage", new THREE.BufferAttribute(coverages, 1));
  geometry.setAttribute("cloudRadius", new THREE.BufferAttribute(radii, 1));
  return geometry;
}
