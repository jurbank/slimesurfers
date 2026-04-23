export const WeaponId = {
  MachineGun: "machineGun",
  HeavyMachineGun: "heavyMachineGun",
  Bazooka: "bazooka",
  Sniper: "sniper",
} as const;

export type WeaponId = (typeof WeaponId)[keyof typeof WeaponId];
