import * as THREE from "three";

export class RenderSystem {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(devicePixelRatio);
    document.body.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080818);
    this.scene.fog = new THREE.Fog(0x080818, 400, 1200);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(200, 300, 100);
    this.scene.add(sun);

    window.addEventListener("resize", () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  render(camera: THREE.PerspectiveCamera): void {
    this.renderer.render(this.scene, camera);
  }
}
