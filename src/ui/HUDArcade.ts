// HUDArcade — arcade HUD overlay (DOM layer above the WebGL canvas).
//
// NOTE on render order: this HUD is a DOM overlay (z-index above canvas#game).
// The CRT PostProcess (scanlines + chromatic aberration) runs INSIDE the WebGL
// present() pass on the framebuffer, so it cannot reach DOM pixels. To keep the
// HUD visually integrated with the CRT look we apply a lightweight CSS scanline
// overlay + glow here instead. Truly compositing the HUD under PostFX would
// require rendering it into the WebGL pipeline (out of scope for this pass).

type HudRefs = {
  layer: HTMLDivElement;
  panel: HTMLDivElement;
  lives: HTMLDivElement;
  wave: HTMLDivElement;
  score: HTMLDivElement;
  energy: HTMLDivElement;
  w1: HTMLCanvasElement;
  w2: HTMLCanvasElement;
  bomb: HTMLDivElement;
  cdFill: HTMLDivElement;
  pause: HTMLDivElement;
  gameOver: HTMLDivElement;
  title: HTMLDivElement;
};

type W2State = { active?: boolean; charge01?: number };

type PlayerLike = {
  energy?: number;
  energyMax?: number;
  bombs?: number;
  weapon?: "W1" | "W2";
  w2?: W2State;
};

type SessionLike = {
  score?: number;
  lives?: number;
  wave?: number;
  gameOver?: boolean;
};

type HudMode = "PLAY" | "TITLE" | "GAME_OVER";

// --- Fonts ----------------------------------------------------------------
const LABEL_FONT = "'Orbitron', sans-serif";
// Bitcount for digits when available; Share Tech Mono is the retro fallback.
const NUM_FONT = "'Bitcount Single', 'Share Tech Mono', monospace";

// --- Palette --------------------------------------------------------------
const COL_CYAN = "#00ffee";
const COL_DIM = "#333344";
const COL_LABEL = "#aaaacc";
const COL_ORANGE = "#ff6600";

function mkChild(parent: HTMLElement, id: string, css: string): HTMLDivElement {
  const d = document.createElement("div");
  d.id = id;
  d.style.cssText = css;
  parent.appendChild(d);
  return d;
}

function pad(n: number, len: number): string {
  return String(Math.max(0, n | 0)).padStart(len, "0");
}

// Energy as a block bar: filled (█) cyan, empty (░) dim.
function energyMarkup(n: number, max: number): string {
  const m = Math.max(1, max | 0);
  const on = Math.max(0, Math.min(m, n | 0));
  const filled = "█".repeat(on);
  const empty = "░".repeat(Math.max(0, m - on));
  return (
    `<span style="font-family:${LABEL_FONT};font-size:11px;letter-spacing:1px;color:${COL_LABEL}">ENERGY</span> ` +
    `<span style="font-family:${NUM_FONT};color:${COL_CYAN}">${filled}</span>` +
    `<span style="font-family:${NUM_FONT};color:${COL_DIM}">${empty}</span>`
  );
}

// --- Weapon icons ---------------------------------------------------------
// PNG placeholder: returns null until art exists; renderer falls back to canvas.
function loadWeaponIcon(_name: string): HTMLImageElement | null {
  return null;
}

function drawW1(ctx: CanvasRenderingContext2D, w: number, h: number, active: boolean): void {
  ctx.clearRect(0, 0, w, h);
  const png = loadWeaponIcon("w1");
  if (png) {
    ctx.globalAlpha = active ? 1 : 0.4;
    ctx.drawImage(png, 0, 0, w, h);
    ctx.globalAlpha = 1;
    return;
  }
  // cyan elongated laser bolt with glow
  ctx.globalAlpha = active ? 1 : 0.4;
  ctx.save();
  ctx.shadowColor = COL_CYAN;
  ctx.shadowBlur = active ? 8 : 2;
  ctx.fillStyle = COL_CYAN;
  const by = h / 2 - 2;
  ctx.fillRect(2, by, w - 8, 4);
  // bright tip
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(w - 8, by, 4, 4);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawW2(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  active: boolean,
  phase: number,
): void {
  ctx.clearRect(0, 0, w, h);
  const png = loadWeaponIcon("w2");
  if (png) {
    ctx.globalAlpha = active ? 1 : 0.4;
    ctx.drawImage(png, 0, 0, w, h);
    ctx.globalAlpha = 1;
    return;
  }
  // rainbow wavy beam
  ctx.globalAlpha = active ? 1 : 0.4;
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.shadowBlur = active ? 6 : 0;
  const cy = h / 2;
  const amp = h * 0.22;
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    const x0 = 2 + ((w - 4) * i) / steps;
    const x1 = 2 + ((w - 4) * (i + 1)) / steps;
    const hue = ((i / steps) * 360 + phase * 60) % 360;
    const y0 = cy + Math.sin(i * 0.9 + phase) * amp;
    const y1 = cy + Math.sin((i + 1) * 0.9 + phase) * amp;
    const c = `hsl(${hue},100%,60%)`;
    ctx.strokeStyle = c;
    ctx.shadowColor = c;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

export function createHUDArcade(root: HTMLElement) {
  let mode: HudMode = "PLAY";
  let iconPhase = 0;

  // one-time keyframes/styles for the CRT-ish HUD overlay + rainbow cooldown
  if (!document.getElementById("hudArcadeStyles")) {
    const st = document.createElement("style");
    st.id = "hudArcadeStyles";
    st.textContent = `
      @keyframes hudRainbow { 0%{background-position:0% 0} 100%{background-position:200% 0} }
      #hudScan {
        position:absolute; inset:0; pointer-events:none; z-index:2;
        background:repeating-linear-gradient(
          to bottom, rgba(0,0,0,0.10) 0px, rgba(0,0,0,0.10) 1px,
          transparent 1px, transparent 3px);
        mix-blend-mode:multiply; opacity:0.5;
      }`;
    document.head.appendChild(st);
  }

  // HUD layer positioned to match the PRESENT rect (CSS px)
  const layer = document.createElement("div");
  layer.id = "hudLayer";
  layer.style.cssText =
    "position:fixed;left:0;top:0;width:0;height:0;z-index:10001;" +
    "pointer-events:none;overflow:hidden;color:white;" +
    `font-family:${LABEL_FONT};text-shadow:0 0 6px rgba(0,255,238,0.35),0 2px 0 rgba(0,0,0,0.7);`;
  root.appendChild(layer);

  // ---- Top-left command panel ----
  const panel = mkChild(
    layer,
    "hudPanel",
    "position:absolute;left:10px;top:8px;z-index:3;display:flex;flex-direction:column;gap:5px;",
  );

  // header row: lives | wave | score
  const header = mkChild(
    panel,
    "hudHeader",
    "display:flex;align-items:center;gap:20px;",
  );
  const lives = mkChild(header, "hudLives", "display:flex;gap:5px;font-size:16px;line-height:1;");
  const wave = mkChild(
    header,
    "hudWave",
    `font-family:${LABEL_FONT};font-size:14px;font-weight:700;letter-spacing:2px;color:${COL_LABEL};`,
  );
  const score = mkChild(header, "hudScore", "font-size:14px;letter-spacing:1px;");

  // energy row
  const energy = mkChild(panel, "hudEnergy", "font-size:13px;letter-spacing:1px;");

  // divider
  mkChild(
    panel,
    "hudDivider",
    "width:180px;height:0;border-top:1px solid rgba(0,255,238,0.25);margin:1px 0;",
  );

  // weapons row: W1 icon | W2 icon | bomb
  const weapons = mkChild(panel, "hudWeapons", "display:flex;align-items:center;gap:12px;");

  function mkIconCanvas(id: string): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.id = id;
    // 2× backing store for crisp lines; CSS size is 1×.
    c.width = 56;
    c.height = 28;
    c.style.cssText = "width:28px;height:14px;display:block;";
    weapons.appendChild(c);
    const ctx = c.getContext("2d");
    if (ctx) ctx.scale(2, 2);
    return c;
  }
  const w1 = mkIconCanvas("hudW1");
  const w2 = mkIconCanvas("hudW2");
  const bomb = mkChild(
    weapons,
    "hudBomb",
    `font-size:14px;color:${COL_ORANGE};text-shadow:0 0 6px rgba(255,102,0,0.5);`,
  );

  // W2 cooldown bar row
  const cdRow = mkChild(panel, "hudCdRow", "display:flex;align-items:center;gap:8px;");
  mkChild(
    cdRow,
    "hudCdLabel",
    `font-family:${LABEL_FONT};font-size:9px;letter-spacing:1px;color:${COL_LABEL};`,
  ).textContent = "W2";
  const cdTrack = mkChild(
    cdRow,
    "hudCdTrack",
    "width:60px;height:4px;background:rgba(255,255,255,0.12);border-radius:2px;overflow:hidden;",
  );
  const cdFill = mkChild(
    cdTrack,
    "hudCdFill",
    "height:100%;width:0%;border-radius:2px;background:" + COL_CYAN + ";",
  );

  // ---- CRT scanline overlay over the HUD ----
  mkChild(layer, "hudScan", "");

  // ---- Overlays (PAUSE / TITLE / GAME OVER) preserved ----
  const pause = mkChild(
    layer,
    "hudPause",
    "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:4;" +
      `font-family:${LABEL_FONT};font-weight:700;font-size:32px;letter-spacing:4px;display:none;`,
  );
  pause.textContent = "PAUSED";

  const title = mkChild(
    layer,
    "hudTitle",
    "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:4;" +
      `text-align:center;font-family:${LABEL_FONT};font-weight:700;font-size:22px;` +
      "letter-spacing:3px;line-height:1.6;display:none;white-space:pre;",
  );
  title.textContent = "CAPTAIN MEOW\n\nPRESS ENTER";

  const gameOver = mkChild(
    layer,
    "hudGameOver",
    "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:4;" +
      `text-align:center;font-family:${LABEL_FONT};font-weight:700;font-size:30px;` +
      "letter-spacing:3px;line-height:1.5;display:none;white-space:pre;",
  );
  gameOver.textContent = "GAME OVER\nTry again? Y/N";

  const refs: HudRefs = {
    layer, panel, lives, wave, score, energy, w1, w2, bomb, cdFill, pause, gameOver, title,
  };

  function applyMode() {
    refs.title.style.display = mode === "TITLE" ? "block" : "none";
    refs.gameOver.style.display = mode === "GAME_OVER" ? "block" : "none";
    refs.panel.style.display = mode === "PLAY" ? "flex" : "none";
  }
  applyMode();

  // lives as mini-rocket chevrons (▶); cyan = alive, dim = lost. Max 3 shown.
  function renderLives(n: number) {
    const total = 3;
    const alive = Math.max(0, Math.min(total, n | 0));
    let html = "";
    for (let i = 0; i < total; i++) {
      const col = i < alive ? COL_CYAN : COL_DIM;
      const glow = i < alive ? "text-shadow:0 0 6px rgba(0,255,238,0.6);" : "";
      html += `<span style="color:${col};${glow}">▶</span>`;
    }
    refs.lives.innerHTML = html;
  }

  // W2 cooldown fill color by charge; rainbow while firing.
  function renderCooldown(active: boolean, c01: number) {
    const pct = Math.max(0, Math.min(1, c01)) * 100;
    refs.cdFill.style.width = `${pct}%`;
    if (active) {
      refs.cdFill.style.background =
        "linear-gradient(90deg,#ff0040,#ffaa00,#00ffee,#3366ff,#ff00ff,#ff0040)";
      refs.cdFill.style.backgroundSize = "200% 100%";
      refs.cdFill.style.animation = "hudRainbow 0.8s linear infinite";
    } else {
      refs.cdFill.style.animation = "none";
      refs.cdFill.style.backgroundSize = "100% 100%";
      const col = c01 >= 0.6 ? COL_CYAN : c01 >= 0.2 ? "#ffaa00" : "#ff2266";
      refs.cdFill.style.background = col;
    }
  }

  return {
    // called from main with gfx.getPresentRect() (CSS px)
    setRect: (x: number, y: number, w: number, h: number) => {
      refs.layer.style.left = `${x}px`;
      refs.layer.style.top = `${y}px`;
      refs.layer.style.width = `${w}px`;
      refs.layer.style.height = `${h}px`;
    },

    setPaused: (on: boolean) => {
      refs.pause.style.display = on ? "block" : "none";
    },

    setMode: (m: HudMode) => {
      mode = m;
      applyMode();
    },

    update: (p: PlayerLike, s: SessionLike, waveText?: string) => {
      const e = (p.energy ?? 0) | 0;
      const em = (p.energyMax ?? 5) | 0;

      renderLives((s.lives ?? 0) | 0);

      refs.wave.textContent = `WAVE ${waveText ?? pad((s.wave ?? 0) | 0, 2)}`;
      refs.score.innerHTML =
        `<span style="font-family:${LABEL_FONT};font-size:11px;letter-spacing:1px;color:${COL_LABEL}">SCORE</span> ` +
        `<span style="font-family:${NUM_FONT};color:#ffffff">${pad((s.score ?? 0) | 0, 6)}</span>`;
      refs.energy.innerHTML = energyMarkup(e, em);

      // weapon icons (animated)
      iconPhase += 0.15;
      const activeW = p.weapon ?? "W1";
      const ctx1 = refs.w1.getContext("2d");
      const ctx2 = refs.w2.getContext("2d");
      if (ctx1) drawW1(ctx1, 28, 14, activeW === "W1");
      if (ctx2) drawW2(ctx2, 28, 14, activeW === "W2", iconPhase);

      // bomb count
      const b = Math.max(0, (p.bombs ?? 0) | 0);
      refs.bomb.innerHTML =
        `◆<span style="font-family:${NUM_FONT};">×${b}</span>`;

      // W2 cooldown bar
      const w2s = p.w2 ?? {};
      renderCooldown(!!w2s.active, Number(w2s.charge01 ?? 1));

      // auto-switch to GAME_OVER if session says so
      if (s.gameOver) {
        if (mode !== "GAME_OVER") { mode = "GAME_OVER"; applyMode(); }
      } else if (mode === "GAME_OVER") {
        mode = "PLAY";
        applyMode();
      }
    },
  };
}
