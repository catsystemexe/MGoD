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

// force-hide cursor over game canvas (some wrappers override inline style)
const cursorStyle = document.createElement("style");
cursorStyle.textContent = `
  html, body, #root, canvas#game { cursor: none !important; }
  #root * { cursor: none !important; }
`;
document.head.appendChild(cursorStyle);


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
    c.style.cursor = "none";

    (document.body.style as any).cursor = "none";
    (root.style as any).cursor = "none";
    
    (c as any).tabIndex = 0;
    (c.style as any).outline = "none";

    // focus canvas so arrows/WASD go to the game (Replit preview otherwise steals keys)
    c.addEventListener(
      "pointerdown",
      (e) => {
        try { (e as any).preventDefault?.(); } catch {}
        try { (c as any).focus?.(); } catch {}
      },
      { passive: false },
    );
  }
  return c;
}

async function main() {
  const canvas = ensureWebGLCanvas();

  const { Graphics } = await import("./graphics/Graphics");
  const gfx = new Graphics(canvas, "classic_896x504");
  const gl = gfx.getGL();

  const LOGIC_W = 896;
  const LOGIC_H = 504;

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

  // ---- Display Reality Layer (post-process) toggle — default ON.
  // Works without DevUI (showcase mode): hotkey F or window.__CM.fx.* in console.
  (globalThis as any).__CM_FX__ ??= true;
  window.__CM.fx = {
    on: () => { (globalThis as any).__CM_FX__ = true; console.log("[FX] ON"); },
    off: () => { (globalThis as any).__CM_FX__ = false; console.log("[FX] OFF"); },
    toggle: () => {
      (globalThis as any).__CM_FX__ = !(globalThis as any).__CM_FX__;
      console.log("[FX]", (globalThis as any).__CM_FX__ ? "ON" : "OFF");
    },
    isOn: () => !!(globalThis as any).__CM_FX__,
  };

  // ---- Audio Reality Layer (synth-only) — armed on first user gesture.
  // Tone.start() must follow a gesture (autoplay policy); guard with a flag so
  // we never re-resume. iPad has no keyboard -> pointerdown is the real path.
  let audioArmed = false;
  const armAudio = async () => {
    if (audioArmed) return;
    audioArmed = true;
    try { await (game as any).audio?.resume(); } catch (e) { console.warn("[AUDIO] resume failed", e); }
  };

  let audioEnabled = true;
  window.__CM.audio = {
    on: () => { audioEnabled = true; (game as any).audio?.setEnabled(true); console.log("[AUDIO] ON"); },
    off: () => { audioEnabled = false; (game as any).audio?.setEnabled(false); console.log("[AUDIO] OFF"); },
    freqs: () => (game as any).audio?.getFreqs(),
  };

  // DevUI disabled (we use minimal DevHotkeys overlay instead)

  // ---- BG Lab UI (F7 toggle) ----
  try {
    const mod = await import("./ui/BgLabUI");
    (globalThis as any).__CM_BG_LAB_UI__ = new mod.BgLabUI();
  } catch (e) {
    console.warn("[BG_LAB] init failed", e);
  }

  // ---- Grid Lab UI (G toggle) ----
  try {
    const mod = await import("./ui/GridLabUI");
    (globalThis as any).__CM_GRID_UI__ = new mod.GridLabUI();
  } catch (e) {
    console.warn("[GRID_LAB] init failed", e);
  }

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

    // First keypress arms the Web Audio context (autoplay policy).
    void armAudio();

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

    // BG preset hotswap ([ / ])
    if (e.key === "[" || e.code === "BracketLeft") {
      (globalThis as any).__CM_BG_PRESET__ = ((globalThis as any).__CM_BG_PRESET__ ?? 0) - 1;
      console.log("[BG] preset", (globalThis as any).__CM_BG_PRESET__);
      return;
    }
    if (e.key === "]" || e.code === "BracketRight") {
      (globalThis as any).__CM_BG_PRESET__ = ((globalThis as any).__CM_BG_PRESET__ ?? 0) + 1;
      console.log("[BG] preset", (globalThis as any).__CM_BG_PRESET__);
      return;
    }

    // BG kind toggle (B): shader <-> flow
    if (e.code === "KeyB") {
      const cur = String((globalThis as any).__CM_BG_KIND__ ?? "shader");
      const next = cur === "flow" ? "shader" : "flow";
      (globalThis as any).__CM_BG_KIND__ = next;
      console.log("[BG] kind", next);
      return;
    }

    // Post-process (Display Reality Layer) toggle (F): ON <-> OFF
    if (e.code === "KeyF") {
      (globalThis as any).__CM_FX__ = !(globalThis as any).__CM_FX__;
      console.log("[FX]", (globalThis as any).__CM_FX__ ? "ON" : "OFF");
      return;
    }

    // Audio mute toggle (M): parallel to F for the FX layer.
    if (e.code === "KeyM") {
      audioEnabled = !audioEnabled;
      (game as any).audio?.setEnabled(audioEnabled);
      console.log("[AUDIO]", audioEnabled ? "ON" : "OFF");
      return;
    }

    // Grid Lab toggle (G): live synthwave grid params
    if (e.code === "KeyG") {
      const ui = (globalThis as any).__CM_GRID_UI__;
      if (ui && typeof ui.toggle === "function") ui.toggle();
      else console.log("[GRID_LAB] UI not ready");
      return;
    }

    if (e.key === "u" || e.key === "U") {
      const ui = (globalThis as any).__CM_BG_LAB_UI__;
      if (ui && typeof ui.toggle === "function") ui.toggle();
      else console.log("[BG_LAB] UI not ready");
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
    (e) => {
      // First tap arms the Web Audio context (iPad's only gesture path).
      void armAudio();
      // start only from TITLE; also prevent wrapper drag/select
      if (hudMode === "TITLE") {
        e.preventDefault();
        e.stopPropagation();
        startPlay();
        try { (document.querySelector("canvas#game") as any)?.focus?.(); } catch {}
      }
    },
    { passive: false, capture: true },
  );

  const renderer = new WebGLSceneRenderer(gl, store as any, LOGIC_W, LOGIC_H);
  (window as any).__CM.renderer = renderer;
  (globalThis as any).__CM_BG_PRESET__ ??= 0;
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
  const TOP_DEBUG_ENABLED = DEV; // zapni jen když ladíš
  const TOP_DEBUG_EVERY_N_FRAMES = 15; // ~4×/s při 60fps
  let topDbgFrame = 0;
  
  function frame(now: number) {
    try {
      let dt = (now - last) / 1000;
      dt = Math.min(dt, 0.05);
      last = now;

      // advance simulation (THIS WAS MISSING)
      loop.step(dt);

      

        // cosmetic VFX (per-frame, not in fixed tick)
        (game as any).vfx?.update?.(dt);
        // audio pump (per-frame, parallel to VFX)
        (game as any).audio?.update?.(dt);
// per-frame aim (cosmetic; gameplay aim je i tak ze sampled actions v ticku)
      if (game?.inputMgr?.getAimTargetNow && game?.playerEnt?.aimDir) {
        const t = game.inputMgr.getAimTargetNow(LOGIC_W, LOGIC_H);
        // playerEnt.pos is WORLD; aim target is SCREEN -> compare in SCREEN space
        const wsx = Number((game as any).world?.scrollX ?? 0);
        const wsy = Number((game as any).world?.scrollY ?? 0);
        const pScreenX = game.playerEnt.pos.x - wsx;
        const pScreenY = game.playerEnt.pos.y - wsy;
        const dx = t.x - pScreenX;
        const dy = t.y - pScreenY;
        const len = Math.hypot(dx, dy) || 1;

        // angle in "logic space" (y is down)
        const ang = Math.atan2(dy, dx);

        // keep for debug / future (renderer currently uses aimDir)
        const ROT_OFFSET = Math.PI / 2; // +90° clockwise
        game.playerEnt.rot = ang + ROT_OFFSET;

        
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

          const world = (window as any).__CM?.game?.world;
          const sx = world?.scrollX ?? 0;
          const sy = world?.scrollY ?? 0;
          const py = (window as any).__CM?.game?.playerEnt?.pos?.y ?? NaN;
          
          setHudTop(
            `tick=${loop.getTick?.() ?? "?"} paused=${(loop as any).isPaused?.() ?? "?"} dt=${dt.toFixed(3)}\n` +
              `alive=${store.getAliveCount?.() ?? "?"} P=${nPlayer} E=${nEnemy} PRJ=${nProj} B=${nBomb}\n` +
              `worldScroll sx=${sx.toFixed(1)} sy=${sy.toFixed(1)} | playerY=${Number(py).toFixed(1)}\n` +
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
        // Atmospheric FX overlay (audio-reactive); after VFX so it gets CRT post.
        // Bass warp depth is gated to active explosion/hit events so plain
        // shooting doesn't spasm the background; treble hue still breathes.
        const hasEvent =
          ((game as any).vfx?.getExplosions?.()?.length ?? 0) > 0 ||
          ((game as any).vfx?.getHits?.()?.length ?? 0) > 0;
        (renderer as any).renderAtmosphere?.(
          now / 1000,
          (game as any).audio?.getFreqs?.() ?? null,
          hasEvent,
          Number((game as any).world?.scrollX ?? 0),
        );
      });

      // Event-driven chromatic aberration: peak CA over active VFX, decaying
      // with each effect's TTL. Explosion adds up to +0.008 (~3.5x baseline),
      // hit spark up to +0.004. Falls back to baseline when nothing is active.
      let caIntensity = 0.0022; // baseline
      const expl = (game as any).vfx?.getExplosions?.() ?? [];
      const hits = (game as any).vfx?.getHits?.() ?? [];
      for (const e of expl) {
        const t = 1 - e.age / e.ttl; // 1=fresh, 0=old
        caIntensity = Math.max(caIntensity, 0.0022 + 0.008 * t);
      }
      for (const h of hits) {
        const t = 1 - h.age / h.ttl;
        caIntensity = Math.max(caIntensity, 0.0022 + 0.004 * t);
      }

      gfx.present({
        postProcess: !!(globalThis as any).__CM_FX__,
        timeSec: now / 1000, // rAF timestamp (ms) -> seconds, same clock as performance.now()
        caIntensity,
      });

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
