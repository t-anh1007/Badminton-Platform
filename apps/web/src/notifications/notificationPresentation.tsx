type NotificationCategory = 'booking' | 'finance' | 'match' | 'dispute' | 'support' | 'security' | 'community';
type NotificationRole = 'player' | 'provider' | 'admin';

const categoryDetails: Record<NotificationCategory, { label: string; className: string }> = {
  booking: { label: 'Đặt sân', className: 'bg-success-bg text-success' },
  finance: { label: 'Tài chính', className: 'bg-warning-bg text-warning' },
  match: { label: 'Kèo', className: 'bg-[#e9f0fa] text-info' },
  dispute: { label: 'Tranh chấp', className: 'bg-danger-bg text-danger' },
  support: { label: 'Hỗ trợ', className: 'bg-[#eeeafd] text-[#6850a5]' },
  security: { label: 'Bảo mật', className: 'bg-[#eeeafd] text-[#6850a5]' },
  community: { label: 'Cộng đồng', className: 'bg-[#e8f5ef] text-success' },
};

export function notificationCategoryLabel(category: string) { return categoryDetails[category as NotificationCategory]?.label ?? category; }
export function notificationRoleLabel(role: NotificationRole) { return role === 'provider' ? 'Chủ sân' : role === 'admin' ? 'Quản trị viên' : 'Người chơi'; }

export function NotificationCategoryIcon({ category, className = '' }: { category: string; className?: string }) {
  const tone = categoryDetails[category as NotificationCategory]?.className ?? 'bg-canvas text-ink-500';
  const common = 'h-4 w-4 fill-none stroke-current stroke-[1.8] stroke-linecap-round stroke-linejoin-round';
  const glyph = category === 'booking' ? <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>
    : category === 'finance' ? <><path d="M12 3v18M16 7.5c-.8-1-2.1-1.5-4-1.5-2.5 0-4 1.2-4 3s1.5 3 4 3 4 1.2 4 3-1.5 3-4 3c-1.9 0-3.2-.5-4-1.5" /></>
      : category === 'match' ? <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="10" r="2" /><path d="M3.5 20c.5-3.4 2.5-5 5.5-5s5 1.6 5.5 5M15 15.5c2.5.1 4.2 1.5 4.7 4.5" /></>
        : category === 'dispute' ? <><path d="M12 4v16M6 7h12M5 7l-2 5h6L6 7M18 7l-3 5h6l-3-5" /></>
          : category === 'support' ? <><path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v5a3.5 3.5 0 0 1-3.5 3.5H11l-4 4v-4.3A3.5 3.5 0 0 1 5 11.5z" /><path d="M9 9h6M9 12h3" /></>
            : category === 'security' ? <><path d="M12 3 19 6v5c0 4.5-3 7.7-7 10-4-2.3-7-5.5-7-10V6z" /><path d="m9.5 12 1.7 1.7 3.5-3.5" /></>
              : <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="10" r="2" /><path d="M3.5 20c.5-3.4 2.5-5 5.5-5s5 1.6 5.5 5M15 15.5c2.5.1 4.2 1.5 4.7 4.5" /></>;
  return <span aria-hidden="true" className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone} ${className}`}><svg viewBox="0 0 24 24" className={common}>{glyph}</svg></span>;
}

export function formatNotificationTime(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} giờ`;
  if (minutes < 48 * 60) return 'Hôm qua';
  return new Date(value).toLocaleDateString('vi-VN');
}
