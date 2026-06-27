// src/debug/BootTrace.ts
declare global { interface Window { __CM_BT__?: { log:(s:string)=>void } } }

function ensure() {
  if (window.__CM_BT__) return window.__CM_BT__;
  const root = document.createElement("div");
  root.id = "__cm_bt__";
  root.style.position = "fixed";
  root.style.left = "8px";
  root.style.top = "8px";
  root.style.zIndex = "999999";
  root.style.pointerEvents = "none";
  root.style.maxWidth = "96vw";
  root.style.maxHeight = "50vh";
  root.style.overflow = "hidden";
  root.style.background = "rgba(0,0,0,0.6)";
  root.style.border = "1px solid rgba(255,255,255,0.25)";
  root.style.borderRadius = "6px";
  root.style.padding = "6px 8px";
  root.style.fontFamily = "ui-monospace, Menlo, Consolas, monospace";
  root.style.fontSize = "12px";
  root.style.color = "white";

  const pre = document.createElement("pre");
  pre.style.margin = "0";
  pre.style.whiteSpace = "pre-wrap";
  root.appendChild(pre);
  document.body.appendChild(root);

  const lines: string[] = [];
  function log(s: string) {
    const t = (performance.now()/1000).toFixed(3);
    lines.push(`${t}s ${s}`);
    const tail = lines.length > 80 ? lines.slice(-80) : lines;
    pre.textContent = tail.join("\n");
  }
  window.__CM_BT__ = { log };
  return window.__CM_BT__;
}

export function BT(s: string) { ensure().log(s); }
