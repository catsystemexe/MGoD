console.log("[BOOT] main.ts running");

// hard fallback UI (uvidíš i když se další importy rozbijou)
document.body.style.margin = "0";
document.body.style.background = "black";
document.body.innerHTML = `<div id="boot" style="color:white;font:16px monospace;padding:12px">BOOT OK</div>`;

window.addEventListener("error", (e) => {
  console.error("[BOOT] window.error", e.error || e.message);
  const el = document.getElementById("boot");
  if (el) el.innerHTML = "BOOT ERROR (window.error): " + String(e.error || e.message);
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("[BOOT] unhandledrejection", e.reason);
  const el = document.getElementById("boot");
  if (el) el.innerHTML = "BOOT ERROR (promise): " + String(e.reason);
});

const LOGIC_W = 224;
const LOGIC_H = 256;
const SCALE = 2;

function ensureCanvas(): HTMLCanvasElement {
  let c = document.querySelector("canvas#game") as HTMLCanvasElement | null;
  if (!c) {
    c = document.createElement("canvas");
    c.id = "game";
    document.body.appendChild(c);
  }
  c.width = LOGIC_W * SCALE;
  c.height = LOGIC_H * SCALE;
  c.style.width = `${LOGIC_W * SCALE}px`;
  c.style.height = `${LOGIC_H * SCALE}px`;
  return c;
}

async function main() {
  // ✅ importy až po BOOT OK, ať vidíš chybu i když import spadne
  const { createGame } = await import("./game/boot/createGame");
  const { RenderSystem } = await import("./game/render/RenderSystem");

  const canvas = ensureCanvas();
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas2D not supported");

  const { loop, store } = createGame();
  const render = new RenderSystem(ctx, store as any, LOGIC_W, LOGIC_H, SCALE);

  let last = performance.now();

  function frame(now: number) {
    const dtSec = (now - last) / 1000;
    last = now;

    loop.step(dtSec);
    render.render();

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error("[BOOT] main() failed", err);
  const el = document.getElementById("boot");
  if (el) el.innerHTML = "BOOT ERROR (main): " + String(err?.stack || err);
});