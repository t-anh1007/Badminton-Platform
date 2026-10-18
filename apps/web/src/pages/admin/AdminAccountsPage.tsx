import { useEffect, useState } from 'react'
import { roleLabel } from '../../components/RoleBadge.js'
import type { UserRole } from '../../session/session.js'
import { Badge, Button, EmptyState, Modal, SelectInput, TextArea, TextInput } from '../../components/ui'
import { getAdminAccounts, lockAdminAccount, unlockAdminAccount, type AdminAccountRow } from '../../lib/accountApi'
import { useLiveDataRefresh } from '../../realtime/dataInvalidation.js'

export function AdminAccountsPage() {
  const [rows, setRows] = useState<AdminAccountRow[]>([])
  const [filters, setFilters] = useState({ query: '', status: '' })
  const [target, setTarget] = useState<AdminAccountRow | null>(null)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const load = async () => { try { setRows(await getAdminAccounts(filters)); setMessage('') } catch (cause) { setMessage((cause as Error).message) } }
  useEffect(() => { void load() }, [])
  useLiveDataRefresh(load)
  const submit = async () => { if (!target || !reason.trim()) return setMessage('Nhập lý do trước khi xác nhận.'); try { if (target.status === 'locked') await unlockAdminAccount(target.id, reason.trim()); else await lockAdminAccount(target.id, reason.trim()); setTarget(null); setReason(''); await load() } catch (cause) { setMessage((cause as Error).message) } }
  const th = 'px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-ink-500'
  return <>
    <h1 className="text-h2">Tài khoản</h1>
    <form className="mt-4 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void load() }}>
      <TextInput aria-label="Tìm tài khoản" className="!w-auto flex-1" placeholder="Mã tài khoản, email hoặc tên" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} />
      <SelectInput aria-label="Trạng thái tài khoản" className="!w-44" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Mọi trạng thái</option><option value="active">Hoạt động</option><option value="locked">Đã khóa</option></SelectInput>
      <Button type="submit" tone="secondary">Lọc</Button>
    </form>
    {message && <p role="status" className="mt-3 rounded-xl bg-canvas p-3 text-sm">{message}</p>}
    {rows.length ? <div className="surface-card mt-4 overflow-x-auto"><table className="w-full text-sm">
      <thead className="bg-canvas"><tr><th className={th}>Tài khoản</th><th className={th}>Mã</th><th className={th}>Vai trò</th><th className={th}>Trạng thái</th><th className={th}><span className="sr-only">Thao tác</span></th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-line">
        <td className="px-4 py-3"><p className="font-semibold text-ink-900">{row.displayName || row.email}</p>{row.displayName && <p className="text-xs text-ink-500">{row.email}</p>}</td>
        <td className="text-figures px-4 py-3 text-xs text-ink-500">{row.businessCode ?? '—'}</td>
        <td className="px-4 py-3 text-ink-700">{row.roles.map((role) => roleLabel(role as UserRole) ?? role).join(' · ')}</td>
        <td className="px-4 py-3"><Badge tone={row.status === 'locked' ? 'danger' : 'success'}>{row.status === 'locked' ? 'Đã khóa' : 'Hoạt động'}</Badge></td>
        <td className="px-4 py-3 text-right"><button type="button" onClick={() => { setTarget(row); setReason('') }} className={`text-sm font-bold hover:underline ${row.status === 'locked' ? 'text-brand-navy' : 'text-danger'}`}>{row.status === 'locked' ? 'Mở khóa' : 'Khóa'}</button></td>
      </tr>)}</tbody>
    </table></div> : <div className="mt-4"><EmptyState title="Không có tài khoản" description="Thử đổi bộ lọc tìm kiếm." /></div>}
    <Modal open={Boolean(target)} title={target?.status === 'locked' ? 'Mở khóa tài khoản' : 'Khóa tài khoản'} onClose={() => setTarget(null)}>
      <p className="text-sm"><strong>{target?.displayName || target?.email}</strong>{target?.displayName && <span className="text-ink-500"> · {target.email}</span>}</p>
      <label className="mt-4 grid gap-1.5 text-sm font-medium">Lý do (lưu vào lịch sử kiểm toán)<TextArea aria-label="Lý do thao tác tài khoản" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <div className="mt-5 flex justify-end gap-2"><Button tone="secondary" onClick={() => setTarget(null)}>Hủy</Button><Button tone={target?.status === 'locked' ? 'primary' : 'danger'} onClick={() => void submit()}>{target?.status === 'locked' ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}</Button></div>
    </Modal>
  </>
}
