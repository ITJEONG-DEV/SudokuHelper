import {
  BOXES,
  COLS,
  PEERS,
  ROWS,
  UNITS,
  type Unit,
  bit,
  boxOf,
  cellName,
  colOf,
  computeCandidates,
  digitsOf,
  has,
  josa,
  listCells,
  listDigits,
  popcount,
  rowOf,
  unitName,
} from './board';

export type HintKind =
  | 'wrong-value'
  | 'conflict'
  | 'missing-candidate'
  | 'basic-elimination'
  | 'hidden-single'
  | 'naked-single'
  | 'pointing'
  | 'claiming'
  | 'naked-subset'
  | 'hidden-subset'
  | 'x-wing'
  | 'reveal';

export interface Elimination {
  cell: number;
  digit: number;
}

export interface Hint {
  kind: HintKind;
  /** 기법 이름 (2단계부터 보여준다) */
  name: string;
  /** 1단계: 어디를 볼지 / 2단계: 무엇을 찾을지 / 3단계: 칸과 이유 */
  steps: [string, string, string];
  /** 1단계부터 강조할 칸 */
  focus: number[];
  /** 3단계에서 강조할 근거 칸 */
  keyCells: number[];
  place?: { cell: number; digit: number };
  eliminate?: Elimination[];
  /** 지워야 할 잘못된 숫자 */
  clear?: number;
  /** 다시 적어야 할 후보 */
  restore?: { cell: number; digit: number };
}

export interface HintInput {
  values: number[];
  /** 사용자가 적은 후보. 0이면 그 칸은 아직 후보를 적지 않은 것으로 본다. */
  marks: number[];
  given: boolean[];
  solution: number[] | null;
}

/** 빈칸의 현재 후보: 사용자가 적은 후보가 있으면 그것, 없으면 계산한 후보 */
export function workingCandidates(values: number[], marks: number[]): number[] {
  const computed = computeCandidates(values);
  return values.map((v, i) => (v ? 0 : marks[i] || computed[i]));
}

const lineUnit = (kind: 'row' | 'col', index: number) => (kind === 'row' ? ROWS[index] : COLS[index]);
const lineOf = (kind: 'row' | 'col', cell: number) => (kind === 'row' ? rowOf(cell) : colOf(cell));

function combinations<T>(items: T[], n: number): T[][] {
  const out: T[][] = [];
  const pick = (start: number, acc: T[]) => {
    if (acc.length === n) {
      out.push(acc.slice());
      return;
    }
    for (let i = start; i < items.length; i++) {
      acc.push(items[i]);
      pick(i + 1, acc);
      acc.pop();
    }
  };
  pick(0, []);
  return out;
}

const subsetWord = (n: number) => (n === 2 ? '쌍' : '세 쌍');

// ---------- 오류 점검 ----------

function findConflict(values: number[], given: boolean[]): Hint | null {
  for (const u of UNITS) {
    for (let d = 1; d <= 9; d++) {
      const cells = u.cells.filter((c) => values[c] === d);
      if (cells.length < 2) continue;
      const wrong = cells.find((c) => !given[c]) ?? cells[0];
      const name = unitName(u);
      return {
        kind: 'conflict',
        name: '같은 숫자 중복',
        steps: [
          `${josa(name, '을', '를')} 다시 확인해 보세요. 같은 숫자가 두 번 들어가 있어요.`,
          `${name}에 ${josa(String(d), '이', '가')} 두 번 있어요.`,
          `${listCells(cells)}에 모두 ${josa(String(d), '이', '가')} 있어요. ${cellName(wrong)}의 ${josa(String(d), '을', '를')} 지우세요.`,
        ],
        focus: u.cells,
        keyCells: cells,
        clear: wrong,
      };
    }
  }
  return null;
}

function findWrongValue(input: HintInput): Hint | null {
  const { values, given, solution } = input;
  if (!solution) return null;
  for (let i = 0; i < 81; i++) {
    if (!values[i] || given[i] || values[i] === solution[i]) continue;
    const d = String(values[i]);
    const box = BOXES[boxOf(i)];
    return {
      kind: 'wrong-value',
      name: '잘못 채운 숫자',
      steps: [
        `${josa(unitName(box), '을', '를')} 다시 확인해 보세요. 잘못 채운 숫자가 있어요.`,
        `${cellName(i)}의 ${josa(d, '이', '가')} 정답과 달라요.`,
        `${cellName(i)}의 ${josa(d, '을', '를')} 지우세요. 이 숫자를 두고 계속 풀면 뒤에서 모순이 생겨요.`,
      ],
      focus: box.cells,
      keyCells: [i],
      clear: i,
    };
  }
  return null;
}

function findMissingCandidate(input: HintInput): Hint | null {
  const { values, marks, solution } = input;
  if (!solution) return null;
  for (let i = 0; i < 81; i++) {
    if (values[i] || !marks[i] || has(marks[i], solution[i])) continue;
    const box = BOXES[boxOf(i)];
    const d = String(solution[i]);
    return {
      kind: 'missing-candidate',
      name: '지우면 안 되는 후보',
      steps: [
        `${unitName(box)}의 후보수를 다시 확인해 보세요. 잘못 지운 후보가 있어요.`,
        `${cellName(i)}의 후보에서 지우면 안 되는 숫자를 지웠어요.`,
        `${cellName(i)}에 ${josa(d, '을', '를')} 후보로 다시 적으세요. 이 칸에 들어갈 숫자예요.`,
      ],
      focus: box.cells,
      keyCells: [i],
      restore: { cell: i, digit: solution[i] },
    };
  }
  return null;
}

/** 사용자가 적은 후보 중 같은 행·열·박스에 이미 놓인 숫자 */
function findBasicElimination(values: number[], marks: number[]): Hint | null {
  for (let p = 0; p < 81; p++) {
    const d = values[p];
    if (!d) continue;
    const targets = PEERS[p].filter((i) => !values[i] && has(marks[i], d));
    if (!targets.length) continue;
    const ds = String(d);
    return {
      kind: 'basic-elimination',
      name: '기본 후보 정리',
      steps: [
        `후보수 중에 이미 쓰인 숫자가 남아 있어요. ${cellName(p)} 주변을 보세요.`,
        `${cellName(p)}의 ${ds}와 같은 행·열·박스에 있는 칸의 후보를 보세요.`,
        `${listCells(targets)}에서 ${josa(ds, '을', '를')} 지우세요. ${cellName(p)}에 이미 ${josa(ds, '이', '가')} 있어요.`,
      ],
      focus: [p, ...PEERS[p]],
      keyCells: [p],
      eliminate: targets.map((cell) => ({ cell, digit: d })),
    };
  }
  return null;
}

// ---------- 채우기 ----------

function findHiddenSingle(values: number[], cand: number[], units: Unit[]): Hint | null {
  for (const u of units) {
    for (let d = 1; d <= 9; d++) {
      if (u.cells.some((c) => values[c] === d)) continue;
      const pos = u.cells.filter((c) => !values[c] && has(cand[c], d));
      if (pos.length !== 1) continue;
      const name = unitName(u);
      const ds = String(d);
      return {
        kind: 'hidden-single',
        name: '숨은 싱글',
        steps: [
          `${josa(name, '을', '를')} 보세요.`,
          `${name}에서 ${josa(ds, '이', '가')} 들어갈 수 있는 칸을 세어 보세요. 한 곳뿐이에요.`,
          `${name}에서 ${josa(ds, '이', '가')} 들어갈 수 있는 곳은 ${cellName(pos[0])}뿐이에요. 다른 칸은 같은 행·열·박스에 ${josa(ds, '이', '가')} 있거나 후보에서 지워졌어요.`,
        ],
        focus: u.cells,
        keyCells: pos,
        place: { cell: pos[0], digit: d },
      };
    }
  }
  return null;
}

function findNakedSingle(values: number[], cand: number[]): Hint | null {
  for (let i = 0; i < 81; i++) {
    if (values[i] || popcount(cand[i]) !== 1) continue;
    const d = digitsOf(cand[i])[0];
    const box = BOXES[boxOf(i)];
    return {
      kind: 'naked-single',
      name: '외톨이 후보',
      steps: [
        `${josa(unitName(box), '을', '를')} 보세요.`,
        `이 박스에 후보가 하나만 남은 칸이 있어요.`,
        `${cellName(i)}에는 ${d}만 들어갈 수 있어요. 나머지 숫자는 같은 행·열·박스에 있거나 후보에서 지워졌어요.`,
      ],
      focus: box.cells,
      keyCells: [i],
      place: { cell: i, digit: d },
    };
  }
  return null;
}

// ---------- 후보 지우기 ----------

function findPointing(values: number[], cand: number[]): Hint | null {
  for (const box of BOXES) {
    for (let d = 1; d <= 9; d++) {
      const pos = box.cells.filter((c) => !values[c] && has(cand[c], d));
      if (pos.length < 2) continue;
      for (const kind of ['row', 'col'] as const) {
        const lines = new Set(pos.map((c) => lineOf(kind, c)));
        if (lines.size !== 1) continue;
        const line = lineUnit(kind, [...lines][0]);
        const elim = line.cells.filter((c) => boxOf(c) !== box.index && !values[c] && has(cand[c], d));
        if (!elim.length) continue;
        const bn = unitName(box);
        const ln = unitName(line);
        const ds = String(d);
        return {
          kind: 'pointing',
          name: '박스-줄 교차 (포인팅)',
          steps: [
            `${bn}의 ${josa(ds, '을', '를')} 보세요.`,
            `${bn}에서 ${josa(ds, '이', '가')} 갈 수 있는 칸이 모두 ${ln}에 몰려 있어요. 그러면 ${ln}의 다른 칸에서 ${josa(ds, '을', '를')} 지울 수 있어요.`,
            `${bn}의 ${josa(ds, '은', '는')} ${listCells(pos)} 중 하나에 들어가요. 모두 ${ln}이라 ${ln}의 다른 칸 ${listCells(elim)}에서 ${josa(ds, '을', '를')} 지우세요.`,
          ],
          focus: box.cells,
          keyCells: pos,
          eliminate: elim.map((cell) => ({ cell, digit: d })),
        };
      }
    }
  }
  return null;
}

function findClaiming(values: number[], cand: number[]): Hint | null {
  for (const line of [...ROWS, ...COLS]) {
    for (let d = 1; d <= 9; d++) {
      const pos = line.cells.filter((c) => !values[c] && has(cand[c], d));
      if (pos.length < 2) continue;
      const boxes = new Set(pos.map(boxOf));
      if (boxes.size !== 1) continue;
      const box = BOXES[[...boxes][0]];
      const elim = box.cells.filter((c) => !line.cells.includes(c) && !values[c] && has(cand[c], d));
      if (!elim.length) continue;
      const bn = unitName(box);
      const ln = unitName(line);
      const ds = String(d);
      return {
        kind: 'claiming',
        name: '줄-박스 교차 (클레이밍)',
        steps: [
          `${ln}의 ${josa(ds, '을', '를')} 보세요.`,
          `${ln}에서 ${josa(ds, '이', '가')} 갈 수 있는 칸이 모두 한 박스 안에 있어요. 그러면 그 박스의 다른 칸에서 ${josa(ds, '을', '를')} 지울 수 있어요.`,
          `${ln}의 ${josa(ds, '은', '는')} ${listCells(pos)} 중 하나에 들어가요. 모두 ${bn}라서 이 박스의 다른 칸 ${listCells(elim)}에서 ${josa(ds, '을', '를')} 지우세요.`,
        ],
        focus: line.cells,
        keyCells: pos,
        eliminate: elim.map((cell) => ({ cell, digit: d })),
      };
    }
  }
  return null;
}

function findNakedSubset(values: number[], cand: number[], n: number): Hint | null {
  for (const u of UNITS) {
    const empty = u.cells.filter((c) => !values[c] && popcount(cand[c]) <= n);
    for (const combo of combinations(empty, n)) {
      const union = combo.reduce((m, c) => m | cand[c], 0);
      if (popcount(union) !== n) continue;
      const digits = digitsOf(union);
      const elim: Elimination[] = [];
      for (const c of u.cells) {
        if (values[c] || combo.includes(c)) continue;
        for (const d of digits) if (has(cand[c], d)) elim.push({ cell: c, digit: d });
      }
      if (!elim.length) continue;
      const name = unitName(u);
      const dl = listDigits(digits);
      return {
        kind: 'naked-subset',
        name: `드러난 ${subsetWord(n)} (네이키드 ${n === 2 ? '페어' : '트리플'})`,
        steps: [
          `${josa(name, '을', '를')} 보세요.`,
          `${name}에 후보가 같은 숫자 ${n}개로만 이루어진 칸 ${n}개가 있어요. 그 숫자들은 이 칸들이 나눠 가져요.`,
          `${listCells(combo)}의 후보는 ${dl}뿐이에요. 이 숫자들은 이 ${n}칸에 들어가니 ${name}의 다른 칸에서 ${josa(dl, '을', '를')} 지우세요.`,
        ],
        focus: u.cells,
        keyCells: combo,
        eliminate: elim,
      };
    }
  }
  return null;
}

function findHiddenSubset(values: number[], cand: number[], n: number): Hint | null {
  for (const u of UNITS) {
    const missing = [];
    for (let d = 1; d <= 9; d++) if (!u.cells.some((c) => values[c] === d)) missing.push(d);
    for (const digits of combinations(missing, n)) {
      const cells = u.cells.filter((c) => !values[c] && digits.some((d) => has(cand[c], d)));
      if (cells.length !== n) continue;
      if (!digits.every((d) => cells.some((c) => has(cand[c], d)))) continue;
      const keep = digits.reduce((m, d) => m | bit(d), 0);
      const elim: Elimination[] = [];
      for (const c of cells) for (const d of digitsOf(cand[c] & ~keep)) elim.push({ cell: c, digit: d });
      if (!elim.length) continue;
      const name = unitName(u);
      const dl = listDigits(digits);
      return {
        kind: 'hidden-subset',
        name: `숨은 ${subsetWord(n)} (히든 ${n === 2 ? '페어' : '트리플'})`,
        steps: [
          `${josa(name, '을', '를')} 보세요.`,
          `${name}에서 숫자 ${josa(dl, '이', '가')} 갈 수 있는 칸을 세어 보세요. ${n}개 숫자가 똑같은 ${n}칸에만 나와요.`,
          `${name}에서 ${josa(dl, '은', '는')} ${listCells(cells)}에만 갈 수 있어요. 이 ${n}칸은 이 숫자들이 차지하니 이 칸들의 다른 후보를 지우세요.`,
        ],
        focus: u.cells,
        keyCells: cells,
        eliminate: elim,
      };
    }
  }
  return null;
}

function findXWing(values: number[], cand: number[]): Hint | null {
  for (let d = 1; d <= 9; d++) {
    for (const kind of ['row', 'col'] as const) {
      const other = kind === 'row' ? 'col' : 'row';
      const lines: { index: number; pos: number[] }[] = [];
      for (let i = 0; i < 9; i++) {
        const pos = lineUnit(kind, i).cells.filter((c) => !values[c] && has(cand[c], d));
        if (pos.length === 2) lines.push({ index: i, pos });
      }
      for (const [a, b] of combinations(lines, 2)) {
        const ka = a.pos.map((c) => lineOf(other, c));
        const kb = b.pos.map((c) => lineOf(other, c));
        if (ka[0] !== kb[0] || ka[1] !== kb[1]) continue;
        const elim: Elimination[] = [];
        for (const k of ka) {
          for (const c of lineUnit(other, k).cells) {
            if (lineOf(kind, c) === a.index || lineOf(kind, c) === b.index) continue;
            if (!values[c] && has(cand[c], d)) elim.push({ cell: c, digit: d });
          }
        }
        if (!elim.length) continue;
        const ds = String(d);
        const la = unitName(lineUnit(kind, a.index));
        const lb = unitName(lineUnit(kind, b.index));
        const oa = unitName(lineUnit(other, ka[0]));
        const ob = unitName(lineUnit(other, ka[1]));
        const corners = [...a.pos, ...b.pos];
        return {
          kind: 'x-wing',
          name: 'X-윙',
          steps: [
            `숫자 ${josa(ds, '을', '를')} 보세요. ${la}과 ${lb}에 주목하세요.`,
            `${la}과 ${lb}에서 ${josa(ds, '이', '가')} 갈 수 있는 칸이 각각 두 곳뿐이고, 그 위치가 같은 두 ${other === 'col' ? '열' : '행'}에 있어요.`,
            `${josa(ds, '은', '는')} ${listCells(corners)} 중 대각선 두 칸에 들어가요. 어느 쪽이든 ${oa}과 ${ob}의 ${josa(ds, '은', '는')} ${la}·${lb}에서 채워지니, ${oa}·${ob}의 다른 칸에서 ${josa(ds, '을', '를')} 지우세요.`,
          ],
          focus: [...lineUnit(kind, a.index).cells, ...lineUnit(kind, b.index).cells],
          keyCells: corners,
          eliminate: elim,
        };
      }
    }
  }
  return null;
}

function reveal(values: number[], cand: number[], solution: number[] | null): Hint | null {
  if (!solution) return null;
  let best = -1;
  for (let i = 0; i < 81; i++) {
    if (values[i]) continue;
    if (best < 0 || popcount(cand[i]) < popcount(cand[best])) best = i;
  }
  if (best < 0) return null;
  const d = String(solution[best]);
  const box = BOXES[boxOf(best)];
  return {
    kind: 'reveal',
    name: '고급 기법 필요',
    steps: [
      `여기서부터는 이 앱이 아는 기법(숨은 싱글·교차·쌍·X-윙)으로 풀리지 않아요. 후보가 가장 적은 칸부터 보세요.`,
      `${cellName(best)}의 후보는 ${listDigits(digitsOf(cand[best]))}예요. 하나를 넣고 모순이 생기는지 따라가 볼 수 있어요.`,
      `${cellName(best)}의 답은 ${d}예요.`,
    ],
    focus: box.cells,
    keyCells: [best],
    place: { cell: best, digit: solution[best] },
  };
}

/** 사람이 쓰는 순서대로 기법을 시도해 다음 한 단계를 찾는다. 다 풀렸으면 null. */
export function findHint(input: HintInput): Hint | null {
  const { values, marks, given, solution } = input;
  if (values.every((v) => v)) {
    return findConflict(values, given) ?? findWrongValue(input);
  }

  const err = findConflict(values, given) ?? findWrongValue(input) ?? findMissingCandidate(input);
  if (err) return err;

  const basic = findBasicElimination(values, marks);
  if (basic) return basic;

  const cand = workingCandidates(values, marks);
  return (
    findHiddenSingle(values, cand, BOXES) ??
    findNakedSingle(values, cand) ??
    findHiddenSingle(values, cand, [...ROWS, ...COLS]) ??
    findPointing(values, cand) ??
    findClaiming(values, cand) ??
    findNakedSubset(values, cand, 2) ??
    findHiddenSubset(values, cand, 2) ??
    findNakedSubset(values, cand, 3) ??
    findHiddenSubset(values, cand, 3) ??
    findXWing(values, cand) ??
    reveal(values, cand, solution)
  );
}

/** 힌트를 판에 적용한 새 상태를 돌려준다. 후보를 적지 않은 칸을 지울 때는 계산한 후보를 먼저 적는다. */
export function applyHint(hint: Hint, values: number[], marks: number[]): { values: number[]; marks: number[] } {
  const v = values.slice();
  const m = marks.slice();
  if (hint.clear !== undefined) v[hint.clear] = 0;
  if (hint.restore) m[hint.restore.cell] |= bit(hint.restore.digit);
  if (hint.place) {
    v[hint.place.cell] = hint.place.digit;
    m[hint.place.cell] = 0;
    for (const p of PEERS[hint.place.cell]) m[p] &= ~bit(hint.place.digit);
  }
  if (hint.eliminate) {
    const computed = computeCandidates(values);
    for (const { cell, digit } of hint.eliminate) {
      if (!m[cell]) m[cell] = computed[cell];
      m[cell] &= ~bit(digit);
    }
  }
  return { values: v, marks: m };
}
