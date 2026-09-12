import { useEffect, useState } from 'react';
import { Badge, Button, Modal, TextInput } from './ui';
import { formatMoneyVnd } from '../lib/formatters.js';
import type { WithdrawalRow } from '../lib/financeApi.js';

type WithdrawalBody = { amount: string; bankCode: string; bankAccountNumber: string; bankAccountName: string };

export function PersonalWithdrawalModal({ open, withdrawable, active, busy, onClose, onSubmit, onCancel }: {
  open: boolean;
  withdrawable: string;
  active: WithdrawalRow | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: WithdrawalBody) => void;
  onCancel: (id: string) => void;
}) {
  const [form, setForm] = useState<WithdrawalBody>({ amount: '', bankCode: '', bankAccountNumber: '', bankAccountName: '' });
  const [error, setError] = useState('');
  useEffect(() => { if (!open) { setForm({ amount: '', bankCode: '', bankAccountNumber: '', bankAccountName: '' }); setError(''); } }, [open]);
  const submit = () => {
    const clean = { ...form, amount: form.amount.replace(/\D/g, ''), bankCode: form.bankCode.trim(), bankAccountNumber: form.bankAccountNumber.trim(), bankAccountName: form.bankAccountName.trim() };
    if (!clean.amount || BigInt(clean.amount) < 10_000n || Object.values(clean).some((value) => !value)) { setError('Nhập đủ thông tin và số tiền từ 10.000đ.'); return; }
    if (BigInt(clean.amount) > BigInt(withdrawable)) { setError('Số tiền rút vượt quá số dư có thể rút.'); return; }
    onSubmit(clean);
  };
  return <Modal open={open} title={active ? 'Yêu cầu rút tiền đang xử lý' : 'Rút tiền về ngân hàng'} onClose={onClose}>
    <p className="mb-4 text-sm font-semibold text-danger">Chỉ tiền hoàn và tiền chuyển dư mới có thể rút.</p>
    {active ? <div className="grid gap-4"><div className="rounded-2xl bg-canvas p-4"><p className="text-caption text-ink-500">{active.transferCode}</p><p className="mt-1 text-xl font-bold text-figures">{formatMoneyVnd(active.amount)}</p><Badge tone="warning">Đang chờ xử lý</Badge></div><p className="text-sm text-ink-500">Bạn có thể hủy khi yêu cầu còn chờ xử lý.</p><div className="flex gap-2" data-testid="personal-withdrawal-actions"><Button tone="secondary" className="flex-1" onClick={onClose}>Đóng</Button>{active.status === 'pending' ? <Button tone="danger" className="flex-1" disabled={busy} onClick={() => onCancel(active.id)}>Hủy yêu cầu</Button> : null}</div></div> : <div className="grid gap-4">
      <p className="text-sm text-ink-500">Có thể rút: <strong className="text-figures text-ink-900">{formatMoneyVnd(withdrawable)}</strong></p>
      <label className="grid gap-1 text-sm font-medium">Số tiền rút<div className="flex gap-2"><TextInput aria-label="Số tiền rút" inputMode="numeric" value={form.amount ? formatMoneyVnd(form.amount) : ''} onChange={(event) => setForm({ ...form, amount: event.target.value.replace(/\D/g, '') })} /><Button tone="secondary" size="sm" onClick={() => setForm({ ...form, amount: withdrawable })}>Rút toàn bộ</Button></div></label>
      <label className="grid gap-1 text-sm font-medium">Mã ngân hàng<TextInput aria-label="Mã ngân hàng" placeholder="Ví dụ: VCB, MB, ACB" value={form.bankCode} onChange={(event) => setForm({ ...form, bankCode: event.target.value })} /></label>
      <label className="grid gap-1 text-sm font-medium">Số tài khoản nhận<TextInput aria-label="Số tài khoản nhận" inputMode="numeric" value={form.bankAccountNumber} onChange={(event) => setForm({ ...form, bankAccountNumber: event.target.value })} /></label>
      <label className="grid gap-1 text-sm font-medium">Tên chủ tài khoản<TextInput aria-label="Tên chủ tài khoản" value={form.bankAccountName} onChange={(event) => setForm({ ...form, bankAccountName: event.target.value })} /></label>
      <p className="text-xs leading-5 text-ink-500">Yêu cầu sẽ được Admin kiểm tra và chuyển khoản.</p>{error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2" data-testid="personal-withdrawal-actions"><Button tone="secondary" className="flex-1" onClick={onClose}>Hủy</Button><Button className="flex-1" disabled={busy} onClick={submit}>{busy ? 'Đang gửi…' : 'Gửi yêu cầu rút tiền'}</Button></div>
    </div>}
  </Modal>;
}
