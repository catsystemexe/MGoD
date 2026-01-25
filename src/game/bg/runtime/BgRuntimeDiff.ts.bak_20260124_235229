import { BgPreset } from "../schema/BgPreset";

export function diffPreset(oldP: BgPreset, newP: BgPreset) {
  if (oldP.kind !== newP.kind) {
    return { realtime: false, rebuild: false, structural: true };
  }

  const realtime =
    JSON.stringify(oldP.base) !== JSON.stringify(newP.base);

  // naive MVP heuristic – later split params explicitly
  const rebuild =
    JSON.stringify(oldP.base?.resolution) !==
    JSON.stringify(newP.base?.resolution);

  return { realtime, rebuild, structural: false };
}
