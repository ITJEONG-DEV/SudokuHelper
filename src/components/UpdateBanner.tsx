import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** 새 버전을 확인하는 간격 (앱을 오래 켜 둔 경우) */
const CHECK_INTERVAL = 60 * 60 * 1000;
/** 새 버전으로 바뀌기를 기다리는 최대 시간. 지나면 그냥 다시 불러온다 */
const RELOAD_FALLBACK_MS = 2500;

/**
 * 새 버전이 받아지면 새로고침 안내를 띄운다.
 * 퍼즐 도우미 네 앱에 같은 파일이 있다.
 */
export function UpdateBanner() {
  const [busy, setBusy] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      const check = async () => {
        if (registration.installing || !navigator.onLine) return;
        try {
          // 서버에 새 서비스 워커가 있는지 확인한다
          const res = await fetch(swUrl, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
          if (res.status === 200) await registration.update();
        } catch {
          /* 오프라인 등: 다음에 다시 확인 */
        }
      };
      setInterval(check, CHECK_INTERVAL);
      // 홈 화면 앱을 다시 열 때(백그라운드에서 돌아올 때)도 확인한다
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });

  /**
   * 기다리는 새 버전을 직접 켜고, 바뀌면 다시 불러온다.
   * 라이브러리의 updateServiceWorker는 앱이 따로 확인해서 받은 새 버전일 때 다시 불러오지 않아
   * 눌러도 아무 일이 없는 것처럼 보였다.
   */
  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    let done = false;
    const reload = () => {
      if (done) return;
      done = true;
      window.location.reload();
    };
    try {
      const sw = navigator.serviceWorker;
      const reg = await sw?.getRegistration();
      if (sw && reg?.waiting) {
        sw.addEventListener('controllerchange', reload, { once: true });
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        window.setTimeout(reload, RELOAD_FALLBACK_MS);
        return;
      }
      // 기다리는 새 버전이 없으면(이미 켜졌으면) 바로 다시 불러온다
      void updateServiceWorker(false);
      reload();
    } catch {
      reload();
    }
  };

  if (!needRefresh) return null;
  return (
    <div className="update-banner" role="status">
      <span>새 버전이 있어요.</span>
      <button type="button" className="primary" onClick={refresh} disabled={busy}>
        {busy ? '바꾸는 중…' : '새로고침'}
      </button>
      <button type="button" onClick={() => setNeedRefresh(false)} disabled={busy}>
        나중에
      </button>
    </div>
  );
}
