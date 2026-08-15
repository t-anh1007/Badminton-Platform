import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { CommunityPage } from '../src/pages/CommunityPage';
import { CommunityDetailPage } from '../src/pages/CommunityDetailPage';
import { SupportPage } from '../src/pages/SupportPage';

describe('P2-FE2 — public Community and private Support', () => {
  it('renders a public feed without social features outside scope', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CommunityPage />
      </MemoryRouter>,
    );
    expect(html).toContain('Cộng đồng cầu lông');
    expect(html).toContain('Chia sẻ với cộng đồng');
    expect(html).not.toContain('Thích');
  });

  it('renders the real post detail and comment journey shell', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CommunityDetailPage />
      </MemoryRouter>,
    );
    expect(html).toContain('Chi tiết bài viết');
    expect(html).toContain('Bình luận');
  });

  it('keeps private support tickets separate from the public feed', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SupportPage />
      </MemoryRouter>,
    );
    expect(html).toContain('Trung tâm hỗ trợ');
    expect(html).toContain('Tạo ticket');
    const source = readFileSync(new URL('../src/pages/SupportPage.tsx', import.meta.url), 'utf8');
    expect(source).toContain('setSupportTicketStatus');
    expect(source).toContain('Đã giải quyết');
    expect(source).toContain('Đóng ticket');
  });
});
