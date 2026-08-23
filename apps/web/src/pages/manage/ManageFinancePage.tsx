import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, EmptyState, SelectInput, Skeleton, SurfaceCard, Tabs, TextInput } from '../../components/ui'
import { MetricCard } from '../../components/courtin/MetricCard'
import { OperationsTable } from '../../components/courtin/OperationsTable'
import {
  cancelMyWithdrawal,
  createWithdrawal,
  getMyRevenue,
  getMyWithdrawals,
  getMyWallets,
  getWalletLedger,
  type RevenueRow,
  type WalletLedgerEntry,
  type WalletRow,
  type WithdrawalRow,
} from '../../lib/financeApi'
import { getMyManagedVenues, type ManagedVenue } from '../../lib/venueBookingApi'
import { formatDateTimeVi, formatMoneyVnd, parseDateFieldVi } from '../../lib/formatters.js'

const money = formatMoneyVnd
const MIN_WITHDRAWAL = 100_000n
const ACTIVE_STATUSES = new Set(['pending', 'partially_paid'])

const withdrawalStatus: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  pending: { label: 'Đang chờ duyệt', tone: 'warning' },
  partially_paid: { label: 'Đã chi một phần', tone: 'warning' },
  paid: { label: 'Đã chi', tone: 'success' },
  rejected: { label: 'Đã hủy / từ chối', tone: 'danger' },
}

const ledgerLabel: Record<string, string> = {
  release: 'Đáo hạn doanh thu',
  commission: 'Phí hoa hồng nền tảng',
  refund: 'Hoàn tiền tranh chấp',
  payout: 'Chi rút tiền',
  reserve: 'Giữ cho yêu cầu rút',
  settlement: 'Quyết toán',
  payment: 'Thanh toán',
  topup: 'Nạp ví',
}

const revenueTone = (row: RevenueRow) =>
  row.disputeOpen
    ? { tone: 'danger' as const, label: 'Hoãn do tranh chấp' }
    : row.releasedAt
      ? { tone: 'success' as const, label: 'Đã khả dụng' }
      : { tone: 'warning' as const, label: `Chờ đáo hạn · ${formatDateTimeVi(row.releaseAt)}` }

type TabKey = 'revenue' | 'ledger'

const vietnamDayBoundary = (date: string, boundary: 'start' | 'end') =>
  `${date}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}+07:00`

export function ManageFinancePage() {
  const [wallet, setWallet] = useState<WalletRow | null>(null)
  const [venues, setVenues] = useState<ManagedVenue[]>([])
  const [revenue, setRevenue] = useState<RevenueRow[]>([])
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([])
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([])
  const [tab, setTab] = useState<TabKey>('revenue')
  const [filters, setFilters] = useState({ venueId: '', from: '', to: '' })
  const [form, setForm] = useState({ amount: '', bankCode: '', bankAccountNumber: '', bankAccountName: '' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = async () => {
    const from = filters.from ? parseDateFieldVi(filters.from) : undefined
    const to = filters.to ? parseDateFieldVi(filters.to) : undefined
    if ((filters.from && !from) || (filters.to && !to)) {
      setError('Ngày phải theo định dạng dd/MM/yyyy.')
      return
    }
    try {
      const wallets = await getMyWallets()
      const business = wallets.find((row) => row.walletType === 'business') ?? null
      setWallet(business)
      const [nextVenues, nextRevenue, nextWithdrawals, nextLedger] = await Promise.all([
        getMyManagedVenues().catch(() => [] as ManagedVenue[]),
        getMyRevenue({
          ...filters,
          from: from ? vietnamDayBoundary(from, 'start') : '',
          to: to ? vietnamDayBoundary(to, 'end') : '',
        }),
        getMyWithdrawals(),
        business ? getWalletLedger(business.id).then((result) => result.entries).catch(() => []) : Promise.resolve([]),
      ])
      setVenues(nextVenues)
      setRevenue(nextRevenue)
      setWithdrawals(nextWithdrawals)
      setLedger(nextLedger)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải dữ liệu tài chính.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeWithdrawal = useMemo(
    () => withdrawals.find((row) => ACTIVE_STATUSES.has(row.status)),
    [withdrawals],
  )

  const filteredSummary = useMemo(() => {
    const net = revenue.reduce((total, row) => total + BigInt(row.net), 0n)
    return { count: revenue.length, net: net.toString() }
  }, [revenue])

  const available = wallet?.available ?? '0'

  const submit = async () => {
    if (busy) return
    if (activeWithdrawal) {
      setMessage('')
      setError('Đang có một yêu cầu rút chưa hoàn tất. Hãy chờ xử lý xong hoặc hủy yêu cầu đó trước.')
      return
    }
    const trimmed = {
      amount: form.amount.trim(),
      bankCode: form.bankCode.trim(),
      bankAccountNumber: form.bankAccountNumber.trim(),
      bankAccountName: form.bankAccountName.trim(),
    }
    if (!/^\d+$/.test(trimmed.amount) || Object.values(trimmed).some((value) => !value)) {
      setError('Nhập đủ số tiền và thông tin ngân hàng hợp lệ.')
      return
    }
    if (BigInt(trimmed.amount) < MIN_WITHDRAWAL) {
      setError(`Số tiền rút tối thiểu là ${money(MIN_WITHDRAWAL)}.`)
      return
    }
    if (BigInt(trimmed.amount) > BigInt(available)) {
      setError('Số tiền rút vượt quá số dư khả dụng.')
      return
    }
    setBusy(true)
    try {
      const request = await createWithdrawal(trimmed)
      setForm({ amount: '', bankCode: '', bankAccountNumber: '', bankAccountName: '' })
      setError('')
      setMessage(`Đã tạo yêu cầu rút ${request.transferCode}. Tiền đã được giữ chờ chi.`)
      await load()
    } catch (cause) {
      setMessage('')
      setError(cause instanceof Error ? cause.message : 'Không thể tạo yêu cầu rút.')
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (id: string) => {
    if (busy) return
    setBusy(true)
    try {
      await cancelMyWithdrawal(id)
      setMessage('Đã hủy yêu cầu rút. Tiền được trả về số dư khả dụng.')
      setError('')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể hủy yêu cầu.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="grid gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-48" />
      </div>
    )
  }

  if (!wallet) {
    return (
      <EmptyState
        title="Chưa có ví kinh doanh"
        description="Ví kinh doanh sẽ được tạo sau khi cơ sở của bạn được duyệt. Doanh thu từ các booking sẽ hiển thị tại đây."
      />
    )
  }

  return (
    <div className="grid gap-6">
      <header>
        <h2 className="text-h2">Doanh thu &amp; rút tiền</h2>
        <p className="mt-1 text-sm text-ink-500">
          Doanh thu mỗi booking được giữ 24 giờ sau khi kết thúc rồi mới chuyển sang số dư khả dụng. Nền tảng thu hoa hồng 10% trên mỗi booking.
        </p>
      </header>

      <section aria-label="Tổng quan số dư" className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Có thể rút"
          value={money(available)}
          tone="navy"
          detail="Số dư khả dụng để tạo yêu cầu rút."
        />
        <MetricCard
          label="Đang chờ 24 giờ"
          value={money(wallet.pending)}
          detail="Doanh thu chưa tới hạn đáo hạn."
        />
        <MetricCard
          label="Đang giữ cho yêu cầu rút"
          value={money(wallet.reserved)}
          tone="yellow"
          detail="Đã trừ khỏi số dư, chờ chi hoặc hoàn khi hủy."
        />
      </section>

      <SurfaceCard>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-h3">Yêu cầu rút tiền</h3>
          <span className="text-sm text-ink-500">
            Khả dụng: <strong className="text-figures text-ink-900">{money(available)}</strong>
          </span>
        </div>

        {activeWithdrawal ? (
          <p className="mt-3 rounded-xl bg-warning-bg px-4 py-3 text-sm text-warning" role="status">
            Đang có yêu cầu rút <strong>{activeWithdrawal.transferCode}</strong> ({money(activeWithdrawal.amount)}) chưa hoàn tất.
            Bạn chỉ có thể tạo yêu cầu mới sau khi yêu cầu này được chi xong hoặc bị hủy.
          </p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <label htmlFor="wd-amount" className="text-sm font-medium text-ink-700">
                Số tiền rút
              </label>
              <div className="flex gap-2">
                <TextInput
                  id="wd-amount"
                  aria-label="Số tiền rút"
                  inputMode="numeric"
                  placeholder={`Tối thiểu ${money(MIN_WITHDRAWAL)}`}
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value.replace(/\D/g, '') })}
                />
                <Button
                  tone="secondary"
                  size="sm"
                  disabled={busy || available === '0'}
                  onClick={() => setForm({ ...form, amount: available })}
                >
                  Rút toàn bộ
                </Button>
              </div>
            </div>
            <div className="grid gap-1">
              <label htmlFor="wd-bank" className="text-sm font-medium text-ink-700">
                Mã ngân hàng
              </label>
              <TextInput
                id="wd-bank"
                aria-label="Mã ngân hàng"
                placeholder="VD: VCB, TCB, MB"
                value={form.bankCode}
                onChange={(event) => setForm({ ...form, bankCode: event.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <label htmlFor="wd-number" className="text-sm font-medium text-ink-700">
                Số tài khoản nhận
              </label>
              <TextInput
                id="wd-number"
                aria-label="Số tài khoản nhận"
                inputMode="numeric"
                value={form.bankAccountNumber}
                onChange={(event) => setForm({ ...form, bankAccountNumber: event.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <label htmlFor="wd-name" className="text-sm font-medium text-ink-700">
                Tên chủ tài khoản
              </label>
              <TextInput
                id="wd-name"
                aria-label="Tên chủ tài khoản"
                value={form.bankAccountName}
                onChange={(event) => setForm({ ...form, bankAccountName: event.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Button disabled={busy} onClick={() => void submit()}>
                Gửi yêu cầu rút
              </Button>
            </div>
          </div>
        )}

        {withdrawals.length > 0 && (
          <div className="mt-5">
            <h4 className="text-caption mb-2 text-ink-500">Lịch sử rút tiền</h4>
            <ul className="grid gap-2">
              {withdrawals.map((row) => {
                const status = withdrawalStatus[row.status] ?? { label: row.status, tone: 'neutral' as const }
                return (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-canvas px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-figures font-medium text-ink-900">{money(row.amount)}</p>
                      <p className="text-caption text-ink-500">
                        {row.transferCode} · {row.bankCode} · {row.bankAccountNumber}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone={status.tone}>{status.label}</Badge>
                      {row.status === 'pending' && (
                        <Button tone="ghost" size="sm" disabled={busy} onClick={() => void cancel(row.id)}>
                          Hủy yêu cầu
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </SurfaceCard>

      <Tabs
        tabs={[
          { value: 'revenue', label: 'Doanh thu theo booking' },
          { value: 'ledger', label: 'Lịch sử giao dịch ví' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'revenue' ? (
        <section className="grid gap-3" aria-label="Doanh thu theo booking">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <label htmlFor="filter-venue" className="text-caption text-ink-500">
                Cơ sở
              </label>
              <SelectInput
                id="filter-venue"
                aria-label="Lọc cơ sở"
                value={filters.venueId}
                onChange={(event) => setFilters({ ...filters, venueId: event.target.value })}
              >
                <option value="">Tất cả cơ sở</option>
                {venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                  </option>
                ))}
              </SelectInput>
            </div>
            <div className="grid gap-1">
              <label htmlFor="filter-from" className="text-caption text-ink-500">
                Từ ngày
              </label>
              <TextInput
                id="filter-from"
                aria-label="Từ ngày"
                inputMode="numeric"
                placeholder="dd/MM/yyyy"
                value={filters.from}
                onChange={(event) => setFilters({ ...filters, from: event.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <label htmlFor="filter-to" className="text-caption text-ink-500">
                Đến ngày
              </label>
              <TextInput
                id="filter-to"
                aria-label="Đến ngày"
                inputMode="numeric"
                placeholder="dd/MM/yyyy"
                value={filters.to}
                onChange={(event) => setFilters({ ...filters, to: event.target.value })}
              />
            </div>
            <Button size="sm" disabled={busy} onClick={() => void load()}>
              Lọc doanh thu
            </Button>
          </div>

          {revenue.length === 0 ? (
            <EmptyState
              title="Chưa có doanh thu"
              description="Không có booking nào khớp bộ lọc hiện tại. Doanh thu sẽ xuất hiện sau khi có booking hoàn tất."
            />
          ) : (
            <>
              <OperationsTable
                caption="Doanh thu theo booking"
                columns={['Booking', 'Gộp', 'Đã hoàn', 'Hoa hồng', 'Ròng', 'Trạng thái']}
              >
                {revenue.map((row) => {
                  const refund = BigInt(row.gross) - BigInt(row.net) - BigInt(row.commission)
                  const status = revenueTone(row)
                  return (
                    <tr key={row.bookingId} className="text-ink-700">
                      <td className="px-5 py-3 font-mono text-xs">{row.bookingId.slice(0, 8)}</td>
                      <td className="px-5 py-3 text-figures">{money(row.gross)}</td>
                      <td className="px-5 py-3 text-figures">{refund > 0n ? money(refund) : '—'}</td>
                      <td className="px-5 py-3 text-figures">{money(row.commission)}</td>
                      <td className="px-5 py-3 text-figures font-medium text-ink-900">{money(row.net)}</td>
                      <td className="px-5 py-3">
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </td>
                    </tr>
                  )
                })}
              </OperationsTable>
              <p className="text-sm text-ink-500">
                {filteredSummary.count} booking · Tổng ròng:{' '}
                <strong className="text-figures text-ink-900">{money(filteredSummary.net)}</strong>
              </p>
            </>
          )}
        </section>
      ) : (
        <section aria-label="Lịch sử giao dịch ví">
          {ledger.length === 0 ? (
            <EmptyState
              title="Chưa có giao dịch"
              description="Các bút toán trên ví kinh doanh (đáo hạn doanh thu, hoa hồng, chi rút tiền…) sẽ hiển thị tại đây."
            />
          ) : (
            <OperationsTable
              caption="Lịch sử giao dịch ví"
              columns={['Thời gian', 'Loại', 'Nội dung', 'Số tiền', 'Số dư sau']}
            >
              {ledger.map((entry) => {
                const amount = BigInt(entry.amount)
                return (
                  <tr key={entry.id} className="text-ink-700">
                    <td className="px-5 py-3 whitespace-nowrap">{formatDateTimeVi(entry.ts)}</td>
                    <td className="px-5 py-3">{ledgerLabel[entry.type] ?? entry.type}</td>
                    <td className="px-5 py-3">
                      {entry.referenceSummary?.title ?? '—'}
                      {entry.referenceSummary?.subtitle && (
                        <span className="block text-caption text-ink-500">{entry.referenceSummary.subtitle}</span>
                      )}
                    </td>
                    <td className={`px-5 py-3 text-figures font-medium ${amount < 0n ? 'text-danger' : 'text-success'}`}>
                      {amount > 0n ? '+' : ''}
                      {money(amount)}
                    </td>
                    <td className="px-5 py-3 text-figures">{money(entry.after)}</td>
                  </tr>
                )
              })}
            </OperationsTable>
          )}
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      {message && !error && (
        <p role="status" className="rounded-xl bg-success-bg px-4 py-3 text-sm text-success">
          {message}
        </p>
      )}
    </div>
  )
}
