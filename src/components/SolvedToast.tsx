import { useEffect, useState } from 'react';

/**
 * 판 위에 겹쳐 띄우는 안내(다 풀었을 때 등). 판이 밀리지 않고, ✕로 닫으면 판을 가리지 않는다.
 * tone이 'error'면 경고 색으로 보여 준다.
 * SudokuHelper·NonogramHelper·KakuroHelper·MinesweeperHelper에 같은 파일을 둔다.
 */
export function SolvedToast({ show, text, tone = 'success' }: { show: boolean; text: string; tone?: 'success' | 'error' }) {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (!show) setClosed(false);
  }, [show]);
  if (!show || closed) return null;
  return (
    <div className={`solved-toast${tone === 'error' ? ' error' : ''}`} role="status">
      <span>{text}</span>
      <button type="button" aria-label="안내 닫기" onClick={() => setClosed(true)}>
        ✕
      </button>
    </div>
  );
}
