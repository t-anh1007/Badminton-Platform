import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { RouteState } from './RouteState.js'
import { AsyncButton } from './ui.js'

it('announces loading without conveying state by color alone', () => {
  render(<RouteState variant="loading" />)
  const state = screen.getByRole('status')
  expect(state).toHaveAttribute('aria-busy', 'true')
  expect(screen.getByText('Đang tải dữ liệu')).toBeInTheDocument()
})

it('announces an error and exposes a retry with a 44px touch target', () => {
  const retry = vi.fn()
  render(<RouteState variant="error" title="Mất kết nối" onRetry={retry} />)
  expect(screen.getByRole('alert')).toHaveTextContent('Mất kết nối')
  const button = screen.getByRole('button', { name: 'Thử lại' })
  expect(button).toHaveClass('min-h-11')
  fireEvent.click(button)
  expect(retry).toHaveBeenCalledOnce()
})

it.each(['empty', 'forbidden'] as const)('renders the %s variant with explicit text', (variant) => {
  render(<RouteState variant={variant} />)
  expect(screen.getByText(variant === 'empty' ? 'Chưa có dữ liệu' : 'Bạn chưa có quyền truy cập')).toBeInTheDocument()
})

it('prevents duplicate async actions and exposes progress text', () => {
  const action = vi.fn()
  const { rerender } = render(<AsyncButton pending={false} onClick={action}>Lưu</AsyncButton>)
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
  expect(action).toHaveBeenCalledOnce()
  rerender(<AsyncButton pending onClick={action}>Lưu</AsyncButton>)
  const pending = screen.getByRole('button', { name: 'Đang xử lý…' })
  expect(pending).toBeDisabled()
  expect(pending).toHaveAttribute('aria-busy', 'true')
})
