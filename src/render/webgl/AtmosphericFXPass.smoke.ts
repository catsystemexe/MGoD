// src/render/webgl/AtmosphericFXPass.smoke.ts
//
// Node has no real WebGL2 context, so we drive createAtmosphericFXPass() with a
// tiny FakeGL stub that implements only the calls it makes. This proves:
//   1) shape — the factory exists and returns { draw, dispose }
//   2) structure — 2 shaders compiled + 1 program linked + 1 VAO + 1 texture
//   3) content — the domain-warp / fbm / cosinePalette / uFreqs terms remain
//   4) REGRESSION (empirical) — a reported bad compile/link trips the guard.

import {
  createAtmosphericFXPass,
  ATMOS_FS,
  ATMOS_VS,
} from "./AtmosphericFXPass";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

type FakeGLOpts = { compileOK?: boolean; linkOK?: boolean };

function makeFakeGL(opts: FakeGLOpts = {}) {
  const compileOK = opts.compileOK ?? true;
  const linkOK = opts.linkOK ?? true;

  const counts = { compiled: 0, linked: 0, vaos: 0, textures: 0 };

  const gl: any = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    TEXTURE_2D: 0x0de1,
    R8: 0x8229,
    RED: 0x1903,
    UNSIGNED_BYTE: 0x1401,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    LINEAR: 0x2601,
    CLAMP_TO_EDGE: 0x812f,
    TEXTURE0: 0x84c0,
    BLEND: 0x0be2,
    SRC_ALPHA: 0x0302,
    ONE: 1,
    TRIANGLES: 4,

    createShader: () => ({ __shader: true }),
    shaderSource: () => {},
    compileShader: () => { counts.compiled++; },
    getShaderParameter: (_sh: any, pname: number) => (pname === gl.COMPILE_STATUS ? compileOK : true),
    getShaderInfoLog: () => "fake-compile-log",
    deleteShader: () => {},

    createProgram: () => ({ __program: true }),
    attachShader: () => {},
    linkProgram: () => { counts.linked++; },
    getProgramParameter: (_p: any, pname: number) => (pname === gl.LINK_STATUS ? linkOK : true),
    getProgramInfoLog: () => "fake-link-log",
    deleteProgram: () => {},

    createVertexArray: () => { counts.vaos++; return { __vao: true }; },
    bindVertexArray: () => {},
    deleteVertexArray: () => {},

    getUniformLocation: (_p: any, name: string) => ({ __uniform: name }),

    createTexture: () => { counts.textures++; return { __tex: true }; },
    bindTexture: () => {},
    texImage2D: () => {},
    texSubImage2D: () => {},
    texParameteri: () => {},
    deleteTexture: () => {},
    activeTexture: () => {},

    useProgram: () => {},
    uniform1i: () => {},
    uniform1f: () => {},
    uniform2f: () => {},
    enable: () => {},
    disable: () => {},
    blendFunc: () => {},
    drawArrays: () => {},
  };

  return { gl, counts };
}

function main() {
  // (1) shape
  assert(typeof createAtmosphericFXPass === "function", "createAtmosphericFXPass must be a function");

  // (2) structure
  const { gl, counts } = makeFakeGL();
  const pass = createAtmosphericFXPass(gl as unknown as WebGL2RenderingContext);

  assert(counts.compiled === 2, "must compile exactly 2 shaders (vs+fs), got " + counts.compiled);
  assert(counts.linked === 1, "must link exactly 1 program, got " + counts.linked);
  assert(counts.vaos === 1, "must create exactly 1 VAO, got " + counts.vaos);
  assert(counts.textures === 1, "must create exactly 1 texture, got " + counts.textures);

  assert(typeof pass.draw === "function", "pass must expose draw()");
  assert(typeof pass.dispose === "function", "pass must expose dispose()");

  // draw() must run without throwing (covers texSubImage2D + blend state path).
  pass.draw({ logicW: 896, logicH: 504, timeSec: 1.5, freqs: new Float32Array(32).fill(-40) });
  pass.draw({ logicW: 896, logicH: 504, timeSec: 2.0, freqs: null }); // null -> silence path

  // (3) content guards
  assert(/uniform\s+sampler2D\s+uFreqs/.test(ATMOS_FS), "FS must declare uFreqs sampler");
  assert(/DOMAIN WARP/i.test(ATMOS_FS), "FS must keep the domain-warp section");
  assert(/float fbm\(/.test(ATMOS_FS), "FS must keep the fbm() function");
  assert(/cosinePalette\(/.test(ATMOS_FS), "FS must use cosinePalette()");
  assert(/6\.28318/.test(ATMOS_FS), "FS must keep the cosine-palette tau constant");
  assert(/gl_VertexID/.test(ATMOS_VS), "VS must use gl_VertexID fullscreen triangle");

  // (4) regression: bad COMPILE must be detected.
  {
    let threw = false;
    try {
      const bad = makeFakeGL({ compileOK: false });
      createAtmosphericFXPass(bad.gl as unknown as WebGL2RenderingContext);
    } catch (e) {
      threw = /shader compile failed/.test(String((e as Error).message));
    }
    assert(threw, "bad compile must throw 'shader compile failed'");
  }

  // (4b) regression: bad LINK must be detected.
  {
    let threw = false;
    try {
      const bad = makeFakeGL({ linkOK: false });
      createAtmosphericFXPass(bad.gl as unknown as WebGL2RenderingContext);
    } catch (e) {
      threw = /program link failed/.test(String((e as Error).message));
    }
    assert(threw, "bad link must throw 'program link failed'");
  }

  console.log("[SMOKE] AtmosphericFXPass OK ✅ (shape + 2 compiles/1 link/1 vao/1 tex + content[uFreqs/domain/fbm/cosinePalette] + guards)");
}

main();
