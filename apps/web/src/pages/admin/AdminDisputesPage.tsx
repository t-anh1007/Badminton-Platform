import { DisputeAdminPanel } from '../../components/DisputeAdminPanel'

export function AdminDisputesPage() {
  return (
    <>
      <h2 className="text-h1">Tranh chấp</h2>
      <p className="mt-2 text-ink-500">Đối chiếu bằng chứng và quyết định hoàn tiền có kiểm soát.</p>
      <div className="surface-card mt-6 p-4"><DisputeAdminPanel /></div>
    </>
  )
}
