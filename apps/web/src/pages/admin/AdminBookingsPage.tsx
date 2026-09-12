import { useEffect, useState } from 'react'
import { Badge, Button, EmptyState, Modal, SelectInput, TextArea, TextInput } from '../../components/ui'
import { cancelAdminBooking, getAdminBookings, type AdminBookingRow } from '../../lib/venueBookingApi'
import { formatDateTimeVi, formatMoneyVnd } from '../../lib/formatters.js'

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

  const load = async (nextPage = page) => {
    try {
      const result = await getAdminBookings({ ...filters, page: nextPage, pageSize })
      setRows(result.items)
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

  const cancel = async () => {
    if (!target || !reason.trim()) {
      setMessage('Nhập lý do lỗi nền tảng trước khi hủy.')
      return
    }

    try {
      await cancelAdminBooking(target.id, reason.trim())
      setTarget(null)
      setReason('')
      await load()
    } catch (cause) {
      setMessage((cause as Error).message)
    }
  }

  return (
    <>
      <h2 className="text-h1">Đặt sân toàn hệ thống</h2>
      <div className="mt-5 grid gap-2 md:grid-cols-5">
        <TextInput
          aria-label="Tìm booking"
          placeholder="Tên cơ sở hoặc sân"
          value={filters.query}
          onChange={(event) => setFilters({ ...filters, query: event.target.value })}
        />
        <SelectInput
          aria-label="Trạng thái booking"
          value={filters.status}
          onChange={(event) => setFilters({ ...filters, status: event.target.value })}
        >
          <option value="">Tất cả</option>
          <option value="held">Chờ thanh toán</option>
          <option value="confirmed">Đã xác nhận</option>
          <option value="completed">Đã hoàn thành</option>
          <option value="cancelled">Đã hủy</option>
        </SelectInput>
        <TextInput
          aria-label="Từ ngày booking"
          type="date"
          value={filters.from}
          onChange={(event) => setFilters({ ...filters, from: event.target.value })}
        />
        <TextInput
          aria-label="Đến ngày booking"
          type="date"
          value={filters.to}
          onChange={(event) => setFilters({ ...filters, to: event.target.value })}
        />
        <Button tone="secondary" onClick={() => void load(1)}>Lọc</Button>
      </div>

      {message && <p role="status" className="mt-3 rounded-xl bg-info-bg p-3">{message}</p>}

      <div className="mt-5 space-y-3">
        {rows.length ? rows.map((row) => (
          <article
            key={row.id}
            className="surface-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-bold">{row.court.venue.name} · {row.court.name}</p>
              <p className="mt-1 text-sm text-ink-700">{row.player.label}</p>
              <p className="text-sm text-ink-500">
                {formatDateTimeVi(row.startAt)} · {formatMoneyVnd(row.priceSnapshot)}
              </p>
              <Badge>{row.status === 'held' && row.matchDepositPaid ? 'Đã giữ chỗ · đã đặt cọc' : row.status}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button tone="secondary" onClick={() => setDetail(row)}>Xem chi tiết</Button>
              {row.status === 'confirmed' && <Button tone="danger" onClick={() => setTarget(row)}>Hủy do lỗi nền tảng</Button>}
            </div>
          </article>
        )) : (
          <EmptyState title="Không có booking" description="Thử đổi bộ lọc." />
        )}
      </div>
      {total > 0 && <nav className="mt-5 flex items-center justify-between gap-3" aria-label="Phân trang booking">
        <p className="text-sm text-ink-500">Hiển thị {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total} booking</p>
        <div className="flex gap-2">
          <Button tone="secondary" disabled={page === 1} onClick={() => void load(page - 1)}>Trước</Button>
          <Button tone="secondary" disabled={page * pageSize >= total} onClick={() => void load(page + 1)}>Sau</Button>
        </div>
      </nav>}

      <Modal open={Boolean(target)} title="Hủy booking do lỗi nền tảng" onClose={() => setTarget(null)}>
        <p className="text-sm text-ink-500">Booking sẽ được hủy và hoàn 100% theo luồng Admin.</p>
        <TextArea
          aria-label="Lý do hủy booking"
          className="mt-4"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <Button className="mt-4" tone="danger" onClick={() => void cancel()}>Xác nhận hủy</Button>
      </Modal>

      <Modal open={Boolean(detail)} title="Chi tiết booking" onClose={() => setDetail(null)}>
        {detail && <dl className="grid gap-3 text-sm">
          <div><dt className="text-ink-500">Người chơi</dt><dd className="font-semibold">{detail.player.label}</dd></div>
          <div><dt className="text-ink-500">Cơ sở · sân</dt><dd className="font-semibold">{detail.court.venue.name} · {detail.court.name}</dd></div>
          <div><dt className="text-ink-500">Địa chỉ</dt><dd>{detail.court.venue.address}</dd></div>
          <div><dt className="text-ink-500">Thời gian</dt><dd>{formatDateTimeVi(detail.startAt)} – {formatDateTimeVi(detail.endAt)}</dd></div>
          <div><dt className="text-ink-500">Giá trị booking</dt><dd>{formatMoneyVnd(detail.priceSnapshot)}</dd></div>
          <div><dt className="text-ink-500">Trạng thái</dt><dd>{detail.status === 'held' && detail.matchDepositPaid ? 'Đã giữ chỗ · đã đặt cọc' : detail.status}</dd></div>
          {detail.holdExpiresAt && <div><dt className="text-ink-500">Giữ chỗ đến</dt><dd>{formatDateTimeVi(detail.holdExpiresAt)}</dd></div>}
          <div><dt className="text-ink-500">Mã booking</dt><dd className="break-all text-xs">{detail.id}</dd></div>
        </dl>}
      </Modal>
    </>
  )
}
