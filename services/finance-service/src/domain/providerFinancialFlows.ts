import type { BookingRevenue, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { bookingDetails, type BookingDetail } from './bookingReferences.js';
import { cancelReason, contains, dateTime, n, range, vnd, type FlowRow, type Kpi, type Tone } from './adminFinancialFlows.js';

/** Chi tiết dòng tiền của CHÍNH chủ sân — chỉ đọc, mọi truy vấn khóa theo userId.
 * ponytail: gom nhóm/tìm theo tên khách làm trong bộ nhớ trên toàn bộ booking của
 * một chủ sân (quy mô đồ án vài trăm booking); lên hàng chục nghìn thì chuyển sang SQL. */
export const PROVIDER_FLOW_TABS = ['revenue', 'deduct', 'withdraw', 'ledger', 'venues'] as const;
export type ProviderFlowTab = (typeof PROVIDER_FLOW_TABS)[number];
export type ProviderFlowQuery = { tab: ProviderFlowTab; filter?: string; venueId?: string; courtId?: string; from?: Date; to?: Date; q?: string; page: number; pageSize: number };
type Page = { kpis: Kpi[]; items: FlowRow[]; total: number };
type Row = BookingRevenue & { detail?: BookingDetail };

const pageOf = <T>(rows: T[], q: ProviderFlowQuery) => rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
const refundedOf = (row: { gross: bigint; net: bigint; commission: bigint }) => row.gross - row.net - row.commission;
const bookingCode = (row: Row) => row.detail?.businessCode ?? `Booking #${row.bookingId.slice(0, 8)}`;
const place = (row: Row) => [row.detail?.venueName, row.detail?.courtName].filter(Boolean).join(' · ') || 'Cơ sở của bạn';
const playTime = (row: Row) => `${row.detail?.startAt ? `${dateTime(row.detail.startAt)} → ` : 'kết thúc '}${dateTime(row.endAt)}`;
const customer = (row: Row) => row.detail?.customerName ?? 'Khách';
const matchesText = (row: Row, text: string) => [row.detail?.businessCode, row.detail?.customerName, row.detail?.venueName, row.detail?.courtName].some((value) => value?.toLowerCase().includes(text.toLowerCase()));

async function bookings(userId: string, q: ProviderFlowQuery, extra: Prisma.BookingRevenueWhereInput = {}): Promise<Row[]> {
  const rows = await prisma.bookingRevenue.findMany({
    where: { businessUserId: userId, ...(q.venueId ? { venueId: q.venueId } : {}), ...range('endAt', q.from, q.to), ...extra },
    orderBy: [{ endAt: 'desc' }, { bookingId: 'desc' }],
  });
  const details = await bookingDetails(rows.map((row) => row.bookingId));
  return rows.map((row) => ({ ...row, detail: details.get(row.bookingId) })).filter((row) => !q.courtId || row.detail?.courtId === q.courtId);
}

async function disputesFor(bookingIds: string[]) {
  return bookingIds.length ? prisma.dispute.findMany({ where: { bookingId: { in: bookingIds } } }) : [];
}

async function revenue(userId: string, q: ProviderFlowQuery): Promise<Page> {
  const all = await bookings(userId, q);
  const disputes = await disputesFor(all.map((row) => row.bookingId));
  const disputed = new Set(disputes.map((row) => row.bookingId));
  const statusOf = (row: Row) => row.cancelledAt ? 'cancelled' : disputed.has(row.bookingId) ? 'dispute' : row.releasedAt ? 'available' : 'pending';
  const text = q.q?.trim();
  const rows = all.filter((row) => (!q.filter || statusOf(row) === q.filter) && (!text || matchesText(row, text)));
  const intents = await prisma.paymentIntent.findMany({ where: { refType: 'booking', refId: { in: pageOf(rows, q).map((row) => row.bookingId) } } });
  const events = await prisma.sepayAllocation.findMany({ where: { kind: 'booking', refId: { in: pageOf(rows, q).map((row) => row.bookingId) } }, include: { sepayEvent: true } });
  const total = (pick: (row: Row) => bigint) => rows.reduce((sum, row) => sum + pick(row), 0n);
  const gross = total((row) => row.gross);
  return {
    total: rows.length,
    kpis: [
      { label: 'Tổng khách đã trả', value: n(gross), note: `${rows.length} booking`, tone: 'info' },
      { label: 'Bạn nhận', value: n(total((row) => row.net)), note: 'Sau phí nền tảng và hoàn khách', tone: 'ok' },
      { label: 'Phí nền tảng', value: n(total((row) => row.commission)), note: '10% mỗi booking thành công', tone: 'info' },
      { label: 'Đã hoàn khách', value: n(total(refundedOf)), note: 'Xem tab Hoàn tiền và khoản bị trừ', tone: 'bad' },
    ],
    items: pageOf(rows, q).map((row) => {
      const status = statusOf(row);
      const intent = intents.find((item) => item.refId === row.bookingId);
      const bank = events.find((item) => item.refId === row.bookingId)?.sepayEvent;
      const channel = intent ? (intent.method === 'sepay' ? 'SePay' : 'Ví COURTIN') : 'Chưa rõ kênh thanh toán';
      const refunded = refundedOf(row);
      const dispute = disputes.find((item) => item.bookingId === row.bookingId);
      const [label, tone]: [string, Tone] = status === 'cancelled' ? ['Đã hủy', 'mute'] : status === 'dispute' ? ['Có tranh chấp', 'info'] : status === 'available' ? ['Có thể rút', 'ok'] : ['Chờ 24 giờ', 'wait'];
      return {
        id: row.bookingId, title: bookingCode(row), titleNote: `${place(row)} · ${playTime(row)}`,
        party: customer(row), partyNote: `${channel}${bank ? ` · ${bank.businessCode}` : ''}`,
        counterpart: row.cancelledAt ? '—' : dateTime(row.releasedAt ?? row.releaseAt), counterpartNote: row.cancelledAt ? 'không mở khóa' : row.releasedAt ? 'đã mở khóa' : 'dự kiến mở khóa',
        status: label, tone, amount: n(row.gross), sign: '', amountNote: `phí ${vnd(row.commission)} · hoàn ${vnd(refunded)} · bạn nhận ${vnd(row.net)}`,
        from: customer(row), fromNote: channel, to: 'Ví của bạn', toNote: 'Sau khi trừ phí nền tảng',
        steps: [
          { title: `Khách thanh toán ${vnd(row.gross)}`, detail: `${channel}${bank ? ` · ${bank.businessCode} · ${dateTime(bank.receivedAt)}` : ''}`, tone: 'info' },
          { title: 'Phân bổ', detail: `${vnd(row.gross)} = ${vnd(row.commission)} phí nền tảng + ${vnd(row.net)} bạn nhận${refunded ? ` + ${vnd(refunded)} hoàn khách` : ''}`, tone: 'info' },
          ...(dispute ? [{ title: `Tranh chấp ${dispute.businessCode}`, detail: dispute.resolution ?? dispute.reason ?? 'Đang xem xét', tone: 'bad' as Tone }] : []),
          row.cancelledAt ? { title: 'Booking bị hủy', detail: `${cancelReason[row.detail?.cancellationReason ?? ''] ?? 'Đã hủy'} · hoàn ${vnd(refunded)} cho khách`, tone: 'bad' }
            : row.releasedAt ? { title: 'Đã có thể rút', detail: dateTime(row.releasedAt), tone: 'ok' } : { title: 'Chờ đủ 24 giờ', detail: `Dự kiến mở khóa ${dateTime(row.releaseAt)} nếu không có tranh chấp`, tone: 'wait' },
        ],
        facts: [{ k: 'Mã booking', v: bookingCode(row) }, { k: 'Sân', v: place(row) }, { k: 'Giờ chơi', v: playTime(row) }, { k: 'Khách đặt', v: customer(row) }, { k: 'Thanh toán', v: `${channel}${bank ? ` · ${bank.businessCode}` : ''}` }],
        refIds: [row.bookingId],
      };
    }),
  };
}

async function deductions(userId: string, q: ProviderFlowQuery): Promise<Page> {
  const wallet = await prisma.wallet.findFirst({ where: { userId, walletType: 'business' } });
  const entries = await prisma.ledgerEntry.findMany({ where: { walletId: wallet?.id ?? '-', type: 'refund', amount: { lt: 0n }, ...range('ts', q.from, q.to) }, orderBy: [{ ts: 'desc' }, { id: 'desc' }] });
  const disputes = await prisma.dispute.findMany({ where: { id: { in: entries.filter((row) => row.refType === 'dispute').map((row) => row.refId) } } });
  const bookingIdOf = (entry: (typeof entries)[number]) => entry.refType === 'dispute' ? disputes.find((item) => item.id === entry.refId)?.bookingId ?? entry.refId : entry.refId;
  const revenues = await prisma.bookingRevenue.findMany({ where: { businessUserId: userId, bookingId: { in: entries.map(bookingIdOf) } } });
  const details = await bookingDetails(revenues.map((row) => row.bookingId));
  const kindOf = (entry: (typeof entries)[number]) => entry.refType === 'dispute' ? 'dispute' : details.get(entry.refId)?.cancellationReason === 'self' ? 'customer' : 'venue';
  const text = q.q?.trim();
  const rows = entries.filter((entry) => {
    const revenue = revenues.find((item) => item.bookingId === bookingIdOf(entry));
    if (q.venueId && revenue?.venueId !== q.venueId) return false;
    if (q.courtId && details.get(revenue?.bookingId ?? '')?.courtId !== q.courtId) return false;
    if (q.filter && kindOf(entry) !== q.filter) return false;
    return !text || (revenue && matchesText({ ...revenue, detail: details.get(revenue.bookingId) }, text)) || disputes.some((item) => item.id === entry.refId && item.businessCode.toLowerCase().includes(text.toLowerCase()));
  });
  const sumOf = (kind?: string) => rows.filter((entry) => !kind || kindOf(entry) === kind).reduce((sum, entry) => sum - entry.amount, 0n);
  const label: Record<string, [string, Tone]> = { customer: ['Khách hủy', 'mute'], venue: ['Lỗi phía sân', 'bad'], dispute: ['Tranh chấp', 'info'] };
  return {
    total: rows.length,
    kpis: [
      { label: 'Tổng bị trừ', value: n(sumOf()), note: `${rows.length} lần`, tone: 'bad' },
      { label: 'Do khách hủy', value: n(sumOf('customer')), note: 'Theo chính sách hủy', tone: 'info' },
      { label: 'Do lỗi phía sân', value: n(sumOf('venue')), note: 'Sân hủy hoặc đóng cửa', tone: 'bad' },
      { label: 'Do tranh chấp', value: n(sumOf('dispute')), note: 'Theo kết luận của admin', tone: 'wait' },
    ],
    items: pageOf(rows, q).map((entry) => {
      const revenue = revenues.find((item) => item.bookingId === bookingIdOf(entry));
      const row: Row | undefined = revenue ? { ...revenue, detail: details.get(revenue.bookingId) } : undefined;
      const dispute = disputes.find((item) => item.id === entry.refId);
      const kind = kindOf(entry);
      const why = dispute ? `Tranh chấp ${dispute.businessCode}${dispute.resolution ? ` · ${dispute.resolution}` : ''}` : kind === 'customer' ? 'Khách tự hủy' : cancelReason[row?.detail?.cancellationReason ?? ''] ?? 'Hủy booking';
      const cut = -entry.amount;
      return {
        id: entry.id, title: row ? bookingCode(row) : `Booking #${bookingIdOf(entry).slice(0, 8)}`, titleNote: row ? `${place(row)} · ${playTime(row)}` : '',
        party: row ? customer(row) : 'Khách', partyNote: 'Nhận hoàn vào ví', counterpart: why, counterpartNote: `Lúc ${dateTime(entry.ts)}`,
        status: label[kind]![0], tone: label[kind]![1], amount: n(cut), sign: '-', amountNote: 'trừ vào tiền chờ 24 giờ',
        from: 'Ví của bạn (tiền chờ 24 giờ)', fromNote: `−${vnd(cut)}`, to: row ? customer(row) : 'Khách', toNote: 'Nhận hoàn kèm phí nền tảng hoàn lại',
        steps: [
          { title: dispute ? `Khách mở tranh chấp ${dispute.businessCode}` : 'Booking bị hủy', detail: why, tone: 'bad' },
          { title: `Trừ ${vnd(cut)} tiền của bạn`, detail: `Tiền chờ 24 giờ ${vnd(entry.before)} → ${vnd(entry.after)}`, tone: 'wait' },
        ],
        facts: [{ k: 'Booking', v: row ? bookingCode(row) : '—' }, { k: 'Khách', v: row ? customer(row) : '—' }, { k: 'Lý do', v: why }, { k: 'Thời điểm', v: dateTime(entry.ts) }],
        refIds: [entry.id],
      };
    }),
  };
}

async function withdrawals(userId: string, q: ProviderFlowQuery): Promise<Page> {
  const statuses = q.filter === 'pending' ? ['pending', 'partially_paid'] : q.filter === 'paid' ? ['paid', 'partially_paid'] : q.filter === 'rejected' ? ['rejected'] : undefined;
  const base: Prisma.WithdrawalRequestWhereInput = { sellerUserId: userId, walletType: 'business', ...range('createdAt', q.from, q.to) };
  const where: Prisma.WithdrawalRequestWhereInput = { ...base, ...(statuses ? { status: { in: statuses as never } } : {}), ...(q.q?.trim() ? { transferCode: contains(q.q.trim()) } : {}) };
  const [total, rows, all, wallet] = await Promise.all([
    prisma.withdrawalRequest.count({ where }),
    prisma.withdrawalRequest.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.withdrawalRequest.findMany({ where: base, select: { amount: true, paidAmount: true, status: true } }),
    prisma.wallet.findFirst({ where: { userId, walletType: 'business' } }),
  ]);
  const events = await prisma.sepayEvent.findMany({ where: { id: { in: rows.map((row) => row.sePayEventId).filter((id): id is string => Boolean(id)) } } });
  const of = (...s: string[]) => all.filter((row) => s.includes(row.status));
  return {
    total,
    kpis: [
      { label: 'Đã chuyển về ngân hàng', value: n(all.reduce((sum, row) => sum + (row.paidAmount ?? 0n), 0n)), note: `${of('paid', 'partially_paid').length} lần`, tone: 'ok' },
      { label: 'Đang xử lý', value: n(of('pending', 'partially_paid').reduce((sum, row) => sum + row.amount - (row.paidAmount ?? 0n), 0n)), note: `${of('pending', 'partially_paid').length} yêu cầu`, tone: 'wait' },
      { label: 'Bị từ chối', value: n(of('rejected').reduce((sum, row) => sum + row.amount, 0n)), note: `${of('rejected').length} lần · đã trả lại số dư`, tone: 'bad' },
      { label: 'Có thể rút ngay', value: n(wallet?.available), note: 'Tối thiểu 10.000đ mỗi lần', tone: 'info' },
    ],
    items: rows.map((row) => {
      const event = events.find((item) => item.id === row.sePayEventId);
      const account = `${row.bankAccountName} · ${row.bankCode} •••• ${row.bankAccountNumber.slice(-4)}`;
      const [status, tone]: [string, Tone] = row.status === 'paid' ? ['Đã chuyển', 'ok'] : row.status === 'partially_paid' ? ['Chuyển một phần', 'wait'] : row.status === 'pending' ? ['Đang xử lý', 'wait'] : ['Bị từ chối', 'bad'];
      return {
        id: row.id, title: row.transferCode, titleNote: `Tạo ${dateTime(row.createdAt)}`, party: account, partyNote: row.rejectionReason ? `Lý do: ${row.rejectionReason}` : 'Tài khoản nhận',
        counterpart: event ? dateTime(event.receivedAt) : '—', counterpartNote: event ? event.businessCode : row.status === 'rejected' ? 'Không chuyển' : 'Chờ ngân hàng xác nhận',
        status, tone, amount: n(row.status === 'rejected' ? row.amount : row.paidAmount ?? row.amount), sign: row.status === 'rejected' ? '' : '-', amountNote: row.status === 'rejected' ? 'đã trả lại số dư' : row.status === 'pending' ? 'đang giữ khỏi số dư' : 'đã về tài khoản',
        from: 'Ví của bạn · có thể rút', fromNote: 'Giữ lại khi tạo yêu cầu', to: account, toNote: event ? 'Đã nhận' : 'Chưa nhận',
        steps: [
          { title: `Tạo yêu cầu rút ${vnd(row.amount)}`, detail: 'Giữ khỏi số dư có thể rút', tone: 'wait' },
          row.status === 'rejected' ? { title: 'Bị từ chối', detail: `${row.rejectionReason ?? '—'} · trả lại số dư`, tone: 'bad' } : { title: 'Nền tảng chuyển khoản', detail: `Nội dung CK: ${row.transferCode}`, tone: 'info' },
          event ? { title: `Ngân hàng xác nhận ${dateTime(event.receivedAt)}`, detail: `Mã giao dịch ${event.businessCode}`, tone: 'ok' } : { title: row.status === 'rejected' ? 'Bạn có thể tạo yêu cầu mới' : 'Chờ ngân hàng xác nhận', detail: dateTime(row.processedAt), tone: 'wait' },
        ],
        facts: [{ k: 'Mã yêu cầu', v: row.transferCode }, { k: 'Tài khoản nhận', v: account }, { k: 'Lý do từ chối', v: row.rejectionReason ?? '—' }, { k: 'Xử lý lúc', v: dateTime(row.processedAt) }],
        refIds: [row.id],
      };
    }),
  };
}

type Movement = { id: string; rank: number; refId?: string; at: Date; text: string; note: string; ref: string; bucket: 'pending' | 'available' | 'reserved'; delta: bigint; availableDelta: bigint };

/** Sổ ví: ghép sổ cái (doanh thu vào chờ, bị trừ, chuyển NH) với các bước chỉ cập nhật số dư (mở khóa, giữ cho rút, trả lại khi từ chối). */
async function ledger(userId: string, q: ProviderFlowQuery): Promise<Page> {
  const wallet = await prisma.wallet.findFirst({ where: { userId, walletType: 'business' } });
  const [entries, revenues, requests] = await Promise.all([
    prisma.ledgerEntry.findMany({ where: { walletId: wallet?.id ?? '-' } }),
    prisma.bookingRevenue.findMany({ where: { businessUserId: userId, releasedAt: { not: null } } }),
    prisma.withdrawalRequest.findMany({ where: { sellerUserId: userId, walletType: 'business' } }),
  ]);
  const details = await bookingDetails([...new Set([...revenues.map((row) => row.bookingId), ...entries.filter((row) => row.refType === 'booking').map((row) => row.refId)])]);
  const code = (bookingId: string) => details.get(bookingId)?.businessCode ?? `Booking #${bookingId.slice(0, 8)}`;
  const moves: Movement[] = [
    ...entries.map((entry): Movement => entry.type === 'payout'
      ? { id: entry.id, rank: 4, refId: entry.id, at: entry.ts, text: 'Chuyển về ngân hàng', note: 'Ngân hàng xác nhận', ref: requests.find((item) => item.id === entry.refId)?.transferCode ?? 'Rút tiền', bucket: 'reserved', delta: entry.amount, availableDelta: 0n }
      : entry.type === 'refund'
        ? { id: entry.id, rank: 1, refId: entry.id, at: entry.ts, text: 'Bị trừ do hoàn khách', note: entry.refType === 'dispute' ? 'Theo kết luận tranh chấp' : 'Booking bị hủy', ref: entry.refType === 'booking' ? code(entry.refId) : 'Tranh chấp', bucket: 'pending', delta: entry.amount, availableDelta: 0n }
        : { id: entry.id, rank: 0, refId: entry.id, at: entry.ts, text: 'Doanh thu vào chờ 24 giờ', note: 'Booking đã thanh toán', ref: entry.refType === 'booking' ? code(entry.refId) : entry.refType, bucket: 'pending', delta: entry.amount, availableDelta: 0n }),
    ...revenues.map((row): Movement => ({ id: `release-${row.bookingId}`, rank: 2, at: row.releasedAt!, text: 'Doanh thu đã mở khóa', note: 'Hết 24 giờ, không tranh chấp', ref: code(row.bookingId), bucket: 'available', delta: row.net, availableDelta: row.net })),
    ...requests.map((row): Movement => ({ id: `reserve-${row.id}`, rank: 3, at: row.createdAt, text: 'Giữ cho yêu cầu rút', note: `${row.bankCode} •••• ${row.bankAccountNumber.slice(-4)}`, ref: row.transferCode, bucket: 'available', delta: -row.amount, availableDelta: -row.amount })),
    ...requests.filter((row) => row.status === 'rejected').map((row): Movement => ({ id: `return-${row.id}`, rank: 5, at: row.processedAt ?? row.createdAt, text: 'Trả lại do yêu cầu rút bị từ chối', note: row.rejectionReason ?? 'Bị từ chối', ref: row.transferCode, bucket: 'available', delta: row.amount, availableDelta: row.amount })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime() || a.rank - b.rank || a.id.localeCompare(b.id));
  let running = 0n;
  const withBalance = moves.map((move) => { running += move.availableDelta; return { ...move, balance: running }; }).reverse();
  const text = q.q?.trim().toLowerCase();
  const rows = withBalance.filter((move) => (!q.from || move.at >= q.from) && (!q.to || move.at <= q.to)
    && (!q.filter || (q.filter === 'in' ? move.delta > 0n : move.delta < 0n)) && (!text || `${move.text} ${move.ref}`.toLowerCase().includes(text)));
  const bucketLabel = { pending: 'chờ 24 giờ', available: 'có thể rút', reserved: 'đang giữ cho rút' };
  const unlocked = revenues.reduce((sum, row) => sum + row.net, 0n);
  const paidOut = requests.reduce((sum, row) => sum + (row.paidAmount ?? 0n), 0n);
  const holding = requests.filter((row) => row.status === 'pending' || row.status === 'partially_paid').reduce((sum, row) => sum + row.amount - (row.paidAmount ?? 0n), 0n);
  const balanced = unlocked - paidOut - holding === (wallet?.available ?? 0n);
  return {
    total: rows.length,
    kpis: [
      { label: 'Số dư có thể rút', value: n(wallet?.available), note: balanced ? `= ${vnd(unlocked)} đã mở khóa − ${vnd(paidOut)} đã rút − ${vnd(holding)} đang giữ ✓` : 'Hiện tại', tone: 'ok' },
      { label: 'Doanh thu đã mở khóa', value: n(unlocked), note: `${revenues.length} booking`, tone: 'ok' },
      { label: 'Đang chờ 24 giờ', value: n(wallet?.pending), note: 'Chưa tính vào số dư có thể rút', tone: 'wait' },
      { label: 'Đã rút về ngân hàng', value: n(paidOut), note: `${requests.filter((row) => row.paidAmount).length} lần`, tone: 'info' },
    ],
    items: pageOf(rows, q).map((move) => ({
      id: move.id, title: move.text, titleNote: dateTime(move.at), party: move.ref, partyNote: move.note,
      counterpart: vnd(move.balance), counterpartNote: 'số dư có thể rút sau', status: bucketLabel[move.bucket], tone: (move.delta > 0n ? 'ok' : 'wait') as Tone,
      amount: n(move.delta < 0n ? -move.delta : move.delta), sign: (move.delta >= 0n ? '+' : '-') as '+' | '-', amountNote: move.delta >= 0n ? 'tiền vào' : 'tiền ra',
      from: move.delta >= 0n ? move.note : `Ví của bạn · ${bucketLabel[move.bucket]}`, fromNote: '', to: move.delta >= 0n ? `Ví của bạn · ${bucketLabel[move.bucket]}` : move.text, toNote: '',
      steps: [{ title: `${move.text} ${move.delta >= 0n ? '+' : '−'}${vnd(move.delta < 0n ? -move.delta : move.delta)}`, detail: `Số dư có thể rút sau: ${vnd(move.balance)}`, tone: (move.delta >= 0n ? 'ok' : 'wait') as Tone }],
      facts: [{ k: 'Thời điểm', v: dateTime(move.at) }, { k: 'Liên quan', v: move.ref }, { k: 'Khoản', v: bucketLabel[move.bucket] }],
      refIds: move.refId ? [move.refId] : [],
    })),
  };
}

async function venues(userId: string, q: ProviderFlowQuery): Promise<Page> {
  const all = await bookings(userId, q);
  const byCourt = q.filter === 'court';
  const groups = new Map<string, { name: string; venue: string; rows: Row[] }>();
  for (const row of all) {
    const key = byCourt ? `${row.venueId}:${row.detail?.courtName ?? '?'}` : row.venueId;
    const group = groups.get(key) ?? { name: byCourt ? row.detail?.courtName ?? 'Sân chưa rõ tên' : row.detail?.venueName ?? 'Cơ sở của bạn', venue: row.detail?.venueName ?? 'Cơ sở của bạn', rows: [] };
    group.rows.push(row); groups.set(key, group);
  }
  const sumBy = (rows: Row[], pick: (row: Row) => bigint) => rows.reduce((sum, row) => sum + pick(row), 0n);
  const text = q.q?.trim().toLowerCase();
  const list = [...groups].map(([key, group]) => ({ key, ...group, gross: sumBy(group.rows, (row) => row.gross), fee: sumBy(group.rows, (row) => row.commission), refund: sumBy(group.rows, refundedOf), net: sumBy(group.rows, (row) => row.net) }))
    .filter((group) => !text || `${group.name} ${group.venue}`.toLowerCase().includes(text)).sort((a, b) => Number(b.net - a.net));
  const top = list[0];
  return {
    total: list.length,
    kpis: [
      { label: byCourt ? 'Số sân con' : 'Số cơ sở', value: `${list.length}`, note: 'Có booking trong kỳ', tone: 'info' },
      { label: 'Tổng khách đã trả', value: n(sumBy(all, (row) => row.gross)), note: `${all.length} booking`, tone: 'info' },
      { label: 'Bạn nhận', value: n(sumBy(all, (row) => row.net)), note: 'Sau phí và hoàn', tone: 'ok' },
      { label: byCourt ? 'Sân con doanh thu cao nhất' : 'Cơ sở doanh thu cao nhất', value: top ? top.name : '—', note: top ? `${vnd(top.net)} bạn nhận` : '', tone: 'ok' },
    ],
    items: pageOf(list, q).map((group) => ({
      id: group.key, title: group.name, titleNote: byCourt ? group.venue : `${new Set(group.rows.map((row) => row.detail?.courtName)).size} sân con`,
      party: `${group.rows.length} booking`, partyNote: `khách trả ${vnd(group.gross)}`, counterpart: vnd(group.fee), counterpartNote: `phí · hoàn ${vnd(group.refund)}`,
      status: group.refund > 0n ? `Hoàn ${vnd(group.refund)}` : 'Không hoàn', tone: (group.refund > 0n ? 'bad' : 'mute') as Tone, amount: n(group.net), sign: '' as const, amountNote: 'bạn nhận',
      from: 'Khách đặt sân', fromNote: `${group.rows.length} booking`, to: 'Ví của bạn', toNote: 'Sau phí và hoàn',
      steps: [
        { title: `Khách trả ${vnd(group.gross)}`, detail: `${group.rows.length} booking`, tone: 'info' as Tone },
        { title: `Phí nền tảng ${vnd(group.fee)} · hoàn ${vnd(group.refund)}`, detail: '', tone: 'wait' as Tone },
        { title: `Bạn nhận ${vnd(group.net)}`, detail: `Kiểm tra: ${vnd(group.gross)} = ${vnd(group.fee)} + ${vnd(group.refund)} + ${vnd(group.net)} ✓`, tone: 'ok' as Tone },
      ],
      facts: [{ k: byCourt ? 'Sân con' : 'Cơ sở', v: group.name }, ...(byCourt ? [{ k: 'Cơ sở', v: group.venue }] : []), { k: 'Số booking', v: String(group.rows.length) }],
      refIds: [],
    })),
  };
}

const HANDLERS: Record<ProviderFlowTab, (userId: string, q: ProviderFlowQuery) => Promise<Page>> = { revenue, deduct: deductions, withdraw: withdrawals, ledger, venues };

export async function listProviderFinancialFlows(userId: string, q: ProviderFlowQuery) {
  const result = await HANDLERS[q.tab](userId, q);
  return { ...result, page: q.page, pageSize: q.pageSize };
}

/** Các khoản ghi vào ví business của chính chủ sân theo tham chiếu. */
export async function listProviderLedgerForRefs(userId: string, refIds: string[]) {
  const wallet = await prisma.wallet.findFirst({ where: { userId, walletType: 'business' } });
  if (!wallet || !refIds.length) return [];
  const rows = await prisma.ledgerEntry.findMany({ where: { walletId: wallet.id, OR: [{ refId: { in: refIds } }, { id: { in: refIds } }] }, orderBy: { ts: 'asc' }, take: 50 });
  return rows.map((row) => ({ id: row.id, walletType: 'business' as const, userId, type: row.type, refType: row.refType, amount: n(row.amount), ts: row.ts }));
}
