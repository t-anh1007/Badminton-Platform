import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminPage } from '../src/pages/AdminPage';
import { DisputeAdminPanel } from '../src/components/DisputeAdminPanel';
import { DisputePanel } from '../src/components/DisputePanel';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';

describe('UI G7 — tranh chấp', () => {
  it('player có danh sách booking đủ điều kiện, bằng chứng và lịch sử tranh chấp', () => {
    const html = renderToStaticMarkup(<DisputePanel />);
    expect(html).toContain('Gửi tranh chấp');
    expect(html).toContain('Bằng chứng');
    expect(html).toContain('Tranh chấp của tôi');
  });

  it('Admin có tab tranh chấp và ba quyết định được phép', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    );
    const panel = renderToStaticMarkup(<DisputeAdminPanel />);
    const source = readFileSync(new URL('../src/components/DisputeAdminPanel.tsx', import.meta.url), 'utf8');
    expect(html).toContain('Tranh chấp');
    expect(panel).toContain('hoàn tiền luôn đảo đủ ba vế');
    expect(source).toContain('Hoàn toàn bộ');
    expect(source).toContain('Hoàn một phần');
    expect(source).toContain('Bác tranh chấp');
  });
});
