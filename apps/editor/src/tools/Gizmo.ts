import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";

interface GizmoOptions {
  camera: THREE.Camera;
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  size?: number;
  onChange: () => void;
  onDragChange: (dragging: boolean) => void;
}

export class Gizmo {
  readonly target = new THREE.Object3D();

  private readonly controls: TransformControls;
  private readonly helper: THREE.Object3D;
  private readonly scene: THREE.Scene;
  private readonly onChange: () => void;
  private readonly onDragChange: (dragging: boolean) => void;

  constructor(options: GizmoOptions) {
    this.scene = options.scene;
    this.onChange = options.onChange;
    this.onDragChange = options.onDragChange;

    this.target.visible = false;
    this.controls = new TransformControls(options.camera, options.canvas);
    this.controls.setMode("translate");
    this.controls.setSpace("local");
    this.controls.setSize(options.size ?? 0.72);
    this.controls.addEventListener("objectChange", this.handleObjectChange);
    this.controls.addEventListener("dragging-changed", this.handleDraggingChanged);

    this.helper = this.controls.getHelper();
    this.helper.visible = false;
    this.scene.add(this.helper);
  }

  attach(position: THREE.Vector3, quaternion?: THREE.Quaternion): void {
    this.target.position.copy(position);
    if (quaternion) this.target.quaternion.copy(quaternion);
    this.controls.attach(this.target);
    this.helper.visible = true;
  }

  detach(): void {
    this.controls.detach();
    this.helper.visible = false;
    this.onDragChange(false);
  }

  setLocalSpace(): void {
    this.controls.setSpace("local");
  }

  setWorldSpace(): void {
    this.controls.setSpace("world");
  }

  getAxis(): string | null {
    return this.controls.axis;
  }

  isDragging(): boolean {
    return this.controls.dragging;
  }

  isActive(): boolean {
    return this.controls.dragging || this.controls.axis !== null;
  }

  dispose(): void {
    this.controls.removeEventListener("objectChange", this.handleObjectChange);
    this.controls.removeEventListener("dragging-changed", this.handleDraggingChanged);
    this.controls.detach();
    this.scene.remove(this.helper);
    this.controls.dispose();
    this.onDragChange(false);
  }

  private readonly handleObjectChange = (): void => {
    this.onChange();
  };

  private readonly handleDraggingChanged = (event: { value?: unknown }): void => {
    this.onDragChange(event.value === true);
  };
}
