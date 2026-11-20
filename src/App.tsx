import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppNav } from './components/AppNav';
import { UpdateBanner } from './components/UpdateBanner';
import { Board } from './components/Board';
import { HintPanel } from './components/HintPanel';
import { PhotoImport } from './components/PhotoImport';
import type { ReadResult } from './photo/recognize';
import { PEERS, bit, computeCandidates, conflictCells, parsePuzzle } from './sudoku/board';
import { applyHint, findHint, type Hint } from './sudoku/hints';
import { solve } from './sudoku/solver';
import { LEVELS, generate, levelLabel, type Generated, type Level } from './sudoku/generate';

type Phase = 'setup' | 'solve';

interface Game {
  phase: Phase;
  values: number[];
  given: boolean[];
  marks: number[];
  solution: number[] | null;
  /** 랜덤 문제의 난이도 */
  level?: Level;
}

interface State {
  game: Game;
  history: Game[];
  selected: number | null;
  mode: 'value' | 'mark';
  autoClean: boolean;
  hint: Hint | null;
  hintLevel: number;
  message: { tone: 'info' | 'error'; text: string } | null;
}

type Action =
  | { type: 'select'; cell: number }
  | { type: 'move'; dr: number; dc: number }
  | { type: 'step'; delta: number }  | { type: 'input'; digit: number; asMark?: boolean }
  | { type: 'erase' }
  | { type: 'undo' }
  | { type: 'toggleMode' }
  | { type: 'fillMarks' }
  | { type: 'clearMarks' }
  | { type: 'hint' }
  | { type: 'hintApply' }
  | { type: 'hintClose' }
  | { type: 'start' }
  | { type: 'edit' }
  | { type: 'new' }
  | { type: 'load'; values: number[] }
  | { type: 'random'; result: Generated }
  | { type: 'autoClean'; on: boolean }
  | { type: 'message'; tone: 'info' | 'error'; text: string }
  | { type: 'dismiss' };

const STORAGE_KEY = 'sudoku-helper:v1';
const zeros = () => new Array<number>(81).fill(0);
const emptyGame = (): Game => ({ phase: 'setup', values: zeros(), given: new Array(81).fill(false), marks: zeros(), solution: null });

function loadState(): State {
  const base: State = {
    game: emptyGame(),
    history: [],
    selected: 0,
    mode: 'value',
    autoClean: true,
    hint: null,
    hintLevel: 0,
    message: null,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as { game: Game; autoClean?: boolean };
    if (saved.game?.values?.length !== 81) return base;
    return { ...base, game: saved.game, autoClean: saved.autoClean ?? true };
  } catch {
    return base;
  }
}

function commit(state: State, game: Game): State {
  return { ...state, game, history: [...state.history.slice(-199), state.game], hint: null, hintLevel: 0, message: null };
}

function reducer(state: State, action: Action): State {
  const { game, selected } = state;
  switch (action.type) {
    case 'select':
      return { ...state, selected: action.cell };
    case 'move': {
      const cur = selected ?? 0;
      const r = (Math.floor(cur / 9) + action.dr + 9) % 9;
      const c = ((cur % 9) + action.dc + 9) % 9;
      return { ...state, selected: r * 9 + c };
    }
    case 'step':
      return { ...state, selected: ((selected ?? -action.delta) + action.delta + 81) % 81 };
    case 'input': {
      if (selected === null) return state;
      const d = action.digit;
      if (game.phase === 'setup') {
        const values = game.values.slice();
        values[selected] = values[selected] === d ? 0 : d;
        return commit(state, { ...game, values, given: values.map((v) => v !== 0) });
      }
      if (game.given[selected]) return state;
      const asMark = action.asMark ?? state.mode === 'mark';
      if (asMark) {
        if (game.values[selected]) return state;
        const marks = game.marks.slice();
        marks[selected] ^= bit(d);
        return commit(state, { ...game, marks });
      }
      const values = game.values.slice();
      const marks = game.marks.slice();
      values[selected] = values[selected] === d ? 0 : d;
      if (values[selected] && state.autoClean) for (const p of PEERS[selected]) marks[p] &= ~bit(d);
      return commit(state, { ...game, values, marks });
    }
    case 'erase': {
      if (selected === null) return state;
      if (game.phase === 'setup') {
        if (!game.values[selected]) return state;
        const values = game.values.slice();
        values[selected] = 0;
        return commit(state, { ...game, values, given: values.map((v) => v !== 0) });
      }
      if (game.given[selected]) return state;
      if (game.values[selected]) {
        const values = game.values.slice();
        values[selected] = 0;
        return commit(state, { ...game, values });
      }
      if (!game.marks[selected]) return state;
      const marks = game.marks.slice();
      marks[selected] = 0;
      return commit(state, { ...game, marks });
    }
    case 'undo': {
      const prev = state.history[state.history.length - 1];
      if (!prev) return state;
      return { ...state, game: prev, history: state.history.slice(0, -1), hint: null, hintLevel: 0, message: null };
    }
    case 'toggleMode':
      return { ...state, mode: state.mode === 'value' ? 'mark' : 'value' };
    case 'fillMarks': {
      const computed = computeCandidates(game.values);
      const marks = game.marks.map((m, i) => (game.values[i] ? m : m || computed[i]));
      return commit(state, { ...game, marks });
    }
    case 'clearMarks':
      return commit(state, { ...game, marks: zeros() });
    case 'hint': {
      if (state.hint) return { ...state, hintLevel: Math.min(3, state.hintLevel + 1) };
      const hint = findHint(game);
      if (!hint) return { ...state, message: { tone: 'info', text: '더 드릴 힌트가 없어요. 다 풀었거나, 답이 하나로 정해지지 않는 문제예요.' } };
      return { ...state, hint, hintLevel: 1, message: null };
    }
    case 'hintApply': {
      if (!state.hint) return state;
      const next = applyHint(state.hint, game.values, game.marks);
      const target = state.hint.place?.cell ?? state.hint.clear ?? state.hint.restore?.cell ?? selected;
      return { ...commit(state, { ...game, ...next }), selected: target };
    }
    case 'hintClose':
      return { ...state, hint: null, hintLevel: 0 };
    case 'start': {
      const filled = game.values.filter(Boolean).length;
      if (conflictCells(game.values).size) {
        return { ...state, message: { tone: 'error', text: '같은 행·열·박스에 같은 숫자가 있어요. 빨간 칸을 고쳐 주세요.' } };
      }
      const res = solve(game.values, 2);
      if (res.count === 0) return { ...state, message: { tone: 'error', text: '이 문제는 풀 수 없어요. 입력한 숫자를 다시 확인해 주세요.' } };
      const next: Game = { phase: 'solve', values: game.values, given: game.values.map((v) => v !== 0), marks: zeros(), solution: res.count === 1 ? res.solution : null };
      const s = commit(state, next);
      if (res.count > 1) {
        return {
          ...s,
          message: { tone: 'info', text: `답이 여러 개인 문제예요(숫자 ${filled}개). 틀린 칸 알려주기와 정답 공개 힌트는 쓸 수 없어요.` },
        };
      }
      return s;
    }
    case 'edit':
      return commit(state, { ...emptyGame(), values: game.values.map((v, i) => (game.given[i] ? v : 0)), given: game.given });
    case 'new':
      return { ...commit(state, emptyGame()), selected: 0 };
    case 'load':
      return { ...commit(state, { ...emptyGame(), values: action.values, given: action.values.map((v) => v !== 0) }), selected: 0 };
    case 'random': {
      const { puzzle, solution, level, approximate } = action.result;
      const next: Game = { phase: 'solve', values: puzzle, given: puzzle.map((v) => v !== 0), marks: zeros(), solution, level };
      const s = { ...commit(state, next), selected: 0 };
      if (!approximate) return s;
      return { ...s, message: { tone: 'info', text: `${levelLabel(level)} 난이도 문제를 시간 안에 찾지 못해 가장 가까운 난이도의 문제를 냈어요.` } };
    }
    case 'autoClean':
      return { ...state, autoClean: action.on };
    case 'message':
      return { ...state, message: { tone: action.tone, text: action.text } };
    case 'dismiss':
      return { ...state, message: null };
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [recognized, setRecognized] = useState<ReadResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [generating, setGenerating] = useState<Level | null>(null);
  const worker = useRef<Worker | null>(null);
  const { game, selected, mode, hint, hintLevel, message } = state;

  useEffect(() => () => worker.current?.terminate(), []);

  const startRandom = (level: Level) => {
    worker.current?.terminate();
    setGenerating(level);
    const done = (result: Generated) => {
      worker.current?.terminate();
      worker.current = null;
      setGenerating(null);
      setRecognized(null);
      dispatch({ type: 'random', result });
    };
    try {
      const w = new Worker(new URL('./sudoku/generate.worker.ts', import.meta.url), { type: 'module' });
      worker.current = w;
      w.onmessage = (e: MessageEvent<Generated>) => done(e.data);
      w.onerror = () => done(generate(level));
      w.postMessage({ level });
    } catch {
      // 워커를 못 쓰는 환경이면 화면에서 바로 만든다
      setTimeout(() => done(generate(level)), 0);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ game, autoClean: state.autoClean }));
    } catch {
      /* 저장할 수 없는 환경이면 그냥 넘어간다 */
    }
  }, [game, state.autoClean]);

  const conflicts = useMemo(() => conflictCells(game.values), [game.values]);
  const counts = useMemo(() => {
    const c = zeros();
    for (const v of game.values) if (v) c[v]++;
    return c;
  }, [game.values]);
  /** 사진에서 읽은 뒤 아직 손대지 않은 불확실한 칸 */
  const flagged = useMemo(
    () =>
      new Set(
        game.phase === 'setup' && recognized ? recognized.uncertain.filter((i) => game.values[i] === recognized.values[i]) : [],
      ),
    [game.phase, game.values, recognized],
  );

  const onPhotoRead = (result: ReadResult) => {
    setPhotoFile(null);
    setRecognized(result);
    dispatch({ type: 'load', values: result.values });
    const n = result.values.filter(Boolean).length;
    const u = result.uncertain.length;
    dispatch({
      type: 'message',
      tone: 'info',
      text: `숫자 ${n}개를 읽었어요.${u ? ` 주황색 칸 ${u}개는 확실하지 않아요.` : ''} 사진과 비교해 틀린 칸을 고친 뒤 풀기 시작을 누르세요.`,
    });
  };

  const solved =
    game.phase === 'solve' && game.values.every((v) => v) && conflicts.size === 0 && (!game.solution || game.values.every((v, i) => v === game.solution![i]));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') return;
      if (document.querySelector('.photo-sheet')) return;
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (m && !e.ctrlKey && !e.metaKey && !e.altKey) {
        dispatch({ type: 'input', digit: Number(m[1]), asMark: e.shiftKey ? true : undefined });
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        dispatch({ type: 'undo' });
        e.preventDefault();
        return;
      }
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        dispatch({ type: 'step', delta: e.shiftKey ? -1 : 1 });
        e.preventDefault();
        return;
      }
      const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (e.key in moves) {
        const [dr, dc] = moves[e.key];
        dispatch({ type: 'move', dr, dc });
        e.preventDefault();
      } else if (e.key === 'Backspace' || e.key === 'Delete' || e.code === 'Digit0' || e.code === 'Numpad0') {
        dispatch({ type: 'erase' });
        e.preventDefault();
      } else if (e.code === 'Space' || e.code === 'KeyN') {
        // 한글 입력 상태에서는 e.key가 'ㅜ'·'Process'가 되므로 물리 키(e.code)로 본다
        dispatch({ type: 'toggleMode' });
        e.preventDefault();
      } else if (e.code === 'KeyH' && game.phase === 'solve') {
        dispatch({ type: 'hint' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game.phase]);

  const doImport = () => {
    const values = parsePuzzle(importText);
    if (!values) {
      const n = importText.replace(/[^0-9.]/g, '').length;
      dispatch({ type: 'message', tone: 'error', text: `숫자 81개가 필요해요. 지금 ${n}개예요.` });
      return;
    }
    dispatch({ type: 'load', values });
    setImportOpen(false);
    setImportText('');
  };

  const isSetup = game.phase === 'setup';

  return (
    <div className="app">
      <AppNav current="sudoku" />
      <UpdateBanner />
      <header className="app-header">
        <h1>스도쿠 도우미</h1>
        <span className={`phase-badge ${game.phase}`}>
          {isSetup ? '문제 입력' : game.level ? `푸는 중 · ${levelLabel(game.level)}` : '푸는 중'}
        </span>
      </header>

      {isSetup && (
        <>
          <p className="lead">
            문제의 숫자를 넣고 <strong>풀기 시작</strong>을 누르세요. 칸을 고르고 아래 숫자를 누르거나 키보드로 입력해요.
          </p>
          <section className="random" aria-label="랜덤 문제">
            <span className="random-title">랜덤 문제</span>
            <div className="random-levels">
              {LEVELS.map((l) => (
                <button key={l.id} type="button" onClick={() => startRandom(l.id)} disabled={generating !== null}>
                  {generating === l.id ? '만드는 중…' : l.label}
                </button>
              ))}
            </div>
            <span className="random-desc">
              하: 숨은 싱글·외톨이 후보 · 중: 박스-줄 교차 · 상: 쌍·세 쌍 · 최상: X-윙 이상
            </span>
          </section>
        </>
      )}

      {message && (
        <div className={`message ${message.tone}`} role="status">
          <span>{message.text}</span>
          <button type="button" className="link" onClick={() => dispatch({ type: 'dismiss' })} aria-label="메시지 닫기">
            ✕
          </button>
        </div>
      )}

      {solved && <div className="message success">다 풀었어요! 정답이에요.</div>}

      <Board
        values={game.values}
        given={game.given}
        marks={isSetup ? zeros() : game.marks}
        selected={selected}
        conflicts={conflicts}
        flagged={flagged}
        hint={hint}
        hintLevel={hintLevel}
        onSelect={(cell) => dispatch({ type: 'select', cell })}
      />

      {hint && (
        <HintPanel
          hint={hint}
          level={hintLevel}
          onMore={() => dispatch({ type: 'hint' })}
          onApply={() => dispatch({ type: 'hintApply' })}
          onClose={() => dispatch({ type: 'hintClose' })}
        />
      )}

      {!isSetup && (
        <div className="mode-switch" role="radiogroup" aria-label="입력 방식">
          <button type="button" role="radio" aria-checked={mode === 'value'} className={mode === 'value' ? 'on' : ''} onClick={() => mode !== 'value' && dispatch({ type: 'toggleMode' })}>
            숫자
          </button>
          <button type="button" role="radio" aria-checked={mode === 'mark'} className={mode === 'mark' ? 'on' : ''} onClick={() => mode !== 'mark' && dispatch({ type: 'toggleMode' })}>
            후보수
          </button>
          <span className="mode-key">Space 또는 N으로 전환</span>
        </div>
      )}

      <div className={`numpad ${!isSetup && mode === 'mark' ? 'mark-mode' : ''}`}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button key={d} type="button" className="num" onClick={() => dispatch({ type: 'input', digit: d })} disabled={!isSetup && mode === 'value' && counts[d] >= 9}>
            <span className="num-digit">{d}</span>
            {!isSetup && <span className="num-left">{9 - counts[d]}</span>}
          </button>
        ))}
        <button type="button" className="num erase" onClick={() => dispatch({ type: 'erase' })}>
          지우기
        </button>
      </div>

      <div className="toolbar">
        <button type="button" onClick={() => dispatch({ type: 'undo' })} disabled={!state.history.length}>
          실행 취소
        </button>
        {isSetup ? (
          <>
            <button type="button" onClick={() => setImportOpen((o) => !o)}>
              텍스트로 입력
            </button>
            <button type="button" onClick={() => fileInput.current?.click()}>
              사진으로 입력
            </button>
            <button type="button" onClick={() => dispatch({ type: 'new' })} disabled={!game.values.some(Boolean)}>
              모두 지우기
            </button>
            <button type="button" className="primary" onClick={() => dispatch({ type: 'start' })}>
              풀기 시작
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => dispatch({ type: 'fillMarks' })}>
              후보 채우기
            </button>
            <button type="button" onClick={() => dispatch({ type: 'clearMarks' })} disabled={!game.marks.some(Boolean)}>
              후보 비우기
            </button>
            <button type="button" className="primary" onClick={() => dispatch({ type: 'hint' })} disabled={solved}>
              {hint ? (hintLevel < 3 ? '다음 힌트' : '힌트') : '힌트'}
            </button>
          </>
        )}
      </div>

      {importOpen && isSetup && (
        <section className="import">
          <label htmlFor="import-text">한 줄에 9개씩 9줄, 또는 81자를 붙여넣으세요. 빈칸은 0이나 점(.)으로 써요.</label>
          <textarea id="import-text" rows={9} value={importText} onChange={(e) => setImportText(e.target.value)} spellCheck={false} placeholder={'402700000\n039004007\n...'} />
          <div className="hint-actions">
            <button type="button" className="primary" onClick={doImport}>
              불러오기
            </button>
            <button type="button" onClick={() => setImportOpen(false)}>
              닫기
            </button>
          </div>
        </section>
      )}

      {!isSetup && (
        <div className="footer-row">
          <label className="check">
            <input type="checkbox" checked={state.autoClean} onChange={(e) => dispatch({ type: 'autoClean', on: e.target.checked })} />
            숫자를 넣으면 같은 줄·박스의 후보에서 자동으로 지우기
          </label>
          <div className="footer-actions">
            <button type="button" className="link" onClick={() => dispatch({ type: 'edit' })}>
              문제 고치기
            </button>
            <button type="button" className="link" onClick={() => dispatch({ type: 'new' })}>
              새 문제
            </button>
            {game.level && (
              <button type="button" className="link" onClick={() => startRandom(game.level!)} disabled={generating !== null}>
                {generating ? '만드는 중…' : `같은 난이도(${levelLabel(game.level)}) 한 문제 더`}
              </button>
            )}
          </div>
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setPhotoFile(f);
          e.target.value = '';
        }}
      />
      {photoFile && (
        <PhotoImport file={photoFile} onDone={onPhotoRead} onCancel={() => setPhotoFile(null)} onPickAgain={() => fileInput.current?.click()} />
      )}

      <p className="keys">키보드: 1~9 입력 · Shift+숫자 후보 · Space 숫자/후보 전환 · 방향키 이동 · Tab 다음 칸 · Shift+Tab 이전 칸 · Backspace 지우기 · H 힌트 · Ctrl+Z 실행 취소</p>
    </div>
  );
}
