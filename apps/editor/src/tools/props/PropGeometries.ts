import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const TREE_COLORS = {
  trunk: 0x6d4a2f,
  canopy: 0x2ea043,
  canopyDark: 0x1f6f3a,
  palmTrunk: 0x9b6a3d,
  palmFronds: 0x35a852,
  mushroomTrunk: 0xeeeeee,
  mushroomCap: 0xd23636,
  cactus: 0x4a7c44,
  bush: 0x3a5f0b,
  flowerStem: 0x4e7a3d,
  flowerPetal: 0xffd700,
};

export const SKATE_PARK_COLORS = {
  rampDeck: 0x8b95a1,
};

export function createLowPolyTreeGeometry() {
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 2.1, 5);
  trunkGeo.translate(0, 1.05, 0);

  const canopyGeo = new THREE.ConeGeometry(1.15, 2.1, 6);
  canopyGeo.translate(0, 2.45, 0);

  const canopyTopGeo = new THREE.ConeGeometry(0.8, 1.65, 6);
  canopyTopGeo.translate(0, 3.45, 0);

  return { trunkGeo, canopyGeo, canopyTopGeo };
}

export function createPalmTreeGeometry() {
  const palmTrunkGeo = new THREE.CylinderGeometry(0.16, 0.32, 3.6, 6, 4);
  palmTrunkGeo.translate(0, 1.8, 0);

  const frondCount = 7;
  const verts: number[] = [];
  const crownHeight = 3.65;

  for (let i = 0; i < frondCount; i++) {
    const angle = (i / frondCount) * Math.PI * 2;
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const sideX = -dirZ;
    const sideZ = dirX;
    const baseWidth = 0.42;
    const midWidth = 0.34;

    const baseX = dirX * 0.18;
    const baseZ = dirZ * 0.18;
    const midX = dirX * 1.1;
    const midZ = dirZ * 1.1;
    const tipX = dirX * 1.95;
    const tipZ = dirZ * 1.95;

    verts.push(
      baseX + sideX * baseWidth,
      crownHeight,
      baseZ + sideZ * baseWidth,
      baseX - sideX * baseWidth,
      crownHeight,
      baseZ - sideZ * baseWidth,
      midX + sideX * midWidth,
      crownHeight - 0.25,
      midZ + sideZ * midWidth,

      baseX - sideX * baseWidth,
      crownHeight,
      baseZ - sideZ * baseWidth,
      midX - sideX * midWidth,
      crownHeight - 0.25,
      midZ - sideZ * midWidth,
      midX + sideX * midWidth,
      crownHeight - 0.25,
      midZ + sideZ * midWidth,

      midX + sideX * midWidth,
      crownHeight - 0.25,
      midZ + sideZ * midWidth,
      midX - sideX * midWidth,
      crownHeight - 0.25,
      midZ - sideZ * midWidth,
      tipX,
      crownHeight - 0.7,
      tipZ,
    );
  }

  const palmFrondsGeo = new THREE.BufferGeometry();
  palmFrondsGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  palmFrondsGeo.computeVertexNormals();

  return { palmTrunkGeo, palmFrondsGeo };
}

export function createMushroomGeometry() {
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.6, 6);
  trunkGeo.translate(0, 0.3, 0);

  const capGeo = new THREE.SphereGeometry(0.5, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  capGeo.scale(1, 0.6, 1);
  capGeo.translate(0, 0.5, 0);

  return { trunkGeo, capGeo };
}

export function createCactusGeometry() {
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.25, 1.8, 6);
  trunkGeo.translate(0, 0.9, 0);

  const arm1Geo = new THREE.CylinderGeometry(0.18, 0.18, 0.8, 5);
  arm1Geo.rotateZ(Math.PI / 2);
  arm1Geo.translate(0.4, 1.1, 0);
  const arm1UpGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.6, 5);
  arm1UpGeo.translate(0.8, 1.4, 0);

  const arm2Geo = new THREE.CylinderGeometry(0.18, 0.18, 0.8, 5);
  arm2Geo.rotateZ(-Math.PI / 2);
  arm2Geo.translate(-0.4, 0.7, 0);
  const arm2UpGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.6, 5);
  arm2UpGeo.translate(-0.8, 1.0, 0);

  const cactusGeo = BufferGeometryUtils.mergeGeometries([
    trunkGeo,
    arm1Geo,
    arm1UpGeo,
    arm2Geo,
    arm2UpGeo,
  ]);

  return { cactusGeo };
}

export function createBushGeometry() {
  const bushGeoMain = new THREE.IcosahedronGeometry(0.6, 0);
  const p1 = new THREE.IcosahedronGeometry(0.45, 0);
  p1.translate(0.4, 0.2, 0.2);
  const p2 = new THREE.IcosahedronGeometry(0.45, 0);
  p2.translate(-0.3, 0.1, 0.4);
  const p3 = new THREE.IcosahedronGeometry(0.4, 0);
  p3.translate(0, 0.4, -0.3);

  const bushGeo = BufferGeometryUtils.mergeGeometries([bushGeoMain, p1, p2, p3]);
  bushGeo.translate(0, 0.4, 0);

  return { bushGeo };
}

export function createFlowerGeometry() {
  const stemGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8, 4);
  stemGeo.translate(0, 0.4, 0);

  const petalGeo = new THREE.CircleGeometry(0.2, 5);
  petalGeo.rotateX(-Math.PI / 2);
  petalGeo.translate(0, 0.82, 0);

  return { stemGeo, petalGeo };
}

export function createRampGeometry() {
  const halfWidth = 1.35;
  const frontZ = -1.65;
  const lipZ = 0.75;
  const backZ = 1.45;
  const height = 1.0;
  const curveSegments = 7;
  const positions: number[] = [];

  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
  ) => {
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  };

  const curve: [number, number][] = [];
  for (let i = 0; i <= curveSegments; i++) {
    const t = i / curveSegments;
    const z = frontZ + (lipZ - frontZ) * t;
    const y = height * (1 - Math.cos((t * Math.PI) / 2));
    curve.push([z, y]);
  }

  for (let i = 0; i < curve.length - 1; i++) {
    const [z0, y0] = curve[i];
    const [z1, y1] = curve[i + 1];
    quad([-halfWidth, y0, z0], [halfWidth, y0, z0], [halfWidth, y1, z1], [-halfWidth, y1, z1]);
  }

  quad(
    [-halfWidth, height, lipZ],
    [halfWidth, height, lipZ],
    [halfWidth, height, backZ],
    [-halfWidth, height, backZ],
  );
  quad(
    [-halfWidth, 0, frontZ],
    [-halfWidth, 0, backZ],
    [halfWidth, 0, backZ],
    [halfWidth, 0, frontZ],
  );
  quad(
    [-halfWidth, 0, backZ],
    [-halfWidth, height, backZ],
    [halfWidth, height, backZ],
    [halfWidth, 0, backZ],
  );

  for (const x of [-halfWidth, halfWidth]) {
    for (let i = 0; i < curve.length - 1; i++) {
      const [z0, y0] = curve[i];
      const [z1, y1] = curve[i + 1];
      if (x < 0) {
        quad([x, 0, z0], [x, y0, z0], [x, y1, z1], [x, 0, z1]);
      } else {
        quad([x, 0, z0], [x, 0, z1], [x, y1, z1], [x, y0, z0]);
      }
    }
    if (x < 0) {
      quad([x, 0, lipZ], [x, height, lipZ], [x, height, backZ], [x, 0, backZ]);
    } else {
      quad([x, 0, lipZ], [x, 0, backZ], [x, height, backZ], [x, height, lipZ]);
    }
  }

  const copingRadius = 0.09;
  const copingSegments = 8;
  for (let i = 0; i < copingSegments; i++) {
    const a0 = (i / copingSegments) * Math.PI * 2;
    const a1 = ((i + 1) / copingSegments) * Math.PI * 2;
    const y0 = height + Math.sin(a0) * copingRadius;
    const z0 = lipZ + Math.cos(a0) * copingRadius;
    const y1 = height + Math.sin(a1) * copingRadius;
    const z1 = lipZ + Math.cos(a1) * copingRadius;
    quad([-halfWidth, y0, z0], [halfWidth, y0, z0], [halfWidth, y1, z1], [-halfWidth, y1, z1]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

export function createPropPreviewObject(propId: string): THREE.Object3D {
  const group = new THREE.Group();

  if (propId === "lowPolyTree") {
    const { trunkGeo, canopyGeo, canopyTopGeo } = createLowPolyTreeGeometry();
    group.add(
      new THREE.Mesh(trunkGeo, new THREE.MeshLambertMaterial({ color: TREE_COLORS.trunk })),
      new THREE.Mesh(canopyGeo, new THREE.MeshLambertMaterial({ color: TREE_COLORS.canopy })),
      new THREE.Mesh(
        canopyTopGeo,
        new THREE.MeshLambertMaterial({ color: TREE_COLORS.canopyDark }),
      ),
    );
  } else if (propId === "palmTree") {
    const { palmTrunkGeo, palmFrondsGeo } = createPalmTreeGeometry();
    group.add(
      new THREE.Mesh(palmTrunkGeo, new THREE.MeshLambertMaterial({ color: TREE_COLORS.palmTrunk })),
      new THREE.Mesh(
        palmFrondsGeo,
        new THREE.MeshLambertMaterial({ color: TREE_COLORS.palmFronds, side: THREE.DoubleSide }),
      ),
    );
  } else if (propId === "mushroom") {
    const { trunkGeo, capGeo } = createMushroomGeometry();
    group.add(
      new THREE.Mesh(trunkGeo, new THREE.MeshLambertMaterial({ color: TREE_COLORS.mushroomTrunk })),
      new THREE.Mesh(capGeo, new THREE.MeshLambertMaterial({ color: TREE_COLORS.mushroomCap })),
    );
  } else if (propId === "cactus") {
    const { cactusGeo } = createCactusGeometry();
    group.add(
      new THREE.Mesh(cactusGeo, new THREE.MeshLambertMaterial({ color: TREE_COLORS.cactus })),
    );
  } else if (propId === "bush") {
    const { bushGeo } = createBushGeometry();
    group.add(new THREE.Mesh(bushGeo, new THREE.MeshLambertMaterial({ color: TREE_COLORS.bush })));
  } else if (propId === "flower") {
    const { stemGeo, petalGeo } = createFlowerGeometry();
    group.add(
      new THREE.Mesh(stemGeo, new THREE.MeshLambertMaterial({ color: TREE_COLORS.flowerStem })),
      new THREE.Mesh(
        petalGeo,
        new THREE.MeshLambertMaterial({ color: TREE_COLORS.flowerPetal, side: THREE.DoubleSide }),
      ),
    );
  } else if (propId === "ramp") {
    const rampGeo = createRampGeometry();
    group.add(
      new THREE.Mesh(
        rampGeo,
        new THREE.MeshLambertMaterial({ color: SKATE_PARK_COLORS.rampDeck, flatShading: true }),
      ),
    );
  }

  return group;
}
