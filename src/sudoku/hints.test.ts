import { describe, expect, it } from 'vitest';
import { bit, has, josa, parsePuzzle } from './board';
import { solve } from './solver';
import { applyHint, findHint, type Hint } from './hints';

const TODAY = parsePuzzle(`
402700000
039004007
017000090
000180900
300500001
901030856
753020100
190000325
000300009`)!;

const TODAY_SOLUTION = parsePuzzle(`
462791538
839254617
517863492
245186973
386579241
971432856
753928164
198647325
624315789`)!;

/** 숨은 싱글만으로는 막히는 어려운 문제 */
const HARD = parsePuzzle('800000000003600000070090200050007000000045700000100030001000068008500010090000400')!;

const idx = (r: number, c: number) => (r - 1) * 9 + (c - 1);
const empty = () => new Array(81).fill(0);

function runToEnd(puzzle: number[]) {
  const solution = solve(puzzle).solution!;
  const given = puzzle.map((v) => v !== 0);
  let values = puzzle.slice();
  let marks = empty();
  const kinds: string[] = [];
  for (let step = 0; step < 2000; step++) {
    const hint = findHint({ values, marks, given, solution });
    if (!hint) break;
    kinds.push(hint.kind);
    if (hint.place) expect(hint.place.digit).toBe(solution[hint.place.cell]);
    for (const e of hint.eliminate ?? []) expect(e.digit).not.toBe(solution[e.cell]);
    ({ values, marks } = applyHint(hint, values, marks));
  }
  return { values, solution, kinds };
}

describe('solver', () => {
  it('오늘 문제의 답은 하나다', () => {
    const r = solve(TODAY);
    expect(r.count).toBe(1);
    expect(r.solution).toEqual(TODAY_SOLUTION);
  });

  it('중복이 있는 문제는 풀 수 없다', () => {
    const bad = TODAY.slice();
    bad[1] = 4;
    expect(solve(bad).count).toBe(0);
  });

  it('빈 판은 답이 여러 개다', () => {
    expect(solve(empty()).count).toBe(2);
  });
});

describe('findHint', () => {
  const base = { marks: empty(), given: TODAY.map((v) => v !== 0), solution: TODAY_SOLUTION };

  it('처음 힌트는 3열의 5 (숨은 싱글)', () => {
    const h = findHint({ ...base, values: TODAY })!;
    expect(h.kind).toBe('hidden-single');
    expect(h.place).toEqual({ cell: idx(4, 3), digit: 5 });
    expect(h.steps[0]).toBe('3열을 보세요.');
  });

  it('바로 채울 칸이 없으면 후보를 지우는 힌트를 준다', () => {
    const v = TODAY.slice();
    v[idx(4, 3)] = 5;
    v[idx(7, 4)] = 9;
    const h = findHint({ ...base, values: v })!;
    expect(h.place).toBeUndefined();
    expect(h.eliminate?.length).toBeGreaterThan(0);
  });

  it('틀린 숫자를 먼저 알려준다', () => {
    const v = TODAY.slice();
    v[idx(4, 3)] = 6;
    const h = findHint({ ...base, values: v })!;
    expect(h.kind).toBe('wrong-value');
    expect(h.clear).toBe(idx(4, 3));
  });

  it('같은 줄 중복을 알려준다', () => {
    const v = TODAY.slice();
    v[idx(1, 2)] = 2;
    const h = findHint({ ...base, values: v })!;
    expect(h.kind).toBe('conflict');
    expect(h.clear).toBe(idx(1, 2));
  });

  it('정답 후보를 지웠으면 알려준다', () => {
    const m = empty();
    m[idx(4, 3)] = bit(4) | bit(6);
    const h = findHint({ ...base, values: TODAY, marks: m })!;
    expect(h.kind).toBe('missing-candidate');
    expect(h.restore).toEqual({ cell: idx(4, 3), digit: 5 });
  });

  it('이미 쓰인 숫자가 후보에 남아 있으면 정리하게 한다', () => {
    const m = empty();
    m[idx(4, 3)] = bit(5) | bit(9);
    const h = findHint({ ...base, values: TODAY, marks: m })!;
    expect(h.kind).toBe('basic-elimination');
    expect(h.eliminate).toContainEqual({ cell: idx(4, 3), digit: 9 });
  });

  it('후보를 지운 힌트를 적용하면 그 칸에 후보가 적힌다', () => {
    const v = TODAY.slice();
    v[idx(4, 3)] = 5;
    v[idx(7, 4)] = 9;
    const h: Hint = findHint({ ...base, values: v })!;
    const { marks } = applyHint(h, v, empty());
    for (const e of h.eliminate!) {
      expect(marks[e.cell]).not.toBe(0);
      expect(has(marks[e.cell], e.digit)).toBe(false);
    }
  });

  it('오늘 문제는 힌트만 따라가면 추측 없이 풀린다', () => {
    const { values, solution, kinds } = runToEnd(TODAY);
    expect(values).toEqual(solution);
    expect(kinds).not.toContain('reveal');
  });

  it('어려운 문제도 힌트를 따라가면 끝까지 풀린다', () => {
    const { values, solution } = runToEnd(HARD);
    expect(values).toEqual(solution);
  });
});

describe('josa', () => {
  it('받침에 맞는 조사를 고른다', () => {
    expect(josa('3열', '을', '를')).toBe('3열을');
    expect(josa('가운데 위 박스', '을', '를')).toBe('가운데 위 박스를');
    expect(josa('5', '이', '가')).toBe('5가');
    expect(josa('6', '이', '가')).toBe('6이');
  });
});
