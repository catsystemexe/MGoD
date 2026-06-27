import type { ParticleStore } from "../../engine/fx/ParticleStore";

const MAX_PARTICLES = 512;
const ATTRIBS_PER = 7; // x, y, r, g, b, a, size

const VS = `#version 300 es
in vec2 aPos;
in vec4 aColor;
in float aSize;
uniform vec2 uLogic;
out vec4 vColor;
void main() {
  vec2 ndc = vec2(
    (aPos.x / uLogic.x) * 2.0 - 1.0,
    1.0 - (aPos.y / uLogic.y) * 2.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);
  gl_PointSize = aSize;
  vColor = aColor;
}`;

const FS = `#version 300 es
precision mediump float;
in vec4 vColor;
out vec4 outColor;
void main() {
  vec2 pc = gl_PointCoord * 2.0 - 1.0;
  float d = dot(pc, pc);
  if (d > 1.0) discard;
  float edge = smoothstep(1.0, 0.4, d);
  outColor = vec4(vColor.rgb, vColor.a * edge);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("[ParticlePass] createShader failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || "";
    gl.deleteShader(sh);
    throw new Error("[ParticlePass] shader: " + log);
  }
  return sh;
}

export class ParticlePass {
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private uLogic: WebGLUniformLocation;
  private cpuBuf: Float32Array;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private logicW: number,
    private logicH: number,
  ) {
    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS);

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog) || "";
      gl.deleteProgram(prog);
      throw new Error("[ParticlePass] link: " + log);
    }
    this.prog = prog;

    const uLogic = gl.getUniformLocation(prog, "uLogic");
    if (!uLogic) throw new Error("[ParticlePass] uLogic missing");
    this.uLogic = uLogic;

    const vao = gl.createVertexArray()!;
    const vbo = gl.createBuffer()!;
    this.vao = vao;
    this.vbo = vbo;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_PARTICLES * ATTRIBS_PER * 4, gl.DYNAMIC_DRAW);

    const stride = ATTRIBS_PER * 4;
    const aPos = gl.getAttribLocation(prog, "aPos");
    const aColor = gl.getAttribLocation(prog, "aColor");
    const aSize = gl.getAttribLocation(prog, "aSize");

    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);

    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 8);

    gl.enableVertexAttribArray(aSize);
    gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, stride, 24);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    this.cpuBuf = new Float32Array(MAX_PARTICLES * ATTRIBS_PER);
  }

  draw(particleStore: ParticleStore, scrollX: number, scrollY: number): void {
    const gl = this.gl;
    const buf = this.cpuBuf;
    let count = 0;

    particleStore.forEach((p, lifeRatio) => {
      if (count >= MAX_PARTICLES) return;

      const o = count * ATTRIBS_PER;
      buf[o] = p.x - scrollX;
      buf[o + 1] = p.y - scrollY;
      buf[o + 2] = p.r;
      buf[o + 3] = p.g;
      buf[o + 4] = p.b;
      buf[o + 5] = lifeRatio; // alpha = lifeRatio (fade out)
      buf[o + 6] = p.size * (0.5 + 0.5 * lifeRatio); // shrink as it dies
      count++;
    });

    if (count === 0) return;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.uLogic, this.logicW, this.logicH);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf.subarray(0, count * ATTRIBS_PER));

    gl.drawArrays(gl.POINTS, 0, count);

    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  resize(w: number, h: number): void {
    this.logicW = w;
    this.logicH = h;
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.prog);
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.vbo);
  }
}
