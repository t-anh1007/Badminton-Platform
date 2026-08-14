import { expect, it } from 'vitest'
import { presentLedgerEntry } from './presenters.js'
it('uses Vietnamese ledger labels and never exposes reference ids', () => { expect(presentLedgerEntry({ type: 'payment', amount: '-1' })).toMatchObject({ title: 'Thanh toán đặt sân', amountTone: 'debit' }); expect(presentLedgerEntry({ type: 'legacy', amount: '1' }).title).toBe('Giao dịch ví') })
