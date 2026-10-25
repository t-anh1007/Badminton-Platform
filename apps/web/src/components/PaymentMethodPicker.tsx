import { useId } from 'react';
import { formatMoneyVnd } from '../lib/formatters.js';

export type PaymentMethod = 'balance' | 'sepay';

/** Chọn phương thức thanh toán dùng chung cho đặt sân, vào kèo, đóng phần góp, trả giúp. */
export function PaymentMethodPicker({ value, onChange, balance, disabled = false, label = 'Phương thức thanh toán' }: {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  /** Số dư ví: chuỗi VND, null = không khả dụng, undefined = không hiển thị. */
  balance?: string | null;
  disabled?: boolean;
  label?: string;
}) {
  const name = useId();
  const options: Array<{ value: PaymentMethod; title: string; hint: string }> = [
    { value: 'balance', title: 'Số dư ví', hint: balance === undefined ? 'Trừ ngay vào ví CourtIn' : balance === null ? 'Không khả dụng' : `Hiện có ${formatMoneyVnd(balance)}` },
    { value: 'sepay', title: 'Chuyển khoản VietQR', hint: 'Qua SePay, tự xác nhận khi tiền về' },
  ];
  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-semibold text-ink-700">{label}</legend>
      {options.map((option) => (
        <label key={option.value} className={`flex cursor-pointer items-center gap-3 rounded-2xl border bg-surface px-4 py-3 transition ${value === option.value ? 'border-brand-navy ring-4 ring-green-100' : 'border-line hover:border-ink-300'}`}>
          <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="h-5 w-5 accent-brand-navy" />
          <span><span className="block font-bold text-ink-900">{option.title}</span><span className="text-sm text-ink-500">{option.hint}</span></span>
        </label>
      ))}
    </fieldset>
  );
}

/** Đồng hồ giữ chỗ dạng nhãn. */
export function HoldTimer({ remainingMs, label = 'Giữ chỗ còn' }: { remainingMs: number; label?: string }) {
  const text = `${String(Math.floor(remainingMs / 60_000)).padStart(2, '0')}:${String(Math.floor((remainingMs % 60_000) / 1000)).padStart(2, '0')}`;
  return <p className="flex items-center justify-between gap-3 text-sm text-ink-500">{label}<span className="text-figures rounded-full bg-warning-bg px-3 py-1 font-semibold text-warning">{text}</span></p>;
}
