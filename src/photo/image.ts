/**
 * 사진에서 스도쿠 판을 찾고 칸별 숫자 모양을 잘라내는 순수 함수 모음.
 * 브라우저 API에 의존하지 않아 node 테스트에서도 돈다.
 */

/** 회색조 이미지. 0 = 검정, 255 = 흰색 */
export interface Gray {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Point {
  x: number;
  y: number;
}

/** 왼쪽 위, 오른쪽 위, 오른쪽 아래, 왼쪽 아래 */
export type Quad = [Point, Point, Point, Point];

export function makeGray(width: number, height: number, fill = 255): Gray {
  return { width, height, data: new Uint8ClampedArray(width * height).fill(fill) };
}

export function toGray(img: { width: number; height: number; data: Uint8ClampedArray }): Gray {
  const out = makeGray(img.width, img.height);
  for (let i = 0, j = 0; i < out.data.length; i++, j += 4) {
    out.data[i] = (img.data[j] * 299 + img.data[j + 1] * 587 + img.data[j + 2] * 114) / 1000;
  }
  return out;
}

/** 주변 평균보다 c만큼 어두운 픽셀을 잉크(1)로 본다. 조명이 고르지 않은 사진에 강하다. */
export function adaptiveThreshold(g: Gray, radius: number, c: number): Uint8Array {
  const { width: w, height: h, data } = g;
  const W = w + 1;
  const sum = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x];
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + row;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w, x + radius + 1);
      const s = sum[y1 * W + x1] - sum[y0 * W + x1] - sum[y1 * W + x0] + sum[y0 * W + x0];
      const mean = s / ((x1 - x0) * (y1 - y0));
      if (data[y * w + x] < mean - c) out[y * w + x] = 1;
    }
  }
  return out;
}

export interface Component {
  pixels: number[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 잉크 픽셀의 8방향 연결 덩어리. 영역(x0..x1, y0..y1)을 주면 그 안에서만 찾는다. */
export function components(
  bin: Uint8Array,
  w: number,
  region = { x0: 0, y0: 0, x1: w, y1: bin.length / w },
): Component[] {
  const { x0, y0, x1, y1 } = region;
  const seen = new Uint8Array(bin.length);
  const out: Component[] = [];
  const stack: number[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const start = y * w + x;
      if (!bin[start] || seen[start]) continue;
      const comp: Component = { pixels: [], minX: x, minY: y, maxX: x, maxY: y };
      seen[start] = 1;
      stack.push(start);
      while (stack.length) {
        const p = stack.pop()!;
        const px = p % w;
        const py = (p - px) / w;
        comp.pixels.push(p);
        if (px < comp.minX) comp.minX = px;
        if (px > comp.maxX) comp.maxX = px;
        if (py < comp.minY) comp.minY = py;
        if (py > comp.maxY) comp.maxY = py;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = py + dy;
          if (ny < y0 || ny >= y1) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx;
            if (nx < x0 || nx >= x1) continue;
            const q = ny * w + nx;
            if (bin[q] && !seen[q]) {
              seen[q] = 1;
              stack.push(q);
            }
          }
        }
      }
      out.push(comp);
    }
  }
  return out;
}

/**
 * 판의 네 모서리를 찾는다. 격자선은 하나로 이어진 큰 덩어리라는 점을 쓴다.
 * 종이 가장자리처럼 격자가 아닌 큰 덩어리도 있으므로, 큰 덩어리 몇 개를 펼쳐 보고
 * 격자선이 9칸 간격으로 가장 잘 맞는 것을 고른다.
 */
export function findGridCorners(g: Gray): Quad {
  const { width: w, height: h } = g;
  const bin = adaptiveThreshold(g, Math.max(7, Math.round(Math.min(w, h) / 50)), 8);
  const bboxArea = (c: Component) => (c.maxX - c.minX + 1) * (c.maxY - c.minY + 1);
  const candidates = components(bin, w)
    .filter((c) => bboxArea(c) >= 0.04 * w * h && c.pixels.length >= Math.min(w, h))
    .sort((a, b) => bboxArea(b) - bboxArea(a))
    .slice(0, 6);
  let best: Quad | null = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const quad = extremeCorners(c, w);
    const score = gridScore(g, quad);
    if (score > bestScore) {
      best = quad;
      bestScore = score;
    }
  }
  if (best) return best;
  const mx = w * 0.05;
  const my = h * 0.05;
  return [
    { x: mx, y: my },
    { x: w - mx, y: my },
    { x: w - mx, y: h - my },
    { x: mx, y: h - my },
  ];
}

/** 펼쳤을 때 10개 격자선 자리에 잉크가 몰려 있는 정도 */
export function gridScore(g: Gray, quad: Quad): number {
  const step = 20;
  const size = step * 9;
  const board = warp(g, quad, size);
  const bin = adaptiveThreshold(board, 5, 8);
  const col = new Float64Array(size);
  const row = new Float64Array(size);
  let total = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!bin[y * size + x]) continue;
      col[x]++;
      row[y]++;
      total++;
    }
  }
  const mean = total / (size * size);
  const lineAt = (prof: Float64Array, k: number) => {
    let m = 0;
    for (let d = -2; d <= 2; d++) {
      const i = Math.min(size - 1, Math.max(0, k * step + d));
      m = Math.max(m, prof[i] / size);
    }
    return m;
  };
  let s = 0;
  for (let k = 0; k <= 9; k++) s += lineAt(col, k) + lineAt(row, k);
  return s / 20 - mean;
}

function extremeCorners(best: Component, w: number): Quad {
  let tl = 0, tr = 0, br = 0, bl = 0;
  let sMin = Infinity, sMax = -Infinity, dMin = Infinity, dMax = -Infinity;
  for (const p of best.pixels) {
    const x = p % w;
    const y = (p - x) / w;
    const s = x + y;
    const d = x - y;
    if (s < sMin) { sMin = s; tl = p; }
    if (s > sMax) { sMax = s; br = p; }
    if (d > dMax) { dMax = d; tr = p; }
    if (d < dMin) { dMin = d; bl = p; }
  }
  const pt = (p: number): Point => ({ x: p % w, y: Math.floor(p / w) });
  return [pt(tl), pt(tr), pt(br), pt(bl)];
}

/** src 네 점을 dst 네 점으로 보내는 3x3 투영 변환 */
export function homography(src: Point[], dst: Point[]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let col = 0; col < 8; col++) {
    let piv = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let k = col; k < 9; k++) A[r][k] -= f * A[col][k];
    }
  }
  const hv = A.map((row, i) => row[8] / row[i]);
  return [...hv, 1];
}

export function applyH(H: number[], p: Point): Point {
  const z = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / z, y: (H[3] * p.x + H[4] * p.y + H[5]) / z };
}

/** quad 안쪽을 size x size 정사각형으로 펼친다 */
export function warp(g: Gray, quad: Quad, size: number): Gray {
  const square: Point[] = [
    { x: 0, y: 0 },
    { x: size, y: 0 },
    { x: size, y: size },
    { x: 0, y: size },
  ];
  const H = homography(square, quad);
  const out = makeGray(size, size);
  const { width: w, height: h, data } = g;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = applyH(H, { x: x + 0.5, y: y + 0.5 });
      const sx = s.x - 0.5;
      const sy = s.y - 0.5;
      const ix = Math.floor(sx);
      const iy = Math.floor(sy);
      if (ix < 0 || iy < 0 || ix >= w - 1 || iy >= h - 1) continue;
      const fx = sx - ix;
      const fy = sy - iy;
      const i = iy * w + ix;
      out.data[y * size + x] =
        data[i] * (1 - fx) * (1 - fy) + data[i + 1] * fx * (1 - fy) + data[i + w] * (1 - fx) * fy + data[i + w + 1] * fx * fy;
    }
  }
  return out;
}

export interface CellImage {
  /** 숫자가 없는 칸이면 null. 있으면 흰 바탕에 검은 숫자를 가운데 놓은 정사각형 */
  glyph: Gray | null;
}

export const GLYPH_SIZE = 80;

/** 펼친 판을 81칸으로 나누고 칸마다 숫자 모양을 찾는다 */
export function extractCells(board: Gray): CellImage[] {
  const size = board.width;
  const cell = size / 9;
  const bin = adaptiveThreshold(board, Math.max(5, Math.round(cell / 4)), 10);
  const out: CellImage[] = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const margin = Math.round(cell * 0.12);
      const x0 = Math.round(c * cell) + margin;
      const y0 = Math.round(r * cell) + margin;
      const x1 = Math.round((c + 1) * cell) - margin;
      const y1 = Math.round((r + 1) * cell) - margin;
      const inner = x1 - x0;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      let best: Component | null = null;
      let bestDist = Infinity;
      for (const comp of components(bin, size, { x0, y0, x1, y1 })) {
        const bw = comp.maxX - comp.minX + 1;
        const bh = comp.maxY - comp.minY + 1;
        if (bh < inner * 0.35 || comp.pixels.length < inner * inner * 0.02) continue;
        // 격자선 조각: 칸 가장자리에 붙은 길고 가는 덩어리
        const thinLong = (bw < inner * 0.15 && bh > inner * 0.85) || (bh < inner * 0.15 && bw > inner * 0.85);
        const touches = comp.minX === x0 || comp.maxX === x1 - 1 || comp.minY === y0 || comp.maxY === y1 - 1;
        if (thinLong && touches) continue;
        if (bw > inner * 0.95 && bh > inner * 0.95) continue;
        const d = Math.hypot((comp.minX + comp.maxX) / 2 - cx, (comp.minY + comp.maxY) / 2 - cy);
        if (d > inner * 0.35) continue;
        if (d < bestDist) {
          best = comp;
          bestDist = d;
        }
      }
      out.push({ glyph: best ? renderGlyph(best, board) : null });
    }
  }
  return out;
}

/**
 * 숫자 덩어리 영역을 회색 농담 그대로 잘라 크기를 맞춘다.
 * 글자 인식기는 흑백으로 자른 것보다 부드러운 가장자리를 더 잘 읽는다.
 */
function renderGlyph(comp: Component, board: Gray): Gray {
  const w = board.width;
  const pad = 1;
  const x0 = Math.max(0, comp.minX - pad);
  const y0 = Math.max(0, comp.minY - pad);
  const x1 = Math.min(w - 1, comp.maxX + pad);
  const y1 = Math.min(board.height - 1, comp.maxY + pad);
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;

  // 대비 맞추기: 덩어리 픽셀의 평균을 검정, 영역 밝은 쪽을 흰색으로
  let ink = 0;
  for (const p of comp.pixels) ink += board.data[p];
  ink /= comp.pixels.length;
  let paper = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) paper = Math.max(paper, board.data[y * w + x]);
  const range = Math.max(1, paper - ink);

  const scale = Math.min((GLYPH_SIZE * 0.6) / bh, (GLYPH_SIZE * 0.6) / bw);
  const ow = Math.max(1, Math.round(bw * scale));
  const oh = Math.max(1, Math.round(bh * scale));
  const ox = Math.round((GLYPH_SIZE - ow) / 2);
  const oy = Math.round((GLYPH_SIZE - oh) / 2);
  const out = makeGray(GLYPH_SIZE, GLYPH_SIZE);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const sx = Math.min(bw - 1.001, Math.max(0, (x + 0.5) / scale - 0.5));
      const sy = Math.min(bh - 1.001, Math.max(0, (y + 0.5) / scale - 0.5));
      const ix = Math.floor(sx);
      const iy = Math.floor(sy);
      const fx = sx - ix;
      const fy = sy - iy;
      const i = (y0 + iy) * w + x0 + ix;
      const v =
        board.data[i] * (1 - fx) * (1 - fy) + board.data[i + 1] * fx * (1 - fy) + board.data[i + w] * (1 - fx) * fy + board.data[i + w + 1] * fx * fy;
      out.data[(oy + y) * GLYPH_SIZE + ox + x] = ((v - ink) / range) * 255;
    }
  }
  return out;
}
