// src/main.ts
const bootN = ((window as any).__BOOT_N__ = (((window as any).__BOOT_N__ ?? 0) + 1));
// --- KILL PREVIOUS RAF LOOP (HMR / reboot safe) ---
(window as any).__CM = (window as any).__CM || {};
if ((window as any).__CM.__rafId) {
  cancelAnimationFrame((window as any).__CM.__rafId);
  (window as any).__CM.__rafId = 0;
}
(window as any).__CM.__running = false;

(document.title = `CM boot#${bootN}`);


import { VFXSystem } from "./game/vfx/VFXSystem";

import { WebGLSceneRenderer } from "./render/webgl/WebGLSceneRenderer";
export {};

console.log("[BOOT] main.ts running");

document.body.style.userSelect = "none";
(document.body.style as any).webkitUserSelect = "none";
(document.body.style as any).webkitTouchCallout = "none";
document.body.style.margin = "0";
document.body.style.background = "#6C5EB5"; // C64 blue
document.body.style.height = "100vh";
  document.body.style.overflow = "hidden";
  document.documentElement.style.overflow = "hidden";
  document.body.style.touchAction = "none";
document.body.style.display = "block";
document.body.style.overflow = "hidden";

const DEV = Boolean((globalThis as any).__DEV__);

let hudTop: HTMLDivElement | null = null;
function setHudTop(text: string) {
  if (hudTop) hudTop.textContent = text;
}
// expose for systems (iPad has no console)
(window as any).__CM = (window as any).__CM || {};
(window as any).__CM.setTop = (msg: string) => setHudTop(msg);

// small ring buffer if you want multiline
(window as any).__CM.topLines = (window as any).__CM.topLines || [];
(window as any).__CM.topLog = (msg: string) => {
  const arr: string[] = (window as any).__CM.topLines;
  arr.push(msg);
  while (arr.length > 6) arr.shift();
  setHudTop(arr.join("\n"));
};


// DEBUG TOP BAR: vytvoř vždy (dokud nevyřešíme wiring)
// v prod to pak můžeš zase zavřít za DEV flag.
hudTop = document.createElement("div");
hudTop.id = "hudTop";
hudTop.style.cssText =
  "color:white;font:12px monospace;padding:6px;position:fixed;left:0;top:0;" +
  "z-index:9999;white-space:pre-wrap;opacity:0.9;pointer-events:none;" +
  "max-width:100vw;box-sizing:border-box;word-break:break-word;overflow-wrap:anywhere;";

document.body.appendChild(hudTop);
setHudTop("BOOT OK");

declare global {
  interface Window {
    __CM?: any;
  }
}
window.__CM = window.__CM || {};
// keep existing function (do not overwrite)


// root container (canvas + overlays)
const root = document.createElement("div");
root.id = "root";
root.style.position = "fixed";
root.style.left = "0";
root.style.top = "0";
root.style.width = "100vw";
root.style.height = "100vh";
root.style.overflow = "hidden";
document.body.appendChild(root);

window.addEventListener("error", (e) => {
  const msg = String((e as any).error || (e as any).message || (e as any).message);
  console.error("[BOOT] window.error", msg);
  setHudTop("BOOT ERROR: " + msg);
});

window.addEventListener("unhandledrejection", (e) => {
  const msg = String((e as any).reason ?? e);
  console.error("[BOOT] unhandledrejection", msg);
  setHudTop("BOOT ERROR: " + msg);
});

function ensureWebGLCanvas(): HTMLCanvasElement {
  let c = document.querySelector("canvas#game") as HTMLCanvasElement | null;
  if (!c) {
    c = document.createElement("canvas");
    c.id = "game";
    c.style.display = "block";
    c.style.background = "black";
    c.style.imageRendering = "pixelated";
    root.appendChild(c);
  }
  return c;
}

async function main() {
  const canvas = ensureWebGLCanvas();

  const { Graphics } = await import("./graphics/Graphics");
  const gfx = new Graphics(canvas, "classic_400x224");
  const gl = gfx.getGL();

  const LOGIC_W = 400;
  const LOGIC_H = 224;

  const { createGame } = await import("./game/boot/createGame");
  const game = await createGame(() => canvas, LOGIC_W, LOGIC_H);
  console.log("[BOOT] createGame() ->", game);

  if (!game || !game.loop || !game.store) {
    throw new Error("createGame() must return { loop, store, ... }");
  }

  const { createHUDArcade } = await import("./ui/HUDArcade");
  const hud = createHUDArcade(root);

  const loop = game.loop;
  const store = game.store;
  const session = game.session;

  window.__CM.loop = loop;
  window.__CM.store = store;
  window.__CM.game = game;
  

  // ---- Dev API bridge
  window.__CM.dev = {
    waves: () => window.__CM.director?.getWaveStates?.(),
    solo: (id: string) => window.__CM.director?.soloWave?.(id),
    enableAll: () => window.__CM.director?.enableAll?.(),
    enable: (id: string, on: boolean) => window.__CM.director?.setWaveEnabled?.(id, on),
    trigger: (id: string) => window.__CM.director?.triggerWave?.(id),
    stop: (id: string) => window.__CM.director?.stopWave?.(id),
    diff: (m: number) => window.__CM.director?.setDifficulty?.(m),
  };

  // DevUI disabled (we use minimal DevHotkeys overlay instead)
  // (window as any).__CM.devui = new DevUI(() => window.__CM?.dev ?? null);

  // --- HUD mode mirror (so we can gate pointer/touch)
  type HudMode = "PLAY" | "TITLE" | "GAME_OVER";
  let hudMode: HudMode = "PLAY";

  function setHudMode(m: HudMode) {
    hudMode = m;
    hud.setMode?.(m);
  }

  function startPlay() {
    setHudMode("PLAY");
    hud.setPaused?.(false);     // ✅ vždy shodit PAUSED overlay
    loop.setPaused?.(false);
  }

  // --- TITLE at boot
  //setHudMode("TITLE");
  //hud.setPaused?.(false);
  //loop.setPaused?.(false);

  // ---- Keys: Pause (P), Start (Enter/Space), GameOver (Y/N)
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;

    // Start from TITLE
    if (e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space") {
      // Start only from TITLE
      if (hudMode === "TITLE") startPlay();
      return;
    }

    // Pause toggle (P)
    if (e.code === "KeyP") {
      e.preventDefault();
      loop.togglePause();
      const paused = !!(loop as any).isPaused?.();
      hud.setPaused?.(paused);
      console.log("[PAUSE]", paused ? "PAUSED" : "RUN", "tick=", loop.getTick?.());
      return;
    }

    // Game over keys (Y/N)
    if (!session?.gameOver) return;

    if (e.code === "KeyY") {
      e.preventDefault();
      (game as any).reset?.(); // hard reset run (no reload)
      startPlay();
      return;
    }

    if (e.code === "KeyN") {
      e.preventDefault();
      setHudMode("PLAY");
      hud.setPaused?.(false);
      loop.setPaused?.(false);
    
      return;
    }
  });

  // iPad/touch: start also by tapping/clicking anywhere (register ONCE)
  window.addEventListener(
    "pointerdown",
    () => {
      // ✅ touch/click starts game ONLY from TITLE
      if (hudMode === "TITLE") startPlay();
    },
    { passive: true },
  );

  const renderer = new WebGLSceneRenderer(gl, store as any, LOGIC_W, LOGIC_H);

  function resize() {
    const vv = (window as any).visualViewport as VisualViewport | undefined;
    const cssW = vv?.width ?? window.innerWidth;
    const cssH = vv?.height ?? window.innerHeight;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    gfx.resize(cssW, cssH, dpr);

    const pr = (gfx as any).getPresentRect?.();
    if (pr) {
      const x = pr.x / dpr,
        y = pr.y / dpr,
        w = pr.w / dpr,
        h = pr.h / dpr;

      game?.inputMgr?.setPresentRect?.(x, y, w, h);
      hud.setRect?.(x, y, w, h);
    }
  }

  let resizeQueued = false;
  function requestResize() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      resize();
    });
  }

  window.addEventListener("resize", requestResize);
  window.addEventListener("orientationchange", requestResize);

  const vv = (window as any).visualViewport as VisualViewport | undefined;
  vv?.addEventListener?.("resize", requestResize);

  requestResize();

  let last = performance.now();

  // --- top debug overlay (default OFF; throttled) ---
  const TOP_DEBUG_ENABLED = true; // zapni jen když ladíš
  const TOP_DEBUG_EVERY_N_FRAMES = 15; // ~4×/s při 60fps
  let topDbgFrame = 0;
  
  function frame(now: number) {
    try {
      const dt = (now - last) / 1000;
      last = now;

      // advance simulation (THIS WAS MISSING)
      loop.step(dt);

      

        // cosmetic VFX (per-frame, not in fixed tick)
        (game as any).vfx?.update?.(dt);
// per-frame aim (cosmetic; gameplay aim je i tak ze sampled actions v ticku)
      if (game?.inputMgr?.getAimTargetNow && game?.playerEnt?.aimDir) {
        const t = game.inputMgr.getAimTargetNow(LOGIC_W, LOGIC_H);
        const dx = t.x - game.playerEnt.pos.x;
        const dy = t.y - game.playerEnt.pos.y;
        const len = Math.hypot(dx, dy) || 1;

        game.playerEnt.aimDir.x = dx / len;
        game.playerEnt.aimDir.y = dy / len;

        if (game?.inputRt?.actions?.aimTarget) {
          game.inputRt.actions.aimTarget.x = t.x;
          game.inputRt.actions.aimTarget.y = t.y;
        }
      }

      // top debug (tick + counts + present rect) – throttled
      if (TOP_DEBUG_ENABLED) {
        topDbgFrame++;
        if (topDbgFrame % TOP_DEBUG_EVERY_N_FRAMES === 0) {
          let nEnemy = 0,
            nProj = 0,
            nBomb = 0,
            nPlayer = 0;

          store.debugForEachAlive((_r: any, e: any) => {
            if (!e || !e.kind) return;
            if (e.kind === "enemy") nEnemy++;
            else if (e.kind === "projectile") nProj++;
            else if (e.kind === "bomb") nBomb++;
            else if (e.kind === "player") nPlayer++;
          });

          const dpr = Math.max(1, window.devicePixelRatio || 1);
          const pr = (gfx as any).getPresentRect?.();
          const prLine = pr
            ? `PR phys=(${pr.x},${pr.y},${pr.w},${pr.h}) scale=${pr.scale} | PR css=(${(pr.x / dpr).toFixed(
                1,
              )},${(pr.y / dpr).toFixed(1)},${(pr.w / dpr).toFixed(1)},${(pr.h / dpr).toFixed(1)})`
            : `PR ?`;

          setHudTop(
            `tick=${loop.getTick?.() ?? "?"} paused=${(loop as any).isPaused?.() ?? "?"} dt=${dt.toFixed(3)}\n` +
              `alive=${store.getAliveCount?.() ?? "?"} P=${nPlayer} E=${nEnemy} PRJ=${nProj} B=${nBomb}\n` +
              `css=(${window.innerWidth}x${window.innerHeight}) dpr=${dpr}\n` +
              prLine,
          );
        }
      }

      // HUD values (corners) – needs explicit update each frame
      try {
        hud.update?.(
          (game as any).playerEnt ?? {},
          session ?? {},
          undefined, // waveText optional
        );
      } catch (e) {
        // ignore HUD errors
      }

      const a = loop.getAlpha?.() ?? 1;

      // Render everything into scene RT (single pass, known-good)
      gfx.renderScene(() => {
        renderer.render(a);
        (renderer as any).renderVFX?.((game as any).vfx);
      });

      gfx.present();

} catch (err) {
      console.error("[BOOT] frame() crashed", err);
      console.error("[BOOT] frame() crashed stack=", (err as any)?.stack);
      setHudTop("FRAME CRASH: " + String((err as any)?.message || err));
    } finally {
      if ((window as any).__CM.__running !== false) {
        (window as any).__CM.__rafId = requestAnimationFrame(frame);
      }
    }
  }

  
  (window as any).__CM.__running = true;
  (window as any).__CM.__rafId = requestAnimationFrame(frame);
  }
main().catch((err) => {
  console.error("[BOOT] main() failed", err);
  setHudTop("BOOT ERROR (main): " + String((err as any)?.stack || err));
});
