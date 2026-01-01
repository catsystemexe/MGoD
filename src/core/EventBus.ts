export type Unsub = () => void;

export class EventBus<Events extends Record<string, any>> {
  private handlers: { [K in keyof Events]?: Array<(payload: Events[K]) => void> } = {};
  private wildcards: Array<(event: keyof Events, payload: Events[keyof Events]) => void> = [];

  on<K extends keyof Events>(event: K, fn: (payload: Events[K]) => void): Unsub {
    (this.handlers[event] ??= []).push(fn);
    return () => this.off(event, fn);
  }

  off<K extends keyof Events>(event: K, fn: (payload: Events[K]) => void) {
    const arr = this.handlers[event];
    if (!arr) return;
    const i = arr.indexOf(fn as any);
    if (i >= 0) arr.splice(i, 1);
  }

  onAny(fn: (event: keyof Events, payload: Events[keyof Events]) => void): Unsub {
    this.wildcards.push(fn);
    return () => {
      const i = this.wildcards.indexOf(fn);
      if (i >= 0) this.wildcards.splice(i, 1);
    };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]) {
    const arr = this.handlers[event];
    if (arr) for (const fn of [...arr]) fn(payload);
    for (const w of [...this.wildcards]) w(event, payload);
  }
}
