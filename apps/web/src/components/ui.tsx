import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const buttonTone = {
  primary: 'bg-green-600 text-surface hover:bg-green-700',
  secondary: 'border border-line bg-surface text-ink-900 hover:bg-canvas',
  ghost: 'text-green-700 hover:bg-green-50',
  danger: 'bg-danger text-surface hover:brightness-95',
} as const;

const buttonSize = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-sm', lg: 'px-6 py-3 text-base' } as const;

export function Button({ children, className = '', tone = 'primary', size = 'md', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof buttonTone; size?: keyof typeof buttonSize }) {
  return <button type={type} className={`inline-flex items-center justify-center rounded-full font-semibold transition duration-150 enabled:hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${buttonTone[tone]} ${buttonSize[size]} ${className}`} {...props}>{children}</button>;
}

export function SurfaceCard({ children, className = '', hoverable = false }: { children: ReactNode; className?: string; hoverable?: boolean }) {
  return <section className={`surface-card p-4 sm:p-6 ${hoverable ? 'transition duration-150 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgb(20_30_40_/_10%)]' : ''} ${className}`}>{children}</section>;
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-ink-900 placeholder:text-ink-300 focus:border-green-600 focus:ring-4 focus:ring-green-100 ${className}`} {...props} />;
}

export function SelectInput({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-ink-900 focus:border-green-600 focus:ring-4 focus:ring-green-100 ${className}`} {...props}>{children}</select>;
}

export function TextArea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-ink-900 placeholder:text-ink-300 focus:border-green-600 focus:ring-4 focus:ring-green-100 ${className}`} {...props} />;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'success' | 'warning' | 'danger' | 'neutral' }) {
  const styles = { success: 'bg-green-100 text-green-700', warning: 'bg-warning-bg text-ink-700', danger: 'bg-danger-bg text-danger', neutral: 'bg-canvas text-ink-500' } as const;
  return <span className={`inline-flex items-center rounded-lg px-2 py-1 text-caption ${styles[tone]}`}>{children}</span>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return <div className="flex gap-5 overflow-x-auto border-b border-line" role="tablist">
    {tabs.map((tab) => <button key={tab.value} type="button" role="tab" aria-selected={value === tab.value} onClick={() => onChange(tab.value)} className={`shrink-0 border-b-2 px-1 pb-3 text-sm font-semibold transition ${value === tab.value ? 'border-green-600 text-green-700' : 'border-transparent text-ink-500 hover:text-ink-900'}`}>{tab.label}</button>)}
  </div>;
}

export function SegmentedControl<T extends string>({ options, value, onChange }: { options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return <div className="inline-flex rounded-full border border-line bg-surface p-1">
    {options.map((option) => <button key={option.value} type="button" onClick={() => onChange(option.value)} className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${value === option.value ? 'bg-green-600 text-surface' : 'text-ink-500 hover:bg-green-50 hover:text-green-700'}`}>{option.label}</button>)}
  </div>;
}

export function Modal({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const getFocusables = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    window.setTimeout(() => getFocusables()[0]?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const focusables = getFocusables();
      if (focusables.length === 0) return;
      const first = focusables[0]; const last = focusables.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); previous?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-ink-900/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-surface shadow-[0_16px_48px_rgb(20_30_40_/_18%)]">
      <div className="flex items-center justify-between border-b border-line px-5 py-4"><h2 id="dialog-title" className="text-h3">{title}</h2><button type="button" onClick={onClose} aria-label="Đóng hộp thoại" className="grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-canvas hover:text-ink-900">×</button></div>
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  </div>;
}

export function Toast({ message, tone = 'info' }: { message: string; tone?: 'success' | 'error' | 'info' }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => { const timer = window.setTimeout(() => setVisible(false), 4_000); return () => window.clearTimeout(timer); }, []);
  const styles = { success: 'border-success', error: 'border-danger', info: 'border-info' } as const;
  return visible ? <div role="status" className={`fixed right-4 top-20 z-[90] max-w-sm rounded-xl border border-line border-l-4 bg-surface p-4 text-sm text-ink-700 shadow-lg ${styles[tone]}`}>{message}</div> : null;
}

export function Skeleton({ className = '' }: { className?: string }) { return <div aria-label="Đang tải" className={`animate-skeleton-shimmer rounded-xl bg-[linear-gradient(90deg,#ECEDEF_25%,#F8F9FA_50%,#ECEDEF_75%)] bg-[length:200%_100%] ${className}`} />; }

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="surface-card flex flex-col items-center p-8 text-center"><div aria-hidden className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-green-50 text-xl text-green-700">⌁</div><h2 className="text-h3">{title}</h2><p className="mt-2 max-w-md text-sm text-ink-500">{description}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

export function Avatar({ label = 'T', className = '' }: { label?: string; className?: string }) { return <span aria-label="Tài khoản" className={`grid h-9 w-9 place-items-center rounded-full bg-green-100 text-sm font-bold text-green-700 ${className}`}>{label.slice(0, 1).toUpperCase()}</span>; }

export function Pagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) {
  return <nav className="flex items-center justify-center gap-2" aria-label="Phân trang"><Button tone="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>‹</Button><span className="text-sm text-ink-500">Trang <span className="text-figures text-ink-900">{page}</span> / {pageCount}</span><Button tone="secondary" size="sm" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>›</Button></nav>;
}

export function CarouselButtons({ onPrevious, onNext }: { onPrevious: () => void; onNext: () => void }) {
  return <div className="flex gap-2"><Button tone="secondary" size="sm" aria-label="Xem mục trước" onClick={onPrevious}>‹</Button><Button tone="secondary" size="sm" aria-label="Xem mục sau" onClick={onNext}>›</Button></div>;
}
