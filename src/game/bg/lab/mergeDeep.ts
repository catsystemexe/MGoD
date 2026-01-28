function isObj(v: any): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isArr(v: any): v is any[] {
  return Array.isArray(v);
}

// deep merge: base <- patch (patch overrides base)
// - objects: recursive merge
// - arrays: merge by index (so patch[0] overrides base[0], etc.)
export function mergeDeep<T>(base: T, patch: any): T {
  if (patch == null) return base as T;

  // array merge (by index)
  if (isArr(base) && isArr(patch)) {
    const out = [...base];
    const n = Math.max(out.length, patch.length);
    for (let i = 0; i < n; i++) {
      const pv = (patch as any)[i];
      if (pv === undefined) continue;
      const bv = (base as any)[i];
      out[i] = mergeDeep(bv, pv);
    }
    return out as any as T;
  }

  // object merge
  if (isObj(base) && isObj(patch)) {
    const out: any = { ...(base as any) };
    for (const k of Object.keys(patch)) {
      const bv = (base as any)[k];
      const pv = (patch as any)[k];
      out[k] = mergeDeep(bv, pv);
    }
    return out as T;
  }

  // primitive / mismatched types
  return patch as T;
}