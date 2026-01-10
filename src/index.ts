// src/index.ts
(window as any).__INDEX_BOOT__ = ((window as any).__INDEX_BOOT__ ?? 0) + 1;
console.log("[INDEX] boot#", (window as any).__INDEX_BOOT__);

import "./main";
