import { MeshData } from "./MeshLoader";

export type GpuMesh = {
  vao: WebGLVertexArrayObject;
  indexCount: number;
  indexType: number; // gl.UNSIGNED_SHORT or gl.UNSIGNED_INT
  color: [number, number, number, number];
  dispose: () => void;
};

export function uploadMesh(gl: WebGL2RenderingContext, mesh: MeshData): GpuMesh {
  // 1. VAO encapsulates all the vertex state below — draw call stays clean.
  const vao = gl.createVertexArray();
  if (!vao) throw new Error("GpuMesh: createVertexArray failed");
  gl.bindVertexArray(vao);

  // 2. Position VBO (location 0)
  const posVbo = gl.createBuffer();
  if (!posVbo) throw new Error("GpuMesh: createBuffer (position) failed");
  gl.bindBuffer(gl.ARRAY_BUFFER, posVbo);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  // 3. Normal VBO (location 1)
  const normVbo = gl.createBuffer();
  if (!normVbo) throw new Error("GpuMesh: createBuffer (normal) failed");
  gl.bindBuffer(gl.ARRAY_BUFFER, normVbo);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(1);

  // 4. Index buffer (IBO) — stays bound to the VAO, so unbind only after VAO.
  const ibo = gl.createBuffer();
  if (!ibo) throw new Error("GpuMesh: createBuffer (index) failed");
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

  const indexType =
    mesh.indices instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT;

  // 5. Unbind VAO first (captures the ELEMENT_ARRAY_BUFFER binding), then the
  //    array buffer so we leave global state clean.
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

  // 6. dispose() releases the VAO + all three buffers we hold references to.
  const dispose = () => {
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(posVbo);
    gl.deleteBuffer(normVbo);
    gl.deleteBuffer(ibo);
  };

  return {
    vao,
    indexCount: mesh.indices.length,
    indexType,
    color: mesh.color,
    dispose,
  };
}
