type HudRefs = {
  layer: HTMLDivElement;
  tl: HTMLDivElement;
  tc: HTMLDivElement;
  tr: HTMLDivElement;
  br: HTMLDivElement;
  pause: HTMLDivElement;
  gameOver: HTMLDivElement;
};

type PlayerLike = {
  energy?: number;
  energyMax?: number;
  bombs?: number;
  weapon?: "W1" | "W2";
};

type SessionLike = {
  score?: number;
  lives?: number;
  wave?: number;
  gameOver?: boolean;
};

function mkChild(parent: HTMLElement, id: string, css: string): HTMLDivElement {
  const d = document.createElement("div");
  d.id = id;
  d.style.cssText = css;
  d.textContent = "";
  parent.appendChild(d);
  return d;
}

function squares(n: number, max: number): string {
  const on = "🟥";
  const off = "➖";
  const a = Math.max(0, Math.min(max | 0, n | 0));
  const m = Math.max(0, max | 0);
  return on.repeat(a) + off.repeat(Math.max(0, m - a));
}

function hearts(n: number): string {
  const h = "🩶";
  return h.repeat(Math.max(0, n | 0));
}

function weaponLine(p: PlayerLike): string {
  const w = p.weapon ?? "W1";
  const b = Math.max(0, (p.bombs ?? 0) | 0);

  const W1 = w === "W1" ? "[W1]" : " W1 ";
  const W2 = w === "W2" ? "[W2]" : " W2 ";
  const B = b > 0 ? `[BMB×${b}]` : ` BMB×0 `;
  return `${W1} - ${W2} - ${B}`;
}

export function createHUDArcade(root: HTMLElement) {
  // HUD layer that will be positioned to match the PRESENT rect (CSS px)
  const layer = document.createElement("div");
  layer.id = "hudLayer";
  layer.style.cssText =
    "position:fixed;left:0;top:0;width:0;height:0;z-index:10001;" +
    "pointer-events:none;overflow:hidden;" +
    "color:white;font:12px monospace;" +
    "text-shadow:0 2px 0 rgba(0,0,0,0.7);white-space:pre;";
  root.appendChild(layer);

  // corners INSIDE the layer
  const tl = mkChild(layer, "hudTL", "position:absolute;left:8px;top:8px;text-align:left;");
  const tc = mkChild(layer, "hudTC", "position:absolute;left:50%;top:8px;transform:translateX(-50%);text-align:center;");
  const tr = mkChild(layer, "hudTR", "position:absolute;right:8px;top:8px;text-align:right;");
  const br = mkChild(layer, "hudBR", "position:absolute;right:8px;bottom:8px;text-align:right;");

  // PAUSE overlay inside layer
  const pause = mkChild(
    layer,
    "hudPause",
    "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);" +
      "font:32px monospace;display:none;",
  );
  pause.textContent = "PAUSED";

  // GAME OVER overlay
  const gameOver = mkChild(
    layer,
    "hudGameOver",
    "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);" +
      "text-align:center;font:32px monospace;display:none;pointer-events:none;",
  );
  gameOver.textContent = "GAME OVER\nTry again? Y/N";

  const refs: HudRefs = { layer, tl, tc, tr, br, pause, gameOver };

  return {
    // called from main with gfx.getPresentRect() (CSS px)
    setRect: (x: number, y: number, w: number, h: number) => {
      refs.layer.style.left = `${x}px`;
      refs.layer.style.top = `${y}px`;
      refs.layer.style.width = `${w}px`;
      refs.layer.style.height = `${h}px`;

      const fs = Math.max(10, Math.min(16, Math.floor(h / 18)));
      refs.layer.style.fontSize = `${fs}px`;
    },

    setPaused: (on: boolean) => {
      refs.pause.style.display = on ? "block" : "none";
    },

    setGameOver: (on: boolean) => {
      refs.gameOver.style.display = on ? "block" : "none";
    },

    update: (p: PlayerLike, s: SessionLike, waveText?: string) => {
      const e = (p.energy ?? 0) | 0;
      const em = (p.energyMax ?? 5) | 0;

      refs.tl.textContent = `energy ${squares(e, em)}\nLives  ${hearts((s.lives ?? 0) | 0)}`;
      refs.tc.textContent = `Wave: ${waveText ?? String((s.wave ?? 0) | 0)}`;
      refs.tr.textContent = `Score: ${((s.score ?? 0) | 0).toString()}`;
      refs.br.textContent = weaponLine(p);

      refs.gameOver.style.display = s.gameOver ? "block" : "none";
    },
  };
}
