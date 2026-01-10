// src/main.ts
import { WebGLSceneRenderer } from "./render/webgl/WebGLSceneRenderer";
export {};

console.log("[BOOT] main.ts running");

document.body.style.userSelect = "none";
(document.body.style as any).webkitUserSelect = "none";
(document.body.style as any).webkitTouchCallout = "none";
document.body.style.margin = "0";
document.body.style.background = "black";
document.body.style.height = "100vh";
document.body.style.display = "grid";
document.body.style.placeItems = "center";

declare global {
  interface Window {
    __CM?: any;
  }
}
window.__CM = window.__CM || {};



(window as any).__CM.topLog = (window as any).__CM.topLog ?? "";
(window as any).__CM.topLog = (window as any).__CM.topLog ?? "";
const root = document.createElement("div");
root.id = "root";
root.style.position = "relative";
root.style.display = "inline-block";
document.body.appendChild(root);

// --- HUD: top debug (small font)
const hudTop = document.createElement("div");
hudTop.id = "hudTop";
hudTop.style.cssText =
  "color:white;font:12px monospace;padding:6px;position:fixed;left:0;top:0;z-index:9999;white-space:pre;opacity:0.9";
hudTop.textContent = "BOOT OK";
document.body.appendChild(hudTop);

// --- HUD: centered PAUSE (overlay over canvas)
const hudPause = document.createElement("div");
hudPause.id = "hudPause";
hudPause.style.cssText =
  "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);" +
  "color:white;font:32px monospace;z-index:10000;pointer-events:none;" +
  "text-shadow:0 2px 0 rgba(0,0,0,0.7);display:none";
hudPause.textContent = "PAUSED";
root.appendChild(hudPause);

window.addEventListener("error", (e) => {
  console.error("[BOOT] window.error", (e as any).error || (e as any).message);
  hudTop.textContent = "BOOT ERROR: " + String((e as any).error || (e as any).message);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[BOOT] unhandledrejection", (e as any).reason);
  hudTop.textContent = "BOOT ERROR: " + String((e as any).reason);
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

  const loop = game.loop;
  const store = game.store;

  window.__CM.loop = loop;
  window.__CM.store = store;
  window.__CM.game = game;
  window.__CM.director = (game as any).director;

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

  // ---- DevUI (start OFF)
  const { DevUI } = await import("./ui/DevUI");
  (window as any).__CM.devui = new DevUI(() => window.__CM?.dev ?? null);
  try {
    (window as any).__CM.devui?.setVisible?.(false);
  } catch (_e) {
    // if DevUI doesn't expose setVisible, it should still be toggleable by its own key handler
  }

  // ---- Pause key (P) -> centered overlay
  window.addEventListener("keydown", (e) => {
    if (e.code !== "KeyP") return;
    if (e.repeat) return;
    e.preventDefault();

    loop.togglePause();

    const paused = !!(loop as any).isPaused?.();
    hudPause.style.display = paused ? "block" : "none";
    console.log("[PAUSE]", paused ? "PAUSED" : "RUN", "tick=", loop.getTick?.());
  });

  const renderer = new WebGLSceneRenderer(gl, store as any, LOGIC_W, LOGIC_H);

  function resize() {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    gfx.resize(cssW, cssH, dpr);

    // keep present rect for input (CSS px)
    const pr = (gfx as any).getPresentRect?.();
    if (pr && game?.inputMgr?.setPresentRect) {
      game.inputMgr.setPresentRect(pr.x / dpr, pr.y / dpr, pr.w / dpr, pr.h / dpr);
    }
  }

  window.addEventListener("resize", resize);
  resize();

  let last = performance.now();

  function frame(now: number) {
    try {
      const dt = (now - last) / 1000;
      last = now;

      const dpr = Math.max(1, window.devicePixelRatio || 1);

      // keep present rect for input during runtime too
      const pr = (gfx as any).getPresentRect?.();
      if (pr && game?.inputMgr?.setPresentRect) {
        game.inputMgr.setPresentRect(pr.x / dpr, pr.y / dpr, pr.w / dpr, pr.h / dpr);
      }

      // per-frame aim (optional; keeps "instant aim" feel)
      if (game?.inputMgr?.getAimTargetNow && game?.playerEnt?.aimDir) {
        const t = game.inputMgr.getAimTargetNow(LOGIC_W, LOGIC_H);
        const dx = t.x - game.playerEnt.pos.x;
        const dy = t.y - game.playerEnt.pos.y;
        const len = Math.hypot(dx, dy) || 1;

        game.playerEnt.aimDir.x = dx / len;
        game.playerEnt.aimDir.y = dy / len;

        // keep snapshot consistent if it exists
        if (game?.inputRt?.actions?.aimTarget) {
          game.inputRt.actions.aimTarget.x = t.x;
          game.inputRt.actions.aimTarget.y = t.y;
        }
      }

      loop.step(dt);

      // ---- DEBUG COUNTS (top-left, small font)
      let nEnemy = 0, nProj = 0, nBomb = 0, nPlayer = 0;
      store.debugForEachAlive((_r: any, e: any) => {
        if (!e || !e.kind) return;
        if (e.kind === "enemy") nEnemy++;
        else if (e.kind === "projectile") nProj++;
        else if (e.kind === "bomb") nBomb++;
        else if (e.kind === "player") nPlayer++;
      });

      hudTop.textContent =
        `tick=${loop.getTick?.() ?? "?"} dt=${dt.toFixed(3)} ` +
        `alive=${store.getAliveCount?.() ?? "?"} ` +
        `P=${nPlayer} E=${nEnemy} PR=${nProj} B=${nBomb}`;

      // render: SceneRT -> present
      gfx.renderScene(() => renderer.render());
      gfx.present();
    } catch (err) {
      console.error("[BOOT] frame() crashed", err);
      console.error("[BOOT] frame() crashed typeof=", typeof err, "value=", err);
      console.error("[BOOT] frame() crashed stack=", (err as any)?.stack);
      hudTop.textContent = "FRAME CRASH: " + String((err as any)?.message || err);
    } finally {
      requestAnimationFrame(frame);
    }
  }

  window.addEventListener("error", (e) => {
    console.error("[window.error]", e.message, e.error, (e.error as any)?.stack);
  });

  window.addEventListener("unhandledrejection", (e) => {
    console.error("[unhandledrejection]", e.reason, (e.reason as any)?.stack);
  });

  // kick off RAF (only once; next frames scheduled in finally)
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error("[BOOT] main() failed", err);
  hudTop.textContent = "BOOT ERROR (main): " + String((err as any)?.stack || err);
});