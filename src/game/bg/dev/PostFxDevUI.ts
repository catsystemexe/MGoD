// PostFxDevUI.ts

export type PostFxParamDef = {
  key: string;
  min: number;
  max: number;
  step: number;
};

const PARAMS: PostFxParamDef[] = [
    { key: "aberr", min: 0, max: 0.2, step: 0.0001 },
    { key: "aberrNear", min: 0.0, max: 2.5, step: 0.001 },
    { key: "aberrFar",  min: 0.0, max: 3.5, step: 0.001 },
    { key: "neonAmt", min: 0, max: 150, step: 0.01 },
    { key: "neonHeightMix", min: 0, max: 1, step: 0.01 },
    { key: "barrel", min: -0.35, max: 1.35, step: 0.001 },
    { key: "scatterDensity", min: 0.0, max: 6.0, step: 0.01 },
    { key: "scatterPow", min: 0.2, max: 6, step: 0.01 },
    { key: "glitchStrength", min: 0, max: 1.15, step: 0.0005 },
    { key: "glitchSlices", min: 1, max: 220, step: 1 },
    { key: "glitchSpeed", min: 0, max: 20, step: 0.01 },
    { key: "scatterColorR", min: 0, max: 1, step: 0.01 },
    { key: "scatterColorG", min: 0, max: 1, step: 0.01 },
    { key: "scatterColorB", min: 0, max: 1, step: 0.01 },
];

export function createPostFxDevUI(bgPipeline: any) {

  let visible = false;
  let panel: HTMLDivElement | null = null;

  function listPostFxLayers(preset: any): any[] {
  if (!preset?.layers) return [];
  return preset.layers
    .map((l: any, i: number) => ({ l, i }))
    .filter((x: any) => x.l && String(x.l.kind ?? "") === "postFx")
    .map((x: any) => x.l);
}

function ensurePostFxParams(layer: any): any {
  if (!layer.params) layer.params = {};
  if (!layer.params.postFx) layer.params.postFx = {};
  return layer.params.postFx;
}

let selectedFxIndex = 0;

  function build() {
  if (panel) panel.remove();

  panel = document.createElement("div");
  panel.style.position = "fixed";
  panel.style.top = "10px";
  panel.style.right = "10px";
  panel.style.padding = "12px";
  panel.style.background = "rgba(0,0,0,0.85)";
  panel.style.color = "white";
  panel.style.fontFamily = "monospace";
  panel.style.zIndex = "9999";
  panel.style.maxHeight = "85vh";
  panel.style.overflow = "auto";
  panel.style.width = "260px";

  const preset = bgPipeline.getWorkingPreset?.();
  const fxLayers = listPostFxLayers(preset);

  if (!preset || !fxLayers.length) {
    panel.innerText = "No postFx layers found";
    document.body.appendChild(panel);
    return;
  }

  selectedFxIndex = Math.max(0, Math.min(selectedFxIndex, fxLayers.length - 1));

  const header = document.createElement("div");
  header.style.marginBottom = "10px";
  header.innerText = `postFx layers: ${fxLayers.length}`;
  panel.appendChild(header);

  // --- layer list (mute + reorder + select)
  fxLayers.forEach((layer: any, idx: number) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "6px";
    row.style.marginBottom = "6px";
    row.style.padding = "4px";
    row.style.border = idx === selectedFxIndex ? "1px solid rgba(255,255,255,0.6)" : "1px solid rgba(255,255,255,0.15)";

    const name = document.createElement("div");
    name.style.flex = "1";
    name.style.cursor = "pointer";
    name.innerText = String(layer.id ?? `postFx_${idx}`);
    name.onclick = () => {
      selectedFxIndex = idx;
      build();
    };

    const en = document.createElement("input");
    en.type = "checkbox";
    en.checked = layer.enabled !== false;
    en.title = "enabled";
    en.onchange = () => {
      layer.enabled = en.checked;
      (bgPipeline.applyPresetNoReset?.(preset) ?? bgPipeline.applyPreset?.(preset));
    };

    const up = document.createElement("button");
    up.innerText = "↑";
    up.onclick = () => {
      const layers = preset.layers;
      const all = layers.filter((l: any) => l && typeof l === "object");
      const iAbs = layers.indexOf(layer);
      if (iAbs > 0) {
        const tmp = layers[iAbs - 1];
        layers[iAbs - 1] = layers[iAbs];
        layers[iAbs] = tmp;
        selectedFxIndex = Math.max(0, selectedFxIndex - 1);
        (bgPipeline.applyPresetNoReset?.(preset) ?? bgPipeline.applyPreset?.(preset));
        build();
      }
    };

    const dn = document.createElement("button");
    dn.innerText = "↓";
    dn.onclick = () => {
      const layers = preset.layers;
      const iAbs = layers.indexOf(layer);
      if (iAbs >= 0 && iAbs < layers.length - 1) {
        const tmp = layers[iAbs + 1];
        layers[iAbs + 1] = layers[iAbs];
        layers[iAbs] = tmp;
        selectedFxIndex = Math.min(fxLayers.length - 1, selectedFxIndex + 1);
        (bgPipeline.applyPresetNoReset?.(preset) ?? bgPipeline.applyPreset?.(preset));
        build();
      }
    };

    row.appendChild(en);
    row.appendChild(name);
    row.appendChild(up);
    row.appendChild(dn);

    panel!.appendChild(row);
  });

  const sep = document.createElement("div");
  sep.style.margin = "10px 0";
  sep.style.borderTop = "1px solid rgba(255,255,255,0.2)";
  panel.appendChild(sep);

  const fx = ensurePostFxParams(fxLayers[selectedFxIndex]);

  // normalize scatterColor storage to array
  if (!Array.isArray(fx.scatterColor)) fx.scatterColor = fx.scatterColor ?? [0.02, 0.05, 0.09];
  fx.scatterColor[0] = Number(fx.scatterColor[0] ?? 0.02);
  fx.scatterColor[1] = Number(fx.scatterColor[1] ?? 0.05);
  fx.scatterColor[2] = Number(fx.scatterColor[2] ?? 0.09);

  function readKey(key: string): number {
    if (key === "scatterColorR") return fx.scatterColor[0];
    if (key === "scatterColorG") return fx.scatterColor[1];
    if (key === "scatterColorB") return fx.scatterColor[2];
    return Number(fx[key] ?? 0);
  }

  function writeKey(key: string, v: number) {
    if (key === "scatterColorR") fx.scatterColor[0] = v;
    else if (key === "scatterColorG") fx.scatterColor[1] = v;
    else if (key === "scatterColorB") fx.scatterColor[2] = v;
    else fx[key] = v;
  }

  PARAMS.forEach(def => {
    const wrap = document.createElement("div");
    wrap.style.marginBottom = "8px";

    const label = document.createElement("div");
    label.innerText = def.key;
    wrap.appendChild(label);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = String(def.min);
    slider.max = String(def.max);
    slider.step = String(def.step);
    slider.value = String(readKey(def.key));
    slider.style.width = "230px";

    slider.oninput = () => {
      writeKey(def.key, Number(slider.value));
      (bgPipeline.applyPresetNoReset?.(preset) ?? bgPipeline.applyPreset?.(preset));
    };

    wrap.appendChild(slider);
    panel!.appendChild(wrap);
  });

  document.body.appendChild(panel);
}

  function toggle() {
    visible = !visible;
    if (!visible) {
      panel?.remove();
      panel = null;
      return;
    }
    build();
  }

  console.log("PostFx UI loaded");
window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "f") {
      toggle();
    }
  });
}
