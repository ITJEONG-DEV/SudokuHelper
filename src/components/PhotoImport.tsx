import { useEffect, useRef, useState } from 'react';
import type { Point, Quad } from '../photo/image';
import { type ReadResult, detectCorners, loadImage, readPuzzle } from '../photo/recognize';

interface Props {
  file: File;
  onDone: (result: ReadResult) => void;
  onCancel: () => void;
  onPickAgain: () => void;
}

const CORNER_LABELS = ['왼쪽 위', '오른쪽 위', '오른쪽 아래', '왼쪽 아래'];

export function PhotoImport({ file, onDone, onCancel, onPickAgain }: Props) {
  const [img, setImg] = useState<ImageData | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [error, setError] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    const u = URL.createObjectURL(file);
    setUrl(u);
    setImg(null);
    setQuad(null);
    setError('');
    loadImage(file)
      .then((data) => {
        if (!alive) return;
        setImg(data);
        setQuad(detectCorners(data));
      })
      .catch(() => alive && setError('사진을 열지 못했어요. 다른 사진을 골라 주세요.'));
    return () => {
      alive = false;
      URL.revokeObjectURL(u);
    };
  }, [file]);

  const toImagePoint = (e: React.PointerEvent): Point | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm || !img) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: Math.min(img.width, Math.max(0, p.x)), y: Math.min(img.height, Math.max(0, p.y)) };
  };

  const onMove = (e: React.PointerEvent) => {
    if (drag.current === null || !quad) return;
    const p = toImagePoint(e);
    if (!p) return;
    const next = quad.slice() as Quad;
    next[drag.current] = p;
    setQuad(next);
  };

  const read = async () => {
    if (!img || !quad) return;
    setBusy(true);
    setError('');
    try {
      const result = await readPuzzle(img, quad, (done, total) => setProgress([done, total]));
      onDone(result);
    } catch {
      setError('숫자를 읽지 못했어요. 인터넷 연결을 확인해 주세요. 처음 한 번은 글자 인식 데이터(약 10MB)를 내려받아요.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handle = img ? Math.max(img.width, img.height) / 28 : 10;

  return (
    <div className="photo-sheet" role="dialog" aria-modal="true" aria-label="사진으로 문제 입력">
      <div className="photo-inner">
        <h2>사진으로 입력</h2>
        <p className="lead">
          판의 네 모서리에 동그라미가 맞는지 보세요. 어긋났으면 끌어서 맞춘 뒤 숫자 읽기를 누르세요. 판이 사진에 크게, 반듯하게 나올수록 잘 읽어요.
        </p>
        <div className="photo-stage">
          {url && <img src={url} alt="고른 사진" draggable={false} />}
          {img && quad && (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${img.width} ${img.height}`}
              preserveAspectRatio="none"
              onPointerMove={onMove}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
            >
              <polygon points={quad.map((p) => `${p.x},${p.y}`).join(' ')} className="photo-quad" />
              {quad.map((p, k) => (
                <circle
                  key={k}
                  cx={p.x}
                  cy={p.y}
                  r={handle}
                  className="photo-handle"
                  aria-label={`${CORNER_LABELS[k]} 모서리`}
                  onPointerDown={(e) => {
                    drag.current = k;
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                    e.preventDefault();
                  }}
                />
              ))}
            </svg>
          )}
        </div>
        {error && <div className="message error">{error}</div>}
        {progress && (
          <div className="message">
            숫자 읽는 중… {progress[0]}/{progress[1]}줄
          </div>
        )}
        <div className="hint-actions">
          <button type="button" className="primary" onClick={read} disabled={!quad || busy}>
            {busy ? '읽는 중…' : '숫자 읽기'}
          </button>
          <button type="button" onClick={onPickAgain} disabled={busy}>
            다른 사진
          </button>
          <button type="button" onClick={onCancel} disabled={busy}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
