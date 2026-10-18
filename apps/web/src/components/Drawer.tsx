import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon';

/** Khung chi tiết trượt từ phải (admin): Esc hoặc bấm nền để đóng; footer chứa thao tác. */
export function Drawer({ open, label, kicker, title, children, footer, onClose }: { open: boolean; label: string; kicker?: ReactNode; title: ReactNode; children: ReactNode; footer?: ReactNode; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000]" role="presentation">
      <div className="absolute inset-0 bg-brand-navy/50" aria-hidden="true" onMouseDown={onClose} />
      <aside role="dialog" aria-modal="true" aria-label={label} className="absolute inset-y-0 right-0 flex w-[min(100%,30rem)] flex-col gap-4 overflow-y-auto bg-surface p-6 shadow-[var(--shadow-raised)]">
        <div className="flex items-start justify-between gap-3">
          <div>{kicker && <p className="text-figures text-xs text-ink-500">{kicker}</p>}<h2 className="mt-1 text-h3 !text-2xl">{title}</h2></div>
          <button type="button" aria-label="Đóng" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-500 hover:bg-canvas hover:text-brand-navy"><Icon name="close" /></button>
        </div>
        {children}
        {footer && <div className="mt-auto border-t border-line pt-4">{footer}</div>}
      </aside>
    </div>
  );
}

/** Danh sách nhãn – giá trị trong drawer. */
export function DetailList({ items }: { items: Array<[string, ReactNode] | false | null | undefined> }) {
  return <dl className="text-sm">{items.filter((item): item is [string, ReactNode] => Boolean(item)).map(([label, value]) => <div key={label} className="flex justify-between gap-6 border-t border-line py-2.5"><dt className="text-ink-500">{label}</dt><dd className="text-right font-semibold text-ink-900">{value}</dd></div>)}</dl>;
}
