export type BgChangeType = "realtime" | "rebuild" | "structural";

export type BgChangeMeta = {
  changeType: BgChangeType;
  path: string;
};

type Listener = (meta: BgChangeMeta) => void;

const listeners = new Set<Listener>();

export const BgLabBus = {
  on(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  emit(meta: BgChangeMeta) {
    for (const fn of listeners) fn(meta);
  },
};
