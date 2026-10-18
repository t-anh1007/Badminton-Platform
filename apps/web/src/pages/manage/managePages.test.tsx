import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as venueApi from '../../lib/venueBookingApi.js'
import { ManageVenueDetailPage } from './ManageVenueDetailPage.js'
import { ManageVenuesPage } from './ManageVenuesPage.js'

vi.mock('../../lib/venueBookingApi.js', () => ({
  getMyManagedVenues: vi.fn(), createManagedVenue: vi.fn(), getMyManagedVenue: vi.fn(), updateManagedVenue: vi.fn(), deactivateManagedVenue: vi.fn(), activateManagedVenue: vi.fn(),
  addManagedCourt: vi.fn(), deactivateManagedCourt: vi.fn(), activateManagedCourt: vi.fn(), updateManagedCourt: vi.fn(), replaceOperatingHours: vi.fn(), saveOperatingHours: vi.fn(), addClosure: vi.fn(), removeClosure: vi.fn(),
  savePricing: vi.fn(), saveBookingRule: vi.fn(),
  getOperationalShutdown: vi.fn().mockResolvedValue(null), reactivateOperationalShutdown: vi.fn(),
  authorizeVenueImage: vi.fn(), uploadVenueImage: vi.fn(),
}))

// Leaflet không chạy trong jsdom → thay picker bằng nút đặt toạ độ cố định.
vi.mock('../../components/map/LocationPicker.js', () => ({
  LocationPicker: ({ onChange }: { onChange: (next: { lat: number; lng: number }) => void }) => (
    <button type="button" onClick={() => onChange({ lat: 10.7, lng: 106.6 })}>đặt vị trí</button>
  ),
}))

const venue = { id: 'v1', name: 'Sân A', address: '1 A', provinceCode: 'ho-chi-minh', lat: 10.7, lng: 106.6, amenities: [], images: [], courts: [{ id: 'c1', name: 'Sân 1', active: true, images: [{ objectKey: 'venue/images/court.webp', url: 'https://cdn.test/court.webp' }], configuration: { operatingHours: 1, pricingRules: 1, bookingRule: true }, operatingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ id: `oh-${weekday}`, weekday, openMinute: 480, closeMinute: 1320 })), closures: [], pricingRules: [{ id: 'pr1', weekday: 0, startMinute: 480, endMinute: 1320, price: '100000', version: 1, effectiveFrom: '2026-01-01T00:00:00.000Z' }], bookingRule: { stepMinutes: 30, minDurationMinutes: 60, maxDurationMinutes: 180 } }] }
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(venueApi.getMyManagedVenues).mockResolvedValue([])
  vi.mocked(venueApi.getMyManagedVenue).mockResolvedValue(venue)
  vi.mocked(venueApi.updateManagedVenue).mockResolvedValue(venue as never)
  vi.mocked(venueApi.addManagedCourt).mockResolvedValue(venue.courts[0] as never)
  vi.mocked(venueApi.saveOperatingHours).mockResolvedValue({} as never)
  vi.mocked(venueApi.savePricing).mockResolvedValue({} as never)
  vi.mocked(venueApi.saveBookingRule).mockResolvedValue({} as never)
  vi.mocked(venueApi.authorizeVenueImage).mockResolvedValue({ objectKey: 'venue/images/court.webp', uploadUrl: 'https://storage.test/put', headers: {}, expiresAt: 'x' })
  vi.mocked(venueApi.uploadVenueImage).mockResolvedValue(undefined)
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:court'), revokeObjectURL: vi.fn() })
})

it('exposes the empty CTA, maps every create field and prevents duplicate submit', async () => {
  let resolve!: (value: typeof venue) => void
  vi.mocked(venueApi.createManagedVenue).mockReturnValue(new Promise<typeof venue>((done) => { resolve = done }) as never)
  render(<MemoryRouter><ManageVenuesPage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Thêm cơ sở' }))
  fireEvent.change(screen.getByLabelText('Tên cơ sở'), { target: { value: 'Sân A' } }); fireEvent.change(screen.getByLabelText('Địa chỉ'), { target: { value: '1 A' } }); fireEvent.change(screen.getByLabelText('Tỉnh/thành'), { target: { value: 'ho-chi-minh' } }); fireEvent.click(screen.getByRole('button', { name: 'đặt vị trí' })); fireEvent.change(screen.getByLabelText('Tiện ích'), { target: { value: 'wifi, bãi xe' } })
  fireEvent.change(screen.getByLabelText('Tên sân con mới'), { target: { value: 'Sân 1' } }); fireEvent.click(screen.getByRole('button', { name: '+ Thêm sân' }))
  fireEvent.change(screen.getByLabelText('Ảnh Sân 1 (bắt buộc 1–5 ảnh)'), { target: { files: [new File(['court'], 'court.webp', { type: 'image/webp' })] } })
  await waitFor(() => expect(screen.getByText('Đã tải')).toBeInTheDocument())
  expect(screen.getByLabelText('Giá mỗi giờ chung')).toHaveValue('100.000 VNĐ')
  expect(screen.queryByLabelText('Bước thời gian chung')).not.toBeInTheDocument()
  const save = screen.getByRole('button', { name: 'Tạo cơ sở' }); fireEvent.click(save); fireEvent.click(save)
  expect(venueApi.createManagedVenue).toHaveBeenCalledTimes(1)
  expect(venueApi.createManagedVenue).toHaveBeenCalledWith({ name: 'Sân A', address: '1 A', provinceCode: 'ho-chi-minh', lat: 10.7, lng: 106.6, amenities: ['wifi', 'bãi xe'], images: [] })
  expect(save).toBeDisabled(); resolve(venue); await waitFor(() => expect(screen.queryByRole('button', { name: 'Tạo cơ sở' })).not.toBeInTheDocument())
  expect(venueApi.addManagedCourt).toHaveBeenCalledWith('v1', 'Sân 1', [{ objectKey: 'venue/images/court.webp' }])
  expect(venueApi.replaceOperatingHours).toHaveBeenCalledWith('c1', [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, openMinute: 480, closeMinute: 1320 })))
  expect(venueApi.savePricing).toHaveBeenCalled()
  expect(venueApi.saveBookingRule).toHaveBeenCalledWith('c1', { stepMinutes: 30, minDurationMinutes: 60, maxDurationMinutes: 840 })
})

it('shows a summary until Sửa, then confirms a change list before saving', async () => {
  render(<MemoryRouter initialEntries={['/manage/venues/v1']}><Routes><Route path="/manage/venues/:venueId" element={<ManageVenueDetailPage />} /></Routes></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Sửa' })); const name = screen.getByLabelText('Tên cơ sở')
  fireEvent.change(name, { target: { value: 'Sân B' } }); fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
  expect(screen.getByRole('dialog', { name: 'Xác nhận thay đổi' })).toHaveTextContent('Tên cơ sở')
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận lưu' }))
  await waitFor(() => expect(venueApi.updateManagedVenue).toHaveBeenCalledWith('v1', expect.objectContaining({ name: 'Sân B' })))
})

it('locks a time range and reopens an upcoming closure from the court menu', async () => {
  const closure = { id: 'cl1', date: '2999-01-02T00:00:00.000Z', startMinute: 480, endMinute: 600, reason: 'Bảo trì' }
  vi.mocked(venueApi.getMyManagedVenue).mockResolvedValue({ ...venue, courts: [{ ...venue.courts[0], closures: [closure, { ...closure, id: 'old', date: '2000-01-01T00:00:00.000Z' }] }] })
  vi.mocked(venueApi.addClosure).mockResolvedValue({} as never); vi.mocked(venueApi.removeClosure).mockResolvedValue(undefined)
  render(<MemoryRouter initialEntries={['/manage/venues/v1']}><Routes><Route path="/manage/venues/:venueId" element={<ManageVenueDetailPage />} /></Routes></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Tùy chọn Sân 1' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Khóa lịch' }))
  expect(await screen.findByText(/02\/01\/2999 · 08:00–10:00/)).toBeInTheDocument()
  expect(screen.queryByText(/01\/01\/2000/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Thêm khóa lịch' })); expect(screen.getByRole('alert')).toHaveTextContent('Chọn ngày khóa hợp lệ')
  fireEvent.click(screen.getByLabelText('Theo khung giờ'))
  fireEvent.change(screen.getByLabelText('Khóa từ'), { target: { value: '14:00' } }); fireEvent.change(screen.getByLabelText('Khóa đến'), { target: { value: '16:30' } })
  fireEvent.change(screen.getByLabelText('Ngày khóa lịch'), { target: { value: '2999-08-15' } }); fireEvent.click(screen.getByRole('button', { name: 'Thêm khóa lịch' }))
  await waitFor(() => expect(venueApi.addClosure).toHaveBeenCalledWith('c1', { date: '2999-08-15T00:00:00.000Z', startMinute: 840, endMinute: 990 }))
  fireEvent.click(screen.getByRole('button', { name: 'Mở lại' }))
  await waitFor(() => expect(venueApi.removeClosure).toHaveBeenCalledWith('c1', 'cl1'))
})
