import * as THREE from "three";
import { CameraSystem } from "@splat/client-runtime/systems/cameraSystem.ts";
import { GAME_CONFIG } from "@splat/content/config/gameConfig.ts";
import { InputKey, type InputMessage } from "@splat/protocol/network/clientMessages.ts";
import { PlayerMovementState, PlayerSurfState } from "@splat/simulation/match/simState.ts";
import {
  stepPlayer,
  type PlanetData,
  type PlayerPhysics,
  type StepConfig,
} from "@splat/simulation/movement/simulatedMovement.ts";
import type { TerrainSurfaceProvider } from "@splat/simulation/terrain/planetTerrain.ts";
import type { SimPlanetPaintState } from "@splat/simulation/match/simState.ts";
import type { EditorConfig } from "../types.ts";

const PLANETS: PlanetData[] = [
  {
    id: "planet-0",
    center: { x: 0, y: 0, z: 0 },
    radius: GAME_CONFIG.planet.radius,
  },
];

const EMPTY_PAINT = new Map<string, SimPlanetPaintState>();
const MAX_DT = 1 / 30;
const MOUSE_SENSITIVITY = 0.0025;
const MIN_PITCH = -0.75;
const MAX_PITCH = 0.65;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function createStepConfig(config: EditorConfig): StepConfig {
  return {
    planet: { ...config.planet },
    movement: { ...GAME_CONFIG.movement },
    rail: { ...GAME_CONFIG.rail },
    terrain: { ...config.terrain },
  };
}

function applyQuat(
  v: THREE.Vector3,
  q: { x: number; y: number; z: number; w: number },
  target: THREE.Quaternion,
): THREE.Vector3 {
  return v.applyQuaternion(target.set(q.x, q.y, q.z, q.w));
}

export class PlayerPreviewController {
  private stepConfig: StepConfig;
  private active = false;
  private seq = 0;
  private submergePressed = false;
  private pitch = -0.15;
  private readonly keysDown = new Set<string>();
  private readonly playerGroup = new THREE.Group();
  private readonly playerMaterial = new THREE.MeshStandardMaterial({
    color: 0x28d7ff,
    roughness: 0.55,
    metalness: 0.05,
  });
  private readonly visorMaterial = new THREE.MeshStandardMaterial({
    color: 0x07111f,
    roughness: 0.3,
    metalness: 0.2,
  });
  private readonly boardMaterial = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.65,
  });
  private readonly cameraSystem: CameraSystem;
  private player: PlayerPhysics;
  private readonly aimForward = new THREE.Vector3(0, 0, 1);
  private readonly lastAimDir = new THREE.Vector3(0, 0, 1);
  private readonly planetCenter = new THREE.Vector3(0, 0, 0);
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly forward = new THREE.Vector3(0, 0, 1);
  private readonly playerPos = new THREE.Vector3();
  private readonly tempQuat = new THREE.Quaternion();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    config: EditorConfig,
    private readonly terrainProvider: TerrainSurfaceProvider,
  ) {
    this.stepConfig = createStepConfig(config);
    this.cameraSystem = new CameraSystem({ camera, manageWindowResize: false });
    this.player = this.createPlayerState();
    this.createPlayerMesh();
    this.playerGroup.visible = false;
    this.scene.add(this.playerGroup);

    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    document.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  setConfig(config: EditorConfig): void {
    this.stepConfig = createStepConfig(config);
    PLANETS[0] = {
      id: "planet-0",
      center: { x: 0, y: 0, z: 0 },
      radius: config.planet.radius,
    };
    if (this.active) this.snapPlayerToSurface();
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.keysDown.clear();
    this.submergePressed = false;
    this.canvas.style.cursor = active ? "crosshair" : "";
    this.playerGroup.visible = active;

    if (active) {
      this.player = this.createPlayerState();
      this.updateMesh();
      this.updateCamera(1 / 60);
      this.canvas.focus();
      return;
    }

    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  update(dt: number): void {
    if (!this.active) return;

    this.updateAimBasis();
    this.updateInputAimFromCamera();
    stepPlayer(
      this.player,
      this.createInput(Math.min(dt, MAX_DT)),
      Math.min(dt, MAX_DT),
      PLANETS,
      this.stepConfig,
      EMPTY_PAINT,
      [],
      this.terrainProvider,
    );
    this.updateMesh();
    this.updateCamera(dt);
  }

  dispose(): void {
    this.setActive(false);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    document.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.scene.remove(this.playerGroup);
    this.playerGroup.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    this.playerMaterial.dispose();
    this.visorMaterial.dispose();
    this.boardMaterial.dispose();
  }

  private createPlayerMesh(): void {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.2, 6, 12), this.playerMaterial);
    body.position.y = 0.55;
    body.castShadow = false;

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.18, 0.08), this.visorMaterial);
    visor.position.set(0, 1.0, 0.42);

    const board = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.12, 2.0), this.boardMaterial);
    board.position.y = -0.38;

    this.playerGroup.add(body, visor, board);
  }

  private createPlayerState(): PlayerPhysics {
    const normal = new THREE.Vector3(0, 1, 0);
    const radius = this.terrainProvider.getRadius(
      normal.x,
      normal.y,
      normal.z,
      this.stepConfig,
      "planet-0",
    );
    return {
      pos: {
        x: normal.x * (radius + GAME_CONFIG.movement.standingHeight),
        y: normal.y * (radius + GAME_CONFIG.movement.standingHeight),
        z: normal.z * (radius + GAME_CONFIG.movement.standingHeight),
      },
      vel: { x: 0, y: 0, z: 0 },
      rot: { x: 0, y: 0, z: 0, w: 1 },
      planetId: "planet-0",
      paintGroupId: 0,
      movementState: PlayerMovementState.Idle,
      surfState: PlayerSurfState.None,
      isCarving: false,
      skiJumpCharge: 0,
      grindRailId: -1,
      grindT: 0,
      lastGrindT: 0,
      grindSpeed: 0,
      grindCooldownMs: 0,
    };
  }

  private snapPlayerToSurface(): void {
    const normal = new THREE.Vector3(this.player.pos.x, this.player.pos.y, this.player.pos.z);
    if (normal.lengthSq() < 1e-8) normal.set(0, 1, 0);
    normal.normalize();
    const radius = this.terrainProvider.getRadius(
      normal.x,
      normal.y,
      normal.z,
      this.stepConfig,
      "planet-0",
    );
    this.player.pos.x = normal.x * (radius + GAME_CONFIG.movement.standingHeight);
    this.player.pos.y = normal.y * (radius + GAME_CONFIG.movement.standingHeight);
    this.player.pos.z = normal.z * (radius + GAME_CONFIG.movement.standingHeight);
  }

  private updateMesh(): void {
    this.playerGroup.position.set(this.player.pos.x, this.player.pos.y, this.player.pos.z);
    this.playerGroup.quaternion.set(
      this.player.rot.x,
      this.player.rot.y,
      this.player.rot.z,
      this.player.rot.w,
    );
  }

  private updateAimBasis(): void {
    this.playerPos.set(this.player.pos.x, this.player.pos.y, this.player.pos.z);
    this.up.copy(this.playerPos).normalize();
    this.aimForward.addScaledVector(this.up, -this.aimForward.dot(this.up));
    if (this.aimForward.lengthSq() < 1e-8) {
      this.forward.set(0, 0, 1);
      applyQuat(this.forward, this.player.rot, this.tempQuat);
      this.forward.addScaledVector(this.up, -this.forward.dot(this.up));
      this.aimForward.copy(this.forward);
    }
    this.aimForward.normalize();
  }

  private createInput(dt: number): InputMessage {
    let keys = 0;
    if (this.keysDown.has("KeyW")) keys |= InputKey.Forward;
    if (this.keysDown.has("KeyS")) keys |= InputKey.Backward;
    if (this.keysDown.has("KeyA")) keys |= InputKey.Left;
    if (this.keysDown.has("KeyD")) keys |= InputKey.Right;
    if (this.keysDown.has("Space")) keys |= InputKey.Anchor;
    if (this.submergePressed) keys |= InputKey.Submerge;

    const pressedKeys = this.submergePressed ? InputKey.Submerge : 0;
    this.submergePressed = false;

    return {
      seq: ++this.seq,
      keys,
      pressedKeys,
      aimDir: { x: this.lastAimDir.x, y: this.lastAimDir.y, z: this.lastAimDir.z },
      dt,
    };
  }

  private updateInputAimFromCamera(): void {
    if (this.lastAimDir.lengthSq() > 1e-8) return;
    this.lastAimDir
      .copy(this.aimForward)
      .multiplyScalar(Math.cos(this.pitch))
      .addScaledVector(this.up, Math.sin(this.pitch))
      .normalize();
  }

  private updateCamera(dt: number): void {
    this.playerPos.set(this.player.pos.x, this.player.pos.y, this.player.pos.z);
    const aim = this.cameraSystem.update(
      this.player.pos,
      this.player.vel,
      { x: this.aimForward.x, y: this.aimForward.y, z: this.aimForward.z },
      this.pitch,
      this.planetCenter,
      this.player.movementState === PlayerMovementState.Airborne,
      dt,
    );
    this.lastAimDir.set(aim.x, aim.y, aim.z);
  }

  private readonly onPointerDown = (): void => {
    if (!this.active || document.pointerLockElement === this.canvas) return;
    void this.canvas.requestPointerLock();
  };

  private readonly onPointerLockChange = (): void => {
    if (!this.active) this.keysDown.clear();
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.active || document.pointerLockElement !== this.canvas) return;
    this.updateAimBasis();
    this.aimForward.applyAxisAngle(this.up, -e.movementX * MOUSE_SENSITIVITY);
    this.aimForward.addScaledVector(this.up, -this.aimForward.dot(this.up)).normalize();
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - e.movementY * MOUSE_SENSITIVITY,
      MIN_PITCH,
      MAX_PITCH,
    );
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.active || isEditableTarget(e.target)) return;
    if (
      e.code !== "KeyW" &&
      e.code !== "KeyA" &&
      e.code !== "KeyS" &&
      e.code !== "KeyD" &&
      e.code !== "Space" &&
      e.code !== "KeyE"
    ) {
      return;
    }

    e.preventDefault();
    if (e.code === "KeyE" && !this.keysDown.has("KeyE")) this.submergePressed = true;
    this.keysDown.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (!this.active) return;
    this.keysDown.delete(e.code);
  };
}
