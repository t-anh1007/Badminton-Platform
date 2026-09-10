import { useEffect, useRef, useState } from 'react';
import { streamMyFinance, type FinanceUiScope } from '../../lib/financeApi.js';

export type FinanceRealtimeStatus = 'connecting' | 'live' | 'offline';

export function useFinanceRealtime(onRefresh: (scopes: ReadonlySet<FinanceUiScope>) => void | Promise<void>) {
  const refreshRef = useRef(onRefresh);
  const [status, setStatus] = useState<FinanceRealtimeStatus>('connecting');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  refreshRef.current = onRefresh;

  useEffect(() => {
    let disposed = false;
    let attempt = 0;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const pending = new Set<FinanceUiScope>();

    const refresh = () => {
      const scopes = new Set(pending);
      pending.clear();
      void Promise.resolve(refreshRef.current(scopes)).finally(() => setLastUpdatedAt(new Date()));
    };
    const queueRefresh = (scopes: FinanceUiScope[]) => {
      scopes.forEach((scope) => pending.add(scope));
      if (!refreshTimer) refreshTimer = setTimeout(() => { refreshTimer = undefined; refresh(); }, 150);
    };
    const connect = () => {
      if (disposed) return;
      controller = new AbortController();
      setStatus('connecting');
      void streamMyFinance(controller.signal, queueRefresh, () => {
        attempt = 0;
        setStatus('live');
        queueRefresh(['wallet', 'revenue', 'ledger', 'withdrawals']);
      }).catch(() => {
        if (disposed || controller?.signal.aborted) return;
        setStatus('offline');
        const delay = Math.min(1_000 * 2 ** attempt, 15_000);
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') queueRefresh(['wallet', 'revenue', 'ledger', 'withdrawals']);
    };
    document.addEventListener('visibilitychange', onVisibility);
    connect();
    const safetyTimer = setInterval(onVisibility, 60_000);
    return () => {
      disposed = true;
      controller?.abort();
      if (refreshTimer) clearTimeout(refreshTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(safetyTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return { status, lastUpdatedAt };
}
