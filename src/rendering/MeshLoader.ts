export type MeshData = {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint16Array | Uint32Array;
  color: [number, number, number, number];
};

export type LoadedModel = {
  id: string;
  meshes: MeshData[];
};

const GLB_MAGIC = 0x46546C67;
const CHUNK_JSON = 0x4E4F534A;
const CHUNK_BIN = 0x004E4942;

const COMPONENT_COUNTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

function readAccessor(
  gltf: any,
  bin: ArrayBuffer,
  accessorIndex: number,
): Float32Array | Uint16Array | Uint32Array {
  const acc = gltf.accessors[accessorIndex];
  const bv = gltf.bufferViews[acc.bufferView];

  const byteOffset = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const count = acc.count;
  const numComponents = COMPONENT_COUNTS[acc.type] ?? 1;
  const total = count * numComponents;

  if (acc.componentType === 5126) {
    return new Float32Array(bin, byteOffset, total);
  } else if (acc.componentType === 5123) {
    return new Uint16Array(bin, byteOffset, total);
  } else if (acc.componentType === 5125) {
    return new Uint32Array(bin, byteOffset, total);
  }

  throw new Error(`MeshLoader: unsupported componentType ${acc.componentType}`);
}

function computeFlatNormals(
  positions: Float32Array,
  indices: Uint16Array | Uint32Array,
): Float32Array {
  const normals = new Float32Array(positions.length);

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    const e1x = positions[i1] - positions[i0];
    const e1y = positions[i1 + 1] - positions[i0 + 1];
    const e1z = positions[i1 + 2] - positions[i0 + 2];

    const e2x = positions[i2] - positions[i0];
    const e2y = positions[i2 + 1] - positions[i0 + 1];
    const e2z = positions[i2 + 2] - positions[i0 + 2];

    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;

    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;

    for (const idx of [i0, i1, i2]) {
      normals[idx] += nx;
      normals[idx + 1] += ny;
      normals[idx + 2] += nz;
    }
  }

  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= len;
    normals[i + 1] /= len;
    normals[i + 2] /= len;
  }

  return normals;
}

export async function loadGLB(url: string): Promise<LoadedModel> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`MeshLoader: fetch failed ${resp.status} ${url}`);
  const buf = await resp.arrayBuffer();

  if (buf.byteLength < 12) throw new Error("MeshLoader: file too small for GLB header");

  const header = new DataView(buf);
  const magic = header.getUint32(0, true);
  if (magic !== GLB_MAGIC) throw new Error(`MeshLoader: invalid GLB magic 0x${magic.toString(16)}`);

  const version = header.getUint32(4, true);
  if (version !== 2) throw new Error(`MeshLoader: unsupported GLB version ${version}`);

  let jsonChunk: any = null;
  let binChunk: ArrayBuffer | null = null;
  let offset = 12;

  while (offset < buf.byteLength) {
    if (offset + 8 > buf.byteLength) break;
    const chunkLen = header.getUint32(offset, true);
    const chunkType = header.getUint32(offset + 4, true);
    const chunkStart = offset + 8;

    if (chunkType === CHUNK_JSON) {
      const textBytes = new Uint8Array(buf, chunkStart, chunkLen);
      const text = new TextDecoder().decode(textBytes);
      jsonChunk = JSON.parse(text);
    } else if (chunkType === CHUNK_BIN) {
      binChunk = buf.slice(chunkStart, chunkStart + chunkLen);
    }

    offset = chunkStart + chunkLen;
  }

  if (!jsonChunk) throw new Error("MeshLoader: no JSON chunk found");
  if (!binChunk) throw new Error("MeshLoader: no BIN chunk found");

  const gltf = jsonChunk;
  const meshes: MeshData[] = [];

  if (!gltf.meshes || gltf.meshes.length === 0) {
    throw new Error("MeshLoader: no meshes in GLB");
  }

  for (const mesh of gltf.meshes) {
    if (!mesh.primitives || mesh.primitives.length === 0) continue;

    const prim = mesh.primitives[0];

    if (prim.attributes.POSITION === undefined) {
      console.warn("MeshLoader: primitive missing POSITION, skipping");
      continue;
    }

    const positions = readAccessor(gltf, binChunk, prim.attributes.POSITION) as Float32Array;

    let normals: Float32Array;
    if (prim.attributes.NORMAL !== undefined) {
      normals = readAccessor(gltf, binChunk, prim.attributes.NORMAL) as Float32Array;
    } else {
      console.warn("MeshLoader: NORMAL accessor missing, computing flat normals");
      const tempIndices =
        prim.indices !== undefined
          ? (readAccessor(gltf, binChunk, prim.indices) as Uint16Array | Uint32Array)
          : generateSequentialIndices(positions.length / 3);
      normals = computeFlatNormals(positions, tempIndices);
    }

    let indices: Uint16Array | Uint32Array;
    if (prim.indices !== undefined) {
      indices = readAccessor(gltf, binChunk, prim.indices) as Uint16Array | Uint32Array;
    } else {
      indices = generateSequentialIndices(positions.length / 3);
    }

    let color: [number, number, number, number] = [0.8, 0.8, 0.8, 1.0];
    if (prim.material !== undefined && gltf.materials) {
      const mat = gltf.materials[prim.material];
      const factor = mat?.pbrMetallicRoughness?.baseColorFactor;
      if (Array.isArray(factor) && factor.length >= 4) {
        color = [factor[0], factor[1], factor[2], factor[3]];
      }
    }

    meshes.push({ positions, normals, indices, color });
  }

  return { id: url, meshes };
}

function generateSequentialIndices(vertexCount: number): Uint16Array | Uint32Array {
  if (vertexCount <= 65535) {
    const arr = new Uint16Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) arr[i] = i;
    return arr;
  }
  const arr = new Uint32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) arr[i] = i;
  return arr;
}
