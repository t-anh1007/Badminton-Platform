import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type RefObject, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { RouteState } from './RouteState.js';

const buttonTone = {
  primary: 'bg-brand-yellow text-brand-navy hover:bg-brand-yellow-hover',
  secondary: 'border border-line bg-surface text-brand-navy hover:border-brand-navy hover:bg-canvas',
  ghost: 'text-brand-navy hover:bg-green-50',
  danger: 'bg-danger text-surface hover:brightness-95',
} as const;
const buttonSize = { sm: 'px-3 py-2 text-xs', md: 'px-5 py-2.5 text-sm', lg: 'px-6 py-3 text-sm' } as const;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof buttonTone; size?: keyof typeof buttonSize };
export function Button({ children, className = '', tone = 'primary', size = 'md', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full font-bold uppercase tracking-[0.035em] transition duration-150 enabled:hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${buttonTone[tone]} ${buttonSize[size]} ${className}`} {...props}>{children}</button>;
}
export function AsyncButton({ pending, pendingLabel = 'Đang xử lý…', disabled, children, ...props }: ButtonProps & { pending: boolean; pendingLabel?: string }) {
  return <Button aria-busy={pending || undefined} disabled={pending || disabled} {...props}>{pending ? pendingLabel : children}</Button>;
}
export function SurfaceCard({ children, className = '', hoverable = false }: { children: ReactNode; className?: string; hoverable?: boolean }) { return <section className={`surface-card p-4 sm:p-5 ${hoverable ? 'transition duration-150 hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)]' : ''} ${className}`}>{children}</section>; }
const fieldClass = 'w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2.5 text-ink-900 placeholder:text-ink-300 transition focus:border-brand-navy focus:ring-4 focus:ring-green-100';
export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) { return <input className={`${fieldClass} ${className}`} {...props} />; }
export function SelectInput({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) { return <select className={`${fieldClass} ${className}`} {...props}>{children}</select>; }
export function TextArea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className={`${fieldClass} ${className}`} {...props} />; }
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'success' | 'warning' | 'danger' | 'neutral' }) { const styles = { success: 'bg-success-bg text-success', warning: 'bg-warning-bg text-warning', danger: 'bg-danger-bg text-danger', neutral: 'bg-canvas text-ink-500' } as const; return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-caption ${styles[tone]}`}>{children}</span>; }
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void }) { return <div className="flex gap-5 overflow-x-auto border-b border-line" role="tablist">{tabs.map((tab) => <button key={tab.value} type="button" role="tab" aria-selected={value === tab.value} onClick={() => onChange(tab.value)} className={`shrink-0 border-b-2 px-1 pb-3 text-sm font-bold transition ${value === tab.value ? 'border-brand-yellow text-brand-navy' : 'border-transparent text-ink-500 hover:text-brand-navy'}`}>{tab.label}</button>)}</div>; }
export function SegmentedControl<T extends string>({ options, value, onChange }: { options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void }) { return <div className="inline-flex rounded-full border border-line bg-canvas p-1">{options.map((option) => <button key={option.value} type="button" onClick={() => onChange(option.value)} className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${value === option.value ? 'bg-brand-navy text-surface' : 'text-ink-500 hover:bg-surface hover:text-brand-navy'}`}>{option.label}</button>)}</div>; }
export function Modal({ open, title, children, onClose, initialFocusRef }: { open: boolean; title: string; children: ReactNode; onClose: () => void; initialFocusRef?: RefObject<HTMLElement | null> }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const initialFocusRefRef = useRef(initialFocusRef);
  onCloseRef.current = onClose;
  initialFocusRefRef.current = initialFocusRef;
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    const timer = window.setTimeout(() => (initialFocusRefRef.current?.current ?? focusables()[0])?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onCloseRef.current(); return; }
      if (event.key !== 'Tab') return;
      const items = focusables(); if (!items.length) return;
      const first = items[0]; const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { window.clearTimeout(timer); window.removeEventListener('keydown', onKeyDown); previousFocusRef.current?.focus(); previousFocusRef.current = null; };
  }, [open]);
  if (!open) return null;
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-brand-navy/65 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-surface shadow-[var(--shadow-raised)]"><div className="flex items-center justify-between border-b border-line px-5 py-4"><h2 id={titleId} className="text-h3">{title}</h2><button type="button" onClick={onClose} aria-label="Đóng hộp thoại" className="grid h-11 w-11 place-items-center rounded-full text-ink-500 hover:bg-canvas hover:text-brand-navy">×</button></div><div className="p-5 sm:p-6">{children}</div></div></div>;
}
export function Toast({ message, tone = 'info' }: { message: string; tone?: 'success' | 'error' | 'info' }) { const [visible, setVisible] = useState(true); useEffect(() => { const timer = window.setTimeout(() => setVisible(false), 4_000); return () => window.clearTimeout(timer); }, []); const styles = { success: 'border-success', error: 'border-danger', info: 'border-info' } as const; return visible ? <div role="status" className={`fixed right-4 top-24 z-[90] max-w-sm rounded-2xl border border-line border-l-4 bg-surface p-4 text-sm text-ink-700 shadow-[var(--shadow-raised)] ${styles[tone]}`}>{message}</div> : null; }
export function Skeleton({ className = '' }: { className?: string }) { return <div aria-label="Đang tải" className={`animate-skeleton-shimmer rounded-[var(--radius-control)] bg-[linear-gradient(90deg,#E5E5E0_25%,#F7F7F5_50%,#E5E5E0_75%)] bg-[length:200%_100%] ${className}`} />; }
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) { return <RouteState variant="empty" title={title} description={description} action={action} />; }
export function Avatar({ label = 'T', className = '' }: { label?: string; className?: string }) { return <span aria-label="Tài khoản" className={`grid h-9 w-9 place-items-center rounded-full bg-brand-yellow text-sm font-bold text-brand-navy ${className}`}>{label.slice(0, 1).toUpperCase()}</span>; }
export function Pagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) { return <nav className="flex items-center justify-center gap-2" aria-label="Phân trang"><Button tone="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>‹</Button><span className="text-sm text-ink-500">Trang <span className="text-figures text-ink-900">{page}</span> / {pageCount}</span><Button tone="secondary" size="sm" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>›</Button></nav>; }
export function CarouselButtons({ onPrevious, onNext }: { onPrevious: () => void; onNext: () => void }) { return <div className="flex gap-2"><Button tone="secondary" size="sm" aria-label="Xem mục trước" onClick={onPrevious}>‹</Button><Button tone="secondary" size="sm" aria-label="Xem mục sau" onClick={onNext}>›</Button></div>; }
