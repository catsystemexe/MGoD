export class EventLog {
  private lines: string[] = [];
  constructor(private maxLines = 12) {}

  push(event: string, payload: any) {
    let tail = "";
    if (payload && typeof payload === "object") {
      if ("type" in payload) tail = ` type=${String((payload as any).type)}`;
      else tail = ` ${JSON.stringify(payload).slice(0, 60)}`;
    } else if (payload !== undefined) {
      tail = ` ${String(payload)}`;
    }

    const ts = (performance.now() / 1000).toFixed(2);
    this.lines.push(`[${ts}] ${event}${tail}`);

    if (this.lines.length > this.maxLines) {
      this.lines.splice(0, this.lines.length - this.maxLines);
    }
  }

  clear() {
    this.lines.length = 0;
  }

  render(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const lineH = 14;
    let yy = y;

    for (const e of this.lines) {
      ctx.fillText(e, x, yy);
      yy += lineH;
    }
  }
}
