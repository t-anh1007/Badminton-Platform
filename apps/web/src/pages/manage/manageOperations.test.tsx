import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ManageCalendarPage } from './ManageCalendarPage.js'
import { cancelInternalBooking, createInternalBooking, getMyManagedVenues, getVenueCalendar } from '../../lib/venueBookingApi.js'

vi.mock('../../lib/venueBookingApi.js', () => ({
  getMyManagedVenues: vi.fn().mockResolvedValue([{ id: 'v1', name: 'Sân A', courts: [{ id: 'c1', name: 'Sân 1' }] }]),
  getVenueCalendar: vi.fn().mockResolvedValue({ entries: [{ id: 'b1', courtId: 'c1', kind: 'booking', startAt: '2026-08-15T08:00:00Z', endAt: '2026-08-15T09:00:00Z' }] }),
  createInternalBooking: vi.fn().mockResolvedValue({}), cancelInternalBooking: vi.fn().mockResolvedValue({}),
}))
it('loads a venue date, creates a walk-in once, and cancels an owner-context entry', async () => {
  render(<ManageCalendarPage />)
  const date = await screen.findByLabelText(/ngày lịch/i); fireEvent.change(date, { target: { value: '15/08/2026' } }); fireEvent.blur(date)
  await waitFor(() => expect(getVenueCalendar).toHaveBeenCalledWith('v1', '2026-08-15'))
  for (const [label, value] of [['Tên khách', 'A'], ['Liên hệ khách', '09'], ['Bắt đầu', '2026-08-15T08:00:00Z'], ['Kết thúc', '2026-08-15T09:00:00Z']] as const) fireEvent.change(screen.getByLabelText(label), { target: { value } })
  const create = screen.getByRole('button', { name: /tạo booking/i }); fireEvent.click(create); expect(create).toBeDisabled()
  await waitFor(() => expect(createInternalBooking).toHaveBeenCalledWith(expect.objectContaining({ courtId: 'c1', guestName: 'A' })))
  fireEvent.click(screen.getByRole('button', { name: 'Hủy' })); await waitFor(() => expect(cancelInternalBooking).toHaveBeenCalledWith('b1'))
})
