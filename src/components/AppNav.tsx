import { useEffect, useRef, useState } from 'react';

/**
 * 퍼즐 도우미 앱 모음. 제목 줄의 버튼을 누르면 아래에서 앱 목록이 올라온다.
 * SudokuHelper·NonogramHelper·KakuroHelper에 같은 파일을 둔다.
 */
const APPS = [
  { id: 'sudoku', label: '스도쿠', href: 'https://itjeong-dev.github.io/SudokuHelper/' },
  { id: 'nonogram', label: '노노그램', href: 'https://itjeong-dev.github.io/NonogramHelper/' },
  { id: 'kakuro', label: '가쿠로', href: 'https://itjeong-dev.github.io/KakuroHelper/' },
] as const;

type AppId = (typeof APPS)[number]['id'];

/** 앱 아이콘. 각 앱의 public/icon.svg를 줄여 그린 것 */
function AppIcon({ id }: { id: AppId }) {
  return (
    <svg viewBox="0 0 90 90" aria-hidden="true" className="app-icon">
      <rect width="90" height="90" rx="18" fill="#2f5bd3" />
      <rect x="18" y="18" width="54" height="54" fill="#fff" />
      {id === 'sudoku' && (
        <>
          <rect x="36" y="36" width="18" height="18" fill="#ffd666" />
          <path d="M36 18v54M54 18v54M18 36h54M18 54h54" stroke="#1c2233" strokeWidth="2.5" />
        </>
      )}
      {id === 'nonogram' && (
        <g fill="#1c2233">
          <rect x="28.8" y="18" width="10.8" height="10.8" />
          <rect x="50.4" y="18" width="10.8" height="10.8" />
          <rect x="18" y="28.8" width="54" height="21.6" />
          <rect x="28.8" y="50.4" width="32.4" height="10.8" />
          <rect x="39.6" y="61.2" width="10.8" height="10.8" />
        </g>
      )}
      {id === 'kakuro' && (
        <>
          <path d="M18 18h27v27H18zM45 45h27v27H45z" fill="#1c2233" />
          <path d="M18 18l27 27M45 45l27 27" stroke="#fff" strokeWidth="2" />
          <path d="M45 18v54M18 45h54" stroke="#1c2233" strokeWidth="2" />
        </>
      )}
      <rect x="18" y="18" width="54" height="54" fill="none" stroke="#1c2233" strokeWidth="3" />
    </svg>
  );
}

export function AppNav({ current }: { current: AppId }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    sheet.current?.querySelector<HTMLElement>('a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      // 앱의 단축키(숫자 입력 등)가 시트 뒤에서 동작하지 않게 막는다
      e.stopPropagation();
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  return (
    <>
      <button ref={button} type="button" className="app-launch" aria-label="다른 퍼즐 도우미" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="app-sheet-backdrop" onClick={close}>
          <div ref={sheet} className="app-sheet" role="dialog" aria-modal="true" aria-label="퍼즐 도우미" onClick={(e) => e.stopPropagation()}>
            <header>
              <strong>퍼즐 도우미</strong>
              <button type="button" className="app-sheet-close" aria-label="닫기" onClick={close}>
                ✕
              </button>
            </header>
            <ul className="app-grid">
              {APPS.map((a) => (
                <li key={a.id}>
                  {a.id === current ? (
                    <span className="app-tile current" aria-current="page">
                      <AppIcon id={a.id} />
                      <span className="app-name">{a.label}</span>
                      <span className="app-here">지금 앱</span>
                    </span>
                  ) : (
                    <a className="app-tile" href={a.href}>
                      <AppIcon id={a.id} />
                      <span className="app-name">{a.label}</span>
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
