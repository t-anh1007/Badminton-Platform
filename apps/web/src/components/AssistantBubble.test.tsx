import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { sendPlayerMessage } from '../lib/assistantApi.js'
import { AssistantBubble } from './AssistantBubble.js'

let activeSession: { activeRole: string } | null = { activeRole: 'player' }
vi.mock('../session/SessionProvider.js', () => ({ useSession: () => ({ session: activeSession }) }))
vi.mock('../lib/assistantApi.js', () => ({ sendPlayerMessage: vi.fn() }))

beforeEach(() => { activeSession = { activeRole: 'player' }; vi.clearAllMocks(); window.sessionStorage.clear() })
afterEach(cleanup)

it('opens for the player, sends a support message and restores trigger focus on Escape', async () => {
  vi.mocked(sendPlayerMessage).mockResolvedValue({ kind: 'support', answer: 'Chính sách hủy là 24 giờ.', fallback: false, sources: [{ id: 's1', title: 'Chính sách hủy' }] })
  render(<MemoryRouter><AssistantBubble /></MemoryRouter>)

  const trigger = screen.getByLabelText('Mở trợ lý AI')
  fireEvent.click(trigger)
  // Mascot bật nhảy trước rồi mới mở khung chat.
  const dialog = await screen.findByRole('dialog', { name: 'Trợ lý CourtIn' })
  const input = screen.getByLabelText('Nhắn cho trợ lý CourtIn')
  await waitFor(() => expect(input).toHaveFocus())

  fireEvent.change(input, { target: { value: 'Chính sách hủy sân thế nào?' } })
  fireEvent.click(screen.getByLabelText('Gửi tin nhắn'))
  expect(screen.getByText('Chính sách hủy sân thế nào?')).toBeInTheDocument()
  expect(await screen.findByText('Chính sách hủy là 24 giờ.')).toBeInTheDocument()
  expect(screen.getByText('Chính sách hủy')).toBeInTheDocument()
  expect(sendPlayerMessage).toHaveBeenCalledWith('Chính sách hủy sân thế nào?', undefined)

  fireEvent.keyDown(dialog, { key: 'Escape' })
  await waitFor(() => expect(trigger).toHaveFocus())
})

it('sends the match quick reply through the player assistant and renders match cards', async () => {
  vi.mocked(sendPlayerMessage).mockResolvedValue({
    kind: 'match',
    answer: 'Tìm thấy 1 kèo phù hợp.',
    fallback: false,
    actionPath: '/matches',
    suggestions: [{
      matchId: 'm1', score: 88, explanation: 'Cùng trình độ', source: 'fallback', joinPath: '/matches/m1/joins', distanceKm: 2.5, memberSummary: '1 TB',
      match: { id: 'm1', openSlots: 2, feePerSlot: '45000', skillMin: 'beginner', skillMax: 'intermediate', startAt: '2026-08-15T08:00:00Z', endAt: '2026-08-15T09:00:00Z', court: { id: 'c1', name: 'Sân 1' }, venue: { id: 'v1', name: 'Nhà thi đấu', address: 'Phú Nhuận' } },
    }],
  })
  render(<MemoryRouter><AssistantBubble /></MemoryRouter>)
  fireEvent.click(screen.getByLabelText('Mở trợ lý AI'))
  fireEvent.click(await screen.findByRole('button', { name: 'Gợi ý kèo tối nay' }))

  expect(await screen.findByText('Tìm thấy 1 kèo phù hợp.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Nhà thi đấu/ })).toHaveAttribute('href', '/matches/m1')
  expect(screen.getByText(/cách 2.5 km/)).toBeInTheDocument()
  expect(screen.getByText('Trong kèo: 1 TB')).toBeInTheDocument()
  expect(sendPlayerMessage).toHaveBeenCalledWith('Gợi ý kèo tối nay cho tôi', undefined)
})

it('shows the mascot greeting and hides it for the session when dismissed', () => {
  render(<MemoryRouter><AssistantBubble /></MemoryRouter>)
  expect(screen.getByText(/Xin chào! Tôi có thể giúp gì cho bạn\?/)).toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Ẩn lời chào'))
  expect(screen.queryByText(/Xin chào! Tôi có thể giúp gì cho bạn\?/)).not.toBeInTheDocument()
  expect(window.sessionStorage.getItem('courtin.mascotGreetingHidden')).toBe('1')
})

it('does not render outside the player context', () => {
  activeSession = { activeRole: 'provider' }
  render(<MemoryRouter><AssistantBubble /></MemoryRouter>)
  expect(screen.queryByLabelText('Mở trợ lý AI')).not.toBeInTheDocument()
})
