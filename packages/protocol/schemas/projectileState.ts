import { Schema, defineTypes } from "@colyseus/schema";
import { Vec3 } from "./playerState.ts";

export class ProjectileState extends Schema {
  declare id: string;
  /** sessionId of the player who fired this */
  declare ownerId: string;
  /** Paint/scoring ownership group for this projectile's effects. */
  declare paintGroupId: number;
  declare pos: Vec3;
  declare vel: Vec3;
  /** Planet the projectile was fired from / is tracking.
   *  Empty string = free-flying between planets. */
  declare planetId: string;
  /** Milliseconds of lifetime remaining */
  declare lifeMs: number;

  constructor() {
    super();
    this.pos = new Vec3();
    this.vel = new Vec3();
  }
}
defineTypes(ProjectileState, {
  id: "string",
  ownerId: "string",
  paintGroupId: "uint16",
  pos: Vec3,
  vel: Vec3,
  planetId: "string",
  lifeMs: "float32",
});
