import { boxOf, colOf, has, rowOf } from '../sudoku/board';
import type { Hint } from '../sudoku/hints';

interface Props {
  values: number[];
  given: boolean[];
  marks: number[];
  selected: number | null;
  conflicts: Set<number>;
  /** 사진에서 읽기가 불확실했던 칸 */
  flagged?: Set<number>;
  hint: Hint | null;
  hintLevel: number;
  onSelect: (i: number) => void;
}

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function Board({ values, given, marks, selected, conflicts, flagged, hint, hintLevel, onSelect }: Props) {
  const sel = selected ?? -1;
  const selDigit = sel >= 0 ? values[sel] : 0;
  const focus = new Set(hint && hintLevel >= 1 ? hint.focus : []);
  const keys = new Set(hint && hintLevel >= 3 ? hint.keyCells : []);
  const showFix = hint && hintLevel >= 3;
  const elimMap = new Map<number, number>();
  if (showFix) for (const e of hint.eliminate ?? []) elimMap.set(e.cell, (elimMap.get(e.cell) ?? 0) | (1 << e.digit));

  return (
    <div className="board" role="grid" aria-label="스도쿠 판">
      {values.map((v, i) => {
        const isPeer = sel >= 0 && i !== sel && (rowOf(i) === rowOf(sel) || colOf(i) === colOf(sel) || boxOf(i) === boxOf(sel));
        const cls = ['cell'];
        if (given[i]) cls.push('given');
        if (i === sel) cls.push('selected');
        else if (isPeer) cls.push('peer');
        if (v && v === selDigit && i !== sel) cls.push('same');
        if (conflicts.has(i)) cls.push('conflict');
        if (flagged?.has(i)) cls.push('flagged');
        if (focus.has(i)) cls.push('focus');
        if (keys.has(i)) cls.push('key');
        if (showFix && hint.place?.cell === i) cls.push('place');
        if (showFix && hint.clear === i) cls.push('clear');
        if (colOf(i) % 3 === 2 && colOf(i) !== 8) cls.push('edge-r');
        if (rowOf(i) % 3 === 2 && rowOf(i) !== 8) cls.push('edge-b');

        const elim = elimMap.get(i) ?? 0;
        const restore = showFix && hint.restore?.cell === i ? hint.restore.digit : 0;
        const shown = marks[i] | elim | (restore ? 1 << restore : 0);
        const label = `${rowOf(i) + 1}행 ${colOf(i) + 1}열 ${v ? v : '빈칸'}`;

        return (
          <button key={i} type="button" role="gridcell" className={cls.join(' ')} onClick={() => onSelect(i)} aria-label={label}>
            {v ? (
              <span className="value">{v}</span>
            ) : showFix && hint.place?.cell === i ? (
              <span className="value ghost">{hint.place.digit}</span>
            ) : shown ? (
              <span className="marks">
                {DIGITS.map((d) => (
                  <span
                    key={d}
                    className={['mark', has(elim, d) ? 'elim' : '', d === restore ? 'restore' : '', d === selDigit ? 'same' : ''].join(' ')}
                  >
                    {has(shown, d) ? d : ''}
                  </span>
                ))}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
