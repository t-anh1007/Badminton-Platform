import { useSearchParams } from 'react-router-dom'
import { DisputeAdminPanel } from '../../components/DisputeAdminPanel'

export function AdminDisputesPage() {
  // ?dispute=… (link thông báo) mở thẳng hồ sơ.
  const [params] = useSearchParams()
  return (
    <>
      <h1 className="text-h2">Tranh chấp đặt sân</h1>
      <p className="mt-1 text-sm text-ink-500">Đối chiếu bằng chứng, quyết định hoàn tiền có lý do.</p>
      <div className="mt-4"><DisputeAdminPanel initialId={params.get('dispute')} /></div>
    </>
  )
}
