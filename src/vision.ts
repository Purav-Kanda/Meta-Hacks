/** Forward vector on the floor plane for a yaw where yaw 0 faces -Z. */
export function forwardOf(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** Is the floor-plane point (px,pz) inside the cone standing at (tx,tz) facing `yaw`? */
export function inCone(
  tx: number,
  tz: number,
  yaw: number,
  px: number,
  pz: number,
  range: number,
  halfAngle: number,
): boolean {
  const dx = px - tx;
  const dz = pz - tz;
  const dist = Math.hypot(dx, dz);
  if (dist > range) return false;
  if (dist < 1e-6) return true;
  const f = forwardOf(yaw);
  return (dx * f.x + dz * f.z) / dist >= Math.cos(halfAngle);
}

/** yaw that faces from (fx,fz) toward (tx,tz) */
export function yawToward(fx: number, fz: number, tx: number, tz: number): number {
  return Math.atan2(-(tx - fx), -(tz - fz));
}

export function wrapAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}
