import * as THREE from "three";
import {
  puffyCloudFragmentShader,
  puffyCloudVertexShader,
  wispyCloudFragmentShader,
  wispyCloudVertexShader,
} from "@splat/client-runtime/shaders/cloudShader.ts";

export interface WispyCloudMaterialOptions {
  color: number;
  density: number;
  opacity: number;
  thickness: number;
  coverageScale: number;
  movementSpeed: number;
  blending?: THREE.Blending;
}

export interface PuffyCloudMaterialOptions {
  color: number;
  density: number;
  opacity: number;
  thickness: number;
  size: number;
  movementSpeed: number;
  blending?: THREE.Blending;
}

const DEFAULT_SUN_DIRECTION = new THREE.Vector3(0.5, 0.7, 0.5).normalize();

export function createWispyCloudMaterial(options: WispyCloudMaterialOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    blending: options.blending ?? THREE.NormalBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    uniforms: {
      time: { value: 0 },
      cloudColor: { value: new THREE.Color(options.color) },
      density: { value: options.density },
      opacity: { value: options.opacity },
      thickness: { value: options.thickness },
      coverageScale: { value: options.coverageScale },
      movementSpeed: { value: options.movementSpeed },
      sunDirection: { value: DEFAULT_SUN_DIRECTION.clone() },
    },
    vertexShader: wispyCloudVertexShader,
    fragmentShader: wispyCloudFragmentShader,
  });
}

export function createPuffyCloudMaterial(options: PuffyCloudMaterialOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    blending: options.blending ?? THREE.NormalBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    uniforms: {
      time: { value: 0 },
      cloudColor: { value: new THREE.Color(options.color) },
      density: { value: options.density },
      opacity: { value: options.opacity },
      thickness: { value: options.thickness },
      size: { value: options.size },
      movementSpeed: { value: options.movementSpeed },
      sunDirection: { value: DEFAULT_SUN_DIRECTION.clone() },
    },
    vertexShader: puffyCloudVertexShader,
    fragmentShader: puffyCloudFragmentShader,
  });
}
