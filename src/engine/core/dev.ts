// DEV ONLY – remove or guard by env later
if (process.env.NODE_ENV !== "production") {
  const eventKeys = Object.values(EventType).sort();
  const ownerKeys = Object.keys(CM_EVENT_OWNERSHIP).sort();

  const missing = eventKeys.filter(e => !ownerKeys.includes(e));
  const extra   = ownerKeys.filter(e => !eventKeys.includes(e));

  if (missing.length || extra.length) {
    throw new Error(
      "[EventOwnershipMap] mismatch\n" +
      `Missing owners for: ${missing.join(", ") || "—"}\n` +
      `Extra owners for: ${extra.join(", ") || "—"}`
    );
  }
}