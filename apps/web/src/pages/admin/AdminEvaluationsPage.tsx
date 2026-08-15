import { useEffect, useState } from 'react'
import { Badge, Button, EmptyState, Modal, SelectInput } from '../../components/ui'
import { getAdminEvaluations, reviewAdminEvaluation, type AdminEvaluationRow } from '../../lib/matchApi'
import { formatDateTimeVi } from '../../lib/formatters.js'

const tierLabel: Record<string, string> = {
  newcomer: 'Mới chơi', beginner: 'Cơ bản', intermediate: 'Trung bình', intermediate_plus: 'Khá', advanced: 'Nâng cao',
}
const reasonLabel: Record<string, string> = {
  outlier_median_2_tiers: 'Lệch ít nhất 2 bậc so với trung vị',
  reciprocal_top_tier_3_matches_30_days: 'Đánh giá nâng cao qua lại bất thường trong 30 ngày',
}

export function AdminEvaluationsPage() {
  const [status, setStatus] = useState<AdminEvaluationRow['reviewStatus']>('pending')
  const [rows, setRows] = useState<AdminEvaluationRow[]>([])
  const [pending, setPending] = useState<{ row: AdminEvaluationRow; decision: 'approve' | 'reject' } | null>(null)
  const [message, setMessage] = useState('')

  const load = async (nextStatus = status) => {
    try { setRows(await getAdminEvaluations(nextStatus)); setMessage('') }
    catch (cause) { setMessage((cause as Error).message) }
  }
  useEffect(() => { void load('pending') }, [])

  const confirm = async () => {
    if (!pending) return
    try {
      await reviewAdminEvaluation(pending.row.matchId, pending.row.id, pending.decision)
      setPending(null)
      setMessage('Đã ghi nhận quyết định đánh giá.')
      await load()
    } catch (cause) { setMessage((cause as Error).message) }
  }

  return (
    <>
      <h2 className="text-h1">Đánh giá bị gắn cờ</h2>
      <p className="mt-2 text-ink-500">Chỉ quyết định rõ ràng của Admin mới đưa đánh giá vào tổng hợp trình độ.</p>
      <div className="mt-5 max-w-xs">
        <SelectInput aria-label="Trạng thái duyệt đánh giá" value={status} onChange={(event) => { const next = event.target.value as AdminEvaluationRow['reviewStatus']; setStatus(next); void load(next) }}>
          <option value="pending">Chờ duyệt</option><option value="approved">Đã chấp thuận</option><option value="rejected">Đã từ chối</option>
        </SelectInput>
      </div>
      {message && <p role="status" className="mt-4 rounded-xl bg-info-bg p-3 text-sm">{message}</p>}
      <div className="mt-5 space-y-3">
        {rows.length ? rows.map((row) => (
          <article key={row.id} className="surface-card p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <p className="font-bold">{row.rater.label} → {row.ratee.label}</p>
                <p className="mt-1 text-sm text-ink-500">Mức cảm nhận: {tierLabel[row.perceivedTier ?? ''] ?? 'Chưa xác định'}</p>
                <p className="text-sm text-ink-500">{reasonLabel[row.flagReason ?? ''] ?? 'Cần Admin xác minh'}</p>
                <p className="text-caption">Gửi lúc {formatDateTimeVi(row.createdAt)}</p>
              </div>
              <Badge tone={row.reviewStatus === 'pending' ? 'warning' : row.reviewStatus === 'approved' ? 'success' : 'danger'}>{row.reviewStatus === 'pending' ? 'Chờ duyệt' : row.reviewStatus === 'approved' ? 'Đã chấp thuận' : 'Đã từ chối'}</Badge>
            </div>
            {row.reviewStatus === 'pending' && <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" onClick={() => setPending({ row, decision: 'approve' })}>Chấp thuận đánh giá</Button><Button size="sm" tone="danger" onClick={() => setPending({ row, decision: 'reject' })}>Từ chối đánh giá</Button></div>}
          </article>
        )) : <EmptyState title="Không có đánh giá" description="Không có hàng chờ phù hợp trạng thái đã chọn." />}
      </div>
      <Modal open={Boolean(pending)} title="Xác nhận quyết định đánh giá" onClose={() => setPending(null)}>
        <p className="text-sm text-ink-500">{pending?.decision === 'approve' ? 'Đánh giá sẽ được đưa vào tổng hợp trình độ.' : 'Đánh giá sẽ bị loại khỏi tổng hợp trình độ.'}</p>
        <Button className="mt-5" tone={pending?.decision === 'reject' ? 'danger' : 'primary'} onClick={() => void confirm()}>Xác nhận</Button>
      </Modal>
    </>
  )
}
