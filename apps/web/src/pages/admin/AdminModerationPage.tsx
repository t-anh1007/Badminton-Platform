import { CommunityAdminPanel } from '../../components/CommunityAdminPanel'

export function AdminModerationPage() {
  return (
    <>
      <h2 className="text-h1">Kiểm duyệt cộng đồng</h2>
      <p className="mt-2 text-ink-500">Xử lý báo cáo công khai và khôi phục nội dung khi cần.</p>
      <div className="surface-card mt-6 p-4"><CommunityAdminPanel /></div>
    </>
  )
}
