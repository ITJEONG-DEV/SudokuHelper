import { describe, expect, it } from 'vitest';
import { type Gray, type Quad, extractCells, findGridCorners, homography, applyH, makeGray, warp } from './image';

/** 축에 맞춘 합성 판: 격자선 + 숫자 대신 획 모양 */
function drawBoard(filled: Set<number>): Gray {
  const g = makeGray(600, 600, 235);
  const rect = (x: number, y: number, w: number, h: number, v = 20) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) g.data[yy * 600 + xx] = v;
  };
  const x0 = 60;
  const cell = 52;
  for (let k = 0; k <= 9; k++) {
    const t = k % 3 === 0 ? 5 : 2;
    rect(x0 + k * cell - Math.floor(t / 2), x0 - 2, t, 9 * cell + 4);
    rect(x0 - 2, x0 + k * cell - Math.floor(t / 2), 9 * cell + 4, t);
  }
  for (const i of filled) {
    const r = Math.floor(i / 9);
    const c = i % 9;
    const cx = x0 + c * cell + cell / 2;
    const cy = x0 + r * cell + cell / 2;
    // 숫자 7 비슷한 모양: 윗변 + 대각 기둥
    rect(Math.round(cx - 10), Math.round(cy - 15), 20, 4);
    rect(Math.round(cx + 4), Math.round(cy - 15), 5, 31);
  }
  return g;
}

const FILLED = new Set([0, 2, 3, 10, 11, 14, 17, 40, 44, 62, 70, 80]);

describe('photo/image', () => {
  it('정면 판의 모서리를 찾는다', () => {
    const q = findGridCorners(drawBoard(FILLED));
    const expected = [
      [58, 58],
      [528, 58],
      [528, 528],
      [58, 528],
    ];
    q.forEach((p, k) => {
      expect(Math.abs(p.x - expected[k][0])).toBeLessThanOrEqual(4);
      expect(Math.abs(p.y - expected[k][1])).toBeLessThanOrEqual(4);
    });
  });

  it('숫자가 있는 칸만 골라낸다', () => {
    const g = drawBoard(FILLED);
    const board = warp(g, findGridCorners(g), 450);
    const cells = extractCells(board);
    const found = cells.flatMap((c, i) => (c.glyph ? [i] : []));
    expect(new Set(found)).toEqual(FILLED);
  });

  it('비스듬히 찍은 판도 펼쳐서 읽는다', () => {
    const flat = drawBoard(FILLED);
    const quad: Quad = [
      { x: 90, y: 40 },
      { x: 560, y: 80 },
      { x: 530, y: 570 },
      { x: 40, y: 520 },
    ];
    // 정면 이미지를 quad 모양으로 비틀어 "사진"을 만든다
    const Hinv = homography(quad, [
      { x: 0, y: 0 },
      { x: 600, y: 0 },
      { x: 600, y: 600 },
      { x: 0, y: 600 },
    ]);
    const photo = makeGray(600, 600, 250);
    for (let y = 0; y < 600; y++) {
      for (let x = 0; x < 600; x++) {
        const s = applyH(Hinv, { x, y });
        const sx = Math.round(s.x);
        const sy = Math.round(s.y);
        if (sx >= 0 && sy >= 0 && sx < 600 && sy < 600) photo.data[y * 600 + x] = flat.data[sy * 600 + sx];
      }
    }
    const board = warp(photo, findGridCorners(photo), 450);
    const found = extractCells(board).flatMap((c, i) => (c.glyph ? [i] : []));
    expect(new Set(found)).toEqual(FILLED);
  });

  it('종이 가장자리가 아니라 격자를 판으로 잡는다', () => {
    // 어두운 책상 위 흰 종이, 종이 안쪽에 여백을 두고 격자
    const paper = drawBoard(FILLED);
    const photo = makeGray(800, 800, 120);
    for (let y = 0; y < 600; y++) for (let x = 0; x < 600; x++) photo.data[(y + 100) * 800 + x + 100] = paper.data[y * 600 + x];
    const q = findGridCorners(photo);
    expect(Math.abs(q[0].x - 158)).toBeLessThanOrEqual(4);
    expect(Math.abs(q[0].y - 158)).toBeLessThanOrEqual(4);
    expect(Math.abs(q[2].x - 628)).toBeLessThanOrEqual(4);
    expect(Math.abs(q[2].y - 628)).toBeLessThanOrEqual(4);
    const found = extractCells(warp(photo, q, 450)).flatMap((c, i) => (c.glyph ? [i] : []));
    expect(new Set(found)).toEqual(FILLED);
  });

  it('호모그래피는 네 점을 정확히 옮긴다', () => {
    const src = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const dst = [
      { x: 3, y: 4 },
      { x: 20, y: 2 },
      { x: 25, y: 30 },
      { x: 1, y: 22 },
    ];
    const H = homography(src, dst);
    src.forEach((p, k) => {
      const q = applyH(H, p);
      expect(q.x).toBeCloseTo(dst[k].x, 6);
      expect(q.y).toBeCloseTo(dst[k].y, 6);
    });
  });
});
