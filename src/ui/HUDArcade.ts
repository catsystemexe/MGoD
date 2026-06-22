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

// --- Palette --------------------------------------------------------------
const COL_CYAN = "#00ffee";

function mkChild(parent: HTMLElement, id: string, css: string): HTMLDivElement {
  const d = document.createElement("div");
  d.id = id;
  d.style.cssText = css;
  parent.appendChild(d);
  return d;
}

// --- Weapon icons ---------------------------------------------------------
// PNG loader with cache; returns null until the image has loaded (callers fall
// back to canvas drawing on the first frame, then use the PNG once cached).
const _iconCache: Record<string, HTMLImageElement> = {};
const _iconTried: Record<string, boolean> = {};

function loadWeaponIcon(name: string): HTMLImageElement | null {
  if (_iconCache[name]) return _iconCache[name];
  // Only kick off one request per name (avoids per-frame spam on missing PNGs).
  if (_iconTried[name]) return null;
  _iconTried[name] = true;
  const img = new Image();
  img.src = `/ui/${name}`;
  img.onload = () => { _iconCache[name] = img; };
  return null; // první frame = canvas fallback, pak PNG
}

function drawW1(ctx: CanvasRenderingContext2D, w: number, h: number, active: boolean): void {
  ctx.clearRect(0, 0, w, h);
  const png = loadWeaponIcon("icon-w1.png");
  if (png && png.complete) {
    ctx.globalAlpha = active ? 1.0 : 0.35;
    ctx.drawImage(png, 1, 1, w - 2, h - 2);
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
  const png = loadWeaponIcon("icon-w2.png");
  if (png && png.complete) {
    ctx.globalAlpha = active ? 1.0 : 0.35;
    ctx.drawImage(png, 1, 1, w - 2, h - 2);
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

  // ---- HUD blocks container (toggled by mode) ----
  // Each block = a PNG frame (defines the box) with dynamic content overlaid
  // absolutely inside it. Pixel offsets below are estimates, tuned to the art.
  const panel = mkChild(layer, "hudPanel", "position:absolute;inset:0;z-index:3;");

  // A PNG-framed container: the <img> sets the size (height fixed, width auto
  // from the PNG's intrinsic ratio); overlays position against this box.
  function mkFrame(parent: HTMLElement, id: string, src: string, heightPx: number): HTMLDivElement {
    const frame = mkChild(parent, id, "position:relative;display:inline-block;line-height:0;");
    const img = document.createElement("img");
    img.src = src;
    img.style.cssText =
      `height:${heightPx}px;width:auto;display:block;filter:drop-shadow(0 0 4px ${COL_CYAN});`;
    img.onerror = () => { img.style.display = "none"; };
    frame.appendChild(img);
    return frame;
  }

  // ===== ENERGY block (top-left) =====
  const energyBlock = mkChild(panel, "hudEnergyBlock", "position:absolute;left:10px;top:8px;");
  const energyFrame = mkFrame(energyBlock, "hudEnergyFrame", "/ui/energy_icon.png", 132);
  const energy = mkChild(
    energyFrame,
    "hudEnergy",
    "position:absolute;left:18px;bottom:38px;display:flex;gap:4px;line-height:normal;",
  );
  // lives below the energy frame (outside the box)
  const lives = mkChild(
    energyBlock,
    "hudLives",
    "display:flex;gap:4px;margin-top:2px;margin-left:18px;",
  );

  // ===== SCORE block (top-right) =====
  const scoreBlock = mkChild(panel, "hudScoreBlock", "position:absolute;right:20px;top:8px;");
  const scoreFrame = mkFrame(scoreBlock, "hudScoreFrame", "/ui/score_icon.png", 132);
  const score = mkChild(
    scoreFrame,
    "hudScore",
    "position:absolute;right:24px;bottom:32px;line-height:normal;" +
      "font-family:'Share Tech Mono',monospace;font-size:32px;letter-spacing:4px;" +
      `color:#ffffff;text-shadow:0 0 8px ${COL_CYAN};`,
  );

  // ===== WAVE block (top-center) =====
  const waveBlock = mkChild(
    panel,
    "hudWaveBlock",
    "position:absolute;left:50%;top:8px;transform:translateX(-50%);",
  );
  const waveFrame = mkFrame(waveBlock, "hudWaveFrame", "/ui/wave_icon.png", 68);
  const wave = mkChild(
    waveFrame,
    "hudWave",
    "position:absolute;right:28px;top:50%;transform:translateY(-50%);line-height:normal;" +
      `font-family:${LABEL_FONT};font-size:22px;font-weight:700;` +
      `color:#ffffff;text-shadow:0 0 6px ${COL_CYAN};`,
  );

  // ===== WEAPON block (bottom-left) =====
  const weaponBlock = mkChild(panel, "hudWeaponBlock", "position:absolute;left:10px;bottom:10px;");
  const weaponFrame = mkFrame(weaponBlock, "hudWeaponFrame", "/ui/w_icon_box.png", 198);

  // W1/W2 icon canvases positioned to the right of the PNG's W1/W2 labels
  function mkIconCanvas(id: string, leftPx: number, topPx: number): HTMLCanvasElement {
    const wrap = mkChild(
      weaponFrame,
      id + "Wrap",
      `position:absolute;left:${leftPx}px;top:${topPx}px;line-height:0;`,
    );
    const c = document.createElement("canvas");
    c.id = id;
    // 2× backing store for crisp lines; CSS size is 1×.
    c.width = 56;
    c.height = 28;
    c.style.cssText = "width:28px;height:14px;display:block;";
    wrap.appendChild(c);
    const ctx = c.getContext("2d");
    if (ctx) ctx.scale(2, 2);
    return c;
  }
  const w1 = mkIconCanvas("hudW1", 90, 55);
  const w2 = mkIconCanvas("hudW2", 90, 100);

  // W2 cooldown bar — overlays the "W2" label inside the PNG frame
  const cdTrack = mkChild(
    weaponFrame,
    "hudCdTrack",
    "position:absolute;left:28px;top:108px;width:48px;height:6px;" +
      "background:rgba(255,255,255,0.12);border-radius:2px;overflow:hidden;",
  );
  const cdFill = mkChild(
    cdTrack,
    "hudCdFill",
    `height:100%;width:0%;background:${COL_CYAN};box-shadow:0 0 6px ${COL_CYAN};transition:width 0.1s linear;`,
  );

  // bomb row inside the weapon frame
  const bomb = mkChild(
    weaponFrame,
    "hudBomb",
    "position:absolute;left:90px;top:145px;display:flex;align-items:center;gap:6px;line-height:normal;",
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

  // lives as ship PNG icons; bright+glow = alive, dimmed/grayscale = lost. Max 3.
  function renderLives(n: number) {
    const shipSrc = "/ui/ship_icon.png";
    const lifeCount = Math.max(0, Math.min(3, n | 0));
    let livesHtml = "";
    for (let i = 0; i < 3; i++) {
      const alive = i < lifeCount;
      livesHtml += `<img src="${shipSrc}" onerror="this.style.display='none'"
        style="height:32px;width:auto;display:block;
        filter:${alive
          ? "brightness(1) drop-shadow(0 0 4px #00ffee)"
          : "brightness(0.2) grayscale(1)"};">`;
    }
    refs.lives.innerHTML = livesHtml;
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
      renderLives((s.lives ?? 0) | 0);

      // wave / score numbers drawn into their pre-styled overlay divs
      refs.wave.textContent = waveText ?? String((s.wave ?? 0) | 0).padStart(2, "0");
      refs.score.textContent = String(Math.floor(s.score ?? 0)).padStart(6, "0");

      // energy: segmented bar overlaid inside the frame
      const energyVal = p.energy ?? 0;
      const energyMax = p.energyMax ?? 5;
      const energyRatio = energyMax > 0 ? energyVal / energyMax : 0;
      const totalSegs = 6;
      const filledSegs = Math.round(energyRatio * totalSegs);
      let segsHtml = "";
      for (let i = 0; i < totalSegs; i++) {
        const filled = i < filledSegs;
        segsHtml +=
          `<div style="width:24px;height:18px;` +
          `background:${filled ? "#00ffee" : "rgba(0,255,238,0.12)"};` +
          `border:1px solid rgba(0,255,238,0.4);` +
          `box-shadow:${filled ? "0 0 6px #00ffee" : "none"};"></div>`;
      }
      refs.energy.innerHTML = segsHtml;

      // weapon icons (animated)
      iconPhase += 0.15;
      const activeW = p.weapon ?? "W1";
      const ctx1 = refs.w1.getContext("2d");
      const ctx2 = refs.w2.getContext("2d");
      if (ctx1) drawW1(ctx1, 28, 14, activeW === "W1");
      if (ctx2) drawW2(ctx2, 28, 14, activeW === "W2", iconPhase);

      // bomb: PNG icon + count (icon degrades to count-only if PNG missing)
      const b = Math.max(0, (p.bombs ?? 0) | 0);
      refs.bomb.innerHTML =
        `<img src="/ui/icon-bomb.png" onerror="this.style.display='none'"
          style="height:24px;width:auto;display:block;filter:drop-shadow(0 0 3px #ff6600);` +
        `opacity:${b > 0 ? 1 : 0.25};">` +
        `<span style="font-family:'Share Tech Mono',monospace;font-size:14px;color:#ff6600;` +
        `text-shadow:0 0 6px #ff6600;">×${b}</span>`;

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
