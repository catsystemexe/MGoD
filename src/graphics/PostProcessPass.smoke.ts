// src/graphics/PostProcessPass.smoke.ts
//
// Node has no real WebGL2 context, so we drive createPostProcessPass() with a
// tiny FakeGL stub that implements only the calls it makes. This lets us prove:
//   1) shape — the factory exists and returns { prog, vao, uTex, uTime, uRes }
//   2) structure — 2 shaders compiled + 1 program linked + 1 VAO created
//   3) content — the scanline + breathing effects are still in the FS source
//   4) REGRESSION (empirical) — if the GL reports a bad compile/link, the guard
//      throws. This is the "break the shader -> detect the error" proof done via
//      the fail path of the stub (a real GLSL syntax error trips the same guard
//      at runtime).

import {
  createPostProcessPass,
  POSTPROCESS_FS,
  POSTPROCESS_VS,
} from "./PostProcessPass";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

type FakeGLOpts = { compileOK?: boolean; linkOK?: boolean };

function makeFakeGL(opts: FakeGLOpts = {}) {
  const compileOK = opts.compileOK ?? true;
  const linkOK = opts.linkOK ?? true;

  const counts = { compiled: 0, linked: 0, vaos: 0, shaders: 0 };

  const gl: any = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,

    createShader: () => { counts.shaders++; return { __shader: true }; },
    shaderSource: (_sh: any, _src: string) => {},
    compileShader: () => { counts.compiled++; },
    getShaderParameter: (_sh: any, pname: number) =>
      pname === gl.COMPILE_STATUS ? compileOK : true,
    getShaderInfoLog: () => "fake-compile-log",
    deleteShader: () => {},

    createProgram: () => ({ __program: true }),
    attachShader: () => {},
    linkProgram: () => { counts.linked++; },
    getProgramParameter: (_p: any, pname: number) =>
      pname === gl.LINK_STATUS ? linkOK : true,
    getProgramInfoLog: () => "fake-link-log",
    deleteProgram: () => {},

    createVertexArray: () => { counts.vaos++; return { __vao: true }; },
    bindVertexArray: () => {},

    getUniformLocation: (_p: any, name: string) => ({ __uniform: name }),
  };

  return { gl, counts };
}

function main() {
  // (1) shape: the factory is a function.
  assert(typeof createPostProcessPass === "function", "createPostProcessPass must be a function");

  // (2) structure: happy path builds the pass with the right call counts.
  const { gl, counts } = makeFakeGL();
  const pass = createPostProcessPass(gl as unknown as WebGL2RenderingContext);

  assert(counts.compiled === 2, "must compile exactly 2 shaders (vs+fs), got " + counts.compiled);
  assert(counts.linked === 1, "must link exactly 1 program, got " + counts.linked);
  assert(counts.vaos === 1, "must create exactly 1 VAO, got " + counts.vaos);

  // returned shape: prog, vao, uTex, uTime, uRes
  for (const k of ["prog", "vao", "uTex", "uTime", "uRes"] as const) {
    assert(k in pass, "returned pass must expose '" + k + "'");
  }
  assert(pass.prog && pass.vao && pass.uTex, "prog/vao/uTex must be non-null");

  // (3) content guard: the effects must remain in the source.
  assert(/uniform\s+float\s+uTime/.test(POSTPROCESS_FS), "FS must declare uTime");
  assert(/uniform\s+vec2\s+uResolution/.test(POSTPROCESS_FS), "FS must declare uResolution");
  assert(/mod\(floor\(vUV\.y \* uResolution\.y\), 2\.0\)/.test(POSTPROCESS_FS), "FS must keep the scanline term");
  assert(/0\.012 \* sin\(uTime \* 0\.7\)/.test(POSTPROCESS_FS), "FS must keep the breathing term");
  assert(/gl_VertexID/.test(POSTPROCESS_VS), "VS must use gl_VertexID fullscreen triangle");

  // (4) regression: a reported bad COMPILE must be detected (guard throws).
  {
    let threw = false;
    try {
      const bad = makeFakeGL({ compileOK: false });
      createPostProcessPass(bad.gl as unknown as WebGL2RenderingContext);
    } catch (e) {
      threw = /shader compile failed/.test(String((e as Error).message));
    }
    assert(threw, "bad compile must throw 'shader compile failed'");
  }

  // (4b) regression: a reported bad LINK must be detected (guard throws).
  {
    let threw = false;
    try {
      const bad = makeFakeGL({ linkOK: false });
      createPostProcessPass(bad.gl as unknown as WebGL2RenderingContext);
    } catch (e) {
      threw = /program link failed/.test(String((e as Error).message));
    }
    assert(threw, "bad link must throw 'program link failed'");
  }

  console.log("[SMOKE] PostProcessPass OK ✅ (shape + 2 compiles/1 link + content + compile/link guards)");
}

main();
