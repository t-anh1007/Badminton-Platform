import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as venueApi from '../../lib/venueBookingApi.js'
import { ManagePricingPage } from './ManagePricingPage.js'
import { ManageSchedulePage } from './ManageSchedulePage.js'
import { ManageVenueDetailPage } from './ManageVenueDetailPage.js'
import { ManageVenuesPage } from './ManageVenuesPage.js'

vi.mock('../../lib/venueBookingApi.js', () => ({
  getMyManagedVenues: vi.fn(), createManagedVenue: vi.fn(), getMyManagedVenue: vi.fn(), updateManagedVenue: vi.fn(),
  addManagedCourt: vi.fn(), deactivateManagedCourt: vi.fn(), saveOperatingHours: vi.fn(), addClosure: vi.fn(),
  savePricing: vi.fn(), saveBookingRule: vi.fn(),
}))

const venue = { id: 'v1', name: 'Sân A', address: '1 A', lat: 10.7, lng: 106.6, amenities: [], images: [], courts: [{ id: 'c1', name: 'Sân 1', active: true, configuration: { operatingHours: 1, pricingRules: 1, bookingRule: true }, operatingHours: [], closures: [], pricingRules: [], bookingRule: { stepMinutes: 30, minDurationMinutes: 60, maxDurationMinutes: 180 } }] }
afterEach(cleanup)
beforeEach(() => { vi.clearAllMocks(); vi.mocked(venueApi.getMyManagedVenues).mockResolvedValue([]); vi.mocked(venueApi.getMyManagedVenue).mockResolvedValue(venue) })

it('exposes the empty CTA, maps every create field and prevents duplicate submit', async () => {
  let resolve!: () => void
  vi.mocked(venueApi.createManagedVenue).mockReturnValue(new Promise<void>((done) => { resolve = done }) as never)
  render(<MemoryRouter><ManageVenuesPage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Thêm sân kinh doanh' }))
  fireEvent.change(screen.getByLabelText('Tên cơ sở'), { target: { value: 'Sân A' } }); fireEvent.change(screen.getByLabelText('Địa chỉ'), { target: { value: '1 A' } }); fireEvent.change(screen.getByLabelText('Vĩ độ'), { target: { value: '10.7' } }); fireEvent.change(screen.getByLabelText('Kinh độ'), { target: { value: '106.6' } }); fireEvent.change(screen.getByLabelText('Tiện ích'), { target: { value: 'wifi, bãi xe' } })
  const save = screen.getByRole('button', { name: 'Lưu cơ sở' }); fireEvent.click(save); fireEvent.click(save)
  expect(venueApi.createManagedVenue).toHaveBeenCalledTimes(1)
  expect(venueApi.createManagedVenue).toHaveBeenCalledWith({ name: 'Sân A', address: '1 A', lat: 10.7, lng: 106.6, amenities: ['wifi', 'bãi xe'], images: [] })
  expect(save).toBeDisabled(); resolve(); await waitFor(() => expect(screen.queryByRole('button', { name: 'Lưu cơ sở' })).not.toBeInTheDocument())
})

it('adds a court and exposes backend conflicts when deactivation is rejected', async () => {
  vi.mocked(venueApi.addManagedCourt).mockResolvedValue({} as never); vi.mocked(venueApi.deactivateManagedCourt).mockRejectedValue(new Error('Còn 2 booking xung đột')); vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<MemoryRouter initialEntries={['/manage/venues/v1']}><Routes><Route path="/manage/venues/:venueId" element={<ManageVenueDetailPage />} /></Routes></MemoryRouter>)
  fireEvent.change(await screen.findByLabelText('Tên sân con'), { target: { value: 'Sân 2' } }); fireEvent.click(screen.getByRole('button', { name: 'Thêm sân con' }))
  await waitFor(() => expect(venueApi.addManagedCourt).toHaveBeenCalledWith('v1', 'Sân 2'))
  fireEvent.click(screen.getByRole('button', { name: 'Ngưng hoạt động' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Còn 2 booking xung đột')
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
