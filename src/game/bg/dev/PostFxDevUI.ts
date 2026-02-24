// PostFxDevUI.ts

export type PostFxParamDef = {
  key: string;
  min: number;
  max: number;
  step: number;
};

const PARAMS: PostFxParamDef[] = [
    { key: "aberr", min: 0, max: 0.2, step: 0.0001 },
    { key: "neonAmt", min: 0, max: 150, step: 0.01 },
    { key: "neonHeightMix", min: 0, max: 1, step: 0.01 },
    { key: "barrel", min: -0.35, max: 1.35, step: 0.001 },
    { key: "scatterPow", min: 0.2, max: 6, step: 0.01 },
    { key: "glitchStrength", min: 0, max: 1.15, step: 0.0005 },
    { key: "glitchSlices", min: 1, max: 220, step: 1 },
    { key: "glitchSpeed", min: 0, max: 20, step: 0.01 },
];

export function createPostFxDevUI(bgPipeline: any) {

  let visible = false;
  let panel: HTMLDivElement | null = null;

  function getPostFxRef(preset: any): any {
    if (!preset?.layers) return null;

    const layer = preset.layers.find((l: any) => l.kind === "postFx");
    if (!layer) return null;

    if (!layer.params) layer.params = {};
    if (!layer.params.postFx) layer.params.postFx = {};

    return layer.params.postFx;
  }

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

    const preset = bgPipeline.getWorkingPreset?.();
    const fx = getPostFxRef(preset);

    if (!fx) {
      panel.innerText = "No postFx layer found";
      document.body.appendChild(panel);
      return;
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
      slider.value = String(fx[def.key] ?? 0);
      slider.style.width = "200px";

      slider.oninput = () => {
        fx[def.key] = Number(slider.value);
        bgPipeline.applyPreset?.(preset);
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
