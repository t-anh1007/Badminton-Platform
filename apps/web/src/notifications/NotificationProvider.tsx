import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getRecentNotifications, openNotificationStream, readAllNotifications, readNotification, type NotificationItem } from '../lib/notificationApi.js';
import { useSession } from '../session/SessionProvider.js';
type Value = { recent: NotificationItem[]; unreadCount: number; refresh: () => Promise<void>; markRead: (id: string) => Promise<void>; markAllRead: () => Promise<void> };
const Context = createContext<Value | null>(null);
export function NotificationProvider({ children }: { children: ReactNode }) {
  const { session } = useSession(); const [recent, setRecent] = useState<NotificationItem[]>([]); const [unreadCount, setUnreadCount] = useState(0);
  const refresh = useCallback(async () => { if (!session) { setRecent([]); setUnreadCount(0); return; } const next = await getRecentNotifications(); setRecent(next.items); setUnreadCount(next.unreadCount); }, [session]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!session) return; let timer: number | undefined; const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void refresh(), 250); }; const close = openNotificationStream(schedule); return () => { close(); window.clearTimeout(timer); }; }, [refresh, session]);
  const value = useMemo<Value>(() => ({ recent, unreadCount, refresh, markRead: async (id) => { const result = await readNotification(id); setUnreadCount(result.unreadCount); setRecent((rows) => rows.map((row) => row.id === id ? { ...row, readAt: row.readAt ?? new Date().toISOString() } : row)); }, markAllRead: async () => { await readAllNotifications(); setUnreadCount(0); setRecent((rows) => rows.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() }))); } }), [recent, unreadCount, refresh]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useNotifications() { const value = useContext(Context); if (!value) throw new Error('NotificationProvider missing'); return value; }
