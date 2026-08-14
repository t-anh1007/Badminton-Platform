import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { chatAiMatchSuggestions } from '../lib/assistantApi.js'
import { AssistantChat } from './AssistantChat.js'

vi.mock('../lib/assistantApi.js', () => ({ chatAiMatchSuggestions: vi.fn() }))

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

it('appends conversation messages and updates the live suggestion column', async () => {
  vi.mocked(chatAiMatchSuggestions).mockResolvedValue({
    answer: 'Có một kèo phù hợp.',
    normalizedCriteria: { area: 'Phú Nhuận' },
    actionPath: '/matches',
    suggestions: [{
      matchId: 'm1', score: 88, explanation: 'Cùng trình độ', source: 'fallback', joinPath: '/matches/m1/joins',
      match: { id: 'm1', openSlots: 2, feePerSlot: '45000', skillMin: 'beginner', skillMax: 'intermediate', startAt: '2026-08-15T08:00:00Z', endAt: '2026-08-15T09:00:00Z', court: { id: 'c1', name: 'Sân 1' }, venue: { id: 'v1', name: 'Nhà thi đấu', address: 'Phú Nhuận' } },
    }],
  })
  render(<MemoryRouter><AssistantChat /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Nhắn cho trợ lý tìm kèo'), { target: { value: 'Tìm kèo Phú Nhuận' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi' }))
  expect(screen.getByText('Tìm kèo Phú Nhuận')).toBeInTheDocument()
  expect(await screen.findByText('Có một kèo phù hợp.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Nhà thi đấu/ })).toHaveAttribute('href', '/matches/m1')
  expect(screen.getByRole('link', { name: 'Mở danh sách kèo để xác nhận' })).toHaveAttribute('href', '/matches')
})

it('shows a retry control when the request fails', async () => {
  vi.mocked(chatAiMatchSuggestions).mockRejectedValueOnce(new Error('Mất kết nối')).mockResolvedValueOnce({ answer: 'Đã thử lại.', normalizedCriteria: {}, suggestions: [] })
  render(<MemoryRouter><AssistantChat /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Nhắn cho trợ lý tìm kèo'), { target: { value: 'Tìm lại' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Mất kết nối')
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
  expect(await screen.findByText('Đã thử lại.')).toBeInTheDocument()
  expect(chatAiMatchSuggestions).toHaveBeenCalledTimes(2)
})
