import { Link } from 'react-router-dom';

const LINKS: { to: string; label: string }[] = [
  { to: '/', label: 'Trang chủ' },
  { to: '/auth', label: 'Đăng nhập' },
  { to: '/booking', label: 'Đặt sân' },
  { to: '/profile', label: 'Hồ sơ' },
  { to: '/admin', label: 'Quản trị' },
];

/**
 * Menu overlay full-screen — DESIGN.md §2.3: nền navy đặc, link cỡ chữ lớn,
 * label phụ màu accent, social icon viền tròn outline. KHÔNG có mục
 * "Download App" (dự án không có app di động).
 */
export function MenuOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div
      className={`fixed inset-0 z-[60] bg-primary-navy transition-opacity duration-300 ${
        open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
      }`}
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
    >
      <div className="mx-auto flex h-full max-w-6xl flex-col justify-between px-6 py-6">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng menu"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-on-dark/40 text-on-dark"
          >
            ✕
          </button>
        </div>

        <nav className="flex flex-col gap-3">
          <span className="text-caption">Điều hướng</span>
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={onClose}
              className="text-4xl font-extrabold uppercase text-on-dark transition-colors hover:text-accent-shuttle sm:text-5xl"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <span className="text-caption">Kết nối</span>
          {['FB', 'IG', 'YT'].map((s) => (
            <span
              key={s}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-on-dark/40 text-xs text-on-dark"
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
