import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Avatar, Badge, Button, Pagination, SegmentedControl, SurfaceCard } from '../components/ui';
import { Icon } from '../components/Icon';
import { useAuthPrompt } from '../layout/AuthPrompt';
import { RouteState } from '../components/RouteState.js';
import { PageHeader } from '../components/courtin/PageHeader';
import { formatDateVi } from '../lib/formatters.js';
import { DIVISION_LABEL, DIVISION_TIERS, getCurrentSeason, getLeaderboard, type CurrentSeason, type Leaderboard, type LeaderboardBand, type LeaderboardScope } from '../lib/competitionApi';
import { getOwnPassport, type Discipline } from '../lib/passportApi';
import { listRewardPrograms, type RewardProgram } from '../lib/rewardApi';
import { provinceName } from './PassportPage';

const PAGE_SIZE = 20;
const disciplineOptions = [{ value: 'singles', label: 'Đánh đơn' }, { value: 'doubles', label: 'Đánh đôi' }] as const;
const bandOptions = [{ value: 'amateur', label: DIVISION_LABEL.amateur }, { value: 'pro', label: DIVISION_LABEL.pro }] as const;
const bandLabel: Record<LeaderboardBand, string> = { amateur: `Hạng Không chuyên (${DIVISION_TIERS.amateur})`, pro: `Hạng Chuyên (${DIVISION_TIERS.pro})` };
const daysLeft = (endAt: string) => Math.max(0, Math.ceil((new Date(endAt).getTime() - Date.now()) / 86_400_000));

export function LeaderboardPage() {
  const [params, setParams] = useSearchParams();
  const [season, setSeason] = useState<CurrentSeason | null>(null);
  const [ready, setReady] = useState(false);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState('');
  const [programs, setPrograms] = useState<RewardProgram[]>([]);
  const [defaultBand, setDefaultBand] = useState<LeaderboardBand>('amateur');

  const discipline = (params.get('discipline') === 'doubles' ? 'doubles' : 'singles') as Discipline;
  const region = season?.myRegion ?? null;
  const scope: LeaderboardScope = region && params.get('scope') !== 'global' ? 'province' : 'global';
  const requestedBand = params.get('band');
  const band: LeaderboardBand = requestedBand === 'pro' || requestedBand === 'amateur' ? requestedBand : defaultBand;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const update = (patch: Record<string, string>) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    Object.entries(patch).forEach(([key, value]) => next.set(key, value));
    if (!('page' in patch)) next.delete('page');
    return next;
  });

  // Mặc định mở đúng bảng của người xem: khu vực mùa này và hạng đấu của họ.
  useEffect(() => {
    const signedIn = Boolean(window.localStorage.getItem('accessToken'));
    Promise.all([
      getCurrentSeason().catch(() => null),
      signedIn ? getOwnPassport().catch(() => null) : Promise.resolve(null),
    ]).then(([currentSeason, passport]) => {
      setSeason(currentSeason);
      const own = passport?.[discipline];
      if (own) setDefaultBand(own.division);
      setReady(true);
    });
    listRewardPrograms().then((result) => setPrograms(result.items), () => setPrograms([]));
  }, []);

  useEffect(() => {
    if (!ready) return;
    setBoard(null);
    setError('');
    getLeaderboard({ discipline, scope, provinceCode: region ?? undefined, band, page, pageSize: PAGE_SIZE })
      .then(setBoard, (cause) => setError(cause instanceof Error ? cause.message : 'Không thể tải bảng xếp hạng.'));
  }, [ready, discipline, scope, band, page, region]);

  const boardName = scope === 'province' ? provinceName(region) ?? 'khu vực' : 'toàn nền tảng';
  const program = programs.find((item) => ['scheduled', 'active'].includes(item.status) && item.discipline === discipline && item.band === band
    && item.scope === scope && (scope === 'global' || item.provinceCode === region));
  const pageCount = board ? Math.max(1, Math.ceil(board.total / board.pageSize)) : 1;
  const viewer = board?.viewer ?? null;
  const signedIn = Boolean(window.localStorage.getItem('accessToken'));
  const promptAuth = useAuthPrompt();

  return (
    <div className="page-container py-8 sm:py-10">
      <PageHeader
        eyebrow={season?.season?.name ?? 'Bảng xếp hạng'}
        title="Bảng xếp hạng"
        description="Theo dõi vị trí đánh đơn và đánh đôi trên toàn nền tảng hoặc tại tỉnh/thành của bạn."
        actions={season?.season ? <div className="surface-card flex items-center gap-3 px-5 py-3"><Icon name="clock" className="h-6 w-6 text-brand-navy" /><div><p className="text-xs text-ink-500">Mùa kết thúc sau</p><p className="text-figures text-lg font-semibold text-brand-navy">{daysLeft(season.season.endAt)} ngày <span className="text-sm font-normal text-ink-500">· {formatDateVi(season.season.endAt)}</span></p></div></div> : undefined}
      />

      <SurfaceCard className="mt-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="mb-2 text-sm font-semibold text-ink-700">Nội dung thi đấu</p>
            <SegmentedControl options={disciplineOptions} value={discipline} onChange={(value) => update({ discipline: value })} />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-ink-700">Phạm vi xếp hạng</p>
            {region ? (
              <SegmentedControl
                options={[{ value: 'province', label: provinceName(region) ?? 'Khu vực' }, { value: 'global', label: 'Toàn nền tảng' }] as const}
                value={scope}
                onChange={(value) => update({ scope: value })}
              />
            ) : (
              <p className="text-sm text-ink-500">Toàn nền tảng · <Link to="/passport" className="font-bold text-brand-navy underline">chọn khu vực</Link> để xem bảng tỉnh/thành</p>
            )}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-ink-700">Hạng đấu</p>
            <SegmentedControl options={bandOptions} value={band} onChange={(value) => update({ band: value })} />
          </div>
        </div>
      </SurfaceCard>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
        <SurfaceCard>
          <h2 className="text-h2">Top người chơi {boardName}</h2>
          <p className="mt-1 text-sm text-ink-500">{discipline === 'singles' ? 'Đánh đơn' : 'Đánh đôi'} · {bandLabel[band]}</p>
          {!season?.season && ready ? (
            <div className="mt-5"><RouteState variant="empty" title="Chưa có mùa giải" description="Bảng xếp hạng mở khi quản trị viên bắt đầu mùa giải mới." /></div>
          ) : error ? (
            <div className="mt-5"><RouteState variant="error" title="Chưa tải được bảng xếp hạng" description="Máy chủ đang bận hoặc kết nối bị gián đoạn. Hãy tải lại trang." /></div>
          ) : !board ? (
            <div className="mt-5"><RouteState variant="loading" title="Đang tải bảng xếp hạng" /></div>
          ) : board.items.length === 0 ? (
            <div className="mt-5"><RouteState variant="empty" title="Chưa có người chơi đủ điều kiện" description="Người chơi lên bảng khi có ít nhất 5 kèo xếp hạng hợp lệ trong mùa và độ tin cậy từ Vừa trở lên." /></div>
          ) : (
            <>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-500">
                      <th scope="col" className="px-3 py-3 font-medium">Hạng</th>
                      <th scope="col" className="px-3 py-3 font-medium">Người chơi</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">Điểm BXH</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">Trận</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">Thắng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.items.map((row) => {
                      const mine = viewer?.userId === row.userId;
                      return (
                        <tr key={row.userId} className={`border-b border-line last:border-0 ${mine ? 'bg-warning-bg' : ''}`} aria-current={mine || undefined}>
                          <td className="text-figures px-3 py-3 font-bold">{row.rank}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar label={row.displayName} src={row.avatarUrl} alt={`Ảnh đại diện ${row.displayName}`} />
                              <div>
                                <p className="font-semibold text-brand-navy">{row.displayName} {mine && <Badge tone="warning">Bạn</Badge>}</p>
                                {row.provinceCode && <p className="text-xs text-ink-500">{provinceName(row.provinceCode)}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="text-figures px-3 py-3 text-right font-semibold">{row.points.toLocaleString('vi-VN')}</td>
                          <td className="text-figures px-3 py-3 text-right">{row.matchesPlayed}</td>
                          <td className="text-figures px-3 py-3 text-right">{row.wins}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {pageCount > 1 && <div className="mt-4"><Pagination page={page} pageCount={pageCount} onChange={(next) => update({ page: String(next) })} /></div>}
            </>
          )}
        </SurfaceCard>

        <div className="space-y-5">
          {!viewer && !signedIn ? (
            <section className="rounded-2xl bg-brand-navy p-6 text-surface shadow-[var(--shadow-card)]">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-yellow/15 text-brand-yellow"><Icon name="trend" /></span>
              <h2 className="mt-4 font-display text-lg font-extrabold">Bạn đứng thứ mấy?</h2>
              <p className="mt-1 text-sm text-surface/75">Đăng nhập để xem vị trí, điểm mùa và số kèo còn thiếu để lên bảng.</p>
              <Button className="mt-5 w-full" onClick={() => promptAuth({ title: 'Đăng nhập để xem vị trí' })}>Đăng nhập</Button>
            </section>
          ) : (
            <SurfaceCard>
              <h2 className="text-h2">Vị trí của bạn</h2>
              <p className="mt-1 text-sm text-ink-500">{boardName} · {discipline === 'singles' ? 'Đánh đơn' : 'Đánh đôi'} · {bandLabel[band]}</p>
              {viewer ? (
                <>
                  <div className="mt-4 rounded-2xl bg-brand-navy p-5 text-surface">
                    <p className="text-xs text-surface/75">Hạng hiện tại</p>
                    <p className="text-figures text-4xl font-bold text-brand-yellow">#{viewer.rank}</p>
                  </div>
                  <dl className="mt-3 divide-y divide-line text-sm">
                    <div className="flex justify-between py-3"><dt>Điểm BXH</dt><dd className="text-figures font-semibold">{viewer.points.toLocaleString('vi-VN')}</dd></div>
                    <div className="flex justify-between py-3"><dt>Trận xếp hạng mùa này</dt><dd className="text-figures font-semibold">{viewer.matchesPlayed}</dd></div>
                    {season?.season && <div className="flex justify-between py-3"><dt>Mùa giải kết thúc</dt><dd className="font-semibold">{formatDateVi(season.season.endAt)}</dd></div>}
                  </dl>
                </>
              ) : (
                <p className="mt-4 rounded-xl bg-canvas p-4 text-sm text-ink-700">
                  Bạn chưa có mặt ở bảng này. Cần ít nhất 5 kèo xếp hạng hợp lệ trong mùa, độ tin cậy từ Vừa trở lên và đúng hạng đấu của bạn.
                </p>
              )}
            </SurfaceCard>
          )}
          {!program && <Link to="/rewards" className="surface-card flex items-center gap-4 p-5 hover:shadow-[var(--shadow-raised)]"><span className="grid h-10 w-10 place-items-center rounded-full bg-brand-yellow text-brand-navy"><Icon name="gift" /></span><span className="flex-1 font-bold text-ink-900">Chương trình thưởng</span><Icon name="chevronRight" className="text-brand-navy" /></Link>}
          {program && (
            <SurfaceCard>
              <h2 className="text-h3">Đang có chương trình thưởng</h2>
              <p className="mt-1 text-sm text-ink-500">{program.name}: nhận thưởng sau khi kỳ kết thúc và Admin duyệt kết quả.</p>
              <Link to={`/rewards/${program.id}`} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-line font-bold text-brand-navy hover:bg-canvas">Xem cơ cấu giải thưởng</Link>
            </SurfaceCard>
          )}
          <details className="group surface-card p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-bold text-ink-900"><span className="flex items-center gap-2.5"><Icon name="info" className="text-brand-navy" />Cách tính điểm</span><Icon name="chevronDown" className="transition group-open:rotate-180" /></summary>
            <ul className="mt-3 grid list-disc gap-2 pl-5 text-sm text-ink-700">
              <li>Lên bảng khi có ít nhất 5 kèo xếp hạng hợp lệ trong mùa và độ tin cậy từ Vừa trở lên.</li>
              <li>Hạng đấu theo trình độ ở trận xếp hạng đầu tiên của mùa, giữ nguyên tới hết mùa.</li>
              <li>Thắng được cộng điểm, thua bị trừ; thắng người trình cao hơn được cộng nhiều hơn.</li>
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
}
