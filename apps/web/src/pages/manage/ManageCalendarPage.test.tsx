import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => cleanup())
import { ManageCalendarPage } from './ManageCalendarPage.js'
import { getVenueCalendar } from '../../lib/venueBookingApi.js'

vi.mock('../../lib/venueBookingApi.js', () => ({
  getMyManagedVenues: vi.fn().mockResolvedValue([{ id: 'v', name: 'Sân A', courts: [{ id: 'c' }, { id: 'c2' }] }]),
  getVenueCalendar: vi.fn().mockResolvedValue({
    courts: [{ id: 'c', name: 'Sân 1' }, { id: 'c2', name: 'Sân 2' }],
    entries: [{ id: 'b', courtId: 'c', kind: 'booking', startAt: '2026-08-15T08:00:00Z', endAt: '2026-08-15T09:00:00Z' }],
  }),
}))

it('hiển thị lịch xem-only theo sân con, không còn form tạo booking vãng lai', async () => {
  render(<ManageCalendarPage />)
  await waitFor(() => expect(getVenueCalendar).toHaveBeenCalledWith('v', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)))
  expect((await screen.findAllByText('Sân 1')).length).toBeGreaterThan(0)
  expect(screen.getAllByText('Sân 2').length).toBeGreaterThan(0)
  expect(screen.getByText('Đã đặt')).toBeInTheDocument()
  expect(screen.queryByLabelText('Tên khách')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /tạo booking/i })).not.toBeInTheDocument()
})

it('click block mở drawer chi tiết booking', async () => {
  render(<ManageCalendarPage />)
  const block = await screen.findByText('Đã đặt')
  fireEvent.click(block)
  expect(await screen.findByRole('dialog', { name: /chi tiết booking/i })).toBeInTheDocument()
})

it('chuyển sang chế độ Tuần sẽ tải 7 ngày', async () => {
  const mock = vi.mocked(getVenueCalendar)
  mock.mockClear()
  const { getByRole } = render(<ManageCalendarPage />)
  await waitFor(() => expect(mock).toHaveBeenCalled())
  mock.mockClear()
  fireEvent.click(getByRole('button', { name: 'Tuần' }))
  await waitFor(() => expect(mock).toHaveBeenCalledTimes(7))
})
