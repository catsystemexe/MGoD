/* eslint-disable */
const fs = require("fs");

function die(msg) {
  console.error("PATCH FAIL:", msg);
  process.exit(1);
}

const FILE = "src/render/webgl/bg/FlowRibbonBg.ts";
if (!fs.existsSync(FILE)) die("missing " + FILE);
let s = fs.readFileSync(FILE, "utf8");

/**
 * Replace the core lane generation block with:
 * - grid baseY by default (evenly spaced)
 * - smoothing across nodes
 * - optional vertical bridges (mini strips) between adjacent lanes
 */
const oldBlock = `      // buffer sizing
      const floatsPerVert = 3;
      const vertsPerLane = nodes * 2;
      const totalVerts = Math.max(0, lanes) * vertsPerLane;
      const need = totalVerts * floatsPerVert;
      if (this.buf.length < need) this.buf = new Float32Array(need);

      let w = 0;
      const laneStarts = new Int32Array(Math.max(0, lanes));

      // vertical jitter from preset + optional override
      const spawn = (pr as any).spawn ?? {};
      let yJ =
        spawn.distribution === "uniform_y"
          ? (spawn.yJitterPx ?? 0)
          : (spawn.lanes?.jitterYPx ?? 0);

      if (Number.isFinite(ov?.yJitterPx)) yJ = Number(ov.yJitterPx);

      for (let laneId = 0; laneId < lanes; laneId++) {
        const seed = st.seed + laneId * 97.13;

        // stable pseudo-random Y across the full height (kills banding)
        const guard = Math.max(2, thick * 0.75);
        const baseY = guard + rand01(seed + 9.1) * Math.max(1, logicH - guard * 2);

        // small stable jitter
        const laneJ = (rand01(seed + 4.4) - 0.5) * 2.0 * yJ;

        laneStarts[laneId] = (w / floatsPerVert) | 0;

        let amp = lerp(ampMin, ampMax, rand01(seed + 1.1)) * ampMul;
        let hz = lerp(hzMin, hzMax, rand01(seed + 2.2)) * freqMul;
        const ph = rand01(seed + 3.3) * Math.PI * 2;

        for (let i = 0; i < nodes; i++) {
          // 1) X pro geometrii (scrollované)
          const u = nodes > 1 ? (i / (nodes - 1)) : 0;
          const xBase = x0 + u * wrapW;

          const xGeo = xBase - (st.phaseX % wrapW);

          // stepPx controls wave wavelength (bigger stepPx => longer waves)
          // 7 is the historical/default “neutral” value
          const waveScale = 7 / Math.max(1, stepPx);
          const xPhase = xBase * waveScale;

          let y = baseY + laneJ;
          if (yMe?.enabled) {
            const coup0 = yMe.xPhaseCoupling ?? 0;
            const wHz = Math.PI * 2 * hz;

            // scroll/advection term: keep apparent wave speed invariant vs stepPx
            const phaseX = (st.phaseX % wrapW);
            const advect = -phaseX * coup0;

            // spatial term: wavelength control via waveScale
            const spatial = xPhase * coup0;

            // --- WATER-LIKE COMPOSITE WAVE (less periodic, more "current") ---
              // base multi-sine (macro shape)
              const s0 = Math.sin((t * wHz) + ph + spatial + advect);
              const s1 = Math.sin((t * wHz * 2.71) + ph * 1.37 + (spatial * 3.0) + (advect * 2.2));
              const s2 = Math.sin((t * wHz * 7.10) + ph * 2.11 + (spatial * 9.0) + (advect * 6.0));

              // smooth turbulence in space+time (fbm)
              // scale xPhase down so noise doesn't look like tight jitter
              const nBase = (xPhase * 0.11) + (t * 0.35);
              const n = fbm1(nBase, seed + 999.5, 4, 2.05, 0.55); // 0..1
              const n2 = fbm1(nBase * 0.55 + 12.3, seed + 333.7, 3, 2.2, 0.6); // 0..1

              // lane-dependent "current" modulation: ties nearby lanes together (less banding)
              const yNorm = baseY / Math.max(1, logicH);
              const cur = (Math.sin(t * 0.22 + yNorm * 6.0 + rand01(seed + 81.2) * 3.0) * 0.5 + 0.5); // 0..1

              // assemble: macro + mid + micro + turbulence
              const macro = s0 * 0.72 + s1 * 0.22;
              const micro = s2 * 0.06;
              const turb = ((n - 0.5) * 2.0) * (0.35 + 0.65 * cur) + ((n2 - 0.5) * 2.0) * 0.25;

              y += (macro + micro + turb * 0.85) * amp;
          }

          const yTop = y - thick * 0.5;
          const yBot = y + thick * 0.5;

          // top
          this.buf[w++] = xGeo;
          this.buf[w++] = yTop;
          this.buf[w++] = -1;

          // bottom
          this.buf[w++] = xGeo;
          this.buf[w++] = yBot;
          this.buf[w++] = +1;
        }
      }`;

const newBlock = `      // --- GRID / FIELD MODE (default) ---
      // Goal: not isolated random lanes, but a coherent “field”:
      // - lanes spaced across Y (grid-like)
      // - optional sparse vertical "bridges" between adjacent lanes
      // - light smoothing across nodes (reduce jaggies)

      const ribbonMode = (ovRibbon?.mode ?? (pr as any).ribbon?.mode ?? "grid"); // "grid" | "lanes"
      const enableBridges = (ovRibbon?.bridgesEnabled ?? true) && ribbonMode === "grid";

      const bridgeEveryRaw = Number.isFinite(ovRibbon?.bridgeEvery) ? Number(ovRibbon.bridgeEvery) : 18;
      const bridgeEvery = Math.max(6, bridgeEveryRaw | 0); // spacing of bridges in node steps

      const bridgeWidthMul = Number.isFinite(ovRibbon?.bridgeWidthMul) ? Number(ovRibbon.bridgeWidthMul) : 0.55;

      const smoothItersRaw = Number.isFinite(ovRibbon?.smoothIters) ? Number(ovRibbon.smoothIters) : 2;
      const smoothIters = Math.max(0, Math.min(4, smoothItersRaw | 0));

      // vertical jitter from preset + optional override
      const spawn = (pr as any).spawn ?? {};
      let yJ =
        spawn.distribution === "uniform_y"
          ? (spawn.yJitterPx ?? 0)
          : (spawn.lanes?.jitterYPx ?? 0);

      if (Number.isFinite(ov?.yJitterPx)) yJ = Number(ov.yJitterPx);

      const floatsPerVert = 3;
      const vertsPerLane = nodes * 2;

      // Estimate extra verts for vertical bridges (each bridge is a mini strip of 4 verts)
      const bridgesPerPair = enableBridges ? Math.floor(nodes / bridgeEvery) : 0;
      const estBridgeStrips = enableBridges ? Math.max(0, lanes - 1) * bridgesPerPair : 0;
      const estBridgeVerts = estBridgeStrips * 4;

      const totalVerts = Math.max(0, lanes) * vertsPerLane + estBridgeVerts;
      const need = totalVerts * floatsPerVert;
      if (this.buf.length < need) this.buf = new Float32Array(need);

      // We will draw multiple strips: lanes + bridge strips
      const starts: number[] = [];
      const counts: number[] = [];

      // temp per-lane y samples for smoothing + bridges
      const yLine = new Float32Array(nodes);

      // store lane center Y per node for bridges (only when enabled)
      const laneCenters = enableBridges ? new Float32Array(Math.max(0, lanes) * nodes) : null;

      let w = 0;

      // helper: write one lane strip from yLine[]
      const writeLaneStrip = (laneId: number) => {
        const start = (w / floatsPerVert) | 0;

        for (let i = 0; i < nodes; i++) {
          const u = nodes > 1 ? (i / (nodes - 1)) : 0;
          const xBase = x0 + u * wrapW;
          const xGeo = xBase - (st.phaseX % wrapW);

          const y = yLine[i];
          const yTop = y - thick * 0.5;
          const yBot = y + thick * 0.5;

          // top
          this.buf[w++] = xGeo;
          this.buf[w++] = yTop;
          this.buf[w++] = -1;

          // bottom
          this.buf[w++] = xGeo;
          this.buf[w++] = yBot;
          this.buf[w++] = +1;
        }

        const count = vertsPerLane;
        starts.push(start);
        counts.push(count);

        // also store lane centers for bridges
        if (laneCenters) {
          const off = laneId * nodes;
          for (let i = 0; i < nodes; i++) laneCenters[off + i] = yLine[i];
        }
      };

      // helper: 1D smoothing (low-pass) over yLine
      const smoothY = () => {
        if (nodes < 3) return;
        const tmp = new Float32Array(nodes);
        for (let it = 0; it < smoothIters; it++) {
          tmp[0] = yLine[0];
          tmp[nodes - 1] = yLine[nodes - 1];
          for (let i = 1; i < nodes - 1; i++) {
            tmp[i] = (yLine[i - 1] + yLine[i] * 2.0 + yLine[i + 1]) * 0.25;
          }
          yLine.set(tmp);
        }
      };

      // Build each lane as a coherent “field”
      for (let laneId = 0; laneId < lanes; laneId++) {
        const seed = st.seed + laneId * 97.13;

        // base Y:
        // - "grid": evenly spaced across height (field look)
        // - "lanes": legacy random
        const guard = Math.max(2, thick * 0.75);

        let baseY = 0;
        if (ribbonMode === "grid") {
          const frac = (laneId + 0.5) / Math.max(1, lanes);
          baseY = guard + frac * Math.max(1, logicH - guard * 2);
        } else {
          baseY = guard + rand01(seed + 9.1) * Math.max(1, logicH - guard * 2);
        }

        // stable lane jitter
        const laneJ = (rand01(seed + 4.4) - 0.5) * 2.0 * yJ;

        let amp = lerp(ampMin, ampMax, rand01(seed + 1.1)) * ampMul;
        let hz = lerp(hzMin, hzMax, rand01(seed + 2.2)) * freqMul;
        const ph = rand01(seed + 3.3) * Math.PI * 2;

        // coherence across lanes: nearby lanes share slow "current" term
        const laneFrac = (laneId / Math.max(1, lanes - 1));
        const laneCoh = Math.sin(laneFrac * Math.PI * 2.0 + t * 0.18) * 0.5 + 0.5; // 0..1

        for (let i = 0; i < nodes; i++) {
          const u = nodes > 1 ? (i / (nodes - 1)) : 0;
          const xBase = x0 + u * wrapW;

          const waveScale = 7 / Math.max(1, stepPx);
          const xPhase = xBase * waveScale;

          let y = baseY + laneJ;

          if (yMe?.enabled) {
            const coup0 = yMe.xPhaseCoupling ?? 0;
            const wHz = Math.PI * 2 * hz;

            const phaseX = (st.phaseX % wrapW);
            const advect = -phaseX * coup0;
            const spatial = xPhase * coup0;

            // macro/mid/micro
            const s0 = Math.sin((t * wHz) + ph + spatial + advect);
            const s1 = Math.sin((t * wHz * 2.71) + ph * 1.37 + (spatial * 3.0) + (advect * 2.2));
            const s2 = Math.sin((t * wHz * 7.10) + ph * 2.11 + (spatial * 9.0) + (advect * 6.0));

            // fbm: make it coherent across lanes by mixing laneId into x
            const nBase = (xPhase * 0.11) + (t * 0.35) + laneId * 0.07;
            const n = fbm1(nBase, seed + 999.5, 4, 2.05, 0.55); // 0..1
            const n2 = fbm1(nBase * 0.55 + 12.3, seed + 333.7, 3, 2.2, 0.6); // 0..1

            const yNorm = baseY / Math.max(1, logicH);
            const cur = (Math.sin(t * 0.22 + yNorm * 6.0 + laneCoh * 3.0) * 0.5 + 0.5); // 0..1

            const macro = s0 * 0.72 + s1 * 0.22;
            const micro = s2 * 0.06;
            const turb = ((n - 0.5) * 2.0) * (0.35 + 0.65 * cur) + ((n2 - 0.5) * 2.0) * 0.25;

            y += (macro + micro + turb * 0.85) * amp;
          }

          yLine[i] = y;
        }

        // smooth to reduce jaggies
        if (smoothIters > 0) smoothY();

        // write lane strip to buffer
        writeLaneStrip(laneId);
      }

      // --- Sparse vertical bridges between adjacent lanes ---
      if (laneCenters) {
        const bridgeThick = thick * bridgeWidthMul;

        // each bridge = mini strip with 4 verts (two x, two y)
        const writeBridge = (xIdx: number, yA: number, yB: number) => {
          const start = (w / floatsPerVert) | 0;

          const u = nodes > 1 ? (xIdx / (nodes - 1)) : 0;
          const xBase = x0 + u * wrapW;
          const xGeo = xBase - (st.phaseX % wrapW);

          const yMid = (yA + yB) * 0.5;
          const yTop = yMid - bridgeThick * 0.5;
          const yBot = yMid + bridgeThick * 0.5;

          // we orient a tiny vertical ribbon by using yA/yB endpoints as "centerline",
          // but render as a small quad around the midpoint (cheap, stable).
          // top
          this.buf[w++] = xGeo;
          this.buf[w++] = yTop;
          this.buf[w++] = -1;

          // bottom
          this.buf[w++] = xGeo;
          this.buf[w++] = yBot;
          this.buf[w++] = +1;

          // duplicate with small x offset to give it area (very subtle)
          const xGeo2 = xGeo + Math.max(1, stepPx) * 0.18;

          this.buf[w++] = xGeo2;
          this.buf[w++] = yTop;
          this.buf[w++] = -1;

          this.buf[w++] = xGeo2;
          this.buf[w++] = yBot;
          this.buf[w++] = +1;

          starts.push(start);
          counts.push(4);
        };

        for (let laneId = 0; laneId < lanes - 1; laneId++) {
          const seed = st.seed + laneId * 97.13;
          const offA = laneId * nodes;
          const offB = (laneId + 1) * nodes;

          for (let i = 0; i < nodes; i += bridgeEvery) {
            // deterministic sparse gating
            const gate = rand01(seed + i * 13.7);
            if (gate < 0.55) continue;

            const yA = laneCenters[offA + i];
            const yB = laneCenters[offB + i];
            writeBridge(i, yA, yB);
          }
        }
      }`;

if (!s.includes(oldBlock)) {
  die("expected old lane block not found (file changed). Re-run with updated matcher.");
}

s = s.replace(oldBlock, newBlock);
fs.writeFileSync(FILE, s, "utf8");
console.log("patched:", FILE);
