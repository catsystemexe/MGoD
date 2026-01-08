export type CMGlobal = {
  store?: any;
  loop?: any;
  session?: any;
};

declare global {
  interface Window {
    __CM?: CMGlobal;
  }
}

export function ensureCM(): CMGlobal {
  if (!window.__CM) window.__CM = {};
  return window.__CM;
}