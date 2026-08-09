import { useEffect, useState } from 'react';

/**
 * Light Playo preloader: CSS-only, and disabled by the global reduced-motion rule.
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
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-surface transition-opacity duration-300 ${
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
        <circle cx="32" cy="18" r="10" className="fill-green-600" />
        <path
          d="M32 28 L20 52 L32 46 L44 52 Z"
          className="fill-green-100"
          opacity="0.9"
        />
      </svg>
      <p className="mt-4 text-sm font-medium text-ink-500">Đang chuẩn bị sân cho bạn</p>
    </div>
  );
}
