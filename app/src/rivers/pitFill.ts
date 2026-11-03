// Pits filled before drainage (Peytavie et al. 2019, section 4), on the globe grid. No three.js, so the worker can use it.

// Priority-Flood + ε (Barnes et al. 2014), the "optimal depression filling" Peytavie et al. 2019 use before drainage.
// ε is a step float32 heights can hold, not a design value.
const FILL_EPSILON = 1e-6;

// A binary min-heap of cells by key, in fixed arrays: each cell enters once.
export class NodeHeap {
  private nodes: Int32Array;
  private keys: Float32Array;
  size = 0;

  constructor(capacity: number) {
    this.nodes = new Int32Array(capacity);
    this.keys = new Float32Array(capacity);
  }

  push(node: number, key: number): void {
    if (this.size === this.nodes.length) {
      const nodes = new Int32Array(this.nodes.length * 2);
      const keys = new Float32Array(this.keys.length * 2);
      nodes.set(this.nodes);
      keys.set(this.keys);
      this.nodes = nodes;
      this.keys = keys;
    }
    let idx = this.size++;
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      if (this.keys[parentIdx] <= key) break;
      this.nodes[idx] = this.nodes[parentIdx];
      this.keys[idx] = this.keys[parentIdx];
      idx = parentIdx;
    }
    this.nodes[idx] = node;
    this.keys[idx] = key;
  }

  topKey(): number {
    return this.keys[0];
  }

  pop(): number {
    const top = this.nodes[0];
    const lastNode = this.nodes[--this.size];
    const lastKey = this.keys[this.size];
    let idx = 0;
    while (true) {
      let child = 2 * idx + 1;
      if (child >= this.size) break;
      if (child + 1 < this.size && this.keys[child + 1] < this.keys[child]) child++;
      if (this.keys[child] >= lastKey) break;
      this.nodes[idx] = this.nodes[child];
      this.keys[idx] = this.keys[child];
      idx = child;
    }
    this.nodes[idx] = lastNode;
    this.keys[idx] = lastKey;
    return top;
  }
}

// Priority-Flood + ε on the globe grid: 8 neighbors, wrapping east to west; the sea is where the flood starts.
export function fillPits(heights: Float32Array, width: number, height: number, seaLevel: number): Float32Array {
  const filled = heights.slice();
  const isDone = new Uint8Array(heights.length);
  const heap = new NodeHeap(width * 64);
  for (let cell = 0; cell < heights.length; cell++) {
    if (heights[cell] < seaLevel) {
      isDone[cell] = 1;
      heap.push(cell, heights[cell]);
    }
  }
  while (heap.size > 0) {
    const level = heap.topKey();
    const cell = heap.pop();
    const row = Math.floor(cell / width);
    const col = cell - row * width;
    for (let dy = -1; dy <= 1; dy++) {
      const nextRow = row + dy;
      if (nextRow < 0 || nextRow >= height) continue;
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const next = nextRow * width + ((col + dx + width) % width);
        if (isDone[next]) continue;
        isDone[next] = 1;
        filled[next] = Math.max(heights[next], level + FILL_EPSILON);
        heap.push(next, filled[next]);
      }
    }
  }
  return filled;
}
