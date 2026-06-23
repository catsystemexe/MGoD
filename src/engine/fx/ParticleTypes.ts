export interface ParticleDesc {
  x: number; y: number;
  vx: number; vy: number;
  ttl: number; maxTtl: number;
  r: number; g: number; b: number;
  size: number;
  kind: "shard" | "flash" | "fx";
}
