import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { createAtmosphereMaterial } from "../rendering/atmosphereMaterial.ts";
import { createOutlineMaterial } from "../rendering/outlineMaterial.ts";
import { buildPlanetGeometry, buildWaterGeometry } from "../rendering/planetGeometry.ts";
import { createPlanetMaterial } from "../rendering/planetMaterial.ts";
import { createWaterMaterial } from "../rendering/waterMaterial.ts";

export class EditorScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly planetMaterial: THREE.ShaderMaterial;
  private readonly waterMaterial: THREE.ShaderMaterial | null = null;
  private animFrameId = 0;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080818);
    this.scene.fog = new THREE.Fog(0x080818, 400, 1200);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(200, 300, 100);
    this.scene.add(sun);

    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 2000);
    this.camera.position.set(0, 40, 230);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 115;
    this.controls.maxDistance = 600;
    this.controls.target.set(0, 0, 0);

    const planetRadius = GAME_CONFIG.planet.radius;
    const waterRadius = planetRadius + GAME_CONFIG.terrain.waterLevel;
    const atmosphereRadius = planetRadius + GAME_CONFIG.shaders.atmosphere.height;

    const planetGeo = buildPlanetGeometry();

    this.planetMaterial = createPlanetMaterial({
      paintMask: null,
      planetCenter: new THREE.Vector3(0, 0, 0),
      waterRadius,
    });
    this.scene.add(new THREE.Mesh(planetGeo, this.planetMaterial));
    this.scene.add(new THREE.Mesh(planetGeo, createOutlineMaterial()));

    if (GAME_CONFIG.shaders.atmosphere.enabled) {
      const atmoMesh = new THREE.Mesh(
        new THREE.SphereGeometry(atmosphereRadius, 48, 48),
        createAtmosphereMaterial(),
      );
      atmoMesh.renderOrder = 2;
      this.scene.add(atmoMesh);
    }

    if (GAME_CONFIG.shaders.water.enabled) {
      this.waterMaterial = createWaterMaterial();
      const waterMesh = new THREE.Mesh(buildWaterGeometry(waterRadius), this.waterMaterial);
      waterMesh.renderOrder = 1;
      this.scene.add(waterMesh);
    }

    this.start();
  }

  private start(): void {
    const tick = (): void => {
      this.animFrameId = requestAnimationFrame(tick);
      const t = performance.now() / 1000;
      this.planetMaterial.uniforms.time.value = t;
      if (this.waterMaterial) this.waterMaterial.uniforms.time.value = t;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  dispose(): void {
    cancelAnimationFrame(this.animFrameId);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
