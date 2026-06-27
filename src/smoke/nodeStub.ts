export function ensureWindowStub(): void {
  const g: any = globalThis as any;
  if (!g.window) {
    g.window = { addEventListener: () => {}, removeEventListener: () => {}, devicePixelRatio: 1 };
  }
  if (!g.document) {
    g.document = { addEventListener: () => {}, removeEventListener: () => {}, body: {} };
  }
}

export function makeStubCanvas(): HTMLCanvasElement {
  return {
    width: 0,
    height: 0,
    style: {} as any,
    getBoundingClientRect: () =>
      ({ left:0, top:0, width:0, height:0, right:0, bottom:0, x:0, y:0, toJSON: () => ({}) } as any),
    addEventListener: () => {},
    removeEventListener: () => {},
  } as any as HTMLCanvasElement;
}
