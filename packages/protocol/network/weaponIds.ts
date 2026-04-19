export const WeaponId = {
  MachineGun: "machineGun",
  Bazooka: "bazooka",
  Sniper: "sniper",
} as const;

export type WeaponId = (typeof WeaponId)[keyof typeof WeaponId];
