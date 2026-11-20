import { useEffect, useState } from 'react';

/**
 * 다 풀었을 때 판 위에 겹쳐 띄우는 안내. 판이 밀리지 않고, ✕로 닫으면 완성한 판을 볼 수 있다.
 * SudokuHelper·NonogramHelper·KakuroHelper에 같은 파일을 둔다.
 */
export function SolvedToast({ show, text }: { show: boolean; text: string }) {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (!show) setClosed(false);
  }, [show]);
  if (!show || closed) return null;
  return (
    <div className="solved-toast" role="status">
      <span>{text}</span>
      <button type="button" aria-label="안내 닫기" onClick={() => setClosed(true)}>
        ✕
      </button>
    </div>
  );
}
