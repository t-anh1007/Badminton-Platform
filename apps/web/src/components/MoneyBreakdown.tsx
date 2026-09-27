import type { ReactNode } from 'react';
import { formatMoneyVnd } from '../lib/formatters.js';

export type MoneyPart = { label: string; value: string; color: string; detail?: string };

/** Một khoản tổng và các khoản con cấu thành nó: thanh tỷ lệ xếp chồng + chú thích số tiền, phần trăm. */
export function MoneyBreakdown({ title, totalLabel, parts, note, footer }: { title: string; totalLabel: string; parts: MoneyPart[]; note?: string; footer?: ReactNode }) {
  const values = parts.map((part) => { const value = BigInt(part.value); return value > 0n ? value : 0n; });
  const total = values.reduce((sum, value) => sum + value, 0n);
  const percent = (value: bigint) => total > 0n ? Number((value * 1000n) / total) / 10 : 0;
  return <section className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]" aria-label={title}>
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div><h3 className="text-h3">{title}</h3>{note ? <p className="mt-1 text-xs text-ink-500">{note}</p> : null}</div>
      <div className="text-right"><p className="text-caption text-ink-500">{totalLabel}</p><p className="text-figures text-2xl font-bold text-brand-navy">{formatMoneyVnd(total)}</p></div>
    </div>
    <div className="mt-4 flex h-3 gap-[2px] rounded-full bg-canvas [&>span:first-child]:rounded-l-full [&>span:last-child]:rounded-r-full" role="img" aria-label={`${totalLabel} ${formatMoneyVnd(total)} gồm ${parts.map((part) => part.label).join(', ')}`}>
      {parts.map((part, index) => values[index] > 0n ? <span key={part.label} className={`group relative ${part.color}`} style={{ flexGrow: Number(values[index]) }}>
        <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max max-w-56 -translate-x-1/2 rounded-lg bg-ink-900 px-3 py-2 text-xs text-surface shadow-[var(--shadow-raised)] group-hover:block">{part.label}: <strong className="text-figures">{formatMoneyVnd(part.value)}</strong> ({percent(values[index])}%)</span>
      </span> : null)}
    </div>
    <ul className="mt-4 grid gap-2 sm:grid-cols-2">
      {parts.map((part, index) => <li key={part.label} className="flex items-start gap-2 text-sm">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${part.color}`} aria-hidden="true" />
        <div className="min-w-0 flex-1"><p className="text-ink-700">{part.label}</p>{part.detail ? <p className="text-xs text-ink-500">{part.detail}</p> : null}</div>
        <div className="text-right"><p className="text-figures font-semibold text-ink-900">{formatMoneyVnd(part.value)}</p><p className="text-xs text-ink-500">{percent(values[index])}%</p></div>
      </li>)}
    </ul>
    {footer ? <div className="mt-4">{footer}</div> : null}
  </section>;
}
