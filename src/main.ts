// src/main.ts
const bootN = ((window as any).__BOOT_N__ = (((window as any).__BOOT_N__ ?? 0) + 1));
(document.title = `CM boot#${bootN}`);

import { WebGLSceneRenderer } from "./render/webgl/WebGLSceneRenderer";
export {};

console.log("[BOOT] main.ts running");

document.body.style.userSelect = "none";
(document.body.style as any).webkitUserSelect = "none";
(document.body.style as any).webkitTouchCallout = "none";
document.body.style.margin = "0";
document.body.style.background = "#6C5EB5"; // C64 blue
document.body.style.height = "100vh";
document.body.style.display = "block";
document.body.style.overflow = "hidden";

const DEV = Boolean((globalThis as any).__DEV__);

let hudTop: HTMLDivElement | null = null;
function setHudTop(text: string) {
  if (hudTop) hudTop.textContent = text;
}

if (DEV) {
  hudTop = document.createElement("div");
  hudTop.id = "hudTop";
  hudTop.style.cssText =
  "color:white;font:12px monospace;padding:6px;position:fixed;left:0;top:0;" +
  "z-index:9999;white-space:pre;opacity:0.9;pointer-events:none";
  document.body.appendChild(hudTop);
  setHudTop("BOOT OK");
}

declare global {
  interface Window {
    __CM?: any;
  }
}
window.__CM = window.__CM || {};
(window as any).__CM.topLog = (window as any).__CM.topLog ?? "";

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
    // ignore
  }

  // --- TITLE at boot
  hud.setMode?.("TITLE");
  loop.setPaused?.(true);

  // ---- Keys: Pause (P), Start (Enter), GameOver (Y/N)
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;

    // Start from TITLE
    if (e.code === "Enter") {
      e.preventDefault();
      hud.setMode?.("PLAY");
      loop.setPaused?.(false);
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
      (game as any).reset?.();      // hard reset run (no reload)
      hud.setMode?.("PLAY");
      loop.setPaused?.(false);
      return;
    }

    if (e.code === "KeyN") {
      e.preventDefault();
      // simplest: back to TITLE, paused
      hud.setMode?.("TITLE");
      loop.setPaused?.(true);
      return;
    }
  });

  const renderer = new WebGLSceneRenderer(gl, store as any, LOGIC_W, LOGIC_H);

  function resize() {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    gfx.resize(cssW, cssH, dpr);

    const pr = (gfx as any).getPresentRect?.();
    if (pr) {
      const x = pr.x / dpr, y = pr.y / dpr, w = pr.w / dpr, h = pr.h / dpr;

      game?.inputMgr?.setPresentRect?.(x, y, w, h);
      hud.setRect?.(x, y, w, h);
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

      const pr = (gfx as any).getPresentRect?.();
      if (pr) {
        const x = pr.x / dpr, y = pr.y / dpr, w = pr.w / dpr, h = pr.h / dpr;
        game?.inputMgr?.setPresentRect?.(x, y, w, h);
        hud.setRect?.(x, y, w, h);
      }

      // per-frame aim
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

      loop.step(dt); 
      const cur = window.__CM?.director?.getHUDInfo?.()?.current;
      let waveText = "-";

      if (cur != null) {
        const s = String(cur);
        const m = s.match(/\d+/);           // první číslo ve stringu
        waveText = m ? m[0] : s;            // když není číslo, ukaž aspoň raw
      } else if ((game as any)?.session?.wave != null) {
        waveText = String((game as any).session.wave);
      }

      hud.update(game.playerEnt ?? {}, game.session ?? {}, waveText);

      if (DEV) {
        let nEnemy = 0, nProj = 0, nBomb = 0, nPlayer = 0;

        store.debugForEachAlive((_r: any, e: any) => {
          if (!e || !e.kind) return;
          if (e.kind === "enemy") nEnemy++;
          else if (e.kind === "projectile") nProj++;
          else if (e.kind === "bomb") nBomb++;
          else if (e.kind === "player") nPlayer++;
        });

        setHudTop(
          `tick=${loop.getTick?.() ?? "?"} dt=${dt.toFixed(3)} ` +
          `alive=${store.getAliveCount?.() ?? "?"} ` +
          `P=${nPlayer} E=${nEnemy} PR=${nProj} B=${nBomb}`,
        );
      }

      gfx.renderScene(() => renderer.render());
      gfx.present();
    } catch (err) {
      console.error("[BOOT] frame() crashed", err);
      console.error("[BOOT] frame() crashed stack=", (err as any)?.stack);
      setHudTop("FRAME CRASH: " + String((err as any)?.message || err));
    } finally {
      requestAnimationFrame(frame);
    }
  }

  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error("[BOOT] main() failed", err);
  setHudTop("BOOT ERROR (main): " + String((err as any)?.stack || err));
});
