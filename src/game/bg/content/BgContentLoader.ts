import presetsJson from "../content/bgPresets.json";
import bindingsJson from "../content/bgBindings.json";
import { BgPreset } from "../schema/BgPreset";
import { BgBinding } from "../schema/BgBinding";

export class BgContentLoader {
  presets = new Map<string, BgPreset>();
  bindings = new Map<string, BgBinding>();

  load(): void {
    for (const p of presetsJson as BgPreset[]) {
      this.presets.set(p.id, p);
    }
    for (const b of bindingsJson as BgBinding[]) {
      this.bindings.set(b.levelId, b);
    }
  }

  getPreset(id: string): BgPreset | null {
    return this.presets.get(id) ?? null;
  }

  getPresetForLevel(levelId: string): BgPreset | null {
    const binding = this.bindings.get(levelId);
    if (!binding) return null;
    return this.getPreset(binding.presetId);
  }

  getAllPresets(): any[] {
    const anyPresets: any = (presetsJson as any);
    if (Array.isArray(anyPresets)) return anyPresets;
    if (anyPresets && Array.isArray(anyPresets.presets)) return anyPresets.presets;
    return [];
  }
}
