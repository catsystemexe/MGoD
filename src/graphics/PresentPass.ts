import type { DisplayInfo } from "./DisplayRenderer";

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;   // -1..1
layout(location=1) in vec2 aUV;    // 0..1
out vec2 vUV;
void main(){ vUV=aUV; gl_Position=vec4(aPos,0.0,1.0); }
`;

const FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
out vec4 o;
void main(){ o = texture(uTex, vUV); }
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || "shader compile failed");
  }
  return sh;
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) || "program link failed");
  }
  return p;
}

export class PresentPass {
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private uTexLoc: WebGLUniformLocation;

  constructor(private gl: WebGL2RenderingContext) {
    const gl = this.gl;
    this.prog = program(gl, VS, FS);
    this.uTexLoc = gl.getUniformLocation(this.prog, "uTex")!;

    // fullscreen quad
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    // aPos(x,y), aUV(u,v)
    const data = new Float32Array([
      -1,-1, 0,0,
       1,-1, 1,0,
      -1, 1, 0,1,
      -1, 1, 0,1,
       1,-1, 1,0,
       1, 1, 1,1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);

    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    this.vao = vao;
  }

  draw(sceneTex: WebGLTexture, info: DisplayInfo) {
    const gl = this.gl;

    // clear whole screen (letterbox)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, Math.floor(info.cssW * info.dpr), Math.floor(info.cssH * info.dpr));
    gl.clearColor(0,0,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // draw in viewport
    gl.viewport(info.viewportX, info.viewportY, info.viewportW, info.viewportH);

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(this.uTexLoc, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
}