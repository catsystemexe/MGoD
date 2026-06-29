function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function resolveMovementCullReferenceX(behaviorId: unknown, bState: unknown, fallbackX: unknown): number {
  const fallback = finite(fallbackX, 0);
  const st = bState && typeof bState === "object" ? bState as Record<string, unknown> : null;
  if (!st || typeof behaviorId !== "string") return fallback;

  if (behaviorId === "loop") {
    const baseX = finiteOrNull(st.baseX);
    const speedX = finiteOrNull(st.speedX);
    const t = finiteOrNull(st.t);
    if (baseX !== null && speedX !== null && t !== null) {
      const x = baseX + speedX * t;
      return Number.isFinite(x) ? x : fallback;
    }
    return fallback;
  }

  if (behaviorId === "sine") {
    const baseX = finiteOrNull(st.baseX);
    const baseSpeedX = finiteOrNull(st.baseSpeedX);
    const driftX = finite(st.driftX, 0);
    const t = finiteOrNull(st.t);
    if (baseX !== null && baseSpeedX !== null && t !== null) {
      const x = baseX + (baseSpeedX + driftX) * t;
      return Number.isFinite(x) ? x : fallback;
    }
    return fallback;
  }

  if (behaviorId === "orbitTarget") {
    const centerX = finiteOrNull(st.centerX);
    return st.initialized === true && centerX !== null ? centerX : fallback;
  }

  return fallback;
}
