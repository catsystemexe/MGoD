export class BgSystem {
  private gl!: WebGL2RenderingContext;
  private prog!: WebGLProgram;
  private vao!: WebGLVertexArrayObject;

  init(gl: WebGL2RenderingContext) {
    this.gl = gl;

    const vs = `#version 300 es
    precision highp float;
    out vec2 v_uv;
    void main(){
      vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
      v_uv = pos;
      gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
    }`;

    const fs = `#version 300 es
    precision highp float;
    in vec2 v_uv;
    out vec4 o;
    void main(){
      o = vec4(v_uv, 0.0, 1.0);
    }`;

    const v = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(v, vs);
    gl.compileShader(v);

    const f = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(f, fs);
    gl.compileShader(f);

    this.prog = gl.createProgram()!;
    gl.attachShader(this.prog, v);
    gl.attachShader(this.prog, f);
    gl.linkProgram(this.prog);

    this.vao = gl.createVertexArray()!;
  }

  draw() {
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.useProgram(null);
  }
}
