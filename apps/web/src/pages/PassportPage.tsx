import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar, Badge, Button, EmptyState, Modal, SelectInput, Skeleton, SurfaceCard, Toast } from '../components/ui';
import { PageHeader } from '../components/courtin/PageHeader';
import { MetricCard } from '../components/courtin/MetricCard';
import type { SkillTier } from '../lib/matchApi';
import {
  declarePassportTier,
  getOwnPassport,
  getPublicPassport,
  submitMatchEvaluation,
  type OwnPassport,
  type PublicPassport,
} from '../lib/passportApi';
import { formatDateTimeVi } from '../lib/formatters';

const tierLabels: Record<SkillTier, string> = {
  newcomer: 'Mới chơi',
  beginner: 'Yếu',
  intermediate: 'Trung bình',
  intermediate_plus: 'Trung bình khá',
  advanced: 'Bán chuyên',
};
const tiers = Object.entries(tierLabels) as Array<[SkillTier, string]>;

export function PassportPage() {
  const { userId } = useParams();
  const isOwner = !userId;
  const navigate = useNavigate();
  const [passport, setPassport] = useState<OwnPassport | PublicPassport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [declareOpen, setDeclareOpen] = useState(false);
  const [evaluationTarget, setEvaluationTarget] = useState<{
    matchId: string;
    userId: string;
  } | null>(null);
  const [tier, setTier] = useState<SkillTier>('intermediate');
  const [evaluationTier, setEvaluationTier] = useState<SkillTier>('intermediate');

  const load = async () => {
    if (isOwner && !window.localStorage.getItem('accessToken')) {
      navigate('/auth');
      return;
    }
    setLoading(true);
    setError('');
    try {
      setPassport(isOwner ? await getOwnPassport() : await getPublicPassport(userId!));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải hồ sơ trình độ.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [userId]);
  const own = isOwner && passport && 'rating' in passport ? passport : null;
  const declare = async () => {
    try {
      const next = await declarePassportTier(tier);
      setPassport(next);
      setDeclareOpen(false);
      setNotice('Đã cập nhật khai báo trình độ.');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Không thể cập nhật trình độ.');
    }
  };
  const submitEvaluation = async () => {
    if (!evaluationTarget) return;
    try {
      await submitMatchEvaluation(evaluationTarget.matchId, evaluationTarget.userId, evaluationTier);
      setEvaluationTarget(null);
      setNotice('Đã gửi đánh giá sau trận.');
      await load();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Không thể gửi đánh giá.');
    }
  };

  return (
    <div className="page-container py-8 sm:py-10">
      {notice && <Toast message={notice} tone={notice.startsWith('Đã') ? 'success' : 'error'} />}
      <PageHeader eyebrow="Hồ sơ thi đấu" title="Hồ sơ trình độ" description="Rating có độ bất định — không phải bảng xếp hạng." actions={isOwner ? <Button disabled={Boolean(own && !own.canDeclareTier)} onClick={() => setDeclareOpen(true)}>Khai báo trình độ</Button> : undefined} />
      {loading ? (
        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="mb-2 text-sm text-ink-500">Đang xác định trình độ</p>
            <Skeleton className="h-64" />
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : error || !passport ? (
        <div className="mt-6">
          <EmptyState
            title="Chưa thể mở hồ sơ trình độ"
            description={error || 'Hồ sơ trình độ chưa tồn tại.'}
            action={isOwner ? <Button onClick={() => setDeclareOpen(true)}>Khai báo trình độ</Button> : undefined}
          />
        </div>
      ) : (
        <>
          <SurfaceCard className="mt-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <Avatar label={passport.userId.slice(0, 1)} className="h-16 w-16 text-xl" />
                <div>
                  <h2 className="text-h2">
                    {isOwner ? 'Hồ sơ trình độ của tôi' : `Người chơi ${passport.userId.slice(0, 8)}`}
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone="success">{tierLabels[passport.tier]}</Badge>
                    <Badge>{passport.matchesPlayed} trận đã chơi</Badge>
                  </div>
                </div>
              </div>
              {own && <p className="text-caption">Cập nhật {new Date(own.updatedAt).toLocaleString('vi-VN')}</p>}
            </div>
          </SurfaceCard>
          {own ? (
            <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
              <SurfaceCard>
                <p className="text-caption">RATING HIỆN TẠI</p>
                <p className="text-figures mt-2 text-5xl font-bold tracking-tight text-brand-navy">
                  {Math.round(own.rating)}
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm text-ink-500">Độ lệch RD</span>
                  <span className="text-figures font-semibold">±{Math.round(own.rd)}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-canvas">
                  <div
                    className={`h-full rounded-full ${own.uncertainty === 'high' ? 'bg-warning' : 'bg-green-600'}`}
                    style={{
                      width: `${Math.max(12, 100 - Math.min(100, own.rd / 3.5))}%`,
                    }}
                  />
                </div>
                <div className="mt-3">
                  <Badge tone={own.uncertainty === 'high' ? 'warning' : 'success'}>
                    {own.uncertainty === 'high' ? 'Đang xác định trình độ' : 'Rating đã ổn định'}
                  </Badge>
                </div>
                {own.matchesPlayed === 0 && (
                  <div className="mt-5 rounded-xl bg-warning-bg p-4">
                    <p className="font-semibold">Khởi tạo hồ sơ trình độ</p>
                    <p className="mt-1 text-sm text-ink-500">
                      Khai báo bậc ban đầu và hoàn thành thêm trận để giảm RD.
                    </p>
                  </div>
                )}
              </SurfaceCard>
              {!own.canDeclareTier && own.nextDeclarationAt && <p className="text-sm text-ink-500">Bạn có thể khai báo lại từ {formatDateTimeVi(own.nextDeclarationAt)}.</p>}
              <SurfaceCard>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-h2">Đánh giá sau trận</h2>
                    <p className="mt-1 text-sm text-ink-500">
                      Chỉ đánh giá hợp lệ, không bị flag mới được tính vào tổng hợp.
                    </p>
                  </div>
                  {own.flaggedEvaluationCount > 0 && (
                    <Badge tone="warning">{own.flaggedEvaluationCount} chờ Admin</Badge>
                  )}
                </div>
                <div className="mt-6 grid grid-cols-2 gap-4"><MetricCard label="Đã tính" value={own.evaluationCount} /><MetricCard label="Rating cảm nhận" value={own.evaluationScore === null ? '—' : Math.round(own.evaluationScore)} tone="yellow" /></div>
                <p className="mt-4 text-sm text-ink-500">
                  Đánh giá bị gắn cờ được giữ ngoài rating cho đến khi Admin xử lý.
                </p>
              </SurfaceCard>
            </div>
          ) : (
            <SurfaceCard className="mt-5">
              <p className="text-sm text-ink-500">
                Bản công khai chỉ hiển thị userId, bậc và số trận theo chính sách riêng tư D31.
              </p>
            </SurfaceCard>
          )}
          {own && (
            <SurfaceCard className="mt-5">
              <div className="flex items-center justify-between">
                <h2 className="text-h2">Lịch sử trận hoàn thành</h2>
                <Badge>{own.recentMatches.length} gần đây</Badge>
              </div>
              {own.recentMatches.length === 0 ? (
                <div className="mt-5">
                  <EmptyState
                    title="Chưa có trận hoàn thành"
                    description="Tham gia một kèo và hoàn thành trận để bắt đầu lịch sử trình độ."
                    action={<Button onClick={() => navigate('/matches')}>Tìm kèo</Button>}
                  />
                </div>
              ) : (
                <div className="mt-4 divide-y divide-line">
                  {own.recentMatches.map((match, matchIndex) => (
                    <div key={match.id} className="py-4">
                      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                        <div>
                          <p className="font-medium">Trận hoàn thành {matchIndex + 1}</p>
                          <p className="text-caption">Đã ghi nhận vào hồ sơ trình độ</p>
                        </div>
                        <p className="text-sm text-ink-500">{new Date(match.completedAt).toLocaleString('vi-VN')}</p>
                      </div>
                      {match.evaluationCandidates.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="text-caption">Đánh giá người cùng kèo:</span>
                          {match.evaluationCandidates.map((candidate, candidateIndex) => {
                            const windowOpen =
                              Date.now() <= new Date(match.completedAt).getTime() + 72 * 60 * 60 * 1000;
                            return candidate.submitted ? (
                              <Badge key={candidate.userId} tone="success">
                                Người cùng kèo {candidateIndex + 1} · đã gửi
                              </Badge>
                            ) : (
                              <Button
                                key={candidate.userId}
                                size="sm"
                                tone="secondary"
                                disabled={!windowOpen}
                                onClick={() =>
                                  setEvaluationTarget({
                                    matchId: match.id,
                                    userId: candidate.userId,
                                  })
                                }
                              >
                                {windowOpen ? `Đánh giá người cùng kèo ${candidateIndex + 1}` : 'Đã hết 72 giờ'}
                              </Button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </SurfaceCard>
          )}
        </>
      )}
      <Modal open={evaluationTarget !== null} title="Đánh giá sau trận" onClose={() => setEvaluationTarget(null)}>
        <p className="text-sm text-ink-500">
          Chọn bậc bạn cảm nhận cho người chơi cùng kèo. Đánh giá bất thường chỉ được gắn cờ chờ Admin, không tự phạt
          hay đổi Glicko.
        </p>
        <label className="mt-4 block text-sm font-medium">
          Bậc cảm nhận
          <SelectInput
            className="mt-1"
            value={evaluationTier}
            onChange={(event) => setEvaluationTier(event.target.value as SkillTier)}
          >
            {tiers.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectInput>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button tone="secondary" onClick={() => setEvaluationTarget(null)}>
            Đóng
          </Button>
          <Button onClick={() => void submitEvaluation()}>Gửi đánh giá</Button>
        </div>
      </Modal>
      <Modal open={declareOpen} title="Khai báo trình độ" onClose={() => setDeclareOpen(false)}>
        <p className="text-sm text-ink-500">
          Khai báo giúp khởi tạo hoặc điều chỉnh có giới hạn; kết quả trận vẫn là tín hiệu chính.
        </p>
        <label className="mt-4 block text-sm font-medium">
          Bậc hiện tại
          <SelectInput className="mt-1" value={tier} onChange={(event) => setTier(event.target.value as SkillTier)}>
            {tiers.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectInput>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button tone="secondary" onClick={() => setDeclareOpen(false)}>
            Đóng
          </Button>
          <Button onClick={() => void declare()}>Lưu khai báo</Button>
        </div>
      </Modal>
    </div>
  );
}
