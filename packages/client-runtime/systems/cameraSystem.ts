import * as THREE from "three";

const CAMERA_BACK = 15;
const CAMERA_UP = 12;
const CAMERA_SIDE = 3;
const AIM_DISTANCE = 500;
const COLLISION_RADIUS = 1;
const SURFACE_GAP = 0.3;

const BASE_FOV = 75;
const MAX_FOV_GAIN = 25;
const SPEED_FOV_RATE = 0.55;
const PULL_BACK_RATE = 0.22;
const MAX_BANK_ANGLE = 0.09;
const BANK_SPEED_NORM = 18;
const LANDING_DIP_MAX = 2.0;
const LANDING_DIP_SPEED_SCALE = 0.07;

interface CameraSystemOptions {
  camera?: THREE.PerspectiveCamera;
  manageWindowResize?: boolean;
}

export class CameraSystem {
  readonly camera: THREE.PerspectiveCamera;

  private readonly _playerPos = new THREE.Vector3();
  private readonly _playerUp = new THREE.Vector3();
  private readonly _targetPlayerUp = new THREE.Vector3();
  private readonly _camForward = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _arm = new THREE.Vector3();
  private readonly _lookAt = new THREE.Vector3();
  private readonly _cameraWorldForward = new THREE.Vector3();
  private readonly _aimPoint = new THREE.Vector3();

  private _smoothSpeed = 0;
  private _smoothLateral = 0;
  private _landingDip = 0;
  private _wasAirborne = false;
  private _fovScale = 1.0;
  private _freeFlightBlend = 0;

  constructor(options: CameraSystemOptions = {}) {
    this.camera = options.camera ?? this.createDefaultCamera();
    this.camera.updateProjectionMatrix();

    if (options.manageWindowResize ?? true) {
      window.addEventListener("resize", () => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
      });
    }
  }

  private createDefaultCamera(): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(
      BASE_FOV,
      window.innerWidth / window.innerHeight,
      0.1,
      2000,
    );
    camera.position.set(0, 80, 120);
    return camera;
  }

  update(
    playerPos: { x: number; y: number; z: number },
    playerVel: { x: number; y: number; z: number },
    yawForward: { x: number; y: number; z: number },
    pitch: number,
    nearestPlanetCenter: THREE.Vector3,
    isAirborne: boolean,
    dt: number,
    /** 0..1 free-flight intensity — typically the player's distance from the
     *  nearest planet centre, normalised against that planet's captureRadius.
     *  Larger values pull the camera further back so distant planets stay framed. */
    freeFlight = 0,
  ): { x: number; y: number; z: number } {
    this._playerPos.set(playerPos.x, playerPos.y, playerPos.z);
    this._targetPlayerUp.subVectors(this._playerPos, nearestPlanetCenter).normalize();
    if (this._playerUp.lengthSq() < 0.01) {
      this._playerUp.copy(this._targetPlayerUp);
    } else {
      const upLerp = freeFlight > 0.1 ? 2.2 : 10;
      this._playerUp.lerp(this._targetPlayerUp, Math.min(1, dt * upLerp)).normalize();
    }

    this._camForward.set(yawForward.x, yawForward.y, yawForward.z).normalize();
    if (this._camForward.lengthSq() < 0.01) {
      this._camForward.set(0, 0, 1);
    }

    this._right.crossVectors(this._playerUp, this._camForward).normalize();

    const forwardSpeed = Math.max(
      0,
      playerVel.x * this._camForward.x +
        playerVel.y * this._camForward.y +
        playerVel.z * this._camForward.z,
    );

    const speedLerpRate = forwardSpeed > this._smoothSpeed ? 8 : 4;
    this._smoothSpeed += (forwardSpeed - this._smoothSpeed) * Math.min(1, dt * speedLerpRate);

    const lateral =
      playerVel.x * this._right.x + playerVel.y * this._right.y + playerVel.z * this._right.z;
    this._smoothLateral += (lateral - this._smoothLateral) * Math.min(1, dt * 9);

    const totalSpeed = Math.sqrt(
      playerVel.x * playerVel.x + playerVel.y * playerVel.y + playerVel.z * playerVel.z,
    );
    if (this._wasAirborne && !isAirborne) {
      this._landingDip = Math.min(totalSpeed * LANDING_DIP_SPEED_SCALE, LANDING_DIP_MAX);
    }
    this._wasAirborne = isAirborne;
    this._landingDip *= Math.max(0, 1 - dt * 9);

    const freeFlightTarget = Math.max(0, Math.min(1, freeFlight));
    this._freeFlightBlend +=
      (freeFlightTarget - this._freeFlightBlend) *
      Math.min(1, dt * (freeFlightTarget > this._freeFlightBlend ? 3.5 : 2));

    const targetFov =
      (BASE_FOV +
        Math.min(this._smoothSpeed * SPEED_FOV_RATE, MAX_FOV_GAIN) +
        this._freeFlightBlend * 18) *
      this._fovScale;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 5);
    this.camera.updateProjectionMatrix();

    const dynamicBack =
      CAMERA_BACK + this._smoothSpeed * PULL_BACK_RATE + this._freeFlightBlend * 38;
    const dynamicUp = CAMERA_UP - this._landingDip + this._freeFlightBlend * 6;

    this._arm
      .copy(this._camForward)
      .multiplyScalar(-dynamicBack)
      .addScaledVector(this._playerUp, dynamicUp)
      .addScaledVector(this._right, CAMERA_SIDE);
    this._arm.applyAxisAngle(this._right, -pitch);

    const armLen = this._arm.length();
    if (armLen > 0.001) {
      const invLen = 1 / armLen;
      const dX = this._arm.x * invLen;
      const dY = this._arm.y * invLen;
      const dZ = this._arm.z * invLen;

      const oX = this._playerPos.x - nearestPlanetCenter.x;
      const oY = this._playerPos.y - nearestPlanetCenter.y;
      const oZ = this._playerPos.z - nearestPlanetCenter.z;

      const bHalf = oX * dX + oY * dY + oZ * dZ;
      const oLenSq = oX * oX + oY * oY + oZ * oZ;

      const playerDist = Math.sqrt(oLenSq);
      const testRadius = playerDist - COLLISION_RADIUS + SURFACE_GAP;
      const cTerm = oLenSq - testRadius * testRadius;
      const disc = bHalf * bHalf - cTerm;

      if (disc >= 0) {
        const tHit = -bHalf - Math.sqrt(disc);
        if (tHit > 0 && tHit < armLen) {
          this.camera.position.set(
            this._playerPos.x + dX * tHit,
            this._playerPos.y + dY * tHit,
            this._playerPos.z + dZ * tHit,
          );
        } else {
          this.camera.position.copy(this._playerPos).add(this._arm);
        }
      } else {
        this.camera.position.copy(this._playerPos).add(this._arm);
      }
    } else {
      this.camera.position.copy(this._playerPos).add(this._arm);
    }

    const bankAngle =
      -Math.max(-1, Math.min(1, this._smoothLateral / BANK_SPEED_NORM)) * MAX_BANK_ANGLE;
    this.camera.up.copy(this._playerUp);
    if (Math.abs(bankAngle) > 0.0005) {
      this.camera.up.applyAxisAngle(this._camForward, bankAngle);
    }

    this._lookAt
      .copy(this._playerPos)
      .addScaledVector(this._playerUp, 3 + this._freeFlightBlend * 5)
      .addScaledVector(this._camForward, this._freeFlightBlend * 18);
    this.camera.lookAt(this._lookAt);

    this._cameraWorldForward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this._aimPoint
      .copy(this.camera.position)
      .addScaledVector(this._cameraWorldForward, AIM_DISTANCE)
      .sub(this._playerPos)
      .normalize();

    return { x: this._aimPoint.x, y: this._aimPoint.y, z: this._aimPoint.z };
  }

  setFovScale(scale: number): void {
    this._fovScale = scale;
  }
}
