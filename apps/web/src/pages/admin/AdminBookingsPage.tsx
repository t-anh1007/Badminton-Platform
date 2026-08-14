import { useEffect, useState } from 'react'
import { Badge, Button, EmptyState, Modal, SelectInput, TextArea, TextInput } from '../../components/ui'
import { cancelAdminBooking, getAdminBookings, type AdminBookingRow } from '../../lib/venueBookingApi'
import { parseDateFieldVi } from '../../lib/formatters.js'

export function AdminBookingsPage() {
  const [rows, setRows] = useState<AdminBookingRow[]>([])
  const [filters, setFilters] = useState({ query: '', status: '', from: '', to: '' })
  const [target, setTarget] = useState<AdminBookingRow | null>(null)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')

  const load = async () => {
    const from = filters.from ? parseDateFieldVi(filters.from) : undefined
    const to = filters.to ? parseDateFieldVi(filters.to) : undefined
    if ((filters.from && !from) || (filters.to && !to)) { setMessage('Ngày phải theo định dạng dd/MM/yyyy.'); return }
    try {
      setRows(await getAdminBookings({ ...filters, from: from ?? '', to: to ?? '' }))
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
          <option value="cancelled">Đã hủy</option>
        </SelectInput>
        <TextInput
          aria-label="Từ ngày booking"
          inputMode="numeric"
          placeholder="dd/MM/yyyy"
          value={filters.from}
          onChange={(event) => setFilters({ ...filters, from: event.target.value })}
        />
        <TextInput
          aria-label="Đến ngày booking"
          inputMode="numeric"
          placeholder="dd/MM/yyyy"
          value={filters.to}
          onChange={(event) => setFilters({ ...filters, to: event.target.value })}
        />
        <Button tone="secondary" onClick={() => void load()}>Lọc</Button>
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
                {new Date(row.startAt).toLocaleString('vi-VN')} · {Number(row.priceSnapshot).toLocaleString('vi-VN')}đ
              </p>
              <Badge>{row.status}</Badge>
            </div>
            {row.status !== 'cancelled' && (
              <Button tone="danger" onClick={() => setTarget(row)}>Hủy do lỗi nền tảng</Button>
            )}
          </article>
        )) : (
          <EmptyState title="Không có booking" description="Thử đổi bộ lọc." />
        )}
      </div>

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
    </>
  )
}
