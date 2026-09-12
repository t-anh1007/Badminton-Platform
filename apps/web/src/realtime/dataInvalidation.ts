import { useEffect, useRef } from 'react';

export type DataInvalidation = { source: 'mutation' | 'notification'; occurredAt: string };
const eventName = 'courtin:data-invalidated';

export function publishDataInvalidation(source: DataInvalidation['source'] = 'mutation') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<DataInvalidation>(eventName, { detail: { source, occurredAt: new Date().toISOString() } }));
}

export function subscribeToDataInvalidations(listener: (event: DataInvalidation) => void) {
  const onInvalidated = (event: Event) => listener((event as CustomEvent<DataInvalidation>).detail);
  window.addEventListener(eventName, onInvalidated);
  return () => window.removeEventListener(eventName, onInvalidated);
}

/** Refetches an authoritative page snapshot without remounting the current route. */
export function useLiveDataRefresh(refresh: () => void | Promise<void>, delayMs = 150) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    let timer: number | undefined;
    return subscribeToDataInvalidations(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refreshRef.current(), delayMs);
    });
  }, [delayMs]);
}
