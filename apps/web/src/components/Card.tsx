import type { ReactNode } from 'react';

/**
 * Card — DESIGN.md §2.3: border-radius trung bình, shadow nhẹ, hover
 * translateY(-2px) + shadow tăng nhẹ (CSS transition, KHÔNG 3D transform/tilt).
 */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl bg-bg-white p-6 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${className}`}
    >
      {children}
    </div>
  );
}
