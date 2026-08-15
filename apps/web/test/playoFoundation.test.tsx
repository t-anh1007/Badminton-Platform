import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Navbar } from '../src/components/Navbar';
import { Preloader } from '../src/components/Preloader';
import { Button, Modal, SurfaceCard } from '../src/components/ui';

describe('P2-FE0 — COURTIN foundation', () => {
  it('renders the COURTIN global chrome and scope-only navigation', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Navbar onOpenAuth={() => undefined} />
        <Preloader />
      </MemoryRouter>,
    );
    expect(html).toContain('Đặt sân');
    expect(html).toContain('Tìm kèo');
    expect(html).toContain('Cộng đồng');
    expect(html).toContain('Đăng nhập / Đăng ký');
    expect(html).not.toContain('Train');
    expect(html).toContain('COURTIN');
    expect(html).toContain('bg-brand-navy');
    expect(html).toContain('href="/matches"');
    expect(html).toContain('href="/community"');
  });

  it('keeps reusable components accessible and COURTIN-shaped', () => {
    const html = renderToStaticMarkup(
      <>
        <Button>Tiếp tục</Button>
        <SurfaceCard>Thông tin sân</SurfaceCard>
        <Modal open title="Đăng nhập" onClose={() => undefined}>
          <p>Nội dung</p>
        </Modal>
      </>,
    );
    expect(html).toContain('rounded-full');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('rounded-2xl');
  });

  it('uses COURTIN fonts, tokens and reduced motion in the global visual source', () => {
    const stylePath = fileURLToPath(new URL('../src/index.css', import.meta.url));
    const css = readFileSync(stylePath, 'utf8');
    for (const legacyToken of ['primary-navy', 'court-green', 'accent-shuttle', 'Geist Sans'])
      expect(css).not.toContain(legacyToken);
    expect(css).toContain('@fontsource/archivo/vietnamese-800.css');
    expect(css).toContain('@fontsource/inter/vietnamese-400.css');
    expect(css).toContain('@fontsource/geist-mono/400.css');
    expect(css).toContain('--color-brand-navy: #15446c');
    expect(css).toContain('--color-brand-yellow: #f5e663');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).not.toContain('focus-visible:outline-none');
  });
});
