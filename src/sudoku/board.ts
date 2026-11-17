/** 81칸 보드의 좌표·단위(행·열·박스)·후보 비트마스크 도구 */

export const rowOf = (i: number) => Math.floor(i / 9);
export const colOf = (i: number) => i % 9;
export const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

export type UnitKind = 'row' | 'col' | 'box';
export interface Unit {
  kind: UnitKind;
  index: number;
  cells: number[];
}

const range9 = [0, 1, 2, 3, 4, 5, 6, 7, 8];

export const ROWS: Unit[] = range9.map((r) => ({ kind: 'row', index: r, cells: range9.map((c) => r * 9 + c) }));
export const COLS: Unit[] = range9.map((c) => ({ kind: 'col', index: c, cells: range9.map((r) => r * 9 + c) }));
export const BOXES: Unit[] = range9.map((b) => {
  const br = Math.floor(b / 3) * 3;
  const bc = (b % 3) * 3;
  return { kind: 'box', index: b, cells: range9.map((k) => (br + Math.floor(k / 3)) * 9 + bc + (k % 3)) };
});
/** 박스를 먼저 본다. 사람이 숨은 싱글을 가장 쉽게 찾는 곳이 박스다. */
export const UNITS: Unit[] = [...BOXES, ...ROWS, ...COLS];

export const PEERS: number[][] = Array.from({ length: 81 }, (_, i) => {
  const set = new Set<number>([...ROWS[rowOf(i)].cells, ...COLS[colOf(i)].cells, ...BOXES[boxOf(i)].cells]);
  set.delete(i);
  return [...set];
});

export const bit = (d: number) => 1 << d;
export const ALL = 0b1111111110;
export const has = (mask: number, d: number) => (mask & bit(d)) !== 0;
export function popcount(mask: number): number {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n++;
  return n;
}
export function digitsOf(mask: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) if (mask & bit(d)) out.push(d);
  return out;
}
export const maskOf = (digits: number[]) => digits.reduce((m, d) => m | bit(d), 0);

/** 칸이 비어 있으면 같은 행·열·박스에 없는 숫자, 차 있으면 0 */
export function computeCandidates(values: number[]): number[] {
  return values.map((v, i) => {
    if (v) return 0;
    let m = ALL;
    for (const p of PEERS[i]) if (values[p]) m &= ~bit(values[p]);
    return m;
  });
}

/** 같은 행·열·박스에 같은 숫자가 있는 칸 */
export function conflictCells(values: number[]): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < 81; i++) {
    if (!values[i]) continue;
    for (const p of PEERS[i]) if (values[p] === values[i]) out.add(i);
  }
  return out;
}

/** 81자(빈칸은 0이나 .) 또는 9줄 텍스트를 읽는다. 숫자·점 외의 글자는 무시한다. */
export function parsePuzzle(text: string): number[] | null {
  const chars = text.replace(/[^0-9.]/g, '');
  if (chars.length !== 81) return null;
  return [...chars].map((ch) => (ch === '.' ? 0 : Number(ch)));
}

export function serialize(values: number[]): string {
  const lines: string[] = [];
  for (let r = 0; r < 9; r++) lines.push(values.slice(r * 9, r * 9 + 9).join(''));
  return lines.join('\n');
}

// ---- 한국어 표기 ----

const BOX_NAMES = ['왼쪽 위', '가운데 위', '오른쪽 위', '왼쪽 가운데', '정가운데', '오른쪽 가운데', '왼쪽 아래', '가운데 아래', '오른쪽 아래'];

export const cellName = (i: number) => `${rowOf(i) + 1}행 ${colOf(i) + 1}열`;
export function unitName(u: Unit): string {
  if (u.kind === 'row') return `${u.index + 1}행`;
  if (u.kind === 'col') return `${u.index + 1}열`;
  return `${BOX_NAMES[u.index]} 박스`;
}
export const listCells = (cells: number[]) => cells.map(cellName).join(', ');
export const listDigits = (digits: number[]) => digits.join(', ');

const DIGIT_HAS_BATCHIM: Record<string, boolean> = {
  '0': true, '1': true, '2': false, '3': true, '4': false, '5': false, '6': true, '7': true, '8': true, '9': false,
};

/** 마지막 글자의 받침에 맞춰 조사를 고른다. 예: josa('3행', '을', '를') → '3행을' */
export function josa(word: string, withBatchim: string, withoutBatchim: string): string {
  const last = word[word.length - 1];
  let batchim: boolean;
  if (last in DIGIT_HAS_BATCHIM) batchim = DIGIT_HAS_BATCHIM[last];
  else {
    const code = last.charCodeAt(0) - 0xac00;
    batchim = code >= 0 && code <= 11171 ? code % 28 !== 0 : false;
  }
  return word + (batchim ? withBatchim : withoutBatchim);
}
