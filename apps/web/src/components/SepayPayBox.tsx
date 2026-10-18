import { useState } from 'react';
import type { SepayPayInstruction } from '../lib/financeApi.js';
import { formatMoneyVnd } from '../lib/formatters.js';
import { Button } from './ui.js';

/** Hộp thanh toán SePay: ảnh VietQR (quét ra sẵn số tiền + nội dung) kèm chi
 * tiết tài khoản nhận và mã đối soát để người dùng nhập tay khi cần. */
export function SepayPayBox({ payment }: { payment: SepayPayInstruction }) {
  const [copied, setCopied] = useState<'code' | 'account' | null>(null);
  const [downloadState, setDownloadState] = useState<'idle' | 'downloading' | 'failed'>('idle');
  const copy = async (value: string, which: 'code' | 'account') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      window.setTimeout(() => setCopied((prev) => (prev === which ? null : prev)), 1500);
    } catch {
      /* clipboard bị chặn — người dùng vẫn nhập tay được từ text hiển thị */
    }
  };
  const downloadQrImage = async () => {
    setDownloadState('downloading');
    try {
      const response = await fetch(payment.qrImageUrl);
      if (!response.ok) throw new Error(`Không tải được ảnh QR (${response.status})`);
      const image = await response.blob();
      const objectUrl = URL.createObjectURL(image);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `vietqr-${payment.matchCode.replace(/[^a-zA-Z0-9_-]/g, '-')}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setDownloadState('idle');
    } catch {
      setDownloadState('failed');
    }
  };
  return (
    <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
      <div className="grid justify-items-center gap-2">
        <img
          src={payment.qrImageUrl}
          alt={`Mã VietQR chuyển ${formatMoneyVnd(payment.amount)} nội dung ${payment.matchCode}`}
          width={200}
          height={200}
          className="rounded-2xl border border-line bg-white p-2 shadow-[var(--shadow-card)]"
        />
        <Button tone="ghost" size="sm" disabled={downloadState === 'downloading'} onClick={() => void downloadQrImage()}>
          {downloadState === 'downloading' ? 'Đang tải ảnh…' : 'Lưu ảnh mã QR'}
        </Button>
        {downloadState === 'failed' && <p role="status" className="text-center text-xs text-danger">Không thể tải ảnh QR. Vui lòng thử lại.</p>}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-ink-500">Số tiền</p>
        <p className="text-figures text-2xl font-semibold text-brand-navy">{formatMoneyVnd(payment.amount)}</p>
        <dl className="mt-3 divide-y divide-line text-sm">
          <div className="flex justify-between gap-3 py-2"><dt className="text-ink-500">Ngân hàng</dt><dd className="font-semibold">{payment.bankCode}</dd></div>
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-ink-500">Số tài khoản</dt>
            <dd className="flex items-center gap-2 text-figures font-semibold">
              {payment.accountNumber}
              <button type="button" className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-brand-navy" onClick={() => void copy(payment.accountNumber, 'account')}>{copied === 'account' ? 'Đã chép' : 'Chép'}</button>
            </dd>
          </div>
          <div className="flex justify-between gap-3 py-2"><dt className="text-ink-500">Chủ tài khoản</dt><dd className="font-semibold">{payment.accountName}</dd></div>
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-ink-500">Nội dung (bắt buộc)</dt>
            <dd className="flex items-center gap-2 text-figures font-bold">
              {payment.matchCode}
              <button type="button" className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-brand-navy" onClick={() => void copy(payment.matchCode, 'code')}>{copied === 'code' ? 'Đã chép' : 'Chép'}</button>
            </dd>
          </div>
        </dl>
        <p className="mt-3 flex items-center gap-2.5 rounded-xl bg-green-50 px-3 py-2.5 text-sm text-ink-700">
          <span aria-hidden className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-brand-navy border-t-transparent" />
          Đang chờ tiền về — trạng thái tự cập nhật.
        </p>
      </div>
    </div>
  );
}
