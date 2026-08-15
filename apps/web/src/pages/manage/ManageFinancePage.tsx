import { useEffect, useState } from 'react'
import { Button } from '../../components/ui'
import {
  cancelMyWithdrawal,
  createWithdrawal,
  getMyRevenue,
  getMyWithdrawals,
  type RevenueRow,
  type WithdrawalRow,
} from '../../lib/financeApi'
import { formatMoneyVnd, parseDateFieldVi } from '../../lib/formatters.js'

const sumNet = (rows: RevenueRow[]) => rows.reduce((total, row) => total + BigInt(row.net), 0n).toString()
const money = formatMoneyVnd

export function ManageFinancePage() {
  const [revenue, setRevenue] = useState<RevenueRow[]>([])
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([])
  const [filters, setFilters] = useState({ venueId: '', from: '', to: '' })
  const [form, setForm] = useState({ amount: '', bankCode: '', bankAccountNumber: '', bankAccountName: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const from = filters.from ? parseDateFieldVi(filters.from) : undefined
    const to = filters.to ? parseDateFieldVi(filters.to) : undefined
    if ((filters.from && !from) || (filters.to && !to)) { setError('Ngày phải theo định dạng dd/MM/yyyy.'); return }
    try {
      const [nextRevenue, nextWithdrawals] = await Promise.all([getMyRevenue({ ...filters, from: from ?? '', to: to ?? '' }), getMyWithdrawals()])
      setRevenue(nextRevenue)
      setWithdrawals(nextWithdrawals)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải doanh thu.')
    }
  }

  useEffect(() => { void load() }, [])

  const submit = async () => {
    if (busy || !/^\d+$/.test(form.amount) || Object.values(form).some((value) => !value.trim())) {
      setError('Nhập đủ số tiền và thông tin ngân hàng hợp lệ.')
      return
    }
    setBusy(true)
    try {
      await createWithdrawal(form)
      await load()
    } catch (cause) {
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
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể hủy yêu cầu.')
    } finally {
      setBusy(false)
    }
  }

  const pending = sumNet(revenue.filter((row) => !row.releasedAt && !row.disputeOpen))
  const available = sumNet(revenue.filter((row) => Boolean(row.releasedAt) && !row.disputeOpen))
  const reserved = sumNet(revenue.filter((row) => row.disputeOpen))

  return <section className="grid gap-3"><h2 className="text-h2">Doanh thu và rút tiền</h2><div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><p>Đang chờ 24 giờ: <strong>{money(pending)}</strong></p><p>Có thể rút: <strong>{money(available)}</strong></p><p>Đang dự trữ tranh chấp: <strong>{money(reserved)}</strong></p></div><input aria-label="Lọc cơ sở" value={filters.venueId} onChange={(event) => setFilters({ ...filters, venueId: event.target.value })} /><input inputMode="numeric" placeholder="dd/MM/yyyy" aria-label="Từ ngày" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /><input inputMode="numeric" placeholder="dd/MM/yyyy" aria-label="Đến ngày" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /><Button disabled={busy} onClick={() => void load()}>Lọc doanh thu</Button>{(['amount', 'bankCode', 'bankAccountNumber', 'bankAccountName'] as const).map((key) => <input key={key} aria-label={key} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />)}<Button disabled={busy} onClick={() => void submit()}>Gửi yêu cầu rút</Button>{withdrawals.filter((row) => row.status === 'pending').map((row) => <div key={row.id}>{money(row.amount)}<Button disabled={busy} size="sm" onClick={() => void cancel(row.id)}>Hủy yêu cầu</Button></div>)}{error && <p role="alert">{error}</p>}</section>
}
