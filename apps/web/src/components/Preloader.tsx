import { useEffect, useState } from 'react';

/**
 * Preloader — DESIGN.md §2.3. Overlay toàn màn hình khi trang vừa load, tự ẩn
 * sau khi asset chính đã sẵn sàng. CHỈ CSS @keyframes (không Framer Motion) để
 * giữ bundle nhẹ — ràng buộc hiệu năng §5.
 */
export function Preloader() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const hide = () => {
      setFading(true);
      window.setTimeout(() => setVisible(false), 300);
    };
    if (document.readyState === 'complete') {
      const t = window.setTimeout(hide, 250);
      return () => window.clearTimeout(t);
    }
    window.addEventListener('load', hide);
    return () => window.removeEventListener('load', hide);
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-court-green transition-opacity duration-300 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
      role="status"
      aria-label="Đang tải"
    >
      <svg
        className="h-16 w-16 animate-shuttle-bounce"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="32" cy="18" r="10" className="fill-accent-shuttle" />
        <path
          d="M32 28 L20 52 L32 46 L44 52 Z"
          className="fill-on-dark"
          opacity="0.9"
        />
      </svg>
    </div>
  );
}
