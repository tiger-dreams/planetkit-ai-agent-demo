import { useEffect } from 'react';

/** Keep an active call visible; unsupported browsers simply skip the request. */
export const useWakeLock = (active: boolean) => {
  useEffect(() => {
    if (!active || !navigator.wakeLock) return;

    let disposed = false;
    let pending = false;
    let sentinel: WakeLockSentinel | null = null;

    const acquire = async () => {
      if (disposed || pending || (sentinel && !sentinel.released) || document.visibilityState !== 'visible') return;
      pending = true;
      try {
        const acquired = await navigator.wakeLock.request('screen');
        if (disposed) {
          await acquired.release();
        } else {
          sentinel = acquired;
        }
      } catch (error) {
        console.warn('[WakeLock] Request failed:', error);
      } finally {
        pending = false;
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', acquire);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
};
