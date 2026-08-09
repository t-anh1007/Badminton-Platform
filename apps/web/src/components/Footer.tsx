import { Link } from 'react-router-dom';

const links = ['Về chúng tôi', 'Liên hệ', 'Điều khoản', 'Chính sách hủy', 'Chính sách bảo mật'];

export function Footer() {
  return <footer className="border-t border-line bg-surface"><div className="page-container grid gap-8 py-10 sm:grid-cols-[1.2fr_2fr]"><div><p className="font-bold text-ink-900">Cầu Lông</p><p className="mt-2 max-w-xs text-sm leading-6 text-ink-500">Đặt sân, tìm kèo và kết nối cộng đồng cầu lông trong một nơi.</p></div><div className="flex flex-wrap gap-x-5 gap-y-3 text-sm"><div className="flex flex-wrap gap-x-5 gap-y-3">{links.map((label) => <Link key={label} to="/" className="text-ink-500 hover:text-green-700">{label}</Link>)}</div><div className="ml-auto flex gap-2" aria-label="Mạng xã hội"><span className="grid h-8 w-8 place-items-center rounded-full border border-line text-xs text-ink-500">f</span><span className="grid h-8 w-8 place-items-center rounded-full border border-line text-xs text-ink-500">ig</span></div></div></div><div className="border-t border-line"><div className="page-container py-4 text-xs text-ink-500">© 2026 Cầu Lông. Dành cho cộng đồng cầu lông Việt Nam.</div></div></footer>;
}
