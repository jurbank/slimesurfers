import * as THREE from "three";

const CAMERA_BACK = 15;
const CAMERA_UP = 8;
const CAMERA_SIDE = 3; // right-shoulder offset; negate for left-shoulder
const AIM_DISTANCE = 500; // parallax raycast distance
// Approximate player collision radius — keeps the camera this far above the surface.
const COLLISION_RADIUS = 1;
const SURFACE_GAP = 0.3;

export class CameraSystem {
  readonly camera: THREE.PerspectiveCamera;

  // Reusable vectors — avoids allocations in the hot path.
  private readonly _playerPos = new THREE.Vector3();
  private readonly _playerUp = new THREE.Vector3();
  private readonly _camForward = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _arm = new THREE.Vector3();
  private readonly _lookAt = new THREE.Vector3();
  private readonly _cameraWorldForward = new THREE.Vector3();
  private readonly _aimPoint = new THREE.Vector3();

  constructor() {
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      2000,
    );
    this.camera.position.set(0, 80, 120);

    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
  }

  /**
   * Over-the-shoulder follow camera with pitch and spring-arm surface avoidance.
   *
   * When the pitched arm would intersect the planet, a ray-sphere test retracts
   * the camera toward the player so it stays just above the surface — the same
   * technique used in Fortnite and Splatoon. At steep upward angles the camera
   * ends up near the player's feet, pitching upward to keep the player in frame.
   *
   * Returns a parallax-corrected aimDir (ray from camera through screen center,
   * resolved as a direction from the player).
   */
  update(
    playerPos: { x: number; y: number; z: number },
    yawForward: { x: number; y: number; z: number },
    pitch: number,
    nearestPlanetCenter: THREE.Vector3,
  ): { x: number; y: number; z: number } {
    this._playerPos.set(playerPos.x, playerPos.y, playerPos.z);
    this._playerUp.subVectors(this._playerPos, nearestPlanetCenter).normalize();

    this._camForward.set(yawForward.x, yawForward.y, yawForward.z).normalize();
    if (this._camForward.lengthSq() < 0.01) {
      this._camForward.set(0, 0, 1);
    }

    // Right = cross(up, forward) — right-handed frame, matches simulation convention.
    this._right.crossVectors(this._playerUp, this._camForward).normalize();

    // Build base arm: behind, above, and laterally offset (over-the-shoulder).
    this._arm
      .copy(this._camForward)
      .multiplyScalar(-CAMERA_BACK)
      .addScaledVector(this._playerUp, CAMERA_UP)
      .addScaledVector(this._right, CAMERA_SIDE);

    // Pitch the arm around the right axis.
    // Positive pitch (looking up) swings the arm forward and under the player.
    // Negative pitch (looking down) raises the arm above the player.
    this._arm.applyAxisAngle(this._right, -pitch);

    // Spring-arm surface avoidance via ray-sphere intersection.
    //
    // Cast a ray from the player toward the desired camera position (along the arm).
    // If it hits the planet before reaching full arm length, retract the camera to
    // just before the hit so it orbits along the surface rather than clipping through.
    //
    // Ray:   P(t) = playerPos + t * armDir,   0 <= t <= armLen
    // Test:  |P(t) - planetCenter|² = testRadius²
    // Expands to: t² + 2*(O·D)*t + (|O|² - testRadius²) = 0
    //   where O = playerPos - planetCenter, D = armDir (unit vector)
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

      // testRadius = planet surface ≈ (playerDist - collisionRadius) + gap
      const playerDist = Math.sqrt(oLenSq);
      const testRadius = playerDist - COLLISION_RADIUS + SURFACE_GAP;
      const cTerm = oLenSq - testRadius * testRadius;
      const disc = bHalf * bHalf - cTerm;

      if (disc >= 0) {
        const tHit = -bHalf - Math.sqrt(disc); // near-side intersection
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

    this.camera.up.copy(this._playerUp);
    this._lookAt.copy(this._playerPos).addScaledVector(this._playerUp, 1.5);
    this.camera.lookAt(this._lookAt);

    // Parallax-corrected aimDir: cast a ray from the camera through the screen
    // center (crosshair) and resolve the direction relative to the player.
    // camera.quaternion is set by lookAt above.
    this._cameraWorldForward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this._aimPoint
      .copy(this.camera.position)
      .addScaledVector(this._cameraWorldForward, AIM_DISTANCE)
      .sub(this._playerPos)
      .normalize();

    return { x: this._aimPoint.x, y: this._aimPoint.y, z: this._aimPoint.z };
  }
}
