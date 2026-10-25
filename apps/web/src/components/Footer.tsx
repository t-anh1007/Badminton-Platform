import { Link } from 'react-router-dom';

const columns = [
  ['Khám phá', [['Đặt sân', '/venues'], ['Tìm kèo', '/matches'], ['Bảng xếp hạng', '/leaderboard'], ['Chương trình thưởng', '/rewards'], ['Cộng đồng', '/community']]],
  ['Hỗ trợ', [['Trung tâm hỗ trợ', '/support'], ['Liên hệ', '/contact'], ['Chính sách hủy', '/cancellation-policy'], ['Hợp tác chủ sân', '/provider-onboarding']]],
  ['Về CourtIn', [['Về chúng tôi', '/about'], ['Điều khoản', '/terms'], ['Chính sách bảo mật', '/privacy']]],
] as const;

export function Footer() {
  return (
    <footer className="mt-auto bg-brand-navy text-surface/75">
      <div className="page-container grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2"><img src="/logo.png" alt="" aria-hidden="true" className="h-9 w-auto object-contain" /><p className="font-display text-lg font-extrabold text-surface">COURTIN</p></div>
          <p className="mt-3 max-w-xs text-sm leading-6">Đặt sân, tìm kèo và kết nối cộng đồng cầu lông trong một nhịp chơi liền mạch.</p>
        </div>
        {columns.map(([heading, links]) => (
          <div key={heading}>
            <p className="text-caption text-surface">{heading}</p>
            <ul className="mt-3 grid gap-2.5 text-sm">{links.map(([label, to]) => <li key={to}><Link to={to} className="hover:text-brand-yellow">{label}</Link></li>)}</ul>
          </div>
        ))}
      </div>
      <div className="border-t border-surface/15"><div className="page-container py-4 text-xs text-surface/60">© 2026 COURTIN. Dành cho cộng đồng cầu lông Việt Nam.</div></div>
    </footer>
  );
}
