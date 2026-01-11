function fail(msg: string): never {
  throw new Error("[SMOKE] " + msg);
}

export const assert = {
  ok(cond: unknown, msg = "assert.ok failed"): void {
    if (!cond) fail(msg);
  },
  equal<T>(a: T, b: T, msg = "assert.equal failed"): void {
    if (a !== b) fail(`${msg} (got=${String(a)} expected=${String(b)})`);
  },
};