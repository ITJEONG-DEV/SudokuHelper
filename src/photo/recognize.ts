import { GLYPH_SIZE, type Gray, type Quad, extractCells, findGridCorners, toGray, warp } from './image';

export interface ReadResult {
  values: number[];
  /** 읽기가 불확실한 칸 (숫자는 있는데 못 읽었거나 신뢰도가 낮음) */
  uncertain: number[];
}

const MAX_SIDE = 1000;
const BOARD_SIZE = 504;
const CONFIDENCE_MIN = 60;

/** 파일을 처리용 크기로 줄여 ImageData로 읽는다 */
export async function loadImage(file: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return ctx.getImageData(0, 0, w, h);
}

export function detectCorners(img: ImageData): Quad {
  return findGridCorners(toGray(img));
}

function grayToCanvas(g: Gray): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = g.width;
  canvas.height = g.height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(g.width, g.height);
  for (let i = 0; i < g.data.length; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g.data[i];
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** 한 줄의 숫자 모양을 칸 순서대로 이어 붙인 띠 이미지 */
function rowStrip(glyphs: (Gray | null)[]): HTMLCanvasElement {
  const pad = GLYPH_SIZE / 2;
  const canvas = document.createElement('canvas');
  canvas.width = GLYPH_SIZE * 9 + pad * 2;
  canvas.height = GLYPH_SIZE + pad * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  glyphs.forEach((g, k) => {
    if (g) ctx.drawImage(grayToCanvas(g), pad + k * GLYPH_SIZE, pad);
  });
  return canvas;
}

/**
 * 판을 펼치고 칸을 나눈 뒤 숫자를 읽는다.
 * 줄마다 띠 이미지로 한 번 읽고, 그 안에서 못 읽은 칸만 한 글자씩 다시 읽는다.
 */
export async function readPuzzle(img: ImageData, quad: Quad, onProgress?: (done: number, total: number) => void): Promise<ReadResult> {
  const board = warp(toGray(img), quad, BOARD_SIZE);
  const cells = extractCells(board);
  const values = new Array<number>(81).fill(0);
  const conf = new Array<number>(81).fill(100);
  const total = 9;
  onProgress?.(0, total);

  const { createWorker, PSM } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    await worker.setParameters({ tessedit_char_whitelist: '123456789', tessedit_pageseg_mode: PSM.SINGLE_LINE });
    for (let r = 0; r < 9; r++) {
      const glyphs = cells.slice(r * 9, r * 9 + 9).map((c) => c.glyph);
      if (glyphs.some(Boolean)) {
        const { data } = await worker.recognize(rowStrip(glyphs));
        const pad = GLYPH_SIZE / 2;
        for (const s of data.symbols ?? []) {
          if (!/^[1-9]$/.test(s.text)) continue;
          const mid = (s.bbox.x0 + s.bbox.x1) / 2 - pad;
          const k = Math.floor(mid / GLYPH_SIZE);
          if (k < 0 || k > 8 || !glyphs[k]) continue;
          const i = r * 9 + k;
          if (values[i] && conf[i] >= s.confidence) continue;
          values[i] = Number(s.text);
          conf[i] = s.confidence;
        }
      }
      onProgress?.(r + 1, total);
    }

    const retry = cells.flatMap((c, i) => (c.glyph && (!values[i] || conf[i] < CONFIDENCE_MIN) ? [i] : []));
    if (retry.length) {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_CHAR });
      for (const i of retry) {
        const canvas = grayToCanvas(cells[i].glyph!);
        const { data } = await worker.recognize(canvas);
        const text = data.text.trim();
        if (/^[1-9]$/.test(text) && (!values[i] || data.confidence > conf[i])) {
          values[i] = Number(text);
          conf[i] = data.confidence;
        }
      }
    }
  } finally {
    await worker.terminate();
  }

  const uncertain = cells.flatMap((c, i) => (c.glyph && (!values[i] || conf[i] < CONFIDENCE_MIN) ? [i] : []));  return { values, uncertain };
}
