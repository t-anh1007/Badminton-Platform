import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { VIETNAM_PROVINCES } from '@khoaluantn/shared';
import { AsyncButton, Avatar, Badge, Button, EmptyState, Modal, Pagination, SegmentedControl, SelectInput, SurfaceCard, Tabs, Toast } from '../components/ui';
import { RouteState } from '../components/RouteState.js';
import { formatDateTimeVi, formatDateVi } from '../lib/formatters.js';
import { PageHeader } from '../components/courtin/PageHeader';
import { MetricCard } from '../components/courtin/MetricCard';
import type { SkillTier } from '../lib/matchApi';
import { getMyProfile } from '../lib/accountApi';
import { getCurrentSeason, getLeaderboard, selectSeasonRegion, type CurrentSeason, type LeaderboardRow } from '../lib/competitionApi';
import {
  declarePassportTier,
  getMatchHistory,
  getOwnPassport,
  getPublicPassport,
  submitMatchEvaluation,
  type Discipline,
  type MatchHistoryItem,
  type OwnDisciplinePassport,
  type OwnPassport,
  type Page,
  type PlayerBadge,
  type PublicPassport,
} from '../lib/passportApi';

const tierLabels: Record<SkillTier, string> = {
  newcomer: 'Mới chơi',
  beginner: 'Yếu',
  intermediate: 'Trung bình',
  intermediate_plus: 'Trung bình khá',
  advanced: 'Bán chuyên',
};
const tiers = Object.entries(tierLabels) as Array<[SkillTier, string]>;
const disciplineOptions = [{ value: 'singles', label: 'Đánh đơn' }, { value: 'doubles', label: 'Đánh đôi' }] as const;
const disciplineName: Record<Discipline, string> = { singles: 'đánh đơn', doubles: 'đánh đôi' };
export const provinceName = (code: string | null | undefined) => VIETNAM_PROVINCES.find((province) => province.code === code)?.name ?? null;
const HISTORY_PAGE_SIZE = 5;

export function PassportPage() {
  const { userId } = useParams();
  return userId ? <PublicPassportView userId={userId} /> : <OwnPassportView />;
}

function BadgeList({ badges }: { badges: PlayerBadge[] }) {
  if (badges.length === 0) return <p className="mt-3 text-sm text-ink-500">Chưa có huy hiệu. Huy hiệu được trao theo chuỗi thắng và thứ hạng cuối kỳ.</p>;
  return (
    <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {badges.map((badge) => (
        <li key={`${badge.label}-${badge.seasonName}-${badge.disciplineLabel}-${badge.awardedAt}`} className="rounded-xl border border-line p-3">
          <p className="font-semibold text-brand-navy">{badge.label}</p>
          <p className="mt-1 text-xs text-ink-500">
            {badge.disciplineLabel} · {badge.seasonName}{badge.provinceName ? ` · ${badge.provinceName}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}

function PublicPassportView({ userId }: { userId: string }) {
  const [passport, setPassport] = useState<PublicPassport | null>(null);
  const [error, setError] = useState('');
  const load = () => {
    setError('');
    getPublicPassport(userId).then(setPassport, (cause) => setError(cause instanceof Error ? cause.message : 'Không thể tải hồ sơ trình độ.'));
  };
  useEffect(load, [userId]);
  return (
    <div className="page-container py-8 sm:py-10">
      <PageHeader eyebrow="Hồ sơ thi đấu" title={passport?.displayName ?? 'Hồ sơ trình độ'} description="Bản công khai chỉ hiển thị bậc, số trận và huy hiệu." />
      {error ? (
        <div className="mt-6"><RouteState variant="error" title="Chưa thể mở hồ sơ trình độ" description={error} onRetry={load} /></div>
      ) : !passport ? (
        <div className="mt-6"><RouteState variant="loading" title="Đang tải hồ sơ trình độ" /></div>
      ) : (
        <>
          <SurfaceCard className="mt-6">
            <div className="flex items-center gap-4">
              <Avatar label={passport.displayName ?? 'Người chơi'} src={passport.avatarUrl} alt={`Ảnh đại diện ${passport.displayName ?? 'người chơi'}`} className="h-16 w-16 text-xl" />
              <div className="flex flex-wrap gap-2">
                {disciplineOptions.map(({ value, label }) => {
                  const item = passport[value];
                  return <Badge key={value} tone={item ? 'success' : 'neutral'}>{label}: {item ? `${tierLabels[item.tier]} · ${item.matchesPlayed} trận` : 'Chưa khai báo'}</Badge>;
                })}
              </div>
            </div>
          </SurfaceCard>
          <SurfaceCard className="mt-5">
            <h2 className="text-h2">Huy hiệu</h2>
            <BadgeList badges={passport.badges} />
          </SurfaceCard>
        </>
      )}
    </div>
  );
}

function OwnPassportView() {
  const navigate = useNavigate();
  const [passport, setPassport] = useState<OwnPassport | null>(null);
  const [identity, setIdentity] = useState<{ name: string; avatarUrl: string | null }>({ name: 'Người chơi', avatarUrl: null });
  const [season, setSeason] = useState<CurrentSeason | null>(null);
  const [discipline, setDiscipline] = useState<Discipline>('singles');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [evaluationTarget, setEvaluationTarget] = useState<{ matchId: string; userId: string } | null>(null);
  const [evaluationTier, setEvaluationTier] = useState<SkillTier>('intermediate');

  const load = async () => {
    if (!window.localStorage.getItem('accessToken')) {
      navigate('/auth');
      return;
    }
    setLoading(true);
    setError('');
    try {
      setPassport(await getOwnPassport());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải hồ sơ trình độ.');
    } finally {
      setLoading(false);
    }
    // Phần phụ: lỗi không chặn trang chính.
    getCurrentSeason().then(setSeason, () => setSeason(null));
    getMyProfile().then(
      (profile) => setIdentity({ name: profile.playerProfile?.displayName ?? 'Người chơi', avatarUrl: profile.playerProfile?.avatarUrl ?? null }),
      () => undefined,
    );
  };
  useEffect(() => {
    void load();
  }, []);

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

  const current = passport?.[discipline] ?? null;

  return (
    <div className="page-container py-8 sm:py-10">
      {notice && <Toast message={notice} tone={notice.startsWith('Đã') ? 'success' : 'error'} />}
      <PageHeader
        eyebrow="Hồ sơ thi đấu"
        title="Điểm xếp hạng của tôi"
        description="Điểm đánh đơn và đánh đôi được theo dõi riêng."
        actions={current?.leaderboardVisible ? <Badge tone="success">Đủ điều kiện lên bảng</Badge> : undefined}
      />
      {loading ? (
        <div className="mt-6"><RouteState variant="loading" title="Đang tải hồ sơ trình độ" /></div>
      ) : error || !passport ? (
        <div className="mt-6">
          <RouteState variant="error" title="Chưa thể mở hồ sơ trình độ" description={error || 'Hồ sơ trình độ chưa tồn tại.'} onRetry={() => void load()} />
        </div>
      ) : (
        <>
          <SurfaceCard className="mt-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <Avatar label={identity.name} src={identity.avatarUrl} alt={`Ảnh đại diện ${identity.name}`} className="h-14 w-14 text-xl" />
                <h2 className="text-h2">{identity.name}</h2>
              </div>
              <SeasonRegion season={season} onSelected={(provinceCode) => { setSeason((prev) => prev && { ...prev, myRegion: provinceCode }); setNotice('Đã chọn khu vực xếp hạng cho kỳ này.'); }} onError={setNotice} />
            </div>
          </SurfaceCard>

          <div className="mt-5">
            <SegmentedControl options={disciplineOptions} value={discipline} onChange={setDiscipline} />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.1fr]">
            {current ? (
              <RatingCard discipline={discipline} passport={current} />
            ) : (
              <DeclarationCard
                discipline={discipline}
                onDeclared={(next) => { setPassport(next); setNotice(`Đã khai báo trình độ ${disciplineName[discipline]}.`); }}
                onError={setNotice}
              />
            )}
            <ActivityCard key={discipline} discipline={discipline} passport={current} region={season?.myRegion ?? null} />
          </div>

          <SurfaceCard className="mt-5">
            <h2 className="text-h2">Huy hiệu</h2>
            <BadgeList badges={passport.badges} />
          </SurfaceCard>

          <SurfaceCard className="mt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-h2">Đánh giá sau trận</h2>
                <p className="mt-1 text-sm text-ink-500">Chỉ đánh giá hợp lệ, không bị gắn cờ mới được tính vào tổng hợp.</p>
              </div>
              {passport.flaggedEvaluationCount > 0 && <Badge tone="warning">{passport.flaggedEvaluationCount} chờ Admin</Badge>}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4">
              <MetricCard label="Đã tính" value={passport.evaluationCount} />
              <MetricCard label="Mức cảm nhận" value={passport.evaluationScore === null ? '—' : Math.round(passport.evaluationScore)} tone="yellow" />
            </div>
            {passport.recentMatches.length === 0 ? (
              <div className="mt-5">
                <EmptyState title="Chưa có trận hoàn thành" description="Tham gia một kèo và hoàn thành trận để đánh giá người cùng kèo." action={<Button onClick={() => navigate('/matches')}>Tìm kèo</Button>} />
              </div>
            ) : (
              <div className="mt-4 divide-y divide-line">
                {passport.recentMatches.map((match, matchIndex) => (
                  <div key={match.id} className="py-4">
                    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                      <p className="font-medium">Trận hoàn thành {matchIndex + 1}</p>
                      <p className="text-sm text-ink-500">{formatDateTimeVi(match.completedAt)}</p>
                    </div>
                    {match.evaluationCandidates.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-ink-500">Đánh giá người cùng kèo:</span>
                        {match.evaluationCandidates.map((candidate, candidateIndex) => {
                          const windowOpen = Date.now() <= new Date(match.completedAt).getTime() + 72 * 60 * 60 * 1000;
                          return candidate.submitted ? (
                            <Badge key={candidate.userId} tone="success">Người cùng kèo {candidateIndex + 1} · đã gửi</Badge>
                          ) : (
                            <Button key={candidate.userId} size="sm" tone="secondary" disabled={!windowOpen} onClick={() => setEvaluationTarget({ matchId: match.id, userId: candidate.userId })}>
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
        </>
      )}
      <Modal open={evaluationTarget !== null} title="Đánh giá sau trận" onClose={() => setEvaluationTarget(null)}>
        <p className="text-sm text-ink-500">Chọn bậc bạn cảm nhận cho người chơi cùng kèo. Đánh giá bất thường chỉ được gắn cờ chờ Admin, không tự phạt hay đổi điểm.</p>
        <label className="mt-4 block text-sm font-medium">
          Bậc cảm nhận
          <SelectInput className="mt-1" value={evaluationTier} onChange={(event) => setEvaluationTier(event.target.value as SkillTier)}>
            {tiers.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </SelectInput>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button tone="secondary" onClick={() => setEvaluationTarget(null)}>Đóng</Button>
          <Button onClick={() => void submitEvaluation()}>Gửi đánh giá</Button>
        </div>
      </Modal>
    </div>
  );
}

function SeasonRegion({ season, onSelected, onError }: { season: CurrentSeason | null; onSelected: (code: string) => void; onError: (message: string) => void }) {
  const [code, setCode] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  if (!season?.season) return <p className="text-sm text-ink-500">Chưa có kỳ xếp hạng đang diễn ra.</p>;
  if (season.myRegion) {
    return (
      <div className="sm:text-right">
        <p className="text-xs text-ink-500">Khu vực xếp hạng kỳ này</p>
        <p className="font-semibold text-brand-navy">{provinceName(season.myRegion)}</p>
      </div>
    );
  }
  const save = async () => {
    setPending(true);
    try {
      await selectSeasonRegion(code);
      setConfirming(false);
      onSelected(code);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Không thể chọn khu vực.');
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <label className="text-xs text-ink-500" htmlFor="season-region">Chọn tỉnh/thành chính của {season.season.name}</label>
      <div className="flex gap-2">
        <SelectInput id="season-region" value={code} onChange={(event) => setCode(event.target.value)} className="min-w-52">
          <option value="">Chọn tỉnh/thành</option>
          {VIETNAM_PROVINCES.map((province) => <option key={province.code} value={province.code}>{province.name}</option>)}
        </SelectInput>
        <Button size="sm" disabled={!code} onClick={() => setConfirming(true)}>Chọn khu vực</Button>
      </div>
      <Modal open={confirming} title="Xác nhận khu vực xếp hạng" onClose={() => setConfirming(false)}>
        <p className="text-sm text-ink-700">
          Bạn chọn <strong>{provinceName(code)}</strong> cho {season.season.name}. Khu vực được khóa đến hết kỳ ({formatDateVi(season.season.endAt)}); có thể đổi ở kỳ sau.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button tone="secondary" onClick={() => setConfirming(false)}>Quay lại</Button>
          <AsyncButton pending={pending} onClick={() => void save()}>Xác nhận khu vực</AsyncButton>
        </div>
      </Modal>
    </div>
  );
}

function RatingCard({ discipline, passport }: { discipline: Discipline; passport: OwnDisciplinePassport }) {
  const stable = passport.ratingStability === 'established';
  return (
    <SurfaceCard>
      <h2 className="text-h2">Điểm {disciplineName[discipline]}</h2>
      <p className="mt-1 text-sm text-ink-500">Cập nhật sau mỗi kèo xếp hạng hợp lệ.</p>
      <p className="mt-5 text-xs text-ink-500">Điểm hiện tại</p>
      <p className="text-figures text-5xl font-bold tracking-tight text-brand-navy">{passport.rating.toLocaleString('vi-VN')}</p>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-canvas px-4 py-3">
        <span className="text-sm text-ink-500">Nhóm trình độ hiện tại</span>
        <span className="font-semibold text-brand-navy">{tierLabels[passport.tier]}</span>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="font-medium">Mức độ ổn định của điểm</span>
        <span className={stable ? 'text-success' : 'text-warning'}>{stable ? 'Ổn định' : 'Đang xác định'}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-canvas" aria-hidden>
        <div className={`h-full rounded-full ${stable ? 'w-3/4 bg-success' : 'w-1/4 bg-warning'}`} />
      </div>
      <p className="mt-2 text-xs text-ink-500">
        {stable ? 'Điểm đã ổn định, vị trí trên bảng xếp hạng phản ánh sát trình độ.' : 'Chơi thêm kèo xếp hạng để điểm ổn định và đủ điều kiện lên bảng.'}
      </p>
      <div className="mt-5 grid grid-cols-3 gap-3">
        <MetricCard label="Trận hợp lệ kỳ này" value={passport.season.matchesPlayed} />
        <MetricCard label="Thắng" value={passport.season.wins} />
        <MetricCard label="Chuỗi thắng" value={passport.season.currentWinStreak} />
      </div>
    </SurfaceCard>
  );
}

function DeclarationCard({ discipline, onDeclared, onError }: { discipline: Discipline; onDeclared: (next: OwnPassport) => void; onError: (message: string) => void }) {
  const [tier, setTier] = useState<SkillTier | ''>('');
  const [pending, setPending] = useState(false);
  const declare = async () => {
    if (!tier) return;
    setPending(true);
    try {
      onDeclared(await declarePassportTier(discipline, tier));
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Không thể khai báo trình độ.');
    } finally {
      setPending(false);
    }
  };
  return (
    <SurfaceCard>
      <h2 className="text-h2">Khai báo trình độ {disciplineName[discipline]}</h2>
      <p className="mt-1 text-sm text-ink-500">
        Bạn chỉ khai báo một lần cho {disciplineName[discipline]}. Sau đó điểm thay đổi theo kết quả các kèo xếp hạng; muốn sửa bậc phải gửi yêu cầu hỗ trợ.
      </p>
      <label className="mt-5 block text-sm font-medium" htmlFor={`declare-${discipline}`}>Bậc hiện tại của bạn</label>
      <SelectInput id={`declare-${discipline}`} className="mt-1" value={tier} onChange={(event) => setTier(event.target.value as SkillTier)}>
        <option value="">Chọn bậc</option>
        {tiers.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </SelectInput>
      <AsyncButton className="mt-5" pending={pending} disabled={!tier} onClick={() => void declare()}>Lưu khai báo</AsyncButton>
    </SurfaceCard>
  );
}

function ActivityCard({ discipline, passport, region }: { discipline: Discipline; passport: OwnDisciplinePassport | null; region: string | null }) {
  const [tab, setTab] = useState<'rank' | 'history'>('rank');
  return (
    <SurfaceCard>
      <h2 className="text-h2">Vị trí và hoạt động</h2>
      <p className="mt-1 text-sm text-ink-500">Xem thứ hạng và toàn bộ lịch sử thi đấu {disciplineName[discipline]}.</p>
      <div className="mt-4">
        <Tabs tabs={[{ value: 'rank', label: 'Vị trí xếp hạng' }, { value: 'history', label: 'Lịch sử đấu' }]} value={tab} onChange={setTab} />
      </div>
      {tab === 'rank' ? <RankPanel discipline={discipline} passport={passport} region={region} /> : <HistoryPanel discipline={discipline} />}
    </SurfaceCard>
  );
}

function RankPanel({ discipline, passport, region }: { discipline: Discipline; passport: OwnDisciplinePassport | null; region: string | null }) {
  const [rows, setRows] = useState<{ global: LeaderboardRow | null; province: LeaderboardRow | null } | null>(null);
  useEffect(() => {
    if (!passport?.leaderboardVisible) return;
    const band = passport.leaderboardBand;
    Promise.all([
      getLeaderboard({ discipline, scope: 'global', band, pageSize: 1 }).then((board) => board.viewer, () => null),
      region ? getLeaderboard({ discipline, scope: 'province', provinceCode: region, band, pageSize: 1 }).then((board) => board.viewer, () => null) : Promise.resolve(null),
    ]).then(([global, province]) => setRows({ global, province }));
  }, [discipline, passport?.leaderboardVisible, passport?.leaderboardBand, region]);
  if (!passport) return <p className="mt-5 text-sm text-ink-500">Khai báo trình độ {disciplineName[discipline]} để bắt đầu được xếp hạng.</p>;
  if (!passport.leaderboardVisible) {
    return (
      <p className="mt-5 rounded-xl bg-warning-bg p-4 text-sm text-ink-700">
        Bạn chưa lên bảng xếp hạng. Cần ít nhất 5 kèo xếp hạng hợp lệ trong kỳ và điểm đã ổn định. Kỳ này: {passport.season.matchesPlayed} trận.
      </p>
    );
  }
  const band = passport.leaderboardBand === 'under_1600' ? 'Dưới 1.600 điểm' : 'Từ 1.600 điểm';
  const line = (label: string, row: LeaderboardRow | null | undefined, hint: string) => (
    <div className="flex items-center justify-between border-b border-line py-4 last:border-0">
      <div>
        <p className="font-semibold">{label}</p>
        <p className="text-xs text-ink-500">{hint}</p>
      </div>
      <p className="text-figures text-2xl font-bold text-brand-navy">{row ? `#${row.rank}` : '—'}</p>
    </div>
  );
  return (
    <div className="mt-3">
      {line('Toàn quốc', rows?.global, band)}
      {region
        ? line(provinceName(region) ?? 'Khu vực', rows?.province, rows?.province ? band : 'Cần ít nhất 5 trận tại khu vực chính')
        : <p className="py-4 text-sm text-ink-500">Chọn khu vực kỳ này để xem thứ hạng theo tỉnh/thành.</p>}
      <Link to={`/leaderboard?discipline=${discipline}`} className="mt-3 inline-block text-sm font-bold text-brand-navy underline">Xem bảng xếp hạng</Link>
    </div>
  );
}

function HistoryPanel({ discipline }: { discipline: Discipline }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<MatchHistoryItem> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    getMatchHistory(discipline, page, HISTORY_PAGE_SIZE).then(setData, (cause) => setError(cause instanceof Error ? cause.message : 'Không thể tải lịch sử đấu.'));
  }, [discipline, page]);
  if (error) return <p className="mt-5 text-sm text-danger">{error}</p>;
  if (!data) return <p className="mt-5 text-sm text-ink-500">Đang tải lịch sử đấu…</p>;
  if (data.total === 0) return <p className="mt-5 text-sm text-ink-500">Chưa có trận {disciplineName[discipline]} nào có kết quả chốt.</p>;
  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <div className="mt-3">
      <p className="text-xs text-ink-500">{data.total} trận {disciplineName[discipline]} đã có kết quả</p>
      <ul className="mt-2 divide-y divide-line">
        {data.items.map((item) => {
          const opponents = item.opponents.map((opponent) => opponent.displayName).join(', ') || 'Đối thủ';
          const win = item.outcome === 'win';
          return (
            <li key={item.matchId} className="flex items-start justify-between gap-3 py-3">
              <div>
                <Link to={`/matches/${item.matchId}`} className="font-semibold hover:underline">
                  {win ? 'Thắng' : 'Thua'} {opponents}{item.scoreLabel ? ` · ${item.scoreLabel}` : ''}
                </Link>
                <p className="text-xs text-ink-500">{formatDateVi(item.endedAt)} · {item.mode === 'friendly' ? 'Kèo giao hữu' : item.ratingDelta === null ? 'Kèo xếp hạng - không tính điểm' : 'Kèo xếp hạng'}</p>
              </div>
              <div className="text-right">
                <p className={`text-xs font-bold ${win ? 'text-success' : 'text-danger'}`}>{win ? 'Thắng' : 'Thua'}</p>
                {item.ratingDelta !== null && (
                  <p className="text-figures text-sm">{item.ratingDelta > 0 ? '+' : ''}{item.ratingDelta} điểm</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {pageCount > 1 && <div className="mt-3"><Pagination page={page} pageCount={pageCount} onChange={setPage} /></div>}
    </div>
  );
}
