import { NETWORK_CONFIG } from "@splat/content/config/networkConfig.ts";
import { InputKey, type InputMessage } from "@splat/protocol/network/clientMessages.ts";

const MAX_INPUT_DT_SEC = 1 / NETWORK_CONFIG.simulation.tickRateHz;

const ALLOWED_INPUT_KEYS =
  InputKey.Forward |
  InputKey.Backward |
  InputKey.Left |
  InputKey.Right |
  InputKey.Anchor |
  InputKey.Fire |
  InputKey.Submerge;

const MAX_LOCKED_TARGET_ID_LENGTH = 128;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFiniteVec3(value: unknown): InputMessage["aimDir"] | null {
  if (!isPlainRecord(value)) return null;
  const { x, y, z } = value;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof z !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z)
  ) {
    return null;
  }
  return { x, y, z };
}

function parseInputKeys(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value & ALLOWED_INPUT_KEYS;
}

export function sanitizeInputMessage(value: unknown): InputMessage | null {
  if (!isPlainRecord(value)) return null;

  const seq = value.seq;
  if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq <= 0) return null;

  const keys = parseInputKeys(value.keys);
  if (keys === null) return null;

  const aimDir = parseFiniteVec3(value.aimDir);
  if (!aimDir) return null;

  const rawDt = value.dt;
  if (typeof rawDt !== "number" || !Number.isFinite(rawDt) || rawDt < 0) return null;

  const input: InputMessage = {
    seq,
    keys,
    aimDir,
    dt: Math.min(rawDt, MAX_INPUT_DT_SEC),
  };

  const pressedKeys = parseInputKeys(value.pressedKeys);
  if (pressedKeys !== null) {
    input.pressedKeys = pressedKeys;
  }

  const aimPoint = parseFiniteVec3(value.aimPoint);
  if (aimPoint) {
    input.aimPoint = aimPoint;
  }

  if (typeof value.lockedTargetId === "string") {
    input.lockedTargetId = value.lockedTargetId.slice(0, MAX_LOCKED_TARGET_ID_LENGTH);
  }

  if (value.guaranteedHoming === true) {
    input.guaranteedHoming = true;
  }

  if (typeof value.chargeProgress === "number" && Number.isFinite(value.chargeProgress)) {
    input.chargeProgress = Math.max(0, Math.min(1, value.chargeProgress));
  }

  return input;
}
