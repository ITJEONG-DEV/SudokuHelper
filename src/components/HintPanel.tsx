import type { Hint } from '../sudoku/hints';

interface Props {
  hint: Hint;
  level: number;
  onMore: () => void;
  onApply: () => void;
  onClose: () => void;
}

const LEVEL_LABEL = ['어디를 볼까', '무엇을 찾을까', '정답과 이유'];

export function HintPanel({ hint, level, onMore, onApply, onClose }: Props) {
  return (
    <section className="hint-panel" aria-live="polite">
      <header>
        <strong>힌트 {level}/3</strong>
        {level >= 2 && <span className="technique">{hint.name}</span>}
      </header>
      <ol>
        {hint.steps.slice(0, level).map((s, k) => (
          <li key={k}>
            <span className="step-label">{LEVEL_LABEL[k]}</span>
            {s}
          </li>
        ))}
      </ol>
      <div className="hint-actions">
        {level < 3 && (
          <button type="button" className="primary" onClick={onMore}>
            다음 힌트
          </button>
        )}
        {level === 3 && (
          <button type="button" className="primary" onClick={onApply}>
            판에 적용
          </button>
        )}
        <button type="button" onClick={onClose}>
          닫기
        </button>
      </div>
    </section>
  );
}
