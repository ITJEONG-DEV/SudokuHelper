import { useRegisterSW } from 'virtual:pwa-register/react';

/** 새 버전을 확인하는 간격 (앱을 오래 켜 둔 경우) */
const CHECK_INTERVAL = 60 * 60 * 1000;

/**
 * 새 버전이 받아지면 새로고침 안내를 띄운다.
 * 퍼즐 도우미 네 앱에 같은 파일이 있다.
 */
export function UpdateBanner() {
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

  if (!needRefresh) return null;
  return (
    <div className="update-banner" role="status">
      <span>새 버전이 있어요.</span>
      <button type="button" className="primary" onClick={() => updateServiceWorker(true)}>
        새로고침
      </button>
      <button type="button" onClick={() => setNeedRefresh(false)}>
        나중에
      </button>
    </div>
  );
}
