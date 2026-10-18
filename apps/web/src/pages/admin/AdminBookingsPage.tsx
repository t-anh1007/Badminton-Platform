import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, Button, EmptyState, Pagination, SelectInput, TextArea, TextInput } from '../../components/ui'
import { Drawer, DetailList } from '../../components/Drawer'
import { Icon } from '../../components/Icon'
import { cancelAdminBooking, getAdminBookings, getOperationalShutdown, type AdminBookingRow, type OperationalShutdownScope, type OperationalShutdownStatus } from '../../lib/venueBookingApi'
import { formatDateTimeVi, formatMoneyVnd } from '../../lib/formatters.js'
import { useLiveDataRefresh } from '../../realtime/dataInvalidation.js'
import { OperationalShutdownDialog } from '../manage/OperationalShutdownDialog.js'

const bookingStatusLabel: Record<string, string> = { held: 'Chờ thanh toán', confirmed: 'Đã xác nhận', completed: 'Đã hoàn thành', cancelled: 'Đã hủy' }
const statusTone = (status: string) => status === 'completed' ? 'success' : status === 'cancelled' ? 'danger' : status === 'held' ? 'warning' : 'neutral'
const statusText = (row: AdminBookingRow) => row.status === 'held' && row.matchDepositPaid ? 'Đã giữ chỗ · đã đặt cọc' : bookingStatusLabel[row.status] ?? row.status

export function AdminBookingsPage() {
  const [rows, setRows] = useState<AdminBookingRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [filters, setFilters] = useState({ query: '', status: '', from: '', to: '' })
  const [target, setTarget] = useState<AdminBookingRow | null>(null)
  const [detail, setDetail] = useState<AdminBookingRow | null>(null)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [shutdownTarget, setShutdownTarget] = useState<{ scope: OperationalShutdownScope; id: string; label: string } | null>(null)
  const [shutdownStatus, setShutdownStatus] = useState<OperationalShutdownStatus | null>(null)
  // ?booking=… (link thông báo) mở drawer khi lượt đó có trong trang đang tải.
  const [params, setParams] = useSearchParams()

  const load = async (nextPage = page) => {
    try {
      const result = await getAdminBookings({ ...filters, page: nextPage, pageSize })
      setRows(result.items)
      const linked = params.get('booking')
      const match = linked ? result.items.find((item) => item.id === linked) : undefined
      if (match) setDetail(match)
      setTotal(result.total)
      setPage(result.page)
      setMessage('')
    } catch (cause) {
      setMessage((cause as Error).message)
    }
  }

  useEffect(() => {
    void load()
  }, [])
  useLiveDataRefresh(load)

  const cancel = async () => {
    if (!target || !reason.trim()) {
      setMessage('Nhập lý do lỗi nền tảng trước khi hủy.')
      return
    }

    try {
      await cancelAdminBooking(target.id, reason.trim())
      setTarget(null)
      setDetail(null)
      setReason('')
      await load()
    } catch (cause) {
      setMessage((cause as Error).message)
    }
  }

  const openShutdown = async (scope: OperationalShutdownScope, id: string, label: string) => {
    try {
      setShutdownStatus(await getOperationalShutdown(scope, id))
      setShutdownTarget({ scope, id, label })
      setDetail(null)
      setMessage('')
    } catch (cause) {
      setMessage((cause as Error).message)
    }
  }

  const th = 'px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-ink-500'
  const closeDetail = () => { setDetail(null); setTarget(null); setReason(''); if (params.get('booking')) setParams({}, { replace: true }) }
  return (
    <>
      <h1 className="text-h2">Đặt sân</h1>
      <p className="mt-1 text-sm text-ink-500">{total.toLocaleString('vi-VN')} lượt</p>
      <form className="mt-4 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void load(1) }}>
        <TextInput aria-label="Tìm lượt đặt sân" className="!w-auto min-w-56 flex-1" placeholder="Tên cơ sở hoặc sân" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} />
        <SelectInput aria-label="Trạng thái lượt đặt sân" className="!w-44" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
          <option value="">Mọi trạng thái</option><option value="held">Chờ thanh toán</option><option value="confirmed">Đã xác nhận</option><option value="completed">Đã hoàn thành</option><option value="cancelled">Đã hủy</option>
        </SelectInput>
        <TextInput aria-label="Từ ngày lượt đặt sân" className="!w-40" type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
        <TextInput aria-label="Đến ngày lượt đặt sân" className="!w-40" type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
        <Button type="submit" tone="secondary">Lọc</Button>
      </form>

      {message && <p role="status" className="mt-3 rounded-xl bg-canvas p-3 text-sm">{message}</p>}

      {rows.length ? <div className="surface-card mt-4 overflow-x-auto"><table className="w-full text-sm">
        <thead className="bg-canvas"><tr><th className={th}>Sân</th><th className={th}>Người chơi</th><th className={th}>Thời gian</th><th className={`${th} !text-right`}>Giá trị</th><th className={th}>Trạng thái</th><th className={th}><span className="sr-only">Chi tiết</span></th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id} className="cursor-pointer border-t border-line hover:bg-canvas" onClick={() => setDetail(row)}>
          <td className="px-4 py-3"><p className="font-semibold text-ink-900">{row.court.venue.name} · {row.court.name}</p><p className="text-figures text-xs text-ink-500">{row.businessCode}</p></td>
          <td className="px-4 py-3 text-ink-700">{row.player.label}</td>
          <td className="px-4 py-3 text-ink-700">{formatDateTimeVi(row.startAt)}</td>
          <td className="text-figures px-4 py-3 text-right font-bold text-ink-900">{formatMoneyVnd(row.priceSnapshot)}</td>
          <td className="px-4 py-3"><Badge tone={statusTone(row.status)}>{statusText(row)}</Badge></td>
          <td className="px-4 py-3 text-right"><button type="button" aria-label="Xem chi tiết" className="text-ink-500 hover:text-brand-navy"><Icon name="chevronRight" /></button></td>
        </tr>)}</tbody>
      </table></div> : <div className="mt-4"><EmptyState title="Không có lượt đặt sân" description="Thử đổi bộ lọc." /></div>}
      {total > pageSize && <div className="mt-4"><Pagination page={page} pageCount={Math.ceil(total / pageSize)} onChange={(next) => void load(next)} /></div>}

      <Drawer open={Boolean(detail)} label="Chi tiết lượt đặt sân" kicker={detail?.businessCode} title={detail ? `${detail.court.venue.name} · ${detail.court.name}` : ''} onClose={closeDetail}
        footer={detail && (target ? <div className="grid gap-2">
          <p className="font-bold text-ink-900">Hủy do lỗi nền tảng</p>
          <TextArea aria-label="Lý do hủy lượt đặt sân" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Lý do (bắt buộc)" />
          <p className="text-xs text-ink-500">Khách được hoàn 100% vào ví.</p>
          <div className="flex gap-2"><Button tone="secondary" size="sm" onClick={() => setTarget(null)}>Quay lại</Button><Button tone="danger" size="sm" className="flex-1" onClick={() => void cancel()}>Xác nhận hủy</Button></div>
        </div> : <div className="grid gap-3">
          {detail.status === 'confirmed' && <Button tone="secondary" className="text-danger" onClick={() => setTarget(detail)}>Hủy do lỗi nền tảng</Button>}
          <details className="text-sm"><summary className="cursor-pointer font-semibold text-ink-500">Ngừng hoạt động sân hoặc cơ sở</summary>
            <div className="mt-2 flex gap-2"><Button tone="ghost" size="sm" className="text-danger" onClick={() => void openShutdown('court', detail.court.id, detail.court.name)}>Ngừng hoạt động sân</Button><Button tone="ghost" size="sm" className="text-danger" onClick={() => void openShutdown('venue', detail.court.venue.id, detail.court.venue.name)}>Ngừng hoạt động cơ sở</Button></div>
          </details>
        </div>)}>
        {detail && <>
          <Badge tone={statusTone(detail.status)} className="w-fit">{statusText(detail)}</Badge>
          <DetailList items={[
            ['Thời gian', `${formatDateTimeVi(detail.startAt)} – ${formatDateTimeVi(detail.endAt)}`],
            ['Người chơi', detail.player.label],
            ['Địa chỉ', detail.court.venue.address],
            ['Giá trị', formatMoneyVnd(detail.priceSnapshot)],
            detail.holdExpiresAt ? ['Giữ chỗ đến', formatDateTimeVi(detail.holdExpiresAt)] : null,
          ]} />
        </>}
      </Drawer>

      {shutdownTarget && <OperationalShutdownDialog
        target={shutdownTarget}
        current={shutdownStatus}
        onClose={() => setShutdownTarget(null)}
        onDone={async () => { setShutdownTarget(null); await load(); }}
      />}
    </>
  )
}
