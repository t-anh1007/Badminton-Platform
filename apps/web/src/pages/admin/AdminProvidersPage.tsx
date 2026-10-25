import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Drawer, DetailList } from '../../components/Drawer'
import { Badge, Button, EmptyState, TextArea } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { approveProvider, getAdminProviders, rejectProvider, type ProviderRow } from '../../lib/venueBookingApi'
import { useLiveDataRefresh } from '../../realtime/dataInvalidation.js'

export function AdminProvidersPage() {
  const [rows, setRows] = useState<ProviderRow[]>([]); const [target, setTarget] = useState<ProviderRow | null>(null); const [reason, setReason] = useState(''); const [message, setMessage] = useState('')
  // ?provider=… (link thông báo) mở thẳng hồ sơ.
  const [params, setParams] = useSearchParams()
  const linked = params.get('provider')
  const load = async () => { try { const next = await getAdminProviders(); setRows(next); const match = linked ? next.find((row) => row.id === linked) : undefined; if (match) setTarget(match) } catch (cause) { setMessage((cause as Error).message) } }
  useEffect(() => { void load() }, [])
  useLiveDataRefresh(load)
  const close = () => { setTarget(null); setReason(''); if (linked) setParams({}, { replace: true }) }
  const submit = async (decision: 'approve' | 'reject') => { if (!target || (decision === 'reject' && !reason.trim())) return setMessage('Nhập lý do từ chối.'); try { if (decision === 'approve') await approveProvider(target.id); else await rejectProvider(target.id, reason.trim()); setMessage(decision === 'approve' ? `Đã duyệt ${target.orgName}.` : `Đã từ chối ${target.orgName}.`); close(); await load() } catch (cause) { setMessage((cause as Error).message) } }
  const th = 'px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-ink-500'
  return <>
    <h1 className="text-h2">Duyệt chủ sân</h1>
    <p className="mt-1 text-sm text-ink-500">{rows.length} hồ sơ chờ duyệt</p>
    {message && <p role="status" className="mt-3 rounded-xl bg-canvas p-3 text-sm">{message}</p>}
    {rows.length ? <div className="surface-card mt-4 overflow-x-auto"><table className="w-full text-sm">
      <thead className="bg-canvas"><tr><th className={th}>Hồ sơ</th><th className={th}>Điện thoại</th><th className={th}>Email</th><th className={th}>Trạng thái</th><th className={th}><span className="sr-only">Mở</span></th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id} className="cursor-pointer border-t border-line hover:bg-canvas" onClick={() => { setTarget(row); setReason('') }}>
        <td className="px-4 py-3"><p className="font-semibold text-ink-900">{row.orgName}</p><p className="text-figures text-xs text-ink-500">{row.businessCode ?? '—'}</p></td>
        <td className="px-4 py-3 text-ink-700">{row.contact?.phone ?? '—'}</td>
        <td className="px-4 py-3 text-ink-700">{row.contact?.email ?? '—'}</td>
        <td className="px-4 py-3"><Badge tone="warning">Chờ duyệt</Badge></td>
        <td className="px-4 py-3 text-right"><button type="button" aria-label={`Xem hồ sơ ${row.orgName}`} className="text-ink-500 hover:text-brand-navy"><Icon name="chevronRight" /></button></td>
      </tr>)}</tbody>
    </table></div> : <div className="mt-4"><EmptyState title="Không có hồ sơ chờ duyệt" description="Hồ sơ hợp tác mới sẽ xuất hiện tại đây." /></div>}
    <Drawer open={Boolean(target)} label="Hồ sơ hợp tác chủ sân" kicker={target?.businessCode} title={target?.orgName} onClose={close}
      footer={<div className="grid gap-3"><TextArea aria-label="Lý do từ chối chủ sân" rows={3} placeholder="Lý do (bắt buộc khi từ chối)" value={reason} onChange={(event) => setReason(event.target.value)} /><div className="flex gap-2"><Button tone="secondary" className="flex-1 text-danger" onClick={() => void submit('reject')}>Từ chối</Button><Button className="flex-1" onClick={() => void submit('approve')}>Duyệt</Button></div></div>}>
      <Badge tone="warning" className="w-fit">Chờ duyệt</Badge>
      <DetailList items={[['Điện thoại', target?.contact?.phone ?? '—'], ['Email', target?.contact?.email ?? '—'], target?.contact?.contact ? ['Ghi chú', target.contact.contact] : null]} />
    </Drawer>
  </>
}
