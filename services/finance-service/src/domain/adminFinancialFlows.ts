import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { bookingDetails, bookingIdsByCodes, type BookingDetail } from './bookingReferences.js';

/** Chi tiết dòng tiền cho admin — CHỈ ĐỌC, không di chuyển tiền.
 * Tên người dùng không nằm ở schema finance (D17): chuỗi `@user:<id>` được FE
 * thay bằng tên qua API danh tính admin sẵn có. */
export const FLOW_TABS = ['revenue', 'platform', 'refund', 'topup', 'match', 'withdraw', 'reward', 'wallets', 'bank'] as const;
export type FlowTab = (typeof FLOW_TABS)[number];
export type FlowQuery = { tab: FlowTab; filter?: string; ownerId?: string; from?: Date; to?: Date; page: number; pageSize: number; q?: string; userIds?: string[]; search?: Search };
/** Từ khóa tìm kiếm: chữ tự do + tài khoản khớp tên/email (FE tra trước) + booking khớp mã BK-. */
type Search = { text: string; userIds: string[]; bookingIds: string[] };
export const contains = (text: string) => ({ contains: text, mode: 'insensitive' as const });
export type Tone = 'ok' | 'wait' | 'bad' | 'info' | 'mute';
type Step = { title: string; detail: string; tone: Tone };
export type FlowRow = {
  id: string; title: string; titleNote: string; party: string; partyNote: string; counterpart: string; counterpartNote: string;
  status: string; tone: Tone; amount: string; sign: '+' | '-' | ''; amountNote: string;
  from: string; fromNote: string; to: string; toNote: string; steps: Step[]; facts: Array<{ k: string; v: string }>; refIds: string[];
};
export type Kpi = { label: string; value: string; note: string; tone: Tone };
type FlowPage = { kpis: Kpi[]; items: FlowRow[]; total: number };

const vndFormat = new Intl.NumberFormat('vi-VN');
export const vnd = (value: bigint | null | undefined) => `${vndFormat.format(value ?? 0n)}đ`;
export const n = (value: bigint | null | undefined) => (value ?? 0n).toString();
const user = (id: string | null | undefined) => (id ? `@user:${id}` : '—');
export const short = (id: string) => id.slice(0, 8);
const dateFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const dateTime = (value: Date | null | undefined) => value ? dateFormat.format(value).replace(', ', ' ') : '—';
export const range = (field: string, from?: Date, to?: Date) => from || to ? { [field]: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
const sum = (rows: Array<{ amount: bigint }>) => rows.reduce((total, row) => total + row.amount, 0n);
const page = <T>(rows: T[], q: FlowQuery) => rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
const bookingLabel = (id: string, detail?: BookingDetail) => detail?.businessCode ?? `Booking #${short(id)}`;
export const cancelReason: Record<string, string> = { self: 'Khách tự hủy', provider_fault: 'Lỗi phía sân', platform_admin: 'Admin hủy' };

const REFUND_GROUPS: Record<string, string[]> = { booking: ['booking'], dispute: ['dispute'], match: ['matchFee', 'matchFeeCancellation', 'matchOwnerRebalance', 'matchResultReserve', 'matchSettlementReturn'] };
const TOPUP_GROUPS: Record<string, string[]> = { topup: ['topup'], late: ['late_payment', 'late_match_fee'], over: ['overpay', 'overpay_match_fee'], partial: ['partial_payment', 'partial_match_fee'], manual: ['reconciliation'] };
const TOPUP_LABEL: Record<string, string> = { topup: 'Nạp ví', late_payment: 'Tiền về muộn', late_match_fee: 'Phí kèo về muộn', overpay: 'Chuyển thừa', overpay_match_fee: 'Chuyển thừa phí kèo', partial_payment: 'Chuyển thiếu', partial_match_fee: 'Chuyển thiếu phí kèo', reconciliation: 'Admin gán tay' };
const DISCIPLINE: Record<string, string> = { singles: 'Đánh đơn', doubles: 'Đánh đôi', mixed: 'Đánh đôi nam nữ' };
const refundGroupOf = (refType: string) => Object.entries(REFUND_GROUPS).find(([, types]) => types.includes(refType))?.[0] ?? 'booking';

async function revenue(q: FlowQuery): Promise<FlowPage> {
  const base: Prisma.BookingRevenueWhereInput = { ...range('endAt', q.from, q.to), ...(q.ownerId ? { businessUserId: q.ownerId } : {}) };
  const s = q.search;
  if (s) base.OR = [{ bookingId: { in: s.bookingIds } }, { businessUserId: { in: s.userIds } }];
  const where: Prisma.BookingRevenueWhereInput = { ...base, ...(q.filter === 'pending' ? { releasedAt: null, cancelledAt: null } : q.filter === 'available' ? { releasedAt: { not: null }, cancelledAt: null } : q.filter === 'cancelled' ? { cancelledAt: { not: null } } : {}) };
  const [total, rows, totals] = await Promise.all([
    prisma.bookingRevenue.count({ where }),
    prisma.bookingRevenue.findMany({ where, orderBy: [{ endAt: 'desc' }, { bookingId: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.bookingRevenue.aggregate({ where, _sum: { gross: true, net: true, commission: true } }),
  ]);
  const details = await bookingDetails(rows.map((row) => row.bookingId));
  const intents = rows.length ? await prisma.paymentIntent.findMany({ where: { refType: 'booking', refId: { in: rows.map((row) => row.bookingId) } } }) : [];
  const gross = totals._sum.gross ?? 0n, net = totals._sum.net ?? 0n, fee = totals._sum.commission ?? 0n;
  return {
    total,
    kpis: [
      { label: 'Tổng khách đã trả', value: n(gross), note: `${total} booking`, tone: 'info' },
      { label: 'Phần chủ sân', value: n(net), note: 'Chờ 24 giờ hoặc đã có thể rút', tone: 'ok' },
      { label: 'Phí nền tảng', value: n(fee), note: 'Xem tab Phí nền tảng', tone: 'info' },
      { label: 'Đã hoàn khách', value: n(gross - net - fee), note: 'Xem tab Hoàn tiền', tone: 'bad' },
    ],
    items: rows.map((row) => {
      const detail = details.get(row.bookingId);
      const intent = intents.find((candidate) => candidate.refId === row.bookingId);
      const channel = intent ? (intent.method === 'sepay' ? 'SePay' : 'Ví COURTIN') : 'Chưa rõ kênh thanh toán';
      const refunded = row.gross - row.net - row.commission;
      const [status, tone]: [string, Tone] = row.cancelledAt ? ['Đã hủy', 'mute'] : row.releasedAt ? ['Có thể rút', 'ok'] : ['Chờ 24 giờ', 'wait'];
      const code = bookingLabel(row.bookingId, detail);
      return {
        id: row.bookingId, title: code, titleNote: `${detail?.venueName ?? 'Cơ sở'} · ${detail?.startAt ? `${dateTime(detail.startAt)} → ` : 'kết thúc '}${dateTime(row.endAt)}`,
        party: user(row.businessUserId), partyNote: 'Chủ sân nhận', counterpart: detail?.userId ? user(detail.userId) : detail?.guestName ?? 'Khách vãng lai', counterpartNote: channel,
        status, tone, amount: n(row.gross), sign: '', amountNote: `phí ${vnd(row.commission)} · hoàn ${vnd(refunded)} · chủ sân ${vnd(row.net)}`,
        from: detail?.userId ? user(detail.userId) : 'Khách', fromNote: channel, to: user(row.businessUserId), toNote: 'Ví chủ sân + phí nền tảng',
        steps: [
          { title: `Khách thanh toán ${vnd(row.gross)}`, detail: channel, tone: 'info' },
          { title: 'Phân bổ', detail: `${vnd(row.gross)} = ${vnd(row.commission)} phí + ${vnd(row.net)} chủ sân${refunded ? ` + ${vnd(refunded)} đã hoàn` : ''}`, tone: 'info' },
          row.cancelledAt ? { title: 'Booking bị hủy', detail: `${cancelReason[detail?.cancellationReason ?? ''] ?? 'Đã hủy'} · hoàn ${vnd(refunded)} vào ví người chơi`, tone: 'bad' }
            : row.releasedAt ? { title: 'Đã chuyển sang có thể rút', detail: dateTime(row.releasedAt), tone: 'ok' }
              : { title: 'Chờ đủ 24 giờ', detail: `Dự kiến mở khóa ${dateTime(row.releaseAt)}`, tone: 'wait' },
        ],
        facts: [{ k: 'Mã booking', v: code }, { k: 'Cơ sở', v: detail?.venueName ?? '—' }, { k: 'Kênh thanh toán', v: channel }, { k: 'Mở khóa', v: dateTime(row.releasedAt ?? row.releaseAt) }],
        refIds: [row.bookingId],
      };
    }),
  };
}

async function platform(q: FlowQuery): Promise<FlowPage> {
  const wallet = await prisma.wallet.findFirst({ where: { walletType: 'platform' } });
  const ledgerWhere: Prisma.LedgerEntryWhereInput = { walletId: wallet?.id ?? '-', ...range('ts', q.from, q.to) };
  const groups = await prisma.ledgerEntry.groupBy({ by: ['type', 'refType'], where: ledgerWhere, _sum: { amount: true }, _count: true });
  const earned = groups.filter((row) => row.type === 'commission').reduce((total, row) => total + (row._sum.amount ?? 0n), 0n);
  const refunded = groups.filter((row) => row.type === 'refund' && (row.refType === 'booking' || row.refType === 'dispute')).reduce((total, row) => total + (row._sum.amount ?? 0n), 0n);
  const kpis: Kpi[] = [
    { label: 'Số dư doanh thu nền tảng', value: n(wallet?.available), note: 'Ví nền tảng · khả dụng (hiện tại)', tone: 'info' },
    { label: 'Phí đặt sân thu được', value: n(earned), note: 'Trong kỳ xem', tone: 'ok' },
    { label: 'Hoàn phí cho khách', value: n(refunded), note: 'Hủy booking, tranh chấp', tone: 'bad' },
    { label: 'Ký quỹ kèo đang giữ', value: n(wallet?.reserved), note: 'Không phải doanh thu · tab Kèo', tone: 'wait' },
  ];
  if (q.filter === 'owner') {
    const owners = await prisma.bookingRevenue.groupBy({ by: ['businessUserId'], where: { ...range('endAt', q.from, q.to), ...(q.search ? { businessUserId: { in: q.search.userIds } } : {}) }, _sum: { commission: true, gross: true }, _count: true, orderBy: { _sum: { commission: 'desc' } } });
    return { kpis, total: owners.length, items: page(owners, q).map((row) => ({
      id: row.businessUserId, title: user(row.businessUserId), titleNote: 'Chủ sân', party: `${row._count} booking`, partyNote: `khách trả ${vnd(row._sum.gross)}`,
      counterpart: 'Phí đặt sân', counterpartNote: 'đã trừ phần hoàn phí', status: 'Phí ròng', tone: 'info' as Tone, amount: n(row._sum.commission), sign: '+' as const, amountNote: 'vào ví nền tảng',
      from: `Khách của ${user(row.businessUserId)}`, fromNote: `${row._count} booking`, to: 'Ví nền tảng', toNote: 'Phí đặt sân',
      steps: [{ title: `Phí ròng ${vnd(row._sum.commission)}`, detail: 'Phí thu được trừ phí đã hoàn khi hủy/tranh chấp', tone: 'ok' as Tone }],
      facts: [{ k: 'Chủ sân', v: user(row.businessUserId) }, { k: 'Số booking', v: String(row._count) }, { k: 'Khách trả', v: vnd(row._sum.gross) }], refIds: [],
    })) };
  }
  const label = (type: string, refType: string) => type === 'commission' ? 'Phí đặt sân'
    : type === 'refund' && refType === 'booking' ? 'Hoàn phí khi hủy booking' : type === 'refund' && refType === 'dispute' ? 'Hoàn phí do tranh chấp'
      : type === 'reserve' ? 'Giữ ký quỹ kèo' : type === 'settlement' ? 'Trả tiền sân từ ký quỹ kèo' : type === 'release' ? 'Trả thưởng kèo từ ký quỹ' : type === 'refund' ? 'Hoàn từ ký quỹ kèo' : 'Khoản khác';
  const sorted = [...groups].sort((a, b) => Number((b._sum.amount ?? 0n) - (a._sum.amount ?? 0n)));
  return { kpis, total: sorted.length, items: page(sorted, q).map((row) => {
    const amount = row._sum.amount ?? 0n; const isRevenue = row.type === 'commission' || (row.type === 'refund' && ['booking', 'dispute'].includes(row.refType));
    return {
      id: `${row.type}:${row.refType}`, title: label(row.type, row.refType), titleNote: isRevenue ? 'Ảnh hưởng doanh thu' : 'Ký quỹ kèo (tiền giữ hộ)',
      party: isRevenue ? (amount >= 0n ? 'Cộng vào doanh thu' : 'Trừ khỏi doanh thu') : 'Tiền giữ hộ người chơi', partyNote: isRevenue ? 'Doanh thu của nền tảng' : 'Không tính là doanh thu', counterpart: `${row._count} lần`, counterpartNote: 'trong kỳ xem',
      status: amount >= 0n ? 'Cộng' : 'Trừ', tone: (amount >= 0n ? 'ok' : 'bad') as Tone, amount: n(amount < 0n ? -amount : amount), sign: (amount >= 0n ? '+' : '-') as '+' | '-', amountNote: isRevenue ? 'doanh thu' : 'không tính doanh thu',
      from: amount >= 0n ? 'Người chơi / khách đặt sân' : 'Ví nền tảng', fromNote: label(row.type, row.refType), to: amount >= 0n ? 'Ví nền tảng' : 'Người nhận tương ứng', toNote: `${row._count} lần`,
      steps: [{ title: label(row.type, row.refType), detail: `${row._count} lần, tổng ${vnd(amount)}`, tone: (amount >= 0n ? 'ok' : 'bad') as Tone }],
      facts: [{ k: 'Khoản', v: label(row.type, row.refType) }, { k: 'Số lần', v: String(row._count) }, { k: 'Tổng tiền', v: vnd(amount) }], refIds: [],
    };
  }) };
}

async function refunds(q: FlowQuery): Promise<FlowPage> {
  const refTypes = q.filter && REFUND_GROUPS[q.filter] ? REFUND_GROUPS[q.filter] : undefined;
  const s = q.search;
  const disputeIds = s ? (await prisma.dispute.findMany({ where: { OR: [{ businessCode: contains(s.text) }, { bookingId: { in: s.bookingIds } }] }, select: { id: true } })).map((row) => row.id) : [];
  const where: Prisma.LedgerEntryWhereInput = { type: 'refund', amount: { gt: 0n }, wallet: { walletType: 'personal' }, ...(refTypes ? { refType: { in: refTypes } } : {}), ...range('ts', q.from, q.to),
    ...(s ? { OR: [{ wallet: { userId: { in: s.userIds } } }, { refId: { in: [...s.bookingIds, ...disputeIds] } }] } : {}) };
  const [total, rows, totals, reversals] = await Promise.all([
    prisma.ledgerEntry.count({ where }),
    prisma.ledgerEntry.findMany({ where, include: { wallet: true }, orderBy: [{ ts: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.ledgerEntry.aggregate({ where, _sum: { amount: true } }),
    prisma.ledgerEntry.groupBy({ by: ['walletId'], where: { type: 'refund', amount: { lt: 0n }, wallet: { walletType: { in: ['business', 'platform'] } }, ...(refTypes ? { refType: { in: refTypes } } : {}), ...range('ts', q.from, q.to) }, _sum: { amount: true } }),
  ]);
  const walletTypes = new Map((await prisma.wallet.findMany({ where: { id: { in: reversals.map((row) => row.walletId) } }, select: { id: true, walletType: true } })).map((row) => [row.id, row.walletType]));
  const reversed = (type: string) => reversals.filter((row) => walletTypes.get(row.walletId) === type).reduce((total, row) => total - (row._sum.amount ?? 0n), 0n);
  const details = await bookingDetails(rows.filter((row) => row.refType === 'booking').map((row) => row.refId));
  const disputes = await prisma.dispute.findMany({ where: { id: { in: rows.filter((row) => row.refType === 'dispute').map((row) => row.refId) } } });
  return {
    total,
    kpis: [
      { label: 'Tổng đã hoàn', value: n(totals._sum.amount), note: `${total} lần hoàn vào ví người chơi`, tone: 'bad' },
      { label: 'Thu hồi từ chủ sân', value: n(reversed('business')), note: 'Trừ vào tiền chờ 24 giờ', tone: 'info' },
      { label: 'Thu hồi từ nền tảng', value: n(reversed('platform')), note: 'Phí đặt sân và ký quỹ kèo', tone: 'info' },
      { label: 'Được rút về ngân hàng', value: n(sum(rows.filter((row) => row.refType !== 'booking' || details.get(row.refId)?.cancellationReason !== 'self'))), note: 'Trang này · trừ khoản khách tự hủy', tone: 'wait' },
    ],
    items: rows.map((row) => {
      const group = refundGroupOf(row.refType);
      const booking = row.refType === 'booking' ? details.get(row.refId) : undefined;
      const dispute = row.refType === 'dispute' ? disputes.find((item) => item.id === row.refId) : undefined;
      const reason = group === 'match' ? 'Hoàn tiền kèo' : dispute ? `Tranh chấp ${dispute.businessCode}` : cancelReason[booking?.cancellationReason ?? ''] ?? 'Hủy booking';
      const title = dispute ? dispute.businessCode : row.refType === 'booking' ? bookingLabel(row.refId, booking) : group === 'match' ? `Kèo #${short(row.refId)}` : `#${short(row.refId)}`;
      return {
        id: row.id, title, titleNote: [booking?.venueName ?? (group === 'match' ? 'Kèo' : ''), dateTime(row.ts)].filter(Boolean).join(' · '),
        party: user(row.wallet.userId), partyNote: 'Ví người chơi', counterpart: reason, counterpartNote: group === 'dispute' ? 'Hoàn theo kết luận tranh chấp' : group === 'match' ? 'Hoàn tiền kèo' : 'Hoàn tiền đặt sân',
        status: group === 'dispute' ? 'Tranh chấp' : group === 'match' ? 'Kèo' : 'Đã hoàn', tone: (group === 'dispute' ? 'info' : 'ok') as Tone, amount: n(row.amount), sign: '+' as const, amountNote: 'vào số dư ví',
        from: group === 'match' ? 'Ký quỹ kèo (ví nền tảng)' : 'Chủ sân + phí nền tảng', fromNote: 'Thu hồi phần đã phân bổ', to: user(row.wallet.userId), toNote: 'Số dư ví người chơi',
        steps: [
          { title: `${title} bị hủy/hoàn`, detail: reason, tone: 'bad' as Tone },
          { title: `Cộng ${vnd(row.amount)} vào ví người chơi`, detail: `Số dư ${vnd(row.before)} → ${vnd(row.after)}`, tone: 'ok' as Tone },
        ],
        facts: [{ k: 'Tham chiếu', v: title }, { k: 'Người nhận', v: user(row.wallet.userId) }, { k: 'Lý do', v: reason }, { k: 'Thời điểm', v: dateTime(row.ts) }, ...(dispute?.resolution ? [{ k: 'Kết luận', v: dispute.resolution }] : [])],
        refIds: [row.refId],
      };
    }),
  };
}

async function topups(q: FlowQuery): Promise<FlowPage> {
  const refTypes = q.filter && TOPUP_GROUPS[q.filter] ? TOPUP_GROUPS[q.filter] : undefined;
  const base: Prisma.LedgerEntryWhereInput = { type: 'topup', wallet: { walletType: 'personal' }, ...range('ts', q.from, q.to) };
  const s = q.search;
  const matchedEntryIds = s ? (await prisma.sepayAllocation.findMany({ where: { kind: 'topup', sepayEvent: { OR: [{ businessCode: contains(s.text) }, { rawRef: contains(s.text) }, { externalRef: contains(s.text) }] } }, select: { refId: true } })).map((row) => row.refId).filter((id): id is string => Boolean(id)) : [];
  const where: Prisma.LedgerEntryWhereInput = { ...base, ...(refTypes ? { refType: { in: refTypes } } : {}), ...(s ? { OR: [{ wallet: { userId: { in: s.userIds } } }, { id: { in: matchedEntryIds } }] } : {}) };
  const [total, rows, byType] = await Promise.all([
    prisma.ledgerEntry.count({ where }),
    prisma.ledgerEntry.findMany({ where, include: { wallet: true }, orderBy: [{ ts: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.ledgerEntry.groupBy({ by: ['refType'], where: base, _sum: { amount: true }, _count: true }),
  ]);
  const allocations = rows.length ? await prisma.sepayAllocation.findMany({ where: { kind: 'topup', refId: { in: rows.map((row) => row.id) } }, include: { sepayEvent: true } }) : [];
  const groupSum = (key: string) => byType.filter((row) => TOPUP_GROUPS[key]!.includes(row.refType)).reduce((total, row) => total + (row._sum.amount ?? 0n), 0n);
  const all = byType.reduce((total, row) => total + (row._sum.amount ?? 0n), 0n);
  return {
    total,
    kpis: [
      { label: 'Tổng tiền vào ví', value: n(all), note: `${byType.reduce((c, row) => c + row._count, 0)} lần`, tone: 'ok' },
      { label: 'Nạp chủ động', value: n(groupSum('topup')), note: 'Qua VietQR', tone: 'ok' },
      { label: 'Về muộn · thừa · thiếu', value: n(groupSum('late') + groupSum('over') + groupSum('partial')), note: 'Tiền đặt sân/kèo không khớp', tone: 'wait' },
      { label: 'Admin gán tay', value: n(groupSum('manual')), note: 'Có lý do audit', tone: 'info' },
    ],
    items: rows.map((row) => {
      const event = allocations.find((item) => item.refId === row.id)?.sepayEvent;
      const kind = TOPUP_LABEL[row.refType] ?? row.refType;
      return {
        id: row.id, title: event?.businessCode ?? `Bút toán #${short(row.id)}`, titleNote: `${dateTime(row.ts)}${event ? ' · SePay' : ''}`,
        party: user(row.wallet.userId), partyNote: 'Ví người chơi', counterpart: kind, counterpartNote: event?.rawRef ? `Nội dung CK: ${event.rawRef}` : 'Không có nội dung chuyển khoản',
        status: 'Đã vào ví', tone: 'ok' as Tone, amount: n(row.amount), sign: '+' as const, amountNote: `số dư ${vnd(row.before)} → ${vnd(row.after)}`,
        from: user(row.wallet.userId), fromNote: 'Tài khoản ngân hàng của khách', to: `Ví ${user(row.wallet.userId)}`, toNote: kind,
        steps: [
          { title: event ? `Tài khoản nền tảng nhận ${vnd(event.amount)}` : 'Không gắn giao dịch ngân hàng', detail: event ? `Mã ngân hàng ${event.externalRef ?? '—'} · ${dateTime(event.receivedAt)}` : 'Ghi nhận nội bộ', tone: 'info' as Tone },
          { title: row.refType === 'reconciliation' ? 'Admin gán vào ví' : 'Hệ thống tự phân loại', detail: kind, tone: (row.refType === 'reconciliation' ? 'wait' : 'ok') as Tone },
          { title: `Cộng ${vnd(row.amount)} vào ví`, detail: 'Người chơi thấy trong lịch sử ví', tone: 'ok' as Tone },
        ],
        facts: [{ k: 'Loại', v: kind }, { k: 'Người nhận', v: user(row.wallet.userId) }, { k: 'Giao dịch ngân hàng', v: event?.businessCode ?? '—' }],
        refIds: [row.refId, row.id],
      };
    }),
  };
}

async function matches(q: FlowQuery): Promise<FlowPage> {
  const statusWhere: Prisma.MatchFundingWhereInput = q.filter === 'holding' ? { status: { in: ['collecting', 'settling'] } } : q.filter === 'settled' ? { status: 'settled' }
    : q.filter === 'result' ? { resultReserveStatus: 'locked' } : q.filter === 'cancelled' ? { status: 'cancelled' } : {};
  const s = q.search;
  const where: Prisma.MatchFundingWhereInput = { ...statusWhere, ...range('createdAt', q.from, q.to),
    ...(s ? { OR: [{ organizerUserId: { in: s.userIds } }, { contributions: { some: { userId: { in: s.userIds } } } }, { bookingId: { in: s.bookingIds } }, { matchId: { startsWith: s.text.replace(/^#/, '').toLowerCase() } }] } : {}) };
  const [total, rows, platformWallet, settledSum, cancelledCount] = await Promise.all([
    prisma.matchFunding.count({ where }),
    prisma.matchFunding.findMany({ where, include: { contributions: true }, orderBy: [{ createdAt: 'desc' }, { matchId: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.wallet.findFirst({ where: { walletType: 'platform' } }),
    prisma.matchFunding.aggregate({ where: { status: 'settled', ...range('createdAt', q.from, q.to) }, _sum: { bookingPrice: true }, _count: true }),
    prisma.matchFunding.count({ where: { status: 'cancelled', ...range('createdAt', q.from, q.to) } }),
  ]);
  const released = await prisma.ledgerEntry.aggregate({ where: { refType: 'matchResult', amount: { gt: 0n }, ...range('ts', q.from, q.to) }, _sum: { amount: true }, _count: true });
  const details = await bookingDetails(rows.map((row) => row.bookingId));
  const statusLabel: Record<string, [string, Tone]> = { collecting: ['Đang thu', 'wait'], settling: ['Đang tất toán', 'wait'], settled: ['Đã tất toán', 'ok'], cancelled: ['Đã hủy', 'mute'] };
  return {
    total,
    kpis: [
      { label: 'Ký quỹ kèo đang giữ', value: n(platformWallet?.reserved), note: 'Ví nền tảng · đang giữ (hiện tại)', tone: 'wait' },
      { label: 'Đã trả tiền sân cho chủ sân', value: n(settledSum._sum.bookingPrice), note: `${settledSum._count} kèo đã tất toán`, tone: 'ok' },
      { label: 'Trả thưởng thắng kèo', value: n(released._sum.amount), note: `${released._count} lần`, tone: 'ok' },
      { label: 'Kèo đã hủy', value: `${cancelledCount} kèo`, note: 'Phí đã hoàn · xem tab Hoàn tiền', tone: 'bad' },
    ],
    items: rows.map((row) => {
      const paid = row.contributions.filter((item) => item.status !== 'pending');
      const held = row.contributions.filter((item) => item.status === 'paid').reduce((total, item) => total + item.amount, 0n) + (row.resultReserveStatus === 'locked' ? row.resultReserve : 0n);
      const [status, tone] = row.resultReserveStatus === 'locked' && row.status === 'settled' ? ['Chờ kết quả', 'info' as Tone] : statusLabel[row.status] ?? [row.status, 'info' as Tone];
      const booking = details.get(row.bookingId);
      return {
        id: row.matchId, title: `Kèo #${short(row.matchId)}`, titleNote: `${DISCIPLINE[row.discipline] ?? 'Kèo'} · tạo ${dateTime(row.createdAt)}`,
        party: `${paid.length}/${row.capacity} người đã đóng`, partyNote: `Mỗi suất ${vnd(row.feePerSlot)} · chủ kèo ${user(row.organizerUserId)}`,
        counterpart: booking?.venueName ?? 'Sân', counterpartNote: booking ? bookingLabel(row.bookingId, booking) : `Booking #${short(row.bookingId)}`,
        status, tone, amount: n(held), sign: '', amountNote: 'đang giữ',
        from: `${paid.length} người chơi`, fromNote: paid.map((item) => user(item.userId)).join(', ') || '—', to: row.status === 'cancelled' ? 'Hoàn về ví người chơi' : 'Chủ sân + người thắng', toNote: 'Qua ký quỹ ví nền tảng',
        steps: [
          { title: `Thu phí kèo ${vnd(row.totalContribution)}`, detail: `${paid.length} người đã đóng vào ký quỹ nền tảng`, tone: 'info' },
          row.status === 'cancelled' ? { title: 'Kèo bị hủy', detail: `Hoàn phí về ví người chơi · ${dateTime(row.cancelledAt)}`, tone: 'bad' }
            : row.settledAt ? { title: `Tất toán tiền sân ${vnd(row.bookingPrice)}`, detail: `Trả chủ sân · ${dateTime(row.settledAt)}`, tone: 'ok' } : { title: 'Chờ tất toán', detail: `Hạn chốt ${dateTime(row.cutoffAt)}`, tone: 'wait' },
          { title: 'Kết quả trận', detail: row.resultReserveStatus === 'released' ? `Đã trả khoản cược ${vnd(row.resultReserve)} cho đội thắng` : row.resultReserveStatus === 'locked' ? `Đang giữ ${vnd(row.resultReserve)} chờ kết quả` : row.resultReserveStatus === 'refunded' ? 'Khoản cược đã hoàn' : 'Không có khoản cược', tone: row.resultReserveStatus === 'released' ? 'ok' : 'wait' },
        ],
        facts: [{ k: 'Mã kèo', v: `#${short(row.matchId)}` }, { k: 'Chủ kèo', v: user(row.organizerUserId) }, { k: 'Người đóng', v: paid.map((item) => `${user(item.userId)} (${vnd(item.amount)})`).join(', ') || '—' }, { k: 'Booking sân', v: booking ? bookingLabel(row.bookingId, booking) : '—' }, { k: 'Đang giữ', v: vnd(held) }],
        refIds: [row.matchId, row.bookingId, ...row.contributions.map((item) => item.id)],
      };
    }),
  };
}

async function withdrawals(q: FlowQuery): Promise<FlowPage> {
  const statuses = q.filter === 'pending' ? ['pending', 'partially_paid'] : q.filter === 'rejected' ? ['rejected'] : ['paid', 'partially_paid'];
  const s = q.search;
  const where: Prisma.WithdrawalRequestWhereInput = { status: { in: statuses as never }, ...range('createdAt', q.from, q.to),
    ...(s ? { OR: [{ sellerUserId: { in: s.userIds } }, { transferCode: contains(s.text) }, { bankAccountName: contains(s.text) }, { bankAccountNumber: contains(s.text) }] } : {}) };
  const [total, rows, all] = await Promise.all([
    prisma.withdrawalRequest.count({ where }),
    prisma.withdrawalRequest.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.withdrawalRequest.findMany({ where: range('createdAt', q.from, q.to), select: { amount: true, paidAmount: true, status: true, walletType: true } }),
  ]);
  const events = await prisma.sepayEvent.findMany({ where: { id: { in: rows.map((row) => row.sePayEventId).filter((id): id is string => Boolean(id)) } } });
  const paid = (type?: string) => all.filter((row) => !type || row.walletType === type).reduce((total, row) => total + (row.paidAmount ?? 0n), 0n);
  const waiting = all.filter((row) => row.status === 'pending' || row.status === 'partially_paid').reduce((total, row) => total + row.amount - (row.paidAmount ?? 0n), 0n);
  return {
    total,
    kpis: [
      { label: 'Rút tiền đã chi', value: n(paid()), note: `${all.filter((row) => row.status === 'paid' || row.status === 'partially_paid').length} yêu cầu`, tone: 'ok' },
      { label: 'Đang chờ chi', value: n(waiting), note: `${all.filter((row) => row.status === 'pending' || row.status === 'partially_paid').length} yêu cầu`, tone: 'wait' },
      { label: 'Đã chi từ ví chủ sân', value: n(paid('business')), note: 'Doanh thu đã mở khóa', tone: 'info' },
      { label: 'Đã chi từ ví người chơi', value: n(paid('personal')), note: 'Tiền hoàn, thừa, thắng kèo', tone: 'info' },
    ],
    items: rows.map((row) => {
      const event = events.find((item) => item.id === row.sePayEventId);
      const role = row.walletType === 'personal' ? 'Người chơi' : 'Chủ sân';
      const [status, tone]: [string, Tone] = row.status === 'paid' ? ['Đã chi', 'ok'] : row.status === 'partially_paid' ? ['Chi một phần', 'wait'] : row.status === 'pending' ? ['Chờ chi', 'wait'] : ['Từ chối', 'bad'];
      return {
        id: row.id, title: row.transferCode, titleNote: `Tạo ${dateTime(row.createdAt)}`, party: user(row.sellerUserId), partyNote: role,
        counterpart: `${row.bankCode} •••• ${row.bankAccountNumber.slice(-4)}`, counterpartNote: event ? `Khớp ${event.businessCode}` : row.rejectionReason ?? 'Chưa có giao dịch ra',
        status, tone, amount: n(row.status === 'rejected' ? row.amount : row.paidAmount ?? row.amount), sign: row.status === 'rejected' ? '' : '-', amountNote: row.status === 'rejected' ? 'đã trả lại số dư' : `yêu cầu ${vnd(row.amount)}`,
        from: `Ví ${role.toLowerCase()} · ${user(row.sellerUserId)}`, fromNote: 'Số dư có thể rút', to: `${row.bankCode} •••• ${row.bankAccountNumber.slice(-4)}`, toNote: `Chủ tài khoản: ${row.bankAccountName}`,
        steps: [
          { title: `Tạo yêu cầu rút ${vnd(row.amount)}`, detail: 'Giữ khỏi số dư có thể rút', tone: 'wait' },
          row.status === 'rejected' ? { title: 'Admin từ chối', detail: `${row.rejectionReason ?? '—'} · trả lại số dư`, tone: 'bad' } : { title: 'Admin chuyển khoản', detail: `Nội dung CK: ${row.transferCode}`, tone: 'info' },
          event ? { title: 'SePay xác nhận tiền ra', detail: `${event.businessCode} · ${dateTime(event.receivedAt)}`, tone: 'ok' } : { title: row.status === 'rejected' ? 'Kết thúc' : 'Chờ SePay báo tiền ra', detail: dateTime(row.processedAt), tone: 'wait' },
        ],
        facts: [{ k: 'Người rút', v: `${user(row.sellerUserId)} (${role})` }, { k: 'Tài khoản nhận', v: `${row.bankCode} · ${row.bankAccountNumber} · ${row.bankAccountName}` }, { k: 'Giao dịch ngân hàng', v: event?.businessCode ?? '—' }, { k: 'Xử lý lúc', v: dateTime(row.processedAt) }],
        refIds: [row.id],
      };
    }),
  };
}

async function rewards(q: FlowQuery): Promise<FlowPage> {
  const statusWhere: Prisma.RewardPayoutWhereInput = q.filter === 'paid' ? { status: 'paid' } : q.filter === 'pending' ? { status: { in: ['awaiting_information', 'ready_to_pay'] } } : q.filter === 'cancelled' ? { status: 'cancelled' } : {};
  const s = q.search;
  const where: Prisma.RewardPayoutWhereInput = { ...statusWhere, ...range('createdAt', q.from, q.to),
    ...(s ? { OR: [{ userId: { in: s.userIds } }, { programName: contains(s.text) }, { transactionReference: contains(s.text) }, { recipientName: contains(s.text) }] } : {}) };
  const [total, rows, byStatus] = await Promise.all([
    prisma.rewardPayout.count({ where }),
    prisma.rewardPayout.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.rewardPayout.groupBy({ by: ['status'], where: range('createdAt', q.from, q.to), _sum: { amount: true }, _count: true }),
  ]);
  const of = (...statuses: string[]) => byStatus.filter((row) => statuses.includes(row.status));
  const money = (...statuses: string[]) => of(...statuses).reduce((total, row) => total + (row._sum.amount ?? 0n), 0n);
  const count = (...statuses: string[]) => of(...statuses).reduce((total, row) => total + row._count, 0);
  const label: Record<string, [string, Tone]> = { awaiting_information: ['Thiếu thông tin', 'bad'], ready_to_pay: ['Sẵn sàng trả', 'wait'], paid: ['Đã trả', 'ok'], cancelled: ['Đã hủy', 'mute'] };
  return {
    total,
    kpis: [
      { label: 'Tổng thưởng', value: n(money('awaiting_information', 'ready_to_pay', 'paid')), note: `${count('awaiting_information', 'ready_to_pay', 'paid')} giải`, tone: 'info' },
      { label: 'Đã trả', value: n(money('paid')), note: `${count('paid')} giải`, tone: 'ok' },
      { label: 'Chờ trả', value: n(money('awaiting_information', 'ready_to_pay')), note: `${count('awaiting_information')} thiếu thông tin`, tone: 'wait' },
      { label: 'Đã hủy / quá hạn', value: n(money('cancelled')), note: `${count('cancelled')} giải`, tone: 'mute' },
    ],
    items: rows.map((row) => {
      const [status, tone] = label[row.status] ?? [row.status, 'info' as Tone];
      const account = row.bankCode && row.bankAccountNumber ? `${row.bankCode} •••• ${row.bankAccountNumber.slice(-4)}` : 'Chưa cung cấp';
      return {
        id: row.id, title: row.programName, titleNote: `Hạng ${row.rank}`, party: user(row.userId), partyNote: 'Người chơi', counterpart: account, counterpartNote: `Hạn nhận ${dateTime(row.claimDeadlineAt)}`,
        status, tone, amount: n(row.amount), sign: row.status === 'paid' ? '-' : '', amountNote: `thưởng hạng ${row.rank}`,
        from: 'Quỹ thưởng nền tảng', fromNote: 'Chi trực tiếp, không qua ví', to: user(row.userId), toNote: account,
        steps: [
          { title: 'Chốt bảng xếp hạng', detail: `Hạng ${row.rank} · ${vnd(row.amount)}`, tone: 'info' },
          { title: row.informationSubmittedAt ? 'Người nhận đã khai báo tài khoản' : 'Chờ người nhận khai báo', detail: dateTime(row.informationSubmittedAt), tone: row.informationSubmittedAt ? 'ok' : 'wait' },
          { title: row.paidAt ? 'Đã chuyển tiền' : 'Chờ admin chuyển', detail: row.paidAt ? `${dateTime(row.paidAt)} · mã ${row.transactionReference ?? '—'}` : 'Ghi mã tham chiếu và chứng từ khi chi', tone: row.paidAt ? 'ok' : 'wait' },
        ],
        facts: [{ k: 'Chương trình', v: row.programName }, { k: 'Hạng', v: String(row.rank) }, { k: 'Người nhận', v: user(row.userId) }, { k: 'Mã tham chiếu', v: row.transactionReference ?? '—' }, { k: 'Người chi', v: user(row.paidByUserId) }],
        refIds: [row.id],
      };
    }),
  };
}

async function wallets(q: FlowQuery): Promise<FlowPage> {
  const walletType = q.filter === 'player' ? 'personal' : q.filter === 'platform' ? 'platform' : 'business';
  const [total, rows, totals] = await Promise.all([
    prisma.wallet.count({ where: { walletType, ...(q.search && walletType !== 'platform' ? { userId: { in: q.search.userIds } } : {}) } }),
    prisma.wallet.findMany({ where: { walletType, ...(q.search && walletType !== 'platform' ? { userId: { in: q.search.userIds } } : {}) }, orderBy: [{ available: 'desc' }, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.wallet.groupBy({ by: ['walletType'], _sum: { available: true, pending: true, reserved: true } }),
  ]);
  const flows = rows.length ? await prisma.ledgerEntry.groupBy({ by: ['walletId', 'type'], where: { walletId: { in: rows.map((row) => row.id) } }, _sum: { amount: true } }) : [];
  const withdrawn = rows.length ? await prisma.withdrawalRequest.groupBy({ by: ['sellerUserId', 'walletType'], where: { sellerUserId: { in: rows.map((row) => row.userId).filter((id): id is string => Boolean(id)) } }, _sum: { paidAmount: true } }) : [];
  const t = (type: string) => totals.find((row) => row.walletType === type)?._sum;
  const all = (type: string) => { const s = t(type); return (s?.available ?? 0n) + (s?.pending ?? 0n) + (s?.reserved ?? 0n); };
  const flow = (walletId: string, type: string) => flows.find((row) => row.walletId === walletId && row.type === type)?._sum.amount ?? 0n;
  return {
    total,
    kpis: [
      { label: 'Tổng số dư các ví', value: n(all('business') + all('personal') + all('platform')), note: 'Tiền nền tảng đang giữ', tone: 'info' },
      { label: 'Chủ sân', value: n(all('business')), note: `Chờ ${vnd(t('business')?.pending)} · có thể rút ${vnd(t('business')?.available)}`, tone: 'ok' },
      { label: 'Người chơi', value: n(all('personal')), note: `Số dư ${vnd(t('personal')?.available)} · giữ ${vnd(t('personal')?.reserved)}`, tone: 'info' },
      { label: 'Nền tảng', value: n(all('platform')), note: `Doanh thu ${vnd(t('platform')?.available)} · ký quỹ ${vnd(t('platform')?.reserved)}`, tone: 'wait' },
    ],
    items: rows.map((row) => {
      const out = withdrawn.find((item) => item.sellerUserId === row.userId && item.walletType === row.walletType)?._sum.paidAmount ?? 0n;
      if (walletType === 'platform') return {
        id: row.id, title: 'Ví nền tảng', titleNote: 'Doanh thu + ký quỹ kèo', party: `Phí thu ${vnd(flow(row.id, 'commission'))}`, partyNote: 'phí đặt sân', counterpart: `Ký quỹ ${vnd(row.reserved)}`, counterpartNote: 'giữ hộ, không phải doanh thu',
        status: 'Nền tảng', tone: 'info' as Tone, amount: n(row.available), sign: '' as const, amountNote: 'doanh thu khả dụng',
        from: 'Phí đặt sân, phí kèo', fromNote: 'Phí đặt sân và tiền kèo giữ hộ', to: 'Ví nền tảng', toNote: 'Khả dụng + đang giữ',
        steps: [{ title: `Doanh thu khả dụng ${vnd(row.available)}`, detail: 'Xem tab Phí nền tảng', tone: 'ok' as Tone }, { title: `Ký quỹ kèo ${vnd(row.reserved)}`, detail: 'Xem tab Kèo', tone: 'wait' as Tone }],
        facts: [{ k: 'Khả dụng', v: vnd(row.available) }, { k: 'Đang giữ', v: vnd(row.reserved) }], refIds: [],
      };
      if (walletType === 'personal') {
        const inflow = [['Nạp', flow(row.id, 'topup')], ['Hoàn', flow(row.id, 'refund')], ['Thắng kèo', flow(row.id, 'release')]] as const;
        return {
          id: row.id, title: user(row.userId), titleNote: 'Ví người chơi', party: inflow.filter(([, v]) => v > 0n).map(([k, v]) => `${k} ${vnd(v)}`).join(' · ') || 'Chưa có tiền vào', partyNote: `Đã chi ${vnd(-flow(row.id, 'payment'))} · đã rút ${vnd(out)}`,
          counterpart: vnd(row.reserved), counterpartNote: row.reserved > 0n ? 'Đang giữ cho yêu cầu rút / phí kèo' : 'Không giữ', status: `Rút được ${vnd(row.withdrawable)}`, tone: 'info' as Tone, amount: n(row.available), sign: '' as const, amountNote: 'số dư khả dụng',
          from: 'Nạp, hoàn, thắng kèo', fromNote: 'Tiền vào ví', to: 'Đặt sân, phí kèo, rút về NH', toNote: 'Tiền ra khỏi ví',
          steps: [{ title: 'Tiền vào', detail: inflow.map(([k, v]) => `${k} ${vnd(v)}`).join(' · '), tone: 'ok' as Tone }, { title: 'Tiền ra', detail: `Thanh toán ${vnd(-flow(row.id, 'payment'))} · rút về NH ${vnd(out)}`, tone: 'wait' as Tone }, { title: `Được rút về ngân hàng ${vnd(row.withdrawable)}`, detail: 'Chỉ phần hoàn do lỗi sân, chuyển thừa, thắng kèo', tone: 'info' as Tone }],
          facts: [{ k: 'Chủ ví', v: user(row.userId) }, { k: 'Khả dụng', v: vnd(row.available) }, { k: 'Đang giữ', v: vnd(row.reserved) }, { k: 'Được rút', v: vnd(row.withdrawable) }], refIds: [],
        };
      }
      const recorded = row.available + row.pending + row.reserved + out;
      return {
        id: row.id, title: user(row.userId), titleNote: 'Ví chủ sân', party: vnd(row.pending), partyNote: 'chờ 24 giờ', counterpart: vnd(row.reserved), counterpartNote: 'đang giữ cho yêu cầu rút',
        status: `Đã rút ${vnd(out)}`, tone: 'info' as Tone, amount: n(row.available), sign: '' as const, amountNote: 'có thể rút',
        from: 'Khách đặt sân', fromNote: 'Doanh thu từng booking', to: `Ví ${user(row.userId)}`, toNote: 'Chờ → có thể rút → ngân hàng',
        steps: [{ title: `Đã ghi nhận ${vnd(recorded)}`, detail: 'Chờ + có thể rút + đang giữ + đã rút', tone: 'info' as Tone }, { title: `Chờ 24 giờ ${vnd(row.pending)}`, detail: 'Xem tab Doanh thu đặt sân, lọc Chờ 24 giờ và chủ sân này', tone: 'wait' as Tone }, { title: `Đã rút ${vnd(out)}`, detail: 'Xem tab Rút tiền', tone: 'ok' as Tone }],
        facts: [{ k: 'Chủ ví', v: user(row.userId) }, { k: 'Doanh thu ghi nhận', v: vnd(flow(row.id, 'release')) }, { k: 'Bị hoàn lại', v: vnd(-flow(row.id, 'refund')) }], refIds: [],
      };
    }),
  };
}

async function bank(q: FlowQuery): Promise<FlowPage> {
  const filterWhere: Prisma.SepayEventWhereInput = q.filter === 'in' ? { direction: 'in' } : q.filter === 'out' ? { direction: 'out' } : q.filter === 'matched' ? { status: { in: ['matched_auto', 'matched_manual', 'out_of_scope'] } } : q.filter === 'unmatched' ? { status: 'unmatched' } : {};
  const base = range('receivedAt', q.from, q.to);
  const s = q.search;
  const where: Prisma.SepayEventWhereInput = { ...base, ...filterWhere,
    ...(s ? { OR: [{ businessCode: contains(s.text) }, { rawRef: contains(s.text) }, { externalRef: contains(s.text) }, { allocations: { some: { refId: { in: s.bookingIds } } } }] } : {}) };
  const [total, rows, byDirection, allocated, unmatched] = await Promise.all([
    prisma.sepayEvent.count({ where }),
    prisma.sepayEvent.findMany({ where, include: { allocations: true }, orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.sepayEvent.groupBy({ by: ['direction'], where: base, _sum: { amount: true }, _count: true }),
    prisma.sepayAllocation.aggregate({ where: { sepayEvent: base }, _sum: { amount: true } }),
    prisma.sepayEvent.aggregate({ where: { ...base, status: 'unmatched' }, _sum: { amount: true }, _count: true }),
  ]);
  const dir = (d: 'in' | 'out') => byDirection.find((row) => row.direction === d);
  const allocations = rows.flatMap((row) => row.allocations);
  const ledgerIds = allocations.filter((a) => a.kind === 'topup' || a.kind === 'payout').map((a) => a.refId).filter((id): id is string => Boolean(id));
  const entries = ledgerIds.length ? await prisma.ledgerEntry.findMany({ where: { id: { in: ledgerIds } }, include: { wallet: true } }) : [];
  const contributions = await prisma.matchContribution.findMany({ where: { id: { in: allocations.filter((a) => a.kind === 'matchFee').map((a) => a.refId).filter((id): id is string => Boolean(id)) } } });
  const details = await bookingDetails(allocations.filter((a) => a.kind === 'booking').map((a) => a.refId).filter((id): id is string => Boolean(id)));
  const kindLabel: Record<string, string> = { booking: 'Thanh toán đặt sân', topup: 'Nạp ví', payout: 'Chi rút tiền', matchFee: 'Phí kèo', out_of_scope: 'Ngoài phạm vi' };
  const describe = (a: (typeof allocations)[number]) => {
    const entry = entries.find((item) => item.id === a.refId);
    const owner = a.kind === 'booking' ? details.get(a.refId ?? '')?.userId : a.kind === 'matchFee' ? contributions.find((item) => item.id === a.refId)?.userId : entry?.wallet.userId;
    const target = a.kind === 'booking' ? bookingLabel(a.refId ?? '', details.get(a.refId ?? '')) : a.kind === 'matchFee' ? `Kèo #${short(contributions.find((item) => item.id === a.refId)?.matchId ?? '')}` : kindLabel[a.kind] ?? a.kind;
    return { owner, target, text: `${kindLabel[a.kind] ?? a.kind} ${vnd(a.amount)}${a.reason ? ` · ${a.reason}` : ''}` };
  };
  return {
    total,
    kpis: [
      { label: 'Tiền vào', value: n(dir('in')?._sum.amount), note: `${dir('in')?._count ?? 0} giao dịch`, tone: 'ok' },
      { label: 'Tiền ra', value: n(dir('out')?._sum.amount), note: `${dir('out')?._count ?? 0} giao dịch`, tone: 'info' },
      { label: 'Đã có đối ứng', value: n(allocated._sum.amount), note: 'Đã gán vào nghiệp vụ', tone: 'ok' },
      { label: 'Chênh lệch cần xử lý', value: n(unmatched._sum.amount), note: `${unmatched._count} giao dịch chưa khớp`, tone: 'bad' },
    ],
    items: rows.map((row) => {
      const parts = row.allocations.map(describe);
      const matched = row.status !== 'unmatched';
      const owner = parts.find((part) => part.owner)?.owner;
      return {
        id: row.id, title: row.businessCode, titleNote: `${dateTime(row.receivedAt)} · ${row.direction === 'in' ? 'tiền vào' : 'tiền ra'}`,
        party: parts.map((part) => part.target).join(', ') || 'Chưa khớp', partyNote: row.rawRef ? `Nội dung: ${row.rawRef}` : 'Không có nội dung',
        counterpart: owner ? user(owner) : '—', counterpartNote: owner ? 'Chủ giao dịch' : 'Chưa xác định',
        status: matched ? (row.status === 'out_of_scope' ? 'Ngoài phạm vi' : 'Đã khớp') : 'Cần xử lý', tone: (matched ? (row.status === 'out_of_scope' ? 'mute' : 'ok') : 'bad') as Tone,
        amount: n(row.amount), sign: row.direction === 'in' ? '+' : '-', amountNote: row.direction === 'in' ? 'tiền vào tài khoản' : 'tiền ra khỏi tài khoản',
        from: row.direction === 'in' ? (owner ? user(owner) : 'Người gửi chưa rõ') : 'Tài khoản nền tảng', fromNote: row.direction === 'in' ? 'Tài khoản gửi' : 'VietQR nền tảng',
        to: row.direction === 'in' ? 'Tài khoản nền tảng' : owner ? user(owner) : 'Người nhận chưa rõ', toNote: parts.map((part) => part.target).join(', ') || 'Chưa khớp',
        steps: [
          { title: 'Ngân hàng báo có giao dịch', detail: `${vnd(row.amount)} · ${row.rawRef || 'không có nội dung'}`, tone: 'info' as Tone },
          matched ? { title: row.status === 'matched_manual' ? 'Admin gán thủ công' : row.status === 'out_of_scope' ? 'Đánh dấu ngoài phạm vi' : 'Khớp tự động', detail: parts.map((part) => part.text).join(' · ') || '—', tone: 'ok' as Tone }
            : { title: 'Không khớp nghiệp vụ nào', detail: 'Gán vào ví, gán yêu cầu rút hoặc đánh dấu ngoài phạm vi ở mục Đối soát', tone: 'bad' as Tone },
        ],
        facts: [{ k: 'Mã giao dịch', v: row.businessCode }, { k: 'Mã ngân hàng', v: row.externalRef ?? '—' }, { k: 'Nội dung CK', v: row.rawRef || '—' }, { k: 'Đã ghi nhận', v: vnd(sum(row.allocations)) }],
        refIds: row.allocations.map((a) => a.refId).filter((id): id is string => Boolean(id)),
      };
    }),
  };
}

const HANDLERS: Record<FlowTab, (q: FlowQuery) => Promise<FlowPage>> = { revenue, platform, refund: refunds, topup: topups, match: matches, withdraw: withdrawals, reward: rewards, wallets, bank };

export async function listAdminFinancialFlows(q: FlowQuery) {
  const text = q.q?.trim() ?? '';
  const search = text ? { text, userIds: q.userIds ?? [], bookingIds: await bookingIdsByCodes(text.toUpperCase().match(/BK-\d{8}/g) ?? []) } : undefined;
  const result = await HANDLERS[q.tab]({ ...q, search });
  return { ...result, page: q.page, pageSize: q.pageSize };
}

/** Bút toán sổ cái theo tham chiếu (refId hoặc chính id bút toán) cho ngăn "Hành trình dòng tiền". */
export async function listLedgerForRefs(refIds: string[]) {
  if (!refIds.length) return [];
  const rows = await prisma.ledgerEntry.findMany({
    where: { OR: [{ refId: { in: refIds } }, { id: { in: refIds } }] }, include: { wallet: { select: { walletType: true, userId: true } } }, orderBy: { ts: 'asc' }, take: 50,
  });
  return rows.map((row) => ({ id: row.id, walletType: row.wallet.walletType, userId: row.wallet.userId, type: row.type, refType: row.refType, amount: n(row.amount), ts: row.ts }));
}
