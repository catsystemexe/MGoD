// src/game/content/CONTENT.ts
import { loadContent } from "./loadContent";

/**
 * Single source of truth pro content (enemyTypes, behaviorPresets, director waves).
 * DŮLEŽITÉ: načítá se jen jednou; ostatní moduly mají importovat CONTENT.
 */
export const CONTENT = loadContent();
