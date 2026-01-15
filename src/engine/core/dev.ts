// src/engine/core/dev.ts
import { CM_EVENT_OWNERSHIP } from "./EventOwnershipMap";

/**
 * Dev helper: sanity-check ownership map exists.
 * Intentionally avoids Node-only globals (process) and any extra deps.
 */
export function devSanity(): void {
  const isDev = Boolean((globalThis as any).__DEV__);
  if (!isDev) return;

  const ownerKeys = Object.keys(CM_EVENT_OWNERSHIP ?? {});
  if (ownerKeys.length === 0) {
    console.warn("[devSanity] CM_EVENT_OWNERSHIP is empty");
  }
}
