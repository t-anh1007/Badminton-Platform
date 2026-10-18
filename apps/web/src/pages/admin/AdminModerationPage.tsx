import { useSearchParams } from 'react-router-dom'
import { CommunityAdminPanel } from '../../components/CommunityAdminPanel'

export function AdminModerationPage() {
  // ?report=… (link thông báo) đưa báo cáo đó lên đầu.
  const [params] = useSearchParams()
  return (
    <>
      <h1 className="text-h2">Kiểm duyệt</h1>
      <p className="mt-1 text-sm text-ink-500">Báo cáo bài viết và bình luận từ cộng đồng.</p>
      <div className="mt-4"><CommunityAdminPanel focusId={params.get('report')} /></div>
    </>
  )
}
