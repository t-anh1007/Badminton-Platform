import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMatchOrganizerContributionSepayIntent, payMatchOrganizerContributionBalance } from '../lib/financeApi.js'
import { waitForMatchOpen } from '../lib/matchApi.js'
import { MatchDepositCheckout } from './MatchDepositCheckout.js'

vi.mock('../lib/financeApi.js', () => ({ payMatchOrganizerContributionBalance: vi.fn(), createMatchOrganizerContributionSepayIntent: vi.fn() }))
vi.mock('../lib/matchApi.js', () => ({ waitForMatchOpen: vi.fn() }))
const future = '2026-08-23T03:10:00.000Z'
const sepayIntent = { intentId: 'pi1', matchCode: 'KLTORG01', amount: '60000', payment: { bankCode: 'MBBank', accountNumber: '0123456789', accountName: 'COURTIN', amount: '60000', matchCode: 'KLTORG01', qrImageUrl: 'https://qr.test/code' } }

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.setSystemTime(new Date('2026-08-23T03:00:00.000Z')) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

it('shows the exact 50 percent deposit and waits for the match to open', async () => {
  vi.mocked(payMatchOrganizerContributionBalance).mockResolvedValue({} as never)
  vi.mocked(waitForMatchOpen).mockResolvedValue({ status: 'open' } as never)
  const onPaid = vi.fn()
  render(<MatchDepositCheckout matchId="m1" fullPrice="120000" holdExpiresAt={future} onPaid={onPaid} onExpired={vi.fn()} />)
  expect(screen.getByText('Cọc tạo kèo (50%)')).toBeInTheDocument()
  expect(screen.getByText('60.000đ')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Thanh toán số dư' }))
  await waitFor(() => expect(onPaid).toHaveBeenCalledWith('m1'))
  expect(waitForMatchOpen).toHaveBeenCalledWith('m1')
})

it('shows a balance error and allows retrying', async () => {
  vi.mocked(payMatchOrganizerContributionBalance).mockRejectedValue(new Error('Số dư không đủ.'))
  render(<MatchDepositCheckout matchId="m1" fullPrice="120000" holdExpiresAt={future} onPaid={vi.fn()} onExpired={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Thanh toán số dư' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Số dư không đủ.')
  expect(screen.getByRole('button', { name: 'Thanh toán số dư' })).toBeEnabled()
})

it('renders SePay and does not finish while payment is pending', async () => {
  vi.mocked(createMatchOrganizerContributionSepayIntent).mockResolvedValue(sepayIntent as never)
  vi.mocked(waitForMatchOpen).mockImplementation(() => new Promise(() => {}))
  const onPaid = vi.fn()
  render(<MatchDepositCheckout matchId="m1" fullPrice="120000" holdExpiresAt={future} onPaid={onPaid} onExpired={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Phương thức thanh toán cọc'), { target: { value: 'sepay' } })
  fireEvent.click(screen.getByRole('button', { name: 'Tạo mã SePay' }))
  expect(await screen.findByText(sepayIntent.matchCode)).toBeInTheDocument()
  expect(waitForMatchOpen).toHaveBeenCalledWith('m1', { intervalMs: 2_500, attempts: 240 })
  expect(onPaid).not.toHaveBeenCalled()
})

it('does not expire while payment confirmation is in progress', async () => {
  vi.mocked(payMatchOrganizerContributionBalance).mockResolvedValue({} as never)
  let resolveOpen!: (value: never) => void
  vi.mocked(waitForMatchOpen).mockImplementation(() => new Promise((resolve) => { resolveOpen = resolve }))
  const onPaid = vi.fn(); const onExpired = vi.fn()
  render(<MatchDepositCheckout matchId="m1" fullPrice="120000" holdExpiresAt={future} onPaid={onPaid} onExpired={onExpired} />)
  fireEvent.click(screen.getByRole('button', { name: 'Thanh toán số dư' }))
  await vi.advanceTimersByTimeAsync(10 * 60_000)
  expect(onExpired).not.toHaveBeenCalled()
  resolveOpen({ status: 'open' } as never)
  await waitFor(() => expect(onPaid).toHaveBeenCalledWith('m1'))
})

it('expires before payment and never calls paid after unmount', async () => {
  const onPaid = vi.fn(); const onExpired = vi.fn()
  const view = render(<MatchDepositCheckout matchId="m1" fullPrice="120000" holdExpiresAt={future} onPaid={onPaid} onExpired={onExpired} />)
  await vi.advanceTimersByTimeAsync(10 * 60_000)
  expect(onExpired).toHaveBeenCalledTimes(1)
  view.unmount()
  expect(onPaid).not.toHaveBeenCalled()
})

it('does not call paid when confirmation resolves after unmount', async () => {
  vi.mocked(payMatchOrganizerContributionBalance).mockResolvedValue({} as never)
  let resolveOpen!: (value: never) => void
  vi.mocked(waitForMatchOpen).mockImplementation(() => new Promise((resolve) => { resolveOpen = resolve }))
  const onPaid = vi.fn()
  const view = render(<MatchDepositCheckout matchId="m1" fullPrice="120000" holdExpiresAt={future} onPaid={onPaid} onExpired={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Thanh toán số dư' }))
  await waitFor(() => expect(waitForMatchOpen).toHaveBeenCalled())
  view.unmount()
  resolveOpen({ status: 'open' } as never)
  await Promise.resolve()
  expect(onPaid).not.toHaveBeenCalled()
})

it('rejects cancelled match status instead of treating it as paid', async () => {
  const actual = await vi.importActual<typeof import('../lib/matchApi.js')>('../lib/matchApi.js')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'cancelled' }) }))
  await expect(actual.waitForMatchOpen('m1', { attempts: 1, intervalMs: 0 })).rejects.toThrow('không còn ở trạng thái')
  vi.unstubAllGlobals()
})
