export type LedgerPresentation = { title: string; subtitle: string; amountTone: 'credit' | 'debit' }
export function presentLedgerEntry(entry: { type: string; walletType?: string; amount: string; referenceSummary?: { title?: string; subtitle?: string } | null }): LedgerPresentation {
  const titles: Record<string, string> = { payment: 'Thanh toán đặt sân', refund: 'Hoàn tiền', topup: 'Nạp tiền', payout: 'Chi trả', commission: 'Phí nền tảng' }
  return { title: entry.referenceSummary?.title || titles[entry.type] || 'Giao dịch ví', subtitle: entry.referenceSummary?.subtitle || '', amountTone: BigInt(entry.amount) < 0n ? 'debit' : 'credit' }
}
