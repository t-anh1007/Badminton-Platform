import { expect, it } from 'vitest'
import { presentLedgerEntry } from './presenters.js'

it.each([
  ['payment', '-1', 'Thanh toán đặt sân', 'debit'],
  ['refund', '1', 'Hoàn tiền', 'credit'],
  ['topup', '1', 'Nạp tiền', 'credit'],
  ['payout', '-1', 'Chi trả', 'debit'],
  ['commission', '1', 'Phí nền tảng', 'credit'],
] as const)('presents %s with a Vietnamese business label', (type, amount, title, amountTone) => {
  expect(presentLedgerEntry({ type, amount })).toEqual({ title, subtitle: '', amountTone })
})

it('prefers safe reference metadata and never exposes a legacy refId', () => {
  expect(presentLedgerEntry({ type: 'payment', amount: '-1', referenceSummary: { title: 'Thanh toán sân Phú Nhuận', subtitle: 'Sân 1 · 15/08/2026' } })).toMatchObject({ title: 'Thanh toán sân Phú Nhuận', subtitle: 'Sân 1 · 15/08/2026' })
  expect(presentLedgerEntry({ type: 'legacy', amount: '1' })).toEqual({ title: 'Giao dịch ví', subtitle: '', amountTone: 'credit' })
})
