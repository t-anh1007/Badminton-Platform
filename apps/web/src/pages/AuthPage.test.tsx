import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { loadSession } from '../session/session'
import { AuthPage } from './AuthPage'

vi.mock('../session/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session/session')>()),
  loadSession: vi.fn(),
}))
vi.mock('../components/AuthForm', () => ({ AuthForm: () => <p>form đăng nhập</p> }))

// BR-CM-81: link email /auth?next=/matches/:id.

const renderAt = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/matches/:id" element={<p>trang kèo</p>} />
      <Route path="*" element={<p>trang khác</p>} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => vi.mocked(loadSession).mockReturnValue(null))
afterEach(cleanup)

it('chưa đăng nhập: hiện form kèm lời nhắc về kèo được mời', () => {
  renderAt('/auth?next=%2Fmatches%2Fm-1')
  expect(screen.getByText('form đăng nhập')).toBeInTheDocument()
  expect(screen.getByText('Đăng nhập để xem kèo bạn được mời.')).toBeInTheDocument()
})

it('đã đăng nhập: chuyển thẳng tới kèo', () => {
  vi.mocked(loadSession).mockReturnValue({ userId: 'u-1' } as ReturnType<typeof loadSession>)
  renderAt('/auth?next=%2Fmatches%2Fm-1')
  expect(screen.getByText('trang kèo')).toBeInTheDocument()
})

it('bỏ qua next trỏ ra ngoài', () => {
  vi.mocked(loadSession).mockReturnValue({ userId: 'u-1' } as ReturnType<typeof loadSession>)
  renderAt('/auth?next=%2F%2Fevil.example')
  expect(screen.getByText('form đăng nhập')).toBeInTheDocument()
})
