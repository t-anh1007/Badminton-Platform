import { useState } from 'react';
import type { SepayPayInstruction } from '../lib/financeApi.js';
import { formatMoneyVnd } from '../lib/formatters.js';
import { Button } from './ui.js';

/** Hộp thanh toán SePay: ảnh VietQR (quét ra sẵn số tiền + nội dung) kèm chi
 * tiết tài khoản nhận và mã đối soát để người dùng nhập tay khi cần. */
export function SepayPayBox({ payment }: { payment: SepayPayInstruction }) {
  const [copied, setCopied] = useState<'code' | 'account' | null>(null);
  const copy = async (value: string, which: 'code' | 'account') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      window.setTimeout(() => setCopied((prev) => (prev === which ? null : prev)), 1500);
    } catch {
      /* clipboard bị chặn — người dùng vẫn nhập tay được từ text hiển thị */
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-figures text-2xl font-bold text-green-700">{formatMoneyVnd(payment.amount)}</p>
      <div className="flex justify-center">
        <img
          src={payment.qrImageUrl}
          alt={`Mã VietQR chuyển ${formatMoneyVnd(payment.amount)} nội dung ${payment.matchCode}`}
          width={240}
          height={240}
          className="rounded-xl border border-ink-100 bg-white p-2"
        />
      </div>
      <dl className="space-y-1 rounded-xl bg-canvas p-3 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-ink-500">Ngân hàng</dt><dd className="text-figures font-medium">{payment.bankCode}</dd></div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-500">Số tài khoản</dt>
          <dd className="flex items-center gap-2 text-figures font-medium">
            {payment.accountNumber}
            <Button size="sm" tone="secondary" onClick={() => void copy(payment.accountNumber, 'account')}>
              {copied === 'account' ? 'Đã chép' : 'Chép'}
            </Button>
          </dd>
        </div>
        <div className="flex justify-between gap-3"><dt className="text-ink-500">Chủ tài khoản</dt><dd className="text-figures font-medium">{payment.accountName}</dd></div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-500">Nội dung (bắt buộc)</dt>
          <dd className="flex items-center gap-2 text-figures font-bold">
            {payment.matchCode}
            <Button size="sm" tone="secondary" onClick={() => void copy(payment.matchCode, 'code')}>
              {copied === 'code' ? 'Đã chép' : 'Chép'}
            </Button>
          </dd>
        </div>
      </dl>
      <p className="text-sm text-ink-500">
        Quét mã hoặc chuyển đúng nội dung ở trên. Trạng thái tự cập nhật sau khi ngân hàng báo có và webhook được đối
        soát.
      </p>
    </div>
  );
}
