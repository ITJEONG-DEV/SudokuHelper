import { ALL, PEERS, bit, digitsOf, popcount } from './board';

export interface SolveResult {
  /** 찾은 해의 수. limit에서 멈춘다. */
  count: number;
  solution: number[] | null;
}

/** 백트래킹으로 해를 limit개까지 센다. 답이 하나인지 확인하는 데 쓴다. */
export function solve(values: number[], limit = 2): SolveResult {
  const g = values.slice();
  for (let i = 0; i < 81; i++) {
    if (g[i] && PEERS[i].some((p) => g[p] === g[i])) return { count: 0, solution: null };
  }
  let count = 0;
  let solution: number[] | null = null;

  const rec = (): boolean => {
    let best = -1;
    let bestMask = 0;
    let bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      let m = ALL;
      for (const p of PEERS[i]) if (g[p]) m &= ~bit(g[p]);
      const n = popcount(m);
      if (n === 0) return false;
      if (n < bestN) {
        best = i;
        bestMask = m;
        bestN = n;
        if (n === 1) break;
      }
    }
    if (best < 0) {
      count++;
      if (!solution) solution = g.slice();
      return count >= limit;
    }
    for (const d of digitsOf(bestMask)) {
      g[best] = d;
      if (rec()) {
        g[best] = 0;
        return true;
      }
    }
    g[best] = 0;
    return false;
  };

  rec();
  return { count, solution };
}
