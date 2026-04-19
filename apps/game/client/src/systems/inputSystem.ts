import * as THREE from "three";
import { InputKey } from "@splat/protocol/network/clientMessages.ts";

const MOVEMENT_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "Space", "KeyE"]);
const PITCH_MIN = -1.55; // ~-89° — limit how far down the player can aim
const PITCH_MAX = 1.55; //  ~+89° — limit how far up

export class InputSystem {
  private readonly keysDown = new Set<string>();
  private pointerLocked = false;
  private firePressed = false;
  private actionPressed = false;
  private enabled = true;
  private onPointerLockExitCb: (() => void) | null = null;

  // Persistent orientation tracking.
  private readonly _localRotation = new THREE.Quaternion(0, 0, 0, 1);
  private currentPitch = 0;

  // Accumulate mouse deltas.
  private mouseX = 0;
  private mouseY = 0;

  // Pre-allocated objects.
  private readonly _up = new THREE.Vector3(0, 1, 0);
  private readonly _forward = new THREE.Vector3(0, 0, 1);
  private readonly _right = new THREE.Vector3(1, 0, 0);
  private readonly _aimDir = new THREE.Vector3();
  private readonly _tempQuat = new THREE.Quaternion();

  constructor(canvas: HTMLCanvasElement) {
    canvas.tabIndex = 0;
    canvas.style.outline = "none";

    const requestPointerCapture = (target: EventTarget | null): void => {
      if (!this.enabled) return;
      if (this.pointerLocked) return;
      if (!canvas.isConnected || canvas.ownerDocument !== document) return;
      const element = target instanceof Element ? target : null;
      if (element?.closest("input, button, textarea, select, a, label")) return;
      void canvas.requestPointerLock().catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "WrongDocumentError") return;
        console.warn("[input] pointer lock request failed", err);
      });
      canvas.focus();
    };

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!this.enabled) return;
      if (MOVEMENT_KEYS.has(e.code)) {
        this.keysDown.add(e.code);
        if (e.code === "KeyE" && !e.repeat) {
          this.actionPressed = true;
        }
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent): void => {
      if (!this.enabled) return;
      if (MOVEMENT_KEYS.has(e.code)) {
        this.keysDown.delete(e.code);
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    window.addEventListener("blur", () => {
      this.keysDown.clear();
      this.actionPressed = false;
    });

    canvas.addEventListener("pointerdown", (e) => requestPointerCapture(e.target));
    canvas.addEventListener("pointerdown", (e) => {
      if (!this.enabled) return;
      if (e.button === 0) this.firePressed = true;
    });
    window.addEventListener("pointerup", (e) => {
      if (e.button === 0) this.firePressed = false;
    });
    document.addEventListener("pointerlockchange", () => {
      const wasPointerLocked = this.pointerLocked;
      this.pointerLocked = document.pointerLockElement === canvas;
      if (wasPointerLocked && !this.pointerLocked && this.enabled) {
        this.onPointerLockExitCb?.();
      }
    });
    document.addEventListener("mousemove", (e) => {
      if (!this.enabled || !this.pointerLocked) return;
      this.mouseX -= e.movementX * 0.003;
      this.mouseY -= e.movementY * 0.003;
    });
  }

  buildKeyBits(): number {
    if (!this.enabled) return 0;

    const actionBit = this.actionPressed ? InputKey.Submerge : 0;
    this.actionPressed = false;

    return (
      (this.keysDown.has("KeyW") ? InputKey.Forward : 0) |
      (this.keysDown.has("KeyS") ? InputKey.Backward : 0) |
      (this.keysDown.has("KeyA") ? InputKey.Left : 0) |
      (this.keysDown.has("KeyD") ? InputKey.Right : 0) |
      (this.keysDown.has("Space") ? InputKey.Jump : 0) |
      actionBit |
      (this.firePressed ? InputKey.Fire : 0)
    );
  }

  /**
   * Computes aim direction by incrementally rotating a persistent basis.
   * This is robust against any orientation because it uses parallel transport.
   */
  computeAimDir(
    playerPos: THREE.Vector3,
    nearestPlanetCenter: THREE.Vector3,
  ): { x: number; y: number; z: number } {
    const newUp = new THREE.Vector3().subVectors(playerPos, nearestPlanetCenter).normalize();

    // 1. Parallel Transport: Rotate our orientation to match the new surface normal.
    this._up.set(0, 1, 0).applyQuaternion(this._localRotation).normalize();
    this._tempQuat.setFromUnitVectors(this._up, newUp);
    this._localRotation.premultiply(this._tempQuat).normalize();

    // 2. Apply mouse yaw (rotation around the local surface UP).
    if (this.mouseX !== 0) {
      this._up.set(0, 1, 0).applyQuaternion(this._localRotation).normalize();
      this._tempQuat.setFromAxisAngle(this._up, this.mouseX);
      this._localRotation.premultiply(this._tempQuat).normalize();
      this.mouseX = 0;
    }

    // 3. Update persistent pitch (clamped).
    this.currentPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.currentPitch + this.mouseY));
    this.mouseY = 0;

    // 4. Resolve final 3D Aim Direction.
    this._forward.set(0, 0, 1).applyQuaternion(this._localRotation).normalize();
    this._right.set(1, 0, 0).applyQuaternion(this._localRotation).normalize();

    this._aimDir.copy(this._forward).applyAxisAngle(this._right, this.currentPitch);

    return { x: this._aimDir.x, y: this._aimDir.y, z: this._aimDir.z };
  }

  /**
   * Returns the horizontal forward direction (yaw only).
   */
  getYawForward(): { x: number; y: number; z: number } {
    return { x: this._forward.x, y: this._forward.y, z: this._forward.z };
  }

  getPitch(): number {
    return this.currentPitch;
  }

  /**
   * Returns the current full horizontal rotation (no pitch).
   */
  getLocalRotation(): THREE.Quaternion {
    return this._localRotation.clone();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) return;

    this.keysDown.clear();
    this.firePressed = false;
    this.actionPressed = false;
    this.mouseX = 0;
    this.mouseY = 0;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  onPointerLockExit(callback: () => void): void {
    this.onPointerLockExitCb = callback;
  }
}
