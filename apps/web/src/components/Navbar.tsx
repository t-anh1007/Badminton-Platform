import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * Nav bar — DESIGN.md §2.3: cố định trên cùng, nền navy trong suốt/blur nhẹ,
 * đổi sang nền đặc khi cuộn. Logo trái, CTA pill phải, hamburger tròn.
 */
export function Navbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled ? 'bg-primary-navy/95 backdrop-blur-sm shadow-md' : 'bg-primary-navy/30 backdrop-blur-xs'
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" className="text-lg font-extrabold uppercase tracking-wide text-on-dark">
          Cầu Lông<span className="text-accent-shuttle">.</span>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            to="/booking"
            className="rounded-full bg-accent-shuttle px-4 py-2 text-caption text-court-green transition-transform hover:-translate-y-0.5"
          >
            Đặt sân ngay
          </Link>
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Mở menu"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-on-dark/40 text-on-dark transition-colors hover:bg-on-dark/10"
          >
            <span className="sr-only">Menu</span>
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
              <path d="M0 1H18" stroke="currentColor" strokeWidth="2" />
              <path d="M0 7H18" stroke="currentColor" strokeWidth="2" />
              <path d="M0 13H18" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
