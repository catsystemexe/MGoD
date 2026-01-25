function isObj(v: any): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// deep merge: base <- patch (patch overrides base)
export function mergeDeep<T>(base: T, patch: any): T {
  if (!isObj(base) || !isObj(patch)) return (patch ?? base) as T;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const k of Object.keys(patch)) {
    const bv = (base as any)[k];
    const pv = (patch as any)[k];
    out[k] = isObj(bv) && isObj(pv) ? mergeDeep(bv, pv) : pv;
  }
  return out as T;
}
