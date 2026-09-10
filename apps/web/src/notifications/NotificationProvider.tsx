import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getRecentNotifications, openNotificationStream, readAllNotifications, readNotification, type NotificationItem } from '../lib/notificationApi.js';
import { useSession } from '../session/SessionProvider.js';
type Value = { recent: NotificationItem[]; unreadCount: number; refresh: () => Promise<void>; markRead: (id: string) => Promise<void>; markAllRead: () => Promise<void> };
const Context = createContext<Value | null>(null);
const NOTIFICATION_IDLE_MS = 180_000;
const NOTIFICATION_MAX_RECONNECT_MS = 15_000;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { session } = useSession(); const [recent, setRecent] = useState<NotificationItem[]>([]); const [unreadCount, setUnreadCount] = useState(0);
  const refresh = useCallback(async () => { if (!session) { setRecent([]); setUnreadCount(0); return; } const next = await getRecentNotifications(); setRecent(next.items); setUnreadCount(next.unreadCount); }, [session]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!session) return;
    let disposed = false;
    let idle = false;
    let attempt = 0;
    let streamGeneration = 0;
    let closeStream: (() => void) | undefined;
    let refreshTimer: number | undefined;
    let idleTimer: number | undefined;
    let reconnectTimer: number | undefined;

    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void refresh(), 250);
    };
    const disconnect = () => {
      streamGeneration += 1;
      closeStream?.();
      closeStream = undefined;
      window.clearTimeout(reconnectTimer);
    };
    const connect = () => {
      if (disposed || idle || document.visibilityState !== 'visible' || closeStream) return;
      const generation = ++streamGeneration;
      closeStream = openNotificationStream(scheduleRefresh, () => {
        if (generation !== streamGeneration) return;
        attempt = 0;
        scheduleRefresh();
      }, () => {
        if (generation !== streamGeneration || disposed || idle || document.visibilityState !== 'visible') return;
        closeStream = undefined;
        const delay = Math.min(1_000 * 2 ** attempt, NOTIFICATION_MAX_RECONNECT_MS);
        attempt += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      });
    };
    const markUserActive = () => {
      if (document.visibilityState !== 'visible') return;
      idle = false;
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        idle = true;
        disconnect();
      }, NOTIFICATION_IDLE_MS);
      connect();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        idle = true;
        window.clearTimeout(idleTimer);
        disconnect();
        return;
      }
      markUserActive();
      scheduleRefresh();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pointerdown', markUserActive, { passive: true });
    window.addEventListener('keydown', markUserActive);
    markUserActive();

    return () => {
      disposed = true;
      disconnect();
      window.clearTimeout(refreshTimer);
      window.clearTimeout(idleTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pointerdown', markUserActive);
      window.removeEventListener('keydown', markUserActive);
    };
  }, [refresh, session]);
  const value = useMemo<Value>(() => ({ recent, unreadCount, refresh, markRead: async (id) => { const result = await readNotification(id); setUnreadCount(result.unreadCount); setRecent((rows) => rows.map((row) => row.id === id ? { ...row, readAt: row.readAt ?? new Date().toISOString() } : row)); }, markAllRead: async () => { await readAllNotifications(); setUnreadCount(0); setRecent((rows) => rows.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() }))); } }), [recent, unreadCount, refresh]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useNotifications() { const value = useContext(Context); if (!value) throw new Error('NotificationProvider missing'); return value; }
