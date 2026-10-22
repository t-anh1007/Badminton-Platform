import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyReputation, type MyReputation, type Reputation } from '../../lib/resultApi';
import { formatDateVi } from '../../lib/formatters.js';
import { SurfaceCard } from '../ui';

// U1: uy tín khi khai kết quả — chỉ chính chủ thấy (BR-RA-53), không hiện trên hồ sơ công khai.

const LEVEL: Record<Reputation, { label: string; count: string }> = {
  good: { label: 'Tốt', count: '0 vi phạm' }, watch: { label: 'Cần chú ý', count: '1 vi phạm' }, low: { label: 'Thấp', count: 'Từ 2 vi phạm' },
};
const KIND: Record<string, string> = {
  exact_duplicate_photo: 'Gửi ảnh trùng với ảnh của trận khác',
  groundless_appeal: 'Kháng nghị không có căn cứ',
  false_claim: 'Khai sai kết quả',
  near_duplicate_fraud: 'Dùng ảnh gần giống ảnh trận khác để khai sai',
  false_incident: 'Báo sự cố sai',
};

export function MyReputationCard() {
  const [data, setData] = useState<MyReputation | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { getMyReputation().then(setData, () => setFailed(true)); }, []);
  if (failed) return <SurfaceCard><h2 className="text-h3">Uy tín khi khai kết quả</h2><p className="mt-2 text-sm text-ink-500">Chưa tải được uy tín. Tải lại trang để thử lại.</p></SurfaceCard>;
  if (!data) return null;
  return (
    <SurfaceCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-h3">Uy tín khi khai kết quả: {LEVEL[data.reputation].label}</h2>
        <span className="text-sm text-ink-500">Chỉ bạn và quản trị viên thấy</span>
      </div>
      <p className="mt-1 text-sm text-ink-500">
        {data.violations.length === 0 ? 'Bạn chưa có vi phạm nào trong 90 ngày.' : `Bạn có ${data.violations.length} vi phạm trong 90 ngày gần nhất.`}
        {data.recoversAt && <> Tự về mức Tốt ngày <b className="text-ink-900">{formatDateVi(data.recoversAt)}</b> nếu không có vi phạm mới.</>}
      </p>
      <div role="img" aria-label={`Mức hiện tại: ${LEVEL[data.reputation].label}`} className="mt-4 grid grid-cols-3 gap-2">
        {(Object.keys(LEVEL) as Reputation[]).map((level) => (
          <div key={level} className={`rounded-xl border p-3 ${level === data.reputation ? (level === 'low' ? 'border-danger bg-danger-bg' : level === 'watch' ? 'border-[#ecd9a0] bg-warning-bg' : 'border-success bg-success-bg') : 'border-line bg-canvas'}`}>
            <p className="font-bold">{LEVEL[level].label}</p><p className="text-xs text-ink-500">{LEVEL[level].count}</p>
          </div>
        ))}
      </div>
      {data.violations.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs font-bold uppercase tracking-[0.08em] text-ink-500"><th className="py-2">Vi phạm</th><th>Kèo</th><th>Ghi lúc</th><th>Hết hiệu lực</th></tr></thead>
            <tbody>
              {data.violations.map((row) => (
                <tr key={`${row.kind}-${row.createdAt}`} className="border-t border-line">
                  <td className="py-2">{KIND[row.kind] ?? 'Vi phạm khi khai kết quả'}</td><td>{row.matchCode ?? '—'}</td>
                  <td className="text-figures">{formatDateVi(row.createdAt)}</td><td className="text-figures">{formatDateVi(row.expiresAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><p className="font-bold text-ink-900">Khi ở mức Thấp</p><p className="text-ink-700">Kết quả bạn khai tối đa mức Vàng (đội kia có 6 giờ thay vì 2 giờ) và phản đối phải kèm ảnh.</p></div>
        <div><p className="font-bold text-ink-900">Không ảnh hưởng</p><p className="text-ink-700">Tham gia, tạo kèo, tiền giữ chỗ, ví và điểm xếp hạng.</p></div>
      </div>
      <p className="mt-3 text-xs text-ink-500">Vi phạm do hệ thống tự ghi khi ảnh trùng chính xác, hoặc do quản trị viên xác nhận khi xử hồ sơ. Mỗi kèo ghi tối đa 1 vi phạm. <Link to="/matches" className="font-semibold text-brand-navy">Xem kèo của tôi</Link></p>
    </SurfaceCard>
  );
}
