import { ALL, PEERS, bit, computeCandidates, digitsOf } from './board';
import { applyHint, findHint, type HintKind } from './hints';
import { solve } from './solver';

/** 난이도: 풀 때 꼭 필요한 가장 어려운 기법으로 나눈다 */
export type Level = 'easy' | 'medium' | 'hard' | 'expert';

export const LEVELS: { id: Level; label: string; desc: string }[] = [
  { id: 'easy', label: '하', desc: '숨은 싱글·외톨이 후보만으로 풀려요' },
  { id: 'medium', label: '중', desc: '박스-줄 교차가 필요해요' },
  { id: 'hard', label: '상', desc: '드러난·숨은 쌍(세 쌍)이 필요해요' },
  { id: 'expert', label: '최상', desc: 'X-윙이나 그보다 어려운 추론이 필요해요' },
];

export const levelLabel = (level: Level) => LEVELS.find((l) => l.id === level)!.label;

/** 기법 단계. 5는 이 앱의 기법으로 풀리지 않아 가정·추적이 필요한 문제 */
const TIER: Partial<Record<HintKind, number>> = {
  'basic-elimination': 1,
  'hidden-single': 1,
  'naked-single': 1,
  pointing: 2,
  claiming: 2,
  'naked-subset': 3,
  'hidden-subset': 3,
  'x-wing': 4,
};

const LEVEL_TIER: Record<Level, (tier: number) => boolean> = {
  easy: (t) => t === 1,
  medium: (t) => t === 2,
  hard: (t) => t === 3,
  expert: (t) => t >= 4,
};

/** 하는 단서를 넉넉히 남긴다. 이 수 밑으로는 지우지 않는다 */
const MIN_CLUES: Record<Level, number> = { easy: 36, medium: 0, hard: 0, expert: 0 };

export type Random = () => number;

function shuffle<T>(items: T[], rnd: Random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 무작위로 꽉 찬 정답 판을 만든다 */
export function randomSolution(rnd: Random = Math.random): number[] {
  const g = new Array<number>(81).fill(0);
  const rec = (i: number): boolean => {
    if (i === 81) return true;
    let m = ALL;
    for (const p of PEERS[i]) if (g[p]) m &= ~bit(g[p]);
    for (const d of shuffle(digitsOf(m), rnd)) {
      g[i] = d;
      if (rec(i + 1)) return true;
    }
    g[i] = 0;
    return false;
  };
  rec(0);
  return g;
}

/**
 * 사람이 쓰는 기법만으로 끝까지 풀어 보고, 쓴 기법 중 가장 어려운 단계를 돌려준다.
 * 후보를 모두 적은 상태에서 힌트 엔진을 그대로 돌리므로 앱의 힌트와 같은 순서로 푼다.
 */
export function rate(puzzle: number[]): number {
  let values = puzzle.slice();
  let marks = computeCandidates(values);
  const given = values.map((v) => v !== 0);
  let tier = 1;
  for (let step = 0; step < 500 && values.includes(0); step++) {
    const hint = findHint({ values, marks, given, solution: null });
    if (!hint) return 5;
    tier = Math.max(tier, TIER[hint.kind] ?? 5);
    ({ values, marks } = applyHint(hint, values, marks));
  }
  return values.includes(0) ? 5 : tier;
}

/** 정답 판에서 답이 하나로 남는 동안 점대칭 두 칸씩 지운다 */
function carve(solution: number[], minClues: number, rnd: Random): number[] {
  const puzzle = solution.slice();
  let clues = 81;
  for (const i of shuffle([...Array(41).keys()], rnd)) {
    const j = 80 - i;
    const n = i === j ? 1 : 2;
    if (clues - n < minClues) continue;
    const a = puzzle[i];
    const b = puzzle[j];
    puzzle[i] = 0;
    puzzle[j] = 0;
    if (solve(puzzle, 2).count === 1) clues -= n;
    else {
      puzzle[i] = a;
      puzzle[j] = b;
    }
  }
  return puzzle;
}

export interface Generated {
  puzzle: number[];
  solution: number[];
  level: Level;
  /** 원하는 난이도를 시간 안에 못 만들어 가장 가까운 문제를 준 경우 */
  approximate: boolean;
}

/** 원하는 난이도의 문제를 만든다. 시간 안에 못 찾으면 가장 가까운 단계의 문제를 준다 */
export function generate(level: Level, rnd: Random = Math.random, budgetMs = 8000): Generated {
  const want = LEVELS.findIndex((l) => l.id === level) + 1;
  const start = Date.now();
  let best: { puzzle: number[]; solution: number[]; gap: number } | null = null;
  do {
    const solution = randomSolution(rnd);
    const puzzle = carve(solution, MIN_CLUES[level], rnd);
    const tier = rate(puzzle);
    if (LEVEL_TIER[level](tier)) return { puzzle, solution, level, approximate: false };
    const gap = Math.abs(Math.min(tier, 4) - want);
    if (!best || gap < best.gap) best = { puzzle, solution, gap };
  } while (Date.now() - start < budgetMs);
  return { puzzle: best.puzzle, solution: best.solution, level, approximate: true };
}
