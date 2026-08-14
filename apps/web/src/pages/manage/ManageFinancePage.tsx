import { useEffect, useState } from 'react'
import { Button } from '../../components/ui'
import { cancelMyWithdrawal, createWithdrawal, getMyRevenue, getMyWithdrawals } from '../../lib/financeApi'

export function ManageFinancePage() {
  const [rows, setRows] = useState<any[]>([]); const [withdrawals, setWithdrawals] = useState<any[]>([]); const [amount, setAmount] = useState(''); const [bank, setBank] = useState({ bankCode: '', bankAccountNumber: '', bankAccountName: '' }); const [error, setError] = useState('')
  const load = () => Promise.all([getMyRevenue(), getMyWithdrawals()]).then(([revenue, pending]) => { setRows(revenue); setWithdrawals(pending) }).catch((cause: Error) => setError(cause.message))
  useEffect(() => { void load() }, [])
  const submit = async () => { if (!/^\d+$/.test(amount) || !Object.values(bank).every(Boolean)) return setError('Nhập đủ số tiền và thông tin ngân hàng hợp lệ.'); try { await createWithdrawal({ amount, ...bank }); await load() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tạo yêu cầu rút.') } }
  return <section><h2 className="text-h2">Doanh thu và rút tiền</h2><p>{rows.length} giao dịch doanh thu</p><input aria-label="Số tiền rút" value={amount} onChange={e => setAmount(e.target.value)}/>{(['bankCode','bankAccountNumber','bankAccountName'] as const).map(key => <input key={key} aria-label={key} value={bank[key]} onChange={e => setBank({ ...bank, [key]: e.target.value })}/>)}<Button onClick={() => void submit()}>Gửi yêu cầu rút</Button>{withdrawals.map(row => <div key={row.id}>{row.status}<Button size="sm" onClick={() => void cancelMyWithdrawal(row.id).then(load).catch((cause: Error) => setError(cause.message))}>Hủy yêu cầu</Button></div>)}{error && <p role="alert">{error}</p>}</section>
}
