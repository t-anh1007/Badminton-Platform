import { useState } from 'react';
import { Badge, Button, SelectInput, SurfaceCard, TextInput } from './ui';
import { SepayPayBox } from './SepayPayBox.js';
import {
  acceptPartnerInvite,
  cancelPartnerInvite,
  declinePartnerInvite,
  invitePartner,
  type MatchDetail,
  type PartnerPayMode,
} from '../lib/matchApi';
import { createMatchJoinSepayIntent, payMatchJoinBalance, type SepayPayInstruction } from '../lib/financeApi';
import { formatMoneyVnd } from '../lib/formatters.js';

type Props = {
  detail: MatchDetail;
  /** Chạy thao tác, báo kết quả và tải lại kèo (MatchDetailPage.mutate). */
  run: (operation: () => Promise<unknown>, success: string) => Promise<void>;
};

/** BR-CM-71..78 (D58): chủ kèo đôi mời partner vào Team A; người được mời nhận lời hoặc từ chối. */
export function PartnerInvitePanel({ detail, run }: Props) {
  const partner = detail.partner;
  const [email, setEmail] = useState('');
  const [payMode, setPayMode] = useState<PartnerPayMode>('self');
  const [method, setMethod] = useState<'balance' | 'sepay'>('balance');
  const [sepay, setSepay] = useState<SepayPayInstruction | null>(null);
  if (!partner) return null;
  const { invite, prepaidJoin, actions } = partner;
  const fee = formatMoneyVnd(detail.feePerSlot);

  if (!detail.actions.isOrganizer) {
    if (!invite) return null;
    return (
      <SurfaceCard>
        <h2 className="text-h3">Lời mời đánh cặp</h2>
        <p className="mt-2 text-sm text-ink-500">
          Chủ kèo mời bạn đánh cùng đội.{' '}
          {invite.payMode === 'organizer'
            ? 'Chủ kèo đã trả phần phí của bạn; nhận lời là bạn vào đội ngay.'
            : `Sau khi nhận lời, bạn có 10 phút để thanh toán ${fee}.`}
        </p>
        {actions.canRespond && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void run(() => acceptPartnerInvite(detail.id), 'Đã nhận lời đánh cặp.')}>Nhận lời</Button>
            <Button tone="secondary" onClick={() => void run(() => declinePartnerInvite(detail.id), 'Đã từ chối lời mời.')}>Từ chối</Button>
          </div>
        )}
      </SurfaceCard>
    );
  }

  const payPrepaid = async () => {
    if (!prepaidJoin) return;
    if (method === 'balance') {
      await run(() => payMatchJoinBalance(detail.id, prepaidJoin.id), 'Đã thanh toán, lời mời đã được gửi tới đồng đội.');
      return;
    }
    try {
      const intent = await createMatchJoinSepayIntent(detail.id, prepaidJoin.id);
      setSepay(intent.payment);
    } catch (cause) {
      await run(() => Promise.reject(cause), '');
    }
  };
  const send = () => run(async () => {
    await invitePartner(detail.id, email, payMode);
    setEmail('');
  }, payMode === 'organizer' && prepaidJoin?.status !== 'reserved'
    ? 'Bạn có 10 phút để thanh toán phần của đồng đội; lời mời sẽ được gửi sau khi thanh toán.'
    : 'Đã gửi lời mời tới đồng đội.');

  return (
    <SurfaceCard>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h3">Đồng đội của bạn</h2>
        {prepaidJoin?.status === 'reserved' && <Badge tone="success">Bạn đã trả {fee}</Badge>}
      </div>
      {invite ? (
        <p className="mt-2 text-sm text-ink-700">
          {invite.sent ? 'Đang chờ ' : 'Chưa gửi lời mời tới '}
          <span className="font-semibold">{invite.invitee.displayName}</span>
          {invite.sent ? ' nhận lời. Lời mời có hiệu lực đến hạn chốt kèo.' : ' — hãy thanh toán phần của đồng đội để gửi lời mời.'}
        </p>
      ) : prepaidJoin?.status === 'reserved' ? (
        <p className="mt-2 text-sm text-ink-700">Chỗ bạn đã trả cho đồng đội đang trống. Hãy mời người khác, hoặc hủy để nhận lại tiền vào ví.</p>
      ) : prepaidJoin?.status === 'confirmed' ? (
        <p className="mt-2 text-sm text-ink-700">Đồng đội đã vào đội của bạn.</p>
      ) : (
        <p className="mt-2 text-sm text-ink-500">Đã có bạn đánh cùng? Mời họ vào đội để chỗ này được giữ riêng cho họ.</p>
      )}

      {actions.canPayPrepaid && (
        <div className="mt-4 space-y-3 rounded-xl bg-canvas p-3">
          <p className="text-sm">Thanh toán {fee} cho đồng đội. Lời mời chỉ được gửi sau khi thanh toán thành công.</p>
          <div className="flex flex-wrap gap-2">
            <SelectInput aria-label="Cách thanh toán cho đồng đội" className="w-auto" value={method} onChange={(event) => setMethod(event.target.value as 'balance' | 'sepay')}>
              <option value="balance">Số dư</option>
              <option value="sepay">SePay</option>
            </SelectInput>
            <Button onClick={() => void payPrepaid()}>Thanh toán</Button>
          </div>
          {sepay && <SepayPayBox payment={sepay} />}
        </div>
      )}

      {actions.canInvite && (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => { event.preventDefault(); void send(); }}
        >
          <label className="block text-sm font-medium">
            Email của đồng đội
            <TextInput className="mt-1" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          {prepaidJoin?.status !== 'reserved' && Number(detail.feePerSlot) > 0 && (
            <label className="block text-sm font-medium">
              Ai trả phần phí của đồng đội
              <SelectInput className="mt-1" value={payMode} onChange={(event) => setPayMode(event.target.value as PartnerPayMode)}>
                <option value="self">Đồng đội tự trả</option>
                <option value="organizer">Tôi trả giúp</option>
              </SelectInput>
            </label>
          )}
          <Button type="submit">{invite ? 'Mời người khác' : 'Gửi lời mời'}</Button>
        </form>
      )}

      {actions.canCancel && (
        <Button
          className="mt-3"
          tone="secondary"
          onClick={() => void run(() => cancelPartnerInvite(detail.id),
            prepaidJoin?.status === 'reserved' ? 'Đã hủy lời mời; tiền đã được hoàn về ví.' : 'Đã hủy lời mời.')}
        >
          {prepaidJoin?.status === 'reserved' ? 'Hủy mời và nhận lại tiền' : 'Hủy lời mời'}
        </Button>
      )}
    </SurfaceCard>
  );
}
