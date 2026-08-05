import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

/**
 * Hero — DESIGN.md §2.3: thay cảnh 3D bằng ảnh tĩnh/illustration phẳng +
 * overlay gradient tối, parallax nhiều lớp bằng CSS transform (translateY
 * theo scroll) để giữ cảm giác chiều sâu mà KHÔNG cần WebGL/canvas.
 */
export function Hero({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setOffset(Math.max(0, -rect.top));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div ref={ref} className="relative isolate flex min-h-[90vh] items-center overflow-hidden bg-court-green">
      {/* Lớp nền — di chuyển chậm nhất */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(245,230,99,0.12),transparent_55%)]"
        style={{ transform: `translateY(${offset * 0.15}px)` }}
      />
      {/* Lớp giữa — lưới sân cách điệu bằng SVG phẳng */}
      <svg
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/2 w-full stroke-accent-shuttle opacity-20"
        style={{ transform: `translateY(${offset * 0.3}px)` }}
        viewBox="0 0 800 200"
        preserveAspectRatio="none"
      >
        <line x1="0" y1="0" x2="800" y2="0" strokeWidth="2" />
        <line x1="400" y1="0" x2="400" y2="200" strokeWidth="2" />
        <rect x="20" y="20" width="760" height="160" fill="none" strokeWidth="2" />
      </svg>
      {/* Overlay gradient tối để chữ nổi bật */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-court-green via-court-green/60 to-transparent" />

      {/* Nội dung — lớp cận cảnh, di chuyển nhanh nhất (ngược hướng nhẹ) */}
      <div
        className="relative z-10 mx-auto max-w-3xl px-6 text-center"
        style={{ transform: `translateY(${offset * -0.05}px)` }}
      >
        <p className="text-caption mb-4">Nền tảng cầu lông</p>
        <h1 className="text-h1 text-on-dark">{title}</h1>
        <p className="text-body mt-4 text-on-dark/80">{subtitle}</p>
        {actions && <div className="mt-8 flex flex-wrap items-center justify-center gap-4">{actions}</div>}
      </div>
    </div>
  );
}
