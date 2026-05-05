import * as THREE from "three";
import { describe, expect, it } from "vite-plus/test";
import type { EditorConfig } from "../../types.ts";
import {
  buildTrackSurfaceSamples,
  getTrackRaisedRadius,
  type TrackSurfaceSample,
} from "./trackCarving.ts";
import type { TrackState } from "./TrackTypes.ts";

const TEST_CONFIG: EditorConfig = {
  planets: [
    {
      id: "planet-0",
      center: { x: 0, y: 0, z: 0 },
      radius: 100,
      terrain: {
        seed: 1,
        baseAmplitude: 0,
        frequency: 1,
        octaves: 1,
        lacunarity: 2,
        persistence: 0.5,
        heightSmoothingStrength: 0,
        heightSmoothingSampleAngle: 0.03,
        icosahedronDetail: 8,
        waterLevel: -20,
        sandBand: 1,
        rockLevel: 20,
        snowLevel: 40,
      },
      colors: { sand: 0, grass: 0, rock: 0, snow: 0, waterDeep: 0 },
      atmosphere: {
        enabled: false,
        height: 0,
        color: 0,
        intensity: 1,
        opacity: 1,
        fresnelPower: 1,
        falloffPower: 1,
      },
      lighting: {
        sunAzimuth: 0,
        sunElevation: 0,
        sunIntensity: 1,
        ambientIntensity: 1,
        rimColor: 0,
        rimStrength: 0,
        rimPower: 1,
      },
      props: { treeDensity: 0, cactusDensity: 0, seed: 0, rocketEnabled: false },
      hasWater: false,
    },
  ],
  shaders: {
    cel: { bands: 3, softness: 0.2, hatchStrength: 0, hatchScale: 1 },
  },
};

function makeTrack(pointRadius: number): TrackState {
  return {
    id: "track-1",
    name: "Track 1",
    closed: false,
    width: 8,
    bank: 0,
    segmentsPerCurve: 4,
    points: [
      { id: "a", normal: [0, 1, -0.1], position: [0, pointRadius, -10] },
      { id: "b", normal: [0, 1, 0.1], position: [0, pointRadius, 10] },
    ],
  };
}

describe("track carving", () => {
  it("keeps elevated bridge-like track sections walkable in preview", () => {
    const samples = buildTrackSurfaceSamples([makeTrack(105)], TEST_CONFIG, () => 100);

    expect(samples.length).toBeGreaterThan(0);
  });

  it("keeps tunnel track ribbons available as playable floors", () => {
    const samples = buildTrackSurfaceSamples([makeTrack(99)], TEST_CONFIG, () => 100);

    expect(samples.length).toBeGreaterThan(0);
  });

  it("raises track collision toward the banked ribbon surface", () => {
    const side = new THREE.Vector3(1, 1, 0).normalize();
    const surfacePoint = new THREE.Vector3(0, 100, 0).addScaledVector(side, 3);
    const normal = surfacePoint.clone().normalize();
    const sample: TrackSurfaceSample = {
      position: new THREE.Vector3(0, 100, 0),
      tangent: new THREE.Vector3(0, 0, 1),
      side,
      centerRadius: 100,
      halfWidth: 5,
      influenceAlong: 10,
    };

    const raised = getTrackRaisedRadius(normal.x, normal.y, normal.z, 100, [sample]);

    expect(raised).toBeGreaterThan(101);
  });

  it("can raise a carved tunnel floor back to the playable track ribbon", () => {
    const sample: TrackSurfaceSample = {
      position: new THREE.Vector3(0, 100, 0),
      tangent: new THREE.Vector3(0, 0, 1),
      side: new THREE.Vector3(1, 0, 0),
      centerRadius: 100,
      halfWidth: 5,
      influenceAlong: 10,
    };

    const raised = getTrackRaisedRadius(0, 1, 0, 98.5, [sample]);

    expect(raised).toBeCloseTo(100, 5);
  });
});
