import { BgPreset } from "../schema/BgPreset";

export function diffPreset(oldP: BgPreset, newP: BgPreset) {
  if (oldP.kind !== newP.kind) {
    return { realtime: false, rebuild: false, structural: true };
  }

const baseChanged =
  JSON.stringify(oldP.base) !== JSON.stringify(newP.base);

return {
  realtime: true,
  rebuild: baseChanged,
  structural: false,
};
  }