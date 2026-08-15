import type { ReactNode } from 'react';
import { SurfaceCard } from './ui';

/**
 * Card — DESIGN.md §2.3: border-radius trung bình, shadow nhẹ, hover
 * translateY(-2px) + shadow tăng nhẹ (CSS transition, KHÔNG 3D transform/tilt).
 */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <SurfaceCard hoverable className={className}>{children}</SurfaceCard>;
}
