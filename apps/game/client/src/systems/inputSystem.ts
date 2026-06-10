import nipplejs from "nipplejs";
import * as THREE from "three";
import { InputKey } from "@splat/protocol/network/clientMessages.ts";

const MOVEMENT_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "Space", "KeyE"]);
const PITCH_MIN = -1.55; // ~-89° — limit how far down the player can aim
const PITCH_MAX = 1.55; //  ~+89° — limit how far up
const MOBILE_DEAD_ZONE = 0.35;
const TOUCH_LOOK_SENSITIVITY = 0.003;

type NippleManager = ReturnType<typeof nipplejs.create>;

class MobileControls {
  private readonly root = document.createElement("div");
  private readonly moveStickZone = document.createElement("div");
  private readonly moveManager: NippleManager;
  private readonly submergeButton: HTMLButtonElement;
  private readonly anchorButton: HTMLButtonElement;
  private moveX = 0;
  private moveY = 0;
  private fireDown = false;
  private anchorDown = false;
  private submergePressed = false;
  private menuPressed = false;

  static create(): MobileControls | null {
    if (!window.matchMedia("(pointer: coarse)").matches && navigator.maxTouchPoints <= 0) {
      return null;
    }
    return new MobileControls();
  }

  private constructor() {
    const existingRoot = document.getElementById("mobile-controls-root");
    if (existingRoot) {
      existingRoot.remove();
    }
    this.root.id = "mobile-controls-root";
    Object.assign(this.root.style, {
      position: "fixed",
      inset: "0",
      zIndex: "20",
      pointerEvents: "none",
      touchAction: "none",
      userSelect: "none",
    });
    (this.root.style as unknown as Record<string, string>)["-webkit-tap-highlight-color"] =
      "transparent";
    (this.root.style as unknown as Record<string, string>)["-webkit-user-select"] = "none";

    const stickSize = "min(42vw, 184px)";

    Object.assign(this.moveStickZone.style, {
      position: "absolute",
      left: "16px",
      bottom: "18px",
      width: stickSize,
      height: stickSize,
      pointerEvents: "auto",
      touchAction: "none",
    });

    const leftButtons = document.createElement("div");
    Object.assign(leftButtons.style, {
      position: "absolute",
      left: "18px",
      bottom: "calc(30px + min(42vw, 184px))",
      pointerEvents: "auto",
      touchAction: "none",
    });

    const rightButtons = document.createElement("div");
    Object.assign(rightButtons.style, {
      position: "absolute",
      right: "18px",
      bottom: "96px",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      alignItems: "flex-end",
      pointerEvents: "auto",
      touchAction: "none",
    });

    this.anchorButton = this.createButton("JUMP");
    this.bindHoldButton(this.anchorButton, (down) => {
      this.anchorDown = down;
    });

    const fireButton = this.createButton("SPLAT");
    this.bindHoldButton(fireButton, (down) => {
      this.fireDown = down;
    });

    this.submergeButton = this.createButton("SURF");
    this.bindPressButton(this.submergeButton, () => {
      this.submergePressed = true;
    });

    const menuButton = this.createButton("MENU");
    Object.assign(menuButton.style, {
      position: "absolute",
      top: "60px",
      right: "16px",
      width: "64px",
      height: "36px",
      pointerEvents: "auto",
    });
    this.bindPressButton(menuButton, () => {
      this.menuPressed = true;
    });

    leftButtons.append(this.submergeButton);
    rightButtons.append(this.anchorButton, fireButton);
    this.root.append(this.moveStickZone, leftButtons, rightButtons, menuButton);
    document.body.append(this.root);

    this.moveManager = nipplejs.create({
      zone: this.moveStickZone,
      mode: "static",
      position: { left: "50%", top: "50%" },
      size: 118,
      threshold: 0.1,
      restOpacity: 0.55,
      fadeTime: 0,
      color: {
        back: "rgba(255, 255, 255, 0.28)",
        front: "rgba(102, 255, 184, 0.86)",
      },
    });

    this.moveManager.on("move", (evt) => {
      this.moveX = evt.data.vector.x;
      this.moveY = evt.data.vector.y;
    });
    this.moveManager.on("end", () => {
      this.moveX = 0;
      this.moveY = 0;
    });
  }

  buildKeyBits(): number {
    return (
      (this.moveY > MOBILE_DEAD_ZONE ? InputKey.Forward : 0) |
      (this.moveY < -MOBILE_DEAD_ZONE ? InputKey.Backward : 0) |
      (this.moveX < -MOBILE_DEAD_ZONE ? InputKey.Left : 0) |
      (this.moveX > MOBILE_DEAD_ZONE ? InputKey.Right : 0) |
      (this.anchorDown ? InputKey.Anchor : 0) |
      (this.fireDown ? InputKey.Fire : 0)
    );
  }

  consumeSubmergePress(): boolean {
    const pressed = this.submergePressed;
    this.submergePressed = false;
    return pressed;
  }

  consumeMenuPress(): boolean {
    const pressed = this.menuPressed;
    this.menuPressed = false;
    return pressed;
  }

  setSubmergeActive(active: boolean): void {
    this.anchorButton.textContent = active ? "JUMP / CARVE" : "JUMP";
    if (active) {
      this.submergeButton.style.border = "2px solid #66ffb8";
      this.submergeButton.style.background = "rgba(102, 255, 184, 0.3)";
      this.submergeButton.style.boxShadow = "0 0 12px rgba(102, 255, 184, 0.5)";
    } else {
      this.submergeButton.style.border = "1px solid rgba(255, 255, 255, 0.55)";
      this.submergeButton.style.background = "rgba(16, 24, 28, 0.66)";
      this.submergeButton.style.boxShadow = "0 8px 28px rgba(0, 0, 0, 0.25)";
    }
  }

  setEnabled(enabled: boolean): void {
    this.root.style.display = enabled ? "" : "none";
    if (enabled) return;
    this.moveX = 0;
    this.moveY = 0;
    this.fireDown = false;
    this.anchorDown = false;
    this.submergePressed = false;
    this.menuPressed = false;
  }

  private createButton(label: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-label", label);
    Object.assign(button.style, {
      width: "70px",
      height: "70px",
      border: "1px solid rgba(255, 255, 255, 0.55)",
      borderRadius: "8px",
      background: "rgba(16, 24, 28, 0.66)",
      color: "#fff",
      font: "700 12px system-ui, sans-serif",
      letterSpacing: "0",
      boxShadow: "0 8px 28px rgba(0, 0, 0, 0.25)",
      touchAction: "none",
      userSelect: "none",
      outline: "none",
    });
    (button.style as unknown as Record<string, string>)["-webkit-tap-highlight-color"] =
      "transparent";
    (button.style as unknown as Record<string, string>)["-webkit-user-select"] = "none";
    return button;
  }

  private bindHoldButton(button: HTMLButtonElement, setDown: (down: boolean) => void): void {
    button.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      setDown(true);
    });
    button.addEventListener("pointerup", (e) => {
      e.preventDefault();
      setDown(false);
    });
    button.addEventListener("pointercancel", () => setDown(false));
    button.addEventListener("lostpointercapture", () => setDown(false));
  }

  private bindPressButton(button: HTMLButtonElement, onPress: () => void): void {
    button.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      onPress();
    });
  }
}

export class InputSystem {
  private readonly keysDown = new Set<string>();
  private pointerLocked = false;
  private firePressed = false;
  private actionPressed = false;
  private previousKeyBits = 0;
  private enabled = true;
  private onPointerLockExitCb: (() => void) | null = null;
  private readonly mobileControls: MobileControls | null;
  private touchLookPointerId: number | null = null;
  private touchLookX = 0;
  private touchLookY = 0;

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
    canvas.style.touchAction = "none";
    this.mobileControls = MobileControls.create();

    // Safari-specific: prevent pinch-zoom and double-tap zoom at the gesture API level.
    // iOS 10+ ignores user-scalable=no in the viewport meta, so this is the only reliable guard.
    for (const name of ["gesturestart", "gesturechange", "gestureend"]) {
      document.addEventListener(name, (e) => e.preventDefault(), { passive: false });
    }

    const requestPointerCapture = (e: PointerEvent): void => {
      if (!this.enabled) return;
      if (this.pointerLocked) return;
      if (e.pointerType !== "mouse") return;
      if (!canvas.isConnected || canvas.ownerDocument !== document) return;
      const element = e.target instanceof Element ? e.target : null;
      if (element?.closest("input, button, textarea, select, a, label")) return;
      void canvas.requestPointerLock().catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "WrongDocumentError") return;
        console.warn("[input] pointer lock request failed", err);
      });
      canvas.focus();
    };

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!this.enabled) return;
      if ((e.target as HTMLElement)?.closest("input, button, textarea, select, a, label")) return;

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
      if ((e.target as HTMLElement)?.closest("input, button, textarea, select, a, label")) return;

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

    canvas.addEventListener("pointerdown", (e) => requestPointerCapture(e));
    canvas.addEventListener("pointerdown", (e) => {
      if (!this.enabled) return;
      if (e.pointerType !== "mouse") {
        this.touchLookPointerId = e.pointerId;
        this.touchLookX = e.clientX;
        this.touchLookY = e.clientY;
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          // Pointer already released (fast tap race condition)
        }
        e.preventDefault();
        return;
      }
      if (e.button === 0) this.firePressed = true;
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.enabled || this.touchLookPointerId !== e.pointerId) return;
      this.mouseX -= (e.clientX - this.touchLookX) * TOUCH_LOOK_SENSITIVITY;
      this.mouseY -= (e.clientY - this.touchLookY) * TOUCH_LOOK_SENSITIVITY;
      this.touchLookX = e.clientX;
      this.touchLookY = e.clientY;
      e.preventDefault();
    });
    window.addEventListener("pointerup", (e) => {
      if (e.button === 0) this.firePressed = false;
      if (this.touchLookPointerId === e.pointerId) this.touchLookPointerId = null;
    });
    window.addEventListener("pointercancel", (e) => {
      if (this.touchLookPointerId === e.pointerId) this.touchLookPointerId = null;
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

  buildInputBits(): { keys: number; pressedKeys: number } {
    if (!this.enabled) {
      this.previousKeyBits = 0;
      return { keys: 0, pressedKeys: 0 };
    }

    const mobileKeys = this.mobileControls?.buildKeyBits() ?? 0;
    const actionBit =
      this.actionPressed || this.mobileControls?.consumeSubmergePress() ? InputKey.Submerge : 0;
    this.actionPressed = false;

    const keys =
      (this.keysDown.has("KeyW") ? InputKey.Forward : 0) |
      (this.keysDown.has("KeyS") ? InputKey.Backward : 0) |
      (this.keysDown.has("KeyA") ? InputKey.Left : 0) |
      (this.keysDown.has("KeyD") ? InputKey.Right : 0) |
      (this.keysDown.has("Space") ? InputKey.Anchor : 0) |
      mobileKeys |
      actionBit |
      (this.firePressed ? InputKey.Fire : 0);
    const pressedKeys = (keys & ~this.previousKeyBits) | actionBit;
    this.previousKeyBits = keys;

    return { keys, pressedKeys };
  }

  buildKeyBits(): number {
    return this.buildInputBits().keys;
  }

  isFireDown(): boolean {
    if (!this.enabled) return false;
    return this.firePressed || ((this.mobileControls?.buildKeyBits() ?? 0) & InputKey.Fire) !== 0;
  }

  setSubmergeActive(active: boolean): void {
    this.mobileControls?.setSubmergeActive(active);
  }

  consumeMenuPress(): boolean {
    return this.mobileControls?.consumeMenuPress() ?? false;
  }

  /**
   * Computes aim direction by incrementally rotating a persistent basis.
   * This is robust against any orientation because it uses parallel transport.
   */
  /** Consume the accumulated mouse look delta (radians) without touching the
   *  surface orientation. Used by free-flight glide steering, which turns the
   *  dart's heading directly rather than aiming the surface reticle. */
  consumeLookDelta(): { yaw: number; pitch: number } {
    const yaw = this.mouseX;
    const pitch = this.mouseY;
    this.mouseX = 0;
    this.mouseY = 0;
    return { yaw, pitch };
  }

  computeAimDir(
    playerPos: THREE.Vector3,
    nearestPlanetCenter: THREE.Vector3,
  ): { x: number; y: number; z: number } {
    const newUp = new THREE.Vector3().subVectors(playerPos, nearestPlanetCenter).normalize();

    // 1. Parallel Transport: Rotate our orientation to match the new surface normal.
    this._up.set(0, 1, 0).applyQuaternion(this._localRotation).normalize();
    this._tempQuat.setFromUnitVectors(this._up, newUp);
    this._localRotation.premultiply(this._tempQuat).normalize();

    // 2. Apply mouse/touch yaw (rotation around the local surface UP).
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
    this.mobileControls?.setEnabled(enabled);
    if (enabled) return;

    this.keysDown.clear();
    this.firePressed = false;
    this.actionPressed = false;
    this.touchLookPointerId = null;
    this.previousKeyBits = 0;
    this.mouseX = 0;
    this.mouseY = 0;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  onPointerLockExit(callback: () => void): void {
    this.onPointerLockExitCb = callback;
  }
}
