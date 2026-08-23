import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as venueApi from '../../lib/venueBookingApi.js'
import { ManagePricingPage } from './ManagePricingPage.js'
import { ManageSchedulePage } from './ManageSchedulePage.js'
import { ManageVenueDetailPage } from './ManageVenueDetailPage.js'
import { ManageVenuesPage } from './ManageVenuesPage.js'

vi.mock('../../lib/venueBookingApi.js', () => ({
  getMyManagedVenues: vi.fn(), createManagedVenue: vi.fn(), getMyManagedVenue: vi.fn(), updateManagedVenue: vi.fn(), deactivateManagedVenue: vi.fn(), activateManagedVenue: vi.fn(),
  addManagedCourt: vi.fn(), deactivateManagedCourt: vi.fn(), activateManagedCourt: vi.fn(), updateManagedCourt: vi.fn(), replaceOperatingHours: vi.fn(), saveOperatingHours: vi.fn(), addClosure: vi.fn(),
  savePricing: vi.fn(), saveBookingRule: vi.fn(),
  authorizeVenueImage: vi.fn(), uploadVenueImage: vi.fn(),
}))

// Leaflet không chạy trong jsdom → thay picker bằng nút đặt toạ độ cố định.
vi.mock('../../components/map/LocationPicker.js', () => ({
  LocationPicker: ({ onChange }: { onChange: (next: { lat: number; lng: number }) => void }) => (
    <button type="button" onClick={() => onChange({ lat: 10.7, lng: 106.6 })}>đặt vị trí</button>
  ),
}))

const venue = { id: 'v1', name: 'Sân A', address: '1 A', lat: 10.7, lng: 106.6, amenities: [], images: [], courts: [{ id: 'c1', name: 'Sân 1', active: true, images: [{ objectKey: 'venue/images/court.webp', url: 'https://cdn.test/court.webp' }], configuration: { operatingHours: 1, pricingRules: 1, bookingRule: true }, operatingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, openMinute: 480, closeMinute: 1320 })), closures: [], pricingRules: [{ version: 1, effectiveFrom: '2026-01-01T00:00:00.000Z', price: '100000' }], bookingRule: { stepMinutes: 30, minDurationMinutes: 60, maxDurationMinutes: 180 } }] }
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
  fireEvent.click(await screen.findByRole('button', { name: 'Thêm sân kinh doanh' }))
  fireEvent.change(screen.getByLabelText('Tên cơ sở'), { target: { value: 'Sân A' } }); fireEvent.change(screen.getByLabelText('Địa chỉ'), { target: { value: '1 A' } }); fireEvent.click(screen.getByRole('button', { name: 'đặt vị trí' })); fireEvent.change(screen.getByLabelText('Tiện ích'), { target: { value: 'wifi, bãi xe' } })
  fireEvent.change(screen.getByLabelText('Tên sân con mới'), { target: { value: 'Sân 1' } }); fireEvent.click(screen.getByRole('button', { name: '+ Thêm sân' }))
  fireEvent.change(screen.getByLabelText('Ảnh Sân 1 (bắt buộc 1–5 ảnh)'), { target: { files: [new File(['court'], 'court.webp', { type: 'image/webp' })] } })
  await waitFor(() => expect(screen.getByText('Đã tải')).toBeInTheDocument())
  expect(screen.getByLabelText('Giá mỗi giờ chung')).toHaveValue('100.000 VNĐ')
  expect(screen.queryByLabelText('Bước thời gian chung')).not.toBeInTheDocument()
  const save = screen.getByRole('button', { name: 'Lưu và hoàn tất cấu hình' }); fireEvent.click(save); fireEvent.click(save)
  expect(venueApi.createManagedVenue).toHaveBeenCalledTimes(1)
  expect(venueApi.createManagedVenue).toHaveBeenCalledWith({ name: 'Sân A', address: '1 A', lat: 10.7, lng: 106.6, amenities: ['wifi', 'bãi xe'], images: [] })
  expect(save).toBeDisabled(); resolve(venue); await waitFor(() => expect(screen.queryByRole('button', { name: 'Lưu và hoàn tất cấu hình' })).not.toBeInTheDocument())
  expect(venueApi.addManagedCourt).toHaveBeenCalledWith('v1', 'Sân 1', [{ objectKey: 'venue/images/court.webp' }])
  expect(venueApi.replaceOperatingHours).toHaveBeenCalledWith('c1', [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, openMinute: 480, closeMinute: 1320 })))
  expect(venueApi.savePricing).toHaveBeenCalled()
  expect(venueApi.saveBookingRule).toHaveBeenCalledWith('c1', { stepMinutes: 30, minDurationMinutes: 60, maxDurationMinutes: 840 })
})

it('keeps the edit form read-only until editing and confirms a change summary before saving', async () => {
  render(<MemoryRouter initialEntries={['/manage/venues/v1']}><Routes><Route path="/manage/venues/:venueId" element={<ManageVenueDetailPage />} /></Routes></MemoryRouter>)
  const name = await screen.findByLabelText('Tên cơ sở'); expect(name).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Sửa' })); expect(name).toBeEnabled()
  fireEvent.change(name, { target: { value: 'Sân B' } }); fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
  expect(screen.getByRole('dialog', { name: 'Xác nhận thay đổi' })).toHaveTextContent('Tên cơ sở')
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận lưu' }))
  await waitFor(() => expect(venueApi.updateManagedVenue).toHaveBeenCalledWith('v1', expect.objectContaining({ name: 'Sân B' })))
})

it('stores minute-backed operating hours and a valid dd/MM/yyyy closure', async () => {
  vi.mocked(venueApi.saveOperatingHours).mockResolvedValue({} as never); vi.mocked(venueApi.addClosure).mockResolvedValue({} as never)
  render(<MemoryRouter initialEntries={['/manage/venues/v1/schedule?courtId=c1']}><ManageSchedulePage /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Giờ mở'), { target: { value: '06:30' } }); fireEvent.change(screen.getByLabelText('Giờ đóng'), { target: { value: '22:00' } }); fireEvent.click(screen.getByRole('button', { name: 'Lưu giờ hoạt động' }))
  await waitFor(() => expect(venueApi.saveOperatingHours).toHaveBeenCalledWith('c1', { weekday: 1, openMinute: 390, closeMinute: 1320 }))
  fireEvent.change(screen.getByLabelText('Ngày đóng sân'), { target: { value: '31/02/2026' } }); fireEvent.click(screen.getByRole('button', { name: 'Thêm ngày đóng' })); expect(screen.getByRole('alert')).toHaveTextContent('ngày hợp lệ')
  fireEvent.change(screen.getByLabelText('Ngày đóng sân'), { target: { value: '15/08/2026' } }); fireEvent.click(screen.getByRole('button', { name: 'Thêm ngày đóng' })); await waitFor(() => expect(venueApi.addClosure).toHaveBeenCalledWith('c1', { date: '2026-08-15T00:00:00.000Z' }))
})

it('validates price windows and booking-rule step/min/max before submit', async () => {
  vi.mocked(venueApi.savePricing).mockResolvedValue({} as never); vi.mocked(venueApi.saveBookingRule).mockResolvedValue({} as never)
  render(<MemoryRouter initialEntries={['/manage/venues/v1/pricing?courtId=c1']}><ManagePricingPage /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Ngày hiệu lực'), { target: { value: '15/08/2026' } }); fireEvent.click(screen.getByRole('button', { name: 'Lưu bảng giá' })); await waitFor(() => expect(venueApi.savePricing).toHaveBeenCalledWith('c1', { effectiveFrom: '2026-08-15T00:00:00.000Z', rules: [{ weekday: 1, startMinute: 480, endMinute: 1320, price: 100000 }] }))
  fireEvent.change(screen.getByLabelText('Tối thiểu'), { target: { value: '50' } }); fireEvent.click(screen.getByRole('button', { name: 'Lưu quy tắc' })); expect(screen.getByRole('alert')).toHaveTextContent('chia hết')
  fireEvent.change(screen.getByLabelText('Tối thiểu'), { target: { value: '60' } }); fireEvent.click(screen.getByRole('button', { name: 'Lưu quy tắc' })); await waitFor(() => expect(venueApi.saveBookingRule).toHaveBeenCalledWith('c1', { stepMinutes: 30, minDurationMinutes: 60, maxDurationMinutes: 180 }))
})
