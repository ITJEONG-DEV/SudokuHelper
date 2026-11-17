/** 스도쿠 도우미 ↔ 노노그램 도우미 이동 메뉴. 두 저장소에 같은 파일을 둔다. */
const APPS = [
  { id: 'sudoku', label: '스도쿠', href: 'https://itjeong-dev.github.io/SudokuHelper/' },
  { id: 'nonogram', label: '노노그램', href: 'https://itjeong-dev.github.io/NonogramHelper/' },
] as const;

export function AppNav({ current }: { current: (typeof APPS)[number]['id'] }) {
  return (
    <nav className="app-nav" aria-label="퍼즐 도우미">
      {APPS.map((a) =>
        a.id === current ? (
          <span key={a.id} className="app-nav-item current" aria-current="page">
            {a.label}
          </span>
        ) : (
          <a key={a.id} className="app-nav-item" href={a.href}>
            {a.label}
          </a>
        ),
      )}
    </nav>
  );
}
