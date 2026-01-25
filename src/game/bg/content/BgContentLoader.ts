import presetsJson from "../content/bgPresets.json";
import bindingsJson from "../content/bgBindings.json";
import { BgPreset } from "../schema/BgPreset";

export class BgContentLoader {
  presets = new Map<string, BgPreset>();
  bindings: Record<string, string> = {};

  constructor() {
    // normalize presets (support legacy shape without .base)
    for (const raw of presetsJson as any[]) {
      const p0: any = raw ?? {};
      const base =
        p0.base ??
        ({
          common: p0.common ?? {},
          flow: p0.flow ?? {},
          shader: p0.shader ?? {},
        });

      const p: BgPreset = {
        ...p0,
        // ensure base exists
        base,
        // defensive defaults
        kind: String(p0.kind ?? "shader"),
        id: String(p0.id ?? ""),
        name: String(p0.name ?? p0.id ?? "preset"),
        seed: Number.isFinite(Number(p0.seed)) ? Number(p0.seed) : 1,
      } as any;

      if (p.id) this.presets.set(p.id, p);
    }

    this.bindings = (bindingsJson as any) ?? {};
  }

  getAllPresets(): BgPreset[] {
    return [...this.presets.values()];
  }

  getPreset(id: string): BgPreset | null {
    return this.presets.get(id) ?? null;
  }

  getPresetForLevel(levelId: string): BgPreset | null {
    const id = this.bindings?.[levelId];
    if (!id) return null;
    return this.getPreset(id);
  }
}
