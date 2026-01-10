type DevAPI = {
  waves?: () => any[];
  solo?: (id: string) => void;
  enableAll?: () => void;
  enable?: (id: string, on: boolean) => void;
  trigger?: (id: string) => void;
  stop?: (id: string) => void;
  diff?: (m: number) => void;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

export class DevUI {
  private root: HTMLDivElement;
  private visible = false; // ✅ default OFF
  private refreshTimer: number | null = null;

  constructor(private getDev: () => DevAPI | null | undefined) {
    this.root = el("div");
    this.root.id = "devui";
    this.root.style.cssText = [
      "position:fixed",
      "right:8px",
      "top:8px",
      "z-index:99999",
      "color:#fff",
      "font:10px monospace",                 // ✅ menší font
      "background:rgba(0,0,0,0.75)",
      "border:1px solid rgba(255,255,255,0.15)",
      "padding:6px",                         // ✅ menší padding
      "border-radius:8px",
      "min-width:220px",                     // ✅ kompaktnější
      "max-width:340px",
      "user-select:none",
      "display:none",                        // ✅ default hidden
    ].join(";");

    this.build();
    document.body.appendChild(this.root);

    // ✅ FIX: jeden listener, žádné zanoření
    window.addEventListener("keydown", (e) => {
      // backquote je standard pro `
      if (e.code === "Backquote" || e.key === "`" || e.key === "§") {
        this.toggle();
      }
    });

    // auto refresh UI state
    this.refreshTimer = window.setInterval(() => this.refresh(), 250);
    this.refresh();
  }

  toggle() {
    this.visible = !this.visible;
    this.root.style.display = this.visible ? "block" : "none";
  }

  private build() {
    const title = el("div");
    title.textContent = "DEV UI  (` toggles)";
    title.style.cssText = "font-weight:700;margin-bottom:6px;opacity:0.95;";
    this.root.appendChild(title);

    // ✅ TOP LOG uvnitř DevUI
    const topLog = el("div");
    topLog.id = "devui_toplog";
    topLog.style.cssText = [
      "white-space:pre",
      "opacity:0.9",
      "margin-bottom:6px",
      "padding:4px 6px",
      "border:1px solid rgba(255,255,255,0.10)",
      "border-radius:6px",
      "background:rgba(255,255,255,0.04)",
    ].join(";");
    this.root.appendChild(topLog);

    const rowBtns = el("div");
    rowBtns.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;";
    this.root.appendChild(rowBtns);

    const btn = (label: string, onClick: () => void) => {
      const b = el("button");
      b.textContent = label;
      b.style.cssText = [
        "cursor:pointer",
        "background:rgba(255,255,255,0.08)",
        "border:1px solid rgba(255,255,255,0.15)",
        "color:white",
        "padding:2px 6px",          // ✅ kompaktnější
        "border-radius:6px",
        "font:10px monospace",      // ✅ kompaktnější
        "line-height:12px",
      ].join(";");
      b.onclick = () => onClick();
      rowBtns.appendChild(b);
      return b;
    };

    btn("EnableAll", () => this.getDev()?.enableAll?.());
    btn("Waves()", () => console.log("[DEVUI] waves", this.getDev()?.waves?.()));
    btn("Hide", () => this.toggle());

    // Difficulty slider
    const diffWrap = el("div");
    diffWrap.style.cssText = "margin:6px 0 8px 0;";
    this.root.appendChild(diffWrap);

    const diffLabel = el("div");
    diffLabel.textContent = "Difficulty: 1.00";
    diffLabel.style.cssText = "margin-bottom:4px;opacity:0.9;";
    diffWrap.appendChild(diffLabel);

    const diff = el("input") as HTMLInputElement;
    diff.type = "range";
    diff.min = "0.5";
    diff.max = "5";
    diff.step = "0.05";
    diff.value = "1";
    diff.style.width = "100%";
    diff.oninput = () => {
      const v = Number(diff.value);
      diffLabel.textContent = `Difficulty: ${v.toFixed(2)}`;
      this.getDev()?.diff?.(v);
    };
    diffWrap.appendChild(diff);

    // Waves list
    const wavesTitle = el("div");
    wavesTitle.textContent = "Waves:";
    wavesTitle.style.cssText = "margin:6px 0 6px 0;font-weight:700;opacity:0.95;";
    this.root.appendChild(wavesTitle);

    const list = el("div");
    list.id = "devui_waves";
    list.style.cssText = "display:flex;flex-direction:column;gap:5px;"; // ✅ menší gap
    this.root.appendChild(list);
  }

  private refresh() {
    const dev = this.getDev();

    // ✅ top log: čte z window.__CM.topLog (setuje main.ts)
    const top = this.root.querySelector("#devui_toplog") as HTMLDivElement | null;
    if (top) {
      const cm = (window as any).__CM;
      const s = (typeof cm?.topLog === "string") ? cm.topLog : "";
      top.textContent = s;
      top.style.display = s ? "block" : "none";
    }

    const list = this.root.querySelector("#devui_waves") as HTMLDivElement | null;
    if (!list) return;

    const waves = dev?.waves?.() ?? [];
    list.innerHTML = "";

    for (const w of waves) {
      const row = el("div");
      row.style.cssText = [
        "display:grid",
        "grid-template-columns: 1fr auto",
        "gap:6px",
        "align-items:center",
        "padding:5px", // ✅ menší padding
        "border:1px solid rgba(255,255,255,0.12)",
        "border-radius:6px",
        "background:rgba(255,255,255,0.04)",
      ].join(";");

      const left = el("div");
      const id = String(w.id ?? "?");
      const enabled = !!w.enabled;
      const active = !!w.active;
      const spawned = Number(w.spawned ?? 0);

      left.innerHTML =
        `<div style="font-weight:700;">${id}</div>` +
        `<div style="opacity:0.85;">enabled=${enabled} active=${active} spawned=${spawned}</div>`;
      row.appendChild(left);

      const right = el("div");
      right.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;";

      const mk = (label: string, fn: () => void) => {
        const b = el("button");
        b.textContent = label;
        b.style.cssText = [
          "cursor:pointer",
          "background:rgba(255,255,255,0.08)",
          "border:1px solid rgba(255,255,255,0.15)",
          "color:white",
          "padding:2px 6px",      // ✅ menší
          "border-radius:6px",
          "font:10px monospace",  // ✅ menší
          "line-height:12px",
        ].join(";");
        b.onclick = () => fn();
        right.appendChild(b);
      };

      mk(enabled ? "Disable" : "Enable", () => dev?.enable?.(id, !enabled));
      mk("Solo", () => dev?.solo?.(id));
      mk("Trigger", () => dev?.trigger?.(id));
      mk("Stop", () => dev?.stop?.(id));

      row.appendChild(right);
      list.appendChild(row);
    }
  }

  destroy() {
    if (this.refreshTimer) window.clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    this.root.remove();
  }
}
