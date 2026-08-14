import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { AssistantBubble } from './AssistantBubble.js'

let activeSession: { activeRole: string } | null = { activeRole: 'player' }
vi.mock('../session/SessionProvider.js', () => ({ useSession: () => ({ session: activeSession }) }))
vi.mock('../lib/assistantApi.js', () => ({ chatAiMatchSuggestions: vi.fn() }))

beforeEach(() => { activeSession = { activeRole: 'player' } })

it('appears only for the player context and restores trigger focus after Escape', async () => {
  const view = render(<MemoryRouter><AssistantBubble /></MemoryRouter>)
  const trigger = screen.getByLabelText('Mở trợ lý AI')
  fireEvent.click(trigger)
  const dialog = screen.getByRole('dialog', { name: 'Trợ lý AI nhanh' })
  expect(screen.getByLabelText('Nhắn cho trợ lý tìm kèo')).toHaveFocus()
  fireEvent.keyDown(dialog, { key: 'Escape' })
  await waitFor(() => expect(trigger).toHaveFocus())

  activeSession = null
  view.rerender(<MemoryRouter><AssistantBubble /></MemoryRouter>)
  expect(screen.queryByLabelText('Mở trợ lý AI')).not.toBeInTheDocument()
})
