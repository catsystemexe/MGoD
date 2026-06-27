from pathlib import Path

p = Path("src/render/webgl/WebGLSceneRenderer.ts")
s = p.read_text(encoding="utf-8")

print("PATCH: loaded", p, "len=", len(s))

marker = "    private drawProcPartsAt("
i = s.find(marker)
print("PATCH: marker index =", i)
if i < 0:
    raise SystemExit("PATCH FAIL: could not find drawProcPartsAt marker (file drift).")

# Prevent double-apply
if "drawGlyphStackAt(" in s:
    raise SystemExit("PATCH SKIP: drawGlyphStackAt already present")

insert_fn = r'''
    private drawGlyphStackAt(
      gl: WebGL2RenderingContext,
      cx: number,
      cy: number,
      tSec: number,
      phase: number,
      baseCol: string | null,
      glyphs: any
    ): boolean {
      if (!Array.isArray(glyphs) || glyphs.length === 0) return false;

      const parseHex = (c: string | null | undefined): [number, number, number] => {
        if (!c || typeof c !== "string") return [1, 1, 1];
        const m = /^#?([0-9a-fA-F]{6})$/.exec(c.trim());
        if (!m) return [1, 1, 1];
        const n = parseInt(m[1], 16);
        const r = ((n >> 16) & 255) / 255;
        const g = ((n >> 8) & 255) / 255;
        const b = (n & 255) / 255;
        return [r, g, b];
      };

      const [br, bg, bb] = parseHex(baseCol);

      let blendOn = false;

      for (const it of glyphs) {
        if (!it) continue;

        const id = String(it.id ?? "");
        if (!id) continue;

        const dx = Number(it.dx ?? 0);
        const dy = Number(it.dy ?? 0);

        const col = (typeof it.color === "string" && it.color.length) ? it.color : null;
        const [r, g, b] = col ? parseHex(col) : [br, bg, bb];

        let a = Number(it.alpha ?? 1);
        if (!Number.isFinite(a)) a = 1;
        a = Math.max(0, Math.min(1, a));

        const pulseHz = Number(it.pulseHz ?? 0);
        const pulseAmp = Number(it.pulseAmp ?? 0);
        if (Number.isFinite(pulseHz) && pulseHz > 0 && Number.isFinite(pulseAmp) && pulseAmp > 0) {
          const s = Math.sin((tSec + (Number.isFinite(phase) ? phase : 0)) * Math.PI * 2 * pulseHz);
          const k = 1 + s * Math.max(0, Math.min(1, pulseAmp));
          a = Math.max(0, Math.min(1, a * k));
        }

        if (!blendOn && a < 0.999) {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          blendOn = true;
        }

        gl.uniform4f(this.uColor, r, g, b, a);
        this.drawGlyphAt(gl, cx + dx, cy + dy, id);
      }

      if (blendOn) gl.disable(gl.BLEND);
      gl.uniform4f(this.uColor, 1, 1, 1, 1);

      return true;
    }

'''

# insert before drawProcPartsAt
s2 = s[:i] + insert_fn + s[i:]

old_block = """          // --- GLYPH PATH (vector/pixel-glyph fallback)
          // If entity provides glyphId, draw it and skip the fallback rect.
          const glyphId = (e as any).render?.glyphId ?? (e as any).glyphId;
          if (glyphId) {
            const ok = this.drawGlyphAt(gl, ix, iy, String(glyphId));
            if (ok) return;
          }"""

// --- GLYPH STACK PATH (composite)
const baseColStr = (e as any).render?.color;
const baseCol = (typeof baseColStr === "string" && baseColStr.length) ? baseColStr : null;

const glyphs = (e as any).render?.glyphs;
if (glyphs && Array.isArray(glyphs) && glyphs.length) {
  const okg = this.drawGlyphStackAt(gl, ix, iy, tSec, 0, baseCol, glyphs);
  if (okg) return;
}

// --- GLYPH PATH (single)
const glyphId = (e as any).render?.glyphId ?? (e as any).glyphId;
if (glyphId) {
  const ok = this.drawGlyphAt(gl, ix, iy, String(glyphId));
  if (ok) return;
}

if old_block not in s2:
    raise SystemExit("PATCH FAIL: glyph path block not found (file drift).")

p.write_text(s2.replace(old_block, new_block, 1), encoding="utf-8")
print("OK: WebGLSceneRenderer.ts patched (drawGlyphStackAt + glyph stack branch)")
