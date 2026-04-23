import * as THREE from "three";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { slimeVertexShader, slimeFragmentShader } from "../shaders/slimeShader.ts";

const TEX_SIZE = 64;

function isInPattern(u: number, v: number, patternId: number): boolean {
  switch (patternId) {
    case 1:
    case 5:
      return (v * 4) % 1 > 0.5;
    case 2:
    case 6: {
      const dx = ((u * 4) % 1) - 0.5;
      const dy = ((v * 4) % 1) - 0.5;
      return dx * dx + dy * dy < 0.04;
    }
    case 3:
      return ((u + v) * 4) % 1 > 0.5;
    case 4:
      return (u * 4) % 1 > 0.5;
    case 7:
      return (Math.floor(u * 4) + Math.floor(v * 4)) % 2 === 0;
    default:
      return false;
  }
}

function makePatternTexture(color: number, patternId: number): THREE.DataTexture {
  const br = (color >> 16) & 0xff;
  const bg = (color >> 8) & 0xff;
  const bb = color & 0xff;

  const isDark = patternId === 5 || patternId === 6;
  const pr = isDark ? 0 : 255;
  const pg = isDark ? 0 : 255;
  const pb = isDark ? 0 : 255;
  const blend = 0.55;

  const data = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);

  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const i = (y * TEX_SIZE + x) * 4;
      const u = x / TEX_SIZE;
      const v = y / TEX_SIZE;

      if (isInPattern(u, v, patternId)) {
        data[i] = Math.round(br * (1 - blend) + pr * blend);
        data[i + 1] = Math.round(bg * (1 - blend) + pg * blend);
        data[i + 2] = Math.round(bb * (1 - blend) + pb * blend);
      } else {
        data[i] = br;
        data[i + 1] = bg;
        data[i + 2] = bb;
      }
      data[i + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, TEX_SIZE, TEX_SIZE, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createSlimeMaterial(color: number, patternId: number): THREE.ShaderMaterial {
  const tex = patternId === 0 ? null : makePatternTexture(color, patternId);
  const colorVec = new THREE.Color(color);

  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex },
      uColor: { value: colorVec },
      emissive: { value: new THREE.Color(0, 0, 0) },
      emissiveIntensity: { value: 0 },
      hasMap: { value: patternId !== 0 },
      opacity: { value: 1.0 },
      celBands: { value: GAME_CONFIG.shaders.cel.bands },
      celSoftness: { value: GAME_CONFIG.shaders.cel.softness },
      celHatchStrength: { value: GAME_CONFIG.shaders.cel.hatchStrength },
      celHatchScale: { value: GAME_CONFIG.shaders.cel.hatchScale },
    },
    vertexShader: slimeVertexShader,
    fragmentShader: slimeFragmentShader,
  });
}
