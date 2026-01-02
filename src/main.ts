import { Game } from "./Game";

function showFatal(msg: string) {
  const pre = document.createElement("pre");
  pre.style.position = "fixed";
  pre.style.left = "0";
  pre.style.top = "0";
  pre.style.right = "0";
  pre.style.bottom = "0";
  pre.style.margin = "0";
  pre.style.padding = "12px";
  pre.style.background = "rgba(0,0,0,0.92)";
  pre.style.color = "#00ff66";
  pre.style.font = "12px/1.4 monospace";
  pre.style.whiteSpace = "pre-wrap";
  pre.style.zIndex = "99999";
  pre.textContent = msg;
  document.body.appendChild(pre);
}

window.addEventListener("error", (e) => {
  const err = (e as ErrorEvent).error;
  showFatal("RUNTIME ERROR:\n" + (err?.stack || e.message || String(e)));
});

window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
  const r: any = e.reason;
  showFatal("UNHANDLED REJECTION:\n" + (r?.stack || String(r)));
});

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
const uiCanvas = document.getElementById("ui") as HTMLCanvasElement | null;

if (!canvas || !uiCanvas) {
  showFatal("Canvas not found.\nExpected #game and #ui in index.html");
} else {
  try {
    const game = new Game(canvas, uiCanvas);
    game.start();
  } catch (e: any) {
    showFatal("INIT ERROR:\n" + (e?.stack || String(e)));
  }
}