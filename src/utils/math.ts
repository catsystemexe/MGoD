export interface Vec2 { x: number; y: number; }
export const v2 = (x: number, y: number): Vec2 => ({ x, y });
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpV2 = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

// --- Pixel snapping helpers (MGoD) ---
// Kamera: stabilita proti jitteru => celá čísla "dolů"
export function snapCamera(v: number): number {
  return Math.floor(v);
}

// Sprite/pixel pozice: symetrické zaokrouhlení
export function snapPixel(v: number): number {
  return Math.round(v);
}