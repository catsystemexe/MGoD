// MeshDevUI.ts

export type MeshParamDef = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  group: string;
};

export const MESH_PARAM_DEFS: MeshParamDef[] = [
  // Base Waves
  { key: "amp", label: "amp", min: 0, max: 15, step: 0.01, group: "Base Waves" },
  { key: "freq", label: "freq", min: 0.1, max: 5, step: 0.01, group: "Base Waves" },
  { key: "speed", label: "speed", min: 0, max: 3, step: 0.01, group: "Base Waves" },
  { key: "amp2", label: "amp2", min: 0, max: 15, step: 0.01, group: "Base Waves" },
  { key: "freq2", label: "freq2", min: 0.1, max: 5, step: 0.01, group: "Base Waves" },
  { key: "speed2", label: "speed2", min: 0, max: 3, step: 0.01, group: "Base Waves" },

  // Warp
  { key: "warpAmp", label: "warpAmp", min: 0, max: 5, step: 0.01, group: "Warp" },
  { key: "warpFreq", label: "warpFreq", min: 0, max: 5, step: 0.01, group: "Warp" },
  { key: "warpSpeed", label: "warpSpeed", min: 0, max: 3, step: 0.01, group: "Warp" },

  // Bump
  { key: "bumpAmp", label: "bumpAmp", min: 0, max: 10, step: 0.01, group: "Bump" },
  { key: "bumpFreq", label: "bumpFreq", min: 0.1, max: 10, step: 0.01, group: "Bump" },
  { key: "bumpSpeed", label: "bumpSpeed", min: 0, max: 5, step: 0.01, group: "Bump" },
  { key: "bumpSharp", label: "bumpSharp", min: 0.1, max: 5, step: 0.01, group: "Bump" },
  { key: "bumpOctaves", label: "bumpOctaves", min: 1, max: 5, step: 1, group: "Bump" },
  { key: "bumpRot", label: "bumpRot", min: 0, max: 6.28, step: 0.01, group: "Bump" },

  // Depth
  { key: "ampDepthNear", label: "ampDepthNear", min: 0, max: 30, step: 0.1, group: "Depth" },
  { key: "ampDepthFar", label: "ampDepthFar", min: 0, max: 30, step: 0.1, group: "Depth" },
  { key: "ampDepthPow", label: "ampDepthPow", min: 0.1, max: 5, step: 0.01, group: "Depth" },
  { key: "bumpDepthNear", label: "bumpDepthNear", min: 0, max: 10, step: 0.1, group: "Depth" },
  { key: "bumpDepthFar", label: "bumpDepthFar", min: 0, max: 10, step: 0.1, group: "Depth" },
  { key: "bumpDepthPow", label: "bumpDepthPow", min: 0.1, max: 5, step: 0.01, group: "Depth" },

  // Projection
  { key: "tilt", label: "tilt", min: -2, max: 2, step: 0.01, group: "Projection" },
  { key: "persp", label: "persp", min: 0.1, max: 3, step: 0.01, group: "Projection" },
  { key: "xSpan", label: "xSpan", min: 1, max: 20, step: 0.1, group: "Projection" },

  // Time
  { key: "timeMul", label: "timeMul", min: 0, max: 3, step: 0.01, group: "Time" },
];

export function createMeshDevUI(bgPipeline: any) {
  const panel = document.createElement("div");
  panel.style.cssText = `
    position:fixed;
    right:0;
    top:0;
    width:320px;
    max-height:100vh;
    overflow:auto;
    background:rgba(0,0,0,0.85);
    color:white;
    font:12px monospace;
    padding:10px;
    z-index:10000;
  `;

  document.body.appendChild(panel);

  const api = (window as any).__CM?.bg;
  const presets = api?.presets?.() ?? [];
  let activeId: string | null = api?.getActivePresetId?.() ?? null;

  // robust base preset pick (active -> first -> null)
  const pickBasePreset = () => {
    const byActive = activeId ? presets.find((p: any) => p && p.id === activeId) : null;
    return byActive ?? presets[0] ?? null;
  };

  let basePreset: any = pickBasePreset();

  // helper: supports v1 (preset.mesh) and v2 (preset.layers[0].params.mesh)
  const getMeshRef = (p: any): any => {
    if (!p) return null;
    if (p.mesh && typeof p.mesh === "object") return p.mesh;
    const layer0 = Array.isArray(p.layers) ? p.layers[0] : null;
    const mesh = layer0?.params?.mesh;
    return mesh && typeof mesh === "object" ? mesh : null;
  };

  const deepClone = (x: any) => JSON.parse(JSON.stringify(x));

  // if presets missing, create a minimal safe shell so UI doesn't crash
  const ensureWorkingPreset = (p: any) => {
    if (p) return deepClone(p);
    return { id: "dev.fallback", name: "Dev Fallback", schemaVersion: 2, common: {}, quality: {}, layers: [{ id: "layer0", kind: "meshTerrain", enabled: true, opacity: 1, blend: "alpha", parallaxMul: 1, params: { mesh: {} } }] };
  };

  const initialSnapshot = deepClone(
    bgPipeline.getCurrentPreset?.() ?? basePreset
  );

  let workingPreset = deepClone(initialSnapshot);

  function apply() {
    bgPipeline.setPreset(workingPreset);
  }

  function reset() {
    const original = deepClone(initialSnapshot);

    // pošli kompletní preset do pipeline
    bgPipeline.setPreset(original);
    bgPipeline.resetScroll?.();

    // aktualizuj workingPreset až po setPreset
    workingPreset = deepClone(original);

    render();
  }

    function render() {
      panel.innerHTML = "";

      // --- top bar: preset select + reset (MVP) ---
      const top = document.createElement("div");
      top.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:10px;";

      const sel = document.createElement("select");
      sel.style.cssText = "flex:1;max-width:220px;";
      const curId = (window as any).__CM?.bg?.getActivePresetId?.() ?? activeId ?? null;

      if (presets.length === 0) {
        const opt = document.createElement("option");
        opt.value = "none";
        opt.textContent = "No presets";
        sel.appendChild(opt);
        sel.disabled = true;
      } else {
        for (const p of presets) {
          const opt = document.createElement("option");
          opt.value = String(p?.id ?? "");
          opt.textContent = String(p?.name ?? p?.id ?? "preset");
          if (p?.id === curId) opt.selected = true;
          sel.appendChild(opt);
        }
      }

      sel.onchange = () => {
        const id = String(sel.value || "");
        if (!id) return;

        // switch active preset via global API if available
        (window as any).__CM?.bg?.setPresetById?.(id);

        activeId = id;
        basePreset = pickBasePreset();
        workingPreset = ensureWorkingPreset(basePreset);
        render(); // rebuild sliders with new defaults
      };

      const resetBtn = document.createElement("button");
      resetBtn.textContent = "Reset";
      resetBtn.onclick = reset;

      top.appendChild(sel);
      top.appendChild(resetBtn);
      panel.appendChild(top);

    const groups = [...new Set(MESH_PARAM_DEFS.map(p => p.group))];

    for (const group of groups) {
      const title = document.createElement("div");
      title.textContent = `\n--- ${group} ---`;
      panel.appendChild(title);

      const defs = MESH_PARAM_DEFS.filter(p => p.group === group);

      for (const def of defs) {
        const row = document.createElement("div");
        row.style.marginBottom = "6px";

        const label = document.createElement("div");
        label.textContent = def.label;
        row.appendChild(label);

        // --- mesh reference (v1 + v2 safe) ---
        const meshRef = getMeshRef(workingPreset) ?? {};

        if (!getMeshRef(workingPreset)) {
          if (workingPreset.mesh && typeof workingPreset.mesh === "object") {
            // v1 preset
          } else if (Array.isArray(workingPreset.layers)) {
            workingPreset.layers[0] = workingPreset.layers[0] ?? {
              id: "layer0",
              kind: "meshTerrain",
              params: {},
            };
            workingPreset.layers[0].params =
              workingPreset.layers[0].params ?? {};
            workingPreset.layers[0].params.mesh = meshRef;
          } else {
            workingPreset.mesh = meshRef;
          }
        }

        const currentValue = (meshRef as any)[def.key] ?? 0;

        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = String(def.min);
        slider.max = String(def.max);
        slider.step = String(def.step);
        slider.value = String(currentValue);

        const valueBox = document.createElement("input");
        valueBox.type = "number";
        valueBox.value = String(currentValue);
        valueBox.step = String(def.step);
        valueBox.style.width = "60px";

        slider.oninput = () => {
          valueBox.value = slider.value;
          (meshRef as any)[def.key] = Number(slider.value);
          apply();
        };

        valueBox.onchange = () => {
          slider.value = valueBox.value;
          (meshRef as any)[def.key] = Number(valueBox.value);
          apply();
        };

        row.appendChild(slider);
        row.appendChild(valueBox);

        panel.appendChild(row);
      }
    }
  }

render();
return panel;
}