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
const FREE_FLIGHT_FOV_GAIN = 16;

// -- Free-flight chase camera --------------------------------------------------
// A ballistic dart flies a straight line at constant velocity, so a camera that
// sits behind it along that velocity has a fixed orientation for the whole
// flight (only its position translates) — rock-stable, no flips. These frame it.
const FLIGHT_BACK = 26; // distance behind the dart along its travel direction
const FLIGHT_HEIGHT = 6.5; // lift above the dart along the stable flight-up
const FLIGHT_LOOKAHEAD = 30; // how far ahead of the dart the camera looks
const FLIGHT_LOOK_LIFT = 2.5; // raise the look target so the dart sits lower in frame
// Bank-into-turn feel: the camera rolls when the heading swings sideways.
const FLIGHT_BANK_GAIN = 0.34; // roll radians per rad/s of horizontal turn
const MAX_FLIGHT_BANK = 0.5; // cap on the bank roll (~29°)
const FLIGHT_BANK_LERP = 5; // how fast the bank eases in/out
const FLIGHT_BANK_FOV_GAIN = 9; // extra FOV (deg) at full bank, for intensity

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
  // Free-flight chase-cam scratch: surface vs flight poses, blended each frame.
  private readonly _surfacePos = new THREE.Vector3();
  private readonly _surfaceLookAt = new THREE.Vector3();
  private readonly _flightPos = new THREE.Vector3();
  private readonly _flightLookAt = new THREE.Vector3();
  private readonly _velDir = new THREE.Vector3();
  private readonly _flightUp = new THREE.Vector3();
  private readonly _flightUpBanked = new THREE.Vector3();
  private readonly _flightRight = new THREE.Vector3();
  private readonly _prevFlightDir = new THREE.Vector3();
  private readonly _blendUp = new THREE.Vector3();

  private _smoothSpeed = 0;
  private _smoothLateral = 0;
  private _landingDip = 0;
  private _wasAirborne = false;
  private _fovScale = 1.0;
  private _freeFlightBlend = 0;
  private _wasInFlight = false;
  private _smoothFlightBank = 0;

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
    /** 0..1 flag: 1 while the player is in ballistic free flight, 0 otherwise.
     *  Smoothed internally to blend between the surface cam and the flight
     *  chase cam. (Not a distance — see _freeFlightBlend.) */
    freeFlight = 0,
  ): { x: number; y: number; z: number } {
    this._playerPos.set(playerPos.x, playerPos.y, playerPos.z);

    this._camForward.set(yawForward.x, yawForward.y, yawForward.z).normalize();
    if (this._camForward.lengthSq() < 0.01) {
      this._camForward.set(0, 0, 1);
    }

    // Smoothed blend: 0 = surface cam, 1 = free-flight chase cam.
    const freeFlightTarget = Math.max(0, Math.min(1, freeFlight));
    this._freeFlightBlend +=
      (freeFlightTarget - this._freeFlightBlend) *
      Math.min(1, dt * (freeFlightTarget > this._freeFlightBlend ? 3.5 : 2));
    const blend = this._freeFlightBlend;

    // Surface "up": lerp toward the planet radial. Only feeds the surface pose,
    // which is blended out in flight, so it's fine that it sweeps out there.
    this._targetPlayerUp.subVectors(this._playerPos, nearestPlanetCenter).normalize();
    if (this._playerUp.lengthSq() < 0.01) {
      this._playerUp.copy(this._targetPlayerUp);
    } else {
      this._playerUp.lerp(this._targetPlayerUp, Math.min(1, dt * 10)).normalize();
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

    const targetFov =
      (BASE_FOV +
        Math.min(this._smoothSpeed * SPEED_FOV_RATE, MAX_FOV_GAIN) +
        blend * FREE_FLIGHT_FOV_GAIN +
        // Slight FOV push while banking hard — sells the turn. (One-frame-lagged
        // off _smoothFlightBank, which is updated in the flight pose below.)
        (Math.abs(this._smoothFlightBank) / MAX_FLIGHT_BANK) * FLIGHT_BANK_FOV_GAIN) *
      this._fovScale;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 5);
    this.camera.updateProjectionMatrix();

    // ---- Surface pose: behind the player's look direction, planet-collided. ----
    const dynamicBack = CAMERA_BACK + this._smoothSpeed * PULL_BACK_RATE;
    const dynamicUp = CAMERA_UP - this._landingDip;
    this._arm
      .copy(this._camForward)
      .multiplyScalar(-dynamicBack)
      .addScaledVector(this._playerUp, dynamicUp)
      .addScaledVector(this._right, CAMERA_SIDE);
    this._arm.applyAxisAngle(this._right, -pitch);
    this._surfacePos.copy(this._playerPos).add(this._arm);
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
          this._surfacePos.set(
            this._playerPos.x + dX * tHit,
            this._playerPos.y + dY * tHit,
            this._playerPos.z + dZ * tHit,
          );
        }
      }
    }
    this._surfaceLookAt.copy(this._playerPos).addScaledVector(this._playerUp, 3);

    // ---- Flight pose: behind the dart along its (constant) velocity. ----
    if (totalSpeed > 1e-4) {
      this._velDir.set(playerVel.x, playerVel.y, playerVel.z).multiplyScalar(1 / totalSpeed);
    } else if (this._velDir.lengthSq() < 0.01) {
      this._velDir.copy(this._camForward);
    } // else: keep the last travel direction (e.g. velocity zeroed on the smash)

    const inFlight = blend > 0.05;
    if (inFlight && !this._wasInFlight) {
      // Seed a stable flight-up once, from the planet radial projected
      // perpendicular to travel. Fall back to a world axis if you launched
      // straight along the radial (up ∥ velocity).
      this._flightUp.copy(this._targetPlayerUp);
      this._flightUp.addScaledVector(this._velDir, -this._flightUp.dot(this._velDir));
      if (this._flightUp.lengthSq() < 1e-4) {
        this._flightUp.set(0, 1, 0).addScaledVector(this._velDir, -this._velDir.y);
        if (this._flightUp.lengthSq() < 1e-4) {
          this._flightUp.set(1, 0, 0).addScaledVector(this._velDir, -this._velDir.x);
        }
      }
      this._flightUp.normalize();
    }
    this._wasInFlight = inFlight;
    if (this._flightUp.lengthSq() < 0.01) {
      this._flightUp.copy(this._playerUp); // never been in flight yet
    } else {
      // Keep perpendicular to travel (velocity is ~constant, so this barely moves).
      const proj = this._flightUp.dot(this._velDir);
      if (Math.abs(proj) < 0.999) {
        this._flightUp.addScaledVector(this._velDir, -proj).normalize();
      }
    }

    // Bank into turns: roll the camera by how fast the heading swings sideways.
    // The turn rate is the per-frame change of the heading projected onto the
    // right axis. Eased so banks come in and settle smoothly.
    this._flightRight.crossVectors(this._flightUp, this._velDir).normalize();
    if (this._prevFlightDir.lengthSq() < 0.01 || !inFlight) {
      this._prevFlightDir.copy(this._velDir);
    }
    const sideTurn =
      (this._velDir.x - this._prevFlightDir.x) * this._flightRight.x +
      (this._velDir.y - this._prevFlightDir.y) * this._flightRight.y +
      (this._velDir.z - this._prevFlightDir.z) * this._flightRight.z;
    this._prevFlightDir.copy(this._velDir);
    const targetBank = inFlight
      ? Math.max(
          -MAX_FLIGHT_BANK,
          Math.min(MAX_FLIGHT_BANK, (dt > 1e-4 ? sideTurn / dt : 0) * FLIGHT_BANK_GAIN),
        )
      : 0;
    this._smoothFlightBank +=
      (targetBank - this._smoothFlightBank) * Math.min(1, dt * FLIGHT_BANK_LERP);

    this._flightPos
      .copy(this._playerPos)
      .addScaledVector(this._velDir, -FLIGHT_BACK)
      .addScaledVector(this._flightUp, FLIGHT_HEIGHT);
    this._flightLookAt
      .copy(this._playerPos)
      .addScaledVector(this._velDir, FLIGHT_LOOKAHEAD)
      .addScaledVector(this._flightUp, FLIGHT_LOOK_LIFT);

    // ---- Blend the two poses and apply. ----
    this.camera.position.lerpVectors(this._surfacePos, this._flightPos, blend);

    // Roll the flight-up into the turn (around the heading), leaving the carried
    // _flightUp itself un-rolled so the bank doesn't accumulate frame to frame.
    this._flightUpBanked.copy(this._flightUp);
    if (Math.abs(this._smoothFlightBank) > 0.0005) {
      this._flightUpBanked.applyAxisAngle(this._velDir, this._smoothFlightBank);
    }
    this._blendUp.copy(this._playerUp).lerp(this._flightUpBanked, blend);
    if (this._blendUp.lengthSq() < 1e-4) this._blendUp.copy(this._playerUp);
    this._blendUp.normalize();
    // Surface bank, scaled out as the flight cam takes over (flight bank is baked
    // into _flightUpBanked above).
    const bankAngle =
      -Math.max(-1, Math.min(1, this._smoothLateral / BANK_SPEED_NORM)) *
      MAX_BANK_ANGLE *
      (1 - blend);
    this.camera.up.copy(this._blendUp);
    if (Math.abs(bankAngle) > 0.0005) {
      this.camera.up.applyAxisAngle(this._camForward, bankAngle);
    }

    this._lookAt.lerpVectors(this._surfaceLookAt, this._flightLookAt, blend);
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
