import "./style.css";
import { Game } from "./Game";

function banner(text: string, bg: string) {
  const div = document.createElement("div");
  div.style.position = "fixed";
  div.style.left = "0";
  div.style.top = "0";
  div.style.right = "0";
  div.style.padding = "8px 12px";
  div.style.background = bg;
  div.style.color = "#fff";
  div.style.font = "12px ui-monospace, Menlo, monospace";
  div.style.zIndex = "999999";
  div.style.whiteSpace = "pre-wrap";
  div.textContent = text;
  document.body.appendChild(div);
  return div;
}

banner("TIP: Tap/click the canvas once to focus, then use keyboard.", "rgba(0,0,0,0.75)");
const boot = banner("BOOT: main.ts loaded", "rgba(0,128,0,0.75)");

window.addEventListener("error", (e) => {
  banner("ERROR:\n" + (e.error?.stack || e.message), "rgba(200,0,0,0.90)");
});
window.addEventListener("unhandledrejection", (e: any) => {
  banner("PROMISE:\n" + (e.reason?.stack || String(e.reason)), "rgba(200,0,0,0.90)");
});

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
if (!canvas) throw new Error("Canvas #game not found");

// focus (iPad/preview)
canvas.tabIndex = 0;
canvas.style.outline = "none";
const focusCanvas = () => canvas.focus({ preventScroll: true } as any);
setTimeout(focusCanvas, 50);
canvas.addEventListener("pointerdown", focusCanvas);

try {
  const game = new Game(canvas);
  game.start();
  boot.textContent = "BOOT: Game started";
} catch (err: any) {
  banner("BOOT FAIL:\n" + (err?.stack || String(err)), "rgba(200,0,0,0.90)");
  throw err;
}
