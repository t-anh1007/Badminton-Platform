import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AdminPage } from '../src/pages/AdminPage';
import { CommunityAdminPanel } from '../src/components/CommunityAdminPanel';

describe('P2-FE2 — Community moderation', () => {
  it('keeps report moderation in the Admin workspace', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    );
    const panel = renderToStaticMarkup(<CommunityAdminPanel />);
    expect(html).toContain('Kiểm duyệt');
    expect(panel).toContain('Báo cáo nội dung');
  });
});
