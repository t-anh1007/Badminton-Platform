import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfilePage } from '../src/pages/ProfilePage';
import { AdminPage } from '../src/pages/AdminPage';
import { DisputeAdminPanel } from '../src/components/DisputeAdminPanel';

describe('UI G7 — tranh chấp', () => {
  it('player có danh sách booking đủ điều kiện, bằng chứng và lịch sử tranh chấp', () => {
    const html = renderToStaticMarkup(<ProfilePage />);
    expect(html).toContain('Gửi tranh chấp');
    expect(html).toContain('Bằng chứng');
    expect(html).toContain('Tranh chấp của tôi');
  });

  it('Admin có tab tranh chấp và ba quyết định được phép', () => {
    const html = renderToStaticMarkup(<><AdminPage /><DisputeAdminPanel /></>);
    expect(html).toContain('Tranh chấp');
    expect(html).toContain('Hoàn toàn bộ');
    expect(html).toContain('Hoàn một phần');
    expect(html).toContain('Bác tranh chấp');
  });
});
