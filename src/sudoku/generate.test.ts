import { describe, expect, it } from 'vitest';
import { conflictCells } from './board';
import { generate, randomSolution, rate } from './generate';
import { solve } from './solver';

/** 매번 같은 결과가 나오는 난수 */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('랜덤 문제', () => {
  it('정답 판은 꽉 차 있고 중복이 없다', () => {
    const g = randomSolution(seeded(1));
    expect(g.every((v) => v >= 1 && v <= 9)).toBe(true);
    expect(conflictCells(g).size).toBe(0);
  });

  const expected: Record<string, (t: number) => boolean> = {
    easy: (t) => t === 1,
    medium: (t) => t === 2,
    hard: (t) => t === 3,
    expert: (t) => t >= 4,
  };

  for (const level of ['easy', 'medium', 'hard', 'expert'] as const) {
    it(`${level}: 답이 하나이고 정답과 맞으며 난이도 단계가 맞다`, () => {
      const r = generate(level, seeded(level.length * 7 + 3), 20000);
      expect(r.approximate).toBe(false);
      const res = solve(r.puzzle, 2);
      expect(res.count).toBe(1);
      expect(res.solution).toEqual(r.solution);
      r.puzzle.forEach((v, i) => v && expect(v).toBe(r.solution[i]));
      expect(expected[level](rate(r.puzzle))).toBe(true);
      if (level === 'easy') expect(r.puzzle.filter(Boolean).length).toBeGreaterThanOrEqual(36);
    });
  }
});
