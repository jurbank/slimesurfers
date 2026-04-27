import * as THREE from "three";
import { RAIL_DEFS } from "@splat/content/config/railDefs.ts";
import { GAME_CONFIG, PLANET_POSITIONS } from "@splat/content/config/gameConfig.ts";
import { buildComputedRail, sampleRailAt } from "@splat/simulation/movement/railSpline.ts";
import { getTerrainRadius } from "@splat/simulation/terrain/planetTerrain.ts";
import { railVertexShader, railFragmentShader } from "../shaders/railShader.ts";
import type { GameState } from "@splat/protocol/schemas/gameState.ts";

const TUBE_RADIAL_SEGMENTS = 12;
const COLUMN_SPACING = 18; // wu between support columns
const COLUMN_RADIUS = 0.18;
const COLUMN_RADIAL_SEGMENTS = 6;

const COLUMN_MAT = new THREE.MeshStandardMaterial({
  color: 0x8090a8,
  metalness: 0.7,
  roughness: 0.4,
});

export class RailSystem {
  private readonly meshes: THREE.Object3D[] = [];
  private readonly railMaterials = new Map<number, THREE.ShaderMaterial>();

  constructor(scene: THREE.Scene) {
    for (const def of RAIL_DEFS) {
      const planetPos = PLANET_POSITIONS.find((p) => p.id === def.planetId) ?? PLANET_POSITIONS[0]!;
      const planetCenter = { x: planetPos.x, y: planetPos.y, z: planetPos.z };
      const pc = new THREE.Vector3(planetPos.x, planetPos.y, planetPos.z);

      const rail = buildComputedRail(def, planetCenter, GAME_CONFIG);
      if (rail.samples.length < 2) continue;

      // --- Tube ---------------------------------------------------------------
      // Use physics sample positions directly as curve control points so the
      // tube passes through the exact same points the player rides along.
      // CatmullRomCurve3.getPoint(i/(N-1)) == points[i], so TubeGeometry with
      // N-1 segments evaluates at precisely each sample — zero visual/physics drift.
      const curvePoints = rail.samples.map((s) => new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z));
      const tubularSegments = curvePoints.length - 1;

      const curve = new THREE.CatmullRomCurve3(curvePoints);
      const tubeGeo = new THREE.TubeGeometry(
        curve,
        tubularSegments,
        GAME_CONFIG.rail.visualRadius,
        TUBE_RADIAL_SEGMENTS,
        false,
      );

      const mat = new THREE.ShaderMaterial({
        vertexShader: railVertexShader,
        fragmentShader: railFragmentShader,
        uniforms: {
          uBaseColor: { value: new THREE.Color(0xd0d8e8) },
          uEmissive: { value: new THREE.Color(0x3060a0).multiplyScalar(0.12) },
          uPaintNodes: { value: Array.from({ length: 64 }, () => new THREE.Color(0xffffff)) },
        },
      });

      const tubeMesh = new THREE.Mesh(tubeGeo, mat);
      scene.add(tubeMesh);
      this.meshes.push(tubeMesh);
      this.railMaterials.set(def.id, mat);

      // --- Support columns ----------------------------------------------------
      for (let arcLen = 0; arcLen <= rail.totalLength; arcLen += COLUMN_SPACING) {
        const { pos } = sampleRailAt(rail, arcLen);
        const railPt = new THREE.Vector3(pos.x, pos.y, pos.z);

        // Terrain surface point directly below (toward planet center)
        const fromCenter = railPt.clone().sub(pc);
        const dist = fromCenter.length();
        if (dist < 1e-6) continue;
        const nx = fromCenter.x / dist;
        const ny = fromCenter.y / dist;
        const nz = fromCenter.z / dist;
        const terrainR = getTerrainRadius(nx, ny, nz, GAME_CONFIG);
        const waterR = GAME_CONFIG.planet.radius + GAME_CONFIG.terrain.waterLevel;
        // Base of column is either terrain or water surface, whichever is higher
        const baseR = Math.max(terrainR, waterR);
        const surfacePt = pc.clone().addScaledVector(fromCenter, baseR / dist);

        const columnHeight = railPt.distanceTo(surfacePt) - GAME_CONFIG.rail.visualRadius;
        if (columnHeight < 0.5) continue;

        const colGeo = new THREE.CylinderGeometry(
          COLUMN_RADIUS,
          COLUMN_RADIUS,
          columnHeight,
          COLUMN_RADIAL_SEGMENTS,
        );
        const col = new THREE.Mesh(colGeo, COLUMN_MAT);

        // Place at midpoint, orient along the outward normal
        col.position.copy(surfacePt).lerp(railPt, 0.5);
        const up = new THREE.Vector3(0, 1, 0);
        const dir = railPt.clone().sub(surfacePt).normalize();
        col.quaternion.setFromUnitVectors(up, dir);

        scene.add(col);
        this.meshes.push(col);
      }
    }
  }

  update(gameState: GameState | undefined): void {
    if (!gameState || !gameState.railStates) return;

    gameState.railStates.forEach((state, id) => {
      const mat = this.railMaterials.get(Number(id));
      if (mat) {
        const nodesUniform = mat.uniforms.uPaintNodes.value as THREE.Color[];
        state.nodes.forEach((color, i) => {
          if (i < nodesUniform.length) {
            nodesUniform[i].setHex(color);
          }
        });
      }
    });
  }

  dispose(scene: THREE.Scene): void {
    for (const mesh of this.meshes) {
      scene.remove(mesh);
      if (mesh instanceof THREE.Mesh) {
        mesh.geometry.dispose();
      }
    }
    this.meshes.length = 0;
    this.railMaterials.clear();
  }
}
