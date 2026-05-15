import type { Vec3Data, QuatData } from "@splat/protocol/network/clientMessages.ts";

export type { Vec3Data, QuatData };

// -- Vec3 helpers (return new objects, never mutate inputs) ------------------

export function add(a: Vec3Data, b: Vec3Data): Vec3Data {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
export function sub(a: Vec3Data, b: Vec3Data): Vec3Data {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
export function scale(a: Vec3Data, s: number): Vec3Data {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
export function dot(a: Vec3Data, b: Vec3Data): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
export function cross(a: Vec3Data, b: Vec3Data): Vec3Data {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
export function vlen(a: Vec3Data): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}
export function normalize(a: Vec3Data): Vec3Data {
  const l = vlen(a);
  return l < 1e-8 ? { x: 0, y: 1, z: 0 } : scale(a, 1 / l);
}
export function projectOntoPlane(a: Vec3Data, normal: Vec3Data): Vec3Data {
  return sub(a, scale(normal, dot(a, normal)));
}
export function clampLength(a: Vec3Data, maxLength: number): Vec3Data {
  const l = vlen(a);
  return l > maxLength && l > 1e-8 ? scale(a, maxLength / l) : a;
}
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Mutate target in place — required so Colyseus tracks field-level changes
// when PlayerPhysics is backed by a schema object on the server.
export function assign(t: Vec3Data, s: Vec3Data): void {
  t.x = s.x;
  t.y = s.y;
  t.z = s.z;
}
export function assignQuat(t: QuatData, s: QuatData): void {
  t.x = s.x;
  t.y = s.y;
  t.z = s.z;
  t.w = s.w;
}

// -- Quaternion helpers (return new objects, never mutate inputs) -------------

export function quatFromAxes(right: Vec3Data, up: Vec3Data, forward: Vec3Data): QuatData {
  const { x: m00, y: m10, z: m20 } = right;
  const { x: m01, y: m11, z: m21 } = up;
  const { x: m02, y: m12, z: m22 } = forward;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return { w: 0.25 / s, x: (m21 - m12) * s, y: (m02 - m20) * s, z: (m10 - m01) * s };
  }
  if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return { w: (m21 - m12) / s, x: 0.25 * s, y: (m01 + m10) / s, z: (m02 + m20) / s };
  }
  if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return { w: (m02 - m20) / s, x: (m01 + m10) / s, y: 0.25 * s, z: (m12 + m21) / s };
  }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: 0.25 * s };
}

export function applyQuat(v: Vec3Data, q: QuatData): Vec3Data {
  const { x, y, z } = v;
  const { x: qx, y: qy, z: qz, w: qw } = q;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  };
}

export function quatMultiply(a: QuatData, b: QuatData): QuatData {
  return {
    x: a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y,
    y: a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z,
    z: a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export function quatFromUnitVectors(from: Vec3Data, to: Vec3Data): QuatData {
  const r = dot(from, to) + 1;
  if (r < 1e-6) {
    if (Math.abs(from.x) > Math.abs(from.z)) {
      return normalizeQuat({ x: -from.y, y: from.x, z: 0, w: 0 });
    }
    return normalizeQuat({ x: 0, y: -from.z, z: from.y, w: 0 });
  }
  const c = cross(from, to);
  return normalizeQuat({ x: c.x, y: c.y, z: c.z, w: r });
}

export function normalizeQuat(q: QuatData): QuatData {
  const l = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (l < 1e-8) return { x: 0, y: 0, z: 0, w: 1 };
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}
